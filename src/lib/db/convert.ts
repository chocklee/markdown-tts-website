import { pool } from '@/lib/db/pool'

export type ConvertStatus = 'pending' | 'converting' | 'done' | 'failed'

export interface ConvertedMeta {
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
  contentType: string
  error: string | null
  updatedAt: string
}

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

export async function getConvertedMeta(userId: string, docId: string): Promise<ConvertedMeta | null> {
  const { rows } = await pool.query<Row>(
    `SELECT user_id, doc_id, voice, rate, skip_code, skip_table, chars, size_bytes, status,
            progress, chunks_total, chunks_done, content_type, error, updated_at
     FROM converted_audios WHERE user_id = $1 AND doc_id = $2`,
    [userId, docId],
  )
  if (!rows[0]) return null
  const { audio, ...meta } = mapRow(rows[0])
  return meta
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
