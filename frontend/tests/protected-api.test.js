import test from 'node:test'
import assert from 'node:assert/strict'
import api from '../utils/axios.js'
import { store } from '../src/redux/store.js'
import { sessionConfirmed, sessionEnded, sessionChecking, sessionFailed, logoutStarted } from '../src/redux/userSlice.js'

function response(config, data = {}, status = 200) {
  return { config, data, status, statusText: 'test', headers: {} }
}

test('API session boundaries', async t => {
  const original = api.defaults.adapter
  try {
    await t.test('guests, checking sessions and verification failures never reach protected endpoints', async () => {
      let calls = 0
      api.defaults.adapter = async config => { calls++; return response(config) }
      for (const action of [sessionEnded(), sessionChecking(), sessionFailed()]) {
        store.dispatch(action)
        for (const url of ['/api/chat/create-conversation', '/api/agent/chat', '/api/billing/create']) {
          await assert.rejects(api.get(url), { code: 'AUTH_REQUIRED' })
        }
      }
      assert.equal(calls, 0)
      await api.get('/api/me')
      await api.post('/api/auth/login')
      assert.equal(calls, 2)
    })
    await t.test('confirmed sessions can access protected resources', async () => {
      store.dispatch(sessionConfirmed({ _id: 'one' }))
      api.defaults.adapter = async config => response(config, { ok: true })
      assert.equal((await api.get('/api/chat/get-conversations')).data.ok, true)
    })
    await t.test('an expired session removes access and requests sign-in', async () => {
      api.defaults.adapter = async config => { throw Object.assign(new Error('expired'), { config, response: response(config, { message: 'session expired' }, 400) }) }
      await assert.rejects(api.get('/api/chat/get-conversations'))
      assert.equal(store.getState().user.status, 'guest')
      assert.equal(store.getState().user.dialogMode, 'login')
    })
    await t.test('credit failures do not log out the user', async () => {
      store.dispatch(sessionConfirmed({ _id: 'one' }))
      api.defaults.adapter = async config => { throw Object.assign(new Error('credits'), { config, response: response(config, { message: 'Not enough credits.' }, 400) }) }
      await assert.rejects(api.get('/api/agent/chat'))
      assert.equal(store.getState().user.status, 'authenticated')
    })
    await t.test('late successful responses from a previous account are discarded', async () => {
      api.defaults.adapter = async config => { store.dispatch(logoutStarted()); return response(config, { private: true }) }
      await assert.rejects(api.get('/api/chat/get-conversations'), { code: 'SESSION_CHANGED' })
    })
    await t.test('late auth failures cannot log out a newer account', async () => {
      store.dispatch(sessionConfirmed({ _id: 'one' }))
      api.defaults.adapter = async config => {
        store.dispatch(sessionConfirmed({ _id: 'two' }))
        throw Object.assign(new Error('old request'), { config, response: response(config, { message: 'session expired' }, 400) })
      }
      await assert.rejects(api.get('/api/chat/get-conversations'))
      assert.equal(store.getState().user.userData._id, 'two')
      assert.equal(store.getState().user.status, 'authenticated')
    })
  } finally {
    api.defaults.adapter = original
    store.dispatch(sessionEnded())
  }
})
