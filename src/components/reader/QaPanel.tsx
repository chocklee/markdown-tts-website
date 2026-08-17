'use client'
import { useState } from 'react'
import { IconChat, IconSend } from '@/components/app/icons'
import { useI18n } from '@/lib/i18n'

export function QaPanel() {
  const { t } = useI18n()
  const SUGGESTIONS = [t('reader.qaS1'), t('reader.qaS2'), t('reader.qaS3')]
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState<string | null>(null)

  const ask = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    setAsked(text)
  }

  return (
    <div>
      <p className="meta qa-desc">{t('reader.qaDesc')}</p>
      <div className="qa-input-row">
        <div className="qa-field">
          <IconChat />
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask(question)
            }}
            placeholder={t('reader.qaPlaceholder')}
            aria-label={t('reader.qaAskLabel')}
            autoComplete="off"
          />
        </div>
        <button type="button" className="qa-send" aria-label={t('reader.qaSend')} onClick={() => ask(question)}>
          <IconSend />
        </button>
      </div>
      <p className="setting-label">{t('reader.qaTry')}</p>
      <div className="qa-chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="qa-chip" onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>
      {asked && (
        <div className="qa-answer">
          <p className="q">{asked}</p>
          <p className="a">{t('reader.qaComing')}</p>
        </div>
      )}
    </div>
  )
}
