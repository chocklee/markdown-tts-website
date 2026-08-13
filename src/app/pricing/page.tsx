'use client'
import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { PackageCards, type PackageInfo } from '@/components/pricing/PackageCards'

function PricingContent() {
  const { status } = useSession()
  const searchParams = useSearchParams()
  const [packages, setPackages] = useState<PackageInfo[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void fetch('/api/credits/packages')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPackages(data?.packages ?? []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') return
    void fetch('/api/credits/balance')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBalance(data?.creditsBalance ?? null))
      .catch(() => {})
  }, [status])

  useEffect(() => {
    if (searchParams.get('success')) setNotice('支付成功，积分已到账！')
    else if (searchParams.get('cancel')) setNotice('已取消支付')
  }, [searchParams])

  const buy = useCallback(async (packageId: string) => {
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
      } else {
        setNotice(data.error ?? '创建支付会话失败')
        setBusyId(null)
      }
    } catch {
      setNotice('网络错误，请稍后再试')
      setBusyId(null)
    }
  }, [])

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-center text-3xl font-bold text-slate-900">购买积分</h1>
      <p className="mt-3 text-center text-slate-600">
        积分用于云端 AI 语音朗读与 Pro 功能；购买任意套餐后存储配额永久升级 1G
      </p>
      {status === 'authenticated' && balance !== null && (
        <p className="mt-4 text-center text-sm text-slate-500">当前余额：{balance} 积分</p>
      )}
      {notice && <p className="mt-4 text-center text-sm font-medium text-emerald-600">{notice}</p>}

      <div className="mt-8">
        <PackageCards packages={packages} onBuy={buy} busyId={busyId} />
      </div>

      {status !== 'authenticated' && (
        <p className="mt-8 text-center text-sm text-slate-500">
          需要登录后才能购买，<Link href="/login" className="text-blue-600 hover:underline">去登录</Link>
        </p>
      )}
      <p className="mt-8 text-center text-xs text-slate-400">
        支付由 Stripe 安全处理（美元结算）。当前为国际用户提供体验；国内支付方式筹备中。
      </p>
    </main>
  )
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingContent />
    </Suspense>
  )
}
