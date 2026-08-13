import { NextResponse } from 'next/server'
import { pool } from '@/lib/db/pool'
import { hashPassword } from '@/lib/auth/password'
import { clientIp, isRateLimited } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  if (isRateLimited(`reset:${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: '操作过于频繁，请稍后再试' }, { status: 429 })
  }

  let body: { token?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  const token = body.token ?? ''
  const password = body.password ?? ''
  if (password.length < 8) {
    return NextResponse.json({ error: '密码至少 8 位' }, { status: 400 })
  }
  if (password.length > 72) {
    return NextResponse.json({ error: '密码过长' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ email: string; expires_at: Date }>(
      'SELECT email, expires_at FROM password_resets WHERE token = $1',
      [token],
    )
    if (rows.length === 0) {
      await client.query('ROLLBACK')
      return NextResponse.json({ error: '重置链接无效' }, { status: 400 })
    }
    if (new Date(rows[0].expires_at).getTime() < Date.now()) {
      await client.query('DELETE FROM password_resets WHERE token = $1', [token])
      await client.query('ROLLBACK')
      return NextResponse.json({ error: '重置链接已过期' }, { status: 400 })
    }
    await client.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashPassword(password), rows[0].email])
    await client.query('DELETE FROM password_resets WHERE token = $1', [token])
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('reset password failed', err)
    return NextResponse.json({ error: '重置失败，请稍后再试' }, { status: 500 })
  } finally {
    client.release()
  }

  return NextResponse.json({ ok: true })
}
