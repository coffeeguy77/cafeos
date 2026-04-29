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
    const fromStr=from.toISOString().split('T')[0]
    const toStr=to.toISOString().split('T')[0]

    // Step 1: Get all contacts marked as IsSupplier=true
    // These are contacts Xero has identified as suppliers based on AP transactions
    const spendByContact={}
    let page=1,hasMore=true

    while(hasMore){
      const params=new URLSearchParams({
        where:'IsSupplier==true',
        page:String(page),
        includeArchived:'false'
      })
      const r=await fetch('https://api.xero.com/api.xro/2.0/Contacts?'+params,{headers})
      if(!r.ok){console.error('Contacts error:',r.status,await r.text());break}
      const d=await r.json()
      const contacts=d.Contacts||[]
      for(const c of contacts){
        if(!c.Name) continue
        // Use PurchasesDefaultAccountCode presence + Balances to confirm they're real suppliers
        const payable=c.Balances?.AccountsPayable?.Outstanding||0
        const paid=c.Balances?.AccountsPayable?.Overdue||0
        // Start with 0 - we'll add actual spend below
        spendByContact[c.Name]=0
      }
      hasMore=contacts.length===100
      page++
      if(page>20) break
    }

    // Step 2: Get actual spend amounts from SPEND bank transactions (Spend Money)
    page=1;hasMore=true
    while(hasMore){
      const params=new URLSearchParams({
        where:'Type=="SPEND"',
        fromDate:fromStr,
        toDate:toStr,
        page:String(page)
      })
      const r=await fetch('https://api.xero.com/api.xro/2.0/BankTransactions?'+params,{headers})
      if(!r.ok){console.error('BankTx error:',r.status);break}
      const d=await r.json()
      const txns=d.BankTransactions||[]
      for(const tx of txns){
        if(tx.Type!=='SPEND') continue
        const name=tx.Contact?.Name
        if(!name) continue
        const amt=parseFloat(tx.Total||tx.SubTotal||0)
        if(amt>0){
          // Add to spend - include ALL contacts with spend, not just IsSupplier ones
          spendByContact[name]=(spendByContact[name]||0)+amt
        }
      }
      hasMore=txns.length===100
      page++
      if(page>20) break
    }

    // Step 3: Get ACCPAY bill amounts too (purchase invoices)
    page=1;hasMore=true
    while(hasMore){
      const params=new URLSearchParams({
        where:'Type=="ACCPAY"&&(Status=="AUTHORISED"||Status=="PAID")',
        DateFrom:fromStr,
        DateTo:toStr,
        page:String(page)
      })
      const r=await fetch('https://api.xero.com/api.xro/2.0/Invoices?'+params,{headers})
      if(!r.ok){break}
      const d=await r.json()
      const invoices=d.Invoices||[]
      for(const inv of invoices){
        if(inv.Type!=='ACCPAY') continue
        const name=inv.Contact?.Name
        if(!name) continue
        const amt=parseFloat(inv.SubTotal||0)
        if(amt>0) spendByContact[name]=(spendByContact[name]||0)+amt
      }
      hasMore=invoices.length===100
      page++
      if(page>20) break
    }

    // Build final list - only include contacts with actual spend > 0
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
