'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell, GuestGate } from '@/components/app/AppShell'
import { useI18n } from '@/lib/i18n'
import { pkgName } from '@/lib/i18n/packages'

interface Transaction {
  id: string
  amount: number
  kind: string
  description: string
  createdAt: string
}

function formatDate(iso: string, lang: 'zh' | 'en'): string {
  const d = new Date(iso)
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
}

function txDescription(t: (key: string, vars?: Record<string, string | number>) => string, description: string): string {
  const FIXED: Record<string, string> = {
    '注册赠送积分': 'transactions.signupBonus',
    '云端朗读': 'transactions.cloudRead',
    '合成失败退还积分': 'transactions.refund',
    '上期积分到期清零': 'transactions.subscriptionReset',
    '订阅到期，积分清零': 'transactions.subscriptionExpired',
  }
  const fixed = FIXED[description]
  if (fixed) return t(fixed)
  const purchase = /^购买(.+)$/.exec(description)
  if (purchase) return t('transactions.purchase', { pkg: pkgName(t, purchase[1]) })
  const grant = /^订阅(.+) · 本月积分$/.exec(description)
  if (grant) return t('transactions.subscriptionGrant', { pkg: pkgName(t, grant[1]) })
  return description
}

export default function TransactionsPage() {
  const { t, lang } = useI18n()
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
        setError(t('transactions.loadFailed'))
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
      setError(t('transactions.loadFailed'))
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
            <h1>{t('transactions.title')}</h1>
            <p className="meta">{t('transactions.sub')}</p>
          </header>
          <div className="card" style={{ maxWidth: 'var(--content-max)' }}>
            {items.length === 0 && !loading && !error && (
              <p className="meta" style={{ padding: '8px 0' }}>{t('transactions.empty')}</p>
            )}
            {items.map((tx) => (
              <div key={tx.id} className="row-item">
                <div className="body">
                  <div className="title">{txDescription(t, tx.description)}</div>
                  <div className="sub num">{formatDate(tx.createdAt, lang)}</div>
                </div>
                <span className="amt" style={{ color: tx.amount >= 0 ? 'var(--accent-strong)' : 'var(--fg)' }}>
                  {tx.amount >= 0 ? '+' : ''}
                  {tx.amount}
                </span>
                <span style={{ flex: '0 0 auto', fontSize: 12, color: 'var(--muted)' }}>{t('transactions.credits')}</span>
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
                {loading ? t('transactions.loading') : t('transactions.loadMore')}
              </button>
            )}
          </div>
        </section>
      </GuestGate>
    </AppShell>
  )
}
