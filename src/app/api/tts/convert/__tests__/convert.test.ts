import { describe, expect, it, vi, beforeEach } from 'vitest'
import { POST, GET } from '../route'

vi.mock('@/lib/auth/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/credits', () => ({ hasActiveSubscription: vi.fn() }))
vi.mock('@/lib/tts/server/convertService', () => ({
  startConversion: vi.fn(),
  advanceConversion: vi.fn(),
  getConvertStatus: vi.fn(),
  CONVERT_BATCH_SIZE: 4,
}))

import { auth } from '@/lib/auth/server'
import { hasActiveSubscription } from '@/lib/db/credits'
import { startConversion, advanceConversion, getConvertStatus } from '@/lib/tts/server/convertService'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
  vi.mocked(hasActiveSubscription).mockResolvedValue(true)
})

describe('POST /api/tts/convert', () => {
  it('未登录返回 401', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)
    const res = await POST(new Request('http://x/api/tts/convert', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
  })

  it('非订阅返回 403', async () => {
    vi.mocked(hasActiveSubscription).mockResolvedValue(false)
    const res = await POST(new Request('http://x/api/tts/convert', { method: 'POST', body: JSON.stringify({ docId: '123e4567-e89b-12d3-a456-426614174000' }) }))
    expect(res.status).toBe(403)
  })

  it('合法请求返回 pending 与积分', async () => {
    vi.mocked(startConversion).mockResolvedValue({ alreadyDone: false, creditsCharged: 6 })
    const res = await POST(new Request('http://x/api/tts/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: '123e4567-e89b-12d3-a456-426614174000', voice: 'alloy', rate: 1, skipCode: true, skipTable: true }),
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ docId: '123e4567-e89b-12d3-a456-426614174000', status: 'pending', creditsCharged: 6 })
  })

  it('已转换直接返回 done', async () => {
    vi.mocked(startConversion).mockResolvedValue({ alreadyDone: true, creditsCharged: 0 })
    const res = await POST(new Request('http://x/api/tts/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: '123e4567-e89b-12d3-a456-426614174000' }),
    }))
    expect((await res.json()).status).toBe('done')
  })

  it('余额不足返回 402', async () => {
    vi.mocked(startConversion).mockRejectedValue(new Error('INSUFFICIENT_CREDITS'))
    const res = await POST(new Request('http://x/api/tts/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: '123e4567-e89b-12d3-a456-426614174000' }),
    }))
    expect(res.status).toBe(402)
  })
})

describe('GET /api/tts/convert', () => {
  it('advance=1 时推进并返回状态', async () => {
    vi.mocked(advanceConversion).mockResolvedValue({ status: 'converting', progress: 0.5, sizeBytes: 50, error: null, voice: 'alloy', rate: 1, skipCode: true, skipTable: true })
    const res = await GET(new Request('http://x/api/tts/convert?docId=123e4567-e89b-12d3-a456-426614174000&advance=1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('converting')
    expect(body.progress).toBe(0.5)
  })

  it('纯查询不推进', async () => {
    vi.mocked(getConvertStatus).mockResolvedValue({ status: 'done', progress: 1, sizeBytes: 100, error: null, voice: 'alloy', rate: 1, skipCode: true, skipTable: true })
    const res = await GET(new Request('http://x/api/tts/convert?docId=123e4567-e89b-12d3-a456-426614174000'))
    expect(advanceConversion).not.toHaveBeenCalled()
    expect((await res.json()).status).toBe('done')
  })

  it('无任务返回 404', async () => {
    vi.mocked(getConvertStatus).mockResolvedValue(null)
    const res = await GET(new Request('http://x/api/tts/convert?docId=123e4567-e89b-12d3-a456-426614174000'))
    expect(res.status).toBe(404)
  })
})
