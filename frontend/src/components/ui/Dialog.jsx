import { useLayoutEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import IconButton from './IconButton'

export default function Dialog({ open, onClose, title, children, id, descriptionId, closeLabel, intro, fallbackFocusId, className = '' }) {
  const dialogRef = useRef(null)
  const headingRef = useRef(null)
  const titleId = useId()
  useLayoutEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const opener = document.activeElement
    dialog.showModal()
    headingRef.current?.focus({ preventScroll: true })
    return () => {
      dialog.close()
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true })
      else if (fallbackFocusId) document.getElementById(fallbackFocusId)?.focus({ preventScroll: true })
    }
  }, [open, fallbackFocusId])
  const closeFromBackdrop = event => {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
  }
  return (
    <dialog ref={dialogRef} id={id} aria-labelledby={titleId} aria-describedby={descriptionId} className={`contour-dialog ${className}`}
      onCancel={event => { event.preventDefault(); onClose() }} onClick={closeFromBackdrop}>
      {intro}
      <div className="contour-dialog__header">
        <h2 id={titleId} ref={headingRef} tabIndex={-1}>{title}</h2>
        <IconButton label={closeLabel || `Close ${title.toLowerCase()}`} tooltip={false} onClick={onClose}><X size={18} /></IconButton>
      </div>
      {children}
    </dialog>
  )
}
