/* calibration.js — เมนูประวัติการสอบเทียบเครื่องมือ Portable (15/10/69)
   ใช้ fbGet/fbSet/fbPush/eqFbDel จาก equipment.js (โหลดก่อนไฟล์นี้)
   โครงข้อมูล (อยู่ใต้ equipment_meta เพื่อใช้ rules เดิม ไม่ต้องแก้ Firebase rules):
   equipment_meta/calib/devices/{id}  = {name,brand,model,note,active,ref,order}
   equipment_meta/calib/rounds/{id}   = {date,title,ref,devs:[{id,name,brand,model,tester,tdate}],
                                         params:[{key,name,unit,stds:[{label,tv,tol,mode:'abs'|'pct',lot,exp,r:{devId:val}}],sample:{devId:val}}],by,ts}
   equipment_meta/calib/settings      = {intervalM:6,rpd:10,expWarnD:60}
   เกณฑ์: |ค่าที่อ่าน − ค่าจริง| ≤ ช่วงยอมรับ (รวมขอบ) · %RPD = (ค่าเครื่องอ้างอิง − ค่าเครื่อง)/ค่าเครื่องอ้างอิง×100, |RPD| ≤ rpd */
const CAL_PATH='equipment_meta/calib';
const CAL_DEFAULT_PARAMS=[
 {key:'frc',name:'คลอรีนอิสระคงเหลือ',unit:'mg/L',stds:[{label:'Blank',tv:0,tol:0,mode:'abs'},{label:'STD1',tv:0.25,tol:0.09,mode:'abs'},{label:'STD2',tv:0.89,tol:0.1,mode:'abs'},{label:'STD3',tv:1.51,tol:0.14,mode:'abs'}]},
 {key:'tub',name:'ความขุ่น',unit:'NTU',stds:[{label:'STD1',tv:20,tol:10,mode:'pct'},{label:'STD2',tv:100,tol:10,mode:'pct'},{label:'STD3',tv:800,tol:10,mode:'pct'},{label:'CCV',tv:10,tol:10,mode:'pct'}]},
 {key:'ec',name:'ความนำไฟฟ้า',unit:'µS/cm',stds:[{label:'STD',tv:1413,tol:5,mode:'abs'}]},
 {key:'ph',name:'pH',unit:'',stds:[{label:'pH 4.01',tv:4.01,tol:0.02,mode:'abs'},{label:'pH 6.86',tv:6.86,tol:0.02,mode:'abs'},{label:'pH 9.18',tv:9.18,tol:0.02,mode:'abs'}]}
];
let CAL={devices:{},rounds:{},settings:{intervalM:6,rpd:10,expWarnD:60},loaded:false,view:null,histDev:null};
let _calChart=null;

/* ── utils ── */
const calEsc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const calNum=v=>{if(v===''||v==null)return null;const n=+String(v).replace(/,/g,'');return isFinite(n)?n:null;};
const calThD=iso=>{if(!iso)return '–';const d=new Date(iso+'T00:00:00');if(isNaN(d))return iso;return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'});};
const calThM=iso=>{if(!iso)return '–';const d=new Date(iso+'T00:00:00');return d.toLocaleDateString('th-TH',{month:'short',year:'2-digit'});};
const calToday=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const calAddM=(iso,m)=>{const d=new Date(iso+'T00:00:00');d.setMonth(d.getMonth()+m);return d;};
const calDays=(a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);
const calId=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const calUser=()=>{const el=document.getElementById('cal-user');const v=(el&&el.value||'').trim();if(!v){alert('กรอกชื่อผู้บันทึกก่อน');el&&el.focus();return null;}try{localStorage.setItem('eq_user',v);}catch(e){}return v;};
const calKey=n=>{n=(n||'').toLowerCase();return /คลอรีน|chlorine|frc/.test(n)?'frc':/ขุ่น|turb/.test(n)?'tub':/นำไฟฟ้า|conduct|ec\b/.test(n)?'ec':/ph/.test(n)?'ph':'p'+Math.random().toString(36).slice(2,6);};
const calFmt=v=>v==null?'':(Math.abs(v)>=100?String(+v.toFixed(2)):String(+v.toFixed(3)));
const calArr=o=>Array.isArray(o)?o.filter(x=>x!=null):(o?Object.keys(o).sort((a,b)=>a-b).map(k=>o[k]).filter(x=>x!=null):[]);

/* ── evaluation ── */
function calLim(s){return s.mode==='pct'?Math.abs(s.tv)*s.tol/100:s.tol;}
function calRange(s){const l=calLim(s);return [s.tv-l,s.tv+l];}
function calPass(s,x){if(x==null)return null;return Math.abs(x-s.tv)<=calLim(s)+1e-9;}
function calRpd(ref,x){if(ref==null||x==null||ref===0)return null;return (ref-x)/ref*100;}
/* ปรับให้ข้อมูลจาก Firebase เป็นรูปเดียวกันเสมอ */
function calNorm(rd){
  rd.devs=calArr(rd.devs);
  rd.params=calArr(rd.params).map(p=>Object.assign(p,{stds:calArr(p.stds).map(s=>Object.assign(s,{r:s.r||{}})),sample:p.sample||{}}));
  return rd;
}
/* สรุปผลรอบ: ต่อเครื่อง {n,pass,fails:[]} */
function calEval(rd){
  const lim=CAL.settings.rpd, out={}, expUsed=[];
  rd.devs.forEach(d=>out[d.id]={n:0,pass:0,fails:[]});
  rd.params.forEach(p=>{
    p.stds.forEach(s=>{
      if(s.exp&&rd.date&&s.exp<rd.date&&!expUsed.find(e=>e.p===p.name&&e.lot===(s.lot||s.label)))expUsed.push({p:p.name,lot:s.lot||s.label,exp:s.exp});
      rd.devs.forEach(d=>{const x=calNum(s.r[d.id]);const ok=calPass(s,x);if(ok==null)return;out[d.id].n++;if(ok)out[d.id].pass++;else out[d.id].fails.push(p.name+' '+s.label+' = '+calFmt(x)+' (ช่วง '+calRange(s).map(calFmt).join('–')+')');});
    });
    const R=calNum(p.sample[rd.ref]);
    rd.devs.forEach(d=>{if(d.id===rd.ref)return;const v=calRpd(R,calNum(p.sample[d.id]));if(v==null)return;out[d.id].n++;
      if(Math.abs(v)<=lim+1e-9)out[d.id].pass++;else out[d.id].fails.push(p.name+' Sample %RPD = '+v.toFixed(1)+'%');});
  });
  return {dev:out,expUsed};
}

/* ── data ── */
async function calLoad(){
  const m=await fbGet(CAL_PATH)||{};
  CAL.devices=m.devices||{};
  CAL.rounds={};Object.entries(m.rounds||{}).forEach(([k,v])=>CAL.rounds[k]=calNorm(v));
  CAL.settings=Object.assign({intervalM:6,rpd:10,expWarnD:60},m.settings||{});
  CAL.loaded=true;
}
const calDevList=(all)=>Object.entries(CAL.devices).map(([id,d])=>Object.assign({id},d)).filter(d=>all||d.active!==false).sort((a,b)=>(a.order||0)-(b.order||0)||a.name.localeCompare(b.name,'th'));
const calRoundList=()=>Object.entries(CAL.rounds).map(([id,r])=>Object.assign({id},r)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));

/* ── page ── */
function calCSS(){
  if(document.getElementById('cal-css'))return;
  const st=document.createElement('style');st.id='cal-css';
  st.textContent=`
#pg-calib .cal-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
#pg-calib .cal-bar .qf{flex:1 1 220px}
#pg-calib input[type=text],#pg-calib input[type=date],#pg-calib input[type=number],#pg-calib select,#cal-modal input,#cal-modal select{font:inherit;font-size:12px;padding:6px 8px;border:1px solid var(--line,#dde3ec);border-radius:7px;background:#fff;box-sizing:border-box}
.cal-alert{display:flex;gap:8px;flex-wrap:wrap}
.cal-pill{font-size:12px;border-radius:8px;padding:7px 12px;font-weight:600}
.cal-ok{background:#e6f6ea;color:#177a3d}.cal-warn{background:#fff3d6;color:#9a6a00}.cal-bad{background:#fde3e0;color:#b3261e}.cal-mut{background:#eef1f6;color:#556}
.cal-devs{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.cal-dev{border:1px solid var(--line,#e3e8f0);border-radius:10px;padding:10px 12px;background:#fff;cursor:pointer}
.cal-dev:hover{border-color:var(--acc,#5b3df5)}
.cal-dev .nm{font-weight:700;font-size:13.5px}.cal-dev .sub{font-size:11px;color:#6b7690;margin:2px 0 6px}
.cal-tb{width:100%;border-collapse:collapse;font-size:12px}
.cal-tb th{background:#eef1f6;font-weight:600;text-align:left;padding:6px 8px;white-space:nowrap}
.cal-tb td{padding:5px 8px;border-bottom:1px solid #edf0f5;vertical-align:middle}
.cal-tb td.c,.cal-tb th.c{text-align:center}
.cal-tb tr.ph td{background:#f6f8fc;font-weight:700;color:#2b3a67}
.cal-v{display:inline-block;min-width:46px;text-align:center;border-radius:5px;padding:1px 6px;font-weight:600}
.cal-v.ok{background:#e6f6ea;color:#177a3d}.cal-v.bad{background:#fde3e0;color:#b3261e}.cal-v.na{color:#aab}
.cal-scroll{overflow-x:auto}
#cal-modal{position:fixed;inset:0;background:rgba(20,26,45,.45);z-index:9999;display:none;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}
#cal-modal .box{background:#fff;border-radius:12px;max-width:1180px;width:100%;padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
#cal-modal h2{font-size:16px;margin:0 0 10px}
#cal-modal .in{width:76px;text-align:center}
#cal-modal .in.ok{background:#eaf7ee;border-color:#9fd4b0}#cal-modal .in.bad{background:#fdeceb;border-color:#f0a39b}
#cal-modal .meta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:10px}
#cal-modal label{display:block;font-size:10.5px;color:#6b7690;margin-bottom:3px}
.cal-x{border:0;background:none;color:#b3261e;cursor:pointer;font-size:13px}
`;
  document.head.appendChild(st);
}
async function calInit(){
  calCSS();
  const u=document.getElementById('cal-user');
  if(u&&!u.value){try{u.value=localStorage.getItem('eq_user')||'';}catch(e){}}
  const body=document.getElementById('cal-body');
  body.innerHTML='<div class="qcard" style="color:#889;font-size:12px">กำลังโหลดข้อมูลจาก Firebase…</div>';
  try{await calLoad();}catch(e){body.innerHTML='<div class="qcard" style="color:#b3261e;font-size:12px"><b>อ่าน Firebase ไม่ได้:</b> '+calEsc(e.message)+'</div>';return;}
  calRender();
}
function calRender(){
  const body=document.getElementById('cal-body'), rounds=calRoundList(), devs=calDevList(), S=CAL.settings;
  const last=rounds[0];
  /* แจ้งเตือน */
  const al=[];
  if(!last)al.push('<span class="cal-pill cal-mut">ยังไม่มีรอบสอบเทียบ — กด ➕ บันทึกรอบใหม่ หรือ 📂 นำเข้า Excel</span>');
  else{
    const due=calAddM(last.date,S.intervalM), dd=Math.floor((due-new Date())/864e5);
    const dueIso=due.toISOString().slice(0,10);
    al.push('<span class="cal-pill '+(dd<0?'cal-bad':dd<=30?'cal-warn':'cal-ok')+'">📅 รอบถัดไป '+calThD(dueIso)+(dd<0?' · เลยกำหนด '+(-dd)+' วัน':' · อีก '+dd+' วัน')+'</span>');
    const today=calToday(),seen={};
    last.params.forEach(p=>p.stds.forEach(s=>{if(!s.exp)return;const k=p.name+'|'+(s.lot||s.label);if(seen[k])return;seen[k]=1;const d=calDays(today,s.exp);
      if(d<0)al.push('<span class="cal-pill cal-bad">🧪 '+calEsc(p.name)+' Lot '+calEsc(s.lot||s.label)+' หมดอายุแล้ว ('+calThM(s.exp)+')</span>');
      else if(d<=S.expWarnD)al.push('<span class="cal-pill cal-warn">🧪 '+calEsc(p.name)+' Lot '+calEsc(s.lot||s.label)+' หมดอายุใน '+d+' วัน</span>');}));
    const noLot=last.params.filter(p=>p.stds.some(s=>!s.exp&&!(s.tv===0))).map(p=>p.name);
    if(noLot.length)al.push('<span class="cal-pill cal-mut">ยังไม่ได้บันทึก Lot/วันหมดอายุ: '+calEsc(noLot.join(', '))+'</span>');
  }
  /* การ์ดเครื่อง */
  const lastEval=last?calEval(last):null;
  const devCards=devs.map(d=>{
    let st='<span class="cal-pill cal-mut" style="padding:3px 8px;font-size:11px">ยังไม่มีผล</span>';
    const inLast=last&&last.devs.find(x=>x.id===d.id);
    if(inLast){const e=lastEval.dev[d.id];const nf=e.fails.length;
      st='<span class="cal-pill '+(nf?'cal-bad':'cal-ok')+'" style="padding:3px 8px;font-size:11px">'+(nf?'❌ ไม่ผ่าน '+nf+' จุด':'✅ ผ่านทุกจุด')+'</span> <span style="font-size:11px;color:#889">รอบ '+calThD(last.date)+' · '+e.pass+'/'+e.n+'</span>'+
        (nf?'<div style="font-size:11px;color:#b3261e;margin-top:4px">'+e.fails.slice(0,3).map(calEsc).join('<br>')+(nf>3?'<br>…':'')+'</div>':'');}
    return '<div class="cal-dev" onclick="calShowHist(\''+d.id+'\')"><div class="nm">'+(d.ref?'⭐ ':'')+calEsc(d.name)+'</div><div class="sub">'+calEsc([d.brand,d.model].filter(Boolean).join(' ')||'ยังไม่ระบุยี่ห้อ/รุ่น')+(d.note?' · '+calEsc(d.note):'')+'</div>'+st+'</div>';
  }).join('')||'<div style="font-size:12px;color:#889">ยังไม่มีเครื่องมือ — กด 🧰 จัดการเครื่องมือ</div>';
  /* รายการรอบ */
  const rows=rounds.map(r=>{const e=calEval(r);const nf=Object.values(e.dev).reduce((a,x)=>a+x.fails.length,0);
    return '<tr><td><b>'+calThD(r.date)+'</b></td><td>'+calEsc(r.title||'')+'</td><td>'+r.devs.map(d=>{const x=e.dev[d.id];return '<span class="cal-v '+(x.fails.length?'bad':'ok')+'" style="margin:1px 2px;font-weight:500">'+calEsc(d.name)+'</span>';}).join('')+'</td>'+
      '<td class="c">'+(nf?'<span class="cal-v bad">'+nf+'</span>':'<span class="cal-v ok">0</span>')+(e.expUsed.length?' <span title="ใช้สารมาตรฐานหมดอายุ" class="cal-v bad">⚠ สารหมดอายุ</span>':'')+'</td>'+
      '<td style="white-space:nowrap"><button class="chip-btn" onclick="calView(\''+r.id+'\')">👁 ดู</button> <button class="chip-btn" onclick="calEdit(\''+r.id+'\')">✏️</button> <button class="chip-btn" onclick="calPrint(\''+r.id+'\')">🖨</button> <button class="chip-btn" onclick="calDelRound(\''+r.id+'\')">🗑</button></td></tr>';}).join('');
  body.innerHTML=
    '<div class="qcard"><div class="cal-alert">'+al.join('')+'</div></div>'+
    '<div class="qcard"><b style="font-size:13.5px">🧰 เครื่องมือ Portable ('+devs.length+')</b> <span style="font-size:11px;color:#889">แตะการ์ดเพื่อดูประวัติรายเครื่อง · ⭐ = เครื่องอ้างอิงสำหรับ %RPD</span><div class="cal-devs" style="margin-top:8px">'+devCards+'</div></div>'+
    '<div id="cal-hist"></div>'+
    '<div class="qcard"><b style="font-size:13.5px">📋 รอบการสอบเทียบ ('+rounds.length+')</b>'+
    (rows?'<div class="cal-scroll"><table class="cal-tb" style="margin-top:8px"><thead><tr><th>วันที่</th><th>หัวเรื่อง</th><th>เครื่องที่ทดสอบ (แดง = มีจุดไม่ผ่าน)</th><th class="c">จุดไม่ผ่าน</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<div style="font-size:12px;color:#889;margin-top:6px">— ยังไม่มี —</div>')+
    '<div style="font-size:11px;color:#889;margin-top:8px">เกณฑ์: ค่าที่อ่านได้ต้องอยู่ในช่วง ค่าจริง ± ช่วงยอมรับ (รวมค่าที่ตรงขอบ) · Sample: |%RPD| เทียบเครื่องอ้างอิง ≤ '+S.rpd+'% · รอบสอบเทียบทุก '+S.intervalM+' เดือน</div></div>';
  if(CAL.histDev&&CAL.devices[CAL.histDev])calShowHist(CAL.histDev,true);
}

/* ── ประวัติรายเครื่อง ── */
function calShowHist(devId,keep){
  const box=document.getElementById('cal-hist'); if(!box)return;
  if(!keep&&CAL.histDev===devId&&box.innerHTML){box.innerHTML='';CAL.histDev=null;return;}
  CAL.histDev=devId;
  const d=CAL.devices[devId]||{name:devId};
  const rs=calRoundList().filter(r=>r.devs.find(x=>x.id===devId)).reverse(); // เก่า→ใหม่
  if(!rs.length){box.innerHTML='<div class="qcard"><b>📈 '+calEsc(d.name)+'</b><div style="font-size:12px;color:#889;margin-top:6px">ยังไม่มีผลสอบเทียบ</div></div>';return;}
  /* แถว = พารามิเตอร์·มาตรฐาน (ตาม label) */
  const keys=[];const seen={};
  rs.forEach(r=>r.params.forEach(p=>{p.stds.forEach(s=>{const k=p.name+'|'+s.label;if(!seen[k]){seen[k]=1;keys.push({p:p.name,unit:p.unit,label:s.label,k});}});const k=p.name+'|#S';if(!seen[k]){seen[k]=1;keys.push({p:p.name,label:'Sample %RPD',k,sample:true});}}));
  let curP='',tr='';
  keys.forEach(K=>{
    if(K.p!==curP){curP=K.p;tr+='<tr class="ph"><td colspan="'+(rs.length+1)+'">'+calEsc(K.p)+(K.unit?' ('+calEsc(K.unit)+')':'')+'</td></tr>';}
    tr+='<tr><td style="white-space:nowrap">'+calEsc(K.label)+'</td>'+rs.map(r=>{
      const p=r.params.find(x=>x.name===K.p); if(!p)return '<td class="c"><span class="cal-v na">–</span></td>';
      if(K.sample){if(devId===r.ref)return '<td class="c"><span class="cal-v na" title="เครื่องอ้างอิง">อ้างอิง</span></td>';const v=calRpd(calNum(p.sample[r.ref]),calNum(p.sample[devId]));
        return '<td class="c">'+(v==null?'<span class="cal-v na">–</span>':'<span class="cal-v '+(Math.abs(v)<=CAL.settings.rpd+1e-9?'ok':'bad')+'">'+v.toFixed(1)+'%</span>')+'</td>';}
      const s=p.stds.find(x=>x.label===K.label); if(!s)return '<td class="c"><span class="cal-v na">–</span></td>';
      const x=calNum(s.r[devId]),ok=calPass(s,x);
      return '<td class="c" title="ค่าจริง '+calFmt(s.tv)+' · ช่วง '+calRange(s).map(calFmt).join('–')+'">'+(x==null?'<span class="cal-v na">–</span>':'<span class="cal-v '+(ok?'ok':'bad')+'">'+calFmt(x)+'</span>')+'</td>';
    }).join('')+'</tr>';
  });
  const params=[...new Set(keys.map(k=>k.p))];
  box.innerHTML='<div class="qcard"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:13.5px">📈 ประวัติ — '+calEsc(d.name)+'</b><span><select id="cal-hist-p" onchange="calHistChart()">'+params.map(p=>'<option>'+calEsc(p)+'</option>').join('')+'</select> <button class="chip-btn" onclick="document.getElementById(\'cal-hist\').innerHTML=\'\';CAL.histDev=null">✕ ปิด</button></span></div>'+
    '<div style="height:230px;margin:8px 0"><canvas id="cal-hist-cv"></canvas></div>'+
    '<div style="font-size:11px;color:#889;margin-bottom:6px">กราฟ: ความคลาดเคลื่อนเทียบช่วงยอมรับ (0% = ตรงค่าจริง, ±100% = ขอบเกณฑ์, เกิน = ไม่ผ่าน)</div>'+
    '<div class="cal-scroll"><table class="cal-tb"><thead><tr><th>มาตรฐาน</th>'+rs.map(r=>'<th class="c">'+calThD(r.date)+'</th>').join('')+'</tr></thead><tbody>'+tr+'</tbody></table></div></div>';
  box._rs=rs;box._dev=devId;
  calHistChart();
}
function calHistChart(){
  const box=document.getElementById('cal-hist'),cv=document.getElementById('cal-hist-cv');if(!cv||!box._rs||typeof Chart==='undefined')return;
  const pn=document.getElementById('cal-hist-p').value,rs=box._rs,dev=box._dev;
  const labels=[...new Set(rs.flatMap(r=>(r.params.find(p=>p.name===pn)||{stds:[]}).stds.map(s=>s.label)))];
  const pal=['#4a56d6','#0f9d8a','#e8833a','#c2417b','#7a5af5','#2f9e44'];
  const ds=labels.map((lb,i)=>({label:lb,borderColor:pal[i%pal.length],backgroundColor:pal[i%pal.length],tension:.2,spanGaps:true,
    data:rs.map(r=>{const p=r.params.find(x=>x.name===pn);const s=p&&p.stds.find(x=>x.label===lb);if(!s)return null;const x=calNum(s.r[dev]);const L=calLim(s);if(x==null)return null;if(!L)return x===s.tv?0:(x>s.tv?150:-150);return +((x-s.tv)/L*100).toFixed(1);})}));
  ds.push({label:'ขอบเกณฑ์',data:rs.map(()=>100),borderColor:'#e05a4f',borderDash:[5,4],pointRadius:0,borderWidth:1},{label:'',data:rs.map(()=>-100),borderColor:'#e05a4f',borderDash:[5,4],pointRadius:0,borderWidth:1});
  if(_calChart)_calChart.destroy();
  _calChart=new Chart(cv,{type:'line',data:{labels:rs.map(r=>calThD(r.date)),datasets:ds},options:{maintainAspectRatio:false,plugins:{legend:{labels:{filter:i=>i.text!==''}}},scales:{y:{title:{display:true,text:'% ของช่วงยอมรับ'},suggestedMin:-120,suggestedMax:120}}}});
}

/* ── modal ── */
function calModal(html){
  let m=document.getElementById('cal-modal');
  if(!m){m=document.createElement('div');m.id='cal-modal';document.body.appendChild(m);m.addEventListener('mousedown',e=>{if(e.target===m)calClose();});}
  m.innerHTML='<div class="box">'+html+'</div>';m.style.display='flex';
}
function calClose(){const m=document.getElementById('cal-modal');if(m){m.style.display='none';m.innerHTML='';}}

/* ── ดูรอบ (อ่านอย่างเดียว) ── */
function calRoundTable(r){
  const lim=CAL.settings.rpd;
  let h='<div class="cal-scroll"><table class="cal-tb"><thead><tr><th>มาตรฐาน</th><th>Lot / Exp.</th><th class="c">ค่าจริง</th><th class="c">ช่วงยอมรับ</th>'+r.devs.map(d=>'<th class="c">'+(d.id===r.ref?'⭐ ':'')+calEsc(d.name)+'<div style="font-weight:400;font-size:10.5px;color:#6b7690">'+calEsc([d.brand,d.model].filter(Boolean).join(' '))+'</div></th>').join('')+'</tr></thead><tbody>';
  r.params.forEach(p=>{
    h+='<tr class="ph"><td colspan="'+(4+r.devs.length)+'">'+calEsc(p.name)+(p.unit?' ('+calEsc(p.unit)+')':'')+'</td></tr>';
    p.stds.forEach(s=>{const rg=calRange(s);const expd=s.exp&&r.date&&s.exp<r.date;
      h+='<tr><td>'+calEsc(s.label)+'</td><td style="font-size:11px">'+calEsc(s.lot||'')+(s.exp?' <span style="color:'+(expd?'#b3261e;font-weight:700':'#889')+'">'+calThM(s.exp)+(expd?' ⚠หมดอายุ':'')+'</span>':'')+'</td><td class="c">'+calFmt(s.tv)+'</td><td class="c" style="font-size:11px">'+(s.mode==='pct'?'±'+s.tol+'% ':'±'+calFmt(s.tol)+' ')+'('+rg.map(calFmt).join('–')+')</td>'+
        r.devs.map(d=>{const x=calNum(s.r[d.id]);const ok=calPass(s,x);return '<td class="c">'+(x==null?'<span class="cal-v na">–</span>':'<span class="cal-v '+(ok?'ok':'bad')+'">'+calFmt(x)+'</span>')+'</td>';}).join('')+'</tr>';});
    const R=calNum(p.sample[r.ref]);
    h+='<tr><td>Sample</td><td></td><td class="c" colspan="2" style="font-size:11px">|%RPD| ≤ '+lim+'</td>'+r.devs.map(d=>{const x=calNum(p.sample[d.id]);if(x==null)return '<td class="c"><span class="cal-v na">–</span></td>';
      if(d.id===r.ref)return '<td class="c"><b>'+calFmt(x)+'</b><div style="font-size:10px;color:#889">อ้างอิง</div></td>';const v=calRpd(R,x);const ok=v!=null&&Math.abs(v)<=lim+1e-9;
      return '<td class="c">'+calFmt(x)+'<div><span class="cal-v '+(v==null?'na':ok?'ok':'bad')+'" style="font-size:10.5px">'+(v==null?'–':v.toFixed(1)+'%')+'</span></div></td>';}).join('')+'</tr>';
  });
  h+='<tr class="ph"><td colspan="4">ผู้ทดสอบ / วันที่ทดสอบ</td>'+r.devs.map(d=>'<td class="c" style="font-weight:400">'+calEsc(d.tester||'–')+'<div style="font-size:10.5px;color:#889">'+(d.tdate?calThD(d.tdate):'')+'</div></td>').join('')+'</tr>';
  return h+'</tbody></table></div>';
}
function calView(id){
  const r=Object.assign({id},CAL.rounds[id]);const e=calEval(r);
  const sum=r.devs.map(d=>{const x=e.dev[d.id];return '<div style="font-size:12px;margin:2px 0"><b>'+calEsc(d.name)+'</b>: '+(x.fails.length?'<span style="color:#b3261e">ไม่ผ่าน '+x.fails.length+' จุด — '+x.fails.map(calEsc).join(' · ')+'</span>':'<span style="color:#177a3d">ผ่านทุกจุด ('+x.pass+'/'+x.n+')</span>')+'</div>';}).join('');
  calModal('<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h2>🧪 สอบเทียบ '+calThD(r.date)+(r.title?' · '+calEsc(r.title):'')+'</h2><span><button class="chip-btn" onclick="calEdit(\''+id+'\')">✏️ แก้ไข</button> <button class="chip-btn" onclick="calPrint(\''+id+'\')">🖨 พิมพ์</button> <button class="chip-btn" onclick="calClose()">✕</button></span></div>'+
    (e.expUsed.length?'<div class="cal-pill cal-bad" style="margin-bottom:8px">⚠ ใช้สารมาตรฐานที่หมดอายุแล้ว ณ วันทดสอบ: '+e.expUsed.map(x=>calEsc(x.p+' '+x.lot+' ('+calThM(x.exp)+')')).join(', ')+'</div>':'')+
    '<div style="margin-bottom:10px">'+sum+'</div>'+calRoundTable(r)+
    '<div style="font-size:11px;color:#889;margin-top:8px">บันทึกโดย '+calEsc(r.by||'–')+(r.ts?' · '+new Date(r.ts).toLocaleString('th-TH'):'')+'</div>');
}

/* ── ฟอร์มบันทึก/แก้ไขรอบ ── */
let _calDraft=null;
function calNew(){
  const last=calRoundList()[0], devs=calDevList();
  if(!devs.length){alert('ยังไม่มีเครื่องมือ — เพิ่มที่ 🧰 จัดการเครื่องมือ ก่อน');calDevices();return;}
  const tpl=last?JSON.parse(JSON.stringify(last.params)):JSON.parse(JSON.stringify(CAL_DEFAULT_PARAMS));
  tpl.forEach(p=>{p.stds.forEach(s=>s.r={});p.sample={};});
  const ref=(devs.find(d=>d.ref)||devs[0]).id;
  _calDraft={id:null,date:calToday(),title:'',ref,devs:devs.map(d=>({id:d.id,name:d.name,brand:d.brand||'',model:d.model||'',tester:'',tdate:''})),params:tpl};
  calForm();
}
function calEdit(id){
  _calDraft=JSON.parse(JSON.stringify(Object.assign({id},CAL.rounds[id])));calNorm(_calDraft);calForm();
}
function calForm(){
  const D=_calDraft, all=calDevList(true);
  const devChk=all.map(d=>{const on=D.devs.find(x=>x.id===d.id);return '<label style="display:inline-flex;align-items:center;gap:4px;margin:0 10px 4px 0;font-size:12px;color:#20293a"><input type="checkbox" '+(on?'checked':'')+' onchange="calToggleDev(\''+d.id+'\',this.checked)">'+calEsc(d.name)+(d.active===false?' <span style="color:#aab">(เลิกใช้)</span>':'')+'</label>';}).join('');
  let h='<div style="display:flex;justify-content:space-between;align-items:center"><h2>'+(D.id?'✏️ แก้ไขรอบสอบเทียบ':'➕ บันทึกรอบสอบเทียบใหม่')+'</h2><button class="chip-btn" onclick="calClose()">✕</button></div>'+
   '<div class="meta-grid"><div><label>วันที่สอบเทียบ</label><input type="date" value="'+calEsc(D.date)+'" onchange="_calDraft.date=this.value"></div>'+
   '<div><label>หัวเรื่อง (เช่น เดือน ก.ย. 2569)</label><input type="text" style="width:100%" value="'+calEsc(D.title||'')+'" onchange="_calDraft.title=this.value"></div>'+
   '<div><label>เครื่องอ้างอิงสำหรับ %RPD</label><select onchange="_calDraft.ref=this.value;calLive()">'+D.devs.map(d=>'<option value="'+d.id+'" '+(d.id===D.ref?'selected':'')+'>'+calEsc(d.name)+'</option>').join('')+'</select></div></div>'+
   '<div style="margin-bottom:10px"><label>เครื่องที่ทดสอบรอบนี้</label>'+devChk+'</div>';
  h+='<div class="cal-scroll"><table class="cal-tb"><thead><tr><th>มาตรฐาน</th><th>Lot</th><th>Exp.</th><th class="c">ค่าจริง</th><th class="c">±</th><th class="c">หน่วย ±</th>'+D.devs.map(d=>'<th class="c">'+(d.id===D.ref?'⭐ ':'')+calEsc(d.name)+'</th>').join('')+'<th></th></tr></thead><tbody>';
  D.params.forEach((p,pi)=>{
    h+='<tr class="ph"><td colspan="'+(7+D.devs.length)+'"><input type="text" value="'+calEsc(p.name)+'" style="width:170px;font-weight:700" onchange="_calDraft.params['+pi+'].name=this.value"> <input type="text" value="'+calEsc(p.unit||'')+'" placeholder="หน่วย" style="width:70px" onchange="_calDraft.params['+pi+'].unit=this.value"> <button class="chip-btn" style="padding:3px 8px" onclick="calAddStd('+pi+')">➕ แถวมาตรฐาน</button> <button class="cal-x" title="ลบพารามิเตอร์" onclick="calDelParam('+pi+')">🗑</button></td></tr>';
    p.stds.forEach((s,si)=>{const b='_calDraft.params['+pi+'].stds['+si+']';
      h+='<tr><td><input type="text" value="'+calEsc(s.label)+'" style="width:78px" onchange="'+b+'.label=this.value"></td>'+
       '<td><input type="text" value="'+calEsc(s.lot||'')+'" style="width:86px" onchange="'+b+'.lot=this.value"></td>'+
       '<td><input type="date" value="'+calEsc(s.exp||'')+'" style="width:128px" onchange="'+b+'.exp=this.value"></td>'+
       '<td class="c"><input class="in" type="text" inputmode="decimal" value="'+calFmt(s.tv)+'" onchange="'+b+'.tv=calNum(this.value)||0;calLive()"></td>'+
       '<td class="c"><input class="in" style="width:58px" type="text" inputmode="decimal" value="'+calFmt(s.tol)+'" onchange="'+b+'.tol=calNum(this.value)||0;calLive()"></td>'+
       '<td class="c"><select onchange="'+b+'.mode=this.value;calLive()"><option value="abs" '+(s.mode!=='pct'?'selected':'')+'>ค่า</option><option value="pct" '+(s.mode==='pct'?'selected':'')+'>%</option></select></td>'+
       D.devs.map(d=>'<td class="c"><input class="in" data-k="s" data-p="'+pi+'" data-s="'+si+'" data-d="'+d.id+'" type="text" inputmode="decimal" value="'+calFmt(calNum(s.r[d.id]))+'" oninput="'+b+'.r[\''+d.id+'\']=calNum(this.value);calLive()"></td>').join('')+
       '<td><button class="cal-x" onclick="calDelStd('+pi+','+si+')">✕</button></td></tr>';});
    h+='<tr><td><b>Sample</b></td><td colspan="5" style="font-size:11px;color:#889">|%RPD| เทียบเครื่องอ้างอิง ≤ '+CAL.settings.rpd+'</td>'+D.devs.map(d=>'<td class="c"><input class="in" data-k="m" data-p="'+pi+'" data-d="'+d.id+'" type="text" inputmode="decimal" value="'+calFmt(calNum(p.sample[d.id]))+'" oninput="_calDraft.params['+pi+'].sample[\''+d.id+'\']=calNum(this.value);calLive()"><div class="rpd" data-p="'+pi+'" data-d="'+d.id+'" style="font-size:10.5px"></div></td>').join('')+'<td></td></tr>';
  });
  h+='<tr class="ph"><td colspan="6">ยี่ห้อ / รุ่น / ผู้ทดสอบ / วันที่ทดสอบ</td>'+D.devs.map((d,di)=>{const b='_calDraft.devs['+di+']';return '<td class="c" style="font-weight:400"><input type="text" placeholder="ยี่ห้อ" value="'+calEsc(d.brand)+'" style="width:96px;margin-bottom:3px" onchange="'+b+'.brand=this.value"><br><input type="text" placeholder="รุ่น" value="'+calEsc(d.model)+'" style="width:96px;margin-bottom:3px" onchange="'+b+'.model=this.value"><br><input type="text" placeholder="ผู้ทดสอบ" value="'+calEsc(d.tester)+'" style="width:96px;margin-bottom:3px" onchange="'+b+'.tester=this.value"><br><input type="date" value="'+calEsc(d.tdate)+'" style="width:120px" onchange="'+b+'.tdate=this.value"></td>';}).join('')+'<td></td></tr>';
  h+='</tbody></table></div><div style="display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:12px;flex-wrap:wrap"><button class="chip-btn" onclick="calAddParam()">➕ เพิ่มพารามิเตอร์</button><span><span id="cal-live-sum" style="font-size:12px;margin-right:10px"></span><button class="chip-btn primary" onclick="calSave()">💾 บันทึก</button></span></div>';
  calModal(h);calLive();
}
function calToggleDev(id,on){
  const D=_calDraft;
  if(on){const d=CAL.devices[id];if(!D.devs.find(x=>x.id===id))D.devs.push({id,name:d.name,brand:d.brand||'',model:d.model||'',tester:'',tdate:''});}
  else{D.devs=D.devs.filter(x=>x.id!==id);if(D.ref===id&&D.devs[0])D.ref=D.devs[0].id;}
  const order=calDevList(true).map(d=>d.id);D.devs.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  calForm();
}
function calAddStd(pi){_calDraft.params[pi].stds.push({label:'STD',tv:0,tol:0,mode:'abs',r:{}});calForm();}
function calDelStd(pi,si){_calDraft.params[pi].stds.splice(si,1);calForm();}
function calAddParam(){const n=prompt('ชื่อพารามิเตอร์ใหม่ (เช่น DO, อุณหภูมิ):');if(!n)return;const u=prompt('หน่วย:','')||'';_calDraft.params.push({key:calKey(n),name:n.trim(),unit:u,stds:[{label:'STD1',tv:0,tol:0,mode:'abs',r:{}}],sample:{}});calForm();}
function calDelParam(pi){if(!confirm('ลบพารามิเตอร์ '+_calDraft.params[pi].name+' ออกจากรอบนี้?'))return;_calDraft.params.splice(pi,1);calForm();}
function calLive(){
  const D=_calDraft;let n=0,f=0;
  document.querySelectorAll('#cal-modal .in[data-k="s"]').forEach(el=>{const s=D.params[+el.dataset.p].stds[+el.dataset.s];const ok=calPass(s,calNum(el.value));el.classList.toggle('ok',ok===true);el.classList.toggle('bad',ok===false);if(ok!=null){n++;if(!ok)f++;}});
  document.querySelectorAll('#cal-modal .rpd').forEach(el=>{const p=D.params[+el.dataset.p],d=el.dataset.d;const inp=el.previousElementSibling;
    if(d===D.ref){el.textContent=calNum(p.sample[d])!=null?'อ้างอิง':'';el.style.color='#889';inp.classList.remove('ok','bad');return;}
    const v=calRpd(calNum(p.sample[D.ref]),calNum(p.sample[d]));if(v==null){el.textContent='';inp.classList.remove('ok','bad');return;}
    const ok=Math.abs(v)<=CAL.settings.rpd+1e-9;n++;if(!ok)f++;el.textContent='RPD '+v.toFixed(1)+'%';el.style.color=ok?'#177a3d':'#b3261e';inp.classList.toggle('ok',ok);inp.classList.toggle('bad',!ok);});
  const el=document.getElementById('cal-live-sum');if(el)el.innerHTML=n?(f?'<b style="color:#b3261e">ไม่ผ่าน '+f+'</b> / '+n+' จุด':'<b style="color:#177a3d">ผ่านทั้งหมด '+n+' จุด</b>'):'';
}
function calClean(D){
  return {date:D.date,title:D.title||'',ref:D.ref,
    devs:D.devs.map(d=>({id:d.id,name:d.name,brand:d.brand||'',model:d.model||'',tester:d.tester||'',tdate:d.tdate||''})),
    params:D.params.map(p=>({key:p.key||calKey(p.name),name:p.name,unit:p.unit||'',
      stds:p.stds.map(s=>{const r={};Object.entries(s.r||{}).forEach(([k,v])=>{if(v!=null&&D.devs.find(d=>d.id===k))r[k]=v;});return {label:s.label,tv:+s.tv||0,tol:+s.tol||0,mode:s.mode==='pct'?'pct':'abs',lot:s.lot||'',exp:s.exp||'',r};}),
      sample:Object.fromEntries(Object.entries(p.sample||{}).filter(([k,v])=>v!=null&&D.devs.find(d=>d.id===k)))}))};
}
async function calSave(){
  const by=calUser();if(!by)return;const D=_calDraft;
  if(!D.date){alert('ใส่วันที่สอบเทียบ');return;}
  if(!D.devs.length){alert('เลือกเครื่องอย่างน้อย 1 เครื่อง');return;}
  const id=D.id||calId('r');const rec=Object.assign(calClean(D),{by,ts:Date.now()});
  try{await fbSet(CAL_PATH+'/rounds/'+id,rec);
    /* อัปเดตยี่ห้อ/รุ่นล่าสุดกลับไปที่ทะเบียนเครื่อง */
    for(const d of rec.devs){const cur=CAL.devices[d.id];if(cur&&((d.brand&&d.brand!==cur.brand)||(d.model&&d.model!==cur.model))){await fbSet(CAL_PATH+'/devices/'+d.id,Object.assign({},cur,{brand:d.brand||cur.brand||'',model:d.model||cur.model||''}));}}
  }catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  calClose();await calLoad();calRender();
}
async function calDelRound(id){
  const r=CAL.rounds[id];if(!r)return;if(!calUser())return;
  if(!confirm('ลบรอบสอบเทียบ '+calThD(r.date)+' ?'))return;
  await eqFbDel(CAL_PATH+'/rounds/'+id);await calLoad();calRender();
}

/* ── จัดการเครื่องมือ ── */
function calDevices(){
  const all=calDevList(true), used=id=>Object.values(CAL.rounds).some(r=>r.devs.find(d=>d.id===id));
  const rows=all.map((d,i)=>'<tr><td><input type="text" value="'+calEsc(d.name)+'" style="width:100%" onchange="calDevSet(\''+d.id+'\',\'name\',this.value)"></td>'+
    '<td><input type="text" value="'+calEsc(d.brand||'')+'" style="width:100%" onchange="calDevSet(\''+d.id+'\',\'brand\',this.value)"></td>'+
    '<td><input type="text" value="'+calEsc(d.model||'')+'" style="width:100%" onchange="calDevSet(\''+d.id+'\',\'model\',this.value)"></td>'+
    '<td><input type="text" value="'+calEsc(d.note||'')+'" placeholder="หน่วยงาน / S/N" style="width:100%" onchange="calDevSet(\''+d.id+'\',\'note\',this.value)"></td>'+
    '<td class="c"><input type="radio" name="cal-ref" '+(d.ref?'checked':'')+' onchange="calDevRef(\''+d.id+'\')"></td>'+
    '<td class="c"><input type="checkbox" '+(d.active!==false?'checked':'')+' onchange="calDevSet(\''+d.id+'\',\'active\',this.checked)"></td>'+
    '<td style="white-space:nowrap"><button class="cal-x" title="เลื่อนขึ้น" '+(i?'':'disabled')+' onclick="calDevMove(\''+d.id+'\',-1)">▲</button><button class="cal-x" title="เลื่อนลง" onclick="calDevMove(\''+d.id+'\',1)">▼</button> '+
    (used(d.id)?'<span title="มีประวัติแล้ว — ใช้การยกเลิก “ใช้งาน” แทนการลบ" style="font-size:11px;color:#aab">มีประวัติ</span>':'<button class="cal-x" onclick="calDevDel(\''+d.id+'\')">🗑</button>')+'</td></tr>').join('');
  calModal('<div style="display:flex;justify-content:space-between;align-items:center"><h2>🧰 จัดการเครื่องมือ Portable</h2><button class="chip-btn" onclick="calClose()">✕</button></div>'+
    '<div class="cal-scroll"><table class="cal-tb"><thead><tr><th style="width:24%">ชื่อเครื่อง</th><th>ยี่ห้อ</th><th>รุ่น</th><th>หมายเหตุ</th><th class="c">⭐ อ้างอิง</th><th class="c">ใช้งาน</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="7" style="color:#889">ยังไม่มี</td></tr>')+'</tbody></table></div>'+
    '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:end"><div><label>เพิ่มเครื่องใหม่ — ชื่อ</label><input type="text" id="cal-nd-name" placeholder="เช่น PICO สาโรจน์" style="width:200px"></div><div><label>ยี่ห้อ</label><input type="text" id="cal-nd-brand" style="width:120px"></div><div><label>รุ่น</label><input type="text" id="cal-nd-model" style="width:120px"></div><button class="chip-btn primary" onclick="calDevAdd()">➕ เพิ่ม</button></div>'+
    '<div style="font-size:11px;color:#889;margin-top:10px">แก้ชื่อ/ยี่ห้อ/รุ่นแล้วบันทึกอัตโนมัติ · ไม่ใช้แล้วให้เอาเครื่องหมาย “ใช้งาน” ออก (ประวัติเดิมยังอยู่) · รอบที่บันทึกไปแล้วเก็บชื่อ ณ วันนั้นไว้</div>'+
    '<div style="margin-top:12px;border-top:1px solid #eef1f6;padding-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:end;font-size:12px"><b>⚙️ ตั้งค่า</b>'+
    '<div><label>รอบสอบเทียบทุก (เดือน)</label><input type="number" min="1" style="width:80px" value="'+CAL.settings.intervalM+'" onchange="calSetting(\'intervalM\',this.value)"></div>'+
    '<div><label>เกณฑ์ |%RPD| ไม่เกิน</label><input type="number" min="0" step="0.5" style="width:80px" value="'+CAL.settings.rpd+'" onchange="calSetting(\'rpd\',this.value)"></div>'+
    '<div><label>เตือนสารมาตรฐานก่อนหมดอายุ (วัน)</label><input type="number" min="0" style="width:80px" value="'+CAL.settings.expWarnD+'" onchange="calSetting(\'expWarnD\',this.value)"></div></div>');
}
async function calDevAdd(){
  if(!calUser())return;
  const name=(document.getElementById('cal-nd-name').value||'').trim();if(!name){alert('ใส่ชื่อเครื่อง');return;}
  const id=calId('d'),all=calDevList(true);
  const d={name,brand:(document.getElementById('cal-nd-brand').value||'').trim(),model:(document.getElementById('cal-nd-model').value||'').trim(),note:'',active:true,ref:!all.some(x=>x.ref),order:all.length};
  try{await fbSet(CAL_PATH+'/devices/'+id,d);}catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  CAL.devices[id]=d;calDevices();calRender();
}
async function calDevSet(id,k,v){
  const d=Object.assign({},CAL.devices[id]);d[k]=typeof v==='string'?v.trim():v;
  try{await fbSet(CAL_PATH+'/devices/'+id,d);}catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  CAL.devices[id]=d;calRender();
}
async function calDevRef(id){
  for(const [k,d] of Object.entries(CAL.devices)){const nv=k===id;if(!!d.ref!==nv){d.ref=nv;await fbSet(CAL_PATH+'/devices/'+k+'/ref',nv);}}
  calRender();
}
async function calDevMove(id,dir){
  const all=calDevList(true);const i=all.findIndex(d=>d.id===id),j=i+dir;if(j<0||j>=all.length)return;
  [all[i],all[j]]=[all[j],all[i]];
  for(let k=0;k<all.length;k++){if(CAL.devices[all[k].id].order!==k){CAL.devices[all[k].id].order=k;await fbSet(CAL_PATH+'/devices/'+all[k].id+'/order',k);}}
  calDevices();calRender();
}
async function calDevDel(id){
  if(!calUser())return;if(!confirm('ลบเครื่อง '+CAL.devices[id].name+' ?'))return;
  await eqFbDel(CAL_PATH+'/devices/'+id);delete CAL.devices[id];calDevices();calRender();
}
async function calSetting(k,v){
  const n=Math.max(0,+v||0);CAL.settings[k]=n;
  try{await fbSet(CAL_PATH+'/settings',CAL.settings);}catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);}
  calRender();
}

/* ── นำเข้า Excel (รูปแบบไฟล์ "บันทึกการสอบเทียบเครื่องวัดคุณภาพน้ำ Portable") ── */
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
  if(!c)return '';let v=c.v;
  if(v instanceof Date){const d=new Date(v.getTime()+12*3600e3);return d.toISOString().slice(0,10);}
  if(typeof v==='number'&&v>20000){const d=new Date(Math.round((v-25569)*864e5));return d.toISOString().slice(0,10);}
  return '';
}
function calParseSheet(ws,name){
  const rg=XLSX.utils.decode_range(ws['!ref']||'A1');
  const C=(r,c)=>ws[XLSX.utils.encode_cell({r,c})], T=(r,c)=>{const x=C(r,c);return x&&x.v!=null?String(x.v).trim():'';}, N=(r,c)=>{const x=C(r,c);return x&&typeof x.v==='number'?x.v:calNum(x&&x.v);};
  /* หาแถวหัวตาราง (มี "เกณฑ์") และคอลัมน์เครื่อง */
  let hr=-1,gc=-1;
  for(let r=rg.s.r;r<=Math.min(rg.e.r,15)&&hr<0;r++)for(let c=rg.s.c;c<=rg.e.c;c++)if(/เกณฑ์/.test(T(r,c))){hr=r;gc=c;break;}
  if(hr<0)return null;
  const cB=1,cC=2,cD=3,cE=4,cF=5,cG=6;
  const devCols=[];for(let c=gc+1;c<=rg.e.c;c++){const t=T(hr,c);if(t&&!/^(ถึง|ค่า|ผล|สรุป)/.test(t))devCols.push({c,name:t});}
  if(!devCols.length)return null;
  const devs=devCols.map(d=>({c:d.c,name:d.name,brand:'',model:'',tester:'',tdate:''}));
  const params=[];let P=null;
  const isParam=t=>/คลอรีน|ขุ่น|นำไฟฟ้า|^ph\b|^ph$|pH/i.test(t)&&!/^sample$/i.test(t);
  for(let r=hr+1;r<=rg.e.r;r++){
    const b=T(r,cB);
    if(b&&isParam(b)){const mu=b.match(/\(([^)]+)\)/);P={key:calKey(b),name:b.replace(/\s*\([^)]*\)\s*/,'').trim()||b,unit:mu?mu[1].replace(/^uS/,'µS'):'',stds:[],sample:{}};params.push(P);}
    devs.forEach(d=>{const t=T(r,d.c);const nx=T(r,d.c+1);
      if(/^ยี่ห้อ/.test(t)&&nx&&!/^รุ่น|^ยี่ห้อ/.test(nx))d.brand=d.brand||nx;
      else if(/^รุ่น/.test(t)&&nx&&!/^รุ่น|^ยี่ห้อ/.test(nx))d.model=d.model||nx;
      else if(/ผู้ทดสอบ/.test(t)&&nx)d.tester=nx;
      else if(/วันที่ทดสอบ/.test(t))d.tdate=calCellDate(C(r,d.c+1));});
    if(!P)continue;
    if(/^sample$/i.test(b)){devs.forEach(d=>{const v=N(r,d.c);if(v!=null)P.sample['c'+d.c]=v;});continue;}
    const lab=T(r,cD),tv=N(r,cE);
    if(lab&&tv!=null){
      let mode='abs',tol=N(r,cF)||0;const g=C(r,cG),f=g&&g.f?String(g.f):'';
      const mp=f.match(/\*\s*(\d+(?:\.\d+)?)\s*\/\s*100/);if(mp){mode='pct';tol=Math.abs(100-+mp[1]);}
      const s={label:/^pH\s*\d+(\.\d+)?$/i.test(lab)?'pH '+calFmt(tv):lab,tv,tol,mode,lot:(b&&!isParam(b))?b:'',exp:calCellDate(C(r,cC)),r:{}};
      devs.forEach(d=>{const v=N(r,d.c);if(v!=null)s.r['c'+d.c]=v;});
      P.stds.push(s);
    }
  }
  if(!params.length)return null;
  return {sheet:name,date:calSheetDate(name),title:(T(1,cB)||'').replace(/^เดือน\s*$/,''),devs,params};
}
let _calImp=null;
function calImportPreview(wb){
  const parsed=wb.SheetNames.map(n=>calParseSheet(wb.Sheets[n],n)).filter(Boolean);
  if(!parsed.length){alert('ไม่พบตารางสอบเทียบในไฟล์นี้ (ต้องมีหัวตาราง "เกณฑ์การยอมรับ")');return;}
  /* จับคู่ชื่อเครื่องกับทะเบียน */
  const norm=s=>String(s).replace(/\s+/g,'').toLowerCase();
  const names=[...new Set(parsed.flatMap(p=>p.devs.map(d=>d.name)))];
  const map={};names.forEach(n=>{const hit=calDevList(true).find(d=>norm(d.name)===norm(n));map[n]=hit?hit.id:null;});
  _calImp={parsed,map};
  const existing=Object.entries(CAL.rounds);
  const rows=parsed.map((p,i)=>{const dup=existing.find(([k,r])=>r.date===p.date);const nStd=p.params.reduce((a,x)=>a+x.stds.length,0);
    return '<tr><td><input type="checkbox" class="cal-imp" data-i="'+i+'" checked></td><td>'+calEsc(p.sheet)+'</td><td><input type="date" value="'+p.date+'" onchange="_calImp.parsed['+i+'].date=this.value"></td><td>'+calEsc(p.title)+'</td><td class="c">'+p.devs.length+'</td><td class="c">'+p.params.length+' / '+nStd+'</td><td>'+(dup?'<span class="cal-v bad" style="font-weight:500">มีรอบวันนี้แล้ว — จะเขียนทับ</span>':'<span class="cal-v ok" style="font-weight:500">ใหม่</span>')+'</td></tr>';}).join('');
  const maps=names.map(n=>'<tr><td>'+calEsc(n)+'</td><td>'+(map[n]?'<span class="cal-v ok" style="font-weight:500">ตรงกับ '+calEsc(CAL.devices[map[n]].name)+'</span>':'<span class="cal-v na" style="background:#eef1f6;color:#556;font-weight:500">➕ เพิ่มเป็นเครื่องใหม่</span>')+'</td></tr>').join('');
  calModal('<div style="display:flex;justify-content:space-between;align-items:center"><h2>📂 นำเข้า Excel — ตรวจก่อนบันทึก</h2><button class="chip-btn" onclick="calClose()">✕</button></div>'+
    '<div class="cal-scroll"><table class="cal-tb"><thead><tr><th></th><th>ชีต</th><th>วันที่สอบเทียบ</th><th>หัวเรื่อง</th><th class="c">เครื่อง</th><th class="c">พารามิเตอร์ / มาตรฐาน</th><th>สถานะ</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div style="margin-top:12px"><b style="font-size:12.5px">เครื่องในไฟล์</b><table class="cal-tb" style="margin-top:4px;max-width:560px"><tbody>'+maps+'</tbody></table></div>'+
    '<div style="font-size:11px;color:#889;margin-top:8px">ระบบคำนวณผ่าน/ไม่ผ่านใหม่จากค่าที่อ่านได้ ไม่ใช้ผลจากสูตรในไฟล์ · ความขุ่นอ่านเกณฑ์ ±% จากสูตรช่อง “เกณฑ์การยอมรับ” · เครื่องที่ชื่อ “การประปา…” ตั้งเป็นเครื่องอ้างอิง %RPD</div>'+
    '<div style="text-align:right;margin-top:12px"><button class="chip-btn primary" onclick="calImportDo()">💾 นำเข้ารอบที่เลือก</button></div>');
}
async function calImportDo(){
  const by=calUser();if(!by)return;const {parsed,map}=_calImp;
  const pick=[...document.querySelectorAll('.cal-imp')].filter(x=>x.checked).map(x=>parsed[+x.dataset.i]);
  if(!pick.length)return;
  try{
    /* สร้างเครื่องที่ยังไม่มี */
    let order=calDevList(true).length;
    for(const n of Object.keys(map)){if(map[n])continue;const id=calId('d');
      const src=pick.flatMap(p=>p.devs).find(d=>d.name===n)||{};
      const d={name:n,brand:src.brand||'',model:src.model||'',note:'',active:true,ref:false,order:order++};
      await fbSet(CAL_PATH+'/devices/'+id,d);CAL.devices[id]=d;map[n]=id;}
    if(!Object.values(CAL.devices).some(d=>d.ref)){const id=Object.keys(CAL.devices).find(k=>/การประปา|กปน|mwa/i.test(CAL.devices[k].name))||Object.keys(CAL.devices)[0];CAL.devices[id].ref=true;await fbSet(CAL_PATH+'/devices/'+id+'/ref',true);}
    const refId=Object.keys(CAL.devices).find(k=>CAL.devices[k].ref);
    for(const p of pick){
      const cmap={};p.devs.forEach(d=>cmap['c'+d.c]=map[d.name]);
      const remap=o=>{const r={};Object.entries(o).forEach(([k,v])=>{if(cmap[k])r[cmap[k]]=v;});return r;};
      const devs=p.devs.map(d=>({id:map[d.name],name:d.name,brand:d.brand||CAL.devices[map[d.name]].brand||'',model:d.model||CAL.devices[map[d.name]].model||'',tester:d.tester,tdate:d.tdate}));
      const ref=devs.find(d=>d.id===refId)?refId:devs[0].id;
      const D={date:p.date,title:p.title,ref,devs,params:p.params.map(x=>({key:x.key,name:x.name,unit:x.unit,stds:x.stds.map(s=>Object.assign({},s,{r:remap(s.r)})),sample:remap(x.sample)}))};
      const dup=Object.entries(CAL.rounds).find(([k,r])=>r.date===p.date);
      await fbSet(CAL_PATH+'/rounds/'+(dup?dup[0]:calId('r')),Object.assign(calClean(D),{by,ts:Date.now(),src:'excel:'+p.sheet}));
    }
  }catch(e){alert('นำเข้าไม่สำเร็จ: '+e.message);return;}
  calClose();await calLoad();calRender();alert('✅ นำเข้าแล้ว '+pick.length+' รอบ');
}

/* ── พิมพ์ (แบบฟอร์มเดิม, ผลคำนวณใหม่) ── */
function calPrint(id){
  const r=Object.assign({id},CAL.rounds[id]),lim=CAL.settings.rpd,nd=r.devs.length;
  const cell=(v,ok)=>'<td class="c">'+(v==null?'':calFmt(v))+'</td><td class="c '+(ok==null?'':ok?'p':'f')+'">'+(ok==null?'':ok?'ผ่าน':'ไม่ผ่าน')+'</td>';
  let h='<tr><th rowspan="2">Lot No.</th><th rowspan="2">Exp.</th><th rowspan="2">มาตรฐาน</th><th rowspan="2">ค่าจริง</th><th rowspan="2">เกณฑ์การยอมรับ</th>'+r.devs.map(d=>'<th colspan="2">'+calEsc(d.name)+'</th>').join('')+'</tr><tr>'+r.devs.map(()=>'<th>ค่าที่อ่านได้</th><th>สรุปผล</th>').join('')+'</tr>';
  r.params.forEach(p=>{
    h+='<tr class="ph"><td colspan="5">'+calEsc(p.name)+(p.unit?' ('+calEsc(p.unit)+')':'')+'</td>'+r.devs.map(d=>'<td colspan="2" style="font-weight:400;font-size:9pt">'+calEsc([d.brand,d.model].filter(Boolean).join(' / ')||'ยี่ห้อ/รุ่น')+'</td>').join('')+'</tr>';
    p.stds.forEach(s=>{const rg=calRange(s);h+='<tr><td>'+calEsc(s.lot||'')+'</td><td>'+(s.exp?calThD(s.exp):'')+'</td><td>'+calEsc(s.label)+'</td><td class="c">'+calFmt(s.tv)+'</td><td class="c">'+(s.tol?rg.map(calFmt).join(' – '):'= '+calFmt(s.tv))+'</td>'+r.devs.map(d=>{const x=calNum(s.r[d.id]);return cell(x,calPass(s,x));}).join('')+'</tr>';});
    const R=calNum(p.sample[r.ref]);
    h+='<tr><td colspan="3">Sample</td><td></td><td class="c">%RPD ≤ '+lim+'</td>'+r.devs.map(d=>{const x=calNum(p.sample[d.id]);if(d.id===r.ref)return '<td class="c">'+(x==null?'':calFmt(x))+'</td><td class="c">อ้างอิง</td>';const v=calRpd(R,x);
      return '<td class="c">'+(x==null?'':calFmt(x))+(v==null?'':'<div style="font-size:8pt">('+v.toFixed(1)+'%)</div>')+'</td><td class="c '+(v==null?'':Math.abs(v)<=lim+1e-9?'p':'f')+'">'+(v==null?'':Math.abs(v)<=lim+1e-9?'ผ่าน':'ไม่ผ่าน')+'</td>';}).join('')+'</tr>';
  });
  h+='<tr><td colspan="5" style="text-align:right">ผู้ทดสอบ</td>'+r.devs.map(d=>'<td colspan="2" class="c">'+calEsc(d.tester||'')+'</td>').join('')+'</tr><tr><td colspan="5" style="text-align:right">วันที่ทดสอบ</td>'+r.devs.map(d=>'<td colspan="2" class="c">'+(d.tdate?calThD(d.tdate):'')+'</td>').join('')+'</tr>';
  const w=window.open('','_blank');if(!w){alert('เบราว์เซอร์บล็อกหน้าต่างใหม่');return;}
  w.document.write('<!doctype html><html lang="th"><head><meta charset="utf-8"><title>สอบเทียบ '+calEsc(r.date)+'</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Sarabun,Tahoma,sans-serif;font-size:10pt;color:#000}h1{font-size:14pt;text-align:center;margin:0}h2{font-size:11pt;text-align:center;margin:2px 0 8px;font-weight:400}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:3px 5px}th{background:#eee}.c{text-align:center}.ph td{background:#f3f3f3;font-weight:700}.p{color:#0a6b2f}.f{color:#b00;font-weight:700}</style></head><body>'+
    '<h1>บันทึกการสอบเทียบเครื่องวัดคุณภาพน้ำ Portable</h1><h2>'+calEsc(r.title||'')+' · วันที่ '+calThD(r.date)+'</h2><table>'+h+'</table>'+
    '<div style="font-size:8.5pt;margin-top:6px">เกณฑ์: ค่าที่อ่านได้อยู่ในช่วงเกณฑ์การยอมรับ (รวมค่าที่ตรงขอบ) · Sample: %RPD เทียบ '+calEsc((r.devs.find(d=>d.id===r.ref)||{}).name||'')+' ไม่เกิน ±'+lim+'%</div>'+
    '<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>');
  w.document.close();
}
