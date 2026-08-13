'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState('')
  const [hasGoogle, setHasGoogle] = useState(false)

  useEffect(() => {
    fetch('/api/auth/providers', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setHasGoogle(Boolean(data?.google)))
      .catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const res = await signIn('credentials', { redirect: false, email, password })
      if (res?.error) {
        setError('邮箱或密码错误；未验证的邮箱请先完成邮件验证')
        return
      }
      router.push('/library')
      router.refresh()
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
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-center text-2xl font-bold">登录</h1>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm text-slate-600">
            邮箱
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm text-slate-600">
            密码
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" className="w-full rounded-lg bg-blue-600 py-2.5 text-white hover:bg-blue-700">
          登录
        </button>
      </form>

      <div className="mt-4 text-center text-sm">
        <Link href="/forgot-password" className="text-slate-600 hover:text-slate-900">
          忘记密码？
        </Link>
        <span className="mx-2 text-slate-300">|</span>
        <Link href="/register" className="text-slate-600 hover:text-slate-900">
          注册新账号
        </Link>
      </div>

      {error && (
        <>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resendSent}
            className="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-sm text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resendSent ? '已重新发送验证邮件' : '未收到验证邮件？重新发送'}
          </button>
          {resendError && (
            <p role="alert" className="mt-2 text-center text-sm text-red-600">
              {resendError}
            </p>
          )}
        </>
      )}

      {hasGoogle && (
        <button
          type="button"
          onClick={() => void signIn('google', { callbackUrl: '/library' })}
          className="mt-3 w-full rounded-lg border border-slate-300 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
        >
          使用 Google 登录
        </button>
      )}
    </main>
  )
}
