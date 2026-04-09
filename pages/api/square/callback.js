import { exchangeCodeForToken } from '../../../lib/square'
import { setSessionCookie } from '../../../lib/session'

export default async function handler(req, res) {
  const { code, error } = req.query
  if (error || !code) return res.redirect('/?error=oauth_denied')
  try {
    const tokenData = await exchangeCodeForToken(code)
    if (!tokenData.access_token) {
      console.error('Token exchange failed:', tokenData)
      return res.redirect('/?error=token_failed')
    }
    setSessionCookie(res, {
      accessToken: tokenData.access_token,
      merchantId: tokenData.merchant_id,
      expiresAt: tokenData.expires_at,
    })
    return res.redirect('/dashboard')
  } catch (err) {
    console.error('OAuth callback error:', err)
    return res.redirect('/?error=server_error')
  }
}
