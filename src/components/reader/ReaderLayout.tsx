'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ReaderDocument } from '@/types/reader'
import { useAccount } from '@/components/app/AppShell'
import { useI18n } from '@/lib/i18n'
import { useReaderStore } from '@/lib/state/readerStore'
import { useUiStore } from '@/lib/state/uiStore'
import { OutlinePanel } from './OutlinePanel'
import { ContentView } from './ContentView'
import { SettingsPanel } from './SettingsPanel'
import { QaPanel } from './QaPanel'
import { PlaybackBar } from './PlaybackBar'
import { SideDrawer } from './SideDrawer'
import { IconBack, IconOutline, IconSettings, IconChat, IconCloud } from '@/components/app/icons'

type DrawerKind = 'outline' | 'settings' | 'qa' | null



export function ReaderLayout({ document }: { document: ReaderDocument }) {
  const [drawer, setDrawer] = useState<DrawerKind>(null)
  const { creditsBalance } = useAccount()
  const { t } = useI18n()
  const settings = useReaderStore((s) => s.settings)
  const showToast = useUiStore((s) => s.showToast)
  const [converted, setConverted] = useState<{
    status: string
    progress: number
    voice: string
    rate: number
    skipCode: boolean
    skipTable: boolean
  } | null>(null)
  const [convertProgress, setConvertProgress] = useState<number | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => () => { aliveRef.current = false }, [])

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch(`/api/tts/convert?docId=${encodeURIComponent(document.id)}`)
        const data = (await res.json()) as {
          status?: string
          progress?: number
          voice?: string
          rate?: number
          skipCode?: boolean
          skipTable?: boolean
        }
        if (!cancelled && data) {
          setConverted({
            status: data.status ?? 'pending',
            progress: data.progress ?? 0,
            voice: data.voice ?? '',
            rate: data.rate ?? 1,
            skipCode: data.skipCode ?? true,
            skipTable: data.skipTable ?? true,
          })
        }
      } catch {
        // 未登录或未转换时忽略
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [document.id])

  const startConvert = useCallback(async () => {
    aliveRef.current = true
    setConvertProgress(0)
    try {
      const res = await fetch('/api/tts/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: document.id,
          voice: settings.voice,
          rate: settings.rate,
          skipCode: settings.skipCode,
          skipTable: settings.skipTable,
        }),
      })
      if (!aliveRef.current) return
      const data = (await res.json().catch(() => null)) as { status?: string; error?: string } | null
      if (!res.ok) {
        showToast(data?.error ?? t('convert.failed'))
        setConvertProgress(null)
        return
      }
      if (data?.status === 'done') {
        setConverted({
          status: 'done',
          progress: 1,
          voice: settings.voice,
          rate: settings.rate,
          skipCode: settings.skipCode,
          skipTable: settings.skipTable,
        })
        showToast(t('convert.done'))
        setConvertProgress(null)
        return
      }
      for (let i = 0; i < 600; i += 1) {
        await new Promise((r) => setTimeout(r, 2000))
        if (!aliveRef.current) return
        const sres = await fetch(`/api/tts/convert?docId=${encodeURIComponent(document.id)}&advance=1`)
        if (!aliveRef.current) return
        const sdata = (await sres.json().catch(() => null)) as { status?: string; progress?: number; error?: string } | null
        setConvertProgress(Math.round((sdata?.progress ?? 0) * 100))
        if (!sres.ok) {
          showToast(sdata?.error ?? t('convert.failed'))
          break
        }
        if (sdata?.status === 'done') {
          setConverted({
            status: 'done',
            progress: 1,
            voice: settings.voice,
            rate: settings.rate,
            skipCode: settings.skipCode,
            skipTable: settings.skipTable,
          })
          showToast(t('convert.done'))
          break
        }
        if (sdata?.status === 'failed') {
          showToast(t('convert.failed'))
          break
        }
      }
    } catch {
      showToast(t('convert.failed'))
    }
    setConvertProgress(null)
  }, [document.id, settings, showToast, t])

  const seamless =
    converted?.status === 'done' &&
    settings.voice === converted.voice &&
    settings.rate === converted.rate &&
    settings.skipCode === converted.skipCode &&
    settings.skipTable === converted.skipTable &&
    !settings.sentencePause

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
            <button
              type="button"
              className="rt-btn"
              onClick={() => void startConvert()}
              disabled={convertProgress != null}
              aria-label={t('convert.start')}
            >
              <IconCloud />
              {convertProgress != null ? t('convert.progress', { p: convertProgress }) : t('convert.start')}
            </button>
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

      <PlaybackBar
        seamlessUrl={seamless ? `/api/tts/convert/${encodeURIComponent(document.id)}/audio` : undefined}
        seamlessDownloadUrl={seamless ? `/api/tts/convert/${encodeURIComponent(document.id)}/audio?download=1` : undefined}
      />

      <SideDrawer open={drawer !== null} title={drawer ? DRAWER_TITLES[drawer] : ''} onClose={() => setDrawer(null)}>
        {drawer === 'outline' && <OutlinePanel document={document} />}
        {drawer === 'settings' && <SettingsPanel onClose={() => setDrawer(null)} />}
        {drawer === 'qa' && <QaPanel />}
      </SideDrawer>
    </>
  )
}
