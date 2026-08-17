'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AuthShell from '@/components/app/AuthShell'

function ResetPasswordPage() {
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
      setError(data.error ?? '重置失败，请重试')
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (!token) {
    return (
      <AuthShell title="重置链接无效" subtitle="请重新发起忘记密码来获取新的重置链接">
        <div className="auth-result">
          <Link href="/forgot-password" className="btn-primary auth-submit auth-link-btn">
            重新发送
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="设置新密码" subtitle="为你的账号设置一个新密码">
      {done ? (
        <div className="auth-result">
          <p>密码已更新，现在可以用新密码登录了。</p>
          <Link href="/login" className="btn-primary auth-submit auth-link-btn">
            去登录
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          <label htmlFor="password" className="auth-label">
            新密码（至少 8 位）
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
          <button
            type="submit"
            disabled={saving}
            className="btn-primary auth-submit"
          >
            保存新密码
          </button>
        </form>
      )}
    </AuthShell>
  )
}

export default function ResetPasswordPageWrapper() {
  return (
    <Suspense
      fallback={
        <AuthShell title="设置新密码">
          <p className="auth-result" style={{ color: 'var(--muted)' }}>
            加载中…
          </p>
        </AuthShell>
      }
    >
      <ResetPasswordPage />
    </Suspense>
  )
}
