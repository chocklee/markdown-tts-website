import Link from 'next/link'
import { pool } from '@/lib/db/pool'
import AuthShell from '@/components/app/AuthShell'

export const dynamic = 'force-dynamic'

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  let status: 'success' | 'expired' | 'invalid' = 'invalid'

  if (token) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{ user_id: string; expires_at: Date }>(
        'SELECT user_id, expires_at FROM email_verifications WHERE token = $1',
        [token],
      )
      if (rows.length === 0) {
        status = 'invalid'
      } else if (new Date(rows[0].expires_at).getTime() < Date.now()) {
        await client.query('DELETE FROM email_verifications WHERE token = $1', [token])
        status = 'expired'
      } else {
        const result = await client.query('UPDATE users SET "emailVerified" = now() WHERE id = $1', [rows[0].user_id])
        await client.query('DELETE FROM email_verifications WHERE token = $1', [token])
        status = result.rowCount === 1 ? 'success' : 'invalid'
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error('verify email failed', err)
    } finally {
      client.release()
    }
  }

  return (
    <AuthShell
      title={status === 'success' ? '邮箱验证成功' : status === 'expired' ? '验证链接已过期' : '验证链接无效'}
      subtitle={
        status === 'success'
          ? '现在可以登录你的账号了。'
          : status === 'expired'
            ? '请重新注册，或在登录页点击「重新发送验证邮件」。'
            : '请检查邮件中的链接是否完整，或重新注册。'
      }
    >
      <div className="auth-result">
        <Link href="/login" className="btn-primary auth-submit auth-link-btn">
          去登录
        </Link>
      </div>
    </AuthShell>
  )
}
