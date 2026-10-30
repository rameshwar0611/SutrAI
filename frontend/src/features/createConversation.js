import api from '../../utils/axios.js'
export const createConversation = async ({ signal } = {}) => {
  const { data } = await api.get('/api/chat/create-conversation', { signal })
  if (!data?._id) throw new Error('Unable to create a conversation.')
  return data
}
