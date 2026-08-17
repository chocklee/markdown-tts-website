# 一键完整转换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把整篇 Markdown 文档一键转换为一条完整 MP3（云端存储、计积分、Pro 专属），支持下载与阅读器无缝播放。

**Architecture:** 服务端转换（方案 A）。新增 `converted_audios` 表；`POST /api/tts/convert` 校验订阅并预扣积分创建任务，`GET /api/tts/convert?docId=&advance=1` 每轮处理一批（≤4 块）段落级合成并推进进度，`GET /api/tts/convert/[docId]/audio` 以 Range 流式返回 MP3（播放/下载）。阅读器在「已转换且朗读设置一致」时用 `<audio>` 整篇无缝播放，否则回退逐句模式。

**Tech Stack:** Next.js 15 (App Router, serverless routes, `runtime='nodejs'`), Neon Postgres (`pg` pool), 豆包/OpenAI TTS provider 接口, Zustand readerStore, Vitest + Testing Library.

---

## File Structure

- Create `db/migrations/010_converted_audio.sql` — 转换音频表
- Create `src/lib/db/convert.ts` — `converted_audios` 表访问层
- Modify `src/lib/db/documents.ts` — 硬删除时清理转换音频；新增文档占用字节统计
- Create `src/lib/tts/server/convertChunks.ts` — 段落级切块（跳过代码/表格）
- Create `src/lib/tts/server/convertService.ts` — 启动/推进/状态/配额/退款业务逻辑
- Create `src/app/api/tts/convert/route.ts` — POST 创建 + GET 状态/推进
- Create `src/app/api/tts/convert/[docId]/audio/route.ts` — Range 音频流 + 下载
- Modify `src/lib/i18n/zh.ts` / `en.ts` — 新文案
- Modify `src/components/app/icons.tsx` — 新增 `IconDownload`
- Modify `src/components/library/LibraryView.tsx` — 菜单「转成音频」/进度/下载
- Modify `src/components/reader/ReaderLayout.tsx` — 工具栏按钮/轮询/无缝判定
- Modify `src/components/reader/PlaybackBar.tsx` — 无缝播放条（`<audio>` 整篇）
- Modify `src/app/transactions/page.tsx` — 消费记录描述映射「完整转换」
- Tests: `src/lib/tts/server/__tests__/convertChunks.test.ts`, `src/lib/tts/server/__tests__/convertService.test.ts`, `src/app/api/tts/convert/__tests__/convert.test.ts`, `src/app/api/tts/convert/[docId]/__tests__/audio.test.ts`

---

### Task 1: 迁移 + 转换音频 DB 层

**Files:**
- Create: `db/migrations/010_converted_audio.sql`
- Create: `src/lib/db/convert.ts`
- Modify: `src/lib/db/documents.ts`

- [ ] **Step 1: 写迁移 SQL**

`db/migrations/010_converted_audio.sql`:

```sql
-- 一键完整转换音频（每篇文档一份，重新转换覆盖）
CREATE TABLE IF NOT EXISTS converted_audios (
  user_id text NOT NULL,
  doc_id text NOT NULL,
  voice text NOT NULL,
  rate numeric NOT NULL,
  skip_code boolean NOT NULL,
  skip_table boolean NOT NULL,
  chars integer NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',  -- pending | converting | done | failed
  progress real NOT NULL DEFAULT 0,
  chunks_total integer NOT NULL DEFAULT 0,
  chunks_done integer NOT NULL DEFAULT 0,
  audio bytea,
  content_type text NOT NULL DEFAULT 'audio/mpeg',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_converted_audios_user ON converted_audios (user_id);
```

- [ ] **Step 2: 写 DB 层**

`src/lib/db/convert.ts`:

```ts
import { pool } from '@/lib/db/pool'

export type ConvertStatus = 'pending' | 'converting' | 'done' | 'failed'

export interface ConvertedAudio {
  userId: string
  docId: string
  voice: string
  rate: number
  skipCode: boolean
  skipTable: boolean
  chars: number
  sizeBytes: number
  status: ConvertStatus
  progress: number
  chunksTotal: number
  chunksDone: number
  audio: Buffer | null
  contentType: string
  error: string | null
  updatedAt: string
}

interface Row {
  user_id: string
  doc_id: string
  voice: string
  rate: string
  skip_code: boolean
  skip_table: boolean
  chars: number
  size_bytes: number
  status: ConvertStatus
  progress: number
  chunks_total: number
  chunks_done: number
  audio: Buffer | null
  content_type: string
  error: string | null
  updated_at: string
}

function mapRow(row: Row): ConvertedAudio {
  return {
    userId: row.user_id,
    docId: row.doc_id,
    voice: row.voice,
    rate: Number(row.rate),
    skipCode: row.skip_code,
    skipTable: row.skip_table,
    chars: row.chars,
    sizeBytes: row.size_bytes,
    status: row.status,
    progress: row.progress,
    chunksTotal: row.chunks_total,
    chunksDone: row.chunks_done,
    audio: row.audio,
    contentType: row.content_type,
    error: row.error,
    updatedAt: row.updated_at,
  }
}

export async function getConverted(userId: string, docId: string): Promise<ConvertedAudio | null> {
  const { rows } = await pool.query<Row>(
    `SELECT user_id, doc_id, voice, rate, skip_code, skip_table, chars, size_bytes, status,
            progress, chunks_total, chunks_done, audio, content_type, error, updated_at
     FROM converted_audios WHERE user_id = $1 AND doc_id = $2`,
    [userId, docId],
  )
  return rows[0] ? mapRow(rows[0]) : null
}

export interface CreateConvertedInput {
  voice: string
  rate: number
  skipCode: boolean
  skipTable: boolean
  chars: number
  chunksTotal: number
}

export async function createConverted(userId: string, docId: string, input: CreateConvertedInput): Promise<void> {
  await pool.query(
    `INSERT INTO converted_audios (user_id, doc_id, voice, rate, skip_code, skip_table, chars, chunks_total, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
     ON CONFLICT (user_id, doc_id) DO UPDATE SET
       voice = EXCLUDED.voice,
       rate = EXCLUDED.rate,
       skip_code = EXCLUDED.skip_code,
       skip_table = EXCLUDED.skip_table,
       chars = EXCLUDED.chars,
       chunks_total = EXCLUDED.chunks_total,
       status = 'pending',
       progress = 0,
       chunks_done = 0,
       size_bytes = 0,
       audio = NULL,
       error = NULL,
       updated_at = now()`,
    [userId, docId, input.voice, input.rate, input.skipCode, input.skipTable, input.chars, input.chunksTotal],
  )
}

export async function appendConvertedAudio(
  userId: string,
  docId: string,
  audio: Buffer,
  chunksDone: number,
  chunksTotal: number,
): Promise<void> {
  await pool.query(
    `UPDATE converted_audios
     SET audio = COALESCE(audio, ''::bytea) || $3,
         size_bytes = size_bytes + $4,
         chunks_done = $5,
         progress = $6,
         status = 'converting',
         updated_at = now()
     WHERE user_id = $1 AND doc_id = $2`,
    [userId, docId, audio, audio.length, chunksDone, chunksTotal > 0 ? chunksDone / chunksTotal : 0],
  )
}

export async function finishConverted(userId: string, docId: string): Promise<void> {
  await pool.query(
    `UPDATE converted_audios SET status = 'done', progress = 1, updated_at = now()
     WHERE user_id = $1 AND doc_id = $2`,
    [userId, docId],
  )
}

export async function failConverted(userId: string, docId: string, error: string): Promise<void> {
  await pool.query(
    `UPDATE converted_audios SET status = 'failed', error = $3, audio = NULL, size_bytes = 0, updated_at = now()
     WHERE user_id = $1 AND doc_id = $2`,
    [userId, docId, error],
  )
}

export async function deleteConverted(userId: string, docId: string): Promise<void> {
  await pool.query('DELETE FROM converted_audios WHERE user_id = $1 AND doc_id = $2', [userId, docId])
}

export async function sumConvertedBytes(userId: string): Promise<number> {
  const { rows } = await pool.query<{ used: string }>(
    `SELECT COALESCE(SUM(size_bytes), 0)::text AS used FROM converted_audios
     WHERE user_id = $1 AND status = 'done'`,
    [userId],
  )
  return Number(rows[0]?.used ?? 0)
}
```

- [ ] **Step 3: 修改 `src/lib/db/documents.ts`**

在文件末尾（`hardDeleteServerDocument` 之后）新增文档占用统计，并让硬删除同时清理转换音频：

```ts
export async function sumServerDocumentBytes(userId: string): Promise<number> {
  const { rows } = await pool.query<{ used: string }>(
    `SELECT COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN file_size_bytes ELSE 0 END), 0)::text AS used
     FROM documents WHERE user_id = $1`,
    [userId],
  )
  return Number(rows[0]?.used ?? 0)
}
```

把 `hardDeleteServerDocument` 改为：

```ts
export async function hardDeleteServerDocument(userId: string, docId: string): Promise<void> {
  await pool.query('DELETE FROM documents WHERE user_id = $1 AND doc_id = $2', [userId, docId])
  await pool.query('DELETE FROM converted_audios WHERE user_id = $1 AND doc_id = $2', [userId, docId])
}
```

- [ ] **Step 4: 跑类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无输出（通过）

- [ ] **Step 5: 提交**

```bash
git add db/migrations/010_converted_audio.sql src/lib/db/convert.ts src/lib/db/documents.ts
git commit -m "feat(convert): add converted_audios table and db layer"
```

---

### Task 2: 段落级切块工具（TDD）

**Files:**
- Create: `src/lib/tts/server/convertChunks.ts`
- Test: `src/lib/tts/server/__tests__/convertChunks.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/tts/server/__tests__/convertChunks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { splitIntoChunks } from '../convertChunks'

const BASE = { skipCode: true, skipTable: true, maxChars: 10 }

describe('splitIntoChunks', () => {
  it('跳过代码块与表格（按设置）', () => {
    const md = '# 标题\n\n一段正文。\n\n```js\nconst a = 1\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n'
    expect(splitIntoChunks(md, BASE).join('\n')).not.toContain('const a = 1')
    expect(splitIntoChunks(md, BASE).join('\n')).not.toContain('| 1 | 2 |')
    expect(splitIntoChunks(md, BASE).join('\n')).toContain('一段正文')
  })

  it('不跳过时保留代码块内容', () => {
    const md = '```js\nconst a = 1\n```'
    const chunks = splitIntoChunks(md, { ...BASE, skipCode: false })
    expect(chunks.join('\n')).toContain('const a = 1')
  })

  it('单块不超过 maxChars（按字符数含空格）', () => {
    const md = Array.from({ length: 5 }, () => '一二三四五六七八九十').join('\n\n') // 5 x 10 字
    for (const chunk of splitIntoChunks(md, { ...BASE, maxChars: 12 })) {
      expect(Array.from(chunk).length).toBeLessThanOrEqual(12)
    }
  })

  it('合并相邻小段，保持顺序', () => {
    const md = '第一段。\n\n第二段。\n\n第三段。'
    const chunks = splitIntoChunks(md, { ...BASE, maxChars: 20 })
    expect(chunks.length).toBe(1)
    expect(chunks[0]).toContain('第一段')
    expect(chunks[0]).toContain('第三段')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/tts/server/__tests__/convertChunks.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现切块**

`src/lib/tts/server/convertChunks.ts`:

```ts
import { parseDocument } from '@/lib/markdown/parse'

export interface ChunkOptions {
  skipCode: boolean
  skipTable: boolean
  maxChars: number
}

export function splitIntoChunks(content: string, opts: ChunkOptions): string[] {
  const doc = parseDocument(content)
  const chunks: string[] = []
  let current = ''
  const flush = () => {
    if (current) {
      chunks.push(current)
      current = ''
    }
  }
  for (const block of doc.blocks) {
    if (block.type === 'code' && opts.skipCode) continue
    if (block.type === 'table' && opts.skipTable) continue
    const text = (block.text ?? '').trim()
    if (!text) continue
    const len = Array.from(text).length
    if (len > opts.maxChars) {
      flush()
      const chars = Array.from(text)
      for (let i = 0; i < chars.length; i += opts.maxChars) {
        chunks.push(chars.slice(i, i + opts.maxChars).join(''))
      }
    } else if (Array.from(current).length + len > opts.maxChars) {
      flush()
      current = text
    } else {
      current = current ? `${current}\n${text}` : text
    }
  }
  flush()
  return chunks
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/tts/server/__tests__/convertChunks.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/lib/tts/server/convertChunks.ts src/lib/tts/server/__tests__/convertChunks.test.ts
git commit -m "feat(convert): paragraph chunking for full-document conversion"
```

---

### Task 3: 转换服务（TDD）

**Files:**
- Create: `src/lib/tts/server/convertService.ts`
- Test: `src/lib/tts/server/__tests__/convertService.test.ts`

- [ ] **Step 1: 写失败测试**

`src/lib/tts/server/__tests__/convertService.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { startConversion, advanceConversion, getConvertStatus, convertRef, settingsMatch } from '../convertService'
import type { ConvertedAudio } from '@/lib/db/convert'
import type { SyncedDocument } from '@/types/document'

vi.mock('@/lib/db/convert', () => ({
  getConverted: vi.fn(),
  createConverted: vi.fn(),
  appendConvertedAudio: vi.fn(),
  finishConverted: vi.fn(),
  failConverted: vi.fn(),
  sumConvertedBytes: vi.fn(),
}))
vi.mock('@/lib/db/documents', () => ({
  getServerDocument: vi.fn(),
  getUserQuotaBytes: vi.fn(),
  sumServerDocumentBytes: vi.fn(),
}))
vi.mock('@/lib/db/credits', () => ({
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}))
vi.mock('@/lib/tts/server/provider', () => ({ getProvider: vi.fn() }))

import { getConverted, createConverted, appendConvertedAudio, finishConverted, failConverted, sumConvertedBytes } from '@/lib/db/convert'
import { getServerDocument, getUserQuotaBytes, sumServerDocumentBytes } from '@/lib/db/documents'
import { deductCredits, refundCredits } from '@/lib/db/credits'
import { getProvider } from '@/lib/tts/server/provider'

const mockDoc: SyncedDocument = {
  docId: 'doc-1',
  title: 't',
  content: '第一段。\n\n第二段。',
  contentHash: 'h',
  fileSizeBytes: 20,
  updatedAt: 1,
  deletedAt: null,
  deleteExpiresAt: null,
}

// 2 段 x 8000 字 -> 每段按 2000 字切成 4 块 -> 共 8 块
const longPara = '字'.repeat(8000)
const mockDocMulti: SyncedDocument = {
  ...mockDoc,
  content: `${longPara}\n\n${longPara}`,
}

function doneRow(overrides: Partial<ConvertedAudio> = {}): ConvertedAudio {
  return {
    userId: 'u1', docId: 'doc-1', voice: 'alloy', rate: 1, skipCode: true, skipTable: true,
    chars: 8, sizeBytes: 100, status: 'done', progress: 1, chunksTotal: 2, chunksDone: 2,
    audio: Buffer.from('mp3'), contentType: 'audio/mpeg', error: null, updatedAt: 't',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getProvider).mockReturnValue({
    id: 'doubao',
    costPerMillionChars: 38.9,
    voices: [{ id: 'alloy', name: 'v' }, { id: 'nova', name: 'n' }],
    synthesize: vi.fn(async ({ text }) => ({ audio: Buffer.from(`audio:${text}`), contentType: 'audio/mpeg', costUsd: 0.01 })),
  } as never)
})

describe('convertRef / settingsMatch', () => {
  it('ref 包含设置指纹', () => {
    expect(convertRef('d', 'alloy', 1, true, false)).toBe('convert:d:alloy:1:1:0')
  })
  it('settingsMatch 比较设置', () => {
    expect(settingsMatch(doneRow(), 'alloy', 1, true, true)).toBe(true)
    expect(settingsMatch(doneRow(), 'alloy', 1.25, true, true)).toBe(false)
  })
})

describe('startConversion', () => {
  it('预扣积分并创建 pending 任务', async () => {
    vi.mocked(getServerDocument).mockResolvedValue(mockDoc)
    vi.mocked(getConverted).mockResolvedValue(null)
    vi.mocked(deductCredits).mockResolvedValue(true)
    const result = await startConversion('u1', 'doc-1', { voice: 'alloy', rate: 1, skipCode: true, skipTable: true })
    expect(result.creditsCharged).toBeGreaterThan(0)
    expect(deductCredits).toHaveBeenCalledWith('u1', result.creditsCharged, 'convert:doc-1:alloy:1:1:1', expect.anything(), '完整转换')
    expect(createConverted).toHaveBeenCalledWith('u1', 'doc-1', expect.objectContaining({ voice: 'alloy', chunksTotal: 2 }))
  })

  it('同设置已 done 不重复扣积分', async () => {
    vi.mocked(getServerDocument).mockResolvedValue(mockDoc)
    vi.mocked(getConverted).mockResolvedValue(doneRow())
    const result = await startConversion('u1', 'doc-1', { voice: 'alloy', rate: 1, skipCode: true, skipTable: true })
    expect(result).toEqual({ alreadyDone: true, creditsCharged: 0 })
    expect(deductCredits).not.toHaveBeenCalled()
  })

  it('余额不足抛 INSUFFICIENT_CREDITS', async () => {
    vi.mocked(getServerDocument).mockResolvedValue(mockDoc)
    vi.mocked(getConverted).mockResolvedValue(null)
    vi.mocked(deductCredits).mockResolvedValue(false)
    await expect(startConversion('u1', 'doc-1', { voice: 'alloy', rate: 1, skipCode: true, skipTable: true })).rejects.toThrow('INSUFFICIENT_CREDITS')
  })

  it('无效音色回退到供应商第一个音色', async () => {
    vi.mocked(getServerDocument).mockResolvedValue(mockDoc)
    vi.mocked(getConverted).mockResolvedValue(null)
    vi.mocked(deductCredits).mockResolvedValue(true)
    await startConversion('u1', 'doc-1', { voice: 'browser', rate: 1, skipCode: true, skipTable: true })
    expect(createConverted).toHaveBeenCalledWith('u1', 'doc-1', expect.objectContaining({ voice: 'alloy' }))
  })
})

describe('advanceConversion', () => {
  it('每批只推进 4 块并追加音频', async () => {
    vi.mocked(getConverted)
      .mockResolvedValueOnce(doneRow({ status: 'converting', chunksDone: 0, chunksTotal: 8, audio: null, sizeBytes: 0 }))
      .mockResolvedValueOnce(doneRow({ status: 'converting', chunksDone: 4, chunksTotal: 8 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(appendConvertedAudio).toHaveBeenCalledTimes(1)
    const [u, d, audio, done] = vi.mocked(appendConvertedAudio).mock.calls[0]
    expect(done).toBe(4)
    expect((audio as Buffer).toString()).toContain('audio:')
    expect(finishConverted).not.toHaveBeenCalled()
    expect(status.status).toBe('converting')
  })

  it('全部完成时 finish 并检查配额', async () => {
    vi.mocked(getConverted)
      .mockResolvedValueOnce(doneRow({ status: 'converting', chunksDone: 2, chunksTotal: 4, audio: null, sizeBytes: 50 }))
      .mockResolvedValueOnce(doneRow({ status: 'done', chunksDone: 4, chunksTotal: 4 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    vi.mocked(getUserQuotaBytes).mockResolvedValue(1000)
    vi.mocked(sumServerDocumentBytes).mockResolvedValue(100)
    vi.mocked(sumConvertedBytes).mockResolvedValue(100)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(appendConvertedAudio).toHaveBeenCalledTimes(1)
    expect(finishConverted).toHaveBeenCalledWith('u1', 'doc-1')
    expect(status.status).toBe('done')
  })

  it('配额不足时失败并退款', async () => {
    vi.mocked(getConverted)
      .mockResolvedValueOnce(doneRow({ status: 'converting', chunksDone: 2, chunksTotal: 4, audio: null, sizeBytes: 50 }))
      .mockResolvedValueOnce(doneRow({ status: 'failed', error: 'QUOTA_EXCEEDED', audio: null, sizeBytes: 0 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    vi.mocked(getUserQuotaBytes).mockResolvedValue(100)
    vi.mocked(sumServerDocumentBytes).mockResolvedValue(200)
    vi.mocked(sumConvertedBytes).mockResolvedValue(0)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(failConverted).toHaveBeenCalledWith('u1', 'doc-1', 'QUOTA_EXCEEDED')
    expect(refundCredits).toHaveBeenCalled()
    expect(status.status).toBe('failed')
  })

  it('合成失败时失败并退款', async () => {
    vi.mocked(getConverted)
      .mockResolvedValueOnce(doneRow({ status: 'converting', chunksDone: 0, chunksTotal: 4, audio: null, sizeBytes: 0 }))
      .mockResolvedValueOnce(doneRow({ status: 'failed', error: 'boom', audio: null, sizeBytes: 0 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    vi.mocked(getProvider).mockReturnValue({
      id: 'doubao', costPerMillionChars: 38.9,
      voices: [{ id: 'alloy', name: 'v' }],
      synthesize: vi.fn(async () => { throw new Error('boom') }),
    } as never)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(failConverted).toHaveBeenCalledWith('u1', 'doc-1', 'boom')
    expect(refundCredits).toHaveBeenCalled()
    expect(status.status).toBe('failed')
  })
})

describe('getConvertStatus', () => {
  it('无记录返回 null', async () => {
    vi.mocked(getConverted).mockResolvedValue(null)
    expect(await getConvertStatus('u1', 'doc-1')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/tts/server/__tests__/convertService.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现服务**

`src/lib/tts/server/convertService.ts`:

```ts
import { CONFIG } from '@/lib/config'
import { calcCredits, countChars } from '@/lib/tts/server/cost'
import { getProvider } from '@/lib/tts/server/provider'
import { splitIntoChunks } from '@/lib/tts/server/convertChunks'
import { getServerDocument, getUserQuotaBytes, sumServerDocumentBytes } from '@/lib/db/documents'
import { deductCredits, refundCredits } from '@/lib/db/credits'
import {
  getConverted,
  createConverted,
  appendConvertedAudio,
  finishConverted,
  failConverted,
  sumConvertedBytes,
  type ConvertedAudio,
} from '@/lib/db/convert'

export const CONVERT_BATCH_SIZE = 4
export const CONVERT_DESC = '完整转换'
const CONVERT_REFUND_DESC = '完整转换失败退还积分'

export function convertRef(docId: string, voice: string, rate: number, skipCode: boolean, skipTable: boolean): string {
  return `convert:${docId}:${voice}:${rate}:${skipCode ? 1 : 0}:${skipTable ? 1 : 0}`
}

export function settingsMatch(
  row: Pick<ConvertedAudio, 'voice' | 'rate' | 'skipCode' | 'skipTable'>,
  voice: string,
  rate: number,
  skipCode: boolean,
  skipTable: boolean,
): boolean {
  return row.voice === voice && row.rate === rate && row.skipCode === skipCode && row.skipTable === skipTable
}

export interface ConvertStatus {
  status: 'pending' | 'converting' | 'done' | 'failed'
  progress: number
  sizeBytes: number
  error: string | null
  voice: string
  rate: number
  skipCode: boolean
  skipTable: boolean
}

function toStatus(row: ConvertedAudio): ConvertStatus {
  return {
    status: row.status,
    progress: row.progress,
    sizeBytes: row.sizeBytes,
    error: row.error,
    voice: row.voice,
    rate: row.rate,
    skipCode: row.skipCode,
    skipTable: row.skipTable,
  }
}

function resolveVoice(voice: string): string {
  const provider = getProvider()
  if (voice && provider.voices.some((v) => v.id === voice)) return voice
  return provider.voices[0]?.id ?? 'alloy'
}

export interface StartOptions {
  voice: string
  rate: number
  skipCode: boolean
  skipTable: boolean
}

export interface StartResult {
  alreadyDone: boolean
  creditsCharged: number
}

export async function startConversion(userId: string, docId: string, opts: StartOptions): Promise<StartResult> {
  const doc = await getServerDocument(userId, docId)
  if (!doc) throw new Error('DOC_NOT_FOUND')
  const voice = resolveVoice(opts.voice)
  const chunks = splitIntoChunks(doc.content, {
    skipCode: opts.skipCode,
    skipTable: opts.skipTable,
    maxChars: CONFIG.tts.maxTextChars,
  })
  const chars = chunks.reduce((sum, c) => sum + countChars(c), 0)
  const credits = calcCredits(chars, CONFIG.tts.creditsPer100Chars)
  const ref = convertRef(docId, voice, opts.rate, opts.skipCode, opts.skipTable)

  const existing = await getConverted(userId, docId)
  if (existing?.status === 'done' && settingsMatch(existing, voice, opts.rate, opts.skipCode, opts.skipTable)) {
    return { alreadyDone: true, creditsCharged: 0 }
  }

  const ok = await deductCredits(userId, credits, ref, { docId, voice, rate: opts.rate, chars }, CONVERT_DESC)
  if (!ok) throw new Error('INSUFFICIENT_CREDITS')

  await createConverted(userId, docId, {
    voice,
    rate: opts.rate,
    skipCode: opts.skipCode,
    skipTable: opts.skipTable,
    chars,
    chunksTotal: chunks.length,
  })
  return { alreadyDone: false, creditsCharged: credits }
}

function creditsFor(row: Pick<ConvertedAudio, 'chars'>): number {
  return calcCredits(row.chars, CONFIG.tts.creditsPer100Chars)
}

export async function advanceConversion(userId: string, docId: string, batchSize = CONVERT_BATCH_SIZE): Promise<ConvertStatus> {
  const row = await getConverted(userId, docId)
  if (!row) throw new Error('CONVERT_NOT_FOUND')
  if (row.status === 'done' || row.status === 'failed') return toStatus(row)

  const doc = await getServerDocument(userId, docId)
  if (!doc) throw new Error('DOC_NOT_FOUND')

  const provider = getProvider()
  const chunks = splitIntoChunks(doc.content, {
    skipCode: row.skipCode,
    skipTable: row.skipTable,
    maxChars: CONFIG.tts.maxTextChars,
  })
  const ref = convertRef(docId, row.voice, row.rate, row.skipCode, row.skipTable)
  const slice = chunks.slice(row.chunksDone, Math.min(row.chunksDone + batchSize, chunks.length))

  try {
    const results = await Promise.all(
      slice.map((text) => provider.synthesize({ text, voice: row.voice, rate: row.rate })),
    )
    const joined = Buffer.concat(results.map((r) => r.audio))
    const done = row.chunksDone + results.length
    await appendConvertedAudio(userId, docId, joined, done, chunks.length)

    if (done >= chunks.length) {
      const updated = await getConverted(userId, docId)
      if (!updated) throw new Error('CONVERT_NOT_FOUND')
      const quotaBytes = await getUserQuotaBytes(userId)
      const usedBytes = (await sumServerDocumentBytes(userId)) + (await sumConvertedBytes(userId))
      if (usedBytes > quotaBytes) {
        await failConverted(userId, docId, 'QUOTA_EXCEEDED')
        await refundCredits(userId, creditsFor(row), ref, { docId, reason: 'quota' }, CONVERT_REFUND_DESC)
        return toStatus({ ...updated, status: 'failed', error: 'QUOTA_EXCEEDED', audio: null, sizeBytes: 0 })
      }
      await finishConverted(userId, docId)
      return toStatus({ ...updated, status: 'done', progress: 1 })
    }
    return toStatus(await getConverted(userId, docId) as ConvertedAudio)
  } catch (err) {
    console.error('convert advance failed', err)
    const message = err instanceof Error ? err.message : String(err)
    await failConverted(userId, docId, message)
    await refundCredits(userId, creditsFor(row), ref, { docId, reason: 'failed' }, CONVERT_REFUND_DESC)
    return toStatus({ ...row, status: 'failed', error: message, audio: null, sizeBytes: 0 })
  }
}

export async function getConvertStatus(userId: string, docId: string): Promise<ConvertStatus | null> {
  const row = await getConverted(userId, docId)
  return row ? toStatus(row) : null
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/tts/server/__tests__/convertService.test.ts`
Expected: PASS（11 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/lib/tts/server/convertService.ts src/lib/tts/server/__tests__/convertService.test.ts
git commit -m "feat(convert): conversion service with credits, quota and batch progress"
```

---

### Task 4: 转换 API 路由（TDD）

**Files:**
- Create: `src/app/api/tts/convert/route.ts`
- Create: `src/app/api/tts/convert/[docId]/audio/route.ts`
- Test: `src/app/api/tts/convert/__tests__/convert.test.ts`
- Test: `src/app/api/tts/convert/[docId]/__tests__/audio.test.ts`

- [ ] **Step 1: 写失败测试**

`src/app/api/tts/convert/__tests__/convert.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { POST, GET } from '../route'

vi.mock('@/lib/auth/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/credits', () => ({ hasActiveSubscription: vi.fn() }))
vi.mock('@/lib/tts/server/convertService', () => ({
  startConversion: vi.fn(),
  advanceConversion: vi.fn(),
  getConvertStatus: vi.fn(),
  CONVERT_BATCH_SIZE: 4,
}))

import { auth } from '@/lib/auth/server'
import { hasActiveSubscription } from '@/lib/db/credits'
import { startConversion, advanceConversion, getConvertStatus } from '@/lib/tts/server/convertService'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  vi.mocked(hasActiveSubscription).mockResolvedValue(true)
})

describe('POST /api/tts/convert', () => {
  it('未登录返回 401', async () => {
    vi.mocked(auth).mockResolvedValue(null)
    const res = await POST(new Request('http://x/api/tts/convert', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
  })

  it('非订阅返回 403', async () => {
    vi.mocked(hasActiveSubscription).mockResolvedValue(false)
    const res = await POST(new Request('http://x/api/tts/convert', { method: 'POST', body: JSON.stringify({ docId: '123e4567-e89b-12d3-a456-426614174000' }) }))
    expect(res.status).toBe(403)
  })

  it('合法请求返回 pending 与积分', async () => {
    vi.mocked(startConversion).mockResolvedValue({ alreadyDone: false, creditsCharged: 6 })
    const res = await POST(new Request('http://x/api/tts/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: '123e4567-e89b-12d3-a456-426614174000', voice: 'alloy', rate: 1, skipCode: true, skipTable: true }),
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ docId: '123e4567-e89b-12d3-a456-426614174000', status: 'pending', creditsCharged: 6 })
  })

  it('已转换直接返回 done', async () => {
    vi.mocked(startConversion).mockResolvedValue({ alreadyDone: true, creditsCharged: 0 })
    const res = await POST(new Request('http://x/api/tts/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: '123e4567-e89b-12d3-a456-426614174000' }),
    }))
    expect((await res.json()).status).toBe('done')
  })

  it('余额不足返回 402', async () => {
    vi.mocked(startConversion).mockRejectedValue(new Error('INSUFFICIENT_CREDITS'))
    const res = await POST(new Request('http://x/api/tts/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: '123e4567-e89b-12d3-a456-426614174000' }),
    }))
    expect(res.status).toBe(402)
  })
})

describe('GET /api/tts/convert', () => {
  it('advance=1 时推进并返回状态', async () => {
    vi.mocked(advanceConversion).mockResolvedValue({ status: 'converting', progress: 0.5, sizeBytes: 50, error: null, voice: 'alloy', rate: 1, skipCode: true, skipTable: true })
    const res = await GET(new Request('http://x/api/tts/convert?docId=123e4567-e89b-12d3-a456-426614174000&advance=1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('converting')
    expect(body.progress).toBe(0.5)
  })

  it('纯查询不推进', async () => {
    vi.mocked(getConvertStatus).mockResolvedValue({ status: 'done', progress: 1, sizeBytes: 100, error: null, voice: 'alloy', rate: 1, skipCode: true, skipTable: true })
    const res = await GET(new Request('http://x/api/tts/convert?docId=123e4567-e89b-12d3-a456-426614174000'))
    expect(advanceConversion).not.toHaveBeenCalled()
    expect((await res.json()).status).toBe('done')
  })

  it('无任务返回 404', async () => {
    vi.mocked(getConvertStatus).mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/tts/convert?docId=123e4567-e89b-12d3-a456-426614174000'))
    expect(res.status).toBe(404)
  })
})
```

`src/app/api/tts/convert/[docId]/__tests__/audio.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GET } from '../route'

vi.mock('@/lib/auth/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/convert', () => ({ getConverted: vi.fn() }))

import { auth } from '@/lib/auth/server'
import { getConverted } from '@/lib/db/convert'
import type { ConvertedAudio } from '@/lib/db/convert'

const DOC_ID = '123e4567-e89b-12d3-a456-426614174000'

function doneRow(overrides: Partial<ConvertedAudio> = {}): ConvertedAudio {
  return {
    userId: 'u1', docId: DOC_ID, voice: 'alloy', rate: 1, skipCode: true, skipTable: true,
    chars: 10, sizeBytes: 1000, status: 'done', progress: 1, chunksTotal: 1, chunksDone: 1,
    audio: Buffer.from('0123456789'), contentType: 'audio/mpeg', error: null, updatedAt: 't',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
})

describe('GET /api/tts/convert/[docId]/audio', () => {
  it('返回完整音频', async () => {
    vi.mocked(getConverted).mockResolvedValue(doneRow())
    const res = await GET(new Request('http://x/audio'), { params: Promise.resolve({ docId: DOC_ID }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('0123456789')
  })

  it('支持 Range 返回 206', async () => {
    vi.mocked(getConverted).mockResolvedValue(doneRow())
    const res = await GET(new Request('http://x/audio', { headers: { Range: 'bytes=2-5' } }), { params: Promise.resolve({ docId: DOC_ID }) })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('2345')
  })

  it('未完成或不存在返回 404', async () => {
    vi.mocked(getConverted).mockResolvedValue(doneRow({ status: 'converting', audio: null }))
    const res = await GET(new Request('http://x/audio'), { params: Promise.resolve({ docId: DOC_ID }) })
    expect(res.status).toBe(404)
  })

  it('download=1 时带下载头', async () => {
    vi.mocked(getConverted).mockResolvedValue(doneRow())
    const res = await GET(new Request('http://x/audio?download=1'), { params: Promise.resolve({ docId: DOC_ID }) })
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/app/api/tts/convert`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现主路由**

`src/app/api/tts/convert/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { hasActiveSubscription } from '@/lib/db/credits'
import { startConversion, advanceConversion, getConvertStatus } from '@/lib/tts/server/convertService'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function mapError(err: unknown): Promise<NextResponse> {
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'DOC_NOT_FOUND') {
    return NextResponse.json({ error: await serverT('server.docNotFound') }, { status: 404 })
  }
  if (message === 'INSUFFICIENT_CREDITS') {
    return NextResponse.json({ error: await serverT('server.creditsInsufficient') }, { status: 402 })
  }
  if (message === 'CONVERT_NOT_FOUND') {
    return NextResponse.json({ error: await serverT('server.audioNotFound') }, { status: 404 })
  }
  console.error('convert api failed', err)
  return NextResponse.json({ error: await serverT('server.operationFailed') }, { status: 500 })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  if (!(await hasActiveSubscription(session.user.id))) {
    return NextResponse.json({ error: await serverT('server.proRequired') }, { status: 403 })
  }
  let body: { docId?: unknown; voice?: unknown; rate?: unknown; skipCode?: unknown; skipTable?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const docId = typeof body?.docId === 'string' ? body.docId : ''
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const rate = typeof body?.rate === 'number' ? body.rate : 1
  if (rate < 0.5 || rate > 2) {
    return NextResponse.json({ error: await serverT('server.rateInvalid') }, { status: 400 })
  }
  const skipCode = body?.skipCode === true
  const skipTable = body?.skipTable === true
  const voice = typeof body?.voice === 'string' ? body.voice : ''
  try {
    const result = await startConversion(session.user.id, docId, { voice, rate, skipCode, skipTable })
    return NextResponse.json({
      docId,
      status: result.alreadyDone ? 'done' : 'pending',
      creditsCharged: result.creditsCharged,
    })
  } catch (err) {
    return mapError(err)
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  const url = new URL(req.url)
  const docId = url.searchParams.get('docId') ?? ''
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const advance = url.searchParams.get('advance') === '1'
  try {
    const status = advance
      ? await advanceConversion(session.user.id, docId)
      : await getConvertStatus(session.user.id, docId)
    if (!status) {
      return NextResponse.json({ error: await serverT('server.audioNotFound') }, { status: 404 })
    }
    return NextResponse.json({ docId, ...status })
  } catch (err) {
    return mapError(err)
  }
}
```

- [ ] **Step 4: 实现音频路由**

`src/app/api/tts/convert/[docId]/audio/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { getConverted } from '@/lib/db/convert'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  const { docId } = await params
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const row = await getConverted(session.user.id, docId)
  if (!row || row.status !== 'done' || !row.audio) {
    return NextResponse.json({ error: await serverT('server.audioNotFound') }, { status: 404 })
  }
  const audio = row.audio
  const url = new URL(req.url)
  const download = url.searchParams.get('download') === '1'
  const range = req.headers.get('range')
  const rangeMatch = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null
  if (rangeMatch) {
    const start = Number(rangeMatch[1])
    const end = rangeMatch[2] ? Math.min(Number(rangeMatch[2]), audio.length - 1) : audio.length - 1
    if (start <= end && start < audio.length) {
      const slice = audio.subarray(start, end + 1)
      return new NextResponse(slice, {
        status: 206,
        headers: {
          'Content-Type': row.contentType,
          'Content-Length': String(slice.length),
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${audio.length}`,
        },
      })
    }
  }
  return new NextResponse(audio, {
    status: 200,
    headers: {
      'Content-Type': row.contentType,
      'Content-Length': String(audio.length),
      'Accept-Ranges': 'bytes',
      ...(download ? { 'Content-Disposition': `attachment; filename="${docId}.mp3"` } : {}),
    },
  })
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/app/api/tts/convert`
Expected: PASS（9 个用例）

- [ ] **Step 6: 类型检查 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无输出

```bash
git add src/app/api/tts/convert
git commit -m "feat(convert): conversion and audio streaming api routes"
```

---

### Task 5: 国际化文案 + 下载图标

**Files:**
- Modify: `src/lib/i18n/zh.ts`
- Modify: `src/lib/i18n/en.ts`
- Modify: `src/components/app/icons.tsx`

- [ ] **Step 1: 添加 `convert.*` 与新增 `server.*` key**

`src/lib/i18n/zh.ts` 中新增（放在 `server.*` 段与 `transactions.*` 段之后各加对应项，`convert.*` 加在 `reader.*` 段附近即可）：

```ts
  'convert.start': '转成音频',
  'convert.progress': '转换中 {p}%',
  'convert.download': '下载音频',
  'convert.reconvert': '重新转换',
  'convert.done': '转换完成',
  'convert.failed': '转换失败，请重试',
  'convert.proRequired': '完整转换是 Pro 专属功能，需订阅后使用',
  'convert.quotaExceeded': '存储空间不足，无法保存音频',
  'convert.notFound': '未找到转换任务',
  'reader.seamless': '整篇播放',
  'transactions.fullConvert': '完整转换',
  'server.proRequired': '需订阅后使用',
  'server.docNotFound': '文档不存在',
```

`src/lib/i18n/en.ts` 中对称新增：

```ts
  'convert.start': 'Convert to audio',
  'convert.progress': 'Converting {p}%',
  'convert.download': 'Download audio',
  'convert.reconvert': 'Convert again',
  'convert.done': 'Conversion complete',
  'convert.failed': 'Conversion failed, please try again',
  'convert.proRequired': 'Full conversion is a Pro feature — requires an active subscription',
  'convert.quotaExceeded': 'Not enough storage to save the audio',
  'convert.notFound': 'Conversion not found',
  'reader.seamless': 'Full-document playback',
  'transactions.fullConvert': 'Full conversion',
  'server.proRequired': 'Requires an active subscription',
  'server.docNotFound': 'Document not found',
```

注意：zh/en 必须同时添加且 key 名一致（`en` 类型是 `Record<keyof typeof zh, string>`）。

- [ ] **Step 2: 新增下载图标**

`src/components/app/icons.tsx` 末尾追加（参考现有 Icon 结构）：

```tsx
export function IconDownload(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
}
```

- [ ] **Step 3: 验证 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无输出

```bash
git add src/lib/i18n/zh.ts src/lib/i18n/en.ts src/components/app/icons.tsx
git commit -m "feat(convert): i18n copy and download icon"
```

---

### Task 6: 文库页转换入口

**Files:**
- Modify: `src/components/library/LibraryView.tsx`

- [ ] **Step 1: 添加状态与转换函数**

在 `LibraryView` 组件内（`const [menuFor, setMenuFor]` 附近）新增：

```tsx
const [converting, setConverting] = useState<Record<string, number>>({})
const [convertedMap, setConvertedMap] = useState<Record<string, boolean>>({})
const showToast = useUiStore((s) => s.showToast)
```

在组件内（`sync` 函数附近）新增：

```tsx
const convertDoc = useCallback(async (doc: LibraryDocument) => {
  setConverting((m) => ({ ...m, [doc.docId]: 0 }))
  try {
    const res = await fetch('/api/tts/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: doc.docId }),
    })
    const data = (await res.json().catch(() => null)) as { status?: string; error?: string } | null
    if (!res.ok) {
      showToast(data?.error ?? t('convert.failed'))
      setConverting((m) => { const n = { ...m }; delete n[doc.docId]; return n })
      return
    }
    if (data?.status === 'done') {
      setConvertedMap((m) => ({ ...m, [doc.docId]: true }))
      showToast(t('convert.done'))
      setConverting((m) => { const n = { ...m }; delete n[doc.docId]; return n })
      return
    }
    for (let i = 0; i < 600; i += 1) {
      await new Promise((r) => setTimeout(r, 2000))
      const sres = await fetch(`/api/tts/convert?docId=${encodeURIComponent(doc.docId)}&advance=1`)
      const sdata = (await sres.json().catch(() => null)) as { status?: string; progress?: number } | null
      setConverting((m) => ({ ...m, [doc.docId]: Math.round((sdata?.progress ?? 0) * 100) }))
      if (sdata?.status === 'done') {
        setConvertedMap((m) => ({ ...m, [doc.docId]: true }))
        showToast(t('convert.done'))
        break
      }
      if (sdata?.status === 'failed') {
        showToast(t('convert.failed'))
        break
      }
    }
  } catch {
    showToast(t('convert.failed'))
  }
  setConverting((m) => { const n = { ...m }; delete n[doc.docId]; return n })
}, [showToast, t])

const openMenu = useCallback(async (docId: string) => {
  setMenuFor((cur) => (cur === docId ? null : docId))
  if (menuFor === docId) return
  try {
    const res = await fetch(`/api/tts/convert?docId=${encodeURIComponent(docId)}`)
    const data = (await res.json().catch(() => null)) as { status?: string } | null
    setConvertedMap((m) => ({ ...m, [docId]: data?.status === 'done' }))
  } catch {
    // 状态查询失败时保持未知，不打扰用户
  }
}, [menuFor])
```

- [ ] **Step 2: 接入菜单项**

把文档行「更多」按钮的 `onClick` 从 `() => setMenuFor(menuFor === doc.docId ? null : doc.docId)` 改为 `() => void openMenu(doc.docId)`。

在 `row-menu` 内 docs tab 的「重命名」按钮之前插入：

```tsx
<button
  type="button"
  role="menuitem"
  disabled={converting[doc.docId] != null}
  onClick={() => void convertDoc(doc)}
>
  {converting[doc.docId] != null
    ? t('convert.progress', { p: converting[doc.docId] })
    : convertedMap[doc.docId]
      ? t('convert.reconvert')
      : t('convert.start')}
</button>
{convertedMap[doc.docId] && (
  <a role="menuitem" href={`/api/tts/convert/${encodeURIComponent(doc.docId)}/audio?download=1`} download>
    {t('convert.download')}
  </a>
)}
```

- [ ] **Step 3: 验证 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/app/library src/components/library`
Expected: 通过

```bash
git add src/components/library/LibraryView.tsx
git commit -m "feat(convert): library menu convert/download entry with progress"
```

---

### Task 7: 阅读器转换 + 无缝播放

**Files:**
- Modify: `src/components/reader/ReaderLayout.tsx`
- Modify: `src/components/reader/PlaybackBar.tsx`

- [ ] **Step 1: ReaderLayout 增加转换状态与按钮**

`src/components/reader/ReaderLayout.tsx`：

顶部 import 增加 `useEffect`、`useUiStore`、`useReaderStore`（store 已有）、`IconDownload` 不需要（下载按钮在播放条）。新增：

```tsx
import { useEffect, useState } from 'react'
import { useUiStore } from '@/lib/state/uiStore'
import { useReaderStore } from '@/lib/state/readerStore'
```

在 `ReaderLayout` 组件内新增状态与逻辑：

```tsx
const settings = useReaderStore((s) => s.settings)
const showToast = useUiStore((s) => s.showToast)
const [converted, setConverted] = useState<{
  status: string
  progress: number
  voice: string
  rate: number
  skipCode: boolean
  skipTable: boolean
} | null>(null)
const [convertProgress, setConvertProgress] = useState<number | null>(null)

useEffect(() => {
  let cancelled = false
  async function check() {
    try {
      const res = await fetch(`/api/tts/convert?docId=${encodeURIComponent(document.id)}`)
      const data = (await res.json()) as {
        status?: string
        progress?: number
        voice?: string
        rate?: number
        skipCode?: boolean
        skipTable?: boolean
      }
      if (!cancelled && data) {
        setConverted({
          status: data.status ?? 'pending',
          progress: data.progress ?? 0,
          voice: data.voice ?? '',
          rate: data.rate ?? 1,
          skipCode: data.skipCode ?? true,
          skipTable: data.skipTable ?? true,
        })
      }
    } catch {
      // 未登录或未转换时忽略
    }
  }
  void check()
  return () => {
    cancelled = true
  }
}, [document.id])

const startConvert = useCallback(async () => {
  setConvertProgress(0)
  try {
    const res = await fetch('/api/tts/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docId: document.id,
        voice: settings.voice,
        rate: settings.rate,
        skipCode: settings.skipCode,
        skipTable: settings.skipTable,
      }),
    })
    const data = (await res.json().catch(() => null)) as { status?: string; error?: string } | null
    if (!res.ok) {
      showToast(data?.error ?? t('convert.failed'))
      setConvertProgress(null)
      return
    }
    if (data?.status === 'done') {
      showToast(t('convert.done'))
      setConvertProgress(null)
      return
    }
    for (let i = 0; i < 600; i += 1) {
      await new Promise((r) => setTimeout(r, 2000))
      const sres = await fetch(`/api/tts/convert?docId=${encodeURIComponent(document.id)}&advance=1`)
      const sdata = (await sres.json().catch(() => null)) as { status?: string; progress?: number } | null
      setConvertProgress(Math.round((sdata?.progress ?? 0) * 100))
      if (sdata?.status === 'done') {
        showToast(t('convert.done'))
        break
      }
      if (sdata?.status === 'failed') {
        showToast(t('convert.failed'))
        break
      }
    }
  } catch {
    showToast(t('convert.failed'))
  }
  setConvertProgress(null)
}, [document.id, settings, showToast, t])
```

在工具栏 `rt-actions` 内（`LangSwitch` 之前的旧位置已删）追加「转成音频」按钮：

```tsx
<button
  type="button"
  className="rt-btn"
  onClick={() => void startConvert()}
  disabled={convertProgress != null}
  aria-label={t('convert.start')}
>
  <IconCloud />
  {convertProgress != null ? t('convert.progress', { p: convertProgress }) : t('convert.start')}
</button>
```

计算无缝模式并在 `PlaybackBar` 上传参：

```tsx
const seamless =
  converted?.status === 'done' &&
  settings.voice === converted.voice &&
  settings.rate === converted.rate &&
  settings.skipCode === converted.skipCode &&
  settings.skipTable === converted.skipTable &&
  !settings.sentencePause
```

把 `<PlaybackBar />` 改为：

```tsx
<PlaybackBar
  seamlessUrl={seamless ? `/api/tts/convert/${encodeURIComponent(document.id)}/audio` : undefined}
  seamlessDownloadUrl={seamless ? `/api/tts/convert/${encodeURIComponent(document.id)}/audio?download=1` : undefined}
/>
```

- [ ] **Step 2: PlaybackBar 支持无缝模式**

`src/components/reader/PlaybackBar.tsx`：

- import 增加 `useState`、`useEffect`、`IconDownload`。
- 新增 `SeamlessBar` 子组件（同文件内）：

```tsx
function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function SeamlessBar({ url, downloadUrl, title }: { url: string; downloadUrl: string; title: string }) {
  const { t } = useI18n()
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0)
    const onTime = () => setTime(el.currentTime)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd = () => setPlaying(false)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }

  const seek = (clientX: number) => {
    const el = audioRef.current
    const track = trackRef.current
    if (!el || !track || duration <= 0) return
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
    el.currentTime = ratio * duration
  }

  const progress = duration > 0 ? (time / duration) * 100 : 0

  return (
    <div className="player" role="region" aria-label={t('reader.seamless')}>
      <audio ref={audioRef} src={url} preload="metadata" />
      <div className="p-times">
        <span>{title}</span>
        <span>{formatTime(time)} / {formatTime(duration)}</span>
      </div>
      <div
        ref={trackRef}
        className="p-track"
        role="slider"
        aria-label={t('reader.seamless')}
        aria-valuemin={0}
        aria-valuemax={Math.max(duration, 1)}
        aria-valuenow={time}
        tabIndex={0}
        onMouseDown={(e) => seek(e.clientX)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') seekFromKey(5)
          else if (e.key === 'ArrowLeft') seekFromKey(-5)
        }}
      >
        <div className="rail" aria-hidden="true" />
        <div className="fill" aria-hidden="true" style={{ width: `${progress}%` }} />
        <div className="thumb" aria-hidden="true" style={{ left: `${progress}%` }} />
      </div>
      <div className="p-row">
        <div className="p-info">
          <div className="t">{title}</div>
          <div className="m">
            {playing ? t('reader.playing') : t('reader.paused')} · {t('reader.seamless')}
          </div>
        </div>
        <div className="p-controls">
          <button type="button" className="c-btn play" onClick={toggle} aria-label={playing ? t('reader.pause') : t('reader.play')}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <a className="c-btn" href={downloadUrl} download aria-label={t('convert.download')}>
            <IconDownload />
          </a>
        </div>
      </div>
    </div>
  )
}
```

在 `SeamlessBar` 内补 `seekFromKey`：

```tsx
const seekFromKey = (delta: number) => {
  const el = audioRef.current
  if (!el) return
  el.currentTime = Math.min(Math.max(el.currentTime + delta, 0), duration)
}
```

- 修改 `PlaybackBar` 组件签名与开头：

```tsx
export function PlaybackBar({ seamlessUrl, seamlessDownloadUrl }: { seamlessUrl?: string; seamlessDownloadUrl?: string }) {
  const { t } = useI18n()
  ...
  if (seamlessUrl && seamlessDownloadUrl) {
    return (
      <SeamlessBar
        url={seamlessUrl}
        downloadUrl={seamlessDownloadUrl}
        title={document?.title ?? ''}
      />
    )
  }
  if (total === 0) return null
  ...
}
```

- [ ] **Step 3: 验证 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/components/reader`
Expected: 通过（PlaybackBar 既有 4 个测试仍通过）

```bash
git add src/components/reader/ReaderLayout.tsx src/components/reader/PlaybackBar.tsx
git commit -m "feat(convert): reader seamless playback and toolbar conversion"
```

---

### Task 8: 消费记录描述映射

**Files:**
- Modify: `src/app/transactions/page.tsx`

- [ ] **Step 1: 增加「完整转换」映射**

在 `txDescription` 的 `FIXED` 映射表中加一行：

```tsx
    '完整转换': 'transactions.fullConvert',
```

- [ ] **Step 2: 验证 + 提交**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无输出

```bash
git add src/app/transactions/page.tsx
git commit -m "feat(convert): map full-conversion transaction description"
```

---

### Task 9: 全量验证 + 数据库迁移 + 部署

**Files:** 无（验证与发布）

- [ ] **Step 1: 全量测试与类型检查**

Run: `npx vitest run`
Expected: 全部通过（既有 296 + 新增 ≈ 24 用例）

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无输出

Run: `npm run build`
Expected: 构建成功，新增 3 个 API 路由

- [ ] **Step 2: 执行数据库迁移**

在 Neon 数据库执行 `db/migrations/010_converted_audio.sql`（psql 或 Neon 控制台）。

- [ ] **Step 3: 提交并部署**

```bash
git add -A
git commit -m "feat(convert): full-document audio conversion"
git push origin master
vercel deploy --prod --yes
```

- [ ] **Step 4: 手动验证清单**

1. 文库 → 文档菜单「转成音频」→ 显示百分比 → 完成后 toast → 菜单出现「下载音频」。
2. 下载的 MP3 可播放、时长完整、无句间长停顿。
3. 阅读器打开已转换文档 → 底部变为整篇播放（无逐句按钮、有下载按钮）→ 可拖动进度。
4. 阅读器改音色/语速 → 自动回退逐句模式；重新转换后恢复无缝。
5. 未订阅账户点击转换 → 提示 Pro 专属。
6. 积分余额不足 → 提示积分不足且不创建任务。
7. 消费记录页显示「完整转换」扣费条目；失败时显示「完整转换失败退还积分」退款条目。

---

## Self-Review

**Spec coverage:**
- 数据模型（converted_audios 表）→ Task 1 ✅
- 配额统计（文档+音频）→ Task 1 Step 3 + Task 3 配额检查 ✅
- POST 创建/预扣积分/缓存命中 → Task 3 startConversion + Task 4 ✅
- GET 轮询推进（批处理）→ Task 3 advanceConversion + Task 4 ✅
- GET 音频流（Range + 下载）→ Task 4 ✅
- Pro 专属 → Task 4 403 ✅
- 文库入口/进度/下载 → Task 6 ✅
- 阅读器入口/无缝播放/设置回退 → Task 7 ✅
- 消费记录描述 → Task 8 ✅
- i18n → Task 5 ✅

**占位扫描：** 无 TBD/TODO；所有代码步骤含完整实现。

**类型一致性：** `ConvertStatus`、`ConvertedAudio`、`settingsMatch`、`convertRef` 在 Task 3/4 中签名一致；`appendConvertedAudio`/`failConverted`/`finishConverted` 参数与 Task 1 DB 层一致。
