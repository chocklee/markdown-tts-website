'use client'
import { useState } from 'react'
import Link from 'next/link'
import AuthShell from '@/components/app/AuthShell'
import { useI18n } from '@/lib/i18n'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setSent(true)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error ?? t('auth.forgotGeneric'))
    } catch {
      setError(t('auth.networkError'))
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={t('auth.forgotSub')}>
      {sent ? (
        <div className="auth-result">
          <p>{t('auth.forgotSent')}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email" className="auth-label">
            {t('auth.forgotEmailLabel')}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-field"
          />
          {error && (
            <p role="alert" className="auth-error">
              {error}
            </p>
          )}
          <button type="submit" disabled={sending} className="btn-primary auth-submit">
            {t('auth.forgotSend')}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link href="/login">{t('auth.forgotBack')}</Link>
      </div>
    </AuthShell>
  )
}
