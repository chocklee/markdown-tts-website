import { createHash } from 'node:crypto'

export function countChars(text: string): number {
  let count = 0
  for (const ch of text) {
    if (/\s/.test(ch)) continue
    count += 1
  }
  return count
}

export function calcCredits(chars: number, creditsPer100Chars: number): number {
  if (chars <= 0 || creditsPer100Chars <= 0) return 0
  return Math.max(1, Math.ceil((chars * creditsPer100Chars) / 100))
}

export function textHash(provider: string, voice: string, text: string): string {
  return createHash('sha256').update(`${provider}|${voice}|${text}`).digest('hex')
}

export function isValidRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 0.5 && rate <= 2
}
