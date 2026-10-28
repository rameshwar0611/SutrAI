export const DRAFT_KEY = 'sutrai.guest-draft.v1'
export const DRAFT_TTL = 30 * 60 * 1000
export const MODES = ['auto', 'chat', 'coding', 'pdf', 'ppt', 'vision', 'search']

function browserStorage() {
  try { return globalThis.window?.sessionStorage } catch { return null }
}

export function readGuestDraft(storage = browserStorage(), now = Date.now()) {
  try {
    const draft = JSON.parse(storage?.getItem(DRAFT_KEY) || 'null')
    if (!draft) return null
    if (draft.version !== 1 || typeof draft.text !== 'string' || draft.text.length > 50000 ||
        !MODES.includes(draft.mode) || !Number.isFinite(draft.savedAt) ||
        draft.savedAt > now || now - draft.savedAt >= DRAFT_TTL) {
      storage?.removeItem(DRAFT_KEY)
      return null
    }
    return { text: draft.text, mode: draft.mode }
  } catch { return null }
}

export function saveGuestDraft(draft, storage = browserStorage(), now = Date.now()) {
  try {
    if (!draft.persistAsGuest || (!draft.text && draft.mode === 'auto') || draft.text.length > 50000) {
      storage?.removeItem(DRAFT_KEY)
      return
    }
    storage?.setItem(DRAFT_KEY, JSON.stringify({
      version: 1, text: draft.text, mode: draft.mode, savedAt: now,
    }))
  } catch { /* Editing still works when browser storage is unavailable. */ }
}
