import Head from 'next/head'
import Link from 'next/link'

export default function Home() {
  return (
    <>
      <Head>
        <title>Caféos — The operating system for café profitability</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={s.page}>
        <nav style={s.nav}>
          <span style={s.logo}>☕ Caféos</span>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link href="/login"><button className="btn-secondary" style={{ padding: '8px 20px', fontSize: '14px' }}>Sign in</button></Link>
            <Link href="/signup"><button className="btn-primary" style={{ padding: '8px 20px', fontSize: '14px' }}>Get started free</button></Link>
          </div>
        </nav>
        <main style={s.main}>
          <div style={s.hero}>
            <div style={s.badge}>The operating system for café profitability</div>
            <h1 style={s.title}>Know what your<br /><em>café is worth</em></h1>
            <p style={s.subtitle}>Connect your Square POS and accounting software. Get real-time valuations, business health scores, and profitability insights.</p>
            <Link href="/signup"><button className="btn-primary" style={{ fontSize: '16px', padding: '14px 36px' }}>Start free — no credit card needed →</button></Link>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '12px' }}>Free plan includes 1 café + Square integration</p>
          </div>
          <div style={s.features}>
            {[
              { icon: '📊', title: 'Real-time valuation', desc: 'Revenue multiple, EBITDA multiple, and asset-based valuations updated live from your actual sales data.' },
              { icon: '🏥', title: 'Business health score', desc: 'Know instantly how your café is performing — revenue trends, margin analysis, and smart alerts.' },
              { icon: '🔧', title: 'Equipment ledger', desc: 'Track espresso machines, grinders, fitout and furniture with automatic depreciation calculations.' },
              { icon: '💼', title: 'Owner adjustments', desc: 'Add back owner salary and personal expenses to calculate true Adjusted EBITDA for accurate valuations.' },
              { icon: '📍', title: 'Multi-location', desc: 'One Square account, multiple locations? Pick exactly which location feeds each café valuation.' },
              { icon: '🔗', title: 'More integrations soon', desc: 'Xero, QuickBooks, Lightspeed, Kounta and Tyro integrations coming — all your data in one place.' },
            ].map(f => (
              <div key={f.title} style={s.featureCard}>
                <span style={{ fontSize: '28px', display: 'block', marginBottom: '12px' }}>{f.icon}</span>
                <h3 style={{ fontSize: '17px', marginBottom: '8px' }}>{f.title}</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <h2 style={{ fontSize: '32px', marginBottom: '8px' }}>Simple pricing</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem' }}>One café or twenty — scale as you grow</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {[
                { name: 'Free', price: '$0', cafes: '1 café', features: ['Square POS', 'Basic valuation', 'Equipment ledger'], highlight: false },
                { name: 'Starter', price: '$49/mo', cafes: 'Up to 3 cafés', features: ['Health score & alerts', 'Owner adjustments', 'Multi-location'], highlight: true },
                { name: 'Pro', price: '$99/mo', cafes: 'Up to 10 cafés', features: ['Xero & QuickBooks', 'Expense classification', 'External revenue'], highlight: false },
                { name: 'Elite', price: '$149/mo', cafes: 'Unlimited cafés', features: ['Forecasting', 'Priority support', 'API access'], highlight: false },
              ].map(plan => (
                <div key={plan.name} style={{ background: 'white', border: plan.highlight ? '2px solid var(--crema)' : '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', textAlign: 'left' }}>
                  <h3 style={{ fontSize: '18px', marginBottom: '4px' }}>{plan.name}</h3>
                  <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: '24px', marginBottom: '4px' }}>{plan.price}</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '1rem' }}>{plan.cafes}</p>
                  <ul style={{ listStyle: 'none', marginBottom: '1.5rem' }}>
                    {plan.features.map(f => <li key={f} style={{ fontSize: '13px', color: 'var(--text-secondary)', padding: '3px 0', display: 'flex', gap: '6px' }}><span style={{ color: 'var(--success)' }}>✓</span>{f}</li>)}
                  </ul>
                  <Link href="/signup"><button className={plan.highlight ? 'btn-primary' : 'btn-secondary'} style={{ width: '100%' }}>Get started</button></Link>
                </div>
              ))}
            </div>
          </div>
        </main>
        <footer style={{ textAlign: 'center', padding: '2rem', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '13px' }}>
          © 2026 Caféos · Built for café operators, by café operators
        </footer>
      </div>
    </>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'var(--milk)' },
  nav: { padding: '1.25rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'rgba(250,247,242,0.95)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10 },
  logo: { fontFamily: "'DM Serif Display', serif", fontSize: '20px', color: 'var(--espresso)' },
  main: { maxWidth: '1000px', margin: '0 auto', padding: '4rem 2rem' },
  hero: { textAlign: 'center', marginBottom: '5rem' },
  badge: { display: 'inline-block', fontSize: '12px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--espresso)', color: 'var(--crema-light)', padding: '5px 16px', borderRadius: '20px', marginBottom: '1.5rem' },
  title: { fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(44px, 7vw, 72px)', color: 'var(--espresso)', lineHeight: 1.1, marginBottom: '1.25rem' },
  subtitle: { fontSize: '18px', color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 2rem', lineHeight: 1.7 },
  features: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '5rem' },
  featureCard: { background: 'white', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem' },
                  }
