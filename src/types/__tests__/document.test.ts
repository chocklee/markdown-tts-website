import { describe, it, expect } from 'vitest'
import { contentHashOf } from '../document'

describe('contentHashOf', () => {
  it('matches known FNV-1a vector for "hello"', () => {
    expect(contentHashOf('hello')).toBe('4f9f2cab')
  })

  it('returns different hashes for different content', () => {
    expect(contentHashOf('hello')).not.toBe(contentHashOf('world'))
  })

  it('returns the same hash for identical content', () => {
    expect(contentHashOf('hello')).toBe(contentHashOf('hello'))
  })
})
