let loading
export default function loadRazorpay() {
  if (typeof window.Razorpay === 'function') return Promise.resolve(window.Razorpay)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const url = 'https://checkout.razorpay.com/v1/checkout.js'
    // Load only when checkout is requested. An explicit retry replaces an
    // unavailable SDK from this same trusted URL only.
    document.querySelectorAll(`script[src="${url}"]`).forEach(script => script.remove())
    const script = document.createElement('script')
    script.src = url
    script.async = true
    const finish = error => {
      clearTimeout(timer)
      script.onload = script.onerror = null
      if (error) reject(error)
      else resolve(window.Razorpay)
    }
    const timer = setTimeout(() => finish(new Error('Checkout could not load.')), 15000)
    script.onload = () => finish(typeof window.Razorpay === 'function' ? null : new Error('Checkout is unavailable.'))
    script.onerror = () => finish(new Error('Checkout could not load.'))
    document.head.append(script)
  }).finally(() => { loading = null })
  return loading
}
