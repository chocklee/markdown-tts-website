import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/server'
import { getConverted } from '@/lib/db/convert'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: await serverT('server.unauthorized') }, { status: 401 })
  }
  const { docId } = await params
  if (!UUID_RE.test(docId)) {
    return NextResponse.json({ error: await serverT('server.invalidBody') }, { status: 400 })
  }
  const row = await getConverted(session.user.id, docId)
  if (!row || row.status !== 'done' || !row.audio) {
    return NextResponse.json({ error: await serverT('server.audioNotFound') }, { status: 404 })
  }
  const audio = row.audio
  const url = new URL(req.url)
  const download = url.searchParams.get('download') === '1'
  const range = req.headers.get('range')
  const rangeMatch = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null
  if (rangeMatch) {
    const start = Number(rangeMatch[1])
    const end = rangeMatch[2] ? Math.min(Number(rangeMatch[2]), audio.length - 1) : audio.length - 1
    if (start <= end && start < audio.length) {
      const slice = audio.subarray(start, end + 1)
      return new NextResponse(slice, {
        status: 206,
        headers: {
          'Content-Type': row.contentType,
          'Content-Length': String(slice.length),
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${audio.length}`,
        },
      })
    }
  }
  return new NextResponse(audio, {
    status: 200,
    headers: {
      'Content-Type': row.contentType,
      'Content-Length': String(audio.length),
      'Accept-Ranges': 'bytes',
      ...(download ? { 'Content-Disposition': `attachment; filename="${docId}.mp3"` } : {}),
    },
  })
}
