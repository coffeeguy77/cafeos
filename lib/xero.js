

export async function getXeroProfitAndLoss(accessToken,tenantId,months,mapping){
  const data=await getRawProfitAndLoss(accessToken,tenantId,months)
  const report=data.Reports?.[0]
  if(!report) return null
  const numVal=cells=>{const v=cells?.[cells.length-1]?.Value;return v?parseFloat(v.replace(/[^0-9.-]/g,'')||0):0}
  let revenue=0,cogs=0,totalExpenses=0
  const sections=[]
  for(const sec of report.Rows||[]){
    if(sec.RowType!=='Section') continue
    const title=(sec.Title||'').toLowerCase()
    const rows=[]
    for(const row of sec.Rows||[]){
      if(row.RowType!=='Row') continue
      const name=row.Cells?.[0]?.Value||''
      const amount=numVal(row.Cells)
      if(!name||name==='Total') continue
      const included=!mapping||Object.keys(mapping).length===0||mapping[name]===true
      if(included){
        if(title.includes('revenue')||title.includes('income')||title.includes('trading')) revenue+=amount
        else if(title.includes('cost')||title.includes('cogs')||title.includes('direct')) cogs+=amount
        else totalExpenses+=amount
      }
      rows.push({name,amount})
    }
    sections.push({title:sec.Title||'',rows})
  }
  return{revenue,cogs,totalExpenses,months,sections}
}
