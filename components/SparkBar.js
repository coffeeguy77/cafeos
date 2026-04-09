export default function SparkBar({ data }) {
  if (!data || data.length === 0) return null
  const max = Math.max(...data.map(d => d.sales), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px' }}>
      {data.map((d, i) => {
        const height = Math.max((d.sales / max) * 100, 4)
        const label = d.month.substring(5)
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const mLabel = months[parseInt(label, 10) - 1] || label
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div
              title={`${mLabel}: $${d.sales.toLocaleString()}`}
              style={{
                width: '100%', height: `${height}%`,
                background: i === data.length - 1 ? '#c8874a' : '#e8c49a',
                borderRadius: '3px 3px 0 0',
                minHeight: '3px',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}
