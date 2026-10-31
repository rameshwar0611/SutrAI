import { timingSafeEqual } from 'node:crypto'

export const validUserId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
export function httpError(status, message) { return Object.assign(new Error(message), { status }) }

// Server-only per-caller credentials. Each target configures only needed verifier keys.
export function serviceHeaders(caller, userId, env = process.env) {
  const token = env.SERVICE_AUTH_TOKEN
  if (typeof token !== 'string' || Buffer.byteLength(token) < 32) throw httpError(503, 'Internal authentication unavailable.')
  if (!validUserId(userId)) throw httpError(400, 'Invalid account identity.')
  return { 'x-service-name': caller, 'x-service-token': token, 'x-user-id': userId }
}
export function requireService(callers, env = process.env) {
  return (req, res, next) => {
    let keys
    try { keys = JSON.parse(env.SERVICE_AUTH_KEYS || '{}') } catch { return res.status(503).json({ message: 'Internal authentication unavailable.' }) }
    const caller = req.headers['x-service-name'], supplied = req.headers['x-service-token']
    const expected = typeof caller === 'string' && callers.includes(caller) ? keys?.[caller] : undefined
    if (typeof expected !== 'string' || Buffer.byteLength(expected) < 32 || typeof supplied !== 'string' || supplied.length > 512 ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return res.status(403).json({ message: 'Service access denied.' })
    }
    const userId = req.headers['x-user-id']
    if (!validUserId(userId)) return res.status(400).json({ message: 'Invalid account identity.' })
    req.identity = { caller, userId }
    next()
  }
}
export async function callService({ caller, url, path, userId, body, method = 'POST' }) {
  const headers = { ...serviceHeaders(caller, userId), 'content-type': 'application/json' }
  let response
  try {
    response = await fetch(new URL(path.replace(/^\//, ''), `${url?.replace(/\/$/, '')}/`), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error',
    })
  } catch { throw httpError(503, 'Internal service unavailable; request outcome may need review.') }
  let data
  try { data = await response.json() } catch { throw httpError(502, 'Invalid internal response.') }
  if (!response.ok) throw httpError([400, 401, 403, 404, 409].includes(response.status) ? response.status : 503,
    response.status === 400 && data?.message === 'Not enough credits.' ? data.message :
      response.status === 404 ? 'Resource not found.' : 'Internal operation could not be confirmed.')
  return data
}
export function errorResponse(error, res) {
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 ? error.status : 503
  const safe = new Set(['Not enough credits.', 'Conversation not found.', 'Invalid request.', 'Payment requires review.',
    'Payment verification failed.', 'Payment is not captured.', 'Account not found.', 'Credit operation conflict.', 'Credit operation requires review.'])
  return res.status(status).json({ message: safe.has(error?.message) ? error.message : 'Request could not be completed.' })
}
