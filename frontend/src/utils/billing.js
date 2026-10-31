// Display catalogue mirrors backend/services/billing/config/Plans.js. There is
// no plan-list API; the returned checkout quote is validated before handoff.
export const billingPlans = [
  { id: 'free', name: 'Free', amount: 0, credits: 100 },
  { id: 'starter', name: 'Starter', amount: 199, credits: 500 },
  { id: 'pro', name: 'Pro', amount: 499, credits: 1000 },
]
export const validCredits = value => Number.isSafeInteger(value) && value >= 0
export const count = value => validCredits(value) ? value.toLocaleString('en-IN') : 'Unavailable'
export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
export function accountSnapshot(user) {
  const credits = validCredits(user?.credits) ? user.credits : null
  const total = validCredits(user?.totalCredits) ? user.totalCredits : null
  const consistent = credits !== null && total !== null && credits <= total
  const date = typeof user?.planExpiresAt === 'string' ? new Date(user.planExpiresAt) : null
  return { credits, total, used: consistent ? total - credits : null,
    ratio: consistent && total > 0 ? credits / total : null,
    plan: billingPlans.find(plan => plan.id === user?.plan)?.name || 'Unavailable',
    date: date && Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null,
    consistent }
}
export function checkoutQuote(data, selectedId) {
  const { order, plan } = data || {}
  if (!['starter', 'pro'].includes(selectedId) || plan?.id !== selectedId ||
      typeof order?.id !== 'string' || !order.id.startsWith('order_') || order.currency !== 'INR' ||
      !Number.isSafeInteger(order.amount) || order.amount <= 0 ||
      !validCredits(plan.credits) || plan.credits === 0 ||
      !Number.isFinite(plan.amount) || plan.amount <= 0 || Math.round(plan.amount * 100) !== order.amount ||
      (order.status && order.status !== 'created')) throw new Error('The server returned an invalid purchase quote.')
  return { orderId: order.id, currency: order.currency, amount: order.amount / 100,
    paise: order.amount, credits: plan.credits, id: plan.id, name: billingPlans.find(item => item.id === plan.id).name }
}
export function quoteChanged(quote, reviewed) {
  return quote.amount !== reviewed.amount || quote.credits !== reviewed.credits
}
export function paymentPayload(response, orderId) {
  return response?.razorpay_order_id === orderId &&
    ['razorpay_payment_id', 'razorpay_signature'].every(key => typeof response[key] === 'string' && response[key].length > 0)
}
