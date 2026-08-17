'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useReaderStore } from '@/lib/state/readerStore'
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
  const settings = useReaderStore((s) => s.settings)
  const setRate = useReaderStore((s) => s.setRate)
  const setVolume = useReaderStore((s) => s.setVolume)
  const setVoice = useReaderStore((s) => s.setVoice)
  const setSentencePause = useReaderStore((s) => s.setSentencePause)
  const setSentencePauseSeconds = useReaderStore((s) => s.setSentencePauseSeconds)
  const toggleSkipCode = useReaderStore((s) => s.toggleSkipCode)
  const toggleSkipTable = useReaderStore((s) => s.toggleSkipTable)

  const [voices, setVoices] = useState<Voice[]>([])
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null)
  const [purchased, setPurchased] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/credits/balance')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        setPurchased(Boolean(data?.purchased))
        setCreditsBalance(typeof data?.creditsBalance === 'number' ? data.creditsBalance : null)
      })
      .catch(() => {
        if (cancelled) return
        setPurchased(false)
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
    { id: 'browser', name: '浏览器语音', desc: '免费 · 本机合成' },
    ...voices.map((v) => ({
      id: v.id,
      name: v.name,
      desc: v.description ?? '云端 AI 音色',
    })),
  ]

  const rateFill = `${((settings.rate - 0.5) / 1.5) * 100}%`
  const volumeFill = `${settings.volume * 100}%`

  return (
    <div>
      <p className="setting-label" style={{ marginTop: 0 }}>
        音色
      </p>
      <div role="radiogroup" aria-label="音色选择">
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
                <div className="desc">{locked ? '需积分解锁 · ' : ''}{v.desc}</div>
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
          余额不足，云音色需积分解锁。
          <Link href="/#pricing" className="link">
            购买积分后使用云音色
          </Link>
        </p>
      )}

      <p className="setting-label">语速</p>
      <div className="speed-row">
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.25}
          value={settings.rate}
          onChange={(e) => setRate(Number(e.target.value))}
          aria-label="语速"
          style={{ '--fill': rateFill } as CSSProperties}
        />
        <span className="val">{formatRate(settings.rate)}x</span>
      </div>

      <p className="setting-label">音量</p>
      <div className="speed-row">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="音量"
          style={{ '--fill': volumeFill } as CSSProperties}
        />
        <span className="val">{Math.round(settings.volume * 100)}%</span>
      </div>

      <p className="setting-label">朗读</p>
      <div className="option-row">
        <div>
          <div className="name">跳过代码块</div>
          <div className="desc">朗读时跳过代码片段</div>
        </div>
        <input
          type="checkbox"
          className="switch"
          checked={settings.skipCode}
          onChange={toggleSkipCode}
          aria-label="跳过代码块"
        />
      </div>
      <div className="option-row">
        <div>
          <div className="name">跳过表格</div>
          <div className="desc">朗读时跳过表格内容</div>
        </div>
        <input
          type="checkbox"
          className="switch"
          checked={settings.skipTable}
          onChange={toggleSkipTable}
          aria-label="跳过表格"
        />
      </div>

      <p className="setting-label">逐句模式</p>
      {purchased ? (
        <>
          <div className="option-row">
            <div>
              <div className="name">逐句模式</div>
              <div className="desc">每句朗读后暂停，便于思考</div>
            </div>
            <input
              type="checkbox"
              className="switch"
              checked={settings.sentencePause}
              onChange={(e) => setSentencePause(e.target.checked)}
              aria-label="逐句模式"
            />
          </div>
          {settings.sentencePause && (
            <div className="option-row">
              <div>
                <div className="name">暂停时长</div>
                <div className="desc">每句结束后等待的秒数</div>
              </div>
              <select
                value={settings.sentencePauseSeconds}
                onChange={(e) => setSentencePauseSeconds(Number(e.target.value))}
                aria-label="暂停时长"
                className="speed-select"
              >
                {[1, 2, 3, 5, 8, 10].map((s) => (
                  <option key={s} value={s}>
                    {s} 秒
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="option-row" style={{ opacity: 0.6 }}>
            <div>
              <div className="name">
                逐句模式<span className="tag-inline">Pro</span>
              </div>
              <div className="desc">每句朗读后暂停，便于思考</div>
            </div>
            <input type="checkbox" className="switch" disabled checked={false} aria-label="逐句模式（未解锁）" />
          </div>
          <p className="settings-hint">
            <Link href="/#pricing" className="link">
              购买后解锁逐句模式
            </Link>
          </p>
        </>
      )}

      <p className="settings-hint">语速与音量在下一句生效；切换跳过选项会停止播放。</p>
      <button type="button" onClick={onClose} className="btn-secondary" style={{ width: '100%', marginTop: 14 }}>
        完成
      </button>
    </div>
  )
}
