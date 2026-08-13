import { describe, it, expect, vi, afterEach } from 'vitest'
import { GET } from '../route'
import { getProvider } from '@/lib/tts/server/provider'
import type { TtsProvider } from '@/lib/tts/server/provider'

vi.mock('@/lib/tts/server/provider', () => ({ getProvider: vi.fn() }))

describe('GET /api/tts/voices', () => {
  afterEach(() => {
    vi.mocked(getProvider).mockReset()
    vi.restoreAllMocks()
  })

  it('返回当前供应商的音色列表', async () => {
    vi.mocked(getProvider).mockReturnValue({
      id: 'doubao',
      costPerMillionChars: 38.9,
      voices: [
        { id: 'alloy', name: 'Vivi 2.0（中性）' },
        { id: 'nova', name: '甜美桃子 2.0（温暖）' },
      ],
      synthesize: vi.fn(),
    } satisfies TtsProvider)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      voices: [
        { id: 'alloy', name: 'Vivi 2.0（中性）' },
        { id: 'nova', name: '甜美桃子 2.0（温暖）' },
      ],
    })
  })

  it('getProvider 抛错时返回 500「语音服务未配置」', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getProvider).mockImplementation(() => {
      throw new Error('unknown tts provider: x')
    })

    const res = await GET()

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: '语音服务未配置' })
  })
})
