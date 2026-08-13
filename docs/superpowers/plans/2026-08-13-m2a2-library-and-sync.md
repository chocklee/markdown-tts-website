# M2a-2 文件库与同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在账号系统（M2a-1）之上加入文件库：文档本地优先存储（IndexedDB）+ 登录后自动同步到云端 + 文件列表页 + 回收站（30 天）+ 存储配额（免费 50MB / 购买过积分 500MB）。

**Architecture:** 本地优先：所有读写走 IndexedDB（秒开、离线可用），`docId`（UUID）为文档唯一身份，标题可重命名。登录后后台同步：`GET /api/documents` 拉取云端全量 → 纯函数 `computeSyncPlan` 计算上传/下载清单 → `PUT /api/documents/[docId]` 乐观更新（服务端按 `updated_at` 比较，旧的不覆盖，返回 409 冲突让客户端拉回）→ 配额在服务端 upsert 前校验（超限 413）。删除/恢复都只是带 `deletedAt` 字段的普通更新，传播到两端；到期清理走 Vercel Cron + 列表接口惰性清理。

**Tech Stack:** Next.js 15.3 + React 19 + TypeScript、IndexedDB（自研小封装）、pg（Neon）、Auth.js v5 会话、Vitest 3 + fake-indexeddb、Vercel Cron

**前置依赖：** 已完成 M2a-1（认证系统）全部任务，`npm run db:migrate` 已应用 `001_auth.sql`。

---

### Task 1: 文档类型与 IndexedDB 本地库（TDD）

**Files:**
- Create: `src/types/document.ts`
- Create: `src/lib/storage/library.ts`
- Test: `src/lib/storage/__tests__/library.test.ts`
- Modify: `src/test/setup.ts`

- [x] **Step 1: 在 `src/test/setup.ts` 顶部加入 fake-indexeddb**

```ts
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
```

- [x] **Step 2: 写失败测试 `src/lib/storage/__tests__/library.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { listDocuments, getDocument, putDocument, deleteDocument } from '../library'
import type { LibraryDocument } from '@/types/document'

function makeDoc(docId: string, title = '标题'): LibraryDocument {
  return {
    docId,
    title,
    content: '# 内容',
    contentHash: 'abc123',
    fileSizeBytes: 10,
    updatedAt: 1000,
    deletedAt: null,
    deleteExpiresAt: null,
    dirty: false,
  }
}

describe('IndexedDB 文档库', () => {
  beforeEach(async () => {
    for (const doc of await listDocuments()) {
      await deleteDocument(doc.docId)
    }
  })

  it('保存后可列出并读取', async () => {
    await putDocument(makeDoc('d1'))
    const all = await listDocuments()
    expect(all.map((d) => d.docId)).toEqual(['d1'])
    expect((await getDocument('d1'))?.title).toBe('标题')
  })

  it('覆盖保存同 docId 文档', async () => {
    await putDocument(makeDoc('d1'))
    await putDocument({ ...makeDoc('d1'), title: '新标题' })
    expect((await getDocument('d1'))?.title).toBe('新标题')
    expect((await listDocuments()).length).toBe(1)
  })

  it('删除后不可读', async () => {
    await putDocument(makeDoc('d1'))
    await deleteDocument('d1')
    expect(await getDocument('d1')).toBeNull()
    expect((await listDocuments()).length).toBe(0)
  })

  it('不存在的文档返回 null', async () => {
    expect(await getDocument('missing')).toBeNull()
  })
})
```

- [x] **Step 3: 运行确认失败**

Run: `npx vitest run src/lib/storage/__tests__/library.test.ts`
Expected: FAIL（`@/types/document` / `../library` 不存在）

- [x] **Step 4: 创建 `src/types/document.ts`**

```ts
export interface SyncedDocument {
  docId: string
  title: string
  content: string
  contentHash: string
  fileSizeBytes: number
  updatedAt: number
  deletedAt: number | null
  deleteExpiresAt: number | null
}

export interface LibraryDocument extends SyncedDocument {
  dirty: boolean
}

export function contentHashOf(content: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
```

- [x] **Step 5: 创建 `src/lib/storage/library.ts`**

```ts
import type { LibraryDocument } from '@/types/document'

const DB_NAME = 'mtts-library'
const STORE = 'docs'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'docId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function listDocuments(): Promise<LibraryDocument[]> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).getAll() as IDBRequest<LibraryDocument[]>
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getDocument(docId: string): Promise<LibraryDocument | null> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).get(docId) as IDBRequest<LibraryDocument | undefined>
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

export async function putDocument(doc: LibraryDocument): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(doc)
  return txDone(tx)
}

export async function deleteDocument(docId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(docId)
  return txDone(tx)
}
```

- [x] **Step 6: 运行确认通过**

Run: `npx vitest run src/lib/storage/__tests__/library.test.ts`
Expected: 4 个用例 PASS

- [x] **Step 7: 提交**

```bash
git add src/types/document.ts src/lib/storage/library.ts src/lib/storage/__tests__/library.test.ts src/test/setup.ts
git commit -m "feat(library): add IndexedDB document store"
```

---

### Task 2: 文档操作层（创建/保存/重命名/删除/恢复/迁移）

**Files:**
- Create: `src/lib/library/actions.ts`
- Test: `src/lib/library/__tests__/actions.test.ts`
- Modify: `src/lib/storage/local.ts`

^- [x] **Step 1: 写失败测试 `src/lib/library/__tests__/actions.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createLibraryDocument,
  saveDocumentToLibrary,
  renameDocument,
  softDeleteDocument,
  restoreDocument,
  removeDocumentLocally,
  migrateLegacyDocument,
  activeBytes,
} from '../actions'
import { listDocuments, getDocument, deleteDocument } from '@/lib/storage/library'

describe('文档操作层', () => {
  beforeEach(async () => {
    for (const doc of await listDocuments()) {
      await deleteDocument(doc.docId)
    }
    localStorage.clear()
  })

  it('创建文档：生成 docId、哈希与大小', async () => {
    const doc = createLibraryDocument({ title: '我的文章', content: '你好世界' })
    expect(doc.docId).toBeTruthy()
    expect(doc.contentHash).toBeTruthy()
    expect(doc.fileSizeBytes).toBeGreaterThan(0)
    expect(doc.dirty).toBe(true)
    expect(doc.deletedAt).toBeNull()
  })

  it('保存新文档并允许再次保存覆盖', async () => {
    const first = await saveDocumentToLibrary({ title: 't', content: '内容一' })
    const second = await saveDocumentToLibrary({ docId: first.docId, title: 't2', content: '内容二' })
    expect(second.docId).toBe(first.docId)
    expect(second.title).toBe('t2')
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt)
    expect((await listDocuments()).length).toBe(1)
  })

  it('重命名不改变 docId 与内容', async () => {
    const doc = await saveDocumentToLibrary({ title: '旧名', content: '内容' })
    await renameDocument(doc.docId, '新名')
    const after = await getDocument(doc.docId)
    expect(after?.title).toBe('新名')
    expect(after?.content).toBe('内容')
  })

  it('软删除设置 deletedAt 与到期时间，恢复后清空', async () => {
    const doc = await saveDocumentToLibrary({ title: 't', content: 'c' })
    await softDeleteDocument(doc.docId)
    let after = await getDocument(doc.docId)
    expect(after?.deletedAt).not.toBeNull()
    expect(after?.deleteExpiresAt).not.toBeNull()
    await restoreDocument(doc.docId)
    after = await getDocument(doc.docId)
    expect(after?.deletedAt).toBeNull()
    expect(after?.deleteExpiresAt).toBeNull()
  })

  it('彻底删除后不可读', async () => {
    const doc = await saveDocumentToLibrary({ title: 't', content: 'c' })
    await removeDocumentLocally(doc.docId)
    expect(await getDocument(doc.docId)).toBeNull()
  })

  it('迁移 M1 遗留 localStorage 单文档', async () => {
    localStorage.setItem('mtts:doc', JSON.stringify({ id: 'legacy-1', title: '旧文', content: '# 旧内容', savedAt: Date.now() }))
    const migrated = await migrateLegacyDocument()
    expect(migrated?.docId).toBe('legacy-1')
    expect(migrated?.dirty).toBe(true)
    expect((await listDocuments()).length).toBe(1)
    // 二次迁移不重复导入
    expect(await migrateLegacyDocument()).toBeNull()
    expect((await listDocuments()).length).toBe(1)
  })

  it('无遗留文档时迁移返回 null', async () => {
    expect(await migrateLegacyDocument()).toBeNull()
  })

  it('activeBytes 只累计未删除文档', () => {
    const docs = [
      { deletedAt: null as number | null, fileSizeBytes: 10 },
      { deletedAt: 5, fileSizeBytes: 20 },
    ]
    expect(activeBytes(docs)).toBe(10)
  })
})
```

^- [x] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/library/__tests__/actions.test.ts`
Expected: FAIL（模块不存在）

^- [x] **Step 3: 修改 `src/lib/storage/local.ts`（保留位置记忆，单文档读写改为迁移专用）**

```ts
export interface LegacyStoredDocument {
  id: string
  title: string
  content: string
  savedAt: number
}

const LEGACY_DOC_KEY = 'mtts:doc'
const POS_KEY = 'mtts:pos'

export function loadLegacyDocument(): LegacyStoredDocument | null {
  const raw = localStorage.getItem(LEGACY_DOC_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LegacyStoredDocument>
    if (typeof parsed.id !== 'string' || typeof parsed.title !== 'string' || typeof parsed.content !== 'string') {
      return null
    }
    return parsed as LegacyStoredDocument
  } catch {
    return null
  }
}

export function savePosition(docId: string, sentenceId: string): void {
  localStorage.setItem(POS_KEY, JSON.stringify({ docId, sentenceId }))
}

export function loadPosition(docId: string): string | null {
  const raw = localStorage.getItem(POS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { docId: string; sentenceId: string }
    return parsed.docId === docId ? parsed.sentenceId : null
  } catch {
    return null
  }
}

export function clearPosition(): void {
  localStorage.removeItem(POS_KEY)
}
```

^- [x] **Step 4: 更新 `src/lib/storage/__tests__/local.test.ts`（移除旧单文档读写用例）**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadLegacyDocument, savePosition, loadPosition, clearPosition } from '../local'

const legacy = { id: 'doc-1', title: '测试', content: '# 你好', savedAt: Date.now() }

describe('loadLegacyDocument', () => {
  beforeEach(() => localStorage.clear())

  it('无旧文档时返回 null', () => {
    expect(loadLegacyDocument()).toBeNull()
  })

  it('读取 M1 遗留单文档', () => {
    localStorage.setItem('mtts:doc', JSON.stringify(legacy))
    expect(loadLegacyDocument()).toEqual(legacy)
  })

  it('损坏数据返回 null', () => {
    localStorage.setItem('mtts:doc', 'not-json')
    expect(loadLegacyDocument()).toBeNull()
  })
})

describe('位置记忆', () => {
  beforeEach(() => localStorage.clear())

  it('保存并读取位置', () => {
    savePosition('d1', 's5')
    expect(loadPosition('d1')).toBe('s5')
  })

  it('其他文档的位置不串用', () => {
    savePosition('d1', 's5')
    expect(loadPosition('d2')).toBeNull()
  })

  it('清除位置', () => {
    savePosition('d1', 's5')
    clearPosition()
    expect(loadPosition('d1')).toBeNull()
  })
})
```

^- [x] **Step 5: 实现 `src/lib/library/actions.ts`**

```ts
import type { LibraryDocument } from '@/types/document'
import { contentHashOf } from '@/types/document'
import { getDocument, putDocument, deleteDocument } from '@/lib/storage/library'
import { loadLegacyDocument } from '@/lib/storage/local'
import { CONFIG } from '@/lib/config'

export function newDocId(): string {
  return crypto.randomUUID()
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

export function createLibraryDocument(input: { docId?: string; title: string; content: string }): LibraryDocument {
  const now = Date.now()
  return {
    docId: input.docId ?? newDocId(),
    title: input.title.trim() || '未命名文档',
    content: input.content,
    contentHash: contentHashOf(input.content),
    fileSizeBytes: byteLength(input.content),
    updatedAt: now,
    deletedAt: null,
    deleteExpiresAt: null,
    dirty: true,
  }
}

export async function saveDocumentToLibrary(input: { docId?: string; title: string; content: string }): Promise<LibraryDocument> {
  const existing = input.docId ? await getDocument(input.docId) : null
  const doc: LibraryDocument = existing
    ? {
        ...existing,
        title: input.title.trim() || existing.title,
        content: input.content,
        contentHash: contentHashOf(input.content),
        fileSizeBytes: byteLength(input.content),
        updatedAt: Date.now(),
        dirty: true,
      }
    : createLibraryDocument(input)
  await putDocument(doc)
  return doc
}

export async function renameDocument(docId: string, title: string): Promise<void> {
  const doc = await getDocument(docId)
  if (!doc) return
  await putDocument({
    ...doc,
    title: title.trim() || doc.title,
    updatedAt: Date.now(),
    dirty: true,
  })
}

export async function softDeleteDocument(docId: string): Promise<void> {
  const doc = await getDocument(docId)
  if (!doc || doc.deletedAt) return
  const now = Date.now()
  await putDocument({
    ...doc,
    deletedAt: now,
    deleteExpiresAt: now + CONFIG.recycle.retentionDays * 24 * 60 * 60 * 1000,
    updatedAt: now,
    dirty: true,
  })
}

export async function restoreDocument(docId: string): Promise<void> {
  const doc = await getDocument(docId)
  if (!doc) return
  await putDocument({
    ...doc,
    deletedAt: null,
    deleteExpiresAt: null,
    updatedAt: Date.now(),
    dirty: true,
  })
}

export async function removeDocumentLocally(docId: string): Promise<void> {
  await deleteDocument(docId)
}

export async function migrateLegacyDocument(): Promise<LibraryDocument | null> {
  const legacy = loadLegacyDocument()
  if (!legacy) return null
  if (await getDocument(legacy.id)) return null
  const doc = createLibraryDocument({ docId: legacy.id, title: legacy.title, content: legacy.content })
  await putDocument(doc)
  return doc
}

export function activeBytes(docs: Pick<LibraryDocument, 'deletedAt' | 'fileSizeBytes'>[]): number {
  return docs.reduce((sum, d) => (d.deletedAt ? sum : sum + d.fileSizeBytes), 0)
}
```

^- [x] **Step 6: 运行全部测试确认通过**

Run: `npm run test`
Expected: 通过（原 82 个用例中 local.test.ts 已更新；新增 actions/library 用例）

^- [x] **Step 7: 提交**

```bash
git add src/lib/library/actions.ts src/lib/library/__tests__/actions.test.ts src/lib/storage/local.ts src/lib/storage/__tests__/local.test.ts
git commit -m "feat(library): add document operations and legacy migration"
```

---

### Task 3: documents 表迁移与服务端存取模块

**Files:**
- Create: `db/migrations/005_documents.sql`
- Create: `src/lib/db/documents.ts`
- Test: `src/lib/db/__tests__/documents.test.ts`

^- [x] **Step 1: 创建 `db/migrations/005_documents.sql`**

```sql
CREATE TABLE IF NOT EXISTS "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "doc_id" uuid NOT NULL,
  "title" text NOT NULL,
  "content_md" text NOT NULL,
  "content_hash" text NOT NULL,
  "file_size_bytes" integer NOT NULL,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint,
  "delete_expires_at" bigint,
  "created_at" bigint NOT NULL,
  UNIQUE ("user_id", "doc_id")
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents ("user_id");
CREATE INDEX IF NOT EXISTS idx_documents_expiry ON documents ("delete_expires_at") WHERE "delete_expires_at" IS NOT NULL;
```

执行 `npm run db:migrate`，预期输出 `applied 005_documents.sql`。

^- [x] **Step 2: 写配额纯函数失败测试 `src/lib/db/__tests__/documents.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { exceedsQuota } from '../documents'
import type { SyncedDocument } from '@/types/document'

const active = (overrides: Partial<SyncedDocument> = {}): SyncedDocument => ({
  docId: 'd1',
  title: 't',
  content: 'c',
  contentHash: 'h',
  fileSizeBytes: 100,
  updatedAt: 1,
  deletedAt: null,
  deleteExpiresAt: null,
  ...overrides,
})

describe('exceedsQuota', () => {
  it('活跃文档超过配额时返回 true', () => {
    expect(exceedsQuota(90, active({ fileSizeBytes: 20 }), 100)).toBe(true)
  })

  it('刚好等于配额时放行', () => {
    expect(exceedsQuota(80, active({ fileSizeBytes: 20 }), 100)).toBe(false)
  })

  it('已删除文档不占配额', () => {
    expect(exceedsQuota(100, active({ deletedAt: 1, deleteExpiresAt: 2 }), 100)).toBe(false)
  })
})
```

^- [x] **Step 3: 运行确认失败**

Run: `npx vitest run src/lib/db/__tests__/documents.test.ts`
Expected: FAIL（`../documents` 不存在）

^- [x] **Step 4: 实现 `src/lib/db/documents.ts`**

```ts
import { pool } from '@/lib/db/pool'
import type { SyncedDocument } from '@/types/document'

export function exceedsQuota(usedBytes: number, incoming: SyncedDocument, quotaBytes: number): boolean {
  return incoming.deletedAt === null && usedBytes + incoming.fileSizeBytes > quotaBytes
}

interface DocumentRow {
  doc_id: string
  title: string
  content_md: string
  content_hash: string
  file_size_bytes: string
  updated_at: string
  deleted_at: string | null
  delete_expires_at: string | null
}

function rowToSyncedDocument(row: DocumentRow): SyncedDocument {
  return {
    docId: row.doc_id,
    title: row.title,
    content: row.content_md,
    contentHash: row.content_hash,
    fileSizeBytes: Number(row.file_size_bytes),
    updatedAt: Number(row.updated_at),
    deletedAt: row.deleted_at === null ? null : Number(row.deleted_at),
    deleteExpiresAt: row.delete_expires_at === null ? null : Number(row.delete_expires_at),
  }
}

export async function getUserQuotaBytes(userId: string): Promise<number> {
  const { rows } = await pool.query<{ storage_quota_bytes: string }>(
    'SELECT storage_quota_bytes FROM users WHERE id = $1',
    [userId],
  )
  return Number(rows[0]?.storage_quota_bytes ?? 0)
}

export async function listServerDocuments(userId: string): Promise<SyncedDocument[]> {
  // 惰性清理过期回收站
  await pool.query(
    'DELETE FROM documents WHERE user_id = $1 AND delete_expires_at IS NOT NULL AND delete_expires_at < $2',
    [userId, Date.now()],
  )
  const { rows } = await pool.query<DocumentRow>(
    `SELECT doc_id, title, content_md, content_hash, file_size_bytes, updated_at, deleted_at, delete_expires_at
     FROM documents WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  )
  return rows.map(rowToSyncedDocument)
}

export async function getServerDocument(userId: string, docId: string): Promise<SyncedDocument | null> {
  const { rows } = await pool.query<DocumentRow>(
    `SELECT doc_id, title, content_md, content_hash, file_size_bytes, updated_at, deleted_at, delete_expires_at
     FROM documents WHERE user_id = $1 AND doc_id = $2`,
    [userId, docId],
  )
  return rows[0] ? rowToSyncedDocument(rows[0]) : null
}

export type UpsertResult =
  | { status: 'ok' }
  | { status: 'conflict'; server: SyncedDocument }
  | { status: 'quota-exceeded' }

export async function upsertServerDocument(userId: string, doc: SyncedDocument): Promise<UpsertResult> {
  const quotaBytes = await getUserQuotaBytes(userId)
  const { rows: usedRows } = await pool.query<{ used: string }>(
    `SELECT COALESCE(SUM(CASE WHEN deleted_at IS NULL AND doc_id <> $2 THEN file_size_bytes ELSE 0 END), 0) AS used
     FROM documents WHERE user_id = $1`,
    [userId, doc.docId],
  )
  const usedBytes = Number(usedRows[0]?.used ?? 0)
  if (exceedsQuota(usedBytes, doc, quotaBytes)) return { status: 'quota-exceeded' }

  const { rowCount } = await pool.query(
    `INSERT INTO documents (user_id, doc_id, title, content_md, content_hash, file_size_bytes, updated_at, deleted_at, delete_expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $7)
     ON CONFLICT (user_id, doc_id) DO UPDATE SET
       title = EXCLUDED.title,
       content_md = EXCLUDED.content_md,
       content_hash = EXCLUDED.content_hash,
       file_size_bytes = EXCLUDED.file_size_bytes,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at,
       delete_expires_at = EXCLUDED.delete_expires_at
     WHERE documents.updated_at <= EXCLUDED.updated_at`,
    [userId, doc.docId, doc.title, doc.content, doc.contentHash, doc.fileSizeBytes, doc.updatedAt, doc.deletedAt, doc.deleteExpiresAt],
  )
  if (!rowCount) {
    const current = await getServerDocument(userId, doc.docId)
    return current ? { status: 'conflict', server: current } : { status: 'ok' }
  }
  return { status: 'ok' }
}

export async function hardDeleteServerDocument(userId: string, docId: string): Promise<void> {
  await pool.query('DELETE FROM documents WHERE user_id = $1 AND doc_id = $2', [userId, docId])
}
```

^- [x] **Step 5: 运行确认通过**

Run: `npx vitest run src/lib/db/__tests__/documents.test.ts`
Expected: 3 个用例 PASS

^- [x] **Step 6: 提交**

```bash
git add db/migrations/005_documents.sql src/lib/db/documents.ts src/lib/db/__tests__/documents.test.ts
git commit -m "feat(library): add documents table and server access layer"
```

---

### Task 4: 文档 API 路由（GET 列表 / PUT 上传 / DELETE 彻底删除）

**Files:**
- Create: `src/app/api/documents/route.ts`
- Create: `src/app/api/documents/[docId]/route.ts`

^- [x] **Step 1: 创建 `src/app/api/documents/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { getUserQuotaBytes, listServerDocuments } from '@/lib/db/documents'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  const [docs, quotaBytes] = await Promise.all([
    listServerDocuments(session.user.id),
    getUserQuotaBytes(session.user.id),
  ])
  return NextResponse.json({ quotaBytes, docs })
}
```

^- [x] **Step 2: 创建 `src/app/api/documents/[docId]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { upsertServerDocument, hardDeleteServerDocument } from '@/lib/db/documents'
import type { SyncedDocument } from '@/types/document'

export const runtime = 'nodejs'

const MAX_CONTENT = 5 * 1024 * 1024

export async function PUT(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  const { docId } = await params

  let body: Partial<SyncedDocument>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  if (body.docId !== docId) {
    return NextResponse.json({ error: 'docId 不匹配' }, { status: 400 })
  }
  if (
    typeof body.title !== 'string' ||
    typeof body.content !== 'string' ||
    typeof body.contentHash !== 'string' ||
    typeof body.fileSizeBytes !== 'number' ||
    typeof body.updatedAt !== 'number'
  ) {
    return NextResponse.json({ error: '字段缺失' }, { status: 400 })
  }
  if (body.content.length > MAX_CONTENT) {
    return NextResponse.json({ error: '文件超过 5MB 上限' }, { status: 400 })
  }

  const result = await upsertServerDocument(session.user.id, {
    docId,
    title: body.title.slice(0, 200),
    content: body.content,
    contentHash: body.contentHash,
    fileSizeBytes: Math.floor(body.fileSizeBytes),
    updatedAt: Math.floor(body.updatedAt),
    deletedAt: body.deletedAt === null || typeof body.deletedAt === 'number' ? body.deletedAt : null,
    deleteExpiresAt:
      body.deleteExpiresAt === null || typeof body.deleteExpiresAt === 'number' ? body.deleteExpiresAt : null,
  })

  if (result.status === 'quota-exceeded') {
    return NextResponse.json({ error: '存储配额不足' }, { status: 413 })
  }
  if (result.status === 'conflict') {
    return NextResponse.json({ status: 'conflict', server: result.server }, { status: 409 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  const { docId } = await params
  await hardDeleteServerDocument(session.user.id, docId)
  return new NextResponse(null, { status: 204 })
}
```

^- [x] **Step 3: 手动验收（curl，需已登录 cookie）**

1. 运行 `npm run dev`，浏览器登录一个账号
2. 从浏览器 DevTools 复制 cookie，或先用 Playwright 登录后调用：

```bash
# 生成一个 docId（UUID）
node -e "console.log(crypto.randomUUID())"
# 上传一篇文档
curl -X PUT http://localhost:3000/api/documents/<uuid> \
  -H 'Content-Type: application/json' \
  -b <cookie> \
  -d '{"docId":"<uuid>","title":"测试","content":"# 你好","contentHash":"abc","fileSizeBytes":10,"updatedAt":1700000000000,"deletedAt":null,"deleteExpiresAt":null}'
# 预期 {"ok":true}；再次 PUT 更旧的 updatedAt 应返回 409 conflict
# 列出
curl http://localhost:3000/api/documents -b <cookie>
# 彻底删除
curl -X DELETE http://localhost:3000/api/documents/<uuid> -b <cookie>
```

^- [x] **Step 4: 提交**

```bash
git add src/app/api/documents/route.ts src/app/api/documents/[docId]/route.ts
git commit -m "feat(library): add documents api routes"
```

---

### Task 5: 同步引擎（TDD）

**Files:**
- Create: `src/lib/sync/engine.ts`
- Test: `src/lib/sync/__tests__/engine.test.ts`

^- [x] **Step 1: 写失败测试 `src/lib/sync/__tests__/engine.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { computeSyncPlan } from '../engine'
import type { LibraryDocument, SyncedDocument } from '@/types/document'

function localDoc(docId: string, updatedAt: number, overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    docId,
    title: 't',
    content: 'c',
    contentHash: 'h',
    fileSizeBytes: 1,
    updatedAt,
    deletedAt: null,
    deleteExpiresAt: null,
    dirty: false,
    ...overrides,
  }
}

function remoteDoc(docId: string, updatedAt: number, overrides: Partial<SyncedDocument> = {}): SyncedDocument {
  return {
    docId,
    title: 't',
    content: 'c',
    contentHash: 'h',
    fileSizeBytes: 1,
    updatedAt,
    deletedAt: null,
    deleteExpiresAt: null,
    ...overrides,
  }
}

describe('computeSyncPlan', () => {
  it('本地有而云端没有 → 上传', () => {
    const plan = computeSyncPlan([localDoc('a', 100)], [])
    expect(plan.uploads.map((d) => d.docId)).toEqual(['a'])
    expect(plan.downloads).toEqual([])
  })

  it('云端有而本地没有 → 下载', () => {
    const plan = computeSyncPlan([], [remoteDoc('b', 200)])
    expect(plan.downloads.map((d) => d.docId)).toEqual(['b'])
    expect(plan.uploads).toEqual([])
  })

  it('本地更新（updatedAt 更大）→ 上传', () => {
    const plan = computeSyncPlan([localDoc('a', 300)], [remoteDoc('a', 200)])
    expect(plan.uploads.map((d) => d.docId)).toEqual(['a'])
    expect(plan.downloads).toEqual([])
  })

  it('云端更新（updatedAt 更大）→ 下载', () => {
    const plan = computeSyncPlan([localDoc('a', 200)], [remoteDoc('a', 300)])
    expect(plan.downloads.map((d) => d.docId)).toEqual(['a'])
    expect(plan.uploads).toEqual([])
  })

  it('两端相同 → 无操作', () => {
    const plan = computeSyncPlan([localDoc('a', 300)], [remoteDoc('a', 300)])
    expect(plan.uploads).toEqual([])
    expect(plan.downloads).toEqual([])
  })

  it('本地 dirty 即使时间相同也强制上传', () => {
    const plan = computeSyncPlan([localDoc('a', 300, { dirty: true })], [remoteDoc('a', 300)])
    expect(plan.uploads.map((d) => d.docId)).toEqual(['a'])
  })

  it('云端删除状态（deletedAt）随下载传播', () => {
    const plan = computeSyncPlan([localDoc('a', 200)], [remoteDoc('a', 300, { deletedAt: 300, deleteExpiresAt: 300 + 30 * 86400000 })])
    expect(plan.downloads[0].deletedAt).toBe(300)
  })
})
```

^- [x] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/sync/__tests__/engine.test.ts`
Expected: FAIL（`../engine` 不存在）

^- [x] **Step 3: 实现 `src/lib/sync/engine.ts`**

```ts
import type { LibraryDocument, SyncedDocument } from '@/types/document'

export interface SyncPlan {
  uploads: LibraryDocument[]
  downloads: SyncedDocument[]
}

export function computeSyncPlan(local: LibraryDocument[], remote: SyncedDocument[]): SyncPlan {
  const remoteByDocId = new Map(remote.map((d) => [d.docId, d]))
  const uploads: LibraryDocument[] = []
  const downloads: SyncedDocument[] = []
  const localDocIds = new Set<string>()

  for (const localDoc of local) {
    localDocIds.add(localDoc.docId)
    const remoteDoc = remoteByDocId.get(localDoc.docId)
    if (!remoteDoc) {
      uploads.push(localDoc)
      continue
    }
    if (localDoc.dirty || localDoc.updatedAt > remoteDoc.updatedAt) {
      uploads.push(localDoc)
    } else if (remoteDoc.updatedAt > localDoc.updatedAt) {
      downloads.push(remoteDoc)
    }
  }

  for (const remoteDoc of remote) {
    if (!localDocIds.has(remoteDoc.docId)) {
      downloads.push(remoteDoc)
    }
  }

  return { uploads, downloads }
}
```

^- [x] **Step 4: 运行确认通过**

Run: `npx vitest run src/lib/sync/__tests__/engine.test.ts`
Expected: 7 个用例 PASS

^- [x] **Step 5: 提交**

```bash
git add src/lib/sync/engine.ts src/lib/sync/__tests__/engine.test.ts
git commit -m "feat(library): add sync plan engine"
```

---

### Task 6: 同步运行器与调度（客户端）

**Files:**
- Create: `src/lib/sync/manager.ts`
- Create: `src/lib/sync/schedule.ts`

^- [x] **Step 1: 创建 `src/lib/sync/manager.ts`**

```ts
import type { LibraryDocument, SyncedDocument } from '@/types/document'
import { listDocuments, putDocument } from '@/lib/storage/library'
import { computeSyncPlan } from '@/lib/sync/engine'

export interface SyncResult {
  uploaded: number
  downloaded: number
  error: string | null
  quotaBytes: number | null
}

export async function runSync(): Promise<SyncResult> {
  const res = await fetch('/api/documents', { cache: 'no-store' })
  if (res.status === 401) {
    return { uploaded: 0, downloaded: 0, error: '登录状态失效，请重新登录', quotaBytes: null }
  }
  if (!res.ok) {
    return { uploaded: 0, downloaded: 0, error: '同步失败，请稍后重试', quotaBytes: null }
  }
  const data = (await res.json()) as { quotaBytes: number; docs: SyncedDocument[] }

  const local = await listDocuments()
  const plan = computeSyncPlan(local, data.docs)

  let uploaded = 0
  let downloaded = 0

  for (const doc of plan.uploads) {
    const putRes = await fetch(`/api/documents/${encodeURIComponent(doc.docId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    })
    if (putRes.status === 413) {
      return { uploaded, downloaded, error: '存储配额不足，本地仍可使用', quotaBytes: data.quotaBytes }
    }
    if (putRes.status === 409) {
      const body = (await putRes.json()) as { server: SyncedDocument }
      await putDocument({ ...body.server, dirty: false })
      downloaded += 1
      continue
    }
    if (!putRes.ok) continue
    await putDocument({ ...doc, dirty: false })
    uploaded += 1
  }

  for (const doc of plan.downloads) {
    await putDocument({ ...doc, dirty: false })
    downloaded += 1
  }

  return { uploaded, downloaded, error: null, quotaBytes: data.quotaBytes }
}
```

^- [x] **Step 2: 创建 `src/lib/sync/schedule.ts`**

```ts
let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let pending = false

export function scheduleSync(delayMs = 2000): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushSync(), delayMs)
}

async function flushSync(): Promise<void> {
  if (running) {
    pending = true
    return
  }
  running = true
  try {
    await runSync()
  } catch {
    // 网络/登录错误静默，等待下次触发
  } finally {
    running = false
    if (pending) {
      pending = false
      scheduleSync(0)
    }
  }
}
```

^- [x] **Step 3: 提交**

```bash
git add src/lib/sync/manager.ts src/lib/sync/schedule.ts
git commit -m "feat(library): add sync runner and scheduler"
```

---

### Task 7: 首页保存改造 + 阅读器按 docId 打开 + 旧文档迁移

**Files:**
- Modify: `src/components/home/InputSection.tsx`
- Modify: `src/app/reader/page.tsx`
- Create: `src/components/reader/ReaderClient.tsx`

- [x] **Step 1: 重写 `src/components/home/InputSection.tsx`（保存到文件库并触发同步）**

```tsx
'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocument } from '@/lib/markdown/parse'
import { saveDocumentToLibrary } from '@/lib/library/actions'
import { scheduleSync } from '@/lib/sync/schedule'
import type { LibraryDocument } from '@/types/document'

const MAX_SIZE = 5 * 1024 * 1024

export default function InputSection() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileLabel, setFileLabel] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const readingFileRef = useRef<File | null>(null)

  function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    if (file.size > MAX_SIZE) {
      setError('文件超过 5MB 上限')
      return
    }
    if (!/\.md$/i.test(file.name) && file.type !== 'text/markdown' && file.type !== 'text/plain') {
      setError('请选择 Markdown 或文本文件')
      return
    }
    setFileName(file.name.replace(/\.[^.]*$/, ''))
    setFileLabel(file.name)
    setReading(true)
    readingFileRef.current = file
    const reader = new FileReader()
    reader.onload = () => {
      if (readingFileRef.current !== file) return
      setText(String(reader.result ?? ''))
      setReading(false)
    }
    reader.onerror = () => {
      if (readingFileRef.current !== file) return
      setError('文件读取失败')
      setReading(false)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function start() {
    if (reading) {
      setError('文件读取中，请稍候')
      return
    }
    const content = text.trim()
    if (!content) {
      setError('请粘贴内容或选择文件')
      return
    }
    if (content.length > MAX_SIZE) {
      setError('内容超过 5MB 上限')
      return
    }
    const doc = parseDocument(content, fileName || '未命名文档')
    let stored: LibraryDocument
    try {
      stored = await saveDocumentToLibrary({ title: doc.title, content })
    } catch {
      setError('保存失败，内容过大')
      return
    }
    scheduleSync()
    router.push(`/reader?docId=${encodeURIComponent(stored.docId)}`)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-center text-3xl font-bold">听 Markdown</h1>
      <p className="mt-2 text-center text-slate-500">粘贴或上传 Markdown 文件，边看边听 AI 朗读</p>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <textarea
          aria-label="Markdown 内容"
          className="min-h-64 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
          placeholder="在这里粘贴 Markdown 内容，或点击下方按钮上传 .md 文件（≤5MB）"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            onClick={() => {
              if (fileRef.current) fileRef.current.value = ''
              fileRef.current?.click()
            }}
          >
            上传 .md 文件
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={reading}
            onClick={() => void start()}
          >
            开始收听
          </button>
        </div>
        {fileLabel && <p className="mt-2 text-xs text-slate-400">文件：{fileLabel}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
```

- [x] **Step 2: 创建 `src/components/reader/ReaderClient.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocument } from '@/lib/markdown/parse'
import { getDocument } from '@/lib/storage/library'
import { migrateLegacyDocument } from '@/lib/library/actions'
import { loadPosition, savePosition } from '@/lib/storage/local'
import { useReaderStore } from '@/lib/state/readerStore'
import { ReaderLayout } from '@/components/reader/ReaderLayout'
import type { ReaderDocument } from '@/types/reader'
import type { LibraryDocument } from '@/types/document'

export function ReaderClient({ docId }: { docId: string | null }) {
  const router = useRouter()
  const [stored, setStored] = useState<LibraryDocument | null>(null)
  const [doc, setDoc] = useState<ReaderDocument | null>(null)
  const init = useReaderStore((s) => s.init)
  const document = useReaderStore((s) => s.document)

  useEffect(() => {
    let cancelled = false
    async function load() {
      let found: LibraryDocument | null = null
      if (docId) found = await getDocument(docId)
      if (!found) {
        found = await migrateLegacyDocument()
        if (found && !cancelled) {
          router.replace(`/reader?docId=${encodeURIComponent(found.docId)}`)
        }
      }
      if (!found) {
        if (!cancelled) router.replace('/')
        return
      }
      if (!cancelled) {
        setStored(found)
        setDoc(parseDocument(found.content, found.title))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [docId, router])

  useEffect(() => {
    if (!stored || !doc || document?.id === doc.id) return
    init(doc)
    const position = loadPosition(stored.docId)
    if (position) {
      useReaderStore.getState().restoreIndex(position)
    }
  }, [stored, doc, document?.id, init])

  useEffect(() => {
    if (!stored) return
    const unsubscribe = useReaderStore.subscribe((state) => {
      const id = state.speakableIds[state.currentIndex]
      if (id) {
        try {
          savePosition(stored.docId, id)
        } catch {
          // 存储不可用（如私密模式）时静默忽略
        }
      }
    })
    return unsubscribe
  }, [stored])

  useEffect(() => {
    return () => {
      useReaderStore.getState().stop()
    }
  }, [])

  if (!doc) {
    return <div className="p-10 text-center text-slate-400">加载中…</div>
  }

  return <ReaderLayout document={doc} />
}
```

位置说明：阅读位置以文件库 `docId` 为 key 保存（与 M1 以内容哈希为 key 不同），重命名或内容变化后位置仍能对应到同一篇文档；句子 id 找不到时 `restoreIndex` 自动忽略。
- [x] **Step 3: 重写 `src/app/reader/page.tsx` 为服务端包装**

```tsx
import { ReaderClient } from '@/components/reader/ReaderClient'

export const dynamic = 'force-dynamic'

export default async function ReaderPage({
  searchParams,
}: {
  searchParams: Promise<{ docId?: string }>
}) {
  const { docId } = await searchParams
  return <ReaderClient docId={docId ?? null} />
}
```

- [x] **Step 4: 验证**

Run: `npm run test && npx tsc --noEmit`
Expected: 全部通过

手动：`npm run dev` 打开首页粘贴内容 → 开始收听 → 进入阅读器正常朗读；刷新 URL（带 docId）正常恢复；旧 localStorage 有 M1 文档时首次打开自动迁移。

- [x] **Step 5: 提交**

```bash
git add src/components/home/InputSection.tsx src/app/reader/page.tsx src/components/reader/ReaderClient.tsx
git commit -m "feat(library): save to library and open reader by docId"
```

---

### Task 8: 文件列表页（含配额显示、未登录提示）

**Files:**
- Create: `src/app/library/page.tsx`
- Modify: `src/components/layout/Header.tsx`

- [ ] **Step 1: 创建 `src/app/library/page.tsx`**

```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { listDocuments, getDocument } from '@/lib/storage/library'
import {
  renameDocument,
  softDeleteDocument,
  restoreDocument,
  removeDocumentLocally,
  activeBytes,
} from '@/lib/library/actions'
import { runSync } from '@/lib/sync/manager'
import { scheduleSync } from '@/lib/sync/schedule'
import type { LibraryDocument } from '@/types/document'

type Tab = 'docs' | 'trash'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function daysLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000))
}

export default function LibraryPage() {
  const { data: session, status } = useSession()
  const [docs, setDocs] = useState<LibraryDocument[]>([])
  const [tab, setTab] = useState<Tab>('docs')
  const [quota, setQuota] = useState<{ usedBytes: number; quotaBytes: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [notice, setNotice] = useState('')
  const [syncing, setSyncing] = useState(false)

  const refresh = useCallback(async () => {
    const all = await listDocuments()
    setDocs(all.sort((a, b) => b.updatedAt - a.updatedAt))
  }, [])

  const sync = useCallback(async () => {
    if (status !== 'authenticated') return
    setSyncing(true)
    try {
      const result = await runSync()
      if (result.error) setNotice(result.error)
      if (result.quotaBytes !== null) {
        const all = await listDocuments()
        setQuota({ usedBytes: activeBytes(all), quotaBytes: result.quotaBytes })
      }
      if (result.uploaded + result.downloaded > 0) {
        setNotice(`已同步：上传 ${result.uploaded} 篇，下载 ${result.downloaded} 篇`)
      }
    } finally {
      setSyncing(false)
      await refresh()
    }
  }, [status, refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (status !== 'authenticated') return
    void sync()
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void sync(), 60000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
    }
  }, [status, sync])

  async function startRename(docId: string) {
    const doc = await getDocument(docId)
    if (!doc) return
    setRenaming(docId)
    setRenameValue(doc.title)
  }

  async function confirmRename() {
    if (!renaming) return
    await renameDocument(renaming, renameValue)
    scheduleSync()
    setRenaming(null)
    await refresh()
  }

  async function remove(docId: string) {
    await softDeleteDocument(docId)
    scheduleSync()
    await refresh()
  }

  async function doRestore(docId: string) {
    await restoreDocument(docId)
    scheduleSync()
    await refresh()
  }

  async function doPurge(docId: string) {
    await removeDocumentLocally(docId)
    if (status === 'authenticated') {
      await fetch(`/api/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' }).catch(() => {})
    }
    await refresh()
  }

  const visible = docs.filter((d) => (tab === 'docs' ? !d.deletedAt : d.deletedAt))
  const usedBytes = quota?.usedBytes ?? activeBytes(docs)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">我的文档库</h1>
        <div className="flex items-center gap-3 text-sm">
          {status === 'authenticated' && quota && (
            <span className="text-slate-500">
              已用 {formatBytes(usedBytes)} / {formatBytes(quota.quotaBytes)}
            </span>
          )}
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setTab('docs')}
              className={`px-4 py-1.5 ${tab === 'docs' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}
            >
              文档
            </button>
            <button
              type="button"
              onClick={() => setTab('trash')}
              className={`px-4 py-1.5 ${tab === 'trash' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}
            >
              回收站
            </button>
          </div>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={syncing}
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
          >
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>
      </div>

      {status === 'unauthenticated' && (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          <Link href="/login" className="font-medium underline">
            登录
          </Link>
          后文档会自动同步到云端，跨设备可用。
        </p>
      )}

      {notice && <p className="mt-4 text-sm text-slate-500">{notice}</p>}

      {tab === 'trash' && visible.length === 0 && (
        <p className="mt-10 text-center text-slate-400">回收站是空的</p>
      )}
      {tab === 'docs' && visible.length === 0 && (
        <div className="mt-10 text-center">
          <p className="text-slate-400">还没有文档</p>
          <Link href="/" className="mt-3 inline-block text-blue-600">
            去粘贴 / 上传第一篇文档 →
          </Link>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {visible.map((doc) => (
          <li key={doc.docId} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
            {tab === 'docs' && renaming === doc.docId ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 p-1.5 text-sm outline-none focus:border-blue-400"
                  autoFocus
                />
                <button type="button" onClick={() => void confirmRename()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white">
                  保存
                </button>
                <button type="button" onClick={() => setRenaming(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                  取消
                </button>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <Link href={`/reader?docId=${encodeURIComponent(doc.docId)}`} className="block truncate font-medium text-slate-800 hover:text-blue-600">
                  {doc.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDate(doc.updatedAt)} · {formatBytes(doc.fileSizeBytes)}
                  {doc.deletedAt ? ` · 剩余 ${daysLeft(doc.deleteExpiresAt ?? doc.updatedAt)} 天` : ''}
                  {doc.dirty ? ' · 待同步' : ''}
                </p>
              </div>
            )}
            {tab === 'docs' ? (
              renaming !== doc.docId && (
                <div className="flex shrink-0 gap-2 text-sm">
                  <button type="button" onClick={() => void startRename(doc.docId)} className="text-slate-500 hover:text-slate-900">
                    重命名
                  </button>
                  <button type="button" onClick={() => void remove(doc.docId)} className="text-red-500 hover:text-red-700">
                    删除
                  </button>
                </div>
              )
            ) : (
              <div className="flex shrink-0 gap-2 text-sm">
                <button type="button" onClick={() => void doRestore(doc.docId)} className="text-blue-600 hover:text-blue-800">
                  恢复
                </button>
                <button type="button" onClick={() => void doPurge(doc.docId)} className="text-red-500 hover:text-red-700">
                  彻底删除
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 2: 修改 `src/components/layout/Header.tsx` 加入文档库入口**

在 `nav` 的登录/退出按钮之前加：

```tsx
<Link href="/library" className="text-slate-600 hover:text-slate-900">
  文档库
</Link>
```

- [ ] **Step 3: 验证**

Run: `npm run test && npx tsc --noEmit && npm run lint`
Expected: 通过

手动：未登录访问 `/library` 显示本机文档 + 登录提示；登录后自动同步，配额显示；重命名/删除即时生效。

- [ ] **Step 4: 提交**

```bash
git add src/app/library/page.tsx src/components/layout/Header.tsx
git commit -m "feat(library): add library page with quota and actions"
```

---

### Task 9: 回收站到期清理（Vercel Cron + 惰性清理）

**Files:**
- Create: `src/app/api/cron/cleanup-trash/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: 创建 `src/app/api/cron/cleanup-trash/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { rowCount } = await pool.query(
    'DELETE FROM documents WHERE delete_expires_at IS NOT NULL AND delete_expires_at < $1',
    [Date.now()],
  )
  return NextResponse.json({ ok: true, deleted: rowCount ?? 0 })
}
```

- [ ] **Step 2: 创建 `vercel.json`**

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-trash",
      "schedule": "0 3 * * *"
    }
  ]
}
```

- [ ] **Step 3: 设置环境变量**

在 Vercel 项目设置中加入 `CRON_SECRET`（`openssl rand -base64 32`），Vercel 会自动以 `Authorization: Bearer <CRON_SECRET>` 调用 cron。

- [ ] **Step 4: 提交**

```bash
git add src/app/api/cron/cleanup-trash/route.ts vercel.json
git commit -m "feat(library): add trash cleanup cron"
```

---

### Task 10: 登录跳转收尾 + 全量验证

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: 登录成功与 Google 回跳改为文档库**

`src/app/login/page.tsx`：

```tsx
router.push('/library')
router.refresh()
```

```tsx
onClick={() => void signIn('google', { callbackUrl: '/library' })}
```

- [ ] **Step 2: 自动化检查**

Run: `npm run test && npx tsc --noEmit && npm run lint && npm run build`
Expected: 全部通过

- [ ] **Step 3: 端到端验收（Playwright / 手动）**

1. 未登录：粘贴内容 → 朗读 → `/library` 显示本机文档 + 登录提示
2. 登录后：`/library` 自动同步，本机文档上传到云端（数据库 `documents` 表可见）
3. 换设备/无痕窗口登录同一账号：文档自动下载出现（拉取）
4. 重命名文档 → 另一端名称同步更新且 docId 不变
5. 删除 → 进回收站（两端）→ 恢复 → 重新出现；彻底删除 → 两端消失
6. 超配额测试：临时把 `users.storage_quota_bytes` 改小（如 100）→ 上传大文档被拦截并提示
7. 回收站过期清理：临时把 `delete_expires_at` 改成过去时间 → 打开 `/library` 或调 cron 后云端该文档被清除

- [ ] **Step 4: 推送**

```bash
git push origin master
```

说明：M2a-2 完成后，M2a（账号 + 文件库）整体交付。后续 M2b（积分与支付）、M2c（云 AI 语音）、M2d（文档问答）各自走 spec → plan → 实现循环。

---

### Task 11: 安全加固（共享限流存储 + 过期 token 清理 + 认证 E2E）

> 来源：M2a-1 最终代码审查遗留项（Important: 内存限流在 Vercel serverless 下按实例生效，无法跨隔离聚合；Minor: `email_verifications`/`password_resets` 过期行无定期清理；建议：认证主流程固化为 Playwright 用例）。

**Files:**
- Create: `db/migrations/006_rate_limits.sql`
- Modify: `src/lib/security/rateLimit.ts`
- Test: `src/lib/security/__tests__/rateLimit.test.ts`（改写成纯函数 + DB 集成两条路径）
- Create: `e2e/auth.spec.ts`（Playwright，可选依赖）
- Create: `src/app/api/cron/cleanup/route.ts`（或并入 Task 9 的 cron）

- [ ] **Step 1: 创建 `db/migrations/006_rate_limits.sql`**

```sql
CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text PRIMARY KEY,
  "count" integer NOT NULL DEFAULT 1,
  "reset_at" bigint NOT NULL
);
```

- [ ] **Step 2: 改写 `src/lib/security/rateLimit.ts` 为 Postgres 存储**

保持 `isRateLimited(key, limit, windowMs)` 与 `clientIp(req)` 签名不变；内部用 `INSERT ... ON CONFLICT (key) DO UPDATE` 原子计数：

```sql
INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, $now+$window)
ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1
  WHERE rate_limits.reset_at > $now
RETURNING count, reset_at
```

`reset_at` 过期时（`WHERE` 不命中）改走 `UPDATE ... SET count = 1, reset_at = $now+$window`；返回 `count > limit`。查询失败时 fail-open（记日志并返回 false），避免限流器宕机导致整个认证不可用。窗口过期行由每次写入顺带删除（`DELETE FROM rate_limits WHERE reset_at <= $now`，抽样概率 1% 即可）。测试：`isRateLimited` 纯语义用内存 fake 保留，DB 集成测用真实 Neon 少量键验证原子性（复用现有手动验收约定）。

- [ ] **Step 3: 过期 token 清理**

把 `email_verifications`/`password_resets` 中 `expires_at < now()` 的行清理并入 Task 9 的回收站 cron（同一路由内多删一条），并加惰性清理：登录/注册时顺带删除该邮箱的过期行。

- [ ] **Step 4: 认证 E2E（Playwright）**

`e2e/auth.spec.ts`：注册→验证→登录→会话保持→退出；未验证登录被拒；忘记密码→重置→新密码登录；重置后旧会话失效。接真实 Neon（`DATABASE_URL`）跑，测试数据统一 `m2a-e2e-` 前缀并在 afterAll 清理。

- [ ] **Step 5: 提交**

```bash
git add db/migrations/006_rate_limits.sql src/lib/security/rateLimit.ts src/lib/security/__tests__/rateLimit.test.ts src/app/api/cron/cleanup/route.ts e2e/auth.spec.ts
git commit -m "feat(security): shared rate limit store and token cleanup"
```
