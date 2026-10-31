import User from '../models/user.model.js'
import redis from '../../../shared/redis/redis.js'
import { createAuthHandlers } from './auth.handlers.js'

const handlers = createAuthHandlers({ User, redis, verifyToken: async token => {
  const [{ getAuth }, { app }] = await Promise.all([import('firebase-admin/auth'), import('../config/firebase.js')])
  return getAuth(app).verifyIdToken(token)
} })
export const { login, logOut, account, updateUserPayment, deductCredits } = handlers
