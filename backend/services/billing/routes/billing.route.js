import express from 'express'
import { createOrder, verifyPayment } from '../controllers/billing.controller.js'
import { requireService } from '../../../shared/security/internal.js'
const router = express.Router()
router.use(requireService(['gateway']))
router.post('/create', createOrder)
router.post('/verify', verifyPayment)
export default router
