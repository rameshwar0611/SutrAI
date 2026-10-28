import api from '../../utils/axios.js'

export default async function logOut() {
  await api.get('/api/auth/logout')
}
