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

  it('data:image 仅放行栅格格式', () => {
    expect(sanitizeUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
    expect(sanitizeUrl('data:image/svg+xml;base64,AAA')).toBeNull()
  })
})
