import { describe, it, expect, beforeEach } from 'vitest'
import { listDocuments, getDocument, putDocument, deleteDocument } from '../library'
import type { LibraryDocument } from '@/types/document'

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
    for (const doc of await listDocuments()) {
      await deleteDocument(doc.docId)
    }
  })

  it('保存后可列出并读取', async () => {
    await putDocument(makeDoc('d1'))
    const all = await listDocuments()
    expect(all.map((d) => d.docId)).toEqual(['d1'])
    expect((await getDocument('d1'))?.title).toBe('标题')
  })

  it('覆盖保存同 docId 文档', async () => {
    await putDocument(makeDoc('d1'))
    await putDocument({ ...makeDoc('d1'), title: '新标题' })
    expect((await getDocument('d1'))?.title).toBe('新标题')
    expect((await listDocuments()).length).toBe(1)
  })

  it('删除后不可读', async () => {
    await putDocument(makeDoc('d1'))
    await deleteDocument('d1')
    expect(await getDocument('d1')).toBeNull()
    expect((await listDocuments()).length).toBe(0)
  })

  it('不存在的文档返回 null', async () => {
    expect(await getDocument('missing')).toBeNull()
  })
})
