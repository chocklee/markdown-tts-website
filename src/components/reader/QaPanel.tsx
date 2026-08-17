'use client'
import { useState } from 'react'
import { IconChat, IconSend } from '@/components/app/icons'

const SUGGESTIONS = ['这篇文章讲了什么？', '总结一下核心观点', '有哪些行动建议？']

export function QaPanel() {
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState<string | null>(null)

  const ask = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    setAsked(text)
  }

  return (
    <div>
      <p className="meta qa-desc">基于当前文档内容回答 · 回答由文档生成</p>
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
            placeholder="输入你的问题…"
            aria-label="向文档提问"
            autoComplete="off"
          />
        </div>
        <button type="button" className="qa-send" aria-label="提问" onClick={() => ask(question)}>
          <IconSend />
        </button>
      </div>
      <p className="setting-label">试试这样问</p>
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
          <p className="a">文档问答正在开发中，即将上线。可以先试试上方的问题，或继续朗读本文档。</p>
        </div>
      )}
    </div>
  )
}
