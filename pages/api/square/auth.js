import { getOAuthUrl } from '../../../lib/square'
import { supabaseAdmin } from '../../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    const { cafeId } = req.body
    await supabaseAdmin.from('integrations').delete().match({ cafe_id: cafeId, type: 'square' })
    return res.status(200).json({ ok: true })
  }
  const { cafeId } = req.query
  if (!cafeId) return res.status(400).json({ error: 'cafeId required' })
  const url = getOAuthUrl(cafeId, Date.now().toString())
  return res.status(200).json({ url })
}
