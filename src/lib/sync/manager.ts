import type { LibraryDocument, SyncedDocument } from '@/types/document'
import { listDocuments, putDocument, deleteDocument } from '@/lib/storage/library'
import { computeSyncPlan } from '@/lib/sync/engine'

export interface SyncResult {
  uploaded: number
  downloaded: number
  conflicted: number
  error: string | null
  quotaBytes: number | null
}

export async function runSync(userId: string): Promise<SyncResult> {
  let quotaBytes: number | null = null
  let uploaded = 0
  let downloaded = 0
  let conflicted = 0
  let failed = 0

  try {
    const res = await fetch('/api/documents', { cache: 'no-store' })
    if (res.status === 401) {
      return { uploaded, downloaded, conflicted, error: 'library.syncSession', quotaBytes: null }
    }
    if (!res.ok) {
      return { uploaded, downloaded, conflicted, error: 'library.syncFailed', quotaBytes: null }
    }
    const data = (await res.json()) as { quotaBytes: number; docs: SyncedDocument[] }
    quotaBytes = data.quotaBytes

    const local = await listDocuments(userId)
    const plan = computeSyncPlan(local, data.docs)

    for (const doc of plan.uploads) {
      const putRes = await fetch(`/api/documents/${encodeURIComponent(doc.docId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      })
      if (putRes.status === 401) {
        return { uploaded, downloaded, conflicted, error: 'library.syncSession', quotaBytes }
      }
      if (putRes.status === 413) {
        return { uploaded, downloaded, conflicted, error: 'library.syncQuota', quotaBytes }
      }
      if (putRes.status === 409) {
        const body = (await putRes.json().catch(() => null)) as { server?: SyncedDocument } | null
        conflicted += 1
        if (body?.server) {
          await putDocument(userId, { ...body.server, dirty: false })
          downloaded += 1
        }
        continue
      }
      if (!putRes.ok) {
        failed += 1
        continue
      }
      await putDocument(userId, { ...doc, dirty: false })
      uploaded += 1
    }

    for (const doc of plan.downloads) {
      await putDocument(userId, { ...doc, dirty: false })
      downloaded += 1
    }

    for (const docId of plan.removals) {
      await deleteDocument(userId, docId)
    }
  } catch {
    return { uploaded, downloaded, conflicted, error: 'library.syncNetwork', quotaBytes }
  }

  const error = failed > 0 ? 'library.syncPartial' : null
  return { uploaded, downloaded, conflicted, error, quotaBytes }
}
