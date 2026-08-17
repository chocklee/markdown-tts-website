import { describe, expect, it, vi, beforeEach } from 'vitest'
import { startConversion, advanceConversion, getConvertStatus, convertRef, settingsMatch } from '../convertService'
import type { ConvertedAudio } from '@/lib/db/convert'
import type { SyncedDocument } from '@/types/document'

vi.mock('@/lib/db/convert', () => ({
  getConvertedMeta: vi.fn(),
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

import { getConvertedMeta, createConverted, appendConvertedAudio, finishConverted, failConverted, sumConvertedBytes } from '@/lib/db/convert'
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

function doneMeta(overrides: Partial<ConvertedAudio> = {}): ConvertedAudio {
  return {
    userId: 'u1', docId: 'doc-1', voice: 'alloy', rate: 1, skipCode: true, skipTable: true,
    chars: 8, sizeBytes: 100, status: 'done', progress: 1, chunksTotal: 2, chunksDone: 2,
    audio: null, contentType: 'audio/mpeg', error: null, updatedAt: 't',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(appendConvertedAudio).mockResolvedValue(true)
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
    expect(settingsMatch(doneMeta(), 'alloy', 1, true, true)).toBe(true)
    expect(settingsMatch(doneMeta(), 'alloy', 1.25, true, true)).toBe(false)
  })
})

describe('startConversion', () => {
  it('预扣积分并创建 pending 任务', async () => {
    vi.mocked(getServerDocument).mockResolvedValue(mockDoc)
    vi.mocked(getConvertedMeta).mockResolvedValue(null)
    vi.mocked(deductCredits).mockResolvedValue(true)
    const result = await startConversion('u1', 'doc-1', { voice: 'alloy', rate: 1, skipCode: true, skipTable: true })
    expect(result.creditsCharged).toBeGreaterThan(0)
    expect(deductCredits).toHaveBeenCalledWith('u1', result.creditsCharged, 'convert:doc-1:alloy:1:1:1', expect.anything(), '完整转换')
    expect(createConverted).toHaveBeenCalledWith('u1', 'doc-1', expect.objectContaining({ voice: 'alloy', chunksTotal: 1 }))
  })

  it('同设置已 done 不重复扣积分', async () => {
    vi.mocked(getServerDocument).mockResolvedValue(mockDoc)
    vi.mocked(getConvertedMeta).mockResolvedValue(doneMeta())
    const result = await startConversion('u1', 'doc-1', { voice: 'alloy', rate: 1, skipCode: true, skipTable: true })
    expect(result).toEqual({ alreadyDone: true, creditsCharged: 0 })
    expect(deductCredits).not.toHaveBeenCalled()
  })

  it('余额不足抛 INSUFFICIENT_CREDITS', async () => {
    vi.mocked(getServerDocument).mockResolvedValue(mockDoc)
    vi.mocked(getConvertedMeta).mockResolvedValue(null)
    vi.mocked(deductCredits).mockResolvedValue(false)
    await expect(startConversion('u1', 'doc-1', { voice: 'alloy', rate: 1, skipCode: true, skipTable: true })).rejects.toThrow('INSUFFICIENT_CREDITS')
  })

  it('无效音色回退到供应商第一个音色', async () => {
    vi.mocked(getServerDocument).mockResolvedValue(mockDoc)
    vi.mocked(getConvertedMeta).mockResolvedValue(null)
    vi.mocked(deductCredits).mockResolvedValue(true)
    await startConversion('u1', 'doc-1', { voice: 'browser', rate: 1, skipCode: true, skipTable: true })
    expect(createConverted).toHaveBeenCalledWith('u1', 'doc-1', expect.objectContaining({ voice: 'alloy' }))
  })
})

describe('advanceConversion', () => {
  it('每批只推进 4 块并追加音频', async () => {
    vi.mocked(getConvertedMeta)
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 0, chunksTotal: 8, audio: null, sizeBytes: 0 }))
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 4, chunksTotal: 8 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(appendConvertedAudio).toHaveBeenCalledTimes(1)
    const [u, d, audio, done, total, expected] = vi.mocked(appendConvertedAudio).mock.calls[0]
    expect(done).toBe(4)
    expect(total).toBe(8)
    expect(expected).toBe(0)
    expect((audio as Buffer).toString()).toContain('audio:')
    expect(finishConverted).not.toHaveBeenCalled()
    expect(status.status).toBe('converting')
  })

  it('并发轮询未抢到批时不 finish/fail/refund 并返回最新状态', async () => {
    vi.mocked(getConvertedMeta)
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 0, chunksTotal: 8, audio: null, sizeBytes: 0 }))
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 4, chunksTotal: 8, progress: 0.5, audio: null, sizeBytes: 40 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    vi.mocked(appendConvertedAudio).mockResolvedValue(false)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(appendConvertedAudio).toHaveBeenCalledTimes(1)
    expect(finishConverted).not.toHaveBeenCalled()
    expect(failConverted).not.toHaveBeenCalled()
    expect(refundCredits).not.toHaveBeenCalled()
    expect(status).toEqual(expect.objectContaining({ status: 'converting', sizeBytes: 40, progress: 0.5 }))
  })

  it('全部完成时 finish 并检查配额', async () => {
    vi.mocked(getConvertedMeta)
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 4, chunksTotal: 8, audio: null, sizeBytes: 50 }))
      .mockResolvedValueOnce(doneMeta({ status: 'done', chunksDone: 8, chunksTotal: 8 }))
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
    vi.mocked(getConvertedMeta)
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 4, chunksTotal: 8, audio: null, sizeBytes: 50 }))
      .mockResolvedValueOnce(doneMeta({ status: 'failed', error: 'QUOTA_EXCEEDED', chunksDone: 8, chunksTotal: 8, audio: null, sizeBytes: 0 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    vi.mocked(getUserQuotaBytes).mockResolvedValue(100)
    vi.mocked(sumServerDocumentBytes).mockResolvedValue(200)
    vi.mocked(sumConvertedBytes).mockResolvedValue(0)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(failConverted).toHaveBeenCalledWith('u1', 'doc-1', 'QUOTA_EXCEEDED')
    expect(refundCredits).toHaveBeenCalled()
    expect(status.status).toBe('failed')
  })

  it('配额检查包含刚完成音频（含 updated.sizeBytes 达标时 finish）', async () => {
    vi.mocked(getConvertedMeta)
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 4, chunksTotal: 8, audio: null, sizeBytes: 50 }))
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 8, chunksTotal: 8, audio: null, sizeBytes: 50 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    vi.mocked(getUserQuotaBytes).mockResolvedValue(250)
    vi.mocked(sumServerDocumentBytes).mockResolvedValue(100)
    vi.mocked(sumConvertedBytes).mockResolvedValue(100)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(finishConverted).toHaveBeenCalledWith('u1', 'doc-1')
    expect(failConverted).not.toHaveBeenCalled()
    expect(status.status).toBe('done')
  })

  it('配额检查包含刚完成音频（不含 updated.sizeBytes 会误判时失败并退款）', async () => {
    vi.mocked(getConvertedMeta)
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 4, chunksTotal: 8, audio: null, sizeBytes: 50 }))
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 8, chunksTotal: 8, audio: null, sizeBytes: 50 }))
    vi.mocked(getServerDocument).mockResolvedValue(mockDocMulti)
    vi.mocked(getUserQuotaBytes).mockResolvedValue(249)
    vi.mocked(sumServerDocumentBytes).mockResolvedValue(100)
    vi.mocked(sumConvertedBytes).mockResolvedValue(100)
    const status = await advanceConversion('u1', 'doc-1', 4)
    expect(failConverted).toHaveBeenCalledWith('u1', 'doc-1', 'QUOTA_EXCEEDED')
    expect(refundCredits).toHaveBeenCalled()
    expect(finishConverted).not.toHaveBeenCalled()
    expect(status.status).toBe('failed')
  })

  it('合成失败时失败并退款', async () => {
    vi.mocked(getConvertedMeta)
      .mockResolvedValueOnce(doneMeta({ status: 'converting', chunksDone: 0, chunksTotal: 8, audio: null, sizeBytes: 0 }))
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

  it('无转换记录抛 CONVERT_NOT_FOUND', async () => {
    vi.mocked(getConvertedMeta).mockResolvedValue(null)
    await expect(advanceConversion('u1', 'doc-1')).rejects.toThrow('CONVERT_NOT_FOUND')
  })

  it('文档不存在抛 DOC_NOT_FOUND', async () => {
    vi.mocked(getConvertedMeta).mockResolvedValue(doneMeta({ status: 'converting', chunksDone: 0, chunksTotal: 8, audio: null, sizeBytes: 0 }))
    vi.mocked(getServerDocument).mockResolvedValue(null)
    await expect(advanceConversion('u1', 'doc-1')).rejects.toThrow('DOC_NOT_FOUND')
  })
})

describe('getConvertStatus', () => {
  it('无记录返回 null', async () => {
    vi.mocked(getConvertedMeta).mockResolvedValue(null)
    expect(await getConvertStatus('u1', 'doc-1')).toBeNull()
  })
})
