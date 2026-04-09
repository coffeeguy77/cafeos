import { getOAuthUrl } from '../../../lib/square'
import { clearSession } from '../../../lib/session'

export default function handler(req, res) {
  if (req.method === 'DELETE') {
    clearSession(res)
    return res.status(200).json({ ok: true })
  }
  return res.status(200).json({ url: getOAuthUrl() })
}
