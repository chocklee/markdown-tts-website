import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { runSync } from '../manager'
import { listDocuments, putDocument, deleteDocument, getDocument, clearAllLibrary } from '@/lib/storage/library'
import type { LibraryDocument } from '@/types/document'

interface ResponseLike {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function jsonResponse(body: unknown, status = 200): ResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function makeDoc(docId: string, overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    docId,
    title: 't',
    content: 'c',
    contentHash: 'h',
    fileSizeBytes: 1,
    updatedAt: 200,
    deletedAt: null,
    deleteExpiresAt: null,
    dirty: false,
    ...overrides,
  }
}

const U1 = 'user-1'

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  await clearAllLibrary()
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return jsonResponse({ ok: true })
    return jsonResponse({ quotaBytes: 100, docs: [] })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runSync', () => {
  it('本地已删除且云端缺失 → 移除本地且不上传（防止复活）', async () => {
    await putDocument(U1, makeDoc('gone', { deletedAt: 300, deleteExpiresAt: 300 + 86400000 * 30, dirty: true }))
    const result = await runSync(U1)
    expect(result.uploaded).toBe(0)
    expect(await getDocument(U1, 'gone')).toBeNull()
  })


  it('GET 401 → 登录状态失效，计数为 0，quotaBytes 为 null', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'unauthorized' }, 401))
    const result = await runSync(U1)
    expect(result).toEqual({
      uploaded: 0,
      downloaded: 0,
      conflicted: 0,
      error: 'library.syncSession',
      quotaBytes: null,
    })
  })

  it('fetch 网络异常 → 网络连接失败', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('NetworkError')
    })
    const result = await runSync(U1)
    expect(result).toEqual({
      uploaded: 0,
      downloaded: 0,
      conflicted: 0,
      error: 'library.syncNetwork',
      quotaBytes: null,
    })
  })

  it('成功上传脏文档并清除 dirty 标记', async () => {
    await putDocument(U1, makeDoc('a', { dirty: true }))
    const result = await runSync(U1)
    expect(result).toEqual({ uploaded: 1, downloaded: 0, conflicted: 0, error: null, quotaBytes: 100 })
    const local = await listDocuments(U1)
    expect(local).toHaveLength(1)
    expect(local[0].docId).toBe('a')
    expect(local[0].dirty).toBe(false)
  })

  it('PUT 413 → 配额不足错误，quotaBytes 保留，文档保持 dirty', async () => {
    await putDocument(U1, makeDoc('a', { dirty: true }))
    fetchMock.mockImplementation(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return jsonResponse({ error: 'quota exceeded' }, 413)
      return jsonResponse({ quotaBytes: 100, docs: [] })
    })
    const result = await runSync(U1)
    expect(result.error).toBe('library.syncQuota')
    expect(result.quotaBytes).toBe(100)
    expect(result.uploaded).toBe(0)
    const local = await listDocuments(U1)
    expect(local[0].dirty).toBe(true)
  })

  it('PUT 409 → 拉取服务端版本并计数冲突，本地内容被替换', async () => {
    await putDocument(U1, makeDoc('a', { dirty: true, updatedAt: 100, content: 'local-content' }))
    const server = {
      docId: 'a',
      title: 't',
      content: 'server-content',
      contentHash: 'server-hash',
      fileSizeBytes: 14,
      updatedAt: 300,
      deletedAt: null,
      deleteExpiresAt: null,
    }
    fetchMock.mockImplementation(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return jsonResponse({ server }, 409)
      return jsonResponse({ quotaBytes: 100, docs: [server] })
    })
    const result = await runSync(U1)
    expect(result.conflicted).toBe(1)
    expect(result.downloaded).toBe(1)
    expect(result.uploaded).toBe(0)
    expect(result.error).toBeNull()
    const local = await listDocuments(U1)
    expect(local[0].content).toBe('server-content')
    expect(local[0].dirty).toBe(false)
  })

  it('PUT 409 返回体损坏 → 不抛出，仅计数冲突', async () => {
    await putDocument(U1, makeDoc('a', { dirty: true }))
    fetchMock.mockImplementation(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return { ok: false, status: 409, json: async () => { throw new Error('bad json') } }
      }
      return jsonResponse({ quotaBytes: 100, docs: [] })
    })
    const result = await runSync(U1)
    expect(result.conflicted).toBe(1)
    expect(result.downloaded).toBe(0)
    expect(result.error).toBeNull()
  })

  it('PUT 401 → 登录状态失效', async () => {
    await putDocument(U1, makeDoc('a', { dirty: true }))
    fetchMock.mockImplementation(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return jsonResponse({ error: 'unauthorized' }, 401)
      return jsonResponse({ quotaBytes: 100, docs: [] })
    })
    const result = await runSync(U1)
    expect(result.error).toBe('library.syncSession')
    expect(result.uploaded).toBe(0)
    expect(result.quotaBytes).toBe(100)
  })

  it('PUT 500 → 部分文档同步失败', async () => {
    await putDocument(U1, makeDoc('a', { dirty: true }))
    fetchMock.mockImplementation(async (_input: string, init?: RequestInit) => {
      if (init?.method === 'PUT') return jsonResponse({ error: 'boom' }, 500)
      return jsonResponse({ quotaBytes: 100, docs: [] })
    })
    const result = await runSync(U1)
    expect(result.error).toBe('library.syncPartial')
    expect(result.uploaded).toBe(0)
  })
})
