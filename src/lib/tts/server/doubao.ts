import { randomUUID } from 'node:crypto'
import type { TtsProvider } from './provider'
import { countChars, estimateCostUsd } from './cost'

const DOUBAO_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-tts-2.0'
const SUCCESS_CODE = 0
const END_CODE = 20000000

const VOICE_MAP: Record<string, string> = {
  alloy: 'zh_female_vv_uranus_bigtts',
  nova: 'zh_female_tianmeitaozi_uranus_bigtts',
  shimmer: 'zh_female_qingxinnvsheng_uranus_bigtts',
  echo: 'zh_male_gaolengchenwen_uranus_bigtts',
}

const VOICES: TtsProvider['voices'] = [
  { id: 'alloy', name: 'Vivi 2.0（中性）' },
  { id: 'nova', name: '甜美桃子 2.0（温暖）' },
  { id: 'shimmer', name: '清新女声 2.0（明亮）' },
  { id: 'echo', name: '高冷沉稳 2.0（沉稳）' },
]

function toSpeechRate(rate: number): number {
  return Math.min(100, Math.max(-50, Math.round((rate - 1) * 100)))
}

export const doubaoProvider: TtsProvider = {
  id: 'doubao',
  // 豆包语音合成大模型2.0 后付费约 2.8 元/万字符 ≈ 280 元/百万字符，按汇率 7.2 折算 ≈ $38.9/百万字符
  costPerMillionChars: 38.9,
  voices: VOICES,

  async synthesize({ text, voice, rate }) {
    const apiKey = process.env.DOUBAO_API_KEY
    if (!apiKey) {
      throw new Error('DOUBAO_API_KEY is not set')
    }

    const speaker = VOICE_MAP[voice]
    if (!speaker) {
      throw new Error(`未知音色: ${voice}`)
    }

    const res = await fetch(DOUBAO_URL, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': RESOURCE_ID,
        'X-Api-Request-Id': randomUUID(),
        'Content-Type': 'application/json',
        'X-Control-Require-Usage-Tokens-Return': '*',
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        req_params: {
          text,
          speaker,
          audio_params: {
            format: 'mp3',
            sample_rate: 24000,
            speech_rate: toSpeechRate(rate),
          },
        },
      }),
    })

    const raw = await res.text()

    if (!res.ok) {
      let message = `豆包语音合成失败: HTTP ${res.status}`
      try {
        const body = JSON.parse(raw) as { header?: { message?: string }; message?: string }
        message = body.header?.message ?? body.message ?? message
      } catch {
        // 非 JSON 错误响应体，保留回退消息
      }
      throw new Error(message)
    }

    const chunks: Buffer[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      let parsed: { code?: number; data?: unknown; message?: string }
      try {
        parsed = JSON.parse(line)
      } catch {
        throw new Error('合成响应解析失败')
      }
      if (parsed.code === SUCCESS_CODE && typeof parsed.data === 'string' && parsed.data.length > 0) {
        const audio = Buffer.from(parsed.data, 'base64')
        if (audio.length === 0) {
          throw new Error('合成数据解码失败')
        }
        chunks.push(audio)
      } else if (parsed.code === END_CODE) {
        break
      } else if (typeof parsed.code === 'number' && parsed.code > 0) {
        const data = parsed.data as { message?: string } | undefined
        throw new Error(data?.message ?? parsed.message ?? '豆包语音合成失败')
      }
    }

    const audio = Buffer.concat(chunks)
    if (audio.length === 0) {
      throw new Error('合成失败')
    }

    return {
      audio,
      contentType: 'audio/mpeg',
      costUsd: estimateCostUsd(countChars(text), doubaoProvider.costPerMillionChars),
    }
  },
}
