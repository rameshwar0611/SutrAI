import redis from '../../shared/redis/redis.js'
import { sessionMiddleware } from '../../shared/security/session.js'
export default sessionMiddleware(redis)
