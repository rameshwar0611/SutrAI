import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { ArrowLeft, ArrowRight, Check, CircleAlert, Coins, CreditCard, LockKeyhole } from 'lucide-react'
import Dialog from './ui/Dialog'
import Button from './ui/Button'
import StatusBanner from './ui/StatusBanner'
import useBillingCheckout from '../hooks/useBillingCheckout'
import { accountSnapshot, billingPlans, count, money } from '../utils/billing'

const outcomes = {
  creating: ['Preparing checkout…', 'Creating your purchase order. Please wait before trying again.'],
  'loading-sdk': ['Loading secure checkout…', 'Your purchase order is ready. Connecting to Razorpay.'],
  verifying: ['Confirming your payment…', 'Waiting for backend verification. Keep this page open; do not pay again.'],
  refreshing: ['Payment confirmed. Updating your balance…', 'Loading your current account information.'],
  success: ['Payment confirmed.', 'Your account information has been refreshed from SutrAI.'],
  'balance-error': ['Payment confirmed; balance unavailable.', 'We could not refresh your account. Retry the balance check only; do not pay again.'],
  unknown: ['Payment confirmation unavailable.', 'Your payment may have completed. Check your Razorpay payment status before taking further action. Do not pay again.'],
  cancelled: ['Checkout closed.', 'No payment has been confirmed here. Check your payment status before reopening the same checkout.'],
  failed: ['Payment could not be completed.', 'Razorpay reported a failed attempt. Check your payment status before retrying the same checkout.'],
  'order-error': ['Checkout preparation unavailable.', 'No checkout was opened. Retry preparation explicitly when you’re ready.'],
  'sdk-error': ['Secure checkout unavailable.', 'Your existing order is retained. Retry loading checkout without creating another order.'],
}
const busyStages = ['creating', 'loading-sdk', 'verifying', 'refreshing']
const policy = 'One-time purchase. Credits are added to your existing balance after payment confirmation. No automatic renewal.'

function AccountSummary({ user, balance }) {
  const data = accountSnapshot(user)
  return <>
    {balance.status === 'loading' && <StatusBanner>Refreshing account… Last-known values shown.</StatusBanner>}
    {balance.status === 'error' && <StatusBanner tone="error"><span>Account refresh unavailable. Last-known values shown.</span><Button onClick={balance.refresh}>Retry balance</Button></StatusBanner>}
    {balance.status === 'idle' && <p className="contour-billing-note">Last-known account information.</p>}
    <section className="contour-billing-account" aria-label="Current plan and credit balance">
      <div><p>Current Plan</p><h3>{data.plan}</h3><small>{user?.name || 'Your account'}</small></div>
      <div><p>Available credits</p><strong className="contour-credit-number">{count(data.credits)}</strong><span> of {count(data.total)} allocated</span>
        {data.ratio !== null && <div className="contour-credit-meter" role="progressbar" aria-label="Available credits" aria-valuemin={0} aria-valuemax={data.total} aria-valuenow={data.credits}><span style={{ width: `${data.ratio * 100}%` }} /></div>}
        <small>{count(data.used)} used · Cumulative allocation</small>
      </div>
    </section>
    {!data.consistent && <StatusBanner tone="error">Some account balances are unavailable or inconsistent. Refresh to check the current values.</StatusBanner>}
    <p className="contour-billing-note">{data.date ? `Recorded plan end: ${data.date}. The current application does not automatically reset credits at this date.` : 'No recorded plan end date is available. Credits are not automatically reset by a plan date.'}</p>
  </>
}

export default function BillingDrawer({ open, onClose, balance }) {
  const user = useSelector(state => state.user.userData)
  const checkout = useBillingCheckout(balance.refresh)
  const [comparison, setComparison] = useState(false)
  const content = useRef(null)
  const { stage, selected, quote } = checkout
  const data = accountSnapshot(user)
  const outcome = outcomes[stage]
  const busy = busyStages.includes(stage)
  useEffect(() => {
    content.current?.scrollTo(0, 0)
    if (open && stage !== 'checkout') content.current?.querySelector('h3[tabindex]')?.focus({ preventScroll: true })
  }, [stage, open])
  const showingPlans = stage === 'plans'
  const review = stage === 'review'
  return <Dialog id="billing-dialog" fallbackFocusId="chat-prompt" open={open && stage !== 'checkout'} title={review ? 'Review your purchase' : 'Plans & Credits'}
    closeLabel="Close plans and credits" onClose={onClose} className="contour-billing-dialog"
    intro={<p className="contour-billing-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M23 8c-2-3-10-3-12 0s1 5 5 7 8 4 5 8-10 4-13 0M26 13c-2-3-10-3-12 0s1 5 5 7M6 17c2 3 10 3 12 0s-1-5-5-7" /></svg>SutrAI</p>}>
    <p className="contour-billing-subtitle">{review ? 'Clear details at every step.' : 'Your balance, and room for what’s next.'}</p>
    <div ref={content} className="contour-billing-content" aria-busy={busy || undefined}>
      {showingPlans ? <>
        <nav className="contour-billing-tabs" aria-label="Billing views">
          <Button variant="ghost" aria-pressed={!comparison} onClick={() => setComparison(false)}>Overview</Button>
          <Button variant="ghost" aria-pressed={comparison} onClick={() => setComparison(true)}>Compare plans</Button>
        </nav>
        <AccountSummary user={user} balance={balance} />
        {data.credits === 0 && <StatusBanner><Coins size={18} aria-hidden="true" /><span>No available credits. Choose a paid credit option or keep drafting. Usage depends on the workflow.</span></StatusBanner>}
        <div className="contour-billing-section"><h3>More credits for what’s next.</h3><p>Choose an amount that fits what you want to create.</p></div>
        {comparison && <div className="contour-plan-comparison" tabIndex={0} role="region" aria-label="Plan comparison, scroll sideways"><table>
          <caption>One-time credit options · Prices in INR</caption><thead><tr><th scope="col">Plan</th><th scope="col">Price</th><th scope="col">Credits</th><th scope="col">Purchase type</th></tr></thead>
          <tbody>{billingPlans.map(plan => <tr key={plan.id}><th scope="row">{plan.name}</th><td>{money(plan.amount)}</td><td>{count(plan.credits)}</td><td>{plan.id === 'free' ? 'Starting allocation' : 'One-time purchase'}</td></tr>)}</tbody>
        </table></div>}
        <div className="contour-plan-cards">{billingPlans.map(plan => <article key={plan.id} className={`contour-plan-card ${plan.id === 'pro' ? 'contour-plan-card--pro' : ''}`}>
          <h4>{plan.name}{user?.plan === plan.id && <small>Current</small>}</h4><strong className="contour-plan-price">{money(plan.amount)}</strong>
          <p>{plan.id === 'free' ? 'Starting plan' : 'One-time purchase'}</p><div><strong>{plan.id === 'free' ? '100 starting credits' : `Adds ${count(plan.credits)} credits`}</strong>
            <p>{plan.id === 'free' ? 'Included when you join SutrAI.' : 'Added to your available balance after payment confirmation.'}</p></div>
          <Button variant={plan.id === 'pro' ? 'primary' : 'secondary'} disabled={plan.id === 'free'} onClick={() => checkout.choose(plan)}>
            {plan.id === 'free' ? 'Starting allocation' : `Choose ${plan.name}`}</Button>
        </article>)}</div>
        <p className="contour-billing-note">{policy} Credit usage depends on the workflow.</p>
        <Button variant="ghost" onClick={balance.refresh} busy={balance.status === 'loading'}>Refresh account</Button>
      </> : review ? <>
        <h3 tabIndex={-1}>A little more room to create.</h3><p>Review your {selected.name} purchase before continuing to Razorpay.</p>
        {checkout.changed && <StatusBanner>The server quote changed. Review the updated price and credits, then explicitly continue. The existing order will be reused.</StatusBanner>}
        <section className="contour-purchase-summary" aria-label="Purchase summary"><h4>{selected.name}<small>One-time purchase</small></h4>
          <dl><div><dt>Credits added</dt><dd>+{count(selected.credits)}</dd></div><div><dt>Last-known available credits</dt><dd>{count(data.credits)}</dd></div>
            <div><dt>Balance after confirmation</dt><dd>Refreshed from your account</dd></div><div className="contour-purchase-total"><dt>Total · INR</dt><dd>{money(selected.amount)}</dd></div></dl>
        </section><p className="contour-billing-note">{policy} A paid purchase records a plan date 30 days after its update; credits do not automatically reset on that date.</p>
        <div className="contour-payment-info"><LockKeyhole size={18} aria-hidden="true" /><p><strong>Continue with Razorpay.</strong><br />Payment details are entered in the provider’s checkout.</p></div>
        {!quote && <Button variant="ghost" onClick={checkout.plans}><ArrowLeft size={15} />Back to plans</Button>}
      </> : outcome && <section className="contour-payment-status" aria-label="Payment status">
        <span className="contour-payment-mark">{stage === 'success' ? <Check size={26} /> : busy ? <span className="contour-auth-spinner" /> : <CircleAlert size={26} />}</span>
        <h3 tabIndex={-1} role={busy ? 'status' : undefined}>{outcome[0]}</h3><p>{outcome[1]}</p>
        {stage === 'unknown' && <p className="contour-billing-note">Do not pay again while this is unresolved. A balance change alone does not confirm this payment. Keep the order reference for support.</p>}
        {quote && <dl className="contour-result-details"><div><dt>Order reference</dt><dd>{quote.orderId}</dd></div><div><dt>Purchase</dt><dd>{quote.name} · {money(quote.amount)}</dd></div></dl>}
        {stage === 'success' && <AccountSummary user={user} balance={balance} />}
        {stage === 'balance-error' && <Button variant="primary" onClick={checkout.refreshConfirmed}>Retry balance check</Button>}
        {stage === 'order-error' && <Button onClick={checkout.start}>Retry preparation</Button>}
        {['sdk-error', 'cancelled', 'failed'].includes(stage) && <Button onClick={checkout.launch}>Reopen same checkout</Button>}
        {stage === 'success' && <Button onClick={checkout.plans}>Back to plans</Button>}
      </section>}
    </div>
    <footer className="contour-billing-footer"><div><CreditCard size={16} aria-hidden="true" /><span><strong>Checkout with Razorpay</strong><small>Prices in INR · One-time purchase</small></span></div>
      {review ? <Button variant="primary" onClick={checkout.start}>Continue to Razorpay<ArrowRight size={15} aria-hidden="true" /></Button>
        : busy ? <Button disabled>Please wait…</Button> : <Button onClick={onClose}>Back to workspace</Button>}
    </footer>
  </Dialog>
}
