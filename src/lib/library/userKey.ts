import type { Session } from 'next-auth'

// 本地 IndexedDB 按账号隔离文档：优先用用户 id，测试/老会话兜底用邮箱，未登录为游客命名空间 ''
export function libraryUserId(session: Session | null): string {
  const id = session?.user?.id
  if (id) return id
  const email = session?.user?.email
  if (email) return email
  return ''
}
