import { randomUUID } from 'node:crypto'
import { validUserId, httpError, errorResponse } from '../../../shared/security/internal.js'

export const MODES = ['auto', 'chat', 'coding', 'pdf', 'ppt', 'vision', 'search']
const workflows = [...MODES.slice(1), 'pdfRag', 'imageAnalyzer']
export function createAgentHandler({ graph, authorize, saveMessage, reserve, settle, addMemory, cleanup }) {
  return async (req, res) => {
    const requestId = randomUUID(), userId = req.identity.userId
    let reserved = false, generated = false, settled = false
    try {
      const { prompt = '', conversationId, agent = 'auto' } = req.body || {}
      if (typeof prompt !== 'string' || prompt.length > 20000 || (!prompt.trim() && !req.file) ||
          !validUserId(conversationId) || !MODES.includes(agent)) throw httpError(400, 'Invalid request.')
      await authorize(conversationId, userId)
      await reserve({ userId, requestId, agent })
      reserved = true
      await saveMessage({ userId, conversationId, role: 'user', content: prompt })
      const result = await graph.invoke({ prompt, conversationId, agent, userId, file: req.file })
      if (typeof result?.aiResponse !== 'string') throw httpError(503, 'Invalid assistant response.')
      generated = true
      const actual = workflows.includes(result.agent) ? result.agent : 'chat'
      await settle({ userId, requestId, agent: actual, outcome: 'success' })
      settled = true
      await saveMessage({ userId, conversationId, role: 'assistant', content: result.aiResponse, images: result.images, artifacts: result.artifacts })
      // The database remains authoritative; a cache failure must not lose an accepted answer.
      try { await addMemory(conversationId, userId, prompt, result.aiResponse) } catch { /* Read path falls back to chat service. */ }
      return res.status(200).json({ answer: result.aiResponse, images: result.images, artifacts: result.artifacts })
    } catch (error) {
      let failure = error
      // Never refund after generation when success settlement has an uncertain outcome.
      if (reserved && !generated && !settled) {
        try { await settle({ userId, requestId, outcome: 'failure' }) }
        catch { failure = httpError(503, 'Credit operation requires review.') }
      } else if (generated && !settled) failure = httpError(503, 'Credit operation requires review.')
      return errorResponse(failure, res)
    } finally {
      if (req.file) { try { await cleanup(req.file.path) } catch { /* Never mask the primary outcome or log file contents. */ } }
    }
  }
}
