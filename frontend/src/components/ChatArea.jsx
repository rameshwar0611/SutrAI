import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import getMessages from '../features/getMessages'
import { setArtifacts, setMessages } from '../redux/messageSlice'
import { store } from '../redux/store'
import Button from './ui/Button'
import StatusBanner from './ui/StatusBanner'

export default function ChatArea({ onLogin, onOpenArtifact, onOpenBilling }) {
  const { selectedConversation } = useSelector(state => state.conversation)
  const { status, sessionEpoch } = useSelector(state => state.user)
  const isLoading = useSelector(state => state.message.isLoading)
  const resetKey = useSelector(state => state.workspace.resetKey)
  const [request, setRequest] = useState(null)
  const [retry, setRetry] = useState(0)
  const dispatch = useDispatch()
  const conversationId = selectedConversation?._id
  const key = `${sessionEpoch}:${conversationId}`
  const fetchStatus = request?.key === key && request?.retry === retry ? request.status : 'loading'
  const welcome = status !== 'authenticated' || !selectedConversation

  useEffect(() => {
    if (status !== 'authenticated' || !conversationId || isLoading) return
    const controller = new AbortController()
    const current = () => !controller.signal.aborted && store.getState().user.status === 'authenticated' &&
      store.getState().user.sessionEpoch === sessionEpoch && store.getState().conversation.selectedConversation?._id === conversationId &&
      !store.getState().message.isLoading
    getMessages(conversationId, { signal: controller.signal }).then(data => {
      if (!current()) return
      dispatch(setMessages(data))
      const latest = [...data].reverse().find(message => message.artifacts?.length)
      dispatch(setArtifacts(latest?.artifacts || []))
      setRequest({ key: `${sessionEpoch}:${conversationId}`, retry, status: 'ready' })
    }).catch(() => {
      if (current()) setRequest({ key: `${sessionEpoch}:${conversationId}`, retry, status: 'error' })
    })
    return () => controller.abort()
  }, [status, sessionEpoch, conversationId, isLoading, retry, dispatch])

  return <div className={`contour-chat-area ${welcome ? 'contour-chat-area--welcome' : ''}`}>
    {!welcome && fetchStatus === 'error' && <StatusBanner tone="error">
      <span>Unable to load messages.</span><Button variant="ghost" onClick={() => setRetry(value => value + 1)}>Retry messages</Button>
    </StatusBanner>}
    <MessageList fetchStatus={fetchStatus} onOpenArtifact={onOpenArtifact} />
    <ChatInput key={resetKey} onLogin={onLogin} onOpenBilling={onOpenBilling} />
  </div>
}
