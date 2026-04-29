import{refreshXeroToken}from '../../../lib/xero'
import{supabase,supabaseAdmin}from '../../../lib/supabase'

async function getAccessToken(cafeId){
  const{data:ig}=await supabaseAdmin.from('integrations').select('*').eq('cafe_id',cafeId).eq('type','xero').single()
  if(!ig||ig.status!=='connected') throw new Error('Xero not connected')
  let accessToken=ig.access_token
  if(new Date(ig.token_expires_at)<=new Date(Date.now()+60000)){
    const r=await refreshXeroToken(ig.refresh_token)
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

    const to=new Date()
    const from=new Date()
    from.setMonth(from.getMonth()-parseInt(months))

    // Xero DateTime filter format: DateTime(yyyy,mm,dd)
    const xeroDate=d=>'DateTime('+d.getFullYear()+','+(d.getMonth()+1)+','+d.getDate()+')'
    const fromXero=xeroDate(from)
    const toXero=xeroDate(to)
    const fromStr=from.toISOString().split('T')[0]
    const toStr=to.toISOString().split('T')[0]

    const spendByContact={}

    // ── SOURCE 1: Payments against ACCPAY invoices (supplier bill payments) ──
    // This is the canonical way to get "what did we actually pay suppliers"
    let page=1,hasMore=true
    while(hasMore){
      const where='Date>='+'DateTime('+from.getFullYear()+','+(from.getMonth()+1)+','+from.getDate()+')'
        +'&&Date<='+'DateTime('+to.getFullYear()+','+(to.getMonth()+1)+','+to.getDate()+')'
        +'&&Status=="AUTHORISED"'
      const params=new URLSearchParams({where,page:String(page)})
      const r=await fetch('https://api.xero.com/api.xro/2.0/Payments?'+params,{headers})
      if(!r.ok){console.error('Payments error:',r.status,await r.text());break}
      const d=await r.json()
      const payments=d.Payments||[]
      for(const p of payments){
        // Only count payments against ACCPAY (supplier) invoices
        if(p.Invoice?.Type!=='ACCPAY') continue
        const name=p.Invoice?.Contact?.Name
        if(!name) continue
        const amt=parseFloat(p.Amount||0)
        if(amt>0) spendByContact[name]=(spendByContact[name]||0)+amt
      }
      hasMore=payments.length===100
      page++
      if(page>20) break
    }

    // ── SOURCE 2: Spend Money bank transactions ──
    // Catches direct supplier payments not raised as invoices
    page=1;hasMore=true
    while(hasMore){
      const where='Type=="SPEND"&&Status=="AUTHORISED"&&Date>='
        +'DateTime('+from.getFullYear()+','+(from.getMonth()+1)+','+from.getDate()+')'
        +'&&Date<='+'DateTime('+to.getFullYear()+','+(to.getMonth()+1)+','+to.getDate()+')'
      const params=new URLSearchParams({where,page:String(page)})
      const r=await fetch('https://api.xero.com/api.xro/2.0/BankTransactions?'+params,{headers})
      if(!r.ok){console.error('BankTx error:',r.status);break}
      const d=await r.json()
      const txns=d.BankTransactions||[]
      for(const tx of txns){
        if(tx.Type!=='SPEND') continue
        const name=tx.Contact?.Name
        if(!name) continue
        const amt=parseFloat(tx.Total||0)
        if(amt>0) spendByContact[name]=(spendByContact[name]||0)+amt
      }
      hasMore=txns.length===100
      page++
      if(page>20) break
    }

    // Build sorted list
    const suppliers=Object.entries(spendByContact)
      .map(([name,total])=>({name,total:Math.round(total*100)/100}))
      .filter(s=>s.total>0)
      .sort((a,b)=>b.total-a.total)

    const{data:mapRow}=await supabaseAdmin.from('xero_supplier_mappings').select('mapping').eq('cafe_id',cafeId).single()

    return res.status(200).json({suppliers,mapping:mapRow?.mapping||{}})
  }catch(e){
    console.error('Suppliers error:',e.message)
    return res.status(500).json({error:e.message})
  }
}
