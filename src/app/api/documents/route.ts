import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { getUserQuotaBytes, listServerDocuments } from '@/lib/db/documents'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  try {
    const [docs, quotaBytes] = await Promise.all([
      listServerDocuments(session.user.id),
      getUserQuotaBytes(session.user.id),
    ])
    return NextResponse.json({ quotaBytes, docs })
  } catch (err) {
    console.error('list documents failed', err)
    return NextResponse.json({ error: '操作失败，请稍后再试' }, { status: 500 })
  }
}
