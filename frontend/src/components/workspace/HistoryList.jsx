import { MessageSquare } from 'lucide-react'
import Button from '../ui/Button'
import StatusBanner from '../ui/StatusBanner'

export default function HistoryList({ conversations, selectedId, requestStatus, disabled, onSelect, onRetry }) {
  return (
    <nav className="contour-history-list" aria-label="Recent conversations">
      <p className="contour-eyebrow">Recent conversations</p>
      {requestStatus === 'loading' && <StatusBanner>Loading conversations…</StatusBanner>}
      {requestStatus === 'error' && <StatusBanner tone="error">
        <span>Unable to load conversations.</span>
        <Button variant="ghost" onClick={onRetry}>Retry history</Button>
      </StatusBanner>}
      {requestStatus === 'ready' && conversations.length === 0 && <div className="contour-history-empty">
        <MessageSquare size={20} aria-hidden="true" />
        <strong>No conversations yet</strong>
        <p>Your conversations will appear here after you send your first message.</p>
      </div>}
      {conversations.map(conversation => (
        <button key={conversation._id} type="button" className="contour-history-item" disabled={disabled}
          aria-current={selectedId === conversation._id ? 'true' : undefined}
          title={conversation.title || 'New Chat'} onClick={() => onSelect(conversation)}>
          <MessageSquare size={16} aria-hidden="true" />
          <span>{conversation.title || 'New Chat'}</span>
        </button>
      ))}
    </nav>
  )
}
