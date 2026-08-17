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

export function getStripePriceId(planId: string): string {
  const envKey = `STRIPE_PRICE_${planId.toUpperCase()}`
  const priceId = process.env[envKey]
  if (!priceId) throw new Error(`${envKey} is not set`)
  return priceId
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
    mode: 'subscription',
    line_items: [
      {
        price: getStripePriceId(pkg.id),
        quantity: 1,
      },
    ],
    subscription_data: {
      metadata: { userId, packageId },
    },
    metadata: { userId, packageId },
    success_url: `${appUrl}?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}?cancel=1`,
  })
}

export async function cancelSubscription(
  subscriptionId: string,
  client: Pick<Stripe, 'subscriptions'> = getStripe(),
): Promise<void> {
  await client.subscriptions.cancel(subscriptionId)
}

export async function retrieveSubscription(
  subscriptionId: string,
  client: Pick<Stripe, 'subscriptions'> = getStripe(),
): Promise<Stripe.Subscription> {
  return client.subscriptions.retrieve(subscriptionId)
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
