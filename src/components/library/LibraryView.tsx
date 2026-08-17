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
import { useI18n } from '@/lib/i18n'
import { AppShell, GuestGate } from '@/components/app/AppShell'
import { IconSearch, IconPlus, IconPlay, IconMore } from '@/components/app/icons'
import type { LibraryDocument } from '@/types/document'

type Tab = 'docs' | 'trash'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(ts: number, lang: 'zh' | 'en'): string {
  const d = new Date(ts)
  if (lang === 'en') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`
}

function daysLeft(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000))
}

export function LibraryView() {
  const { status } = useSession()
  const { t, lang } = useI18n()
  const [docs, setDocs] = useState<LibraryDocument[]>([])
  const [tab, setTab] = useState<Tab>('docs')
  const [query, setQuery] = useState('')
  const [quota, setQuota] = useState<{ usedBytes: number; quotaBytes: number } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [converting, setConverting] = useState<Record<string, number>>({})
  const [convertedMap, setConvertedMap] = useState<Record<string, boolean>>({})
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
        showToast(t(result.error))
      } else if (result.uploaded + result.downloaded > 0) {
        showToast(t('library.syncedToast', { up: result.uploaded, down: result.downloaded }))
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
  }, [status, refresh, showToast, t])

  const convertDoc = useCallback(async (doc: LibraryDocument) => {
    setConverting((m) => ({ ...m, [doc.docId]: 0 }))
    try {
      const res = await fetch('/api/tts/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.docId }),
      })
      const data = (await res.json().catch(() => null)) as { status?: string; error?: string } | null
      if (!res.ok) {
        showToast(data?.error ?? t('convert.failed'))
        setConverting((m) => { const n = { ...m }; delete n[doc.docId]; return n })
        return
      }
      if (data?.status === 'done') {
        setConvertedMap((m) => ({ ...m, [doc.docId]: true }))
        showToast(t('convert.done'))
        setConverting((m) => { const n = { ...m }; delete n[doc.docId]; return n })
        return
      }
      for (let i = 0; i < 600; i += 1) {
        await new Promise((r) => setTimeout(r, 2000))
        const sres = await fetch(`/api/tts/convert?docId=${encodeURIComponent(doc.docId)}&advance=1`)
        const sdata = (await sres.json().catch(() => null)) as { status?: string; progress?: number } | null
        setConverting((m) => ({ ...m, [doc.docId]: Math.round((sdata?.progress ?? 0) * 100) }))
        if (sdata?.status === 'done') {
          setConvertedMap((m) => ({ ...m, [doc.docId]: true }))
          showToast(t('convert.done'))
          break
        }
        if (sdata?.status === 'failed') {
          showToast(t('convert.failed'))
          break
        }
      }
    } catch {
      showToast(t('convert.failed'))
    }
    setConverting((m) => { const n = { ...m }; delete n[doc.docId]; return n })
  }, [showToast, t])

  const openMenu = useCallback(async (docId: string) => {
    setMenuFor((cur) => (cur === docId ? null : docId))
    if (menuFor === docId) return
    try {
      const res = await fetch(`/api/tts/convert?docId=${encodeURIComponent(docId)}`)
      const data = (await res.json().catch(() => null)) as { status?: string } | null
      setConvertedMap((m) => ({ ...m, [docId]: data?.status === 'done' }))
    } catch {
      // 状态查询失败时保持未知，不打扰用户
    }
  }, [menuFor])

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
            <h1>{t('library.title')}</h1>
            <p className="meta">
              <span className="num">{docsCount}</span> {t('library.files')}
              {status === 'authenticated' && quota
                ? ` · ${t('library.usedOf', { used: formatBytes(usedBytes), quota: formatBytes(quota.quotaBytes) })}`
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
                placeholder={t('library.searchPlaceholder')}
                aria-label={t('library.searchLabel')}
                autoComplete="off"
              />
            </div>
            <div className="chips" role="group" aria-label={t('library.all')}>
              <button
                type="button"
                className={`chip ${tab === 'docs' ? 'active' : ''}`}
                aria-pressed={tab === 'docs'}
                onClick={() => {
                  setTab('docs')
                  setMenuFor(null)
                }}
              >
                {t('library.all')} · {docsCount}
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
                {t('library.trash')} · {trashCount}
              </button>
            </div>
            <button type="button" className="rt-btn" onClick={() => void sync()} disabled={syncing} style={{ opacity: syncing ? 0.6 : 1 }}>
              {syncing ? t('library.syncing') : t('library.sync')}
            </button>
            <Link href="/new" className="btn-primary btn-add-doc" aria-label={t('library.addDoc')}>
              <IconPlus />
              {t('library.addDoc')}
            </Link>
          </div>

          <p className="sr-only" aria-live="polite">
            {visible.length > 0 ? t('library.found', { n: visible.length }) : ''}
          </p>

          <div className="feed">
            {visible.length === 0 && tab === 'docs' && !q && (
              <div className="card empty-card">
                <p className="h3">{t('library.emptyDocs')}</p>
                <p className="meta">{t('library.emptyDocsSub')}</p>
                <Link href="/new" className="btn-primary" style={{ marginTop: 14, textDecoration: 'none' }}>
                  {t('library.emptyDocsCta')}
                </Link>
              </div>
            )}
            {visible.length === 0 && tab === 'docs' && q && (
              <div className="card empty-card">
                <p className="h3">{t('library.noMatch')}</p>
                <p className="meta">{t('library.noMatchSub')}</p>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: 14 }}
                  onClick={() => {
                    setQuery('')
                    setTab('docs')
                  }}
                >
                  {t('library.clearFilters')}
                </button>
              </div>
            )}
            {visible.length === 0 && tab === 'trash' && (
              <div className="card empty-card">
                <p className="h3">{t('library.trashEmpty')}</p>
                <p className="meta">{t('library.trashEmptySub')}</p>
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
                        aria-label={t('library.renameLabel')}
                        className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none"
                        style={{ borderColor: 'var(--border)' }}
                        autoFocus
                      />
                      <button type="button" onClick={() => void confirmRename()} className="btn-primary" style={{ minHeight: 36, padding: '0 14px', fontSize: 13 }}>
                        {t('common.save')}
                      </button>
                      <button type="button" onClick={() => setRenaming(null)} className="btn-secondary" style={{ minHeight: 36, padding: '0 14px', fontSize: 13 }}>
                        {t('common.cancel')}
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
                        {formatDate(doc.updatedAt, lang)} · {formatBytes(doc.fileSizeBytes)}
                        {doc.deletedAt ? ` · ${t('library.daysLeft', { n: daysLeft(doc.deleteExpiresAt ?? doc.updatedAt) })}` : ''}
                        {doc.dirty && !doc.deletedAt ? ` · ${t('library.pendingSync')}` : ''}
                      </div>
                    </>
                  )}
                </div>
                <div className="row-ctl" style={{ position: 'relative' }}>
                  {tab === 'docs' && renaming !== doc.docId && (
                    <Link
                      href={`/reader?docId=${encodeURIComponent(doc.docId)}`}
                      className="play"
                      aria-label={t('library.playLabel', { title: doc.title })}
                      style={{ textDecoration: 'none' }}
                    >
                      <IconPlay />
                    </Link>
                  )}
                  {renaming !== doc.docId && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={tab === 'docs' ? t('library.moreLabel', { title: doc.title }) : t('library.trashOpLabel', { title: doc.title })}
                      onClick={() => void openMenu(doc.docId)}
                    >
                      <IconMore />
                    </button>
                  )}
                  {menuFor === doc.docId && (
                    <div className="row-menu" role="menu">
                      {tab === 'docs' ? (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={converting[doc.docId] != null}
                            onClick={() => void convertDoc(doc)}
                          >
                            {converting[doc.docId] != null
                              ? t('convert.progress', { p: converting[doc.docId] })
                              : convertedMap[doc.docId]
                                ? t('convert.reconvert')
                                : t('convert.start')}
                          </button>
                          {convertedMap[doc.docId] && (
                            <a role="menuitem" href={`/api/tts/convert/${encodeURIComponent(doc.docId)}/audio?download=1`} download>
                              {t('convert.download')}
                            </a>
                          )}
                          <button type="button" role="menuitem" onClick={() => void startRename(doc.docId)}>
                            {t('library.rename')}
                          </button>
                          <button type="button" role="menuitem" onClick={() => void remove(doc.docId)}>
                            {t('library.delete')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" role="menuitem" onClick={() => void doRestore(doc.docId)}>
                            {t('library.restore')}
                          </button>
                          <button type="button" role="menuitem" onClick={() => void doPurge(doc.docId)}>
                            {t('library.purge')}
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
