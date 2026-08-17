import { NextResponse } from 'next/server'
import { CREDIT_PACKAGES, CONFIG } from '@/lib/config'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    billing: 'monthly',
    packages: CREDIT_PACKAGES.map((p) => ({
      id: p.id,
      name: p.name,
      usd: p.usd,
      credits: p.credits,
      billing: 'monthly',
      approxReadChars: Math.floor((p.credits / CONFIG.credits.ttsCreditsPer100Chars) * 100),
    })),
  })
}
