import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { pool } from '@/lib/db/pool'
import { sendVerificationEmail } from '@/lib/email/send'
import { CONFIG } from '@/lib/config'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`resend:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 })
  }

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
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
    return NextResponse.json({ error: '操作失败，请稍后再试' }, { status: 500 })
  } finally {
    client.release()
  }

  if (token) {
    await sendVerificationEmail(email, token).catch((err) => console.error('resend failed', err))
  }

  // 无论邮箱是否存在都返回成功，避免账号枚举
  return NextResponse.json({ ok: true })
}
