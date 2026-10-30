import { signInWithPopup } from 'firebase/auth'
import { getFirebaseClient } from '../../utils/firebase.js'
import api from '../../utils/axios.js'
import getCurrentUser from './getCurrentUser.js'

export async function loginWithGoogle(signal) {
  const { auth, googleProvider } = getFirebaseClient()
  const credential = await signInWithPopup(auth, googleProvider)
  signal.throwIfAborted()
  const token = await credential.user.getIdToken()
  signal.throwIfAborted()
  await api.post('/api/auth/login', { token }, { signal })
  // A Firebase identity alone does not prove the backend cookie is usable.
  return getCurrentUser({ signal })
}
