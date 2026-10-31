import { test, expect, fixtureUser, selectMode } from './fixtures.js'
import { codeSample, plainCode, richResponse, reviewMessages, reviewPrompt } from './conversation-fixtures.js'

test.use({ deviceScaleFactor: 2 })

async function openConversation(page, isMobile, title = 'Redis cache design') {
  await page.goto('/')
  await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
  await page.getByRole('button', { name: title, exact: true }).click()
  if (!isMobile) await page.getByRole('complementary', { name: 'Conversation history' })
    .getByRole('button', { name: 'Collapse conversation history', exact: true }).click()
}

test('approved guest workspace uses real suggestions and on-demand authentication', async ({ page, api }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What will you make today?' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign up' })).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: testInfo.outputPath('phase2-guest.png') })
  await page.getByRole('button', { name: 'Build a reading-list page' }).click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Build a reading-list page')
  await expect(page.getByRole('button', { name: 'AI mode: Coding', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeVisible()
  await page.getByRole('button', { name: 'Close sign-in' }).click()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Build a reading-list page')
  expect(api.requests.some(request => /^\/api\/(chat|agent|billing)\//.test(request.path))).toBe(false)
})

test('conversation renders Markdown and captures the real desktop/mobile layout', async ({ page, api, isMobile }, testInfo) => {
  api.account = fixtureUser
  api.messages = reviewMessages
  await openConversation(page, isMobile)
  const transcript = page.getByRole('region', { name: 'Conversation messages', exact: true })
  await expect(page.getByRole('heading', { name: 'A cache that helps, without becoming the source of truth.' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveAttribute('placeholder', 'Ask a follow-up…')
  await expect(transcript.locator('table th')).toHaveCount(6)
  await expect(transcript.locator('ol li')).toHaveCount(4)
  await expect(transcript.locator('ul li')).toHaveCount(3)
  await expect.poll(() => transcript.locator('.token').count()).toBeGreaterThan(0)
  const contrasts = await transcript.locator('.token').evaluateAll(nodes => {
    const luminance = color => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(value => {
      const channel = value / 255
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    return nodes.filter(node => node.textContent.trim()).map(node => {
      let surface = node
      while (surface.parentElement && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement
      const a = luminance(getComputedStyle(node).color)
      const b = luminance(getComputedStyle(surface).backgroundColor)
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    })
  })
  expect(Math.min(...contrasts)).toBeGreaterThanOrEqual(4.5)
  await expect(transcript.getByRole('link', { name: 'Redis caching documentation' })).toHaveAttribute('rel', 'noopener noreferrer')
  await transcript.evaluate(element => { element.scrollTop = 0 })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: testInfo.outputPath('phase2-conversation.png') })
  await transcript.locator('.contour-table').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('phase2-table.png') })
  await transcript.locator('.contour-code-block').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('phase2-code.png') })
})

test('table/code overflow is local, keyboard scrollable and preserves complete clipboard content', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.messages = reviewMessages
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await openConversation(page, isMobile)
  const table = page.getByRole('region', { name: 'Response table', exact: true })
  await expect(table).toHaveAttribute('tabindex', '0')
  await table.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  // Native key scrolling is animated, especially under mobile emulation.
  await expect.poll(() => table.evaluate(async element => {
    const positions = []
    for (let frame = 0; frame < 4; frame++) {
      await new Promise(requestAnimationFrame)
      positions.push(element.scrollLeft)
    }
    return positions.every(value => value === positions[0])
  })).toBe(true)
  await table.evaluate(element => { element.scrollLeft = 120 })
  const tableNode = await table.elementHandle()
  const left = await table.evaluate(element => element.scrollLeft)
  await page.getByRole('button', { name: 'Copy response', exact: true }).first().click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(richResponse)
  expect(await tableNode.evaluate(node => node.isConnected)).toBe(true)
  expect(await table.evaluate(element => element.scrollLeft)).toBe(left)
  const blocks = page.locator('.contour-code-block')
  await blocks.first().getByRole('button', { name: 'Copy code', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${codeSample}\n`)
  await blocks.nth(1).getByRole('button', { name: 'Copy code', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`${plainCode}\n`)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('region', { name: 'Conversation messages', exact: true }).evaluate(element => { element.scrollTop = element.scrollHeight })
  const footer = await page.locator('.contour-response-actions').last().boundingBox()
  const composer = await page.getByRole('region', { name: 'Prompt composer' }).boundingBox()
  expect(footer.bottom ?? footer.y + footer.height).toBeLessThanOrEqual(composer.y + 1)
})

test('copy denial has recoverable feedback without changing the response', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.messages = reviewMessages
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async () => { throw new Error('Clipboard denied by test') } },
  }))
  await openConversation(page, isMobile)
  await page.getByRole('button', { name: 'Copy code', exact: true }).first().click()
  await expect(page.getByText('Copy failed. Select the code to copy it.')).toBeVisible()
  await page.getByRole('button', { name: 'Copy response', exact: true }).first().click()
  await expect(page.getByText('Copy failed. Select the response to copy it.')).toBeVisible()
  expect(await page.locator('.contour-code-block pre').first().textContent()).toBe(`${codeSample}\n`)
  await expect(page.getByText('Copied', { exact: true })).toHaveCount(0)
})

test('new authenticated conversation sends the existing multipart contract explicitly', async ({ page, api }) => {
  api.account = fixtureUser
  api.messages = []
  api.allowChat = true
  api.sendResult = { answer: '## A real UI update\n\nThis answer is returned by the isolated API fixture.', images: [], artifacts: [] }
  let release
  api.sendGate = new Promise(resolve => { release = resolve })
  try {
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('button', { name: 'Plans and credits' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Explain the request flow')
    await selectMode(page, 'coding')
    await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles({ name: 'brief.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nPhase 2 fixture') })
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText('Working on your response…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled()
    await expect.poll(() => api.sent.length).toBe(1)
    expect(api.sent[0]).toContain('name="prompt"\r\n\r\nExplain the request flow')
    expect(api.sent[0]).toContain('name="conversationId"\r\n\r\ntest-created-conversation')
    expect(api.sent[0]).toContain('name="agent"\r\n\r\ncoding')
    expect(api.sent[0]).toContain('filename="brief.pdf"')
    expect(api.requests.some(request => request.path === '/api/chat/create-conversation')).toBe(true)
    expect(api.requests.some(request => request.path === '/api/chat/update-conversation')).toBe(true)
  } finally { release() }
  await expect(page.getByRole('heading', { name: 'A real UI update' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'AI mode: Coding', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove attachment' })).toHaveCount(0)
  expect(api.sent).toHaveLength(1)
})

test('a failed send keeps the actual draft/mode/File and removes only its optimistic message', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.allowChat = true
  api.sendStatus = 500
  await openConversation(page, isMobile)
  const prompt = page.getByRole('textbox', { name: 'Message', exact: true })
  await prompt.fill('Preserve this unsent request')
  await selectMode(page, 'pdf')
  const input = page.getByLabel('Attach PDF or image', { exact: true })
  await input.setInputFiles({ name: 'retry.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nRetry fixture') })
  const fileNode = await input.elementHandle()
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('The request could not be completed. Your draft is preserved; check the conversation before retrying.')).toBeVisible()
  await expect(prompt).toHaveValue('Preserve this unsent request')
  await expect(page.getByRole('button', { name: 'AI mode: PDF', exact: true })).toBeVisible()
  expect(await fileNode.evaluate(node => node.isConnected && node.files[0].name === 'retry.pdf')).toBe(true)
  await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'SutrAI response' })).toHaveCount(1)
  expect(api.sent).toHaveLength(1)
})

test('message pending, failure, retry and genuinely empty results remain distinct', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.messages = []
  api.messagesStatus = 500
  let release
  api.messagesGate = new Promise(resolve => { release = resolve })
  try {
    await openConversation(page, isMobile)
    await expect(page.getByText('Loading conversation…')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Start this conversation' })).toHaveCount(0)
  } finally { release() }
  await expect(page.getByRole('heading', { name: 'Messages unavailable' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep drafting while messages recover')
  api.messagesStatus = 200
  await page.getByRole('button', { name: 'Retry messages' }).click()
  await expect(page.getByRole('heading', { name: 'Start this conversation' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('Keep drafting while messages recover')
  expect(api.requests.filter(request => request.path.startsWith('/api/chat/get-messages/'))).toHaveLength(2)
})

test('long content keeps copy controls and the final reply reachable without pulling a reader down', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  const longCode = Array.from({ length: 100 }, (_, index) => `const cachePolicy${index} = { accountScoped: true, ttlSeconds: 60 };`).join('\n')
  api.messages = [reviewMessages[0], { _id: 'long-code', role: 'assistant', content: `## Review the cache policies\n\n\`\`\`javascript\n${longCode}\n\`\`\`\n\nFinal paragraph: keep this readable above the composer.` }]
  await openConversation(page, isMobile)
  const transcript = page.getByRole('region', { name: 'Conversation messages', exact: true })
  await expect(page.getByText('Final paragraph: keep this readable above the composer.')).toBeVisible()
  await expect(transcript.locator('.contour-code-block')).toBeVisible()
  await transcript.evaluate(element => {
    const code = element.querySelector('.contour-code-block')
    element.scrollTop += code.getBoundingClientRect().top - element.getBoundingClientRect().top + 400
  })
  const copy = page.getByRole('button', { name: 'Copy code', exact: true })
  await expect(copy).toBeInViewport()
  const before = await transcript.evaluate(element => element.scrollTop)
  await page.evaluate(async () => {
    const { store } = await import('/src/redux/store.js')
    const { addMessage } = await import('/src/redux/messageSlice.js')
    store.dispatch(addMessage({ _id: 'later-response', role: 'assistant', content: 'A later fixture response arrived while you were reading.' }))
  })
  await expect(page.getByText('A later fixture response arrived while you were reading.')).toHaveCount(1)
  await expect.poll(() => transcript.evaluate(element => element.scrollTop)).toBe(before)
  await transcript.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(page.getByRole('button', { name: 'Copy response', exact: true }).last()).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('long user text and resized mobile viewports retain usable composer controls', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.messages = [{ _id: 'long-user', role: 'user', content: `${reviewPrompt}\n\n${'UnbrokenUserMessage'.repeat(160)}` }, reviewMessages[1]]
  await openConversation(page, isMobile)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A long follow-up draft\n'.repeat(40))
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles({ name: 'long-follow-up.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nViewport test') })
  const sizes = isMobile ? [[320, 568], [390, 844], [390, 420], [390, 320]] : [[1440, 960], [1024, 768], [768, 1024]]
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    await expect(page.getByRole('button', { name: 'Send message' })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const send = await page.getByRole('button', { name: 'Send message' }).boundingBox()
    expect(send.y + send.height).toBeLessThanOrEqual(height + 1)
    const transcript = await page.getByRole('region', { name: 'Conversation messages', exact: true }).boundingBox()
    expect(transcript.height).toBeGreaterThan(40)
    if (width <= 760) expect(await page.getByRole('textbox', { name: 'Message', exact: true }).evaluate(element => getComputedStyle(element).fontSize)).toBe('16px')
  }
})

test('response images have keyboard previews and a broken image does not erase the answer', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.assets['/test-assets/diagram.svg'] = { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 112"><rect width="160" height="112" fill="#edf1f7"/><path d="M30 56h100" stroke="#2855d9" stroke-width="4"/></svg>' }
  api.messages = [{ _id: 'image-response', role: 'assistant', content: '### Cache paths\n\n![Cache diagram](/test-assets/diagram.svg)\n\n![Unavailable diagram](/test-assets/missing.png)\n\nThe rest of the answer remains readable.' }]
  await openConversation(page, isMobile)
  const opener = page.getByRole('button', { name: 'Open Cache diagram', exact: true })
  await opener.focus()
  await opener.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Image preview' })).toBeHidden()
  await expect(opener).toBeFocused()
  await expect(page.getByRole('img', { name: 'Unavailable diagram: unavailable' })).toBeVisible()
  await expect(page.getByText('The rest of the answer remains readable.')).toBeVisible()
})

test('a late message response cannot replace a different selected conversation', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.messagesByConversation['test-conversation-a'] = [{ _id: 'old-response', role: 'assistant', content: 'Late content from the previous conversation.' }]
  api.messagesByConversation['test-conversation-b'] = [{ _id: 'current-response', role: 'assistant', content: 'Content for the selected conversation.' }]
  let release
  api.messageGates['test-conversation-a'] = new Promise(resolve => { release = resolve })
  try {
    await openConversation(page, isMobile)
    await expect(page.getByText('Loading conversation…')).toBeVisible()
    await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
    await page.getByRole('button', { name: 'Review an Express endpoint', exact: true }).click()
    await expect(page.getByText('Content for the selected conversation.')).toBeVisible()
  } finally { release() }
  await expect.poll(() => api.completedMessages.includes('test-conversation-a')).toBe(true)
  await expect(page.getByText('Late content from the previous conversation.')).toHaveCount(0)
  const state = await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState())
  expect(state.conversation.selectedConversation._id).toBe('test-conversation-b')
  expect(state.message.messages[0].content).toBe('Content for the selected conversation.')
})

test('history and sends retain actual artifact payloads', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  const first = [{ title: 'Loaded artifact', files: [{ name: 'index.html', content: '<h1>Loaded file</h1>' }] }]
  const next = [{ title: 'Updated artifact', files: [{ name: 'index.html', content: '<h1>Updated file</h1>' }] }]
  api.messages = [{ _id: 'artifact-response', role: 'assistant', content: 'The saved file is available.', artifacts: first }]
  api.allowChat = true
  api.sendResult = { answer: 'The updated file is available.', images: [], artifacts: next }
  // Phase 4 exercises the real locally bundled editor/iframe in artifacts.spec.js.
  await openConversation(page, isMobile)
  await expect(page.getByText('The saved file is available.')).toBeVisible()
  const artifacts = () => page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().message.artifacts)
  await expect.poll(artifacts).toEqual(first)
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Update the file')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('The updated file is available.')).toBeVisible()
  await expect.poll(artifacts).toEqual(next)
})
