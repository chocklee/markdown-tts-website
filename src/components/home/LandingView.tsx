'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { CREDIT_PACKAGES, CONFIG } from '@/lib/config'
import {
  IconPlay,
  IconSparkle,
  IconOutline,
  IconGlobe,
  IconChat,
  IconCloud,
  IconChevron,
} from '@/components/app/icons'

function formatReadChars(credits: number): string {
  const chars = Math.floor((credits / CONFIG.credits.ttsCreditsPer100Chars) * 100)
  if (chars >= 10000) return `约 ${(chars / 10000).toFixed(1).replace(/\.0$/, '')} 万字`
  return `约 ${Math.round(chars / 1000)} 千字`
}

const FEATURES = [
  { Icon: IconPlay, title: 'AI 朗读', desc: '多音色可选、语速可调，播放时逐句高亮跟读，长文档也能安心听完。' },
  { Icon: IconSparkle, title: '讲解模式', desc: 'AI 把原文改写成更容易理解的讲解稿，再用地道语音读给你听。' },
  { Icon: IconOutline, title: '逐句模式', desc: '每句朗读后自动停顿，留出思考时间，适合精读与语言学习。' },
  { Icon: IconGlobe, title: '多语言收听', desc: '选择目标语言，先翻译再朗读，跨语言阅读不再有门槛。' },
  { Icon: IconChat, title: '文档问答', desc: '播放中打开对话侧栏，围绕当前文档直接提问，边听边答疑。' },
  { Icon: IconCloud, title: '云端同步', desc: '文库、收听进度与积分余额跨设备同步，随时接着听。' },
]

const FREE_PLAN = {
  kicker: '免费版',
  title: '注册即送 50 积分',
  price: '0',
  unit: '元',
  items: ['100MB 云端存储', '浏览器语音免费朗读', 'AI 音色按字数计积分'],
  cta: '免费开始',
}

const PAID_PLANS = CREDIT_PACKAGES.map((pkg) => ({
  id: pkg.id,
  kicker: pkg.name,
  title: `${pkg.credits} 积分`,
  price: `$${pkg.usd}`,
  unit: 'USD',
  items: [`AI 音色朗读 · ${formatReadChars(pkg.credits)}`, '讲解 / 逐句 / 多语言收听', '存储配额升级 1G（永久）'],
}))

const FAQ = [
  { q: '怎么收费？', a: '注册即送 50 积分。AI 朗读与 Pro 功能按字数消耗积分，浏览器自带语音免费使用、不扣积分；积分包可在首页直接购买：体验包 $1.99 / 200 积分，轻量包 $3.99 / 800 积分，畅听包 $9.99 / 2200 积分，购买任意套餐存储配额升级 1G。' },
  { q: '支持哪些语言？', a: '内置中英文等多款音色；多语言收听会把文档先翻译成目标语言，再以对应音色朗读。' },
  { q: '文档内容安全吗？', a: '文档仅你自己可见，登录后加密同步到云端，可随时删除或彻底清除。' },
  { q: '需要登录才能用吗？', a: '需要。登录后文库、收听进度与积分才能跨设备同步；未登录时只能在本机创建文档。' },
]

export function LandingView() {
  const { status } = useSession()
  const authed = status === 'authenticated'
  const startHref = authed ? '/library' : '/login'
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState('light')

  const jumpToSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('success')) setNotice('支付成功，积分已到账！')
    else if (sp.get('cancel')) setNotice('已取消支付')
  }, [])

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
      setNotice(data.error ?? '创建支付会话失败，请稍后再试')
    } catch {
      setNotice('网络错误，请稍后再试')
    }
    setBusyId(null)
  }

  return (
    <div className="landing">
      <header className="site-header">
        <div className="brand">
          <p className="word">墨听</p>
          <span className="cap">把 Markdown 变成声音</span>
        </div>
        <nav className="site-nav landing-nav" aria-label="页面导航">
          <a className="site-link" href="#features" onClick={(e) => jumpToSection(e, 'features')}>功能</a>
          <a className="site-link" href="#pricing" onClick={(e) => jumpToSection(e, 'pricing')}>积分</a>
          <a className="site-link" href="#faq" onClick={(e) => jumpToSection(e, 'faq')}>常见问题</a>
        </nav>
        {authed ? (
          <>
            <Link className="site-link" href="/profile">我的</Link>
            <Link className="site-link solid" href={startHref}>进入文库</Link>
          </>
        ) : (
          <>
            <Link className="site-link" href="/login">登录 / 注册</Link>
            <Link className="site-link solid" href={startHref}>免费开始</Link>
          </>
        )}
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="kicker">Markdown → 声音</p>
          <h1 className="hero-title">
            把文档变成
            <br />
            <span className="accent-word">听得懂的声音</span>
          </h1>
          <p className="hero-sub">
            粘贴或上传 Markdown，AI 朗读、讲解、多语言收听，逐句停顿留出思考时间，播放中还能随时提问。
          </p>
          <div className="hero-cta">
            <Link href={startHref} className="btn-primary">
              {authed ? '进入文库' : '免费开始'}
            </Link>
            <a href="#features" className="btn-secondary">了解功能</a>
          </div>
          <p className="hero-notes">注册即送 50 积分 · 浏览器语音免费 · 无需信用卡</p>
        </div>

        <div className="hero-stage" aria-hidden="true">
          <div className="card mock-doc">
            <div className="mock-doc-head">
              <span className="file-icon">MD</span>
              <div>
                <div className="mock-title">AI 时代的阅读方式</div>
                <div className="mock-meta">Markdown · 1240 字 · 约 6 分钟</div>
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
                  <div className="t">讲解模式 · 逐句跟读</div>
                  <div className="m">2:41 / 5:52</div>
                </div>
              </div>
            </div>
          </div>
          <div className="mock-qa card">
            <p className="q">这篇文档讲了什么？</p>
            <p className="a">正在围绕文档内容生成回答…</p>
          </div>
        </div>
      </section>

      <section id="features" className="section">
        <div className="section-head">
          <p className="kicker">功能</p>
          <h2 className="section-title">从看到听，只需要一次粘贴</h2>
          <p className="section-sub">围绕朗读打造的一整套体验，适合阅读、学习与碎片时间</p>
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
          <p className="kicker">积分</p>
          <h2 className="section-title">免费起步，按需购买</h2>
          <p className="section-sub">AI 语音按字数消耗积分，购买任意套餐后存储配额升级</p>
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
              {selected && <span className="plan-check">✓ 已选</span>}
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
                {busyId === plan.id ? '处理中…' : authed ? '立即购买' : '登录后购买'}
              </button>
            </div>
            )
          })}
        </div>
      </section>

      <section id="faq" className="section">
        <div className="section-head">
          <p className="kicker">常见问题</p>
          <h2 className="section-title">还有疑问？</h2>
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
          <span className="cap">文库 · 有声文件</span>
        </div>
        <p className="meta">© 2026 墨听 · 把 Markdown 变成声音</p>
      </footer>
    </div>
  )
}
