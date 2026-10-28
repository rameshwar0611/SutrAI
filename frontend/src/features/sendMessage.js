import api from '../../utils/axios.js'
export default async function sendMessage(payload, { signal } = {}) {
  const { data } = await api.post('/api/agent/chat', payload, { signal })
  if (typeof data?.answer !== 'string') throw new Error('Invalid assistant response.')
  return data
}
