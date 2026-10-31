import { test, expect, fixtureUser } from './fixtures.js'
import { mockBilling, providerSuccess, providerDismiss, providerFailure } from './billing-fixtures.js'
import { artifactMessages } from './artifact-fixtures.js'
import { pdfFile, mockGooglePopup } from './input-fixtures.js'

test.use({ deviceScaleFactor: 2 })
const dialog = page => page.getByRole('dialog', { name: /Plans & Credits|Review your purchase/ })
const open = async page => page.getByRole('banner').getByRole('button', { name: 'Plans and credits', exact: true }).click()
async function prepare(page, api) { api.account = { ...fixtureUser }; await page.goto('/'); await open(page); await expect(dialog(page)).toBeVisible() }
async function begin(page, plan = 'Starter') {
  await dialog(page).getByRole('button', { name: `Choose ${plan}`, exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Continue to Razorpay', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__razorpay.instances.length)).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => window.__razorpay.nativeModalAtOpen.length)).toBeGreaterThan(0)
}

test('real prices, review, backend verification and authoritative balance refresh', async ({ page, api }, info) => {
  const payment = await mockBilling(page, api)
  await prepare(page, api)
  await expect(dialog(page).getByText('37', { exact: true })).toBeVisible()
  await expect(dialog(page).getByText('₹199', { exact: true })).toBeVisible()
  await expect(dialog(page).getByText('₹499', { exact: true })).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-plans.png') })
  await dialog(page).getByRole('button', { name: 'Compare plans', exact: true }).click()
  await expect(dialog(page).getByRole('table')).toContainText('Starting allocation')
  await dialog(page).getByRole('button', { name: 'Choose Pro', exact: true }).click()
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-review.png') })
  await dialog(page).getByRole('button', { name: 'Continue to Razorpay', exact: true }).dblclick()
  await expect.poll(() => payment.orders.length).toBe(1)
  await expect.poll(() => page.evaluate(() => window.__razorpay.instances.length)).toBe(1)
  expect(await page.evaluate(() => window.__razorpay.instances[0].options.name)).toBe('SutrAI')
  expect(await page.evaluate(() => window.__razorpay.instances[0].options.amount)).toBe(49900)
  await expect.poll(() => page.evaluate(() => window.__razorpay.nativeModalAtOpen)).toEqual([false])
  let release; payment.verifyGate = new Promise(resolve => { release = resolve })
  payment.accountAfterPayment = { ...fixtureUser, plan: 'pro', credits: 998, totalCredits: 1100, planExpiresAt: '2026-11-30T12:00:00Z' }
  try {
    await providerSuccess(page); await providerSuccess(page); await providerDismiss(page)
    await expect(dialog(page).getByText('Confirming your payment…', { exact: true })).toBeVisible()
    await expect(dialog(page).getByText('Payment confirmed.', { exact: true })).toHaveCount(0)
    await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-processing.png') })
  } finally { release() }
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmed.', exact: true })).toBeVisible()
  await expect(dialog(page).getByText('998', { exact: true })).toBeVisible()
  expect(payment.verifications).toHaveLength(1)
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-success.png') })
})

test('cancel and provider failure retry the same order; later provider success wins', async ({ page, api }, info) => {
  const payment = await mockBilling(page, api); await prepare(page, api); await begin(page)
  await providerDismiss(page)
  await expect(dialog(page).getByRole('heading', { name: 'Checkout closed.', exact: true })).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-cancelled.png') })
  await dialog(page).getByRole('button', { name: 'Reopen same checkout', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__razorpay.instances.length)).toBe(2)
  await providerFailure(page); await providerDismiss(page)
  await expect(dialog(page).getByRole('heading', { name: 'Payment could not be completed.', exact: true })).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-failure.png') })
  await dialog(page).getByRole('button', { name: 'Reopen same checkout', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__razorpay.instances.length)).toBe(3)
  await providerFailure(page); await providerSuccess(page)
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmed.', exact: true })).toBeVisible()
  expect(payment.orders).toHaveLength(1); expect(payment.verifications).toHaveLength(1)
})

test('uncertain verification never replays or creates another payment after closing/reopening', async ({ page, api }, info) => {
  const payment = await mockBilling(page, api); payment.verifyStatus = 500
  await prepare(page, api); await begin(page); await providerSuccess(page)
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmation unavailable.', exact: true })).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-uncertain.png') })
  await dialog(page).getByRole('button', { name: 'Back to workspace', exact: true }).click(); await open(page)
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmation unavailable.', exact: true })).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: /Continue to Razorpay|Choose Starter|Reopen same checkout/ })).toHaveCount(0)
  await providerSuccess(page); expect(payment.orders).toHaveLength(1); expect(payment.verifications).toHaveLength(1)
})

test('confirmed payment with failed account read retries only GET account', async ({ page, api }, info) => {
  const payment = await mockBilling(page, api); await prepare(page, api); await begin(page)
  api.meStatus = 500; await providerSuccess(page)
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmed; balance unavailable.', exact: true })).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-balance-error.png') })
  api.meStatus = null; api.account = { ...fixtureUser, credits: 512, totalCredits: 600, plan: 'starter' }
  await dialog(page).getByRole('button', { name: 'Retry balance check', exact: true }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmed.', exact: true })).toBeVisible()
  await expect(dialog(page).getByText('512', { exact: true })).toBeVisible()
  expect(payment.orders).toHaveLength(1); expect(payment.verifications).toHaveLength(1)
})

test('changed server quote requires explicit review and reuses its order', async ({ page, api }) => {
  const payment = await mockBilling(page, api); payment.quoteAmount = 219; payment.quoteCredits = 550
  await prepare(page, api)
  await dialog(page).getByRole('button', { name: 'Choose Starter', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Continue to Razorpay', exact: true }).click()
  await expect(dialog(page).getByText(/The server quote changed/)).toBeVisible()
  await expect(dialog(page).getByText('₹219', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.__razorpay.instances.length)).toBe(0)
  await dialog(page).getByRole('button', { name: 'Continue to Razorpay', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__razorpay.instances.length)).toBe(1)
  expect(payment.orders).toHaveLength(1)
})

test('refresh and billing layout retain real conversation, artifacts, draft, mode and File', async ({ page, api, isMobile }) => {
  await mockBilling(page, api); api.account = fixtureUser; api.messages = artifactMessages()
  await page.goto('/')
  await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
  await page.getByRole('button', { name: 'Redis cache design', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View code', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep my unsent draft')
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles(pdfFile)
  const node = await page.getByLabel('Attach PDF or image', { exact: true }).elementHandle()
  const state = await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState())
  api.account = { ...fixtureUser, credits: 22 }
  await open(page)
  await expect(dialog(page).getByText('22', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  const after = await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState())
  expect(after.user.sessionEpoch).toBe(state.user.sessionEpoch); expect(after.message).toEqual(state.message)
  expect(after.conversation).toEqual(state.conversation); expect(after.workspace).toEqual(state.workspace)
  expect(await node.evaluate(node => node.isConnected && node.files[0].name === 'product-brief.pdf')).toBe(true)
  await expect(page.getByRole('banner').getByRole('button', { name: 'Plans and credits', exact: true })).toBeFocused()
})

test('zero credits, invalid values and mobile scrolling/keyboard dismissal remain usable', async ({ page, api }, info) => {
  const originalViewport = page.viewportSize()
  await mockBilling(page, api); api.account = { ...fixtureUser, name: 'A very long account name '.repeat(12), credits: 0 }
  await page.goto('/'); await page.getByRole('button', { name: 'View plans & credits', exact: true }).click()
  await expect(dialog(page).getByText(/No available credits. Choose/)).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-insufficient.png') })
  for (const [width, height] of [[320, 568], [390, 320], [1440, 960]]) {
    await page.setViewportSize({ width, height }); await dialog(page).getByRole('button', { name: 'Choose Pro', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog(page).getByRole('button', { name: 'Choose Pro', exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.keyboard.press('Escape'); api.account = { ...api.account, credits: -5, totalCredits: null, plan: 'unknown' }
  await page.setViewportSize(originalViewport)
  await open(page); await expect(dialog(page).getByText(/Some account balances are unavailable/)).toBeVisible()
  await expect(dialog(page).getByRole('progressbar')).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', path: info.outputPath('phase5-invalid-balance.png') })
})

test('account switch invalidates checkout and ignores late callbacks', async ({ page, api }) => {
  const payment = await mockBilling(page, api); await mockGooglePopup(page); api.allowAuth = true
  await prepare(page, api); await begin(page)
  await page.evaluate(() => { window.__oldPayment = window.__razorpay.instances[0] })
  if (!await page.getByRole('button', { name: 'Open conversation history', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open account and history controls', exact: true }).click()
  // The account action is reachable through the normal mobile/desktop history UI.
  if (await page.getByRole('button', { name: 'Open conversation history', exact: true }).isVisible()) await page.getByRole('button', { name: 'Open conversation history', exact: true }).click()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__razorpay.closed)).toBe(1)
  api.authLoginUser = { ...fixtureUser, _id: 'test-account-b', credits: 11 }; api.history = []
  await page.getByRole('banner').getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click(); await page.evaluate(() => window.__authPopup.resolve())
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeHidden()
  await page.evaluate(() => window.__oldPayment.options.handler({ razorpay_order_id: 'order_isolated_1', razorpay_payment_id: 'late', razorpay_signature: 'late' }))
  expect(payment.verifications).toHaveLength(0)
  await open(page); await expect(dialog(page).getByText('11', { exact: true })).toBeVisible()
})

test('order preparation error retries explicitly; malformed callbacks and unaccepted verification never succeed', async ({ page, api }) => {
  const payment = await mockBilling(page, api); payment.orderStatus = 500
  await prepare(page, api); await dialog(page).getByRole('button', { name: 'Choose Starter', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Continue to Razorpay', exact: true }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Checkout preparation unavailable.', exact: true })).toBeVisible()
  payment.orderStatus = 200; await dialog(page).getByRole('button', { name: 'Retry preparation', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__razorpay.instances.length)).toBe(1)
  await providerSuccess(page, { razorpay_order_id: 'order_wrong' })
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmation unavailable.', exact: true })).toBeVisible()
  expect(payment.verifications).toHaveLength(0)
})

test('SDK failure retries the retained order without dropping the draft', async ({ page, api }) => {
  const payment = await mockBilling(page, api); await prepare(page, api)
  await page.evaluate(() => { delete window.Razorpay })
  await dialog(page).getByRole('button', { name: 'Choose Starter', exact: true }).click()
  await dialog(page).getByRole('button', { name: 'Continue to Razorpay', exact: true }).click()
  await expect(dialog(page).getByRole('heading', { name: 'Secure checkout unavailable.', exact: true })).toBeVisible()
  await page.evaluate(() => { window.Razorpay = window.__providerClass })
  await dialog(page).getByRole('button', { name: 'Reopen same checkout', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__razorpay.instances.length)).toBe(1)
  expect(payment.orders).toHaveLength(1)
})

test('an unaccepted 200 verification response remains uncertain and cannot be retried', async ({ page, api }) => {
  const payment = await mockBilling(page, api); payment.verifyMessage = 'Unknown result'
  await prepare(page, api); await begin(page); await providerSuccess(page)
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmation unavailable.', exact: true })).toBeVisible()
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmed.', exact: true })).toHaveCount(0)
  await providerSuccess(page); expect(payment.verifications).toHaveLength(1)
})

test('late account reads cannot update a different account or reset its workspace', async ({ page, api }) => {
  await mockBilling(page, api); await prepare(page, api)
  let release; api.meGate = new Promise(resolve => { release = resolve })
  api.account = { ...fixtureUser, credits: 999 }
  const before = api.requests.filter(r => r.path === '/api/me').length
  await dialog(page).getByRole('button', { name: 'Refresh account', exact: true }).click()
  await expect.poll(() => api.requests.filter(r => r.path === '/api/me').length).toBeGreaterThan(before)
  await page.evaluate(async () => {
    const { store } = await import('/src/redux/store.js')
    store.dispatch({ type: 'user/sessionConfirmed', payload: { _id: 'test-account-b', credits: 11, plan: 'free', totalCredits: 100 } })
    store.dispatch({ type: 'workspace/setDraftText', payload: 'Account B draft' })
  })
  release(); api.meGate = null
  const user = await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().user)
  expect(user.userData._id).toBe('test-account-b'); expect(user.userData.credits).toBe(11)
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Account B draft')
})

test('successful purchase from the zero-credit prompt restores focus to the preserved composer', async ({ page, api }) => {
  const payment = await mockBilling(page, api); api.account = { ...fixtureUser, credits: 0 }
  payment.accountAfterPayment = { ...fixtureUser, credits: 500, totalCredits: 600, plan: 'starter' }
  await page.goto('/')
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Do not send this automatically')
  await page.getByRole('button', { name: 'View plans & credits', exact: true }).click()
  await begin(page); await providerSuccess(page)
  await expect(dialog(page).getByRole('heading', { name: 'Payment confirmed.', exact: true })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Back to workspace', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Do not send this automatically')
  expect(api.sent).toHaveLength(0)
})
