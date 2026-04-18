import{refreshXeroToken,getXeroProfitAndLoss}from '../../../lib/xero'
import{supabase,supabaseAdmin}from '../../../lib/supabase'

export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','')
  if(!token) return res.status(401).json({error:'Not authenticated'})
  const{data:{user}}=await supabase.auth.getUser(token)
  if(!user) return res.status(401).json({error:'Invalid token'})
  const{cafeId,months='12'}=req.query
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})
  const{data:ig}=await supabaseAdmin.from('integrations').select('*').eq('cafe_id',cafeId).eq('type','xero').single()
  if(!ig||ig.status!=='connected') return res.status(404).json({error:'Xero not connected'})
  let accessToken=ig.access_token
  if(new Date(ig.token_expires_at)<=new Date(Date.now()+60000)){
    try{
      const r=await refreshXeroToken(ig.refresh_token)
      accessToken=r.access_token
      const exp=new Date(Date.now()+r.expires_in*1000).toISOString()
      await supabaseAdmin.from('integrations').update({access_token:accessToken,refresh_token:r.refresh_token,token_expires_at:exp}).eq('id',ig.id)
    }catch(e){
      await supabaseAdmin.from('integrations').update({status:'expired'}).eq('id',ig.id)
      return res.status(401).json({error:'Xero token expired — please reconnect'})
    }
  }
  try{
    const pl=await getXeroProfitAndLoss(accessToken,ig.metadata?.tenant_id,parseInt(months))
    return res.status(200).json({pl,tenantName:ig.metadata?.tenant_name})
  }catch(e){
    console.error('Xero P&L error:',e)
    return res.status(500).json({error:e.message})
  }
}
