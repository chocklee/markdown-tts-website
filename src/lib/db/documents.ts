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
  file_size_bytes: number
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
    fileSizeBytes: row.file_size_bytes,
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
  // 服务端重算权威大小，防止客户端谎报 file_size_bytes 绕过配额
  const serverSize = Buffer.byteLength(doc.content, 'utf8')
  const sized = { ...doc, fileSizeBytes: serverSize }

  // 配额检查与插入之间存在竞态窗口，单用户规模下可接受
  const quotaBytes = await getUserQuotaBytes(userId)
  const { rows: usedRows } = await pool.query<{ used: string }>(
    `SELECT COALESCE(SUM(CASE WHEN deleted_at IS NULL AND doc_id <> $2 THEN file_size_bytes ELSE 0 END), 0) AS used
     FROM documents WHERE user_id = $1`,
    [userId, sized.docId],
  )
  const usedBytes = Number(usedRows[0]?.used ?? 0)
  if (exceedsQuota(usedBytes, sized, quotaBytes)) return { status: 'quota-exceeded' }

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
     -- <= 表示 updated_at 相等时以新写入为准（last-write-wins）：
     -- 幂等重试不会误报 409，客户端每次保存递增 updatedAt，相等情况极少
     WHERE documents.updated_at <= EXCLUDED.updated_at`,
    [userId, sized.docId, sized.title, sized.content, sized.contentHash, sized.fileSizeBytes, sized.updatedAt, sized.deletedAt, sized.deleteExpiresAt],
  )
  if (!rowCount) {
    const current = await getServerDocument(userId, sized.docId)
    return current ? { status: 'conflict', server: current } : { status: 'ok' }
  }
  return { status: 'ok' }
}

export async function hardDeleteServerDocument(userId: string, docId: string): Promise<void> {
  await pool.query('DELETE FROM documents WHERE user_id = $1 AND doc_id = $2', [userId, docId])
  await pool.query('DELETE FROM converted_audios WHERE user_id = $1 AND doc_id = $2', [userId, docId])
}

export async function sumServerDocumentBytes(userId: string): Promise<number> {
  const { rows } = await pool.query<{ used: string }>(
    `SELECT COALESCE(SUM(CASE WHEN deleted_at IS NULL THEN file_size_bytes ELSE 0 END), 0)::text AS used
     FROM documents WHERE user_id = $1`,
    [userId],
  )
  return Number(rows[0]?.used ?? 0)
}
