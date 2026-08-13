import { describe, expect, it, vi } from 'vitest'
import { SpeechQueue } from '../queue'
import type { TtsEngine } from '../engine'

class FakeEngine implements TtsEngine {
  speakCalls: { text: string; rate: number; volume: number; onend: () => void; onerror: (e: unknown) => void }[] = []
  paused = false
  cancelled = false

  speak(text: string, opts: { rate: number; volume: number; onend: () => void; onerror: (e: unknown) => void }): void {
    this.speakCalls.push({ text, rate: opts.rate, volume: opts.volume, onend: opts.onend, onerror: opts.onerror })
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
  const options = { rate: 1, volume: 1, sentencePause: false, sentencePauseSeconds: 2 }
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

  it('逐句模式：句子播完暂停 N 秒后自动继续', () => {
    vi.useFakeTimers()
    try {
      const engine = new FakeEngine()
      const onIndex = vi.fn()
      const queue = new SpeechQueue(
        engine,
        ['a。', 'b。', 'c。'],
        () => ({ rate: 1, volume: 1, sentencePause: true, sentencePauseSeconds: 2 }),
        { onIndex, onEnd: vi.fn(), onError: vi.fn() },
      )
      queue.playFrom(0)
      engine.speakCalls[0].onend()
      expect(onIndex).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1999)
      expect(onIndex).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      expect(onIndex).toHaveBeenCalledTimes(2)
      expect(engine.speakCalls[1].text).toBe('b。')
    } finally {
      vi.useRealTimers()
    }
  })

  it('逐句暂停期间手动暂停会取消自动继续，恢复后继续下一句', () => {
    vi.useFakeTimers()
    try {
      const engine = new FakeEngine()
      const queue = new SpeechQueue(
        engine,
        ['a。', 'b。'],
        () => ({ rate: 1, volume: 1, sentencePause: true, sentencePauseSeconds: 2 }),
        { onIndex: vi.fn(), onEnd: vi.fn(), onError: vi.fn() },
      )
      queue.playFrom(0)
      engine.speakCalls[0].onend()
      queue.pause()
      vi.advanceTimersByTime(3000)
      expect(engine.speakCalls).toHaveLength(1)
      queue.resume()
      expect(engine.speakCalls).toHaveLength(2)
      expect(engine.speakCalls[1].text).toBe('b。')
    } finally {
      vi.useRealTimers()
    }
  })

  it('最后一句不进入逐句暂停，直接结束', () => {
    vi.useFakeTimers()
    try {
      const engine = new FakeEngine()
      const onEnd = vi.fn()
      const queue = new SpeechQueue(
        engine,
        ['a。'],
        () => ({ rate: 1, volume: 1, sentencePause: true, sentencePauseSeconds: 2 }),
        { onIndex: vi.fn(), onEnd, onError: vi.fn() },
      )
      queue.playFrom(0)
      engine.speakCalls[0].onend()
      expect(onEnd).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('朗读时读取最新 rate/volume', () => {
    const { engine, queue, options } = setup(['a。'])
    options.rate = 1.5
    options.volume = 0.5
    queue.playFrom(0)
    expect(engine.speakCalls[0].rate).toBe(1.5)
    expect(engine.speakCalls[0].volume).toBe(0.5)
  })

  it('stop 后忽略旧 utterance 的回调', () => {
    const { engine, queue, onEnd, onIndex } = setup(['a。', 'b。'])
    queue.playFrom(0)
    queue.stop()
    engine.speakCalls[0].onend()
    expect(onIndex).toHaveBeenCalledTimes(1)
    expect(onEnd).not.toHaveBeenCalled()
    expect(engine.speakCalls).toHaveLength(1)
  })

  it('重新播放时忽略旧 utterance 回调', () => {
    const { engine, queue, onIndex } = setup(['a。', 'b。', 'c。'])
    queue.playFrom(0)
    queue.playFrom(2)
    engine.speakCalls[0].onend()
    expect(onIndex).toHaveBeenLastCalledWith(2)
    expect(engine.speakCalls).toHaveLength(2)
  })

  it('合成错误触发 onError 并回到 idle', () => {
    const { engine, queue, onError } = setup(['a。'])
    queue.playFrom(0)
    engine.speakCalls[0].onerror(new Error('语音合成失败'))
    expect(onError).toHaveBeenCalledWith('语音合成失败')
    expect(queue.isIdle()).toBe(true)
  })

  it('resumeOrStart 在暂停时恢复当前句', () => {
    const { engine, queue } = setup(['a。'])
    queue.playFrom(0)
    queue.pause()
    queue.resumeOrStart(0)
    expect(engine.paused).toBe(false)
    expect(engine.speakCalls).toHaveLength(1)
  })

  it('isIdle 反映队列状态', () => {
    const { queue } = setup(['a。'])
    expect(queue.isIdle()).toBe(true)
    queue.playFrom(0)
    expect(queue.isIdle()).toBe(false)
    queue.stop()
    expect(queue.isIdle()).toBe(true)
  })

  it('reposition 重置索引回到 idle 并忽略旧回调', () => {
    const { engine, queue, onIndex } = setup(['a。', 'b。'])
    queue.playFrom(0)
    queue.reposition(1)
    expect(queue.isIdle()).toBe(true)
    expect(queue.currentIndex).toBe(1)
    engine.speakCalls[0].onend()
    expect(onIndex).toHaveBeenCalledTimes(1)
    expect(engine.speakCalls).toHaveLength(1)
  })

  it('ended 仅在自然播完后为真', () => {
    const { engine, queue } = setup(['a。'])
    expect(queue.ended).toBe(false)
    queue.playFrom(0)
    queue.stop()
    expect(queue.ended).toBe(false)
    queue.reposition(0)
    queue.playFrom(0)
    engine.speakCalls[engine.speakCalls.length - 1].onend()
    expect(queue.ended).toBe(true)
  })
})
