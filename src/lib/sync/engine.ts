import type { LibraryDocument, SyncedDocument } from '@/types/document'

export interface SyncPlan {
  uploads: LibraryDocument[]
  downloads: SyncedDocument[]
  removals: string[]
}

export function computeSyncPlan(local: LibraryDocument[], remote: SyncedDocument[]): SyncPlan {
  const remoteByDocId = new Map(remote.map((d) => [d.docId, d]))
  const uploads: LibraryDocument[] = []
  const downloads: SyncedDocument[] = []
  const removals: string[] = []
  const localDocIds = new Set<string>()

  for (const localDoc of local) {
    localDocIds.add(localDoc.docId)
    const remoteDoc = remoteByDocId.get(localDoc.docId)
    if (!remoteDoc) {
      // 云端已不存在（他端彻底删除或已过期清理）：本地已删除的文档直接移除，
      // 避免把已删文档重新上传回去（删除复活）。
      if (localDoc.deletedAt !== null) {
        removals.push(localDoc.docId)
        continue
      }
      uploads.push(localDoc)
      continue
    }
    // 相同 updatedAt 视为无冲突（客户端每次保存都会递增 updatedAt，正常不会出现同时间戳不同内容；服务端 `<=` 守卫把等时间戳重试视为幂等，因此这里无需按 contentHash 再分胜负）
    if (localDoc.dirty || localDoc.updatedAt > remoteDoc.updatedAt) {
      uploads.push(localDoc)
    } else if (remoteDoc.updatedAt > localDoc.updatedAt) {
      downloads.push(remoteDoc)
    }
  }

  for (const remoteDoc of remote) {
    if (!localDocIds.has(remoteDoc.docId)) {
      downloads.push(remoteDoc)
    }
  }

  return { uploads, downloads, removals }
}
