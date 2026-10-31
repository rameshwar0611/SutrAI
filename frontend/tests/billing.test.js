import test from 'node:test'
import assert from 'node:assert/strict'
import { PLANS } from '../../backend/services/billing/config/Plans.js'
import { billingPlans, accountSnapshot, checkoutQuote, quoteChanged, paymentPayload } from '../src/utils/billing.js'
import { createAppStore } from '../src/redux/store.js'
import { accountRefreshed, sessionConfirmed, logoutStarted } from '../src/redux/userSlice.js'
import { setSelectedConversation } from '../src/redux/conversationSlice.js'
import { setArtifacts, addMessage } from '../src/redux/messageSlice.js'
import { setDraftText } from '../src/redux/workspaceSlice.js'

test('display catalogue matches the actual backend configuration', async () => {
  for (const plan of billingPlans) for (const field of ['id', 'name', 'amount', 'credits']) assert.equal(plan[field], PLANS[plan.id][field])
})
test('zero is retained while missing, negative, nonfinite and inconsistent balances never become a healthy quota', () => {
  assert.equal(accountSnapshot({ credits: 0, totalCredits: 100 }).credits, 0)
  for (const credits of [undefined, -1, NaN, Infinity, '100', 1.5]) assert.equal(accountSnapshot({ credits }).credits, null)
  assert.equal(accountSnapshot({ credits: 101, totalCredits: 100 }).ratio, null)
  assert.equal(accountSnapshot({ credits: 0, totalCredits: 0 }).ratio, null)
  assert.equal(accountSnapshot({ credits: 13, totalCredits: 100 }).used, 87)
})
test('unknown plans and invalid dates are unavailable; a past recorded date does not downgrade', () => {
  assert.equal(accountSnapshot({ plan: 'enterprise', planExpiresAt: 'bad' }).plan, 'Unavailable')
  assert.equal(accountSnapshot({ plan: 'pro', planExpiresAt: '2020-01-01T00:00:00Z' }).plan, 'Pro')
})
const quote = { order: { id: 'order_test', amount: 19900, currency: 'INR' }, plan: { id: 'starter', amount: 199, credits: 500 } }
test('quote validation checks paise, currency, identity, credits and order consistency', () => {
  const result = checkoutQuote(quote, 'starter'); assert.equal(result.amount, 199); assert.equal(result.paise, 19900)
  for (const bad of [null, { ...quote, order: { ...quote.order, currency: 'USD' } }, { ...quote, order: { ...quote.order, amount: 199 } },
    { ...quote, plan: { ...quote.plan, credits: -1 } }, { ...quote, plan: { ...quote.plan, id: 'pro' } }]) assert.throws(() => checkoutQuote(bad, 'starter'))
  assert.equal(quoteChanged(result, billingPlans[1]), false)
  assert.equal(quoteChanged({ ...result, credits: 600 }, billingPlans[1]), true)
})
test('payment callback must belong to the active order and include verification fields', () => {
  const response = { razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: 'test-signature' }
  assert.equal(paymentPayload(response, 'order_test'), true)
  assert.equal(paymentPayload(response, 'order_other'), false)
  assert.equal(paymentPayload({ ...response, razorpay_signature: '' }, 'order_test'), false)
})
test('same-account refresh preserves epoch, conversation, messages, artifacts and draft identity', () => {
  const store = createAppStore(); store.dispatch(sessionConfirmed({ _id: 'one', credits: 0 }))
  store.dispatch(setSelectedConversation({ _id: 'chat' })); store.dispatch(addMessage({ content: 'saved' }))
  store.dispatch(setArtifacts([{ files: [] }])); store.dispatch(setDraftText('Unsent'))
  const before = store.getState()
  store.dispatch(accountRefreshed({ accountId: 'one', sessionEpoch: before.user.sessionEpoch, user: { userId: 'one', credits: 500 } }))
  const after = store.getState()
  assert.equal(after.user.userData.credits, 500); assert.equal(after.user.sessionEpoch, before.user.sessionEpoch)
  for (const slice of ['conversation', 'message', 'workspace']) assert.equal(after[slice], before[slice])
})
test('late, wrong-account or logged-out refreshes cannot mutate account state', () => {
  const store = createAppStore(); store.dispatch(sessionConfirmed({ _id: 'one', credits: 5 })); const epoch = store.getState().user.sessionEpoch
  for (const payload of [{ accountId: 'one', sessionEpoch: epoch - 1, user: { _id: 'one', credits: 99 } },
    { accountId: 'one', sessionEpoch: epoch, user: { _id: 'two', credits: 99 } }]) {
    store.dispatch(accountRefreshed(payload)); assert.equal(store.getState().user.userData.credits, 5)
  }
  store.dispatch(logoutStarted()); store.dispatch(accountRefreshed({ accountId: 'one', sessionEpoch: epoch, user: { _id: 'one', credits: 99 } }))
  assert.equal(store.getState().user.userData, null)
})
