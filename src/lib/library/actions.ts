import type { LibraryDocument } from '@/types/document'
import { contentHashOf } from '@/types/document'
import { getDocument, putDocument, deleteDocument } from '@/lib/storage/library'
import { loadLegacyDocument } from '@/lib/storage/local'
import { CONFIG } from '@/lib/config'

export function newDocId(): string {
  return crypto.randomUUID()
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
        updatedAt: Date.now(),
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
    updatedAt: Date.now(),
    dirty: true,
  })
}

export async function softDeleteDocument(docId: string): Promise<void> {
  const doc = await getDocument(docId)
  if (!doc || doc.deletedAt) return
  const now = Date.now()
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
    updatedAt: Date.now(),
    dirty: true,
  })
}

export async function removeDocumentLocally(docId: string): Promise<void> {
  await deleteDocument(docId)
}

export async function migrateLegacyDocument(): Promise<LibraryDocument | null> {
  const legacy = loadLegacyDocument()
  if (!legacy) return null
  if (await getDocument(legacy.id)) return null
  const doc = createLibraryDocument({ docId: legacy.id, title: legacy.title, content: legacy.content })
  await putDocument(doc)
  return doc
}

export function activeBytes(docs: Pick<LibraryDocument, 'deletedAt' | 'fileSizeBytes'>[]): number {
  return docs.reduce((sum, d) => (d.deletedAt ? sum : sum + d.fileSizeBytes), 0)
}
