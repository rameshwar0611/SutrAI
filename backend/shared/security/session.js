import { validUserId } from './internal.js'
export function sessionMiddleware(cache) {
  return async (req, res, next) => {
    try {
      const id = req.cookies?.session
      if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) return res.status(401).json({ message: 'unauthorized' })
      const raw = await cache.get(`session-${id}`)
      if (!raw) return res.status(401).json({ message: 'session expired' })
      const user = JSON.parse(raw)
      if (!validUserId(user.userId)) return res.status(401).json({ message: 'unauthorized' })
      req.user = { userId: user.userId }
      next()
    } catch { return res.status(503).json({ message: 'Session service unavailable.' }) }
  }
}
