import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { verifyWebhookSignature, retrieveSubscription, findPackage } from '@/lib/payments/stripe'
import {
  creditPurchase,
  recordSubscriptionCustomer,
  subscriptionExpired,
  subscriptionGrant,
} from '@/lib/db/credits'

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

  try {
    if (event.type === 'checkout.session.completed') {
      const checkoutSession = event.data.object as Stripe.Checkout.Session
      const userId = checkoutSession.metadata?.userId
      if (checkoutSession.mode === 'subscription' && userId) {
        const subscriptionId =
          typeof checkoutSession.subscription === 'string' ? checkoutSession.subscription : ''
        const customerId = typeof checkoutSession.customer === 'string' ? checkoutSession.customer : ''
        if (subscriptionId && customerId) {
          await recordSubscriptionCustomer(userId, customerId, subscriptionId)
        }
      } else if (userId && checkoutSession.id) {
        const packageId = checkoutSession.metadata?.packageId ?? ''
        const credits = Number(checkoutSession.metadata?.credits ?? 0)
        if (credits > 0) {
          await creditPurchase(userId, packageId, credits, checkoutSession.id, {
            paymentStatus: checkoutSession.payment_status,
            amountTotal: checkoutSession.amount_total,
            currency: checkoutSession.currency,
          })
        }
      }
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice
      const parentSub = invoice.parent?.subscription_details?.subscription
      const subscriptionId = typeof parentSub === 'string' ? parentSub : parentSub?.id
      if (subscriptionId) {
        const subscription = await retrieveSubscription(subscriptionId)
        const invoiceMeta = invoice.parent?.subscription_details?.metadata ?? {}
        const userId = subscription.metadata?.userId ?? invoiceMeta.userId
        const planId = subscription.metadata?.packageId ?? invoiceMeta.packageId ?? ''
        const pkg = userId && planId ? findPackage(planId) : undefined
        if (userId && pkg) {
          const periodEndIso = new Date(invoice.period_end * 1000).toISOString()
          const customerId =
            typeof subscription.customer === 'string' ? subscription.customer : null
          await subscriptionGrant(userId, pkg.id, pkg.credits, subscription.id, customerId, periodEndIso, {
            invoiceId: invoice.id,
            amountPaid: invoice.amount_paid,
            currency: invoice.currency,
          })
        }
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      const userId = subscription.metadata?.userId
      if (userId) {
        await subscriptionExpired(userId, subscription.id, {
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        })
      }
    }
  } catch (err) {
    console.error('stripe webhook handling failed', err)
    return NextResponse.json({ error: 'webhook handling failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
