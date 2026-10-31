import api from '../../utils/axios.js'
export const verifyPayment = async (payload, { signal } = {}) => {
  const { data } = await api.post('/api/billing/verify', payload, { signal, timeout: 15000 })
  if (data?.message !== 'Payment Verified') throw new Error('Backend confirmation unavailable.')
  return data
}
