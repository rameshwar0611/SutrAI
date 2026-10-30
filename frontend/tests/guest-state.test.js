import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeUser, isSessionError, isProtectedRequest } from '../src/utils/authSession.js'
import { DRAFT_KEY, DRAFT_TTL, readGuestDraft, saveGuestDraft } from '../src/utils/guestDraft.js'
import { createAppStore } from '../src/redux/store.js'
import { sessionConfirmed, sessionEnded, sessionFailed, requestLogin, closeLogin, loginFailed, logoutStarted } from '../src/redux/userSlice.js'
import { setDraftText, setDraftMode, clearDraft } from '../src/redux/workspaceSlice.js'
import { setConversations, setSelectedConversation } from '../src/redux/conversationSlice.js'
import { addMessage, setArtifacts } from '../src/redux/messageSlice.js'

function memoryStorage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}

test('normalizes login and restored session identities; rejects invalid identities', () => {
  assert.equal(normalizeUser({ _id: 'one' })._id, 'one')
  assert.equal(normalizeUser({ userId: 'two', name: 'User' })._id, 'two')
  for (const invalid of [null, {}, { _id: 12 }]) assert.equal(normalizeUser(invalid), null)
})

test('only recognizes the gateway authentication errors, not billing/validation failures', () => {
  for (const message of ['unauthorized', 'session expired']) assert.equal(isSessionError({ response: { status: 400, data: { message } } }), true)
  assert.equal(isSessionError({ response: { status: 401 } }), true)
  for (const error of [{}, { response: { status: 500 } }, { response: { status: 400, data: { message: 'Not enough credits.' } } }]) assert.equal(isSessionError(error), false)
})

test('protected route matching keeps bootstrap and login available', () => {
  for (const route of ['/api/chat/create-conversation', '/api/agent/chat', '/api/billing/create']) assert.equal(isProtectedRequest(route), true)
  for (const route of ['/api/me', '/api/auth/login', undefined, '/api/chatter']) assert.equal(isProtectedRequest(route), false)
})

test('guest storage round-trip only persists allowed draft fields', () => {
  const storage = memoryStorage()
  saveGuestDraft({ text: 'Hello', mode: 'coding', persistAsGuest: true, token: 'never-store', file: {} }, storage, 100)
  assert.deepEqual(readGuestDraft(storage, 101), { text: 'Hello', mode: 'coding' })
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(DRAFT_KEY))).sort(), ['mode', 'savedAt', 'text', 'version'])
})

test('expired, future, oversized, corrupt and unknown-mode drafts are ignored', () => {
  const storage = memoryStorage()
  const valid = { version: 1, text: 'Draft', mode: 'auto', savedAt: 100 }
  for (const changed of [{ savedAt: 100 - DRAFT_TTL }, { savedAt: 101 }, { mode: 'admin' }, { version: 2 }, { text: 'x'.repeat(50001) }]) {
    storage.setItem(DRAFT_KEY, JSON.stringify({ ...valid, ...changed }))
    assert.equal(readGuestDraft(storage, 100), null)
  }
  storage.setItem(DRAFT_KEY, '{invalid')
  assert.equal(readGuestDraft(storage, 100), null)
})

test('unavailable storage cannot break editing or restoration', () => {
  const storage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  assert.equal(readGuestDraft(storage), null)
  assert.doesNotThrow(() => saveGuestDraft({ text: 'Draft', mode: 'auto', persistAsGuest: true }, storage))
})

test('authenticated drafts and cleared drafts are removed from guest storage', () => {
  const storage = memoryStorage()
  storage.setItem(DRAFT_KEY, 'old')
  saveGuestDraft({ text: 'private', mode: 'chat', persistAsGuest: false }, storage)
  assert.equal(storage.getItem(DRAFT_KEY), null)
  storage.setItem(DRAFT_KEY, 'old')
  saveGuestDraft({ text: '', mode: 'auto', persistAsGuest: true }, storage)
  assert.equal(storage.getItem(DRAFT_KEY), null)
})

test('login, cancellation and authentication preserve draft, mode and attachment reset key', () => {
  const store = createAppStore({ text: 'Explain Redis', mode: 'search' })
  store.dispatch(sessionEnded())
  const resetKey = store.getState().workspace.resetKey
  store.dispatch(requestLogin('signup'))
  store.dispatch(loginFailed('Cancelled'))
  store.dispatch(closeLogin())
  assert.equal(store.getState().workspace.text, 'Explain Redis')
  store.dispatch(sessionConfirmed({ userId: 'one' }))
  const state = store.getState()
  assert.equal(state.user.userData._id, 'one')
  assert.equal(state.workspace.text, 'Explain Redis')
  assert.equal(state.workspace.mode, 'search')
  assert.equal(state.workspace.resetKey, resetKey)
  assert.equal(state.workspace.persistAsGuest, false)
  assert.equal(state.message.isLoading, false)
  assert.equal(state.conversation.selectedConversation, null)
})

test('session expiration clears all account data but keeps the unsent draft only in memory', () => {
  const store = createAppStore()
  store.dispatch(sessionConfirmed({ _id: 'one' }))
  store.dispatch(setConversations([{ _id: 'private' }]))
  store.dispatch(setSelectedConversation({ _id: 'private' }))
  store.dispatch(addMessage({ content: 'private' }))
  store.dispatch(setArtifacts([{ files: [] }]))
  store.dispatch(setDraftText('Unsent'))
  store.dispatch(sessionEnded({ expired: true }))
  const state = store.getState()
  assert.deepEqual(state.conversation.conversations, [])
  assert.equal(state.conversation.selectedConversation, null)
  assert.deepEqual(state.message.messages, [])
  assert.deepEqual(state.message.artifacts, [])
  assert.equal(state.workspace.text, 'Unsent')
  assert.equal(state.workspace.persistAsGuest, false)
  assert.equal(state.user.dialogMode, 'login')
})

test('logout clears account and composer data, invalidating in-memory attachments', () => {
  const store = createAppStore({ text: 'Unsent', mode: 'pdf' })
  store.dispatch(sessionConfirmed({ _id: 'one' }))
  const resetKey = store.getState().workspace.resetKey
  store.dispatch(logoutStarted())
  assert.equal(store.getState().workspace.text, '')
  assert.equal(store.getState().workspace.mode, 'auto')
  assert.equal(store.getState().workspace.resetKey, resetKey + 1)
  assert.equal(store.getState().user.userData, null)
})

test('verification failures stay distinct from a confirmed guest; invalid auth cannot unlock features', () => {
  const store = createAppStore()
  store.dispatch(sessionFailed())
  store.dispatch(sessionConfirmed({ email: 'not-a-session' }))
  assert.equal(store.getState().user.status, 'error')
  assert.equal(store.getState().user.userData, null)
})

test('clearing a draft preserves mode and forces attachment reset', () => {
  const store = createAppStore()
  store.dispatch(setDraftText('Hi'))
  store.dispatch(setDraftMode('vision'))
  store.dispatch(setDraftMode('invalid'))
  store.dispatch(clearDraft())
  assert.equal(store.getState().workspace.text, '')
  assert.equal(store.getState().workspace.mode, 'vision')
  assert.equal(store.getState().workspace.resetKey, 1)
})

test('closing login preserves an outstanding session-verification error', () => {
  const store = createAppStore()
  store.dispatch(sessionFailed())
  const error = store.getState().user.error
  store.dispatch(requestLogin())
  store.dispatch(closeLogin())
  assert.equal(store.getState().user.error, error)
})

test('sign-in cannot interrupt the initial session check or logout', () => {
  const store = createAppStore()
  store.dispatch(requestLogin())
  assert.equal(store.getState().user.dialogMode, null)
  store.dispatch(logoutStarted())
  store.dispatch(requestLogin('signup'))
  assert.equal(store.getState().user.dialogMode, null)
})
