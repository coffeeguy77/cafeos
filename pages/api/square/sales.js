import { getSalesData, getMerchantInfo } from '../../../lib/square'
import { getSession } from '../../../lib/session'

export default async function handler(req, res) {
  const session = getSession(req)
  if (!session?.accessToken) return res.status(401).json({ error: 'Not authenticated' })
  try {
    const months = parseInt(req.query.months || '12', 10)
    const [salesData, merchant] = await Promise.all([
      getSalesData(session.accessToken, months),
      getMerchantInfo(session.accessToken),
    ])
    return res.status(200).json({ salesData, merchant })
  } catch (err) {
    console.error('Sales data error:', err)
    return res.status(500).json({ error: 'Failed to fetch sales data' })
  }
}
