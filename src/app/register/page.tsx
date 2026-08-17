'use client'
import { useState } from 'react'
import Link from 'next/link'
import AuthShell from '@/components/app/AuthShell'
import { useI18n } from '@/lib/i18n'

export default function RegisterPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        setDone(true)
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error ?? t('auth.regGeneric'))
    } catch {
      setError(t('auth.networkError'))
    }
  }

  async function resend() {
    setResendError('')
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) setResendSent(true)
      else setResendError(t('auth.resendFailed'))
    } catch {
      setResendError(t('auth.resendFailed'))
    }
  }

  return (
    <AuthShell title={t('auth.regTitle')} subtitle={t('auth.regSub')}>
      {done ? (
        <div className="auth-result">
          <p>{t('auth.regDone', { email })}</p>
          <div className="auth-links">
            <Link href="/login">{t('auth.regBackToLogin')}</Link>
          </div>
          {!resendSent && (
            <button type="button" onClick={() => void resend()} className="auth-resend">
              {t('auth.regResend')}
            </button>
          )}
          {resendError && (
            <p role="alert" className="auth-error auth-error-center">
              {resendError}
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email" className="auth-label">
            {t('auth.email')}
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
          <label htmlFor="password" className="auth-label">
            {t('auth.regPassword')}
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
          <button type="submit" className="btn-primary auth-submit">
            {t('auth.regSubmit')}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
