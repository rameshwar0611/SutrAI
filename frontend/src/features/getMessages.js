import api from '../../utils/axios.js'
export default async function getMessages(id, { signal } = {}) {
  const { data } = await api.get(`/api/chat/get-messages/${id}`, { signal })
  if (!Array.isArray(data)) throw new Error('Invalid message response.')
  return data
}
