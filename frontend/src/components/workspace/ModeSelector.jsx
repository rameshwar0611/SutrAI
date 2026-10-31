import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Code2, FileText, Globe, ImageIcon, MessageSquare, Presentation, Zap } from 'lucide-react'
import Button from '../ui/Button'

const modes = [
  { id: 'auto', label: 'Auto', description: 'Choose the right workflow', icon: Zap },
  { id: 'chat', label: 'Chat', description: 'Think through a question', icon: MessageSquare },
  { id: 'coding', label: 'Coding', description: 'Build, explain or review code', icon: Code2 },
  { id: 'pdf', label: 'PDF', description: 'Generate a document', icon: FileText },
  { id: 'ppt', label: 'PPT', description: 'Create a presentation', icon: Presentation },
  { id: 'vision', label: 'Vision', description: 'Generate an image', icon: ImageIcon },
  { id: 'search', label: 'Search', description: 'Find information on the web', icon: Globe },
]

export default function ModeSelector({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState(null)
  const trigger = useRef(null)
  const menu = useRef(null)
  const items = useRef([])
  const menuId = useId()
  const selected = modes.find(mode => mode.id === value) || modes[0]
  const Icon = selected.icon
  const expanded = open && !disabled

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) trigger.current?.focus({ preventScroll: true })
  }, [])
  const show = () => {
    setActive(modes.findIndex(mode => mode.id === selected.id))
    setPosition(null)
    setOpen(true)
  }

  useEffect(() => {
    if (!disabled || !open) return
    const frame = requestAnimationFrame(() => close())
    return () => cancelAnimationFrame(frame)
  }, [disabled, open, close])

  useLayoutEffect(() => {
    if (!expanded) return
    const update = () => {
      const anchor = trigger.current.getBoundingClientRect()
      const viewport = window.visualViewport
      const leftEdge = (viewport?.offsetLeft || 0) + 12
      const topEdge = (viewport?.offsetTop || 0) + 12
      const rightEdge = leftEdge + (viewport?.width || innerWidth) - 24
      const bottomEdge = topEdge + (viewport?.height || innerHeight) - 24
      const above = Math.max(0, Math.min(anchor.top, bottomEdge) - topEdge - 8)
      const below = Math.max(0, bottomEdge - Math.max(anchor.bottom, topEdge) - 8)
      const placeAbove = above >= below
      const width = Math.min(260, rightEdge - leftEdge)
      const maxHeight = Math.max(1, placeAbove ? above : below)
      const height = Math.min(menu.current.scrollHeight, maxHeight)
      const next = {
        left: Math.max(leftEdge, Math.min(anchor.left, rightEdge - width)),
        top: Math.max(topEdge, Math.min(placeAbove ? anchor.top - 8 - height : anchor.bottom + 8, bottomEdge - height)),
        width, maxHeight,
      }
      setPosition(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next)
    }
    const frame = requestAnimationFrame(update)
    const observer = new ResizeObserver(update)
    observer.observe(trigger.current)
    observer.observe(menu.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [expanded])

  useEffect(() => {
    if (!expanded || !position) return
    const item = items.current[active]
    item?.focus({ preventScroll: true })
    item?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active, position])

  useEffect(() => {
    if (!expanded) return
    const leave = event => {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', leave, true)
    document.addEventListener('focusin', leave)
    return () => {
      document.removeEventListener('pointerdown', leave, true)
      document.removeEventListener('focusin', leave)
    }
  }, [expanded, close])

  const select = mode => { onChange(mode.id); close(true) }
  const onKeyDown = event => {
    const steps = { ArrowDown: 1, ArrowUp: -1 }
    if (event.key in steps) {
      event.preventDefault()
      setActive(index => (index + steps[event.key] + modes.length) % modes.length)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : modes.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(modes[active])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const stops = [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]')]
        .filter(node => node.tabIndex >= 0 && !node.disabled && node.getClientRects().length &&
          getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert], [role="menu"]'))
      const index = stops.indexOf(trigger.current)
      close()
      stops[(index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus()
    }
  }

  return <>
    <Button ref={trigger} variant="ghost" className="contour-mode-trigger" disabled={disabled}
      aria-label={`AI mode: ${selected.label}`} aria-haspopup="menu" aria-expanded={expanded}
      aria-controls={expanded ? menuId : undefined} onClick={() => expanded ? close() : show()}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show() }
      }}><Icon size={15} aria-hidden="true" /><span>{selected.label}</span><ChevronDown size={12} aria-hidden="true" /></Button>
    {expanded && createPortal(<section aria-label="AI mode selection"><div ref={menu} id={menuId} role="menu" aria-label="AI modes"
      className="contour-mode-menu" onKeyDown={onKeyDown}
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}>
      {modes.map((mode, index) => {
        const ModeIcon = mode.icon
        return <button key={mode.id} ref={node => { items.current[index] = node }} type="button" role="menuitemradio"
          aria-checked={mode.id === value} aria-labelledby={`${menuId}-${mode.id}-name`}
          aria-describedby={`${menuId}-${mode.id}-description`} tabIndex={active === index ? 0 : -1}
          onFocus={() => setActive(index)} onClick={() => select(mode)}>
          <ModeIcon size={17} aria-hidden="true" />
          <span><strong id={`${menuId}-${mode.id}-name`}>{mode.label}</strong><small id={`${menuId}-${mode.id}-description`}>{mode.description}</small></span>
          {mode.id === value && <Check size={14} aria-hidden="true" />}
        </button>
      })}
    </div></section>, document.body)}
  </>
}
