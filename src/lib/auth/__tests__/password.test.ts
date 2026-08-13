import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../password'

describe('hashPassword / verifyPassword', () => {
  it('正确密码验证通过', () => {
    const hash = hashPassword('abc12345')
    expect(hash.startsWith('scrypt:')).toBe(true)
    expect(verifyPassword('abc12345', hash)).toBe(true)
  })

  it('错误密码验证失败', () => {
    const hash = hashPassword('abc12345')
    expect(verifyPassword('wrong-pass', hash)).toBe(false)
  })

  it('相同密码每次哈希不同（随机盐）', () => {
    expect(hashPassword('abc12345')).not.toBe(hashPassword('abc12345'))
  })

  it('损坏的存储值直接拒绝', () => {
    expect(verifyPassword('abc12345', 'not-a-hash')).toBe(false)
  })
})
