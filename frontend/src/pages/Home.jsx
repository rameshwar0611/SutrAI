import { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { requestLogin } from '../redux/userSlice'
import SideBar from '../components/SideBar'
import ChatArea from '../components/ChatArea'
import Artifact from '../components/Artifact'
import AuthDialog from '../components/AuthDialog'
import BillingDrawer from '../components/BillingDrawer'
import Nav from '../components/Nav'
import WorkspaceShell from '../components/workspace/WorkspaceShell'
import Button from '../components/ui/Button'
import StatusBanner from '../components/ui/StatusBanner'
import useAccountBalance from '../hooks/useAccountBalance'

export default function Home({ authFlow }) {
  const { status, sessionEpoch, dialogMode, signingIn, error, errorKind, dialogError } = useSelector(state => state.user)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [mobileHistoryOwner, setMobileHistoryOwner] = useState(null)
  const [billingOwner, setBillingOwner] = useState(null)
  const artifacts = useSelector(state => state.message.artifacts)
  const artifactRef = useRef(null)
  const artifactTrigger = useRef(null)
  const balance = useAccountBalance()
  const refreshBalance = balance.refresh
  const sending = useSelector(state => state.message.isLoading)
  const wasSending = useRef(false)
  useEffect(() => {
    if (wasSending.current && !sending) refreshBalance()
    wasSending.current = sending
  }, [sending, refreshBalance])
  const hasArtifact = status === 'authenticated' && Array.isArray(artifacts) && artifacts.length > 0
  const mobileHistoryOpen = mobileHistoryOwner === sessionEpoch
  const closeMobileHistory = useCallback(() => setMobileHistoryOwner(null), [])
  const dispatch = useDispatch()
  const onLogin = (mode = 'login') => dispatch(requestLogin(mode))
  const openBilling = () => { if (status === 'authenticated') { setBillingOwner(sessionEpoch); balance.refresh() } }
  return (
    <WorkspaceShell
      navigation={<SideBar onLogin={onLogin} onLogout={authFlow.logout} onOpenBilling={openBilling}
        expanded={historyExpanded} onToggleExpanded={() => setHistoryExpanded(value => !value)}
        mobileOpen={mobileHistoryOpen} onCloseMobile={closeMobileHistory} />}
      header={<Nav onLogin={onLogin} onOpenHistory={() => setMobileHistoryOwner(sessionEpoch)}
        historyOpen={mobileHistoryOpen} onOpenBilling={openBilling} hasArtifact={hasArtifact}
        artifactTrigger={artifactTrigger} onOpenArtifact={() => artifactRef.current?.open()} />}
      status={<>
        {status === 'checking' && <StatusBanner>Checking your session… You can keep drafting.</StatusBanner>}
        {status === 'error' && !dialogMode && <StatusBanner tone="error">
          <span>{error}</span><Button variant="ghost" onClick={errorKind === 'logout' ? authFlow.logout : authFlow.checkSession}>Retry</Button>
        </StatusBanner>}
      </>}
      artifact={status === 'authenticated' && <Artifact ref={artifactRef} onRestoreFocus={() => artifactTrigger.current?.focus({ preventScroll: true })} />}
      overlays={<>
        {status === 'authenticated' && <BillingDrawer key={sessionEpoch}
          open={billingOwner === sessionEpoch} onClose={() => setBillingOwner(null)} balance={balance} />}
        {dialogMode && <AuthDialog mode={dialogMode} busy={signingIn} error={dialogError}
          onClose={authFlow.dismissLogin} onContinue={authFlow.login} />}
      </>}>
      <ChatArea onLogin={onLogin} onOpenArtifact={() => artifactRef.current?.open()} onOpenBilling={openBilling} />
    </WorkspaceShell>
  )
}
