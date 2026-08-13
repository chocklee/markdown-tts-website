import { NextResponse } from 'next/server'
import { CONFIG } from '@/lib/config'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    voices: CONFIG.tts.voices.map((v) => ({ id: v.id, name: v.name })),
  })
}
