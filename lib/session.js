import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me'
const ALGORITHM = 'aes-256-cbc'

function getKey() {
  return createHash('sha256').update(SECRET).digest()
}

export function encrypt(text) {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export function decrypt(text) {
  try {
    const [ivHex, encHex] = text.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const enc = Buffer.from(encHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

export function setSessionCookie(res, data) {
  const value = encrypt(JSON.stringify(data))
  res.setHeader('Set-Cookie', `sq_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`)
}

export function getSession(req) {
  const cookie = req.cookies?.sq_session
  if (!cookie) return null
  const decrypted = decrypt(cookie)
  if (!decrypted) return null
  try { return JSON.parse(decrypted) } catch { return null }
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', 'sq_session=; Path=/; HttpOnly; Max-Age=0')
}
