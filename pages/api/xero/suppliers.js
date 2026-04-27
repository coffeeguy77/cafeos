import{refreshXeroToken}from '../../../lib/xero'
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
      await supabaseAdmin.from('integrations').update({access_token:accessToken,refresh_token:r.refresh_token,token_expires_at:new Date(Date.now()+r.expires_in*1000).toISOString()}).eq('id',ig.id)
    }catch(e){return res.status(401).json({error:'Token expired'})}
  }
  try{
    const tenantId=ig.metadata?.tenant_id
    const headers={'Authorization':'Bearer '+accessToken,'xero-tenant-id':tenantId,'Accept':'application/json'}

    // Get all supplier contacts
    const contactsRes=await fetch('https://api.xero.com/api.xro/2.0/Contacts?where=IsSupplier%3D%3Dtrue&order=Name',{headers})
    if(!contactsRes.ok) throw new Error('Contacts fetch failed: '+contactsRes.status)
    const contactsData=await contactsRes.json()
    const contacts=contactsData.Contacts||[]

    // Get bills (AP invoices) for the period to calculate spend per supplier
    const toDate=new Date(),fromDate=new Date()
    fromDate.setMonth(fromDate.getMonth()-parseInt(months))
    const fmt=d=>d.toISOString().split('T')[0]
    const billsRes=await fetch(
      'https://api.xero.com/api.xro/2.0/Invoices?Type=ACCPAY&Status=AUTHORISED,PAID&DateFrom='+fmt(fromDate)+'&DateTo='+fmt(toDate)+'&order=Contact.Name',
      {headers}
    )
    if(!billsRes.ok) throw new Error('Bills fetch failed: '+billsRes.status)
    const billsData=await billsRes.json()

    // Aggregate spend by contact ID
    const spendByContact={}
    const billCountByContact={}
    for(const inv of billsData.Invoices||[]){
      const cid=inv.Contact?.ContactID
      if(!cid) continue
      spendByContact[cid]=(spendByContact[cid]||0)+parseFloat(inv.Total||0)
      billCountByContact[cid]=(billCountByContact[cid]||0)+1
    }

    // Build supplier list with spend — only show those with transactions
    const suppliers=contacts
      .map(c=>({
        id:c.ContactID,
        name:c.Name,
        email:c.EmailAddress||'',
        spend:Math.round((spendByContact[c.ContactID]||0)*100)/100,
        billCount:billCountByContact[c.ContactID]||0,
      }))
      .filter(s=>s.spend>0)  // Only show suppliers with actual spend
      .sort((a,b)=>b.spend-a.spend) // Highest spend first

    // Load saved supplier mapping
    const{data:mappingRow}=await supabaseAdmin.from('xero_mappings').select('mapping').eq('cafe_id',cafeId).single()
    const savedMapping=mappingRow?.mapping||{}

    return res.status(200).json({suppliers,months:parseInt(months),supplierMapping:savedMapping.suppliers||{}})
  }catch(e){
    console.error('Xero suppliers error:',e)
    return res.status(500).json({error:e.message})
  }
}
