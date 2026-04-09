import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

export default function Home() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (router.query.error) {
      const msgs = {
        oauth_denied: 'Connection was cancelled. Please try again.',
        token_failed: 'Could not connect to Square. Check your API credentials.',
        server_error: 'An unexpected error occurred. Please try again.',
      }
      setError(msgs[router.query.error] || 'Something went wrong.')
    }
  }, [router.query])

  async function connectSquare() {
    setLoading(true)
    const res = await fetch('/api/square/auth')
    const { url } = await res.json()
    window.location.href = url
  }

  return (
    <>
      <Head>
        <title>Caféos — Real-time business valuation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={styles.page}>
        <nav style={styles.nav}>
          <span style={styles.logo}>☕ Caféos</span>
        </nav>
        <main style={styles.main}>
          <div style={styles.hero}>
            <div style={styles.badge}>Powered by Square POS</div>
            <h1 style={styles.title}>Know what your<br /><em>café is worth</em></h1>
            <p style={styles.subtitle}>Connect your Square account and get an instant, data-driven business valuation based on your real sales — updated live.</p>
            {error && <div style={styles.errorBox}>{error}</div>}
            <button style={{ ...styles.connectBtn, opacity: loading ? 0.7 : 1 }} onClick={connectSquare} disabled={loading}>
              {loading ? 'Connecting...' : 'Connect with Square'}
              {!loading && <span style={styles.arrow}>→</span>}
            </button>
            <p style={styles.privacy}>Caféos only reads your sales data. We never store your Square credentials.</p>
          </div>
          <div style={styles.features}>
            {[
              { icon: '📊', title: 'Real-time data', desc: 'Pulls directly from your Square POS — gross sales, net sales, monthly trends.' },
              { icon: '💰', title: 'Dual valuation', desc: 'Revenue multiple and EBITDA multiple methods, blended into a realistic range.' },
              { icon: '📈', title: 'Monthly trends', desc: 'See how your sales have grown month-by-month over the past 12 months.' },
              { icon: '🔒', title: 'Secure & private', desc: 'OAuth connection, no data stored on our servers. Disconnect anytime.' },
            ].map(f => (
              <div key={f.title} style={styles.featureCard}>
                <span style={styles.featureIcon}>{f.icon}</span>
                <h3 style={styles.featureTitle}>{f.title}</h3>
                <p style={styles.featureDesc}>{f.desc}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </>
  )
}

const styles = {
  page: { minHeight: '100vh', background: 'linear-gradient(160deg, #faf7f2 0%, #f0e6d3 100%)', position: 'relative' },
  nav: { padding: '1.5rem 2rem', display: 'flex', alignItems: 'center' },
  logo: { fontFamily: "'DM Serif Display', serif", fontSize: '20px', color: '#1a0a00' },
  main: { maxWidth: '860px', margin: '0 auto', padding: '3rem 2rem 4rem' },
  hero: { textAlign: 'center', marginBottom: '4rem' },
  badge: { display: 'inline-block', fontSize: '12px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', background: '#2d1500', color: '#e8c49a', padding: '5px 14px', borderRadius: '20px', marginBottom: '1.5rem' },
  title: { fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(40px, 7vw, 72px)', color: '#1a0a00', lineHeight: 1.1, marginBottom: '1.25rem' },
  subtitle: { fontSize: '18px', color: '#6b4c2a', maxWidth: '520px', margin: '0 auto 2rem', lineHeight: 1.7 },
  errorBox: { background: '#fde8e6', color: '#c0392b', padding: '12px 20px', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '14px' },
  connectBtn: { display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#1a0a00', color: '#e8c49a', fontFamily: "'DM Sans', sans-serif", fontSize: '16px', fontWeight: 500, padding: '14px 32px', borderRadius: '50px', cursor: 'pointer', border: 'none', marginBottom: '1rem' },
  arrow: { fontSize: '18px' },
  privacy: { fontSize: '13px', color: '#a0826a' },
  features: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' },
  featureCard: { background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(26,10,0,0.08)', borderRadius: '16px', padding: '1.5rem', textAlign: 'left' },
  featureIcon: { fontSize: '24px', display: 'block', marginBottom: '12px' },
  featureTitle: { fontFamily: "'DM Serif Display', serif", fontSize: '17px', color: '#1a0a00', marginBottom: '8px' },
  featureDesc: { fontSize: '14px', color: '#6b4c2a', lineHeight: 1.6 },
                }
