import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useSelector } from 'react-redux'
import { store } from '../redux/store.js'
import { createOrder } from '../features/createOrder.js'
import { verifyPayment } from '../features/verifyPayment.js'
import loadRazorpay from '../utils/loadRazorpay.js'
import { accountSnapshot, checkoutQuote, paymentPayload, quoteChanged } from '../utils/billing.js'

export default function useBillingCheckout(refresh) {
  const { sessionEpoch, userData } = useSelector(state => state.user)
  const owner = userData?._id
  const [state, setState] = useState({ stage: 'plans' })
  const latest = useRef(state)
  const live = useRef(true)
  const provider = useRef(null)
  const generation = useRef(0)
  const abort = useRef(new AbortController())
  const set = value => { latest.current = value; setState(value) }
  const current = () => live.current && store.getState().user.status === 'authenticated' &&
    store.getState().user.sessionEpoch === sessionEpoch && store.getState().user.userData?._id === owner
  useEffect(() => {
    live.current = true
    const controller = new AbortController()
    abort.current = controller
    return () => {
      live.current = false
      controller.abort()
      provider.current?.close?.()
    }
  }, [])
  const refreshConfirmed = async () => {
    if (!current() || latest.current.stage !== 'balance-error') return
    set({ ...latest.current, stage: 'refreshing' })
    const ok = await refresh()
    if (current()) set({ ...latest.current, stage: ok && accountSnapshot(store.getState().user.userData).consistent ? 'success' : 'balance-error' })
  }
  const launch = async () => {
    if (!current() || !['review', 'sdk-error', 'cancelled', 'failed'].includes(latest.current.stage)) return
    const attempt = latest.current
    set({ ...attempt, stage: 'loading-sdk' })
    let Razorpay
    try { Razorpay = await loadRazorpay() } catch {
      if (current()) set({ ...attempt, stage: 'sdk-error' })
      return
    }
    if (!current()) return
    const quote = attempt.quote
    const token = ++generation.current
    const valid = () => current() && generation.current === token
    let verifying = false
    let settled = false
    let failed = false
    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: quote.paise, currency: quote.currency, order_id: quote.orderId,
      name: 'SutrAI', description: `${quote.name} · ${quote.credits.toLocaleString('en-IN')} credits`,
      theme: { color: '#2855D9' },
      modal: { ondismiss: () => {
        if (!valid() || verifying || settled) return
        settled = true
        set({ ...attempt, stage: failed ? 'failed' : 'cancelled' })
      } },
      handler: async response => {
        if (!valid() || verifying) return
        verifying = true
        set({ ...attempt, stage: 'verifying' })
        if (!paymentPayload(response, quote.orderId)) { set({ ...attempt, stage: 'unknown' }); return }
        try {
          await verifyPayment({ razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id, razorpay_signature: response.razorpay_signature }, { signal: abort.current.signal })
          if (!valid()) return
          settled = true
          set({ ...attempt, stage: 'refreshing' })
          const ok = await refresh()
          if (valid()) set({ ...attempt, stage: ok && accountSnapshot(store.getState().user.userData).consistent ? 'success' : 'balance-error' })
        } catch {
          if (valid()) set({ ...attempt, stage: 'unknown' })
        }
      },
    }
    let opened = false
    try {
      provider.current = new Razorpay(options)
      provider.current.on('payment.failed', () => {
        if (!valid() || verifying || settled) return
        failed = true
        set({ ...attempt, stage: 'checkout', providerFailed: true })
      })
      // Close the native billing modal before the SDK mounts its own focus layer.
      flushSync(() => set({ ...attempt, stage: 'checkout' }))
      await new Promise(resolve => requestAnimationFrame(resolve))
      if (valid() && !verifying && !settled && latest.current.stage === 'checkout') { opened = true; provider.current.open() }
    } catch {
      if (valid()) { settled = true; set({ ...attempt, stage: opened ? 'unknown' : 'sdk-error' }) }
    }
  }
  const choose = plan => { if (['plans', 'success'].includes(latest.current.stage)) set({ stage: 'review', selected: plan }) }
  const start = async () => {
    if (!current() || !['review', 'order-error'].includes(latest.current.stage)) return
    if (latest.current.quote) { await launch(); return }
    const selected = latest.current.selected
    set({ stage: 'creating', selected })
    try {
      const data = await createOrder(selected.id, { signal: abort.current.signal })
      if (!current()) return
      const quote = checkoutQuote(data, selected.id)
      const changed = quoteChanged(quote, selected)
      set({ stage: 'review', selected: quote, quote, changed })
      if (!changed) await launch()
    } catch {
      if (current()) set({ stage: 'order-error', selected })
    }
  }
  const plans = () => {
    if (['review', 'success'].includes(latest.current.stage) && !latest.current.quote) set({ stage: 'plans' })
    else if (latest.current.stage === 'success') set({ stage: 'plans' })
  }
  return { ...state, choose, start, launch, plans, refreshConfirmed }
}
