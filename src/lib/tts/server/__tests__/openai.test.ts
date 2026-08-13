import { describe, it, expect, vi, afterEach } from 'vitest'
import { openaiProvider } from '../openai'

const SPEECH_URL = 'https://api.openai.com/v1/audio/speech'

function audioResponse(
  bytes: Uint8Array,
  contentType = 'audio/mpeg',
  status = 200,
): { ok: boolean; status: number; headers: Headers; arrayBuffer: () => Promise<ArrayBuffer> } {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => bytes.buffer as ArrayBuffer,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('openaiProvider', () => {
  it('以正确的 URL、body 与 Authorization 头请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(new Uint8Array()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    await openaiProvider.synthesize({ text: '你好 world', voice: 'nova', rate: 1.5 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(SPEECH_URL)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      Authorization: 'Bearer sk-test-123',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body)).toEqual({
      model: 'gpt-4o-mini-tts',
      voice: 'nova',
      input: '你好 world',
      speed: 1.5,
    })
  })

  it('将二进制响应解析为 Buffer 并读取 content-type', async () => {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04])
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(bytes))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    const result = await openaiProvider.synthesize({ text: '你好', voice: 'alloy', rate: 1 })

    expect(result.audio).toEqual(Buffer.from(bytes))
    expect(result.contentType).toBe('audio/mpeg')
  })

  it('响应缺少 content-type 时默认 audio/mpeg', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    const result = await openaiProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 })

    expect(result.contentType).toBe('audio/mpeg')
  })

  it('按字符数计算 costUsd（100 字 = 0.0012）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(new Uint8Array()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    const result = await openaiProvider.synthesize({ text: 'x'.repeat(100), voice: 'alloy', rate: 1 })

    expect(result.costUsd).toBe(0.0012)
  })

  it('costUsd 去除空白后按码点计数并保留 6 位小数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(new Uint8Array()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    const result = await openaiProvider.synthesize({ text: ' 你好 world\n', voice: 'alloy', rate: 1 })

    expect(result.costUsd).toBe(0.000084)
  })

  it('speed 下限 clamp：rate 0.1 → 0.25', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(new Uint8Array()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    await openaiProvider.synthesize({ text: 'x', voice: 'alloy', rate: 0.1 })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).speed).toBe(0.25)
  })

  it('speed 上限 clamp：rate 5 → 4', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(new Uint8Array()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    await openaiProvider.synthesize({ text: 'x', voice: 'alloy', rate: 5 })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).speed).toBe(4)
  })

  it('speed 正常范围不变：rate 1 → 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse(new Uint8Array()))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    await openaiProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).speed).toBe(1)
  })

  it('非 2xx 响应抛错并携带状态码', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-123')

    await expect(openaiProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 })).rejects.toThrow(
      'openai tts failed: 401',
    )
  })

  it('缺少 OPENAI_API_KEY 时抛错且不发起请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.OPENAI_API_KEY

    await expect(openaiProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 })).rejects.toThrow(
      'OPENAI_API_KEY is not set',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
