import { pool } from '@/lib/db/pool'

export async function getCachedAudio(
  provider: string,
  voice: string,
  textHash: string,
  rate: number,
  ttlDays: number,
): Promise<{ audio: Buffer; contentType: string } | null> {
  const { rows } = await pool.query<{ audio: Buffer; content_type: string }>(
    `SELECT audio, content_type FROM tts_cache
     WHERE provider = $1 AND voice = $2 AND text_hash = $3 AND rate = $4
       AND created_at > now() - ($5 || ' days')::interval`,
    [provider, voice, textHash, rate, String(ttlDays)],
  )
  const row = rows[0]
  if (!row) return null
  return { audio: row.audio, contentType: row.content_type }
}

export async function upsertCachedAudio(
  provider: string,
  voice: string,
  textHash: string,
  rate: number,
  audio: Buffer,
  contentType: string,
  chars: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO tts_cache (provider, voice, text_hash, rate, audio, content_type, chars)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (provider, voice, text_hash, rate)
     DO UPDATE SET
       audio = EXCLUDED.audio,
       content_type = EXCLUDED.content_type,
       chars = EXCLUDED.chars,
       created_at = now()`,
    [provider, voice, textHash, rate, audio, contentType, chars],
  )
}

export async function cleanupExpiredCache(ttlDays: number): Promise<void> {
  await pool.query("DELETE FROM tts_cache WHERE created_at < now() - ($1 || ' days')::interval", [
    String(ttlDays),
  ])
}
