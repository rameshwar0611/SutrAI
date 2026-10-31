export function publicAuthOnly(req, res, next) {
  if ((req.method === 'POST' && req.path === '/login') || (req.method === 'GET' && req.path === '/logout')) return next()
  return res.status(404).json({ message: 'Not found.' })
}
export function removeClientIdentity(headers) {
  for (const key of Object.keys(headers)) if (/^x-(?:service-|user-|role|internal-)/i.test(key)) delete headers[key]
  return headers
}
