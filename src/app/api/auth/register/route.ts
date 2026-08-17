import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { pool } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth/password'
import { sendVerificationEmail } from '@/lib/email/send'
import { grantSignupBonus } from '@/lib/db/credits'
import { CONFIG } from '@/lib/config'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`register:${clientIp(req)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: await serverT('server.rateLimited') }, { status: 429 })
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: await serverT('server.emailInvalid') }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: await serverT('server.pwdShort') }, { status: 400 })
  }
  if (password.length > 72) {
    return NextResponse.json({ error: await serverT('server.pwdLong') }, { status: 400 })
  }

  const client = await pool.connect()
  let verificationToken = ''
  const passwordHash = hashPassword(password)
  try {
    await client.query('BEGIN')
    const existing = await client.query('SELECT id FROM users WHERE lower(email) = lower($1)', [email])
    if (existing.rowCount) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: await serverT('server.emailTaken') }, { status: 409 })
    }
    const { rows: userRows } = await client.query<{ id: string }>(
      'INSERT INTO users (email, password_hash, storage_quota_bytes) VALUES ($1, $2, $3) RETURNING id',
      [email, passwordHash, CONFIG.quota.freeBytes],
    )
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + CONFIG.auth.verificationTtlMs)
    const { rows } = await client.query<{ token: string }>(
      'INSERT INTO email_verifications (email, token, expires_at, user_id) VALUES ($1, $2, $3, $4) RETURNING token',
      [email, token, expiresAt, userRows[0].id],
    )
    verificationToken = rows[0].token
    await grantSignupBonus(client, userRows[0].id, CONFIG.credits.bonusOnRegister)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: await serverT('server.emailTaken') }, { status: 409 })
    }
    console.error('register failed', err)
    return NextResponse.json({ error: await serverT('server.registerFailed') }, { status: 500 })
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
