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
