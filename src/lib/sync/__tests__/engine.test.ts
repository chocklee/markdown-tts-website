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

  it('本地删除（deletedAt 已设且 updatedAt 更大）→ 上传且 uploads[0].deletedAt 不为 null', () => {
    const plan = computeSyncPlan(
      [localDoc('a', 300, { deletedAt: 300, deleteExpiresAt: 3300000000000 })],
      [remoteDoc('a', 200)],
    )
    expect(plan.uploads.map((d) => d.docId)).toEqual(['a'])
    expect(plan.uploads[0].deletedAt).toBe(300)
  })

  it('两端都已删除且本地更新 → 上传最新删除状态', () => {
    const plan = computeSyncPlan(
      [localDoc('a', 300, { deletedAt: 300, deleteExpiresAt: 3300000000000 })],
      [remoteDoc('a', 200, { deletedAt: 200, deleteExpiresAt: 3200000000000 })],
    )
    expect(plan.uploads.map((d) => d.docId)).toEqual(['a'])
    expect(plan.uploads[0].deletedAt).toBe(300)
  })

  it('两端删除时间相同 → 无操作', () => {
    const plan = computeSyncPlan(
      [localDoc('a', 300, { deletedAt: 300, deleteExpiresAt: 3300000000000 })],
      [remoteDoc('a', 300, { deletedAt: 300, deleteExpiresAt: 3300000000000 })],
    )
    expect(plan.uploads).toEqual([])
    expect(plan.downloads).toEqual([])
  })
