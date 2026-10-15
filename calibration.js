/* calibration.js — เมนูประวัติการสอบเทียบเครื่องมือ Portable (rev2 15/10/69 · รายเดือน)
   ใช้ fbGet/fbSet/eqFbDel จาก equipment.js (โหลดก่อนไฟล์นี้)
   โครงข้อมูล (ใต้ equipment_meta เพื่อใช้ rules เดิม):
   equipment_meta/calib/devices/{id}   = {name,brand,model,note,active,ref,order}
   equipment_meta/calib/rounds/{YYYY-MM} = {date,title,ref,
        devs:[{id,name,brand,model,tester,tdate}],
        params:[{key,name,unit,stds:[{label,tv,tol,mode:'abs'|'pct',lot,exp,r:{devId:val}}]}],   ← ① เทียบสารมาตรฐาน
        cmp:[{name,date,time,p,v:{devId:val}}],                                                  ← ② เทียบเครื่อง กปน. กับ PICO
        by,ts}
   equipment_meta/calib/settings = {intervalM:1,cmpPct:10,expWarnD:60}
   ① %Error = (ค่าที่อ่าน − ค่าจริง)/ค่าจริง×100 · ผ่านเมื่อ |ค่าที่อ่าน − ค่าจริง| ≤ เกณฑ์ (รวมขอบ)
   ② %Error = (ค่า PICO − ค่า กปน.)/ค่า กปน.×100 · ผ่านเมื่อ |%Error| ≤ cmpPct                     */
const CAL_PATH='equipment_meta/calib';
const CAL_DEFAULT_PARAMS=[
 {key:'frc',name:'คลอรีนอิสระคงเหลือ',unit:'mg/L',stds:[{label:'Blank',tv:0,tol:0,mode:'abs'},{label:'STD1',tv:0.25,tol:0.09,mode:'abs'},{label:'STD2',tv:0.89,tol:0.1,mode:'abs'},{label:'STD3',tv:1.51,tol:0.14,mode:'abs'}]},
 {key:'tub',name:'ความขุ่น',unit:'NTU',stds:[{label:'STD1',tv:20,tol:10,mode:'pct'},{label:'STD2',tv:100,tol:10,mode:'pct'},{label:'STD3',tv:800,tol:10,mode:'pct'},{label:'CCV',tv:10,tol:10,mode:'pct'}]},
 {key:'ec',name:'ความนำไฟฟ้า',unit:'µS/cm',stds:[{label:'STD',tv:1413,tol:5,mode:'abs'}]},
 {key:'ph',name:'pH',unit:'',stds:[{label:'pH 4.01',tv:4.01,tol:0.02,mode:'abs'},{label:'pH 6.86',tv:6.86,tol:0.02,mode:'abs'},{label:'pH 9.18',tv:9.18,tol:0.02,mode:'abs'}]}
];
let CAL={devices:{},rounds:{},settings:{intervalM:1,cmpPct:10,expWarnD:60},month:null,tab:'std',dev:null,cur:null,dirty:false,editStd:false,histDev:null};
let _calChart=null;

/* ── utils ── */
const calEsc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const calNum=v=>{if(v===''||v==null)return null;const n=+String(v).replace(/,/g,'');return isFinite(n)?n:null;};
const calThD=iso=>{if(!iso)return '–';const d=new Date(iso+'T00:00:00');if(isNaN(d))return iso;return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'});};
const calThM=iso=>{if(!iso)return '–';const d=new Date((iso.length===7?iso+'-01':iso)+'T00:00:00');return d.toLocaleDateString('th-TH',{month:'short',year:'2-digit'});};
const calThMonth=ym=>{const d=new Date(ym+'-01T00:00:00');return d.toLocaleDateString('th-TH',{month:'long',year:'numeric'});};
const calToday=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const calDays=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);
const calId=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const calUser=()=>{const el=document.getElementById('cal-user');const v=(el&&el.value||'').trim();if(!v){alert('กรอกชื่อผู้บันทึกก่อน (ช่องด้านบน)');el&&el.focus();return null;}try{localStorage.setItem('eq_user',v);}catch(e){}return v;};
const calKey=n=>{n=(n||'').toLowerCase();return /คลอรีน|chlorine|frc/.test(n)?'frc':/ขุ่น|turb/.test(n)?'tub':/นำไฟฟ้า|conduct|ec\b/.test(n)?'ec':/ph/.test(n)?'ph':'p'+Math.random().toString(36).slice(2,6);};
const calFmt=v=>v==null?'':(Math.abs(v)>=100?String(+v.toFixed(2)):String(+v.toFixed(3)));
const calArr=o=>Array.isArray(o)?o.filter(x=>x!=null):(o?Object.keys(o).sort((a,b)=>a-b).map(k=>o[k]).filter(x=>x!=null):[]);
const calPctS=v=>v==null?'–':(v>0?'+':'')+v.toFixed(1)+'%';

/* ── เกณฑ์ ── */
function calLim(s){return s.mode==='pct'?Math.abs(s.tv)*s.tol/100:s.tol;}
function calRange(s){const l=calLim(s);return [s.tv-l,s.tv+l];}
function calPass(s,x){if(x==null)return null;return Math.abs(x-s.tv)<=calLim(s)+1e-9;}
function calErr(tv,x){if(x==null||tv==null||tv===0)return null;return (x-tv)/tv*100;}
function calCrit(s){
  if(!s.tv)return 'ต้องได้ '+calFmt(s.tv);
  if(s.mode==='pct')return '±'+s.tol+'%';
  return '±'+(s.tol/Math.abs(s.tv)*100).toFixed(1)+'% <span style="color:#99a">(±'+calFmt(s.tol)+')</span>';
}
function calCmpEval(rd,row){
  const R=calNum((row.v||{})[rd.ref]);const out={};
  rd.devs.forEach(d=>{if(d.id===rd.ref)return;const e=calErr(R,calNum((row.v||{})[d.id]));out[d.id]=e==null?null:{e,ok:Math.abs(e)<=CAL.settings.cmpPct+1e-9};});
  return out;
}
function calNorm(rd){
  rd.devs=calArr(rd.devs);
  rd.params=calArr(rd.params).map(p=>Object.assign(p,{stds:calArr(p.stds).map(s=>Object.assign(s,{r:s.r||{}}))}));
  rd.cmp=calArr(rd.cmp).map(c=>Object.assign(c,{v:c.v||{}}));
  /* ข้อมูลรุ่นแรก: Sample ใน params → ย้ายเป็นแถวเทียบเครื่อง */
  rd.params.forEach(p=>{if(p.sample&&Object.keys(p.sample).length){rd.cmp.push({name:'Sample',date:rd.date||'',time:'',p:p.name,v:p.sample});}delete p.sample;});
  return rd;
}
/* สรุปต่อเครื่อง: std={n,pass}, cmp={n,pass} */
function calEval(rd){
  const out={};rd.devs.forEach(d=>out[d.id]={std:{n:0,pass:0,fails:[]},cmp:{n:0,pass:0,fails:[]}});
  rd.params.forEach(p=>p.stds.forEach(s=>rd.devs.forEach(d=>{const x=calNum(s.r[d.id]);const ok=calPass(s,x);if(ok==null)return;const o=out[d.id].std;o.n++;if(ok)o.pass++;else o.fails.push(p.name+' '+s.label);})));
  rd.cmp.forEach(c=>{const ev=calCmpEval(rd,c);Object.entries(ev).forEach(([id,x])=>{if(!x||!out[id])return;const o=out[id].cmp;o.n++;if(x.ok)o.pass++;else o.fails.push((c.name||'')+' '+(c.p||''));});});
  return out;
}

/* ── data ── */
async function calLoad(){
  const m=await fbGet(CAL_PATH)||{};
  CAL.devices=m.devices||{};
  CAL.rounds={};
  Object.entries(m.rounds||{}).forEach(([k,v])=>{const r=calNorm(v);r._id=k;const ym=(r.date||'').slice(0,7)||k;
    if(!CAL.rounds[ym]||(CAL.rounds[ym].ts||0)<(r.ts||0))CAL.rounds[ym]=r;});
  const s=m.settings||{};
  CAL.settings={intervalM:s.intervalM||1,cmpPct:s.cmpPct!=null?s.cmpPct:(s.rpd!=null?s.rpd:10),expWarnD:s.expWarnD!=null?s.expWarnD:60};
}
const calDevList=all=>Object.entries(CAL.devices).map(([id,d])=>Object.assign({id},d)).filter(d=>all||d.active!==false).sort((a,b)=>(a.order||0)-(b.order||0)||a.name.localeCompare(b.name,'th'));
const calMonths=()=>Object.keys(CAL.rounds).sort().reverse();

/* ── CSS ── */
function calCSS(){
  if(document.getElementById('cal-css'))return;
  const st=document.createElement('style');st.id='cal-css';
  st.textContent=`
#pg-calib .cal-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
#pg-calib input[type=text],#pg-calib input[type=date],#pg-calib input[type=time],#pg-calib input[type=month],#pg-calib input[type=number],#pg-calib select,#cal-modal input,#cal-modal select{font:inherit;font-size:12.5px;padding:6px 8px;border:1px solid var(--line,#dde3ec);border-radius:7px;background:#fff;box-sizing:border-box}
#pg-calib label.l{display:block;font-size:10.5px;color:#6b7690;margin-bottom:3px}
.cal-mchips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cal-mchip{font-size:11.5px;border:1px solid #dde3ec;border-radius:14px;padding:3px 10px;background:#fff;cursor:pointer}
.cal-mchip.on{background:#4a56d6;border-color:#4a56d6;color:#fff}
.cal-mchip .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:5px;vertical-align:middle}
.cal-tabs{display:flex;gap:4px;border-bottom:2px solid #e3e8f0;margin-bottom:12px;flex-wrap:wrap}
.cal-tab{border:0;background:none;font:inherit;font-size:13.5px;font-weight:600;color:#6b7690;padding:9px 14px;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px}
.cal-tab.on{color:#4a56d6;border-bottom-color:#4a56d6}
.cal-devpills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.cal-dp{border:1.5px solid #dde3ec;border-radius:10px;background:#fff;padding:8px 14px;cursor:pointer;font:inherit;text-align:left;min-width:150px}
.cal-dp.on{border-color:#4a56d6;background:#f3f4ff}
.cal-dp b{font-size:13px;display:block}.cal-dp span{font-size:11px}
.cal-tb{width:100%;border-collapse:collapse;font-size:12.5px}
.cal-tb th{background:#eef1f6;font-weight:600;text-align:left;padding:7px 8px;white-space:nowrap;font-size:12px}
.cal-tb td{padding:6px 8px;border-bottom:1px solid #edf0f5;vertical-align:middle}
.cal-tb .c{text-align:center}
.cal-tb tr.ph td{background:#f6f8fc;font-weight:700;color:#2b3a67}
.cal-in{width:84px;text-align:center;font-weight:600}
.cal-in.ok{background:#eaf7ee!important;border-color:#9fd4b0!important}.cal-in.bad{background:#fdeceb!important;border-color:#f0a39b!important}
.cal-res{display:inline-block;min-width:58px;text-align:center;border-radius:6px;padding:2px 8px;font-weight:700;font-size:12px}
.cal-res.ok{background:#e6f6ea;color:#177a3d}.cal-res.bad{background:#fde3e0;color:#b3261e}.cal-res.na{color:#aab;font-weight:400}
.cal-pill{display:inline-block;font-size:12px;border-radius:8px;padding:6px 11px;font-weight:600;margin:2px 4px 2px 0}
.cal-ok{background:#e6f6ea;color:#177a3d}.cal-warn{background:#fff3d6;color:#9a6a00}.cal-bad{background:#fde3e0;color:#b3261e}.cal-mut{background:#eef1f6;color:#556}
.cal-scroll{overflow-x:auto}
.cal-save{position:sticky;bottom:0;background:#fff;border-top:1px solid #e3e8f0;padding:10px 0 2px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.cal-x{border:0;background:none;color:#b3261e;cursor:pointer;font-size:14px}
.cal-big{font-size:12.5px;color:#6b7690}
#cal-modal{position:fixed;inset:0;background:rgba(20,26,45,.45);z-index:9999;display:none;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}
#cal-modal .box{background:#fff;border-radius:12px;max-width:1000px;width:100%;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
#cal-modal h2{font-size:16px;margin:0 0 10px}
#cal-modal label{display:block;font-size:10.5px;color:#6b7690;margin-bottom:3px}
`;
  document.head.appendChild(st);
}

/* ── หน้าเมนู ── */
async function calInit(){
  calCSS();
  const u=document.getElementById('cal-user');
  if(u&&!u.value){try{u.value=localStorage.getItem('eq_user')||'';}catch(e){}}
  const body=document.getElementById('cal-body');
  body.innerHTML='<div class="qcard" style="color:#889;font-size:12px">กำลังโหลดข้อมูลจาก Firebase…</div>';
  try{await calLoad();}catch(e){body.innerHTML='<div class="qcard" style="color:#b3261e;font-size:12px"><b>อ่าน Firebase ไม่ได้:</b> '+calEsc(e.message)+'</div>';return;}
  if(!CAL.month)CAL.month=calMonths()[0]||calToday().slice(0,7);
  calOpenMonth(CAL.month,true);
}
function calOpenMonth(ym,force){
  if(!ym)return;
  if(!force&&CAL.dirty&&!confirm('ยังไม่ได้บันทึกการแก้ไขของเดือนนี้ — เปลี่ยนเดือนเลย?'))return calRender();
  CAL.month=ym;CAL.dirty=false;CAL.editStd=false;
  const r=CAL.rounds[ym];
  CAL.cur=r?JSON.parse(JSON.stringify(r)):null;
  if(CAL.cur&&(!CAL.dev||!CAL.cur.devs.find(d=>d.id===CAL.dev)))CAL.dev=(CAL.cur.devs[0]||{}).id;
  calRender();
}
function calStartMonth(){
  const devs=calDevList();
  if(!devs.length){alert('ยังไม่มีเครื่องมือ — เพิ่มที่ 🧰 จัดการเครื่องมือ ก่อน');calDevices();return;}
  const prev=calMonths().find(m=>m<CAL.month)||calMonths()[0];
  const tpl=prev?JSON.parse(JSON.stringify(CAL.rounds[prev].params)):JSON.parse(JSON.stringify(CAL_DEFAULT_PARAMS));
  tpl.forEach(p=>p.stds.forEach(s=>s.r={}));
  const ref=(devs.find(d=>d.ref)||devs[0]).id;
  CAL.cur={date:CAL.month+'-01',title:'',ref,devs:devs.map(d=>({id:d.id,name:d.name,brand:d.brand||'',model:d.model||'',tester:'',tdate:''})),params:tpl,cmp:[]};
  CAL.dev=devs[0].id;CAL.dirty=true;CAL.tab='std';calRender();
}
function calSetDirty(){CAL.dirty=true;const el=document.getElementById('cal-dirty');if(el)el.innerHTML='<b style="color:#b45309">● ยังไม่ได้บันทึก</b>';}
function calRender(){
  const body=document.getElementById('cal-body');if(!body)return;
  const months=calMonths(),R=CAL.cur;
  /* แถบเดือน */
  const chips=months.slice(0,24).map(m=>{const ev=calEval(CAL.rounds[m]);let f=0,n=0;Object.values(ev).forEach(x=>{n+=x.std.n+x.cmp.n;f+=x.std.fails.length+x.cmp.fails.length;});
    return '<span class="cal-mchip'+(m===CAL.month?' on':'')+'" onclick="calOpenMonth(\''+m+'\')">'+calThM(m)+'<span class="dot" style="background:'+(!n?'#c3c9d6':f?'#e05a4f':'#2f9e44')+'"></span></span>';}).join('');
  let h='<div class="qcard"><div class="cal-bar"><div><label class="l">เดือนที่สอบเทียบ</label><input type="month" value="'+CAL.month+'" onchange="calOpenMonth(this.value)"></div>'+
    '<div style="flex:1"></div>'+(R&&!CAL.dirty&&CAL.rounds[CAL.month]?'<button class="chip-btn" onclick="calPrint()">🖨 พิมพ์เดือนนี้</button> <button class="chip-btn" onclick="calDelMonth()">🗑 ลบเดือนนี้</button>':'')+'</div>'+
    (chips?'<div class="cal-mchips"><span class="cal-big" style="align-self:center">เดือนที่มีข้อมูล:</span>'+chips+'</div>':'')+'</div>';
  if(!R){
    h+='<div class="qcard" style="text-align:center;padding:30px"><div style="font-size:15px;font-weight:700;margin-bottom:6px">ยังไม่มีข้อมูลเดือน'+calThMonth(CAL.month)+'</div><div class="cal-big" style="margin-bottom:14px">เริ่มบันทึกได้เลย ระบบจะดึงสารมาตรฐานของเดือนก่อนมาให้</div><button class="chip-btn primary" onclick="calStartMonth()">➕ เริ่มบันทึกเดือนนี้</button></div>';
    body.innerHTML=h+calSummaryCard();return;
  }
  const ev=calEval(R);
  const tabs=[['std','① เทียบสารมาตรฐาน'],['cmp','② เทียบเครื่อง กปน. กับ PICO'],['sum','📊 สรุปทุกเดือน']];
  h+='<div class="qcard"><div class="cal-tabs">'+tabs.map(t=>'<button class="cal-tab'+(CAL.tab===t[0]?' on':'')+'" onclick="CAL.tab=\''+t[0]+'\';calRender()">'+t[1]+'</button>').join('')+'</div>';
  if(CAL.tab==='std')h+=calStdView(R,ev);
  else if(CAL.tab==='cmp')h+=calCmpView(R,ev);
  else h+=calSumView();
  if(CAL.tab!=='sum')h+='<div class="cal-save"><span id="cal-dirty" class="cal-big">'+(CAL.dirty?'<b style="color:#b45309">● ยังไม่ได้บันทึก</b>':'บันทึกแล้ว'+(R.by?' · '+calEsc(R.by):''))+'</span><span>'+(CAL.dirty&&CAL.rounds[CAL.month]?'<button class="chip-btn" onclick="calOpenMonth(CAL.month,true)">↺ ยกเลิกการแก้ไข</button> ':'')+'<button class="chip-btn primary" onclick="calSave()">💾 บันทึกเดือนนี้</button></span></div>';
  h+='</div>';
  body.innerHTML=h;
  if(CAL.tab==='sum'&&CAL.histDev)calShowHist(CAL.histDev,true);
}

/* ① เทียบสารมาตรฐาน — ทีละเครื่อง */
function calStdView(R,ev){
  const D=R.devs.find(d=>d.id===CAL.dev)||R.devs[0];if(!D)return '<div class="cal-big">ยังไม่มีเครื่องในเดือนนี้</div>';
  CAL.dev=D.id;const di=R.devs.indexOf(D);
  const pills=R.devs.map(d=>{const o=ev[d.id].std;const st=!o.n?'<span style="color:#99a">ยังไม่กรอก</span>':o.fails.length?'<span style="color:#b3261e">❌ ไม่ผ่าน '+o.fails.length+' จุด</span>':'<span style="color:#177a3d">✅ ผ่าน '+o.pass+'/'+o.n+'</span>';
    return '<button class="cal-dp'+(d.id===D.id?' on':'')+'" onclick="CAL.dev=\''+d.id+'\';calRender()"><b>'+calEsc(d.name)+'</b><span>'+st+'</span></button>';}).join('');
  const b='CAL.cur.devs['+di+']';
  let h='<div class="cal-devpills">'+pills+'</div>'+
    '<div class="cal-bar" style="margin-bottom:10px"><div><label class="l">ยี่ห้อ</label><input type="text" style="width:130px" value="'+calEsc(D.brand)+'" oninput="'+b+'.brand=this.value;calSetDirty()"></div>'+
    '<div><label class="l">รุ่น</label><input type="text" style="width:130px" value="'+calEsc(D.model)+'" oninput="'+b+'.model=this.value;calSetDirty()"></div>'+
    '<div><label class="l">ผู้ทดสอบ</label><input type="text" style="width:170px" value="'+calEsc(D.tester)+'" oninput="'+b+'.tester=this.value;calSetDirty()"></div>'+
    '<div><label class="l">วันที่ทดสอบ</label><input type="date" value="'+calEsc(D.tdate||'')+'" onchange="'+b+'.tdate=this.value;calSetDirty()"></div>'+
    '<div style="flex:1"></div><button class="chip-btn" onclick="CAL.editStd=!CAL.editStd;calRender()">'+(CAL.editStd?'✔ เสร็จ':'⚙️ แก้สารมาตรฐาน / เกณฑ์')+'</button></div>';
  const E=CAL.editStd;
  h+='<div class="cal-scroll"><table class="cal-tb"><thead><tr><th>มาตรฐาน</th><th>Lot / Exp.</th><th class="c">ค่าจริง</th><th class="c">ค่าที่อ่านได้</th><th class="c">%Error</th><th class="c">เกณฑ์</th><th class="c">ผล</th>'+(E?'<th></th>':'')+'</tr></thead><tbody>';
  R.params.forEach((p,pi)=>{
    h+='<tr class="ph"><td colspan="'+(E?8:7)+'">'+(E?'<input type="text" value="'+calEsc(p.name)+'" style="width:180px;font-weight:700" oninput="CAL.cur.params['+pi+'].name=this.value;calSetDirty()"> <input type="text" value="'+calEsc(p.unit||'')+'" placeholder="หน่วย" style="width:80px" oninput="CAL.cur.params['+pi+'].unit=this.value;calSetDirty()"> <button class="chip-btn" style="padding:3px 9px" onclick="calAddStd('+pi+')">➕ แถว</button> <button class="cal-x" title="ลบพารามิเตอร์" onclick="calDelParam('+pi+')">🗑</button>':calEsc(p.name)+(p.unit?' <span style="font-weight:400;color:#6b7690">('+calEsc(p.unit)+')</span>':''))+'</td></tr>';
    p.stds.forEach((s,si)=>{
      const sb='CAL.cur.params['+pi+'].stds['+si+']';const x=calNum(s.r[D.id]);const ok=calPass(s,x);const e=calErr(s.tv,x);
      const expd=s.exp&&s.exp<(D.tdate||R.date||calToday());
      const lot=E?'<input type="text" value="'+calEsc(s.lot||'')+'" placeholder="Lot" style="width:90px" oninput="'+sb+'.lot=this.value;calSetDirty()"> <input type="date" value="'+calEsc(s.exp||'')+'" style="width:130px" onchange="'+sb+'.exp=this.value;calSetDirty()">'
        :(s.lot?calEsc(s.lot):'')+(s.exp?' <span style="font-size:11px;color:'+(expd?'#b3261e;font-weight:700':'#889')+'">'+calThM(s.exp)+(expd?' ⚠ หมดอายุ':'')+'</span>':'')||'<span style="color:#ccd">–</span>';
      h+='<tr><td>'+(E?'<input type="text" value="'+calEsc(s.label)+'" style="width:80px" oninput="'+sb+'.label=this.value;calSetDirty()">':'<b>'+calEsc(s.label)+'</b>')+'</td><td>'+lot+'</td>'+
        '<td class="c">'+(E?'<input type="text" inputmode="decimal" style="width:76px;text-align:center" value="'+calFmt(s.tv)+'" onchange="'+sb+'.tv=calNum(this.value)||0;calSetDirty();calRender()">':calFmt(s.tv))+'</td>'+
        '<td class="c"><input class="cal-in'+(ok===true?' ok':ok===false?' bad':'')+'" type="text" inputmode="decimal" data-pi="'+pi+'" data-si="'+si+'" value="'+calFmt(x)+'" oninput="calStdInput(this)"></td>'+
        '<td class="c" id="cal-e-'+pi+'-'+si+'"><b style="color:'+(ok===false?'#b3261e':'#20293a')+'">'+(s.tv?calPctS(e):(x==null?'–':calFmt(x)))+'</b></td>'+
        '<td class="c" style="font-size:11.5px">'+(E?'± <input type="text" inputmode="decimal" style="width:60px;text-align:center" value="'+calFmt(s.tol)+'" onchange="'+sb+'.tol=calNum(this.value)||0;calSetDirty();calRender()"> <select onchange="'+sb+'.mode=this.value;calSetDirty();calRender()"><option value="abs" '+(s.mode!=='pct'?'selected':'')+'>'+calEsc(p.unit||'ค่า')+'</option><option value="pct" '+(s.mode==='pct'?'selected':'')+'>%</option></select>':calCrit(s))+'</td>'+
        '<td class="c" id="cal-r-'+pi+'-'+si+'">'+calResBadge(ok)+'</td>'+(E?'<td><button class="cal-x" onclick="calDelStd('+pi+','+si+')">✕</button></td>':'')+'</tr>';
    });
  });
  h+='</tbody></table></div>';
  if(E)h+='<div style="margin-top:8px"><button class="chip-btn" onclick="calAddParam()">➕ เพิ่มพารามิเตอร์</button> <span class="cal-big">สารมาตรฐานและเกณฑ์ใช้ร่วมกันทุกเครื่องในเดือนนี้</span></div>';
  h+='<div class="cal-big" style="margin-top:8px">%Error = (ค่าที่อ่านได้ − ค่าจริง) ÷ ค่าจริง × 100 · ผ่านเมื่ออยู่ในเกณฑ์ (ค่าที่ตรงขอบนับว่าผ่าน)</div>';
  return h;
}
const calResBadge=ok=>ok==null?'<span class="cal-res na">–</span>':ok?'<span class="cal-res ok">ผ่าน</span>':'<span class="cal-res bad">ไม่ผ่าน</span>';
function calStdInput(el){
  const pi=+el.dataset.pi,si=+el.dataset.si,s=CAL.cur.params[pi].stds[si],x=calNum(el.value);
  if(x==null)delete s.r[CAL.dev];else s.r[CAL.dev]=x;
  const ok=calPass(s,x),e=calErr(s.tv,x);
  el.classList.toggle('ok',ok===true);el.classList.toggle('bad',ok===false);
  document.getElementById('cal-e-'+pi+'-'+si).innerHTML='<b style="color:'+(ok===false?'#b3261e':'#20293a')+'">'+(s.tv?calPctS(e):(x==null?'–':calFmt(x)))+'</b>';
  document.getElementById('cal-r-'+pi+'-'+si).innerHTML=calResBadge(ok);
  calSetDirty();
}
function calAddStd(pi){CAL.cur.params[pi].stds.push({label:'STD',tv:0,tol:0,mode:'abs',lot:'',exp:'',r:{}});calSetDirty();calRender();}
function calDelStd(pi,si){if(!confirm('ลบแถวมาตรฐานนี้ (ค่าของทุกเครื่องในแถวนี้จะหายด้วย)?'))return;CAL.cur.params[pi].stds.splice(si,1);calSetDirty();calRender();}
function calAddParam(){const n=prompt('ชื่อพารามิเตอร์ใหม่ (เช่น DO, อุณหภูมิ):');if(!n)return;const u=prompt('หน่วย:','')||'';CAL.cur.params.push({key:calKey(n),name:n.trim(),unit:u,stds:[{label:'STD1',tv:0,tol:0,mode:'abs',lot:'',exp:'',r:{}}]});calSetDirty();calRender();}
function calDelParam(pi){if(!confirm('ลบพารามิเตอร์ '+CAL.cur.params[pi].name+' ออกจากเดือนนี้?'))return;CAL.cur.params.splice(pi,1);calSetDirty();calRender();}

/* ② เทียบเครื่อง กปน. กับ PICO */
function calCmpView(R,ev){
  const ref=R.devs.find(d=>d.id===R.ref)||R.devs[0];const others=R.devs.filter(d=>d.id!==ref.id);
  const pnames=R.params.map(p=>p.name);
  const sum=others.map(d=>{const o=ev[d.id].cmp;return '<span class="cal-pill '+(!o.n?'cal-mut':o.fails.length?'cal-bad':'cal-ok')+'">'+calEsc(d.name)+': '+(!o.n?'ยังไม่มีข้อมูล':o.fails.length?'ไม่ผ่าน '+o.fails.length+' / '+o.n+' แถว':'ผ่านทั้งหมด '+o.n+' แถว')+'</span>';}).join('');
  let h='<div style="margin-bottom:8px">'+sum+'</div><div class="cal-bar" style="margin-bottom:10px"><div><label class="l">เครื่องหลัก (ค่าอ้างอิง)</label><select onchange="CAL.cur.ref=this.value;calSetDirty();calRender()">'+R.devs.map(d=>'<option value="'+d.id+'" '+(d.id===ref.id?'selected':'')+'>'+calEsc(d.name)+'</option>').join('')+'</select></div><div class="cal-big" style="align-self:center">เกณฑ์: |%Error| ไม่เกิน '+CAL.settings.cmpPct+'% (ปรับได้ที่ 🧰 ตั้งค่า)</div></div>';
  h+='<div class="cal-scroll"><table class="cal-tb"><thead><tr><th>#</th><th>ชื่อจุด / ตัวอย่าง</th><th>วันที่</th><th>เวลา</th><th>พารามิเตอร์</th><th class="c" style="background:#e6e9ff">'+calEsc(ref.name)+'</th>'+
    others.map(d=>'<th class="c">'+calEsc(d.name)+'</th><th class="c">%Error</th>').join('')+'<th></th></tr></thead><tbody>';
  if(!R.cmp.length)h+='<tr><td colspan="'+(7+others.length*2)+'" class="c cal-big" style="padding:18px">ยังไม่มีข้อมูล — กด ➕ เพิ่มแถว</td></tr>';
  R.cmp.forEach((c,i)=>{const b='CAL.cur.cmp['+i+']';const e=calCmpEval(R,c);const unit=(R.params.find(p=>p.name===c.p)||{}).unit||'';
    h+='<tr><td class="cal-big">'+(i+1)+'</td><td><input type="text" style="width:170px" value="'+calEsc(c.name||'')+'" oninput="'+b+'.name=this.value;calSetDirty()"></td>'+
      '<td><input type="date" value="'+calEsc(c.date||'')+'" onchange="'+b+'.date=this.value;calSetDirty()"></td>'+
      '<td><input type="time" value="'+calEsc(c.time||'')+'" onchange="'+b+'.time=this.value;calSetDirty()"></td>'+
      '<td><select onchange="'+b+'.p=this.value;calSetDirty();calRender()">'+(pnames.includes(c.p)?'':'<option>'+calEsc(c.p||'')+'</option>')+pnames.map(n=>'<option '+(n===c.p?'selected':'')+'>'+calEsc(n)+'</option>').join('')+'</select>'+(unit?' <span class="cal-big">'+calEsc(unit)+'</span>':'')+'</td>'+
      '<td class="c" style="background:#f6f7ff"><input class="cal-in" type="text" inputmode="decimal" data-i="'+i+'" data-d="'+ref.id+'" value="'+calFmt(calNum(c.v[ref.id]))+'" oninput="calCmpInput(this)"></td>'+
      others.map(d=>{const x=e[d.id];return '<td class="c"><input class="cal-in'+(x?(x.ok?' ok':' bad'):'')+'" type="text" inputmode="decimal" data-i="'+i+'" data-d="'+d.id+'" value="'+calFmt(calNum(c.v[d.id]))+'" oninput="calCmpInput(this)"></td><td class="c" id="cal-ce-'+i+'-'+d.id+'">'+calCmpBadge(x)+'</td>';}).join('')+
      '<td><button class="cal-x" title="ลบแถว" onclick="calDelCmp('+i+')">✕</button></td></tr>';});
  h+='</tbody></table></div><div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="chip-btn" onclick="calAddCmp(false)">➕ เพิ่มแถว</button><button class="chip-btn" onclick="calAddCmp(true)">➕ เพิ่มจุดใหม่ (ครบทุกพารามิเตอร์)</button></div>'+
    '<div class="cal-big" style="margin-top:8px">%Error = (ค่าเครื่อง PICO − ค่าเครื่องหลัก) ÷ ค่าเครื่องหลัก × 100</div>';
  return h;
}
const calCmpBadge=x=>!x?'<span class="cal-res na">–</span>':'<span class="cal-res '+(x.ok?'ok':'bad')+'">'+calPctS(x.e)+'</span>';
function calCmpInput(el){
  const i=+el.dataset.i,c=CAL.cur.cmp[i],x=calNum(el.value);
  if(x==null)delete c.v[el.dataset.d];else c.v[el.dataset.d]=x;
  const e=calCmpEval(CAL.cur,c);
  Object.entries(e).forEach(([id,r])=>{const cell=document.getElementById('cal-ce-'+i+'-'+id);if(cell)cell.innerHTML=calCmpBadge(r);
    const inp=document.querySelector('#pg-calib .cal-in[data-i="'+i+'"][data-d="'+id+'"]');if(inp){inp.classList.toggle('ok',!!(r&&r.ok));inp.classList.toggle('bad',!!(r&&!r.ok));}});
  calSetDirty();
}
function calAddCmp(all){
  const R=CAL.cur,last=R.cmp[R.cmp.length-1]||{};const names=R.params.map(p=>p.name);
  const base={name:last.name||'',date:last.date||calToday(),time:last.time||''};
  if(all){base.name='';names.forEach(n=>R.cmp.push(Object.assign({},base,{p:n,v:{}})));}
  else{const nx=last.p?names[(names.indexOf(last.p)+1)%names.length]:names[0];R.cmp.push(Object.assign({},base,{p:nx||'',v:{}}));}
  calSetDirty();calRender();
}
function calDelCmp(i){CAL.cur.cmp.splice(i,1);calSetDirty();calRender();}

/* 📊 สรุปทุกเดือน */
function calSumView(){
  const months=calMonths(),devs=calDevList(true).filter(d=>months.some(m=>CAL.rounds[m].devs.find(x=>x.id===d.id)));
  if(!months.length)return '<div class="cal-big">ยังไม่มีข้อมูล</div>';
  const cell=o=>!o||!o.n?'<span class="cal-res na">–</span>':'<span class="cal-res '+(o.fails.length?'bad':'ok')+'" title="'+calEsc(o.fails.join(', '))+'">'+o.pass+'/'+o.n+'</span>';
  let h='<div class="cal-big" style="margin-bottom:8px">ตัวเลข = ผ่าน/ทั้งหมด · แตะชื่อเครื่องเพื่อดูกราฟ %Error ย้อนหลัง</div><div class="cal-scroll"><table class="cal-tb"><thead><tr><th rowspan="2">เดือน</th>'+
    devs.map(d=>'<th class="c" colspan="2" style="cursor:pointer;color:#4a56d6" onclick="calShowHist(\''+d.id+'\')">'+calEsc(d.name)+' 📈</th>').join('')+'</tr><tr>'+devs.map(()=>'<th class="c" style="font-weight:400">① สารมาตรฐาน</th><th class="c" style="font-weight:400">② เทียบเครื่อง</th>').join('')+'</tr></thead><tbody>';
  months.forEach(m=>{const r=CAL.rounds[m],ev=calEval(r);
    h+='<tr><td><a href="javascript:void 0" onclick="calOpenMonth(\''+m+'\')"><b>'+calThMonth(m)+'</b></a></td>'+devs.map(d=>{const o=ev[d.id];if(!o)return '<td class="c" colspan="2"><span class="cal-res na">ไม่ได้ทดสอบ</span></td>';return '<td class="c">'+cell(o.std)+'</td><td class="c">'+(d.id===r.ref?'<span class="cal-res na">เครื่องหลัก</span>':cell(o.cmp))+'</td>';}).join('')+'</tr>';});
  return h+'</tbody></table></div><div id="cal-hist"></div>';
}
function calSummaryCard(){const n=calMonths().length;return n?'<div class="qcard">'+calSumView()+'</div>':'';}
function calShowHist(devId){
  const box=document.getElementById('cal-hist');if(!box)return;CAL.histDev=devId;
  const d=CAL.devices[devId]||{name:devId};
  const ms=calMonths().slice().reverse().filter(m=>CAL.rounds[m].devs.find(x=>x.id===devId));
  const pn=[...new Set(ms.flatMap(m=>CAL.rounds[m].params.map(p=>p.name)))];
  box.innerHTML='<div style="margin-top:14px;border-top:1px solid #e3e8f0;padding-top:12px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:13.5px">📈 %Error เทียบสารมาตรฐาน — '+calEsc(d.name)+'</b><span><select id="cal-hist-p" onchange="calHistChart()">'+pn.map(p=>'<option>'+calEsc(p)+'</option>').join('')+'</select> <button class="chip-btn" onclick="document.getElementById(\'cal-hist\').innerHTML=\'\';CAL.histDev=null">✕</button></span></div><div style="height:240px;margin-top:8px"><canvas id="cal-hist-cv"></canvas></div><div class="cal-big">จุดแดงใหญ่ = ไม่ผ่านเกณฑ์ของมาตรฐานนั้น · เส้นประแดง = เกณฑ์ (แสดงเมื่อทุกมาตรฐานใช้เกณฑ์ % เท่ากัน)</div></div>';
  box._ms=ms;box._dev=devId;calHistChart();
}
function calHistChart(){
  const box=document.getElementById('cal-hist'),cv=document.getElementById('cal-hist-cv');if(!cv||!box._ms||typeof Chart==='undefined')return;
  const pn=document.getElementById('cal-hist-p').value,ms=box._ms,dev=box._dev;
  const labels=[...new Set(ms.flatMap(m=>(CAL.rounds[m].params.find(p=>p.name===pn)||{stds:[]}).stds.filter(s=>s.tv).map(s=>s.label)))];
  const pal=['#4a56d6','#0f9d8a','#e8833a','#c2417b','#7a5af5','#2f9e44'];
  const ds=labels.map((lb,i)=>{const pts=ms.map(m=>{const p=CAL.rounds[m].params.find(x=>x.name===pn);const s=p&&p.stds.find(x=>x.label===lb);if(!s)return null;const x=calNum(s.r[dev]);const e=calErr(s.tv,x);return e==null?null:{e:+e.toFixed(2),ok:calPass(s,x)};});
    return {label:lb,borderColor:pal[i%pal.length],backgroundColor:pal[i%pal.length],tension:.2,spanGaps:true,data:pts.map(x=>x&&x.e),
      pointRadius:pts.map(x=>x&&!x.ok?6:3),pointBackgroundColor:pts.map(x=>x&&!x.ok?'#e03131':pal[i%pal.length])};});
  const lims=new Set();ms.forEach(m=>{const p=CAL.rounds[m].params.find(x=>x.name===pn);p&&p.stds.forEach(s=>{if(s.tv)lims.add(+(calLim(s)/Math.abs(s.tv)*100).toFixed(1));});});
  if(lims.size===1){const lim=[...lims][0];ds.push({label:'เกณฑ์ ±'+lim+'%',data:ms.map(()=>lim),borderColor:'#e05a4f',borderDash:[5,4],pointRadius:0,borderWidth:1},{label:'',data:ms.map(()=>-lim),borderColor:'#e05a4f',borderDash:[5,4],pointRadius:0,borderWidth:1});}
  if(_calChart)_calChart.destroy();
  _calChart=new Chart(cv,{type:'line',data:{labels:ms.map(calThM),datasets:ds},options:{maintainAspectRatio:false,plugins:{legend:{labels:{filter:i=>i.text!==''}}},scales:{y:{title:{display:true,text:'%Error'}}}}});
}

/* ── บันทึก / ลบ ── */
function calClean(D){
  const ids=D.devs.map(d=>d.id),keep=o=>{const r={};Object.entries(o||{}).forEach(([k,v])=>{if(v!=null&&ids.includes(k))r[k]=v;});return r;};
  return {date:D.date||'',title:D.title||'',ref:D.ref,
    devs:D.devs.map(d=>({id:d.id,name:d.name,brand:d.brand||'',model:d.model||'',tester:d.tester||'',tdate:d.tdate||''})),
    params:D.params.map(p=>({key:p.key||calKey(p.name),name:p.name,unit:p.unit||'',stds:p.stds.map(s=>({label:s.label,tv:+s.tv||0,tol:+s.tol||0,mode:s.mode==='pct'?'pct':'abs',lot:s.lot||'',exp:s.exp||'',r:keep(s.r)}))})),
    cmp:(D.cmp||[]).map(c=>({name:c.name||'',date:c.date||'',time:c.time||'',p:c.p||'',v:keep(c.v)}))};
}
async function calSave(){
  const by=calUser();if(!by)return;const D=CAL.cur;
  const ds=D.devs.map(d=>d.tdate).filter(Boolean).sort();D.date=ds[ds.length-1]||(CAL.month+'-01');
  if(D.date.slice(0,7)!==CAL.month)D.date=CAL.month+'-01';
  const rec=Object.assign(calClean(D),{by,ts:Date.now()});
  try{
    const old=CAL.rounds[CAL.month];
    await fbSet(CAL_PATH+'/rounds/'+CAL.month,rec);
    if(old&&old._id&&old._id!==CAL.month)await eqFbDel(CAL_PATH+'/rounds/'+old._id);
    for(const d of rec.devs){const cur=CAL.devices[d.id];if(cur&&((d.brand&&d.brand!==cur.brand)||(d.model&&d.model!==cur.model)))await fbSet(CAL_PATH+'/devices/'+d.id,Object.assign({},cur,{brand:d.brand||cur.brand||'',model:d.model||cur.model||''}));}
  }catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  await calLoad();calOpenMonth(CAL.month,true);
}
async function calDelMonth(){
  const r=CAL.rounds[CAL.month];if(!r||!calUser())return;
  if(!confirm('ลบข้อมูลสอบเทียบเดือน'+calThMonth(CAL.month)+' ทั้งหมด?'))return;
  await eqFbDel(CAL_PATH+'/rounds/'+(r._id||CAL.month));await calLoad();CAL.cur=null;calOpenMonth(CAL.month,true);
}

/* ── modal ── */
function calModal(html){
  let m=document.getElementById('cal-modal');
  if(!m){m=document.createElement('div');m.id='cal-modal';document.body.appendChild(m);m.addEventListener('mousedown',e=>{if(e.target===m)calClose();});}
  m.innerHTML='<div class="box">'+html+'</div>';m.style.display='flex';
}
function calClose(){const m=document.getElementById('cal-modal');if(m){m.style.display='none';m.innerHTML='';}}

/* ── จัดการเครื่องมือ + ตั้งค่า ── */
function calDevices(){
  calCSS();
  const all=calDevList(true),used=id=>Object.values(CAL.rounds).some(r=>r.devs.find(d=>d.id===id));
  const rows=all.map((d,i)=>'<tr><td><input type="text" value="'+calEsc(d.name)+'" style="width:100%" onchange="calDevSet(\''+d.id+'\',\'name\',this.value)"></td>'+
    '<td><input type="text" value="'+calEsc(d.brand||'')+'" style="width:100%" onchange="calDevSet(\''+d.id+'\',\'brand\',this.value)"></td>'+
    '<td><input type="text" value="'+calEsc(d.model||'')+'" style="width:100%" onchange="calDevSet(\''+d.id+'\',\'model\',this.value)"></td>'+
    '<td><input type="text" value="'+calEsc(d.note||'')+'" placeholder="หน่วยงาน / S/N" style="width:100%" onchange="calDevSet(\''+d.id+'\',\'note\',this.value)"></td>'+
    '<td class="c"><input type="radio" name="cal-ref" '+(d.ref?'checked':'')+' onchange="calDevRef(\''+d.id+'\')"></td>'+
    '<td class="c"><input type="checkbox" '+(d.active!==false?'checked':'')+' onchange="calDevSet(\''+d.id+'\',\'active\',this.checked)"></td>'+
    '<td style="white-space:nowrap"><button class="cal-x" '+(i?'':'disabled')+' onclick="calDevMove(\''+d.id+'\',-1)">▲</button><button class="cal-x" onclick="calDevMove(\''+d.id+'\',1)">▼</button> '+
    (used(d.id)?'<span title="มีประวัติแล้ว — เอาเครื่องหมาย ใช้งาน ออกแทนการลบ" style="font-size:11px;color:#aab">มีประวัติ</span>':'<button class="cal-x" onclick="calDevDel(\''+d.id+'\')">🗑</button>')+'</td></tr>').join('');
  calModal('<div style="display:flex;justify-content:space-between;align-items:center"><h2>🧰 จัดการเครื่องมือ Portable</h2><button class="chip-btn" onclick="calClose();calRender()">✕</button></div>'+
    '<div class="cal-scroll"><table class="cal-tb"><thead><tr><th style="width:26%">ชื่อเครื่อง</th><th>ยี่ห้อ</th><th>รุ่น</th><th>หมายเหตุ</th><th class="c">เครื่องหลัก</th><th class="c">ใช้งาน</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" style="color:#889">ยังไม่มี</td></tr>')+'</tbody></table></div>'+
    '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:end"><div><label>เพิ่มเครื่องใหม่ — ชื่อ</label><input type="text" id="cal-nd-name" placeholder="เช่น PICO 3" style="width:200px"></div><div><label>ยี่ห้อ</label><input type="text" id="cal-nd-brand" style="width:120px"></div><div><label>รุ่น</label><input type="text" id="cal-nd-model" style="width:120px"></div><button class="chip-btn primary" onclick="calDevAdd()">➕ เพิ่ม</button></div>'+
    '<div style="font-size:11px;color:#889;margin-top:10px">แก้แล้วบันทึกทันที · เครื่องที่เลิกใช้ให้เอาเครื่องหมาย “ใช้งาน” ออก (ประวัติเดิมยังอยู่) · เครื่องหลัก = ค่าอ้างอิงในแท็บ ② · เพิ่ม/ลดเครื่องของเดือนที่บันทึกไปแล้ว ใช้ช่องติ๊กด้านล่าง</div>'+
    (CAL.cur?'<div style="margin-top:10px;font-size:12px"><b>เครื่องที่ทดสอบเดือน'+calThMonth(CAL.month)+':</b> '+all.map(d=>'<label style="display:inline-flex;gap:4px;margin-right:10px;font-size:12px;color:#20293a"><input type="checkbox" '+(CAL.cur.devs.find(x=>x.id===d.id)?'checked':'')+' onchange="calToggleDev(\''+d.id+'\',this.checked)">'+calEsc(d.name)+'</label>').join('')+'</div>':'')+
    '<div style="margin-top:12px;border-top:1px solid #eef1f6;padding-top:10px;display:flex;gap:12px;flex-wrap:wrap;align-items:end;font-size:12px"><b>⚙️ ตั้งค่า</b>'+
    '<div><label>เกณฑ์ ② |%Error| ไม่เกิน (%)</label><input type="number" min="0" step="0.5" style="width:90px" value="'+CAL.settings.cmpPct+'" onchange="calSetting(\'cmpPct\',this.value)"></div>'+
    '<div><label>เตือนสารมาตรฐานก่อนหมดอายุ (วัน)</label><input type="number" min="0" style="width:90px" value="'+CAL.settings.expWarnD+'" onchange="calSetting(\'expWarnD\',this.value)"></div></div>'+
    '<div style="margin-top:12px;border-top:1px solid #eef1f6;padding-top:10px;font-size:12px"><b>📂 นำเข้าจาก Excel</b> <span style="color:#889">(ไฟล์แบบฟอร์มเดิม หนึ่งชีต = หนึ่งเดือน)</span> <button class="chip-btn" onclick="calPickExcel()">เลือกไฟล์…</button></div>');
}
function calToggleDev(id,on){
  const R=CAL.cur;if(!R)return;
  if(on){const d=CAL.devices[id];if(!R.devs.find(x=>x.id===id))R.devs.push({id,name:d.name,brand:d.brand||'',model:d.model||'',tester:'',tdate:''});}
  else{if(!confirm('เอา '+CAL.devices[id].name+' ออกจากเดือนนี้? (ค่าที่กรอกของเครื่องนี้จะหายเมื่อบันทึก)')){calDevices();return;}R.devs=R.devs.filter(x=>x.id!==id);if(R.ref===id&&R.devs[0])R.ref=R.devs[0].id;}
  const order=calDevList(true).map(d=>d.id);R.devs.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  calSetDirty();calRender();
}
async function calDevAdd(){
  if(!calUser())return;
  const name=(document.getElementById('cal-nd-name').value||'').trim();if(!name){alert('ใส่ชื่อเครื่อง');return;}
  const id=calId('d'),all=calDevList(true);
  const d={name,brand:(document.getElementById('cal-nd-brand').value||'').trim(),model:(document.getElementById('cal-nd-model').value||'').trim(),note:'',active:true,ref:!all.some(x=>x.ref),order:all.length};
  try{await fbSet(CAL_PATH+'/devices/'+id,d);}catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  CAL.devices[id]=d;calDevices();
}
async function calDevSet(id,k,v){
  const d=Object.assign({},CAL.devices[id]);d[k]=typeof v==='string'?v.trim():v;
  try{await fbSet(CAL_PATH+'/devices/'+id,d);}catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  CAL.devices[id]=d;
}
async function calDevRef(id){for(const [k,d] of Object.entries(CAL.devices)){const nv=k===id;if(!!d.ref!==nv){d.ref=nv;await fbSet(CAL_PATH+'/devices/'+k+'/ref',nv);}}}
async function calDevMove(id,dir){
  const all=calDevList(true);const i=all.findIndex(d=>d.id===id),j=i+dir;if(j<0||j>=all.length)return;
  [all[i],all[j]]=[all[j],all[i]];
  for(let k=0;k<all.length;k++){if(CAL.devices[all[k].id].order!==k){CAL.devices[all[k].id].order=k;await fbSet(CAL_PATH+'/devices/'+all[k].id+'/order',k);}}
  calDevices();
}
async function calDevDel(id){if(!calUser())return;if(!confirm('ลบเครื่อง '+CAL.devices[id].name+' ?'))return;await eqFbDel(CAL_PATH+'/devices/'+id);delete CAL.devices[id];calDevices();}
async function calSetting(k,v){CAL.settings[k]=Math.max(0,+v||0);try{await fbSet(CAL_PATH+'/settings',CAL.settings);}catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);}}

/* ── นำเข้า Excel (แบบฟอร์ม "บันทึกการสอบเทียบเครื่องวัดคุณภาพน้ำ Portable") ── */
function calLoadXLSX(){
  if(window.XLSX)return Promise.resolve();
  return new Promise((ok,ng)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=ok;s.onerror=()=>ng(new Error('โหลดตัวอ่าน Excel ไม่ได้'));document.head.appendChild(s);});
}
function calPickExcel(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.xls';
  inp.onchange=async()=>{const f=inp.files[0];if(!f)return;
    try{await calLoadXLSX();const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true,cellFormula:true});calImportPreview(wb);}
    catch(e){alert('อ่านไฟล์ไม่ได้: '+e.message);}};
  inp.click();
}
function calSheetDate(name){
  const m=String(name).match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);if(!m)return '';
  let y=+m[3];if(y<100)y+=2500;if(y>2400)y-=543;
  return y+'-'+String(+m[2]).padStart(2,'0')+'-'+String(+m[1]).padStart(2,'0');
}
function calCellDate(c){
  if(!c)return '';const v=c.v;
  if(v instanceof Date)return new Date(v.getTime()+12*3600e3).toISOString().slice(0,10);
  if(typeof v==='number'&&v>20000)return new Date(Math.round((v-25569)*864e5)).toISOString().slice(0,10);
  return '';
}
function calParseSheet(ws,name){
  const rg=XLSX.utils.decode_range(ws['!ref']||'A1');
  const C=(r,c)=>ws[XLSX.utils.encode_cell({r,c})],T=(r,c)=>{const x=C(r,c);return x&&x.v!=null?String(x.v).trim():'';},N=(r,c)=>{const x=C(r,c);return x&&typeof x.v==='number'?x.v:calNum(x&&x.v);};
  let hr=-1,gc=-1;
  for(let r=rg.s.r;r<=Math.min(rg.e.r,15)&&hr<0;r++)for(let c=rg.s.c;c<=rg.e.c;c++)if(/เกณฑ์/.test(T(r,c))){hr=r;gc=c;break;}
  if(hr<0)return null;
  const cB=1,cC=2,cD=3,cE=4,cF=5,cG=6;
  const devs=[];for(let c=gc+1;c<=rg.e.c;c++){const t=T(hr,c);if(t&&!/^(ถึง|ค่า|ผล|สรุป)/.test(t))devs.push({c,name:t,brand:'',model:'',tester:'',tdate:''});}
  if(!devs.length)return null;
  const params=[],samples=[];let P=null;
  const isParam=t=>/คลอรีน|ขุ่น|นำไฟฟ้า|^ph\b|^ph$/i.test(t);
  for(let r=hr+1;r<=rg.e.r;r++){
    const b=T(r,cB);
    if(b&&isParam(b)){const mu=b.match(/\(([^)]+)\)/);P={key:calKey(b),name:b.replace(/\s*\([^)]*\)\s*/,'').trim()||b,unit:mu?mu[1].replace(/^uS/,'µS'):'',stds:[]};params.push(P);}
    devs.forEach(d=>{const t=T(r,d.c),nx=T(r,d.c+1);
      if(/^ยี่ห้อ/.test(t)&&nx&&!/^รุ่น|^ยี่ห้อ/.test(nx))d.brand=d.brand||nx;
      else if(/^รุ่น/.test(t)&&nx&&!/^รุ่น|^ยี่ห้อ/.test(nx))d.model=d.model||nx;
      else if(/ผู้ทดสอบ/.test(t)&&nx)d.tester=nx;
      else if(/วันที่ทดสอบ/.test(t))d.tdate=calCellDate(C(r,d.c+1));});
    if(!P)continue;
    if(/^sample$/i.test(b)){const v={};devs.forEach(d=>{const x=N(r,d.c);if(x!=null)v['c'+d.c]=x;});samples.push({p:P.name,v});continue;}
    const lab=T(r,cD),tv=N(r,cE);
    if(lab&&tv!=null){
      let mode='abs',tol=N(r,cF)||0;const g=C(r,cG),f=g&&g.f?String(g.f):'';
      const mp=f.match(/\*\s*(\d+(?:\.\d+)?)\s*\/\s*100/);if(mp){mode='pct';tol=Math.abs(100-+mp[1]);}
      const s={label:/^pH\s*\d+(\.\d+)?$/i.test(lab)?'pH '+calFmt(tv):lab,tv,tol,mode,lot:(b&&!isParam(b))?b:'',exp:calCellDate(C(r,cC)),r:{}};
      devs.forEach(d=>{const x=N(r,d.c);if(x!=null)s.r['c'+d.c]=x;});
      P.stds.push(s);
    }
  }
  if(!params.length)return null;
  return {sheet:name,date:calSheetDate(name),title:(T(1,cB)||'').replace(/^เดือน\s*$/,''),devs,params,samples};
}
let _calImp=null;
function calImportPreview(wb){
  const parsed=wb.SheetNames.map(n=>calParseSheet(wb.Sheets[n],n)).filter(Boolean);
  if(!parsed.length){alert('ไม่พบตารางสอบเทียบในไฟล์นี้ (ต้องมีหัวตาราง "เกณฑ์การยอมรับ")');return;}
  const norm=s=>String(s).replace(/\s+/g,'').toLowerCase();
  const names=[...new Set(parsed.flatMap(p=>p.devs.map(d=>d.name)))];
  const map={};names.forEach(n=>{const hit=calDevList(true).find(d=>norm(d.name)===norm(n));map[n]=hit?hit.id:null;});
  _calImp={parsed,map};
  const rows=parsed.map((p,i)=>{const ym=(p.date||'').slice(0,7);const dup=CAL.rounds[ym];
    return '<tr><td><input type="checkbox" class="cal-imp" data-i="'+i+'" checked></td><td>'+calEsc(p.sheet)+'</td><td><input type="date" value="'+p.date+'" onchange="_calImp.parsed['+i+'].date=this.value"></td><td class="c">'+p.devs.length+'</td><td class="c">'+p.params.reduce((a,x)=>a+x.stds.length,0)+'</td><td class="c">'+p.samples.length+'</td><td>'+(dup?'<span class="cal-res bad" style="font-weight:500">มีข้อมูลเดือนนี้แล้ว — จะเขียนทับ</span>':'<span class="cal-res ok" style="font-weight:500">ใหม่</span>')+'</td></tr>';}).join('');
  const maps=names.map(n=>'<tr><td>'+calEsc(n)+'</td><td>'+(map[n]?'<span class="cal-res ok" style="font-weight:500">ตรงกับ '+calEsc(CAL.devices[map[n]].name)+'</span>':'<span class="cal-res na" style="background:#eef1f6;color:#556;font-weight:500">➕ เพิ่มเป็นเครื่องใหม่</span>')+'</td></tr>').join('');
  calModal('<div style="display:flex;justify-content:space-between;align-items:center"><h2>📂 นำเข้า Excel — ตรวจก่อนบันทึก</h2><button class="chip-btn" onclick="calClose()">✕</button></div>'+
    '<div class="cal-scroll"><table class="cal-tb"><thead><tr><th></th><th>ชีต</th><th>วันที่</th><th class="c">เครื่อง</th><th class="c">แถวสารมาตรฐาน</th><th class="c">แถวเทียบเครื่อง</th><th>สถานะ</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div style="margin-top:12px"><b style="font-size:12.5px">เครื่องในไฟล์</b><table class="cal-tb" style="margin-top:4px;max-width:560px"><tbody>'+maps+'</tbody></table></div>'+
    '<div style="font-size:11px;color:#889;margin-top:8px">ระบบคิดผลใหม่จากค่าที่อ่านได้ (ไม่ใช้สูตรในไฟล์) · แถว Sample → แท็บ ② เทียบเครื่อง · เครื่องชื่อ “การประปา…” เป็นเครื่องหลัก</div>'+
    '<div style="text-align:right;margin-top:12px"><button class="chip-btn primary" onclick="calImportDo()">💾 นำเข้าที่เลือก</button></div>');
}
async function calImportDo(){
  const by=calUser();if(!by)return;const {parsed,map}=_calImp;
  const pick=[...document.querySelectorAll('.cal-imp')].filter(x=>x.checked).map(x=>parsed[+x.dataset.i]);
  if(!pick.length)return;
  try{
    let order=calDevList(true).length;
    for(const n of Object.keys(map)){if(map[n])continue;const id=calId('d');const src=pick.flatMap(p=>p.devs).find(d=>d.name===n)||{};
      const d={name:n,brand:src.brand||'',model:src.model||'',note:'',active:true,ref:false,order:order++};await fbSet(CAL_PATH+'/devices/'+id,d);CAL.devices[id]=d;map[n]=id;}
    if(!Object.values(CAL.devices).some(d=>d.ref)){const id=Object.keys(CAL.devices).find(k=>/การประปา|กปน|mwa/i.test(CAL.devices[k].name))||Object.keys(CAL.devices)[0];CAL.devices[id].ref=true;await fbSet(CAL_PATH+'/devices/'+id+'/ref',true);}
    const refId=Object.keys(CAL.devices).find(k=>CAL.devices[k].ref);
    for(const p of pick){
      const cmap={};p.devs.forEach(d=>cmap['c'+d.c]=map[d.name]);
      const remap=o=>{const r={};Object.entries(o).forEach(([k,v])=>{if(cmap[k])r[cmap[k]]=v;});return r;};
      const devs=p.devs.map(d=>({id:map[d.name],name:d.name,brand:d.brand||CAL.devices[map[d.name]].brand||'',model:d.model||CAL.devices[map[d.name]].model||'',tester:d.tester,tdate:d.tdate||p.date}));
      const ym=p.date.slice(0,7);
      const D={date:p.date,title:p.title,ref:devs.find(d=>d.id===refId)?refId:devs[0].id,devs,
        params:p.params.map(x=>({key:x.key,name:x.name,unit:x.unit,stds:x.stds.map(s=>Object.assign({},s,{r:remap(s.r)}))})),
        cmp:p.samples.map(s=>({name:'Sample',date:p.date,time:'',p:s.p,v:remap(s.v)}))};
      const old=CAL.rounds[ym];
      await fbSet(CAL_PATH+'/rounds/'+ym,Object.assign(calClean(D),{by,ts:Date.now(),src:'excel:'+p.sheet}));
      if(old&&old._id&&old._id!==ym)await eqFbDel(CAL_PATH+'/rounds/'+old._id);
    }
  }catch(e){alert('นำเข้าไม่สำเร็จ: '+e.message);return;}
  calClose();await calLoad();CAL.month=calMonths()[0];calOpenMonth(CAL.month,true);alert('✅ นำเข้าแล้ว '+pick.length+' เดือน');
}

/* ── พิมพ์ทั้งเดือน ── */
function calPrint(){
  const r=CAL.rounds[CAL.month];if(!r)return;
  const ref=r.devs.find(d=>d.id===r.ref)||r.devs[0],others=r.devs.filter(d=>d.id!==ref.id),lim=CAL.settings.cmpPct;
  const res=ok=>ok==null?'':ok?'<span class="p">ผ่าน</span>':'<span class="f">ไม่ผ่าน</span>';
  let h='<h3>① การสอบเทียบกับสารมาตรฐาน</h3>';
  r.devs.forEach(d=>{
    h+='<table><tr><th colspan="8" style="text-align:left;background:#dde4f5">'+calEsc(d.name)+(d.brand||d.model?' — '+calEsc([d.brand,d.model].filter(Boolean).join(' / ')):'')+'<span style="float:right;font-weight:400">ผู้ทดสอบ: '+calEsc(d.tester||'................')+' · วันที่ '+(d.tdate?calThD(d.tdate):'.........')+'</span></th></tr>'+
      '<tr><th>พารามิเตอร์</th><th>มาตรฐาน</th><th>Lot / Exp.</th><th>ค่าจริง</th><th>ค่าที่อ่านได้</th><th>%Error</th><th>เกณฑ์</th><th>ผล</th></tr>';
    r.params.forEach(p=>p.stds.forEach((s,si)=>{const x=calNum(s.r[d.id]);
      h+='<tr>'+(si===0?'<td rowspan="'+p.stds.length+'">'+calEsc(p.name)+(p.unit?' ('+calEsc(p.unit)+')':'')+'</td>':'')+'<td>'+calEsc(s.label)+'</td><td>'+calEsc(s.lot||'')+(s.exp?' / '+calThM(s.exp):'')+'</td><td class="c">'+calFmt(s.tv)+'</td><td class="c">'+calFmt(x)+'</td><td class="c">'+(s.tv?calPctS(calErr(s.tv,x)):'')+'</td><td class="c">'+calCrit(s).replace(/<[^>]+>/g,'')+'</td><td class="c">'+res(calPass(s,x))+'</td></tr>';}));
    h+='</table>';
  });
  h+='<h3>② เทียบเครื่อง '+calEsc(ref.name)+' กับ '+others.map(d=>calEsc(d.name)).join(', ')+' (เกณฑ์ |%Error| ≤ '+lim+'%)</h3><table><tr><th>#</th><th>ชื่อจุด / ตัวอย่าง</th><th>วันที่</th><th>เวลา</th><th>พารามิเตอร์</th><th>'+calEsc(ref.name)+'</th>'+others.map(d=>'<th>'+calEsc(d.name)+'</th><th>%Error</th><th>ผล</th>').join('')+'</tr>';
  r.cmp.forEach((c,i)=>{const e=calCmpEval(r,c);h+='<tr><td class="c">'+(i+1)+'</td><td>'+calEsc(c.name)+'</td><td>'+(c.date?calThD(c.date):'')+'</td><td class="c">'+calEsc(c.time||'')+'</td><td>'+calEsc(c.p)+'</td><td class="c">'+calFmt(calNum(c.v[ref.id]))+'</td>'+others.map(d=>{const x=e[d.id];return '<td class="c">'+calFmt(calNum(c.v[d.id]))+'</td><td class="c">'+(x?calPctS(x.e):'')+'</td><td class="c">'+res(x?x.ok:null)+'</td>';}).join('')+'</tr>';});
  if(!r.cmp.length)h+='<tr><td colspan="'+(6+others.length*3)+'" class="c">–</td></tr>';
  h+='</table>';
  const w=window.open('','_blank');if(!w){alert('เบราว์เซอร์บล็อกหน้าต่างใหม่');return;}
  w.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>สอบเทียบ '+CAL.month+'</title><style>@page{size:A4 portrait;margin:10mm}body{font-family:Sarabun,Tahoma,sans-serif;font-size:9.5pt;color:#000}h1{font-size:14pt;text-align:center;margin:0}h2{font-size:11pt;text-align:center;margin:2px 0 6px;font-weight:400}h3{font-size:11pt;margin:12px 0 4px}table{border-collapse:collapse;width:100%;margin-bottom:8px;page-break-inside:avoid}th,td{border:1px solid #555;padding:2px 5px}th{background:#eee}.c{text-align:center}.p{color:#0a6b2f}.f{color:#b00;font-weight:700}</style></head><body>'+
    '<h1>บันทึกการสอบเทียบเครื่องวัดคุณภาพน้ำ Portable</h1><h2>ประจำเดือน'+calThMonth(CAL.month)+'</h2>'+h+
    '<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>');
  w.document.close();
}
