export const CREDIT_PACKAGES = [
  { id: 'starter', name: '体验包', usd: 1.99, credits: 200 },
  { id: 'light', name: '轻量包', usd: 3.99, credits: 800 },
  { id: 'unlimited', name: '畅听包', usd: 9.99, credits: 2200 },
] as const

export const CONFIG = {
  quota: {
    freeBytes: 100 * 1024 * 1024,
    paidBytes: 1024 * 1024 * 1024,
  },
  credits: {
    bonusOnRegister: 50,
    ttsCreditsPer100Chars: 3,
    explainCreditsPer100Chars: 4,
    translateCreditsPer100Chars: 4,
    qaShortDoc: 20,
    qaLongDoc: 30,
  },
  tts: {
    provider: 'openai',
    creditsPer100Chars: 3,
    maxTextChars: 2000,
    cacheTtlDays: 30,
  },
  recycle: {
    retentionDays: 30,
  },
  auth: {
    verificationTtlMs: 24 * 60 * 60 * 1000,
  },
} as const
