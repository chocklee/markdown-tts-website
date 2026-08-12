'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseDocument } from '@/lib/markdown/parse'
import { saveDocument } from '@/lib/storage/local'

const MAX_SIZE = 5 * 1024 * 1024

export default function InputSection() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileLabel, setFileLabel] = useState('')
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
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

  function start() {
    if (reading) {
      setError('文件读取中，请稍候')
      return
    }
    const content = text.trim()
    if (!content) {
      setError('请粘贴内容或选择文件')
      return
    }
    if (content.length > MAX_SIZE) {
      setError('内容超过 5MB 上限')
      return
    }
    const doc = parseDocument(content, fileName || '未命名文档')
    try {
      saveDocument({ id: doc.id, title: doc.title, content, savedAt: Date.now() })
    } catch {
      setError('保存失败，内容过大')
      return
    }
    router.push('/reader')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-center text-3xl font-bold">听 Markdown</h1>
      <p className="mt-2 text-center text-slate-500">粘贴或上传 Markdown 文件，边看边听 AI 朗读</p>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <textarea
          aria-label="Markdown 内容"
          className="min-h-64 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-blue-400"
          placeholder="在这里粘贴 Markdown 内容，或点击下方按钮上传 .md 文件（≤5MB）"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
            onClick={() => {
              if (fileRef.current) fileRef.current.value = ''
              fileRef.current?.click()
            }}
          >
            上传 .md 文件
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={reading}
            onClick={start}
          >
            开始收听
          </button>
        </div>
        {fileLabel && <p className="mt-2 text-xs text-slate-400">文件：{fileLabel}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
