import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('real LangGraph routes all seven modes and Auto upload paths with isolated provider doubles', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sutrai-graph-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'isolated-file'); await writeFile(file, 'synthetic bytes')
  let fail = false
  const getModel = async agent => ({ invoke: async input => {
    if (fail) throw new Error('Isolated provider failure')
    if (agent === 'router') return { content: 'chat' }
    if (typeof input !== 'string') return { content: 'Isolated response' }
    if (input.includes('intent classifier')) return { content: 'CODE_GENERATION' }
    if (agent === 'coding') return { content: JSON.stringify({ files: [{ name: 'index.html', content: '<h1>Test</h1>' }] }) }
    if (agent === 'pdf') return { content: JSON.stringify({ title: 'Isolated PDF', sections: [] }) }
    if (agent === 'ppt') return { content: JSON.stringify({ title: 'Isolated PPT', slides: [] }) }
    return { content: 'Isolated image prompt' }
  } })
  const replace = (relative, exports) => mock.module(new URL(relative, import.meta.url), { exports })
  replace('../../services/agent/config/llmModels.js', { getModel })
  replace('../../services/agent/config/memory.js', { getMemory: async () => [] })
  replace('../../services/agent/config/agentLimit.js', { checkAgentLimit: async () => ({ remaining: 1 }) })
  replace('../../services/agent/config/tavily.js', { searchTool: { invoke: async () => ({ results: [], images: [] }) } })
  replace('../../services/agent/utils/uploadToS3.js', { uploadToS3: async () => {} })
  replace('../../services/agent/utils/getFromS3.js', { getFromS3: async () => 'https://example.invalid/isolated-document' })
  replace('../../services/agent/utils/generatePdf.js', { generatePdf: async () => Buffer.from('test') })
  replace('../../services/agent/utils/generatePpt.js', { generatePpt: async () => ({ write: async () => Buffer.from('test') }) })
  replace('../../services/agent/config/vectorDb.js', { vectorStore: async () => ({ similaritySearch: async () => [{ pageContent: 'Isolated PDF context' }] }) })
  replace('../../services/agent/node_modules/pdf-parse/dist/pdf-parse/esm/index.js', { PDFParse: class {
    async getText() { return { text: 'Isolated PDF text' } }
    async destroy() {}
  } })
  const axios = (await import('../../services/agent/node_modules/axios/index.js')).default
  mock.method(axios, 'get', async () => ({ data: Buffer.from('Isolated image bytes') }))
  const { graph } = await import('../../services/agent/graph/graph.js')
  for (const agent of ['auto', 'chat', 'coding', 'pdf', 'ppt', 'vision', 'search']) {
    const result = await graph.invoke({ agent, prompt: 'Isolated prompt', userId: 'a'.repeat(24), conversationId: 'b'.repeat(24) })
    assert.equal(typeof result.aiResponse, 'string', agent)
    if (agent === 'coding') assert.equal(result.artifacts[0].files[0].name, 'index.html')
  }
  for (const [mimetype, selected] of [['application/pdf', 'pdfRag'], ['image/png', 'imageAnalyzer']]) {
    const result = await graph.invoke({ agent: 'auto', prompt: 'Isolated question', file: { path: file, mimetype }, userId: 'a'.repeat(24), conversationId: 'b'.repeat(24) })
    assert.equal(result.agent, selected); assert.equal(typeof result.aiResponse, 'string')
  }
  fail = true
  await assert.rejects(graph.invoke({ agent: 'chat', prompt: 'Test', userId: 'a'.repeat(24), conversationId: 'b'.repeat(24) }), /Isolated provider failure/)
})
