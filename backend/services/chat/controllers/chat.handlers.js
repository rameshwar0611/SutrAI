import { validUserId, httpError, errorResponse } from '../../../shared/security/internal.js'

export function createChatHandlers({ Conversation, Message }) {
  const owned = async (id, userId) => {
    if (!validUserId(id)) throw httpError(400, 'Invalid request.')
    const conversation = await Conversation.findOne({ _id: id, userId })
    if (!conversation) throw httpError(404, 'Conversation not found.')
    return conversation
  }
  return {
    createConversation: async (req, res) => {
      try { return res.status(200).json(await Conversation.create({ userId: req.identity.userId })) }
      catch (error) { return errorResponse(error, res) }
    },
    getConversations: async (req, res) => {
      try { return res.status(200).json(await Conversation.find({ userId: req.identity.userId }).sort({ updatedAt: -1 })) }
      catch (error) { return errorResponse(error, res) }
    },
    authorizeConversation: async (req, res) => {
      try { await owned(req.params.conversationId, req.identity.userId); return res.status(200).json({ success: true }) }
      catch (error) { return errorResponse(error, res) }
    },
    updateConversation: async (req, res) => {
      try {
        const { id, title } = req.body || {}
        if (typeof title !== 'string' || !title.trim() || title.length > 20000 || !validUserId(id)) throw httpError(400, 'Invalid request.')
        const conversation = await Conversation.findOneAndUpdate({ _id: id, userId: req.identity.userId }, { $set: { title: title.trim().slice(0, 200) } }, { returnDocument: 'after' })
        if (!conversation) throw httpError(404, 'Conversation not found.')
        return res.status(200).json(conversation)
      } catch (error) { return errorResponse(error, res) }
    },
    saveMessage: async (req, res) => {
      try {
        const { conversationId, role, content, images, artifacts } = req.body || {}
        await owned(conversationId, req.identity.userId)
        if (!['user', 'assistant'].includes(role) || typeof content !== 'string') throw httpError(400, 'Invalid request.')
        return res.status(200).json(await Message.create({ conversationId, role, content, images, artifacts }))
      } catch (error) { return errorResponse(error, res) }
    },
    getMessages: async (req, res) => {
      try {
        await owned(req.params.conversationId, req.identity.userId)
        return res.status(200).json(await Message.find({ conversationId: req.params.conversationId }).sort({ createdAt: 1, _id: 1 }))
      } catch (error) { return errorResponse(error, res) }
    },
  }
}
