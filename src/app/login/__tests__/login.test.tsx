// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { screen, waitFor } from '@testing-library/react'
import { renderWithI18n } from '@/test-utils/i18n'
import userEvent from '@testing-library/user-event'

const signInMock = vi.fn()
const getProvidersMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string } & AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  getProviders: () => getProvidersMock(),
}))

import LoginPage from '../page'

describe('LoginPage', () => {
  beforeEach(() => {
    signInMock.mockReset()
    getProvidersMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('通过 Auth.js 的 getProviders 判断是否展示 Google 按钮', async () => {
    getProvidersMock.mockResolvedValue({ credentials: { id: 'credentials' } })
    renderWithI18n(<LoginPage />)
    await waitFor(() => expect(getProvidersMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('使用 Google 登录')).toBeNull()
  })

  it('Google 可用时展示 Google 登录按钮', async () => {
    getProvidersMock.mockResolvedValue({ google: { id: 'google' }, credentials: { id: 'credentials' } })
    renderWithI18n(<LoginPage />)
    await waitFor(() => expect(screen.getByRole('button', { name: '使用 Google 登录' })).toBeTruthy())
  })

  it('密码登录调用 signIn(credentials) 且失败时提示错误', async () => {
    getProvidersMock.mockResolvedValue({ credentials: { id: 'credentials' } })
    signInMock.mockResolvedValue({ error: 'CredentialsSignin' })
    renderWithI18n(<LoginPage />)
    await userEvent.type(screen.getByLabelText('邮箱'), 'a@b.com')
    await userEvent.type(screen.getByLabelText('密码'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith('credentials', { redirect: false, email: 'a@b.com', password: 'wrongpass' }),
    )
    expect(screen.getByText(/邮箱或密码错误/)).toBeTruthy()
  })
})
