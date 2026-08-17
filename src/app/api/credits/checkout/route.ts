import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { createCheckoutSession, cancelSubscription } from '@/lib/payments/stripe'
import { getActiveStripeSubscriptionId } from '@/lib/db/credits'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  let body: { packageId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const packageId = typeof body?.packageId === 'string' ? body.packageId : ''
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  try {
    const activeSubscriptionId = await getActiveStripeSubscriptionId(session.user.id)
    if (activeSubscriptionId) {
      await cancelSubscription(activeSubscriptionId)
    }
    const checkoutSession = await createCheckoutSession(session.user.id, packageId, appUrl)
    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('create checkout session failed', err)
    return NextResponse.json({ error: await serverT('server.checkoutFailed') }, { status: 400 })
  }
}
