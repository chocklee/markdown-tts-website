import Link from 'next/link'
import { pool } from '@/lib/db/pool'
import { serverT } from '@/lib/i18n/server'
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

  const [titleKey, subKey] =
    status === 'success'
      ? (['auth.verifySuccess', 'auth.verifySuccessSub'] as const)
      : status === 'expired'
        ? (['auth.verifyExpired', 'auth.verifyExpiredSub'] as const)
        : (['auth.verifyInvalid', 'auth.verifyInvalidSub'] as const)

  return (
    <AuthShell title={await serverT(titleKey)} subtitle={await serverT(subKey)}>
      <div className="auth-result">
        <Link href="/login" className="btn-primary auth-submit auth-link-btn">
          {await serverT('auth.goLogin')}
        </Link>
      </div>
    </AuthShell>
  )
}
