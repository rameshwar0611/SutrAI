import { unlink } from 'node:fs/promises'
import { graph } from '../graph/graph.js'
import { addExchange } from '../config/memory.js'
import { callService } from '../../../shared/security/internal.js'
import { reserveCredits, settleCredits } from '../utils/deductCredits.js'
import { createAgentHandler } from './agent.handler.js'
const chat = (path, userId, body, method = 'POST') => callService({ caller: 'agent', url: process.env.CHAT_SERVICE, path, userId, body, method })
export const agent = createAgentHandler({ graph,
  authorize: (id, userId) => chat(`/authorize/${id}`, userId, undefined, 'GET'),
  saveMessage: ({ userId, ...body }) => chat('/save-message', userId, body),
  reserve: reserveCredits, settle: settleCredits, addMemory: addExchange, cleanup: unlink,
})
