export default function StatusBanner({ children, tone = 'neutral', className = '', id }) {
  return (
    <div id={id} className={`contour-status contour-status--${tone} ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
  )
}
