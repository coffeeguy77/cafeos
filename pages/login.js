import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabase'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <>
      <Head><title>Sign in — Caféos</title></Head>
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logo}>☕ Caféos</div>
          <h1 style={s.title}>Welcome back</h1>
          <p style={s.sub}>Sign in to your account</p>
          {error && <div style={s.err}>{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group"><label className="form-label">Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></div>
            <div className="form-group"><label className="form-label">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required /></div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p style={s.footer}>Don't have an account? <Link href="/signup" style={{ color: 'var(--crema)' }}>Sign up</Link></p>
        </div>
      </div>
    </>
  )
}

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #faf7f2 0%, #f0e6d3 100%)', padding: '2rem' },
  card: { background: 'white', borderRadius: '20px', padding: '2.5rem', width: '100%', maxWidth: '420px', boxShadow: '0 8px 40px rgba(26,10,0,0.1)' },
  logo: { fontFamily: "'DM Serif Display', serif", fontSize: '20px', color: 'var(--espresso)', marginBottom: '1.5rem' },
  title: { fontSize: '28px', marginBottom: '6px' },
  sub: { fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '1.75rem' },
  err: { background: 'var(--danger-light)', color: 'var(--danger)', padding: '10px 14px', borderRadius: '8px', fontSize: '14px', marginBottom: '1rem' },
  footer: { textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)', marginTop: '1.5rem' },
}
