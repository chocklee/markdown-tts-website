import { describe, it, expect, vi, afterEach } from 'vitest'
import { getProvider } from '../provider'
import { openaiProvider } from '../openai'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getProvider', () => {
  it('无 TTS_PROVIDER 时回退到 CONFIG 默认（openai）', () => {
    vi.stubEnv('TTS_PROVIDER', undefined)
    expect(getProvider()).toBe(openaiProvider)
    expect(getProvider().id).toBe('openai')
  })

  it('TTS_PROVIDER 指定 openai 时返回 openai 供应商', () => {
    vi.stubEnv('TTS_PROVIDER', 'openai')
    expect(getProvider().id).toBe('openai')
  })

  it('未知供应商抛错（消息含 unknown tts provider）', () => {
    vi.stubEnv('TTS_PROVIDER', 'unknown')
    expect(() => getProvider()).toThrow('unknown tts provider')
  })

  it('TTS_PROVIDER 为空串时回退到 CONFIG 默认（openai）', () => {
    vi.stubEnv('TTS_PROVIDER', '')
    expect(getProvider()).toBe(openaiProvider)
  })

  it('TTS_PROVIDER 为空白串时回退到 CONFIG 默认（openai）', () => {
    vi.stubEnv('TTS_PROVIDER', '   ')
    expect(getProvider().id).toBe('openai')
  })
})
