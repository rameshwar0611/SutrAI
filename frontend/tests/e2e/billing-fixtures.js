export async function mockBilling(page, api) {
  const payment = { orders: [], verifications: [], orderStatus: 200, verifyStatus: 200,
    verifyMessage: 'Payment Verified', quoteCredits: null, quoteAmount: null, verifyGate: null, orderGate: null,
    accountAfterPayment: null }
  await page.addInitScript(() => {
    window.__razorpay = { instances: [], closed: 0, nativeModalAtOpen: [] }
    window.Razorpay = class {
      constructor(options) { this.options = options; this.events = {}; window.__razorpay.instances.push(this) }
      on(event, callback) { this.events[event] = callback }
      open() { window.__razorpay.nativeModalAtOpen.push(!!document.querySelector('dialog:modal')) }
      close() { window.__razorpay.closed++; this.options.modal.ondismiss() }
    }
    window.__providerClass = window.Razorpay
  })
  await page.route('**/api/billing/**', async route => {
    if (route.request().url().endsWith('/create')) {
      const { plan } = route.request().postDataJSON(); payment.orders.push(plan)
      if (payment.orderGate) await payment.orderGate
      const amount = payment.quoteAmount ?? (plan === 'pro' ? 499 : 199)
      await route.fulfill({ status: payment.orderStatus, json: { order: { id: `order_isolated_${payment.orders.length}`, amount: amount * 100, currency: 'INR' },
        plan: { id: plan, name: plan === 'pro' ? 'Pro' : 'Starter', amount, credits: payment.quoteCredits ?? (plan === 'pro' ? 1000 : 500) } } })
    } else {
      payment.verifications.push(route.request().postDataJSON())
      if (payment.verifyGate) await payment.verifyGate
      if (payment.verifyStatus === 200 && payment.verifyMessage === 'Payment Verified' && payment.accountAfterPayment) api.account = payment.accountAfterPayment
      await route.fulfill({ status: payment.verifyStatus, json: { message: payment.verifyMessage } })
    }
  })
  return payment
}
export async function providerSuccess(page, extra = {}) {
  await page.evaluate(extra => {
    const instance = window.__razorpay.instances.at(-1)
    void instance.options.handler({ razorpay_order_id: instance.options.order_id,
      razorpay_payment_id: 'pay_isolated', razorpay_signature: 'isolated-signature', ...extra })
  }, extra)
}
export const providerDismiss = page => page.evaluate(() => window.__razorpay.instances.at(-1).options.modal.ondismiss())
export const providerFailure = page => page.evaluate(() => window.__razorpay.instances.at(-1).events['payment.failed']({ error: { description: 'Isolated failure' } }))
