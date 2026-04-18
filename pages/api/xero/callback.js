import{exchangeCode,getXeroConnections}from '../../../lib/xero'
import{supabaseAdmin}from '../../../lib/supabase'

export default async function handler(req,res){
  const{code,state:cafeId,error}=req.query
  if(error) return res.redirect('/dashboard/'+cafeId+'?xero_error='+encodeURIComponent(error))
  if(!code||!cafeId) return res.status(400).json({error:'Missing code or state'})
  try{
    const tokens=await exchangeCode(code)
    const connections=await getXeroConnections(tokens.access_token)
    const tenant=connections[0]
    if(!tenant) return res.redirect('/dashboard/'+cafeId+'?xero_error=no_org')
    const expiresAt=new Date(Date.now()+(tokens.expires_in||1800)*1000).toISOString()
    const{error:dbErr}=await supabaseAdmin.from('integrations').upsert({
      cafe_id:cafeId,
      type:'xero',
      status:'connected',
      access_token:tokens.access_token,
      refresh_token:tokens.refresh_token,
      token_expires_at:expiresAt,
      metadata:{tenant_id:tenant.tenantId,tenant_name:tenant.tenantName,tenant_type:tenant.tenantType}
    },{onConflict:'cafe_id,type'})
    if(dbErr){
      console.error('Xero DB error:',JSON.stringify(dbErr))
      return res.redirect('/dashboard/'+cafeId+'?xero_error='+encodeURIComponent(dbErr.message))
    }
    return res.redirect('/dashboard/'+cafeId+'?xero_connected=1')
  }catch(e){
    console.error('Xero callback error:',e.message)
    return res.redirect('/dashboard/'+cafeId+'?xero_error='+encodeURIComponent(e.message))
  }
}
