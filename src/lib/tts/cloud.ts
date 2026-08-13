import type { SpeakOptions, TtsEngine } from './engine'

interface SynthesizeResponse {
  audio: string
  contentType: string
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

export class CloudTtsEngine implements TtsEngine {
  private voice: string
  private audio: HTMLAudioElement | null = null
  private objectUrl: string | null = null
  private paused = false
  private epoch = 0

  constructor(voice: string) {
    this.voice = voice
  }

  speak(text: string, options: SpeakOptions): void {
    this.cancel()
    const epoch = this.epoch

    fetch('/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: this.voice, rate: options.rate }),
    })
      .then(async (res) => {
        if (res.ok) {
          return (await res.json()) as SynthesizeResponse
        }
        if (res.status === 402) {
          throw new Error('积分不足，请购买积分')
        }
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null
        throw new Error(typeof body?.error === 'string' ? body.error : '语音合成失败，请稍后再试')
      })
      .then((data) => {
        if (epoch !== this.epoch) return
        const blob = new Blob([base64ToBytes(data.audio)], { type: data.contentType })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        this.audio = audio
        this.objectUrl = url
        audio.volume = options.volume
        audio.onended = () => {
          if (this.audio === audio) {
            this.audio = null
            this.revokeUrl()
          }
          options.onend()
        }
        audio.onerror = () => {
          if (epoch !== this.epoch) return
          options.onerror(new Error('语音合成失败'))
        }
        if (this.paused) return
        audio.play().catch((error) => {
          if (epoch !== this.epoch || isAbortError(error)) return
          options.onerror(error)
        })
      })
      .catch((error) => {
        if (epoch !== this.epoch) return
        options.onerror(error)
      })
  }

  pause(): void {
    this.paused = true
    this.audio?.pause()
  }

  resume(): void {
    this.paused = false
    const audio = this.audio
    const epoch = this.epoch
    audio?.play().catch((error) => {
      if (epoch !== this.epoch || isAbortError(error)) return
      audio.onerror?.(new Event('error'))
    })
  }

  cancel(): void {
    this.epoch += 1
    this.paused = false
    if (this.audio) {
      this.audio.pause()
      this.audio = null
    }
    this.revokeUrl()
  }

  get isSpeaking(): boolean {
    return this.audio !== null && !this.audio.paused && !this.audio.ended
  }

  private revokeUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }
}
