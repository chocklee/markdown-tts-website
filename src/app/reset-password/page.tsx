'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import AuthShell from '@/components/app/AuthShell'

function ResetPasswordPage() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (res.ok) {
        setDone(true)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error ?? t('auth.resetGeneric'))
    } catch {
      setError(t('auth.networkError'))
    } finally {
      setSaving(false)
    }
  }

  if (!token) {
    return (
      <AuthShell title={t('auth.resetInvalidTitle')} subtitle={t('auth.resetInvalidSub')}>
        <div className="auth-result">
          <Link href="/forgot-password" className="btn-primary auth-submit auth-link-btn">
            {t('auth.resetResend')}
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetSub')}>
      {done ? (
        <div className="auth-result">
          <p>{t('auth.resetDone')}</p>
          <Link href="/login" className="btn-primary auth-submit auth-link-btn">
            {t('auth.resetGoLogin')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="password" className="auth-label">
            {t('auth.resetLabel')}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-field"
          />
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={saving} className="btn-primary auth-submit">
            {t('auth.resetSave')}
          </button>
        </form>
      )}
    </AuthShell>
  )
}

export default function ResetPasswordPageWrapper() {
  const { t } = useI18n()
  return (
    <Suspense
      fallback={
        <AuthShell title={t('auth.resetTitle')}>
          <p className="auth-result" style={{ color: 'var(--muted)' }}>
            {t('transactions.loading')}
          </p>
        </AuthShell>
      }
    >
      <ResetPasswordPage />
    </Suspense>
  )
}
