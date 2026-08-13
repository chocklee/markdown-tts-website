import type { LibraryDocument, SyncedDocument } from '@/types/document'
import { listDocuments, putDocument } from '@/lib/storage/library'
import { computeSyncPlan } from '@/lib/sync/engine'

export interface SyncResult {
  uploaded: number
  downloaded: number
  error: string | null
  quotaBytes: number | null
}

export async function runSync(): Promise<SyncResult> {
  const res = await fetch('/api/documents', { cache: 'no-store' })
  if (res.status === 401) {
    return { uploaded: 0, downloaded: 0, error: '登录状态失效，请重新登录', quotaBytes: null }
  }
  if (!res.ok) {
    return { uploaded: 0, downloaded: 0, error: '同步失败，请稍后重试', quotaBytes: null }
  }
  const data = (await res.json()) as { quotaBytes: number; docs: SyncedDocument[] }

  const local = await listDocuments()
  const plan = computeSyncPlan(local, data.docs)

  let uploaded = 0
  let downloaded = 0

  for (const doc of plan.uploads) {
    const putRes = await fetch(`/api/documents/${encodeURIComponent(doc.docId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    })
    if (putRes.status === 413) {
      return { uploaded, downloaded, error: '存储配额不足，本地仍可使用', quotaBytes: data.quotaBytes }
    }
    if (putRes.status === 409) {
      const body = (await putRes.json()) as { server: SyncedDocument }
      await putDocument({ ...body.server, dirty: false })
      downloaded += 1
      continue
    }
    if (!putRes.ok) continue
    await putDocument({ ...doc, dirty: false })
    uploaded += 1
  }

  for (const doc of plan.downloads) {
    await putDocument({ ...doc, dirty: false })
    downloaded += 1
  }

  return { uploaded, downloaded, error: null, quotaBytes: data.quotaBytes }
}
