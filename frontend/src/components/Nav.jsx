import { Code2, Coins, Menu } from 'lucide-react'
import { useSelector } from 'react-redux'
import Button from './ui/Button'
import IconButton from './ui/IconButton'

export default function Nav({ onLogin, onOpenHistory, historyOpen, onOpenBilling, hasArtifact, artifactTrigger, onOpenArtifact }) {
  const { selectedConversation } = useSelector(state => state.conversation)
  const { messages } = useSelector(state => state.message)
  const { status, signingOut } = useSelector(state => state.user)
  const mode = useSelector(state => state.workspace.mode)
  const authenticated = status === 'authenticated'
  const title = authenticated && selectedConversation ? selectedConversation.title || 'New Chat' : 'SutrAI'
  const modeLabel = { auto: 'Auto', chat: 'Chat', coding: 'Coding', pdf: 'PDF', ppt: 'PPT', vision: 'Vision', search: 'Search' }[mode]
  return <header className="contour-topbar" role="banner">
    <div className="contour-heading-context">
      <IconButton label="Open conversation history" className="contour-mobile-menu" tooltip={false}
        onClick={onOpenHistory} aria-haspopup="dialog" aria-expanded={historyOpen} aria-controls="mobile-history"><Menu size={20} /></IconButton>
      <div className="contour-conversation-heading">
        <h1 title={title}>{title}</h1>
        {authenticated && selectedConversation && <span>{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>}
      </div>
    </div>
    <div className="contour-header-actions">
      {authenticated ? <>
        {hasArtifact ? <Button ref={artifactTrigger} variant="ghost" className="contour-artifact-open" onClick={onOpenArtifact}
          aria-haspopup="dialog" aria-controls="artifact-workspace">
          <Code2 size={16} aria-hidden="true" /><span>View code</span>
        </Button> : modeLabel && <span className="contour-mode-status"><i aria-hidden="true" />{modeLabel} mode</span>}
        <IconButton label="Plans and credits" onClick={onOpenBilling}><Coins size={18} /></IconButton>
      </> : <>
        <Button variant="ghost" onClick={() => onLogin('login')} disabled={status === 'checking' || signingOut}>Log in</Button>
        <Button variant="primary" onClick={() => onLogin('signup')} disabled={status === 'checking' || signingOut}>Sign up</Button>
      </>}
    </div>
  </header>
}
