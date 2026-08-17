import Stripe from 'stripe'
import { CREDIT_PACKAGES } from '@/lib/config'

export function findPackage(id: string) {
  return CREDIT_PACKAGES.find((p) => p.id === id)
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  return new Stripe(key)
}

export async function createCheckoutSession(
  userId: string,
  packageId: string,
  appUrl: string,
  client: Pick<Stripe, 'checkout'> = getStripe(),
): Promise<Stripe.Checkout.Session> {
  const pkg = findPackage(packageId)
  if (!pkg) throw new Error('unknown package')
  return client.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `${pkg.name}（${pkg.credits} 积分）` },
          unit_amount: Math.round(pkg.usd * 100),
        },
        quantity: 1,
      },
    ],
    metadata: { userId, packageId, credits: String(pkg.credits) },
    success_url: `${appUrl}?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}?cancel=1`,
  })
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret?: string,
  client?: Pick<Stripe, 'webhooks'>,
): Stripe.Event {
  const resolvedSecret = secret ?? process.env.STRIPE_WEBHOOK_SECRET
  if (!resolvedSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set')
  const resolvedClient = client ?? getStripe()
  return resolvedClient.webhooks.constructEvent(payload, signature, resolvedSecret)
}
