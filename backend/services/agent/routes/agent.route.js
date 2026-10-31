import express from 'express'
import { agent } from '../controllers/agent.controller.js'
import upload from '../config/multer.js'
import { requireService } from '../../../shared/security/internal.js'
const router = express.Router()
router.post('/chat', requireService(['gateway']), upload.single('file'), agent)
export default router
