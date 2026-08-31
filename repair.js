/* repair.js — ระบบแจ้งซ่อม: ฟอร์ม + ประวัติ (คู่กับ repair.html) */
const FB_URL='https://frc-contour-default-rtdb.asia-southeast1.firebasedatabase.app';
const BOT_URL='https://frc-line-bot-production.up.railway.app';
const RP_STATIONS=["สถานีสูบจ่ายน้ำลุมพินี", "สำนักงานประปาสาขาทุ่งมหาเมฆ", "สถานีสูบจ่ายน้ำพหลโยธิน", "สถานีสูบจ่ายน้ำลาดพร้าว", "บริษัท โอสถสภา จำกัด (มหาชน)", "สถานคุ้มครองและพัฒนาอาชีพบ้านเกร็ดตระการ", "สถานีสูบจ่ายน้ำคลองเตย", "ศูนย์วิทยาศาสตร์เพื่อการศึกษาแห่งชาติ", "สำนักงานประปาสาขาสุขุมวิท-พระโขนง", "สถานีสูบจ่ายน้ำสำโรง", "บริษัท ศิครินทร์ จำกัด (มหาชน) (โรงพยาบาลศิครินทร์)", "โรงเรียนหาดอมราอักษรลักษณ์วิทยา", "บริษัท เอจีซี แฟลทกลาส (ประเทศไทย) จำกัด (มหาชน)บริษัท เอจีซี แฟลทกลาส (ประเทศไทย) จำกัด (มหาชน) , กระจกไทย , กระจก ,กระจกไทยอาซาฮี , เอจีซี , agc", "สำนักงานประปาสาขาสมุทรปราการ", "โรงไฟฟ้าพระนครใต้", "สถานีสูบจ่ายน้ำมีนบุรี", "บริษัท มหาจักรออโตพาร์ท จำกัด", "สำนักงานประปาสาขามีนบุรี", "นิคมอุตสาหกรรมบางชัน", "ศูนย์ไตเทียมเทียนฟ้าประชาการุณย์", "สถานีสูบจ่ายน้ำลาดกระบัง", "บริษัท ท่าอากาศยานไทย มหาชน จำกัด (สุวรรณภูมิ)", "นิคมอุตสาหกรรมลาดกระบัง", "มหาวิทยาลัยหัวเฉียวเฉลิมพระเกียรติ (วิทยาเขตบางพลี)", "สถานีสูบจ่ายน้ำบางพลี", "นิคมอุตสาหกรรมบางพลี", "สถานีตำรวจภูธรคลองด่าน", "นิคมอุตสาหกรรมบางปู", "สำนักงานประปาสาขานนทบุรี", "กองพันทหารสื่อสาร กองบัญชาการกองทัพไทย", "โรงเรียนทหารขนส่ง กรมการขนส่งทหารบก", "โรงพยาบาลซีจีเอช สายไหม", "โรงพยาบาลภูมิพลอดุลยเดช", "สถานีสูบจ่ายน้ำราษฎร์บูรณะ", "ม.เทคโนโลยีพระจอมเกล้าธนบุรี (วิทยาเขตบางขุนเทียน)", "ศูนย์กีฬาเฉลิมพระเกียรติ", "สถานีสูบจ่ายน้ำเพชรเกษม", "มหาวิทยาลัยเอเชียอาคเนย์", "เรือนจำพิเศษธนบุรี", "สถานีสูบจ่ายน้ำท่าพระ", "ศูนย์พัฒนาการจัดสวัสดิการสังคมผู้สูงอายุบ้านบางแค (บ้านพักคนชราบางแค)", "โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี) นนทบุรี", "โรงเรียนตั้งพิรุฬห์ธรรม", "สำนักงานประปาสาขาบางบัวทอง", "โรงเรียนราชวินิต นนทบุรี", "โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า นนทบุรี", "สถานีตำรวจภูธรไทรน้อย", "โรงพยาบาลศิริราช", "พระราชวังดุสิต สวนจิตรลดา", "โรงพยาบาลสมเด็จพระปิ่นเกล้า กรมแพทย์ทหารเรือ"];
const RP_PARAMS=['คลอรีนอิสระคงเหลือ','ความขุ่น','พีเอช','ความนำไฟฟ้า','ความเค็ม','หน้าจอ TWQ','คลอรีนอิสระคงเหลือขาเข้า','คลอรีนอิสระคงเหลือขาออก','อัตราการไหลน้ำเข้าตู้','อื่น ๆ'];
const RP_PROBLEMS=['สูงผิดปกติ','ต่ำผิดปกติ','แสดงค่า ERROR','ค่าค้าง','ค่าหาย','ค่าแกว่ง ผิดปกติ','ติดลบ','ดับ','อื่น ๆ'];
const thDisp=iso=>{if(!iso)return'–';const[y,m,d]=iso.split('-').map(Number);return d+'/'+m+'/'+(y+543);};
const todayISO=()=>new Date().toLocaleDateString('en-CA');
const compShort=c=>!c?'–':c.includes('กองบูรณาการ')?'กบน.':c.includes('เพทโทร')?'เพทโทร':c.includes('โพรมิเน้นท์')?'โพรมิเน้นท์':c.slice(0,14);

function rpTab(t){
  document.getElementById('pg-form').style.display=t==='form'?'':'none';
  document.getElementById('pg-hist').style.display=t==='hist'?'':'none';
  document.getElementById('tab-form').classList.toggle('active',t==='form');
  document.getElementById('tab-hist').classList.toggle('active',t==='hist');
  if(t==='hist'&&!window._rpLoaded)rpLoad();
}

/* ═══ ฟอร์ม ═══ */
function rpAddItem(){
  const d=document.createElement('div'); d.className='itemrow';
  d.innerHTML='<div><label>รายการปัญหา (พารามิเตอร์)</label><select class="i-param">'+RP_PARAMS.map(p=>'<option>'+p+'</option>').join('')+'</select></div>'
    +'<div><label>ความผิดปกติ</label><select class="i-prob">'+RP_PROBLEMS.map(p=>'<option>'+p+'</option>').join('')+'</select></div>'
    +'<div><label>หมายเหตุ (ถ้ามี)</label><input class="i-note" placeholder="เช่น ค่าโชว์ 9.99"></div>'
    +'<button class="btn sm ghost-danger" title="ลบแถว" onclick="this.parentNode.remove()">✕</button>';
  document.getElementById('rp-items').appendChild(d);
}
function rpInit(){
  const sel=document.getElementById('rp-station');
  sel.innerHTML=RP_STATIONS.map(n=>'<option>'+n+'</option>').join('')+'<option value="__other__">— สถานที่อื่น (พิมพ์เอง) —</option>';
  sel.onchange=()=>{document.getElementById('rp-station-other').style.display=sel.value==='__other__'?'':'none';};
  const now=new Date();
  document.getElementById('rp-fdate').value=todayISO();
  document.getElementById('rp-ftime').value=now.toTimeString().slice(0,5);
  document.getElementById('rp-reporter').value=localStorage.getItem('rp_reporter')||'';
  rpAddItem();
}
async function rpSubmit(){
  const selV=document.getElementById('rp-station').value;
  const station=selV==='__other__'?document.getElementById('rp-station-other').value.trim():selV;
  const reporter=document.getElementById('rp-reporter').value.trim();
  const res=document.getElementById('rp-result');
  const items=[...document.querySelectorAll('#rp-items .itemrow')].map(r=>({
    param:r.querySelector('.i-param').value,problem:r.querySelector('.i-prob').value,
    note:r.querySelector('.i-note').value.trim()||undefined}));
  if(!station){res.className='err';res.textContent='เลือกหรือพิมพ์ชื่อสถานีก่อนส่ง';return;}
  if(!reporter){res.className='err';res.textContent='กรอกชื่อผู้แจ้งก่อนส่ง';return;}
  if(!items.length){res.className='err';res.textContent='เพิ่มรายการปัญหาอย่างน้อย 1 รายการ';return;}
  localStorage.setItem('rp_reporter',reporter);
  const btn=document.getElementById('rp-send'); btn.disabled=true; btn.textContent='กำลังส่ง…';
  try{
    const r=await fetch(BOT_URL+'/repair',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({station,items,reporter,
        foundDate:document.getElementById('rp-fdate').value,
        foundTime:document.getElementById('rp-ftime').value})});
    const j=await r.json();
    if(j.created){
      const inh=j.ticket&&j.ticket.company&&j.ticket.company.includes('กองบูรณาการ');
      res.className='ok';
      res.innerHTML='<div class="ticket">'+j.no+'</div>ออกใบแจ้งซ่อมเรียบร้อย · บันทึกระบบ + Google Sheet แล้ว<br>'
        +(inh?'งานสถานีสูบจ่ายน้ำ — กบน. ดำเนินการเอง (ไม่ส่งเมลผู้รับจ้าง)'
             :(j.emailSent?'📧 ส่งอีเมลถึงผู้รับจ้างแล้ว — ตรวจเช็คอีเมล':'⚠️ เมลไม่ออก: '+(j.emailErr||'')));
      window._rpLoaded=false;
    }
    else if(j.merged||j.dup){res.className='ok';res.textContent='ℹ️ '+j.msg;window._rpLoaded=false;}
    else{res.className='err';res.textContent='ไม่สำเร็จ: '+(j.error||'ไม่ทราบสาเหตุ');}
  }catch(e){res.className='err';res.textContent='ส่งไม่ได้ ('+e.message+') — ตรวจว่า bot ออนไลน์';}
  btn.disabled=false; btn.textContent='📨 ส่งใบแจ้งซ่อม';
}

/* ═══ ประวัติ ═══ */
let _rows=[];   // [{key,...ticket}]
let _fToday=false;
function thisThYear(){return new Date().getFullYear()+543;}
async function rpLoad(force){
  const ySel=document.getElementById('f-year');
  if(!ySel.options.length){
    const cur=thisThYear();
    let opts='<option value="">ทั้งหมด (โหลดช้า)</option>';
    for(let y=cur;y>=2560;y--)opts+='<option'+(y===cur?' selected':'')+'>'+y+'</option>';
    ySel.innerHTML=opts;
    const MN=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    document.getElementById('f-month').innerHTML='<option value="">ทั้งปี</option>'+MN.map((n,i)=>'<option value="'+(i+1)+'">'+n+'</option>').join('');
    ySel.onchange=document.getElementById('f-month').onchange=()=>{_fToday=false;rpTodayBtn();window._rpLoaded=false;rpLoad();};
    document.getElementById('f-station').onchange=document.getElementById('f-param').onchange=rpRender;
  }
  const st=document.getElementById('h-stat'); st.textContent='กำลังโหลด…';
  const y=ySel.value;
  let q='';
  if(y){const ce=+y-543;q='?orderBy=%22dateIssue%22&startAt=%22'+ce+'-01-01%22&endAt=%22'+ce+'-12-31%22';}
  try{
    const r=await fetch(FB_URL+'/repairs.json'+q);
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json()||{};
    _rows=Object.entries(j).map(([key,v])=>Object.assign({key},v))
      .sort((a,b)=>(b.dateIssue||'').localeCompare(a.dateIssue||'')||(b.ts||0)-(a.ts||0));
    window._rpLoaded=true;
    const stations=[...new Set(_rows.map(x=>x.station))].sort();
    document.getElementById('f-station').innerHTML='<option value="">ทุกสถานี</option>'+stations.map(s=>'<option>'+s+'</option>').join('');
    const params=[...new Set(_rows.flatMap(x=>(x.items||[]).map(i=>i.param)))].sort();
    document.getElementById('f-param').innerHTML='<option value="">ทั้งหมด</option>'+params.map(p=>'<option>'+p+'</option>').join('');
    rpRender();
  }catch(e){st.textContent='โหลดไม่ได้: '+e.message;}
}
function rpToday(){_fToday=!_fToday;rpTodayBtn();rpRender();}
function rpTodayBtn(){document.getElementById('f-today').classList.toggle('today-on',_fToday);}
function rpFiltered(){
  const m=document.getElementById('f-month').value;
  const stF=document.getElementById('f-station').value;
  const pF=document.getElementById('f-param').value;
  const q=document.getElementById('f-q').value.trim().toLowerCase();
  const today=todayISO();
  return _rows.filter(x=>{
    if(_fToday&&x.dateIssue!==today)return false;
    if(m&&(!x.dateIssue||+x.dateIssue.split('-')[1]!==+m))return false;
    if(stF&&x.station!==stF)return false;
    if(pF&&!(x.items||[]).some(i=>i.param===pF))return false;
    if(q){const hay=(x.no+' '+x.station+' '+(x.items||[]).map(i=>i.param+' '+i.problem).join(' ')+' '+(x.reporter||'')).toLowerCase();
      if(!hay.includes(q))return false;}
    return true;
  });
}
function rpKpis(list){
  const today=todayISO(), m=todayISO().slice(0,7);
  const k=[['วันนี้',_rows.filter(x=>x.dateIssue===today).length],
           ['เดือนนี้',_rows.filter(x=>(x.dateIssue||'').startsWith(m)).length],
           ['ปีที่เลือก / ที่โหลด',_rows.length],
           ['ตามตัวกรอง',list.length]];
  document.getElementById('h-kpis').innerHTML=k.map(([t,n])=>'<div class="kpi"><div class="n">'+n+'</div><div class="t">'+t+'</div></div>').join('');
}
function rpRender(){
  const list=rpFiltered();
  rpKpis(list);
  document.getElementById('h-stat').textContent='แสดง '+list.length+' ใบ (โหลดไว้ '+_rows.length+' ใบ)';
  const out=[];
  for(const x of list.slice(0,600)){
    const items=(x.items&&x.items.length)?x.items:[{}];
    items.forEach((i,idx)=>{
      out.push('<tr>'
        +'<td class="no">'+(idx===0?x.no:'')+'</td>'
        +'<td>'+(idx===0?thDisp(x.dateIssue):'')+'</td>'
        +'<td>'+(idx===0?(x.timeIssue||'–'):'')+'</td>'
        +'<td>'+(idx===0?x.station:'')+'</td>'
        +'<td>'+(i.param||'–')+'</td>'
        +'<td>'+(i.problem||'–')+(i.note?' <span class="muted">('+i.note+')</span>':'')+'</td>'
        +'<td>'+(idx===0?(x.reporter||'–'):'')+'</td>'
        +'<td>'+(idx===0?'<span class="chip'+(compShort(x.company)==='กบน.'?' inh':'')+'">'+compShort(x.company)+'</span>':'')+'</td>'
        +'<td>'+(idx===0?(x.status==='closed'
            ?'<span class="chip done">✔ ปิดงาน</span><div class="muted" style="margin-top:3px;">'+(x.closedBy||'')+' · '+thDisp(x.closedDate)+'</div>'
            :'<span class="chip">ส่งแจ้งซ่อม</span> <button class="btn sm" style="margin-left:6px;" onclick="rpClose(this.dataset.k,this.dataset.n)" data-k="'+x.key+'" data-n="'+x.no+'">✔ ปิดงาน</button>'):'')+'</td>'
        +'<td>'+(idx===0?'<button class="btn sm ghost-danger" title="ลบใบ (กรณีส่งผิด)" onclick="rpDel(this.dataset.k,this.dataset.n)" data-k="'+x.key+'" data-n="'+x.no+'">🗑</button>':'')+'</td>'
        +'</tr>');
    });
  }
  document.getElementById('h-body').innerHTML=out.join('')||'<tr><td colspan="10" class="muted" style="padding:20px;">ไม่มีรายการตามเงื่อนไข — ปรับตัวกรองหรือกด โหลด</td></tr>';
}
async function rpClose(key,no){
  const by=prompt('ปิดงาน '+no+'\nชื่อผู้ตรวจสอบ:',localStorage.getItem('rp_reporter')||'');
  if(by===null)return;
  const name=by.trim(); if(!name){alert('กรอกชื่อผู้ตรวจสอบ');return;}
  localStorage.setItem('rp_reporter',name);
  try{
    const r=await fetch(BOT_URL+'/repair/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,by:name})});
    const res=await r.json();
    if(!res.ok)throw new Error(res.error||'ไม่สำเร็จ');
    const row=_rows.find(x=>x.key===key);
    if(row){row.status='closed';row.closedBy=res.closedBy;row.closedDate=res.closedDate;}
    rpRender();
    if(res.sheet!=='updated')alert('ปิดงานแล้ว แต่ชีตไม่ได้อัปเดตวันที่แล้วเสร็จ ('+res.sheet+') — เติมมือในชีตได้');
  }catch(e){alert('ปิดงานไม่สำเร็จ: '+e.message);}
}
async function rpDel(key,no){
  if(!confirm('ลบใบแจ้งซ่อม '+no+' ?\nใช้กรณีส่งผิดเท่านั้น — ลบแล้วกู้คืนไม่ได้ (แถวใน Google Sheet ต้องลบเองแยกต่างหาก)'))return;
  try{
    const r=await fetch(FB_URL+'/repairs/'+key+'.json',{method:'DELETE'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    _rows=_rows.filter(x=>x.key!==key);
    rpRender();
  }catch(e){alert('ลบไม่สำเร็จ: '+e.message);}
}
function rpExport(){
  const list=rpFiltered();
  const rows=[['เลขที่ใบ','วันที่ออกใบ','เวลา','วันที่พบ','เวลาพบ','สถานี','รายการปัญหา','ความผิดปกติ','หมายเหตุ','ผู้แจ้ง','ผู้รับจ้าง','สถานะ','ผู้ตรวจสอบ','วันที่ปิดงาน','ช่องทาง']];
  for(const x of list)for(const i of (x.items||[{}]))
    rows.push([x.no,thDisp(x.dateIssue),x.timeIssue||'',thDisp(x.foundDate),x.foundTime||'',x.station,i.param||'',i.problem||'',i.note||'',x.reporter||'',compShort(x.company),
      x.status==='closed'?'ปิดงาน':'ส่งแจ้งซ่อม',x.closedBy||'',x.closedDate?thDisp(x.closedDate):'',x.via||'']);
  const csv='\uFEFF'+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='แจ้งซ่อม_export_'+todayISO()+'.csv';
  a.click();
}
rpInit();
