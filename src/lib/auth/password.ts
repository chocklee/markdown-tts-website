import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const SCRYPT_N = 16384
export const SCRYPT_R = 8
export const SCRYPT_P = 1
export const SCRYPT_KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString('hex')
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, expectedHex] = parts
  if (!/^[0-9a-f]{32}$/.test(salt)) return false
  if (!/^[0-9a-f]{128}$/.test(expectedHex)) return false
  const costN = Number(n)
  const costR = Number(r)
  const costP = Number(p)
  if (!Number.isInteger(costN) || !Number.isInteger(costR) || !Number.isInteger(costP)) return false
  if (costN < 1024 || costN > 2 ** 24 || costR < 1 || costR > 64 || costP < 1 || costP > 16) return false
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN, { N: costN, r: costR, p: costP })
  const expected = Buffer.from(expectedHex, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}
