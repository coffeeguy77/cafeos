import{getSalesData}from '../../../lib/square'
import{supabase,supabaseAdmin}from '../../../lib/supabase'

function computeFromCache(rows,months){
  const cutoff=new Date();cutoff.setMonth(cutoff.getMonth()-months)
  const filtered=rows.filter(r=>new Date(r.order_date)>=cutoff)
  const grossSales=filtered.reduce((s,r)=>s+Number(r.gross_amount),0)
  const netSales=filtered.reduce((s,r)=>s+Number(r.net_amount),0)
  const orderCount=filtered.reduce((s,r)=>s+Number(r.order_count),0)
  const avgMonthlySales=netSales/months
  return{grossSales,netSales,orderCount,avgMonthlySales,annualisedSales:avgMonthlySales*12,months}
}

export default async function handler(req,res){
  const token=req.headers.authorization?.replace('Bearer ','')
  const{data:{user}}=token?await supabase.auth.getUser(token):await supabase.auth.getUser()
  if(!user) return res.status(401).json({error:'Not authenticated'})
  const{cafeId,months='12',forceSync}=req.query

  try{
    const{data:integration}=await supabaseAdmin
      .from('integrations').select('*,integration_locations(*)')
      .eq('cafe_id',cafeId).eq('type','square').single()
    if(!integration?.access_token) return res.status(404).json({error:'Square not connected'})

    const selectedLocations=integration.integration_locations?.filter(l=>l.is_selected)
    const locationIds=selectedLocations?.length>0
      ?selectedLocations.map(l=>l.external_id)
      :integration.selected_location_id?[integration.selected_location_id]:null
    if(!locationIds) return res.status(400).json({error:'No location selected'})

    // Load all cached rows
    const{data:cachedRows}=await supabaseAdmin
      .from('square_orders_cache').select('*')
      .eq('cafe_id',cafeId).order('order_date',{ascending:false})

    const lastCachedDate=cachedRows?.[0]?.order_date||null
    const needsSync=forceSync==='true'||!lastCachedDate

    let newRowsFetched=0

    if(needsSync||!lastCachedDate){
      // Full sync or incremental — fetch from Square
      const fetchFrom=(!lastCachedDate||forceSync==='true')
        ?null // full sync
        :lastCachedDate // incremental from last date

      const startAt=fetchFrom
        ?new Date(new Date(fetchFrom).getTime()+86400000).toISOString()
        :new Date(Date.now()-730*24*3600*1000).toISOString()
      const endAt=new Date().toISOString()
      const SQUARE_BASE=process.env.SQUARE_ENVIRONMENT==='production'
        ?'https://connect.squareup.com':'https://connect.squareupsandbox.com'

      const dailyTotals={}
      let cursor=null
      do{
        const body={location_ids:locationIds,query:{filter:{date_time_filter:{created_at:{start_at:startAt,end_at:endAt}},state_filter:{states:['COMPLETED']}},sort:{sort_field:'CREATED_AT',sort_order:'ASC'}},limit:500}
        if(cursor)body.cursor=cursor
        const resp=await fetch(SQUARE_BASE+'/v2/orders/search',{method:'POST',headers:{'Square-Version':'2024-01-18',Authorization:'Bearer '+integration.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)})
        if(!resp.ok) break
        const data=await resp.json()
        cursor=data.cursor||null
        for(const order of data.orders||[]){
          const date=order.created_at.split('T')[0]
          const gross=(order.total_money?.amount||0)/100
          const disc=(order.total_discount_money?.amount||0)/100
          if(!dailyTotals[date])dailyTotals[date]={gross:0,net:0,count:0}
          dailyTotals[date].gross+=gross
          dailyTotals[date].net+=gross-disc
          dailyTotals[date].count+=1
        }
      }while(cursor)

      const newRows=Object.entries(dailyTotals).map(([date,v])=>({
        cafe_id:cafeId,order_date:date,
        gross_amount:Math.round(v.gross*100)/100,
        net_amount:Math.round(v.net*100)/100,
        order_count:v.count
      }))

      if(newRows.length>0){
        // If force sync, delete all existing cache first
        if(forceSync==='true') await supabaseAdmin.from('square_orders_cache').delete().eq('cafe_id',cafeId)
        await supabaseAdmin.from('square_orders_cache').upsert(newRows,{onConflict:'cafe_id,order_date'})
        newRowsFetched=newRows.length
      }

      // Reload full cache after sync
      const{data:fresh}=await supabaseAdmin.from('square_orders_cache').select('*').eq('cafe_id',cafeId)
      const salesData=computeFromCache(fresh||[],parseInt(months))
      await supabaseAdmin.from('integrations').update({last_synced_at:new Date().toISOString()}).eq('id',integration.id)
      return res.status(200).json({salesData,newRowsFetched,fromCache:false})
    }

    // Period switch — read from cache only, no Square API call
    const salesData=computeFromCache(cachedRows||[],parseInt(months))
    return res.status(200).json({salesData,newRowsFetched:0,fromCache:true})

  }catch(err){
    console.error('Sales error:',err)
    return res.status(500).json({error:err.message})
  }
}
