'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [resendSent, setResendSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
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
  }

  async function resend() {
    const res = await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) setResendSent(true)
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-center text-2xl font-bold">注册</h1>
      {done ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-slate-600">
            验证邮件已发送到 <span className="font-medium">{email}</span>，请点击邮件中的链接完成验证。
          </p>
          <button
            type="button"
            onClick={() => void resend()}
            className="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            {resendSent ? '已重新发送验证邮件' : '未收到？重新发送'}
          </button>
          <Link href="/login" className="mt-3 inline-block text-sm text-blue-600">
            去登录
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-slate-600">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-600">
              密码（至少 8 位）
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-lg bg-blue-600 py-2.5 text-white hover:bg-blue-700">
            注册
          </button>
        </form>
      )}
    </main>
  )
}
