import { supabase, supabaseAdmin } from '../../../lib/supabase'

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  // Verify the token and get the user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('cafes')
      .select('*, integrations(id, type, status, merchant_name, selected_location_name, last_synced_at)')
      .eq('owner_id', user.id)
      .order('created_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ cafes: data })
  }

  if (req.method === 'POST') {
    const { name, description, address, city, state, currency, timezone, business_type } = req.body
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now()
    const { data, error } = await supabaseAdmin
      .from('cafes')
      .insert({
        owner_id: user.id,
        name,
        slug,
        description,
        address,
        city,
        state,
        currency: currency || 'AUD',
        timezone: timezone || 'Australia/Sydney',
        business_type: business_type || 'cafe'
      })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ cafe: data })
  }

  return res.status(405).end()
}
