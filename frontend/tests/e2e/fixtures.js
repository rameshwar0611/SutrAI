import { test as base, expect } from '@playwright/test'

// Fixtures are test-only. Production has no test login, fake account, or provider bypass.
export const fixtureUser = { _id: 'test-account-a', name: 'Navigation Tester', plan: 'free', credits: 37, totalCredits: 100 }
export const fixtureHistory = [
  { _id: 'test-conversation-a', title: 'Redis cache design' },
  { _id: 'test-conversation-b', title: 'Review an Express endpoint' },
]

export const test = base.extend({
  api: [async ({ page, baseURL }, use) => {
    const localOrigin = new URL(baseURL).origin
    const state = {
      account: null, meStatus: null, history: [...fixtureHistory], historyStatus: 200,
      historyGate: null, requests: [], unexpected: [], external: [], browserErrors: [],
      messages: [{ _id: 'test-message', role: 'assistant', content: 'Existing conversation content from the isolated test fixture.', images: [] }],
      messagesByConversation: {}, messagesStatus: 200, messagesGate: null, messageGates: {}, completedMessages: [],
      allowChat: false, sent: [], sendStatus: 200, sendGate: null, sendResult: null, assets: {},
      allowAuth: false, authLoginStatus: 200, authLoginUser: fixtureUser, authLoginGate: null, authPayloads: [], meGate: null,
    }
    page.on('pageerror', error => state.browserErrors.push(error.message))
    // Context routing also covers resource requests from opaque srcdoc iframes.
    await page.context().route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin !== localOrigin) {
        if (url.href === 'https://checkout.razorpay.com/v1/checkout.js') {
          await route.fulfill({ contentType: 'application/javascript', body: '/* Checkout disabled in isolated browser tests. */' })
          return
        }
        state.external.push(url.origin)
        await route.abort('blockedbyclient')
        return
      }
      if (state.assets[url.pathname]) { await route.fulfill(state.assets[url.pathname]); return }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return }
      state.requests.push({ method: request.method(), path: url.pathname })
      const json = (status, body) => route.fulfill({ status, json: body })
      if (request.method() === 'GET' && url.pathname === '/api/me') {
        const account = state.account
        const status = state.meStatus || (account ? 200 : 401)
        if (state.meGate) await state.meGate
        await json(status, account || { message: 'Unauthorized' })
      } else if (state.allowAuth && request.method() === 'POST' && url.pathname === '/api/auth/login') {
        state.authPayloads.push(request.postDataJSON())
        if (state.authLoginGate) await state.authLoginGate
        if (state.authLoginStatus === 200) state.account = state.authLoginUser
        await json(state.authLoginStatus, { message: state.authLoginStatus === 200 ? 'Login accepted by test API' : 'Login unavailable in test API' })
      } else if (request.method() === 'GET' && url.pathname === '/api/chat/get-conversations') {
        if (state.historyGate) await state.historyGate
        await json(state.historyStatus, state.historyStatus === 200 ? state.history : { message: 'Unavailable' })
      } else if (request.method() === 'GET' && url.pathname.startsWith('/api/chat/get-messages/')) {
        const id = url.pathname.split('/').at(-1)
        const gate = state.messageGates[id] || state.messagesGate
        if (gate) await gate
        await json(state.messagesStatus, state.messagesStatus === 200 ? state.messagesByConversation[id] || state.messages : { message: 'Unavailable' })
        state.completedMessages.push(id)
      } else if (state.allowChat && request.method() === 'GET' && url.pathname === '/api/chat/create-conversation') {
        await json(200, { _id: 'test-created-conversation', title: 'New Chat' })
      } else if (state.allowChat && request.method() === 'POST' && url.pathname === '/api/chat/update-conversation') {
        await json(200, { success: true })
      } else if (state.allowChat && request.method() === 'POST' && url.pathname === '/api/agent/chat') {
        const body = request.postData()
        state.sent.push(body)
        if (state.sendGate) await state.sendGate
        if (state.sendStatus === 200 && state.sendResult) {
          const prompt = /name="prompt"\r\n\r\n([\s\S]*?)\r\n--/.exec(body)?.[1] || ''
          state.messages = [...state.messages,
            { _id: `test-user-${state.sent.length}`, role: 'user', content: prompt },
            { _id: `test-assistant-${state.sent.length}`, role: 'assistant', content: state.sendResult.answer, images: state.sendResult.images || [], artifacts: state.sendResult.artifacts || [] }]
          await json(200, state.sendResult)
        } else await json(state.sendStatus === 200 ? 500 : state.sendStatus, { message: 'Request failed in isolated test.' })
      } else if (request.method() === 'GET' && url.pathname === '/api/auth/logout') {
        state.account = null
        await json(200, { message: 'Logged out' })
      } else {
        state.unexpected.push(`${request.method()} ${url.pathname}`)
        await json(500, { message: 'No mock defined; real backend access is prohibited.' })
      }
    })
    await use(state)
    expect(state.unexpected, 'All API calls must be explicitly mocked').toEqual([])
    expect(state.external, 'No external network is permitted').toEqual([])
    expect(state.browserErrors, 'No browser exceptions').toEqual([])
  }, { auto: true }],
})

export { expect }

export async function selectMode(page, id) {
  const labels = { auto: 'Auto', chat: 'Chat', coding: 'Coding', pdf: 'PDF', ppt: 'PPT', vision: 'Vision', search: 'Search' }
  await page.getByRole('button', { name: /^AI mode:/ }).click()
  await page.getByRole('menuitemradio', { name: labels[id], exact: true }).click()
}
