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
      .then((res) => {
        if (!res.ok) {
          if (res.status === 402) {
            throw new Error('积分不足，请购买积分')
          }
          throw new Error('语音合成失败，请稍后再试')
        }
        return res.json() as Promise<SynthesizeResponse>
      })
      .then((data) => {
        if (epoch !== this.epoch) return
        const blob = new Blob([base64ToBytes(data.audio)], { type: data.contentType })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        this.audio = audio
        this.objectUrl = url
        audio.volume = options.volume
        audio.onended = () => options.onend()
        audio.onerror = () => options.onerror(new Error('语音合成失败'))
        if (this.paused) return
        audio.play().catch((error) => options.onerror(error))
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
    audio?.play().catch(() => audio.onerror?.(new Event('error')))
  }

  cancel(): void {
    this.epoch += 1
    this.paused = false
    if (this.audio) {
      this.audio.pause()
      this.audio = null
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  get isSpeaking(): boolean {
    return this.audio !== null && !this.audio.paused && !this.audio.ended
  }
}
