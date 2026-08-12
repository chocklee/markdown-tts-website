import { describe, expect, it } from 'vitest'
import { sanitizeUrl } from '../url'

describe('sanitizeUrl', () => {
  it('放行 http/https/mailto 与锚点', () => {
    expect(sanitizeUrl('https://a.b')).toBe('https://a.b')
    expect(sanitizeUrl('http://a.b')).toBe('http://a.b')
    expect(sanitizeUrl('mailto:a@b.c')).toBe('mailto:a@b.c')
    expect(sanitizeUrl('#anchor')).toBe('#anchor')
  })

  it('拒绝 javascript: 协议', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull()
  })
})
