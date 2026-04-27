import{supabase,supabaseAdmin}from '../../../../lib/supabase'

const ALLOWED=['name','category','brand','purchase_date','purchase_price','condition','depreciation_years','valuation_mode','secondhand_value','replacement_cost','manual_value','ownership','notes','suspended']

export default async function handler(req,res){
  const{cafeId}=req.query
  const token=req.headers.authorization?.replace('Bearer ','')
  const{data:{user}}=token?await supabase.auth.getUser(token):await supabase.auth.getUser()
  if(!user) return res.status(401).json({error:'Not authenticated'})
  // Use admin to bypass RLS for ownership check
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})

  if(req.method==='GET'){
    const{data,error}=await supabaseAdmin.from('equipment').select('*').eq('cafe_id',cafeId).order('name')
    if(error) return res.status(500).json({error:error.message})
    return res.status(200).json({equipment:data||[]})
  }

  if(req.method==='POST'){
    const body=req.body
    // Bulk import — body is array
    if(Array.isArray(body)){
      const rows=body.map(item=>{
        const r={cafe_id:cafeId}
        ALLOWED.forEach(k=>{if(item[k]!==undefined&&item[k]!=='')r[k]=item[k]})
        // Type coerce numerics
        if(r.purchase_price) r.purchase_price=parseFloat(r.purchase_price)||null
        if(r.depreciation_years) r.depreciation_years=parseInt(r.depreciation_years)||5
        if(r.secondhand_value) r.secondhand_value=parseFloat(r.secondhand_value)||null
        if(r.replacement_cost) r.replacement_cost=parseFloat(r.replacement_cost)||null
        if(r.manual_value) r.manual_value=parseFloat(r.manual_value)||null
        return r
      })
      const{data,error}=await supabaseAdmin.from('equipment').insert(rows).select()
      if(error) return res.status(500).json({error:error.message})
      return res.status(201).json({equipment:data,count:data.length})
    }
    // Single insert
    const row={cafe_id:cafeId}
    ALLOWED.forEach(k=>{if(body[k]!==undefined)row[k]=body[k]})
    const{data,error}=await supabaseAdmin.from('equipment').insert(row).select().single()
    if(error) return res.status(500).json({error:error.message})
    return res.status(201).json({equipment:data})
  }

  if(req.method==='PATCH'){
    const{id,...updates}=req.body
    const row={}
    ALLOWED.forEach(k=>{if(updates[k]!==undefined)row[k]=updates[k]})
    const{data,error}=await supabaseAdmin.from('equipment').update(row).eq('id',id).eq('cafe_id',cafeId).select().single()
    if(error) return res.status(500).json({error:error.message})
    return res.status(200).json({equipment:data})
  }

  if(req.method==='DELETE'){
    const{id}=req.body
    const{error}=await supabaseAdmin.from('equipment').delete().eq('id',id).eq('cafe_id',cafeId)
    if(error) return res.status(500).json({error:error.message})
    return res.status(200).json({ok:true})
  }

  return res.status(405).end()
}
