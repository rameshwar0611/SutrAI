import { test, expect, fixtureUser, selectMode } from './fixtures.js'
import { imageFile, pdfFile, mockGooglePopup, mockSpeechRecognition, trackObjectURLs } from './input-fixtures.js'

test.use({ deviceScaleFactor: 2 })

async function guestReady(page) {
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true })).toBeEnabled()
}

async function chooseConversation(page, isMobile) {
  await page.goto('/')
  await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
  await page.getByRole('button', { name: 'Redis cache design', exact: true }).click()
}

test('Contour login/signup dialog is keyboard-friendly and busy dismissal keeps the draft', async ({ page, api }, info) => {
  api.allowAuth = true
  await mockGooglePopup(page)
  await guestReady(page)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep this thought while I sign in')
  for (const [action, title, shot] of [['Log in', 'Welcome back.', 'auth'], ['Sign up', 'A space for your ideas.', 'signup']]) {
    await page.getByRole('banner').getByRole('button', { name: action, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: title, exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: title, exact: true })).toBeFocused()
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('dialog[open]'))).toBe(true)
    }
    await page.screenshot({ path: info.outputPath(`phase3-${shot}.png`) })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('banner').getByRole('button', { name: action, exact: true })).toBeFocused()
  }
  await page.getByRole('button', { name: 'Send message' }).click()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Keep exploring' }).click()
  await page.evaluate(() => window.__authPopup.resolve())
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep this thought while I sign in')
  expect(api.authPayloads).toHaveLength(0)
})

test('existing Google/token/backend-confirmation flow retains text, mode and the actual File', async ({ page, api }, info) => {
  api.allowAuth = true
  await mockGooglePopup(page)
  await trackObjectURLs(page)
  await guestReady(page)
  const prompt = page.getByRole('textbox', { name: 'Message', exact: true })
  await prompt.fill('Use my image after sign-in')
  await selectMode(page, 'vision')
  const input = page.getByLabel('Attach PDF or image', { exact: true })
  await input.setInputFiles(imageFile)
  const node = await input.elementHandle()
  const preview = await page.getByRole('img', { name: 'Selected attachment', exact: true }).getAttribute('src')
  let confirmSession
  api.meGate = new Promise(resolve => { confirmSession = resolve })
  try {
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toHaveAttribute('aria-busy', 'true')
    await page.screenshot({ path: info.outputPath('phase3-auth-loading.png') })
    await page.evaluate(() => window.__authPopup.resolve())
    await expect.poll(() => api.authPayloads.length).toBe(1)
    expect(api.authPayloads[0]).toEqual({ token: 'test-only-id-token' })
    expect(await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().user.status)).toBe('guest')
    expect(api.requests.some(request => /^\/api\/(chat|agent|billing)\//.test(request.path))).toBe(false)
  } finally { confirmSession() }
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeHidden()
  await expect(prompt).toBeFocused()
  await expect(prompt).toHaveValue('Use my image after sign-in')
  await expect(page.getByRole('button', { name: 'AI mode: Vision', exact: true })).toBeVisible()
  expect(await node.evaluate(node => node === document.querySelector('input[type="file"]') && node.files[0].name === 'diagram.png')).toBe(true)
  await expect(page.getByRole('img', { name: 'Selected attachment', exact: true })).toHaveAttribute('src', preview)
  expect(await page.evaluate(() => window.__objectURLs.revoked)).not.toContain(preview)
  expect(await page.evaluate(() => window.__authPopup.calls)).toBe(1)
  expect(await page.evaluate(() => window.__authPopup.tokens)).toBe(1)
  expect(api.sent).toHaveLength(0)
  api.allowChat = true
  api.messages = []
  api.sendResult = { answer: 'The test API received your explicitly submitted document.', artifacts: [], images: [] }
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('The test API received your explicitly submitted document.')).toBeVisible()
  expect(api.sent).toHaveLength(1)
  expect(api.sent[0]).toContain('filename="diagram.png"')
  expect(api.sent[0]).toContain('name="agent"\r\n\r\nvision')
  await expect.poll(() => page.evaluate(() => window.__objectURLs.revoked)).toContain(preview)
})

test('Google cancellation and backend failure recover through the same signup flow', async ({ page, api }, info) => {
  api.allowAuth = true
  await mockGooglePopup(page)
  await guestReady(page)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Preserve this after cancellation')
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles(pdfFile)
  await selectMode(page, 'coding')
  await page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.evaluate(() => window.__authPopup.reject('auth/popup-closed-by-user'))
  await expect(page.getByRole('status').filter({ hasText: 'Sign-in was cancelled. Your draft is still here.' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('phase3-auth-cancelled.png') })
  api.authLoginStatus = 500
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.evaluate(() => window.__authPopup.resolve())
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to sign in with Google.' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('phase3-auth-failure.png') })
  api.authLoginStatus = 200
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.evaluate(() => window.__authPopup.resolve())
  await expect(page.getByRole('dialog', { name: 'A space for your ideas.' })).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Preserve this after cancellation')
  await expect(page.getByRole('button', { name: 'AI mode: Coding', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Selected attachment' })).toContainText('product-brief.pdf')
  expect(api.sent).toHaveLength(0)
})

test('Firebase success cannot unlock protected UI when backend session confirmation fails', async ({ page, api }) => {
  api.allowAuth = true
  await mockGooglePopup(page)
  await guestReady(page)
  api.meStatus = 401
  await page.getByRole('banner').getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.evaluate(() => window.__authPopup.resolve())
  await expect(page.getByRole('alert').filter({ hasText: 'Could not confirm your session.' })).toBeVisible()
  expect(await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().user.status)).toBe('guest')
  expect(api.requests.some(request => /^\/api\/(chat|agent|billing)\//.test(request.path))).toBe(false)
})

test('session expiry clears private data and preserves the unsent text/mode/File for recovery', async ({ page, api, isMobile }, info) => {
  api.account = fixtureUser
  api.allowChat = true
  api.allowAuth = true
  api.sendStatus = 401
  await mockGooglePopup(page)
  await chooseConversation(page, isMobile)
  await expect(page.getByText('Existing conversation content from the isolated test fixture.')).toBeVisible()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep this when the session expires')
  await selectMode(page, 'search')
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles(pdfFile)
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Your session expired.' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('phase3-auth-expired.png') })
  const state = await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState())
  expect(state.message.messages).toEqual([])
  expect(state.message.artifacts).toEqual([])
  expect(state.conversation.conversations).toEqual([])
  api.sendStatus = 200
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await page.evaluate(() => window.__authPopup.resolve())
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep this when the session expires')
  await expect(page.getByRole('button', { name: 'AI mode: Search', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Selected attachment' })).toContainText('product-brief.pdf')
  expect(api.sent).toHaveLength(1)
})

test('the custom mode menu shows actual descriptions and keeps every existing API value', async ({ page, api }, info) => {
  await guestReady(page)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep this prompt while choosing a mode')
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles(pdfFile)
  await page.getByRole('button', { name: /^AI mode:/ }).click()
  const menu = page.getByRole('menu', { name: 'AI modes', exact: true })
  await expect(menu.getByRole('menuitemradio')).toHaveCount(7)
  await expect(menu.getByRole('menuitemradio', { name: 'Auto', exact: true })).toBeFocused()
  await expect(menu).toContainText('Choose the right workflow')
  await expect(menu).toContainText('Generate a document')
  await page.screenshot({ path: info.outputPath('phase3-modes.png') })
  await page.keyboard.press('Escape')
  for (const [id, label] of [['auto', 'Auto'], ['chat', 'Chat'], ['coding', 'Coding'], ['pdf', 'PDF'], ['ppt', 'PPT'], ['vision', 'Vision'], ['search', 'Search']]) {
    await selectMode(page, id)
    await expect(page.getByRole('button', { name: `AI mode: ${label}`, exact: true })).toBeFocused()
    expect(await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().workspace.mode)).toBe(id)
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep this prompt while choosing a mode')
    await expect(page.getByRole('group', { name: 'Selected attachment' })).toContainText('product-brief.pdf')
  }
  expect(api.requests.some(request => /^\/api\/(chat|agent|billing)\//.test(request.path))).toBe(false)
})

test('mode keyboard navigation, Tab exit and viewport bounds work without clipping', async ({ page }) => {
  await mockSpeechRecognition(page)
  await guestReady(page)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A draft to keep Send enabled')
  const trigger = page.getByRole('button', { name: /^AI mode:/ })
  await trigger.focus()
  await trigger.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: 'Auto', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitemradio', { name: 'Search', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-label', 'AI mode: Search')
  await trigger.press('ArrowUp')
  await expect(page.getByRole('menuitemradio', { name: 'Search', exact: true })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('menuitemradio', { name: 'Auto', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: 'Chat', exact: true })).toBeFocused()
  await page.keyboard.press(' ')
  await expect(trigger).toHaveAttribute('aria-label', 'AI mode: Chat')
  await trigger.click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('menu', { name: 'AI modes' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Send message' })).toBeFocused()
  await trigger.click()
  await page.keyboard.press('Shift+Tab')
  await expect(page.getByRole('button', { name: 'Start dictation' })).toBeFocused()
  for (const [width, height] of [[320, 568], [390, 320], [768, 1024], [1440, 960]]) {
    await page.setViewportSize({ width, height })
    await trigger.click()
    const menu = page.getByRole('menu', { name: 'AI modes', exact: true })
    await expect(menu).toBeVisible()
    await page.keyboard.press('End')
    await expect(page.getByRole('menuitemradio', { name: 'Search', exact: true })).toBeInViewport()
    const box = await menu.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  }
  await trigger.click()
  await page.getByRole('textbox', { name: 'Message', exact: true }).click()
  await expect(page.getByRole('menu', { name: 'AI modes' })).toBeHidden()
})

test('attachment replace/remove, validation and preview URL cleanup preserve a valid File', async ({ page, api }, info) => {
  await trackObjectURLs(page)
  await guestReady(page)
  const input = page.getByLabel('Attach PDF or image', { exact: true })
  await input.setInputFiles(imageFile)
  const preview = page.getByRole('img', { name: 'Selected attachment', exact: true })
  await expect.poll(() => preview.evaluate(node => node.naturalWidth)).toBeGreaterThan(0)
  const first = await preview.getAttribute('src')
  await page.getByRole('banner').getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: 'Keep exploring' }).click()
  expect(await page.evaluate(() => window.__objectURLs.revoked)).toEqual([])
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Replace attachment' }).click()
  await (await chooser).setFiles({ ...imageFile, name: 'replacement.png' })
  await expect(page.getByRole('group', { name: 'Selected attachment' })).toContainText('replacement.png')
  await expect.poll(() => page.evaluate(() => window.__objectURLs.revoked)).toContain(first)
  const second = await preview.getAttribute('src')
  await input.setInputFiles({ name: 'unsupported.txt', mimeType: 'text/plain', buffer: Buffer.from('Not an accepted upload') })
  await expect(page.getByRole('alert').filter({ hasText: 'This file type isn’t supported.' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('phase3-attachment-type-error.png') })
  await input.evaluate(node => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'too-large.pdf', { type: 'application/pdf' }))
    node.files = transfer.files
    node.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.getByRole('alert').filter({ hasText: 'This file is larger than 20 MB.' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Selected attachment' })).toContainText('replacement.png')
  await expect(preview).toHaveAttribute('src', second)
  await page.screenshot({ path: info.outputPath('phase3-attachment-size-error.png') })
  const serialized = await page.evaluate(async () => ({
    state: JSON.stringify((await import('/src/redux/store.js')).store.getState()),
    storage: JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  }))
  expect(serialized.state).not.toContain('replacement.png')
  expect(serialized.storage).not.toContain('blob:')
  expect(serialized.storage).not.toContain('replacement.png')
  await page.getByRole('button', { name: 'Remove attachment' }).click()
  await expect.poll(() => page.evaluate(() => window.__objectURLs.revoked)).toContain(second)
  await expect(page.getByRole('group', { name: 'Selected attachment' })).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await input.setInputFiles(pdfFile)
  await page.screenshot({ path: info.outputPath('phase3-attachment.png') })
  expect(api.requests.some(request => /^\/api\/(chat|agent|billing)\//.test(request.path))).toBe(false)
  expect(await page.evaluate(() => window.__objectURLs.created.length)).toBe(2)
})

test('voice listening, stop, permission/start/network failures recover without changing the mode or File', async ({ page }, info) => {
  await mockSpeechRecognition(page)
  await guestReady(page)
  await selectMode(page, 'chat')
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles(pdfFile)
  await page.getByRole('button', { name: 'Start dictation' }).click()
  await expect(page.getByRole('button', { name: 'Stop dictation' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Listening… Speak now.' })).toBeVisible()
  const config = await page.evaluate(() => {
    const recognition = window.__speech.instances.at(-1)
    recognition.result('A dictated prompt')
    return { lang: recognition.lang, interim: recognition.interimResults, continuous: recognition.continuous }
  })
  expect(config).toEqual({ lang: 'en-US', interim: true, continuous: true })
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('A dictated prompt')
  await page.getByRole('button', { name: 'Stop dictation' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Dictation stopped.' })).toBeVisible()
  for (const [code, message] of [['not-allowed', 'Microphone access was denied.'], ['audio-capture', 'No microphone is available.'], ['network', 'Dictation could not connect.'], ['no-speech', 'No speech was detected.']]) {
    await page.getByRole('button', { name: 'Start dictation' }).click()
    await page.evaluate(code => window.__speech.instances.at(-1).error(code), code)
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible()
    if (code === 'not-allowed') await page.screenshot({ path: info.outputPath('phase3-voice-error.png') })
  }
  await page.evaluate(() => { window.__speech.nextStartError = 'NotAllowedError' })
  await page.getByRole('button', { name: 'Start dictation' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Microphone access was denied.' })).toBeVisible()
  await page.getByRole('button', { name: 'Start dictation' }).click()
  await expect(page.getByRole('button', { name: 'Stop dictation' })).toBeVisible()
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeVisible()
  await page.evaluate(() => window.__speech.instances.at(-1).result('A late result must be ignored'))
  expect(await page.locator('#chat-prompt').inputValue()).toBe('A dictated prompt')
  await page.getByRole('button', { name: 'Keep exploring' }).click()
  await expect(page.getByRole('button', { name: 'AI mode: Chat', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Selected attachment' })).toContainText('product-brief.pdf')
})

test('an unsupported browser explains voice availability and keeps typing/uploading usable', async ({ page }) => {
  await mockSpeechRecognition(page, false)
  await guestReady(page)
  await expect(page.getByRole('button', { name: 'Dictation unavailable' })).toBeDisabled()
  await expect(page.getByText('Voice input isn’t supported in this browser. You can keep typing.')).toBeVisible()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Typed without browser voice support')
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles(pdfFile)
  await selectMode(page, 'vision')
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Typed without browser voice support')
  await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled()
})
