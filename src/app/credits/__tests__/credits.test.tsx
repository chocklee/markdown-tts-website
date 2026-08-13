// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const sessionMock = vi.fn()
const fetchMock = vi.fn()

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

import CreditsPage from '../page'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('CreditsPage', () => {
  beforeEach(() => {
    sessionMock.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    sessionMock.mockReturnValue({ status: 'authenticated', data: { user: { id: 'u1' } } })
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/credits/balance')) {
        return Promise.resolve(jsonResponse({ creditsBalance: 250, quotaBytes: 1073741824, purchased: true }))
      }
      if (url.includes('/api/credits/transactions')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              { id: 't1', amount: 200, kind: 'purchase', description: '购买体验包', createdAt: '2026-08-13T00:00:00Z', ref: 'cs_1', meta: null },
              { id: 't2', amount: -3, kind: 'consumption', description: '云端朗读', createdAt: '2026-08-12T00:00:00Z', ref: null, meta: null },
            ],
            nextCursor: null,
          }),
        )
      }
      return Promise.resolve(jsonResponse({}))
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('展示余额与流水列表', async () => {
    render(<CreditsPage />)
    expect(await screen.findByText('250')).toBeInTheDocument()
    expect(await screen.findByText('购买体验包')).toBeInTheDocument()
    expect(screen.getByText('+200')).toBeInTheDocument()
    expect(screen.getByText('-3')).toBeInTheDocument()
    expect(screen.getByText('云端朗读')).toBeInTheDocument()
  })

  it('未登录时显示登录提示', async () => {
    sessionMock.mockReturnValue({ status: 'unauthenticated', data: null })
    render(<CreditsPage />)
    expect(await screen.findByText(/登录后查看积分余额与消费记录/)).toBeInTheDocument()
  })

  it('有 nextCursor 时显示加载更多并翻页', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/credits/balance')) {
        return Promise.resolve(jsonResponse({ creditsBalance: 250, quotaBytes: 1073741824, purchased: true }))
      }
      const cursor = url.includes('cursor=')
      return Promise.resolve(
        jsonResponse({
          items: cursor
            ? [{ id: 't3', amount: 5, kind: 'adjustment', description: '补偿', createdAt: '2026-08-11T00:00:00Z', ref: null, meta: null }]
            : [{ id: 't1', amount: 200, kind: 'purchase', description: '购买体验包', createdAt: '2026-08-13T00:00:00Z', ref: null, meta: null }],
          nextCursor: cursor ? null : 'abc',
        }),
      )
    })
    render(<CreditsPage />)
    const moreButton = await screen.findByRole('button', { name: '加载更多' })
    await userEvent.click(moreButton)
    await waitFor(() => expect(screen.getByText('补偿')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('cursor=abc'))
  })
})
