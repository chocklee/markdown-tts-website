export interface SpeakOptions {
  rate: number
  volume: number
  onend: () => void
  onerror: (error: unknown) => void
}

export interface TtsEngine {
  speak(text: string, options: SpeakOptions): void
  prefetch?(text: string, options: Pick<SpeakOptions, 'rate' | 'volume'>): void
  pause(): void
  resume(): void
  cancel(): void
  readonly isSpeaking: boolean
}

export class BrowserTtsEngine implements TtsEngine {
  private synth: SpeechSynthesis | null = null

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis
    }
  }

  speak(text: string, options: SpeakOptions): void {
    if (!this.synth) {
      options.onerror(new Error('当前浏览器不支持语音朗读'))
      return
    }
    this.synth.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-CN'
    utterance.rate = options.rate
    utterance.volume = options.volume
    utterance.onend = () => options.onend()
    utterance.onerror = (event) => {
      const code = (event as SpeechSynthesisErrorEvent).error
      if (code === 'interrupted' || code === 'canceled') return
      options.onerror(new Error('语音合成失败'))
    }
    this.synth.speak(utterance)
  }

  pause(): void {
    this.synth?.pause()
  }

  resume(): void {
    this.synth?.resume()
  }

  cancel(): void {
    this.synth?.cancel()
  }

  get isSpeaking(): boolean {
    return this.synth?.speaking ?? false
  }
}
