import type { TtsProvider } from './provider'
import { countChars, estimateCostUsd } from './cost'

const SPEECH_URL = 'https://api.openai.com/v1/audio/speech'
const MODEL = 'gpt-4o-mini-tts'

function clampSpeed(rate: number): number {
  return Math.min(4, Math.max(0.25, rate))
}

export const openaiProvider: TtsProvider = {
  id: 'openai',
  // gpt-4o-mini-tts $12/100万字符
  costPerMillionChars: 12,

  async synthesize({ text, voice, rate }) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set')
    }

    const res = await fetch(SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: MODEL,
        voice,
        input: text,
        speed: clampSpeed(rate),
      }),
    })

    if (!res.ok) {
      throw new Error(`openai tts failed: ${res.status}`)
    }

    const audio = Buffer.from(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? 'audio/mpeg'
    const costUsd = estimateCostUsd(countChars(text), openaiProvider.costPerMillionChars)

    return { audio, contentType, costUsd }
  },
}
