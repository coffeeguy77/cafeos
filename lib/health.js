// lib/health.js
export function calculateHealthScore(salesData, valuation, alerts) {
  const scores = []
  const trend = salesData.trendPct || 0
  let revenueScore = 15
  if (trend > 10) revenueScore = 25
  else if (trend > 5) revenueScore = 22
  else if (trend > 0) revenueScore = 18
  else if (trend > -5) revenueScore = 12
  else if (trend > -15) revenueScore = 6
  else revenueScore = 0
  scores.push({ label: 'Revenue trend', score: revenueScore, max: 25 })

  const margin = valuation.grossMargin || 0
  let marginScore = 0
  if (margin >= 65) marginScore = 20
  else if (margin >= 60) marginScore = 17
  else if (margin >= 55) marginScore = 13
  else if (margin >= 50) marginScore = 8
  else if (margin >= 40) marginScore = 4
  scores.push({ label: 'Gross margin', score: marginScore, max: 20 })

  const ebitdaMargin = valuation.ebitdaMargin || 0
  let ebitdaScore = 0
  if (ebitdaMargin >= 20) ebitdaScore = 20
  else if (ebitdaMargin >= 15) ebitdaScore = 17
  else if (ebitdaMargin >= 10) ebitdaScore = 13
  else if (ebitdaMargin >= 5) ebitdaScore = 8
  else if (ebitdaMargin >= 0) ebitdaScore = 3
  scores.push({ label: 'EBITDA margin', score: ebitdaScore, max: 20 })

  const monthlyData = salesData.monthlyData || []
  let consistencyScore = 15
  if (monthlyData.length >= 12) {
    const avg = monthlyData.reduce((s, m) => s + m.sales, 0) / monthlyData.length
    const variance = monthlyData.reduce((s, m) => s + Math.pow(m.sales - avg, 2), 0) / monthlyData.length
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 1
    if (cv < 0.1) consistencyScore = 20
    else if (cv < 0.2) consistencyScore = 17
    else if (cv < 0.3) consistencyScore = 13
    else if (cv < 0.5) consistencyScore = 8
    else consistencyScore = 3
  }
  scores.push({ label: 'Revenue consistency', score: consistencyScore, max: 20 })

  const ordersPerMonth = (salesData.orderCount || 0) / Math.max(monthlyData.length, 1)
  let orderScore = 0
  if (ordersPerMonth >= 5000) orderScore = 15
  else if (ordersPerMonth >= 3000) orderScore = 12
  else if (ordersPerMonth >= 1500) orderScore = 9
  else if (ordersPerMonth >= 500) orderScore = 6
  else if (ordersPerMonth >= 100) orderScore = 3
  scores.push({ label: 'Order volume', score: orderScore, max: 15 })

  const total = scores.reduce((s, c) => s + c.score, 0)
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'F'
  const label = total >= 85 ? 'Excellent' : total >= 70 ? 'Good' : total >= 55 ? 'Average' : total >= 40 ? 'Needs attention' : 'Critical'
  return { total, grade, label, breakdown: scores }
}

export function generateAlerts(salesData, valuation) {
  const alerts = []
  if (salesData.trendPct < -10) {
    alerts.push({ type: 'revenue_drop', severity: 'critical', title: 'Revenue declining significantly', message: `Revenue is down ${Math.abs(salesData.trendPct)}% over the last 3 months. Investigate immediately.`, metric_name: 'revenue_trend', metric_change_pct: salesData.trendPct })
  } else if (salesData.trendPct < -5) {
    alerts.push({ type: 'revenue_drop', severity: 'warning', title: 'Revenue trending down', message: `Revenue has dropped ${Math.abs(salesData.trendPct)}% recently. Monitor closely.`, metric_name: 'revenue_trend', metric_change_pct: salesData.trendPct })
  }
  if (valuation.ebitdaMargin < 5 && valuation.ebitdaMargin >= 0) {
    alerts.push({ type: 'margin_drop', severity: 'warning', title: 'EBITDA margin is very thin', message: `Your EBITDA margin is ${valuation.ebitdaMargin}%. Industry benchmark is 10-20%.`, metric_name: 'ebitda_margin', metric_value: valuation.ebitdaMargin })
  } else if (valuation.ebitdaMargin < 0) {
    alerts.push({ type: 'margin_drop', severity: 'critical', title: 'Business is operating at a loss', message: `EBITDA is negative (${valuation.ebitdaMargin}%). Immediate action required.`, metric_name: 'ebitda_margin', metric_value: valuation.ebitdaMargin })
  }
  if (salesData.trendPct > 10) {
    alerts.push({ type: 'positive_trend', severity: 'positive', title: 'Strong revenue growth', message: `Revenue is up ${salesData.trendPct}% over the last 3 months.`, metric_name: 'revenue_trend', metric_change_pct: salesData.trendPct })
  }
  return alerts
}
