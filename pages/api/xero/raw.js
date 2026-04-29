import{refreshXeroToken,getRawProfitAndLoss}from '../../../lib/xero'
import{supabase,supabaseAdmin}from '../../../lib/supabase'

export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','')
  if(!token) return res.status(401).json({error:'Not authenticated'})
  const{data:{user}}=await supabase.auth.getUser(token)
  if(!user) return res.status(401).json({error:'Invalid token'})
  const{cafeId,months='12'}=req.query
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})
  try{
    const{data:ig}=await supabaseAdmin.from('integrations').select('*').eq('cafe_id',cafeId).eq('type','xero').single()
    if(!ig||ig.status!=='connected') return res.status(400).json({error:'Xero not connected'})
    let accessToken=ig.access_token
    if(new Date(ig.token_expires_at)<=new Date(Date.now()+60000)){
      const r=await refreshXeroToken(ig.refresh_token)
      if(r.access_token){
        accessToken=r.access_token
        await supabaseAdmin.from('integrations').update({access_token:accessToken,refresh_token:r.refresh_token,token_expires_at:new Date(Date.now()+r.expires_in*1000).toISOString()}).eq('id',ig.id)
      }
    }
    const tenantId=ig.metadata?.tenant_id
    const data=await getRawProfitAndLoss(accessToken,tenantId,parseInt(months))
    const report=data.Reports?.[0]
    if(!report) return res.status(200).json({raw:{sections:[]},mapping:null})

    // Parse into sections with rows — this is what XeroMappingTab expects
    const numVal=cells=>{const v=cells?.[cells.length-1]?.Value;return v?parseFloat(v.replace(/[^0-9.-]/g,'')||0):0}
    const sections=[]
    for(const sec of report.Rows||[]){
      if(sec.RowType!=='Section') continue
      const rows=[]
      for(const row of sec.Rows||[]){
        if(row.RowType!=='Row') continue
        const name=row.Cells?.[0]?.Value||''
        const amount=numVal(row.Cells)
        if(!name||name==='Total') continue
        rows.push({name,amount})
      }
      if(rows.length>0) sections.push({title:sec.Title||'Untitled',rows})
    }

    const{data:mapRow}=await supabaseAdmin.from('xero_mappings').select('mapping').eq('cafe_id',cafeId).single()
    return res.status(200).json({raw:{sections},mapping:mapRow?.mapping||null})
  }catch(e){
    console.error('Raw error:',e.message)
    return res.status(500).json({error:e.message})
  }
}
