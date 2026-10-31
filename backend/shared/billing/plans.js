export const PLANS = Object.freeze({
  free: Object.freeze({ id: 'free', name: 'Free', amount: 0, credits: 100, validity: 30 }),
  starter: Object.freeze({ id: 'starter', name: 'Starter', amount: 199, credits: 500, validity: 30 }),
  pro: Object.freeze({ id: 'pro', name: 'Pro', amount: 499, credits: 1000, validity: 30 }),
})
// Search invokes Search and Chat. Auto reserves the maximum supported workflow cost.
export const CREDIT_COSTS = Object.freeze({ auto: 10, chat: 1, search: 6, coding: 10, pdf: 10, ppt: 10, vision: 10,
  pdfRag: 10, imageAnalyzer: 10 })
