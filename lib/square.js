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
  return data.merchant
}

export async function getLocations(accessToken) {
  const res = await fetch(BASE_URL + '/v2/locations', {
    headers: { Authorization: 'Bearer ' + accessToken, 'Square-Version': '2024-01-17' },
  })
  const data = await res.json()
  return data.locations || []
}

export async function getSalesData(accessToken, locationIds, months) {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - (months || 12))
  const beginTime = startDate.toISOString()
  const endTime = endDate.toISOString()
  let cursor = null
  let allOrders = []
  do {
    const body = {
      location_ids: locationIds,
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
    const res = await fetch(BASE_URL + '/v2/orders/search', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'Square-Version': '2024-01-17' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.orders) allOrders = allOrders.concat(data.orders)
    cursor = data.cursor
  } while (cursor)
  return processOrders(allOrders)
}

function processOrders(orders) {
  let grossSales = 0, totalTax = 0, totalDiscounts = 0
  const monthlySales = {}
  for (const order of orders) {
    const month = order.created_at && order.created_at.substring(0, 7)
    const gross = (order.total_money && order.total_money.amount || 0) / 100
    const tax = (order.total_tax_money && order.total_tax_money.amount || 0) / 100
    const discounts = (order.total_discount_money && order.total_discount_money.amount || 0) / 100
    grossSales += gross; totalTax += tax; totalDiscounts += discounts
    if (month) monthlySales[month] = (monthlySales[month] || 0) + gross
  }
  const netSales = grossSales - totalTax - totalDiscounts
  const sortedMonths = Object.keys(monthlySales).sort()
  const monthlyData = sortedMonths.map(function(m) { return { month: m, sales: Math.round(monthlySales[m] * 100) / 100 } })
  const avgMonthlySales = monthlyData.length > 0 ? monthlyData.reduce(function(s, m) { return s + m.sales }, 0) / monthlyData.length : 0
  const recentMonths = monthlyData.slice(-3)
  const olderMonths = monthlyData.slice(-6, -3)
  const recentAvg = recentMonths.length ? recentMonths.reduce(function(s, m) { return s + m.sales }, 0) / recentMonths.length : 0
  const olderAvg = olderMonths.length ? olderMonths.reduce(function(s, m) { return s + m.sales }, 0) / olderMonths.length : 0
  const trendPct = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0
  return {
    grossSales: Math.round(grossSales * 100) / 100,
    netSales: Math.round(netSales * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    totalDiscounts: Math.round(totalDiscounts * 100) / 100,
    orderCount: orders.length,
    avgMonthlySales: Math.round(avgMonthlySales * 100) / 100,
    annualisedSales: Math.round(avgMonthlySales * 12 * 100) / 100,
    monthlyData: monthlyData,
    trendPct: Math.round(trendPct * 10) / 10,
  }
}

export function calculateValuation(salesData, expenses, equipment, ownerAdjustments, settings) {
  const revenueMultiple = settings.revenueMultiple || 0.5
  const ebitdaMultiple = settings.ebitdaMultiple || 2.5
  const revenue = salesData.annualisedSales || salesData.grossSales
  const cogs = expenses.filter(function(e) { return e.normalised_type && e.normalised_type.startsWith('cogs') }).reduce(function(s, e) { return s + e.amount }, 0)
  const totalExpenses = expenses.reduce(function(s, e) { return s + (e.is_excluded ? 0 : e.amount) }, 0)
  const grossProfit = revenue - cogs
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const ebitda = revenue - totalExpenses
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0
  const addBacks = ownerAdjustments.filter(function(a) { return a.type === 'add_back' }).reduce(function(s, a) { return s + a.annual_amount }, 0)
  const removes = ownerAdjustments.filter(function(a) { return a.type === 'remove' }).reduce(function(s, a) { return s + a.annual_amount }, 0)
  const adjustedEbitda = ebitda + addBacks - removes
  const equipmentValue = equipment.reduce(function(s, e) {
    if (e.current_value) return s + parseFloat(e.current_value)
    if (!e.purchase_price || !e.purchase_date) return s
    const years = (new Date() - new Date(e.purchase_date)) / (365.25 * 24 * 3600 * 1000)
    return s + parseFloat(e.purchase_price) * Math.max(0, 1 - years / (e.depreciation_years || 5))
  }, 0)
  const valByRevenue = revenue * revenueMultiple
  const valByEbitda = adjustedEbitda * ebitdaMultiple
  const valByAsset = valByEbitda + equipmentValue
  const valMid = (valByRevenue + valByEbitda) / 2
  return {
    revenue: revenue, cogs: cogs, grossProfit: grossProfit,
    grossMargin: Math.round(grossMargin * 10) / 10,
    totalExpenses: totalExpenses, ebitda: ebitda,
    ebitdaMargin: Math.round(ebitdaMargin * 10) / 10,
    adjustedEbitda: adjustedEbitda, addBacks: addBacks, removes: removes,
    equipmentValue: Math.round(equipmentValue),
    valByRevenue: Math.round(valByRevenue), valByEbitda: Math.round(valByEbitda),
    valByAsset: Math.round(valByAsset), valMid: Math.round(valMid),
  }
}
