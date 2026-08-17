import type { LibraryDocument } from '@/types/document'
import { contentHashOf } from '@/types/document'
import { getDocument, putDocument, deleteDocument, listDocuments } from '@/lib/storage/library'
import { loadLegacyDocument, clearLegacyDocument } from '@/lib/storage/local'
import { CONFIG } from '@/lib/config'

export function newDocId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

export function createLibraryDocument(input: { docId?: string; title: string; content: string }): LibraryDocument {
  const now = Date.now()
  return {
    docId: input.docId ?? newDocId(),
    title: input.title.trim() || '未命名文档',
    content: input.content,
    contentHash: contentHashOf(input.content),
    fileSizeBytes: byteLength(input.content),
    updatedAt: now,
    deletedAt: null,
    deleteExpiresAt: null,
    dirty: true,
  }
}

export async function saveDocumentToLibrary(input: { docId?: string; title: string; content: string }, userId: string): Promise<LibraryDocument> {
  const existing = input.docId ? await getDocument(userId, input.docId) : null
  const doc: LibraryDocument = existing
    ? {
        ...existing,
        title: input.title.trim() || existing.title,
        content: input.content,
        contentHash: contentHashOf(input.content),
        fileSizeBytes: byteLength(input.content),
        updatedAt: Math.max(Date.now(), existing.updatedAt + 1),
        deletedAt: null,
        deleteExpiresAt: null,
        dirty: true,
      }
    : createLibraryDocument(input)
  await putDocument(userId, doc)
  return doc
}

export async function renameDocument(userId: string, docId: string, title: string): Promise<void> {
  const doc = await getDocument(userId, docId)
  if (!doc) return
  await putDocument(userId, {
    ...doc,
    title: title.trim() || doc.title,
    updatedAt: Math.max(Date.now(), doc.updatedAt + 1),
    dirty: true,
  })
}

export async function softDeleteDocument(userId: string, docId: string): Promise<void> {
  const doc = await getDocument(userId, docId)
  if (!doc || doc.deletedAt) return
  const now = Math.max(Date.now(), doc.updatedAt + 1)
  await putDocument(userId, {
    ...doc,
    deletedAt: now,
    deleteExpiresAt: now + CONFIG.recycle.retentionDays * 24 * 60 * 60 * 1000,
    updatedAt: now,
    dirty: true,
  })
}

export async function restoreDocument(userId: string, docId: string): Promise<void> {
  const doc = await getDocument(userId, docId)
  if (!doc) return
  await putDocument(userId, {
    ...doc,
    deletedAt: null,
    deleteExpiresAt: null,
    updatedAt: Math.max(Date.now(), doc.updatedAt + 1),
    dirty: true,
  })
}

export async function removeDocumentLocally(userId: string, docId: string): Promise<void> {
  await deleteDocument(userId, docId)
}

// 登录/切换账号时，把游客期间（未登录）创建的文档归属到当前账号。
// 只认领本地未同步（dirty）的文档；非 dirty 的游客数据归属不明（可能是旧版本
// 缓存的其他账号文档），直接清理，后续同步会从服务端重新下载当前账号的文档。
export async function claimGuestDocuments(userId: string): Promise<void> {
  if (!userId) return
  const guestDocs = await listDocuments('')
  for (const doc of guestDocs) {
    if (doc.dirty) {
      await putDocument(userId, doc)
    }
    await deleteDocument('', doc.docId)
  }
}

let legacyMigrationPromise: Promise<LibraryDocument | null> | null = null
let legacyMigrationUser = ''

export function migrateLegacyDocument(userId: string): Promise<LibraryDocument | null> {
  if (!legacyMigrationPromise || legacyMigrationUser !== userId) {
    legacyMigrationUser = userId
    legacyMigrationPromise = doMigrateLegacyDocument(userId).finally(() => {
      legacyMigrationPromise = null
      legacyMigrationUser = ''
    })
  }
  return legacyMigrationPromise
}

async function doMigrateLegacyDocument(userId: string): Promise<LibraryDocument | null> {
  const legacy = loadLegacyDocument()
  if (!legacy) return null
  const doc = createLibraryDocument({ title: legacy.title, content: legacy.content })
  await putDocument(userId, doc)
  clearLegacyDocument()
  return doc
}

export function activeBytes(docs: Pick<LibraryDocument, 'deletedAt' | 'fileSizeBytes'>[]): number {
  return docs.reduce((sum, d) => (d.deletedAt ? sum : sum + d.fileSizeBytes), 0)
}
