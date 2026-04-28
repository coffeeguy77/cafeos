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
  if(!res.ok) throw new Error('Failed to get connections: '+res.status)
  return res.json()
}


async function fetchPL(accessToken,tenantId,months){
  const to=new Date(),from=new Date()
  from.setMonth(from.getMonth()-months)
  const fmt=d=>d.toISOString().split('T')[0]
  const params=new URLSearchParams({fromDate:fmt(from),toDate:fmt(to),standardLayout:'true'})
  const res=await fetch('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?'+params,{headers:{Authorization:'Bearer '+accessToken,'xero-tenant-id':tenantId,Accept:'application/json'}})
