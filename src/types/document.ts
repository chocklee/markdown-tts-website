export interface SyncedDocument {
  docId: string
  title: string
  content: string
  contentHash: string
  fileSizeBytes: number
  updatedAt: number
  deletedAt: number | null
  deleteExpiresAt: number | null
}

export interface LibraryDocument extends SyncedDocument {
  dirty: boolean
}

export function contentHashOf(content: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}
