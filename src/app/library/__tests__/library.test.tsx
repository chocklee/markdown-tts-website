// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { listDocuments, getDocument, deleteDocument } from '@/lib/storage/library'
import { saveDocumentToLibrary } from '@/lib/library/actions'
import { runSync } from '@/lib/sync/manager'
import type { SyncResult } from '@/lib/sync/manager'

const sessionMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string } & AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => sessionMock(),
}))

vi.mock('@/lib/sync/schedule', () => ({
  scheduleSync: vi.fn(),
}))

vi.mock('@/lib/sync/manager', () => ({
  runSync: vi.fn(),
}))

import LibraryPage from '../page'

describe('LibraryPage', () => {
  beforeEach(async () => {
    sessionMock.mockReset()
    vi.mocked(runSync).mockReset()
    localStorage.clear()
    for (const doc of await listDocuments()) {
      await deleteDocument(doc.docId)
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('未登录时显示登录提示与本机文档，不触发同步', async () => {
    await saveDocumentToLibrary({ title: '本机笔记', content: '内容' })
    sessionMock.mockReturnValue({ status: 'unauthenticated', data: null })

    render(<LibraryPage />)

    expect(await screen.findByText('本机笔记')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '登录' })).toBeInTheDocument()
    expect(screen.getByText(/文档会自动同步到云端/)).toBeInTheDocument()
    expect(runSync).not.toHaveBeenCalled()
  })

  it('登录后自动同步并显示配额', async () => {
    await saveDocumentToLibrary({ title: '云笔记', content: '内容' })
    sessionMock.mockReturnValue({ status: 'authenticated', data: { user: { email: 'a@b.c' } } })
    vi.mocked(runSync).mockResolvedValue({
      uploaded: 1,
      downloaded: 0,
      conflicted: 0,
      error: null,
      quotaBytes: 1024 * 1024,
    })

    render(<LibraryPage />)

    await waitFor(() => expect(runSync).toHaveBeenCalled())
    expect(await screen.findByText(/已用 6 B \/ 1\.0 MB/)).toBeInTheDocument()
    expect(screen.getByText(/已同步：上传 1 篇/)).toBeInTheDocument()
  })

  it('重命名文档即时生效并写入 IndexedDB', async () => {
    await saveDocumentToLibrary({ title: '旧标题', content: '内容' })
    sessionMock.mockReturnValue({ status: 'unauthenticated', data: null })
    const user = userEvent.setup()

    render(<LibraryPage />)
    await screen.findByText('旧标题')

    await user.click(screen.getByRole('button', { name: '重命名' }))
    const input = screen.getByDisplayValue('旧标题')
    await user.clear(input)
    await user.type(input, '新标题')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('新标题')).toBeInTheDocument()
    const docs = await listDocuments()
    expect(docs).toHaveLength(1)
    expect(docs[0].title).toBe('新标题')
  })

  it('删除进入回收站，可恢复', async () => {
    const doc = await saveDocumentToLibrary({ title: '待删除', content: '内容' })
    sessionMock.mockReturnValue({ status: 'unauthenticated', data: null })
    const user = userEvent.setup()

    render(<LibraryPage />)
    await screen.findByText('待删除')

    await user.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(screen.queryByText('待删除')).not.toBeInTheDocument())
    const softDeleted = await getDocument(doc.docId)
    expect(softDeleted?.deletedAt).not.toBeNull()

    await user.click(screen.getByRole('button', { name: '回收站' }))
    expect(await screen.findByText('待删除')).toBeInTheDocument()
    expect(screen.getByText(/剩余 \d+ 天/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '恢复' }))
    await waitFor(() => expect(screen.queryByText('待删除')).not.toBeInTheDocument())
    const restored = await getDocument(doc.docId)
    expect(restored?.deletedAt).toBeNull()

    await user.click(screen.getByRole('button', { name: '文档' }))
    expect(await screen.findByText('待删除')).toBeInTheDocument()
  })

  it('彻底删除后从 IndexedDB 移除', async () => {
    const doc = await saveDocumentToLibrary({ title: '要清空', content: '内容' })
    sessionMock.mockReturnValue({ status: 'unauthenticated', data: null })
    const user = userEvent.setup()

    render(<LibraryPage />)
    await screen.findByText('要清空')

    await user.click(screen.getByRole('button', { name: '删除' }))
    await user.click(screen.getByRole('button', { name: '回收站' }))
    await screen.findByText('要清空')

    await user.click(screen.getByRole('button', { name: '彻底删除' }))
    await waitFor(async () => {
      expect(await getDocument(doc.docId)).toBeNull()
    })
    expect(screen.getByText('回收站是空的')).toBeInTheDocument()
  })

  it('同步失败时错误提示优先于成功文案', async () => {
    await saveDocumentToLibrary({ title: '失败笔记', content: '内容' })
    sessionMock.mockReturnValue({ status: 'authenticated', data: { user: { email: 'a@b.c' } } })
    vi.mocked(runSync).mockResolvedValue({
      uploaded: 1,
      downloaded: 0,
      conflicted: 0,
      error: '部分文档同步失败，请稍后重试',
      quotaBytes: 1024 * 1024,
    })

    render(<LibraryPage />)

    await waitFor(() => expect(runSync).toHaveBeenCalled())
    expect(await screen.findByText('部分文档同步失败，请稍后重试')).toBeInTheDocument()
    expect(screen.queryByText(/已同步：上传 1 篇/)).not.toBeInTheDocument()
    expect(screen.getByText(/已用 6 B \/ 1\.0 MB/)).toBeInTheDocument()
  })

  it('进行中的同步不会被重复触发', async () => {
    sessionMock.mockReturnValue({ status: 'authenticated', data: { user: { email: 'a@b.c' } } })
    let resolveSync!: (result: SyncResult) => void
    vi.mocked(runSync).mockReturnValue(
      new Promise<SyncResult>((resolve) => {
        resolveSync = resolve
      })
    )
    const user = userEvent.setup()

    render(<LibraryPage />)
    await waitFor(() => expect(runSync).toHaveBeenCalledTimes(1))

    const button = screen.getByRole('button', { name: '同步中…' })
    await waitFor(() => expect(button).toBeDisabled())
    await user.click(button)
    await user.click(button)
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    expect(runSync).toHaveBeenCalledTimes(1)

    resolveSync({ uploaded: 0, downloaded: 0, conflicted: 0, error: null, quotaBytes: 1024 })
    await waitFor(() => expect(screen.queryByText('同步中…')).not.toBeInTheDocument())
    expect(runSync).toHaveBeenCalledTimes(1)
  })
})
