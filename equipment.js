/* equipment.js — เมนูเปลี่ยนอุปกรณ์/เซ็นเซอร์ + Stock + สรุป (แยกจาก dashboard.html 29/08/69) */

/* ═══════════ เปลี่ยนอุปกรณ์/เซ็นเซอร์ + Stock (Firebase RTDB REST) ═══════════
   โครงข้อมูล:
   equipment/{stationId}/{paramKey}/{partId} = {part,brand,start,'lifeM',by,ts}
   equipment_meta/params  = ["FRC","Turbidity",...]   (เพิ่มได้)
   equipment_meta/brands  = {b1:"Hach CL17sc",...}    (ลิสต์กลาง เพิ่มอัตโนมัติ)
   stock/items/{key}      = {param,part,brand,qty}    key = slug(param|part|brand)
   stock/log/{push}       = {t:'in'|'out',param,part,brand,qty,by,station?,note?,ts}
   equipment_log/{push}   = {station,param,part,brand,action,by,ts,detail}          */
const FB_URL='https://frc-contour-default-rtdb.asia-southeast1.firebasedatabase.app';
const EQUIP_STATIONS=[{"id": "SW01", "name": "สถานีสูบจ่ายน้ำลุมพินี"}, {"id": "SM02", "name": "สำนักงานประปาสาขาทุ่งมหาเมฆ"}, {"id": "SW11", "name": "สถานีสูบจ่ายน้ำพหลโยธิน"}, {"id": "SW02", "name": "สถานีสูบจ่ายน้ำลาดพร้าว"}, {"id": "S008", "name": "บริษัท โอสถสภา จำกัด (มหาชน)"}, {"id": "S009", "name": "สถานคุ้มครองและพัฒนาอาชีพบ้านเกร็ดตระการ"}, {"id": "SW03", "name": "สถานีสูบจ่ายน้ำคลองเตย"}, {"id": "S010", "name": "ศูนย์วิทยาศาสตร์เพื่อการศึกษาแห่งชาติ"}, {"id": "SM03", "name": "สำนักงานประปาสาขาสุขุมวิท-พระโขนง"}, {"id": "SW04", "name": "สถานีสูบจ่ายน้ำสำโรง"}, {"id": "S011", "name": "บริษัท ศิครินทร์ จำกัด (มหาชน) (โรงพยาบาลศิครินทร์)"}, {"id": "S012", "name": "โรงเรียนหาดอมราอักษรลักษณ์วิทยา"}, {"id": "S013", "name": "บริษัท เอจีซี แฟลทกลาส (ประเทศไทย) จำกัด (มหาชน)"}, {"id": "SM04", "name": "สำนักงานประปาสาขาสมุทรปราการ"}, {"id": "S014", "name": "โรงไฟฟ้าพระนครใต้"}, {"id": "SW05", "name": "สถานีสูบจ่ายน้ำมีนบุรี"}, {"id": "S015", "name": "บริษัท มหาจักรออโตพาร์ท จำกัด"}, {"id": "SM05", "name": "สำนักงานประปาสาขามีนบุรี"}, {"id": "S016", "name": "นิคมอุตสาหกรรมบางชัน"}, {"id": "S017", "name": "ศูนย์ไตเทียมเทียนฟ้าประชาการุณย์"}, {"id": "SW06", "name": "สถานีสูบจ่ายน้ำลาดกระบัง"}, {"id": "S019", "name": "บริษัท ท่าอากาศยานไทย มหาชน จำกัด (สุวรรณภูมิ)"}, {"id": "S018", "name": "นิคมอุตสาหกรรมลาดกระบัง"}, {"id": "S020", "name": "มหาวิทยาลัยหัวเฉียวเฉลิมพระเกียรติ (วิทยาเขตบางพลี)"}, {"id": "SW07", "name": "สถานีสูบจ่ายน้ำบางพลี"}, {"id": "S021", "name": "นิคมอุตสาหกรรมบางพลี"}, {"id": "S022", "name": "สถานีตำรวจภูธรคลองด่าน"}, {"id": "S023", "name": "นิคมอุตสาหกรรมบางปู"}, {"id": "SM01", "name": "สำนักงานประปาสาขานนทบุรี"}, {"id": "S003", "name": "กองพันทหารสื่อสาร กองบัญชาการกองทัพไทย"}, {"id": "S002", "name": "โรงเรียนทหารขนส่ง กรมการขนส่งทหารบก"}, {"id": "S005", "name": "โรงพยาบาลซีจีเอช สายไหม"}, {"id": "S004", "name": "โรงพยาบาลภูมิพลอดุลยเดช"}, {"id": "SW08", "name": "สถานีสูบจ่ายน้ำราษฎร์บูรณะ"}, {"id": "S026", "name": "ม.เทคโนโลยีพระจอมเกล้าธนบุรี (วิทยาเขตบางขุนเทียน)"}, {"id": "S025", "name": "ศูนย์กีฬาเฉลิมพระเกียรติ"}, {"id": "SW09", "name": "สถานีสูบจ่ายน้ำเพชรเกษม"}, {"id": "S027", "name": "มหาวิทยาลัยเอเชียอาคเนย์"}, {"id": "S028", "name": "เรือนจำพิเศษธนบุรี"}, {"id": "SW10", "name": "สถานีสูบจ่ายน้ำท่าพระ"}, {"id": "S024", "name": "ศูนย์พัฒนาการจัดสวัสดิการสังคมผู้สูงอายุบ้านบางแค (บ้านพักคนชราบางแค)"}, {"id": "S029", "name": "โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี) นนทบุรี"}, {"id": "S032", "name": "โรงเรียนตั้งพิรุฬห์ธรรม"}, {"id": "SM06", "name": "สำนักงานประปาสาขาบางบัวทอง"}, {"id": "S030", "name": "โรงเรียนราชวินิต นนทบุรี"}, {"id": "S001", "name": "โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า นนทบุรี"}, {"id": "S031", "name": "สถานีตำรวจภูธรไทรน้อย"}, {"id": "S007", "name": "โรงพยาบาลศิริราช"}, {"id": "S006", "name": "พระราชวังดุสิต สวนจิตรลดา"}];
const EQ_DEFAULT_PARAMS=['คลอรีนอิสระคงเหลือ (FRC)','Turbidity','Conductivity','pH'];
const EQ_DEFAULT_PARTS=['Sensor','Transmitter','Cartridge'];
/* ชื่อแสดงผลพารามิเตอร์ — เปลี่ยนเฉพาะหน้าจอ ไม่แตะ key ใน Firebase */
const EQ_DISPLAY={
 'คลอรีนอิสระคงเหลือ (FRC)':'คลอรีนอิสระคงเหลือ (Free Residual Chlorine)',
 'Turbidity':'ความขุ่น (Turbidity)',
 'Conductivity':'ความนำไฟฟ้า (Conductivity)',
 'pH':'พีเอช (pH)'
};
const eqDisplay=n=>EQ_DISPLAY[(n||'').replace(/_/g,' ')]||n;
async function fbGet(p){const r=await fetch(FB_URL+'/'+p+'.json');if(!r.ok)throw new Error('GET '+p+' '+r.status);return r.json();}
async function fbSet(p,v){const r=await fetch(FB_URL+'/'+p+'.json',{method:'PUT',body:JSON.stringify(v)});if(!r.ok)throw new Error('PUT '+p+' '+r.status);return r.json();}
async function fbPush(p,v){const r=await fetch(FB_URL+'/'+p+'.json',{method:'POST',body:JSON.stringify(v)});if(!r.ok)throw new Error('POST '+p+' '+r.status);return r.json();}
async function eqFbDel(p){await fetch(FB_URL+'/'+p+'.json',{method:'DELETE'});}
const eqSlug=s=>s.replace(/[.#$\[\]\/\s]+/g,'_').replace(/_+$/,'');
const eqUser=()=>{const v=(document.getElementById('eq-user').value||'').trim();if(!v){alert('กรุณากรอกชื่อผู้บันทึกก่อน (ช่องบนขวา)');return null;}localStorage.setItem('eq_user',v);return v;};
const eqThD=iso=>{if(!iso)return '–';const d=new Date(iso+'T00:00:00');return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'});};

/* อายุ/กำหนดเปลี่ยน: แสดงเป็นเดือน, เหลือ ≤31 วัน นับวัน(เหลือง), เกิน = แดง */
function eqDue(start,lifeM){
  if(!start||!lifeM)return null;
  const d=new Date(start+'T00:00:00'); d.setMonth(d.getMonth()+ +lifeM);
  const days=Math.floor((d-new Date())/864e5);
  let cls,txt;
  if(days<0){cls='bad';txt='เกินกำหนด '+(-days)+' วัน';}
  else if(days<=31){cls='warn';txt='เหลือ '+days+' วัน';}
  else{const m=Math.floor(days/30.44);cls='ok';txt='เหลือ ~'+m+' เดือน';}
  return {due:d,days,cls,txt};
}
const EQ_BADGE={ok:'background:#e6f6ea;color:#177a3d;',warn:'background:#fff3d6;color:#9a6a00;',bad:'background:#fde3e0;color:#b3261e;'};

let _eqMeta={params:null,brands:{}}, _eqData=null, _stItems=null;
async function eqLoadMeta(){
  try{
    const m=await fbGet('equipment_meta')||{};
    _eqMeta.params=m.params&&m.params.length?m.params:EQ_DEFAULT_PARAMS.slice();
    _eqMeta.brands=m.brands||{};
    _eqMeta.lowTh=(m.lowStockTh!=null)?+m.lowStockTh:2;
  }catch(e){_eqMeta.params=EQ_DEFAULT_PARAMS.slice();_eqMeta.lowTh=2;}
}
function eqFillBrandList(){
  const dl=document.getElementById('dl-brands');
  dl.innerHTML=Object.values(_eqMeta.brands).map(b=>'<option value="'+b+'">').join('');
  const dp=document.getElementById('dl-parts');
  dp.innerHTML=EQ_DEFAULT_PARTS.map(p=>'<option value="'+p+'">').join('');
}
async function eqRememberBrand(b){
  if(!b)return; if(Object.values(_eqMeta.brands).includes(b))return;
  const k='b'+Date.now(); _eqMeta.brands[k]=b;
  try{await fbSet('equipment_meta/brands/'+k,b);}catch(e){}
  eqFillBrandList();
}

async function equipInit(){
  const sel=document.getElementById('eq-station');
  if(!sel.options.length){
    sel.innerHTML=EQUIP_STATIONS.map(s=>'<option value="'+s.id+'">'+s.name+'</option>').join('');
    document.getElementById('eq-user').value=localStorage.getItem('eq_user')||'';
  }
  await eqLoadMeta(); eqFillBrandList(); equipRenderStation();
}
async function equipRenderStation(){
  const sid=document.getElementById('eq-station').value, box=document.getElementById('eq-body'), st=document.getElementById('eq-status');
  st.textContent='กำลังโหลดข้อมูลจาก Firebase…';
  try{_eqData=await fbGet('equipment/'+sid)||{}; st.textContent='';}
  catch(e){st.innerHTML='<b style="color:#b3261e">อ่าน Firebase ไม่ได้ ('+e.message+') — ถ้าเป็น 401/permission ให้เพิ่ม rules path equipment/* (ดู comment ในโค้ด)</b>';_eqData={};}
  let _logAll={};
  try{_logAll=await fbGet('equipment_log')||{};}catch(e){}
  const _chg={};   // นับครั้งเปลี่ยน key = param|part
  window._eqHist={};   // ประวัติรายชิ้น key = param|part
  Object.entries(_logAll).forEach(([lk,x])=>{
    if(x.station!==sid||x.action!=='เปลี่ยนอุปกรณ์')return;
    const k=(x.param||'')+'|'+(x.part||'');
    _chg[k]=(_chg[k]||0)+1;
    (window._eqHist[k]=window._eqHist[k]||[]).push(Object.assign({_lk:lk},x));
  });
  Object.values(window._eqHist).forEach(a=>a.sort((x,y)=>(y.date?Date.parse(y.date):y.ts)-(x.date?Date.parse(x.date):x.ts)));
  box.innerHTML=_eqMeta.params.map(pm=>{
    const pk=eqSlug(pm), parts=_eqData[pk]||{};
    const rows=Object.entries(parts).map(([pid,p])=>{
      const d=eqDue(p.start,p.lifeM);
      const badge=d?'<span style="font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px;'+EQ_BADGE[d.cls]+'">'+d.txt+'</span>':'<span style="font-size:11px;color:#999">ยังไม่ตั้งอายุ</span>';
      const hk=pk+'|'+p.part;
      const nchg=_chg[hk]||_chg[eqSlug(pm)+'|'+p.part]||0;
      const chgBadge=nchg?' <span style="font-size:10px;color:#667;background:#eef1f6;border-radius:5px;padding:1px 6px;white-space:nowrap;">🔁 '+nchg+' ครั้ง</span>':'';
      const hist=(window._eqHist[hk]||window._eqHist[eqSlug(pm)+'|'+p.part]||[]);
      const histRows=hist.map(x=>'<div style="padding:2px 0;border-bottom:1px dashed #e7ebf1;display:flex;gap:6px;align-items:center;"><span style="flex:1;">'
        +'<b style="color:#2b6cb0">'+(x.date?eqThD(x.date):new Date(x.ts).toLocaleDateString('th-TH'))+'</b>'
        +(x.brand?' · '+x.brand:'')+' · โดย '+x.by+(x.detail?' — '+x.detail:'')+'</span>'
        +'<button class="chip-btn" style="padding:0 6px;" onclick="equipDelLog(this.dataset.k)" data-k="'+x._lk+'">🗑</button></div>').join('')
        ||'<div style="color:#999;padding:2px 0;">ยังไม่มีประวัติการเปลี่ยนของชิ้นนี้</div>';
      const histId='hist-'+pk+'-'+pid;
      const noteTag=p.note?' <span style="font-size:11px;color:#889;">('+p.note+')</span>':'';
      return '<tr><td>'+p.part+noteTag+chgBadge+'</td><td>'+(p.brand||'–')+'</td><td>'+eqThD(p.start)+'</td><td style="text-align:center">'+(p.lifeM||'–')+'</td><td>'+(d?eqThD(d.due.toISOString().slice(0,10)):'–')+'</td><td>'+badge+'</td>'+
        '<td style="white-space:nowrap"><button class="chip-btn" onclick="equipToggleHist(\''+histId+'\')">📜</button> <button class="chip-btn" onclick="equipReplace(\''+pk+'\',\''+pid+'\')">🔁 เปลี่ยน</button> <button class="chip-btn" onclick="equipEdit(\''+pk+'\',\''+pid+'\')">✏️</button> <button class="chip-btn" onclick="equipDel(\''+pk+'\',\''+pid+'\')">🗑</button></td></tr>'+
        '<tr id="'+histId+'" style="display:none;background:#f9fbfe;"><td colspan="7" style="font-size:11.5px;padding:6px 14px;">'
        +'<b>📜 ประวัติการเปลี่ยน — '+p.part+'</b> <button class="chip-btn" style="margin-left:8px;" onclick="equipAddHistory(\''+pk+'\',\''+pid+'\')">➕ บันทึกย้อนหลัง</button>'
        +'<div style="margin-top:4px;">'+histRows+'</div></td></tr>';
    }).join('');
    return '<div class="qcard"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px;">'+eqDisplay(pm)+'</b>'+
      '<button class="chip-btn" onclick="equipAddPart(\''+pk+'\',\''+pm+'\')">➕ เพิ่มชิ้นส่วน</button></div>'+
      (rows?'<table class="eq-tb" style="margin-top:6px;"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"><col class="c6"><col class="c7"></colgroup><thead><tr><th>ชิ้นส่วน</th><th>ยี่ห้อ/รุ่น</th><th>เริ่มใช้</th><th style="text-align:center">อายุ (เดือน)</th><th>ครบกำหนด</th><th>สถานะ</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'
           :'<div style="font-size:12px;color:#999;margin-top:6px;">ยังไม่มีข้อมูล — กด ➕ เพิ่มชิ้นส่วน</div>')+'</div>';
  }).join('');
  equipRenderLog(sid);
}
async function equipRenderLog(sid){
  const el=document.getElementById('eq-log');
  try{
    const lg=await fbGet('equipment_log')||{};
    const rows=Object.entries(lg).filter(([k,x])=>x.station===sid).sort((a,b)=>b[1].ts-a[1].ts).slice(0,15)
      .map(([k,x])=>'<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #eee;display:flex;gap:6px;align-items:center;"><span style="flex:1;">'+new Date(x.ts).toLocaleString('th-TH')+' · <b>'+x.action+'</b>'+(x.date?' <b style="color:#2b6cb0">[เปลี่ยนเมื่อ '+eqThD(x.date)+']</b>':'')+' '+x.param+' / '+x.part+(x.brand?' ('+x.brand+')':'')+' โดย '+x.by+(x.detail?' — '+x.detail:'')+'</span>'
      +'<button class="chip-btn" style="padding:0 6px;" onclick="equipDelLog(this.dataset.k)" data-k="'+k+'">🗑</button></div>').join('');
    el.innerHTML=rows||'<span style="font-size:12px;color:#999">ยังไม่มีประวัติ</span>';
  }catch(e){el.innerHTML='<span style="font-size:12px;color:#b3261e">โหลด log ไม่ได้</span>';}
}
async function eqWriteLog(entry){try{await fbPush('equipment_log',Object.assign({ts:Date.now()},entry));}catch(e){}}

async function equipAddParam(){
  const by=eqUser(); if(!by)return;
  const nm=prompt('ชื่อพารามิเตอร์ใหม่ (เช่น ORP, DO):'); if(!nm)return;
  _eqMeta.params.push(nm.trim());
  try{await fbSet('equipment_meta/params',_eqMeta.params);}catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  equipRenderStation();
}
async function equipAddPart(pk,pm){
  const by=eqUser(); if(!by)return;
  const part=prompt('ชนิดชิ้นส่วน ('+EQ_DEFAULT_PARTS.join(' / ')+' หรือพิมพ์เอง):','Sensor'); if(!part)return;
  const brand=prompt('ยี่ห้อ / รุ่น (เว้นว่างได้):')||'';
  const start=prompt('วันเริ่มใช้ (YYYY-MM-DD):',new Date().toISOString().slice(0,10)); if(!start)return;
  const lifeM=prompt('อายุใช้งาน (เดือน):','12'); if(!lifeM)return;
  const sid=document.getElementById('eq-station').value;
  const pid='p'+Date.now();
  try{
    await fbSet('equipment/'+sid+'/'+pk+'/'+pid,{part:part.trim(),brand:brand.trim(),start,lifeM:+lifeM,by,ts:Date.now()});
    await eqRememberBrand(brand.trim());
    await eqWriteLog({station:sid,param:pm,part,brand,action:'เพิ่มทะเบียน',by,detail:'เริ่ม '+start+' อายุ '+lifeM+' ด.'});
  }catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  equipRenderStation();
}
async function equipEdit(pk,pid){
  const by=eqUser(); if(!by)return;
  const sid=document.getElementById('eq-station').value, p=(_eqData[pk]||{})[pid]; if(!p)return;
  const brand=prompt('ยี่ห้อ / รุ่น:',p.brand||''); if(brand===null)return;
  const start=prompt('วันเริ่มใช้ (YYYY-MM-DD):',p.start||''); if(start===null)return;
  const lifeM=prompt('อายุใช้งาน (เดือน):',p.lifeM||12); if(lifeM===null)return;
  try{
    await fbSet('equipment/'+sid+'/'+pk+'/'+pid,Object.assign({},p,{brand:brand.trim(),start,lifeM:+lifeM,by,ts:Date.now()}));
    await eqRememberBrand(brand.trim());
    await eqWriteLog({station:sid,param:pk,part:p.part,brand,action:'แก้ไขข้อมูล',by,detail:'เริ่ม '+start+' อายุ '+lifeM+' ด.'});
  }catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  equipRenderStation();
}
async function equipDel(pk,pid){
  const by=eqUser(); if(!by)return;
  const sid=document.getElementById('eq-station').value, p=(_eqData[pk]||{})[pid]; if(!p)return;
  if(!confirm('ลบทะเบียน '+p.part+' ('+(p.brand||'-')+') ?'))return;
  await eqFbDel('equipment/'+sid+'/'+pk+'/'+pid);
  await eqWriteLog({station:sid,param:pk,part:p.part,brand:p.brand,action:'ลบทะเบียน',by});
  equipRenderStation();
}
async function equipDelLog(lk){
  const by=eqUser(); if(!by)return;
  if(!confirm('ลบรายการประวัตินี้?'))return;
  await eqFbDel('equipment_log/'+lk);
  equipRenderStation();
}
function equipToggleHist(id){const el=document.getElementById(id);if(el)el.style.display=el.style.display==='none'?'':'none';}
/* บันทึกประวัติย้อนหลัง: เพิ่ม log อย่างเดียว ไม่แตะวันเริ่ม/อายุปัจจุบัน */
async function equipAddHistory(pk,pid){
  const by=eqUser(); if(!by)return;
  const sid=document.getElementById('eq-station').value, p=(_eqData[pk]||{})[pid]; if(!p)return;
  const date=prompt('วันที่เปลี่ยนในอดีต (YYYY-MM-DD):'); if(!date)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){alert('รูปแบบวันที่ไม่ถูกต้อง');return;}
  const brand=prompt('ยี่ห้อ/รุ่นที่เปลี่ยนครั้งนั้น (เว้นว่างได้):',p.brand||'')||'';
  const note=prompt('หมายเหตุ (เว้นว่างได้):')||'';
  await eqWriteLog({station:sid,param:pk,part:p.part,brand:brand.trim(),action:'เปลี่ยนอุปกรณ์',by,date,
    detail:'บันทึกย้อนหลัง'+(note?' — '+note:'')});
  equipRenderStation();
}
/* เปลี่ยนอุปกรณ์: เลือกของจาก stock → หัก stock 1 + log ทั้งสองฝั่ง + รีเซ็ตวันเริ่ม */
async function equipReplace(pk,pid){
  const by=eqUser(); if(!by)return;
  const sid=document.getElementById('eq-station').value, p=(_eqData[pk]||{})[pid]; if(!p)return;
  let items;
  try{items=await fbGet('stock/items')||{};}catch(e){alert('อ่าน stock ไม่ได้: '+e.message);return;}
  const match=Object.entries(items).filter(([k,v])=>v.qty>0);
  let useKey=null, useBrand=p.brand||'';
  if(match.length){
    const menu=match.map(([k,v],i)=>(i+1)+') '+v.param+' / '+v.part+' / '+v.brand+' (คงเหลือ '+v.qty+')').join('\n');
    const pick=prompt('เบิกจาก stock (พิมพ์หมายเลข) หรือ 0 = เปลี่ยนโดยไม่ตัด stock:\n'+menu,'0');
    if(pick===null)return;
    const n=+pick;
    if(n>=1&&n<=match.length){useKey=match[n-1][0];useBrand=match[n-1][1].brand;}
  }
  const start=prompt('วันที่เปลี่ยน/เริ่มใช้ตัวใหม่ (YYYY-MM-DD):',new Date().toISOString().slice(0,10)); if(!start)return;
  const lifeM=prompt('อายุใช้งานตัวใหม่ (เดือน):',p.lifeM||12); if(!lifeM)return;
  try{
    if(useKey){
      const it=items[useKey];
      await fbSet('stock/items/'+useKey+'/qty',it.qty-1);
      await fbPush('stock/log',{t:'out',param:it.param,part:it.part,brand:it.brand,qty:1,by,station:sid,note:'เบิกเปลี่ยนที่สถานี',ts:Date.now()});
    }
    await fbSet('equipment/'+sid+'/'+pk+'/'+pid,Object.assign({part:p.part,brand:useBrand,start,lifeM:+lifeM,by,ts:Date.now()},p.note?{note:p.note}:{}));
    await eqRememberBrand(useBrand);
    await eqWriteLog({station:sid,param:pk,part:p.part,brand:useBrand,action:'เปลี่ยนอุปกรณ์',by,date:start,
      detail:'ตัวเก่าเริ่ม '+(p.start||'-')+(useKey?' · ตัด stock 1':' · ไม่ตัด stock')});
  }catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  equipRenderStation();
}

/* ─── Stock ─── */
async function stockInit(){
  await eqLoadMeta(); eqFillBrandList();
  const sp=document.getElementById('st-param');
  sp.innerHTML=_eqMeta.params.map(p=>'<option>'+p+'</option>').join('');
  stockRender();
}
const _stdRe=/น้ำยา|สารมาตรฐาน|standard|buffer|คาลิเบรท|calib/i;
function _stRow(k,v){
  const logId='stlog-'+k;
  return '<tr><td>'+eqDisplay(v.param)+'</td><td>'+v.part+'</td><td>'+v.brand+'</td><td style="text-align:center;font-weight:700;'+(v.qty<=(_eqMeta.lowTh||2)?'color:#b3261e':'')+'">'+v.qty+'</td>'+
    '<td style="white-space:nowrap"><button class="chip-btn" onclick="equipToggleHist(\'{L}\'.replace(\'{L}\',this.dataset.l))" data-l="'+logId+'">📜</button> <button class="chip-btn" onclick="stockAdj(this.dataset.k,1)" data-k="'+k+'">+1</button> <button class="chip-btn" onclick="stockAdj(this.dataset.k,-1)" data-k="'+k+'">−1</button> <button class="chip-btn" onclick="stockEdit(this.dataset.k)" data-k="'+k+'">✏️</button> <button class="chip-btn" onclick="stockDel(this.dataset.k)" data-k="'+k+'">🗑</button></td></tr>'+
    '<tr id="'+logId+'" style="display:none;background:#f9fbfe;"><td colspan="5" style="font-size:11.5px;padding:6px 14px;">'+_stItemLog(v)+'</td></tr>';
}
function _stItemLog(v){
  const rows=Object.values(window._stLogAll||{})
    .filter(x=>x.param===v.param&&x.part===v.part&&x.brand===v.brand)
    .sort((a,b)=>b.ts-a.ts).slice(0,20)
    .map(x=>'<div style="padding:2px 0;border-bottom:1px dashed #e7ebf1;">'+new Date(x.ts).toLocaleString('th-TH')
      +' · '+(x.t==='in'?'<b style="color:#177a3d">📥 รับเข้า</b>':x.t==='edit'?'<b style="color:#2b6cb0">✏️ แก้ไข</b>':x.t==='del'?'<b style="color:#889">🗑 ลบรายการ</b>':'<b style="color:#b3261e">📤 เบิกออก</b>')+' '+x.qty
      +' · โดย '+x.by+(x.station?' → '+x.station:'')+(x.note?' ('+x.note+')':'')+'</div>').join('');
  return '<b>📜 การเคลื่อนไหว — '+v.part+' / '+v.brand+'</b><div style="margin-top:4px;">'+(rows||'<span style="color:#999">ยังไม่มีรายการ</span>')+'</div>';
}
async function stockRender(){
  const el=document.getElementById('st-items'), lg=document.getElementById('st-log');
  try{
    _stItems=await fbGet('stock/items')||{};
    try{window._stLogAll=await fbGet('stock/log')||{};}catch(e){window._stLogAll={};}
    const ent=Object.entries(_stItems).sort((a,b)=>(a[1].param+a[1].part).localeCompare(b[1].param+b[1].part));
    const eq=ent.filter(([k,v])=>!_stdRe.test(v.part||'')), std=ent.filter(([k,v])=>_stdRe.test(v.part||''));
    const tbl=rows=>'<table class="eq-tb" style="margin-top:4px;"><colgroup><col style="width:26%"><col style="width:22%"><col style="width:22%"><col style="width:10%"><col style="width:20%"></colgroup><thead><tr><th>พารามิเตอร์</th><th>ชิ้นส่วน</th><th>ยี่ห้อ/รุ่น</th><th>คงเหลือ</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
    const sec=(title,icon,list)=>'<div style="margin-top:10px;"><b style="font-size:13px;">'+icon+' '+title+' <span style="font-weight:400;color:#889;">('+list.length+' รายการ)</span></b>'
      +(list.length?tbl(list.map(([k,v])=>_stRow(k,v)).join('')):'<div style="font-size:12px;color:#999;margin-top:4px;">— ว่าง —</div>')+'</div>';
    el.innerHTML=ent.length?(sec('อุปกรณ์ / เซ็นเซอร์','🔧',eq)+sec('สารมาตรฐาน (Standard)','🧪',std))
      :'<span style="font-size:12px;color:#999">คลังว่าง — รับเข้าจากแบบฟอร์มด้านบน</span>';
  }catch(e){el.innerHTML='<b style="color:#b3261e;font-size:12px;">อ่าน stock ไม่ได้: '+e.message+'</b>';}
  try{
    const logs=await fbGet('stock/log')||{};
    lg.innerHTML=Object.values(logs).sort((a,b)=>b.ts-a.ts).slice(0,40)
      .map(x=>'<div style="font-size:11.5px;padding:3px 0;border-bottom:1px dashed #eee;">'+new Date(x.ts).toLocaleString('th-TH')+' · '+(x.t==='in'?'<b style="color:#177a3d">📥 รับเข้า</b>':x.t==='edit'?'<b style="color:#2b6cb0">✏️ แก้ไข</b>':x.t==='del'?'<b style="color:#889">🗑 ลบรายการ</b>':'<b style="color:#b3261e">📤 เบิกออก</b>')+' '+x.qty+' — '+x.param+' / '+x.part+' / '+x.brand+' · โดย '+x.by+(x.station?' → '+x.station:'')+(x.note?' ('+x.note+')':'')+'</div>').join('')||'<span style="font-size:12px;color:#999">ยังไม่มีรายการ</span>';
  }catch(e){lg.innerHTML='';}
}
async function stockIn(){
  const by=eqUser(); if(!by)return;
  const param=document.getElementById('st-param').value;
  const part=(document.getElementById('st-part').value||'').trim();
  const brand=(document.getElementById('st-brand').value||'').trim();
  const qty=+document.getElementById('st-qty').value||1;
  if(!part||!brand){alert('กรอกชนิดชิ้นส่วนและยี่ห้อ/รุ่น');return;}
  const key=eqSlug(param+'|'+part+'|'+brand);
  try{
    const cur=(await fbGet('stock/items/'+key))||{param,part,brand,qty:0};
    await fbSet('stock/items/'+key,Object.assign(cur,{qty:cur.qty+qty}));
    await fbPush('stock/log',{t:'in',param,part,brand,qty,by,note:'รับเข้า',ts:Date.now()});
    await eqRememberBrand(brand);
  }catch(e){alert('บันทึกไม่สำเร็จ: '+e.message);return;}
  stockRender();
}
/* แก้รายละเอียดรายการ stock: ชนิดชิ้นส่วน/ยี่ห้อ — key ผูกกับสามค่านี้ จึงย้ายรายการไป key ใหม่ (รวมยอดถ้าซ้ำ) */
async function stockEdit(key){
  const by=eqUser(); if(!by)return;
  const it=_stItems[key]; if(!it)return;
  const part=prompt('ชนิดชิ้นส่วน:',it.part); if(part===null)return;
  const brand=prompt('ยี่ห้อ / รุ่น:',it.brand); if(brand===null)return;
  const np=part.trim(), nb=brand.trim();
  if(!np||!nb){alert('กรอกให้ครบ');return;}
  if(np===it.part&&nb===it.brand)return;
  const nk=eqSlug(it.param+'|'+np+'|'+nb);
  try{
    const dup=nk!==key?(await fbGet('stock/items/'+nk)):null;
    await fbSet('stock/items/'+nk,{param:it.param,part:np,brand:nb,qty:it.qty+(dup?dup.qty:0)});
    if(nk!==key)await eqFbDel('stock/items/'+key);
    await fbPush('stock/log',{t:'edit',param:it.param,part:np,brand:nb,qty:it.qty,by,
      note:'แก้ไขจาก '+it.part+' / '+it.brand+(dup?' (รวมยอดกับรายการเดิม)':''),ts:Date.now()});
    await eqRememberBrand(nb);
  }catch(e){alert('ไม่สำเร็จ: '+e.message);return;}
  stockRender();
}
async function stockDel(key){
  const by=eqUser(); if(!by)return;
  const it=_stItems[key]; if(!it)return;
  if(!confirm('ลบรายการ '+it.part+' / '+it.brand+' (คงเหลือ '+it.qty+') ออกจากคลัง?'))return;
  const note=prompt('เหตุผลการลบ:','คีย์ผิด/ยกเลิกใช้งาน'); if(note===null)return;
  try{
    await eqFbDel('stock/items/'+key);
    await fbPush('stock/log',{t:'del',param:it.param,part:it.part,brand:it.brand,qty:it.qty,by,note,ts:Date.now()});
  }catch(e){alert('ไม่สำเร็จ: '+e.message);return;}
  stockRender();
}
async function stockAdj(key,dq){
  const by=eqUser(); if(!by)return;
  const it=_stItems[key]; if(!it)return;
  if(dq<0&&it.qty<=0){alert('ของหมด');return;}
  const note=prompt(dq>0?'เหตุผลการเติม:':'เหตุผลการเบิก / สถานีปลายทาง:',dq>0?'เติม stock':''); if(note===null)return;
  try{
    await fbSet('stock/items/'+key+'/qty',it.qty+dq);
    await fbPush('stock/log',{t:dq>0?'in':'out',param:it.param,part:it.part,brand:it.brand,qty:Math.abs(dq),by,note,ts:Date.now()});
  }catch(e){alert('ไม่สำเร็จ: '+e.message);return;}
  stockRender();
}
/* Firebase rules ที่ต้องมี (วางใน Realtime Database → Rules):
   "equipment":{".read":true,".write":true},
   "equipment_meta":{".read":true,".write":true},
   "equipment_log":{".read":true,".write":true},
   "stock":{".read":true,".write":true}
   (หรือผูก auth ตามนโยบาย — แจ้งได้ถ้าต้องการแบบ login) */


/* ═══ หน้าสรุปเซ็นเซอร์ทั้งระบบ ═══ */
async function equipSumInit(){
  const kpi=document.getElementById('eqsum-kpi'), due=document.getElementById('eqsum-due'),
        stk=document.getElementById('eqsum-stock'), emp=document.getElementById('eqsum-empty');
  kpi.innerHTML='<span style="font-size:12px;color:#889">กำลังรวบรวมข้อมูล…</span>';
  let eq={},items={};
  try{eq=await fbGet('equipment')||{};}catch(e){kpi.innerHTML='<b style="color:#b3261e;font-size:12px;">อ่าน Firebase ไม่ได้: '+e.message+'</b>';return;}
  try{items=await fbGet('stock/items')||{};}catch(e){}
  const nameOf=id=>{const s=EQUIP_STATIONS.find(x=>x.id===id);return s?s.name:id;};
  let total=0,ok=0,warn=0,bad=0,noAge=0;const urgent=[];
  for(const [sid,params] of Object.entries(eq)){
    for(const [pk,parts] of Object.entries(params||{})){
      for(const p of Object.values(parts||{})){
        total++;
        const d=eqDue(p.start,p.lifeM);
        if(!d){noAge++;continue;}
        if(d.cls==='ok')ok++;else if(d.cls==='warn')warn++;else bad++;
        if(d.cls!=='ok')urgent.push({sid,pk,part:p.part,brand:p.brand||'–',d});
      }
    }
  }
  urgent.sort((a,b)=>a.d.days-b.d.days);
  const chip=(n,label,bg,fg)=>'<div style="background:'+bg+';color:'+fg+';border-radius:10px;padding:10px 16px;min-width:110px;text-align:center;"><div style="font-size:22px;font-weight:800;">'+n+'</div><div style="font-size:11px;">'+label+'</div></div>';
  kpi.innerHTML=chip(total,'ทะเบียนทั้งหมด','#eef1f6','#334')
    +chip(ok,'ปกติ','#e6f6ea','#177a3d')
    +chip(warn,'ใกล้ครบ (≤31 วัน)','#fff3d6','#9a6a00')
    +chip(bad,'เกินกำหนด','#fde3e0','#b3261e')
    +chip(noAge,'ยังไม่ตั้งอายุ','#eceff3','#667');
  due.innerHTML=urgent.length?'<table class="eq-tb"><colgroup><col style="width:26%"><col style="width:20%"><col style="width:16%"><col style="width:16%"><col style="width:10%"><col style="width:12%"></colgroup><thead><tr><th>สถานี</th><th>พารามิเตอร์</th><th>ชิ้นส่วน</th><th>ยี่ห้อ/รุ่น</th><th>ครบกำหนด</th><th>สถานะ</th></tr></thead><tbody>'
      +urgent.map(u=>'<tr><td>'+nameOf(u.sid)+'</td><td>'+eqDisplay(u.pk)+'</td><td>'+u.part+'</td><td>'+u.brand+'</td><td>'+eqThD(u.d.due.toISOString().slice(0,10))+'</td><td><span style="font-size:11px;font-weight:700;border-radius:6px;padding:2px 8px;'+EQ_BADGE[u.d.cls]+'">'+u.d.txt+'</span></td></tr>').join('')+'</tbody></table>'
    :'<span style="font-size:12px;color:#177a3d">✅ ไม่มีรายการใกล้ครบหรือเกินกำหนด</span>';
  const th=_eqMeta.lowTh!=null?_eqMeta.lowTh:2;
  const thBox=document.getElementById('eqsum-thbox');
  if(thBox)thBox.innerHTML='เกณฑ์ เหลือ ≤ <input type="number" min="0" style="width:52px;font-size:12px;" value="'+th+'" onchange="equipSetLowTh(this.value)"> ชิ้น';
  const low=Object.values(items).filter(v=>v.qty<=th).sort((a,b)=>a.qty-b.qty);
  stk.innerHTML=low.length?low.map(v=>'<div style="font-size:12px;padding:3px 0;border-bottom:1px dashed #eee;"><b style="color:'+(v.qty===0?'#b3261e':'#9a6a00')+'">เหลือ '+v.qty+'</b> — '+eqDisplay(v.param)+' / '+v.part+' / '+v.brand+'</div>').join('')
    :'<span style="font-size:12px;color:#177a3d">✅ ไม่มีรายการใกล้หมด</span>';
  const have=new Set(Object.keys(eq));
  const missing=EQUIP_STATIONS.filter(s=>!have.has(s.id));
  emp.innerHTML=missing.length?(missing.length+' สถานี: '+missing.map(s=>s.name).join(' · ')):'✅ ครบทุกสถานี';
}

async function equipSetLowTh(v){
  const n=Math.max(0,+v||0);
  _eqMeta.lowTh=n;
  try{await fbSet('equipment_meta/lowStockTh',n);}catch(e){alert('บันทึกเกณฑ์ไม่สำเร็จ: '+e.message);return;}
  equipSumInit();
}
