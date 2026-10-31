import { Check, Code2, Copy } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import Button from '../ui/Button'
import ScrollableRegion from '../ui/ScrollableRegion'
import useClipboard from '../../hooks/useClipboard'

// Preserve Prism's language styling with readable colors on the Contour code surface.
const colors = {
  'hsl(230, 8%, 24%)': '#334564',
  'hsl(230, 4%, 64%)': '#5d6b82',
  'hsl(230, 1%, 62%)': '#5d6b82',
  'hsl(230, 6%, 44%)': '#5d6b82',
  'hsla(230, 8%, 24%, 0.2)': '#5d6b82',
  'hsl(35, 99%, 36%)': '#8a5900',
  'hsl(301, 63%, 40%)': '#6443a6',
  'hsl(5, 74%, 59%)': '#a13c38',
  'hsl(119, 34%, 47%)': '#17715d',
  'hsl(221, 87%, 60%)': '#2855d9',
  'hsl(198, 99%, 37%)': '#216785',
  'hsl(344, 84%, 43%)': '#a13c68',
}
const theme = Object.fromEntries(Object.entries(oneLight).map(([token, style]) => [
  token, { ...style, ...(colors[style.color] ? { color: colors[style.color] } : {}) },
]))

export default function CodeBlock({ code, language }) {
  const { copy, status } = useClipboard()
  const knownLanguage = SyntaxHighlighter.supportedLanguages.includes(language)
  return <div className="contour-code-block">
    <div className="contour-code-header">
      <span><Code2 size={14} aria-hidden="true" />{language || 'Code'}</span>
      <Button variant="ghost" aria-label="Copy code" className="contour-copy-code" onClick={() => copy(code)}>
        {status === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {status === 'copied' ? 'Copied' : 'Copy code'}
      </Button>
    </div>
    <ScrollableRegion label="Code block" hintPosition="after">
      {knownLanguage ? <SyntaxHighlighter language={language} style={theme} wrapLongLines={false}
        customStyle={{ margin: 0, background: 'transparent', padding: '15px 16px', fontSize: 'inherit', lineHeight: 'inherit', minWidth: 'max-content' }}
        codeTagProps={{ style: { fontFamily: 'inherit', fontSize: 'inherit' } }}>{code}</SyntaxHighlighter>
        : <pre><code>{code}</code></pre>}
    </ScrollableRegion>
    {status === 'copied' && <span className="sr-only" role="status">Code copied.</span>}
    {status === 'error' && <p className="contour-copy-error" role="alert">Copy failed. Select the code to copy it.</p>}
  </div>
}
