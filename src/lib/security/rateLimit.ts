const buckets = new Map<string, { count: number; resetAt: number }>()

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  if (buckets.size > 1000) {
    for (const [k, entry] of buckets) {
      if (entry.resetAt < now) buckets.delete(k)
    }
  }
  const entry = buckets.get(key)
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  entry.count += 1
  return entry.count > limit
}

// 依赖平台覆盖 X-Forwarded-For（Vercel 行为），取最左值作为客户端 IP
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
