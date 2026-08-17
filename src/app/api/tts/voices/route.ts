import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/tts/server/provider'
import { serverT } from '@/lib/i18n/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return NextResponse.json({ voices: getProvider().voices })
  } catch (err) {
    console.error('get tts provider failed', err)
    return NextResponse.json({ error: await serverT('server.ttsNotConfigured') }, { status: 500 })
  }
}
