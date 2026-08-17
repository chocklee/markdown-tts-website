'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { ReaderDocument } from '@/types/reader'
import { useAccount } from '@/components/app/AppShell'
import { useI18n, LangSwitch } from '@/lib/i18n'
import { OutlinePanel } from './OutlinePanel'
import { ContentView } from './ContentView'
import { SettingsPanel } from './SettingsPanel'
import { QaPanel } from './QaPanel'
import { PlaybackBar } from './PlaybackBar'
import { SideDrawer } from './SideDrawer'
import { IconBack, IconOutline, IconSettings, IconChat } from '@/components/app/icons'

type DrawerKind = 'outline' | 'settings' | 'qa' | null



export function ReaderLayout({ document }: { document: ReaderDocument }) {
  const [drawer, setDrawer] = useState<DrawerKind>(null)
  const { creditsBalance } = useAccount()
  const { t } = useI18n()
  const DRAWER_TITLES: Record<Exclude<DrawerKind, null>, string> = {
    outline: t('reader.outline'),
    settings: t('reader.settings'),
    qa: t('reader.qa'),
  }

  return (
    <>
      <div className="view active">
        <div className="reader-toolbar">
          <Link href="/library" className="icon-btn" aria-label={t('reader.backToLibrary')}>
            <IconBack />
          </Link>
          <span className="doc-title">{document.title}</span>
          <span className="credit-pill">
            <span className="num">
              <b>{creditsBalance ?? '—'}</b>
            </span>{' '}
            {t('transactions.credits')}
          </span>
          <div className="rt-actions">
            <button type="button" className="rt-btn" onClick={() => setDrawer('outline')} aria-label={t('reader.outline')}>
              <IconOutline />
              {t('reader.outline')}
            </button>
            <button type="button" className="rt-btn" onClick={() => setDrawer('settings')} aria-label={t('reader.settings')}>
              <IconSettings />
              {t('reader.settings')}
            </button>
            <button type="button" className="rt-btn" onClick={() => setDrawer('qa')} aria-label={t('reader.qa')}>
              <IconChat />
              {t('reader.qa')}
            </button>
            <LangSwitch />
          </div>
        </div>

        <div className="reader-body">
          <article className="article">
            <ContentView document={document} />
          </article>
          <aside className="outline-rail">
            <p className="rail-cap">{t('reader.outline')}</p>
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
