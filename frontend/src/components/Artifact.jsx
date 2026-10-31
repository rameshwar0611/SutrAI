import { Component, lazy, Suspense, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Check, Code2, Copy, Eye, FileCode2, LockKeyhole, PanelRightClose, PanelRightOpen, X } from 'lucide-react'
import { useSelector } from 'react-redux'
import Button from './ui/Button'
import IconButton from './ui/IconButton'
import useClipboard from '../hooks/useClipboard'
import { artifactFiles, artifactLanguage, artifactPreview } from '../utils/artifacts'

const Editor = lazy(() => import('./workspace/ArtifactEditor'))

class EditorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <div className="contour-artifact-state" role="alert"><strong>The code editor couldn’t load.</strong>
          <p>You can still select the file contents below or use Copy code.</p>
          <pre tabIndex={0} aria-label="Read-only file contents">{this.props.file.content}</pre></div>
      : this.props.children
  }
}

function CopyFile({ file }) {
  const { copy, status } = useClipboard()
  return <>
    <IconButton label="Copy artifact code" tooltip={false} disabled={!file?.content} onClick={() => copy(file.content)}>
      {status === 'copied' ? <Check size={17} /> : <Copy size={17} />}
    </IconButton>
    {status === 'copied' && <span className="contour-artifact-copy-feedback" role="status">File copied.</span>}
    {status === 'error' && <span className="contour-artifact-copy-feedback contour-artifact-copy-feedback--error" role="alert">Copy failed. Select the code to copy it.</span>}
  </>
}

function Preview({ document, title }) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  return <div className="contour-artifact-preview">
    {loading && <p className="contour-artifact-preview-loading" role="status">Loading preview…</p>}
    {failed && <p className="contour-artifact-preview-loading" role="alert">Preview unavailable. Switch to Code to inspect the files.</p>}
    <iframe title={`${title} — sandboxed preview`} srcDoc={document} sandbox="allow-scripts" referrerPolicy="no-referrer"
      onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true) }} />
  </div>
}

function ArtifactWorkspace({ artifact, ref, onRestoreFocus }) {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1101px)').matches)
  const [open, setOpen] = useState(desktop)
  const [tab, setTab] = useState('code')
  const [selection, setSelection] = useState(null)
  const panel = useRef(null)
  const heading = useRef(null)
  const fileButtons = useRef([])
  const viewButtons = useRef([])
  const modal = useRef(false)
  const previousFocus = useRef(null)
  const id = useId()
  const files = artifactFiles(artifact)
  const title = typeof artifact?.title === 'string' && artifact.title.trim() ? artifact.title : 'Generated artifact'
  const selectedIndex = files.findIndex((file, index) => `${index}:${file.name}` === selection)
  const active = selectedIndex < 0 ? 0 : selectedIndex
  const file = files[active]
  const preview = artifactPreview(files)
  const view = tab === 'preview' && preview ? 'preview' : 'code'
  const language = artifactLanguage(file?.name)
  const languageLabel = { html: 'HTML', css: 'CSS', javascript: 'JavaScript', typescript: 'TypeScript', json: 'JSON',
    python: 'Python', java: 'Java', cpp: 'C++', c: 'C', plaintext: 'Text' }[language]

  useImperativeHandle(ref, () => ({ open: () => {
    previousFocus.current = document.activeElement
    setOpen(true)
    if (panel.current?.open) heading.current?.focus({ preventScroll: true })
  } }), [])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1101px)')
    const update = () => setDesktop(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useLayoutEffect(() => {
    const element = panel.current
    const focus = document.activeElement
    const inside = element.contains(focus)
    if (element.open) element.close()
    modal.current = !desktop
    if (open) {
      if (desktop) element.show()
      else element.showModal()
      if (inside && focus.isConnected) focus.focus({ preventScroll: true })
      else if (!desktop) heading.current?.focus({ preventScroll: true })
      else if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true })
    }
    return () => { if (element.open) element.close() }
  }, [desktop, open])

  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => {
      if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
      else onRestoreFocus()
    })
  }
  const keyboardTabs = (event, index, buttons, select) => {
    const last = buttons.current.filter(Boolean).length - 1
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % (last + 1)
    if (event.key === 'ArrowLeft') next = (index + last) % (last + 1)
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = last
    if (next === undefined) return
    event.preventDefault()
    select(next)
    buttons.current[next]?.focus({ preventScroll: true })
    buttons.current[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  return <>
    {!open && desktop && <aside className="contour-artifact-rail" aria-label="Collapsed artifact">
      <IconButton label="Reopen artifact" onClick={() => { previousFocus.current = document.activeElement; setOpen(true) }}><PanelRightOpen size={18} /></IconButton>
      <span title={title}>{title}</span>
    </aside>}
    <dialog ref={panel} id="artifact-workspace" className="contour-artifact-panel" data-desktop={desktop}
      aria-label="Artifact workspace" aria-modal={!desktop && open ? true : undefined}
      onCancel={event => { event.preventDefault(); close() }}
      onKeyDown={event => { if (desktop && event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close() } }}
      onClick={event => {
        if (!modal.current || event.target !== event.currentTarget) return
        const bounds = panel.current.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close()
      }}>
      <div className="contour-artifact-header">
        <Code2 size={20} aria-hidden="true" />
        <div><h2 ref={heading} tabIndex={-1} title={title}>{title}</h2>
          <p>Generated files · {files.length} {files.length === 1 ? 'file' : 'files'}</p></div>
        <div className="contour-artifact-actions">
          <CopyFile key={`${active}:${file?.name}`} file={file} />
          <IconButton label={desktop ? 'Collapse artifact' : 'Close artifact'} tooltip={false} onClick={close}>
            {desktop ? <PanelRightClose size={18} /> : <X size={19} />}
          </IconButton>
        </div>
      </div>
      <div className="contour-artifact-view-tabs">
        <div role="tablist" aria-label="Artifact view">
          {['code', ...(preview ? ['preview'] : [])].map((name, index) => <Button key={name} ref={node => { viewButtons.current[index] = node }}
            role="tab" id={`${id}-${name}-tab`} aria-selected={view === name} aria-controls={`${id}-${name}-panel`}
            tabIndex={view === name ? 0 : -1} variant="ghost" onClick={() => setTab(name)}
            onKeyDown={event => keyboardTabs(event, index, viewButtons, next => setTab(next === 0 ? 'code' : 'preview'))}>
            {name === 'code' ? <Code2 size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}{name === 'code' ? 'Code' : 'Preview'}
          </Button>)}
        </div><span>Read only</span>
      </div>
      {view === 'code' ? <div id={`${id}-code-panel`} role="tabpanel" aria-labelledby={`${id}-code-tab`} className="contour-artifact-code-panel">
        {files.length > 0 && <div className="contour-artifact-file-tabs" role="tablist" aria-label="Artifact files">
          {files.map((item, index) => <button key={`${index}:${item.name}`} ref={node => { fileButtons.current[index] = node }}
            type="button" role="tab" id={`${id}-file-${index}`} title={item.name} aria-selected={active === index}
            aria-controls={`${id}-file-panel`} tabIndex={active === index ? 0 : -1}
            onClick={() => setSelection(`${index}:${item.name}`)}
            onKeyDown={event => keyboardTabs(event, index, fileButtons, next => setSelection(`${next}:${files[next].name}`))}>{item.name}</button>)}
        </div>}
        <div className="contour-artifact-editor" id={`${id}-file-panel`} role={file ? 'tabpanel' : undefined}
          aria-labelledby={file ? `${id}-file-${active}` : undefined}>
          {!file ? <div className="contour-artifact-state" role="status"><FileCode2 size={28} aria-hidden="true" /><strong>No files were returned</strong><p>You can keep chatting and ask for the files again.</p></div>
            : file.content === null ? <div className="contour-artifact-state" role="alert"><strong>This file’s contents are unavailable.</strong><p>Select another file or ask SutrAI to generate it again.</p></div>
            : !file.content ? <div className="contour-artifact-state" role="status"><strong>This file is empty.</strong><p>Select another file to inspect its contents.</p></div>
            : open && <EditorBoundary key={`${active}:${file.name}`} file={file}><Suspense fallback={<p className="contour-artifact-state" role="status">Loading code editor…</p>}>
              <Editor file={file} language={language} />
            </Suspense></EditorBoundary>}
        </div>
      </div> : <div id={`${id}-preview-panel`} role="tabpanel" aria-labelledby={`${id}-preview-tab`} className="contour-artifact-preview-panel">
        {open && <Preview key={preview} document={preview} title={title} />}
        <p className="contour-artifact-preview-note">Sandboxed preview · External scripts and API calls are blocked. If blank, inspect Code.</p>
      </div>}
      <footer className="contour-artifact-footer"><LockKeyhole size={13} aria-hidden="true" /><span>Read-only artifact</span>
        <span>{view === 'preview' ? 'HTML / CSS / JavaScript' : languageLabel}</span></footer>
    </dialog>
  </>
}

export default function Artifact({ ref, onRestoreFocus }) {
  const artifacts = useSelector(state => state.message.artifacts)
  const { sessionEpoch } = useSelector(state => state.user)
  const conversationId = useSelector(state => state.conversation.selectedConversation?._id)
  if (!Array.isArray(artifacts) || !artifacts.length) return null
  return <ArtifactWorkspace key={`${sessionEpoch}:${conversationId}`} ref={ref} artifact={artifacts[0]} onRestoreFocus={onRestoreFocus} />
}
