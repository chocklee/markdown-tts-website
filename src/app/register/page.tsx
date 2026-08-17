'use client'
import { useState } from 'react'
import Link from 'next/link'
import AuthShell from '@/components/app/AuthShell'

export default function RegisterPage() {
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
      setError(data.error ?? '注册失败，请重试')
    } catch {
      setError('网络错误，请重试')
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
      else setResendError('发送失败，请稍后再试')
    } catch {
      setResendError('发送失败，请稍后再试')
    }
  }

  return (
    <AuthShell title="创建账号" subtitle="注册即送 50 积分，把文档变成声音">
      {done ? (
        <div className="auth-result">
          <p>
            验证邮件已发送到 <span className="font-medium">{email}</span>，请点击邮件中的链接完成验证。
          </p>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resendSent}
            className="auth-resend"
          >
            {resendSent ? '已重新发送验证邮件' : '未收到？重新发送'}
          </button>
          {resendError && (
            <p role="alert" className="auth-error auth-error-center">
              {resendError}
            </p>
          )}
          <Link href="/login" className="btn-primary auth-submit auth-link-btn">
            去登录
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email" className="auth-label">
            邮箱
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
            密码（至少 8 位）
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
            注册
          </button>
        </form>
      )}
    </AuthShell>
  )
}
