import{supabase,supabaseAdmin}from '../../../../lib/supabase'

const ALLOWED=['name','category','brand','purchase_date','purchase_price','condition','depreciation_years','valuation_mode','secondhand_value','replacement_cost','manual_value','ownership','notes','suspended']

const VALID_CATS=['espresso_machine','grinder','brewer','refrigeration','kitchen','pos_hardware','furniture','fitout','vehicle','other']

const VALID_CONDITIONS=['excellent','good','fair','poor']
const VALID_OWNERSHIP=['cafe','roastery','leased']
const VALID_MODES=['depreciated','secondhand','replacement','manual']

function normaliseCategory(v){
  if(!v) return 'other'
  const s=v.toLowerCase().replace(/[^a-z0-9]/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'')
  if(VALID_CATS.includes(s)) return s
  // common mappings
  const map={
    'espresso':'espresso_machine','coffee_machine':'espresso_machine','machine':'espresso_machine',
    'grind':'grinder','coffee_grinder':'grinder','burr_grinder':'grinder',
    'brew':'brewer','filter':'brewer','batch_brew':'brewer','pour_over':'brewer',
    'fridge':'refrigeration','freezer':'refrigeration','cool':'refrigeration','cold':'refrigeration',
    'oven':'kitchen','food':'kitchen','blender':'kitchen','dishwasher':'kitchen','sink':'kitchen',
    'pos':'pos_hardware','terminal':'pos_hardware','register':'pos_hardware','ipad':'pos_hardware',
    'chair':'furniture','table':'furniture','bench':'furniture','counter':'furniture','stool':'furniture',
    'fit':'fitout','renovation':'fitout','construction':'fitout','signage':'fitout',
    'car':'vehicle','van':'vehicle','truck':'vehicle','bike':'vehicle','scooter':'vehicle',
  }
  for(const[k,cat]of Object.entries(map)){if(s.includes(k))return cat}
  return 'other'
}

export default async function handler(req,res){
  const{cafeId}=req.query
  const token=req.headers.authorization?.replace('Bearer ','')
  const{data:{user}}=token?await supabase.auth.getUser(token):await supabase.auth.getUser()
  if(!user) return res.status(401).json({error:'Not authenticated'})
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})

  if(req.method==='GET'){
    const{data,error}=await supabaseAdmin.from('equipment').select('*').eq('cafe_id',cafeId).order('name')
    if(error) return res.status(500).json({error:error.message})
    return res.status(200).json({equipment:data||[]})
  }

  if(req.method==='POST'){
    const body=req.body
    function coerce(item){
      const r={cafe_id:cafeId}
      ALLOWED.forEach(k=>{if(item[k]!==undefined&&item[k]!=='')r[k]=item[k]})
      // Normalise enums
      r.category=normaliseCategory(r.category)
      if(r.condition&&!VALID_CONDITIONS.includes(r.condition?.toLowerCase()))r.condition='good'
      else if(r.condition)r.condition=r.condition.toLowerCase()
      if(r.ownership&&!VALID_OWNERSHIP.includes(r.ownership?.toLowerCase()))r.ownership='cafe'
      else if(r.ownership)r.ownership=r.ownership.toLowerCase()
      if(r.valuation_mode&&!VALID_MODES.includes(r.valuation_mode?.toLowerCase()))r.valuation_mode='depreciated'
      else if(r.valuation_mode)r.valuation_mode=r.valuation_mode.toLowerCase()
      // Type coerce numerics
      if(r.purchase_price)r.purchase_price=parseFloat(String(r.purchase_price).replace(/[^0-9.]/g,''))||null
      if(r.depreciation_years)r.depreciation_years=parseInt(r.depreciation_years)||5
      if(r.secondhand_value)r.secondhand_value=parseFloat(String(r.secondhand_value).replace(/[^0-9.]/g,''))||null
      if(r.replacement_cost)r.replacement_cost=parseFloat(String(r.replacement_cost).replace(/[^0-9.]/g,''))||null
      if(r.manual_value)r.manual_value=parseFloat(String(r.manual_value).replace(/[^0-9.]/g,''))||null
      return r
    }
    if(Array.isArray(body)){
      const rows=body.map(coerce)
      const{data,error}=await supabaseAdmin.from('equipment').insert(rows).select()
      if(error) return res.status(500).json({error:error.message})
      return res.status(201).json({equipment:data,count:data.length})
    }
    const row=coerce(body)
    const{data,error}=await supabaseAdmin.from('equipment').insert(row).select().single()
    if(error) return res.status(500).json({error:error.message})
    return res.status(201).json({equipment:data})
  }

  if(req.method==='PATCH'){
    const{id,...updates}=req.body
    const row={}
    ALLOWED.forEach(k=>{if(updates[k]!==undefined)row[k]=updates[k]})
    if(row.category)row.category=normaliseCategory(row.category)
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
