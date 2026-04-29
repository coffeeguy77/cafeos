import{refreshXeroToken}from '../../../lib/xero'
import{supabase,supabaseAdmin}from '../../../lib/supabase'

async function getAccessToken(cafeId){
  const{data:ig}=await supabaseAdmin.from('integrations').select('*').eq('cafe_id',cafeId).eq('type','xero').single()
  if(!ig||ig.status!=='connected') throw new Error('Xero not connected')
  let accessToken=ig.access_token
  if(new Date(ig.token_expires_at)<=new Date(Date.now()+60000)){
    const r=await refreshXeroToken(ig.refresh_token)
    if(!r.access_token) throw new Error('Token refresh failed')
    accessToken=r.access_token
    await supabaseAdmin.from('integrations').update({access_token:accessToken,refresh_token:r.refresh_token,token_expires_at:new Date(Date.now()+r.expires_in*1000).toISOString()}).eq('id',ig.id)
  }
  return{accessToken,tenantId:ig.metadata?.tenant_id}
}

export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','')
  if(!token) return res.status(401).json({error:'Not authenticated'})
  const{data:{user}}=await supabase.auth.getUser(token)
  if(!user) return res.status(401).json({error:'Invalid token'})
  const{cafeId,months='12'}=req.query
  const{data:cafe}=await supabaseAdmin.from('cafes').select('id').eq('id',cafeId).eq('owner_id',user.id).single()
  if(!cafe) return res.status(403).json({error:'Forbidden'})
  try{
    const{accessToken,tenantId}=await getAccessToken(cafeId)
    const headers={'Authorization':'Bearer '+accessToken,'xero-tenant-id':tenantId,'Accept':'application/json'}
    const to=new Date(),from=new Date()
    from.setMonth(from.getMonth()-parseInt(months))
    const xd=d=>'DateTime('+d.getFullYear()+','+(d.getMonth()+1)+','+d.getDate()+')'
    const byContact={}
    const add=(id,name,amt)=>{
      if(!name||!(amt>0)) return
      const key=id||name
      if(!byContact[key]) byContact[key]={contactId:id||null,name,total:0,count:0}
      byContact[key].total+=amt
      byContact[key].count++
    }

    // SOURCE 1: GET /Payments filtered to ACCPAY in code
    let page=1,hasMore=true,p1status='ok'
    while(hasMore){
      const where='Date>='+xd(from)+'&&Date<='+xd(to)+'&&Status=="AUTHORISED"'
      const r=await fetch('https://api.xero.com/api.xro/2.0/Payments?'+new URLSearchParams({where,page:String(page)}),{headers})
      if(!r.ok){p1status=r.status;break}
      const d=await r.json()
      const payments=d.Payments||[]
      for(const p of payments){
        if(!p.Invoice||p.Invoice.Type!=='ACCPAY') continue
        add(p.Invoice.Contact?.ContactID,p.Invoice.Contact?.Name,parseFloat(p.Amount||0))
      }
      hasMore=payments.length===100;page++;if(page>50)break
    }

    // SOURCE 2: GET /BankTransactions Type=SPEND
    page=1;hasMore=true;let p2status='ok'
    while(hasMore){
      const where='Type=="SPEND"&&Date>='+xd(from)+'&&Date<='+xd(to)
      const r=await fetch('https://api.xero.com/api.xro/2.0/BankTransactions?'+new URLSearchParams({where,page:String(page)}),{headers})
      if(!r.ok){p2status=r.status;break}
      const d=await r.json()
      const txns=d.BankTransactions||[]
      for(const tx of txns){
        if(tx.Type!=='SPEND'||tx.Status==='DELETED'||tx.Status==='VOIDED') continue
        add(tx.Contact?.ContactID,tx.Contact?.Name,parseFloat(tx.Total||0))
      }
      hasMore=txns.length===100;page++;if(page>50)break
    }

    const suppliers=Object.values(byContact)
      .map(s=>({...s,total:Math.round(s.total*100)/100}))
      .sort((a,b)=>b.total-a.total)

    const{data:mapRow}=await supabaseAdmin.from('xero_supplier_mappings').select('mapping').eq('cafe_id',cafeId).single()
    return res.status(200).json({suppliers,mapping:mapRow?.mapping||{},debug:{p1:p1status,p2:p2status,count:suppliers.length}})
  }catch(e){
    console.error('Suppliers error:',e.message)
    return res.status(500).json({error:e.message})
  }
}
