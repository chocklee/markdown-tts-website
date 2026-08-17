// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithI18n } from '@/test-utils/i18n'
import { ReaderLayout } from '../ReaderLayout'
import { defaultSettings } from '@/types/reader'
import { parseDocument } from '@/lib/markdown/parse'
import { useReaderStore } from '@/lib/state/readerStore'

const DOC = parseDocument('# 标题\n\n第一句。第二句。')
const DOC_ID = '123e4567-e89b-12d3-a456-426614174000'

function renderReader() {
  useReaderStore.setState({
    document: DOC,
    settings: { ...defaultSettings },
    speakableIds: DOC.sentenceIds,
    currentIndex: 0,
    isPlaying: false,
    queue: null,
    engine: null,
  })
  return renderWithI18n(<ReaderLayout document={DOC} docId={DOC_ID} />)
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('ReaderLayout convert', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('转换请求使用真实 docId（UUID），而不是内容哈希', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ status: 'done', progress: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    renderReader()

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const requested = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(requested.some((u) => u.includes(`docId=${DOC_ID}`))).toBe(true)
    expect(requested.some((u) => u.includes(DOC.id))).toBe(false)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /转成音频/ }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/tts/convert')
      expect(post).toBeTruthy()
      const body = JSON.parse(String(post![1]?.body)) as { docId: string }
      expect(body.docId).toBe(DOC_ID)
    })
  })
})
