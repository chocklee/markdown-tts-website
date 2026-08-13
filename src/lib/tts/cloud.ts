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
  private epoch = 0

  constructor(voice: string) {
    this.voice = voice
  }

  speak(text: string, options: SpeakOptions): void {
    const epoch = this.epoch + 1
    this.epoch = epoch
    this.cancel()

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
        this.cancel()
        const blob = new Blob([base64ToBytes(data.audio)], { type: data.contentType })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        this.audio = audio
        this.objectUrl = url
        audio.volume = options.volume
        audio.onended = () => options.onend()
        audio.onerror = () => options.onerror(new Error('语音合成失败'))
        audio.play().catch((error) => options.onerror(error))
      })
      .catch((error) => {
        if (epoch !== this.epoch) return
        options.onerror(error)
      })
  }

  pause(): void {
    this.audio?.pause()
  }

  resume(): void {
    this.audio?.play()
  }

  cancel(): void {
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
