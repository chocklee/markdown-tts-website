import { describe, it, expect, vi } from 'vitest'
import { findPackage, createCheckoutSession, verifyWebhookSignature } from '../stripe'

describe('findPackage', () => {
  it('按 id 找到套餐', () => {
    expect(findPackage('starter')?.usd).toBe(1.99)
    expect(findPackage('unlimited')?.credits).toBe(2200)
  })

  it('未知套餐返回 undefined', () => {
    expect(findPackage('nope')).toBeUndefined()
  })
})

describe('createCheckoutSession', () => {
  it('写入 metadata.userId 与 packageId，mode=payment', async () => {
    const mockSessionsCreate = vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/c/1' })
    const client = { checkout: { sessions: { create: mockSessionsCreate } } }
    await createCheckoutSession('u1', 'starter', 'https://app.example.com', client as never)
    expect(mockSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        metadata: expect.objectContaining({ userId: 'u1', packageId: 'starter', credits: '200' }),
        success_url: 'https://app.example.com/pricing?success=1&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://app.example.com/pricing?cancel=1',
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
