import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { upsertServerDocument, hardDeleteServerDocument } from '@/lib/db/documents'
import { validateUpsertBody } from '@/lib/library/validateUpsert'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  const { docId } = await params
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const validated = validateUpsertBody(body, docId)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status })
  }

  try {
    const result = await upsertServerDocument(session.user.id, validated.value)

    if (result.status === 'quota-exceeded') {
      return NextResponse.json({ error: await serverT('library.syncQuota') }, { status: 413 })
    }
    if (result.status === 'conflict') {
      return NextResponse.json({ status: 'conflict', server: result.server }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('upsert document failed', err)
    return NextResponse.json({ error: await serverT('server.operationFailed') }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  const { docId } = await params
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  try {
    await hardDeleteServerDocument(session.user.id, docId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('delete document failed', err)
    return NextResponse.json({ error: await serverT('server.operationFailed') }, { status: 500 })
  }
}
