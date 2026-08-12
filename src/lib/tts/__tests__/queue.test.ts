import { describe, expect, it, vi } from 'vitest'
import { SpeechQueue } from '../queue'
import type { TtsEngine } from '../engine'

class FakeEngine implements TtsEngine {
  speakCalls: { text: string; rate: number; volume: number; onend: () => void }[] = []
  paused = false
  cancelled = false

  speak(text: string, opts: { rate: number; volume: number; onend: () => void; onerror: (e: unknown) => void }): void {
    this.speakCalls.push({ text, rate: opts.rate, volume: opts.volume, onend: opts.onend })
  }
  pause(): void { this.paused = true }
  resume(): void { this.paused = false }
  cancel(): void { this.cancelled = true }
  get isSpeaking(): boolean { return false }
}

function setup(texts: string[]) {
  const engine = new FakeEngine()
  const onIndex = vi.fn()
  const onEnd = vi.fn()
  const onError = vi.fn()
  const options = { rate: 1, volume: 1 }
  const queue = new SpeechQueue(engine, texts, () => options, { onIndex, onEnd, onError })
  return { engine, queue, onIndex, onEnd, onError, options }
}

describe('SpeechQueue', () => {
  it('从指定位置开始逐句播放并回调索引', () => {
    const { engine, queue, onIndex } = setup(['a。', 'b。', 'c。'])
    queue.playFrom(1)
    expect(onIndex).toHaveBeenCalledWith(1)
    expect(engine.speakCalls[0].text).toBe('b。')

    engine.speakCalls[0].onend()
    expect(onIndex).toHaveBeenCalledWith(2)
    expect(engine.speakCalls[1].text).toBe('c。')
  })

  it('播完最后一句触发 onEnd', () => {
    const { engine, queue, onEnd } = setup(['a。'])
    queue.playFrom(0)
    engine.speakCalls[0].onend()
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('pause 后 resume 继续当前句，不重新开始', () => {
    const { engine, queue } = setup(['a。', 'b。'])
    queue.playFrom(0)
    queue.pause()
    expect(engine.paused).toBe(true)
    queue.resume()
    expect(engine.paused).toBe(false)
    expect(engine.speakCalls).toHaveLength(1)
  })

  it('stop 取消当前朗读', () => {
    const { engine, queue } = setup(['a。'])
    queue.playFrom(0)
    queue.stop()
    expect(engine.cancelled).toBe(true)
  })

  it('朗读时读取最新 rate/volume', () => {
    const { engine, queue, options } = setup(['a。'])
    options.rate = 1.5
    options.volume = 0.5
    queue.playFrom(0)
    expect(engine.speakCalls[0].rate).toBe(1.5)
    expect(engine.speakCalls[0].volume).toBe(0.5)
  })
})
