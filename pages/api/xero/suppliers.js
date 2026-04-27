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

    // Fetch P&L — we have this scope
    const to=new Date(),from=new Date()
    from.setMonth(from.getMonth()-parseInt(months))
    const fmt=d=>d.toISOString().split('T')[0]
    const params=new URLSearchParams({fromDate:fmt(from),toDate:fmt(to),standardLayout:'true'})
    const plRes=await fetch('https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?'+params,{headers})

    let suppliers=[]

    if(plRes.ok){
      const plData=await plRes.json()
      const report=plData.Reports?.[0]
      if(report){
        const numVal=cells=>{const v=cells?.[cells.length-1]?.Value;return v?Math.abs(parseFloat(v.replace(/[^0-9.-]/g,''))||0):0}
        for(const sec of report.Rows||[]){
          if(sec.RowType!=='Section') continue
          const title=(sec.Title||'').toLowerCase()
          // Include ALL sections — COGS, expenses, revenue — let user decide
          for(const row of sec.Rows||[]){
            if(row.RowType!=='Row') continue
            const name=row.Cells?.[0]?.Value||''
            const amount=numVal(row.Cells)
            if(name&&name!=='Total'&&amount>0){
              suppliers.push({
                name,
                amount,
                section:sec.Title||'Other',
                isCogs:title.includes('cost')||title.includes('cogs')||title.includes('direct'),
                isExpense:title.includes('expense')||title.includes('overhead')||title.includes('operating'),
                isRevenue:title.includes('revenue')||title.includes('income')||title.includes('trading'),
              })
            }
          }
        }
      }
    }else{
      const errText=await plRes.text()
      console.error('P&L fetch failed:',plRes.status,errText)
    }

    // Sort: COGS first, then by amount desc
    suppliers.sort((a,b)=>{
      if(a.isCogs&&!b.isCogs) return -1
      if(!a.isCogs&&b.isCogs) return 1
      return b.amount-a.amount
    })

    // Load saved supplier mapping
    const{data:mapRow}=await supabaseAdmin.from('xero_supplier_mappings').select('mapping').eq('cafe_id',cafeId).single()

    return res.status(200).json({suppliers,mapping:mapRow?.mapping||{}})
  }catch(e){
    console.error('Suppliers error:',e.message)
    return res.status(500).json({error:e.message})
  }
}
