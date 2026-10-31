// Dependency doubles live only in the Playwright browser context. Production exposes no test hooks.
export async function mockGooglePopup(page) {
  await page.addInitScript(() => {
    window.__authPopup = { calls: 0, tokens: 0, resolve: null, reject: null }
  })
  await page.route('**/utils/firebase.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    export function getFirebaseClient(){ return { auth: {}, googleProvider: {} } }
    export async function signOutFirebase(){}
  ` }))
  await page.route('**/node_modules/.vite/deps/firebase_auth.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export function signInWithPopup(){
      const probe = window.__authPopup;
      probe.calls++;
      return new Promise((resolve, reject) => {
        probe.resolve = () => resolve({ user: { getIdToken: async () => { probe.tokens++; return 'test-only-id-token' } } });
        probe.reject = code => reject(Object.assign(new Error('Test popup result'), { code }));
      });
    }
  ` }))
}

export async function mockSpeechRecognition(page, supported = true) {
  await page.addInitScript(supported => {
    window.__speech = { instances: [], starts: 0, stops: 0, aborts: 0, nextStartError: null }
    class Recognition {
      constructor() { window.__speech.instances.push(this) }
      start() {
        window.__speech.starts++
        if (window.__speech.nextStartError) {
          const name = window.__speech.nextStartError
          window.__speech.nextStartError = null
          throw Object.assign(new Error('Test microphone start error'), { name })
        }
        queueMicrotask(() => this.onstart?.())
      }
      stop() { window.__speech.stops++; queueMicrotask(() => this.onend?.()) }
      abort() { window.__speech.aborts++; queueMicrotask(() => this.onend?.()) }
      result(text) { this.onresult?.({ resultIndex: 0, results: [[{ transcript: text }]] }) }
      error(error) { this.onerror?.({ error }); this.onend?.() }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: supported ? Recognition : undefined })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })
  }, supported)
}

export async function trackObjectURLs(page) {
  await page.addInitScript(() => {
    window.__objectURLs = { created: [], revoked: [] }
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = blob => {
      const url = create(blob)
      if (blob instanceof File) window.__objectURLs.created.push(url)
      return url
    }
    URL.revokeObjectURL = url => { window.__objectURLs.revoked.push(url); return revoke(url) }
  })
}

export const pdfFile = { name: 'product-brief.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nIsolated upload test') }
export const imageFile = { name: 'diagram.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/J1sAAAAASUVORK5CYII=', 'base64') }
