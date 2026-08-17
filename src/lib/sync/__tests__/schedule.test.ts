import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { scheduleSync, flushSync, cancelScheduledSync } from '../schedule'
import { runSync } from '@/lib/sync/manager'

vi.mock('@/lib/sync/manager', () => ({ runSync: vi.fn() }))

describe('scheduleSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(runSync).mockReset()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('debounce: 连续调用多次只执行一次', async () => {
    scheduleSync('user-1', 100)
    scheduleSync('user-1', 100)
    await vi.advanceTimersByTimeAsync(100)
    expect(runSync).toHaveBeenCalledTimes(1)
  })

  it('reentrancy: 运行中再次触发排队，完成后再次执行', async () => {
    let resolveFirst!: () => void
    const gate = new Promise<void>((r) => {
      resolveFirst = r
    })
    vi.mocked(runSync).mockReturnValueOnce(gate as never)

    const first = flushSync('user-1')
    const second = flushSync('user-1')
    expect(runSync).toHaveBeenCalledTimes(1)

    resolveFirst()
    await first
    await second

    await vi.runOnlyPendingTimersAsync()
    expect(runSync).toHaveBeenCalledTimes(2)
  })

  it('cancelScheduledSync: 取消后不再执行', async () => {
    scheduleSync('user-1', 100)
    cancelScheduledSync()
    await vi.advanceTimersByTimeAsync(200)
    expect(runSync).not.toHaveBeenCalled()
  })
})
