import { useDispatch, useSelector } from 'react-redux'
import { requestLogin } from '../redux/userSlice'
import SideBar from '../components/SideBar'
import ChatArea from '../components/ChatArea'
import Artifact from '../components/Artifact'
import AuthDialog from '../components/AuthDialog'

export default function Home({ authFlow }) {
  const { status, dialogMode, signingIn, signingOut, error, errorKind, dialogError } = useSelector(state => state.user)
  const dispatch = useDispatch()
  const onLogin = (mode = 'login') => dispatch(requestLogin(mode))
  return (
    <div className="flex h-screen overflow-hidden bg-[#0d0f14] text-white">
      <SideBar onLogin={onLogin} onLogout={authFlow.logout} />
      <div className="flex min-w-0 flex-1 flex-col">
        {status !== 'authenticated' && <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-white/[0.06] px-4 pl-16">
          <button onClick={() => onLogin('login')} disabled={status === 'checking' || signingOut}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/[0.05] disabled:opacity-50">Log in</button>
          <button onClick={() => onLogin('signup')} disabled={status === 'checking' || signingOut}
            className="rounded-lg bg-linear-to-br from-indigo-500 to-violet-700 px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">Sign up</button>
        </header>}
        {status === 'checking' && <p role="status" className="px-5 py-2 text-xs text-slate-500">Checking your session… You can keep drafting.</p>}
        {status === 'error' && !dialogMode && <div role="alert" className="flex items-center gap-3 px-5 py-2 text-sm text-amber-200">
          <span>{error}</span><button className="shrink-0 underline" onClick={errorKind === 'logout' ? authFlow.logout : authFlow.checkSession}>Retry</button>
        </div>}
        <ChatArea onLogin={onLogin} />
      </div>
      {status === 'authenticated' && <Artifact />}
      {dialogMode && <AuthDialog mode={dialogMode} busy={signingIn} error={dialogError}
        onClose={authFlow.dismissLogin} onContinue={authFlow.login} />}
    </div>
  )
}
