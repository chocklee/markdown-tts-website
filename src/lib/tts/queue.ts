import type { TtsEngine } from './engine'

export interface SpeechCallbacks {
  onIndex: (index: number) => void
  onEnd: () => void
  onError: (message: string) => void
}

export class SpeechQueue {
  private engine: TtsEngine
  private texts: string[]
  private getOptions: () => { rate: number; volume: number }
  private callbacks: SpeechCallbacks
  private index = 0
  private state: 'idle' | 'playing' | 'paused' = 'idle'
  private epoch = 0

  constructor(
    engine: TtsEngine,
    texts: string[],
    getOptions: () => { rate: number; volume: number },
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
    if (this.state !== 'playing') return
    this.engine.pause()
    this.state = 'paused'
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.engine.resume()
    this.state = 'playing'
  }

  stop(): void {
    this.epoch += 1
    this.engine.cancel()
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
    const { rate, volume } = this.getOptions()
    this.engine.speak(this.texts[this.index], {
      rate,
      volume,
      onend: () => {
        if (epoch !== this.epoch) return
        this.index += 1
        this.speakCurrent()
      },
      onerror: (error) => {
        if (epoch !== this.epoch) return
        this.state = 'idle'
        this.callbacks.onError(error instanceof Error ? error.message : String(error))
      },
    })
  }
}
