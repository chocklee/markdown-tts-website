// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}))

import InputSection from '../InputSection'

describe('InputSection', () => {
  beforeEach(() => {
    pushMock.mockClear()
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })
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

  it('选择合法文件后读取内容并保存跳转', async () => {
    const user = userEvent.setup()
    render(<InputSection />)
    const file = new File(['# 文件标题\n\n内容。'], 'notes.md', { type: 'text/markdown' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    const textarea = screen.getByLabelText('Markdown 内容') as HTMLTextAreaElement
    await waitFor(() => expect(textarea.value).toContain('文件标题'))
    await user.click(screen.getByRole('button', { name: '开始收听' }))
    expect(localStorage.getItem('mtts:doc')).toContain('"title":"文件标题"')
    expect(pushMock).toHaveBeenCalledWith('/reader')
  })

  it('读取文件时开始收听按钮禁用且不跳转', async () => {
    vi.stubGlobal('FileReader', class {
      result = ''
      onload: (() => void) | null = null
      onerror: ((e: unknown) => void) | null = null
      readAsText() {}
    })
    const user = userEvent.setup()
    render(<InputSection />)
    const file = new File(['内容。'], 'a.md', { type: 'text/markdown' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)
    expect(screen.getByRole('button', { name: '开始收听' })).toBeDisabled()
    expect(pushMock).not.toHaveBeenCalled()
  })
})
