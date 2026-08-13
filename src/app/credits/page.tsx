'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

interface Transaction {
  id: string
  amount: number
  kind: string
  description: string
  createdAt: string
  ref: string | null
  meta: unknown
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024).toFixed(1)} KB`
}

export default function CreditsPage() {
  const { status } = useSession()
  const [balance, setBalance] = useState<{ creditsBalance: number; quotaBytes: number; purchased: boolean } | null>(null)
  const [items, setItems] = useState<Transaction[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (cursor: string | null) => {
    setLoading(true)
    try {
      const url = `/api/credits/transactions?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { items: Transaction[]; nextCursor: string | null }
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items))
      setNextCursor(data.nextCursor)
    } catch {
      setError('加载失败，请稍后再试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    void fetch('/api/credits/balance')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBalance(data))
      .catch(() => {})
    void load(null)
  }, [status, load])

  if (status !== 'authenticated') {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">消费记录</h1>
        <p className="mt-4 text-slate-600">登录后查看积分余额与消费记录</p>
        <Link href="/login" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          去登录
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">积分与消费记录</h1>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6">
        <div>
          <p className="text-sm text-slate-500">当前余额</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">
            {balance ? balance.creditsBalance : '—'}
            <span className="ml-1 text-sm font-normal text-slate-500">积分</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">
            存储配额 {balance ? formatBytes(balance.quotaBytes) : '—'}
            {balance?.purchased ? '（已升级）' : ''}
          </p>
        </div>
        <Link href="/pricing" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          购买积分
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-800">流水</h2>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {items.length === 0 && !loading ? (
        <p className="mt-4 text-slate-500">暂无消费记录</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {items.map((tx) => (
            <li key={tx.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{tx.description}</p>
                <p className="text-xs text-slate-400">{formatDate(tx.createdAt)}</p>
              </div>
              <span className={tx.amount >= 0 ? 'text-sm font-semibold text-emerald-600' : 'text-sm font-semibold text-slate-700'}>
                {tx.amount >= 0 ? '+' : ''}
                {tx.amount}
              </span>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <button
          type="button"
          onClick={() => void load(nextCursor)}
          disabled={loading}
          className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? '加载中…' : '加载更多'}
        </button>
      )}
    </main>
  )
}
