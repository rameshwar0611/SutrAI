import { useEffect, useId, useRef, useState } from 'react'

export default function ScrollableRegion({ children, label, className = '', hintPosition = 'before' }) {
  const region = useRef(null)
  const hintId = useId()
  const [overflow, setOverflow] = useState(false)
  useEffect(() => {
    const element = region.current
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    const frame = requestAnimationFrame(measure)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [children])
  const hint = <p className="contour-overflow-hint" id={hintId} hidden={!overflow}>Scroll sideways <span aria-hidden="true">→</span></p>
  return <div className={`contour-scroll-frame ${className}`}>
    {hintPosition === 'before' && hint}
    <div ref={region} className="contour-scroll-region" tabIndex={overflow ? 0 : undefined}
      role={overflow ? 'region' : undefined} aria-label={overflow ? label : undefined}
      aria-describedby={overflow ? hintId : undefined}>{children}</div>
    {hintPosition === 'after' && hint}
  </div>
}
