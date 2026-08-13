import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { upsertServerDocument, hardDeleteServerDocument } from '@/lib/db/documents'
import type { SyncedDocument } from '@/types/document'

export const runtime = 'nodejs'

const MAX_CONTENT = 5 * 1024 * 1024
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

  let body: Partial<SyncedDocument>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 })
  }
  if (body.docId !== docId) {
    return NextResponse.json({ error: 'docId 不匹配' }, { status: 400 })
  }
  if (
    typeof body.title !== 'string' ||
    typeof body.content !== 'string' ||
    typeof body.contentHash !== 'string' ||
    typeof body.fileSizeBytes !== 'number' ||
    typeof body.updatedAt !== 'number'
  ) {
    return NextResponse.json({ error: '字段缺失' }, { status: 400 })
  }
  if (body.content.length > MAX_CONTENT) {
    return NextResponse.json({ error: '文件超过 5MB 上限' }, { status: 400 })
  }

  try {
    const result = await upsertServerDocument(session.user.id, {
      docId,
      title: body.title.slice(0, 200),
      content: body.content,
      contentHash: body.contentHash,
      fileSizeBytes: Math.floor(body.fileSizeBytes),
      updatedAt: Math.floor(body.updatedAt),
      deletedAt: body.deletedAt === null || typeof body.deletedAt === 'number' ? body.deletedAt : null,
      deleteExpiresAt:
        body.deleteExpiresAt === null || typeof body.deleteExpiresAt === 'number' ? body.deleteExpiresAt : null,
    })

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
