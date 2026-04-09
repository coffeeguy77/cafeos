import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { calculateValuation } from '../lib/square'
import SparkBar from '../components/SparkBar'

const AUD = v => '$' + Math.round(v).toLocaleString('en-AU')
const PCT = v => v.toFixed(1) + '%'
const DEFAULT_SETTINGS = { cogsPercent: 35, opexPercent: 44, revenueMultiple: 0.5, ebitdaMultiple: 2.5, months: 12 }

export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [salesData, setSalesData] = useState(null)
  const [merchant, setMerchant] = useState(null)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [valuation, setValuation] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async (months) => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/square/sales?months=${months || settings.months}`)
      if (res.status === 401) { router.push('/'); return }
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSalesData(data.salesData)
      setMerchant(data.merchant)
    } catch (e) {
      setError('Could not load sales data. Please try reconnecting.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [settings.months, router])

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (salesData) setValuation(calculateValuation(salesData, settings)) }, [salesData, settings])

  function set(key, value) { setSettings(s => ({ ...s, [key]: value })) }

  async function disconnect() {
    await fetch('/api/square/auth', { method: 'DELETE' })
    router.push('/')
  }

  async function changeMonths(m) { set('months', m); await fetchData(m) }

  if (loading) return (
    <div style={styles.loadingPage}>
      <p style={{ color: '#6b4c2a', fontFamily: "'DM Serif Display', serif", fontSize: '18px' }}>Brewing your valuation…</p>
    </div>
  )

  if (error) return (
    <div style={styles.loadingPage}>
      <p style={{ color: '#c0392b' }}>{error}</p>
      <button style={styles.outlineBtn} onClick={() => router.push('/')}>Go back</button>
    </div>
  )

  const v = valuation
  return (
    <>
      <Head><title>{merchant?.business_name || 'My Café'} — Caféos</title></Head>
      <div style={styles.page}>
        <nav style={styles.nav}>
          <span style={styles.logo}>☕ Caféos</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={styles.merchantName}>{merchant?.business_name}</span>
            <button style={styles.disconnectBtn} onClick={disconnect}>Disconnect</button>
          </div>
        </nav>
        <main style={styles.main}>
          <div style={styles.pageHeader}>
            <div>
              <h1 style={styles.pageTitle}>Business Valuation</h1>
              <p style={styles.pageSubtitle}>Based on {salesData?.orderCount?.toLocaleString()} completed orders{refreshing && ' · Refreshing…'}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[3, 6, 12].map(m => (
                <button key={m} style={{ ...styles.periodBtn, ...(settings.months === m ? styles.periodBtnActive : {}) }} onClick={() => changeMonths(m)}>{m}m</button>
              ))}
            </div>
          </div>
          <div style={styles.valuationHero}>
            <div style={styles.valCard}>
              <p style={styles.valTier}>Conservative</p>
              <p style={styles.valAmount}>{v ? AUD(v.valByRevenue) : '—'}</p>
              <p style={styles.valMethod}>Revenue × {settings.revenueMultiple.toFixed(2)}x</p>
            </div>
            <div style={{ ...styles.valCard, ...styles.valCardMid }}>
              <p style={{ ...styles.valTier, color: '#c8874a' }}>Midpoint estimate</p>
              <p style={{ ...styles.valAmount, fontSize: '36px' }}>{v ? AUD(v.valMid) : '—'}</p>
              <p style={styles.valMethod}>Blended average</p>
            </div>
            <div style={styles.valCard}>
              <p style={styles.valTier}>Optimistic</p>
              <p style={styles.valAmount}>{v ? AUD(v.valByEbitda) : '—'}</p>
              <p style={styles.valMethod}>EBITDA × {settings.ebitdaMultiple.toFixed(2)}x</p>
            </div>
          </div>
          <div style={styles.grid}>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Square POS sales</h2>
              <div style={styles.metricRow}>
                <MetricItem label="Gross sales" value={salesData ? AUD(salesData.grossSales) : '—'} />
                <MetricItem label="Net sales" value={salesData ? AUD(salesData.netSales) : '—'} />
                <MetricItem label="Avg monthly" value={salesData ? AUD(salesData.avgMonthlySales) : '—'} />
                <MetricItem label="Annualised" value={salesData ? AUD(salesData.annualisedSales) : '—'} highlight />
              </div>
              {salesData?.monthlyData?.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <p style={styles.chartLabel}>Monthly sales trend</p>
                  <SparkBar data={salesData.monthlyData} />
                </div>
              )}
            </div>
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Profit & loss estimate</h2>
              <div style={styles.plRow}><span style={styles.plLabel}>Annual revenue</span><span style={styles.plValue}>{v ? AUD(v.revenue) : '—'}</span></div>
              <div style={styles.plRow}><span style={styles.plLabel}>Less COGS ({settings.cogsPercent}%)</span><span style={{ ...styles.plValue, color: '#c0392b' }}>{v ? '− ' + AUD(v.cogs) : '—'}</span></div>
              <div style={{ ...styles.plRow, borderTop: '1px solid rgba(26,10,0,0.08)', marginTop: '4px', paddingTop: '8px' }}><span style={{ ...styles.plLabel, fontWeight: 500 }}>Gross profit</span><span style={{ ...styles.plValue, fontWeight: 500 }}>{v ? AUD(v.grossProfit) : '—'}</span></div>
              <div style={styles.plRow}><span style={styles.plLabel}>Less operating expenses ({settings.opexPercent}%)</span><span style={{ ...styles.plValue, color: '#c0392b' }}>{v ? '− ' + AUD(v.opex) : '—'}</span></div>
              <div style={{ ...styles.plRow, borderTop: '1px solid rgba(26,10,0,0.08)', marginTop: '4px', paddingTop: '8px' }}><span style={{ ...styles.plLabel, fontWeight: 500 }}>EBITDA</span><span style={{ ...styles.plValue, fontWeight: 500, color: v && v.ebitda >= 0 ? '#4a6741' : '#c0392b' }}>{v ? AUD(v.ebitda) : '—'}</span></div>
              <div style={styles.plRow}><span style={styles.plLabel}>EBITDA margin</span><span style={styles.plValue}>{v ? PCT(v.ebitdaMargin) : '—'}</span></div>
            </div>
          </div>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Adjust assumptions</h2>
            <div style={styles.settingsGrid}>
              <SliderSetting label="COGS as % of revenue" hint="Food, coffee, packaging — industry avg 30–40%" min={10} max={70} step={1} value={settings.cogsPercent} display={settings.cogsPercent + '%'} onChange={v => set('cogsPercent', v)} />
              <SliderSetting label="Operating expenses as % of revenue" hint="Rent, wages, utilities — industry avg 40–50%" min={10} max={80} step={1} value={settings.opexPercent} display={settings.opexPercent + '%'} onChange={v => set('opexPercent', v)} />
              <SliderSetting label="Revenue multiple" hint="Cafés typically 0.3x–0.8x" min={0.1} max={2} step={0.05} value={settings.revenueMultiple} display={settings.revenueMultiple.toFixed(2) + 'x'} onChange={v => set('revenueMultiple', v)} />
              <SliderSetting label="EBITDA multiple" hint="Cafés typically 2x–4x" min={0.5} max={8} step={0.25} value={settings.ebitdaMultiple} display={settings.ebitdaMultiple.toFixed(2) + 'x'} onChange={v => set('ebitdaMultiple', v)} />
            </div>
          </div>
          <p style={styles.disclaimer}>This valuation is an estimate only. Always consult a qualified business broker or accountant before any transaction.</p>
        </main>
      </div>
    </>
  )
}

function MetricItem({ label, value, highlight }) {
  return (
    <div style={styles.metricItem}>
      <p style={styles.metricLabel}>{label}</p>
      <p style={{ ...styles.metricValue, color: highlight ? '#4a6741' : '#1a0a00' }}>{value}</p>
    </div>
  )
}

function SliderSetting({ label, hint, min, max, step, value, display, onChange }) {
  return (
    <div style={styles.settingItem}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={styles.settingLabel}>{label}</span>
        <span style={styles.settingValue}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <p style={styles.settingHint}>{hint}</p>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: '#faf7f2' },
  loadingPage: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#faf7f2' },
  nav: { padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(26,10,0,0.08)', background: 'rgba(250,247,242,0.9)', position: 'sticky', top: 0, zIndex: 10 },
  logo: { fontFamily: "'DM Serif Display', serif", fontSize: '18px', color: '#1a0a00' },
  merchantName: { fontSize: '14px', color: '#6b4c2a', fontWeight: 500 },
  disconnectBtn: { fontSize: '13px', color: '#a0826a', background: 'transparent', border: '1px solid rgba(26,10,0,0.15)', borderRadius: '20px', padding: '5px 14px', cursor: 'pointer' },
  outlineBtn: { fontSize: '14px', padding: '10px 24px', borderRadius: '8px', background: 'transparent', border: '1px solid rgba(26,10,0,0.2)', cursor: 'pointer', marginTop: '12px' },
  main: { maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 4rem' },
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '12px' },
  pageTitle: { fontFamily: "'DM Serif Display', serif", fontSize: '32px', color: '#1a0a00', marginBottom: '4px' },
  pageSubtitle: { fontSize: '14px', color: '#a0826a' },
  periodBtn: { fontSize: '13px', padding: '6px 16px', borderRadius: '20px', background: 'transparent', border: '1px solid rgba(26,10,0,0.15)', cursor: 'pointer', color: '#6b4c2a' },
  periodBtnActive: { background: '#1a0a00', color: '#e8c49a', border: '1px solid #1a0a00' },
  valuationHero: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '1.5rem' },
  valCard: { background: 'white', border: '1px solid rgba(26,10,0,0.08)', borderRadius: '16px', padding: '1.5rem', textAlign: 'center' },
  valCardMid: { border: '2px solid #c8874a', background: '#fffaf5' },
  valTier: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a0826a', marginBottom: '8px' },
  valAmount: { fontFamily: "'DM Serif Display', serif", fontSize: '28px', color: '#1a0a00', marginBottom: '4px' },
  valMethod: { fontSize: '12px', color: '#a0826a' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '16px' },
  card: { background: 'white', border: '1px solid rgba(26,10,0,0.08)', borderRadius: '16px', padding: '1.5rem', marginBottom: '16px' },
  cardTitle: { fontFamily: "'DM Serif Display', serif", fontSize: '18px', color: '#1a0a00', marginBottom: '1.25rem' },
  metricRow: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' },
  metricItem: { background: '#faf7f2', borderRadius: '10px', padding: '1rem' },
  metricLabel: { fontSize: '12px', color: '#a0826a', marginBottom: '4px' },
  metricValue: { fontSize: '20px', fontFamily: "'DM Serif Display', serif" },
  chartLabel: { fontSize: '12px', color: '#a0826a', marginBottom: '8px' },
  plRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(26,10,0,0.04)' },
  plLabel: { fontSize: '14px', color: '#6b4c2a' },
  plValue: { fontSize: '14px', color: '#1a0a00' },
  settingsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' },
  settingItem: {},
  settingLabel: { fontSize: '13px', color: '#6b4c2a', fontWeight: 500 },
  settingValue: { fontSize: '14px', color: '#1a0a00', fontWeight: 500, fontFamily: "'DM Serif Display', serif" },
  settingHint: { fontSize: '12px', color: '#a0826a', marginTop: '4px' },
  disclaimer: { fontSize: '12px', color: '#a0826a', lineHeight: 1.6, marginTop: '2rem', padding: '1rem', background: 'rgba(26,10,0,0.03)', borderRadius: '8px' },
              }
