'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useReaderStore } from '@/lib/state/readerStore'
import { useUiStore } from '@/lib/state/uiStore'
import { AppShell, GuestGate } from '@/components/app/AppShell'
import { IconChevron } from '@/components/app/icons'
import { clearPosition } from '@/lib/storage/local'
import { listDocuments } from '@/lib/storage/library'
import { activeBytes } from '@/lib/library/actions'

interface PackageInfo {
  id: string
  name: string
  usd: number
  credits: number
}

interface Transaction {
  id: string
  amount: number
  kind: string
  description: string
  createdAt: string
}

interface BalanceInfo {
  creditsBalance: number | null
  quotaBytes: number | null
  purchased: boolean
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
}

function shortId(email?: string | null): string {
  if (!email) return '—'
  let hash = 0
  for (let i = 0; i < email.length; i += 1) {
    hash = (hash * 31 + email.charCodeAt(i)) % 10000
  }
  return String(hash).padStart(4, '0')
}

function localStorageUsage(): number {
  let total = 0
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      const value = localStorage.getItem(key) ?? ''
      total += key.length + value.length
    }
  } catch {
    // 存储不可用时忽略
  }
  return total * 2
}

function ProfileContent() {
  const { status, data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const showToast = useUiStore((s) => s.showToast)
  const [balance, setBalance] = useState<BalanceInfo>({ creditsBalance: null, quotaBytes: null, purchased: false })
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [items, setItems] = useState<Transaction[]>([])
  const [cacheBytes, setCacheBytes] = useState(0)
  const [selected, setSelected] = useState<PackageInfo | null>(null)
  const [busy, setBusy] = useState(false)

  const skipCode = useReaderStore((s) => s.settings.skipCode)
  const skipTable = useReaderStore((s) => s.settings.skipTable)
  const toggleSkipCode = useReaderStore((s) => s.toggleSkipCode)
  const toggleSkipTable = useReaderStore((s) => s.toggleSkipTable)

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/credits/balance')
      if (!res.ok) return
      const data = (await res.json()) as { creditsBalance?: number; quotaBytes?: number; purchased?: boolean }
      setBalance({
        creditsBalance: typeof data.creditsBalance === 'number' ? data.creditsBalance : null,
        quotaBytes: typeof data.quotaBytes === 'number' ? data.quotaBytes : null,
        purchased: Boolean(data.purchased),
      })
    } catch {
      // 忽略
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    void refreshBalance()
    void fetch('/api/credits/packages')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPackages(Array.isArray(data?.packages) ? data.packages : []))
      .catch(() => {})
    void fetch('/api/credits/transactions?limit=10')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setItems(Array.isArray(data?.items) ? data.items : []))
      .catch(() => {})
    setCacheBytes(localStorageUsage())
  }, [status, refreshBalance])

  useEffect(() => {
    if (searchParams.get('success')) showToast('支付成功，积分已到账！')
    else if (searchParams.get('cancel')) showToast('已取消支付')
    if (searchParams.get('success') || searchParams.get('cancel')) {
      void refreshBalance()
    }
  }, [searchParams, refreshBalance, showToast])

  const name = session?.user?.name ?? (session?.user?.email ? session.user.email.split('@')[0] : '')
  const initial = (name || '墨')[0]
  const email = session?.user?.email ?? null

  const openBuy = useCallback((pkg: PackageInfo) => {
    setSelected(pkg)
  }, [])

  const confirmBuy = useCallback(async () => {
    if (!selected) return
    setBusy(true)
    try {
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: selected.id }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      showToast(data.error ?? '创建支付会话失败')
    } catch {
      showToast('网络错误，请稍后再试')
    } finally {
      setBusy(false)
    }
  }, [selected, showToast])

  const clearCache = useCallback(() => {
    clearPosition()
    setCacheBytes(0)
    showToast('已清除缓存')
  }, [showToast])

  const midPackage = useMemo(() => packages.find((p) => p.id === 'light') ?? packages[1] ?? packages[0] ?? null, [packages])
  const [usedBytes, setUsedBytes] = useState<number | null>(null)

  useEffect(() => {
    void listDocuments()
      .then((all) => setUsedBytes(activeBytes(all)))
      .catch(() => {})
  }, [])

  return (
    <AppShell nav="profile">
      <GuestGate>
        <section className="view active">
          <header className="page-head">
            <h1>我的</h1>
          </header>

          <div className="profile-grid">
            <div className="col">
              <div className="card profile-row">
                <span className="av" aria-hidden="true">
                  {initial}
                </span>
                <div className="body">
                  <div className="nm">{name || '墨听用户'}</div>
                  <div className="sub">
                    <span className="num">墨听 ID · {shortId(email)}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <p className="kicker">积分余额</p>
                <p className="amount">
                  <span className="num">{balance.creditsBalance ?? '—'}</span>
                  <span className="unit">积分</span>
                </p>
                <p className="hint">可用于兑换云端音色与长文档朗读</p>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: 16, width: '100%' }}
                  onClick={() => {
                    if (midPackage) openBuy(midPackage)
                    else router.push('/#pricing')
                  }}
                >
                  充值
                </button>
              </div>
            </div>

            <div className="col">
              <div className="card">
                <div className="sec-head">
                  <h2 className="h2" style={{ fontSize: 18 }}>
                    购买积分
                  </h2>
                  <p className="meta">在线支付</p>
                </div>
                {packages.map((pkg) => (
                  <button key={pkg.id} type="button" className="row-item" onClick={() => openBuy(pkg)}>
                    <div className="body">
                      <div className="title">
                        {pkg.name}
                        <span className="tag-inline">{pkg.credits} 积分</span>
                        {pkg.id === 'light' && <span className="tag-inline">最受欢迎</span>}
                        {pkg.id === 'unlimited' && <span className="tag-inline">超值</span>}
                      </div>
                      <div className="sub">
                        {pkg.id === 'starter' && '适合先体验朗读与问答功能'}
                        {pkg.id === 'light' && '日常朗读的常用选择'}
                        {pkg.id === 'unlimited' && '单位积分最划算，适合深度用户'}
                      </div>
                    </div>
                    <span className="price">${pkg.usd.toFixed(2)}</span>
                    <IconChevron className="chev" />
                  </button>
                ))}
                {packages.length === 0 && <p className="meta" style={{ padding: '8px 0' }}>加载中…</p>}
              </div>

              <div className="card">
                <div className="sec-head">
                  <h2 className="h2" style={{ fontSize: 18 }}>
                    消费记录
                  </h2>
                  <p className="meta">最近 30 天</p>
                </div>
                {items.length === 0 && <p className="meta" style={{ padding: '8px 0' }}>暂无消费记录</p>}
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
              </div>
            </div>
          </div>

          <div className="card full">
            <div className="sec-head">
              <h2 className="h2">设置</h2>
            </div>
            <p className="group-label" style={{ marginTop: 0 }}>
              朗读
            </p>
            <div className="row-item">
              <div className="body">
                <div className="title">跳过代码块</div>
                <div className="sub">朗读时跳过代码片段</div>
              </div>
              <input type="checkbox" className="switch" checked={skipCode} onChange={toggleSkipCode} aria-label="跳过代码块" />
            </div>
            <div className="row-item">
              <div className="body">
                <div className="title">跳过表格</div>
                <div className="sub">朗读时跳过表格内容</div>
              </div>
              <input type="checkbox" className="switch" checked={skipTable} onChange={toggleSkipTable} aria-label="跳过表格" />
            </div>
            <p className="group-label">存储</p>
            {status === 'authenticated' && balance.quotaBytes !== null && (
              <div className="row-item">
                <div className="body">
                  <div className="title">云存储</div>
                  <div className="sub">文档自动同步，购买套餐后升级</div>
                </div>
                <span className="val">已用 {formatBytes(usedBytes ?? 0)} / {formatBytes(balance.quotaBytes)}</span>
              </div>
            )}
            <button type="button" className="row-item" onClick={clearCache}>
              <div className="body">
                <div className="title">清除缓存</div>
                <div className="sub">清除本地收听进度等缓存</div>
              </div>
              <span className="val" aria-label="缓存大小">{formatBytes(cacheBytes)}</span>
              <IconChevron className="chev" />
            </button>
            <p className="group-label">关于</p>
            <div className="row-item">
              <div className="body">
                <div className="title">版本</div>
                <div className="sub">墨听 · Web</div>
              </div>
              <span className="val">0.1.0</span>
            </div>
          </div>

          {status === 'authenticated' && (
            <div style={{ maxWidth: 'var(--content-max)', marginTop: 20 }}>
              <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => signOut({ callbackUrl: '/' })}>
                退出登录
              </button>
            </div>
          )}
          <p className="foot meta">墨听 · Web 0.1.0</p>
        </section>
      </GuestGate>

      {selected && (
        <div className="modal-overlay show">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
            <h3 id="m-title">购买积分</h3>
            <p className="m-sub">{selected.name}</p>
            <p className="m-price num">${selected.usd.toFixed(2)}</p>
            <p className="m-note">{selected.credits} 积分 · 支付成功后即时到账</p>
            <div className="m-actions">
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)} disabled={busy}>
                取消
              </button>
              <button type="button" className="btn-primary" onClick={() => void confirmBuy()} disabled={busy}>
                {busy ? '处理中…' : '确认支付'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfileContent />
    </Suspense>
  )
}
