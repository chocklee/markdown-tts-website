// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudTtsEngine } from '../cloud'

const MOCK_AUDIO_URL = 'blob:mock-url'
const BASE64_AUDIO = 'aGVsbG8=' // 'hello'

class MockAudio {
  static instances: MockAudio[] = []
  static failNextPlay = false

  paused = true
  ended = false
  volume = 1
  onended: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  private resolvePendingPlay: (() => void) | null = null
  private rejectPendingPlay: ((error: unknown) => void) | null = null
  play = vi.fn(() => {
    if (MockAudio.failNextPlay) {
      MockAudio.failNextPlay = false
      return Promise.reject(new Error('play failed'))
    }
    this.paused = false
    return new Promise<void>((resolve, reject) => {
      this.resolvePendingPlay = resolve
      this.rejectPendingPlay = reject
    })
  })
  pause = vi.fn(() => {
    this.paused = true
    this.rejectPendingPlay?.(new DOMException('play interrupted', 'AbortError'))
    this.resolvePendingPlay = null
    this.rejectPendingPlay = null
  })

  constructor(readonly src: string) {
    MockAudio.instances.push(this)
  }

  fireEnded(): void {
    this.resolvePendingPlay?.()
    this.resolvePendingPlay = null
    this.rejectPendingPlay = null
    this.ended = true
    this.paused = true
    this.onended?.()
  }

  fireError(): void {
    this.rejectPendingPlay?.(new DOMException('play interrupted', 'AbortError'))
    this.resolvePendingPlay = null
    this.rejectPendingPlay = null
    this.onerror?.(new Event('error'))
  }
}

function mockFetchResolved(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('CloudTtsEngine', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    MockAudio.instances = []
    MockAudio.failNextPlay = false
    createObjectURL = vi.fn((..._args: unknown[]) => MOCK_AUDIO_URL)
    revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.stubGlobal('Audio', MockAudio)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('成功合成后创建音频播放，ended 触发 onend', async () => {
    const fetchMock = mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1.2, volume: 0.5, onend, onerror })
    expect(engine.isSpeaking).toBe(false)

    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '你好', voice: 'nova', rate: 1.2 }),
    })
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toBe('audio/mpeg')
    expect(blob.size).toBe(5)
    expect(MockAudio.instances).toHaveLength(1)
    const audio = MockAudio.instances[0]
    expect(audio.src).toBe(MOCK_AUDIO_URL)
    expect(audio.volume).toBe(0.5)
    expect(audio.play).toHaveBeenCalledOnce()
    expect(engine.isSpeaking).toBe(true)
    expect(onerror).not.toHaveBeenCalled()

    audio.fireEnded()
    expect(onend).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith(MOCK_AUDIO_URL)
    expect(engine.isSpeaking).toBe(false)
  })

  it('余额不足返回 402 时 onerror 提示购买积分', async () => {
    mockFetchResolved(402, { error: 'unexpected server text' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })

    await flush()

    expect(onerror).toHaveBeenCalledTimes(1)
    expect((onerror.mock.calls[0][0] as Error).message).toBe('积分不足，请购买积分')
    expect(onend).not.toHaveBeenCalled()
    expect(MockAudio.instances).toHaveLength(0)
  })

  it('其他服务端错误时 onerror 提示稍后再试', async () => {
    mockFetchResolved(500, {})
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })

    await flush()

    expect(onerror).toHaveBeenCalledTimes(1)
    expect((onerror.mock.calls[0][0] as Error).message).toBe('语音合成失败，请稍后再试')
    expect(MockAudio.instances).toHaveLength(0)
  })

  it('非 402 错误透传服务端 error 文案', async () => {
    mockFetchResolved(429, { error: '操作过于频繁' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })

    await flush()

    expect(onerror).toHaveBeenCalledTimes(1)
    expect((onerror.mock.calls[0][0] as Error).message).toBe('操作过于频繁')
    expect(MockAudio.instances).toHaveLength(0)
  })

  it('网络异常时 onerror 透传错误', async () => {
    const networkError = new Error('network down')
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    vi.stubGlobal('fetch', fetchMock)
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })

    await flush()

    expect(onerror).toHaveBeenCalledWith(networkError)
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(MockAudio.instances).toHaveLength(0)
  })

  it('cancel 暂停当前音频并释放 objectURL', async () => {
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    engine.speak('你好', { rate: 1, volume: 1, onend: vi.fn(), onerror: vi.fn() })
    await flush()
    const audio = MockAudio.instances[0]

    engine.cancel()

    expect(audio.pause).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith(MOCK_AUDIO_URL)
    expect(engine.isSpeaking).toBe(false)
  })

  it('再次 speak 前先取消上一个音频', async () => {
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    engine.speak('第一句', { rate: 1, volume: 1, onend: vi.fn(), onerror: vi.fn() })
    await flush()
    const first = MockAudio.instances[0]

    engine.speak('第二句', { rate: 1, volume: 1, onend: vi.fn(), onerror: vi.fn() })
    await flush()

    expect(first.pause).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith(MOCK_AUDIO_URL)
    expect(MockAudio.instances).toHaveLength(2)
  })

  it('pause 与 resume 映射到当前音频', async () => {
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    engine.speak('你好', { rate: 1, volume: 1, onend: vi.fn(), onerror: vi.fn() })
    await flush()
    const audio = MockAudio.instances[0]

    engine.pause()
    expect(audio.pause).toHaveBeenCalledOnce()

    engine.resume()
    expect(audio.play).toHaveBeenCalledTimes(2)
  })

  it('play 挂起时 pause 触发 AbortError 不误报 onerror，resume 可继续', async () => {
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })
    await flush()
    const audio = MockAudio.instances[0]
    expect(audio.play).toHaveBeenCalledOnce()
    expect(engine.isSpeaking).toBe(true)

    engine.pause()
    await flush()

    expect(onerror).not.toHaveBeenCalled()
    expect(onend).not.toHaveBeenCalled()

    engine.resume()
    await flush()

    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(engine.isSpeaking).toBe(true)
    expect(onerror).not.toHaveBeenCalled()
  })

  it('fetch 在途时 cancel，响应到达后不创建不播放音频', async () => {
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })

    engine.cancel()
    await flush()

    expect(MockAudio.instances).toHaveLength(0)
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(engine.isSpeaking).toBe(false)
    expect(onend).not.toHaveBeenCalled()
    expect(onerror).not.toHaveBeenCalled()
  })

  it('fetch 在途时 pause，响应到达后音频不开始播放，resume 后恢复', async () => {
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })

    engine.pause()
    await flush()

    expect(MockAudio.instances).toHaveLength(1)
    const audio = MockAudio.instances[0]
    expect(audio.play).not.toHaveBeenCalled()
    expect(audio.paused).toBe(true)
    expect(engine.isSpeaking).toBe(false)
    expect(onend).not.toHaveBeenCalled()

    engine.resume()
    expect(audio.play).toHaveBeenCalledOnce()
    expect(engine.isSpeaking).toBe(true)
  })

  it('resume 时 play 失败触发 onerror', async () => {
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })
    await flush()
    const audio = MockAudio.instances[0]

    audio.play.mockRejectedValueOnce(new Error('resume play failed'))
    engine.resume()
    await flush()

    expect(onerror).toHaveBeenCalledTimes(1)
    expect((onerror.mock.calls[0][0] as Error).message).toBe('语音合成失败')
    expect(onend).not.toHaveBeenCalled()
  })

  it('音频 error 事件触发 onerror', async () => {
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })
    await flush()

    MockAudio.instances[0].fireError()

    expect(onerror).toHaveBeenCalledTimes(1)
    expect((onerror.mock.calls[0][0] as Error).message).toBe('语音合成失败')
    expect(onend).not.toHaveBeenCalled()
  })

  it('play 失败触发 onerror', async () => {
    MockAudio.failNextPlay = true
    mockFetchResolved(200, { audio: BASE64_AUDIO, contentType: 'audio/mpeg' })
    const engine = new CloudTtsEngine('nova')
    const onend = vi.fn()
    const onerror = vi.fn()
    engine.speak('你好', { rate: 1, volume: 1, onend, onerror })

    await flush()

    expect(onerror).toHaveBeenCalledTimes(1)
    expect((onerror.mock.calls[0][0] as Error).message).toBe('play failed')
    expect(onend).not.toHaveBeenCalled()
  })
})
