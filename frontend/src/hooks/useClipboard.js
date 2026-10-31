import { useEffect, useRef, useState } from 'react'

export default function useClipboard() {
  const [status, setStatus] = useState('idle')
  const timer = useRef(null)
  const attempt = useRef(0)
  useEffect(() => () => { attempt.current++; clearTimeout(timer.current) }, [])

  const copy = async text => {
    const current = ++attempt.current
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(text)
      if (current !== attempt.current) return
      setStatus('copied')
      timer.current = setTimeout(() => setStatus('idle'), 2000)
    } catch {
      if (current === attempt.current) setStatus('error')
    }
  }
  return { copy, status }
}
