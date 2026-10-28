import { useEffect, useRef } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { X } from 'lucide-react'

export default function AuthDialog({ mode, busy, error, onClose, onContinue }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    element.showModal()
    return () => {
      element.close()
      previousFocus?.focus()
    }
  }, [])

  return (
    <dialog ref={dialog} aria-labelledby="auth-title" aria-describedby="auth-description"
      onCancel={event => { event.preventDefault(); onClose() }}
      onClick={event => { if (event.target === dialog.current) onClose() }}
      className="m-auto w-[90vw] max-w-[380px] rounded-2xl border border-white/[0.08] bg-[#13151c] p-7 text-white backdrop:bg-black/60 backdrop:backdrop-blur-sm">
      <div className="flex justify-between items-center gap-4">
        <h2 id="auth-title" className="text-[17px] font-semibold">{mode === 'signup' ? 'Join SutrAI' : 'Log in to SutrAI'}</h2>
        <button onClick={onClose} aria-label="Close sign-in" className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
      </div>
      <p id="auth-description" className="mt-3 text-[13px] text-slate-400">Sign in to send messages and save conversations. Your draft will stay here until you choose to send it.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      <button onClick={onContinue} disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-white py-3 text-sm font-medium text-black disabled:opacity-60">
        <FcGoogle size={17} />{busy ? 'Signing in…' : 'Continue with Google'}
      </button>
    </dialog>
  )
}
