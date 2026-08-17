// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { screen, waitFor } from '@testing-library/react'
import { renderWithI18n } from '@/test-utils/i18n'
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
    renderWithI18n(<SettingsPanel onClose={vi.fn()} />)
    expect(await screen.findByText(/购买后解锁逐句模式/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /购买后解锁逐句模式/ })).toHaveAttribute('href', '/#pricing')
    expect(screen.getByRole('checkbox', { name: '逐句模式（未解锁）' })).toBeDisabled()
  })

  it('已购买时显示开关与时长选择，切换后写入 store', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ creditsBalance: 200, quotaBytes: 1073741824, purchased: true }))
    renderWithI18n(<SettingsPanel onClose={vi.fn()} />)
    const toggle = await screen.findByRole('checkbox', { name: '逐句模式' })
    await userEvent.click(toggle)
    expect(useReaderStore.getState().settings.sentencePause).toBe(true)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /暂停时长/ }), '5')
    expect(useReaderStore.getState().settings.sentencePauseSeconds).toBe(5)
  })

  it('余额接口异常时按未购买处理', async () => {
    fetchMock.mockRejectedValue(new Error('network'))
    renderWithI18n(<SettingsPanel onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '逐句模式（未解锁）' })).toBeDisabled()
    })
  })
})

describe('SettingsPanel 音色选择', () => {
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

  function mockSettingsFetch(
    balance: { creditsBalance: number; purchased: boolean },
    voices: { id: string; name: string }[],
  ) {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/tts/voices')) {
        return Promise.resolve(jsonResponse({ voices }))
      }
      return Promise.resolve(
        jsonResponse({ creditsBalance: balance.creditsBalance, quotaBytes: 1073741824, purchased: balance.purchased }),
      )
    })
  }

  it('余额充足时显示浏览器与云端音色并可切换', async () => {
    mockSettingsFetch({ creditsBalance: 200, purchased: true }, [
      { id: 'nova', name: 'Nova（温暖）' },
      { id: 'shimmer', name: 'Shimmer（明亮）' },
    ])
    renderWithI18n(<SettingsPanel onClose={vi.fn()} />)
    const browser = await screen.findByRole('radio', { name: '浏览器语音' })
    const nova = await screen.findByRole('radio', { name: 'Nova（温暖）' })
    expect(browser).not.toHaveAttribute('aria-disabled', 'true')
    expect(nova).not.toHaveAttribute('aria-disabled', 'true')

    await userEvent.click(nova)
    expect(useReaderStore.getState().settings.voice).toBe('nova')

    await userEvent.click(browser)
    expect(useReaderStore.getState().settings.voice).toBe('browser')
  })

  it('余额为 0 时云端音色禁用并显示购买入口，浏览器音色可用', async () => {
    mockSettingsFetch({ creditsBalance: 0, purchased: false }, [{ id: 'nova', name: 'Nova（温暖）' }])
    renderWithI18n(<SettingsPanel onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Nova（温暖）' })).toHaveAttribute('aria-disabled', 'true')
    })
    expect(screen.getByRole('radio', { name: '浏览器语音' })).not.toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link', { name: /购买积分后使用云音色/ })).toHaveAttribute('href', '/#pricing')
  })

  it('余额接口异常时云端音色锁定，浏览器音色可用', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/tts/voices')) {
        return Promise.resolve(jsonResponse({ voices: [{ id: 'nova', name: 'Nova（温暖）' }] }))
      }
      return Promise.reject(new Error('network'))
    })
    renderWithI18n(<SettingsPanel onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Nova（温暖）' })).toHaveAttribute('aria-disabled', 'true')
    })
    expect(screen.getByRole('radio', { name: '浏览器语音' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('余额加载中不显示云端音色锁定态', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/tts/voices')) {
        return Promise.resolve(jsonResponse({ voices: [{ id: 'nova', name: 'Nova（温暖）' }] }))
      }
      return new Promise<Response>(() => {})
    })
    renderWithI18n(<SettingsPanel onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Nova（温暖）' })).not.toHaveAttribute('aria-disabled', 'true')
    })
    expect(screen.queryByRole('link', { name: /购买积分后使用云音色/ })).not.toBeInTheDocument()
  })

  it('音色接口失败时仅保留浏览器音色', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/tts/voices')) {
        return Promise.resolve(jsonResponse({ error: '内部错误' }, 500))
      }
      return Promise.resolve(jsonResponse({ creditsBalance: 200, quotaBytes: 1073741824, purchased: true }))
    })
    renderWithI18n(<SettingsPanel onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: /Nova/ })).not.toBeInTheDocument()
    })
    expect(screen.getByRole('radio', { name: '浏览器语音' })).toBeInTheDocument()
  })
})
