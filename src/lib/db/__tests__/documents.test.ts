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
