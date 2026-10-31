import redis from '../../../shared/redis/redis.js'
import { getMessages } from '../utils/getMessages.js'
const key = (conversationId, userId) => `messages:${userId}:${conversationId}`
export const getMemory = async (conversationId, userId) => {
  try {
    const cached = await redis.get(key(conversationId, userId))
    if (cached) { const data = JSON.parse(cached); if (Array.isArray(data)) return data }
  } catch { /* Use durable, ownership-checked history when Redis is unavailable. */ }
  const messages = await getMessages(conversationId, userId)
  try { await redis.set(key(conversationId, userId), JSON.stringify(messages.slice(-20)), 'EX', 86400) } catch { /* Cache is optional. */ }
  return messages
}
export const addExchange = async (conversationId, userId) => {
  // Reload after durable writes; do not append duplicates or race read/modify/write lists.
  const messages = await getMessages(conversationId, userId)
  await redis.set(key(conversationId, userId), JSON.stringify(messages.slice(-20)), 'EX', 86400)
}
