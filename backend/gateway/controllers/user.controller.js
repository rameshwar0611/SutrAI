import { callService } from '../../shared/security/internal.js'
export const getCurrentUser = async (req, res) => {
  try {
    const user = await callService({ caller: 'gateway', url: process.env.AUTH_SERVICE, path: '/account', userId: req.user.userId, method: 'GET' })
    return res.status(200).json(user)
  } catch (error) {
    return res.status(error.status === 401 ? 401 : 503).json({ message: error.status === 401 ? 'unauthorized' : 'Account service unavailable.' })
  }
}
