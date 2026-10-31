import { randomUUID } from 'node:crypto'
import { PLANS, CREDIT_COSTS } from '../../../shared/billing/plans.js'
import { accountView } from '../../../shared/security/account.js'
import { errorResponse, httpError } from '../../../shared/security/internal.js'

const cookie = { httpOnly: true, secure: true, sameSite: 'none', path: '/' }
const operationId = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value)
const grantId = value => typeof value === 'string' && /^order_[a-z\d]{1,80}$/i.test(value)

export function createAuthHandlers({ User, redis, verifyToken }) {
  return {
    login: async (req, res) => {
      try {
        const token = req.body?.token
        if (typeof token !== 'string' || !token || token.length > 20000) throw httpError(400, 'Invalid request.')
        let decoded
        try { decoded = await verifyToken(token) } catch (error) {
          if (error?.code?.startsWith('auth/')) return res.status(401).json({ message: 'Invalid identity token.' })
          throw error
        }
        if (typeof decoded?.uid !== 'string' || !decoded.uid) throw httpError(400, 'Invalid request.')
        const profile = { firebaseUid: decoded.uid, name: decoded.name, email: decoded.email, avatar: decoded.picture }
        let user
        try { user = await User.findOneAndUpdate({ firebaseUid: decoded.uid }, { $setOnInsert: profile }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }) }
        catch (error) { if (error.code !== 11000) throw error; user = await User.findOne({ firebaseUid: decoded.uid }) }
        const sessionId = randomUUID()
        await redis.set(`session-${sessionId}`, JSON.stringify({ userId: String(user._id) }), 'EX', 7 * 24 * 60 * 60)
        res.cookie('session', sessionId, { ...cookie, maxAge: 7 * 24 * 60 * 60 * 1000 })
        return res.status(200).json(accountView(user))
      } catch (error) { return errorResponse(error, res) }
    },
    logOut: async (req, res) => {
      try {
        const id = req.cookies?.session || /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie || '')?.[1]
        if (typeof id === 'string' && operationId(id)) await redis.del(`session-${id}`)
        res.clearCookie('session', cookie)
        return res.status(200).json({ message: 'logout successfully' })
      } catch (error) { return errorResponse(error, res) }
    },
    account: async (req, res) => {
      try {
        const user = await User.findById(req.identity.userId)
        if (!user) return res.status(401).json({ message: 'unauthorized' })
        return res.status(200).json(accountView(user))
      } catch (error) { return errorResponse(error, res) }
    },
    updateUserPayment: async (req, res) => {
      try {
        const { orderId, plan } = req.body || {}, userId = req.identity.userId
        const selected = ['starter', 'pro'].includes(plan) ? PLANS[plan] : null
        if (!grantId(orderId) || !selected || req.body?.credits !== undefined || req.body?.userId !== undefined) throw httpError(400, 'Invalid request.')
        // Grant receipt and balances live in the SAME atomic MongoDB document update.
        const user = await User.findOneAndUpdate({ _id: userId, 'creditGrants.id': { $ne: orderId } }, {
          $inc: { credits: selected.credits, totalCredits: selected.credits },
          $set: { plan, planExpiresAt: new Date(Date.now() + selected.validity * 86400000) },
          $push: { creditGrants: { id: orderId, plan, credits: selected.credits, createdAt: new Date() } },
        }, { returnDocument: 'after' })
        if (user) return res.status(200).json({ success: true })
        const existing = await User.findById(userId)
        if (!existing) throw httpError(404, 'Account not found.')
        const receipt = existing.creditGrants?.find(item => item.id === orderId)
        if (receipt?.plan !== plan || receipt.credits !== selected.credits) throw httpError(409, 'Credit operation conflict.')
        return res.status(200).json({ success: true })
      } catch (error) { return errorResponse(error, res) }
    },
    deductCredits: async (req, res) => {
      try {
        const { requestId, action, agent, outcome } = req.body || {}, userId = req.identity.userId
        if (!operationId(requestId) || req.body?.userId !== undefined || req.body?.credits !== undefined) throw httpError(400, 'Invalid request.')
        if (action === 'reserve') {
          const cost = Object.hasOwn(CREDIT_COSTS, agent) ? CREDIT_COSTS[agent] : null
          if (!cost) throw httpError(400, 'Invalid request.')
          const user = await User.findOneAndUpdate({ _id: userId, credits: { $gte: cost }, 'creditReservations.id': { $ne: requestId } }, {
            $inc: { credits: -cost }, $push: { creditReservations: { id: requestId, agent, reserved: cost, charged: 0, state: 'reserved', createdAt: new Date() } },
          }, { returnDocument: 'after' })
          if (user) return res.status(200).json({ success: true, credits: user.credits })
          const existing = await User.findById(userId)
          if (!existing) throw httpError(404, 'Account not found.')
          const receipt = existing.creditReservations?.find(item => item.id === requestId)
          if (receipt) {
            if (receipt.agent !== agent || receipt.state !== 'reserved') throw httpError(409, 'Credit operation conflict.')
            return res.status(200).json({ success: true, credits: existing.credits })
          }
          throw httpError(400, 'Not enough credits.')
        }
        if (action !== 'settle' || !['success', 'failure'].includes(outcome)) throw httpError(400, 'Invalid request.')
        const existing = await User.findById(userId)
        const receipt = existing?.creditReservations?.find(item => item.id === requestId)
        if (!receipt) throw httpError(409, 'Credit operation conflict.')
        const cost = outcome === 'failure' ? 0 : Object.hasOwn(CREDIT_COSTS, agent) && agent !== 'auto' ? CREDIT_COSTS[agent] : null
        if (cost === null || cost > receipt.reserved || (outcome === 'success' && receipt.agent !== 'auto' && receipt.agent !== agent)) throw httpError(409, 'Credit operation conflict.')
        const user = await User.findOneAndUpdate({ _id: userId, creditReservations: { $elemMatch: { id: requestId, state: 'reserved' } } }, {
          $inc: { credits: receipt.reserved - cost }, $set: { 'creditReservations.$.state': 'settled', 'creditReservations.$.charged': cost },
        }, { returnDocument: 'after' })
        if (user) return res.status(200).json({ success: true, credits: user.credits })
        const current = await User.findById(userId), settled = current?.creditReservations?.find(item => item.id === requestId)
        if (settled?.state !== 'settled' || settled.charged !== cost) throw httpError(409, 'Credit operation conflict.')
        return res.status(200).json({ success: true, credits: current.credits })
      } catch (error) { return errorResponse(error, res) }
    },
  }
}
