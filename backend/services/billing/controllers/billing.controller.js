import Payment from '../models/payment.model.js'
import razorpay from '../config/razorpay.js'
import { createBillingHandlers } from './billing.handlers.js'
import { callService } from '../../../shared/security/internal.js'
export const { createOrder, verifyPayment } = createBillingHandlers({ Payment, razorpay,
  signingSecret: () => process.env.RAZORPAY_KEY_SECRET,
  grantCredits: ({ userId, orderId, plan }) => callService({ caller: 'billing', url: process.env.AUTH_SERVICE,
    path: '/update-plan', userId, body: { orderId, plan } }),
})
