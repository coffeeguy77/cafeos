import{supabase,supabaseAdmin}from '../../../lib/supabase'

export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','')
  if(!token) return res.status(401).json({error:'Not authenticated'})
  const{data:{user}}=await supabase.auth.getUser(token)
  if(!user) return res.status(401).json({error:'Invalid token'})
  const{cafeId}=req.query
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})

  if(req.method==='GET'){
    const{data,error}=await supabaseAdmin.from('xero_wage_mappings').select('mapping').eq('cafe_id',cafeId).single()
    if(error&&error.code!=='PGRST116') return res.status(500).json({error:error.message})
    return res.status(200).json({mapping:data?.mapping||{}})
  }

  if(req.method==='POST'){
    const{mapping}=req.body
    if(!mapping) return res.status(400).json({error:'mapping required'})
    const{error}=await supabaseAdmin.from('xero_wage_mappings').upsert({cafe_id:cafeId,mapping,updated_at:new Date().toISOString()},{onConflict:'cafe_id'})
    if(error) return res.status(500).json({error:error.message})
    return res.status(200).json({ok:true})
  }

  return res.status(405).end()
}
