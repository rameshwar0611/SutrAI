import { createSlice } from '@reduxjs/toolkit'
import { MODES } from '../utils/guestDraft.js'
import { sessionConfirmed, logoutStarted } from './userSlice.js'

const initialState = { text: '', mode: 'auto', resetKey: 0, persistAsGuest: true }
const workspaceSlice = createSlice({
  name: 'workspace', initialState,
  reducers: {
    setDraftText(state, action) { state.text = action.payload },
    setDraftMode(state, action) { if (MODES.includes(action.payload)) state.mode = action.payload },
    clearDraft(state) { state.text = ''; state.resetKey++ },
  },
  extraReducers: builder => builder
    .addCase(sessionConfirmed, state => { state.persistAsGuest = false })
    .addCase(logoutStarted, state => ({ ...initialState, resetKey: state.resetKey + 1 })),
})
export const { setDraftText, setDraftMode, clearDraft } = workspaceSlice.actions
export default workspaceSlice.reducer
