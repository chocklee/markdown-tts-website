'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from 'next-auth/react'
import { parseDocument } from '@/lib/markdown/parse'
import { saveDocumentToLibrary } from '@/lib/library/actions'
import { libraryUserId } from '@/lib/library/userKey'
import { scheduleSync } from '@/lib/sync/schedule'
import { useI18n } from '@/lib/i18n'
import { IconUpload, IconClose } from '@/components/app/icons'

const MAX_SIZE = 5 * 1024 * 1024

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

export default function InputSection() {
  const router = useRouter()
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileLabel, setFileLabel] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const readingFileRef = useRef<File | null>(null)

  function handleFile(file: File | undefined) {
    if (!file) return
    setError('')
    if (file.size > MAX_SIZE) {
      setError(t('newDoc.errTooLarge'))
      return
    }
    if (!/\.md$/i.test(file.name) && file.type !== 'text/markdown' && file.type !== 'text/plain') {
      setError(t('newDoc.errType'))
      return
    }
    setFileName(file.name.replace(/\.[^.]*$/, ''))
    setFileLabel(file.name)
    setReading(true)
    readingFileRef.current = file
    const reader = new FileReader()
    reader.onload = () => {
      if (readingFileRef.current !== file) return
      setText(String(reader.result ?? ''))
      setReading(false)
    }
    reader.onerror = () => {
      if (readingFileRef.current !== file) return
      setError(t('newDoc.errRead'))
      setReading(false)
    }
    reader.readAsText(file, 'utf-8')
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = ''
    readingFileRef.current = null
    setFileName('')
    setFileLabel('')
    setReading(false)
    setError('')
  }

  async function start() {
    if (saving) return
    if (reading) {
      setError(t('newDoc.errReading'))
      return
    }
    const content = text.trim()
    if (!content) {
      setError(t('newDoc.errEmpty'))
      return
    }
    if (byteLength(content) > MAX_SIZE) {
      setError(t('newDoc.errContentLarge'))
      return
    }
    setSaving(true)
    try {
      const doc = parseDocument(content, fileName || t('newDoc.untitled'))
      // 用点击时刻的实时登录态确定归属账号，避免会话未就绪时存进游客命名空间
      const session = await getSession()
      const userKey = libraryUserId(session)
      const stored = await saveDocumentToLibrary({ title: doc.title, content }, userKey)
      scheduleSync(userKey)
      router.push(`/reader?docId=${encodeURIComponent(stored.docId)}`)
    } catch {
      setError(t('newDoc.errSave'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="new-wrap">
      <div className="card new-card">
        <p className="new-label">{t('newDoc.pasteLabel')}</p>
        <textarea
          aria-label={t('newDoc.pasteLabel')}
          className="new-textarea"
          placeholder={t('newDoc.textareaPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="new-divider">{t('newDoc.orUpload')}</div>

        <input
          ref={fileRef}
          type="file"
          accept=".md,text/markdown,text/plain"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {fileLabel ? (
          <div className="file-chip">
            <span className="file-icon" aria-hidden="true">
              MD
            </span>
            <div className="body">
              <div className="title">{fileLabel}</div>
              <div className="sub">{reading ? t('newDoc.reading') : t('newDoc.fileRead')}</div>
            </div>
            <button type="button" className="icon-btn" aria-label={t('newDoc.removeFile')} onClick={clearFile}>
              <IconClose />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="dropzone"
            onClick={() => {
              if (fileRef.current) fileRef.current.value = ''
              fileRef.current?.click()
            }}
          >
            <IconUpload />
            <span className="t">{t('newDoc.chooseFile')}</span>
            <span className="s">{t('newDoc.chooseFileSub')}</span>
          </button>
        )}

        {error && <p className="new-error">{error}</p>}

        <div className="new-actions">
          <span className="meta">{t('newDoc.autoEnter')}</span>
          <button type="button" className="btn-primary" disabled={saving || reading} onClick={() => void start()}>
            {saving ? t('newDoc.saving') : t('newDoc.start')}
          </button>
        </div>
      </div>
    </div>
  )
}
