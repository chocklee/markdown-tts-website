import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../password'

describe('hashPassword / verifyPassword', () => {
  it('正确密码验证通过', () => {
    const hash = hashPassword('abc12345')
    expect(hash.startsWith('scrypt$')).toBe(true)
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

  it('哈希格式包含成本参数与固定长度', () => {
    expect(hashPassword('abc12345')).toMatch(/^scrypt\$16384\$8\$1\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
  })

  it('篡改哈希后验证失败', () => {
    const hash = hashPassword('abc12345')
    const tampered = hash.slice(0, -1) + (hash.endsWith('a') ? 'b' : 'a')
    expect(verifyPassword('abc12345', tampered)).toBe(false)
  })

  it('篡改盐后验证失败', () => {
    const hash = hashPassword('abc12345')
    const parts = hash.split('$')
    parts[4] = parts[4].startsWith('a') ? 'b' + parts[4].slice(1) : 'a' + parts[4].slice(1)
    expect(verifyPassword('abc12345', parts.join('$'))).toBe(false)
  })

  it('盐或哈希长度非法的存储值直接拒绝', () => {
    expect(verifyPassword('abc12345', 'scrypt$16384$8$1$ab$cd')).toBe(false)
    expect(verifyPassword('abc12345', 'scrypt$16384$8$1$' + 'a'.repeat(32) + '$cd')).toBe(false)
  })

  it('成本参数超出安全范围直接拒绝', () => {
    const salt = 'a'.repeat(32)
    const hash = 'b'.repeat(128)
    expect(verifyPassword('abc12345', `scrypt$999$8$1$${salt}$${hash}`)).toBe(false)
    expect(verifyPassword('abc12345', `scrypt$16384$999$1$${salt}$${hash}`)).toBe(false)
  })
})
