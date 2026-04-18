import{getXeroAuthUrl}from '../../../lib/xero'
import{supabase}from '../../../lib/supabase'

export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','')
  if(!token) return res.status(401).json({error:'Not authenticated'})
  const{data:{user}}=await supabase.auth.getUser(token)
  if(!user) return res.status(401).json({error:'Invalid token'})
  const{cafeId}=req.query
  if(!cafeId) return res.status(400).json({error:'cafeId required'})
  const url=getXeroAuthUrl(cafeId)
  return res.status(200).json({url})
}
