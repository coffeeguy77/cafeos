const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'sandbox'
const BASE_URL = SQUARE_ENV === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com'

export function getOAuthUrl(cafeId) {
  const params = new URLSearchParams({
    client_id: process.env.SQUARE_APPLICATION_ID,
    scope: 'MERCHANT_PROFILE_READ ORDERS_READ PAYMENTS_READ INVENTORY_READ ITEMS_READ',
    session: false,
    state: cafeId,
  })
  return BASE_URL + '/oauth2/authorize?' + params.toString()
}

export async function exchangeToken(code) {
  const res = await fetch(BASE_URL + '/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
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
    headers: { 'Square-Version': '2024-01-18', Authorization: 'Bearer ' + accessToken },
  })
  return res.json()
}

export async function getLocations(accessToken) {
  const res = await fetch(BASE_URL + '/v2/locations', {
    headers: { 'Square-Version': '2024-01-18', Authorization: 'Bearer ' + accessToken },
  })
  return res.json()
}

export async function getSalesData(accessToken, locationIds, months) {
  const endAt = new Date().toISOString()
  const startAt = new Date(Date.now() - months * 30 * 24 * 3600 * 1000).toISOString()
  let allOrders = []
  let cursor = null
  do {
    const body = {
      location_ids: locationIds,
      query: {
        filter: {
          date_time_filter: { created_at: { start_at: startAt, end_at: endAt } },
          state_filter: { states: ['COMPLETED'] },
        },
        sort: { sort_field: 'CREATED_AT', sort_order: 'ASC' },
      },
      limit: 500,
    }
    if (cursor) body.cursor = cursor
    const res = await fetch(BASE_URL + '/v2/orders/search', {
      method: 'POST',
      headers: { 'Square-Version': '2024-01-18', Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('Square API error: ' + res.status)
    const data = await res.json()
    allOrders = allOrders.concat(data.orders || [])
    cursor = data.cursor || null
  } while (cursor)
  return computeSalesData(allOrders, months)
}

function computeSalesData(orders, months) {
  let grossSales = 0, netSales = 0
  for (const order of orders) {
    const gross = (order.total_money?.amount || 0) / 100
    const disc = (order.total_discount_money?.amount || 0) / 100
    grossSales += gross
    netSales += (gross - disc)
  }
  const avgMonthlySales = netSales / months
  return {
    grossSales,
    netSales,
    orderCount: orders.length,
    avgMonthlySales,
    annualisedSales: avgMonthlySales * 12,
    months,
  }
}

export function calculateValuation(salesData, expenses, equipment, adjustments, settings) {
  const { annualisedSales, netSales, months } = salesData
  const revenue = annualisedSales || 0
  const cogs = expenses.filter(e => e.normalised_type === 'cogs' && !e.is_excluded).reduce((s, e) => s + Number(e.amount), 0)
  const opex = expenses.filter(e => e.normalised_type === 'opex' && !e.is_excluded).reduce((s, e) => s + Number(e.amount), 0)
  const totalExpenses = cogs + opex
  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const ebitda = grossProfit - opex
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0
  const addBacks = adjustments.filter(a => a.type === 'add_back').reduce((s, a) => s + Number(a.annual_amount), 0)
  const removals = adjustments.filter(a => a.type === 'remove').reduce((s, a) => s + Number(a.annual_amount), 0)
  const adjustedEbitda = ebitda + addBacks - removals
  const equipmentValue = equipment.filter(i => i.ownership !== 'roastery' && i.ownership !== 'leased').reduce((s, i) => {
    const m = i.valuation_mode || 'depreciated'
    if (m === 'secondhand') return s + parseFloat(i.secondhand_value || 0)
    if (m === 'replacement') {
      const cp = i.condition === 'excellent' ? 0.85 : i.condition === 'good' ? 0.65 : i.condition === 'fair' ? 0.4 : 0.2
      return s + parseFloat(i.replacement_cost || 0) * cp
    }
    if (m === 'manual') return s + parseFloat(i.manual_value || 0)
    if (!i.purchase_price || !i.purchase_date) return s
    const y = (new Date() - new Date(i.purchase_date)) / (365.25 * 24 * 3600 * 1000)
    return s + parseFloat(i.purchase_price) * Math.max(0, 1 - y / (i.depreciation_years || 5))
  }, 0)
  const { revenueMultiple = 0.5, ebitdaMultiple = 2.5 } = settings
  const valByRevenue = revenue * revenueMultiple
  const valByEbitda = adjustedEbitda * ebitdaMultiple
  const valMid = (valByRevenue + valByEbitda) / 2
  const valByAsset = valByEbitda + equipmentValue
  return { revenue, cogs, opex, totalExpenses, grossProfit, grossMargin, ebitda, ebitdaMargin, addBacks, removals, adjustedEbitda, equipmentValue, valByRevenue, valByEbitda, valMid, valByAsset, months }
}
