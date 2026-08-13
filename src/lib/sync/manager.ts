import type { LibraryDocument, SyncedDocument } from '@/types/document'
import { listDocuments, putDocument } from '@/lib/storage/library'
import { computeSyncPlan } from '@/lib/sync/engine'

export interface SyncResult {
  uploaded: number
  downloaded: number
  conflicted: number
  error: string | null
  quotaBytes: number | null
}

export async function runSync(): Promise<SyncResult> {
  let quotaBytes: number | null = null
  let uploaded = 0
  let downloaded = 0
  let conflicted = 0
  let failed = 0

  try {
    const res = await fetch('/api/documents', { cache: 'no-store' })
    if (res.status === 401) {
      return { uploaded, downloaded, conflicted, error: '登录状态失效，请重新登录', quotaBytes: null }
    }
    if (!res.ok) {
      return { uploaded, downloaded, conflicted, error: '同步失败，请稍后重试', quotaBytes: null }
    }
    const data = (await res.json()) as { quotaBytes: number; docs: SyncedDocument[] }
    quotaBytes = data.quotaBytes

    const local = await listDocuments()
    const plan = computeSyncPlan(local, data.docs)

    for (const doc of plan.uploads) {
      const putRes = await fetch(`/api/documents/${encodeURIComponent(doc.docId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      })
      if (putRes.status === 401) {
        return { uploaded, downloaded, conflicted, error: '登录状态失效，请重新登录', quotaBytes }
      }
      if (putRes.status === 413) {
        return { uploaded, downloaded, conflicted, error: '存储配额不足，本地仍可使用', quotaBytes }
      }
      if (putRes.status === 409) {
        const body = (await putRes.json().catch(() => null)) as { server?: SyncedDocument } | null
        conflicted += 1
        if (body?.server) {
          await putDocument({ ...body.server, dirty: false })
          downloaded += 1
        }
        continue
      }
      if (!putRes.ok) {
        failed += 1
        continue
      }
      await putDocument({ ...doc, dirty: false })
      uploaded += 1
    }

    for (const doc of plan.downloads) {
      await putDocument({ ...doc, dirty: false })
      downloaded += 1
    }
  } catch {
    return { uploaded, downloaded, conflicted, error: '网络连接失败，请稍后重试', quotaBytes }
  }

  const error = failed > 0 ? '部分文档同步失败，请稍后重试' : null
  return { uploaded, downloaded, conflicted, error, quotaBytes }
}
