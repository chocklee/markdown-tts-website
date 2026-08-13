import Link from 'next/link'
import { pool } from '@/lib/db/pool'

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
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">
        {status === 'success' ? '邮箱验证成功' : status === 'expired' ? '验证链接已过期' : '验证链接无效'}
      </h1>
      <p className="mt-3 text-slate-500">
        {status === 'success'
          ? '现在可以登录你的账号了。'
          : status === 'expired'
            ? '请重新注册，或在登录页点击「重新发送验证邮件」。'
            : '请检查邮件中的链接是否完整，或重新注册。'}
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-white hover:bg-blue-700"
      >
        去登录
      </Link>
    </main>
  )
}
