import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Nav from './Nav'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import getMessages from '../features/getMessages'
import { setArtifacts, setMessages } from '../redux/messageSlice'

export default function ChatArea({ onLogin }) {
  const { selectedConversation } = useSelector(state => state.conversation)
  const { status, sessionEpoch } = useSelector(state => state.user)
  const isLoading = useSelector(state => state.message.isLoading)
  const resetKey = useSelector(state => state.workspace.resetKey)
  const [historyError, setHistoryError] = useState(null)
  const dispatch = useDispatch()
  const conversationId = selectedConversation?._id
  useEffect(() => {
    if (status !== 'authenticated' || !conversationId || isLoading) return
    const controller = new AbortController()
    getMessages(conversationId, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return
      dispatch(setMessages(data))
      const latest = [...data].reverse().find(message => message.artifacts?.length)
      dispatch(setArtifacts(latest?.artifacts || []))
      setHistoryError(null)
    }).catch(() => {
      if (!controller.signal.aborted) setHistoryError('Unable to load messages. Please try again later.')
    })
    return () => controller.abort()
  }, [status, sessionEpoch, conversationId, isLoading, dispatch])
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Nav />
      {status === 'authenticated' && selectedConversation && historyError && <p role="alert" className="px-5 py-2 text-xs text-red-300">{historyError}</p>}
      <MessageList />
      <ChatInput key={resetKey} onLogin={onLogin} />
    </div>
  )
}
