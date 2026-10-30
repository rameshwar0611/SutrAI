import { Code2, FileText, Globe, ImageIcon, MessageSquare, Mic, MicOff, Paperclip, Presentation, Send, X, Zap } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import sendMessage from '../features/sendMessage'
import { useDispatch, useSelector } from 'react-redux'
import { addMessage, removeMessage, setArtifacts, setIsLoading } from '../redux/messageSlice'
import { createConversation } from '../features/createConversation'
import { addConversation, setConvTitle, setSelectedConversation } from '../redux/conversationSlice'
import { updateConversation } from '../features/updateConversation'
import { clearDraft, setDraftMode, setDraftText } from '../redux/workspaceSlice'
import { store } from '../redux/store'

function ChatInput({ onLogin }) {
  const { text: value, mode, resetKey } = useSelector(state => state.workspace)
  const { status, sessionEpoch, signingIn, signingOut } = useSelector(state => state.user)
  const { selectedConversation } = useSelector(state => state.conversation)
  const isLoading = useSelector(state => state.message.isLoading)
  const [attachment, setAttachment] = useState(null)
  const selectedFile = attachment?.resetKey === resetKey ? attachment.file : null
  const preview = selectedFile ? attachment.preview : null
  const [listening, setListening] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const recognitionRef = useRef(null)
  const fileRef = useRef(null)
  const requestRef = useRef(null)
  const dispatch = useDispatch()
  const busy = isLoading || signingIn || signingOut
  const setValue = text => dispatch(setDraftText(text))

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => () => requestRef.current?.abort(), [sessionEpoch, resetKey])
  useEffect(() => {
    if (busy) recognitionRef.current?.stop()
  }, [busy])
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.onresult = event => {
      let transcript = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        transcript += event.results[index][0].transcript
      }
      dispatch(setDraftText(transcript))
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    return () => { recognition.onresult = null; recognition.onend = null; recognition.abort() }
  }, [dispatch])

  const toggleMic = () => {
    if (!recognitionRef.current) {
      setFeedback('Speech recognition is not supported in this browser.')
      return
    }
    if (listening) recognitionRef.current.stop()
    else recognitionRef.current.start()
    setListening(!listening)
  }

  const handleFile = event => {
    const file = event.target.files[0]
    if (!file) return
    if ((file.type !== 'application/pdf' && !file.type.startsWith('image/')) || file.size > 20 * 1024 * 1024) {
      setFeedback('Choose a PDF or image up to 20 MB.')
      event.target.value = ''
      return
    }
    setAttachment({ file, resetKey, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
    setFeedback(null)
  }

  const handleSendMessage = async () => {
    if (busy || requestRef.current || (!value.trim() && !selectedFile)) return
    if (status === 'checking') {
      setFeedback('Please wait while your session is checked. Your draft is safe.')
      return
    }
    if (status !== 'authenticated') { onLogin(); return }
    const controller = new AbortController()
    requestRef.current = controller
    const current = () => !controller.signal.aborted &&
      store.getState().user.sessionEpoch === sessionEpoch &&
      store.getState().user.status === 'authenticated'
    const clientId = crypto.randomUUID()
    dispatch(setIsLoading(true))
    setFeedback(null)
    try {
      let conversation = selectedConversation
      if (!conversation) {
        conversation = await createConversation({ signal: controller.signal })
        if (!current()) return
        dispatch(setSelectedConversation(conversation))
        dispatch(addConversation(conversation))
      }
      if (conversation.title === 'New Chat') {
        const title = value.trim() || selectedFile.name
        await updateConversation({ id: conversation._id, title }, { signal: controller.signal })
        if (!current()) return
        dispatch(setConvTitle({ conversationId: conversation._id, title: title.slice(0, 40) }))
      }
      const formData = new FormData()
      formData.append('prompt', value.trim())
      formData.append('conversationId', conversation._id)
      formData.append('agent', mode)
      if (selectedFile) formData.append('file', selectedFile)
      dispatch(addMessage({ clientId, role: 'user', content: value.trim() }))
      const data = await sendMessage(formData, { signal: controller.signal })
      if (!current()) return
      dispatch(setArtifacts(data.artifacts || []))
      dispatch(addMessage({ role: 'assistant', content: data.answer, images: data.images }))
      dispatch(clearDraft())
    } catch (error) {
      if (!current()) return
      dispatch(removeMessage(clientId))
      setFeedback(error.code === 'AUTH_REQUIRED' ? 'Please sign in to send your draft.' :
        'The request could not be completed. Your draft is preserved; check the conversation before retrying.')
    } finally {
      if (store.getState().user.sessionEpoch === sessionEpoch) dispatch(setIsLoading(false))
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  const agents = [
    {
      id: "auto",
      icon: Zap,
      label: "Auto"
    },

    {
      id: "chat",
      icon: MessageSquare,
      label: "Chat"
    },

    {
      id: "coding",
      icon: Code2,
      label: "Coding"
    },

    {
      id: "pdf",
      icon: FileText,
      label: "PDF"
    },

    {
      id: "ppt",
      icon: Presentation,
      label: "PPT"
    },

    {
      id: "vision",
      icon: ImageIcon,
      label: "Vision"
    },

    {
      id: "search",
      icon: Globe,
      label: "Search"
    }

  ]

  return (
    <div className='w-full overflow-hidden px-3 md:px-5 py-4 border-t border-white/[0.06] bg-[#0d0f14]'>
      <div className='flex flex-col gap-2 bg-white/[0.03] border border-white/[0.07] rounded-2xl px-4 pt-3.5 pb-3'>

        <div className='flex w-[80%] gap-2 pr-2 flex-wrap'>
          {agents.map((agent) => {
            const isActive = mode === agent.id
            const Icon = agent.icon
            return (
              <button key={agent.id} disabled={busy} aria-pressed={isActive}
                onClick={() => dispatch(setDraftMode(agent.id))}
                className={`
            flex-shrink-0
            cursor-pointer
            inline-flex
            items-center
            gap-1.5
            px-3
            py-2
            rounded-full
            text-xs
            font-medium
            border
            transition-all

            ${isActive
                    ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white border-transparent shadow-[0_1px_8px_rgba(99,102,241,.35)]"
                    : "bg-white/[0.03] text-slate-400 border-white/[0.06] hover:bg-white/[0.07]"
                  }
          `}>

                <Icon size={14}
                  className={
                    isActive
                      ? "text-white"
                      : "text-slate-500"
                  } />

                {agent.label}

              </button>
            )

          })}
        </div>

        {
          selectedFile && <div className='my-3'>

            <div className='inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2'>
              {
                selectedFile?.type === "application/pdf" ? <FileText size={16}

                  className="text-red-400"
                /> : selectedFile.type.startsWith("image/") && <img src={preview} alt="Selected attachment" className="h-10 w-10 rounded-xl object-cover mt-3"
                />
              }

              <div>
                <p className='text-xs text-white'>
                  {selectedFile?.name}
                </p>
                <p className='text-[10px] text-slate-500'>
                  {Math.ceil(selectedFile.size / 1024)} KB
                </p>

              </div>
              <button className='ml-2' disabled={busy} aria-label="Remove attachment" onClick={() => { setAttachment(null); fileRef.current.value = "" }}><X size={14} className='text-slate-500 hover:text-white' /></button>
            </div>


          </div>
        }


        {feedback && <p role="alert" className="text-xs text-red-300">{feedback}</p>}
        {status !== "authenticated" && <p className="text-[11px] text-slate-500">Explore freely. Sign in when you are ready to send. Attachments stay in this tab until reload.</p>}
        <textarea id="chat-prompt" aria-label="Message" disabled={busy}
          placeholder='Ask Anything...'
          onChange={(e) => setValue(e.target.value)}
          value={value}
          className="w-full bg-transparent outline-none resize-none text-[14px] text-slate-200 placeholder:text-slate-600 leading-relaxed [scrollbar-width:none] [&::-webkit-scrollbar]:hidden disabled:opacity-50"
          rows={3}
        />
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-1'>

            <input key={resetKey} type="file" aria-label="Attach PDF or image" disabled={busy} accept=".pdf,image/*" hidden ref={fileRef} onChange={handleFile} />

            <button aria-label="Attach file" disabled={busy} className='flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-all duration-150 bg-transparent cursor-pointer' onClick={() => fileRef.current.click()}>
              <Paperclip size={16} />
            </button>
            <button
              aria-label={listening ? "Stop dictation" : "Start dictation"} disabled={busy}
              onClick={toggleMic}
              className={`flex items-center justify-center w-8 h-8 rounded-lg  transition-all duration-150 cursor-pointer ${listening ?"bg-red-500 text-white":"text-slate-600 hover:bg-white/[0.05]" }`}>
             {listening?<Mic size={16} />:<MicOff size={16}/>} 
            </button>
          </div>
          <button
            aria-label="Send message" disabled={busy || (!value.trim() && !selectedFile)}
            onClick={handleSendMessage}
            className={`flex items-center justify-center w-8 h-8 rounded-lg border-none cursor-pointer transition-all duration-150 ${value.trim() ? "bg-linear-to-br from-indigo-500 to-violet-700 hover:opacity-90 text-white" : "bg-white/[0.05] text-slate-600 cursor-not-allowed"}`}>
          <Send size={15} />
        </button>
      </div>
    </div>
    </div >
  )
}

export default ChatInput
