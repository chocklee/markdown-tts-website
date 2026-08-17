// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n'
import { clearAllLibrary } from '@/lib/storage/library'
import { saveDocumentToLibrary } from '@/lib/library/actions'
import { ReaderClient } from '../ReaderClient'

const replaceMock = vi.fn()
const sessionMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => sessionMock(),
}))

function renderReader(docId: string) {
  return render(
    <I18nProvider>
      <ReaderClient docId={docId} />
    </I18nProvider>
  )
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('ReaderClient', () => {
  beforeEach(async () => {
    replaceMock.mockReset()
    sessionMock.mockReset()
    localStorage.clear()
    await clearAllLibrary()
    vi.stubGlobal('fetch', async () => jsonResponse({ status: 'pending', progress: 0 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('登录用户在会话就绪后加载刚保存的文档，不被重定向回首页', async () => {
    const doc = await saveDocumentToLibrary({ title: '我的文章', content: '# 标题\n\n正文内容。' }, 'user-1')
    sessionMock.mockReturnValue({ status: 'loading', data: undefined })
    const { rerender } = renderReader(doc.docId)

    // 会话加载中：显示加载文案且不重定向
    expect(screen.getByText('加载中…')).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()

    sessionMock.mockReturnValue({ status: 'authenticated', data: { user: { id: 'user-1', email: 'a@b.c' } } })
    rerender(
      <I18nProvider>
        <ReaderClient docId={doc.docId} />
      </I18nProvider>
    )

    expect(await screen.findByText('正文内容。')).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('游客文档在未登录时正常加载', async () => {
    const doc = await saveDocumentToLibrary({ title: '游客文章', content: '# 标题\n\n游客内容。' }, '')
    sessionMock.mockReturnValue({ status: 'unauthenticated', data: null })

    renderReader(doc.docId)

    expect(await screen.findByText('游客内容。')).toBeInTheDocument()
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
