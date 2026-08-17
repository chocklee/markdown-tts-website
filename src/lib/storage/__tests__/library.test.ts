import { describe, it, expect, beforeEach } from 'vitest'
import {
  listDocuments,
  getDocument,
  putDocument,
  deleteDocument,
  clearUserDocuments,
  clearAllLibrary,
} from '../library'
import type { LibraryDocument } from '@/types/document'

const U1 = 'user-1'
const U2 = 'user-2'

function makeDoc(docId: string, title = '标题'): LibraryDocument {
  return {
    docId,
    title,
    content: '# 内容',
    contentHash: 'abc123',
    fileSizeBytes: 10,
    updatedAt: 1000,
    deletedAt: null,
    deleteExpiresAt: null,
    dirty: false,
  }
}

describe('IndexedDB 文档库', () => {
  beforeEach(async () => {
    await clearAllLibrary()
  })

  it('保存后可列出并读取', async () => {
    await putDocument(U1, makeDoc('d1'))
    const all = await listDocuments(U1)
    expect(all.map((d) => d.docId)).toEqual(['d1'])
    expect((await getDocument(U1, 'd1'))?.title).toBe('标题')
  })

  it('覆盖保存同 docId 文档', async () => {
    await putDocument(U1, makeDoc('d1'))
    await putDocument(U1, { ...makeDoc('d1'), title: '新标题' })
    expect((await getDocument(U1, 'd1'))?.title).toBe('新标题')
    expect((await listDocuments(U1)).length).toBe(1)
  })

  it('删除后不可读', async () => {
    await putDocument(U1, makeDoc('d1'))
    await deleteDocument(U1, 'd1')
    expect(await getDocument(U1, 'd1')).toBeNull()
    expect((await listDocuments(U1)).length).toBe(0)
  })

  it('不存在的文档返回 null', async () => {
    expect(await getDocument(U1, 'missing')).toBeNull()
  })

  it('不同账号的文档互相隔离', async () => {
    await putDocument(U1, makeDoc('d1', '账号一的文档'))
    await putDocument(U2, makeDoc('d2', '账号二的文档'))

    expect((await listDocuments(U1)).map((d) => d.docId)).toEqual(['d1'])
    expect((await listDocuments(U2)).map((d) => d.docId)).toEqual(['d2'])

    expect((await getDocument(U1, 'd2'))).toBeNull()
    expect((await getDocument(U2, 'd1'))).toBeNull()
  })

  it('切换账号后清除该账号缓存不影响其他账号', async () => {
    await putDocument(U1, makeDoc('d1'))
    await putDocument(U2, makeDoc('d2'))
    await clearUserDocuments(U1)
    expect(await listDocuments(U1)).toEqual([])
    expect((await listDocuments(U2)).map((d) => d.docId)).toEqual(['d2'])
  })

  it('无 userId 的历史记录归游客命名空间', async () => {
    await putDocument('', makeDoc('guest'))
    expect((await listDocuments('')).map((d) => d.docId)).toEqual(['guest'])
    expect(await listDocuments(U1)).toEqual([])
    // 读取时剥离归属字段
    const doc = await getDocument('', 'guest')
    expect(doc).not.toBeNull()
    expect((doc as LibraryDocument & { userId?: string }).userId).toBeUndefined()
  })
})
