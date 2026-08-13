import { CONFIG } from '@/lib/config'
import { openaiProvider } from './openai'

export interface TtsProvider {
  readonly id: string
  synthesize(input: {
    text: string
    voice: string
    rate: number
  }): Promise<{ audio: Buffer; contentType: string; costUsd: number }>
}

const providers: Record<string, TtsProvider> = {
  openai: openaiProvider,
}

export function getProvider(): TtsProvider {
  const id = process.env.TTS_PROVIDER ?? CONFIG.tts.provider
  const provider = providers[id]
  if (!provider) {
    throw new Error(`unknown tts provider: ${id}`)
  }
  return provider
}
