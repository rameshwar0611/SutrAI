import { Children, isValidElement, lazy, Suspense, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, ImageOff } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Button from './ui/Button'
import IconButton from './ui/IconButton'
import ScrollableRegion from './ui/ScrollableRegion'
import ImagePreviewDialog from './workspace/ImagePreviewDialog'
import useClipboard from '../hooks/useClipboard'
import ContentBoundary from './ui/ContentBoundary'

const CodeBlock = lazy(() => import('./workspace/CodeBlock'))

function ResponseImage({ src, alt = 'Response image', onOpen }) {
  const [failed, setFailed] = useState(false)
  if (!src) return null
  if (failed) return <span className="contour-image-unavailable" role="img" aria-label={`${alt}: unavailable`}><ImageOff size={17} aria-hidden="true" />Image unavailable</span>
  return <button type="button" className="contour-response-image" aria-label={`Open ${alt}`} onClick={() => onOpen({ src, alt })}>
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
  </button>
}

function MarkdownCode({ children }) {
  const element = Children.toArray(children).find(isValidElement)
  const code = element ? String(element.props.children ?? '') : String(children ?? '')
  const language = /language-([^\s]+)/.exec(element?.props.className || '')?.[1]
  return <ContentBoundary fallback={<><p role="alert">Code highlighting is unavailable. You can select and copy the code below.</p><ScrollableRegion label="Code block"><pre><code>{code}</code></pre></ScrollableRegion></>}>
    <Suspense fallback={<pre aria-label="Code loading"><code>{code}</code></pre>}>
      <CodeBlock code={code} language={language} />
    </Suspense>
  </ContentBoundary>
}

export default function MessageBubble({ role, content = '', images = [] }) {
  const isUser = role === 'user'
  const [image, setImage] = useState(null)
  const { copy, status } = useClipboard()
  const text = typeof content === 'string' ? content : ''
  const markdownComponents = useMemo(() => ({
    pre: MarkdownCode,
    code: ({ children }) => <code className="contour-inline-code">{children}</code>,
    table: ({ children }) => <ScrollableRegion label="Response table" className="contour-table"><table>{children}</table></ScrollableRegion>,
    th: ({ children }) => <th scope="col">{children}</th>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}<ExternalLink size={12} aria-hidden="true" /></a>,
    img: ({ src, alt }) => <ResponseImage src={src} alt={alt || 'Response image'} onOpen={setImage} />,
  }), [setImage])
  return <article className={isUser ? 'contour-user-turn' : 'contour-assistant-turn'} aria-label={isUser ? 'Your message' : 'SutrAI response'}>
    {!isUser && <div className="contour-assistant-meta">
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M23 8c-2-3-10-3-12 0s1 5 5 7 8 4 5 8-10 4-13 0M26 13c-2-3-10-3-12 0s1 5 5 7M6 17c2 3 10 3 12 0s-1-5-5-7" /></svg>
      <strong>SutrAI</strong>
      <IconButton label="Copy response" tooltip={false} onClick={() => copy(text)}>{status === 'copied' ? <Check size={16} /> : <Copy size={16} />}</IconButton>
    </div>}
    <div className={isUser ? 'contour-user-message' : 'contour-assistant-message'}>
      {isUser && <span className="contour-user-label">You</span>}
      {images.length > 0 && <div className="contour-response-images">
        {images.map((src, index) => <ResponseImage key={`${src}-${index}`} src={src} alt={`Response image ${index + 1}`} onOpen={setImage} />)}
      </div>}
      <div className="contour-prose">
        <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{text}</Markdown>
      </div>
    </div>
    {!isUser && <div className="contour-response-actions">
      <Button variant="ghost" className="contour-copy-response" aria-label="Copy response" onClick={() => copy(text)}>
        {status === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {status === 'copied' ? 'Copied' : 'Copy response'}
      </Button>
      {status === 'copied' && <span className="sr-only" role="status">Response copied.</span>}
      {status === 'error' && <p className="contour-copy-error" role="alert">Copy failed. Select the response to copy it.</p>}
    </div>}
    <ImagePreviewDialog image={image} onClose={() => setImage(null)} />
  </article>
}
