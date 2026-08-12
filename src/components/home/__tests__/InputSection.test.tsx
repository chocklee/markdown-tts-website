// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}))

import InputSection from '../InputSection'

describe('InputSection', () => {
  it('粘贴内容后点击开始收听，保存文档并跳转阅读器', async () => {
    const user = userEvent.setup()
    render(<InputSection />)
    await user.type(screen.getByLabelText('Markdown 内容'), '# 我的笔记\n\n你好。')
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    expect(localStorage.getItem('mtts:doc')).toContain('"title":"我的笔记"')
    expect(pushMock).toHaveBeenCalledWith('/reader')
  })

  it('内容为空时提示错误', async () => {
    const user = userEvent.setup()
    render(<InputSection />)
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    expect(screen.getByText('请粘贴内容或选择文件')).toBeInTheDocument()
  })

  it('超过 5MB 的文件提示错误', async () => {
    const user = userEvent.setup()
    render(<InputSection />)
    const bigFile = new File(['x'], 'big.md', { type: 'text/markdown' })
    Object.defineProperty(bigFile, 'size', { value: 6 * 1024 * 1024 })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, bigFile)
    expect(screen.getByText('文件超过 5MB 上限')).toBeInTheDocument()
  })
})
