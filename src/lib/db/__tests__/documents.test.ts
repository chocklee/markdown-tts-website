import { describe, it, expect, vi } from 'vitest'
import { pool } from '@/lib/db/pool'
import { exceedsQuota, listServerDocuments, hardDeleteServerDocument } from '../documents'
import type { SyncedDocument } from '@/types/document'

vi.mock('@/lib/db/pool', () => ({ pool: { connect: vi.fn(), query: vi.fn() } }))

function mockClient() {
  const client = { query: vi.fn(), release: vi.fn() }
  vi.mocked(client.query).mockResolvedValue({ rows: [], rowCount: 0 } as never)
  vi.mocked(pool.connect).mockResolvedValue(client as never)
  return client
}

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

describe('listServerDocuments 惰性清理', () => {
  it('事务内先删 converted_audios 再删 documents', async () => {
    const client = mockClient()
    vi.mocked(client.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 3 } as never) // DELETE converted_audios
      .mockResolvedValueOnce({ rows: [], rowCount: 2 } as never) // DELETE documents
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never) // 清理后的 SELECT
    await listServerDocuments('u1')
    const calls = vi.mocked(client.query).mock.calls as [string, unknown[]?][]
    expect(calls[0][0]).toBe('BEGIN')
    expect(calls[1][0]).toContain('DELETE FROM converted_audios')
    expect(calls[1][0]).toContain('doc_id IN')
    expect(calls[2][0]).toContain('DELETE FROM documents')
    expect(calls[3][0]).toBe('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('清理失败时 ROLLBACK', async () => {
    const client = mockClient()
    vi.mocked(client.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // BEGIN
      .mockRejectedValueOnce(new Error('boom')) // DELETE 失败
    await expect(listServerDocuments('u1')).rejects.toThrow('boom')
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})

describe('hardDeleteServerDocument', () => {
  it('事务内删除 documents 与 converted_audios', async () => {
    const client = mockClient()
    await hardDeleteServerDocument('u1', 'd1')
    const calls = vi.mocked(client.query).mock.calls as [string, unknown[]?][]
    expect(calls[0][0]).toBe('BEGIN')
    expect(calls[1][0]).toContain('DELETE FROM documents')
    expect(calls[1][1]).toEqual(['u1', 'd1'])
    expect(calls[2][0]).toContain('DELETE FROM converted_audios')
    expect(calls[3][0]).toBe('COMMIT')
    expect(client.release).toHaveBeenCalled()
  })

  it('删除失败时 ROLLBACK', async () => {
    const client = mockClient()
    vi.mocked(client.query)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // BEGIN
      .mockRejectedValueOnce(new Error('boom')) // DELETE 失败
    await expect(hardDeleteServerDocument('u1', 'd1')).rejects.toThrow('boom')
    expect(client.query).toHaveBeenCalledWith('ROLLBACK')
    expect(client.release).toHaveBeenCalled()
  })
})
