export default function Button({ children, variant = 'secondary', busy = false, disabled, className = '', type = 'button', ...props }) {
  return (
    <button {...props} type={type} disabled={disabled || busy} aria-busy={busy || undefined}
      className={`contour-button contour-button--${variant} ${className}`}>
      {children}
    </button>
  )
}
