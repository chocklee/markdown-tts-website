import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { getUserQuotaBytes, listServerDocuments } from '@/lib/db/documents'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  try {
    const [docs, quotaBytes] = await Promise.all([
      listServerDocuments(session.user.id),
      getUserQuotaBytes(session.user.id),
    ])
    return NextResponse.json({ quotaBytes, docs })
  } catch (err) {
    console.error('list documents failed', err)
    return NextResponse.json({ error: await serverT('server.operationFailed') }, { status: 500 })
  }
}
