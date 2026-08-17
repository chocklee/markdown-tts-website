'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocument } from '@/lib/markdown/parse'
import { getDocument } from '@/lib/storage/library'
import { migrateLegacyDocument } from '@/lib/library/actions'
import { loadPosition, savePosition } from '@/lib/storage/local'
import { useReaderStore } from '@/lib/state/readerStore'
import { ReaderLayout } from '@/components/reader/ReaderLayout'
import { AppShell } from '@/components/app/AppShell'
import type { ReaderDocument } from '@/types/reader'
import type { LibraryDocument } from '@/types/document'

export function ReaderClient({ docId }: { docId: string | null }) {
  const router = useRouter()
  const [stored, setStored] = useState<LibraryDocument | null>(null)
  const [doc, setDoc] = useState<ReaderDocument | null>(null)
  const init = useReaderStore((s) => s.init)
  const document = useReaderStore((s) => s.document)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let found: LibraryDocument | null = null
        if (docId) found = await getDocument(docId)
        if (found?.deletedAt) {
          if (!cancelled) router.replace('/')
          return
        }
        if (!found) {
          found = await migrateLegacyDocument()
          if (found && !cancelled) {
            router.replace(`/reader?docId=${encodeURIComponent(found.docId)}`)
          }
        }
        if (!found) {
          if (!cancelled) router.replace('/')
          return
        }
        if (!cancelled) {
          setStored(found)
          setDoc(parseDocument(found.content, found.title))
        }
      } catch {
        if (!cancelled) router.replace('/')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [docId, router])

  useEffect(() => {
    if (!stored || !doc || document?.id === doc.id) return
    init(doc)
    const position = loadPosition(stored.docId)
    if (position) {
      useReaderStore.getState().restoreIndex(position)
    }
  }, [stored, doc, document?.id, init])

  useEffect(() => {
    if (!stored) return
    const unsubscribe = useReaderStore.subscribe((state) => {
      const id = state.speakableIds[state.currentIndex]
      if (id) {
        try {
          savePosition(stored.docId, id)
        } catch {
          // 存储不可用（如私密模式）时静默忽略
        }
      }
    })
    return unsubscribe
  }, [stored])

  useEffect(() => {
    return () => {
      useReaderStore.setState({ document: null })
      useReaderStore.getState().stop()
    }
  }, [])

  return (
    <AppShell nav="reader">
      {!doc ? (
        <div className="view active">
          <div className="reader-toolbar">
            <span className="doc-title">加载中…</span>
          </div>
          <p className="meta" style={{ textAlign: 'center', padding: '48px 0' }}>
            正在载入文档…
          </p>
        </div>
      ) : (
        <ReaderLayout document={doc} />
      )}
    </AppShell>
  )
}
