import { callService } from '../../../shared/security/internal.js'
export const getMessages = async (conversationId, userId) => {
  const data = await callService({ caller: 'agent', url: process.env.CHAT_SERVICE, path: `/get-messages/${conversationId}`, userId, method: 'GET' })
  if (!Array.isArray(data)) throw new Error('Invalid history response.')
  return data.map(({ role, content }) => ({ role, content }))
}
