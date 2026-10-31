import { test, expect, fixtureUser, selectMode } from './fixtures.js'

test('guest header opens both existing auth entry points without losing the composer', async ({ page, api, isMobile }, testInfo) => {
  await page.goto('/')
  const prompt = page.getByRole('textbox', { name: 'Message', exact: true })
  await prompt.fill('Keep my guest draft')
  const promptNode = await prompt.elementHandle()
  for (const [action, title] of [['Log in', 'Welcome back.'], ['Sign up', 'A space for your ideas.']]) {
    await page.getByRole('banner').getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: title })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await page.getByRole('button', { name: 'Close sign-in' }).click()
    await expect(prompt).toHaveValue('Keep my guest draft')
    expect(await promptNode.evaluate(node => node === document.getElementById('chat-prompt'))).toBe(true)
  }
  expect(api.requests.filter(request => /^\/api\/(chat|agent|billing)\//.test(request.path))).toEqual([])
  if (isMobile) {
    await prompt.focus()
    for (let index = 0; index < 26; index++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !document.activeElement.closest('#mobile-history, #desktop-history, .contour-rail'))).toBe(true)
    }
  }
  await page.screenshot({ path: testInfo.outputPath('phase1-guest.png') })
})

test('actual draft, mode and File survive a session transition without automatic Send', async ({ page, api }) => {
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true })).toBeEnabled()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep this PDF for later')
  await selectMode(page, 'pdf')
  const fileInput = page.getByLabel('Attach PDF or image', { exact: true })
  await fileInput.setInputFiles({ name: 'brief.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nTest attachment') })
  const fileNode = await fileInput.elementHandle()
  api.account = fixtureUser
  await page.evaluate(async user => {
    const { store } = await import('/src/redux/store.js')
    const { sessionConfirmed } = await import('/src/redux/userSlice.js')
    store.dispatch(sessionConfirmed(user))
  }, fixtureUser)
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep this PDF for later')
  await expect(page.getByRole('button', { name: 'Remove attachment' })).toBeVisible()
  expect(await fileNode.evaluate(node => node === document.querySelector('input[type="file"]') && node.files[0].name === 'brief.pdf')).toBe(true)
  const state = await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState())
  expect(state.workspace.mode).toBe('pdf')
  expect(state.message.messages).toEqual([])
  expect(api.requests.some(request => request.method === 'POST')).toBe(false)
})

test('desktop history uses real selection, named controls and keyboard tooltips', async ({ page, api, isMobile }, testInfo) => {
  test.skip(isMobile, 'Desktop rail behavior')
  api.account = fixtureUser
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Expand conversation history', exact: true })
  await toggle.focus()
  await expect(page.getByRole('tooltip', { name: 'Expand conversation history' })).toBeVisible()
  await toggle.press('Escape')
  await expect(page.getByRole('tooltip', { name: 'Expand conversation history' })).toBeHidden()
  await toggle.press('Enter')
  const history = page.getByRole('complementary', { name: 'Conversation history' })
  await expect(history.getByText(fixtureUser.name)).toBeVisible()
  const conversation = history.getByRole('button', { name: 'Redis cache design', exact: true })
  await conversation.focus()
  await conversation.press('Enter')
  await expect(conversation).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('banner').getByRole('heading', { name: 'Redis cache design' })).toBeVisible()
  await expect(page.getByRole('banner').getByText('1 message', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('phase1-history-desktop.png') })
  await conversation.press('Escape')
  await expect(history).toBeHidden()
  await expect(page.getByRole('button', { name: 'Expand conversation history', exact: true })).toBeFocused()
})

test('history failure can retry to a genuine empty result', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.historyStatus = 500
  await page.goto('/')
  await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
  const history = page.getByRole(isMobile ? 'dialog' : 'complementary', { name: 'Conversation history' })
  await expect(history.getByText('Unable to load conversations.', { exact: true })).toBeVisible()
  await expect(history.getByText('No conversations yet', { exact: true })).toBeHidden()
  api.historyStatus = 200
  api.history = []
  await page.getByRole('button', { name: 'Retry history' }).click()
  await expect(history.getByText('No conversations yet', { exact: true })).toBeVisible()
  expect(api.requests.filter(request => request.path === '/api/chat/get-conversations')).toHaveLength(2)
})

test('pending history is not presented as an empty account', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  let release
  api.historyGate = new Promise(resolve => { release = resolve })
  try {
    await page.goto('/')
    await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
    const history = page.getByRole(isMobile ? 'dialog' : 'complementary', { name: 'Conversation history' })
    await expect(history.getByText('Loading conversations…', { exact: true })).toBeVisible()
    await expect(history.getByText('No conversations yet', { exact: true })).toBeHidden()
  } finally { release() }
  await expect(page.getByRole('button', { name: 'Redis cache design' })).toBeVisible()
})

test('mobile history contains keyboard focus and restores it on Escape', async ({ page, api, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Mobile drawer behavior')
  api.account = fixtureUser
  await page.goto('/')
  const opener = page.getByRole('button', { name: 'Open conversation history', exact: true })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Conversation history' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Conversation history' })).toBeFocused()
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    // Chromium can focus browser chrome at the wrap boundary; it must never focus background controls.
    expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('dialog[open]'))).toBe(true)
  }
  await page.screenshot({ path: testInfo.outputPath('phase1-history-mobile.png') })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !document.activeElement.closest('#mobile-history, #desktop-history, .contour-rail'))).toBe(true)
  }
})

test('mobile drawer releases the page when crossing the desktop breakpoint', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile breakpoint behavior')
  await page.goto('/')
  await page.getByRole('button', { name: 'Open conversation history', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Conversation history' })).toBeVisible()
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.getByRole('dialog', { name: 'Conversation history' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Expand conversation history', exact: true })).toBeVisible()
})

test('logout clears private navigation and a mobile session-owned drawer', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  await page.goto('/')
  await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Redis cache design' })).toBeVisible()
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Redis cache design' })).toHaveCount(0)
  await expect(page.getByText(fixtureUser.name, { exact: true })).toHaveCount(0)
  if (isMobile) await expect(page.getByRole('dialog', { name: 'Conversation history' })).toBeHidden()
  expect(api.requests.some(request => request.path === '/api/auth/logout')).toBe(true)
})

test('layout handles long account content without page overflow at target sizes', async ({ page, api }) => {
  api.account = { ...fixtureUser, name: 'A'.repeat(180) }
  api.history[0] = { ...api.history[0], title: 'LongConversationTitle'.repeat(25) }
  await page.goto('/')
  for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1024, 768], [1440, 960]]) {
    await page.setViewportSize({ width, height })
    if (width <= 760) {
      await page.getByRole('button', { name: 'Open conversation history', exact: true }).click()
    } else {
      const expand = page.getByRole('button', { name: 'Expand conversation history', exact: true })
      if (await expand.isVisible()) await expand.click()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const topbar = await page.locator('.contour-topbar').boundingBox()
    expect(topbar.height).toBe(width <= 760 ? 58 : 64)
    if (width <= 760) await page.keyboard.press('Escape')
  }
})

test('billing presentation survives a history layout change without any payment request', async ({ page, api, isMobile }) => {
  test.skip(isMobile, 'Desktop owner lifecycle regression')
  api.account = fixtureUser
  await page.goto('/')
  await page.getByRole('banner').getByRole('button', { name: 'Plans and credits', exact: true }).click()
  await expect(page.getByText('Current Plan', { exact: true })).toBeVisible()
  const billingNode = await page.getByText('Current Plan', { exact: true }).elementHandle()
  await page.getByRole('button', { name: 'Expand conversation history', exact: true }).evaluate(button => button.click())
  await expect(page.getByText('Current Plan', { exact: true })).toBeVisible()
  expect(await billingNode.evaluate(node => node.isConnected)).toBe(true)
  expect(api.requests.some(request => request.path.startsWith('/api/billing/'))).toBe(false)
})

test('foundation text is readable on its rendered surfaces and mobile targets remain usable', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  await page.goto('/')
  const font = await page.evaluate(async () => {
    await document.fonts.ready
    const license = await fetch('/fonts/OFL-Inter.txt').then(response => response.text())
    return { loaded: document.fonts.check('12px Inter'), license }
  })
  expect(font.loaded).toBe(true)
  expect(font.license).toContain('SIL OPEN FONT LICENSE Version 1.1')
  await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
  const samples = await page.locator('.contour-eyebrow, .contour-profile small, .contour-topbar h1, .contour-mode-status, .contour-new-conversation').evaluateAll(nodes => {
    const rgb = color => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    const luminance = color => rgb(color).map(value => {
      const channel = value / 255
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    return nodes.filter(node => node.getClientRects().length).map(node => {
      let surface = node
      while (surface.parentElement && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement
      const a = luminance(getComputedStyle(node).color)
      const b = luminance(getComputedStyle(surface).backgroundColor)
      return { text: node.textContent, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
    })
  })
  expect(samples.length).toBeGreaterThan(0)
  for (const sample of samples) expect(sample.contrast, sample.text).toBeGreaterThanOrEqual(4.5)
  if (isMobile) {
    const buttons = await page.getByRole('dialog', { name: 'Conversation history' }).getByRole('button').all()
    for (const button of buttons) {
      const box = await button.boundingBox()
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
  }
})
