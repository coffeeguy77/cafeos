import { supabase } from '../../../lib/supabase'
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { email, password, full_name } = req.body
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } })
  if (error) return res.status(400).json({ error: error.message })
  return res.status(200).json({ user: data.user })
}
