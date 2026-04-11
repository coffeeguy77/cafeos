import { supabase, supabaseAdmin } from '../../../../lib/supabase'

export default async function handler(req, res) {
  const { cafeId } = req.query
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Invalid token' })

  // Use admin client to bypass RLS for ownership check
  const { data: cafe } = await supabaseAdmin.from('cafes').select('id').eq('id', cafeId).eq('owner_id', user.id).single()
  if (!cafe) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('equipment').select('*').eq('cafe_id', cafeId).order('created_at')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ equipment: data })
  }

  if (req.method === 'POST') {
    const { name, category, brand, purchase_date, purchase_price, condition, depreciation_years, notes } = req.body
    const { data, error } = await supabaseAdmin.from('equipment').insert({
      cafe_id: cafeId, name, category, brand, purchase_date,
      purchase_price: purchase_price ? parseFloat(purchase_price) : null,
      condition: condition || 'good',
      depreciation_years: depreciation_years ? parseInt(depreciation_years) : 5,
      notes
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ equipment: data })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    await supabaseAdmin.from('equipment').delete().eq('id', id).eq('cafe_id', cafeId)
    return res.status(200).json({ ok: true })
  }

  return res.status(405).end()
}
