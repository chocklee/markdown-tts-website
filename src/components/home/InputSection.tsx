'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocument } from '@/lib/markdown/parse'
import { saveDocumentToLibrary } from '@/lib/library/actions'
import { scheduleSync } from '@/lib/sync/schedule'
import { IconUpload, IconClose } from '@/components/app/icons'

const MAX_SIZE = 5 * 1024 * 1024

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

export default function InputSection() {
  const router = useRouter()
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
      setError('文件超过 5MB 上限')
      return
    }
    if (!/\.md$/i.test(file.name) && file.type !== 'text/markdown' && file.type !== 'text/plain') {
      setError('请选择 Markdown 或文本文件')
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
      setError('文件读取失败')
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
      setError('文件读取中，请稍候')
      return
    }
    const content = text.trim()
    if (!content) {
      setError('请粘贴内容或选择文件')
      return
    }
    if (byteLength(content) > MAX_SIZE) {
      setError('内容超过 5MB 上限')
      return
    }
    setSaving(true)
    try {
      const doc = parseDocument(content, fileName || '未命名文档')
      const stored = await saveDocumentToLibrary({ title: doc.title, content })
      scheduleSync()
      router.push(`/reader?docId=${encodeURIComponent(stored.docId)}`)
    } catch {
      setError('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="new-wrap">
      <div className="card new-card">
        <p className="new-label">粘贴 Markdown</p>
        <textarea
          aria-label="Markdown 内容"
          className="new-textarea"
          placeholder="在这里粘贴 Markdown 内容，支持标题、列表、引用等语法…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="new-divider">或上传文件</div>

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
              <div className="sub">{reading ? '正在读取文件…' : '文件已读取，可以直接开始收听'}</div>
            </div>
            <button type="button" className="icon-btn" aria-label="移除文件" onClick={clearFile}>
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
            <span className="t">选择 .md 文件</span>
            <span className="s">支持 Markdown 与纯文本，不超过 5MB</span>
          </button>
        )}

        {error && <p className="new-error">{error}</p>}

        <div className="new-actions">
          <span className="meta">保存后自动进入朗读页面</span>
          <button type="button" className="btn-primary" disabled={saving || reading} onClick={() => void start()}>
            {saving ? '保存中…' : '开始收听'}
          </button>
        </div>
      </div>
    </div>
  )
}
