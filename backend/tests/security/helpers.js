import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import User from '../../services/auth/models/user.model.js'
import Payment from '../../services/billing/models/payment.model.js'
import Conversation from '../../services/chat/models/coversation.model.js'
import Message from '../../services/chat/models/message.model.js'

const require = createRequire(new URL('../../services/auth/package.json', import.meta.url))
export const express = require('express')
export const A = 'a'.repeat(24), B = 'b'.repeat(24)
export function response() {
  return { statusCode: 200, body: null, cookies: [], status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this }, cookie(...args) { this.cookies.push(args) }, clearCookie(...args) { this.cleared = args } }
}
export async function invoke(handler, body = {}, userId = A, extra = {}) {
  const res = response()
  await handler({ body, identity: { userId }, params: {}, headers: {}, ...extra }, res)
  return res
}
export async function database(t) {
  // Never fall back to a production MONGODB_URI or an arbitrary host/database.
  const uri = process.env.SECURITY_TEST_MONGODB_URI
  assert.ok(uri, 'Set SECURITY_TEST_MONGODB_URI to an isolated loopback test database.')
  const url = new URL(uri)
  assert.equal(url.protocol, 'mongodb:'); assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname))
  assert.ok(/^\/sutrai_security_test_[a-z\d_]+$/i.test(url.pathname)); assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(url.search, '')
  const name = `${url.pathname.slice(1)}_${randomUUID().replaceAll('-', '')}`
  const connections = new Map()
  const model = async original => {
    let connection = connections.get(original.base)
    if (!connection) { connection = await original.base.createConnection(uri, { dbName: name, serverSelectionTimeoutMS: 5000 }).asPromise(); connections.set(original.base, connection) }
    return connection.models[original.modelName] || connection.model(original.modelName, original.schema)
  }
  t.after(async () => { for (const c of connections.values()) { await c.dropDatabase(); await c.close() } })
  const models = { User: await model(User), Payment: await model(Payment), Conversation: await model(Conversation), Message: await model(Message) }
  await Promise.all(Object.values(models).map(m => m.init()))
  await models.User.create([{ _id: A, firebaseUid: 'isolated-a', credits: 100, totalCredits: 100 }, { _id: B, firebaseUid: 'isolated-b', credits: 100, totalCredits: 100 }])
  return models
}
export function cache() {
  const entries = new Map()
  return { entries, get: async key => entries.get(key), set: async (key, value) => { entries.set(key, value) }, del: async key => { entries.delete(key) } }
}
export async function serve(t, app) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise(done => server.on('listening', done))
  t.after(() => new Promise(done => server.close(done)))
  return `http://127.0.0.1:${server.address().port}`
}
