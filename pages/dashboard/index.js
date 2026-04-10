import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [cafes, setCafes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newCafe, setNewCafe] = useState({ name: '', city: '', business_type: 'cafe' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      fetchCafes()
    })
  }, [])

  async function fetchCafes() {
    const { data } = await supabase.from('cafes')
      .select('*, integrations(id, type, status, merchant_name, selected_location_name, last_synced_at)')
      .order('created_at')
    setCafes(data || [])
    setLoading(false)
  }

  async function createCafe(e) {
    e.preventDefault(); setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/cafes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(newCafe),
    })
    const data = await res.json()
    if (data.cafe) { setShowNew(false); router.push(`/dashboard/${data.cafe.id}`) }
    setCreating(false)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ fontFamily: "'DM Serif Display', serif", color: 'var(--text-secondary)' }}>Loading…</p></div>

  return (
    <>
      <Head><title>My Cafés — Caféos</title></Head>
      <div style={{ minHeight: '100vh', background: 'var(--milk)' }}>
        <nav style={s.nav}>
          <span style={s.logo}>☕ Caféos</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{user?.email}</span>
            <button className="btn-secondary" style={{ padding: '7px 16px', fontSize: '13px' }} onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}>Sign out</button>
          </div>
        </nav>
        <main style={s.main}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h1 style={{ fontSize: '32px', marginBottom: '6px' }}>Your cafés</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>{cafes.length === 0 ? 'Add your first café to get started' : `${cafes.length} café${cafes.length !== 1 ? 's' : ''}`}</p>
            </div>
            <button className="btn-primary" onClick={() => setShowNew(true)}>+ Add café</button>
          </div>

          {showNew && (
            <div style={{ background: 'white', border: '2px solid var(--crema)', borderRadius: '16px', padding: '1.75rem', marginBottom: '1.5rem' }}>
              <h3 style={{ marginBottom: '1.25rem', fontSize: '18px' }}>Add a new café</h3>
              <form onSubmit={createCafe}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Café name *</label><input value={newCafe.name} onChange={e => setNewCafe(f => ({ ...f, name: e.target.value }))} placeholder="Bean Culture" required /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">City</label><input value={newCafe.city} onChange={e => setNewCafe(f => ({ ...f, city: e.target.value }))} placeholder="Melbourne" /></div>
                </div>
                <div className="form-group"><label className="form-label">Type</label>
                  <select value={newCafe.business_type} onChange={e => setNewCafe(f => ({ ...f, business_type: e.target.value }))}>
                    {['cafe','roastery','restaurant','bakery','bar','other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn-primary" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create café'}</button>
                  <button className="btn-secondary" type="button" onClick={() => setShowNew(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {cafes.length === 0 && !showNew ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '20px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '56px', marginBottom: '1rem' }}>☕</div>
              <h2 style={{ marginBottom: '8px' }}>No cafés yet</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Add your first café to start tracking its valuation</p>
              <button className="btn-primary" onClick={() => setShowNew(true)}>+ Add your first café</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {cafes.map(cafe => {
                const sq = cafe.integrations?.find(i => i.type === 'square')
                return (
                  <Link key={cafe.id} href={`/dashboard/${cafe.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.25rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--crema-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Serif Display', serif", fontSize: '20px', color: 'var(--crema)', flexShrink: 0 }}>{cafe.name.charAt(0).toUpperCase()}</div>
                        <div style={{ flex: 1 }}>
                          <h3 style={{ fontSize: '17px', marginBottom: '2px' }}>{cafe.name}</h3>
                          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{cafe.city || 'No location set'}</p>
                        </div>
                        <span style={{ color: 'var(--text-muted)' }}>→</span>
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                        {sq?.status === 'connected' ? <span className="badge badge-success">✓ Square connected</span> : <span className="badge badge-neutral">Square not connected</span>}
                        {sq?.selected_location_name && <span className="badge badge-info" style={{ marginLeft: '6px' }}>{sq.selected_location_name}</span>}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </>
  )
}

const s = {
  nav: { padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'rgba(250,247,242,0.95)', position: 'sticky', top: 0, zIndex: 10 },
  logo: { fontFamily: "'DM Serif Display', serif", fontSize: '20px', color: 'var(--espresso)' },
  main: { maxWidth: '900px', margin: '0 auto', padding: '2.5rem 1.5rem' },
}
