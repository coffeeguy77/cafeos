import { getSalesDataIncremental } from '../../../lib/square'
import { supabase, supabaseAdmin } from '../../../lib/supabase'

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data: { user } } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Not authenticated' })

  const { cafeId, months = 12, forceSync = 'false' } = req.query

  try {
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('*, integration_locations(*)')
      .eq('cafe_id', cafeId).eq('type', 'square').single()

    if (!integration?.access_token) return res.status(404).json({ error: 'Square not connected' })

    const selectedLocations = integration.integration_locations?.filter(l => l.is_selected)
    const locationIds = selectedLocations?.length > 0
      ? selectedLocations.map(l => l.external_id)
      : integration.selected_location_id ? [integration.selected_location_id] : null

    if (!locationIds) return res.status(400).json({ error: 'No location selected' })

    // Check cache — find the latest date we have stored
    const { data: latestRow } = await supabaseAdmin
      .from('square_orders_cache')
      .select('order_date')
      .eq('cafe_id', cafeId)
      .order('order_date', { ascending: false })
      .limit(1)
      .single()

    const isForced = forceSync === 'true'
    const lastDate = (!isForced && latestRow?.order_date) ? latestRow.order_date : null

    // Fetch only new data from Square (incremental)
    const newRows = await getSalesDataIncremental(integration.access_token, locationIds, lastDate, cafeId)

    // Upsert new rows into cache
    if (newRows.length > 0) {
      await supabaseAdmin.from('square_orders_cache')
        .upsert(newRows, { onConflict: 'cafe_id,order_date' })
    }

    await supabaseAdmin.from('integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', integration.id)

    // Read full cache for requested period
    const fromDate = new Date()
    fromDate.setMonth(fromDate.getMonth() - parseInt(months))
    const { data: cached } = await supabaseAdmin
      .from('square_orders_cache')
      .select('order_date, gross_amount, net_amount, order_count')
      .eq('cafe_id', cafeId)
      .gte('order_date', fromDate.toISOString().split('T')[0])
      .order('order_date', { ascending: true })

    const salesData = aggregateCachedSales(cached || [], parseInt(months))

    return res.status(200).json({
      salesData,
      newRowsFetched: newRows.length,
      lastSyncedFrom: lastDate || 'full',
      merchant: { business_name: integration.merchant_name },
      locations: selectedLocations,
    })
  } catch (err) {
    console.error('Sales data error:', err)
    return res.status(500).json({ error: 'Failed to fetch sales data', detail: err.message })
  }
}

function aggregateCachedSales(rows, months) {
  if (!rows.length) return null
  const gross = rows.reduce((s, r) => s + Number(r.gross_amount), 0)
  const net = rows.reduce((s, r) => s + Number(r.net_amount), 0)
  const orders = rows.reduce((s, r) => s + Number(r.order_count), 0)
  const actualMonths = months
  return {
    grossSales: gross,
    netSales: net,
    orderCount: orders,
    avgMonthlySales: net / actualMonths,
    annualisedSales: (net / actualMonths) * 12,
    months: actualMonths,
    dailyBreakdown: rows,
  }
}
