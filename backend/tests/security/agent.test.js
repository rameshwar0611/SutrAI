import test from 'node:test'
import assert from 'node:assert/strict'
import { createAgentHandler, MODES } from '../../services/agent/controllers/agent.handler.js'
import { createAuthHandlers } from '../../services/auth/controllers/auth.handlers.js'
import { database, cache, invoke, A } from './helpers.js'

async function fixture(t) {
  const { User } = await database(t), auth = createAuthHandlers({ User, redis: cache() })
  const calls = { graph: 0, saved: [], cleanup: [], fail: false, settlementFailure: false }
  const call = async payload => {
    const { userId, ...body } = payload
    const result = await invoke(auth.deductCredits, body, userId)
    if (result.statusCode !== 200) throw Object.assign(new Error(result.body.message), { status: result.statusCode })
    return result.body
  }
  const handler = createAgentHandler({
    authorize: async () => {}, saveMessage: async body => { calls.saved.push(body) },
    reserve: payload => call({ ...payload, action: 'reserve' }),
    settle: payload => { if (calls.settlementFailure) throw new Error('Unknown settlement'); return call({ ...payload, action: 'settle' }) },
    graph: { invoke: async state => { calls.graph++; if (calls.fail) throw new Error('Isolated provider failure'); return { ...state, agent: state.agent === 'auto' ? 'chat' : state.agent, aiResponse: 'Isolated answer', artifacts: [] } } },
    addMemory: async () => {}, cleanup: async path => { calls.cleanup.push(path) },
  })
  return { User, handler, calls }
}

test('all seven modes refuse insufficient-credit requests before any model/search/generation', async t => {
  const f = await fixture(t); await f.User.updateOne({ _id: A }, { $set: { credits: 0 } })
  for (const agent of MODES) assert.equal((await invoke(f.handler, { prompt: 'Test', agent, conversationId: A })).statusCode, 400)
  assert.equal(f.calls.graph, 0); assert.equal(f.calls.saved.length, 0)
})

test('explicit Chat works with one credit; Auto requires its documented maximum reservation', async t => {
  const f = await fixture(t); await f.User.updateOne({ _id: A }, { $set: { credits: 1 } })
  assert.equal((await invoke(f.handler, { prompt: 'Test', agent: 'auto', conversationId: A })).statusCode, 400)
  assert.equal((await invoke(f.handler, { prompt: 'Test', agent: 'chat', conversationId: A })).statusCode, 200)
  assert.equal((await f.User.findById(A)).credits, 0)
})

test('Auto refunds its unused reservation; Search reserves the combined six-credit workflow', async t => {
  const f = await fixture(t)
  assert.equal((await invoke(f.handler, { prompt: 'Test', agent: 'auto', conversationId: A })).statusCode, 200)
  assert.equal((await f.User.findById(A)).credits, 99)
  assert.equal((await invoke(f.handler, { prompt: 'Test', agent: 'search', conversationId: A })).statusCode, 200)
  assert.equal((await f.User.findById(A)).credits, 93)
})

test('provider failure refunds once and removes uploaded temporary files', async t => {
  const f = await fixture(t); f.calls.fail = true
  const result = await invoke(f.handler, { prompt: 'Test', agent: 'auto', conversationId: A }, A, { file: { path: '/isolated/upload' } })
  assert.equal(result.statusCode, 503); assert.equal((await f.User.findById(A)).credits, 100)
  assert.deepEqual(f.calls.cleanup, ['/isolated/upload']); assert.equal(f.calls.saved.length, 1)
  assert.equal(JSON.stringify(result.body).includes('Isolated provider failure'), false)
})

test('unknown post-generation settlement does not refund blindly or return success', async t => {
  const f = await fixture(t); f.calls.settlementFailure = true
  const result = await invoke(f.handler, { prompt: 'Test', agent: 'auto', conversationId: A })
  assert.equal(result.statusCode, 503)
  const user = await f.User.findById(A); assert.equal(user.credits, 90); assert.equal(user.creditReservations[0].state, 'reserved')
})

test('forged internal workflow identifiers and malformed prompt/conversation are rejected before generation', async t => {
  const f = await fixture(t)
  for (const body of [{ prompt: 'Test', agent: 'pdfRag', conversationId: A }, { prompt: 'Test', agent: 'chat', conversationId: 'invalid' },
    { prompt: { $ne: '' }, agent: 'chat', conversationId: A }]) assert.equal((await invoke(f.handler, body)).statusCode, 400)
  assert.equal(f.calls.graph, 0)
})

test('unowned conversations stop the agent before reservation, persistence or AI work', async () => {
  const calls = []
  const handler = createAgentHandler({
    authorize: async () => { throw Object.assign(new Error('Conversation not found.'), { status: 404 }) },
    graph: { invoke: async () => calls.push('AI') }, reserve: async () => calls.push('reserve'),
    saveMessage: async () => calls.push('write'), cleanup: async () => calls.push('cleanup'),
  })
  const result = await invoke(handler, { prompt: 'Test', agent: 'chat', conversationId: A }, A, { file: { path: '/isolated' } })
  assert.equal(result.statusCode, 404); assert.deepEqual(calls, ['cleanup'])
})

test('failed refund acknowledgement reports a reviewable credit outcome rather than swallowing it', async t => {
  const f = await fixture(t); f.calls.fail = true; f.calls.settlementFailure = true
  const result = await invoke(f.handler, { prompt: 'Test', agent: 'auto', conversationId: A })
  assert.equal(result.statusCode, 503); assert.equal(result.body.message, 'Credit operation requires review.')
  assert.equal((await f.User.findById(A)).creditReservations[0].state, 'reserved')
})
