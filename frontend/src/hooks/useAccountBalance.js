import { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import getCurrentUser from '../features/getCurrentUser.js'
import { accountRefreshed, sessionEnded } from '../redux/userSlice.js'
import { store } from '../redux/store.js'
import { isSessionError } from '../utils/authSession.js'

export default function useAccountBalance() {
  const { status, sessionEpoch, userData } = useSelector(state => state.user)
  const accountId = userData?._id
  const key = `${sessionEpoch}:${accountId}`
  const [request, setRequest] = useState(null)
  const active = useRef(null)
  const dispatch = useDispatch()
  useEffect(() => () => active.current?.abort(), [key])
  const refresh = useCallback(async () => {
    if (status !== 'authenticated') return false
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const current = () => !controller.signal.aborted && store.getState().user.status === 'authenticated' &&
      store.getState().user.sessionEpoch === sessionEpoch && store.getState().user.userData?._id === accountId
    setRequest({ key: `${sessionEpoch}:${accountId}`, status: 'loading' })
    try {
      const user = await getCurrentUser({ signal: controller.signal })
      if (!current()) return false
      if (user._id !== accountId) throw new Error('Account identity changed.')
      dispatch(accountRefreshed({ user, accountId, sessionEpoch }))
      setRequest({ key: `${sessionEpoch}:${accountId}`, status: 'ready' })
      return true
    } catch (error) {
      if (!current()) return false
      if (isSessionError(error)) dispatch(sessionEnded({ expired: true }))
      else setRequest({ key: `${sessionEpoch}:${accountId}`, status: 'error' })
      return false
    }
  }, [status, sessionEpoch, accountId, dispatch])
  return { refresh, status: request?.key === key ? request.status : 'idle' }
}
