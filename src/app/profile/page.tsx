'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useReaderStore } from '@/lib/state/readerStore'
import { useUiStore } from '@/lib/state/uiStore'
import { useI18n, LangSeg } from '@/lib/i18n'
import { pkgName } from '@/lib/i18n/packages'
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
  billing?: string
}

interface SubscriptionInfo {
  planId: string | null
  status: string
  periodEnd: string | null
}

interface BalanceInfo {
  creditsBalance: number | null
  quotaBytes: number | null
  purchased: boolean
  subscription: SubscriptionInfo | null
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

function formatDate(iso: string, lang: 'zh' | 'en'): string {
  const d = new Date(iso)
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
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
  const { t, lang } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const showToast = useUiStore((s) => s.showToast)
  const [balance, setBalance] = useState<BalanceInfo>({ creditsBalance: null, quotaBytes: null, purchased: false, subscription: null })
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [cacheBytes, setCacheBytes] = useState(0)
  const [selected, setSelected] = useState<PackageInfo | null>(null)
  const [chosenId, setChosenId] = useState<string>('light')
  const [busy, setBusy] = useState(false)

  const skipCode = useReaderStore((s) => s.settings.skipCode)
  const skipTable = useReaderStore((s) => s.settings.skipTable)
  const toggleSkipCode = useReaderStore((s) => s.toggleSkipCode)
  const toggleSkipTable = useReaderStore((s) => s.toggleSkipTable)

  const refreshBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/credits/balance')
      if (!res.ok) return
      const data = (await res.json()) as {
        creditsBalance?: number
        quotaBytes?: number
        purchased?: boolean
        subscription?: SubscriptionInfo | null
      }
      setBalance({
        creditsBalance: typeof data.creditsBalance === 'number' ? data.creditsBalance : null,
        quotaBytes: typeof data.quotaBytes === 'number' ? data.quotaBytes : null,
        purchased: Boolean(data.purchased),
        subscription: data.subscription ?? null,
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
    setCacheBytes(localStorageUsage())
  }, [status, refreshBalance])

  useEffect(() => {
    if (searchParams.get('success')) showToast(t('profile.toastSubscribed'))
    else if (searchParams.get('cancel')) showToast(t('profile.toastCanceled'))
    if (searchParams.get('success') || searchParams.get('cancel')) {
      void refreshBalance()
    }
  }, [searchParams, refreshBalance, showToast, t])

  const name = session?.user?.name ?? (session?.user?.email ? session.user.email.split('@')[0] : '')
  const initial = (name || '墨')[0]
  const email = session?.user?.email ?? null

  const currentPlanId =
    balance.subscription?.status === 'active' && balance.subscription.planId
      ? balance.subscription.planId
      : null
  const switchablePackages = useMemo(
    () => (currentPlanId ? packages.filter((p) => p.id !== currentPlanId) : packages),
    [packages, currentPlanId],
  )

  const openBuy = useCallback(
    (pkg: PackageInfo) => {
      const target = currentPlanId && pkg.id === currentPlanId ? (switchablePackages[0] ?? pkg) : pkg
      setChosenId(target.id)
      setSelected(target)
    },
    [currentPlanId, switchablePackages],
  )

  const confirmBuy = useCallback(async () => {
    const pkg = packages.find((p) => p.id === chosenId)
    if (!pkg) return
    if (currentPlanId && pkg.id === currentPlanId) {
      showToast(t('profile.alreadySubscribed'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      showToast(data.error ?? t('profile.checkoutFailed'))
    } catch {
      showToast(t('profile.networkError'))
    } finally {
      setBusy(false)
    }
  }, [chosenId, packages, currentPlanId, showToast, t])

  const clearCache = useCallback(() => {
    clearPosition()
    setCacheBytes(0)
    showToast(t('profile.cacheCleared'))
  }, [showToast, t])

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
            <h1>{t('profile.title')}</h1>
          </header>

          <div className="profile-grid">
            <div className="col">
              <div className="card profile-row">
                <span className="av" aria-hidden="true">
                  {initial}
                </span>
                <div className="body">
                  <div className="nm">{name || t('profile.userFallback')}</div>
                  <div className="sub">
                    <span className="num">{t('profile.idLabel', { id: shortId(email) })}</span>
                  </div>
                </div>
              </div>
              <div className="card">
                <p className="kicker">{t('profile.creditsTitle')}</p>
                <p className="amount">
                  <span className="num">{balance.creditsBalance ?? '—'}</span>
                  <span className="unit">{t('transactions.credits')}</span>
                </p>
                <p className="hint">{t('profile.creditsHint')}</p>
                {balance.subscription?.status === 'active' ? (
                  <p className="meta" style={{ marginTop: 8 }}>
                    {t('profile.subActive', { date: balance.subscription.periodEnd ? formatDate(balance.subscription.periodEnd, lang) : '' })}
                  </p>
                ) : (
                  <p className="meta" style={{ marginTop: 8 }}>{t('profile.subInactive')}</p>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: 16, width: '100%' }}
                  onClick={() => {
                    const current =
                      balance.subscription?.status === 'active' && balance.subscription.planId
                        ? packages.find((p) => p.id === balance.subscription?.planId)
                        : undefined
                    const target = current ?? midPackage
                    if (target) openBuy(target)
                    else router.push('/#pricing')
                  }}
                >
                  {balance.subscription?.status === 'active' ? t('profile.switchPlan') : t('profile.subscribe')}
                </button>
              </div>
            </div>

            <div className="col">
              <div className="card">
                <div className="sec-head">
                  <h2 className="h2" style={{ fontSize: 18 }}>
                    {t('profile.subscribe')}
                  </h2>
                  <p className="meta">{t('profile.plansMeta')}</p>
                </div>
                {packages.map((pkg) => (
                  <button key={pkg.id} type="button" className="row-item" onClick={() => openBuy(pkg)}>
                    <div className="body">
                      <div className="title">
                        {pkgName(t, pkg.id)}
                        <span className="tag-inline">{t('landing.planCreditsPerMonth', { n: pkg.credits })}</span>
                        {pkg.id === 'light' && <span className="tag-inline">{t('profile.mostPopular')}</span>}
                        {pkg.id === 'unlimited' && <span className="tag-inline">{t('profile.bestValue')}</span>}
                      </div>
                      <div className="sub">
                        {pkg.id === 'starter' && t('profile.starterDesc')}
                        {pkg.id === 'light' && t('profile.lightDesc')}
                        {pkg.id === 'unlimited' && t('profile.unlimitedDesc')}
                      </div>
                    </div>
                    <span className="price">${pkg.usd.toFixed(2)}<span className="unit" style={{ fontSize: 12, color: 'var(--muted)' }}>{t('profile.perMonth')}</span></span>
                    <IconChevron className="chev" />
                  </button>
                ))}
                {packages.length === 0 && <p className="meta" style={{ padding: '8px 0' }}>{t('profile.loading')}</p>}
              </div>

              <div className="card">
                <div className="sec-head">
                  <h2 className="h2" style={{ fontSize: 18 }}>
                    {t('profile.recordsTitle')}
                  </h2>
                  <p className="meta">{t('profile.recordsMeta')}</p>
                </div>
                <Link
                  href="/transactions"
                  className="row-item"
                  style={{ textDecoration: 'none', color: 'var(--fg)' }}
                >
                  <div className="body">
                    <div className="title">{t('profile.recordsLink')}</div>
                    <div className="sub">{t('profile.recordsLinkSub')}</div>
                  </div>
                  <IconChevron className="chev" />
                </Link>
              </div>
            </div>
          </div>

          <div className="card full">
            <div className="sec-head">
              <h2 className="h2">{t('profile.settingsTitle')}</h2>
            </div>
            <p className="group-label" style={{ marginTop: 0 }}>
              {t('profile.languageGroup')}
            </p>
            <div className="row-item">
              <div className="body">
                <div className="title">{t('profile.language')}</div>
                <div className="sub">{lang === 'zh' ? '中文' : 'English'}</div>
              </div>
              <LangSeg />
            </div>
            <p className="group-label">
              {t('reader.reading')}
            </p>
            <div className="row-item">
              <div className="body">
                <div className="title">{t('profile.skipCode')}</div>
                <div className="sub">{t('reader.skipCodeDesc')}</div>
              </div>
              <input type="checkbox" className="switch" checked={skipCode} onChange={toggleSkipCode} aria-label={t('profile.skipCode')} />
            </div>
            <div className="row-item">
              <div className="body">
                <div className="title">{t('profile.skipTable')}</div>
                <div className="sub">{t('reader.skipTableDesc')}</div>
              </div>
              <input type="checkbox" className="switch" checked={skipTable} onChange={toggleSkipTable} aria-label={t('profile.skipTable')} />
            </div>
            <p className="group-label">{t('profile.storageTitle')}</p>
            {status === 'authenticated' && balance.quotaBytes !== null && (
              <div className="row-item">
                <div className="body">
                  <div className="title">{t('profile.storageTitle')}</div>
                  <div className="sub">{t('profile.storageSub')}</div>
                </div>
                <span className="val">{t('profile.storageUsed', { used: formatBytes(usedBytes ?? 0), quota: formatBytes(balance.quotaBytes) })}</span>
              </div>
            )}
            <button type="button" className="row-item" onClick={clearCache}>
              <div className="body">
                <div className="title">{t('profile.clearCache')}</div>
                <div className="sub">{t('profile.clearCacheSub')}</div>
              </div>
              <span className="val" aria-label={t('profile.clearCache')}>{formatBytes(cacheBytes)}</span>
              <IconChevron className="chev" />
            </button>
            <p className="group-label">{t('profile.about')}</p>
            <div className="row-item">
              <div className="body">
                <div className="title">{t('profile.version')}</div>
                <div className="sub">{t('profile.versionVal')}</div>
              </div>
              <span className="val">0.1.0</span>
            </div>
          </div>

          {status === 'authenticated' && (
            <div style={{ maxWidth: 'var(--content-max)', marginTop: 20 }}>
              <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => signOut({ callbackUrl: '/' })}>
                {t('profile.signOut')}
              </button>
            </div>
          )}
          <p className="foot meta">{t('profile.foot')}</p>
        </section>
      </GuestGate>

      {selected && (
        <div className="modal-overlay show">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="m-title">
            <h3 id="m-title">{t('profile.modalTitle')}</h3>
            <p className="m-sub">
              {currentPlanId ? t('profile.modalSubSwitch') : t('profile.modalSub')}
            </p>
            <div className="m-plans">
              {switchablePackages.map((pkg) => {
                const chosen = pkg.id === chosenId
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    className={`m-plan${chosen ? ' chosen' : ''}`}
                    aria-pressed={chosen}
                    onClick={() => setChosenId(pkg.id)}
                  >
                    <span className="m-plan-name">{pkgName(t, pkg.id)}</span>
                    <span className="m-plan-credits">{t('landing.planCreditsPerMonth', { n: pkg.credits })}</span>
                    <span className="m-plan-price num">${pkg.usd.toFixed(2)}{t('profile.perMonth')}</span>
                  </button>
                )
              })}
              {switchablePackages.length === 0 && (
                <p className="meta" style={{ padding: '12px 0' }}>{t('profile.noOtherPlan')}</p>
              )}
            </div>
            <div className="m-actions">
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn-primary" onClick={() => void confirmBuy()} disabled={busy}>
                {busy ? t('transactions.loading') : t('profile.confirm')}
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
