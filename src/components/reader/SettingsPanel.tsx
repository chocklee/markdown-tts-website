'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useReaderStore } from '@/lib/state/readerStore'
import { useI18n } from '@/lib/i18n'
import { IconCheck } from '@/components/app/icons'

function formatRate(rate: number): string {
  return rate.toFixed(2).replace(/\.?0+$/, '')
}

interface Voice {
  id: string
  name: string
  description?: string
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const settings = useReaderStore((s) => s.settings)
  const setRate = useReaderStore((s) => s.setRate)
  const setVolume = useReaderStore((s) => s.setVolume)
  const setVoice = useReaderStore((s) => s.setVoice)
  const toggleSkipCode = useReaderStore((s) => s.toggleSkipCode)
  const toggleSkipTable = useReaderStore((s) => s.toggleSkipTable)

  const [voices, setVoices] = useState<Voice[]>([])
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/credits/balance')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        setCreditsBalance(typeof data?.creditsBalance === 'number' ? data.creditsBalance : null)
      })
      .catch(() => {
        if (cancelled) return
        setCreditsBalance(0)
      })
    void fetch('/api/tts/voices')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setVoices(Array.isArray(data?.voices) ? data.voices : [])
      })
      .catch(() => {
        if (!cancelled) setVoices([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const cloudLocked = creditsBalance !== null && creditsBalance <= 0
  const voiceRows: { id: string; name: string; desc: string }[] = [
    ...voices.map((v) => ({
      id: v.id,
      name: v.name,
      desc: v.description ?? t('reader.cloudVoiceDesc'),
    })),
    { id: 'browser', name: t('reader.browserVoice'), desc: t('reader.browserVoiceDesc') },
  ]

  const rateFill = `${((settings.rate - 0.5) / 1.5) * 100}%`
  const volumeFill = `${settings.volume * 100}%`

  return (
    <div>
      <p className="setting-label" style={{ marginTop: 0 }}>
        {t('reader.voice')}
      </p>
      <div role="radiogroup" aria-label={t('reader.voice')}>
        {voiceRows.map((v) => {
          const locked = v.id !== 'browser' && cloudLocked
          const sel = settings.voice === v.id
          return (
            <div
              key={v.id}
              role="radio"
              aria-label={v.name}
              aria-checked={sel}
              aria-disabled={locked ? 'true' : undefined}
              tabIndex={locked ? -1 : 0}
              className={`option-row ${sel ? 'sel' : ''}`}
              style={locked ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
              onClick={() => {
                if (!locked) setVoice(v.id)
              }}
              onKeyDown={(e) => {
                if (!locked && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  setVoice(v.id)
                }
              }}
            >
              <div>
                <div className="name">{v.name}</div>
                <div className="desc">{locked ? `${t('reader.lockedHint')} · ` : ''}{v.desc}</div>
              </div>
              <span className="check">
                <IconCheck />
              </span>
            </div>
          )
        })}
      </div>
      {cloudLocked && (
        <p className="settings-hint">
          {t('reader.noCreditsHint')}
          <Link href="/#pricing" className="link">
            {t('reader.buyCredits')}
          </Link>
        </p>
      )}

      <p className="setting-label">{t('reader.rate')}</p>
      <div className="speed-row">
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.25}
          value={settings.rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label={t('reader.rate')}
          style={{ '--fill': rateFill } as CSSProperties}
        />
        <span className="val">{formatRate(settings.rate)}x</span>
      </div>

      <p className="setting-label">{t('reader.volume')}</p>
      <div className="speed-row">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label={t('reader.volume')}
          style={{ '--fill': volumeFill } as CSSProperties}
        />
        <span className="val">{Math.round(settings.volume * 100)}%</span>
      </div>

      <p className="setting-label">{t('reader.reading')}</p>
      <div className="option-row">
        <div>
          <div className="name">{t('reader.skipCode')}</div>
          <div className="desc">{t('reader.skipCodeDesc')}</div>
        </div>
        <input
          type="checkbox"
          className="switch"
          checked={settings.skipCode}
          onChange={toggleSkipCode}
          aria-label={t('reader.skipCode')}
        />
      </div>
      <div className="option-row">
        <div>
          <div className="name">{t('reader.skipTable')}</div>
          <div className="desc">{t('reader.skipTableDesc')}</div>
        </div>
        <input
          type="checkbox"
          className="switch"
          checked={settings.skipTable}
          onChange={toggleSkipTable}
          aria-label={t('reader.skipTable')}
        />
      </div>

      <p className="settings-hint">{t('reader.settingsHint')}</p>
      <button type="button" onClick={onClose} className="btn-secondary" style={{ width: '100%', marginTop: 14 }}>
        {t('reader.done')}
      </button>
    </div>
  )
}
