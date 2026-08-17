import { describe, expect, it, vi, beforeEach } from 'vitest'
import { GET } from '../audio/route'

vi.mock('@/lib/auth/server', () => ({ auth: vi.fn() }))
vi.mock('@/lib/db/convert', () => ({ getConverted: vi.fn() }))

import { auth } from '@/lib/auth/server'
import { getConverted } from '@/lib/db/convert'
import type { ConvertedAudio } from '@/lib/db/convert'

const DOC_ID = '123e4567-e89b-12d3-a456-426614174000'

function doneRow(overrides: Partial<ConvertedAudio> = {}): ConvertedAudio {
  return {
    userId: 'u1', docId: DOC_ID, voice: 'alloy', rate: 1, skipCode: true, skipTable: true,
    chars: 10, sizeBytes: 1000, status: 'done', progress: 1, chunksTotal: 1, chunksDone: 1,
    audio: Buffer.from('0123456789'), contentType: 'audio/mpeg', error: null, updatedAt: 't',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(auth).mockResolvedValue({ user: { id: 'u1' } } as never)
})

describe('GET /api/tts/convert/[docId]/audio', () => {
  it('返回完整音频', async () => {
    vi.mocked(getConverted).mockResolvedValue(doneRow())
    const res = await GET(new Request('http://x/audio'), { params: Promise.resolve({ docId: DOC_ID }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('0123456789')
  })

  it('支持 Range 返回 206', async () => {
    vi.mocked(getConverted).mockResolvedValue(doneRow())
    const res = await GET(new Request('http://x/audio', { headers: { Range: 'bytes=2-5' } }), { params: Promise.resolve({ docId: DOC_ID }) })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('2345')
  })

  it('未完成或不存在返回 404', async () => {
    vi.mocked(getConverted).mockResolvedValue(doneRow({ status: 'converting', audio: null }))
    const res = await GET(new Request('http://x/audio'), { params: Promise.resolve({ docId: DOC_ID }) })
    expect(res.status).toBe(404)
  })

  it('download=1 时带下载头', async () => {
    vi.mocked(getConverted).mockResolvedValue(doneRow())
    const res = await GET(new Request('http://x/audio?download=1'), { params: Promise.resolve({ docId: DOC_ID }) })
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
  })
})
