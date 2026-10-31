import { ArrowUp, Mic, MicOff, Paperclip } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useState, useRef } from 'react'
import sendMessage from '../features/sendMessage'
import { useDispatch, useSelector } from 'react-redux'
import { addMessage, removeMessage, setArtifacts, setIsLoading } from '../redux/messageSlice'
import { createConversation } from '../features/createConversation'
import { addConversation, setConvTitle, setSelectedConversation } from '../redux/conversationSlice'
import { updateConversation } from '../features/updateConversation'
import { clearDraft, setDraftMode, setDraftText } from '../redux/workspaceSlice'
import { store } from '../redux/store'
import Button from './ui/Button'
import IconButton from './ui/IconButton'
import StatusBanner from './ui/StatusBanner'
import ModeSelector from './workspace/ModeSelector'
import AttachmentChip from './workspace/AttachmentChip'

function ChatInput({ onLogin, onOpenBilling }) {
  const { text: value, mode, resetKey } = useSelector(state => state.workspace)
  const { status, sessionEpoch, signingIn, signingOut, dialogMode } = useSelector(state => state.user)
  const { selectedConversation } = useSelector(state => state.conversation)
  const isLoading = useSelector(state => state.message.isLoading)
  const credits = useSelector(state => state.user.userData?.credits)
  const [attachment, setAttachment] = useState(null)
  const selectedFile = attachment?.resetKey === resetKey ? attachment.file : null
  const preview = selectedFile ? attachment.preview : null
  const [speechSupported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition))
  const [voiceState, setVoiceState] = useState('idle')
  const [voiceFeedback, setVoiceFeedback] = useState(null)
  const [fileError, setFileError] = useState(null)
  const fileErrorId = useId()
  const voiceFeedbackId = useId()
  const voiceActive = useRef(false)
  const voiceFailed = useRef(false)
  const busyRef = useRef(false)
  const [feedback, setFeedback] = useState(null)
  const [creditFailure, setCreditFailure] = useState(false)
  const recognitionRef = useRef(null)
  const fileRef = useRef(null)
  const promptRef = useRef(null)
  const requestRef = useRef(null)
  const dispatch = useDispatch()
  const busy = isLoading || signingIn || signingOut
  const voiceBlocked = busy || !!dialogMode
  const setValue = text => dispatch(setDraftText(text))
  const listening = voiceState === 'starting' || voiceState === 'listening'
  const voiceText = voiceFeedback?.text || (!speechSupported ? 'Voice input isn’t supported in this browser. You can keep typing.' : '')
  const inConversation = status === 'authenticated' && !!selectedConversation
  useLayoutEffect(() => {
    const element = promptRef.current
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [value, inConversation])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => () => requestRef.current?.abort(), [sessionEpoch, resetKey])
  useEffect(() => {
    busyRef.current = voiceBlocked
    if (voiceBlocked && voiceActive.current) {
      voiceActive.current = false
      try { recognitionRef.current?.stop() } catch {
        try { recognitionRef.current?.abort() } catch { /* The browser may already have ended recognition. */ }
      }
    }
  }, [voiceBlocked])

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    let recognition
    try { recognition = new SpeechRecognition() } catch {
      const frame = requestAnimationFrame(() => {
        setVoiceState('error')
        setVoiceFeedback({ error: true, text: 'Voice input could not initialize. You can keep typing.' })
      })
      return () => cancelAnimationFrame(frame)
    }
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.onstart = () => {
      if (!voiceActive.current || busyRef.current) {
        try { recognition.stop() } catch { recognition.abort() }
        return
      }
      setVoiceState('listening')
      setVoiceFeedback({ text: 'Listening… Speak now.' })
    }
    recognition.onresult = event => {
      if (!voiceActive.current || busyRef.current) return
      let transcript = ''
      for (let index = event.resultIndex; index < event.results.length; index++) {
        transcript += event.results[index][0].transcript
      }
      dispatch(setDraftText(transcript))
    }
    recognition.onend = () => {
      voiceActive.current = false
      setVoiceState(voiceFailed.current ? 'error' : 'idle')
      if (!voiceFailed.current) setVoiceFeedback({ text: 'Dictation stopped. You can keep typing.' })
    }
    recognition.onerror = event => {
      voiceActive.current = false
      if (event.error === 'aborted') {
        setVoiceState('idle')
        setVoiceFeedback({ text: 'Dictation stopped. You can keep typing.' })
        return
      }
      voiceFailed.current = true
      const errors = {
        'not-allowed': 'Microphone access was denied. Allow microphone access in your browser, then try again.',
        'service-not-allowed': 'Microphone access was denied. Allow microphone access in your browser, then try again.',
        'audio-capture': 'No microphone is available. Check your device and try again.',
        'network': 'Dictation could not connect. Check your connection and try again.',
        'no-speech': 'No speech was detected. Try dictation again.',
      }
      setVoiceState('error')
      setVoiceFeedback({ error: true, text: errors[event.error] || 'Dictation could not be completed. Try again or keep typing.' })
    }
    recognitionRef.current = recognition
    return () => {
      voiceActive.current = false
      recognition.onstart = null
      recognition.onresult = null
      recognition.onend = null
      recognition.onerror = null
      recognition.abort()
      recognitionRef.current = null
    }
  }, [dispatch])

  const toggleMic = () => {
    const recognition = recognitionRef.current
    if (!recognition) {
      setVoiceFeedback({ error: true, text: 'Voice input is unavailable. You can keep typing.' })
      return
    }
    if (voiceActive.current) {
      voiceActive.current = false
      setVoiceState('stopping')
      setVoiceFeedback({ text: 'Stopping dictation…' })
      try { recognition.stop() } catch {
        setVoiceState('idle')
        setVoiceFeedback({ text: 'Dictation stopped. You can keep typing.' })
      }
      return
    }
    voiceFailed.current = false
    voiceActive.current = true
    setVoiceState('starting')
    setVoiceFeedback({ text: 'Starting dictation…' })
    try { recognition.start() } catch (error) {
      voiceActive.current = false
      voiceFailed.current = true
      setVoiceState('error')
      setVoiceFeedback({ error: true, text: error.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow microphone access in your browser, then try again.'
        : 'Dictation could not start. Try again or keep typing.' })
    }
  }

  const openFilePicker = () => { fileRef.current.value = ''; fileRef.current.click() }
  const removeAttachment = () => { setAttachment(null); setFileError(null); fileRef.current.value = '' }
  const handleFile = event => {
    const file = event.target.files[0]
    if (!file) return
    const unchanged = selectedFile ? ' Your current attachment is unchanged.' : ''
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      setFileError(`This file type isn’t supported. Choose a PDF or image.${unchanged}`)
      event.target.value = ''
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setFileError(`This file is larger than 20 MB. Choose a smaller PDF or image.${unchanged}`)
      event.target.value = ''
      return
    }
    try {
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      setAttachment({ file, resetKey, preview })
      setFileError(null)
      setFeedback(null)
    } catch {
      setFileError(`The image preview could not be prepared. Select the file again.${unchanged}`)
      event.target.value = ''
    }
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
    setCreditFailure(false)
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
      setCreditFailure(/not enough credits|insufficient credits/i.test(error.response?.data?.message || ''))
      setFeedback(error.code === 'AUTH_REQUIRED' ? 'Please sign in to send your draft.' :
        'The request could not be completed. Your draft is preserved; check the conversation before retrying.')
    } finally {
      if (store.getState().user.sessionEpoch === sessionEpoch) dispatch(setIsLoading(false))
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  return (
    <section className={`contour-composer-dock ${inConversation ? '' : 'contour-composer-dock--welcome'}`} aria-label="Prompt composer">
      <div className="contour-composer-width">
        {status === 'authenticated' && (credits === 0 || creditFailure) && <StatusBanner>
          <span>{creditFailure ? 'The server reported insufficient credits.' : 'No available credits in your last account snapshot.'} Your draft stays here.</span>
          <Button variant="ghost" onClick={onOpenBilling}>View plans & credits</Button>
        </StatusBanner>}
        {fileError && <StatusBanner id={fileErrorId} tone="error">{fileError}</StatusBanner>}
        {feedback && <StatusBanner tone="error">{feedback}</StatusBanner>}
        <div className="contour-composer">
          {selectedFile && <AttachmentChip file={selectedFile} preview={preview} disabled={busy}
            onRemove={removeAttachment} onReplace={openFilePicker} />}
          <textarea ref={promptRef} id="chat-prompt" aria-label="Message" disabled={busy}
            placeholder={inConversation ? 'Ask a follow-up…' : 'Where would you like to begin?'}
            onChange={event => setValue(event.target.value)} value={value} rows={inConversation ? 1 : 3} />
          <div className="contour-composer-bottom">
            <div className="contour-composer-controls">
              <input key={resetKey} type="file" aria-label="Attach PDF or image" disabled={busy} accept=".pdf,image/*" hidden ref={fileRef} aria-invalid={!!fileError} aria-describedby={fileError ? fileErrorId : undefined} onChange={handleFile} />
              <IconButton label="Attach file" tooltip={false} disabled={busy} onClick={openFilePicker} aria-describedby={fileError ? fileErrorId : undefined}><Paperclip size={17} /></IconButton>
              <IconButton label={!speechSupported ? 'Dictation unavailable' : listening ? 'Stop dictation' : 'Start dictation'} tooltip={false}
                disabled={busy || !speechSupported || voiceState === 'stopping'} aria-pressed={listening}
                aria-describedby={voiceText ? voiceFeedbackId : undefined} aria-busy={voiceState === 'starting' || voiceState === 'stopping' || undefined}
                className={listening ? 'contour-listening' : ''} onClick={toggleMic}>{listening ? <MicOff size={17} /> : <Mic size={17} />}</IconButton>
              <ModeSelector value={mode} onChange={id => dispatch(setDraftMode(id))} disabled={busy} />
            </div>
            <Button variant="ghost" className="contour-send" aria-label="Send message" disabled={busy || (!value.trim() && !selectedFile)} onClick={handleSendMessage}>
              <span><ArrowUp size={17} aria-hidden="true" /></span>
            </Button>
          </div>
          {voiceText && <p id={voiceFeedbackId} className={`contour-voice-feedback ${voiceFeedback?.error ? 'contour-voice-feedback--error' : ''}`}
            role={voiceFeedback?.error ? 'alert' : 'status'}>{listening && <span className="contour-voice-dot" aria-hidden="true" />}{voiceText}</p>}
        </div>
        <p className="contour-composer-disclaimer">{status === 'authenticated'
          ? 'AI can make mistakes. Check important details.' : 'Explore freely. Sign in when you’re ready to send.'}</p>
      </div>
    </section>
  )
}

export default ChatInput
