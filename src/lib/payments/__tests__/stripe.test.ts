import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { findPackage, createCheckoutSession, verifyWebhookSignature, getStripePriceId } from '../stripe'

describe('findPackage', () => {
  it('按 id 找到套餐', () => {
    expect(findPackage('starter')?.usd).toBe(1.99)
    expect(findPackage('unlimited')?.credits).toBe(2200)
  })

  it('未知套餐返回 undefined', () => {
    expect(findPackage('nope')).toBeUndefined()
  })
})

describe('getStripePriceId', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('从环境变量读取套餐价格 ID', () => {
    vi.stubEnv('STRIPE_PRICE_STARTER', 'price_1_test')
    expect(getStripePriceId('starter')).toBe('price_1_test')
  })

  it('未配置时抛错', () => {
    vi.stubEnv('STRIPE_PRICE_STARTER', '')
    expect(() => getStripePriceId('starter')).toThrow('STRIPE_PRICE_STARTER is not set')
  })
})

describe('createCheckoutSession', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_PRICE_STARTER', 'price_1_test')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('写入 metadata.userId 与 packageId，mode=subscription', async () => {
    const mockSessionsCreate = vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/1' })
    const client = { checkout: { sessions: { create: mockSessionsCreate } } }
    await createCheckoutSession('u1', 'starter', 'https://app.example.com', client as never)
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_1_test', quantity: 1 }],
        subscription_data: expect.objectContaining({ metadata: expect.objectContaining({ userId: 'u1', packageId: 'starter' }) }),
        metadata: expect.objectContaining({ userId: 'u1', packageId: 'starter' }),
        success_url: 'https://app.example.com?success=1&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://app.example.com?cancel=1',
      }),
    )
  })

  it('未知套餐抛出错误', async () => {
    const mockSessionsCreate = vi.fn()
    const client = { checkout: { sessions: { create: mockSessionsCreate } } }
    await expect(
      createCheckoutSession('u1', 'nope', 'https://app.example.com', client as never),
    ).rejects.toThrow('unknown package')
    expect(mockSessionsCreate).not.toHaveBeenCalled()
  })
})

describe('verifyWebhookSignature', () => {
  it('调用 constructEvent 并返回事件', () => {
    const mockConstructEvent = vi.fn().mockReturnValue({ type: 'checkout.session.completed' })
    const client = { webhooks: { constructEvent: mockConstructEvent } }
    const event = verifyWebhookSignature('payload', 'sig', 'whsec_test', client as never)
    expect(event).toEqual({ type: 'checkout.session.completed' })
    expect(mockConstructEvent).toHaveBeenCalledWith('payload', 'sig', 'whsec_test')
  })

  it('验签失败抛错', () => {
    const mockConstructEvent = vi.fn().mockImplementation(() => {
      throw new Error('bad signature')
    })
    const client = { webhooks: { constructEvent: mockConstructEvent } }
    expect(() => verifyWebhookSignature('payload', 'sig', 'whsec_test', client as never)).toThrow(
      'bad signature',
    )
  })

  it('未提供密钥时抛错', () => {
    expect(() => verifyWebhookSignature('payload', 'sig', '', undefined)).toThrow(
      'STRIPE_WEBHOOK_SECRET is not set',
    )
  })
})
