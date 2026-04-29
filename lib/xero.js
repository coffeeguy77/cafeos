const CLIENT_ID=process.env.XERO_CLIENT_ID
const CLIENT_SECRET=process.env.XERO_CLIENT_SECRET
const REDIRECT=process.env.NEXT_PUBLIC_APP_URL+'/api/xero/callback'
const SCOPES='openid profile email offline_access accounting.reports.profitandloss.read accounting.contacts accounting.transactions.read'




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
