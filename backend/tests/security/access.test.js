import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { createAuthHandlers } from '../../services/auth/controllers/auth.handlers.js'
import { createChatHandlers } from '../../services/chat/controllers/chat.handlers.js'
import { publicAuthOnly } from '../../gateway/utils/authProxy.js'
import { proxyWithHeader } from '../../gateway/utils/proxyWithHeader.js'
import { sessionMiddleware } from '../../shared/security/session.js'
import { getCurrentUser } from '../../gateway/controllers/user.controller.js'
import { database, cache, express, serve, A, B } from './helpers.js'

test('HTTP authorization boundaries, Firebase/session lifecycle, ownership and multi-session balances', async t => {
  const models = await database(t), redis = cache(), token = () => randomBytes(32).toString('hex')
  const tokens = { gateway: token(), agent: token(), billing: token() }
  const old = Object.fromEntries(['SERVICE_AUTH_KEYS', 'SERVICE_AUTH_TOKEN', 'AUTH_SERVICE'].map(key => [key, process.env[key]]))
  t.after(() => { for (const key of ['SERVICE_AUTH_KEYS', 'SERVICE_AUTH_TOKEN', 'AUTH_SERVICE']) {
    if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key]
  } })
  process.env.SERVICE_AUTH_KEYS = JSON.stringify(tokens); process.env.SERVICE_AUTH_TOKEN = tokens.gateway
  const auth = createAuthHandlers({ ...models, redis, verifyToken: async value => {
    if (value !== 'isolated-google-token') throw Object.assign(new Error('Isolated invalid token'), { code: 'auth/invalid-id-token' })
    return { uid: 'isolated-a', name: 'Synthetic account' }
  } })
  const chat = createChatHandlers(models)
  let paymentCalls = 0
  mock.module(new URL('../../services/auth/controllers/auth.controller.js', import.meta.url), { exports: auth })
  mock.module(new URL('../../services/chat/controllers/chat.controller.js', import.meta.url), { exports: chat })
  mock.module(new URL('../../services/billing/controllers/billing.controller.js', import.meta.url), { exports: {
    createOrder: (_req, res) => { paymentCalls++; res.json({ isolated: true }) },
    verifyPayment: (_req, res) => { paymentCalls++; res.json({ isolated: true }) },
  } })
  const authRouter = (await import('../../services/auth/routes/auth.route.js')).default
  const chatRouter = (await import('../../services/chat/routes/chat.routes.js')).default
  const billingRouter = (await import('../../services/billing/routes/billing.route.js')).default
  const authApp = express(); authApp.use(express.json()); authApp.use(authRouter)
  const authURL = await serve(t, authApp); process.env.AUTH_SERVICE = authURL
  const chatApp = express(); chatApp.use(express.json()); chatApp.use(chatRouter)
  const chatURL = await serve(t, chatApp)
  const billingApp = express(); billingApp.use(express.json()); billingApp.use(billingRouter)
  const billingURL = await serve(t, billingApp)
  const require = createRequire(new URL('../../gateway/package.json', import.meta.url))
  const gateway = express(), proxy = require('express-http-proxy')
  gateway.use(require('cookie-parser')())
  gateway.use('/api/auth', publicAuthOnly, proxy(authURL))
  gateway.get('/api/me', sessionMiddleware(redis), getCurrentUser)
  gateway.use('/api/chat', sessionMiddleware(redis), proxyWithHeader(chatURL))
  const base = await serve(t, gateway)
  const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const internal = (caller, userId = A) => ({ 'x-service-name': caller, 'x-service-token': tokens[caller], 'x-user-id': userId })

  await t.test('browser identity/service headers cannot bypass the gateway session boundary', async () => {
    assert.equal((await fetch(`${base}/api/chat/get-conversations`, { headers: internal('gateway') })).status, 401)
    assert.equal((await fetch(`${base}/api/me`, { headers: { ...internal('gateway'), cookie: `session=${randomUUID()}` } })).status, 401)
  })

  await t.test('public mutation paths are denied even with forged service headers', async () => {
    for (const path of ['update-plan', 'deduct-credits', 'account']) {
      const result = await post(`${base}/api/auth/${path}`, { plan: 'pro', credits: 100000, userId: B }, internal('billing'))
      assert.equal(result.status, 404)
    }
    assert.equal((await models.User.findById(B)).credits, 100)
  })
  await t.test('direct internal endpoints require correct credentials AND caller capability', async () => {
    for (const headers of [{}, { 'x-user-id': A }, { ...internal('billing'), 'x-service-token': 'forged'.repeat(10) }, internal('gateway'), internal('agent')]) {
      assert.equal((await post(`${authURL}/update-plan`, { orderId: 'order_Access001', plan: 'starter' }, headers)).status, 403)
    }
    assert.equal((await post(`${authURL}/deduct-credits`, { requestId: randomUUID(), action: 'reserve', agent: 'chat' }, internal('billing'))).status, 403)
    assert.equal((await fetch(`${chatURL}/get-conversations`, { headers: { cookie: 'session=forged' } })).status, 403)
    assert.equal((await post(`${authURL}/update-plan`, { orderId: 'order_Access001', plan: 'starter' }, internal('billing'))).status, 200)
  })
  await t.test('payment routes reject direct browsers and non-gateway service callers before provider work', async () => {
    for (const path of ['create', 'verify']) for (const headers of [{}, internal('agent'), internal('billing')]) {
      assert.equal((await post(`${billingURL}/${path}`, { plan: 'starter' }, headers)).status, 403)
    }
    assert.equal(paymentCalls, 0)
    assert.equal((await post(`${billingURL}/create`, { plan: 'starter' }, internal('gateway'))).status, 200)
  })

  let cookieA, secondCookie
  await t.test('Google login derives identity from verified token and retains secure cookie flags', async () => {
    assert.equal((await post(`${base}/api/auth/login`, { token: 'invalid' })).status, 401)
    const login = await post(`${base}/api/auth/login`, { token: 'isolated-google-token', userId: B, role: 'admin', credits: 90000 })
    assert.equal(login.status, 200); assert.equal((await login.json())._id, A)
    const header = login.headers.get('set-cookie'); assert.match(header, /HttpOnly/); assert.match(header, /Secure/); assert.match(header, /SameSite=None/)
    cookieA = header.split(';')[0]
    const second = await post(`${base}/api/auth/login`, { token: 'isolated-google-token' }); secondCookie = second.headers.get('set-cookie').split(';')[0]
  })
  await t.test('both active sessions read authoritative balances despite old cached profile values', async () => {
    await models.User.updateOne({ _id: A }, { $set: { credits: 37 } })
    for (const cookie of [cookieA, secondCookie]) {
      const result = await fetch(`${base}/api/me`, { headers: { cookie } })
      assert.equal(result.status, 200); const account = await result.json(); assert.equal(account.credits, 37); assert.equal(account.creditGrants, undefined)
    }
  })

  const mine = await models.Conversation.create({ userId: A }), foreign = await models.Conversation.create({ userId: B })
  await models.Message.create({ conversationId: foreign._id, role: 'assistant', content: 'Synthetic private B text' })
  await t.test('cross-account reads, updates, writes and agent authorization return not found', async () => {
    assert.equal((await fetch(`${base}/api/chat/get-messages/${foreign._id}`, { headers: { cookie: cookieA } })).status, 404)
    assert.equal((await post(`${base}/api/chat/update-conversation`, { id: String(foreign._id), title: 'forged', userId: B }, { cookie: cookieA })).status, 404)
    assert.equal((await post(`${chatURL}/save-message`, { conversationId: String(foreign._id), role: 'user', content: 'forged' }, internal('agent'))).status, 404)
    assert.equal((await fetch(`${chatURL}/authorize/${foreign._id}`, { headers: internal('agent') })).status, 404)
    assert.equal((await models.Message.countDocuments({ conversationId: foreign._id })), 1)
  })
  await t.test('gateway strips forged account/service identities and only owned history is returned', async () => {
    const result = await fetch(`${base}/api/chat/get-conversations`, { headers: { cookie: cookieA, ...internal('agent', B) } })
    assert.equal(result.status, 200); const rows = await result.json()
    assert.deepEqual(rows.map(row => row._id), [String(mine._id)])
    assert.equal((await post(`${base}/api/chat/save-message`, { conversationId: String(mine._id), role: 'assistant', content: 'fake' }, { cookie: cookieA })).status, 403)
    assert.equal((await post(`${chatURL}/save-message`, { conversationId: String(mine._id), role: 'user', content: 'owned', userId: B }, internal('agent'))).status, 200)
    assert.equal((await fetch(`${base}/api/chat/get-messages/${mine._id}`, { headers: { cookie: cookieA } })).status, 200)
  })
  await t.test('logout revokes only that session and preserves another active session', async () => {
    assert.equal((await fetch(`${base}/api/auth/logout`, { headers: { cookie: cookieA } })).status, 200)
    assert.equal((await fetch(`${base}/api/me`, { headers: { cookie: cookieA } })).status, 401)
    assert.equal((await fetch(`${base}/api/me`, { headers: { cookie: secondCookie } })).status, 200)
  })
})
