import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../lib/supabase'

export default function Signup() {
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSignup(e) {
    e.preventDefault(); setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({ email: form.email, password: form.password, options: { data: { full_name: form.full_name } } })
    if (error) { setError(error.message); setLoading(false) } else setSuccess(true)
  }

  if (success) return (
    <div style={s.page}><div style={s.card}>
      <div style={s.logo}>☕ Caféos</div>
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📧</div>
        <h2 style={{ marginBottom: '8px' }}>Check your email</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>We sent a confirmation link to <strong>{form.email}</strong></p>
        <Link href="/login"><button className="btn-secondary" style={{ marginTop: '1.5rem' }}>Back to login</button></Link>
      </div>
    </div></div>
  )

  return (
    <>
      <Head><title>Create account — Caféos</title></Head>
      <div style={s.page}><div style={s.card}>
        <div style={s.logo}>☕ Caféos</div>
        <h1 style={s.title}>Create your account</h1>
        <p style={s.sub}>Start with one café, free forever</p>
        {error && <div style={s.err}>{error}</div>}
        <form onSubmit={handleSignup}>
          <div className="form-group"><label className="form-label">Full name</label><input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Shaun Matthews" required /></div>
          <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" required /></div>
          <div className="form-group"><label className="form-label">Password</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min 8 characters" minLength={8} required /></div>
          <button className="btn-primary" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>{loading ? 'Creating…' : 'Create account'}</button>
        </form>
        <p style={s.footer}>Already have an account? <Link href="/login" style={{ color: 'var(--crema)' }}>Sign in</Link></p>
      </div></div>
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
