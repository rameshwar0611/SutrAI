import { useCallback, useEffect, useRef } from 'react'
import { useDispatch } from 'react-redux'
import { store } from '../redux/store.js'
import { sessionChecking, sessionConfirmed, sessionEnded, sessionFailed, closeLogin,
  loginStarted, loginFailed, logoutStarted, logoutFinished } from '../redux/userSlice.js'
import getCurrentUser from '../features/getCurrentUser.js'
import { loginWithGoogle } from '../features/login.js'
import logOut from '../features/logOut.js'
import { signOutFirebase } from '../../utils/firebase.js'
import { isSessionError } from '../utils/authSession.js'

export function useAuthFlow() {
  const dispatch = useDispatch()
  const active = useRef(null)
  const begin = useCallback(() => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    return controller
  }, [])

  const checkSession = useCallback(async () => {
    const controller = begin()
    dispatch(sessionChecking())
    try {
      const user = await getCurrentUser({ signal: controller.signal })
      if (!controller.signal.aborted) dispatch(sessionConfirmed(user))
    } catch (error) {
      if (controller.signal.aborted) return
      dispatch(isSessionError(error) ? sessionEnded() : sessionFailed())
    }
  }, [begin, dispatch])

  useEffect(() => {
    checkSession()
    return () => active.current?.abort()
  }, [checkSession])

  const login = async () => {
    const { signingIn, signingOut } = store.getState().user
    if (signingIn || signingOut) return
    const controller = begin()
    dispatch(loginStarted())
    try {
      const user = await loginWithGoogle(controller.signal)
      if (!controller.signal.aborted) {
        dispatch(sessionConfirmed(user))
        requestAnimationFrame(() => document.getElementById('chat-prompt')?.focus())
      }
    } catch (error) {
      if (controller.signal.aborted) return
      const cancelled = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)
      dispatch(loginFailed(cancelled ? 'Sign-in was cancelled. Your draft is still here.' :
        isSessionError(error) ? 'Could not confirm your session. Check browser cookies and try again.' :
        'Unable to sign in with Google. Your draft is safe; please try again.'))
    }
  }

  const dismissLogin = () => {
    active.current?.abort()
    dispatch(closeLogin())
  }

  const logout = async () => {
    if (store.getState().user.signingOut) return
    active.current?.abort()
    dispatch(logoutStarted())
    let failed = false
    try { await logOut() } catch { failed = true }
    try { await signOutFirebase() } catch { failed = true }
    dispatch(logoutFinished(failed ? 'Your workspace was cleared, but logout could not be confirmed. Please retry.' : null))
  }

  return { checkSession, login, dismissLogin, logout }
}
