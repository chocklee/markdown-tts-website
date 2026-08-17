import { randomUUID } from 'node:crypto'
import type { TtsProvider } from './provider'
import { CONFIG } from '@/lib/config'
import { countChars, estimateCostUsd } from './cost'

const DOUBAO_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-tts-2.0'
const SUCCESS_CODE = 0
const END_CODE = 20000000

export const VOICE_MAP: Record<string, string> = {
  alloy: 'zh_female_vv_uranus_bigtts',
  nova: 'zh_female_tianmeitaozi_uranus_bigtts',
  shimmer: 'zh_female_qingxinnvsheng_uranus_bigtts',
  echo: 'zh_male_gaolengchenwen_uranus_bigtts',
}

export const VOICE_NAMES: Record<string, string> = {
  alloy: 'Vivi 2.0（中性）',
  nova: '甜美桃子 2.0（温暖）',
  shimmer: '清新女声 2.0（明亮）',
  echo: '高冷沉稳 2.0（沉稳）',
}

const VOICES: TtsProvider['voices'] = Object.keys(VOICE_MAP).map((id) => ({
  id,
  name: VOICE_NAMES[id],
}))

function toSpeechRate(rate: number): number {
  return Math.min(100, Math.max(-50, Math.round((rate - 1) * 100)))
}

// 豆包接口以 SSE 事件流返回音频块：逐行读取，收到结束码即返回。
// 流结束时若最后一行没有换行符，也要处理残留内容，避免丢行。
async function readSseAudio(body: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const chunks: Buffer[] = []
  let buffer = ''
  let ended = false

  const handleLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line || ended) return
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
      ended = true
    } else if (typeof parsed.code === 'number' && parsed.code > 0) {
      const data = parsed.data as { message?: string } | undefined
      throw new Error(data?.message ?? parsed.message ?? '豆包语音合成失败')
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, newlineIndex))
        buffer = buffer.slice(newlineIndex + 1)
      }
      if (ended) break
    }
    if (!ended && buffer.length > 0) {
      handleLine(buffer)
      buffer = ''
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks)
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
      signal: AbortSignal.timeout(CONFIG.tts.synthesizeTimeoutMs),
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

    if (!res.ok) {
      const raw = await res.text()
      let message = `豆包语音合成失败: HTTP ${res.status}`
      try {
        const body = JSON.parse(raw) as { header?: { message?: string }; message?: string }
        message = body.header?.message ?? body.message ?? message
      } catch {
        // 非 JSON 错误响应体，保留回退消息
      }
      throw new Error(message)
    }

    if (!res.body) {
      throw new Error('合成响应为空')
    }

    const audio = await readSseAudio(res.body)
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
