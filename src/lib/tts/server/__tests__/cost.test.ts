import { describe, it, expect } from 'vitest'
import { countChars, calcCredits, textHash, isValidRate } from '../cost'

describe('countChars', () => {
  it('统计 Unicode 码点数（中文按字）', () => {
    expect(countChars('你好世界')).toBe(4)
  })

  it('去除空白（空格、换行、制表符）', () => {
    expect(countChars(' 你好 世界\n世界\t')).toBe(6)
  })

  it('空文本为 0', () => {
    expect(countChars('   \n ')).toBe(0)
  })

  it('emoji 按一个码点计', () => {
    expect(countChars('a😀b')).toBe(3)
  })
})

describe('calcCredits', () => {
  it('100 字 = 3 积分', () => {
    expect(calcCredits(100, 3)).toBe(3)
  })

  it('不足 100 字按 ceil 进位，最少 1', () => {
    expect(calcCredits(1, 3)).toBe(1)
    expect(calcCredits(34, 3)).toBe(2)
    expect(calcCredits(66, 3)).toBe(2)
    expect(calcCredits(67, 3)).toBe(3)
  })

  it('0 字 0 积分', () => {
    expect(calcCredits(0, 3)).toBe(0)
  })
})

describe('textHash', () => {
  it('相同输入稳定输出', () => {
    expect(textHash('openai', 'alloy', '你好')).toBe(textHash('openai', 'alloy', '你好'))
  })

  it('不同输入产生不同哈希', () => {
    expect(textHash('openai', 'alloy', '你好')).not.toBe(textHash('openai', 'nova', '你好'))
    expect(textHash('openai', 'alloy', '你好')).not.toBe(textHash('openai', 'alloy', '你好 '))
  })

  it('输出为十六进制字符串', () => {
    expect(textHash('openai', 'alloy', 'x')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('isValidRate', () => {
  it('阅读器语速范围 0.5–2 合法', () => {
    expect(isValidRate(1)).toBe(true)
    expect(isValidRate(0.5)).toBe(true)
    expect(isValidRate(2)).toBe(true)
    expect(isValidRate(0.1)).toBe(false)
    expect(isValidRate(3)).toBe(false)
  })
})
