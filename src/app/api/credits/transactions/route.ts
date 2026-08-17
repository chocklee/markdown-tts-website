import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { decodeCursor, listTransactions } from '@/lib/db/credits'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  const url = new URL(req.url)
  const rawLimit = Number(url.searchParams.get('limit') ?? 20)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20
  const cursor = decodeCursor(url.searchParams.get('cursor') ?? '')
  try {
    const result = await listTransactions(session.user.id, cursor, limit)
    return NextResponse.json(result)
  } catch (err) {
    console.error('list credit transactions failed', err)
    return NextResponse.json({ error: await serverT('server.operationFailed') }, { status: 500 })
  }
}
