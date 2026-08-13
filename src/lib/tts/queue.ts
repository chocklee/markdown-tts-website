import type { TtsEngine } from './engine'

export interface SpeechCallbacks {
  onIndex: (index: number) => void
  onEnd: () => void
  onError: (message: string) => void
}

export interface SpeechOptions {
  rate: number
  volume: number
  sentencePause: boolean
  sentencePauseSeconds: number
}

export class SpeechQueue {
  private engine: TtsEngine
  private texts: string[]
  private getOptions: () => SpeechOptions
  private callbacks: SpeechCallbacks
  private index = 0
  private state: 'idle' | 'playing' | 'paused' | 'sentence-pause' = 'idle'
  private epoch = 0
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  private waitingToResume = false

  constructor(
    engine: TtsEngine,
    texts: string[],
    getOptions: () => SpeechOptions,
    callbacks: SpeechCallbacks,
  ) {
    this.engine = engine
    this.texts = texts
    this.getOptions = getOptions
    this.callbacks = callbacks
  }

  get currentIndex(): number {
    return this.index
  }

  isIdle(): boolean {
    return this.state === 'idle'
  }

  get ended(): boolean {
    return this.index >= this.texts.length
  }

  playFrom(startIndex: number): void {
    this.clearPauseTimer()
    this.waitingToResume = false
    this.epoch += 1
    this.engine.cancel()
    this.index = startIndex
    this.state = 'playing'
    this.speakCurrent()
  }

  resumeOrStart(startIndex: number): void {
    if (this.state === 'paused') {
      this.engine.resume()
      this.state = 'playing'
      return
    }
    this.playFrom(startIndex)
  }

  pause(): void {
    if (this.state === 'sentence-pause') {
      this.clearPauseTimer()
      this.waitingToResume = true
      this.state = 'paused'
      return
    }
    if (this.state !== 'playing') return
    this.engine.pause()
    this.state = 'paused'
  }

  resume(): void {
    if (this.state !== 'paused') return
    if (this.waitingToResume) {
      this.waitingToResume = false
      this.speakCurrent()
      return
    }
    this.state = 'playing'
    this.engine.resume()
  }

  stop(): void {
    this.clearPauseTimer()
    this.waitingToResume = false
    this.epoch += 1
    this.engine.cancel()
    this.state = 'idle'
  }

  reposition(index: number): void {
    this.clearPauseTimer()
    this.waitingToResume = false
    this.epoch += 1
    this.engine.cancel()
    this.index = index
    this.state = 'idle'
  }

  private speakCurrent(): void {
    const epoch = this.epoch
    if (this.index >= this.texts.length) {
      this.state = 'idle'
      this.callbacks.onEnd()
      return
    }
    this.callbacks.onIndex(this.index)
    const opts = this.getOptions()
    this.engine.speak(this.texts[this.index], {
      rate: opts.rate,
      volume: opts.volume,
      onend: () => {
        if (epoch !== this.epoch) return
        this.index += 1
        if (opts.sentencePause && this.index < this.texts.length && this.state === 'playing') {
          this.state = 'sentence-pause'
          this.pauseTimer = setTimeout(() => {
            if (epoch !== this.epoch || this.state !== 'sentence-pause') return
            this.state = 'playing'
            this.speakCurrent()
          }, opts.sentencePauseSeconds * 1000)
        } else {
          this.speakCurrent()
        }
      },
      onerror: (error) => {
        if (epoch !== this.epoch) return
        this.state = 'idle'
        this.callbacks.onError(error instanceof Error ? error.message : String(error))
      },
    })
    this.prefetchNext(opts)
  }

  private prefetchNext(opts: SpeechOptions): void {
    const nextIndex = this.index + 1
    if (nextIndex >= this.texts.length) return
    // 预取：当前句开始播放时后台合成下一句，服务端合成即扣费（缓存命中 0 扣），
    // 因此扣费时点提前、中途停止不回收；整段连续播放总数等价、同句不重复扣。
    this.engine.prefetch?.(this.texts[nextIndex], { rate: opts.rate })
  }

  private clearPauseTimer(): void {
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer)
      this.pauseTimer = null
    }
  }
}
