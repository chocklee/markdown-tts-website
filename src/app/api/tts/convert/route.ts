import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { hasActiveSubscription } from '@/lib/db/credits'
import { startConversion, advanceConversion, getConvertStatus } from '@/lib/tts/server/convertService'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function mapError(err: unknown): Promise<NextResponse> {
  const message = err instanceof Error ? err.message : String(err)
  if (message === 'DOC_NOT_FOUND') {
    return NextResponse.json({ error: await serverT('server.docNotFound') }, { status: 404 })
  }
  if (message === 'INSUFFICIENT_CREDITS') {
    return NextResponse.json({ error: await serverT('server.creditsInsufficient') }, { status: 402 })
  }
  if (message === 'CONVERT_NOT_FOUND') {
    return NextResponse.json({ error: await serverT('server.audioNotFound') }, { status: 404 })
  }
  console.error('convert api failed', err)
  return NextResponse.json({ error: await serverT('server.operationFailed') }, { status: 500 })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  if (!(await hasActiveSubscription(session.user.id))) {
    return NextResponse.json({ error: await serverT('server.proRequired') }, { status: 403 })
  }
  let body: { docId?: unknown; voice?: unknown; rate?: unknown; skipCode?: unknown; skipTable?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const docId = typeof body?.docId === 'string' ? body.docId : ''
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const rate = typeof body?.rate === 'number' ? body.rate : 1
  if (rate < 0.5 || rate > 2) {
    return NextResponse.json({ error: await serverT('server.rateInvalid') }, { status: 400 })
  }
  const skipCode = body?.skipCode === true
  const skipTable = body?.skipTable === true
  const voice = typeof body?.voice === 'string' ? body.voice : ''
  try {
    const result = await startConversion(session.user.id, docId, { voice, rate, skipCode, skipTable })
    return NextResponse.json({
      docId,
      status: result.alreadyDone ? 'done' : 'pending',
      creditsCharged: result.creditsCharged,
    })
  } catch (err) {
    return mapError(err)
  }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  const url = new URL(req.url)
  const docId = url.searchParams.get('docId') ?? ''
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const advance = url.searchParams.get('advance') === '1'
  try {
    const status = advance
      ? await advanceConversion(session.user.id, docId)
      : await getConvertStatus(session.user.id, docId)
    if (!status) {
      return NextResponse.json({ error: await serverT('server.audioNotFound') }, { status: 404 })
    }
    return NextResponse.json({ docId, ...status })
  } catch (err) {
    return mapError(err)
  }
}
