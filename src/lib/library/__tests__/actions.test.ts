// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createLibraryDocument,
  saveDocumentToLibrary,
  renameDocument,
  softDeleteDocument,
  restoreDocument,
  removeDocumentLocally,
  migrateLegacyDocument,
  claimGuestDocuments,
  activeBytes,
} from '../actions'
import { listDocuments, getDocument, putDocument, clearAllLibrary } from '@/lib/storage/library'

const U1 = 'user-1'
const U2 = 'user-2'

describe('文档操作层', () => {
  beforeEach(async () => {
    await clearAllLibrary()
    localStorage.clear()
  })

  it('创建文档：生成 docId、哈希与大小', async () => {
    const doc = createLibraryDocument({ title: '我的文章', content: '你好世界' })
    expect(doc.docId).toBeTruthy()
    expect(doc.contentHash).toBeTruthy()
    expect(doc.fileSizeBytes).toBeGreaterThan(0)
    expect(doc.dirty).toBe(true)
    expect(doc.deletedAt).toBeNull()
  })

  it('保存新文档并允许再次保存覆盖', async () => {
    const first = await saveDocumentToLibrary({ title: 't', content: '内容一' }, U1)
    const second = await saveDocumentToLibrary({ docId: first.docId, title: 't2', content: '内容二' }, U1)
    expect(second.docId).toBe(first.docId)
    expect(second.title).toBe('t2')
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt)
    expect((await listDocuments(U1)).length).toBe(1)
  })

  it('保存覆盖软删除文档时恢复为活跃', async () => {
    const doc = await saveDocumentToLibrary({ title: 't', content: 'c' }, U1)
    await softDeleteDocument(U1, doc.docId)
    const revived = await saveDocumentToLibrary({ docId: doc.docId, title: 't2', content: 'c2' }, U1)
    expect(revived.deletedAt).toBeNull()
    expect(revived.deleteExpiresAt).toBeNull()
  })

  it('重命名不改变 docId 与内容', async () => {
    const doc = await saveDocumentToLibrary({ title: '旧名', content: '内容' }, U1)
    await renameDocument(U1, doc.docId, '新名')
    const after = await getDocument(U1, doc.docId)
    expect(after?.title).toBe('新名')
    expect(after?.content).toBe('内容')
  })

  it('软删除设置 deletedAt 与到期时间，恢复后清空', async () => {
    const doc = await saveDocumentToLibrary({ title: 't', content: 'c' }, U1)
    await softDeleteDocument(U1, doc.docId)
    let after = await getDocument(U1, doc.docId)
    expect(after?.deletedAt).not.toBeNull()
    expect(after?.deleteExpiresAt).not.toBeNull()
    await restoreDocument(U1, doc.docId)
    after = await getDocument(U1, doc.docId)
    expect(after?.deletedAt).toBeNull()
    expect(after?.deleteExpiresAt).toBeNull()
  })

  it('对不存在的文档重命名/软删/恢复均为空操作', async () => {
    await expect(renameDocument(U1, 'missing', '新名')).resolves.toBeUndefined()
    await expect(softDeleteDocument(U1, 'missing')).resolves.toBeUndefined()
    await expect(restoreDocument(U1, 'missing')).resolves.toBeUndefined()
    expect(await getDocument(U1, 'missing')).toBeNull()
    expect((await listDocuments(U1)).length).toBe(0)
  })

  it('彻底删除后不可读', async () => {
    const doc = await saveDocumentToLibrary({ title: 't', content: 'c' }, U1)
    await removeDocumentLocally(U1, doc.docId)
    expect(await getDocument(U1, doc.docId)).toBeNull()
  })

  it('fileSizeBytes 按 UTF-8 字节数计算', () => {
    expect(createLibraryDocument({ title: 't', content: '你好世界' }).fileSizeBytes).toBe(12)
  })

  it('空白标题回退为未命名文档', () => {
    expect(createLibraryDocument({ title: '   ', content: 'c' }).title).toBe('未命名文档')
  })

  it('迁移 M1 遗留 localStorage 单文档', async () => {
    localStorage.setItem('mtts:doc', JSON.stringify({ id: 'legacy-1', title: '旧文', content: '# 旧内容', savedAt: Date.now() }))
    const migrated = await migrateLegacyDocument(U1)
    expect(migrated?.docId).toBeTruthy()
    expect(migrated?.docId).not.toBe('legacy-1')
    expect(migrated?.dirty).toBe(true)
    expect((await listDocuments(U1)).length).toBe(1)
    expect(localStorage.getItem('mtts:doc')).toBeNull()
    // 二次迁移不重复导入
    expect(await migrateLegacyDocument(U1)).toBeNull()
    expect((await listDocuments(U1)).length).toBe(1)
  })

  it('并发迁移只导入一次，两次调用返回同一 docId', async () => {
    localStorage.setItem('mtts:doc', JSON.stringify({ id: 'legacy-1', title: '旧文', content: '# 旧内容', savedAt: Date.now() }))
    const [first, second] = await Promise.all([migrateLegacyDocument(U1), migrateLegacyDocument(U1)])
    expect(first?.docId).toBeTruthy()
    expect(second?.docId).toBe(first?.docId)
    expect((await listDocuments(U1)).length).toBe(1)
    expect(localStorage.getItem('mtts:doc')).toBeNull()
  })

  it('无遗留文档时迁移返回 null', async () => {
    expect(await migrateLegacyDocument(U1)).toBeNull()
  })

  it('登录后 dirty 的游客文档归属当前账号，且不串到其他账号', async () => {
    await saveDocumentToLibrary({ title: '游客笔记', content: '内容' }, '')
    await claimGuestDocuments(U1)

    expect((await listDocuments(U1)).map((d) => d.title)).toEqual(['游客笔记'])
    expect(await listDocuments('')).toEqual([])
    expect(await listDocuments(U2)).toEqual([])
  })

  it('非 dirty 的游客文档（旧缓存的其他账号数据）不认领，直接清理', async () => {
    await putDocument('', { ...createLibraryDocument({ title: '已同步', content: '内容' }), dirty: false })
    await claimGuestDocuments(U1)

    expect(await listDocuments(U1)).toEqual([])
    expect(await listDocuments('')).toEqual([])
  })

  it('activeBytes 只累计未删除文档', () => {
    const docs = [
      { deletedAt: null as number | null, fileSizeBytes: 10 },
      { deletedAt: 5, fileSizeBytes: 20 },
    ]
    expect(activeBytes(docs)).toBe(10)
  })
})
