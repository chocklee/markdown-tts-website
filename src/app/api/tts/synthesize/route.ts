import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { CONFIG } from '@/lib/config'
import { isRateLimited } from '@/lib/security/rateLimit'
import { calcCredits, countChars, estimateCostUsd, isValidRate, textHash } from '@/lib/tts/server/cost'
import { getProvider, type TtsProvider } from '@/lib/tts/server/provider'
import { cleanupExpiredCache, getCachedAudio, upsertCachedAudio } from '@/lib/db/tts'
import { deductCredits, refundCredits } from '@/lib/db/credits'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  if (isRateLimited(`tts:${session.user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: '操作过于频繁' }, { status: 429 })
  }

  let body: { text?: unknown; voice?: unknown; rate?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }

  const text = body.text
  if (typeof text !== 'string' || countChars(text) <= 0 || Array.from(text).length > CONFIG.tts.maxTextChars) {
    return NextResponse.json({ error: '文本不能为空或过长' }, { status: 400 })
  }
  const voice = body.voice
  if (typeof voice !== 'string' || !CONFIG.tts.voices.some((v) => v.id === voice)) {
    return NextResponse.json({ error: '音色不存在' }, { status: 400 })
  }
  const rate = body.rate
  if (typeof rate !== 'number' || !isValidRate(rate)) {
    return NextResponse.json({ error: '语速无效' }, { status: 400 })
  }

  let provider: TtsProvider
  try {
    provider = getProvider()
  } catch (err) {
    console.error('get tts provider failed', err)
    return NextResponse.json({ error: '语音服务未配置' }, { status: 500 })
  }

  const textHashKey = textHash(provider.id, voice, text)
  const chars = countChars(text)

  const cached = await getCachedAudio(provider.id, voice, textHashKey)
  if (cached) {
    return NextResponse.json({
      audio: Buffer.from(cached.audio).toString('base64'),
      contentType: cached.contentType,
      chars,
      creditsCharged: 0,
    })
  }

  const credits = calcCredits(chars, CONFIG.tts.creditsPer100Chars)
  const meta = {
    provider: provider.id,
    voice,
    chars,
    costUsd: estimateCostUsd(chars, provider.costPerMillionChars),
  }
  const deducted = await deductCredits(session.user.id, credits, textHashKey, meta, '云端朗读')
  if (!deducted) {
    return NextResponse.json({ error: '积分不足，请购买积分' }, { status: 402 })
  }

  let result: { audio: Buffer; contentType: string; costUsd: number }
  try {
    result = await provider.synthesize({ text, voice, rate })
  } catch (err) {
    console.error('synthesize failed', err)
    refundCredits(session.user.id, credits, textHashKey, meta, '合成失败退还积分').catch((refundErr) => {
      console.error('refund credits failed', refundErr)
    })
    return NextResponse.json({ error: '语音合成失败，请稍后再试' }, { status: 500 })
  }

  try {
    await upsertCachedAudio(provider.id, voice, textHashKey, result.audio, result.contentType, chars)
  } catch (err) {
    console.error('upsert tts cache failed', err)
  }
  cleanupExpiredCache(CONFIG.tts.cacheTtlDays).catch(console.error)

  return NextResponse.json({
    audio: Buffer.from(result.audio).toString('base64'),
    contentType: result.contentType,
    chars,
    creditsCharged: credits,
  })
}
