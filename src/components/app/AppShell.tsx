'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useUiStore } from '@/lib/state/uiStore'
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

const NAV_ITEMS: { key: AppNav; href: string; label: string; Icon: typeof IconLibrary }[] = [
  { key: 'library', href: '/library', label: '文库', Icon: IconLibrary },
  { key: 'profile', href: '/profile', label: '我的', Icon: IconProfile },
]

export function AppShell({ nav, children }: { nav: AppNav; children: ReactNode }) {
  const { status, data: session } = useSession()
  const toast = useUiStore((s) => s.toast)
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
  const navLabel = nav === 'reader' ? '文库' : NAV_ITEMS.find((i) => i.key === nav)?.label ?? '文库'

  return (
    <AccountContext.Provider value={{ creditsBalance: credits.creditsBalance, purchased: credits.purchased, refresh }}>
      <div className="app flex min-h-0 flex-1">
        <aside className="sidebar" aria-label="侧边导航">
          <div className="brand">
            <p className="word">墨听</p>
            <span className="cap">文库 · 有声文件</span>
          </div>
          <nav className="nav" aria-label="主导航">
            {NAV_ITEMS.map(({ key, href, label, Icon }) => (
              <Link key={key} href={href} className={`nav-item ${nav === key ? 'active' : ''}`}>
                <Icon />
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/profile" className="side-user" aria-label="我的账户">
            {authenticated ? (
              <>
                <span className="av" aria-hidden="true">{initial}</span>
                <div>
                  <div className="nm">{name || '墨听用户'}</div>
                  <div className="cr">
                    <span className="num">{credits.creditsBalance ?? '—'}</span> 积分
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className="av guest" aria-hidden="true"><IconProfile /></span>
                <div>
                  <div className="nm">未登录</div>
                  <div className="cr">登录后同步文库与积分</div>
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
            <nav className="nav" aria-label="主导航">
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
                积分
              </span>
            ) : (
              <Link href="/login" className="credit-pill" style={{ textDecoration: 'none' }}>
                登录 / 注册
              </Link>
            )}
          </div>
          {children}
        </div>
      </div>

      <nav className="tabnav" aria-label="底部导航">
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

  if (status === 'loading') return null
  if (status === 'unauthenticated') {
    return (
      <div className="view active">
        <div className="guest-wrap">
          <div className="card guest-card">
            <div className="brand guest-brand">
              <p className="word">墨听</p>
              <span className="cap">文库 · 有声文件</span>
            </div>
            <h1 className="guest-title">登录后继续</h1>
            <p className="guest-desc">登录后可同步文库、积分与消费记录，购买的高级音色与长文档朗读支持跨设备使用。</p>
            <div className="guest-benefits">
              <div className="gb">
                <IconLibrary />
                文库与收听进度云同步
              </div>
              <div className="gb">
                <IconCard />
                积分余额与消费记录
              </div>
              <div className="gb">
                <IconLock />
                高级音色 · 长文档朗读
              </div>
            </div>
            <Link href="/login" className="btn-primary" style={{ width: '100%', textDecoration: 'none' }}>
              登录 / 注册
            </Link>
          </div>
        </div>
      </div>
    )
  }
  return <>{children}</>
}
