'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn, getProviders } from 'next-auth/react'
import { useI18n } from '@/lib/i18n'
import AuthShell from '@/components/app/AuthShell'

export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState('')
  const [hasGoogle, setHasGoogle] = useState(false)

  useEffect(() => {
    getProviders()
      .then((data) => setHasGoogle(Boolean(data?.google)))
      .catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const res = await signIn('credentials', { redirect: false, email, password })
      if (res?.error) {
        setError(t('auth.loginError'))
        return
      }
      router.push('/')
      router.refresh()
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
    <AuthShell title={t('auth.welcomeTitle')} subtitle={t('auth.welcomeSub')}>
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
          {t('auth.password')}
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
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
          {t('auth.login')}
        </button>
      </form>

      <div className="auth-divider">{t('auth.or')}</div>

      {hasGoogle && (
        <button
          type="button"
          onClick={() => void signIn('google', { callbackUrl: '/' })}
          className="btn-secondary auth-google"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.29v3.09A12 12 0 0 0 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 1.29 6.62l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77z"
            />
          </svg>
          {t('auth.google')}
        </button>
      )}

      <div className="auth-links">
        <Link href="/forgot-password">{t('auth.forgot')}</Link>
        <Link href="/register">{t('auth.registerLink')}</Link>
      </div>

      {error && (
        <>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resendSent}
            className="auth-resend"
          >
            {resendSent ? t('auth.resent') : t('auth.resend')}
          </button>
          {resendError && (
            <p role="alert" className="auth-error auth-error-center">
              {resendError}
            </p>
          )}
        </>
      )}
    </AuthShell>
  )
}
