import { combineReducers, configureStore } from '@reduxjs/toolkit'
import user from './userSlice.js'
import conversation from './conversationSlice.js'
import message from './messageSlice.js'
import workspace from './workspaceSlice.js'
import { readGuestDraft, saveGuestDraft } from '../utils/guestDraft.js'

const combined = combineReducers({ user, conversation, message, workspace })
export function rootReducer(state, action) {
  const next = combined(state, action)
  if (state && next.user.sessionEpoch !== state.user.sessionEpoch) {
    next.conversation = conversation(undefined, { type: '@@reset' })
    next.message = message(undefined, { type: '@@reset' })
  }
  return next
}

export function createAppStore(draft = null) {
  const initial = rootReducer(undefined, { type: '@@init' })
  const preloadedState = draft ? { ...initial, workspace: { ...initial.workspace, ...draft } } : initial
  return configureStore({ reducer: rootReducer, preloadedState })
}

export const store = createAppStore(readGuestDraft())
let previousDraft = store.getState().workspace
store.subscribe(() => {
  const draft = store.getState().workspace
  if (draft !== previousDraft) saveGuestDraft(draft)
  previousDraft = draft
})
