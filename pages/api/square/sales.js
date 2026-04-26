import { getSalesData } from '../../../lib/square'
import { supabase, supabaseAdmin } from '../../../lib/supabase'

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data: { user } } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  const { cafeId, months = 12 } = req.query
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
    const salesData = await getSalesData(integration.access_token, locationIds, parseInt(months))
    await supabaseAdmin.from('integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', integration.id)
    return res.status(200).json({ salesData, newRowsFetched: 0, lastSyncedFrom: 'full' })
  } catch (err) {
    console.error('Sales error:', err)
    return res.status(500).json({ error: err.message })
  }
}
