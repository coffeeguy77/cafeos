const CLIENT_ID=process.env.XERO_CLIENT_ID
const CLIENT_SECRET=process.env.XERO_CLIENT_SECRET
const REDIRECT=process.env.NEXT_PUBLIC_APP_URL+'/api/xero/callback'
const SCOPES='openid profile email accounting.reports.read accounting.settings.read offline_access'

export function getXeroAuthUrl(cafeId){
  const p=new URLSearchParams({response_type:'code',client_id:CLIENT_ID,redirect_uri:REDIRECT,scope:SCOPES,state:cafeId})
  return 'https://login.xero.com/identity/connect/authorize?'+p.toString()
}

export async function exchangeCode(code){
  const creds=Buffer.from(CLIENT_ID+':'+CLIENT_SECRET).toString('base64')
  const res=await fetch('https://identity.xero.com/connect/token',{method:'POST',headers:{Authorization:'Basic '+creds,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:REDIRECT})})
  if(!res.ok){const e=await res.text();throw new Error('Token exchange failed: '+e)}
  return res.json()
}

export async function refreshXeroToken(refreshToken){
  const creds=Buffer.from(CLIENT_ID+':'+CLIENT_SECRET).toString('base64')
  const res=await fetch('https://identity.xero.com/connect/token',{method:'POST',headers:{Authorization:'Basic '+creds,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})})
  if(!res.ok){const e=await res.text();throw new Error('Token refresh failed: '+e)}
  return res.json()
}

export async function getXeroConnections(accessToken){
  const res=await fetch('https://api.xero.com/connections',{headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'}})
  if(!res.ok) throw new Error('Failed to get connections')
  return res.json()
}

export async function getXeroProfitAndLoss(accessToken,tenantId,months){
  const to=new Date(),from=new Date()
  from.setMonth(from.getMonth()-months)
  const fmt=d=>d.toISOString().split('T')[0]
  const params=new URLSearchParams({fromDate:fmt(from),toDate:fmt(to),standardLayout:'true'})
  const res=await fetch('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?'+params,{headers:{Authorization:'Bearer '+accessToken,'xero-tenant-id':tenantId,Accept:'application/json'}})
  if(!res.ok) throw new Error('P&L fetch failed: '+res.status)
  const data=await res.json()
  return parsePL(data,months)
}

function parsePL(data,months){
  const report=data.Reports?.[0]
  if(!report) return null
  const out={revenue:0,cogs:0,expenses:{},totalExpenses:0,months}
  const val=cells=>{const v=cells?.[cells.length-1]?.Value;return v?Math.abs(parseFloat(v.replace(/[^0-9.-]/g,''))||0):0}
  for(const sec of report.Rows||[]){
    if(sec.RowType!=='Section') continue
    const t=(sec.Title||'').toLowerCase()
    for(const row of sec.Rows||[]){
      if(row.RowType!=='Row') continue
      const name=row.Cells?.[0]?.Value||''
      const v=val(row.Cells)
      if(t.includes('revenue')||t.includes('income')||t.includes('trading')) out.revenue+=v
      else if(t.includes('cost')||t.includes('cogs')||t.includes('direct')) out.cogs+=v
      else if(t.includes('expense')||t.includes('overhead')||t.includes('operating')){out.expenses[name]=v;out.totalExpenses+=v}
    }
  }
  out.grossProfit=out.revenue-out.cogs
  out.ebitda=out.grossProfit-out.totalExpenses
  out.grossMarginPct=out.revenue>0?(out.grossProfit/out.revenue)*100:0
  out.cogsPct=out.revenue>0?(out.cogs/out.revenue)*100:0
  out.expensePct=out.revenue>0?(out.totalExpenses/out.revenue)*100:0
  out.annualisedRevenue=(out.revenue/months)*12
  out.avgMonthlyRevenue=out.revenue/months
  return out
}
