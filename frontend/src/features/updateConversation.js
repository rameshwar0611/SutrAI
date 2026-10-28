import api from '../../utils/axios.js'
export const updateConversation = async (payload, { signal } = {}) => {
  const { data } = await api.post('/api/chat/update-conversation', payload, { signal })
  return data
}
