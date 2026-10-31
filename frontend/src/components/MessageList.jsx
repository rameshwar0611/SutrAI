import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import LoadingAnimation from './LoadingAnimation'
import WelcomeState from './workspace/WelcomeState'
import { ChevronRight, Code2 } from 'lucide-react'
import Button from './ui/Button'
import ContentBoundary from './ui/ContentBoundary'

const MessageBubble = lazy(() => import('./MessageBubble'))

export default function MessageList({ fetchStatus, onOpenArtifact }) {
  const { selectedConversation } = useSelector(state => state.conversation)
  const { messages, artifacts, isLoading } = useSelector(state => state.message)
  const artifact = Array.isArray(artifacts) && artifacts.length ? artifacts[0] : null
  const fileCount = Array.isArray(artifact?.files) ? artifact.files.length : 0
  const status = useSelector(state => state.user.status)
  const scroll = useRef(null)
  const reading = useRef(null)
  const nearBottom = useRef(true)
  const previousConversation = useRef(null)
  const conversationId = selectedConversation?._id
  const welcome = status !== 'authenticated' || !selectedConversation

  useLayoutEffect(() => {
    if (previousConversation.current !== conversationId) nearBottom.current = true
    previousConversation.current = conversationId
    const frame = requestAnimationFrame(() => {
      const element = scroll.current
      if (element && nearBottom.current && !welcome) element.scrollTop = element.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [conversationId, messages, isLoading, welcome])

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const element = scroll.current
      if (element && nearBottom.current && !welcome) element.scrollTop = element.scrollHeight
    })
    observer.observe(reading.current)
    return () => observer.disconnect()
  }, [welcome])

  return <div ref={scroll} className={`contour-transcript ${welcome ? 'contour-transcript--welcome' : ''}`}
    role="region" aria-label={welcome ? 'Workspace introduction' : 'Conversation messages'} tabIndex={0}
    aria-busy={!welcome && (isLoading || fetchStatus === 'loading')}
    onScroll={event => {
      const element = event.currentTarget
      nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
    }}>
    <div ref={reading} className={welcome ? 'contour-welcome-content' : 'contour-reading'}>
      {welcome ? <WelcomeState /> : <>
        {messages.length === 0 && !isLoading && <div className="contour-conversation-empty">
          {fetchStatus === 'loading' ? <p role="status">Loading conversation…</p>
            : fetchStatus === 'error' ? <><h2>Messages unavailable</h2><p>Retry to load this conversation. Your draft is still here.</p></>
              : <><h2>Start this conversation</h2><p>Your messages will appear here.</p></>}
        </div>}
        {messages.map((message, index) => <ContentBoundary key={message._id || message.clientId || index}
          fallback={<article className="contour-prose"><p role="alert">Message formatting is unavailable. Plain text is shown; your draft is unchanged.</p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{typeof message.content === 'string' ? message.content : ''}</p></article>}>
          <Suspense fallback={<p className="contour-working" role="status">Loading message…</p>}>
            <MessageBubble role={message.role} content={message.content} images={message.images || []} />
          </Suspense>
        </ContentBoundary>)}
        {artifact && <Button className="contour-artifact-result" onClick={onOpenArtifact}>
          <Code2 size={21} aria-hidden="true" /><span><strong>{typeof artifact.title === 'string' && artifact.title.trim() ? artifact.title : 'Generated artifact'}</strong>
            <small>{fileCount} generated {fileCount === 1 ? 'file' : 'files'} · Read-only code</small></span><ChevronRight size={16} aria-hidden="true" />
        </Button>}
        {isLoading && <LoadingAnimation />}
      </>}
    </div>
  </div>
}
