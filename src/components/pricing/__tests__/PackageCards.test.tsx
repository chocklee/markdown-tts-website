// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PackageCards, type PackageInfo } from '../PackageCards'

const PACKAGES: PackageInfo[] = [
  { id: 'starter', name: '体验包', usd: 1.99, credits: 200, approxReadChars: 6666 },
  { id: 'light', name: '轻量包', usd: 3.99, credits: 800, approxReadChars: 26666 },
  { id: 'unlimited', name: '畅听包', usd: 9.99, credits: 2200, approxReadChars: 73333 },
]

describe('PackageCards', () => {
  it('展示三档套餐的价格与积分', () => {
    render(<PackageCards packages={PACKAGES} onBuy={vi.fn()} busyId={null} />)
    expect(screen.getByText('体验包')).toBeInTheDocument()
    expect(screen.getByText('$1.99')).toBeInTheDocument()
    expect(screen.getByText('200 积分')).toBeInTheDocument()
    expect(screen.getByText('轻量包')).toBeInTheDocument()
    expect(screen.getByText('$9.99')).toBeInTheDocument()
  })

  it('点击购买回调套餐 id', async () => {
    const onBuy = vi.fn()
    render(<PackageCards packages={PACKAGES} onBuy={onBuy} busyId={null} />)
    await userEvent.click(screen.getAllByRole('button', { name: /购买/ })[0])
    expect(onBuy).toHaveBeenCalledWith('starter')
  })

  it('busyId 时该卡片按钮禁用并显示处理中', () => {
    render(<PackageCards packages={PACKAGES} onBuy={vi.fn()} busyId="light" />)
    const buttons = screen.getAllByRole('button', { name: /处理中|购买/ })
    expect(buttons[1]).toBeDisabled()
    expect(buttons[1]).toHaveTextContent('处理中')
  })
})
