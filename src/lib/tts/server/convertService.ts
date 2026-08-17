import { CONFIG } from '@/lib/config'
import { calcCredits, countChars } from '@/lib/tts/server/cost'
import { getProvider } from '@/lib/tts/server/provider'
import { splitIntoChunks } from '@/lib/tts/server/convertChunks'
import { getServerDocument, getUserQuotaBytes, sumServerDocumentBytes } from '@/lib/db/documents'
import { deductCredits, refundCredits } from '@/lib/db/credits'
import {
  getConvertedMeta,
  createConverted,
  appendConvertedAudio,
  finishConverted,
  failConverted,
  sumConvertedBytes,
  type ConvertedMeta,
} from '@/lib/db/convert'

export const CONVERT_BATCH_SIZE = 4
export const CONVERT_DESC = '完整转换'
const CONVERT_REFUND_DESC = '完整转换失败退还积分'

export function convertRef(docId: string, voice: string, rate: number, skipCode: boolean, skipTable: boolean): string {
  return `convert:${docId}:${voice}:${rate}:${skipCode ? 1 : 0}:${skipTable ? 1 : 0}`
}

export function settingsMatch(
  row: Pick<ConvertedMeta, 'voice' | 'rate' | 'skipCode' | 'skipTable'>,
  voice: string,
  rate: number,
  skipCode: boolean,
  skipTable: boolean,
): boolean {
  return row.voice === voice && row.rate === rate && row.skipCode === skipCode && row.skipTable === skipTable
}

export interface ConvertStatus {
  status: 'pending' | 'converting' | 'done' | 'failed'
  progress: number
  sizeBytes: number
  error: string | null
  voice: string
  rate: number
  skipCode: boolean
  skipTable: boolean
}

function toStatus(row: ConvertedMeta): ConvertStatus {
  return {
    status: row.status,
    progress: row.progress,
    sizeBytes: row.sizeBytes,
    error: row.error,
    voice: row.voice,
    rate: row.rate,
    skipCode: row.skipCode,
    skipTable: row.skipTable,
  }
}

function resolveVoice(voice: string): string {
  const provider = getProvider()
  if (voice && provider.voices.some((v) => v.id === voice)) return voice
  return provider.voices[0]?.id ?? 'alloy'
}

export interface StartOptions {
  voice: string
  rate: number
  skipCode: boolean
  skipTable: boolean
}

export interface StartResult {
  alreadyDone: boolean
  creditsCharged: number
}

export async function startConversion(userId: string, docId: string, opts: StartOptions): Promise<StartResult> {
  const doc = await getServerDocument(userId, docId)
  if (!doc) throw new Error('DOC_NOT_FOUND')
  const voice = resolveVoice(opts.voice)
  const chunks = splitIntoChunks(doc.content, {
    skipCode: opts.skipCode,
    skipTable: opts.skipTable,
    maxChars: CONFIG.tts.maxTextChars,
  })
  const chars = chunks.reduce((sum, c) => sum + countChars(c), 0)
  const credits = calcCredits(chars, CONFIG.tts.creditsPer100Chars)
  const ref = convertRef(docId, voice, opts.rate, opts.skipCode, opts.skipTable)

  const existing = await getConvertedMeta(userId, docId)
  if (existing?.status === 'done' && settingsMatch(existing, voice, opts.rate, opts.skipCode, opts.skipTable)) {
    return { alreadyDone: true, creditsCharged: 0 }
  }

  const ok = await deductCredits(userId, credits, ref, { docId, voice, rate: opts.rate, chars }, CONVERT_DESC)
  if (!ok) throw new Error('INSUFFICIENT_CREDITS')

  await createConverted(userId, docId, {
    voice,
    rate: opts.rate,
    skipCode: opts.skipCode,
    skipTable: opts.skipTable,
    chars,
    chunksTotal: chunks.length,
  })
  return { alreadyDone: false, creditsCharged: credits }
}

function creditsFor(row: Pick<ConvertedMeta, 'chars'>): number {
  return calcCredits(row.chars, CONFIG.tts.creditsPer100Chars)
}

export async function advanceConversion(userId: string, docId: string, batchSize = CONVERT_BATCH_SIZE): Promise<ConvertStatus> {
  const row = await getConvertedMeta(userId, docId)
  if (!row) throw new Error('CONVERT_NOT_FOUND')
  if (row.status === 'done' || row.status === 'failed') return toStatus(row)

  const doc = await getServerDocument(userId, docId)
  if (!doc) throw new Error('DOC_NOT_FOUND')

  const provider = getProvider()
  const chunks = splitIntoChunks(doc.content, {
    skipCode: row.skipCode,
    skipTable: row.skipTable,
    maxChars: CONFIG.tts.maxTextChars,
  })
  const ref = convertRef(docId, row.voice, row.rate, row.skipCode, row.skipTable)
  const slice = chunks.slice(row.chunksDone, Math.min(row.chunksDone + batchSize, chunks.length))

  try {
    const results = await Promise.all(
      slice.map((text) => provider.synthesize({ text, voice: row.voice, rate: row.rate })),
    )
    const joined = Buffer.concat(results.map((r) => r.audio))
    const done = row.chunksDone + results.length
    await appendConvertedAudio(userId, docId, joined, done, chunks.length)

    if (done >= chunks.length) {
      const updated = await getConvertedMeta(userId, docId)
      if (!updated) throw new Error('CONVERT_NOT_FOUND')
      const quotaBytes = await getUserQuotaBytes(userId)
      const usedBytes = (await sumServerDocumentBytes(userId)) + (await sumConvertedBytes(userId))
      if (usedBytes > quotaBytes) {
        await failConverted(userId, docId, 'QUOTA_EXCEEDED')
        await refundCredits(userId, creditsFor(row), ref, { docId, reason: 'quota' }, CONVERT_REFUND_DESC)
        return toStatus({ ...updated, status: 'failed', error: 'QUOTA_EXCEEDED', sizeBytes: 0 })
      }
      await finishConverted(userId, docId)
      return toStatus({ ...updated, status: 'done', progress: 1 })
    }
    const next = await getConvertedMeta(userId, docId)
    if (!next) throw new Error('CONVERT_NOT_FOUND')
    return toStatus(next)
  } catch (err) {
    console.error('convert advance failed', err)
    const message = err instanceof Error ? err.message : String(err)
    await failConverted(userId, docId, message)
    await refundCredits(userId, creditsFor(row), ref, { docId, reason: 'failed' }, CONVERT_REFUND_DESC)
    return toStatus({ ...row, status: 'failed', error: message, sizeBytes: 0 })
  }
}

export async function getConvertStatus(userId: string, docId: string): Promise<ConvertStatus | null> {
  const row = await getConvertedMeta(userId, docId)
  return row ? toStatus(row) : null
}
