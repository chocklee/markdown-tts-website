import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { isRateLimited, clientIp } from '../rateLimit'

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('第 1~3 次放行，第 4 次拦截', () => {
    const key = 'ip:1'
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(true)
  })

  it('窗口过期后计数重置', () => {
    const key = 'ip:2'
    expect(isRateLimited(key, 1, 60_000)).toBe(false)
    vi.setSystemTime(new Date('2026-01-01T00:01:01Z'))
    expect(isRateLimited(key, 1, 60_000)).toBe(false)
    expect(isRateLimited(key, 1, 60_000)).toBe(true)
  })

  it('clientIp 解析 x-forwarded-for', () => {
    const req = (value: string | null) =>
      ({ headers: { get: (name: string) => (name === 'x-forwarded-for' ? value : null) } }) as unknown as Request
    expect(clientIp(req('1.2.3.4, 5.6.7.8'))).toBe('1.2.3.4')
    expect(clientIp(req(' 1.2.3.4 '))).toBe('1.2.3.4')
    expect(clientIp(req(null))).toBe('unknown')
  })
})
