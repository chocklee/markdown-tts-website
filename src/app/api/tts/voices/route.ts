import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/tts/server/provider'

export const runtime = 'nodejs'

export async function GET() {
  try {
    return NextResponse.json({ voices: getProvider().voices })
  } catch (err) {
    console.error('get tts provider failed', err)
    return NextResponse.json({ error: '语音服务未配置' }, { status: 500 })
  }
}
