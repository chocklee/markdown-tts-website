import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth/password'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`reset:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: await serverT('server.rateLimited') }, { status: 429 })
  }

  let body: { token?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  if (typeof body.token !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const token = body.token
  const password = body.password
  if (password.length < 8) {
    return NextResponse.json({ error: await serverT('server.pwdShort') }, { status: 400 })
  }
  if (password.length > 72) {
    return NextResponse.json({ error: await serverT('server.pwdLong') }, { status: 400 })
  }

  const passwordHash = hashPassword(password)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ user_id: string; expires_at: Date }>(
      'SELECT user_id, expires_at FROM password_resets WHERE token = $1',
      [token],
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: await serverT('server.resetLinkInvalid') }, { status: 400 })
    }
    if (new Date(rows[0].expires_at).getTime() < Date.now()) {
      await client.query('DELETE FROM password_resets WHERE token = $1', [token])
      await client.query('COMMIT')
      return NextResponse.json({ error: await serverT('server.resetLinkExpired') }, { status: 400 })
    }
    const result = await client.query('UPDATE users SET password_hash = $1, password_changed_at = now() WHERE id = $2', [
      passwordHash,
      rows[0].user_id,
    ])
    if (result.rowCount === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: await serverT('server.resetLinkInvalid') }, { status: 400 })
    }
    await client.query('DELETE FROM password_resets WHERE token = $1', [token])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('reset password failed', err)
    return NextResponse.json({ error: await serverT('server.resetFailed') }, { status: 500 })
  } finally {
    client.release()
  }

  return NextResponse.json({ ok: true })
}
