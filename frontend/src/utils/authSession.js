export function normalizeUser(user) {
  const id = user?._id || user?.userId
  return typeof id === 'string' && id ? { ...user, _id: id } : null
}

export function isSessionError(error) {
  const { status, data } = error?.response || {}
  return status === 401 || (status === 400 &&
    ['unauthorized', 'session expired'].includes(data?.message?.toLowerCase()))
}

export function isProtectedRequest(url = '') {
  return /^\/api\/(chat|agent|billing)(\/|$)/.test(url)
}

export function sessionChangedError() {
  return Object.assign(new Error('The account session changed.'), { code: 'SESSION_CHANGED' })
}
