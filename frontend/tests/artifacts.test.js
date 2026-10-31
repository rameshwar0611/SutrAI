import test from 'node:test'
import assert from 'node:assert/strict'
import { artifactFiles, artifactLanguage, artifactPreview } from '../src/utils/artifacts.js'

test('missing or malformed artifact files become safe, explicit unavailable entries', () => {
  for (const artifact of [undefined, null, {}, { files: null }, { files: {} }]) assert.deepEqual(artifactFiles(artifact), [])
  assert.deepEqual(artifactFiles({ files: [null, { name: ' ', content: 12 }, { name: 'empty.js', content: '' }] }), [
    { name: 'File 1', content: null }, { name: 'File 2', content: null }, { name: 'empty.js', content: '' },
  ])
})

test('read-only editor languages preserve supported extensions with text fallback', () => {
  for (const [name, language] of [['INDEX.HTML', 'html'], ['style.css', 'css'], ['app.jsx', 'javascript'],
    ['app.tsx', 'typescript'], ['data.json', 'json'], ['main.py', 'python'], ['main.java', 'java'],
    ['main.cpp', 'cpp'], ['main.c', 'c'], ['README', 'plaintext']]) assert.equal(artifactLanguage(name), language)
})

test('preview is unavailable for missing, empty or invalid HTML and works without CSS/JS', () => {
  for (const files of [[], [{ name: 'script.js', content: 'alert(1)' }], [{ name: 'index.html', content: null }],
    [{ name: 'index.html', content: '  ' }]]) assert.equal(artifactPreview(files), null)
  assert.match(artifactPreview([{ name: 'page.html', content: '<h1>HTML only</h1>' }]), /<h1>HTML only<\/h1>/)
})

test('preview composes supplied conventional files without remote requests and keeps a restrictive CSP first', () => {
  const doc = artifactPreview([
    { name: 'index.html', content: '<!doctype html><link rel="stylesheet" href="./style.css"><h1>Generated</h1><script src="script.js"></script>' },
    { name: 'style.css', content: 'h1 { color: navy; }' },
    { name: 'script.js', content: 'document.querySelector("h1").textContent = "Interactive";' },
  ])
  assert.match(doc, /<style>h1 \{ color: navy; \}<\/style>/)
  assert.match(doc, /<script>document.querySelector/)
  assert.doesNotMatch(doc, /href="\.\/style.css"|src="script.js"/)
  for (const directive of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "frame-src 'none'"])
    assert.ok(doc.includes(directive))
  assert.ok(doc.includes('img-src data: blob: https://images.unsplash.com https://plus.unsplash.com;'))
  assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf('<h1>'))
})

test('closing script/style sequences in file contents cannot terminate their inline element', () => {
  const doc = artifactPreview([{ name: 'index.html', content: '<p>Safe host boundary</p>' },
    { name: 'style.css', content: '/* </STYLE><script>unexpected()</script> */' },
    { name: 'script.js', content: 'const example = "</SCRIPT><p>Literal sample</p>";' }])
  assert.match(doc, /<\\\/style>/i)
  assert.match(doc, /<\\\/script>/i)
})
