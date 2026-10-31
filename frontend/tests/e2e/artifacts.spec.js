import { test, expect, fixtureUser } from './fixtures.js'
import { artifact, artifactMessages, cssFile, htmlFile, jsFile } from './artifact-fixtures.js'
import { imageFile, mockGooglePopup, pdfFile } from './input-fixtures.js'

test.use({ deviceScaleFactor: 2 })
const panel = page => page.locator('dialog.contour-artifact-panel[open]')

async function showHistory(page, isMobile) {
  if (isMobile) await page.getByRole('button', { name: 'Open conversation history', exact: true }).click()
  else {
    const expand = page.getByRole('button', { name: 'Expand conversation history', exact: true })
    if (await expand.isVisible()) await expand.click()
  }
}

async function loadArtifact(page, api, isMobile, value = artifact) {
  api.account = fixtureUser
  api.messages = artifactMessages(value)
  await page.goto('/')
  await showHistory(page, isMobile)
  await page.getByRole('button', { name: 'Redis cache design', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View code', exact: true })).toBeVisible()
  if (isMobile) await page.getByRole('button', { name: 'View code', exact: true }).click()
  await expect(panel(page)).toBeVisible()
  if (!isMobile) await page.getByRole('navigation', { name: 'Workspace navigation', exact: true }).getByRole('button', { name: 'Collapse conversation history', exact: true }).click()
  await panel(page).getByRole('heading').focus()
  await page.mouse.move(0, 0)
}

async function clipboard(page, deny = false) {
  await page.addInitScript(deny => {
    window.__copiedFiles = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async text => { if (deny) throw new Error('Clipboard denied in test'); window.__copiedFiles.push(text) },
    } })
  }, deny)
}

test('real Monaco code view, split/sheet controls and draft/File survive close and reopen', async ({ page, api, isMobile }, info) => {
  await clipboard(page)
  await loadArtifact(page, api, isMobile)
  await expect(panel(page).locator('.monaco-editor')).toBeVisible()
  await expect(panel(page).getByRole('tab', { name: 'index.html', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(panel(page).getByRole('heading', { name: artifact.title, exact: true })).toBeVisible()
  expect(await panel(page).getAttribute('data-desktop')).toBe(isMobile ? 'false' : 'true')
  await page.screenshot({ path: info.outputPath('phase4-code.png') })
  await panel(page).getByRole('button', { name: isMobile ? 'Close artifact' : 'Collapse artifact', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('phase4-collapsed.png') })
  const prompt = page.getByRole('textbox', { name: 'Message', exact: true })
  await prompt.fill('Keep this draft while I inspect the files')
  await page.getByLabel('Attach PDF or image', { exact: true }).setInputFiles(pdfFile)
  const fileInput = await page.getByLabel('Attach PDF or image', { exact: true }).elementHandle()
  await page.getByRole('button', { name: 'View code', exact: true }).click()
  await panel(page).getByRole('tab', { name: 'style.css', exact: true }).click()
  await panel(page).getByRole('button', { name: isMobile ? 'Close artifact' : 'Collapse artifact', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View code', exact: true })).toBeFocused()
  if (!isMobile) await page.getByRole('button', { name: 'Reopen artifact', exact: true }).click()
  else await page.getByRole('button', { name: 'View code', exact: true }).click()
  await expect(panel(page).getByRole('tab', { name: 'style.css', exact: true })).toHaveAttribute('aria-selected', 'true')
  await panel(page).getByRole('button', { name: 'Copy artifact code', exact: true }).click()
  await expect(panel(page).getByRole('status').filter({ hasText: 'File copied.' })).toBeVisible()
  expect(await page.evaluate(() => window.__copiedFiles)).toEqual([cssFile])
  if (isMobile) await panel(page).getByRole('button', { name: 'Close artifact', exact: true }).click()
  await expect(prompt).toHaveValue('Keep this draft while I inspect the files')
  expect(await fileInput.evaluate(node => node === document.querySelector('input[type="file"]') && node.files[0].name === 'product-brief.pdf')).toBe(true)
})

test('HTML/CSS/JavaScript preview executes only inside unchanged sandbox and retains file/view selection', async ({ page, api, isMobile }, info) => {
  await clipboard(page)
  await loadArtifact(page, api, isMobile)
  await panel(page).getByRole('tab', { name: 'script.js', exact: true }).click()
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  const iframe = panel(page).locator('iframe')
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
  const preview = page.frameLocator('iframe')
  await expect(preview.getByRole('heading', { name: 'Good ideas, on a page.' })).toBeVisible()
  await expect(preview.locator('#count')).toHaveText('3 books · A considered collection.')
  expect(await preview.locator('body').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(246, 248, 252)')
  await page.screenshot({ path: info.outputPath('phase4-preview.png') })
  await preview.getByRole('button', { name: 'Mark as reviewed' }).click()
  await expect(preview.getByRole('button', { name: 'Reading list reviewed' })).toBeVisible()
  await panel(page).getByRole('button', { name: 'Copy artifact code', exact: true }).click()
  expect(await page.evaluate(() => window.__copiedFiles)).toEqual([jsFile])
  await panel(page).getByRole('button', { name: isMobile ? 'Close artifact' : 'Collapse artifact', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  await page.getByRole('button', { name: 'View code', exact: true }).click()
  await expect(panel(page).getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute('aria-selected', 'true')
  await panel(page).getByRole('tab', { name: 'Code', exact: true }).click()
  await expect(panel(page).getByRole('tab', { name: 'script.js', exact: true })).toHaveAttribute('aria-selected', 'true')
})

test('generated preview cannot read the app document, cookies, storage or account API', async ({ page, api, isMobile, baseURL }) => {
  const securityArtifact = { title: 'Sandbox boundary', files: [
    { name: 'index.html', content: '<h1>Sandbox probe</h1>' },
    { name: 'script.js', content: `
      for (const [key, read] of Object.entries({ parent: () => parent.document.body, cookies: () => document.cookie, storage: () => localStorage.length })) {
        try { read(); document.body.dataset[key] = 'read'; } catch { document.body.dataset[key] = 'blocked'; }
      }
      fetch('${baseURL}/api/me', { credentials: 'include' }).catch(() => { document.body.dataset.request = 'blocked'; });
      try { parent.__previewEscaped = true; } catch {}
    ` },
  ] }
  await loadArtifact(page, api, isMobile, securityArtifact)
  const before = api.requests.length
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  const body = page.frameLocator('iframe').locator('body')
  for (const key of ['parent', 'cookies', 'storage', 'request']) await expect(body).toHaveAttribute(`data-${key}`, 'blocked')
  expect(api.requests.length).toBe(before)
  expect(await page.evaluate(() => window.__previewEscaped)).toBeUndefined()
  expect(await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().user.userData._id)).toBe(fixtureUser._id)
})

test('file/view tabs are keyboard accessible and Monaco is read-only with a Tab exit', async ({ page, api, isMobile }) => {
  await clipboard(page)
  await loadArtifact(page, api, isMobile)
  const files = panel(page).getByRole('tablist', { name: 'Artifact files', exact: true })
  await files.getByRole('tab', { name: 'index.html', exact: true }).focus()
  await page.keyboard.press('End')
  await expect(files.getByRole('tab', { name: 'script.js', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(files.getByRole('tab', { name: 'index.html', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Home')
  const editor = panel(page).getByRole('textbox', { name: 'index.html, read-only code', exact: true })
  await expect(editor).toHaveJSProperty('readOnly', true)
  await editor.focus()
  await page.keyboard.type('must not edit generated files')
  await expect(panel(page).locator('.view-lines')).not.toContainText('must not edit generated files')
  await page.keyboard.press('Tab')
  await expect(editor).not.toBeFocused()
  await panel(page).getByRole('button', { name: 'Copy artifact code', exact: true }).click()
  expect(await page.evaluate(() => window.__copiedFiles)).toEqual([htmlFile])
  const code = panel(page).getByRole('tab', { name: 'Code', exact: true })
  await code.focus()
  await page.keyboard.press('ArrowRight')
  await expect(panel(page).getByRole('tab', { name: 'Preview', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(code).toBeFocused()
  if (isMobile) {
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('dialog[open]'))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'View code', exact: true })).toBeFocused()
  }
})

test('copy denial has recoverable feedback and never discards the file', async ({ page, api, isMobile }, info) => {
  await clipboard(page, true)
  await loadArtifact(page, api, isMobile)
  await expect(panel(page).locator('.monaco-editor')).toBeVisible()
  await panel(page).getByRole('button', { name: 'Copy artifact code', exact: true }).click()
  await expect(panel(page).getByRole('alert').filter({ hasText: 'Copy failed.' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('phase4-copy-error.png') })
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Good ideas, on a page.' })).toBeVisible()
  await panel(page).getByRole('tab', { name: 'Code', exact: true }).click()
  await panel(page).getByRole('tab', { name: 'style.css', exact: true }).click()
  await expect(panel(page).getByRole('alert')).toHaveCount(0)
  const current = await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().message.artifacts)
  expect(current).toEqual([artifact])
})

test('empty/invalid files, no HTML and missing CSS/JS are handled without crashing', async ({ page, api, isMobile }, info) => {
  await loadArtifact(page, api, isMobile, { title: 'Incomplete generation', files: [] })
  await expect(panel(page).getByText('No files were returned', { exact: true })).toBeVisible()
  await expect(panel(page).getByRole('tab', { name: 'Preview', exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('phase4-empty.png') })
  const update = value => page.evaluate(async value => (await import('/src/redux/store.js')).store.dispatch({ type: 'message/setArtifacts', payload: [value] }), value)
  await update({ files: [{ name: 'broken.js', content: {} }, { name: 'empty.css', content: '' }, null] })
  await expect(panel(page).getByRole('alert').filter({ hasText: 'This file’s contents are unavailable.' })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: 'Copy artifact code', exact: true })).toBeDisabled()
  await panel(page).getByRole('tab', { name: 'empty.css', exact: true }).click()
  await expect(panel(page).getByText('This file is empty.', { exact: true })).toBeVisible()
  await panel(page).getByRole('tab', { name: 'File 3', exact: true }).click()
  await update({ files: [{ name: 'index.html', content: '<h1>HTML without CSS or JS</h1>' }] })
  await expect(panel(page).getByRole('tab', { name: 'index.html', exact: true })).toHaveAttribute('aria-selected', 'true')
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'HTML without CSS or JS' })).toBeVisible()
  await update({ files: [{ name: 'script.js', content: 'const value = 1;' }] })
  await expect(panel(page).getByRole('tab', { name: 'Preview', exact: true })).toHaveCount(0)
  await expect(panel(page).getByRole('tab', { name: 'Code', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(panel(page).locator('.monaco-editor')).toBeVisible()
})

test('long/wide files scroll locally and split-to-sheet resizing preserves view/file and composer', async ({ page, api, isMobile }) => {
  const longFile = { name: 'a-long-generated-file-name-that-must-not-widen-the-page.js', content: `const longValue = '${'x'.repeat(700)}';\n` + Array.from({ length: 180 }, (_, i) => `// Readable line ${i + 1}`).join('\n') }
  await clipboard(page)
  await loadArtifact(page, api, isMobile, { ...artifact, files: [...artifact.files, longFile] })
  const composer = await page.locator('#chat-prompt').elementHandle()
  const tab = panel(page).getByRole('tab', { name: longFile.name, exact: true })
  await tab.click()
  await expect(panel(page).locator('.monaco-editor')).toBeVisible()
  const editor = panel(page).getByRole('textbox', { name: `${longFile.name}, read-only code`, exact: true })
  await expect(panel(page).locator('.view-lines')).toContainText('const longValue')
  await editor.focus()
  await expect(editor).toBeFocused()
  const horizontal = panel(page).locator('.monaco-scrollable-element').first()
  const slider = horizontal.locator('.scrollbar.horizontal .slider')
  await page.keyboard.press('Control+Home')
  const originalX = (await slider.boundingBox()).x
  await page.keyboard.press('End')
  await expect.poll(async () => (await slider.boundingBox()).x).toBeGreaterThan(originalX)
  await editor.focus()
  await page.keyboard.press('Control+End')
  await expect(panel(page).locator('.view-lines')).toContainText('Readable line 180')
  for (const [width, height] of [[1440, 960], [1024, 768], [390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({ width, height })
    await expect(panel(page)).toBeVisible()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(panel(page).getByRole('button', { name: width > 1100 ? 'Collapse artifact' : 'Close artifact', exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const bounds = await panel(page).boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1)
  }
  expect(await composer.evaluate(node => node === document.getElementById('chat-prompt'))).toBe(true)
  await panel(page).getByRole('button', { name: 'Copy artifact code', exact: true }).click()
  expect(await page.evaluate(() => window.__copiedFiles)).toEqual([longFile.content])
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 960 })
  await expect(panel(page).getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeInViewport()
})

test('conversation switch and account logout/login remove stale files and running preview', async ({ page, api, isMobile }) => {
  api.allowAuth = true
  await mockGooglePopup(page)
  await loadArtifact(page, api, isMobile)
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  if (isMobile) await panel(page).getByRole('button', { name: 'Close artifact', exact: true }).click()
  api.messagesByConversation['test-conversation-b'] = [{ _id: 'no-files', role: 'assistant', content: 'This conversation has no generated files.' }]
  let release
  api.messageGates['test-conversation-b'] = new Promise(resolve => { release = resolve })
  await showHistory(page, isMobile)
  await page.getByRole('button', { name: 'Review an Express endpoint', exact: true }).click()
  try {
    await expect(page.getByRole('button', { name: 'View code', exact: true })).toHaveCount(0)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().message.artifacts)).toEqual([])
  } finally { release() }
  await expect(page.getByText('This conversation has no generated files.')).toBeVisible()
  await showHistory(page, isMobile)
  await page.getByRole('button', { name: 'Redis cache design', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View code', exact: true })).toBeVisible()
  if (!isMobile) await panel(page).getByRole('button', { name: 'Collapse artifact', exact: true }).click()
  await showHistory(page, isMobile)
  await page.getByRole('button', { name: 'Log out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'View code', exact: true })).toHaveCount(0)
  await expect(page.locator('iframe')).toHaveCount(0)
  api.authLoginUser = { ...fixtureUser, _id: 'test-account-b', name: 'Second test account' }
  api.history = []
  await page.getByRole('banner').getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
  await page.evaluate(() => window.__authPopup.resolve())
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeHidden()
  expect(await page.evaluate(async () => (await import('/src/redux/store.js')).store.getState().message.artifacts)).toEqual([])
  await expect(page.getByRole('button', { name: 'View code', exact: true })).toHaveCount(0)
})

test('session expiry clears the artifact panel while preserving the unsent draft', async ({ page, api, isMobile }) => {
  api.allowChat = true
  api.sendStatus = 401
  await loadArtifact(page, api, isMobile)
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  if (isMobile) await panel(page).getByRole('button', { name: 'Close artifact', exact: true }).click()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Keep my draft after expiry')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'View code', exact: true })).toHaveCount(0)
  expect(await page.locator('#chat-prompt').inputValue()).toBe('Keep my draft after expiry')
})

test('editor loading keeps file controls available and resolves to the real Monaco editor', async ({ page, api, isMobile }, info) => {
  await clipboard(page)
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/src/components/workspace/ArtifactEditor.jsx*', async route => { await gate; await route.continue() })
  try {
    await loadArtifact(page, api, isMobile)
    await expect(panel(page).getByRole('status').filter({ hasText: 'Loading code editor…' })).toBeVisible()
    await page.screenshot({ path: info.outputPath('phase4-loading.png') })
    await panel(page).getByRole('button', { name: 'Copy artifact code', exact: true }).click()
    expect(await page.evaluate(() => window.__copiedFiles)).toEqual([htmlFile])
  } finally { release() }
  await expect(panel(page).locator('.monaco-editor')).toBeVisible()
})

test('editor render failure falls back to selectable code while Copy and Close still work', async ({ page, api, isMobile }, info) => {
  await clipboard(page)
  await page.route('**/src/components/workspace/ArtifactEditor.jsx*', route => route.fulfill({
    contentType: 'application/javascript', body: 'export default function Editor(){throw new Error("Editor unavailable in isolated failure test")}',
  }))
  await loadArtifact(page, api, isMobile)
  await expect(panel(page).getByRole('alert').filter({ hasText: 'The code editor couldn’t load.' })).toBeVisible()
  await expect(panel(page).getByLabel('Read-only file contents', { exact: true })).toHaveText(htmlFile)
  await page.screenshot({ path: info.outputPath('phase4-editor-error.png') })
  await panel(page).getByRole('button', { name: 'Copy artifact code', exact: true }).click()
  expect(await page.evaluate(() => window.__copiedFiles)).toEqual([htmlFile])
  await panel(page).getByRole('button', { name: isMobile ? 'Close artifact' : 'Collapse artifact', exact: true }).click()
  await expect(panel(page)).toHaveCount(0)
})

test('inline images render and the preview retains an explicit Unsplash host allowlist', async ({ page, api, isMobile }) => {
  const source = `data:image/png;base64,${imageFile.buffer.toString('base64')}`
  await loadArtifact(page, api, isMobile, { files: [{ name: 'index.html', content: `<h1>Generated image</h1><img src="${source}" alt="Generated page illustration">` }] })
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  const image = page.frameLocator('iframe').getByRole('img', { name: 'Generated page illustration' })
  await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0)
  const document = await panel(page).locator('iframe').getAttribute('srcdoc')
  expect(document).toContain('img-src data: blob: https://images.unsplash.com https://plus.unsplash.com;')
})

test('invalid generated JavaScript leaves Code and dismissal available without breaking the app', async ({ page, api, isMobile }, info) => {
  await loadArtifact(page, api, isMobile, { title: 'Incomplete script', files: [
    { name: 'index.html', content: '<h1>The HTML is still readable</h1>' }, { name: 'script.js', content: 'const = ;' },
  ] })
  await panel(page).getByRole('tab', { name: 'Preview', exact: true }).click()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'The HTML is still readable' })).toBeVisible()
  await expect.poll(() => api.browserErrors).toEqual(["Unexpected token '='"])
  api.browserErrors.splice(0) // Exactly the asserted syntax error from the isolated generated script.
  await page.screenshot({ path: info.outputPath('phase4-invalid-preview.png') })
  await panel(page).getByRole('tab', { name: 'Code', exact: true }).click()
  await expect(panel(page).getByRole('tab', { name: 'script.js', exact: true })).toBeVisible()
  await panel(page).getByRole('button', { name: isMobile ? 'Close artifact' : 'Collapse artifact', exact: true }).click()
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('The workspace still works')
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled()
})
