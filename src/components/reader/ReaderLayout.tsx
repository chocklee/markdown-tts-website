'use client'
import { useState } from 'react'
import type { ReaderDocument } from '@/types/reader'
import { OutlinePanel } from './OutlinePanel'
import { ContentView } from './ContentView'
import { SettingsPanel } from './SettingsPanel'
import { PlaybackBar } from './PlaybackBar'

export function ReaderLayout({ document }: { document: ReaderDocument }) {
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-4">
          <OutlinePanel document={document} />
        </aside>
        <main className="relative flex-1 overflow-y-auto">
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-slate-50"
              onClick={() => setShowSettings((v) => !v)}
            >
              ⚙️ 朗读设置
            </button>
          </div>
          <div className="mx-auto max-w-3xl px-8 py-10">
            <ContentView document={document} />
          </div>
          {showSettings && (
            <div className="absolute inset-y-0 right-0 w-80 overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-lg">
              <SettingsPanel onClose={() => setShowSettings(false)} />
            </div>
          )}
        </main>
      </div>
      <PlaybackBar />
    </div>
  )
}
