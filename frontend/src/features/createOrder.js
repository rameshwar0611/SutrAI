import api from '../../utils/axios.js'
export const createOrder = async (plan, { signal } = {}) => {
  const { data } = await api.post('/api/billing/create', { plan }, { signal, timeout: 15000 })
  return data
}
