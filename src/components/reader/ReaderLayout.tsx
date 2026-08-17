'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { ReaderDocument } from '@/types/reader'
import { useAccount } from '@/components/app/AppShell'
import { OutlinePanel } from './OutlinePanel'
import { ContentView } from './ContentView'
import { SettingsPanel } from './SettingsPanel'
import { QaPanel } from './QaPanel'
import { PlaybackBar } from './PlaybackBar'
import { BottomSheet } from './BottomSheet'
import { IconBack, IconOutline, IconSettings, IconChat } from '@/components/app/icons'

type SheetKind = 'outline' | 'settings' | 'qa' | null

const SHEET_TITLES: Record<Exclude<SheetKind, null>, string> = {
  outline: '大纲',
  settings: '朗读设置',
  qa: '文档问答',
}

export function ReaderLayout({ document }: { document: ReaderDocument }) {
  const [sheet, setSheet] = useState<SheetKind>(null)
  const { creditsBalance } = useAccount()

  return (
    <>
      <div className="view active">
        <div className="reader-toolbar">
          <Link href="/library" className="icon-btn" aria-label="返回文库">
            <IconBack />
          </Link>
          <span className="doc-title">{document.title}</span>
          <span className="credit-pill">
            <span className="num">
              <b>{creditsBalance ?? '—'}</b>
            </span>{' '}
            积分
          </span>
          <div className="rt-actions">
            <button type="button" className="rt-btn" onClick={() => setSheet('outline')} aria-label="大纲">
              <IconOutline />
              大纲
            </button>
            <button type="button" className="rt-btn" onClick={() => setSheet('settings')} aria-label="朗读设置">
              <IconSettings />
              朗读设置
            </button>
            <button type="button" className="rt-btn" onClick={() => setSheet('qa')} aria-label="文档问答">
              <IconChat />
              文档问答
            </button>
          </div>
        </div>

        <div className="reader-body">
          <article className="article">
            <ContentView document={document} />
          </article>
          <aside className="outline-rail">
            <p className="rail-cap">大纲</p>
            <OutlinePanel document={document} />
          </aside>
        </div>
      </div>

      <PlaybackBar />

      <BottomSheet open={sheet !== null} title={sheet ? SHEET_TITLES[sheet] : ''} onClose={() => setSheet(null)}>
        {sheet === 'outline' && <OutlinePanel document={document} />}
        {sheet === 'settings' && <SettingsPanel onClose={() => setSheet(null)} />}
        {sheet === 'qa' && <QaPanel />}
      </BottomSheet>
    </>
  )
}
