import { create } from 'zustand'

interface UiState {
  toast: string | null
  showToast: (message: string) => void
  clearToast: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  showToast: (message) => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: message })
    toastTimer = setTimeout(() => set({ toast: null }), 2600)
  },
  clearToast: () => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: null })
  },
}))
