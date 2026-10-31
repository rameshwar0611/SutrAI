import { callService, httpError } from '../../../shared/security/internal.js'
const update = async ({ userId, ...body }) => {
  const result = await callService({ caller: 'agent', url: process.env.AUTH_SERVICE, path: '/deduct-credits', userId, body })
  if (result?.success !== true) throw httpError(503, 'Credit operation requires review.')
  return result
}
export const reserveCredits = payload => update({ ...payload, action: 'reserve' })
export const settleCredits = payload => update({ ...payload, action: 'settle' })
