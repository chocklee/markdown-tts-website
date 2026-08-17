import { runSync } from '@/lib/sync/manager'

let timer: ReturnType<typeof setTimeout> | null = null
let running = false
let pending = false

export function scheduleSync(userId: string, delayMs = 2000): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flushSync(userId), delayMs)
}

export async function flushSync(userId: string): Promise<void> {
  if (running) {
    pending = true
    return
  }
  running = true
  try {
    await runSync(userId)
  } catch {
    // 网络/登录错误静默，等待下次触发
  } finally {
    running = false
    if (pending) {
      pending = false
      scheduleSync(userId, 0)
    }
  }
}

export function cancelScheduledSync(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
