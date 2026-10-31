import { createSlice } from '@reduxjs/toolkit'
import { normalizeUser } from '../utils/authSession.js'

const userSlice = createSlice({
  name: 'user',
  initialState: {
    userData: null, status: 'checking', sessionEpoch: 0,
    dialogMode: null, dialogError: null, signingIn: false, signingOut: false, error: null, errorKind: null,
  },
  reducers: {
    accountRefreshed(state, action) {
      const { user: snapshot, accountId, sessionEpoch } = action.payload || {}
      const user = normalizeUser(snapshot)
      if (state.status !== 'authenticated' || state.sessionEpoch !== sessionEpoch ||
          state.userData?._id !== accountId || user?._id !== accountId) return
      state.userData = user
    },
    sessionChecking(state) {
      state.status = 'checking'
      state.userData = null
      state.error = null
      state.sessionEpoch++
    },
    sessionConfirmed(state, action) {
      const user = normalizeUser(action.payload)
      if (!user) return
      state.userData = user
      state.status = 'authenticated'
      state.dialogMode = null
      state.dialogError = null
      state.signingIn = false
      state.error = null
      state.errorKind = null
      state.sessionEpoch++
    },
    sessionEnded(state, action) {
      state.userData = null
      state.status = 'guest'
      state.sessionEpoch++
      state.signingIn = false
      state.error = null
      state.errorKind = null
      state.dialogMode = null
      state.dialogError = null
      if (action.payload?.expired) {
        state.dialogMode = 'login'
        state.dialogError = 'Your session expired. Sign in again; your draft is still here.'
      }
    },
    sessionFailed(state) {
      state.userData = null
      state.status = 'error'
      state.errorKind = 'session'
      state.error = 'Unable to check your session. You can keep drafting and retry.'
    },
    requestLogin(state, action) {
      if (state.status === 'authenticated' || state.status === 'checking' || state.signingOut) return
      state.dialogMode = action.payload === 'signup' ? 'signup' : 'login'
      state.dialogError = null
    },
    closeLogin(state) {
      state.dialogMode = null
      state.dialogError = null
      state.signingIn = false
    },
    loginStarted(state) { state.signingIn = true; state.dialogError = null },
    loginFailed(state, action) { state.signingIn = false; state.dialogError = action.payload },
    logoutStarted(state) {
      state.userData = null
      state.status = 'guest'
      state.sessionEpoch++
      state.dialogMode = null
      state.dialogError = null
      state.signingIn = false
      state.signingOut = true
      state.error = null
    },
    logoutFinished(state, action) {
      state.signingOut = false
      state.error = action.payload || null
      state.errorKind = action.payload ? 'logout' : null
      if (action.payload) state.status = 'error'
    },
  },
})

export const { accountRefreshed, sessionChecking, sessionConfirmed, sessionEnded, sessionFailed, requestLogin,
  closeLogin, loginStarted, loginFailed, logoutStarted, logoutFinished } = userSlice.actions
export default userSlice.reducer
