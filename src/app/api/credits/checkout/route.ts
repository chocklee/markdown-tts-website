import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { createCheckoutSession } from '@/lib/payments/stripe'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  let body: { packageId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  const packageId = typeof body?.packageId === 'string' ? body.packageId : ''
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  try {
    const checkoutSession = await createCheckoutSession(session.user.id, packageId, appUrl)
    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('create checkout session failed', err)
    return NextResponse.json({ error: '创建支付会话失败，请稍后再试' }, { status: 400 })
  }
}
