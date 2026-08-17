import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { getCreditsBalance, hasActiveSubscription, getSubscription } from '@/lib/db/credits'
import { getUserQuotaBytes } from '@/lib/db/documents'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  try {
    const [creditsBalance, quotaBytes, purchased, subscription] = await Promise.all([
      getCreditsBalance(session.user.id),
      getUserQuotaBytes(session.user.id),
      hasActiveSubscription(session.user.id),
      getSubscription(session.user.id),
    ])
    return NextResponse.json({ creditsBalance, quotaBytes, purchased, subscription })
  } catch (err) {
    console.error('get credits balance failed', err)
    return NextResponse.json({ error: '操作失败，请稍后再试' }, { status: 500 })
  }
}
