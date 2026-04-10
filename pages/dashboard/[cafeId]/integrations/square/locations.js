import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { supabase } from '../../../../../lib/supabase'

export default function SquareLocations() {
  const router = useRouter()
  const { cafeId } = router.query
  const [locations, setLocations] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (cafeId) fetchLocations() }, [cafeId])

  async function fetchLocations() {
    const { data } = await supabase
      .from('integrations')
      .select('id, merchant_name, integration_locations(*)')
      .eq('cafe_id', cafeId).eq('type', 'square').single()
    if (data?.integration_locations) {
      setLocations(data.integration_locations)
      setSelected(data.integration_locations.filter(l => l.is_selected).map(l => l.id))
    }
    setLoading(false)
  }

  function toggle(id) { setSelected(p => p.includes(id) ? p.filter(i => i !== id) : [...p, id]) }

  async function save() {
    if (selected.length === 0) return
    setSaving(true)
    const { data: integration } = await supabase.from('integrations').select('id').eq('cafe_id', cafeId).eq('type', 'square').single()
    for (const loc of locations) {
      await supabase.from('integration_locations').update({ is_selected: selected.includes(loc.id) }).eq('id', loc.id)
    }
    const primaryLoc = locations.find(l => selected.includes(l.id))
    if (primaryLoc) {
      await supabase.from('integrations').update({
        selected_location_id: primaryLoc.external_id,
        selected_location_name: locations.filter(l => selected.includes(l.id)).map(l => l.name).join(', '),
      }).eq('id', integration.id)
    }
    router.push(`/dashboard/${cafeId}`)
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Loading locations…</p></div>

  return (
    <>
      <Head><title>Choose Square location — Caféos</title></Head>
      <div style={s.page}><div style={s.card}>
        <div style={s.logo}>☕ Caféos</div>
        <h1 style={{ fontSize: '26px', marginBottom: '8px' }}>Choose your location</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '1.75rem', lineHeight: 1.6 }}>Your Square account has multiple locations. Select which ones to use for this café.</p>
        <div style={{ display: 'grid', gap: '10px', marginBottom: '1.5rem' }}>
          {locations.map(loc => (
            <button key={loc.id} onClick={() => toggle(loc.id)}
              style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: selected.includes(loc.id) ? '2px solid var(--crema)' : '1.5px solid var(--border-strong)', background: selected.includes(loc.id) ? 'var(--crema-pale)' : 'white', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${selected.includes(loc.id) ? 'var(--crema)' : 'var(--border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected.includes(loc.id) ? 'var(--crema)' : 'transparent', flexShrink: 0 }}>
                {selected.includes(loc.id) && <span style={{ color: 'white', fontSize: '11px' }}>✓</span>}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 500, fontSize: '15px' }}>{loc.name}</div>
                {loc.address && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{loc.address}</div>}
              </div>
            </button>
          ))}
        </div>
        <button className="btn-primary" style={{ width: '100%' }} onClick={save} disabled={selected.length === 0 || saving}>
          {saving ? 'Saving…' : `Use ${selected.length} location${selected.length !== 1 ? 's' : ''}`}
        </button>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '12px' }}>You can change this later in integrations settings</p>
      </div></div>
    </>
  )
}

const s = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(160deg, #faf7f2 0%, #f0e6d3 100%)', padding: '2rem' },
  card: { background: 'white', borderRadius: '20px', padding: '2.5rem', width: '100%', maxWidth: '480px', boxShadow: '0 8px 40px rgba(26,10,0,0.1)' },
  logo: { fontFamily: "'DM Serif Display', serif", fontSize: '20px', color: 'var(--espresso)', marginBottom: '1.5rem' },
                }
