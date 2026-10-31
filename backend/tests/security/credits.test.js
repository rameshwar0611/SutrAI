import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createAuthHandlers } from '../../services/auth/controllers/auth.handlers.js'
import { database, cache, invoke, A, B } from './helpers.js'

test('concurrent deductions are atomic, cannot go negative, and reject insufficient credit', async t => {
  const { User } = await database(t)
  await User.updateOne({ _id: A }, { $set: { credits: 10 } })
  const auth = createAuthHandlers({ User, redis: cache() })
  const results = await Promise.all(Array.from({ length: 30 }, () => invoke(auth.deductCredits, { action: 'reserve', requestId: randomUUID(), agent: 'chat' })))
  assert.equal(results.filter(r => r.statusCode === 200).length, 10)
  assert.equal(results.filter(r => r.statusCode === 400 && r.body.message === 'Not enough credits.').length, 20)
  const user = await User.findById(A)
  assert.equal(user.credits, 0); assert.equal(user.creditReservations.length, 10)
  assert.equal((await User.findById(B)).credits, 100)
})

test('reservation replay, successful Auto settlement and failed-operation refunds apply only once', async t => {
  const { User } = await database(t); const auth = createAuthHandlers({ User, redis: cache() }); const requestId = randomUUID()
  const reserve = { action: 'reserve', requestId, agent: 'auto' }
  assert.ok((await Promise.all(Array.from({ length: 12 }, () => invoke(auth.deductCredits, reserve)))).every(r => r.statusCode === 200))
  assert.equal((await User.findById(A)).credits, 90)
  const settle = { action: 'settle', requestId, agent: 'chat', outcome: 'success' }
  assert.ok((await Promise.all(Array.from({ length: 12 }, () => invoke(auth.deductCredits, settle)))).every(r => r.statusCode === 200))
  assert.equal((await User.findById(A)).credits, 99)
  assert.equal((await invoke(auth.deductCredits, { ...settle, outcome: 'failure' })).statusCode, 409)
  const failed = randomUUID()
  await invoke(auth.deductCredits, { action: 'reserve', requestId: failed, agent: 'coding' })
  await Promise.all(Array.from({ length: 12 }, () => invoke(auth.deductCredits, { action: 'settle', requestId: failed, outcome: 'failure' })))
  assert.equal((await User.findById(A)).credits, 99)
})

test('payment grant receipt and balances are atomic even with parallel grant retries', async t => {
  const { User } = await database(t); const auth = createAuthHandlers({ User, redis: cache() })
  const results = await Promise.all(Array.from({ length: 25 }, () => invoke(auth.updateUserPayment, { orderId: 'order_Grant001', plan: 'starter' })))
  assert.ok(results.every(r => r.statusCode === 200))
  const user = await User.findById(A)
  assert.equal(user.credits, 600); assert.equal(user.totalCredits, 600); assert.equal(user.creditGrants.length, 1)
  assert.equal((await invoke(auth.updateUserPayment, { orderId: 'order_Grant001', plan: 'pro' })).statusCode, 409)
  assert.equal((await invoke(auth.updateUserPayment, { orderId: 'order_Grant002', plan: 'starter', credits: 90000 })).statusCode, 400)
  assert.equal((await invoke(auth.updateUserPayment, { orderId: 'order_Grant002', plan: 'starter', userId: B })).statusCode, 400)
})

test('two active sessions read current Mongo balances and never expose grant/reservation ledgers', async t => {
  const { User } = await database(t), redis = cache()
  const auth = createAuthHandlers({ User, redis, verifyToken: async () => ({ uid: 'isolated-a', name: 'Test account' }) })
  const first = await invoke(auth.login, { token: 'isolated-token' }), second = await invoke(auth.login, { token: 'isolated-token' })
  assert.equal(first.statusCode, 200); assert.equal(second.statusCode, 200)
  assert.notEqual(first.cookies[0][1], second.cookies[0][1])
  await invoke(auth.deductCredits, { action: 'reserve', requestId: randomUUID(), agent: 'chat' })
  for (const login of [first, second]) {
    const session = JSON.parse(await redis.get(`session-${login.cookies[0][1]}`))
    const account = await invoke(auth.account, {}, session.userId)
    assert.equal(account.body.credits, 99); assert.equal(account.body.creditReservations, undefined); assert.equal(account.body.creditGrants, undefined)
  }
})

test('new Firebase accounts use verified identity and server defaults, never client plan/role/credits', async t => {
  const { User } = await database(t)
  const auth = createAuthHandlers({ User, redis: cache(), verifyToken: async () => ({ uid: 'isolated-new-user', name: 'Verified profile' }) })
  const result = await invoke(auth.login, { token: 'isolated-token', userId: B, plan: 'pro', credits: 90000, role: 'admin', name: 'forged' })
  assert.equal(result.statusCode, 200); assert.notEqual(result.body._id, B)
  assert.equal(result.body.credits, 100); assert.equal(result.body.plan, 'free'); assert.equal(result.body.name, 'Verified profile')
  const user = await User.findById(result.body._id); assert.equal(user.role, undefined)
})
