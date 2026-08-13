export const CONFIG = {
  quota: {
    freeBytes: 50 * 1024 * 1024,
    paidBytes: 500 * 1024 * 1024,
  },
  recycle: {
    retentionDays: 30,
  },
  auth: {
    verificationTtlMs: 24 * 60 * 60 * 1000,
  },
} as const
