const CLIENT_ID=process.env.XERO_CLIENT_ID
const CLIENT_SECRET=process.env.XERO_CLIENT_SECRET
const REDIRECT=process.env.NEXT_PUBLIC_APP_URL+'/api/xero/callback'
const SCOPES='openid profile email offline_access accounting.reports.read accounting.contacts.read accounting.invoices.read'

export function getXeroAuthUrl(cafeId){
  const p=new URLSearchParams({response_type:'code',client_id:CLIENT_ID,redirect_uri:REDIRECT,scope:SCOPES,state:cafeId})
  return 'https://login.xero.com/identity/connect/authorize?'+p.toString()
}

export async function exchangeCode(code){
  const creds=Buffer.from(CLIENT_ID+':'+CLIENT_SECRET).toString('base64')
  const res=await fetch('https://identity.xero.com/connect/token',{method:'POST',headers:{Authorization:'Basic '+creds,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:REDIRECT})})
  return res.json()
}

export async function refreshXeroToken(refreshToken){
  const creds=Buffer.from(CLIENT_ID+':'+CLIENT_SECRET).toString('base64')
  const res=await fetch('https://identity.xero.com/connect/token',{method:'POST',headers:{Authorization:'Basic '+creds,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})})
  return res.json()
}

export async function getTenants(accessToken){
  const res=await fetch('https://api.xero.com/connections',{headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'}})
  return res.json()
}

export async function getRawProfitAndLoss(accessToken,tenantId,months){
  const to=new Date(),from=new Date()
  from.setMonth(from.getMonth()-months)
  const fmt=d=>d.toISOString().split('T')[0]
  const params=new URLSearchParams({fromDate:fmt(from),toDate:fmt(to),standardLayout:'true'})
  const res=await fetch('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?'+params,{headers:{Authorization:'Bearer '+accessToken,'xero-tenant-id':tenantId,Accept:'application/json'}})
  if(!res.ok) throw new Error('Xero P&L error: '+res.status)
  return res.json()
}

export async function getXeroProfitAndLoss(accessToken,tenantId,months,mapping){
  const data=await getRawProfitAndLoss(accessToken,tenantId,months)
  const report=data.Reports?.[0]
  if(!report) return null
  const numVal=cells=>{const v=cells?.[cells.length-1]?.Value;return v?parseFloat(v.replace(/[^0-9.-]/g,'')||0):0}
  let revenue=0,cogs=0,totalExpenses=0
  const sections=[]
  for(const sec of report.Rows||[]){
    if(sec.RowType!=='Section') continue
    const title=(sec.Title||'').toLowerCase()
    const rows=[]
    for(const row of sec.Rows||[]){
      if(row.RowType!=='Row') continue
      const name=row.Cells?.[0]?.Value||''
      const amount=numVal(row.Cells)
      if(!name||name==='Total') continue
      const included=!mapping||Object.keys(mapping).length===0||mapping[name]===true
      if(included){
        if(title.includes('revenue')||title.includes('income')||title.includes('trading')) revenue+=amount
        else if(title.includes('cost')||title.includes('cogs')||title.includes('direct')) cogs+=amount
        else totalExpenses+=amount
      }
      rows.push({name,amount})
    }
    sections.push({title:sec.Title||'',rows})
  }
  return{revenue,cogs,totalExpenses,months,sections}
}
