import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { CONFIG } from '@/lib/config'
import { isRateLimited } from '@/lib/security/rateLimit'
import { calcCredits, countChars, estimateCostUsd, isValidRate, textHash } from '@/lib/tts/server/cost'
import { getProvider, type TtsProvider } from '@/lib/tts/server/provider'
import { cleanupExpiredCache, getCachedAudio, upsertCachedAudio } from '@/lib/db/tts'
import { deductCredits, refundCredits } from '@/lib/db/credits'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  if (isRateLimited(`tts:${session.user.id}`, 60, 60_000)) {
    return NextResponse.json({ error: await serverT('server.rateLimited') }, { status: 429 })
  }

  let body: { text?: unknown; voice?: unknown; rate?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }

  const text = body.text
  if (typeof text !== 'string' || countChars(text) <= 0 || Array.from(text).length > CONFIG.tts.maxTextChars) {
    return NextResponse.json({ error: await serverT('server.textEmptyOrLong') }, { status: 400 })
  }

  let provider: TtsProvider
  try {
    provider = getProvider()
  } catch (err) {
    console.error('get tts provider failed', err)
    return NextResponse.json({ error: await serverT('server.ttsNotConfigured') }, { status: 500 })
  }

  const voice = body.voice
  if (typeof voice !== 'string' || !provider.voices.some((v) => v.id === voice)) {
    return NextResponse.json({ error: await serverT('server.voiceNotFound') }, { status: 400 })
  }
  const rate = body.rate
  if (typeof rate !== 'number' || !isValidRate(rate)) {
    return NextResponse.json({ error: await serverT('server.rateInvalid') }, { status: 400 })
  }

  const textHashKey = textHash(provider.id, voice, text, rate)
  const chars = countChars(text)

  const cached = await getCachedAudio(provider.id, voice, textHashKey, rate, CONFIG.tts.cacheTtlDays)
  if (cached) {
    return NextResponse.json({
      audio: cached.audio.toString('base64'),
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
    return NextResponse.json({ error: await serverT('server.creditsInsufficient') }, { status: 402 })
  }

  let result: { audio: Buffer; contentType: string; costUsd: number }
  try {
    result = await provider.synthesize({ text, voice, rate })
  } catch (err) {
    console.error('synthesize failed', err)
    refundCredits(session.user.id, credits, textHashKey, meta).catch((refundErr) => {
      console.error('refund credits failed', refundErr)
    })
    return NextResponse.json({ error: await serverT('server.synthesizeFailed') }, { status: 500 })
  }

  try {
    await upsertCachedAudio(provider.id, voice, textHashKey, rate, result.audio, result.contentType, chars)
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
