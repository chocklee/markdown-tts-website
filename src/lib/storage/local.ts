export interface StoredDocument {
  id: string
  title: string
  content: string
  savedAt: number
}

const DOC_KEY = 'mtts:doc'
const POS_KEY = 'mtts:pos'

export function saveDocument(doc: StoredDocument): void {
  localStorage.setItem(DOC_KEY, JSON.stringify(doc))
}

export function loadDocument(): StoredDocument | null {
  const raw = localStorage.getItem(DOC_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredDocument>
    if (typeof parsed.id !== 'string' || typeof parsed.title !== 'string' || typeof parsed.content !== 'string') {
      return null
    }
    return parsed as StoredDocument
  } catch {
    return null
  }
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
