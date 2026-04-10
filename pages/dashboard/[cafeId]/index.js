import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { calculateValuation } from '../../../lib/square'
import { calculateHealthScore, generateAlerts } from '../../../lib/health'

function fmt(v) { return '$' + Math.round(Math.abs(v || 0)).toLocaleString('en-AU') }
function pct(v) { return (v || 0).toFixed(1) + '%' }
const DEF = { cogsPercent: 35, opexPercent: 44, revenueMultiple: 0.5, ebitdaMultiple: 2.5, months: 12 }

export default function CafeDashboard() {
  const router = useRouter()
  const { cafeId } = router.query
  const [cafe, setCafe] = useState(null)
  const [salesData, setSalesData] = useState(null)
  const [equipment, setEquipment] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [settings, setSettings] = useState(DEF)
  const [valuation, setValuation] = useState(null)
  const [healthScore, setHealthScore] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState('overview')
  const [squareConnected, setSquareConnected] = useState(false)

  useEffect(() => { if (cafeId) init() }, [cafeId])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('cafes')
      .select('*, integrations(*, integration_locations(*))')
      .eq('id', cafeId).eq('owner_id', user.id).single()
    if (!data) { router.push('/dashboard'); return }
    setCafe(data)
    const sq = data.integrations?.find(i => i.type === 'square')
    setSquareConnected(sq?.status === 'connected')
    if (sq?.status === 'connected') await fetchSales()
    await Promise.all([fetchEquipment(), fetchAdjustments()])
    setLoading(false)
  }

  async function fetchSales(months) {
    setSyncing(true)
    const token = await getToken()
    const m = months || settings.months
    const res = await fetch('/api/square/sales?cafeId=' + cafeId + '&months=' + m, {
      headers: { Authorization: 'Bearer ' + token }
    })
    if (res.ok) { const d = await res.json(); setSalesData(d.salesData) }
    setSyncing(false)
  }

  async function fetchEquipment() {
    const token = await getToken()
    const res = await fetch('/api/cafes/' + cafeId + '/equipment', { headers: { Authorization: 'Bearer ' + token } })
    if (res.ok) { const d = await res.json(); setEquipment(d.equipment || []) }
  }

  async function fetchAdjustments() {
    const token = await getToken()
    const res = await fetch('/api/cafes/' + cafeId + '/adjustments', { headers: { Authorization: 'Bearer ' + token } })
    if (res.ok) { const d = await res.json(); setAdjustments(d.adjustments || []) }
  }

  useEffect(() => {
    if (!salesData) return
    const rev = salesData.annualisedSales
    const expenses = [
      { normalised_type: 'cogs_other', amount: rev * (settings.cogsPercent / 100), is_excluded: false },
      { normalised_type: 'occupancy_other', amount: rev * (settings.opexPercent / 100), is_excluded: false },
    ]
    const val = calculateValuation(salesData, expenses, equipment, adjustments, settings)
    setValuation(val)
    setHealthScore(calculateHealthScore(salesData, val, []))
    setAlerts(generateAlerts(salesData, val))
  }, [salesData, equipment, adjustments, settings])

  function setSetting(k, v) { setSettings(s => ({ ...s, [k]: v })) }

  async function connectSquare() {
    const res = await fetch('/api/square/auth?cafeId=' + cafeId)
    const { url } = await res.json()
    window.location.href = url
  }

  const hColor = !healthScore ? 'var(--text-muted)' : healthScore.total >= 70 ? 'var(--success)' : healthScore.total >= 40 ? 'var(--warning)' : 'var(--danger)'

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--milk)' }}>
      <p style={{ fontFamily: 'serif', fontSize: '18px', color: 'var(--text-secondary)' }}>Brewing your valuation…</p>
    </div>
  )

  return (
    <>
      <Head><title>{cafe && cafe.name} — Caféos</title></Head>
      <div style={{ minHeight: '100vh', background: 'var(--milk)' }}>
        <nav style={s.nav}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/dashboard" style={{ color: 'var(--text-muted)', fontSize: '14px' }}>← All cafés</Link>
            <span style={s.logo}>☕ {cafe && cafe.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {healthScore && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'white', borderRadius: '20px', border: '1px solid var(--border)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Health</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: hColor }}>{healthScore.total}/100 {healthScore.grade}</span>
              </div>
            )}
            {squareConnected
              ? <button className="btn-secondary" style={{ fontSize: '13px', padding: '7px 14px' }} onClick={() => fetchSales()}>{syncing ? 'Syncing…' : '↻ Sync'}</button>
              : <button className="btn-primary" style={{ fontSize: '13px' }} onClick={connectSquare}>Connect Square</button>
            }
          </div>
        </nav>

        <main style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem 4rem' }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px 16px', borderRadius: '10px', border: '1px solid', marginBottom: '8px', background: a.severity === 'positive' ? 'var(--success-light)' : a.severity === 'critical' ? 'var(--danger-light)' : 'var(--warning-light)', borderColor: a.severity === 'positive' ? 'var(--success)' : a.severity === 'critical' ? 'var(--danger)' : 'var(--warning)' }}>
              <span>{a.severity === 'positive' ? '📈' : a.severity === 'critical' ? '🚨' : '⚠️'}</span>
              <div>
                <strong style={{ fontSize: '14px' }}>{a.title}</strong>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{a.message}</p>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', background: 'white', borderRadius: '12px', padding: '4px', border: '1px solid var(--border)' }}>
            {['overview', 'equipment', 'adjustments', 'integrations'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px', borderRadius: '8px', background: tab === t ? 'var(--espresso)' : 'transparent', border: 'none', fontSize: '14px', color: tab === t ? 'var(--crema-light)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: tab === t ? 500 : 400 }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'overview' && !squareConnected && (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'white', borderRadius: '20px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>🔗</div>
              <h2 style={{ marginBottom: '8px' }}>Connect your Square POS</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Connect Square to pull real sales data and generate an accurate valuation.</p>
              <button className="btn-primary" onClick={connectSquare}>Connect with Square</button>
            </div>
          )}

          {tab === 'overview' && squareConnected && salesData && valuation && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Based on {(salesData.orderCount || 0).toLocaleString()} completed orders</p>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[3, 6, 12].map(m => (
                    <button key={m} onClick={() => { setSetting('months', m); fetchSales(m) }} style={{ fontSize: '13px', padding: '5px 14px', borderRadius: '20px', background: settings.months === m ? 'var(--espresso)' : 'transparent', border: '1px solid ' + (settings.months === m ? 'var(--espresso)' : 'var(--border-strong)'), cursor: 'pointer', color: settings.months === m ? 'var(--crema-light)' : 'var(--text-secondary)' }}>
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '1.5rem' }}>
                <div style={s.valCard}>
                  <p style={s.valTier}>Conservative</p>
                  <p style={s.valAmt}>{fmt(valuation.valByRevenue)}</p>
                  <p style={s.valMethod}>Revenue x {settings.revenueMultiple.toFixed(2)}</p>
                </div>
                <div style={{ ...s.valCard, border: '2px solid var(--crema)', background: '#fffaf5' }}>
                  <p style={{ ...s.valTier, color: 'var(--crema)' }}>Midpoint estimate</p>
                  <p style={{ ...s.valAmt, fontSize: '36px' }}>{fmt(valuation.valMid)}</p>
                  <p style={s.valMethod}>Blended average</p>
                </div>
                <div style={s.valCard}>
                  <p style={s.valTier}>With assets</p>
                  <p style={s.valAmt}>{fmt(valuation.valByAsset)}</p>
                  <p style={s.valMethod}>EBITDA + equipment</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '1.5rem' }}>
                {[['Gross sales', fmt(salesData.grossSales), false], ['Net sales', fmt(salesData.netSales), false], ['Avg monthly', fmt(salesData.avgMonthlySales), false], ['Annualised', fmt(salesData.annualisedSales), true]].map(function(item) {
                  return (
                    <div key={item[0]} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{item[0]}</p>
                      <p style={{ fontSize: '20px', fontFamily: 'serif', color: item[2] ? 'var(--sage)' : 'var(--espresso)' }}>{item[1]}</p>
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div style={s.card}>
                  <h3 style={s.cardTitle}>Profit and loss</h3>
                  {[
                    ['Annual revenue', fmt(valuation.revenue), false, false],
                    ['Less COGS (' + settings.cogsPercent + '%)', '− ' + fmt(valuation.cogs), true, false],
                    ['Gross profit', fmt(valuation.grossProfit) + ' (' + pct(valuation.grossMargin) + ')', false, true],
                    ['Less operating (' + settings.opexPercent + '%)', '− ' + fmt(valuation.totalExpenses - valuation.cogs), true, false],
                    ['EBITDA', fmt(valuation.ebitda) + ' (' + pct(valuation.ebitdaMargin) + ')', false, true],
                    ['Owner add-backs', '+ ' + fmt(valuation.addBacks), false, false],
                    ['Adjusted EBITDA', fmt(valuation.adjustedEbitda), false, true],
                  ].map(function(row, i) {
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontWeight: row[3] ? 500 : 400 }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{row[0]}</span>
                        <span style={{ fontSize: '14px', color: row[2] ? 'var(--danger)' : 'var(--text-primary)' }}>{row[1]}</span>
                      </div>
                    )
                  })}
                  {valuation.equipmentValue > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 500 }}>
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Equipment value</span>
                      <span style={{ fontSize: '14px', color: 'var(--info)' }}>+ {fmt(valuation.equipmentValue)}</span>
                    </div>
                  )}
                </div>

                {healthScore && (
                  <div style={s.card}>
                    <h3 style={s.cardTitle}>Business health</h3>
                    <div style={{ textAlign: 'center', padding: '1rem 0 1.5rem' }}>
                      <div style={{ fontSize: '56px', fontFamily: 'serif', color: hColor, lineHeight: 1 }}>{healthScore.total}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>out of 100</div>
                      <div style={{ display: 'inline-block', marginTop: '8px', padding: '4px 16px', borderRadius: '20px', background: hColor + '20', color: hColor, fontWeight: 500, fontSize: '14px' }}>{healthScore.label}</div>
                    </div>
                    {healthScore.breakdown.map(function(item, i) {
                      var barColor = item.score / item.max >= 0.7 ? 'var(--success)' : item.score / item.max >= 0.4 ? 'var(--warning)' : 'var(--danger)'
                      return (
                        <div key={i} style={{ marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.label}</span>
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>{item.score}/{item.max}</span>
                          </div>
                          <div style={{ height: '4px', background: 'var(--crema-pale)', borderRadius: '2px' }}>
                            <div style={{ height: '100%', width: (item.score / item.max * 100) + '%', background: barColor, borderRadius: '2px' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div style={s.card}>
                <h3 style={s.cardTitle}>Adjust assumptions</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '1.5rem' }}>
                  {[
                    ['COGS % of revenue', 'Food, coffee, packaging — avg 30–40%', 10, 70, 1, settings.cogsPercent, settings.cogsPercent + '%', 'cogsPercent'],
                    ['Operating expenses %', 'Rent, wages, utilities — avg 40–50%', 10, 80, 1, settings.opexPercent, settings.opexPercent + '%', 'opexPercent'],
                    ['Revenue multiple', 'Cafés typically 0.3x–0.8x', 0.1, 2, 0.05, settings.revenueMultiple, settings.revenueMultiple.toFixed(2) + 'x', 'revenueMultiple'],
                    ['EBITDA multiple', 'Cafés typically 2x–4x', 0.5, 8, 0.25, settings.ebitdaMultiple, settings.ebitdaMultiple.toFixed(2) + 'x', 'ebitdaMultiple'],
                  ].map(function(row) {
                    return (
                      <div key={row[7]}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>{row[0]}</span>
                          <span style={{ fontSize: '14px', fontWeight: 500, fontFamily: 'serif' }}>{row[6]}</span>
                        </div>
                        <input type="range" min={row[2]} max={row[3]} step={row[4]} value={row[5]} onChange={function(e) { setSetting(row[7], parseFloat(e.target.value)) }} />
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{row[1]}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {tab === 'equipment' && <EquipmentTab cafeId={cafeId} equipment={equipment} getToken={getToken} onRefresh={fetchEquipment} />}
          {tab === 'adjustments' && <AdjustmentsTab cafeId={cafeId} adjustments={adjustments} getToken={getToken} onRefresh={fetchAdjustments} />}
          {tab === 'integrations' && (
            <div>
              <h2 style={{ fontSize: '22px', marginBottom: '1.5rem' }}>Integrations</h2>
              {[
                { id: 'square', name: 'Square', desc: 'POS sales data, orders, locations', icon: '■', available: true, connected: squareConnected },
                { id: 'xero', name: 'Xero', desc: 'Accounting, expenses, invoices', icon: '✕', available: false, connected: false },
                { id: 'quickbooks', name: 'QuickBooks', desc: 'Accounting and expense tracking', icon: '◆', available: false, connected: false },
                { id: 'lightspeed', name: 'Lightspeed', desc: 'POS sales and inventory', icon: '⚡', available: false, connected: false },
                { id: 'kounta', name: 'Kounta', desc: 'Cloud POS (Lightspeed Restaurant)', icon: '☁', available: false, connected: false },
                { id: 'tyro', name: 'Tyro', desc: 'Payments and EFTPOS data', icon: '💳', available: false, connected: false },
              ].map(function(int) {
                return (
                  <div key={int.id} style={{ background: 'white', border: '1px solid ' + (int.connected ? 'var(--success)' : 'var(--border)'), borderRadius: '14px', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'var(--crema-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{int.icon}</div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong style={{ fontSize: '15px' }}>{int.name}</strong>
                          {int.connected && <span className="badge badge-success">Connected</span>}
                          {!int.available && !int.connected && <span className="badge badge-neutral">Coming soon</span>}
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{int.desc}</p>
                      </div>
                    </div>
                    {int.available && !int.connected && <button className="btn-primary" style={{ fontSize: '13px', padding: '8px 18px' }} onClick={int.id === 'square' ? connectSquare : undefined}>Connect</button>}
                    {int.connected && <span style={{ fontSize: '13px', color: 'var(--success)' }}>✓ Active</span>}
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>
    </>
  )
}

function EquipmentTab({ cafeId, equipment, getToken, onRefresh }) {
  const CATS = ['espresso_machine','grinder','brewer','refrigeration','kitchen','pos_hardware','furniture','fitout','vehicle','other']
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'espresso_machine', brand: '', purchase_date: '', purchase_price: '', condition: 'good', depreciation_years: 5 })
  const [saving, setSaving] = useState(false)

  function depVal(item) {
    if (item.current_value) return parseFloat(item.current_value)
    if (!item.purchase_price || !item.purchase_date) return 0
    var years = (new Date() - new Date(item.purchase_date)) / (365.25 * 24 * 3600 * 1000)
    return parseFloat(item.purchase_price) * Math.max(0, 1 - years / (item.depreciation_years || 5))
  }

  var totalValue = equipment.reduce(function(sum, item) { return sum + depVal(item) }, 0)

  async function save(e) {
    e.preventDefault(); setSaving(true)
    var token = await getToken()
    await fetch('/api/cafes/' + cafeId + '/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(form) })
    onRefresh(); setShowForm(false); setSaving(false)
    setForm({ name: '', category: 'espresso_machine', brand: '', purchase_date: '', purchase_price: '', condition: 'good', depreciation_years: 5 })
  }

  async function del(id) {
    var token = await getToken()
    await fetch('/api/cafes/' + cafeId + '/equipment', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ id }) })
    onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>Equipment ledger</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Total value: <strong style={{ color: 'var(--sage)' }}>{fmt(totalValue)}</strong></p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add item</button>
      </div>
      {showForm && (
        <div style={{ background: 'white', border: '2px solid var(--crema)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.25rem', fontSize: '17px' }}>Add equipment</h3>
          <form onSubmit={save}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group"><label className="form-label">Name *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="La Marzocco Linea PB" required /></div>
              <div className="form-group"><label className="form-label">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Brand</label><input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Condition</label>
                <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                  {['excellent','good','fair','poor'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Purchase date</label><input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Purchase price (AUD)</label><input type="number" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="15000" /></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add item'}</button>
              <button className="btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {equipment.length === 0
        ? <div style={{ textAlign: 'center', padding: '3rem', background: 'white', borderRadius: '16px', border: '1px solid var(--border)' }}><div style={{ fontSize: '40px', marginBottom: '12px' }}>🔧</div><p style={{ color: 'var(--text-secondary)' }}>No equipment added yet.</p></div>
        : <div style={{ display: 'grid', gap: '10px' }}>{equipment.map(item => (
          <div key={item.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <strong style={{ fontSize: '15px' }}>{item.name}</strong>
                {item.brand && <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{item.brand}</span>}
                <span className="badge badge-neutral">{item.category.replace(/_/g, ' ')}</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {item.purchase_price && fmt(item.purchase_price)}
                {item.purchase_date && ' · ' + new Date(item.purchase_date).getFullYear()}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: 500, fontFamily: 'serif' }}>{fmt(depVal(item))}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>current value</div>
              </div>
              <button onClick={() => del(item.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
          </div>
        ))}</div>
      }
    </div>
  )
}

function AdjustmentsTab({ cafeId, adjustments, getToken, onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type: 'add_back', label: '', description: '', annual_amount: '' })
  const [saving, setSaving] = useState(false)
  var addBacks = adjustments.filter(a => a.type === 'add_back').reduce((s, a) => s + Number(a.annual_amount), 0)
  var removes = adjustments.filter(a => a.type === 'remove').reduce((s, a) => s + Number(a.annual_amount), 0)

  async function save(e) {
    e.preventDefault(); setSaving(true)
    var token = await getToken()
    await fetch('/api/cafes/' + cafeId + '/adjustments', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(form) })
    onRefresh(); setShowForm(false); setSaving(false)
    setForm({ type: 'add_back', label: '', description: '', annual_amount: '' })
  }

  async function del(id) {
    var token = await getToken()
    await fetch('/api/cafes/' + cafeId + '/adjustments', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ id }) })
    onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '22px', marginBottom: '4px' }}>Owner adjustments</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Adjust EBITDA to reflect true business earnings</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add adjustment</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--success-light)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <p style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 500, marginBottom: '4px' }}>TOTAL ADD-BACKS</p>
          <p style={{ fontSize: '22px', fontFamily: 'serif', color: 'var(--success)' }}>+{fmt(addBacks)}</p>
        </div>
        <div style={{ background: 'var(--danger-light)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <p style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 500, marginBottom: '4px' }}>TOTAL REMOVALS</p>
          <p style={{ fontSize: '22px', fontFamily: 'serif', color: 'var(--danger)' }}>−{fmt(removes)}</p>
        </div>
      </div>
      {showForm && (
        <div style={{ background: 'white', border: '2px solid var(--crema)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <form onSubmit={save}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group"><label className="form-label">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="add_back">Add-back (increase EBITDA)</option>
                  <option value="remove">Remove (decrease EBITDA)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Label *</label><input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Owner salary" required /></div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Description</label><input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Personal car lease in expenses" /></div>
              <div className="form-group"><label className="form-label">Annual amount (AUD) *</label><input type="number" value={form.annual_amount} onChange={e => setForm(f => ({ ...f, annual_amount: e.target.value }))} placeholder="24000" required /></div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add adjustment'}</button>
              <button className="btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {adjustments.length === 0
        ? <div style={{ textAlign: 'center', padding: '3rem', background: 'white', borderRadius: '16px', border: '1px solid var(--border)' }}><div style={{ fontSize: '40px', marginBottom: '12px' }}>💼</div><p style={{ color: 'var(--text-secondary)' }}>No adjustments yet.</p></div>
        : <div style={{ display: 'grid', gap: '10px' }}>{adjustments.map(adj => (
          <div key={adj.id} style={{ background: 'white', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <strong style={{ fontSize: '15px' }}>{adj.label}</strong>
                <span className={'badge ' + (adj.type === 'add_back' ? 'badge-success' : 'badge-danger')}>{adj.type === 'add_back' ? 'Add-back' : 'Remove'}</span>
              </div>
              {adj.description && <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{adj.description}</p>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '16px', fontWeight: 500, color: adj.type === 'add_back' ? 'var(--success)' : 'var(--danger)', fontFamily: 'serif' }}>
                {adj.type === 'add_back' ? '+' : '−'}{fmt(adj.annual_amount)}/yr
              </span>
              <button onClick={() => del(adj.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            </div>
          </div>
        ))}</div>
      }
    </div>
  )
}

const s = {
  nav: { padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'rgba(250,247,242,0.95)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10 },
  logo: { fontFamily: 'serif', fontSize: '18px', color: 'var(--espresso)' },
  card: { background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem' },
  cardTitle: { fontSize: '16px', marginBottom: '1rem' },
  valCard: { background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', textAlign: 'center' },
  valTier: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' },
  valAmt: { fontFamily: 'serif', fontSize: '28px', color: 'var(--espresso)', marginBottom: '4px' },
  valMethod: { fontSize: '12px', color: 'var(--text-muted)' },
  }
