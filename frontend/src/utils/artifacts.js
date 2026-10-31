export function artifactFiles(artifact) {
  if (!Array.isArray(artifact?.files)) return []
  return artifact.files.map((file, index) => ({
    name: typeof file?.name === 'string' && file.name.trim() ? file.name : `File ${index + 1}`,
    content: typeof file?.content === 'string' ? file.content : null,
  }))
}

export function artifactLanguage(name = '') {
  const extension = name.split('.').at(-1).toLowerCase()
  return { html: 'html', htm: 'html', css: 'css', js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript', json: 'json', py: 'python', java: 'java', cpp: 'cpp', c: 'c' }[extension] || 'plaintext'
}

// Generated content is only handed to an opaque-origin sandbox, never the app DOM.
// Keep the existing local HTML/CSS/JS contract and the coding agent's Unsplash
// images, without granting generated code app-origin or network privileges.
export function artifactPreview(files) {
  const html = files.find(file => /^index\.html?$/i.test(file.name) && file.content?.trim()) ||
    files.find(file => /\.html?$/i.test(file.name) && file.content?.trim())
  if (!html) return null
  const css = files.find(file => file.name === 'style.css')?.content || ''
  const js = files.find(file => file.name === 'script.js')?.content || ''
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob: https://images.unsplash.com https://plus.unsplash.com; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'"
  const body = html.content
    .replace(/<link\b[^>]*\bhref\s*=\s*(["'])(?:\.\/)?style\.css\1[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc\s*=\s*(["'])(?:\.\/)?script\.js\1[^>]*>\s*<\/script\s*>/gi, '')
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${body}<script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
}
