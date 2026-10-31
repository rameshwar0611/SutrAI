import express from 'express'
import { createConversation, getConversations, updateConversation, saveMessage, getMessages, authorizeConversation } from '../controllers/chat.controller.js'
import { requireService } from '../../../shared/security/internal.js'
const router = express.Router()
router.get('/create-conversation', requireService(['gateway']), createConversation)
router.get('/get-conversations', requireService(['gateway']), getConversations)
router.post('/update-conversation', requireService(['gateway']), updateConversation)
router.post('/save-message', requireService(['agent']), saveMessage)
router.get('/get-messages/:conversationId', requireService(['gateway', 'agent']), getMessages)
router.get('/authorize/:conversationId', requireService(['agent']), authorizeConversation)
export default router
