import { supabase, supabaseAdmin } from '../../../../lib/supabase'

export default async function handler(req, res) {
  const { cafeId } = req.query
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data: { user } } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Not authenticated' })
  const { data: cafe } = await supabase.from('cafes').select('id').eq('id', cafeId).eq('owner_id', user.id).single()
  if (!cafe) return res.status(403).json({ error: 'Forbidden' })

  if (req.method === 'GET') {
    const { data } = await supabaseAdmin.from('owner_adjustments').select('*').eq('cafe_id', cafeId).order('type').order('label')
    return res.status(200).json({ adjustments: data || [] })
  }
  if (req.method === 'POST') {
    const { data, error } = await supabaseAdmin.from('owner_adjustments').insert({ ...req.body, cafe_id: cafeId }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json({ adjustment: data })
  }
  if (req.method === 'DELETE') {
    const { id } = req.body
    await supabaseAdmin.from('owner_adjustments').delete().eq('id', id).eq('cafe_id', cafeId)
    return res.status(200).json({ ok: true })
  }
  return res.status(405).end()
}
