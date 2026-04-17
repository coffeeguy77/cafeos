import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { calculateValuation } from '../../../lib/square'
import { calculateHealthScore, generateAlerts } from '../../../lib/health'

const TODAY = '2026-04-17'
const SUPA_KEY = 'sb-edoucarmulyjeqiydjxd-auth-token'
const DEF = { cogsPercent: 35, opexPercent: 44, revenueMultiple: 0.5, ebitdaMultiple: 2.5, months: 12 }
const fmt = v => '$' + Math.round(Math.abs(v || 0)).toLocaleString('en-AU')
const pct = v => (v || 0).toFixed(1) + '%'
const getToken = () => { try { return JSON.parse(localStorage.getItem(SUPA_KEY) || '{}').access_token || null } catch(e) { return null } }

function itemValue(item) {
  const mode = item.valuation_mode || 'depreciated'
  if (item.ownership === 'roastery' || item.ownership === 'leased') return 0
  if (mode === 'secondhand') return parseFloat(item.secondhand_value || 0)
  if (mode === 'replacement') {
    const cost = parseFloat(item.replacement_cost || 0)
    const cp = item.condition === 'excellent' ? 0.85 : item.condition === 'good' ? 0.65 : item.condition === 'fair' ? 0.40 : 0.20
    return cost * cp
  }
  if (mode === 'manual') return parseFloat(item.manual_value || 0)
  if (!item.purchase_price || !item.purchase_date) return 0
  const yrs = (new Date() - new Date(item.purchase_date)) / (365.25 * 24 * 3600 * 1000)
  return parseFloat(item.purchase_price) * Math.max(0, 1 - yrs / (item.depreciation_years || 5))
}

const VMODES = [
  { value: 'depreciated', label: 'Straight-line depreciation', hint: 'Calculated from purchase price over depreciation years' },
  { value: 'secondhand', label: 'Secondhand market value', hint: 'What you could sell it for today' },
  { value: 'replacement', label: 'Replacement cost x condition %', hint: 'New cost adjusted for current condition' },
  { value: 'manual', label: 'Manual value override', hint: 'Enter the exact current value directly' },
]
const OWN = [
  { value: 'cafe', label: 'Cafe owned', hint: 'Included in sale', color: 'var(--success)' },
  { value: 'roastery', label: 'Roastery owned', hint: 'Not included — stays with roaster', color: 'var(--warning)' },
  { value: 'leased', label: 'Leased / finance', hint: 'Not included — subject to lease', color: 'var(--text-muted)' },
]
const CATS = ['espresso_machine','grinder','brewer','refrigeration','kitchen','pos_hardware','furniture','fitout','vehicle','other']
const EF = { name:'', category:'espresso_machine', brand:'', purchase_date:'', purchase_price:'', condition:'good', depreciation_years:5, valuation_mode:'depreciated', secondhand_value:'', replacement_cost:'', manual_value:'', ownership:'cafe', notes:'' }

export default function CafeDashboard() {
  const router = useRouter()
  const { cafeId } = router.query
  const [cafe, setCafe] = useState(null)
  const [salesCache, setSalesCache] = useState({})
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

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('cafes').select('*, integrations(*)').eq('id', cafeId).eq('owner_id', user.id).single()
    if (!data) { router.push('/dashboard'); return }
    setCafe(data)
    const sq = data.integrations?.find(i => i.type === 'square')
    const connected = sq?.status === 'connected'
    setSquareConnected(connected)
    await Promise.all([loadEquipment(), loadAdjustments()])
    if (connected) await loadSales(12)
    setLoading(false)
  }

  async function loadSales(months) {
    const m = months || settings.months
    if (salesCache[m]) { setSalesData(salesCache[m]); return }
    setSyncing(true)
    const res = await fetch('/api/square/sales?cafeId=' + cafeId + '&months=' + m, { headers: { Authorization: 'Bearer ' + getToken() } })
    if (res.ok) { const d = await res.json(); setSalesCache(p => ({ ...p, [m]: d.salesData })); setSalesData(d.salesData) }
    setSyncing(false)
  }
  async function loadEquipment() { const res = await fetch('/api/cafes/' + cafeId + '/equipment', { headers: { Authorization: 'Bearer ' + getToken() } }); if (res.ok) { const d = await res.json(); setEquipment(d.equipment || []) } }
  async function loadAdjustments() { const res = await fetch('/api/cafes/' + cafeId + '/adjustments', { headers: { Authorization: 'Bearer ' + getToken() } }); if (res.ok) { const d = await res.json(); setAdjustments(d.adjustments || []) } }

  useEffect(() => {
    if (!salesData) return
    const revenue = salesData.annualisedSales
    const expenses = [{ normalised_type: 'cogs', amount: revenue * (settings.cogsPercent / 100), is_excluded: false },{ normalised_type: 'opex', amount: revenue * (settings.opexPercent / 100), is_excluded: false }]
    const val = calculateValuation(salesData, expenses, equipment, adjustments, settings)
    setValuation(val); setHealthScore(calculateHealthScore(salesData, val, [])); setAlerts(generateAlerts(salesData, val))
  }, [salesData, equipment, adjustments, settings])

  const setSetting = (k, v) => setSettings(s => ({ ...s, [k]: v }))
  async function changePeriod(m) { setSetting('months', m); if (salesCache[m]) { setSalesData(salesCache[m]); return }; await loadSales(m) }
  async function forceSync() { setSalesCache({}); setSalesData(null); await loadSales(settings.months) }
  async function connectSquare() { const r = await fetch('/api/square/auth?cafeId=' + cafeId); const { url } = await r.json(); window.location.href = url }
  const hColor = !healthScore ? '#999' : healthScore.total >= 70 ? 'var(--success)' : healthScore.total >= 40 ? 'var(--warning)' : 'var(--danger)'

  if (loading) return <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--milk)' }}><p style={{ fontFamily:'serif', fontSize:'18px', color:'var(--text-secondary)' }}>Brewing your data…</p></div>

  return (<>
    <Head><title>{cafe?.name} — Caféos</title></Head>
    <div style={{ minHeight:'100vh', background:'var(--milk)' }}>
      <nav style={s.nav}>
        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
          <Link href="/dashboard" style={{ color:'var(--text-muted)', fontSize:'14px', textDecoration:'none' }}>← All cafés</Link>
          <span style={s.logo}>☕ {cafe?.name}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          {healthScore && <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 14px', background:'white', borderRadius:'20px', border:'1px solid var(--border)' }}><span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Health</span><span style={{ fontSize:'14px', fontWeight:500, color:hColor }}>{healthScore.total}/100 {healthScore.grade}</span></div>}
          {squareConnected ? <button className="btn-secondary" style={{ fontSize:'13px', padding:'7px 14px' }} onClick={forceSync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ Sync'}</button> : <button className="btn-primary" style={{ fontSize:'13px' }} onClick={connectSquare}>Connect Square</button>}
        </div>
      </nav>
      <main style={{ maxWidth:'960px', margin:'0 auto', padding:'2rem 1.5rem 4rem' }}>
        {alerts.map((a,i) => <div key={i} style={{ display:'flex', gap:'12px', padding:'12px 16px', borderRadius:'10px', border:'1px solid', marginBottom:'8px', background:a.severity==='positive'?'var(--success-light)':a.severity==='critical'?'var(--danger-light)':'var(--warning-light)', borderColor:a.severity==='positive'?'var(--success)':a.severity==='critical'?'var(--danger)':'var(--warning)' }}><span>{a.severity==='positive'?'📈':a.severity==='critical'?'🚨':'⚠️'}</span><div><strong style={{ fontSize:'14px' }}>{a.title}</strong><p style={{ fontSize:'13px', color:'var(--text-secondary)', marginTop:'2px' }}>{a.message}</p></div></div>)}
        <div style={{ display:'flex', gap:'4px', marginBottom:'1.5rem', background:'white', borderRadius:'12px', padding:'4px', border:'1px solid var(--border)' }}>
          {['overview','equipment','adjustments','integrations'].map(t => <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'8px', borderRadius:'8px', border:'none', fontSize:'14px', cursor:'pointer', background:tab===t?'var(--espresso)':'transparent', color:tab===t?'var(--crema-light)':'var(--text-secondary)', fontWeight:tab===t?500:400 }}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
        </div>
        {tab==='overview' && !squareConnected && <div style={{ textAlign:'center', padding:'4rem 2rem', background:'white', borderRadius:'20px', border:'1px solid var(--border)' }}><div style={{ fontSize:'48px', marginBottom:'1rem' }}>🔗</div><h2 style={{ marginBottom:'8px' }}>Connect your Square POS</h2><p style={{ color:'var(--text-secondary)', marginBottom:'1.5rem' }}>Pull real sales data and generate an accurate valuation.</p><button className="btn-primary" onClick={connectSquare}>Connect with Square</button></div>}
        {tab==='overview' && squareConnected && <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
            <p style={{ fontSize:'14px', color:'var(--text-muted)' }}>{syncing?'Syncing…':salesData?(salesData.orderCount||0).toLocaleString()+' completed orders':'Click ↻ Sync to load data'}</p>
            <div style={{ display:'flex', gap:'6px' }}>{[3,6,12].map(m => <button key={m} onClick={() => changePeriod(m)} disabled={syncing} style={{ fontSize:'13px', padding:'5px 14px', borderRadius:'20px', cursor:'pointer', background:settings.months===m?'var(--espresso)':'transparent', border:'1px solid '+(settings.months===m?'var(--espresso)':'var(--border-strong)'), color:settings.months===m?'var(--crema-light)':'var(--text-secondary)' }}>{m}m</button>)}</div>
          </div>
          {!salesData && !syncing && <div style={{ textAlign:'center', padding:'3rem', background:'white', borderRadius:'16px', border:'1px solid var(--border)', marginBottom:'1.5rem' }}><p style={{ color:'var(--text-muted)' }}>No data yet. Click ↻ Sync to load your Square data.</p></div>}
          {valuation && salesData && <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'1.5rem' }}>
              <div style={s.valCard}><p style={s.valTier}>Conservative</p><p style={s.valAmt}>{fmt(valuation.valByRevenue)}</p><p style={s.valMethod}>Revenue x {settings.revenueMultiple.toFixed(2)}</p></div>
              <div style={{ ...s.valCard, border:'2px solid var(--crema)', background:'#fffaf5' }}><p style={{ ...s.valTier, color:'var(--crema)' }}>Midpoint estimate</p><p style={{ ...s.valAmt, fontSize:'36px' }}>{fmt(valuation.valMid)}</p><p style={s.valMethod}>Blended average</p></div>
              <div style={s.valCard}><p style={s.valTier}>With assets</p><p style={s.valAmt}>{fmt(valuation.valByAsset)}</p><p style={s.valMethod}>EBITDA + equipment</p></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px', marginBottom:'1.5rem' }}>
              {[['Gross sales',fmt(salesData.grossSales)],['Net sales',fmt(salesData.netSales)],['Avg monthly',fmt(salesData.avgMonthlySales)],['Annualised',fmt(salesData.annualisedSales)]].map(item => <div key={item[0]} style={{ background:'white', border:'1px solid var(--border)', borderRadius:'12px', padding:'1rem' }}><p style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'4px' }}>{item[0]}</p><p style={{ fontSize:'20px', fontFamily:'serif', color:'var(--espresso)' }}>{item[1]}</p></div>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
              <div style={s.card}>
                <h3 style={s.cardTitle}>Profit and loss</h3>
                {[['Annual revenue',fmt(valuation.revenue),false,false],['Less COGS ('+settings.cogsPercent+'%)','− '+fmt(valuation.cogs),true,false],['Gross profit',fmt(valuation.grossProfit)+' ('+pct(valuation.grossMargin)+')',false,true],['Less operating ('+settings.opexPercent+'%)','− '+fmt(valuation.totalExpenses-valuation.cogs),true,false],['EBITDA',fmt(valuation.ebitda)+' ('+pct(valuation.ebitdaMargin)+')',false,true],['Owner add-backs','+ '+fmt(valuation.addBacks),false,false],['Adjusted EBITDA',fmt(valuation.adjustedEbitda),false,true]].map((row,i) => <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontWeight:row[3]?500:400 }}><span style={{ fontSize:'14px', color:'var(--text-secondary)' }}>{row[0]}</span><span style={{ fontSize:'14px', color:row[2]?'var(--danger)':'inherit' }}>{row[1]}</span></div>)}
                {valuation.equipmentValue>0 && <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontWeight:500 }}><span style={{ fontSize:'14px', color:'var(--text-secondary)' }}>Equipment (cafe owned)</span><span style={{ fontSize:'14px', color:'var(--sage)' }}>+ {fmt(valuation.equipmentValue)}</span></div>}
              </div>
              {healthScore && <div style={s.card}>
                <h3 style={s.cardTitle}>Business health</h3>
                <div style={{ textAlign:'center', padding:'1rem 0 1.5rem' }}>
                  <div style={{ fontSize:'56px', fontFamily:'serif', color:hColor, lineHeight:1 }}>{healthScore.total}</div>
                  <div style={{ fontSize:'13px', color:'var(--text-muted)', marginTop:'4px' }}>out of 100</div>
                  <div style={{ display:'inline-block', marginTop:'8px', padding:'4px 16px', borderRadius:'20px', background:hColor+'20', color:hColor, fontWeight:500, fontSize:'14px' }}>{healthScore.label}</div>
                </div>
                {healthScore.breakdown?.map((item,i) => { const bc=item.score/item.max>=0.7?'var(--success)':item.score/item.max>=0.4?'var(--warning)':'var(--danger)'; return <div key={i} style={{ marginBottom:'10px' }}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}><span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>{item.label}</span><span style={{ fontSize:'13px', fontWeight:500 }}>{item.score}/{item.max}</span></div><div style={{ height:'4px', background:'var(--crema-pale)', borderRadius:'2px' }}><div style={{ height:'100%', width:(item.score/item.max*100)+'%', background:bc, borderRadius:'2px' }} /></div></div> })}
              </div>}
            </div>
            <div style={s.card}>
              <h3 style={s.cardTitle}>Adjust assumptions <span style={{ fontSize:'12px', fontWeight:400, color:'var(--text-muted)' }}>— updates instantly</span></h3>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'1.5rem' }}>
                {[['COGS %','Food, coffee, packaging (avg 30-40%)',10,70,1,settings.cogsPercent,settings.cogsPercent+'%','cogsPercent'],['Operating %','Rent, wages, utilities (avg 40-50%)',10,80,1,settings.opexPercent,settings.opexPercent+'%','opexPercent'],['Revenue multiple','Cafes typically 0.3x-0.8x',0.1,2,0.05,settings.revenueMultiple,settings.revenueMultiple.toFixed(2)+'x','revenueMultiple'],['EBITDA multiple','Cafes typically 2x-4x',0.5,8,0.25,settings.ebitdaMultiple,settings.ebitdaMultiple.toFixed(2)+'x','ebitdaMultiple']].map(row => <div key={row[7]}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}><span style={{ fontSize:'13px', fontWeight:500, color:'var(--text-secondary)' }}>{row[0]}</span><span style={{ fontSize:'14px', fontWeight:500, fontFamily:'serif' }}>{row[6]}</span></div><input type="range" min={row[2]} max={row[3]} step={row[4]} value={row[5]} onChange={e => setSetting(row[7],parseFloat(e.target.value))} style={{ width:'100%' }} /><p style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'4px' }}>{row[1]}</p></div>)}
              </div>
            </div>
          </>}
        </>}
        {tab==='equipment' && <EquipmentTab cafeId={cafeId} equipment={equipment} onRefresh={loadEquipment} />}
        {tab==='adjustments' && <AdjustmentsTab cafeId={cafeId} adjustments={adjustments} onRefresh={loadAdjustments} />}
        {tab==='integrations' && <div>
          <h2 style={{ fontSize:'22px', marginBottom:'1.5rem' }}>Integrations</h2>
          {[{id:'square',name:'Square',desc:'POS sales, orders, locations',icon:'■',available:true,connected:squareConnected},{id:'xero',name:'Xero',desc:'Accounting, expenses, invoices',icon:'✕',available:false},{id:'quickbooks',name:'QuickBooks',desc:'Accounting and expenses',icon:'◆',available:false},{id:'lightspeed',name:'Lightspeed',desc:'POS sales and inventory',icon:'⚡',available:false}].map(int => <div key={int.id} style={{ background:'white', border:'1px solid '+(int.connected?'var(--success)':'var(--border)'), borderRadius:'14px', padding:'1.25rem', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}><div style={{ display:'flex', alignItems:'center', gap:'14px' }}><div style={{ width:'44px', height:'44px', borderRadius:'10px', background:'var(--crema-pale)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'20px' }}>{int.icon}</div><div><div style={{ display:'flex', alignItems:'center', gap:'8px' }}><strong style={{ fontSize:'15px' }}>{int.name}</strong>{int.connected&&<span className="badge badge-success">Connected</span>}{!int.available&&!int.connected&&<span className="badge badge-neutral">Coming soon</span>}</div><p style={{ fontSize:'13px', color:'var(--text-muted)', marginTop:'2px' }}>{int.desc}</p></div></div>{int.available&&!int.connected&&<button className="btn-primary" style={{ fontSize:'13px', padding:'8px 18px' }} onClick={connectSquare}>Connect</button>}{int.connected&&<span style={{ fontSize:'13px', color:'var(--success)' }}>✓ Active</span>}</div>)}
        </div>}
      </main>
    </div>
  </>)
}

function ItemForm({ initial, onSave, onCancel, onDelete, saving, err, isEdit }) {
  const [form, setForm] = useState(initial || EF)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const mode = form.valuation_mode || 'depreciated'
  const ownership = form.ownership || 'cafe'
  const depYrs = form.depreciation_years || 5
  const depCalc = (form.purchase_price && form.purchase_date) ? Math.round(parseFloat(form.purchase_price) * Math.max(0, 1 - (new Date()-new Date(form.purchase_date))/(365.25*24*3600*1000)/depYrs)) : null
  const condPct = form.condition === 'excellent' ? 85 : form.condition === 'good' ? 65 : form.condition === 'fair' ? 40 : 20
  const replCalc = form.replacement_cost ? Math.round(parseFloat(form.replacement_cost) * condPct / 100) : null

  return (
    <div style={{ background:'white', border:'2px solid var(--crema)', borderRadius:'16px', padding:'1.5rem', marginBottom:'1rem' }}>
      <h3 style={{ fontSize:'17px', marginBottom:'1.25rem' }}>{isEdit ? 'Edit equipment' : 'Add equipment'}</h3>
      {err && <div style={{ background:'var(--danger-light)', color:'var(--danger)', padding:'8px 12px', borderRadius:'8px', marginBottom:'12px', fontSize:'14px' }}>{err}</div>}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
        <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Item name *</label><input value={form.name} onChange={e => set('name',e.target.value)} placeholder="Anfim SP2 Grinder" required /></div>
        <div className="form-group"><label className="form-label">Category</label><select value={form.category} onChange={e => set('category',e.target.value)}>{CATS.map(c => <option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Brand</label><input value={form.brand||''} onChange={e => set('brand',e.target.value)} placeholder="Anfim" /></div>
        <div className="form-group"><label className="form-label">Condition</label><select value={form.condition} onChange={e => set('condition',e.target.value)}>{['excellent','good','fair','poor'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Purchase date (past only)</label><input type="date" max="2026-04-17" value={form.purchase_date||''} onChange={e => set('purchase_date',e.target.value)} /></div>
        <div className="form-group"><label className="form-label">Purchase price (AUD)</label><input type="number" min="0" value={form.purchase_price||''} onChange={e => set('purchase_price',e.target.value)} placeholder="3800" /></div>
        <div className="form-group"><label className="form-label">Depreciation (years)</label><select value={form.depreciation_years||5} onChange={e => set('depreciation_years',parseInt(e.target.value))}>{[3,5,7,10,15,20].map(y => <option key={y} value={y}>{y} years</option>)}</select></div>
      </div>
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'16px', marginBottom:'16px' }}>
        <p style={{ fontSize:'13px', fontWeight:600, color:'var(--text-secondary)', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.05em' }}>Ownership</p>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {OWN.map(o => <button key={o.value} type="button" onClick={() => set('ownership',o.value)} style={{ padding:'8px 14px', borderRadius:'20px', border:'1px solid '+(ownership===o.value?o.color:'var(--border)'), background:ownership===o.value?o.color+'18':'white', color:ownership===o.value?o.color:'var(--text-secondary)', fontSize:'13px', cursor:'pointer', fontWeight:ownership===o.value?600:400 }}>{o.label}</button>)}
        </div>
        {ownership !== 'cafe' && <p style={{ fontSize:'12px', color:'var(--warning)', marginTop:'8px' }}>⚠️ {OWN.find(o => o.value===ownership)?.hint} — excluded from sale value.</p>}
      </div>
      <div style={{ borderTop:'1px solid var(--border)', paddingTop:'16px', marginBottom:'16px' }}>
        <p style={{ fontSize:'13px', fontWeight:600, color:'var(--text-secondary)', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.05em' }}>Valuation method</p>
        <div style={{ display:'grid', gap:'8px' }}>
          {VMODES.map(vm => (
            <label key={vm.value} style={{ display:'flex', alignItems:'flex-start', gap:'12px', padding:'12px', borderRadius:'10px', border:'1px solid '+(mode===vm.value?'var(--crema)':'var(--border)'), background:mode===vm.value?'#fffaf5':'white', cursor:'pointer' }}>
              <input type="radio" name="vm" value={vm.value} checked={mode===vm.value} onChange={() => set('valuation_mode',vm.value)} style={{ marginTop:'3px', accentColor:'var(--crema)' }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'14px', fontWeight:500 }}>{vm.label}</div>
                <div style={{ fontSize:'12px', color:'var(--text-muted)', marginTop:'2px' }}>{vm.hint}</div>
                {mode===vm.value && vm.value==='depreciated' && depCalc !== null && <div style={{ fontSize:'13px', color:'var(--sage)', marginTop:'6px', fontWeight:500 }}>Calculated: ${depCalc.toLocaleString('en-AU')} AUD</div>}
                {mode===vm.value && vm.value==='secondhand' && <div style={{ marginTop:'8px' }}><input type="number" min="0" value={form.secondhand_value||''} onChange={e => set('secondhand_value',e.target.value)} placeholder="e.g. 1800 — what you could sell it for today" style={{ fontSize:'13px', padding:'6px 10px', borderRadius:'8px', border:'1px solid var(--border)', width:'100%' }} /></div>}
                {mode===vm.value && vm.value==='replacement' && <div style={{ marginTop:'8px', display:'flex', gap:'10px', alignItems:'center' }}><input type="number" min="0" value={form.replacement_cost||''} onChange={e => set('replacement_cost',e.target.value)} placeholder="New replacement cost today" style={{ flex:1, fontSize:'13px', padding:'6px 10px', borderRadius:'8px', border:'1px solid var(--border)' }} />{replCalc !== null && form.replacement_cost && <span style={{ fontSize:'13px', color:'var(--sage)', fontWeight:500, whiteSpace:'nowrap' }}>x {condPct}% = ${replCalc.toLocaleString('en-AU')}</span>}</div>}
                {mode===vm.value && vm.value==='manual' && <div style={{ marginTop:'8px' }}><input type="number" min="0" value={form.manual_value||''} onChange={e => set('manual_value',e.target.value)} placeholder="Exact current value" style={{ fontSize:'13px', padding:'6px 10px', borderRadius:'8px', border:'1px solid var(--border)', width:'100%' }} /></div>}
              </div>
            </label>
          ))}
        </div>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><input value={form.notes||''} onChange={e => set('notes',e.target.value)} placeholder="e.g. Roastery-owned, stays with supply agreement" /></div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'14px' }}>
        <div style={{ display:'flex', gap:'10px' }}>
          <button className="btn-primary" type="button" disabled={saving||!form.name} onClick={() => onSave(form)}>{saving?'Saving…':'Save item'}</button>
          <button className="btn-secondary" type="button" onClick={onCancel}>Cancel</button>
        </div>
        {isEdit && onDelete && <button type="button" onClick={onDelete} style={{ background:'none', border:'1px solid var(--danger)', color:'var(--danger)', borderRadius:'8px', padding:'7px 14px', fontSize:'13px', cursor:'pointer' }}>Delete item</button>}
      </div>
    </div>
  )
}

function EquipmentTab({ cafeId, equipment, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const cafeOwned = equipment.filter(i => i.ownership !== 'roastery' && i.ownership !== 'leased')
  const notOwned = equipment.filter(i => i.ownership === 'roastery' || i.ownership === 'leased')
  const totalVal = cafeOwned.reduce((s,i) => s + itemValue(i), 0)

  async function saveNew(form) {
    setSaving(true); setErr('')
    const res = await fetch('/api/cafes/'+cafeId+'/equipment', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+getToken() }, body:JSON.stringify(form) })
    const d = await res.json()
    if (!res.ok) { setErr(d.error||'Save failed'); setSaving(false); return }
    await onRefresh(); setShowAdd(false); setSaving(false)
  }
  async function saveEdit(form) {
    setSaving(true); setErr('')
    const res = await fetch('/api/cafes/'+cafeId+'/equipment', { method:'PATCH', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+getToken() }, body:JSON.stringify(form) })
    const d = await res.json()
    if (!res.ok) { setErr(d.error||'Save failed'); setSaving(false); return }
    await onRefresh(); setEditId(null); setSaving(false)
  }
  async function duplicate(item) {
    const { id, created_at, updated_at, ...rest } = item
    const res = await fetch('/api/cafes/'+cafeId+'/equipment', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+getToken() }, body:JSON.stringify({ ...rest, name: rest.name+' (copy)' }) })
    if (res.ok) await onRefresh()
  }
  async function del(id) {
    await fetch('/api/cafes/'+cafeId+'/equipment', { method:'DELETE', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+getToken() }, body:JSON.stringify({ id }) })
    setEditId(null); await onRefresh()
  }

  const ownerBadge = item => {
    if (item.ownership === 'roastery') return <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', background:'#fff3cd', color:'#856404', fontWeight:500 }}>Roastery</span>
    if (item.ownership === 'leased') return <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', background:'var(--crema-pale)', color:'var(--text-muted)', fontWeight:500 }}>Leased</span>
    return null
  }
  const modeBadge = item => {
    const labels = { depreciated:'Dep.', secondhand:'Secondhand', replacement:'Replacement', manual:'Manual' }
    return <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'20px', background:'var(--crema-pale)', color:'var(--text-muted)' }}>{labels[item.valuation_mode||'depreciated']}</span>
  }

  const ItemRow = ({ item }) => (
    editId === item.id
      ? <ItemForm initial={item} onSave={saveEdit} onCancel={() => { setEditId(null); setErr('') }} onDelete={() => del(item.id)} saving={saving} err={err} isEdit={true} />
      : <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:'12px', padding:'1rem 1.25rem', display:'flex', justifyContent:'space-between', alignItems:'center', opacity:item.ownership==='roastery'||item.ownership==='leased'?0.75:1 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px', flexWrap:'wrap' }}>
              <strong style={{ fontSize:'15px' }}>{item.name}</strong>
              {item.brand && <span style={{ fontSize:'13px', color:'var(--text-muted)' }}>{item.brand}</span>}
              <span className="badge badge-neutral">{(item.category||'').replace(/_/g,' ')}</span>
              {ownerBadge(item)}
              {modeBadge(item)}
            </div>
            <div style={{ fontSize:'13px', color:'var(--text-muted)' }}>
              {item.purchase_price && '$'+parseFloat(item.purchase_price).toLocaleString('en-AU')+' new'}
              {item.purchase_date && ' · '+new Date(item.purchase_date).getFullYear()}
              {item.notes && ' · '+item.notes.substring(0,55)+(item.notes.length>55?'…':'')}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginLeft:'12px' }}>
            {item.ownership==='roastery'||item.ownership==='leased'
              ? <div style={{ fontSize:'13px', color:'var(--text-muted)', fontStyle:'italic', paddingRight:'4px' }}>not included</div>
              : <div style={{ textAlign:'right', marginRight:'4px' }}><div style={{ fontSize:'16px', fontWeight:500, fontFamily:'serif' }}>{'$'+Math.round(itemValue(item)).toLocaleString('en-AU')}</div><div style={{ fontSize:'11px', color:'var(--text-muted)' }}>sale value</div></div>
            }
            <button title="Duplicate" onClick={() => duplicate(item)} style={{ background:'none', border:'1px solid var(--border)', borderRadius:'8px', padding:'5px 9px', cursor:'pointer', fontSize:'14px', color:'var(--text-muted)', lineHeight:1 }} title="Duplicate">⧉</button>
            <button title="Edit" onClick={() => { setEditId(item.id); setShowAdd(false); setErr('') }} style={{ background:'none', border:'1px solid var(--border)', borderRadius:'8px', padding:'5px 9px', cursor:'pointer', fontSize:'14px', color:'var(--text-secondary)', lineHeight:1 }}>✎</button>
          </div>
        </div>
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
        <div>
          <h2 style={{ fontSize:'22px', marginBottom:'4px' }}>Equipment ledger</h2>
          <p style={{ color:'var(--text-secondary)', fontSize:'14px' }}>
            Sale value: <strong style={{ color:'var(--sage)' }}>{'$'+Math.round(totalVal).toLocaleString('en-AU')}</strong>
            {notOwned.length > 0 && <span style={{ color:'var(--text-muted)', fontWeight:400 }}> · {notOwned.length} item{notOwned.length>1?'s':''} excluded (not cafe-owned)</span>}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setShowAdd(true); setEditId(null); setErr('') }}>+ Add item</button>
      </div>
      {showAdd && <ItemForm initial={null} onSave={saveNew} onCancel={() => { setShowAdd(false); setErr('') }} saving={saving} err={err} isEdit={false} />}
      {equipment.length === 0 && !showAdd && <div style={{ textAlign:'center', padding:'3rem', background:'white', borderRadius:'16px', border:'1px solid var(--border)' }}><div style={{ fontSize:'40px', marginBottom:'12px' }}>🔧</div><p style={{ color:'var(--text-secondary)' }}>No equipment added yet.</p></div>}
      {equipment.length > 0 && <div style={{ display:'grid', gap:'8px' }}>{equipment.map(item => <ItemRow key={item.id} item={item} />)}</div>}
    </div>
  )
}

function AdjustmentsTab({ cafeId, adjustments, onRefresh }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ type:'add_back', label:'', description:'', annual_amount:'' })
  const [saving, setSaving] = useState(false)
  const addBacks = adjustments.filter(a => a.type==='add_back').reduce((s,a) => s+Number(a.annual_amount), 0)
  const removes = adjustments.filter(a => a.type==='remove').reduce((s,a) => s+Number(a.annual_amount), 0)

  async function save(e) {
    e.preventDefault(); setSaving(true)
    await fetch('/api/cafes/'+cafeId+'/adjustments', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+getToken() }, body:JSON.stringify(form) })
    await onRefresh(); setShowForm(false); setSaving(false)
    setForm({ type:'add_back', label:'', description:'', annual_amount:'' })
  }
  async function del(id) {
    await fetch('/api/cafes/'+cafeId+'/adjustments', { method:'DELETE', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+getToken() }, body:JSON.stringify({ id }) })
    onRefresh()
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem' }}>
        <div><h2 style={{ fontSize:'22px', marginBottom:'4px' }}>Owner adjustments</h2><p style={{ color:'var(--text-secondary)', fontSize:'14px' }}>Normalise EBITDA for true earnings</p></div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>+ Add adjustment</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'1.5rem' }}>
        <div style={{ background:'var(--success-light)', borderRadius:'12px', padding:'1rem 1.25rem' }}><p style={{ fontSize:'12px', color:'var(--success)', fontWeight:500, marginBottom:'4px' }}>TOTAL ADD-BACKS</p><p style={{ fontSize:'22px', fontFamily:'serif', color:'var(--success)' }}>+{'$'+Math.round(addBacks).toLocaleString('en-AU')}</p></div>
        <div style={{ background:'var(--danger-light)', borderRadius:'12px', padding:'1rem 1.25rem' }}><p style={{ fontSize:'12px', color:'var(--danger)', fontWeight:500, marginBottom:'4px' }}>TOTAL REMOVALS</p><p style={{ fontSize:'22px', fontFamily:'serif', color:'var(--danger)' }}>−{'$'+Math.round(removes).toLocaleString('en-AU')}</p></div>
      </div>
      {showForm && <div style={{ background:'white', border:'2px solid var(--crema)', borderRadius:'16px', padding:'1.5rem', marginBottom:'1.5rem' }}>
        <form onSubmit={save}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <div className="form-group"><label className="form-label">Type</label><select value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))}><option value="add_back">Add-back (increases EBITDA)</option><option value="remove">Remove (decreases EBITDA)</option></select></div>
            <div className="form-group"><label className="form-label">Label *</label><input value={form.label} onChange={e => setForm(f=>({...f,label:e.target.value}))} placeholder="Owner salary" required /></div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Description</label><input value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Personal car lease in expenses" /></div>
            <div className="form-group"><label className="form-label">Annual amount (AUD) *</label><input type="number" min="0" value={form.annual_amount} onChange={e => setForm(f=>({...f,annual_amount:e.target.value}))} placeholder="24000" required /></div>
          </div>
          <div style={{ display:'flex', gap:'10px', marginTop:'8px' }}>
            <button className="btn-primary" type="submit" disabled={saving}>{saving?'Saving…':'Add adjustment'}</button>
            <button className="btn-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      </div>}
      {adjustments.length===0 ? <div style={{ textAlign:'center', padding:'3rem', background:'white', borderRadius:'16px', border:'1px solid var(--border)' }}><div style={{ fontSize:'40px', marginBottom:'12px' }}>💼</div><p style={{ color:'var(--text-secondary)' }}>No adjustments yet.</p></div>
        : <div style={{ display:'grid', gap:'10px' }}>{adjustments.map(adj => <div key={adj.id} style={{ background:'white', border:'1px solid var(--border)', borderRadius:'12px', padding:'1rem 1.25rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}><div><div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'4px' }}><strong style={{ fontSize:'15px' }}>{adj.label}</strong><span className={'badge '+(adj.type==='add_back'?'badge-success':'badge-danger')}>{adj.type==='add_back'?'Add-back':'Remove'}</span></div>{adj.description&&<p style={{ fontSize:'13px', color:'var(--text-muted)' }}>{adj.description}</p>}</div><div style={{ display:'flex', alignItems:'center', gap:'16px' }}><span style={{ fontSize:'16px', fontWeight:500, fontFamily:'serif', color:adj.type==='add_back'?'var(--success)':'var(--danger)' }}>{adj.type==='add_back'?'+':'−'}{'$'+Math.round(Number(adj.annual_amount)).toLocaleString('en-AU')}/yr</span><button onClick={() => del(adj.id)} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'18px' }}>✕</button></div></div>)}</div>}
    </div>
  )
}

const s = {
  nav:{ padding:'1rem 1.5rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--border)', background:'rgba(250,247,242,0.95)', backdropFilter:'blur(8px)', position:'sticky', top:0, zIndex:10 },
  logo:{ fontFamily:'serif', fontSize:'18px', color:'var(--espresso)' },
  card:{ background:'white', border:'1px solid var(--border)', borderRadius:'16px', padding:'1.5rem' },
  cardTitle:{ fontSize:'16px', marginBottom:'1rem' },
  valCard:{ background:'white', border:'1px solid var(--border)', borderRadius:'16px', padding:'1.5rem', textAlign:'center' },
  valTier:{ fontSize:'11px', textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', marginBottom:'8px' },
  valAmt:{ fontFamily:'serif', fontSize:'28px', color:'var(--espresso)', marginBottom:'4px' },
  valMethod:{ fontSize:'12px', color:'var(--text-muted)' },
}
