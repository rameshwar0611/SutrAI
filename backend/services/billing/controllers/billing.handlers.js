import { createHmac, timingSafeEqual } from 'node:crypto'
import { PLANS } from '../../../shared/billing/plans.js'
import { httpError, errorResponse } from '../../../shared/security/internal.js'

const providerId = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[a-z\\d]{1,80}$`, 'i').test(value)
export function createBillingHandlers({ Payment, razorpay, grantCredits, signingSecret }) {
  const accepted = res => res.status(200).json({ message: 'Payment Verified' })
  return {
    createOrder: async (req, res) => {
      try {
        const plan = ['starter', 'pro'].includes(req.body?.plan) ? PLANS[req.body.plan] : null
        if (!plan) throw httpError(400, 'Invalid request.')
        const order = await razorpay.orders.create({ amount: plan.amount * 100, currency: 'INR' })
        if (!providerId(order?.id, 'order') || order.amount !== plan.amount * 100 || order.currency !== 'INR' || order.status !== 'created') throw httpError(503, 'Payment requires review.')
        await Payment.create({ userId: req.identity.userId, orderId: order.id, amount: plan.amount, credits: plan.credits,
          plan: plan.id, currency: 'INR', status: 'created', creditGrantVersion: 1 })
        return res.status(200).json({ order, plan })
      } catch (error) { return errorResponse(error, res) }
    },
    verifyPayment: async (req, res) => {
      try {
        const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {}
        if (!providerId(orderId, 'order') || !providerId(paymentId, 'pay') || typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) throw httpError(400, 'Payment verification failed.')
        const secret = signingSecret()
        if (typeof secret !== 'string' || !secret) throw httpError(503, 'Payment requires review.')
        const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest()
        if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw httpError(400, 'Payment verification failed.')
        const userId = req.identity.userId
        const payment = await Payment.findOne({ orderId, userId })
        if (!payment) throw httpError(404, 'Payment verification failed.')
        // Historical records have no atomic grant receipt. Never re-credit them blindly.
        if (payment.creditGrantVersion !== 1) throw httpError(409, 'Payment requires review.')
        if (payment.paymentId && payment.paymentId !== paymentId) throw httpError(409, 'Payment verification failed.')
        if (payment.status === 'paid') return accepted(res)
        if (!['created', 'verified'].includes(payment.status)) throw httpError(409, 'Payment requires review.')
        const plan = PLANS[payment.plan]
        if (!['starter', 'pro'].includes(payment.plan) || payment.currency !== 'INR' || payment.amount !== plan.amount || payment.credits !== plan.credits) throw httpError(409, 'Payment requires review.')
        const [providerPayment, order] = await Promise.all([razorpay.payments.fetch(paymentId), razorpay.orders.fetch(orderId)])
        const paise = payment.amount * 100
        if (providerPayment.id !== paymentId || providerPayment.order_id !== orderId || providerPayment.amount !== paise || providerPayment.currency !== 'INR' ||
            order.id !== orderId || order.amount !== paise || order.currency !== 'INR') throw httpError(400, 'Payment verification failed.')
        if (providerPayment.status !== 'captured' || providerPayment.captured !== true || order.status !== 'paid' || order.amount_paid !== paise || order.amount_due !== 0) throw httpError(409, 'Payment is not captured.')
        const claimed = await Payment.findOneAndUpdate({ _id: payment._id, userId, status: { $in: ['created', 'verified'] },
          $or: [{ paymentId: { $exists: false } }, { paymentId: null }, { paymentId }] },
        { $set: { paymentId, status: 'verified' } }, { returnDocument: 'after' })
        if (!claimed) {
          const current = await Payment.findOne({ orderId, userId })
          if (current?.status === 'paid' && current.paymentId === paymentId) return accepted(res)
          throw httpError(409, 'Payment requires review.')
        }
        // Retries after a timeout use the same order receipt; auth grants it only once.
        const result = await grantCredits({ userId, orderId, plan: payment.plan })
        if (result?.success !== true) throw httpError(503, 'Payment requires review.')
        const saved = await Payment.findOneAndUpdate({ _id: payment._id, userId, paymentId, status: { $in: ['verified', 'paid'] } },
          { $set: { status: 'paid', creditedAt: new Date() } }, { returnDocument: 'after' })
        if (!saved) throw httpError(503, 'Payment requires review.')
        return accepted(res)
      } catch (error) { return errorResponse(error, res) }
    },
  }
}
