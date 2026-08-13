import { describe, it, expect, vi, afterEach } from 'vitest'
import { getProvider } from '../provider'
import { openaiProvider } from '../openai'
import { doubaoProvider } from '../doubao'

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

  it('TTS_PROVIDER=doubao 时返回 doubao 供应商', () => {
    vi.stubEnv('TTS_PROVIDER', 'doubao')
    expect(getProvider()).toBe(doubaoProvider)
    expect(getProvider().id).toBe('doubao')
  })

  it('TTS_PROVIDER=doubao 时 getProvider().voices 为豆包列表', () => {
    vi.stubEnv('TTS_PROVIDER', 'doubao')
    expect(getProvider().voices).toEqual([
      { id: 'alloy', name: 'Vivi 2.0（中性）' },
      { id: 'nova', name: '甜美桃子 2.0（温暖）' },
      { id: 'shimmer', name: '清新女声 2.0（明亮）' },
      { id: 'echo', name: '高冷沉稳 2.0（沉稳）' },
    ])
  })

  it('无 TTS_PROVIDER（默认 openai）时 getProvider().voices 为 OpenAI 列表', () => {
    vi.stubEnv('TTS_PROVIDER', undefined)
    expect(getProvider().voices).toEqual([
      { id: 'alloy', name: 'Alloy（中性）' },
      { id: 'nova', name: 'Nova（温暖）' },
      { id: 'shimmer', name: 'Shimmer（明亮）' },
      { id: 'echo', name: 'Echo（沉稳）' },
    ])
  })

  it('openai 供应商暴露 costPerMillionChars = 12', () => {
    expect(openaiProvider.costPerMillionChars).toBe(12)
  })
})
