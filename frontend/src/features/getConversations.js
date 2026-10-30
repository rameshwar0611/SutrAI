import api from '../../utils/axios.js'
export const getConversations = async ({ signal } = {}) => {
  const { data } = await api.get('/api/chat/get-conversations', { signal })
  if (!Array.isArray(data)) throw new Error('Invalid conversation response.')
  return data
}
