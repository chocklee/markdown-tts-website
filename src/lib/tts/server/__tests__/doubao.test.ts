import { describe, it, expect, vi, afterEach } from 'vitest'
import { doubaoProvider } from '../doubao'

const DOUBAO_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'

function jsonlResponse(lines: unknown[], status = 200): Response {
  return new Response(lines.map((line) => JSON.stringify(line)).join('\n'), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function successResponse(): Response {
  return jsonlResponse([
    { code: 0, data: Buffer.from('abc').toString('base64') },
    { code: 0, data: Buffer.from('def').toString('base64') },
    { code: 20000000 },
  ])
}

async function speechRateFor(rate: number): Promise<number> {
  const fetchMock = vi.fn().mockResolvedValue(successResponse())
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')
  await doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate })
  return JSON.parse(fetchMock.mock.calls[0][1].body).req_params.audio_params.speech_rate
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('doubaoProvider', () => {
  it('成功：请求 URL/头/body 正确并拼接 base64 音频', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse())
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    const result = await doubaoProvider.synthesize({ text: '你好世界', voice: 'nova', rate: 1.5 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(DOUBAO_URL)
    expect(init.method).toBe('POST')

    const headers = init.headers as Record<string, string>
    expect(headers['X-Api-Key']).toBe('key-test-123')
    expect(headers['X-Api-Resource-Id']).toBe('seed-tts-2.0')
    expect(headers['X-Api-Request-Id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['X-Control-Require-Usage-Tokens-Return']).toBe('*')

    expect(JSON.parse(init.body)).toEqual({
      req_params: {
        text: '你好世界',
        speaker: 'zh_female_tianmeitaozi_uranus_bigtts',
        audio_params: { format: 'mp3', sample_rate: 24000, speech_rate: 50 },
      },
    })

    expect(result.audio).toEqual(Buffer.concat([Buffer.from('abc'), Buffer.from('def')]))
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.costUsd).toBe(0.000156)
  })

  it('四个内置音色映射到对应豆包 speaker', async () => {
    const cases: Array<[string, string]> = [
      ['alloy', 'zh_female_vv_uranus_bigtts'],
      ['nova', 'zh_female_tianmeitaozi_uranus_bigtts'],
      ['shimmer', 'zh_female_qingxinnvsheng_uranus_bigtts'],
      ['echo', 'zh_male_gaolengchenwen_uranus_bigtts'],
    ]

    for (const [voice, speaker] of cases) {
      const fetchMock = vi.fn().mockResolvedValue(successResponse())
      vi.stubGlobal('fetch', fetchMock)
      vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')
      await doubaoProvider.synthesize({ text: 'x', voice, rate: 1 })
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).req_params.speaker).toBe(speaker)
    }
  })

  it('speech_rate 换算：rate 2 → 100', async () => {
    expect(await speechRateFor(2)).toBe(100)
  })

  it('speech_rate 换算：rate 0.5 → -50', async () => {
    expect(await speechRateFor(0.5)).toBe(-50)
  })

  it('speech_rate 换算：rate 1.5 → 50', async () => {
    expect(await speechRateFor(1.5)).toBe(50)
  })

  it('speech_rate clamp：rate 5 → 100', async () => {
    expect(await speechRateFor(5)).toBe(100)
  })

  it('speech_rate clamp：rate 0.1 → -50', async () => {
    expect(await speechRateFor(0.1)).toBe(-50)
  })

  it('未知音色抛错且不发起请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'unknown-voice', rate: 1 }),
    ).rejects.toThrow('未知音色: unknown-voice')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('缺少 DOUBAO_API_KEY 抛错且不发起请求', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', undefined)

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('DOUBAO_API_KEY is not set')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('非 2xx 响应抛错并携带服务端 message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ header: { code: 401, message: 'invalid api key' } }), {
        status: 401,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('invalid api key')
  })

  it('流中错误码（code>0）抛错，data.message 优先', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonlResponse([
        { code: 0, data: Buffer.from('abc').toString('base64') },
        { code: 30000001, data: { message: '并发超限' }, message: 'fallback' },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('并发超限')
  })

  it('流中错误码（code>0）无 data.message 时使用顶层 message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonlResponse([
        { code: 0, data: Buffer.from('abc').toString('base64') },
        { code: 30000001, message: '账号欠费' },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('账号欠费')
  })

  it('只有结束码没有音频数据抛「合成失败」', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonlResponse([{ code: 20000000 }]))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: '', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('合成失败')
  })

  it('空文本 costUsd 为 0', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse())
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    const result = await doubaoProvider.synthesize({ text: '', voice: 'alloy', rate: 1 })
    expect(result.costUsd).toBe(0)
  })

  it('中文文本按非空白码点计费（4 字 = 0.000156）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse())
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    const result = await doubaoProvider.synthesize({ text: ' 你好世界\n', voice: 'alloy', rate: 1 })
    expect(result.costUsd).toBe(0.000156)
  })

  it('data 为非法 base64 抛「合成数据解码失败」', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonlResponse([
        { code: 0, data: '!!!!' },
        { code: 20000000 },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('合成数据解码失败')
  })

  it('空响应体（0 字节）抛「合成失败」', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('合成失败')
  })

  it('畸形 JSON 行抛「合成响应解析失败」', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('not-json\n{"code":20000000}', { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('合成响应解析失败')
  })

  it('非 2xx 响应无 header.message 时回落顶层 message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 401, message: '顶层错误' }), { status: 401 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('顶层错误')
  })

  it('非 2xx 非 JSON 错误体回退「豆包语音合成失败: HTTP <status>」', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html>error</html>', { status: 500 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('豆包语音合成失败: HTTP 500')
  })

  it('请求携带 AbortSignal 超时信号', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse())
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal.aborted).toBe(false)
  })

  it('结束码先行时忽略后续行（无音频则抛「合成失败」）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonlResponse([
        { code: 20000000 },
        { code: 0, data: Buffer.from('abc').toString('base64') },
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('DOUBAO_API_KEY', 'key-test-123')

    await expect(
      doubaoProvider.synthesize({ text: 'x', voice: 'alloy', rate: 1 }),
    ).rejects.toThrow('合成失败')
  })
})
