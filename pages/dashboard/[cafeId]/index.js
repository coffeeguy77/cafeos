import{useState,useEffect}from 'react'
import{useRouter}from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import{supabase}from '../../../lib/supabase'
import{calculateValuation}from '../../../lib/square'
import{calculateHealthScore,generateAlerts}from '../../../lib/health'
const TODAY='2026-04-18',SK='sb-edoucarmulyjeqiydjxd-auth-token'
const DEF={cogsPercent:35,opexPercent:44,revenueMultiple:0.5,ebitdaMultiple:2.5,months:12}
const fmt=v=>'$'+Math.round(Math.abs(v||0)).toLocaleString('en-AU')
const pct=v=>(v||0).toFixed(1)+'%'
const getToken=()=>{try{return JSON.parse(localStorage.getItem(SK)||'{}').access_token||null}catch(e){return null}}
function itemValue(i){const m=i.valuation_mode||'depreciated';if(i.ownership==='roastery'||i.ownership==='leased')return 0;if(m==='secondhand')return parseFloat(i.secondhand_value||0);if(m==='replacement'){const cp=i.condition==='excellent'?0.85:i.condition==='good'?0.65:i.condition==='fair'?0.4:0.2;return parseFloat(i.replacement_cost||0)*cp}if(m==='manual')return parseFloat(i.manual_value||0);if(!i.purchase_price||!i.purchase_date)return 0;const y=(new Date()-new Date(i.purchase_date))/(365.25*24*3600*1000);return parseFloat(i.purchase_price)*Math.max(0,1-y/(i.depreciation_years||5))}
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
      <div><label style={LB}>Purchased</label><input type="date" style={II} max="2026-04-18" value={f.purchase_date||''} onChange={e=>set('purchase_date',e.target.value)}/></div>
      <div><label style={LB}>Price paid $</label><input type="number" min="0" style={II} value={f.purchase_price||''} onChange={e=>set('purchase_price',e.target.value)} placeholder="3800"/></div>
      <div><label style={LB}>Depr. yrs</label><select style={SI} value={f.depreciation_years||5} onChange={e=>set('depreciation_years',parseInt(e.target.value))}>{[3,5,7,10,15,20].map(y=><option key={y} value={y}>{y}yr</option>)}</select></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'8px'}}>
      <div><label style={{...LB,marginBottom:'5px'}}>Ownership</label>
        <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
          <Pill label="Cafe owned" active={f.ownership==='cafe'} color="var(--success)" onClick={()=>set('ownership','cafe')}/>
          <Pill label="Roastery" active={f.ownership==='roastery'} color="var(--warning)" onClick={()=>set('ownership','roastery')}/>
          <Pill label="Leased" active={f.ownership==='leased'} color="var(--text-muted)" onClick={()=>set('ownership','leased')}/>
        </div>
        {f.ownership!=='cafe'&&<p style={{fontSize:'11px',color:'var(--warning)',marginTop:'3px'}}>⚠ Excluded from sale value</p>}
      </div>
      <div><label style={{...LB,marginBottom:'5px'}}>Valuation method</label>
        <div style={{display:'flex',gap:'4px',flexWrap:'wrap'}}>
          <Pill label="Depreciated" active={mode==='depreciated'} color="var(--espresso)" onClick={()=>set('valuation_mode','depreciated')}/>
          <Pill label="Secondhand" active={mode==='secondhand'} color="var(--espresso)" onClick={()=>set('valuation_mode','secondhand')}/>
          <Pill label="Replacement" active={mode==='replacement'} color="var(--espresso)" onClick={()=>set('valuation_mode','replacement')}/>
          <Pill label="Manual" active={mode==='manual'} color="var(--espresso)" onClick={()=>set('valuation_mode','manual')}/>
        </div>
      </div>
    </div>
    {mode==='depreciated'&&depc!==null&&<div style={{background:'var(--crema-pale)',borderRadius:'6px',padding:'5px 9px',marginBottom:'8px',fontSize:'12px',color:'var(--espresso)'}}>Depreciated value: <strong>{fmt(depc)}</strong></div>}
    {mode==='secondhand'&&<div style={{marginBottom:'8px'}}><label style={LB}>Secondhand sale value today $</label><input type="number" min="0" style={{...II,width:'50%'}} value={f.secondhand_value||''} onChange={e=>set('secondhand_value',e.target.value)} placeholder="e.g. 1800"/></div>}
    {mode==='replacement'&&<div style={{marginBottom:'8px',display:'flex',gap:'8px',alignItems:'center'}}><div style={{flex:1}}><label style={LB}>New replacement cost today $</label><input type="number" min="0" style={II} value={f.replacement_cost||''} onChange={e=>set('replacement_cost',e.target.value)} placeholder="e.g. 4200"/></div>{repc!==null&&f.replacement_cost&&<div style={{background:'var(--crema-pale)',borderRadius:'6px',padding:'5px 9px',fontSize:'12px',color:'var(--espresso)',whiteSpace:'nowrap'}}>= <strong>{fmt(repc)}</strong> at {cpct}%</div>}</div>}
    {mode==='manual'&&<div style={{marginBottom:'8px'}}><label style={LB}>Manual current value $</label><input type="number" min="0" style={{...II,width:'50%'}} value={f.manual_value||''} onChange={e=>set('manual_value',e.target.value)} placeholder="e.g. 2000"/></div>}
    <div style={{marginBottom:'10px'}}><label style={LB}>Notes</label><input style={II} value={f.notes||''} onChange={e=>set('notes',e.target.value)} placeholder="e.g. Roastery-owned, stays with supply agreement"/></div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div style={{display:'flex',gap:'6px'}}>
        <button type="button" disabled={saving||!f.name} onClick={()=>onSave(f)} style={{fontSize:'12px',padding:'5px 14px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer',opacity:(saving||!f.name)?0.6:1}}>{saving?'Saving…':'Save'}</button>
        <button type="button" onClick={onCancel} style={{fontSize:'12px',padding:'5px 10px',borderRadius:'7px',background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border)',cursor:'pointer'}}>Cancel</button>
      </div>
      {isEdit&&onDelete&&<button type="button" onClick={onDelete} style={{fontSize:'12px',padding:'5px 10px',borderRadius:'7px',color:'var(--danger)',border:'1px solid var(--danger)',background:'transparent',cursor:'pointer'}}>Delete item</button>}
    </div>
  </div>)
}
function EquipmentTab({cafeId,equipment,onRefresh}){
  const[showAdd,setShowAdd]=useState(false),[editId,setEditId]=useState(null),[saving,setSaving]=useState(false),[err,setErr]=useState('')
  const owned=equipment.filter(i=>i.ownership!=='roastery'&&i.ownership!=='leased'),excl=equipment.filter(i=>i.ownership==='roastery'||i.ownership==='leased'),total=owned.reduce((s,i)=>s+itemValue(i),0)
  async function saveNew(form){setSaving(true);setErr('');const res=await fetch('/api/cafes/'+cafeId+'/equipment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(form)});const d=await res.json();if(!res.ok){setErr(d.error||'Save failed');setSaving(false);return};await onRefresh();setShowAdd(false);setSaving(false)}
  async function saveEdit(form){setSaving(true);setErr('');const res=await fetch('/api/cafes/'+cafeId+'/equipment',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(form)});const d=await res.json();if(!res.ok){setErr(d.error||'Save failed');setSaving(false);return};await onRefresh();setEditId(null);setSaving(false)}
  async function dup(item){const{id,created_at,updated_at,...rest}=item;const res=await fetch('/api/cafes/'+cafeId+'/equipment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({...rest,name:rest.name+' (copy)'})});if(res.ok)await onRefresh()}
  async function del(id){await fetch('/api/cafes/'+cafeId+'/equipment',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({id})});setEditId(null);await onRefresh()}
  const OB=item=>{if(item.ownership==='roastery')return <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:'#fff3cd',color:'#856404',fontWeight:500}}>Roastery</span>;if(item.ownership==='leased')return <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:'var(--crema-pale)',color:'var(--text-muted)',fontWeight:500}}>Leased</span>;return null}
  const MB=item=>{const l={depreciated:'Dep',secondhand:'SH',replacement:'Repl',manual:'Manual'};return <span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:'var(--crema-pale)',color:'var(--text-muted)'}}>{l[item.valuation_mode||'depreciated']}</span>}
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
      <div><h2 style={{fontSize:'19px',marginBottom:'2px'}}>Equipment ledger</h2><p style={{color:'var(--text-secondary)',fontSize:'13px'}}>Sale value: <strong style={{color:'var(--sage)'}}>{fmt(total)}</strong>{excl.length>0&&<span style={{color:'var(--text-muted)',fontWeight:400}}> · {excl.length} excluded</span>}</p></div>
      <button onClick={()=>{setShowAdd(true);setEditId(null);setErr('')}} style={{fontSize:'12px',padding:'5px 12px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}}>+ Add item</button>
    </div>
    {showAdd&&<ItemForm initial={null} onSave={saveNew} onCancel={()=>{setShowAdd(false);setErr('')}} saving={saving} err={err} isEdit={false}/>}
    {equipment.length===0&&!showAdd&&<div style={{textAlign:'center',padding:'2.5rem',background:'white',borderRadius:'12px',border:'1px solid var(--border)'}}><div style={{fontSize:'32px',marginBottom:'8px'}}>🔧</div><p style={{color:'var(--text-secondary)',fontSize:'13px'}}>No equipment yet.</p></div>}
    {equipment.length>0&&<div style={{display:'grid',gap:'5px'}}>{equipment.map(item=><div key={item.id}>{editId===item.id?<ItemForm initial={item} onSave={saveEdit} onCancel={()=>{setEditId(null);setErr('')}} onDelete={()=>del(item.id)} saving={saving} err={err} isEdit={true}/>:<div style={{background:'white',border:'1px solid var(--border)',borderRadius:'9px',padding:'0.65rem 0.875rem',display:'flex',justifyContent:'space-between',alignItems:'center',opacity:item.ownership==='roastery'||item.ownership==='leased'?0.7:1}}><div style={{flex:1,minWidth:0}}><div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'1px',flexWrap:'wrap'}}><strong style={{fontSize:'13px'}}>{item.name}</strong>{item.brand&&<span style={{fontSize:'11px',color:'var(--text-muted)'}}>{item.brand}</span>}{OB(item)}{MB(item)}</div><div style={{fontSize:'11px',color:'var(--text-muted)'}}>{item.purchase_price&&fmt(item.purchase_price)+' new'}{item.purchase_date&&' · '+new Date(item.purchase_date).getFullYear()}{item.notes&&' · '+item.notes.substring(0,45)+(item.notes.length>45?'…':'')}</div></div><div style={{display:'flex',alignItems:'center',gap:'6px',marginLeft:'8px',flexShrink:0}}>{item.ownership==='roastery'||item.ownership==='leased'?<span style={{fontSize:'11px',color:'var(--text-muted)',fontStyle:'italic'}}>not included</span>:<div style={{textAlign:'right'}}><div style={{fontSize:'14px',fontWeight:600,fontFamily:'serif'}}>{fmt(itemValue(item))}</div><div style={{fontSize:'10px',color:'var(--text-muted)'}}>sale value</div></div>}<button title="Duplicate" onClick={()=>dup(item)} style={{background:'none',border:'1px solid var(--border)',borderRadius:'5px',padding:'2px 6px',cursor:'pointer',fontSize:'12px',color:'var(--text-muted)',lineHeight:1}}>⧉</button><button title="Edit" onClick={()=>{setEditId(item.id);setShowAdd(false);setErr('')}} style={{background:'none',border:'1px solid var(--border)',borderRadius:'5px',padding:'2px 6px',cursor:'pointer',fontSize:'12px',color:'var(--text-secondary)',lineHeight:1}}>✎</button></div></div>}</div>)}</div>}
  </div>)
}
function AdjustmentsTab({cafeId,adjustments,onRefresh}){
  const[showForm,setShowForm]=useState(false),[form,setForm]=useState({type:'add_back',label:'',description:'',annual_amount:''}),[saving,setSaving]=useState(false)
  const ab=adjustments.filter(a=>a.type==='add_back').reduce((s,a)=>s+Number(a.annual_amount),0),rm=adjustments.filter(a=>a.type==='remove').reduce((s,a)=>s+Number(a.annual_amount),0)
  async function save(e){e.preventDefault();setSaving(true);await fetch('/api/cafes/'+cafeId+'/adjustments',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify(form)});await onRefresh();setShowForm(false);setSaving(false);setForm({type:'add_back',label:'',description:'',annual_amount:''})}
  async function del(id){await fetch('/api/cafes/'+cafeId+'/adjustments',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:'Bearer '+getToken()},body:JSON.stringify({id})});onRefresh()}
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}><div><h2 style={{fontSize:'19px',marginBottom:'2px'}}>Owner adjustments</h2><p style={{color:'var(--text-secondary)',fontSize:'13px'}}>Normalise EBITDA for true earnings</p></div><button onClick={()=>setShowForm(true)} style={{fontSize:'12px',padding:'5px 12px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}}>+ Add</button></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'1rem'}}><div style={{background:'var(--success-light)',borderRadius:'9px',padding:'0.65rem 0.875rem'}}><p style={{fontSize:'10px',color:'var(--success)',fontWeight:600,marginBottom:'2px',textTransform:'uppercase'}}>Add-backs</p><p style={{fontSize:'18px',fontFamily:'serif',color:'var(--success)'}}>+{fmt(ab)}</p></div><div style={{background:'var(--danger-light)',borderRadius:'9px',padding:'0.65rem 0.875rem'}}><p style={{fontSize:'10px',color:'var(--danger)',fontWeight:600,marginBottom:'2px',textTransform:'uppercase'}}>Removals</p><p style={{fontSize:'18px',fontFamily:'serif',color:'var(--danger)'}}>-{fmt(rm)}</p></div></div>
    {showForm&&<div style={{background:'white',border:'1px solid var(--crema)',borderRadius:'10px',padding:'1rem',marginBottom:'8px'}}><form onSubmit={save}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}><div><label style={LB}>Type</label><select style={SI} value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="add_back">Add-back (increases EBITDA)</option><option value="remove">Remove (decreases EBITDA)</option></select></div><div><label style={LB}>Label *</label><input style={II} value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="Owner salary" required/></div><div style={{gridColumn:'1/-1'}}><label style={LB}>Description</label><input style={II} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Personal car lease in expenses"/></div><div><label style={LB}>Annual amount AUD *</label><input type="number" min="0" style={II} value={form.annual_amount} onChange={e=>setForm(f=>({...f,annual_amount:e.target.value}))} placeholder="24000" required/></div></div><div style={{display:'flex',gap:'6px'}}><button type="submit" disabled={saving} style={{fontSize:'12px',padding:'5px 14px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}}>{saving?'Saving…':'Save'}</button><button type="button" onClick={()=>setShowForm(false)} style={{fontSize:'12px',padding:'5px 10px',borderRadius:'7px',background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border)',cursor:'pointer'}}>Cancel</button></div></form></div>}
    {adjustments.length===0?<div style={{textAlign:'center',padding:'2.5rem',background:'white',borderRadius:'12px',border:'1px solid var(--border)'}}><div style={{fontSize:'32px',marginBottom:'8px'}}>💼</div><p style={{color:'var(--text-secondary)',fontSize:'13px'}}>No adjustments yet.</p></div>:<div style={{display:'grid',gap:'5px'}}>{adjustments.map(a=><div key={a.id} style={{background:'white',border:'1px solid var(--border)',borderRadius:'9px',padding:'0.65rem 0.875rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'1px'}}><strong style={{fontSize:'13px'}}>{a.label}</strong><span style={{fontSize:'10px',padding:'1px 6px',borderRadius:'10px',background:a.type==='add_back'?'var(--success-light)':'var(--danger-light)',color:a.type==='add_back'?'var(--success)':'var(--danger)',fontWeight:500}}>{a.type==='add_back'?'Add-back':'Remove'}</span></div>{a.description&&<p style={{fontSize:'11px',color:'var(--text-muted)'}}>{a.description}</p>}</div><div style={{display:'flex',alignItems:'center',gap:'8px'}}><span style={{fontSize:'13px',fontWeight:600,fontFamily:'serif',color:a.type==='add_back'?'var(--success)':'var(--danger)'}}>{a.type==='add_back'?'+':'-'}{fmt(Number(a.annual_amount))}/yr</span><button onClick={()=>del(a.id)} style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',fontSize:'15px',padding:'0 2px'}}>✕</button></div></div>)}</div>}
  </div>)
}
export default function CafeDashboard(){
  const router=useRouter(),{cafeId}=router.query
  const[cafe,setCafe]=useState(null),[sc,setSc]=useState({}),[sd,setSd]=useState(null),[eq,setEq]=useState([]),[adj,setAdj]=useState([])
  const[settings,setSettings]=useState(DEF),[val,setVal]=useState(null),[hs,setHs]=useState(null),[alerts,setAlerts]=useState([])
  const[loading,setLoading]=useState(true),[syncing,setSyncing]=useState(false),[tab,setTab]=useState('overview'),[sqConn,setSqConn]=useState(false)
  const[xeroConn,setXeroConn]=useState(false),[xeroName,setXeroName]=useState(null),[xeroPL,setXeroPL]=useState(null),[xeroLoading,setXeroLoading]=useState(false)
  useEffect(()=>{if(cafeId)init()},[cafeId])
  useEffect(()=>{const p=new URLSearchParams(window.location.search);if(p.get('xero_connected')){setTab('integrations');window.history.replaceState({},'',window.location.pathname)}},[])
  async function init(){
    const{data:{user}}=await supabase.auth.getUser()
    if(!user){router.push('/login');return}
    const{data}=await supabase.from('cafes').select('*,integrations(*)').eq('id',cafeId).eq('owner_id',user.id).single()
    if(!data){router.push('/dashboard');return}
    setCafe(data)
    const sq=data.integrations?.find(i=>i.type==='square'),xr=data.integrations?.find(i=>i.type==='xero')
    const sqC=sq?.status==='connected',xrC=xr?.status==='connected'
    setSqConn(sqC);setXeroConn(xrC)
    if(xrC) setXeroName(xr.metadata?.tenant_name||'Xero')
    await Promise.all([loadEq(),loadAdj()])
    if(sqC) await loadSales(12)
    if(xrC) loadXero(12)
    setLoading(false)
  }
  async function loadSales(m2){const m=m2||settings.months;if(sc[m]){setSd(sc[m]);return};setSyncing(true);const res=await fetch('/api/square/sales?cafeId='+cafeId+'&months='+m,{headers:{Authorization:'Bearer '+getToken()}});if(res.ok){const d=await res.json();setSc(p=>({...p,[m]:d.salesData}));setSd(d.salesData)};setSyncing(false)}
  async function loadEq(){const res=await fetch('/api/cafes/'+cafeId+'/equipment',{headers:{Authorization:'Bearer '+getToken()}});if(res.ok){const d=await res.json();setEq(d.equipment||[])}}
  async function loadAdj(){const res=await fetch('/api/cafes/'+cafeId+'/adjustments',{headers:{Authorization:'Bearer '+getToken()}});if(res.ok){const d=await res.json();setAdj(d.adjustments||[])}}
  async function loadXero(months){
    setXeroLoading(true)
    const res=await fetch('/api/xero/reports?cafeId='+cafeId+'&months='+(months||settings.months),{headers:{Authorization:'Bearer '+getToken()}})
    if(res.ok){const d=await res.json();setXeroPL(d.pl);if(d.tenantName)setXeroName(d.tenantName)}
    setXeroLoading(false)
  }
  useEffect(()=>{
    if(!sd) return
    const revenue=sd.annualisedSales
    let cogsAmt=revenue*(settings.cogsPercent/100),opexAmt=revenue*(settings.opexPercent/100)
    if(xeroPL){cogsAmt=xeroPL.cogs*(12/xeroPL.months);opexAmt=xeroPL.totalExpenses*(12/xeroPL.months)}
    const expenses=[{normalised_type:'cogs',amount:cogsAmt,is_excluded:false},{normalised_type:'opex',amount:opexAmt,is_excluded:false}]
    const v=calculateValuation(sd,expenses,eq,adj,settings)
    setVal(v);setHs(calculateHealthScore(sd,v,[]));setAlerts(generateAlerts(sd,v))
  },[sd,eq,adj,settings,xeroPL])
  const ss=(k,v)=>setSettings(p=>({...p,[k]:v}))
  async function cp(m){ss('months',m);if(sc[m]){setSd(sc[m]);return};await loadSales(m)}
  async function forceSync(){setSc({});setSd(null);await loadSales(settings.months)}
  async function connSq(){const r=await fetch('/api/square/auth?cafeId='+cafeId);const{url}=await r.json();window.location.href=url}
  async function connXero(){const r=await fetch('/api/xero/auth?cafeId='+cafeId,{headers:{Authorization:'Bearer '+getToken()}});const{url}=await r.json();window.location.href=url}
  const hc=!hs?'#999':hs.total>=70?'var(--success)':hs.total>=40?'var(--warning)':'var(--danger)'
  if(loading)return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--milk)'}}><p style={{fontFamily:'serif',fontSize:'18px',color:'var(--text-secondary)'}}>Brewing your data…</p></div>
  return(<>
    <Head><title>{cafe?.name} — Caféos</title></Head>
    <div style={{minHeight:'100vh',background:'var(--milk)'}}>
      <nav style={s.nav}>
        <div style={{display:'flex',alignItems:'center',gap:'14px'}}><Link href="/dashboard" style={{color:'var(--text-muted)',fontSize:'13px',textDecoration:'none'}}>← All cafés</Link><span style={s.logo}>☕ {cafe?.name}</span></div>
        <div style={{display:'flex',alignItems:'center',gap:'7px'}}>
          {hs&&<div style={{display:'flex',alignItems:'center',gap:'4px',padding:'3px 10px',background:'white',borderRadius:'20px',border:'1px solid var(--border)'}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Health</span><span style={{fontSize:'11px',fontWeight:600,color:hc}}>{hs.total}/100 {hs.grade}</span></div>}
          {sqConn?<button style={s.btnSm} onClick={forceSync} disabled={syncing}>{syncing?'Syncing…':'↻ Sync'}</button>:<button style={{...s.btnSm,background:'var(--espresso)',color:'var(--crema-light)',border:'none'}} onClick={connSq}>Connect Square</button>}
        </div>
      </nav>
      <main style={{maxWidth:'920px',margin:'0 auto',padding:'1.25rem 1.5rem 4rem'}}>
        {alerts.map((a,i)=><div key={i} style={{display:'flex',gap:'8px',padding:'8px 12px',borderRadius:'8px',border:'1px solid',marginBottom:'5px',fontSize:'12px',background:a.severity==='positive'?'var(--success-light)':a.severity==='critical'?'var(--danger-light)':'var(--warning-light)',borderColor:a.severity==='positive'?'var(--success)':a.severity==='critical'?'var(--danger)':'var(--warning)'}}><span>{a.severity==='positive'?'📈':a.severity==='critical'?'🚨':'⚠️'}</span><div><strong>{a.title}</strong><span style={{color:'var(--text-secondary)',marginLeft:'5px'}}>{a.message}</span></div></div>)}
        <div style={{display:'flex',gap:'3px',marginBottom:'1.125rem',background:'white',borderRadius:'9px',padding:'3px',border:'1px solid var(--border)'}}>{['overview','equipment','adjustments','integrations'].map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'6px 4px',borderRadius:'6px',border:'none',fontSize:'12px',cursor:'pointer',background:tab===t?'var(--espresso)':'transparent',color:tab===t?'var(--crema-light)':'var(--text-secondary)',fontWeight:tab===t?500:400}}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}</div>
        {tab==='overview'&&!sqConn&&<div style={{textAlign:'center',padding:'3rem 2rem',background:'white',borderRadius:'14px',border:'1px solid var(--border)'}}><div style={{fontSize:'36px',marginBottom:'0.75rem'}}>🔗</div><h2 style={{marginBottom:'6px',fontSize:'19px'}}>Connect Square POS</h2><p style={{color:'var(--text-secondary)',marginBottom:'1rem',fontSize:'13px'}}>Pull real sales data for an accurate valuation.</p><button style={{fontSize:'12px',padding:'6px 18px',borderRadius:'7px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}} onClick={connSq}>Connect with Square</button></div>}
        {tab==='overview'&&sqConn&&<>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.875rem'}}>
            <p style={{fontSize:'12px',color:'var(--text-muted)'}}>{syncing?'Syncing…':sd?(sd.orderCount||0).toLocaleString()+' orders':'Click ↻ Sync'}</p>
            <div style={{display:'flex',gap:'3px'}}>{[3,6,12].map(m=><button key={m} onClick={()=>cp(m)} disabled={syncing} style={{fontSize:'11px',padding:'3px 9px',borderRadius:'20px',cursor:'pointer',background:settings.months===m?'var(--espresso)':'transparent',border:'1px solid '+(settings.months===m?'var(--espresso)':'var(--border-strong)'),color:settings.months===m?'var(--crema-light)':'var(--text-secondary)'}}>{m}m</button>)}</div>
          </div>
          {val&&sd&&<>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'7px',marginBottom:'0.875rem'}}>
              <div style={s.vc}><p style={s.vt}>Conservative</p><p style={s.va}>{fmt(val.valByRevenue)}</p><p style={s.vm}>Revenue x {settings.revenueMultiple.toFixed(2)}</p></div>
              <div style={{...s.vc,border:'2px solid var(--crema)',background:'#fffaf5'}}><p style={{...s.vt,color:'var(--crema)'}}>Midpoint estimate</p><p style={{...s.va,fontSize:'26px'}}>{fmt(val.valMid)}</p><p style={s.vm}>Blended average</p></div>
              <div style={s.vc}><p style={s.vt}>With assets</p><p style={s.va}>{fmt(val.valByAsset)}</p><p style={s.vm}>EBITDA + equipment</p></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'6px',marginBottom:'0.875rem'}}>{[['Gross',fmt(sd.grossSales)],['Net',fmt(sd.netSales)],['Avg/mo',fmt(sd.avgMonthlySales)],['Annualised',fmt(sd.annualisedSales)]].map(it=><div key={it[0]} style={{background:'white',border:'1px solid var(--border)',borderRadius:'9px',padding:'0.6rem 0.8rem'}}><p style={{fontSize:'10px',color:'var(--text-muted)',marginBottom:'1px'}}>{it[0]}</p><p style={{fontSize:'16px',fontFamily:'serif',color:'var(--espresso)'}}>{it[1]}</p></div>)}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
              <div style={s.card}>
                <h3 style={s.ct}>Profit and loss {xeroPL&&<span style={{fontSize:'10px',fontWeight:400,color:'var(--success)'}}>via Xero ✓</span>}</h3>
                {[['Revenue',fmt(val.revenue),false,false],['COGS','−'+fmt(val.cogs),true,false],['Gross profit',fmt(val.grossProfit)+' ('+pct(val.grossMargin)+')',false,true],['Operating','−'+fmt(val.totalExpenses-val.cogs),true,false],['EBITDA',fmt(val.ebitda)+' ('+pct(val.ebitdaMargin)+')',false,true],['Add-backs','+ '+fmt(val.addBacks),false,false],['Adj. EBITDA',fmt(val.adjustedEbitda),false,true]].map((r2,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid var(--border)',fontWeight:r2[3]?600:400}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>{r2[0]}</span><span style={{fontSize:'11px',color:r2[2]?'var(--danger)':'inherit'}}>{r2[1]}</span></div>)}
                {val.equipmentValue>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'3px 0',fontWeight:600}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>Equipment (owned)</span><span style={{fontSize:'11px',color:'var(--sage)'}}>+ {fmt(val.equipmentValue)}</span></div>}
              </div>
              {hs&&<div style={s.card}><h3 style={s.ct}>Business health</h3><div style={{textAlign:'center',padding:'0.4rem 0 0.875rem'}}><div style={{fontSize:'42px',fontFamily:'serif',color:hc,lineHeight:1}}>{hs.total}</div><div style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'1px'}}>out of 100</div><div style={{display:'inline-block',marginTop:'4px',padding:'2px 9px',borderRadius:'20px',background:hc+'20',color:hc,fontWeight:500,fontSize:'11px'}}>{hs.label}</div></div>{hs.breakdown?.map((it,i)=>{const bc=it.score/it.max>=0.7?'var(--success)':it.score/it.max>=0.4?'var(--warning)':'var(--danger)';return <div key={i} style={{marginBottom:'6px'}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:'1px'}}><span style={{fontSize:'10px',color:'var(--text-secondary)'}}>{it.label}</span><span style={{fontSize:'10px',fontWeight:500}}>{it.score}/{it.max}</span></div><div style={{height:'3px',background:'var(--crema-pale)',borderRadius:'2px'}}><div style={{height:'100%',width:(it.score/it.max*100)+'%',background:bc,borderRadius:'2px'}}/></div></div>})}</div>}
            </div>
            {!xeroPL&&<div style={s.card}>
              <h3 style={s.ct}>Adjust assumptions <span style={{fontSize:'10px',fontWeight:400,color:'var(--text-muted)'}}>updates instantly</span></h3>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'0.875rem'}}>{[['COGS %','Food, packaging',10,70,1,settings.cogsPercent,settings.cogsPercent+'%','cogsPercent'],['Operating %','Rent, wages',10,80,1,settings.opexPercent,settings.opexPercent+'%','opexPercent'],['Revenue x','0.3x–0.8x',0.1,2,0.05,settings.revenueMultiple,settings.revenueMultiple.toFixed(2)+'x','revenueMultiple'],['EBITDA x','2x–4x',0.5,8,0.25,settings.ebitdaMultiple,settings.ebitdaMultiple.toFixed(2)+'x','ebitdaMultiple']].map(r2=><div key={r2[7]}><div style={{display:'flex',justifyContent:'space-between',marginBottom:'2px'}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>{r2[0]}</span><strong style={{fontSize:'11px',fontFamily:'serif'}}>{r2[6]}</strong></div><input type="range" min={r2[2]} max={r2[3]} step={r2[4]} value={r2[5]} onChange={e=>ss(r2[7],parseFloat(e.target.value))} style={{width:'100%'}}/><p style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'1px'}}>{r2[1]}</p></div>)}</div>
            </div>}
            {xeroPL&&<div style={s.card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                <h3 style={s.ct}>Xero expenses <span style={{fontSize:'10px',fontWeight:400,color:'var(--text-muted)'}}>{xeroPL.months}mo actual data</span></h3>
                <button onClick={()=>loadXero(settings.months)} disabled={xeroLoading} style={{fontSize:'10px',padding:'2px 8px',borderRadius:'6px',background:'transparent',border:'1px solid var(--border)',cursor:'pointer',color:'var(--text-muted)'}}>{xeroLoading?'Loading…':'↻ Refresh'}</button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'6px',marginBottom:'10px'}}>
                {[['COGS (annualised)',fmt(xeroPL.cogs*(12/xeroPL.months)),pct(xeroPL.cogsPct)],['Operating (annualised)',fmt(xeroPL.totalExpenses*(12/xeroPL.months)),pct(xeroPL.expensePct)],['Gross margin','',pct(xeroPL.grossMarginPct)]].map(it=><div key={it[0]} style={{background:'var(--crema-pale)',borderRadius:'8px',padding:'0.5rem 0.75rem'}}><p style={{fontSize:'10px',color:'var(--text-muted)',marginBottom:'2px'}}>{it[0]}</p><p style={{fontSize:'14px',fontWeight:600,fontFamily:'serif'}}>{it[1]||it[2]}</p>{it[1]&&<p style={{fontSize:'10px',color:'var(--text-muted)'}}>{it[2]} of revenue</p>}</div>)}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'0.875rem'}}>
                {[['Revenue x','0.3x–0.8x',0.1,2,0.05,settings.revenueMultiple,settings.revenueMultiple.toFixed(2)+'x','revenueMultiple'],['EBITDA x','2x–4x',0.5,8,0.25,settings.ebitdaMultiple,settings.ebitdaMultiple.toFixed(2)+'x','ebitdaMultiple']].map(r2=><div key={r2[7]}><div style={{display:'flex',justifyContent:'space-between',marginBottom:'2px'}}><span style={{fontSize:'11px',color:'var(--text-secondary)'}}>{r2[0]}</span><strong style={{fontSize:'11px',fontFamily:'serif'}}>{r2[6]}</strong></div><input type="range" min={r2[2]} max={r2[3]} step={r2[4]} value={r2[5]} onChange={e=>ss(r2[7],parseFloat(e.target.value))} style={{width:'100%'}}/><p style={{fontSize:'10px',color:'var(--text-muted)',marginTop:'1px'}}>{r2[1]}</p></div>)}
              </div>
            </div>}
          </>}
        </>}
        {tab==='equipment'&&<EquipmentTab cafeId={cafeId} equipment={eq} onRefresh={loadEq}/>}
        {tab==='adjustments'&&<AdjustmentsTab cafeId={cafeId} adjustments={adj} onRefresh={loadAdj}/>}
        {tab==='integrations'&&<div>
          <h2 style={{fontSize:'18px',marginBottom:'0.875rem'}}>Integrations</h2>
          {[
            {id:'square',name:'Square',desc:'POS sales & orders',icon:'■',available:true,connected:sqConn,onConnect:connSq},
            {id:'xero',name:'Xero',desc:'Accounting, real expenses & P&L',icon:'X',available:true,connected:xeroConn,onConnect:connXero,subtext:xeroConn&&xeroName?'Connected to '+xeroName:null},
            {id:'quickbooks',name:'QuickBooks',desc:'Accounting',icon:'◆',available:false},
            {id:'lightspeed',name:'Lightspeed',desc:'POS',icon:'⚡',available:false}
          ].map(it=><div key={it.id} style={{background:'white',border:'1px solid '+(it.connected?'var(--success)':'var(--border)'),borderRadius:'9px',padding:'0.875rem',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{width:'34px',height:'34px',borderRadius:'8px',background:it.connected?'var(--success-light)':'var(--crema-pale)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:700,color:it.connected?'var(--success)':'var(--text-muted)'}}>{it.icon}</div>
              <div>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}><strong style={{fontSize:'13px'}}>{it.name}</strong>{it.connected&&<span style={{fontSize:'9px',padding:'1px 5px',borderRadius:'8px',background:'var(--success-light)',color:'var(--success)',fontWeight:600}}>Connected</span>}{!it.available&&!it.connected&&<span style={{fontSize:'9px',padding:'1px 5px',borderRadius:'8px',background:'var(--crema-pale)',color:'var(--text-muted)'}}>Coming soon</span>}</div>
                <p style={{fontSize:'11px',color:'var(--text-muted)',marginTop:'1px'}}>{it.subtext||it.desc}</p>
              </div>
            </div>
            <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
              {it.connected&&it.id==='xero'&&<button onClick={()=>loadXero(settings.months)} disabled={xeroLoading} style={{fontSize:'11px',padding:'4px 10px',borderRadius:'6px',background:'transparent',border:'1px solid var(--border)',cursor:'pointer',color:'var(--text-secondary)'}}>{xeroLoading?'Loading…':'↻ Refresh P&L'}</button>}
              {it.available&&!it.connected&&<button onClick={it.onConnect} style={{fontSize:'11px',padding:'4px 10px',borderRadius:'6px',background:'var(--espresso)',color:'var(--crema-light)',border:'none',cursor:'pointer'}}>Connect</button>}
              {it.connected&&<span style={{fontSize:'11px',color:'var(--success)'}}>✓ Active</span>}
            </div>
          </div>)}
        </div>}
      </main>
    </div>
  </>)
}
const s={nav:{padding:'0.75rem 1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid var(--border)',background:'rgba(250,247,242,0.97)',backdropFilter:'blur(8px)',position:'sticky',top:0,zIndex:10},logo:{fontFamily:'serif',fontSize:'16px',color:'var(--espresso)'},btnSm:{fontSize:'11px',padding:'4px 10px',borderRadius:'7px',background:'white',color:'var(--text-secondary)',border:'1px solid var(--border)',cursor:'pointer'},card:{background:'white',border:'1px solid var(--border)',borderRadius:'12px',padding:'1rem'},ct:{fontSize:'13px',fontWeight:600,marginBottom:'0.75rem',color:'var(--espresso)'},vc:{background:'white',border:'1px solid var(--border)',borderRadius:'12px',padding:'1rem',textAlign:'center'},vt:{fontSize:'10px',textTransform:'uppercase',letterSpacing:'.06em',color:'var(--text-muted)',marginBottom:'5px'},va:{fontFamily:'serif',fontSize:'24px',color:'var(--espresso)',marginBottom:'2px'},vm:{fontSize:'10px',color:'var(--text-muted)'}}
