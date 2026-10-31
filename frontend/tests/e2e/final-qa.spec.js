import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { test, expect, fixtureUser, selectMode } from './fixtures.js'
import { reviewMessages, codeSample } from './conversation-fixtures.js'
import { artifactMessages } from './artifact-fixtures.js'
import { pdfFile } from './input-fixtures.js'

const require = createRequire(import.meta.url)
test.use({ deviceScaleFactor: 2 })

async function audit(page, info, state) {
  // Audit settled controls, not intermediate colors during a button-variant transition.
  await page.evaluate(async () => Promise.all(document.getAnimations()
    .filter(animation => animation.effect.getComputedTiming().endTime < 1500)
    .map(animation => animation.finished.catch(() => {}))))
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
  const result = await page.evaluate(async () => {
    const results = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      // User-generated opaque previews are outside the application accessibility claim.
      iframes: false,
    })
    return { tool: results.testEngine, url: location.pathname, timestamp: results.timestamp,
      passes: results.passes.length,
      violations: results.violations.map(({ id, impact, description, helpUrl, nodes }) => ({ id, impact, description, helpUrl,
        nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })) })),
      incomplete: results.incomplete.map(({ id, impact, description }) => ({ id, impact, description })),
    }
  })
  const path = info.outputPath(`phase6-a11y-${state}.json`)
  await writeFile(path, JSON.stringify(result, null, 2))
  await info.attach(`axe-${state}`, { path, contentType: 'application/json' })
  expect(result.violations, `axe findings in ${state}; inspect attached evidence`).toEqual([])
}

async function shot(page, info, state) {
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: info.outputPath(`phase6-${state}.png`), animations: 'disabled' })
}

async function conversation(page, isMobile) {
  await page.goto('/')
  await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
  await page.getByRole('button', { name: 'Redis cache design', exact: true }).click()
  if (!isMobile) await page.getByRole('complementary', { name: 'Conversation history' }).getByRole('button', { name: 'Collapse conversation history', exact: true }).click()
}

test('final accessibility: guest, authentication, modes and attachment', async ({ page }, info) => {
  test.setTimeout(90000)
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true })).toBeEnabled()
  await audit(page, info, 'guest')
  await shot(page, info, 'guest')
  await page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true }).click()
  await audit(page, info, 'authentication')
  await shot(page, info, 'authentication')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true })).toBeFocused()
  await page.getByRole('button', { name: /^AI mode:/ }).click()
  await audit(page, info, 'modes')
  await shot(page, info, 'modes')
  await page.keyboard.press('Escape')
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles(pdfFile)
  await audit(page, info, 'attachment')
  await shot(page, info, 'attachment')
})

test('final accessibility: history, rich conversation, artifacts and billing', async ({ page, api, isMobile }, info) => {
  test.setTimeout(120000)
  api.account = fixtureUser
  api.messages = [...reviewMessages, artifactMessages().at(-1)]
  await page.goto('/')
  await page.getByRole('button', { name: isMobile ? 'Open conversation history' : 'Expand conversation history', exact: true }).click()
  await audit(page, info, 'history')
  await shot(page, info, 'history')
  await page.getByRole('button', { name: 'Redis cache design', exact: true }).click()
  if (!isMobile) await page.getByRole('complementary', { name: 'Conversation history' }).getByRole('button', { name: 'Collapse conversation history', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'A cache that helps, without becoming the source of truth.' })).toBeVisible()
  const artifactPanel = page.getByRole('dialog', { name: 'Artifact workspace', exact: true })
  if (!isMobile) await artifactPanel.getByRole('button', { name: 'Collapse artifact', exact: true }).click()
  await expect.poll(() => page.locator('.contour-code-block .token').count()).toBeGreaterThan(0)
  await page.getByRole('region', { name: 'Conversation messages', exact: true }).evaluate(element => { element.scrollTop = 0 })
  await audit(page, info, 'conversation')
  await shot(page, info, 'conversation')
  await page.getByRole('button', { name: 'View code', exact: true }).click()
  await expect(artifactPanel.locator('.monaco-editor')).toBeVisible()
  await audit(page, info, 'artifact-code')
  await shot(page, info, 'artifact-code')
  await artifactPanel.getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect(artifactPanel.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts')
  await audit(page, info, 'artifact-preview')
  await shot(page, info, 'artifact-preview')
  await artifactPanel.getByRole('button', { name: isMobile ? 'Close artifact' : 'Collapse artifact', exact: true }).click()
  await page.getByRole('banner').getByRole('button', { name: /Plans.*credits/i }).click()
  const billing = page.getByRole('dialog', { name: 'Plans & Credits', exact: true })
  await audit(page, info, 'billing')
  await shot(page, info, 'billing')
  await billing.getByRole('button', { name: 'Choose Starter', exact: true }).click()
  await audit(page, info, 'purchase-review')
  await shot(page, info, 'purchase-review')
})

test('final responsive: tablet, narrow and keyboard-sized viewports preserve controls and reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true })).toBeEnabled()
  const prompt = page.getByRole('textbox', { name: 'Message', exact: true })
  await prompt.fill('A long draft that stays readable as the viewport changes. '.repeat(12))
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles({ ...pdfFile, name: `${'engineering-notes-'.repeat(10)}.pdf` })
  for (const [width, height] of [[768, 1024], [1024, 768], [320, 568], [390, 480], [1440, 960]]) {
    await page.setViewportSize({ width, height })
    await expect(page.getByRole('button', { name: 'Send message' })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Remove attachment' })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const send = await page.getByRole('button', { name: 'Send message' }).boundingBox()
    expect(send.width).toBeGreaterThanOrEqual(44)
    expect(send.height).toBeGreaterThanOrEqual(44)
    if (width === 768) await shot(page, info, 'tablet')
    if (width === 390) await shot(page, info, 'compact-mobile')
  }
  await expect(prompt).toHaveValue('A long draft that stays readable as the viewport changes. '.repeat(12))
  expect(await page.evaluate(() => document.getAnimations().every(animation => Number(animation.effect.getTiming().duration) <= 1))).toBe(true)
})

test('all seven modes retain their actual multipart agent identifiers when explicitly sent', async ({ page, api }) => {
  api.account = fixtureUser
  api.allowChat = true
  api.messages = []
  await page.goto('/')
  for (const mode of ['auto', 'chat', 'coding', 'pdf', 'ppt', 'vision', 'search']) {
    await selectMode(page, mode)
    api.sendResult = { answer: `Isolated ${mode} API response.`, images: [], artifacts: [] }
    await page.getByRole('textbox', { name: 'Message', exact: true }).fill(`Validate ${mode} contract`)
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByText(`Isolated ${mode} API response.`, { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('')
    expect(api.sent.at(-1)).toContain(`name="agent"\r\n\r\n${mode}`)
  }
  expect(api.sent).toHaveLength(7)
})

test('optional Markdown chunk failure retains readable text, workspace and draft', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  await page.route('**/src/components/MessageBubble.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'throw new Error("Isolated optional formatting failure")' }))
  await conversation(page, isMobile)
  await expect(page.getByRole('alert').filter({ hasText: 'Message formatting is unavailable' })).toBeVisible()
  await expect(page.getByText(api.messages[0].content, { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('My draft remains usable')
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveValue('My draft remains usable')
})

test('optional highlighting failure preserves source text and response copy', async ({ page, api, isMobile }) => {
  api.account = fixtureUser
  api.messages = reviewMessages
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route('**/src/components/workspace/CodeBlock.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: 'throw new Error("Isolated optional highlighting failure")' }))
  await conversation(page, isMobile)
  await expect(page.getByRole('alert').filter({ hasText: 'Code highlighting is unavailable' }).first()).toBeVisible()
  await expect(page.locator('pre').filter({ hasText: 'async function getProduct' })).toHaveText(codeSample + '\n')
  await page.getByRole('button', { name: 'Copy response', exact: true }).first().click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('A cache that helps')
})

test('guest startup does not request billing SDK or optional message, highlighting and editor modules', async ({ page }) => {
  const requested = []
  page.on('request', request => requested.push(request.url()))
  await page.goto('/')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign up', exact: true })).toBeEnabled()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('A guest can interact without optional modules')
  expect(requested.filter(url => /checkout\.razorpay|\/MessageBubble\.jsx|\/CodeBlock\.jsx|\/ArtifactEditor\.jsx|react-syntax-highlighter/.test(url))).toEqual([])
})
