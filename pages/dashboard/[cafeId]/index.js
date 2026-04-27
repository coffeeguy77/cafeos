import{useState,useEffect}from 'react'
import{useRouter}from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import{supabase}from '../../../lib/supabase'
import{calculateValuation}from '../../../lib/square'
import{calculateHealthScore,generateAlerts}from '../../../lib/health'
const TODAY='2026-04-27',SK='sb-edoucarmulyjeqiydjxd-auth-token'
const DEF={cogsPercent:35,opexPercent:44,revenueMultiple:0.5,ebitdaMultiple:2.5,months:12}
const fmt=v=>'$'+Math.round(Math.abs(v||0)).toLocaleString('en-AU')
const pct=v=>(v||0).toFixed(1)+'%'
const getToken=()=>{try{return JSON.parse(localStorage.getItem(SK)||'{}').access_token||null}catch(e){return null}}
function itemValue(i){const m=i.valuation_mode||'depreciated';if(i.ownership==='roastery'||i.ownership==='leased')return 0;if(m==='secondhand')return parseFloat(i.secondhand_value||0);if(m==='replacement'){const cp=i.condition==='excellent'?0.85:i.condition==='good'?0.65:i.condition==='fair'?0.4:0.2;return parseFloat(i.replacement_cost||0)*cp}if(m==='manual')return parseFloat(i.manual_value||0);if(!i.purchase_price||!i.purchase_date)return 0;const y=(new Date()-new Date(i.purchase_date))/(365.25*24*3600*1000);return parseFloat(i.purchase_price)*Math.max(0,1-y/(i.depreciation_years||5))}
function resolveAdj(adj,xeroLines){
  const xAmt=xeroLines?.find(l=>l.name===adj.xero_line)?.amount||0
  const base=adj.source==='xero'?xAmt:parseFloat(adj.annual_amount||0)
  if(adj.method==='percentage') return base*(parseFloat(adj.percentage||0)/100)
  if(adj.method==='full') return base
  return parseFloat(adj.annual_amount||0)
}
const EF={name:'',category:'espresso_machine',brand:'',purchase_date:'',purchase_price:'',condition:'good',depreciation_years:5,valuation_mode:'depreciated',secondhand_value:'',replacement_cost:'',manual_value:'',ownership:'cafe',notes:''}
const CATS=['espresso_machine','grinder','brewer','refrigeration','kitchen','pos_hardware','furniture','fitout','vehicle','other']
const SI={fontSize:'12px',padding:'4px 7px',borderRadius:'6px',border:'1px solid var(--border)',background:'white',width:'100%'}
const II={fontSize:'13px',padding:'5px 8px',borderRadius:'6px',border:'1px solid var(--border)',background:'white',width:'100%',boxSizing:'border-box'}
const LB={fontSize:'11px',color:'var(--text-muted)',display:'block',marginBottom:'2px'}
function Pill({label,active,color,onClick}){const c=color||'var(--espresso)';return <button type="button" onClick={onClick} style={{padding:'3px 10px',borderRadius:'20px',border:'1px solid '+(active?c:'var(--border)'),background:active?c+'18':'white',color:active?c:'var(--text-secondary)',fontSize:'12px',cursor:'pointer',fontWeight:active?600:400,whiteSpace:'nowrap'}}>{label}</button>}
function ItemForm({initial,onSave,onCancel,onDelete,saving,err,isEdit}){
  const[f,setF]=useState(initial||EF);const set=(k,v)=>setF(p=>({...p,[k]:v}));const mode=f.valuation_mode||'depreciated'
  const cpct=f.condition==='excellent'?85:f.condition==='good'?65:f.condition==='fair'?40:20
  const depc=(f.purchase_price&&f.purchase_date)?Math.round(parseFloat(f.purchase_price)*Math.max(0,1-(new Date()-new Date(f.purchase_date))/(365.25*24*3600*1000)/(f.depreciation_years||5))):null
  const repc=f.replacement_cost?Math.round(parseFloat(f.replacement_cost)*cpct/100):null
  return(<div style={{background:'white',border:'1px solid var(--crema)',borderRadius:'10px',padding:'1rem',marginBottom:'8px'}}>
    {err&&<div style={{background:'var(--danger-light)',color:'var(--danger)',padding:'5px 8px',borderRadius:'6px',marginBottom:'8px',fontSize:'12px'}}>{err}</div>}
    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'8px',marginBottom:'8px'}}>
      <div><label style={LB}>Name *</label><input style={II} value={f.name} onChange={e=>set('name',e.target.value)} placeholder="Anfim SP2 Grinder"/></div>
      <div><label style={LB}>Category</label><select style={SI} value={f.category} onChange={e=>set('category',e.target.value)}>{CATS.map(c=><option key={c} value={c}>{c.replace(/_/g,' ')}</option>)}</select></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'6px',marginBottom:'10px'}}>
      <div><label style={LB}>Brand</label><input style={II} value={f.brand||''} onChange={e=>set('brand',e.target.value)} placeholder="Anfim"/></div>
      <div><label style={LB}>Condition</label><select style={SI} value={f.condition} onChange={e=>set('condition',e.target.value)}>{['excellent','good','fair','poor'].map(c=><option key={c} value={c}>{c}</option>)}</select></div>
      <div><label style={LB}>Purchased</label><input type="date" style={II} max="2026-04-27" value={f.purchase_date||''} onChange={e=>set('purchase_date',e.target.value)}/></div>
      <div><label style={LB}>Price paid $</label><input type="number" min="0" style={II} value={f.purchase_price||''} onChange={e=>set('purchase_price',e.target.value)} placeholder="3800"/></div>
      <div><label style={LB}>Depr. yrs</label><select style={SI} value={f.depreciation_years||5} onChange={e=>set('depreciation_years',parseInt(e.target.value))}>{[3,5,7,10,15,20].map(y=><option key={y} value={y}>{y}yr</option>)}</select></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'8px'}}>
      <div><label style={{...LB,marginBottom:'5px'}}>Ownership</label><div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}><Pill label="Cafe owned" active={f.ownership==='cafe'} color="var(--success)" onClick={()=>set('ownership','cafe')}/><Pill label="Roastery" active={f.ownership==='roastery'} color="var(--warning)" onClick={()=>set('ownership','roastery')}/><Pill label="Leased" active={f.ownership==='leased'} color="var(--text-muted)" onClick={()=>set('ownership','leased')}/></div>{f.ownership!=='cafe'&&<p style={{fontSize:'11px',color:'var(--warning)',marginTop:'3px'}}>⚠ Excluded from sale value</p>}</div>
      <div><label style={{...LB,marginBottom:'5px'}}>Valuation method</label><div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}><Pill label="Depreciated" active={mode==='depreciated'} color="var(--espresso)" onClick={()=>set('valuation_mode','depreciated')}/><Pill label="Secondhand" active={mode==='secondhand'} color="var(--espresso)" onClick={()=>set('valuation_mode','secondhand')}/><Pill label="Replacement" active={mode==='replacement'} color="var(--espresso)" onClick={()=>set('valuation_mode','replacement')}/><Pill label="Manual" active={mode==='manual'} color="var(--espresso)" onClick={()=>set('valuation_mode','manual')}/></div></div>
    </div>
    {mode==='depreciated'&&depc!==null&&<div style={{background:'var(--crema-pale)',borderRadius:'6px',padding:'5px 9px',marginBottom:'8px',fontSize:'12px',color:'var(--espresso)'}}>Depreciated value: <strong>{fmt(depc)}</strong></div>}
    {mode==='secondhand'&&<div style={{marginBottom:'8px'}}><label style={LB}>Secondhand sale value today $</label><input type="number" min="0" style={{...II,width:'50%'}} value={f.secondhand_value||''} onChange={e=>set('secondhand_value',e.target.value)} placeholder="e.g. 1800"/></div>}
    {mode==='replacement'&&<div style={{marginBottom:'8px',display:'flex',gap:'8px',alignItems:'center'}}><div style={{flex:1}}><label style={LB}>New replacement cost today $</label><input type="number" min="0" style={II} value={f.replacement_cost||''} onChange={e=>set('replacement_cost',e.target.value)} placeholder="e.g. 4200"/></div>{repc!==null&&f.replacement_cost&&<div style={{background:'var(--crema-pale)',borderRadius:'6px',padding:'5px 9px',fontSize:'12px',color:'var(--espresso)',whiteSpace:'nowrap'}}>= <strong>{fmt(repc)}</strong> at {cpct}%</div>}</div>}
    {mode==='manual'&&<div style={{marginBottom:'8px'}}><label style={LB}>Manual current value $</label><input type="number" min="0" style={{...II,width:'50%'}} value={f.manual_value||''} onChange={e=>set('manual_value',e.target.value)} placeholder="e.g. 2000"/></div>}
    <div style={{marginBottom:'10px'}}><label style={LB}>Notes</label><input style={II} value={f.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="e.g. Roastery-owned, stays with supply agreement"/></div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{display:'flex',gap:'6px'}}><button type="button" disabled={saving||!f.name} onClick={()=>onSave(f)} style={{fontSize:'12px',padding:'5px 14px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer',opacity:(saving||!f.name)?0.6:1}}>{saving?'Saving…':'Save'}</button><button type="button" onClick={onCancel} style={{fontSize:'12px',padding:'5px 10px',borderRadius:'7px',background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border)',cursor:'pointer'}}>Cancel</button></div>
      {isEdit&&onDelete&&<button type="button" onClick={onDelete} style={{fontSize:'12px',padding:'5px 10px',borderRadius:'7px',color:'var(--danger)',border:'1px solid var(--danger)',background:'transparent',cursor:'pointer'}}>Delete item</button>}
    </div>
  </div>)
}
function EquipmentTab({cafeId,equipment,onRefresh}){
  const[showAdd,setShowAdd]=useState(false),[editId,setEditId]=useState(null),[saving,setSaving]=useState(false),[err,setErr]=useState('')
  const owned=equipment.filter(i=>i.ownership!=='roastery'&&i.ownership!=='leased'),excl=equipment.filter(i=>i.ownership==='roastery'||i.ownership==='leased'),total=owned.reduce((s,i)=>s+itemValue(i),0)
  async function saveNew(form){setSaving(true);setErr('');const res=await fetch('/api/cafes/'+cafeId+'/equipment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(form)});const d=await res.json();if(!res.ok){setErr(d.error||'Save failed');setSaving(false);return};await onRefresh();setShowAdd(false);setSaving(false)}
  async function saveEdit(form){setSaving(true);setErr('');const res=await fetch('/api/cafes/'+cafeId+'/equipment',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(form)});const d=await res.json();if(!res.ok){setErr(d.error||'Save failed');setSaving(false);return};await onRefresh();setEditId(null);setSaving(false)}
  async function dup(item){const{id,created_at,updated_at,...rest}=item;await fetch('/api/cafes/'+cafeId+'/equipment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({...rest,name:rest.name+' (copy)'})});await onRefresh()}
  async function del(id){await fetch('/api/cafes/'+cafeId+'/equipment',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({id})});setEditId(null);await onRefresh()}
  const OB=item=>{if(item.ownership==='roastery')return <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:'#fff3cd',color:'#856404',fontWeight:500}}>Roastery</span>;if(item.ownership==='leased')return <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:'var(--crema-pale)',color:'var(--text-muted)',fontWeight:500}}>Leased</span>;return null}
  const MB=item=>{const l={depreciated:'Dep',secondhand:'SH',replacement:'Repl',manual:'Manual'};return <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:'var(--crema-pale)',color:'var(--text-muted)'}}>{l[item.valuation_mode||'depreciated']}</span>}
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}><div><h2 style={{fontSize:'19px',marginBottom:'2px'}}>Equipment ledger</h2><p style={{color:'var(--text-secondary)',fontSize:'13px'}}>Sale value: <strong style={{color:'var(--sage)'}}>{fmt(total)}</strong>{excl.length>0&&<span style={{color:'var(--text-muted)',fontWeight:400}}> · {excl.length} excluded</span>}</p></div><button onClick={()=>{setShowAdd(true);setEditId(null);setErr('')}} style={{fontSize:'12px',padding:'5px 12px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}}>+ Add item</button></div>
    {showAdd&&<ItemForm initial={null} onSave={saveNew} onCancel={()=>{setShowAdd(false);setErr('')}} saving={saving} err={err} isEdit={false}/>}
    {equipment.length===0&&!showAdd&&<div style={{textAlign:'center',padding:'2.5rem',background:'white',borderRadius:'12px',border:'1px solid var(--border)'}}><div style={{fontSize:'32px',marginBottom:'8px'}}>🔧</div><p style={{color:'var(--text-secondary)',fontSize:'13px'}}>No equipment yet.</p></div>}
    {equipment.length>0&&<div style={{display:'grid',gap:'5px'}}>{equipment.map(item=><div key={item.id}>{editId===item.id?<ItemForm initial={item} onSave={saveEdit} onCancel={()=>{setEditId(null);setErr('')}} onDelete={()=>del(item.id)} saving={saving} err={err} isEdit={true}/>:<div style={{background:'white',border:'1px solid var(--border)',borderRadius:'9px',padding:'0.65rem 0.875rem',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:item.ownership==='roastery'||item.ownership==='leased'?0.7:1}}><div style={{flex:1,minWidth:0}}><div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'1px',flexWrap:'wrap'}}><strong style={{fontSize:'13px'}}>{item.name}</strong>{item.brand&&<span style={{fontSize:'11px',color:'var(--text-muted)'}}>{item.brand}</span>}{OB(item)}{MB(item)}</div><div style={{fontSize:'11px',color:'var(--text-muted)'}}>{item.purchase_price&&fmt(item.purchase_price)+' new'}{item.purchase_date&&' · '+new Date(item.purchase_date).getFullYear()}{item.notes&&' · '+item.notes.substring(0,45)+(item.notes.length>45?'…':'')}</div></div><div style={{display:'flex',alignItems:'center',gap:'6px',marginLeft:'8px',flexShrink:0}}>{item.ownership==='roastery'||item.ownership==='leased'?<span style={{fontSize:'11px',color:'var(--text-muted)',fontStyle:'italic'}}>not included</span>:<div style={{textAlign:'right'}}><div style={{fontSize:'14px',fontWeight:600,fontFamily:'serif'}}>{fmt(itemValue(item))}</div><div style={{fontSize:'10px',color:'var(--text-muted)'}}>sale value</div></div>}<button title="Duplicate" onClick={()=>dup(item)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'5px',padding:'2px 6px',cursor:'pointer',fontSize:'12px',color:'var(--text-muted)',lineHeight:1}}>⧉</button><button title="Edit" onClick={()=>{setEditId(item.id);setShowAdd(false);setErr('')}} style={{background:'none',border:'1px solid var(--border)',borderRadius:'5px',padding:'2px 6px',cursor:'pointer',fontSize:'12px',color:'var(--text-secondary)',lineHeight:1}}>✎</button></div></div>}</div>)}</div>}
  </div>)
}
function AdjustmentsTab({cafeId,adjustments,onRefresh,xeroLines,xeroConn}){
  const EF={label:'',description:'',source:'manual',method:'fixed',xero_line:'',percentage:'',annual_amount:'',result_type:'add_back'}
  const[showForm,setShowForm]=useState(false),[form,setForm]=useState(EF),[saving,setSaving]=useState(false),[err,setErr]=useState('')
  const sf=(k,v)=>setForm(f=>({...f,[k]:v}))

  // Compute resolved annual amount for display
  function resolve(adj,xLine){
    if(adj.source==='xero'&&xLine){
      if(adj.method==='percentage') return xLine*(parseFloat(adj.percentage||0)/100)
      if(adj.method==='fixed') return parseFloat(adj.annual_amount||0)
      return xLine // full
    }
    if(adj.method==='percentage'&&adj.source==='manual') return parseFloat(adj.annual_amount||0)*(parseFloat(adj.percentage||0)/100)
    return parseFloat(adj.annual_amount||0)
  }

  // Get live xero amount for a line name
  const xeroAmt=(name)=>xeroLines?.find(l=>l.name===name)?.amount||0

  // Summary totals
  const addBacks=adjustments.filter(a=>a.result_type==='add_back').reduce((s,a)=>s+resolve(a,xeroAmt(a.xero_line)),0)
  const removals=adjustments.filter(a=>a.result_type==='remove').reduce((s,a)=>s+resolve(a,xeroAmt(a.xero_line)),0)
  const replaces=adjustments.filter(a=>a.result_type==='replace')

  async function save(e){
    e.preventDefault();setSaving(true);setErr('')
    const body={...form}
    if(body.source==='xero'){body.annual_amount=xeroAmt(body.xero_line)||0}
    const res=await fetch('/api/cafes/'+cafeId+'/adjustments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(body)})
    const d=await res.json()
    if(!res.ok){setErr(d.error||'Save failed');setSaving(false);return}
    await onRefresh();setShowForm(false);setSaving(false);setForm(EF)
  }
  async function del(id){await fetch('/api/cafes/'+cafeId+'/adjustments',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({id})});onRefresh()}

  const RT_LABELS={add_back:'Add-back',remove:'Remove',replace:'Replace'}
  const RT_COLORS={add_back:'var(--success)',remove:'var(--danger)',replace:'#7c5cbf'}
  const RT_BG={add_back:'var(--success-light)',remove:'var(--danger-light)',replace:'#f3efff'}
  const M_LABELS={fixed:'Fixed amount',percentage:'% of source',full:'Full source value'}
  const S_LABELS={manual:'Manual entry',xero:'From Xero P&L'}

  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
      <div><h2 style={{fontSize:'19px',marginBottom:'2px'}}>Owner adjustments</h2><p style={{fontSize:'12px',color:'var(--text-muted)'}}>Override, add-back, or remove expense lines. Choose source, calculation method and how it affects the valuation.</p></div>
      <button onClick={()=>{setShowForm(true);setErr('')}} style={{fontSize:'12px',padding:'5px 12px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}}>+ Add adjustment</button>
    </div>

    {/* Summary row */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'1rem'}}>
      <div style={{background:'var(--success-light)',borderRadius:'9px',padding:'0.65rem 0.875rem'}}><p style={{fontSize:'10px',color:'var(--success)',fontWeight:600,marginBottom:'2px',textTransform:'uppercase'}}>Add-backs</p><p style={{fontSize:'18px',fontFamily:'serif',color:'var(--success)'}}>+{fmt(addBacks)}</p><p style={{fontSize:'10px',color:'var(--success)',marginTop:'1px'}}>Increases EBITDA</p></div>
      <div style={{background:'var(--danger-light)',borderRadius:'9px',padding:'0.65rem 0.875rem'}}><p style={{fontSize:'10px',color:'var(--danger)',fontWeight:600,marginBottom:'2px',textTransform:'uppercase'}}>Removals</p><p style={{fontSize:'18px',fontFamily:'serif',color:'var(--danger)'}}>-{fmt(removals)}</p><p style={{fontSize:'10px',color:'var(--danger)',marginTop:'1px'}}>Decreases EBITDA</p></div>
      <div style={{background:'#f3efff',borderRadius:'9px',padding:'0.65rem 0.875rem'}}><p style={{fontSize:'10px',color:'#7c5cbf',fontWeight:600,marginBottom:'2px',textTransform:'uppercase'}}>Replacements</p><p style={{fontSize:'18px',fontFamily:'serif',color:'#7c5cbf'}}>{replaces.length} line{replaces.length!==1?'s':''}</p><p style={{fontSize:'10px',color:'#7c5cbf',marginTop:'1px'}}>Overrides Xero figures</p></div>
    </div>

    {/* Add form */}
    {showForm&&<div style={{background:'white',border:'1px solid var(--crema)',borderRadius:'12px',padding:'1.25rem',marginBottom:'1rem'}}>
      {err&&<div style={{background:'var(--danger-light)',color:'var(--danger)',padding:'5px 8px',borderRadius:'6px',marginBottom:'8px',fontSize:'12px'}}>{err}</div>}
      <form onSubmit={save}>
        {/* Row 1: label + result type */}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'8px',marginBottom:'10px'}}>
          <div><label style={LB}>Label *</label><input style={II} value={form.label} onChange={e=>sf('label',e.target.value)} placeholder="e.g. Café share of rent" required/></div>
          <div><label style={LB}>Effect on valuation</label>
            <div style={{display:'flex',gap:'4px',flexWrap:'wrap',marginTop:'2px'}}>
              {Object.entries(RT_LABELS).map(([k,v])=><button key={k} type="button" onClick={()=>sf('result_type',k)} style={{fontSize:'11px',padding:'3px 9px',borderRadius:'20px',border:'1px solid '+(form.result_type===k?RT_COLORS[k]:'var(--border)'),background:form.result_type===k?RT_BG[k]:'white',color:form.result_type===k?RT_COLORS[k]:'var(--text-muted)',cursor:'pointer',fontWeight:form.result_type===k?600:400}}>{v}</button>)}
            </div>
            <p style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'3px'}}>{form.result_type==='add_back'?'Adds back to EBITDA (non-café cost)':form.result_type==='remove'?'Subtracts from EBITDA (missed cost)':'Replaces Xero figure with calculated amount'}</p>
          </div>
        </div>

        {/* Row 2: source + xero line picker */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'10px'}}>
          <div><label style={LB}>Source</label>
            <div style={{display:'flex',gap:'4px',marginTop:'2px'}}>
              <button type="button" onClick={()=>sf('source','manual')} style={{fontSize:'11px',padding:'3px 10px',borderRadius:'20px',border:'1px solid '+(form.source==='manual'?'var(--espresso)':'var(--border)'),background:form.source==='manual'?'var(--crema-pale)':'white',color:form.source==='manual'?'var(--espresso)':'var(--text-muted)',cursor:'pointer',fontWeight:form.source==='manual'?600:400}}>Manual entry</button>
              {xeroConn&&<button type="button" onClick={()=>sf('source','xero')} style={{fontSize:'11px',padding:'3px 10px',borderRadius:'20px',border:'1px solid '+(form.source==='xero'?'#0077b5':'var(--border)'),background:form.source==='xero'?'#e8f4fd':'white',color:form.source==='xero'?'#0077b5':'var(--text-muted)',cursor:'pointer',fontWeight:form.source==='xero'?600:400}}>From Xero</button>}
            </div>
          </div>
          {form.source==='xero'&&xeroLines?.length>0&&<div><label style={LB}>Xero P&L line</label>
            <select style={SI} value={form.xero_line} onChange={e=>sf('xero_line',e.target.value)} required={form.source==='xero'}>
              <option value="">Select line...</option>
              {xeroLines.map(l=><option key={l.name} value={l.name}>{l.name} ({fmt(l.amount)})</option>)}
            </select>
            {form.xero_line&&<p style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'2px'}}>Xero value: {fmt(xeroAmt(form.xero_line))}/yr</p>}
          </div>}
          {form.source==='manual'&&<div><label style={LB}>Base annual amount $</label><input type="number" min="0" style={II} value={form.annual_amount} onChange={e=>sf('annual_amount',e.target.value)} placeholder="e.g. 190000" required={form.source==='manual'}/></div>}
        </div>

        {/* Row 3: method */}
        <div style={{marginBottom:'10px'}}>
          <label style={LB}>Calculation method</label>
          <div style={{display:'flex',gap:'4px',flexWrap:'wrap',marginTop:'2px'}}>
            {Object.entries(M_LABELS).map(([k,v])=><button key={k} type="button" onClick={()=>sf('method',k)} style={{fontSize:'11px',padding:'3px 10px',borderRadius:'20px',border:'1px solid '+(form.method===k?'var(--espresso)':'var(--border)'),background:form.method===k?'var(--crema-pale)':'white',color:form.method===k?'var(--espresso)':'var(--text-muted)',cursor:'pointer',fontWeight:form.method===k?600:400}}>{v}</button>)}
          </div>
        </div>

        {/* Row 4: percentage input if needed + preview */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'12px'}}>
          {form.method==='percentage'&&<div><label style={LB}>Percentage %</label><div style={{display:'flex',alignItems:'center',gap:'6px'}}><input type="number" min="0" max="100" step="0.1" style={{...II,width:'80px'}} value={form.percentage} onChange={e=>sf('percentage',e.target.value)} placeholder="30" required/><input type="range" min="0" max="100" step="1" value={form.percentage||0} onChange={e=>sf('percentage',e.target.value)} style={{flex:1}}/></div></div>}
          {/* Live preview */}
          {(form.label&&(form.source==='manual'?form.annual_amount:form.xero_line))&&<div style={{background:'var(--crema-pale)',borderRadius:'8px',padding:'10px 12px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
            <p style={{fontSize:'10px',color:'var(--text-muted)',marginBottom:'2px'}}>Preview — café adjustment</p>
            <p style={{fontSize:'18px',fontFamily:'serif',color:RT_COLORS[form.result_type],fontWeight:600}}>
              {form.result_type==='add_back'?'+':form.result_type==='remove'?'-':'±'}{fmt(resolve(form,xeroAmt(form.xero_line)))}/yr
            </p>
            <p style={{fontSize:'10px',color:'var(--text-muted)'}}>{form.method==='percentage'&&form.percentage?form.percentage+'% of ':''}
              {form.source==='xero'&&form.xero_line?form.xero_line:form.source==='manual'?'manual entry':''} 
              → {RT_LABELS[form.result_type]?.toLowerCase()}
            </p>
          </div>}
        </div>

        {/* Description */}
        <div style={{marginBottom:'12px'}}><label style={LB}>Notes (optional)</label><input style={II} value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="e.g. 30% of shared rent — café occupies ground floor only"/></div>

        <div style={{display:'flex',gap:'6px'}}>
          <button type="submit" disabled={saving||!form.label} style={{fontSize:'12px',padding:'5px 14px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer',opacity:saving||!form.label?0.6:1}}>{saving?'Saving…':'Save adjustment'}</button>
          <button type="button" onClick={()=>{setShowForm(false);setErr('');setForm(EF)}} style={{fontSize:'12px',padding:'5px 10px',borderRadius:'7px',background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border)',cursor:'pointer'}}>Cancel</button>
        </div>
      </form>
    </div>}

    {/* List */}
    {adjustments.length===0&&!showForm&&<div style={{textAlign:'center',padding:'2.5rem',background:'white',borderRadius:'12px',border:'1px solid var(--border)'}}><div style={{fontSize:'32px',marginBottom:'8px'}}>💼</div><p style={{color:'var(--text-secondary)',fontSize:'13px',marginBottom:'4px'}}>No adjustments yet.</p><p style={{color:'var(--text-muted)',fontSize:'12px'}}>Common examples: café share of rent, owner salary add-back, market manager wage.</p></div>}
    {adjustments.length>0&&<div style={{display:'grid',gap:'6px'}}>{adjustments.map(a=>{
      const base=a.source==='xero'?xeroAmt(a.xero_line):parseFloat(a.annual_amount||0)
      const resolved=resolve(a,xeroAmt(a.xero_line))
      const rt=a.result_type||'add_back'
      return(<div key={a.id} style={{background:'white',border:'1px solid var(--border)',borderRadius:'10px',padding:'0.75rem 1rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'3px',flexWrap:'wrap'}}>
            <strong style={{fontSize:'13px'}}>{a.label}</strong>
            <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:RT_BG[rt],color:RT_COLORS[rt],fontWeight:600}}>{RT_LABELS[rt]}</span>
            {a.source==='xero'&&<span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:'#e8f4fd',color:'#0077b5'}}>Xero: {a.xero_line}</span>}
          </div>
          <div style={{fontSize:'11px',color:'var(--text-muted)',display:'flex',gap:'8px',flexWrap:'wrap'}}>
            <span>{S_LABELS[a.source||'manual']}</span>
            {a.method==='percentage'&&<span>· {a.percentage}% of {fmt(base)}</span>}
            {a.method==='fixed'&&<span>· Fixed {fmt(resolved)}/yr</span>}
            {a.method==='full'&&a.source==='xero'&&<span>· Full Xero value</span>}
            {a.description&&<span>· {a.description}</span>}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'10px',marginLeft:'12px',flexShrink:0}}>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'15px',fontWeight:600,fontFamily:'serif',color:RT_COLORS[rt]}}>{rt==='add_back'?'+':'-'}{fmt(resolved)}/yr</div>
            {a.method==='percentage'&&<div style={{fontSize:'10px',color:'var(--text-muted)'}}>{a.percentage}% of {fmt(base)}</div>}
          </div>
          <button onClick={()=>del(a.id)} style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',fontSize:'15px',padding:'0 2px',opacity:0.6}}>✕</button>
        </div>
      </div>)
    })}</div>}
  </div>)
}
function XeroMappingTab({cafeId,onMappingSaved}){
  const[raw,setRaw]=useState(null),[mapping,setMapping]=useState({}),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[saved,setSaved]=useState(false),[months,setMonths]=useState(12)
  useEffect(()=>{load(12)},[cafeId])
  async function load(m){setLoading(true);const res=await fetch('/api/xero/raw?cafeId='+cafeId+'&months='+m,{headers:{Authorization:'Bearer '+getToken()}});if(res.ok){const d=await res.json();setRaw(d.raw);if(d.mapping&&Object.keys(d.mapping).length>0)setMapping(d.mapping)};setLoading(false)}
  function toggle(name){setMapping(m=>({...m,[name]:!m[name]}))}
  function setAll(sec,val){const u={};sec.rows.forEach(r=>{u[r.name]=val});setMapping(m=>({...m,...u}))}
  async function save(){setSaving(true);await fetch('/api/xero/mapping',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({cafeId,mapping})});setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2500);if(onMappingSaved)onMappingSaved(mapping)}
  const incTotal=raw?.sections?.reduce((st,sec)=>st+sec.rows.reduce((sr,r)=>sr+(mapping[r.name]?r.amount:0),0),0)||0
  const allTotal=raw?.sections?.reduce((st,sec)=>st+sec.rows.reduce((sr,r)=>sr+r.amount,0),0)||0
  if(loading) return <div style={{textAlign:'center',padding:'3rem',color:'var(--text-muted)',fontSize:'13px'}}>Loading Xero P&L…</div>
  if(!raw) return <div style={{textAlign:'center',padding:'3rem',color:'var(--danger)',fontSize:'13px'}}>Could not load Xero data.</div>
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'1rem'}}>
      <div><h2 style={{fontSize:'19px',marginBottom:'3px'}}>Xero P&L mapping</h2><p style={{fontSize:'12px',color:'var(--text-muted)'}}>Tick only lines that belong to this café. Mixed lines — exclude here, add an adjustment for the café portion.</p></div>
      <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
        <div style={{display:'flex',gap:'2px'}}>{[3,6,12].map(m=><button key={m} onClick={()=>{setMonths(m);load(m)}} style={{fontSize:'11px',padding:'3px 8px',borderRadius:'20px',cursor:'pointer',background:months===m?'var(--espresso)':'transparent',border:'1px solid '+(months===m?'var(--espresso)':'var(--border)'),color:months===m?'var(--crema-light)':'var(--text-secondary)'}}>{m}m</button>)}</div>
        <button onClick={save} disabled={saving} style={{fontSize:'12px',padding:'5px 14px',borderRadius:'7px',background:saved?'var(--success)':'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}}>{saving?'Saving…':saved?'✓ Saved':'Save mapping'}</button>
      </div>
    </div>
    <div style={{background:'var(--crema-pale)',borderRadius:'10px',padding:'10px 14px',marginBottom:'1rem',display:'flex',gap:'24px',flexWrap:'wrap'}}>
      <div><span style={{fontSize:'10px',color:'var(--text-muted)',display:'block'}}>Included</span><span style={{fontSize:'16px',fontFamily:'serif',color:'var(--espresso)',fontWeight:600}}>{fmt(incTotal)}</span></div>
      <div><span style={{fontSize:'10px',color:'var(--text-muted)',display:'block'}}>Full P&L</span><span style={{fontSize:'16px',fontFamily:'serif',color:'var(--text-secondary)'}}>{fmt(allTotal)}</span></div>
      <div><span style={{fontSize:'10px',color:'var(--text-muted)',display:'block'}}>Allocated</span><span style={{fontSize:'16px',fontFamily:'serif',color:allTotal>0&&incTotal/allTotal>0.9?'var(--danger)':incTotal/allTotal<0.3?'var(--warning)':'var(--success)'}}>{allTotal>0?Math.round(incTotal/allTotal*100):0}%</span></div>
      <div style={{marginLeft:'auto',fontSize:'11px',color:'var(--text-muted)',alignSelf:'center'}}>Save → Overview updates</div>
    </div>
    {raw.sections.map(sec=>{
      const secTotal=sec.rows.reduce((s,r)=>s+r.amount,0),secInc=sec.rows.reduce((s,r)=>s+(mapping[r.name]?r.amount:0),0)
      const allOn=sec.rows.every(r=>mapping[r.name]),allOff=sec.rows.every(r=>!mapping[r.name])
      return(<div key={sec.title} style={{background:'white',border:'1px solid var(--border)',borderRadius:'10px',marginBottom:'8px',overflow:'hidden'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'var(--crema-pale)',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}><strong style={{fontSize:'12px',color:'var(--espresso)'}}>{sec.title}</strong><span style={{fontSize:'10px',color:'var(--text-muted)'}}>{sec.rows.length} lines</span></div>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}><span style={{fontSize:'11px',color:'var(--text-muted)'}}>{fmt(secInc)} of {fmt(secTotal)}</span><div style={{display:'flex',gap:'4px'}}><button onClick={()=>setAll(sec,true)} style={{fontSize:'10px',padding:'2px 7px',borderRadius:'5px',border:'1px solid var(--border)',background:allOn?'var(--espresso)':'white',color:allOn?'var(--crema-light)':'var(--text-muted)',cursor:'pointer'}}>All</button><button onClick={()=>setAll(sec,false)} style={{fontSize:'10px',padding:'2px 7px',borderRadius:'5px',border:'1px solid var(--border)',background:allOff?'var(--danger)':'white',color:allOff?'white':'var(--text-muted)',cursor:'pointer'}}>None</button></div></div>
        </div>
        <div>{sec.rows.map((row,i)=>{const on=!!mapping[row.name],pctOfSec=secTotal>0?Math.round(row.amount/secTotal*100):0;return(<div key={row.name} onClick={()=>toggle(row.name)} style={{display:'flex',alignItems:'center',gap:'10px',padding:'7px 12px',borderBottom:i<sec.rows.length-1?'1px solid var(--border)':'none',cursor:'pointer',background:on?'#f0faf4':'white'}}><div style={{width:'16px',height:'16px',borderRadius:'4px',border:'2px solid '+(on?'var(--success)':'var(--border)'),background:on?'var(--success)':'white',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>{on&&<span style={{color:'white',fontSize:'10px',fontWeight:700}}>✓</span>}</div><span style={{flex:1,fontSize:'12px',color:on?'var(--espresso)':'var(--text-secondary)',fontWeight:on?500:400}}>{row.name}</span><div style={{display:'flex',alignItems:'center',gap:'8px'}}><div style={{width:'60px',height:'3px',background:'var(--crema-pale)',borderRadius:'2px'}}><div style={{height:'100%',width:pctOfSec+'%',background:on?'var(--success)':'var(--border)',borderRadius:'2px'}}/></div><span style={{fontSize:'12px',fontFamily:'serif',color:on?'var(--espresso)':'var(--text-muted)',width:'80px',textAlign:'right'}}>{fmt(row.amount)}</span><span style={{fontSize:'10px',color:'var(--text-muted)',width:'28px',textAlign:'right'}}>{pctOfSec}%</span></div></div>)})}</div>
      </div>)
    })}
  </div>)
}
function LoadingScreen({steps}){
  return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--milk)'}}><div style={{width:'320px'}}><div style={{textAlign:'center',marginBottom:'2rem'}}><div style={{fontSize:'32px',marginBottom:'8px'}}>☕</div><h2 style={{fontFamily:'serif',fontSize:'22px',color:'var(--espresso)',marginBottom:'4px'}}>Brewing your valuation</h2><p style={{fontSize:'13px',color:'var(--text-muted)'}}>Pulling your data…</p></div><div style={{display:'grid',gap:'10px'}}>{steps.map((step,i)=>{const isDone=step.status==='done',isActive=step.status==='active',isPending=step.status==='pending';return(<div key={i} style={{background:'white',borderRadius:'10px',padding:'12px 14px',border:'1px solid '+(isDone?'var(--success)':isActive?'var(--crema)':'var(--border)'),opacity:isPending?0.5:1,transition:'all 0.3s'}}><div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:isActive?'8px':'0'}}><div style={{width:'22px',height:'22px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:isDone?'var(--success)':'var(--crema-pale)',border:'1px solid '+(isDone?'var(--success)':isActive?'var(--crema)':'var(--border)')}}>{isDone&&<span style={{fontSize:'11px',color:'white',fontWeight:700}}>✓</span>}{isActive&&<span style={{fontSize:'11px'}}>&#9679;</span>}{isPending&&<span style={{fontSize:'11px',color:'var(--text-muted)'}}>{i+1}</span>}</div><div style={{flex:1}}><div style={{fontSize:'13px',fontWeight:500,color:isDone?'var(--success)':isActive?'var(--espresso)':'var(--text-muted)'}}>{step.label}</div>{step.detail&&<div style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'1px'}}>{step.detail}</div>}</div></div>{isActive&&(<div style={{height:'3px',background:'var(--crema-pale)',borderRadius:'2px',overflow:'hidden'}}><div style={{height:'100%',background:'var(--crema)',borderRadius:'2px',animation:'progress 1.5s ease-in-out infinite',width:'60%'}}/></div>)}</div>)})}</div><style>{`@keyframes progress{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}`}</style></div></div>)
}
export default function CafeDashboard(){
  const router=useRouter(),{cafeId}=router.query
  const[cafe,setCafe]=useState(null),[sd,setSd]=useState(null),[eq,setEq]=useState([]),[adj,setAdj]=useState([])
  const[settings,setSettings]=useState(DEF),[val,setVal]=useState(null),[hs,setHs]=useState(null),[alerts,setAlerts]=useState([])
  const[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[tab,setTab]=useState('overview'),[sqConn,setSqConn]=useState(false)
  const[xeroConn,setXeroConn]=useState(false),[xeroName,setXeroName]=useState(null),[xeroPL,setXeroPL]=useState(null),[xeroLoading,setXeroLoading]=useState(false)
  const[xeroLines,setXeroLines]=useState([]),[lastSyncInfo,setLastSyncInfo]=useState(null)
  const[steps,setSteps]=useState([{label:'Connecting',detail:'Verifying your account',status:'pending'},{label:'Square sales',detail:'Loading order history',status:'pending'},{label:'Xero P&L',detail:'Fetching expense data',status:'pending'},{label:'Calculating valuation',detail:'Running the model',status:'pending'}])
  const setStep=(i,status,detail)=>setSteps(prev=>prev.map((s,idx)=>idx===i?{...s,status,detail:detail||s.detail}:s))
  useEffect(()=>{if(cafeId)init()},[cafeId])
  useEffect(()=>{const p=new URLSearchParams(window.location.search);if(p.get('xero_connected')){setTab('integrations');window.history.replaceState({},'',window.location.pathname)}},[])
  async function init(){
    setStep(0,'active')
    const{data:{user}}=await supabase.auth.getUser()
    if(!user){router.push('/login');return}
    const{data}=await supabase.from('cafes').select('*,integrations(*)').eq('id',cafeId).eq('owner_id',user.id).single()
    if(!data){router.push('/dashboard');return}
    setCafe(data)
    const sq=data.integrations?.find(i=>i.type==='square'),xr=data.integrations?.find(i=>i.type==='xero')
    const sqC=sq?.status==='connected',xrC=xr?.status==='connected'
    setSqConn(sqC);setXeroConn(xrC)
    if(xrC)setXeroName(xr.metadata?.tenant_name||'Xero')
    setStep(0,'done')
    await Promise.all([loadEq(),loadAdj()])
    if(sqC){setStep(1,'active','Checking cache…');await loadSales(12,false);setStep(1,'done')}
    else setStep(1,'done','Not connected')
    if(xrC){setStep(2,'active');await loadXero(12);setStep(2,'done')}
    else setStep(2,'done','Not connected')
    setStep(3,'active');setLoading(false)
  }
  async function loadSales(months,force){
    setSyncing(true)
    const res=await fetch('/api/square/sales?cafeId='+cafeId+'&months='+months+(force?'&forceSync=true':''),{headers:{Authorization:'Bearer '+getToken()}})
    if(res.ok){const d=await res.json();setSd(d.salesData);setLastSyncInfo({newRows:d.newRowsFetched,from:d.lastSyncedFrom})}
    setSyncing(false)
  }
  async function switchPeriod(months){
    setSyncing(true)
    const res=await fetch('/api/square/sales?cafeId='+cafeId+'&months='+months,{headers:{Authorization:'Bearer '+getToken()}})
    if(res.ok){const d=await res.json();setSd(d.salesData)}
    setSyncing(false)
  }
  async function loadEq(){const res=await fetch('/api/cafes/'+cafeId+'/equipment',{headers:{Authorization:'Bearer '+getToken()}});if(res.ok){const d=await res.json();setEq(d.equipment||[])}}
  async function loadAdj(){const res=await fetch('/api/cafes/'+cafeId+'/adjustments',{headers:{Authorization:'Bearer '+getToken()}});if(res.ok){const d=await res.json();setAdj(d.adjustments||[])}}
  async function loadXero(months){
    setXeroLoading(true)
    const res=await fetch('/api/xero/reports?cafeId='+cafeId+'&months='+(months||settings.months),{headers:{Authorization:'Bearer '+getToken()}})
    if(res.ok){
      const d=await res.json();setXeroPL(d.pl)
      if(d.tenantName)setXeroName(d.tenantName)
      // Extract flat line list for adjustments dropdown
      const rawRes=await fetch('/api/xero/raw?cafeId='+cafeId+'&months='+(months||settings.months),{headers:{Authorization:'Bearer '+getToken()}})
      if(rawRes.ok){const rd=await rawRes.json();const lines=rd.raw?.sections?.flatMap(s=>s.rows)||[];setXeroLines(lines)}
    }
    setXeroLoading(false)
  }
  function handleMappingSaved(){loadXero(settings.months)}
  useEffect(()=>{
    if(!sd)return
    setStep(3,'active')
    const revenue=sd.annualisedSales
    let cogsAmt=revenue*(settings.cogsPercent/100),opexAmt=revenue*(settings.opexPercent/100)
    if(xeroPL&&xeroPL.revenue>0){cogsAmt=xeroPL.cogs*(12/xeroPL.months);opexAmt=xeroPL.totalExpenses*(12/xeroPL.months)}
    const expenses=[{normalised_type:'cogs',amount:cogsAmt,is_excluded:false},{normalised_type:'opex',amount:opexAmt,is_excluded:false}]
    const v=calculateValuation(sd,expenses,eq,adj.map(a=>({...a,annual_amount:resolveAdj(a,xeroLines)})),settings)
    setVal(v);setHs(calculateHealthScore(sd,v,[]));setAlerts(generateAlerts(sd,v));setStep(3,'done')
  },[sd,eq,adj,settings,xeroPL,xeroLines])
  const ss=(k,v)=>setSettings(p=>({...p,[k]:v}))
  async function cp(m){ss('months',m);await switchPeriod(m)}
  async function connSq(){const r=await fetch('/api/square/auth?cafeId='+cafeId);const{url}=await r.json();window.location.href=url}
  async function connXero(){const r=await fetch('/api/xero/auth?cafeId='+cafeId,{headers:{Authorization:'Bearer '+getToken()}});const{url}=await r.json();window.location.href=url}
  const hc=!hs?'#999':hs.total>=70?'var(--success)':hs.total>=40?'var(--warning)':'var(--danger)'
  const mappingActive=xeroPL&&xeroPL.totalExpenses>0
  if(loading)return <LoadingScreen steps={steps}/>
  return(<>
    <Head><title>{cafe?.name} — Caféos</title></Head>
    <div style={{minHeight:'100vh',background:'var(--milk)'}}>
      <nav style={s.nav}>
        <div style={{display:'flex',alignItems:'center',gap:'14px'}}><Link href="/dashboard" style={{color:'var(--text-muted)',fontSize:'13px',textDecoration:'none'}}>← All cafés</Link><span style={s.logo}>☕ {cafe?.name}</span></div>
        <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
          {hs&&<div style={{display:'flex',alignItems:'center',gap:'4px',padding:'3px 10px',background:'white',borderRadius:'20px',border:'1px solid var(--border)'}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Health</span><span style={{fontSize:'11px',fontWeight:600,color:hc}}>{hs.total}/100 {hs.grade}</span></div>}
          {sqConn?<button style={s.btnSm} onClick={()=>loadSales(settings.months,true)} disabled={syncing}>{syncing?'Syncing…':'↻ Sync'}</button>:<button style={{...s.btnSm,background:'var(--espresso)',color:'var(--crema-light)',border:'none'}} onClick={connSq}>Connect Square</button>}
        </div>
      </nav>
      <main style={{maxWidth:'920px',margin:'0 auto',padding:'1.25rem 1.5rem 4rem'}}>
        {alerts.map((a,i)=><div key={i} style={{display:'flex',gap:'8px',padding:'8px 12px',borderRadius:'8px',border:'1px solid',marginBottom:'5px',fontSize:'12px',background:a.severity==='positive'?'var(--success-light)':a.severity==='critical'?'var(--danger-light)':'var(--warning-light)',borderColor:a.severity==='positive'?'var(--success)':a.severity==='critical'?'var(--danger)':'var(--warning)'}}><span>{a.severity==='positive'?'📈':a.severity==='critical'?'🚨':'⚠️'}</span><div><strong>{a.title}</strong><span style={{color:'var(--text-secondary)',marginLeft:'5px'}}>{a.message}</span></div></div>)}
        <div style={{display:'flex',gap:'3px',marginBottom:'1.125rem',background:'white',borderRadius:'9px',padding:'3px',border:'1px solid var(--border)'}}>{['overview','equipment','adjustments',xeroConn?'xero mapping':null,'integrations'].filter(Boolean).map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'6px 4px',borderRadius:'6px',border:'none',fontSize:'11px',cursor:'pointer',background:tab===t?'var(--espresso)':'transparent',color:tab===t?'var(--crema-light)':'var(--text-secondary)',fontWeight:tab===t?500:400,position:'relative'}}>{t==='xero mapping'?<>Xero mapping{mappingActive&&<span style={{position:'absolute',top:'3px',right:'3px',width:'5px',height:'5px',borderRadius:'50%',background:'var(--success)'}}/>}</>:t.charAt(0).toUpperCase()+t.slice(1)}</button>)}</div>
        {tab==='overview'&&!sqConn&&<div style={{textAlign:'center',padding:'3rem 2rem',background:'white',borderRadius:'14px',border:'1px solid var(--border)'}}><div style={{fontSize:'36px',marginBottom:'0.75rem'}}>🔗</div><h2 style={{marginBottom:'6px',fontSize:'19px'}}>Connect Square POS</h2><p style={{color:'var(--text-secondary)',marginBottom:'1rem',fontSize:'13px'}}>Pull real sales data for an accurate valuation.</p><button style={{fontSize:'12px',padding:'6px 18px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}} onClick={connSq}>Connect with Square</button></div>}
        {tab==='overview'&&sqConn&&<>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.875rem'}}><p style={{fontSize:'12px',color:'var(--text-muted)'}}>{syncing?'Syncing…':sd?(sd.orderCount||0).toLocaleString()+' orders':'Loading…'}</p><div style={{display:'flex',gap:'3px'}}>{[3,6,12].map(m=><button key={m} onClick={()=>cp(m)} disabled={syncing} style={{fontSize:'11px',padding:'3px 9px',borderRadius:'20px',cursor:'pointer',background:settings.months===m?'var(--espresso)':'transparent',border:'1px solid '+(settings.months===m?'var(--espresso)':'var(--border-strong)'),color:settings.months===m?'var(--crema-light)':'var(--text-secondary)'}}>{m}m</button>)}</div></div>
          {val&&sd&&<>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'7px',marginBottom:'0.875rem'}}>
              <div style={s.vc}><p style={s.vt}>Conservative</p><p style={s.va}>{fmt(val.valByRevenue)}</p><p style={s.vm}>Revenue x {settings.revenueMultiple.toFixed(2)}</p></div>
              <div style={{...s.vc,border:'2px solid var(--crema)',background:'#fffaf5'}}><p style={{...s.vt,color:'var(--crema)'}}>Midpoint estimate</p><p style={{...s.va,fontSize:'26px'}}>{fmt(val.valMid)}</p><p style={s.vm}>Blended average</p></div>
              <div style={s.vc}><p style={s.vt}>With assets</p><p style={s.va}>{fmt(val.valByAsset)}</p><p style={s.vm}>EBITDA + equipment</p></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px',marginBottom:'0.875rem'}}>{[['Gross',fmt(sd.grossSales)],['Net',fmt(sd.netSales)],['Avg/mo',fmt(sd.avgMonthlySales)],['Annualised',fmt(sd.annualisedSales)]].map(it=><div key={it[0]} style={{background:'white',border:'1px solid var(--border)',borderRadius:'9px',padding:'0.6rem 0.8rem'}}><p style={{fontSize:'10px',color:'var(--text-muted)',marginBottom:'1px'}}>{it[0]}</p><p style={{fontSize:'16px',fontFamily:'serif',color:'var(--espresso)'}}>{it[1]}</p></div>)}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
              <div style={s.card}><h3 style={s.ct}>Profit and loss {xeroPL&&xeroPL.revenue>0&&<span style={{fontSize:'10px',fontWeight:400,color:'var(--success)'}}>via Xero ✓</span>}</h3>{[['Revenue',fmt(val.revenue),false,false],['COGS','−'+fmt(val.cogs),true,false],['Gross profit',fmt(val.grossProfit)+' ('+pct(val.grossMargin)+')',false,true],['Operating','−'+fmt(val.totalExpenses-val.cogs),true,false],['EBITDA',fmt(val.ebitda)+' ('+pct(val.ebitdaMargin)+')',false,true],['Add-backs','+ '+fmt(val.addBacks),false,false],['Adj. EBITDA',fmt(val.adjustedEbitda),false,true]].map((r,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid var(--border)',fontWeight:r[3]?600:400}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>{r[0]}</span><span style={{fontSize:'11px',color:r[2]?'var(--danger)':'inherit'}}>{r[1]}</span></div>)}{val.equipmentValue>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontWeight:600}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Equipment (owned)</span><span style={{fontSize:'11px',color:'var(--sage)'}}>+ {fmt(val.equipmentValue)}</span></div>}</div>
              {hs&&<div style={s.card}><h3 style={s.ct}>Business health</h3><div style={{textAlign:'center',padding:'0.4rem 0 0.875rem'}}><div style={{fontSize:'42px',fontFamily:'serif',color:hc,lineHeight:1}}>{hs.total}</div><div style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'1px'}}>out of 100</div><div style={{display:'inline-block',marginTop:'4px',padding:'2px 9px',borderRadius:'20px',background:hc+'20',color:hc,fontWeight:500,fontSize:'11px'}}>{hs.label}</div></div>{hs.breakdown?.map((it,i)=>{const bc=it.score/it.max>=0.7?'var(--success)':it.score/it.max>=0.4?'var(--warning)':'var(--danger)';return <div key={i} style={{marginBottom:'6px'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:'1px'}}><span style={{fontSize:'10px',color:'var(--text-secondary)'}}>{it.label}</span><span style={{fontSize:'10px',fontWeight:500}}>{it.score}/{it.max}</span></div><div style={{height:'3px',background:'var(--crema-pale)',borderRadius:'2px'}}><div style={{height:'100%',width:(it.score/it.max*100)+'%',background:bc,borderRadius:'2px'}}/></div></div>})}</div>}
            </div>
            {!xeroPL&&<div style={s.card}><h3 style={s.ct}>Adjust assumptions</h3><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'0.875rem'}}>{[['COGS %','Food, packaging',10,70,1,settings.cogsPercent,settings.cogsPercent+'%','cogsPercent'],['Operating %','Rent, wages',10,80,1,settings.opexPercent,settings.opexPercent+'%','opexPercent'],['Revenue x','0.3x–0.8x',0.1,2,0.05,settings.revenueMultiple,settings.revenueMultiple.toFixed(2)+'x','revenueMultiple'],['EBITDA x','2x–4x',0.5,8,0.25,settings.ebitdaMultiple,settings.ebitdaMultiple.toFixed(2)+'x','ebitdaMultiple']].map(r=><div key={r[7]}><div style={{display:'flex',justifyContent:'space-between',marginBottom:'2px'}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>{r[0]}</span><strong style={{fontSize:'11px',fontFamily:'serif'}}>{r[6]}</strong></div><input type="range" min={r[2]} max={r[3]} step={r[4]} value={r[5]} onChange={e=>ss(r[7],parseFloat(e.target.value))} style={{width:'100%'}}/><p style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'1px'}}>{r[1]}</p></div>)}</div></div>}
            {xeroPL&&xeroPL.revenue>0&&<div style={s.card}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}><h3 style={s.ct}>Revenue &amp; EBITDA multiples</h3><button onClick={()=>setTab('xero mapping')} style={{fontSize:'10px',padding:'2px 8px',borderRadius:'6px',background:'transparent',border:'1px solid var(--border)',cursor:'pointer',color:'var(--text-muted)'}}>Edit Xero mapping →</button></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'0.875rem'}}>{[['Revenue x','0.3x–0.8x',0.1,2,0.05,settings.revenueMultiple,settings.revenueMultiple.toFixed(2)+'x','revenueMultiple'],['EBITDA x','2x–4x',0.5,8,0.25,settings.ebitdaMultiple,settings.ebitdaMultiple.toFixed(2)+'x','ebitdaMultiple']].map(r=><div key={r[7]}><div style={{display:'flex',justifyContent:'space-between',marginBottom:'2px'}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>{r[0]}</span><strong style={{fontSize:'11px',fontFamily:'serif'}}>{r[6]}</strong></div><input type="range" min={r[2]} max={r[3]} step={r[4]} value={r[5]} onChange={e=>ss(r[7],parseFloat(e.target.value))} style={{width:'100%'}}/><p style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'1px'}}>{r[1]}</p></div>)}</div></div>}
          </>}
        </>}
        {tab==='equipment'&&<EquipmentTab cafeId={cafeId} equipment={eq} onRefresh={loadEq}/>}
        {tab==='adjustments'&&<AdjustmentsTab cafeId={cafeId} adjustments={adj} onRefresh={loadAdj} xeroLines={xeroLines} xeroConn={xeroConn}/>}
        {tab==='xero mapping'&&<XeroMappingTab cafeId={cafeId} onMappingSaved={handleMappingSaved}/>}
        {tab==='integrations'&&<div><h2 style={{fontSize:'18px',marginBottom:'0.875rem'}}>Integrations</h2>{[{id:'square',name:'Square',desc:'POS sales & orders',icon:'■',av:true,conn:sqConn,onConnect:connSq},{id:'xero',name:'Xero',desc:'Accounting & P&L',icon:'X',av:true,conn:xeroConn,onConnect:connXero,sub:xeroConn&&xeroName?'Connected to '+xeroName:null},{id:'qb',name:'QuickBooks',desc:'Accounting',icon:'◆',av:false},{id:'ls',name:'Lightspeed',desc:'POS',icon:'⚡',av:false}].map(it=><div key={it.id} style={{background:'white',border:'1px solid '+(it.conn?'var(--success)':'var(--border)'),borderRadius:'9px',padding:'0.875rem',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}><div style={{display:'flex',alignItems:'center',gap:'10px'}}><div style={{width:'34px',height:'34px',borderRadius:'8px',background:it.conn?'var(--success-light)':'var(--crema-pale)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:700,color:it.conn?'var(--success)':'var(--text-muted)'}}>{it.icon}</div><div><div style={{display:'flex',alignItems:'center',gap:'6px'}}><strong style={{fontSize:'13px'}}>{it.name}</strong>{it.conn&&<span style={{fontSize:'9px',padding:'1px 5px',borderRadius:'8px',background:'var(--success-light)',color:'var(--success)',fontWeight:600}}>Connected</span>}{!it.av&&!it.conn&&<span style={{fontSize:'9px',padding:'1px 5px',borderRadius:'8px',background:'var(--crema-pale)',color:'var(--text-muted)'}}>Coming soon</span>}</div><p style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'1px'}}>{it.sub||it.desc}</p></div></div><div style={{display:'flex',gap:'6px',alignItems:'center'}}>{it.conn&&it.id==='xero'&&<button onClick={()=>loadXero(settings.months)} disabled={xeroLoading} style={{fontSize:'11px',padding:'4px 10px',borderRadius:'6px',background:'transparent',border:'1px solid var(--border)',cursor:'pointer',color:'var(--text-secondary)'}}>{xeroLoading?'Loading…':'↻ Refresh P&L'}</button>}{it.av&&!it.conn&&<button onClick={it.onConnect} style={{fontSize:'11px',padding:'4px 10px',borderRadius:'6px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}}>Connect</button>}{it.conn&&<span style={{fontSize:'11px',color:'var(--success)'}}>✓ Active</span>}</div></div>)}</div>}
      </main>
    </div>
  </>)
}
const s={nav:{padding:'0.75rem 1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border)',background:'rgba(250,247,242,0.97)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:10},logo:{fontFamily:'serif',fontSize:'16px',color:'var(--espresso)'},btnSm:{fontSize:'11px',padding:'4px 10px',borderRadius:'7px',background:'white',color:'var(--text-secondary)',border:'1px solid var(--border)',cursor:'pointer'},card:{background:'white',border:'1px solid var(--border)',borderRadius:'12px',padding:'1rem'},ct:{fontSize:'13px',fontWeight:600,marginBottom:'0.75rem',color:'var(--espresso)'},vc:{background:'white',border:'1px solid var(--border)',borderRadius:'12px',padding:'1rem',textAlign:'center'},vt:{fontSize:'10px',textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-muted)',marginBottom:'5px'},va:{fontFamily:'serif',fontSize:'24px',color:'var(--espresso)',marginBottom:'2px'},vm:{fontSize:'10px',color:'var(--text-muted)'}}
