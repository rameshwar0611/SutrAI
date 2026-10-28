import axios from 'axios'
import { store } from '../src/redux/store.js'
import { sessionEnded } from '../src/redux/userSlice.js'
import { isProtectedRequest, isSessionError, sessionChangedError } from '../src/utils/authSession.js'

const api = axios.create({ baseURL: import.meta.env?.VITE_SERVER_URL, withCredentials: true })
api.interceptors.request.use(config => {
  if (isProtectedRequest(config.url)) {
    const { status, sessionEpoch } = store.getState().user
    if (status !== 'authenticated') {
      throw Object.assign(new Error('Sign in to continue.'), { code: 'AUTH_REQUIRED' })
    }
    config.sessionEpoch = sessionEpoch
  }
  return config
})
api.interceptors.response.use(response => {
  if (isProtectedRequest(response.config.url) &&
      response.config.sessionEpoch !== store.getState().user.sessionEpoch) throw sessionChangedError()
  return response
}, error => {
  if (isProtectedRequest(error.config?.url) &&
      error.config.sessionEpoch === store.getState().user.sessionEpoch && isSessionError(error)) {
    store.dispatch(sessionEnded({ expired: true }))
  }
  return Promise.reject(error)
})
export default api
