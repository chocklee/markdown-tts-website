export interface LegacyStoredDocument {
  id: string
  title: string
  content: string
  savedAt: number
}

const LEGACY_DOC_KEY = 'mtts:doc'
const POS_KEY = 'mtts:pos'

export function loadLegacyDocument(): LegacyStoredDocument | null {
  const raw = localStorage.getItem(LEGACY_DOC_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LegacyStoredDocument>
    if (typeof parsed.id !== 'string' || typeof parsed.title !== 'string' || typeof parsed.content !== 'string') {
      return null
    }
    return parsed as LegacyStoredDocument
  } catch {
    return null
  }
}

export function clearLegacyDocument(): void {
  localStorage.removeItem(LEGACY_DOC_KEY)
}

export function savePosition(docId: string, sentenceId: string): void {
  localStorage.setItem(POS_KEY, JSON.stringify({ docId, sentenceId }))
}

export function loadPosition(docId: string): string | null {
  const raw = localStorage.getItem(POS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { docId: string; sentenceId: string }
    return parsed.docId === docId ? parsed.sentenceId : null
  } catch {
    return null
  }
}

export function clearPosition(): void {
  localStorage.removeItem(POS_KEY)
}
