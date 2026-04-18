const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'sandbox'
const BASE_URL = SQUARE_ENV === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com'


export function getOAuthUrl(cafeId) {
  const params = new URLSearchParams({
    client_id: process.env.SQUARE_APPLICATION_ID,
    scope: 'MERCHANT_PROFILE_READ ORDERS_READ PAYMENTS_READ INVENTORY_READ ITEMS_READ',
    session: 'false',
    redirect_uri: process.env.NEXT_PUBLIC_APP_URL + '/api/square/callback',
    state: cafeId,
  })
  return BASE_URL + '/oauth2/authorize?' + params.toString()
}


export async function exchangeCodeForToken(code) {
  const res = await fetch(BASE_URL + '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-17' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.NEXT_PUBLIC_APP_URL + '/api/square/callback',
    }),
  })
  return res.json()
}


export async function getMerchantInfo(accessToken) {
  const res = await fetch(BASE_URL + '/v2/merchants/me', {
    headers: { Authorization: 'Bearer ' + accessToken, 'Square-Version': '2024-01-17' },
  })
  const data = await res.json()

// Incremental sync — only fetch orders since lastDate, return daily rows for cache
export async function getSalesDataIncremental(accessToken, locationIds, lastDate, cafeId) {
  const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  // Start from day after last cached date, or 2 years back for full sync
  const startAt = lastDate
    ? new Date(new Date(lastDate).getTime() + 86400000).toISOString()
    : new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString()

  const endAt = new Date().toISOString()

  // Don't fetch if already up to date (last date is today)
  const today = new Date().toISOString().split('T')[0]
  if (lastDate && lastDate >= today) return []

  const dailyTotals = {}
  let cursor = null

  do {
    const body = {
      location_ids: locationIds,
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: startAt, end_at: endAt }
          },
          state_filter: { states: ['COMPLETED'] }
        },
        sort: { sort_field: 'CREATED_AT', sort_order: 'ASC' }
      },
      limit: 500,
    }
    if (cursor) body.cursor = cursor

    const resp = await fetch(SQUARE_BASE + '/v2/orders/search', {
      method: 'POST',
      headers: {
        'Square-Version': '2024-01-18',
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const err = await resp.text()
      throw new Error('Square orders error: ' + err)
    }

    const data = await resp.json()
    cursor = data.cursor || null

    for (const order of data.orders || []) {
      const date = order.created_at.split('T')[0]
      const gross = (order.total_money?.amount || 0) / 100
      const disc = (order.total_discount_money?.amount || 0) / 100
      const net = gross - disc
      if (!dailyTotals[date]) dailyTotals[date] = { gross: 0, net: 0, count: 0 }
      dailyTotals[date].gross += gross
      dailyTotals[date].net += net
      dailyTotals[date].count += 1
    }
  } while (cursor)

  return Object.entries(dailyTotals).map(([date, v]) => ({
    cafe_id: cafeId,
    order_date: date,
    gross_amount: Math.round(v.gross * 100) / 100,
    net_amount: Math.round(v.net * 100) / 100,
    order_count: v.count,
  }))
}
