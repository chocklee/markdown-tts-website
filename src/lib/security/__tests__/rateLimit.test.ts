import { describe, it, expect } from 'vitest'
import { isRateLimited } from '../rateLimit'

describe('isRateLimited', () => {
  it('第 1~3 次放行，第 4 次拦截', () => {
    const key = 'ip:1'
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(false)
    expect(isRateLimited(key, 3, 60_000)).toBe(true)
  })

  it('窗口过期后计数重置', () => {
    expect(isRateLimited('ip:2', 1, -1000)).toBe(false)
  })
})
