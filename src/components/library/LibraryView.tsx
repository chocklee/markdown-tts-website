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
import { useUiStore } from '@/lib/state/uiStore'
import { AppShell, GuestGate } from '@/components/app/AppShell'
import { IconSearch, IconPlus, IconPlay, IconMore } from '@/components/app/icons'
import type { LibraryDocument } from '@/types/document'

type Tab = 'docs' | 'trash'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
}

function daysLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000))
}

export function LibraryView() {
  const { status } = useSession()
  const [docs, setDocs] = useState<LibraryDocument[]>([])
  const [tab, setTab] = useState<Tab>('docs')
  const [query, setQuery] = useState('')
  const [quota, setQuota] = useState<{ usedBytes: number; quotaBytes: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const showToast = useUiStore((s) => s.showToast)

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
        showToast(result.error)
      } else if (result.uploaded + result.downloaded > 0) {
        showToast(`已同步：上传 ${result.uploaded} 篇，下载 ${result.downloaded} 篇`)
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
  }, [status, refresh, showToast])

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
    setMenuFor(null)
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
    setMenuFor(null)
    await refresh()
  }

  async function doRestore(docId: string) {
    await restoreDocument(docId)
    if (status === 'authenticated') scheduleSync()
    setMenuFor(null)
    await refresh()
  }

  async function doPurge(docId: string) {
    await removeDocumentLocally(docId)
    if (status === 'authenticated') {
      await fetch(`/api/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' }).catch(() => {})
    }
    setMenuFor(null)
    await refresh()
  }

  const docsCount = docs.filter((d) => !d.deletedAt).length
  const trashCount = docs.length - docsCount
  const q = query.trim().toLowerCase()
  const visible = docs
    .filter((d) => (tab === 'docs' ? !d.deletedAt : d.deletedAt))
    .filter((d) => {
      if (!q) return true
      const haystack = `${d.title} ${d.content ?? ''}`.slice(0, 400).toLowerCase()
      return haystack.includes(q)
    })
  const usedBytes = quota?.usedBytes ?? activeBytes(docs)

  return (
    <AppShell nav="library">
      <GuestGate>
        <section className="view active">
          <header className="page-head">
            <h1>文库</h1>
            <p className="meta">
              <span className="num">{docsCount}</span> 个文件
              {status === 'authenticated' && quota
                ? ` · 已用 ${formatBytes(usedBytes)} / ${formatBytes(quota.quotaBytes)}`
                : ''}
            </p>
          </header>

          <div className="toolbar-row">
            <div className="search">
              <IconSearch />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索标题或内容…"
                aria-label="搜索文件"
                autoComplete="off"
              />
            </div>
            <div className="chips" role="group" aria-label="按状态筛选">
              <button
                type="button"
                className={`chip ${tab === 'docs' ? 'active' : ''}`}
                aria-pressed={tab === 'docs'}
                onClick={() => {
                  setTab('docs')
                  setMenuFor(null)
                }}
              >
                全部 · {docsCount}
              </button>
              <button
                type="button"
                className={`chip ${tab === 'trash' ? 'active' : ''}`}
                aria-pressed={tab === 'trash'}
                onClick={() => {
                  setTab('trash')
                  setMenuFor(null)
                }}
              >
                回收站 · {trashCount}
              </button>
            </div>
            <button type="button" className="rt-btn" onClick={() => void sync()} disabled={syncing} style={{ opacity: syncing ? 0.6 : 1 }}>
              {syncing ? '同步中…' : '立即同步'}
            </button>
            <Link href="/new" className="btn-primary btn-add-doc" aria-label="添加文档">
              <IconPlus />
              添加文档
            </Link>
          </div>

          <p className="sr-only" aria-live="polite">
            {visible.length > 0 ? `找到 ${visible.length} 个文件` : ''}
          </p>

          <div className="feed">
            {visible.length === 0 && tab === 'docs' && !q && (
              <div className="card empty-card">
                <p className="h3">还没有文档</p>
                <p className="meta">粘贴或上传第一篇 Markdown，开始边看边听。</p>
                <Link href="/new" className="btn-primary" style={{ marginTop: 14, textDecoration: 'none' }}>
                  去创建第一篇文档
                </Link>
              </div>
            )}
            {visible.length === 0 && tab === 'docs' && q && (
              <div className="card empty-card">
                <p className="h3">没有找到匹配的文稿</p>
                <p className="meta">试试更短的关键词，或清空搜索与筛选后浏览全部文件。</p>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: 14 }}
                  onClick={() => {
                    setQuery('')
                    setTab('docs')
                  }}
                >
                  清空搜索与筛选
                </button>
              </div>
            )}
            {visible.length === 0 && tab === 'trash' && (
              <div className="card empty-card">
                <p className="h3">回收站是空的</p>
                <p className="meta">删除的文档会在这里保留 30 天，过期后自动清除。</p>
              </div>
            )}

            {visible.map((doc) => (
              <div
                key={doc.docId}
                className="list-row"
                data-search={`${doc.title} ${doc.content ?? ''}`.slice(0, 400).toLowerCase()}
              >
                <div className="file-icon" aria-hidden="true">
                  MD
                </div>
                <div className="min-w-0">
                  {tab === 'docs' && renaming === doc.docId ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        aria-label="新标题"
                        className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none"
                        style={{ borderColor: 'var(--border)' }}
                        autoFocus
                      />
                      <button type="button" onClick={() => void confirmRename()} className="btn-primary" style={{ minHeight: 36, padding: '0 14px', fontSize: 13 }}>
                        保存
                      </button>
                      <button type="button" onClick={() => setRenaming(null)} className="btn-secondary" style={{ minHeight: 36, padding: '0 14px', fontSize: 13 }}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <>
                      <Link
                        href={`/reader?docId=${encodeURIComponent(doc.docId)}`}
                        className="title block truncate"
                        style={{ textDecoration: 'none', color: 'var(--fg)' }}
                      >
                        {doc.title}
                      </Link>
                      <div className="sub">
                        {formatDate(doc.updatedAt)} · {formatBytes(doc.fileSizeBytes)}
                        {doc.deletedAt ? ` · 剩余 ${daysLeft(doc.deleteExpiresAt ?? doc.updatedAt)} 天` : ''}
                        {doc.dirty && !doc.deletedAt ? ' · 待同步' : ''}
                      </div>
                    </>
                  )}
                </div>
                <div className="row-ctl" style={{ position: 'relative' }}>
                  {tab === 'docs' && renaming !== doc.docId && (
                    <Link
                      href={`/reader?docId=${encodeURIComponent(doc.docId)}`}
                      className="play"
                      aria-label={`播放 ${doc.title}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <IconPlay />
                    </Link>
                  )}
                  {renaming !== doc.docId && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={tab === 'docs' ? `更多操作 ${doc.title}` : `回收站操作 ${doc.title}`}
                      onClick={() => setMenuFor(menuFor === doc.docId ? null : doc.docId)}
                    >
                      <IconMore />
                    </button>
                  )}
                  {menuFor === doc.docId && (
                    <div className="row-menu" role="menu">
                      {tab === 'docs' ? (
                        <>
                          <button type="button" role="menuitem" onClick={() => void startRename(doc.docId)}>
                            重命名
                          </button>
                          <button type="button" role="menuitem" onClick={() => void remove(doc.docId)}>
                            删除
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" role="menuitem" onClick={() => void doRestore(doc.docId)}>
                            恢复
                          </button>
                          <button type="button" role="menuitem" onClick={() => void doPurge(doc.docId)}>
                            彻底删除
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </GuestGate>
    </AppShell>
  )
}
