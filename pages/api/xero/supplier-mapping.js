import{supabase,supabaseAdmin}from '../../../lib/supabase'

export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','')
  if(!token) return res.status(401).json({error:'Not authenticated'})
  const{data:{user}}=await supabase.auth.getUser(token)
  if(!user) return res.status(401).json({error:'Invalid token'})
  const{cafeId}=req.method==='GET'?req.query:req.body
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})
  if(req.method==='GET'){
    const{data}=await supabaseAdmin.from('xero_supplier_mappings').select('mapping').eq('cafe_id',cafeId).single()
    return res.status(200).json({mapping:data?.mapping||{}})
  }
  if(req.method==='POST'){
    const{mapping}=req.body
    await supabaseAdmin.from('xero_supplier_mappings').upsert({cafe_id:cafeId,mapping,updated_at:new Date().toISOString()},{onConflict:'cafe_id'})
    return res.status(200).json({ok:true})
  }
  return res.status(405).end()
}
