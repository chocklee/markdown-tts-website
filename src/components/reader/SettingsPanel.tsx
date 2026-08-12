'use client'
import { useReaderStore } from '@/lib/state/readerStore'

function formatRate(rate: number): string {
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useReaderStore((s) => s.settings)
  const setRate = useReaderStore((s) => s.setRate)
  const setVolume = useReaderStore((s) => s.setVolume)
  const toggleSkipCode = useReaderStore((s) => s.toggleSkipCode)
  const toggleSkipTable = useReaderStore((s) => s.toggleSkipTable)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">朗读设置</h2>
        <button type="button" onClick={onClose} aria-label="关闭" className="text-slate-400 hover:text-slate-600">
          ✕
        </button>
      </div>

      <label className="block text-sm text-slate-600">
        语速：{formatRate(settings.rate)}x
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.25}
          value={settings.rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label="语速调节"
          className="mt-1 w-full"
        />
      </label>

      <label className="mt-4 block text-sm text-slate-600">
        音量：{Math.round(settings.volume * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="音量调节"
          className="mt-1 w-full"
        />
      </label>

      <div className="mt-4 space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.skipCode} onChange={toggleSkipCode} />
          跳过代码块
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={settings.skipTable} onChange={toggleSkipTable} />
          跳过表格
        </label>
      </div>

      <p className="mt-6 text-xs text-slate-400">语速与音量在下一句生效；切换跳过选项会停止播放</p>
    </div>
  )
}
