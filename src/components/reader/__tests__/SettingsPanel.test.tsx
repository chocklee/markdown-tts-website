// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReaderStore } from '@/lib/state/readerStore'
import { defaultSettings } from '@/types/reader'

const fetchMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string } & AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { SettingsPanel } from '../SettingsPanel'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('SettingsPanel 逐句模式', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    useReaderStore.setState({
      settings: { ...defaultSettings },
      document: null,
      speakableIds: [],
      currentIndex: 0,
      isPlaying: false,
      queue: null,
      engine: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('未购买时显示锁定态与购买入口，开关不可用', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: '未登录' }, 401))
    render(<SettingsPanel onClose={vi.fn()} />)
    expect(await screen.findByText(/购买后解锁逐句模式/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /购买后解锁逐句模式/ })).toHaveAttribute('href', '/pricing')
    expect(screen.getByRole('checkbox', { name: '逐句模式（未解锁）' })).toBeDisabled()
  })

  it('已购买时显示开关与时长选择，切换后写入 store', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ creditsBalance: 200, quotaBytes: 1073741824, purchased: true }))
    render(<SettingsPanel onClose={vi.fn()} />)
    const toggle = await screen.findByRole('checkbox', { name: '逐句模式' })
    await userEvent.click(toggle)
    expect(useReaderStore.getState().settings.sentencePause).toBe(true)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /暂停时长/ }), '5')
    expect(useReaderStore.getState().settings.sentencePauseSeconds).toBe(5)
  })

  it('余额接口异常时按未购买处理', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    render(<SettingsPanel onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '逐句模式（未解锁）' })).toBeDisabled()
    })
  })
})
