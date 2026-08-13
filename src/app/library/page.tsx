'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { listDocuments, getDocument } from '@/lib/storage/library'
import {
  renameDocument,
  softDeleteDocument,
  restoreDocument,
  removeDocumentLocally,
  activeBytes,
} from '@/lib/library/actions'
import { runSync } from '@/lib/sync/manager'
import { scheduleSync } from '@/lib/sync/schedule'
import type { LibraryDocument } from '@/types/document'

type Tab = 'docs' | 'trash'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function daysLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000))
}

export default function LibraryPage() {
  const { status } = useSession()
  const [docs, setDocs] = useState<LibraryDocument[]>([])
  const [tab, setTab] = useState<Tab>('docs')
  const [quota, setQuota] = useState<{ usedBytes: number; quotaBytes: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [notice, setNotice] = useState('')
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  const refresh = useCallback(async () => {
    const all = await listDocuments()
    setDocs(all.sort((a, b) => b.updatedAt - a.updatedAt))
  }, [])

  const sync = useCallback(async () => {
    if (status !== 'authenticated' || syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const result = await runSync()
      if (result.error) {
        setNotice(result.error)
      } else if (result.uploaded + result.downloaded > 0) {
        setNotice(`已同步：上传 ${result.uploaded} 篇，下载 ${result.downloaded} 篇`)
      }
      if (result.quotaBytes !== null) {
        const all = await listDocuments().catch(() => null)
        if (all) setQuota({ usedBytes: activeBytes(all), quotaBytes: result.quotaBytes })
      }
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refresh().catch(() => {})
    }
  }, [status, refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (status !== 'authenticated') return
    void sync()
    const onOnline = () => void sync()
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void sync(), 60000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
    }
  }, [status, sync])

  async function startRename(docId: string) {
    const doc = await getDocument(docId)
    if (!doc) return
    setRenaming(docId)
    setRenameValue(doc.title)
  }

  async function confirmRename() {
    if (!renaming) return
    await renameDocument(renaming, renameValue)
    if (status === 'authenticated') scheduleSync()
    setRenaming(null)
    await refresh()
  }

  async function remove(docId: string) {
    await softDeleteDocument(docId)
    if (status === 'authenticated') scheduleSync()
    await refresh()
  }

  async function doRestore(docId: string) {
    await restoreDocument(docId)
    if (status === 'authenticated') scheduleSync()
    await refresh()
  }

  async function doPurge(docId: string) {
    await removeDocumentLocally(docId)
    if (status === 'authenticated') {
      await fetch(`/api/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' }).catch(() => {})
    }
    await refresh()
  }

  const visible = docs.filter((d) => (tab === 'docs' ? !d.deletedAt : d.deletedAt))
  const usedBytes = quota?.usedBytes ?? activeBytes(docs)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">我的文档库</h1>
        <div className="flex items-center gap-3 text-sm">
          {status === 'authenticated' && quota && (
            <span className="text-slate-500">
              已用 {formatBytes(usedBytes)} / {formatBytes(quota.quotaBytes)}
            </span>
          )}
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setTab('docs')}
              className={`px-4 py-1.5 ${tab === 'docs' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}
            >
              文档
            </button>
            <button
              type="button"
              onClick={() => setTab('trash')}
              className={`px-4 py-1.5 ${tab === 'trash' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`}
            >
              回收站
            </button>
          </div>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={syncing}
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
          >
            {syncing ? '同步中…' : '立即同步'}
          </button>
        </div>
      </div>

      {status === 'unauthenticated' && (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          <Link href="/login" className="font-medium underline">
            登录
          </Link>
          后文档会自动同步到云端，跨设备可用。
        </p>
      )}

      {notice && <p className="mt-4 text-sm text-slate-500">{notice}</p>}

      {tab === 'trash' && visible.length === 0 && (
        <p className="mt-10 text-center text-slate-400">回收站是空的</p>
      )}
      {tab === 'docs' && visible.length === 0 && (
        <div className="mt-10 text-center">
          <p className="text-slate-400">还没有文档</p>
          <Link href="/" className="mt-3 inline-block text-blue-600">
            去粘贴 / 上传第一篇文档 →
          </Link>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {visible.map((doc) => (
          <li key={doc.docId} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
            {tab === 'docs' && renaming === doc.docId ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-300 p-1.5 text-sm outline-none focus:border-blue-400"
                  autoFocus
                />
                <button type="button" onClick={() => void confirmRename()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white">
                  保存
                </button>
                <button type="button" onClick={() => setRenaming(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                  取消
                </button>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <Link href={`/reader?docId=${encodeURIComponent(doc.docId)}`} className="block truncate font-medium text-slate-800 hover:text-blue-600">
                  {doc.title}
                </Link>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDate(doc.updatedAt)} · {formatBytes(doc.fileSizeBytes)}
                  {doc.deletedAt ? ` · 剩余 ${daysLeft(doc.deleteExpiresAt ?? doc.updatedAt)} 天` : ''}
                  {doc.dirty ? ' · 待同步' : ''}
                </p>
              </div>
            )}
            {tab === 'docs' ? (
              renaming !== doc.docId && (
                <div className="flex shrink-0 gap-2 text-sm">
                  <button type="button" onClick={() => void startRename(doc.docId)} className="text-slate-500 hover:text-slate-900">
                    重命名
                  </button>
                  <button type="button" onClick={() => void remove(doc.docId)} className="text-red-500 hover:text-red-700">
                    删除
                  </button>
                </div>
              )
            ) : (
              <div className="flex shrink-0 gap-2 text-sm">
                <button type="button" onClick={() => void doRestore(doc.docId)} className="text-blue-600 hover:text-blue-800">
                  恢复
                </button>
                <button type="button" onClick={() => void doPurge(doc.docId)} className="text-red-500 hover:text-red-700">
                  彻底删除
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
