'use client'
import { useState } from 'react'
import Link from 'next/link'
import AuthShell from '@/components/app/AuthShell'

export default function ForgotPasswordPage() {
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
      setError(data.error ?? '发送失败，请稍后再试')
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell title="忘记密码" subtitle="输入注册邮箱，我们会发送重置链接">
      {sent ? (
        <div className="auth-result">
          <p>如果该邮箱已注册，重置邮件已发送，请查收。</p>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email" className="auth-label">
            注册邮箱
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
          <button
            type="submit"
            disabled={sending}
            className="btn-primary auth-submit"
          >
            发送重置邮件
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link href="/login">
          返回登录
        </Link>
      </div>
    </AuthShell>
  )
}
