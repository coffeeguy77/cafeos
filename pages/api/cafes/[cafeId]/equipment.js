import { supabase, supabaseAdmin } from '../../../../lib/supabase'

export default async function handler(req, res) {
  const { cafeId } = req.query
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data: { user } } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Not authenticated' })

  const { data: cafe } = await supabase.from('cafes').select('id').eq('id', cafeId).eq('owner_id', user.id).single()
  if (!cafe) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.from('equipment').select('*').eq('cafe_id', cafeId).order('category').order('name')
    if (error) return res.status(500).json({ error: error.message })
    const totalValue = data.reduce((sum, item) => {
      if (item.current_value) return sum + parseFloat(item.current_value)
      if (!item.purchase_price || !item.purchase_date) return sum
      const years = (new Date() - new Date(item.purchase_date)) / (365.25 * 24 * 3600 * 1000)
      return sum + parseFloat(item.purchase_price) * Math.max(0, 1 - years / (item.depreciation_years || 5))
    }, 0)
    return res.status(200).json({ equipment: data, totalValue: Math.round(totalValue) })
  }
  if (req.method === 'POST') {
    const { data, error } = await supabaseAdmin.from('equipment').insert({ ...req.body, cafe_id: cafeId }).select().single()
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
