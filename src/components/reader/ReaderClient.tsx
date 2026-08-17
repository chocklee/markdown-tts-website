'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { parseDocument } from '@/lib/markdown/parse'
import { getDocument } from '@/lib/storage/library'
import { migrateLegacyDocument } from '@/lib/library/actions'
import { libraryUserId } from '@/lib/library/userKey'
import { loadPosition, savePosition } from '@/lib/storage/local'
import { useReaderStore } from '@/lib/state/readerStore'
import { ReaderLayout } from '@/components/reader/ReaderLayout'
import { AppShell } from '@/components/app/AppShell'
import { useI18n } from '@/lib/i18n'
import type { ReaderDocument } from '@/types/reader'
import type { LibraryDocument } from '@/types/document'

export function ReaderClient({ docId }: { docId: string | null }) {
  const router = useRouter()
  const { t } = useI18n()
  const { status, data: session } = useSession()
  const userKey = libraryUserId(session)
  const [stored, setStored] = useState<LibraryDocument | null>(null)
  const [doc, setDoc] = useState<ReaderDocument | null>(null)
  const init = useReaderStore((s) => s.init)
  const document = useReaderStore((s) => s.document)

  useEffect(() => {
    // 等 next-auth 状态就绪再查本地文档，避免 loading 期间用空账号查不到
    // 刚保存的文档而被重定向回首页
    if (status === 'loading') return
    let cancelled = false
    async function load() {
      try {
        let found: LibraryDocument | null = null
        if (docId) found = await getDocument(userKey, docId)
        if (found?.deletedAt) {
          if (!cancelled) router.replace('/')
          return
        }
        if (!found) {
          found = await migrateLegacyDocument(userKey)
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
  }, [status, docId, router, userKey])

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
            <span className="doc-title">{t('reader.loadingDoc')}</span>
          </div>
          <p className="meta" style={{ textAlign: 'center', padding: '48px 0' }}>
            {t('reader.loadingDocSub')}
          </p>
        </div>
      ) : (
        <ReaderLayout document={doc} docId={stored?.docId ?? ''} />
      )}
    </AppShell>
  )
}
