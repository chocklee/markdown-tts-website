'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useUiStore } from '@/lib/state/uiStore'
import { useI18n } from '@/lib/i18n'
import { IconLibrary, IconProfile, IconLock, IconCard } from './icons'

export type AppNav = 'library' | 'reader' | 'profile'

interface AccountState {
  creditsBalance: number | null
  purchased: boolean
  refresh: () => Promise<void>
}

const AccountContext = createContext<AccountState>({
  creditsBalance: null,
  purchased: false,
  refresh: async () => {},
})

export function useAccount(): AccountState {
  return useContext(AccountContext)
}

function navItems(t: (k: string, v?: Record<string, string | number>) => string) {
  return [
    { key: 'library' as const, href: '/library', label: t('nav.library'), Icon: IconLibrary },
    { key: 'profile' as const, href: '/profile', label: t('nav.profile'), Icon: IconProfile },
  ]
}

export function AppShell({ nav, children }: { nav: AppNav; children: ReactNode }) {
  const { status, data: session } = useSession()
  const toast = useUiStore((s) => s.toast)
  const { t } = useI18n()
  const NAV_ITEMS = navItems(t)
  const [credits, setCredits] = useState({ creditsBalance: null as number | null, purchased: false })

  const refresh = async () => {
    if (status !== 'authenticated') return
    try {
      const res = await fetch('/api/credits/balance')
      if (!res.ok) return
      const data = (await res.json()) as { creditsBalance?: number; purchased?: boolean }
      setCredits({
        creditsBalance: typeof data.creditsBalance === 'number' ? data.creditsBalance : null,
        purchased: Boolean(data.purchased),
      })
    } catch {
      // 静默忽略，保持未登录态显示
    }
  }

  useEffect(() => {
    void refresh()
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const authenticated = status === 'authenticated'
  const name = session?.user?.name ?? (session?.user?.email ? session.user.email.split('@')[0] : '')
  const initial = (name || '墨')[0]
  const navLabel = nav === 'reader' ? t('nav.library') : NAV_ITEMS.find((i) => i.key === nav)?.label ?? t('nav.library')

  return (
    <AccountContext.Provider value={{ creditsBalance: credits.creditsBalance, purchased: credits.purchased, refresh }}>
      <div className="app flex min-h-0 flex-1">
        <aside className="sidebar" aria-label={t('shell.sidebarLabel')}>
          <div className="brand">
            <p className="word">墨听</p>
            <span className="cap">{t('brand.cap')}</span>
          </div>
          <nav className="nav" aria-label={t('nav.library')}>
            {NAV_ITEMS.map(({ key, href, label, Icon }) => (
              <Link key={key} href={href} className={`nav-item ${nav === key ? 'active' : ''}`}>
                <Icon />
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/profile" className="side-user" aria-label={t('nav.profile')}>
            {authenticated ? (
              <>
                <span className="av" aria-hidden="true">{initial}</span>
                <div>
                  <div className="nm">{name || t('profile.userFallback')}</div>
                  <div className="cr">
                    <span className="num">{credits.creditsBalance ?? '—'}</span> {t('transactions.credits')}
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className="av guest" aria-hidden="true"><IconProfile /></span>
                <div>
                  <div className="nm">{t('shell.guestName')}</div>
                  <div className="cr">{t('shell.guestHint')}</div>
                </div>
              </>
            )}
          </Link>
        </aside>

        <div className="main">
          <div className="topbar">
            <div className="brand">
              <p className="word">墨听</p>
              <span className="cap">{navLabel}</span>
            </div>
            <nav className="nav" aria-label={t('nav.library')}>
              {NAV_ITEMS.map(({ key, href, label, Icon }) => (
                <Link key={key} href={href} className={`nav-item ${nav === key ? 'active' : ''}`}>
                  <Icon />
                  {label}
                </Link>
              ))}
            </nav>
            {authenticated ? (
              <span className="credit-pill">
                <span className="num">
                  <b>{credits.creditsBalance ?? '—'}</b>
                </span>{' '}
                {t('transactions.credits')}
              </span>
            ) : (
              <Link href="/login" className="credit-pill" style={{ textDecoration: 'none' }}>
                {t('shell.login')}
              </Link>
            )}
          </div>
          {children}
        </div>
      </div>

      <nav className="tabnav" aria-label={t('shell.tabnavLabel')}>
        {NAV_ITEMS.map(({ key, href, label, Icon }) => (
          <Link key={key} href={href} className={`tab ${nav === key ? 'active' : ''}`}>
            <Icon />
            {label}
          </Link>
        ))}
      </nav>

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </AccountContext.Provider>
  )
}

export function GuestGate({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const { t } = useI18n()

  if (status === 'loading') return null
  if (status === 'unauthenticated') {
    return (
      <div className="view active">
        <div className="guest-wrap">
          <div className="card guest-card">
            <div className="brand guest-brand">
              <p className="word">墨听</p>
              <span className="cap">{t('brand.cap')}</span>
            </div>
            <h1 className="guest-title">{t('shell.guestTitle')}</h1>
            <p className="guest-desc">{t('shell.guestDesc')}</p>
            <div className="guest-benefits">
              <div className="gb">
                <IconLibrary />
                {t('shell.benefit1')}
              </div>
              <div className="gb">
                <IconCard />
                {t('shell.benefit2')}
              </div>
              <div className="gb">
                <IconLock />
                {t('shell.benefit3')}
              </div>
            </div>
            <Link href="/login" className="btn-primary" style={{ width: '100%', textDecoration: 'none' }}>
              {t('shell.login')}
            </Link>
          </div>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
