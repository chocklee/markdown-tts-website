import Stripe from 'stripe'

const PLANS = [
  { id: 'starter', name: '体验包（包月）', usd: 1.99, credits: 200 },
  { id: 'light', name: '轻量包（包月）', usd: 3.99, credits: 800 },
  { id: 'unlimited', name: '畅听包（包月）', usd: 9.99, credits: 2200 },
]

async function main() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  const stripe = new Stripe(key)
  const env: string[] = []
  for (const plan of PLANS) {
    const products = await stripe.products.list({ limit: 100 })
    let product = products.data.find((p) => p.name === plan.name && !p.active)
    if (product) {
      product = await stripe.products.update(product.id, { active: true })
    } else {
      product = products.data.find((p) => p.name === plan.name)
    }
    if (!product) {
      product = await stripe.products.create({ name: plan.name, metadata: { planId: plan.id, credits: String(plan.credits) } })
    }
    const prices = await stripe.prices.list({ product: product.id, limit: 100, active: true })
    let price = prices.data.find(
      (p) => p.unit_amount === Math.round(plan.usd * 100) && p.recurring?.interval === 'month',
    )
    if (!price) {
      price = await stripe.prices.create({
        product: product.id,
        currency: 'usd',
        unit_amount: Math.round(plan.usd * 100),
        recurring: { interval: 'month' },
        metadata: { planId: plan.id },
      })
    }
    env.push(`STRIPE_PRICE_${plan.id.toUpperCase()}=${price.id}`)
    console.log(`✓ ${plan.name}  $${plan.usd}/月  ${plan.credits} 积分  price=${price.id}`)
  }
  console.log('\n请把以下变量加入 .env.local 与 Vercel 环境变量：')
  for (const line of env) console.log(line)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
