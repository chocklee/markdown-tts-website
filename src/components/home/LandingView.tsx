'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { CREDIT_PACKAGES, CONFIG } from '@/lib/config'
import { useI18n, LangSeg } from '@/lib/i18n'
import { pkgName } from '@/lib/i18n/packages'
import {
  IconPlay,
  IconSparkle,
  IconOutline,
  IconGlobe,
  IconChat,
  IconCloud,
  IconChevron,
} from '@/components/app/icons'

type T = (key: string, vars?: Record<string, string | number>) => string

function formatReadChars(credits: number, t: T): string {
  const chars = Math.floor((credits / CONFIG.credits.ttsCreditsPer100Chars) * 100)
  if (chars >= 10000) {
    const n = (chars / 10000).toFixed(1).replace(/\.0$/, '')
    return t('landing.charsWan', { n })
  }
  return t('landing.charsK', { n: Math.round(chars / 1000) })
}

export function LandingView() {
  const { status } = useSession()
  const { t } = useI18n()
  const authed = status === 'authenticated'
  const startHref = authed ? '/library' : '/login'
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState('light')

  const FEATURES = [
    { Icon: IconPlay, title: t('landing.f1t'), desc: t('landing.f1d') },
    { Icon: IconSparkle, title: t('landing.f2t'), desc: t('landing.f2d') },
    { Icon: IconOutline, title: t('landing.f3t'), desc: t('landing.f3d') },
    { Icon: IconGlobe, title: t('landing.f4t'), desc: t('landing.f4d') },
    { Icon: IconChat, title: t('landing.f5t'), desc: t('landing.f5d') },
    { Icon: IconCloud, title: t('landing.f6t'), desc: t('landing.f6d') },
  ]

  const FREE_PLAN = {
    kicker: t('landing.freeKicker'),
    title: t('landing.freeTitle'),
    price: '0',
    unit: t('landing.freeUnit'),
    items: [t('landing.freeItem1'), t('landing.freeItem2'), t('landing.freeItem3')],
    cta: t('landing.freeCta'),
  }

  const PAID_PLANS = CREDIT_PACKAGES.map((pkg) => ({
    id: pkg.id,
    kicker: pkgName(t, pkg.id),
    title: t('landing.planCreditsPerMonth', { n: pkg.credits }),
    price: `$${pkg.usd}`,
    unit: t('landing.planUnit'),
    items: [
      t('landing.planItem1', { n: formatReadChars(pkg.credits, t) }),
      t('landing.planItem2'),
      t('landing.planItem3'),
      t('landing.planItem4'),
    ],
  }))

  const FAQ = [
    { q: t('landing.faq1q'), a: t('landing.faq1a') },
    { q: t('landing.faq2q'), a: t('landing.faq2a') },
    { q: t('landing.faq3q'), a: t('landing.faq3a') },
    { q: t('landing.faq4q'), a: t('landing.faq4a') },
  ]

  const jumpToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('success')) setNotice(t('landing.noticeSuccess'))
    else if (sp.get('cancel')) setNotice(t('landing.noticeCancel'))
  }, [t])

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const toTop = () => {
      if (!window.location.hash) window.scrollTo(0, 0)
    }
    toTop()
    window.addEventListener('pageshow', toTop)
    return () => window.removeEventListener('pageshow', toTop)
  }, [])

  const buy = async (packageId: string) => {
    if (!authed) {
      window.location.href = '/login'
      return
    }
    setBusyId(packageId)
    setNotice('')
    try {
      const res = await fetch('/api/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
      setNotice(data.error ?? t('profile.checkoutFailed'))
    } catch {
      setNotice(t('profile.networkError'))
    }
    setBusyId(null)
  }

  return (
    <div className="landing">
      <header className="site-header">
        <div className="brand">
          <p className="word">墨听</p>
          <span className="cap">{t('brand.tagline')}</span>
        </div>
        <nav className="site-nav landing-nav" aria-label={t('landing.headerFeatures')}>
          <a className="site-link" href="#features" onClick={(e) => jumpToSection(e, 'features')}>{t('landing.headerFeatures')}</a>
          <a className="site-link" href="#pricing" onClick={(e) => jumpToSection(e, 'pricing')}>{t('landing.headerPricing')}</a>
          <a className="site-link" href="#faq" onClick={(e) => jumpToSection(e, 'faq')}>{t('landing.headerFaq')}</a>
        </nav>
        {authed ? (
          <>
            <Link className="site-link" href="/profile">{t('landing.headerProfile')}</Link>
            <Link className="site-link solid" href={startHref}>{t('landing.headerLibrary')}</Link>
          </>
        ) : (
          <>
            <Link className="site-link" href="/login">{t('landing.headerLogin')}</Link>
            <Link className="site-link solid" href={startHref}>{t('landing.headerFreeStart')}</Link>
          </>
        )}
        <LangSeg />
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="kicker">{t('landing.heroKicker')}</p>
          <h1 className="hero-title">
            {t('landing.heroTitle1')}
            <br />
            <span className="accent-word">{t('landing.heroTitle2')}</span>
          </h1>
          <p className="hero-sub">{t('landing.heroSub')}</p>
          <div className="hero-cta">
            <Link href={startHref} className="btn-primary">
              {authed ? t('landing.heroCtaPrimaryAuthed') : t('landing.heroCtaPrimaryGuest')}
            </Link>
            <a href="#features" className="btn-secondary">{t('landing.heroCtaSecondary')}</a>
          </div>
          <p className="hero-notes">{t('landing.heroNotes')}</p>
        </div>

        <div className="hero-stage" aria-hidden="true">
          <div className="card mock-doc">
            <div className="mock-doc-head">
              <span className="file-icon">MD</span>
              <div>
                <div className="mock-title">{t('landing.mockTitle')}</div>
                <div className="mock-meta">{t('landing.mockMeta')}</div>
              </div>
            </div>
            <div className="mock-lines">
              <span className="line w-100" />
              <span className="line w-90" />
              <span className="line active w-70" />
              <span className="line w-95" />
              <span className="line w-85" />
            </div>
            <div className="mock-player">
              <div className="p-track">
                <span className="rail" />
                <span className="fill" style={{ width: '46%' }} />
              </div>
              <div className="p-row">
                <span className="c-btn play"><IconPlay /></span>
                <div className="p-info">
                  <div className="t">{t('landing.mockPlayer')}</div>
                  <div className="m">2:41 / 5:52</div>
                </div>
              </div>
            </div>
          </div>
          <div className="mock-qa card">
            <p className="q">{t('landing.mockQaQ')}</p>
            <p className="a">{t('landing.mockQaA')}</p>
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <div className="section-head">
          <p className="kicker">{t('landing.featuresKicker')}</p>
          <h2 className="section-title">{t('landing.featuresTitle')}</h2>
          <p className="section-sub">{t('landing.featuresSub')}</p>
        </div>
        <div className="feat-grid">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div className="card feat-card" key={title}>
              <Icon />
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="section">
        <div className="section-head">
          <p className="kicker">{t('landing.pricingKicker')}</p>
          <h2 className="section-title">{t('landing.pricingTitle')}</h2>
          <p className="section-sub">{t('landing.pricingSub')}</p>
        </div>
        {notice && <p className="plan-notice">{notice}</p>}
        <div className="plans">
          <div className="card plan-card">
            <p className="kicker">{FREE_PLAN.kicker}</p>
            <h3>{FREE_PLAN.title}</h3>
            <p className="price">
              {FREE_PLAN.price}
              <small>{FREE_PLAN.unit}</small>
            </p>
            <ul>
              {FREE_PLAN.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link
              href={startHref}
              className="btn-secondary"
              style={{ width: '100%', textDecoration: 'none' }}
            >
              {FREE_PLAN.cta}
            </Link>
          </div>
          {PAID_PLANS.map((plan) => {
            const selected = selectedId === plan.id
            return (
              <div
                className={`card plan-card${selected ? ' selected' : ''}`}
                key={plan.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setSelectedId(plan.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelectedId(plan.id)
                  }
                }}
              >
                {selected && <span className="plan-check">{t('landing.planSelected')}</span>}
                <p className="kicker">{plan.kicker}</p>
                <h3>{plan.title}</h3>
                <p className="price">
                  {plan.price}
                  <small>{plan.unit}</small>
                </p>
                <ul>
                  {plan.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={selected ? 'btn-primary' : 'btn-secondary'}
                  onClick={() => void buy(plan.id)}
                  disabled={busyId === plan.id}
                  style={{ width: '100%' }}
                >
                  {busyId === plan.id ? t('transactions.loading') : authed ? t('landing.planBuy') : t('landing.planBuyAfterLogin')}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section id="faq" className="section">
        <div className="section-head">
          <p className="kicker">{t('landing.faqKicker')}</p>
          <h2 className="section-title">{t('landing.faqTitle')}</h2>
        </div>
        <div className="faq-list">
          {FAQ.map(({ q, a }) => (
            <details className="faq-item" key={q}>
              <summary>
                {q}
                <IconChevron className="faq-chev" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="landing-foot">
        <div className="brand">
          <p className="word">墨听</p>
          <span className="cap">{t('landing.footCap')}</span>
        </div>
        <p className="meta">{t('landing.footCopy')}</p>
      </footer>
    </div>
  )
}
