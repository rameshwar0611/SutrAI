import { useId, useState } from 'react'
import Button from './Button'

export default function IconButton({ label, children, className = '', tooltip = true, side = 'bottom', ...props }) {
  const tooltipId = useId()
  const [visible, setVisible] = useState(false)
  const button = <Button {...props} variant="ghost" aria-label={label}
    aria-describedby={tooltip ? tooltipId : undefined} className={`contour-icon-button ${className}`}
    onClick={event => { setVisible(false); props.onClick?.(event) }}>
    {children}
  </Button>
  if (!tooltip) return button
  return (
    <span className="contour-tooltip" data-side={side} data-open={visible}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={event => { if (!event.currentTarget.contains(document.activeElement)) setVisible(false) }}
      onFocus={() => setVisible(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setVisible(false) }}
      onKeyDown={event => {
        if (event.key === 'Escape' && visible && !event.defaultPrevented) {
          event.preventDefault()
          event.stopPropagation()
          setVisible(false)
        }
      }}>
      {button}
      <span className="contour-tooltip__text" role="tooltip" id={tooltipId}>{label}</span>
    </span>
  )
}
