// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPanel } from '../SettingsPanel'
import { useReaderStore } from '@/lib/state/readerStore'

describe('SettingsPanel', () => {
  it('切换跳过代码块开关调用 toggleSkipCode', async () => {
    const toggleSkipCode = vi.spyOn(useReaderStore.getState(), 'toggleSkipCode')
    useReaderStore.setState({ settings: { rate: 1, volume: 1, skipCode: true, skipTable: true } })
    const user = userEvent.setup()
    render(<SettingsPanel onClose={() => {}} />)
    await user.click(screen.getByLabelText('跳过代码块'))
    expect(toggleSkipCode).toHaveBeenCalled()
  })

  it('拖动语速滑杆调用 setRate', async () => {
    const setRate = vi.spyOn(useReaderStore.getState(), 'setRate')
    useReaderStore.setState({ settings: { rate: 1, volume: 1, skipCode: true, skipTable: true } })
    render(<SettingsPanel onClose={() => {}} />)
    const slider = screen.getByLabelText('语速调节')
    fireEvent.change(slider, { target: { value: '1.5' } })
    expect(setRate).toHaveBeenCalledWith(1.5)
  })
})
