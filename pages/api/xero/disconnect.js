import{supabase,supabaseAdmin}from '../../../lib/supabase'

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).end()
  const token=req.headers.authorization?.replace('Bearer ','')
  const{data:{user}}=await supabase.auth.getUser(token)
  if(!user) return res.status(401).json({error:'Not authenticated'})
  const{cafeId}=req.body
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})
  await supabaseAdmin.from('integrations').delete().eq('cafe_id',cafeId).eq('type','xero')
  return res.status(200).json({ok:true})
}
