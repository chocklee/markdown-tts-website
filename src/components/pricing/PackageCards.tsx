'use client'

export interface PackageInfo {
  id: string
  name: string
  usd: number
  credits: number
  approxReadChars: number
}

function formatReadChars(n: number): string {
  if (n >= 10000) return `约 ${(n / 10000).toFixed(1).replace(/\.0$/, '')} 万字`
  return `约 ${Math.round(n / 1000)} 千字`
}

export function PackageCards({
  packages,
  onBuy,
  busyId,
}: {
  packages: PackageInfo[]
  onBuy: (id: string) => void
  busyId: string | null
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {packages.map((pkg) => {
        const busy = busyId === pkg.id
        return (
          <div
            key={pkg.id}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h3 className="text-lg font-semibold text-slate-800">{pkg.name}</h3>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              ${pkg.usd}
              <span className="ml-1 text-sm font-normal text-slate-500">USD</span>
            </p>
            <ul className="mt-4 space-y-1 text-sm text-slate-600">
              <li>{pkg.credits} 积分</li>
              <li>{formatReadChars(pkg.approxReadChars)}</li>
              <li>存储配额升级 1G（永久）</li>
            </ul>
            <button
              type="button"
              onClick={() => onBuy(pkg.id)}
              disabled={busy}
              className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? '处理中…' : '购买'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
