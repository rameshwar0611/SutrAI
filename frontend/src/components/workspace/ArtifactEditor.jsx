import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution'
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution'
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution'
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'
import 'monaco-editor/esm/vs/language/json/monaco.contribution'

self.MonacoEnvironment = { getWorker: (_, label) => label === 'json' ? new JsonWorker() : new EditorWorker() }
loader.config({ monaco })
monaco.editor.defineTheme('contour', {
  base: 'vs', inherit: true, rules: [
    { token: 'tag', foreground: '2855D9' },
    { token: 'delimiter', foreground: '65748E' },
    { token: 'attribute.name', foreground: '526582' },
    { token: 'attribute.value', foreground: '315D54' },
    { token: 'attribute.value.html', foreground: '315D54' },
    { token: 'metatag', foreground: '526582' },
    { token: 'metatag.html', foreground: '526582' },
    { token: 'annotation', foreground: '65748E' },
    { token: 'metatag.content.html', foreground: '526582' },
    { token: 'keyword', foreground: '2855D9' },
    { token: 'string', foreground: '315D54' },
    { token: 'number', foreground: '6C5697' },
    { token: 'comment', foreground: '65748E' },
  ],
  colors: { 'editor.background': '#fbfcff', 'editor.foreground': '#334564',
    'editorLineNumber.foreground': '#65748e', 'editorLineNumber.activeForeground': '#334564',
    'editor.selectionBackground': '#dce6ff' },
})

export default function ArtifactEditor({ file, language }) {
  return <Editor theme="contour" language={language} value={file.content}
    loading={<p className="contour-artifact-state" role="status">Loading code editor…</p>}
    options={{ readOnly: true, domReadOnly: true, editContext: false, ariaLabel: `${file.name}, read-only code`,
      minimap: { enabled: false }, fontSize: 12, lineHeight: 22, wordWrap: 'off', automaticLayout: true,
      scrollBeyondLastLine: false, padding: { top: 16, bottom: 16 }, lineNumbers: 'on',
      renderLineHighlight: 'none', contextmenu: false, tabFocusMode: true,
      scrollbar: { horizontal: 'visible', alwaysConsumeMouseWheel: false, horizontalScrollbarSize: 12, verticalScrollbarSize: 12 } }} />
}
