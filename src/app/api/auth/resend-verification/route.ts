import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { pool } from '@/lib/db/pool'
import { sendVerificationEmail } from '@/lib/email/send'
import { CONFIG } from '@/lib/config'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`resend:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: await serverT('server.rateLimited') }, { status: 429 })
  }

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254) {
    return NextResponse.json({ error: await serverT('server.emailInvalid') }, { status: 400 })
  }

  const client = await pool.connect()
  let token = ''
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ id: string; emailVerified: Date | null }>(
      'SELECT id, "emailVerified" FROM users WHERE lower(email) = lower($1)',
      [email],
    )
    if (rows[0] && !rows[0].emailVerified) {
      token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + CONFIG.auth.verificationTtlMs)
      await client.query('DELETE FROM email_verifications WHERE user_id = $1', [rows[0].id])
      await client.query('INSERT INTO email_verifications (email, token, expires_at, user_id) VALUES ($1, $2, $3, $4)', [
        email,
        token,
        expiresAt,
        rows[0].id,
      ])
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('resend verification failed', err)
    return NextResponse.json({ error: await serverT('server.operationFailed') }, { status: 500 })
  } finally {
    client.release()
  }

  if (token) {
    await sendVerificationEmail(email, token).catch((err) => console.error('resend failed', err))
  }

  // 无论邮箱是否存在都返回成功，避免账号枚举
  return NextResponse.json({ ok: true })
}
