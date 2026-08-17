'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell, GuestGate } from '@/components/app/AppShell'

interface Transaction {
  id: string
  amount: number
  kind: string
  description: string
  createdAt: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
}

export default function TransactionsPage() {
  const [items, setItems] = useState<Transaction[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loadingRef = useRef(false)

  const load = useCallback(async (cursor?: string) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/credits/transactions?${params.toString()}`)
      if (!res.ok) {
        setError('加载失败，请稍后重试')
        return
      }
      const data = (await res.json()) as {
        items?: Transaction[]
        hasMore?: boolean
        nextCursor?: string | null
      }
      const next = Array.isArray(data.items) ? data.items : []
      setItems((prev) => (cursor ? [...prev, ...next] : next))
      setHasMore(Boolean(data.hasMore))
      setNextCursor(data.nextCursor ?? null)
    } catch {
      setError('网络错误，请稍后重试')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell nav="profile">
      <GuestGate>
        <section className="view active">
          <header className="page-head">
            <h1>消费记录</h1>
            <p className="meta">积分收支明细</p>
          </header>
          <div className="card" style={{ maxWidth: 'var(--content-max)' }}>
            {items.length === 0 && !loading && !error && (
              <p className="meta" style={{ padding: '8px 0' }}>暂无消费记录</p>
            )}
            {items.map((tx) => (
              <div key={tx.id} className="row-item">
                <div className="body">
                  <div className="title">{tx.description}</div>
                  <div className="sub num">{formatDate(tx.createdAt)}</div>
                </div>
                <span className="amt" style={{ color: tx.amount >= 0 ? 'var(--accent-strong)' : 'var(--fg)' }}>
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount}
                </span>
                <span style={{ flex: '0 0 auto', fontSize: 12, color: 'var(--muted)' }}>积分</span>
              </div>
            ))}
            {error && <p className="meta" style={{ padding: '8px 0' }}>{error}</p>}
            {hasMore && (
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', marginTop: 12 }}
                onClick={() => void load(nextCursor ?? undefined)}
                disabled={loading}
              >
                {loading ? '加载中…' : '加载更多'}
              </button>
            )}
          </div>
        </section>
      </GuestGate>
    </AppShell>
  )
}
