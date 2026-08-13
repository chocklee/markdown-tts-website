'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

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
      <main className="mx-auto max-w-sm px-4 py-20 text-center">
        <p className="text-slate-500">重置链接无效，请重新发起忘记密码。</p>
        <Link href="/forgot-password" className="mt-4 inline-block text-blue-600">
          重新发送
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-center text-2xl font-bold">设置新密码</h1>
      {done ? (
        <p className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-600">
          密码已更新，<Link href="/login" className="text-blue-600">去登录</Link>
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-slate-600">
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
              className="w-full rounded-lg border border-slate-200 p-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            保存新密码
          </button>
        </form>
      )}
    </main>
  )
}

export default function ResetPasswordPageWrapper() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-400">加载中…</div>}>
      <ResetPasswordPage />
    </Suspense>
  )
}
