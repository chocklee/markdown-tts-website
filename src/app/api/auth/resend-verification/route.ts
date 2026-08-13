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
  const email = body.email?.trim().toLowerCase() ?? ''

  const { rows } = await pool.query<{ emailVerified: Date | null }>(
    'SELECT "emailVerified" FROM users WHERE email = $1',
    [email],
  )
  if (rows[0] && !rows[0].emailVerified) {
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + CONFIG.auth.verificationTtlMs)
    await pool.query('INSERT INTO email_verifications (email, token, expires_at) VALUES ($1, $2, $3)', [
      email,
      token,
      expiresAt,
    ])
    await sendVerificationEmail(email, token).catch((err) => console.error('resend failed', err))
  }

  // 无论邮箱是否存在都返回成功，避免账号枚举
  return NextResponse.json({ ok: true })
}
