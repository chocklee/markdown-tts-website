import type { SyncedDocument } from '@/types/document'

export type UpsertBodyResult =
  | { ok: true; value: SyncedDocument }
  | { ok: false; status: number; error: string }

const MAX_CONTENT_BYTES = 5 * 1024 * 1024
const MAX_TITLE_CHARS = 200

export function validateUpsertBody(body: unknown, docId: string): UpsertBodyResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: '请求格式错误' }
  }
  const b = body as Record<string, unknown>
  if (b.docId !== docId) {
    return { ok: false, status: 400, error: 'docId 不匹配' }
  }
  if (
    typeof b.title !== 'string' ||
    typeof b.content !== 'string' ||
    typeof b.contentHash !== 'string' ||
    typeof b.fileSizeBytes !== 'number' ||
    typeof b.updatedAt !== 'number'
  ) {
    return { ok: false, status: 400, error: '字段缺失' }
  }
  if (!b.contentHash) {
    return { ok: false, status: 400, error: '字段缺失' }
  }
  if (!Number.isFinite(b.fileSizeBytes) || !Number.isFinite(b.updatedAt) || b.updatedAt < 0) {
    return { ok: false, status: 400, error: '字段缺失' }
  }
  if (Buffer.byteLength(b.content, 'utf8') > MAX_CONTENT_BYTES) {
    return { ok: false, status: 400, error: '文件超过 5MB 上限' }
  }
  const deletedAt = b.deletedAt
  if (deletedAt !== null && (typeof deletedAt !== 'number' || !Number.isFinite(deletedAt))) {
    return { ok: false, status: 400, error: '字段缺失' }
  }
  const deleteExpiresAt = b.deleteExpiresAt
  if (deleteExpiresAt !== null && (typeof deleteExpiresAt !== 'number' || !Number.isFinite(deleteExpiresAt))) {
    return { ok: false, status: 400, error: '字段缺失' }
  }
  return {
    ok: true,
    value: {
      docId,
      title: Array.from(b.title).slice(0, MAX_TITLE_CHARS).join(''),
      content: b.content,
      contentHash: b.contentHash,
      fileSizeBytes: Math.floor(b.fileSizeBytes),
      updatedAt: Math.floor(b.updatedAt),
      deletedAt,
      deleteExpiresAt,
    },
  }
}
