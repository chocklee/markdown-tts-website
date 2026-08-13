import type { LibraryDocument } from '@/types/document'
import { contentHashOf } from '@/types/document'
import { getDocument, putDocument, deleteDocument } from '@/lib/storage/library'
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

export async function saveDocumentToLibrary(input: { docId?: string; title: string; content: string }): Promise<LibraryDocument> {
  const existing = input.docId ? await getDocument(input.docId) : null
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
  await putDocument(doc)
  return doc
}

export async function renameDocument(docId: string, title: string): Promise<void> {
  const doc = await getDocument(docId)
  if (!doc) return
  await putDocument({
    ...doc,
    title: title.trim() || doc.title,
    updatedAt: Math.max(Date.now(), doc.updatedAt + 1),
    dirty: true,
  })
}

export async function softDeleteDocument(docId: string): Promise<void> {
  const doc = await getDocument(docId)
  if (!doc || doc.deletedAt) return
  const now = Math.max(Date.now(), doc.updatedAt + 1)
  await putDocument({
    ...doc,
    deletedAt: now,
    deleteExpiresAt: now + CONFIG.recycle.retentionDays * 24 * 60 * 60 * 1000,
    updatedAt: now,
    dirty: true,
  })
}

export async function restoreDocument(docId: string): Promise<void> {
  const doc = await getDocument(docId)
  if (!doc) return
  await putDocument({
    ...doc,
    deletedAt: null,
    deleteExpiresAt: null,
    updatedAt: Math.max(Date.now(), doc.updatedAt + 1),
    dirty: true,
  })
}

export async function removeDocumentLocally(docId: string): Promise<void> {
  await deleteDocument(docId)
}

let legacyMigrationPromise: Promise<LibraryDocument | null> | null = null

export function migrateLegacyDocument(): Promise<LibraryDocument | null> {
  if (!legacyMigrationPromise) {
    legacyMigrationPromise = doMigrateLegacyDocument().finally(() => {
      legacyMigrationPromise = null
    })
  }
  return legacyMigrationPromise
}

async function doMigrateLegacyDocument(): Promise<LibraryDocument | null> {
  const legacy = loadLegacyDocument()
  if (!legacy) return null
  const doc = createLibraryDocument({ title: legacy.title, content: legacy.content })
  await putDocument(doc)
  clearLegacyDocument()
  return doc
}

export function activeBytes(docs: Pick<LibraryDocument, 'deletedAt' | 'fileSizeBytes'>[]): number {
  return docs.reduce((sum, d) => (d.deletedAt ? sum : sum + d.fileSizeBytes), 0)
}
