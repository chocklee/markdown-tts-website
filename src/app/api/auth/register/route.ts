import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { pool } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth/password'
import { sendVerificationEmail } from '@/lib/email/send'
import { CONFIG } from '@/lib/config'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`register:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 })
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase() ?? ''
  const password = body.password ?? ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 })
  }
  if (password.length > 72) {
    return NextResponse.json({ error: '密码过长' }, { status: 400 })
  }

  const client = await pool.connect()
  let verificationToken = ''
  try {
    await client.query('BEGIN')
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rowCount) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 })
    }
    const passwordHash = hashPassword(password)
    await client.query(
      'INSERT INTO users (email, password_hash, storage_quota_bytes) VALUES ($1, $2, $3)',
      [email, passwordHash, CONFIG.quota.freeBytes],
    )
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + CONFIG.auth.verificationTtlMs)
    const { rows } = await client.query<{ token: string }>(
      'INSERT INTO email_verifications (email, token, expires_at) VALUES ($1, $2, $3) RETURNING token',
      [email, token, expiresAt],
    )
    verificationToken = rows[0].token
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('register failed', err)
    return NextResponse.json({ error: '注册失败，请稍后再试' }, { status: 500 })
  } finally {
    client.release()
  }

  try {
    await sendVerificationEmail(email, verificationToken)
  } catch (err) {
    console.error('send verification email failed', err)
  }

  return NextResponse.json({ ok: true })
}
