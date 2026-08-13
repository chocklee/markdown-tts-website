import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { upsertServerDocument, hardDeleteServerDocument } from '@/lib/db/documents'
import { validateUpsertBody } from '@/lib/library/validateUpsert'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  const { docId } = await params
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: 'docId 无效' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  const validated = validateUpsertBody(body, docId)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status })
  }

  try {
    const result = await upsertServerDocument(session.user.id, validated.value)

    if (result.status === 'quota-exceeded') {
      return NextResponse.json({ error: '存储配额不足' }, { status: 413 })
    }
    if (result.status === 'conflict') {
      return NextResponse.json({ status: 'conflict', server: result.server }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('upsert document failed', err)
    return NextResponse.json({ error: '操作失败，请稍后再试' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 })
  }
  const { docId } = await params
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: 'docId 无效' }, { status: 400 })
  }
  try {
    await hardDeleteServerDocument(session.user.id, docId)
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('delete document failed', err)
    return NextResponse.json({ error: '操作失败，请稍后再试' }, { status: 500 })
  }
}
