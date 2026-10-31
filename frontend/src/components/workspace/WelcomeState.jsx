import { ArrowUpRight, Code2, FileText, MessageSquare } from 'lucide-react'
import { useDispatch, useSelector } from 'react-redux'
import { setDraftMode, setDraftText } from '../../redux/workspaceSlice'
import Button from '../ui/Button'

const suggestions = [
  { icon: Code2, prompt: 'Build a reading-list page', mode: 'coding' },
  { icon: MessageSquare, prompt: 'Explain Redis with an example', mode: 'chat' },
  { icon: FileText, prompt: 'Summarize a product brief', mode: 'auto' },
]

export default function WelcomeState() {
  const { status, userData } = useSelector(state => state.user)
  const isLoading = useSelector(state => state.message.isLoading)
  const dispatch = useDispatch()
  const member = status === 'authenticated'
  const firstName = typeof userData?.name === 'string' ? userData.name.trim().split(/\s+/)[0] : ''
  return <section className="contour-welcome" aria-label={member ? 'New conversation' : 'Guest workspace'}>
    <div className="contour-welcome-copy">
      <div className="contour-welcome-mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M23 8c-2-3-10-3-12 0s1 5 5 7 8 4 5 8-10 4-13 0M26 13c-2-3-10-3-12 0s1 5 5 7M6 17c2 3 10 3 12 0s-1-5-5-7" /></svg></div>
      <p className="contour-welcome-eyebrow">{member ? 'A fresh conversation' : 'Room to think. Tools to create.'}</p>
      <h2>{member ? <>A fresh start{firstName ? ',' : '.'}{firstName && <><br /><em>{firstName}.</em></>}</> : <>What will you<br /><em>make today?</em></>}</h2>
      <p className="contour-welcome-description">{member ? 'Pick up a thought, work through a question, or create something new.' : <>Think through a question. Build something useful.<br />Start a conversation with SutrAI.</>}</p>
    </div>
    <div className="contour-suggestions">
      {suggestions.map(({ icon: Icon, prompt, mode }) => <Button key={prompt} variant="ghost" disabled={isLoading}
        onClick={() => {
          dispatch(setDraftText(prompt))
          dispatch(setDraftMode(mode))
          document.getElementById('chat-prompt')?.focus()
        }}><Icon size={17} aria-hidden="true" /><span>{prompt}</span><ArrowUpRight size={14} aria-hidden="true" /></Button>)}
    </div>
  </section>
}
