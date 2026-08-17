import type { LibraryDocument } from '@/types/document'

const DB_NAME = 'mtts-library'
const STORE = 'docs'
const DB_VERSION = 1

type StoredDoc = LibraryDocument & { userId?: string }

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onblocked = () => {
      // Another connection is holding the DB open; wait for it to close.
    }
    req.onupgradeneeded = (event) => {
      const db = req.result
      switch (event.oldVersion) {
        case 0:
          db.createObjectStore(STORE, { keyPath: 'docId' })
          break
        default:
          break
      }
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// 归属字段：'' 表示未登录的游客命名空间；历史数据（无 userId 字段）同样视为游客数据
function ownerOf(record: StoredDoc): string {
  return record.userId ?? ''
}

function toLibraryDocument(record: StoredDoc): LibraryDocument {
  const { userId: _owner, ...doc } = record
  return doc
}

export async function listDocuments(userId: string): Promise<LibraryDocument[]> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).getAll() as IDBRequest<StoredDoc[]>
  return new Promise((resolve, reject) => {
    req.onsuccess = () =>
      resolve(req.result.filter((record) => ownerOf(record) === userId).map(toLibraryDocument))
    req.onerror = () => reject(req.error)
  })
}

export async function getDocument(userId: string, docId: string): Promise<LibraryDocument | null> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).get(docId) as IDBRequest<StoredDoc | undefined>
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const record = req.result
      resolve(record && ownerOf(record) === userId ? toLibraryDocument(record) : null)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function putDocument(userId: string, doc: LibraryDocument): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put({ ...doc, userId } as StoredDoc)
  return txDone(tx)
}

export async function deleteDocument(userId: string, docId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const req = store.get(docId) as IDBRequest<StoredDoc | undefined>
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => {
      if (req.result && ownerOf(req.result) === userId) store.delete(docId)
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
  return txDone(tx)
}

// 清除指定账号的全部本地缓存（切换账号时调用，避免串号）
export async function clearUserDocuments(userId: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const req = store.getAll() as IDBRequest<StoredDoc[]>
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => {
      for (const record of req.result) {
        if (ownerOf(record) === userId) store.delete(record.docId)
      }
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
  return txDone(tx)
}

export async function clearAllLibrary(): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).clear()
  return txDone(tx)
}
