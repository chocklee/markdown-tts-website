import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { pool } from '@/lib/db/pool'
import { sendPasswordResetEmail } from '@/lib/email/send'
import { CONFIG } from '@/lib/config'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
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
  if (typeof body.email !== 'string') {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  const email = body.email.trim().toLowerCase()

  try {
    const { rows } = await pool.query<{ id: string; emailVerified: Date | null }>(
      'SELECT id, "emailVerified" FROM users WHERE email = $1',
      [email],
    )
    if (rows[0] && rows[0].emailVerified) {
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + CONFIG.auth.verificationTtlMs)
      await pool.query('DELETE FROM password_resets WHERE user_id = $1', [rows[0].id])
      await pool.query('INSERT INTO password_resets (email, token, expires_at, user_id) VALUES ($1, $2, $3, $4)', [
        email,
        token,
        expiresAt,
        rows[0].id,
      ])
      await sendPasswordResetEmail(email, token).catch((err) => console.error('send reset email failed', err))
    }
  } catch (err) {
    console.error('forgot password failed', err)
    return NextResponse.json({ error: '操作失败，请稍后再试' }, { status: 500 })
  }

  // 无论是否存在都返回成功，避免账号枚举
  return NextResponse.json({ ok: true })
}
