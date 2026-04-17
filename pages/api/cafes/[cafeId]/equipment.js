import { supabase, supabaseAdmin } from '../../../../lib/supabase'

export default async function handler(req, res) {
  const { cafeId } = req.query
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  const { data: cafe } = await supabaseAdmin.from('cafes').select('id').eq('id', cafeId).eq('owner_id', user.id).single()
  if (!cafe) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('equipment').select('*').eq('cafe_id', cafeId).order('created_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ equipment: data })
  }

  if (req.method === 'POST') {
    const { name, category, brand, purchase_date, purchase_price, condition, depreciation_years,
      valuation_mode, secondhand_value, replacement_cost, manual_value, ownership, notes } = req.body
    const { data, error } = await supabaseAdmin.from('equipment').insert({
      cafe_id: cafeId, name, category, brand,
      purchase_date: purchase_date || null,
      purchase_price: purchase_price ? parseFloat(purchase_price) : null,
      condition: condition || 'good',
      depreciation_years: depreciation_years ? parseInt(depreciation_years) : 5,
      valuation_mode: valuation_mode || 'depreciated',
      secondhand_value: secondhand_value ? parseFloat(secondhand_value) : null,
      replacement_cost: replacement_cost ? parseFloat(replacement_cost) : null,
      manual_value: manual_value ? parseFloat(manual_value) : null,
      ownership: ownership || 'cafe',
      notes: notes || null,
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ equipment: data })
  }

  if (req.method === 'PATCH') {
    const { id, name, category, brand, purchase_date, purchase_price, condition, depreciation_years,
      valuation_mode, secondhand_value, replacement_cost, manual_value, ownership, notes } = req.body
    if (!id) return res.status(400).json({ error: 'Missing id' })
    const { data, error } = await supabaseAdmin.from('equipment').update({
      name, category, brand,
      purchase_date: purchase_date || null,
      purchase_price: purchase_price ? parseFloat(purchase_price) : null,
      condition: condition || 'good',
      depreciation_years: depreciation_years ? parseInt(depreciation_years) : 5,
      valuation_mode: valuation_mode || 'depreciated',
      secondhand_value: secondhand_value ? parseFloat(secondhand_value) : null,
      replacement_cost: replacement_cost ? parseFloat(replacement_cost) : null,
      manual_value: manual_value ? parseFloat(manual_value) : null,
      ownership: ownership || 'cafe',
      notes: notes || null,
    }).eq('id', id).eq('cafe_id', cafeId).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ equipment: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'Missing id' })
    await supabaseAdmin.from('equipment').delete().eq('id', id).eq('cafe_id', cafeId)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
