import { exchangeCodeForToken, getMerchantInfo, getLocations } from '../../../lib/square'
import { supabaseAdmin } from '../../../lib/supabase'

export default async function handler(req, res) {
  const { code, error, state } = req.query
  if (error || !code) return res.redirect('/?error=oauth_denied')

  let cafeId
  try { const parsed = JSON.parse(state); cafeId = parsed.cafeId } catch { return res.redirect('/?error=invalid_state') }

  try {
    const tokenData = await exchangeCodeForToken(code)
    if (!tokenData.access_token) return res.redirect('/?error=token_failed')

    const [merchant, locations] = await Promise.all([
      getMerchantInfo(tokenData.access_token),
      getLocations(tokenData.access_token),
    ])

    const { data: integration, error: intError } = await supabaseAdmin
      .from('integrations')
      .upsert({ cafe_id: cafeId, type: 'square', status: 'connected', access_token: tokenData.access_token, merchant_id: tokenData.merchant_id, merchant_name: merchant?.business_name, token_expires_at: tokenData.expires_at, last_synced_at: new Date().toISOString() }, { onConflict: 'cafe_id,type' })
      .select().single()

    if (intError) throw intError

    if (locations.length > 0) {
      await supabaseAdmin.from('integration_locations').delete().eq('integration_id', integration.id)
      await supabaseAdmin.from('integration_locations').insert(
        locations.map(l => ({ integration_id: integration.id, external_id: l.id, name: l.name, address: [l.address?.address_line_1, l.address?.locality].filter(Boolean).join(', '), is_selected: locations.length === 1, metadata: { status: l.status } }))
      )
    }

    if (locations.length === 1) {
      await supabaseAdmin.from('integrations').update({ selected_location_id: locations[0].id, selected_location_name: locations[0].name }).eq('id', integration.id)
      return res.redirect(`/dashboard/${cafeId}`)
    }

    return res.redirect(`/dashboard/${cafeId}/integrations/square/locations`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    return res.redirect('/?error=server_error')
  }
}
