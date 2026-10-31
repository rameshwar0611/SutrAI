import express from 'express'
import { login, logOut, account, updateUserPayment, deductCredits } from '../controllers/auth.controller.js'
import { requireService } from '../../../shared/security/internal.js'
const router = express.Router()
router.post('/login', login)
router.get('/logout', logOut)
router.get('/account', requireService(['gateway']), account)
router.post('/update-plan', requireService(['billing']), updateUserPayment)
router.post('/deduct-credits', requireService(['agent']), deductCredits)
export default router
