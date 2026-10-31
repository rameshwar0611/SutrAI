import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { createAuthHandlers } from '../../services/auth/controllers/auth.handlers.js'
import { createBillingHandlers } from '../../services/billing/controllers/billing.handlers.js'
import { database, cache, invoke, A, B } from './helpers.js'

async function fixture(t) {
  const models = await database(t), secret = randomBytes(32).toString('hex'), auth = createAuthHandlers({ User: models.User, redis: cache() })
  const state = { grants: 0, interrupted: false,
    order: { id: 'order_Test001', amount: 19900, currency: 'INR', status: 'paid', amount_paid: 19900, amount_due: 0 },
    payment: { id: 'pay_Test001', order_id: 'order_Test001', amount: 19900, currency: 'INR', status: 'captured', captured: true } }
  const billing = createBillingHandlers({ Payment: models.Payment, signingSecret: () => secret,
    razorpay: { orders: { create: async () => ({ ...state.order, status: 'created' }), fetch: async () => state.order }, payments: { fetch: async () => state.payment } },
    grantCredits: async ({ userId, ...body }) => {
      state.grants++
      const result = await invoke(auth.updateUserPayment, body, userId)
      if (result.statusCode !== 200) throw new Error('Grant failed')
      if (state.interrupted) { state.interrupted = false; throw new Error('Isolated response lost after atomic grant') }
      return result.body
    },
  })
  const created = await invoke(billing.createOrder, { plan: 'starter', userId: B, credits: 99999, amount: 1 })
  assert.equal(created.statusCode, 200)
  const callback = { razorpay_order_id: state.order.id, razorpay_payment_id: state.payment.id,
    razorpay_signature: createHmac('sha256', secret).update(`${state.order.id}|${state.payment.id}`).digest('hex') }
  return { ...models, billing, state, callback }
}

test('test-mode provider fixture: parallel and repeated verification credits exactly once', async t => {
  const f = await fixture(t)
  const results = await Promise.all(Array.from({ length: 16 }, () => invoke(f.billing.verifyPayment, f.callback)))
  assert.ok(results.every(r => r.statusCode === 200 && r.body.message === 'Payment Verified'))
  await invoke(f.billing.verifyPayment, f.callback)
  const user = await f.User.findById(A)
  assert.equal(user.credits, 600); assert.equal(user.creditGrants.length, 1)
  const payment = await f.Payment.findOne({ orderId: f.state.order.id }); assert.equal(payment.status, 'paid'); assert.equal(payment.userId, A)
})

test('lost credit-grant acknowledgement is safely retried without double credit', async t => {
  const f = await fixture(t); f.state.interrupted = true
  assert.equal((await invoke(f.billing.verifyPayment, f.callback)).statusCode, 503)
  assert.equal((await f.User.findById(A)).credits, 600)
  assert.equal((await f.Payment.findOne({ orderId: f.state.order.id })).status, 'verified')
  assert.equal((await invoke(f.billing.verifyPayment, f.callback)).statusCode, 200)
  assert.equal((await f.User.findById(A)).credits, 600)
})

test('failed final payment save after credit grant recovers idempotently', async t => {
  const f = await fixture(t), original = f.Payment.findOneAndUpdate.bind(f.Payment)
  let interrupted = true
  f.Payment.findOneAndUpdate = (...args) => {
    if (args[1].$set.status === 'paid' && interrupted) { interrupted = false; throw new Error('Isolated final write failed') }
    return original(...args)
  }
  assert.equal((await invoke(f.billing.verifyPayment, f.callback)).statusCode, 503)
  assert.equal((await invoke(f.billing.verifyPayment, f.callback)).statusCode, 200)
  assert.equal((await f.User.findById(A)).credits, 600)
})

test('foreign accounts, bad signatures, amount/currency/order/capture mismatches cannot grant', async t => {
  const f = await fixture(t)
  assert.equal((await invoke(f.billing.verifyPayment, f.callback, B)).statusCode, 404)
  assert.equal((await invoke(f.billing.verifyPayment, { ...f.callback, razorpay_signature: '0'.repeat(64) })).statusCode, 400)
  for (const change of [{ amount: 1 }, { currency: 'USD' }, { order_id: 'order_Other' }, { id: 'pay_Other' }, { status: 'authorized', captured: false }]) {
    const saved = f.state.payment; f.state.payment = { ...saved, ...change }
    assert.ok((await invoke(f.billing.verifyPayment, f.callback)).statusCode >= 400)
    f.state.payment = saved
  }
  for (const change of [{ amount: 1 }, { amount_paid: 0 }, { amount_due: 19900 }, { status: 'created' }, { currency: 'USD' }]) {
    const saved = f.state.order; f.state.order = { ...saved, ...change }
    assert.ok((await invoke(f.billing.verifyPayment, f.callback)).statusCode >= 400)
    f.state.order = saved
  }
  assert.equal(f.state.grants, 0); assert.equal((await f.User.findById(A)).credits, 100)
})

test('a different payment identity cannot replace the claimed identity', async t => {
  const f = await fixture(t)
  await f.Payment.updateOne({ orderId: f.state.order.id }, { $set: { paymentId: 'pay_Another', status: 'verified' } })
  assert.equal((await invoke(f.billing.verifyPayment, f.callback)).statusCode, 409)
  assert.equal(f.state.grants, 0)
})

test('legacy paid records without grant receipts fail closed for manual review', async t => {
  const f = await fixture(t)
  await f.Payment.updateOne({ orderId: f.state.order.id }, { $unset: { creditGrantVersion: 1 }, $set: { status: 'paid', paymentId: f.state.payment.id } })
  assert.equal((await invoke(f.billing.verifyPayment, f.callback)).statusCode, 409)
  assert.equal(f.state.grants, 0)
})

test('order IDs are unique in MongoDB and client credit/amount/account fields cannot change the server quote', async t => {
  const f = await fixture(t)
  const stored = await f.Payment.findOne({ orderId: f.state.order.id })
  assert.equal(stored.userId, A); assert.equal(stored.amount, 199); assert.equal(stored.credits, 500)
  await assert.rejects(f.Payment.create({ userId: B, orderId: f.state.order.id }), error => error.code === 11000)
  assert.equal((await invoke(f.billing.createOrder, { plan: 'free' })).statusCode, 400)
})
