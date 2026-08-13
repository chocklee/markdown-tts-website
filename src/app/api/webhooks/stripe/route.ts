import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { verifyWebhookSignature } from '@/lib/payments/stripe'
import { creditPurchase } from '@/lib/db/credits'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const payload = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''
  let event: Stripe.Event
  try {
    event = verifyWebhookSignature(payload, signature)
  } catch (err) {
    console.error('stripe webhook signature verification failed', err)
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const checkoutSession = event.data.object as Stripe.Checkout.Session
    const userId = checkoutSession.metadata?.userId
    const packageId = checkoutSession.metadata?.packageId ?? ''
    const credits = Number(checkoutSession.metadata?.credits ?? 0)
    if (userId && checkoutSession.id && credits > 0) {
      try {
        await creditPurchase(userId, packageId, credits, checkoutSession.id, {
          paymentStatus: checkoutSession.payment_status,
          amountTotal: checkoutSession.amount_total,
          currency: checkoutSession.currency,
        })
      } catch (err) {
        console.error('credit purchase failed', err)
        return NextResponse.json({ error: 'crediting failed' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ received: true })
}
