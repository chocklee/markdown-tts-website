import type { SpeakOptions, TtsEngine } from './engine'

interface SynthesizeResponse {
  audio: string
  contentType: string
}

interface PrefetchedAudio {
  text: string
  rate: number
  objectUrl: string
}

interface PrefetchResult {
  objectUrl: string
}

interface PrefetchRequest {
  text: string
  rate: number
  promise: Promise<PrefetchResult | null> | null
  taken: boolean
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
  private prefetched: PrefetchedAudio | null = null
  private prefetchRequest: PrefetchRequest | null = null

  constructor(voice: string) {
    this.voice = voice
  }

  prefetch(text: string, options: Pick<SpeakOptions, 'rate'>): void {
    const rate = options.rate
    if (
      (this.prefetchRequest && this.prefetchRequest.text === text && this.prefetchRequest.rate === rate) ||
      (this.prefetched && this.prefetched.text === text && this.prefetched.rate === rate)
    ) {
      return
    }
    this.clearPrefetched()
    const request: PrefetchRequest = { text, rate, promise: null, taken: false }
    const promise = this.fetchAudio(text, rate)
      .then((data): PrefetchResult | null => {
        if (this.prefetchRequest !== request && !request.taken) return null
        const blob = new Blob([base64ToBytes(data.audio)], { type: data.contentType })
        const objectUrl = URL.createObjectURL(blob)
        return { objectUrl }
      })
      .then((result) => {
        if (!result) return null
        if (this.prefetchRequest === request) {
          this.prefetchRequest = null
          this.clearPrefetched()
          this.prefetched = { text, rate, objectUrl: result.objectUrl }
          return result
        }
        if (request.taken) return result
        URL.revokeObjectURL(result.objectUrl)
        return null
      })
      .catch((error) => {
        if (this.prefetchRequest === request) this.prefetchRequest = null
        if (request.taken) throw error
        return null
      })
    request.promise = promise
    this.prefetchRequest = request
  }

  speak(text: string, options: SpeakOptions): void {
    if (this.prefetched && this.prefetched.text === text && this.prefetched.rate === options.rate) {
      const objectUrl = this.prefetched.objectUrl
      this.prefetched = null
      this.stopCurrentAudio()
      this.playObjectUrl(objectUrl, options)
      return
    }
    if (this.prefetchRequest && this.prefetchRequest.text === text && this.prefetchRequest.rate === options.rate) {
      const request = this.prefetchRequest
      const epoch = this.epoch
      this.prefetchRequest = null
      request.taken = true
      request.promise?.then(
        (result) => {
          if (epoch !== this.epoch) {
            if (result) URL.revokeObjectURL(result.objectUrl)
            return
          }
          if (result) {
            this.stopCurrentAudio()
            this.playObjectUrl(result.objectUrl, options)
          }
        },
        (error) => {
          if (epoch !== this.epoch) return
          options.onerror(error)
        },
      )
      return
    }
    this.cancel()
    const epoch = this.epoch
    this.fetchAudio(text, options.rate)
      .then((data) => {
        if (epoch !== this.epoch) return
        const blob = new Blob([base64ToBytes(data.audio)], { type: data.contentType })
        const objectUrl = URL.createObjectURL(blob)
        this.playObjectUrl(objectUrl, options)
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
    this.stopCurrentAudio()
    this.clearPrefetched()
    this.prefetchRequest = null
  }

  get isSpeaking(): boolean {
    return this.audio !== null && !this.audio.paused && !this.audio.ended
  }

  private fetchAudio(text: string, rate: number): Promise<SynthesizeResponse> {
    return fetch('/api/tts/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: this.voice, rate }),
    }).then(async (res) => {
      if (res.ok) {
        return (await res.json()) as SynthesizeResponse
      }
      if (res.status === 402) {
        throw new Error('积分不足，请购买积分')
      }
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null
      throw new Error(typeof body?.error === 'string' ? body.error : '语音合成失败，请稍后再试')
    })
  }

  private playObjectUrl(objectUrl: string, options: SpeakOptions): void {
    const epoch = this.epoch
    const audio = new Audio(objectUrl)
    this.audio = audio
    this.objectUrl = objectUrl
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
  }

  private revokeUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
  }

  private stopCurrentAudio(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio = null
    }
    this.revokeUrl()
  }

  private clearPrefetched(): void {
    if (this.prefetched) {
      URL.revokeObjectURL(this.prefetched.objectUrl)
      this.prefetched = null
    }
  }
}
