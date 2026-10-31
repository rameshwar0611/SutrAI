import { useId } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { LockKeyhole } from 'lucide-react'
import Button from './ui/Button'
import Dialog from './ui/Dialog'

export default function AuthDialog({ mode, busy, error, onClose, onContinue }) {
  const descriptionId = useId()
  const signup = mode === 'signup'
  const recovery = error && /cancelled|session expired/i.test(error)
  return <Dialog open title={signup ? 'A space for your ideas.' : 'Welcome back.'}
    onClose={onClose} closeLabel="Close sign-in" descriptionId={descriptionId} className="contour-auth-dialog"
    intro={<>
      <div className="contour-auth-brand" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M23 8c-2-3-10-3-12 0s1 5 5 7 8 4 5 8-10 4-13 0M26 13c-2-3-10-3-12 0s1 5 5 7M6 17c2 3 10 3 12 0s-1-5-5-7" /></svg></div>
      <p className="contour-auth-eyebrow">{signup ? 'Join SutrAI' : 'Continue with SutrAI'}</p>
    </>}>
    <p id={descriptionId} className="contour-auth-description">Sign in to send messages and keep your conversations together. You can keep exploring before you decide.</p>
    {error && <div className={`contour-auth-feedback ${recovery ? 'contour-auth-feedback--neutral' : ''}`}
      role={recovery ? 'status' : 'alert'}>{error}</div>}
    <Button className="contour-google-action" busy={busy} onClick={onContinue}>
      {busy ? <span className="contour-auth-spinner" aria-hidden="true" /> : <FcGoogle size={18} aria-hidden="true" />}
      {busy ? 'Signing in…' : 'Continue with Google'}
    </Button>
    {busy && <span className="sr-only" role="status">Signing in with Google and confirming your session.</span>}
    <Button variant="ghost" className="contour-auth-explore" onClick={onClose}>Keep exploring</Button>
    <div className="contour-auth-reassurance"><LockKeyhole size={15} aria-hidden="true" /><span>Your draft stays here.<br />You choose when to send.</span></div>
  </Dialog>
}
