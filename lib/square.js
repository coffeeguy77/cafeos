const SQUARE_ENV = process.env.SQUARE_ENVIRONMENT || 'sandbox'
const BASE_URL = SQUARE_ENV === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com'

export function getOAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.SQUARE_APPLICATION_ID,
    scope: 'MERCHANT_PROFILE_READ ORDERS_READ PAYMENTS_READ INVENTORY_READ',
    session: 'false',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/square/callback`,
  })
  return `${BASE_URL}/oauth2/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(code) {
  const res = await fetch(`${BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-17' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/square/callback`,
    }),
  })
  return res.json()
}

export async function getMerchantInfo(accessToken) {
  const res = await fetch(`${BASE_URL}/v2/merchants/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-01-17' },
  })
  const data = await res.json()
  return data.merchant
}

export async function getSalesData(accessToken, months = 12) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)
  const beginTime = startDate.toISOString()
  const endTime = endDate.toISOString()
  let cursor = null
  let allOrders = []
  do {
    const body = {
      location_ids: await getLocationIds(accessToken),
      query: {
        filter: {
          date_time_filter: { created_at: { start_at: beginTime, end_at: endTime } },
          state_filter: { states: ['COMPLETED'] },
        },
        sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' },
      },
      limit: 500,
    }
    if (cursor) body.cursor = cursor
    const res = await fetch(`${BASE_URL}/v2/orders/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Square-Version': '2024-01-17' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.orders) allOrders = allOrders.concat(data.orders)
    cursor = data.cursor
  } while (cursor)
  return processOrders(allOrders)
}

async function getLocationIds(accessToken) {
  const res = await fetch(`${BASE_URL}/v2/locations`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Square-Version': '2024-01-17' },
  })
  const data = await res.json()
  return (data.locations || []).map(l => l.id)
}

function processOrders(orders) {
  let grossSales = 0, totalTax = 0, totalDiscounts = 0
  const monthlySales = {}
  for (const order of orders) {
    const month = order.created_at?.substring(0, 7)
    const gross = (order.total_money?.amount || 0) / 100
    const tax = (order.total_tax_money?.amount || 0) / 100
    const discounts = (order.total_discount_money?.amount || 0) / 100
    grossSales += gross; totalTax += tax; totalDiscounts += discounts
    if (month) monthlySales[month] = (monthlySales[month] || 0) + gross
  }
  const netSales = grossSales - totalTax - totalDiscounts
  const sortedMonths = Object.keys(monthlySales).sort()
  const monthlyData = sortedMonths.map(m => ({ month: m, sales: Math.round(monthlySales[m] * 100) / 100 }))
  const avgMonthlySales = monthlyData.length > 0 ? monthlyData.reduce((s, m) => s + m.sales, 0) / monthlyData.length : 0
  return {
    grossSales: Math.round(grossSales * 100) / 100,
    netSales: Math.round(netSales * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    orderCount: orders.length,
    avgMonthlySales: Math.round(avgMonthlySales * 100) / 100,
    annualisedSales: Math.round(avgMonthlySales * 12 * 100) / 100,
    monthlyData,
  }
}

export function calculateValuation(salesData, settings) {
  const { annualisedSales, grossSales } = salesData
  const { cogsPercent, opexPercent, revenueMultiple, ebitdaMultiple } = settings
  const revenue = annualisedSales || grossSales
  const cogs = revenue * (cogsPercent / 100)
  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const opex = revenue * (opexPercent / 100)
  const ebitda = grossProfit - opex
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0
  const valByRevenue = revenue * revenueMultiple
  const valByEbitda = ebitda * ebitdaMultiple
  const valMid = (valByRevenue + valByEbitda) / 2
  return { revenue, cogs, grossProfit, grossMargin, opex, ebitda, ebitdaMargin, valByRevenue, valByEbitda, valMid }
}
