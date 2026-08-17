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
import { SideDrawer } from './SideDrawer'
import { IconBack, IconOutline, IconSettings, IconChat } from '@/components/app/icons'

type DrawerKind = 'outline' | 'settings' | 'qa' | null

const DRAWER_TITLES: Record<Exclude<DrawerKind, null>, string> = {
  outline: '大纲',
  settings: '朗读设置',
  qa: '文档问答',
}

export function ReaderLayout({ document }: { document: ReaderDocument }) {
  const [drawer, setDrawer] = useState<DrawerKind>(null)
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
            <button type="button" className="rt-btn" onClick={() => setDrawer('outline')} aria-label="大纲">
              <IconOutline />
              大纲
            </button>
            <button type="button" className="rt-btn" onClick={() => setDrawer('settings')} aria-label="朗读设置">
              <IconSettings />
              朗读设置
            </button>
            <button type="button" className="rt-btn" onClick={() => setDrawer('qa')} aria-label="文档问答">
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

      <SideDrawer open={drawer !== null} title={drawer ? DRAWER_TITLES[drawer] : ''} onClose={() => setDrawer(null)}>
        {drawer === 'outline' && <OutlinePanel document={document} />}
        {drawer === 'settings' && <SettingsPanel onClose={() => setDrawer(null)} />}
        {drawer === 'qa' && <QaPanel />}
      </SideDrawer>
    </>
  )
}
