// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithI18n } from '@/test-utils/i18n'
import userEvent from '@testing-library/user-event'
import { listDocuments, deleteDocument } from '@/lib/storage/library'
import { saveDocumentToLibrary } from '@/lib/library/actions'
import type { LibraryDocument } from '@/types/document'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}))

vi.mock('next-auth/react', () => ({
  getSession: async () => null,
}))

vi.mock('@/lib/sync/schedule', () => ({
  scheduleSync: vi.fn(),
}))

vi.mock('@/lib/library/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/library/actions')>()
  return { ...actual, saveDocumentToLibrary: vi.fn(actual.saveDocumentToLibrary) }
})

import InputSection from '../InputSection'

describe('InputSection', () => {
  beforeEach(async () => {
    pushMock.mockClear()
    vi.mocked(saveDocumentToLibrary).mockClear()
    localStorage.clear()
    for (const doc of await listDocuments('')) {
      await deleteDocument('', doc.docId)
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('粘贴内容后点击开始收听，保存到文件库并跳转阅读器', async () => {
    const user = userEvent.setup()
    renderWithI18n(<InputSection />)
    await user.type(screen.getByLabelText('粘贴 Markdown'), '# 我的笔记\n\n你好。')
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(expect.stringMatching(/^\/reader\?docId=/))
    )
    const docs = await listDocuments('')
    expect(docs).toHaveLength(1)
    expect(docs[0].title).toBe('我的笔记')
  })

  it('内容为空时提示错误', async () => {
    const user = userEvent.setup()
    renderWithI18n(<InputSection />)
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    expect(screen.getByText('请粘贴内容或选择文件')).toBeInTheDocument()
  })

  it('超过 5MB 的文件提示错误', async () => {
    const user = userEvent.setup()
    renderWithI18n(<InputSection />)
    const bigFile = new File(['x'], 'big.md', { type: 'text/markdown' })
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, bigFile)
    expect(screen.getByText('文件超过 5MB 上限')).toBeInTheDocument()
  })

  it('粘贴多字节内容超过 5MB 字节（但不足 5MB 字符数）时提示错误且不跳转', async () => {
    const user = userEvent.setup()
    renderWithI18n(<InputSection />)
    const textarea = screen.getByLabelText('粘贴 Markdown')
    fireEvent.change(textarea, { target: { value: '你'.repeat(2 * 1024 * 1024) } })
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    expect(screen.getByText('内容超过 5MB 上限')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('选择合法文件后读取内容并保存到文件库', async () => {
    const user = userEvent.setup()
    renderWithI18n(<InputSection />)
    const file = new File(['# 文件标题\n\n内容。'], 'notes.md', { type: 'text/markdown' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    const textarea = screen.getByLabelText('粘贴 Markdown') as HTMLTextAreaElement
    await waitFor(() => expect(textarea.value).toContain('文件标题'))
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(expect.stringMatching(/^\/reader\?docId=/))
    )
    const docs = await listDocuments('')
    expect(docs).toHaveLength(1)
    expect(docs[0].title).toBe('文件标题')
  })

  it('保存中按钮显示保存中…且禁用，避免重复保存', async () => {
    let resolveSave!: (doc: LibraryDocument) => void
    vi.mocked(saveDocumentToLibrary).mockImplementationOnce(
      () => new Promise<LibraryDocument>((resolve) => {
        resolveSave = resolve
      })
    )
    const user = userEvent.setup()
    renderWithI18n(<InputSection />)
    await user.type(screen.getByLabelText('粘贴 Markdown'), '内容')
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    const savingButton = screen.getByRole('button', { name: '保存中…' })
    expect(savingButton).toBeDisabled()
    resolveSave({
      docId: 'doc-1',
      title: '内容',
      content: '内容',
      contentHash: 'x',
      fileSizeBytes: 6,
      updatedAt: 1,
      deletedAt: null,
      deleteExpiresAt: null,
      dirty: true,
    })
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/reader?docId=doc-1'))
    expect(vi.mocked(saveDocumentToLibrary)).toHaveBeenCalledTimes(1)
  })

  it('读取文件时开始收听按钮禁用且不跳转', async () => {
    vi.stubGlobal('FileReader', class {
      result = ''
      onload: (() => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      readAsText() {}
    })
    const user = userEvent.setup()
    renderWithI18n(<InputSection />)
    const file = new File(['内容。'], 'a.md', { type: 'text/markdown' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    expect(screen.getByRole('button', { name: '开始收听' })).toBeDisabled()
    expect(pushMock).not.toHaveBeenCalled()
  })
})
