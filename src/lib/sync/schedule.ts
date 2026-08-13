import { runSync } from '@/lib/sync/manager'

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let pending = false

export function scheduleSync(delayMs = 2000): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushSync(), delayMs)
}

export async function flushSync(): Promise<void> {
  if (running) {
    pending = true
    return
  }
  running = true
  try {
    await runSync()
  } catch {
    // 网络/登录错误静默，等待下次触发
  } finally {
    running = false
    if (pending) {
      pending = false
      scheduleSync(0)
    }
  }
}

export function cancelScheduledSync(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
