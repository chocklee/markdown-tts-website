'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocument } from '@/lib/markdown/parse'
import { loadDocument, loadPosition, savePosition } from '@/lib/storage/local'
import { useReaderStore } from '@/lib/state/readerStore'
import { ReaderLayout } from '@/components/reader/ReaderLayout'
import type { ReaderDocument } from '@/types/reader'

export default function ReaderPage() {
  const router = useRouter()
  const [doc, setDoc] = useState<ReaderDocument | null>(null)
  const init = useReaderStore((s) => s.init)
  const document = useReaderStore((s) => s.document)

  useEffect(() => {
    const stored = loadDocument()
    if (!stored) {
      router.replace('/')
      return
    }
    setDoc(parseDocument(stored.content, stored.title))
  }, [router])

  useEffect(() => {
    if (!doc || document?.id === doc.id) return
    init(doc)
    const position = loadPosition(doc.id)
    if (position) {
      useReaderStore.getState().restoreIndex(position)
    }
  }, [doc, document?.id, init])

  useEffect(() => {
    if (!doc) return
    const unsubscribe = useReaderStore.subscribe((state) => {
      const id = state.speakableIds[state.currentIndex]
      if (id && state.document?.id === doc.id) {
        savePosition(doc.id, id)
      }
    })
    return unsubscribe
  }, [doc])

  if (!doc) {
    return <div className="p-10 text-center text-slate-400">加载中…</div>
  }

  return <ReaderLayout document={doc} />
}
