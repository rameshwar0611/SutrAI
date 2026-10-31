import Conversation from '../models/coversation.model.js'
import Message from '../models/message.model.js'
import { createChatHandlers } from './chat.handlers.js'
export const { createConversation, getConversations, updateConversation, saveMessage, getMessages, authorizeConversation } = createChatHandlers({ Conversation, Message })
