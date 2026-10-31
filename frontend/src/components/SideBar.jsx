import { Coins, History, LogOut, PanelLeftClose, Plus, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { getConversations } from '../features/getConversations'
import { setConversations, setSelectedConversation } from '../redux/conversationSlice'
import { clearDraft } from '../redux/workspaceSlice'
import { setMessages, setArtifacts } from '../redux/messageSlice'
import { store } from '../redux/store'
import Button from './ui/Button'
import IconButton from './ui/IconButton'
import Dialog from './ui/Dialog'
import HistoryList from './workspace/HistoryList'

function AccountAvatar({ user }) {
  const [failedAvatar, setFailedAvatar] = useState(null)
  const initials = user?.name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  return <span className="contour-avatar" aria-hidden="true">
    {user?.avatar && user.avatar !== failedAvatar
      ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailedAvatar(user.avatar)} />
      : initials || <User size={18} />}
  </span>
}

export default function SideBar({ onLogin, onLogout, onOpenBilling, expanded, onToggleExpanded, mobileOpen, onCloseMobile }) {
  const dispatch = useDispatch()
  const historyToggle = useRef(null)
  const { conversations: accountConversations, selectedConversation } = useSelector(state => state.conversation)
  const { userData, status, sessionEpoch, signingOut } = useSelector(state => state.user)
  const isLoading = useSelector(state => state.message.isLoading)
  const [retry, setRetry] = useState(0)
  const [historyRequest, setHistoryRequest] = useState(null)
  const authenticated = status === 'authenticated'
  const conversations = authenticated ? accountConversations : []
  const requestStatus = historyRequest?.epoch === sessionEpoch && historyRequest?.retry === retry
    ? historyRequest.status : 'loading'

  useEffect(() => {
    if (!authenticated) return
    const controller = new AbortController()
    const current = () => !controller.signal.aborted && store.getState().user.status === 'authenticated' &&
      store.getState().user.sessionEpoch === sessionEpoch
    getConversations({ signal: controller.signal }).then(data => {
      if (!current()) return
      dispatch(setConversations(data))
      setHistoryRequest({ epoch: sessionEpoch, retry, status: 'ready' })
    }).catch(() => {
      if (current()) setHistoryRequest({ epoch: sessionEpoch, retry, status: 'error' })
    })
    return () => controller.abort()
  }, [authenticated, sessionEpoch, retry, dispatch])

  // Release the native mobile modal before the desktop rail takes over.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)')
    const closeOnDesktop = () => { if (desktop.matches) onCloseMobile() }
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [onCloseMobile])

  const selectConversation = conversation => {
    if (isLoading) return
    dispatch(setSelectedConversation(conversation))
    dispatch(setMessages([]))
    dispatch(setArtifacts([]))
    dispatch(clearDraft())
    onCloseMobile()
  }
  const login = () => { onCloseMobile(); onLogin() }
  const openBilling = () => { onCloseMobile(); onOpenBilling() }
  const logout = () => { onCloseMobile(); onLogout() }
  const authDisabled = status === 'checking' || signingOut
  const planLabel = typeof userData?.plan === 'string' && userData.plan ? `${userData.plan} plan` : 'Plan unavailable'

  const content = <>
    <Button className="contour-new-conversation" onClick={() => selectConversation(null)} disabled={isLoading}>
      <Plus size={18} aria-hidden="true" />New conversation
    </Button>
    {authenticated
      ? <HistoryList conversations={conversations} selectedId={selectedConversation?._id} requestStatus={requestStatus}
          disabled={isLoading} onSelect={selectConversation} onRetry={() => setRetry(value => value + 1)} />
      : <div className="contour-history-empty">
          <History size={22} aria-hidden="true" />
          <strong>Your workspace, ready to explore</strong>
          <p>Choose a mode and compose a prompt. Sign in when you’re ready to send and save conversations.</p>
        </div>}
    <div className="contour-history-account">
      {authenticated ? <>
        <div className="contour-profile">
          <AccountAvatar user={userData} />
          <div><strong title={userData?.name}>{userData?.name || 'Your account'}</strong><small>{planLabel}</small></div>
        </div>
        <div className="contour-account-actions">
          <Button variant="ghost" onClick={openBilling}><Coins size={16} aria-hidden="true" />Plans & credits</Button>
          <IconButton label="Log out" onClick={logout}><LogOut size={17} /></IconButton>
        </div>
      </> : <Button onClick={login} disabled={authDisabled} className="contour-full-width">Log in</Button>}
    </div>
  </>

  return <>
    <nav className="contour-rail" aria-label="Workspace navigation">
      <span className="contour-brand" role="img" aria-label="SutrAI">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M23 8c-2-3-10-3-12 0s1 5 5 7 8 4 5 8-10 4-13 0M26 13c-2-3-10-3-12 0s1 5 5 7M6 17c2 3 10 3 12 0s-1-5-5-7" /></svg>
      </span>
      <IconButton label="New conversation" side="right" className="contour-new-icon" disabled={isLoading}
        onClick={() => selectConversation(null)}><Plus size={21} /></IconButton>
      <IconButton label={expanded ? 'Collapse conversation history' : 'Expand conversation history'} side="right"
        ref={historyToggle} aria-expanded={expanded} aria-controls="desktop-history" onClick={onToggleExpanded}>
        <History size={20} />
      </IconButton>
      <span className="contour-rail__spacer" />
      {authenticated ? <>
        <IconButton label="Plans and credits" side="right" onClick={openBilling}><Coins size={19} /></IconButton>
        <IconButton label="Open account and history controls" side="right" aria-expanded={expanded}
          aria-controls="desktop-history" onClick={onToggleExpanded}><AccountAvatar user={userData} /></IconButton>
      </> : <IconButton label="Log in" side="right" onClick={login} disabled={authDisabled}><User size={19} /></IconButton>}
    </nav>
    <aside id="desktop-history" className="contour-history-panel" aria-label="Conversation history" hidden={!expanded}
      onKeyDown={event => {
        if (event.key === 'Escape') { onToggleExpanded(); historyToggle.current?.focus() }
      }}>
      <div className="contour-history-heading">
        <h2>SutrAI</h2>
        <IconButton label="Collapse conversation history" onClick={onToggleExpanded}><PanelLeftClose size={18} /></IconButton>
      </div>
      {content}
    </aside>
    <Dialog id="mobile-history" open={mobileOpen} onClose={onCloseMobile} title="Conversation history" className="contour-dialog--history">
      {content}
    </Dialog>
  </>
}
