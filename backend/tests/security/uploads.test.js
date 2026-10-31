import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createUpload, uploadFilename, uploadError } from '../../services/agent/config/upload.js'
import { requireService } from '../../shared/security/internal.js'
import { express, serve, response, A } from './helpers.js'
import { randomBytes } from 'node:crypto'
import { proxyWithHeader } from '../../gateway/utils/proxyWithHeader.js'

test('upload names are unique for repeated/path-like client filenames', () => {
  const names = Array.from({ length: 1000 }, () => uploadFilename({ originalname: '../../same.pdf', mimetype: 'application/pdf' }))
  assert.equal(new Set(names).size, 1000)
  assert.ok(names.every(name => /^[a-f\d-]{36}\.pdf$/.test(name)))
})

test('actual multipart uploads retain PDF/image compatibility, enforce 20 MB and reject invalid files', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sutrai-upload-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const token = randomBytes(32).toString('hex'), app = express(), upload = createUpload(directory)
  app.post('/chat', requireService(['gateway'], { SERVICE_AUTH_KEYS: JSON.stringify({ gateway: token }) }), upload.single('file'),
    (req, res) => res.json({ originalname: req.file.originalname, name: req.file.filename, mime: req.file.mimetype, size: req.file.size }))
  app.use(uploadError)
  const url = await serve(t, app), headers = { 'x-service-name': 'gateway', 'x-service-token': token, 'x-user-id': A }
  const send = (type, content, auth = headers) => {
    const form = new FormData(); form.append('prompt', 'Isolated upload'); form.append('file', new Blob([content], { type }), 'same.pdf')
    return fetch(`${url}/chat`, { method: 'POST', headers: auth, body: form })
  }
  assert.equal((await send('application/pdf', '%PDF-1.4', {})).status, 403)
  assert.deepEqual(await readdir(directory), [])
  const result = await Promise.all([send('application/pdf', '%PDF-1.4'), send('application/pdf', '%PDF-1.4')])
  const bodies = await Promise.all(result.map(r => r.json()))
  assert.notEqual(bodies[0].name, bodies[1].name); assert.equal(bodies[0].originalname, 'same.pdf')
  assert.equal((await send('image/png', new Uint8Array([137, 80, 78, 71]))).status, 200)
  assert.equal((await send('text/html', '<script>ignored</script>')).status, 400)
  assert.equal((await send('application/pdf', new Uint8Array(20 * 1024 * 1024 + 1))).status, 413)
  // Multer removes the partial rejected upload; only the three accepted files remain.
  assert.equal((await readdir(directory)).length, 3)
})

test('filesystem/unexpected errors use a stable response without leaking paths or undefined variables', () => {
  const res = response()
  uploadError(Object.assign(new Error('sensitive/path and provider detail'), { code: 'ENOSPC' }), {}, res, () => {})
  assert.equal(res.statusCode, 503); assert.equal(JSON.stringify(res.body).includes('sensitive'), false)
})

test('gateway preserves multipart uploads above the proxy default body buffer limit', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sutrai-upload-proxy-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const token = randomBytes(32).toString('hex'), previous = process.env.SERVICE_AUTH_TOKEN
  process.env.SERVICE_AUTH_TOKEN = token
  t.after(() => { if (previous === undefined) delete process.env.SERVICE_AUTH_TOKEN; else process.env.SERVICE_AUTH_TOKEN = previous })
  const upstream = express(), upload = createUpload(directory)
  upstream.post('/chat', requireService(['gateway'], { SERVICE_AUTH_KEYS: JSON.stringify({ gateway: token }) }), upload.single('file'),
    (req, res) => res.json({ size: req.file.size, userId: req.identity.userId }))
  upstream.use(uploadError)
  const url = await serve(t, upstream), gateway = express()
  // Authentication is covered by access.test; this isolates the production proxy's streaming contract.
  gateway.use('/api/agent', (req, _res, next) => { req.user = { userId: A }; next() }, proxyWithHeader(url))
  const base = await serve(t, gateway), form = new FormData()
  form.append('file', new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'application/pdf' }), 'large.pdf')
  const result = await fetch(`${base}/api/agent/chat`, { method: 'POST', body: form, headers: { 'x-user-id': 'b'.repeat(24) } })
  assert.equal(result.status, 200); assert.deepEqual(await result.json(), { size: 2 * 1024 * 1024, userId: A })
})
