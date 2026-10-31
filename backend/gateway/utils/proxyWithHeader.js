import proxy from 'express-http-proxy'
import { serviceHeaders } from '../../shared/security/internal.js'
import { removeClientIdentity } from './authProxy.js'
export const proxyWithHeader = serviceUrl => proxy(serviceUrl, {
  // Stream multipart bodies unchanged; Multer owns the 20 MB file limit.
  parseReqBody: false,
  proxyReqOptDecorator: (options, req) => {
    removeClientIdentity(options.headers)
    delete options.headers.cookie
    Object.assign(options.headers, serviceHeaders('gateway', req.user.userId))
    return options
  },
  proxyErrorHandler: (_error, res) => res.status(503).json({ message: 'Service unavailable.' }),
})
