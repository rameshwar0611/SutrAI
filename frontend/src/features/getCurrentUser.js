import api from '../../utils/axios.js'
import { normalizeUser } from '../utils/authSession.js'

export default async function getCurrentUser({ signal } = {}) {
  const { data } = await api.get('/api/me', { signal, timeout: 10000 })
  const user = normalizeUser(data)
  if (!user) throw new Error('The server returned an invalid session.')
  return user
}
