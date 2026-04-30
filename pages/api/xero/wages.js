import{refreshXeroToken}from '../../../lib/xero'
import{supabase,supabaseAdmin}from '../../../lib/supabase'


async function getAccessToken(cafeId){
  const{data:ig}=await supabaseAdmin.from('integrations').select('*').eq('cafe_id',cafeId).eq('type','xero').single()
  if(!ig||ig.status!=='connected') throw new Error('Xero not connected')
  let accessToken=ig.access_token
  if(new Date(ig.token_expires_at)<=new Date(Date.now()+60000)){
    const r=await refreshXeroToken(ig.refresh_token)
    if(!r.access_token) throw new Error('Token refresh failed')
    accessToken=r.access_token
    await supabaseAdmin.from('integrations').update({access_token:accessToken,refresh_token:r.refresh_token,token_expires_at:new Date(Date.now()+r.expires_in*1000).toISOString()}).eq('id',ig.id)
  }
  return{accessToken,tenantId:ig.metadata?.tenant_id}
}


export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','')
  if(!token) return res.status(401).json({error:'Not authenticated'})
  const{data:{user}}=await supabase.auth.getUser(token)
  if(!user) return res.status(401).json({error:'Invalid token'})
  const{cafeId,months='12'}=req.query
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})
  try{
    const{accessToken,tenantId}=await getAccessToken(cafeId)
    const headers={'Authorization':'Bearer '+accessToken,'xero-tenant-id':tenantId,'Accept':'application/json'}
    const to=new Date(),from=new Date()
    from.setMonth(from.getMonth()-parseInt(months))
    const xd=d=>'DateTime('+d.getFullYear()+','+(d.getMonth()+1)+','+d.getDate()+')'
    const byContact={}
    const add=(id,name,amt)=>{
      if(!name||!(amt>0)) return
      const key=id||name
      if(!byContact[key]) byContact[key]={contactId:id||null,name,total:0,count:0}
      byContact[key].total+=amt
// v2
