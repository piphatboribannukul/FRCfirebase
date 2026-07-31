// FRCContour v37.0 — MWA Water Quality Division
// สร้างใหม่จาก v36.3: แยก data → data/*.js, ระบบ version จุดเดียว, ตัด dead code

const APP_VERSION = '38.0';
function appBadge(suffix){ return '⬡ V' + APP_VERSION + (suffix ? '+' + suffix : ''); }

// ── สารบัญ (ค้นหา "[N/12]" เพื่อกระโดดไป section) ──
//   [1/11] CORE ENGINE — map, contour, Dijkstra, K chain (3-priority), tempK Arrhenius, RTU, live poll, report
//   [2/11] ZONES — zone store, DEFAULT_ZONES, zone editor, district boundaries
//   [3/11] DISCLAIMER TICKER — โหมด FRC/EC
//   [4/11] MISC INIT
//   [5/11] 3D VIEW — three.js contour surface
//   [6/11] SEARCH — สถานี / lat,lon / geocode
//   [7/11] FIREBASE HELPERS — _ref/_get shortcuts
//   [8/11] WHAT-IF — สถานการณ์จำลอง K/ระยะ
//   [9/11] VC SIM — valve control simulation
//   [10/11] RAW WATER EC — สีและ interpolation
//   [11/11] RAW WATER STATIONS + ALERTS + BOOT — แม่กลอง/เจ้าพระยา, แจ้งเตือน, init สุดท้าย
//   [12/12] DASHBOARD — GISTDA-style landing view, tab bar, zone cards

// ═══════════ [1/11] CORE ENGINE — map, contour, Dijkstra, K chain (3-priority), tempK Arrhenius, RTU, live poll, report ═══════════
// ── API Configuration ──────────────────────────────────────────────────────
const API_URL      = 'https://twqonline.mwa.co.th/TWQMSServicepublic/api/mwaonmobile/getStations';
const POLL_INTERVAL = 15 * 60 * 1000; // 15 นาที (มิลลิวินาที)

// ── Parameter mode: 'frc' | 'ec' ──────────────────────────────────────────
let PARAM_MODE = 'frc';

// EC config (ความนำไฟฟ้า)
const EC_CONFIG = {
  unit: 'μS/cm',
  lo: 200,   // ต่ำกว่าปกติ
  hi: 600,   // เกินมาตรฐาน (WHO drinking water guideline)
  max: 1000, // ค่าสูงสุด scale
  yMax: 400, // แกน Y สูงสุดในกราฟ popup (ปรับได้)
  yMin: 0,   // แกน Y ต่ำสุดในกราฟ popup (ปรับได้)
  label: 'EC (ความนำไฟฟ้า)',
};

// EC Fallback data — ค่า simulate สมจริงสำหรับระบบประปา กทม.
// ** pump/plant stations (id 1-22, 33) สำคัญมาก — anchor ของ zone-based EC contour **
// ค่าอ้างอิง: บางเขน (แม่น้ำเจ้าพระยา ~240-265), มหาสวัสดิ์ (คลองมหาสวัสดิ์ ~175-210)
const EC_FALLBACK = {
  // สถานีสูบส่ง/สูบจ่าย/โรงงาน (ใช้เป็น zone anchor)
  1:245, 2:240, 3:242, 4:248, 5:246,           // TR1, TR2, TR3, Dis1, Dis2
  6:230, 7:235, 8:235, 9:235, 10:235,           // รง.ธนบุรี, สามเสน 1-4
  11:178, 12:178,                                // MTR, MDIS มหาสวัสดิ์ (EC ต่ำ)
  13:260, 14:250, 15:255, 16:265,               // สจ.ลุมพินี, ลาดพร้าว, คลองเตย, สำโรง
  17:248, 18:250, 19:252,                        // สจ.มีนบุรี, ลาดกระบัง, บางพลี
  20:210, 21:185, 22:205, 33:252,               // สจ.ราษฎร์บูรณะ, เพชรเกษม, ท่าพระ, พหลโยธิน
  // Monitor stations (popup เท่านั้น)
  23:420, 24:270, 25:260, 26:268, 27:250, 28:185, 29:230, 30:248,
  31:248, 32:250, 34:252, 35:236, 36:232, 37:252, 38:252, 39:258, 40:268,
  41:268, 42:265, 43:265, 44:252, 45:250, 46:250, 47:252, 48:252, 49:252,
  50:255, 51:258, 52:258, 53:208, 54:212, 55:214, 56:186, 57:187,
  58:180, 59:180, 60:180, 61:180
};

// ── Fallback: ข้อมูลสำรองกรณี API ไม่พร้อมใช้งาน ──────────────────────
// ข้อมูลสำรอง — จะถูกแทนที่โดย fetchAndUpdate() เมื่อ API พร้อม
let SENSORS = [];
// (moved to data/)

// ══════════════════════════════════════════════════════════════════════
// rev16.0: Valve Chamber (VC) — จุดควบคุมวาล์วในระบบท่อ
// ──────────────────────────────────────────────────────────────────────
// VC ไม่ใช่ค่าวัดจริง — เป็นค่า simulate จาก EPANET ที่คำนวณมาจากสถานีต้นทาง (สูบส่ง)
// valvePct = % การเปิดวาล์ว (0% = ปิด/ติดเฉยๆ ไม่มีอิทธิพล)
// ══════════════════════════════════════════════════════════════════════
const VC_STATIONS = [
  {id:"VC01",name:"VC ประชานุกูล (วงสว่าง)",       rcv:"12", lat:13.831165, lon:100.539147, sourceId:"SP01", valvePct:73,    type:"vc"},
  {id:"VC02",name:"VC เฉลิมพันธ์ (ประชาราษฎร์ 2)", rcv:"",   lat:13.805538, lon:100.533210, sourceId:"SP01", valvePct:36,    type:"vc"},
  {id:"VC03",name:"VC ประดิพัทธ์",                  rcv:"",   lat:13.792821, lon:100.535011, sourceId:"",     valvePct:0,     type:"vc"},
  {id:"VC04",name:"VC สามเสน (กำแพงเพชร 5)",       rcv:"",   lat:13.774578, lon:100.527910, sourceId:"SP01", valvePct:0.09,  type:"vc"},
  {id:"VC05",name:"VC สี่พระยา",                    rcv:"38", lat:13.730218, lon:100.515738, sourceId:"SP01", valvePct:0.05,  type:"vc"},
  {id:"VC06",name:"VC เจริญนคร 2 (ลาดหญ้า)",       rcv:"52", lat:13.730260, lon:100.509652, sourceId:"SP01", valvePct:0,     type:"vc"},
  {id:"VC07",name:"VC เจริญนคร 34 (ราษฎร์บูรณะ)",   rcv:"53", lat:13.693769, lon:100.486592, sourceId:"SP01", valvePct:0,     type:"vc"},
  {id:"VC08",name:"VC ราชมนตรี (กัลปพฤกษ์)",        rcv:"48", lat:13.688184, lon:100.428492, sourceId:"SP11", valvePct:73,    type:"vc"},
  {id:"VC09",name:"VC ลุมพินี (พระราม 4)",          rcv:"63", lat:13.729644, lon:100.537044, sourceId:"SP01", valvePct:null,  type:"vc"},
  {id:"VC10",name:"VC คลองเตย (สุนทรโกษา)",         rcv:"61", lat:13.720916, lon:100.557552, sourceId:"SP02", valvePct:0,     type:"vc"},
  {id:"VC11",name:"VC พระราม 9",                    rcv:"51", lat:13.731900, lon:100.701343, sourceId:"SP02", valvePct:0,     type:"vc"},
  {id:"VC12",name:"VC นวมินทร์ (ประเสริฐมนูกิจ)",   rcv:"25", lat:13.810090, lon:100.649639, sourceId:"SP03", valvePct:0.7,   type:"vc"},
  {id:"VC13",name:"VC มัยลาภ",                      rcv:"50", lat:13.831735, lon:100.613340, sourceId:"SP03", valvePct:0.55,  type:"vc"},
  {id:"VC14",name:"VC วงแหวนตะวันออก",              rcv:"",   lat:13.647423, lon:100.686734, sourceId:"SP03", valvePct:null,  type:"vc"}
];

// VC_PAIR: K (decay rate 1/hr) สำหรับ pair source→VC (ปรับได้จาก UI)
// Travel time คำนวณจากระยะทางจริงใน EPANET (ไม่ใช้ค่าคงที่)
const VC_PAIR = {
  // ════ ฝั่งเจ้าพระยา (BK) — K จากงานวิจัย ม.เกษตร: Kb=0.778/day ════
  // k_total = (0.778 + 2.0) / 24 = 0.1158 /hr
  "VC01": { K:0.1158, tt:2 },   // วงศ์สว่าง (ประชานุกูล) ← TR1
  "VC02": { K:0.1158, tt:2 },   // เฉลิมพันธ์ ← TR1
  "VC03": { K:0.1158, tt:2 },   // ประดิพัทธ์ ← TR1
  "VC04": { K:0.1158, tt:3 },   // สามเสน ← TR1
  "VC05": { K:0.1158, tt:6 },   // สี่พระยา ← TR1
  "VC06": { K:0.1158, tt:6 },   // เจริญนคร 2 (ลาดหญ้า) ← TR1
  "VC09": { K:0.1158, tt:6 },   // ลุมพินี (พระราม 4) ← TR1
  "VC10": { K:0.1158, tt:7 },   // คลองเตย (สุนทรโกษา) ← TR2
  "VC11": { K:0.1158, tt:7 },   // พระราม 9 ← TR2
  "VC12": { K:0.1158, tt:4 },   // นวมินทร์ (ประเสริฐมนูกิจ) ← TR3
  "VC13": { K:0.1158, tt:3 },   // มัยลาภ ← TR3
  "VC14": { K:0.1158, tt:11 },  // วงแหวนตะวันออก ← TR3
  // ════ ฝั่งมหาสวัสดิ์ (MH) — K จากงานวิจัย ม.เกษตร: Kb=0.400/day ════
  // k_total = (0.400 + 2.0) / 24 = 0.1000 /hr
  "VC07": { K:0.1000, tt:7 },   // เจริญนคร 34 (ราษฎร์บูรณะ) ← MTR
  "VC08": { K:0.1000, tt:3 },   // ราชมนตรี (กัลปพฤกษ์) ← MTR
};

// ── VC helper functions ──────────────────────────────────────────────

/** VC active = valvePct > 0 && valvePct !== null */
function isVcActive(vc) {
  return vc.valvePct != null && vc.valvePct > 0;
}

/** คำนวณ FRC(sim) ที่ VC จาก source (EPANET first-order decay)
 *  ⚠ ค่านี้เป็น simulated value จาก EPANET — ไม่ใช่ค่าวัดจริง
 *  valve% ไม่มีผลต่อความเข้มข้น — แค่บอกว่าเปิด/ปิด
 *  0% = ปิด (ไม่มีน้ำไหล → FRC=0), >0% = เปิด (decay ปกติ) */
function getVcFrc(vcId) {
  const vc = VC_STATIONS.find(v => v.id === vcId);
  if (!vc || !isVcActive(vc)) return 0; // 0% หรือ null → ไม่มี FRC
  const src = SENSORS.find(s => String(s.id) === vc.sourceId) ||
              SENSORS_FALLBACK.find(s => String(s.id) === vc.sourceId);
  if (!src || !src.frc) return 0;
  const pair = VC_PAIR[vcId] || { K: 0.05, tt: 3 };
  // ใช้ Travel Time จริง (ประมาณการณ์) แทน Euclidean distance
  const ttHr = pair.tt || 3;
  // FRC_sim(vc) = FRC(source) × e^(-K × tt)  — ค่า simulate ไม่ใช่ค่าวัดจริง
  return Math.max(0, src.frc * Math.exp(-pair.K * ttHr));
}

/** อัปเดต FRC ของ VC ทุกจุด (เรียกหลัง API poll) — ไม่แตะ SENSORS */
function updateVcFrc() {
  for (const vc of VC_STATIONS) {
    vc.frc = getVcFrc(vc.id);
  }
}

// ── rev16.0: VC ไม่ merge เข้า SENSORS / SENSORS_FALLBACK ──
// VC เป็นค่า sim ใช้แค่ใน contour calculation เท่านั้น
// ไม่ปนกับ สรุปคลอรีน / report / alert / LINE bot (61 สถานีเดิม)

// ── Load saved VC pair config ──
try {
  const saved = JSON.parse(localStorage.getItem('vc_pair_v32') || '{}');
  Object.entries(saved).forEach(([id, cfg]) => {
    if (VC_PAIR[id]) Object.assign(VC_PAIR[id], cfg);
  });
} catch(e){}


// (moved to data/)
// (moved to data/)
const FRC_MIN=0.2, FRC_HI=1.0;

function lerp(a,b,t){return Math.round(a+(b-a)*Math.max(0,Math.min(1,t)));}

function frcColor(v,a=1){
  // < 0.2   → แดง-ส้มเข้ม (ต่ำกว่ามาตรฐาน)
  // 0.2–0.3 → ส้มเหลือง (เฝ้าระวัง)
  // 0.3–0.5 → เขียวเหลือง (ผ่าน)
  // 0.5–0.8 → เขียวฟ้า (ดี)
  // 0.8–1.2 → ฟ้าน้ำเงิน (ดีมาก)
  // ≥ 1.2   → น้ำเงินม่วง (สูงมาก)
  v=Math.max(0,Math.min(2.0,v));
  let r,g,b;
  if(v<0.2){
    const u=v/0.2;
    r=lerp(190,220,u); g=lerp(30,80,u); b=lerp(20,10,u);
  } else if(v<0.3){
    const u=(v-0.2)/0.1;
    r=lerp(220,240,u); g=lerp(80,170,u); b=lerp(10,20,u);
  } else if(v<0.5){
    const u=(v-0.3)/0.2;
    r=lerp(240,120,u); g=lerp(170,200,u); b=lerp(20,80,u);
  } else if(v<0.8){
    const u=(v-0.5)/0.3;
    r=lerp(120,50,u); g=lerp(200,190,u); b=lerp(80,170,u);
  } else if(v<1.2){
    const u=(v-0.8)/0.4;
    r=lerp(50,40,u); g=lerp(190,80,u); b=lerp(170,180,u);
  } else {
    const u=Math.min(1,(v-1.2)/0.3);
    r=lerp(40,100,u); g=lerp(80,40,u); b=lerp(180,150,u);
  }
  return `rgba(${r},${g},${b},${a})`;
}

function statusColor(f){return f>=0.8?'#2850b4':f>=0.5?'#32beaa':f>=0.3?'#78c850':f>=0.2?'#f0aa14':'#dc5010';}
function statusText(f){return f>=0.8?'✓ ดีมาก (≥0.8)':f>=0.5?'✓ ดี (≥0.5)':f>=0.2?'✓ ผ่าน (≥0.2)':'⚠ ต่ำกว่ามาตรฐาน';}

// ── EPANET First-Order Chlorine Decay (IDW weight) ──────────────────────────
// สมการ EPANET: C = C₀ × exp(−K_total × t)
//   K_total = kb + kw × (4/D)
//   t = L / v  (travel time)
// ดังนั้น: C/C₀ = exp(−(kb + kw×4/D) × L/v)
// น้ำหนัก IDW: w = (1/d^pw) × decay_factor
//   decay_factor = exp(−K_total × d_km×1000 / v)
//
// พารามิเตอร์ตาม EPANET Bangkok typical values:
const EPANET = {
  kb:  0.70,   // bulk decay rate  [1/day]
  kw:  0.10,   // wall decay rate  [m/day]
  D:   0.20,   // pipe diameter    [m]
  v:   0.45,   // flow velocity    [m/s]
};

// K_total [1/s] = (kb/86400) + (kw/86400)×(4/D)
let K_total = (EPANET.kb / 86400) + (EPANET.kw / 86400) * (4 / EPANET.D);
const DEG_TO_KM = 111.0;
// rev18: Euclidean-to-pipe distance correction factor
// Euclidean distance สั้นกว่าเส้นท่อจริง ~1.3x (calibrate จาก 38 monitor stations)
// ใช้กับ zone-based decay ที่ไม่มี pipe grid data เท่านั้น
const EUCLID_PIPE_FACTOR = 1.30;

// ══════════════════════════════════════════════════════════════════════
// Temperature-corrected K — Arrhenius layer (toggle, default OFF)
// ──────────────────────────────────────────────────────────────────────
// K(T) = K × exp(−(E/R) × (1/(T+273.15) − 1/(T_REF+273.15)))
//   E/R  = 8971 K   (Kongbuchakiat et al. 2025, Results in Engineering 28:108043, BKWTP)
//   T_REF = อุณหภูมิ ณ ตอน calibrate K (default 32°C = สนาม เม.ย.69, ปรับผ่าน setTempRef)
// System temp = median ของ value.tmp_6 (TWQMS) เฉพาะช่วง 28–34°C
//   เหตุผล band filter (สำรวจจริง ก.ค.69, n=49):
//   - กลุ่มใหญ่ n≈38 เกาะแน่น 31–32°C = ค่าจริงน้ำในท่อ กทม. (≈อุณหภูมิดิน)
//   - SW01–SW10 อ่าน 24–27°C ต่ำเกินฟิสิกส์ (คาดวัดในอาคาร/offset) → ตัดทิ้ง
//   - S026/S027/S030 อ่าน 34–35°C สูงผิดกลุ่ม → ตัดทิ้ง
// สมการ FO เดิมไม่เปลี่ยน — เปลี่ยนเฉพาะค่า K ผ่านตัวคูณ dimensionless
// ══════════════════════════════════════════════════════════════════════
let TEMP_CORR_ON = false;
try { TEMP_CORR_ON = localStorage.getItem('frc_temp_corr') === '1'; } catch(e){}
// T_REF = อุณหภูมิน้ำตอน calibrate K จริง — ไม่ใช่ 21.4 ของขวดแล็บ
// เหตุผล: CONTOUR_K_OVERRIDE (0.065–0.10/hr ≈ 1.6–2.4/day) calibrate สนาม 5–12 เม.ย.69
// กลางหน้าร้อน น้ำ ~32°C → ความร้อนถูกอบใน K แล้ว (1.92/day ≈ เส้น FO 30°C ของ กนว.)
// ตั้ง ref=32 ทำให้ factor≈1 วันนี้ และกลายเป็นตัวปรับฤดูกาล: หนาว→K ลด, ร้อนจัด→K เพิ่ม
let TEMP_REF_C = 32.0;
// Firebase = source of truth (ค่ากลางทั้งระบบ ทุกเครื่องตรงกัน)
// localStorage = cache สำหรับตอน offline/ก่อน FB พร้อมเท่านั้น — บทเรียน K override Edge/Chrome
try { const _tr = parseFloat(localStorage.getItem('frc_temp_ref')); if (isFinite(_tr) && _tr >= 20 && _tr <= 36) TEMP_REF_C = _tr; } catch(e){}

function _applyTempRef(v, save) {
  TEMP_REF_C = v;
  try { localStorage.setItem('frc_temp_ref', String(v)); } catch(e){}
  updateTempFactor(typeof SENSORS !== 'undefined' ? SENSORS : []);
  if (typeof buildIdwCache === 'function') buildIdwCache();
  if (typeof redrawContour === 'function') redrawContour();
}

async function setTempRef(t) {  // console: setTempRef(31) → บันทึก Firebase + ทุกเครื่อง sync
  const v = parseFloat(t);
  if (!isFinite(v) || v < 20 || v > 36) { console.warn('[TempK] ref ต้องอยู่ 20–36°C'); return; }
  _applyTempRef(v);
  if (window._fbReady && window._fb) {
    try {
      await window._fbSet(window._fbRef(window._fb, 'history/_temp_ref_c'), { v: v, ts: Date.now() });
      console.log('[TempK] TEMP_REF_C =', v, '°C → บันทึก Firebase แล้ว (ทุกเครื่องได้ค่านี้)');
    } catch(e) { console.warn('[TempK] FB save fail (ใช้ local ไปก่อน):', e.message); }
  } else {
    console.warn('[TempK] Firebase ยังไม่พร้อม — ตั้งเฉพาะเครื่องนี้ก่อน');
  }
}
window.setTempRef = setTempRef;

// โหลดจาก Firebase + subscribe: ใครแก้ ref เครื่องอื่นเห็นทันที contour วาดใหม่เอง
function _tempRefFbInit() {
  if (!window._fbReady || !window._fb || !window._fbOnValue) { setTimeout(_tempRefFbInit, 2000); return; }
  try {
    window._fbOnValue(window._fbRef(window._fb, 'history/_temp_ref_c'), snap => {
      const d = snap.val();
      const v = d && parseFloat(d.v);
      if (isFinite(v) && v >= 20 && v <= 36 && Math.abs(v - TEMP_REF_C) > 0.001) {
        console.log('[TempK] ref จาก Firebase:', v, '°C');
        _applyTempRef(v);
      }
    });
  } catch(e) { console.warn('[TempK] FB subscribe fail:', e.message); }
}
_tempRefFbInit();
const TEMP_EOR   = 8971;   // E/R [K]
window._sysTempC    = null; // median อุณหภูมิระบบล่าสุด (°C)
window._tempKFactor = 1;    // ตัวคูณ K ที่ใช้จริง (=1 เมื่อปิด/ไม่มีข้อมูล)

function _tempRawFactor(T) {
  return Math.exp(-TEMP_EOR * (1/(T+273.15) - 1/(TEMP_REF_C+273.15)));
}

function updateTempFactor(sensors) {
  const ts = [];
  (sensors || []).forEach(s => {
    const t = parseFloat(s.tempC);
    if (isFinite(t) && t > 0) ts.push(t);
  });
  if (ts.length === 0) {
    window._sysTempC = null;
    window._tempKFactor = 1;
    const el0 = document.getElementById('ep-tempcorr-info');
    if (el0) el0.textContent = '🌡 ไม่มีข้อมูล tmp_6 — K ×1.00';
    return;
  }
  // band filter 28–34°C (ตัด SW ต่ำเพี้ยน + ตัวสูงเพี้ยน) — fallback median รวมถ้าเหลือน้อย
  let band = ts.filter(t => t >= 28 && t <= 34);
  if (band.length < 5) band = ts.slice();
  band.sort((a,b) => a - b);
  const med = band[Math.floor(band.length / 2)];
  const T = Math.min(35, Math.max(20, med)); // clamp กันค่าหลุด
  window._sysTempC = T;
  const rawF = _tempRawFactor(T);
  window._tempKFactor = TEMP_CORR_ON ? rawF : 1;
  console.log('[TempK] n=' + ts.length + ' (band=' + band.length + ') median=' + med.toFixed(2) +
              '°C → factor ×' + rawF.toFixed(2) + (TEMP_CORR_ON ? ' (ON)' : ' (OFF, ใช้ ×1)'));
  const el = document.getElementById('ep-tempcorr-info');
  if (el) el.textContent = '🌡 ' + med.toFixed(1) + '°C (ref ' + TEMP_REF_C.toFixed(1) + ') → K ×' + rawF.toFixed(2) +
                           (TEMP_CORR_ON ? '' : ' (ปิดอยู่)');
}

function toggleTempCorr(on) {
  TEMP_CORR_ON = !!on;
  try { localStorage.setItem('frc_temp_corr', TEMP_CORR_ON ? '1' : '0'); } catch(e){}
  updateTempFactor(typeof SENSORS !== 'undefined' ? SENSORS : []);
  if (typeof buildIdwCache === 'function') buildIdwCache();
  if (typeof redrawContour === 'function') redrawContour();
}
try {
  const _tcCb = document.getElementById('ep-tempcorr');
  if (_tcCb) _tcCb.checked = TEMP_CORR_ON;
} catch(e){}

function applyEpanet() {
  EPANET.kb = parseFloat(document.getElementById('ep-kb').value) || 0.80;
  EPANET.kw = parseFloat(document.getElementById('ep-kw').value) || 0.10;
  EPANET.D  = parseFloat(document.getElementById('ep-d').value)  || 0.20;
  EPANET.v  = parseFloat(document.getElementById('ep-v').value)  || 0.45;
  K_total = (EPANET.kb / 86400) + (EPANET.kw / 86400) * (4 / EPANET.D);
  const k_per_km = K_total * 1000 / EPANET.v;
  document.getElementById('ep-ktotal').textContent =
    `K = ${(K_total*86400).toFixed(4)}/day  |  ${k_per_km.toFixed(4)}/km`;
  // ซ่อน auto-fit info
  document.getElementById('ep-autofit-info').style.display = 'none';
  buildIdwCache();
  redrawContour();
}

function applyAutoFitK() {
  // ใช้ค่า k เฉลี่ยจาก STATION_K ที่ fit ได้ มาอัปเดต K_total สำหรับ contour
  const kVals = Object.values(STATION_K); // k_per_hour
  const info = document.getElementById('ep-autofit-info');
  const btn  = document.getElementById('btn-autofit');
  if (kVals.length === 0) {
    info.style.display = 'block';
    info.style.color = '#a06000';
    info.textContent = '⏳ ยังไม่มีข้อมูล auto-fit k\nรอสะสมข้อมูล ≥3 จุด (30 นาที)';
    return;
  }
  // เฉลี่ย k_per_hour → แปลงเป็น K_total [1/s]
  const kAvgHr = kVals.reduce((a,b) => a+b, 0) / kVals.length;
  const kAvgSec = kAvgHr / 3600;
  K_total = kAvgSec;
  const k_per_km = K_total * 1000 / EPANET.v;
  // อัปเดต display
  document.getElementById('ep-ktotal').textContent =
    `K = ${(K_total*86400).toFixed(4)}/day  |  ${k_per_km.toFixed(4)}/km`;
  info.style.display = 'block';
  info.style.color = '#1a4a80';
  info.textContent = `✅ Auto-fit k จาก ${kVals.length} สถานี\nk̄ = ${kAvgHr.toFixed(4)}/hr`;
  buildIdwCache();
  redrawContour();
}

// แสดงค่า K เริ่มต้นหลัง load
window.addEventListener('load', () => {
  const k_per_km = K_total * 1000 / EPANET.v;
  document.getElementById('ep-ktotal').textContent =
    `K = ${(K_total*86400).toFixed(4)}/day  |  ${k_per_km.toFixed(4)}/km`;
  initStationKEditor();
});

// ── rev18: Per-Station K for Contour ─────────────────────────────────────────
// CONTOUR_K_OVERRIDE: K ที่ user ปรับเฉพาะสถานี สำหรับ contour
// เริ่มต้นเป็น {} → ถ้ามีค่า จะ override K_total สำหรับสถานีนั้นใน contour
const CONTOUR_K_OVERRIDE = {
  // rev22: K ปรับจาก UI + calibrate กับ monitor 1 สัปดาห์ (5-12 เม.ย. 2569)
  'SP04': 0.0800,  // สถานีสูบจ่ายน้ำบางเขน 1 ( HL=9hr
  'SP05': 0.0800,  // สถานีสูบจ่ายน้ำบางเขน 2 ( HL=9hr
  'SP06': 0.0800,  // โรงงานผลิตน้ำธนบุรี HL=9hr
  'SP07': 0.0800,  // โรงงานผลิตน้ำสามเสน 1 HL=9hr
  'SP08': 0.0800,  // โรงงานผลิตน้ำสามเสน 2 HL=9hr
  'SP09': 0.0800,  // โรงงานผลิตน้ำสามเสน 3 HL=9hr
  'SP10': 0.0800,  // โรงงานผลิตน้ำสามเสน 4 HL=9hr
  'SP12': 0.0700,  // สถานีสูบจ่ายน้ำมหาสวัสดิ์ HL=10hr
  'SW01': 0.0800,  // สถานีสูบจ่ายน้ำลุมพินี HL=9hr
  'SW02': 0.0850,  // สถานีสูบจ่ายน้ำลาดพร้าว HL=8hr
  'SW03': 0.0850,  // สถานีสูบจ่ายน้ำคลองเตย HL=8hr
  'SW04': 0.0900,  // สถานีสูบจ่ายน้ำสำโรง HL=8hr
  'SW05': 0.0900,  // สถานีสูบจ่ายน้ำมีนบุรี HL=8hr
  'SW06': 0.1000,  // สถานีสูบจ่ายน้ำลาดกระบัง HL=7hr
  'SW07': 0.0900,  // สถานีสูบจ่ายน้ำบางพลี HL=8hr
  'SW08': 0.0750,  // สถานีสูบจ่ายน้ำราษฎร์บูรณ HL=9hr
  'SW09': 0.0650,  // สถานีสูบจ่ายน้ำเพชรเกษม HL=11hr
  'SW10': 0.0800,  // สถานีสูบจ่ายน้ำท่าพระ HL=9hr
  'SW11': 0.0800,  // สถานีสูบจ่ายน้ำพหลโยธิน HL=9hr
};

// ══════════════════════════════════════════════════════════════════════════════
// V27 HYBRID K — back-calculate K ต่อสถานีจาก live FRC sensor จริง
// วิธี: K_hybrid = -ln(FRC_dest / FRC_src) / travel_time
// อัปเดตทุกรอบ live data (~30 วิ) ผ่าน updateHybridK()
// Priority: CONTOUR_K_OVERRIDE > STATION_K_OVERRIDE > K_total
// ══════════════════════════════════════════════════════════════════════════════




/**
 * renderHybridKPanel() — แสดงตาราง Hybrid K ใน sidebar
 */

// Source stations สำหรับ dropdown (pump + plant ที่มี zone)
const _EP_PUMP_STATIONS = [];

function initStationKEditor() {
  const sel = document.getElementById('ep-station-select');
  if (!sel) return;
  // รวบรวม source stations
  const excl = new Set(['SP01','SP02','SP03','SP11']);
  const srcTypes = new Set(['pump','plant']);
  const stns = SENSORS.filter(s => srcTypes.has(s.type) && !excl.has(String(s.id)));
  stns.sort((a,b) => String(a.id).localeCompare(String(b.id)));
  _EP_PUMP_STATIONS.length = 0;
  stns.forEach(s => {
    _EP_PUMP_STATIONS.push(s);
    const opt = document.createElement('option');
    opt.value = String(s.id);
    const shortName = (s.name || '').replace('สถานีสูบจ่ายน้ำ','สจ.').replace('โรงงานผลิตน้ำ','รง.');
    opt.textContent = `${s.id} — ${shortName}`;
    sel.appendChild(opt);
  });
  // rev22: เพิ่ม VC (Valve Chamber) เข้า dropdown
  if (typeof VC_STATIONS !== 'undefined') {
    const sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '── VC (Valve Chamber) ──';
    sel.appendChild(sep);
    VC_STATIONS.forEach(vc => {
      const opt = document.createElement('option');
      opt.value = vc.id;
      const shortName = (vc.name || '').replace('VC ','');
      opt.textContent = `${vc.id} — ${shortName}`;
      sel.appendChild(opt);
    });
  }
  renderStationKList();
}

function onStationKSelect() {
  const sid = document.getElementById('ep-station-select').value;
  const editor = document.getElementById('ep-station-k-editor');
  if (!sid) { editor.style.display = 'none'; return; }
  editor.style.display = 'block';
  // แสดงค่า K ปัจจุบัน — รองรับทั้ง สจ. และ VC
  let k_hr;
  if (sid.startsWith('VC')) {
    const pair = typeof VC_PAIR !== 'undefined' ? VC_PAIR[sid] : null;
    k_hr = CONTOUR_K_OVERRIDE[sid] != null ? CONTOUR_K_OVERRIDE[sid]
         : pair ? pair.K : 0.07;
  } else {
    k_hr = CONTOUR_K_OVERRIDE[sid] != null ? CONTOUR_K_OVERRIDE[sid]
         : STATION_K_OVERRIDE[sid] != null ? STATION_K_OVERRIDE[sid]
         : (K_total * 3600);
  }
  document.getElementById('ep-station-k').value = k_hr.toFixed(5);
  updateStationKDisplay(k_hr);
}

function updateStationKDisplay(k_hr) {
  const hl = k_hr > 0 ? (0.693 / k_hr).toFixed(1) : '∞';
  const kday = (k_hr * 24).toFixed(4);
  document.getElementById('ep-station-hl').textContent = hl + ' ชม.';
  document.getElementById('ep-station-kday').textContent = kday + '/day';
}

// Live update display when typing
document.addEventListener('DOMContentLoaded', () => {
  const inp = document.getElementById('ep-station-k');
  if (inp) inp.addEventListener('input', () => {
    updateStationKDisplay(parseFloat(inp.value) || 0);
  });
});

function applyStationK() {
  const sid = document.getElementById('ep-station-select').value;
  if (!sid) return;
  const k_hr = parseFloat(document.getElementById('ep-station-k').value);
  if (isNaN(k_hr) || k_hr <= 0) return;
  CONTOUR_K_OVERRIDE[sid] = k_hr;
  // rev22: ถ้าเป็น VC → อัพเดท VC_PAIR.K ด้วย (ใช้ใน buildIdwCache VC section)
  if (sid.startsWith('VC') && typeof VC_PAIR !== 'undefined' && VC_PAIR[sid]) {
    VC_PAIR[sid].K = k_hr;
  }
  _saveContourK();
  renderStationKList();
  buildIdwCache();
  redrawContour();
}

function resetStationK() {
  const sid = document.getElementById('ep-station-select').value;
  if (!sid) return;
  delete CONTOUR_K_OVERRIDE[sid];
  // rev22: reset VC_PAIR.K กลับเป็นค่า default ตามฝั่ง
  if (sid.startsWith('VC') && typeof VC_PAIR !== 'undefined' && VC_PAIR[sid]) {
    const mhVCs = new Set(['VC07','VC08']);
    VC_PAIR[sid].K = mhVCs.has(sid) ? 0.1000 : 0.1158;
  }
  _saveContourK();
  onStationKSelect(); // refresh display
  renderStationKList();
  buildIdwCache();
  redrawContour();
}

// ══════════════════════════════════════════════════════════════════════════════
// 📚 Auto K จากงานวิจัย ม.เกษตรศาสตร์ (First-order Kb)
// อ้างอิง: โครงการ กนว. 32/2566 — EPANET-MSX Chlorine Loss Assessment
// Kb(BK) = 0.778/day, Kb(MH) = 0.400/day, Kw = 0.1/day, D = 0.2m
// k_total = Kb + 4×Kw/D = Kb + 2.0/day → แปลงเป็น /hr
// ══════════════════════════════════════════════════════════════════════════════
function applyResearchK() {
  const Kb_BK = 0.778;  // /day — Bangkhen (จากการทดลอง 60 ตัวอย่าง)
  const Kb_MH = 0.400;  // /day — Mahasawat (จากการทดลอง)
  const Kw = 0.1;       // /day — Wall decay coefficient
  const D  = 0.2;       // m    — Average pipe diameter (equivalent)
  const wall_term = 4 * Kw / D; // = 2.0/day

  const k_BK = (Kb_BK + wall_term) / 24; // 2.778/day = 0.1158/hr
  const k_MH = (Kb_MH + wall_term) / 24; // 2.400/day = 0.1000/hr

  // สถานีฝั่ง MH: SP06(ธนบุรี), SP11(MH สูบส่ง), SP12(MH สูบจ่าย),
  //                SW08(ราษฎร์บูรณะ), SW09(เพชรเกษม), SW10(ท่าพระ)
  const MH_STATIONS = new Set(['SP06','SP11','SP12','SW08','SW09','SW10']);

  // สถานี Sensor ทั้งหมด
  const allIds = SENSORS.map(s => s.id).filter(id => id.startsWith('SP') || id.startsWith('SW'));
  
  let applied = { bk: [], mh: [] };
  allIds.forEach(sid => {
    const isMH = MH_STATIONS.has(sid);
    const k = isMH ? k_MH : k_BK;
    CONTOUR_K_OVERRIDE[sid] = parseFloat(k.toFixed(4));
    (isMH ? applied.mh : applied.bk).push(sid);
  });

  // VC stations — ฝั่งเจ้าพระยา (BK) vs ฝั่งมหาสวัสดิ์ (MH)
  const MH_VCS = new Set(['VC07','VC08']); // เจริญนคร 34, ราชมนตรี
  let vcApplied = { bk: [], mh: [] };
  Object.keys(VC_PAIR).forEach(vcId => {
    const isMH = MH_VCS.has(vcId);
    VC_PAIR[vcId].K = isMH ? parseFloat(k_MH.toFixed(4)) : parseFloat(k_BK.toFixed(4));
    (isMH ? vcApplied.mh : vcApplied.bk).push(vcId);
  });

  _saveContourK();
  onStationKSelect();
  renderStationKList();
  buildIdwCache();
  redrawContour();

  // แสดงข้อมูล
  const info = document.getElementById('research-k-info');
  info.style.display = 'block';
  info.innerHTML = `
    <b>📚 ใช้ค่า Kb จากงานวิจัย ม.เกษตร (กนว.32/2566)</b><br>
    ▸ ฝั่ง BK: Kb=${Kb_BK}/day → k=${k_BK.toFixed(4)}/hr (${applied.bk.length} สถานี + ${vcApplied.bk.length} VC)<br>
    ▸ ฝั่ง MH: Kb=${Kb_MH}/day → k=${k_MH.toFixed(4)}/hr (${applied.mh.length} สถานี + ${vcApplied.mh.length} VC)<br>
    ▸ Kw=${Kw}/day, D=${D}m, wall=${wall_term.toFixed(1)}/day<br>
    <span style="color:#888;">สูตร: k_total = Kb + 4×Kw/D</span>
  `;

  console.log(`[ResearchK] ✅ Applied — BK: ${k_BK.toFixed(4)}/hr (${applied.bk.join(',')} + VC:${vcApplied.bk.join(',')}), MH: ${k_MH.toFixed(4)}/hr (${applied.mh.join(',')} + VC:${vcApplied.mh.join(',')})`);
}

// ── Firebase + localStorage save/load ────────────────────────────────────
const _CONTOUR_K_FB_PATH = 'settings/contour_k_override';

async function _saveContourK() {
  // 1. localStorage (backup เสมอ)
  try { localStorage.setItem('mwa_contour_k_override', JSON.stringify(CONTOUR_K_OVERRIDE)); } catch(e) {}
  // 2. Firebase (primary) — ต้อง login
  if (window._fbReady && window._fb) {
    if (!window._fbUser) {
      alert('⚠️ กรุณา Login ก่อนบันทึกค่า K\n\nไปที่ ☰ → Login (ล่างสุด sidebar)');
      return;
    }
    try {
      await window._fbSet(window._fbRef(window._fb, _CONTOUR_K_FB_PATH), CONTOUR_K_OVERRIDE);
      console.log('[ContourK] ✅ saved to Firebase:', Object.keys(CONTOUR_K_OVERRIDE).length, 'stations');
    } catch(e) {
      console.warn('[ContourK] Firebase save failed:', e.message, '→ localStorage only');
    }
  }
}

async function _loadContourK() {
  // 1. ลอง Firebase ก่อน
  if (window._fbReady && window._fb) {
    try {
      const snap = await window._fbGet(window._fbRef(window._fb, _CONTOUR_K_FB_PATH));
      if (snap && snap.exists()) {
        const data = snap.val();
        const count = Object.keys(data).length;
        if (count > 0) {
          Object.keys(CONTOUR_K_OVERRIDE).forEach(k => delete CONTOUR_K_OVERRIDE[k]);
          Object.assign(CONTOUR_K_OVERRIDE, data);
          // rev22: sync VC_PAIR.K with loaded K overrides
          if (typeof VC_PAIR !== 'undefined') {
            Object.keys(data).forEach(sid => {
              if (sid.startsWith('VC') && VC_PAIR[sid]) VC_PAIR[sid].K = data[sid];
            });
          }
          console.log(`[ContourK] ✅ loaded ${count} station K from Firebase`);
          renderStationKList();
          return;
        }
      }
    } catch(e) {
      console.warn('[ContourK] Firebase load failed:', e.message);
    }
  }
  // 2. Fallback: localStorage
  try {
    const saved = localStorage.getItem('mwa_contour_k_override');
    if (saved) {
      const data = JSON.parse(saved);
      Object.assign(CONTOUR_K_OVERRIDE, data);
      console.log(`[ContourK] loaded ${Object.keys(data).length} station K from localStorage`);
    }
  } catch(e) {}
  renderStationKList();
}

// โหลด: localStorage ทันที (fast), Firebase หลัง ready (override)
try {
  const saved = localStorage.getItem('mwa_contour_k_override');
  if (saved) Object.assign(CONTOUR_K_OVERRIDE, JSON.parse(saved));
} catch(e) {}

// โหลดจาก Firebase เมื่อพร้อม
if (window._fbReady) {
  _loadContourK();
} else {
  window.addEventListener('firebase-ready', () => _loadContourK(), { once: true });
}

function renderStationKList() {
  const el = document.getElementById('ep-station-k-list');
  if (!el) return;
  const keys = Object.keys(CONTOUR_K_OVERRIDE);
  if (keys.length === 0) {
    el.innerHTML = '<div style="color:#c0a0b0;text-align:center;padding:4px;">ยังไม่มี K ที่ปรับเฉพาะสถานี</div>';
    return;
  }
  let html = '<div style="color:#804060;font-weight:600;margin-bottom:3px;">K ที่ปรับแล้ว:</div>';
  keys.sort().forEach(sid => {
    const k = CONTOUR_K_OVERRIDE[sid];
    const s = SENSORS.find(x => String(x.id) === sid);
    const name = s ? (s.name||'').replace('สถานีสูบจ่ายน้ำ','สจ.').replace('โรงงานผลิตน้ำ','รง.') : sid;
    const hl = (0.693 / k).toFixed(0);
    html += `<div style="display:flex;justify-content:space-between;padding:1px 0;border-bottom:1px solid #f5e8f0;">`;
    html += `<span>${sid} ${name.substring(0,15)}</span>`;
    html += `<span style="font-family:monospace;">${k.toFixed(4)}/hr (hl=${hl}h)</span>`;
    html += `</div>`;
  });
  el.innerHTML = html;
}

function epanetDecay(dKm, sensor, lat, lon, distMult) {
  // single pressure layer with automatic source selection.
  //   1) s.rtuPressure — pre-injected per-sensor nearest RTU pressure (fastest, avoids O(N) scan per pixel)
  //   2) _pressureGrid fallback — passed in as distMult by callers that have (j,i),
  //      used when RTU live is unavailable (e.g. GitHub Pages / CORS / mixed-content)
  //   Only ONE source is ever applied → no double-counting.
  // หมายเหตุ: DMA velocity ถูกถอดออกถาวร (relay เปราะ + ไม่มีข้อมูล diameter รายท่อ)
  //   เนื่องจาก relay pattern ไม่เสถียร (browser tab ต้องเปิดค้าง) และ
  //   ไม่มี pipe diameter รายจุด → velocity คำนวณเพี้ยนกว่า sensor จริง
  let L_m = dKm * 1000;
  let v_adj = EPANET.v;
  let rtuApplied = false;

  // RTU Bernoulli: v ∝ √P (pFactor per-sensor)
  if (sensor && sensor.rtuPressure > 0 && window._rtuPNominal > 0) {
    const pFactor = Math.max(0.5, Math.min(2.0, Math.sqrt(sensor.rtuPressure / window._rtuPNominal)));
    v_adj = EPANET.v * pFactor;
    rtuApplied = true;
  }
  // Fallback: static _pressureGrid factor (distMult) ONLY if RTU live not applied
  if (!rtuApplied && distMult != null && distMult > 0) {
    L_m *= distMult;
  }
  const t   = L_m / v_adj;  // travel time [s] — pressure-adjusted (single source)

  if (sensor && sensor.id != null) {
    const sid = String(sensor.id);

    // Priority 1: CONTOUR_K_OVERRIDE — user ปรับ K เฉพาะสถานี (สูงสุด)
    if (CONTOUR_K_OVERRIDE[sid] != null) {
      return Math.exp(-(CONTOUR_K_OVERRIDE[sid] * window._tempKFactor / 3600) * t);
    }

    // Priority 2: STATION_K_OVERRIDE — K fit จากข้อมูล 3 เดือน (hardcode)
    if (STATION_K_OVERRIDE[sid] != null) {
      return Math.exp(-(STATION_K_OVERRIDE[sid] * window._tempKFactor / 3600) * t);
    }
  }
  // Priority 3 (fallback): K_total จาก EPANET sidebar (สำหรับสถานีที่ไม่มี K override)
  return Math.exp(-K_total * window._tempKFactor * t);
}

// ── Parameter helpers ────────────────────────────────────────────────────────
// rev16.0: mapping string id → numeric id สำหรับ EC_FALLBACK
const _EC_ID_MAP = {'SP01':1,'SP02':2,'SP03':3,'SP04':4,'SP05':5,'SP06':6,'SP07':7,'SP08':8,'SP09':9,'SP10':10,'SP11':11,'SP12':12,
  'SW01':13,'SW02':14,'SW03':15,'SW04':16,'SW05':17,'SW06':18,'SW07':19,'SW08':20,'SW09':21,'SW10':22,'SW11':33};

function getParamVal(s) {
  if (PARAM_MODE === 'ec') {
    if (s.ec != null) return s.ec;
    // fallback: numeric id
    if (typeof s.id === 'number') return EC_FALLBACK[s.id] || 300;
    // fallback: string id → map to numeric
    const numId = _EC_ID_MAP[s.id];
    if (numId && EC_FALLBACK[numId]) return EC_FALLBACK[numId];
    return 300;
  }
  return s.frc;
}

// EC color scale: blue gradient (low=light, high=dark blue, over=orange-red)
function ecColor(v, alpha=1) {
  const a = alpha;
  if (v >= EC_CONFIG.hi)   return `rgba(180,40,0,${a})`;    // ≥600 เกินมาตรฐาน
  if (v >= EC_CONFIG.lo)   return `rgba(20,100,180,${a})`;  // 200–600 ปกติ
  if (v >= 100)            return `rgba(40,160,220,${a})`;  // 100–200 ต่ำ
  return `rgba(180,230,255,${a})`;                           // <100 ต่ำมาก
}

function ecStatus(v) {
  if (v > 1200)           return `สูงกว่ามาตรฐาน ⚠ (>1200)`;
  if (v > 500)            return `เฝ้าระวัง (501–1200)`;
  if (v > 200)            return `ผ่านมาตรฐาน (200–500)`;
  if (v >= 150)           return `ดี (150–200)`;
  return 'ดีมาก (<150)';
}

function ecColorContour(v, alpha=0.72) {
  // ฟ้า(<150) → ฟ้าอ่อน(150-200) → เขียว(200-500) → เหลือง(501-1200) → แดง(>1200)
  const a = alpha;
  function lerp(r1,g1,b1,r2,g2,b2,t) {
    t = Math.max(0, Math.min(1, t));
    return [Math.round(r1+(r2-r1)*t), Math.round(g1+(g2-g1)*t), Math.round(b1+(b2-b1)*t)];
  }
  let r,g,b;
  if (v < 150) {
    // ฟ้าสด
    [r,g,b] = [80, 180, 255];
  } else if (v < 200) {
    // ฟ้าสด → ฟ้าอ่อนสด
    const t = (v - 150) / 50;
    [r,g,b] = lerp(80,180,255, 120,210,255, t);
  } else if (v < 240) {
    // ฟ้าอ่อนสด → เหลืองเขียวสด
    const t = (v - 200) / 30;
    [r,g,b] = lerp(120,210,255, 160,230,0, t);
  } else if (v < 500) {
    // เหลืองเขียวสด → เหลืองเขียว
    const t = (v - 240) / 260;
    [r,g,b] = lerp(160,230,0, 180,220,0, t);
  } else if (v < 1200) {
    // เขียวสด → เหลืองสด
    const t = (v - 500) / 700;
    [r,g,b] = lerp(100,210,20, 255,210,0, t);
  } else {
    // เหลืองสด → แดงสด
    const t = Math.min(1, (v - 1200) / 300);
    [r,g,b] = lerp(255,200,0, 220,20,20, t);
  }
  return `rgba(${r},${g},${b},${a})`;
}

// unified color / status for current param
function paramColor(v, alpha=1) {
  return PARAM_MODE === 'ec' ? ecColorContour(v, alpha) : frcColor(v, alpha);
}

// ── Fast RGBA array return (no string alloc) — used in pixel-by-pixel render ──
function frcColorRGBA(v, a) {
  v = Math.max(0, Math.min(2.5, v));
  let r, g, b;
  if (v < 0.2) { const u=v/0.2; r=lerp(190,220,u); g=lerp(30,80,u); b=lerp(20,10,u); }
  else if (v < 0.3) { const u=(v-0.2)/0.1; r=lerp(220,240,u); g=lerp(80,170,u); b=lerp(10,20,u); }
  else if (v < 0.5) { const u=(v-0.3)/0.2; r=lerp(240,120,u); g=lerp(170,200,u); b=lerp(20,80,u); }
  else if (v < 0.8) { const u=(v-0.5)/0.3; r=lerp(120,50,u); g=lerp(200,190,u); b=lerp(80,170,u); }
  else if (v < 1.2) { const u=(v-0.8)/0.4; r=lerp(50,40,u); g=lerp(190,80,u); b=lerp(170,180,u); }
  else { const u=Math.min(1,(v-1.2)/0.3); r=lerp(40,100,u); g=lerp(80,40,u); b=lerp(180,150,u); }
  return [r, g, b, Math.round(a * 255)];
}
function ecColorContourRGBA(v, a) {
  function _lerp3(r1,g1,b1,r2,g2,b2,t) {
    t = Math.max(0, Math.min(1, t));
    return [Math.round(r1+(r2-r1)*t), Math.round(g1+(g2-g1)*t), Math.round(b1+(b2-b1)*t)];
  }
  let r,g,b;
  if (v < 150) { [r,g,b] = [80, 180, 255]; }
  else if (v < 200) { const t = (v-150)/50; [r,g,b] = _lerp3(80,180,255, 120,210,255, t); }
  else if (v < 240) { const t = (v-200)/30; [r,g,b] = _lerp3(120,210,255, 160,230,0, t); }
  else if (v < 500) { const t = (v-240)/260; [r,g,b] = _lerp3(160,230,0, 180,220,0, t); }
  else if (v < 1200) { const t = (v-500)/700; [r,g,b] = _lerp3(100,210,20, 255,210,0, t); }
  else { const t = Math.min(1, (v-1200)/300); [r,g,b] = _lerp3(255,200,0, 220,20,20, t); }
  return [r, g, b, Math.round(a * 255)];
}
function paramColorRGBA(v, alpha) {
  return PARAM_MODE === 'ec' ? ecColorContourRGBA(v, alpha) : frcColorRGBA(v, alpha);
}
function paramStatus(v) {
  return PARAM_MODE === 'ec' ? ecStatus(v) : statusText(v);
}
function paramUnit() {
  return PARAM_MODE === 'ec' ? EC_CONFIG.unit : 'mg/L';
}
function paramFormat(v) {
  return PARAM_MODE === 'ec' ? Math.round(v).toString() : v.toFixed(3);
}


function idwDirect(lat, lon, pw=2) {
  // Full IDW+decay — ใช้เฉพาะตอน build cache
  // decay apply ต่อ sensor ก่อน weighted average (ถูกต้อง)
  let ws=0, vs=0;
  for(const s of SENSORS) {
    const dDeg = Math.sqrt((s.lat-lat)**2 + (s.lon-lon)**2);
    if(dDeg < 1e-8) return getParamVal(s);
    const dKm = dDeg * DEG_TO_KM;
    const w = 1 / Math.pow(dDeg, pw);
    ws += w;
    const val = PARAM_MODE === 'ec' ? getParamVal(s) : getParamVal(s) * epanetDecay(dKm, s);
    vs += w * val;
  }
  return vs/ws;
}

// ── IDW Cache: pre-compute lat/lon grid → bilinear lookup ──────────────────
const CACHE_RES = 200; // grid ขนาด 120×120 ครอบพื้นที่ทั้งหมด
const CACHE_LAT0=13.45, CACHE_LAT1=14.05;
const CACHE_LON0=100.25, CACHE_LON1=101.00;
let _idwCache = null;

// ── Zone-based IDW สำหรับ EC mode ────────────────────────────────────────────
// ใช้เฉพาะ "source stations" (pump type) เป็น anchor
// pw สูง (8) → ใกล้เคียง Voronoi zone แต่ยังมี smooth boundary
// ข้อดี: monitor stations ปลายสายไม่ดึง contour ออกไปนอกโซน

// ── Virtual zone anchors ────────────────────────────────────────────────────
// Dis1 และ Dis2 อยู่ lat/lon เดียวกัน → nearest-neighbor แยกโซนไม่ได้
// ใช้ virtual anchor ที่กึ่งกลางพื้นที่จริงของแต่ละโซนแทน
const VIRTUAL_ANCHORS = [
  // Dis1 → นนทบุรี, ประชาชื่น, ทหารขนส่ง (เหนือ-ตะวันออก)
  { refName: 'สถานีสูบจ่ายน้ำบางเขน 1 (Dis1)', lat: 13.920, lon: 100.560 },
  // Dis2 → บางเขน, สายไหม, ลาดพร้าว (เหนือ-ตะวันออก)
  { refName: 'สถานีสูบจ่ายน้ำบางเขน 2 (Dis2)', lat: 13.910, lon: 100.655 },
  // MDIS → บางบัวทอง, ไทรน้อย, ราชวินิต, ตั้งพิรุฬห์, บดินทรเดชา (เหนือ-ตะวันตก)
  { refName: 'สถานีสูบจ่ายน้ำมหาสวัสดิ์', lat: 13.88, lon: 100.39 },
  { refName: 'สถานีสูบจ่ายน้ำมหาสวัสดิ์ (MDIS)', lat: 13.88, lon: 100.39 },
  // โรงงานธนบุรี → ฝั่งธนใต้ (anchor เลื่อนลงใต้ให้ราษฎร์บูรณะ/สำโรงชนะกลาง)
  { refName: 'โรงงานผลิตน้ำธนบุรี', lat: 13.76, lon: 100.471 },
  // สจ.สำโรง → ครอบ zone ราษฎร์บูรณะ/สุขสวัสดิ์/สมุทรปราการ
  { refName: 'สถานีสูบจ่ายน้ำสำโรง', lat: 13.662, lon: 100.54 },
];

// แทน lat/lon ของ sensor ด้วย virtual anchor ถ้ามี
function getAnchorLatLon(s) {
  const va = VIRTUAL_ANCHORS.find(v => s.name && s.name.trim() === v.refName);
  return va ? { lat: va.lat, lon: va.lon } : { lat: s.lat, lon: s.lon };
}

// ── Pre-computed exclude sets (avoid per-call allocation) ────────────────────
const _FRC_ZONE_EXCL_IDS = new Set(['SP01','SP02','SP03','SP11','1','2','3','11']);
const _FRC_ZONE_EXCL_NAMES = new Set([
  'สถานีสูบส่งน้ำบางเขน 1 (TR1)','สถานีสูบส่งน้ำบางเขน 2 (TR2)',
  'สถานีสูบส่งน้ำบางเขน 3 (TR3)','สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)',
  'สถานีสูบส่งน้ำมหาสวัสดิ์',
]);
const _SOURCE_TYPES = new Set(['pump', 'plant']);

// rev16.0: point-in-polygon helper (ใช้ใน frcZone/idwZone — ก่อน pointInPolygon ถูก define ที่บรรทัดถัดไป)
function _pip(lat, lon, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [lati, loni] = coords[i], [latj, lonj] = coords[j];
    if (((loni > lon) !== (lonj > lon)) && (lat < (latj - lati) * (lon - loni) / (lonj - loni) + lati))
      inside = !inside;
  }
  return inside;
}

function idwZone(lat, lon) {
  // rev16.0: VC zone — ใช้ค่า EC จาก root source (น้ำดิบต้นทาง) ไม่มี decay
  if (typeof VC_STATIONS !== 'undefined') {
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES || {})) {
      if (!sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
      if (!_pip(lat, lon, zone.coords)) continue;
      const vc = VC_STATIONS.find(v => v.id === sid);
      if (!vc || !(vc.valvePct != null && vc.valvePct > 0)) continue;
      // หา EC จาก source → ถ้า source มี ec ใช้เลย
      const src = SENSORS.find(x => String(x.id) === vc.sourceId);
      if (src) {
        const ecVal = getParamVal(src);
        if (ecVal && ecVal !== 300) return ecVal; // มี EC จริง
      }
      // fallback: ดึง EC จากโรงผลิตต้นทาง (SP01/SP02/SP03 → บางเขน, SP11 → มหาสวัสดิ์)
      const vcSourceMap = {
        'SP01':'สถานีสูบส่งน้ำบางเขน 1', 'SP02':'สถานีสูบส่งน้ำบางเขน 2',
        'SP03':'สถานีสูบส่งน้ำบางเขน 3', 'SP11':'สถานีสูบส่งน้ำมหาสวัสดิ์'
      };
      const pumpName = vcSourceMap[vc.sourceId];
      if (pumpName) {
        const pump = SENSORS.find(s => s.name && s.name.trim() === pumpName);
        if (pump && pump.ec > 0) return pump.ec;
        // fallback: ใช้โรงผลิตตรง
        const plantMap = {'SP01':13,'SP02':13,'SP03':13,'SP11':14}; // 13=บางเขน, 14=มหาสวัสดิ์
        const plantId = plantMap[vc.sourceId];
        if (plantId) {
          const plant = SENSORS.find(s => s.id === plantId);
          if (plant && plant.ec > 0) return plant.ec;
        }
      }
      return 300; // ultimate fallback
    }
  }

  // EC fallback: nearest pump/plant zone
  const sources = SENSORS.filter(s =>
    _SOURCE_TYPES.has(s.type) &&
    !_FRC_ZONE_EXCL_NAMES.has(s.name?.trim()) &&
    !_FRC_ZONE_EXCL_IDS.has(String(s.id))
  );
  if (sources.length === 0) return idwDirect(lat, lon, 4);

  let nearest = null, minD = Infinity;
  for (const s of sources) {
    const anch = getAnchorLatLon(s);
    const d = (anch.lat - lat) ** 2 + (anch.lon - lon) ** 2;
    if (d < minD) { minD = d; nearest = s; }
  }
  return getParamVal(nearest);
}

// ── Zone-based FRC: nearest source station + EPANET decay ────────────────────
// หาสถานีสูบจ่าย/สูบส่งที่ใกล้ที่สุด แล้ว decay FRC จากโซนนั้น
// ไม่ถูก pull โดยสถานีโซนอื่น

// ── MDIS Zone Override (static, hoisted) ──────────────────────────────────
const _MDIS_ZONE = [
  [14.10, 100.20], [14.10, 100.52],
  [13.88, 100.52], [13.80, 100.50],
  [13.78, 100.49], [13.74, 100.47],
  [13.70, 100.47], [13.65, 100.46],
  [13.65, 100.20],
];
function _inMdisZone(la, lo) {
  let inside = false;
  for (let i=0, j=_MDIS_ZONE.length-1; i<_MDIS_ZONE.length; j=i++) {
    const [lati,loni]=_MDIS_ZONE[i], [latj,lonj]=_MDIS_ZONE[j];
    if (((loni>lo)!==(lonj>lo)) && (la < (latj-lati)*(lo-loni)/(lonj-loni)+lati))
      inside = !inside;
  }
  return inside;
}

// rev16.0: pre-cache sources list (ไม่ filter ใหม่ทุก call)
let _frcZoneSources = null;
let _frcZoneSourcesKey = '';

function _ensureFrcSources() {
  const key = SENSORS.length + '_' + SENSORS.map(s=>s.id).join();
  if (_frcZoneSourcesKey === key && _frcZoneSources) return _frcZoneSources;
  _frcZoneSourcesKey = key;
  _frcZoneSources = SENSORS.filter(s =>
    _SOURCE_TYPES.has(s.type) &&
    !_FRC_ZONE_EXCL_IDS.has(String(s.id)) &&
    !_FRC_ZONE_EXCL_NAMES.has(s.name?.trim())
  );
  return _frcZoneSources;
}

// ══════════════════════════════════════════════════════════════════════════
// V33 — Validate K (Field Calibration)
// Calibrate ค่า K แต่ละโซนจากค่าจริงภาคสนาม
// สูตร: K_new = K_now − ln(FRC_จริง / FRC_contour) / tt
// ══════════════════════════════════════════════════════════════════════════

// resolve source station + travel time (ชม.) สำหรับจุด (lat,lon)
function _v33ResolvePoint(lat, lon) {
  // ใช้ logic เดียวกับ frcZone หา nearest source
  const sources = _ensureFrcSources();
  if (!sources.length) return null;
  let nearest = null;

  // 1. CUSTOM_ZONES polygon
  if (window.CUSTOM_ZONES) {
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
      if (sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
      if (!_pip(lat, lon, zone.coords)) continue;
      const src = sources.find(s => String(s.id) === sid);
      if (src) { nearest = src; break; }
    }
  }
  // 2. MDIS zone
  if (!nearest && typeof _inMdisZone === 'function' && _inMdisZone(lat, lon)) {
    nearest = sources.find(s => s.name?.trim() === 'สถานีสูบจ่ายน้ำมหาสวัสดิ์' || s.id === 'SP12' || s.id === 12);
  }
  // 3. nearest zone centroid
  if (!nearest && window.CUSTOM_ZONES) {
    let minDist = Infinity;
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
      if (sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
      const cx = zone.coords.reduce((a,c)=>a+c[0],0)/zone.coords.length;
      const cy = zone.coords.reduce((a,c)=>a+c[1],0)/zone.coords.length;
      const d = (cx-lat)**2+(cy-lon)**2;
      if (d < minDist) {
        const src = sources.find(s => String(s.id) === sid);
        if (src) { minDist = d; nearest = src; }
      }
    }
  }
  // 4. nearest source
  if (!nearest) {
    let minDist = Infinity;
    for (const s of sources) {
      const anch = (typeof getAnchorLatLon === 'function') ? getAnchorLatLon(s) : {lat:s.lat, lon:s.lon};
      const d = (anch.lat - lat)**2 + (anch.lon - lon)**2;
      if (d < minDist) { minDist = d; nearest = s; }
    }
  }
  if (!nearest) return null;

  // travel time (ชม.) = ระยะทาง / ความเร็ว
  const dKm = Math.sqrt((nearest.lat - lat)**2 + (nearest.lon - lon)**2) * DEG_TO_KM * EUCLID_PIPE_FACTOR;
  const L_m = dKm * 1000;
  const tt_sec = L_m / EPANET.v;
  const tt_hr = tt_sec / 3600;

  // K ปัจจุบันของสถานีนี้ (1/hr)
  const sid = String(nearest.id);
  let kNow = K_total; // fallback
  if (typeof CONTOUR_K_OVERRIDE !== 'undefined' && CONTOUR_K_OVERRIDE[sid] != null) kNow = CONTOUR_K_OVERRIDE[sid];
  else if (typeof STATION_K_OVERRIDE !== 'undefined' && STATION_K_OVERRIDE[sid] != null) kNow = STATION_K_OVERRIDE[sid];

  return { source: nearest, sid, dKm, tt_hr, kNow,
    sourceName: (nearest.name || sid).replace('สถานีสูบจ่ายน้ำ','สจ.').replace('โรงงานผลิตน้ำ','รง.') };
}

// เปิด modal
function openValidateK() {
  let modal = document.getElementById('v33-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'v33-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
        <div style="position:sticky;top:0;background:linear-gradient(135deg,#7b2d8e,#4a1259);color:#fff;padding:14px 18px;border-radius:14px 14px 0 0;display:flex;justify-content:space-between;align-items:center;">
          <div><div style="font-size:16px;font-weight:700;">📋 Validate K — Field Calibration (V33)</div>
          <div style="font-size:10px;opacity:0.85;margin-top:2px;">Calibrate K แต่ละโซนจากค่าจริงภาคสนาม</div></div>
          <button onclick="document.getElementById('v33-modal').style.display='none'" style="background:rgba(255,255,255,0.2);border:none;color:#fff;font-size:18px;width:30px;height:30px;border-radius:8px;cursor:pointer;">×</button>
        </div>
        <div style="padding:18px;">
          <div style="font-size:12px;color:#555;line-height:1.6;margin-bottom:10px;">
            <b>วิธีใช้:</b> Copy แถวข้อมูลจากตาราง Google Sheets (ทั้งแถว) → paste ลงช่องด้านล่าง<br>
            ระบบจะดึง <b>พิกัด (column Z)</b>, <b>คลอรีนจริง (column I)</b>, <b>contour (column AA)</b> อัตโนมัติ<br>
            <span style="color:#7b2d8e;font-weight:600;">สูตร: K_new = K_now − ln(จริง / contour) / travel_time</span>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:8px;">
            <button onclick="fetchValidateFromSheets()" id="v33-fetch-btn" style="flex:1;background:linear-gradient(135deg,#1a73e8,#0d47a1);color:#fff;border:none;padding:10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">📊 ดึงจาก Google Sheets</button>
            <input id="v33-sheets-id" value="17BLEtEo9HSpTH7sNiWYvkxZhiREkqQTkfHYGpA2NpvY" placeholder="Google Sheets ID" style="flex:1;font-size:9px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;font-family:'JetBrains Mono',monospace;">
          </div>
          <div style="font-size:9px;color:#888;margin-bottom:6px;">หรือ paste ข้อมูลเองด้านล่าง:</div>
          <textarea id="v33-input" placeholder="paste ข้อมูลจากตารางที่นี่ (รวม header หรือไม่ก็ได้)..." style="width:100%;height:120px;font-family:'JetBrains Mono',monospace;font-size:10px;border:1.5px solid #d0b0f0;border-radius:8px;padding:10px;box-sizing:border-box;resize:vertical;"></textarea>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button onclick="runValidateK()" style="flex:1;background:linear-gradient(135deg,#7b2d8e,#4a1259);color:#fff;border:none;padding:10px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🔬 คำนวณ Calibrate</button>
            <button onclick="document.getElementById('v33-result').innerHTML='';document.getElementById('v33-input').value='';" style="background:#eee;border:none;padding:10px 16px;border-radius:8px;font-size:12px;cursor:pointer;">ล้าง</button>
          </div>
          <div id="v33-result" style="margin-top:14px;"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
}

// ดึงข้อมูลจาก Google Sheets (public, anyone with link)
async function fetchValidateFromSheets() {
  const btn = document.getElementById('v33-fetch-btn');
  const input = document.getElementById('v33-input');
  const sheetId = document.getElementById('v33-sheets-id').value.trim();
  if (!sheetId) { alert('กรุณาใส่ Google Sheets ID'); return; }

  btn.textContent = '⏳ กำลังดึง...';
  btn.disabled = true;

  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=tsv&gid=0`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tsv = await res.text();
    const lines = tsv.split('\n');

    // กรองเฉพาะแถวที่มีพิกัดและค่าคลอรีน
    let validLines = [];
    let headerLine = '';
    for (const line of lines) {
      // เช็คว่ามีพิกัด (13.xx, 100.xx)
      if (/1[0-9]\.\d{4,}\s*,\s*\d{2,3}\.\d{4,}/.test(line)) {
        validLines.push(line);
      } else if (/พิกัด|คลอรีน|สถานที่|contour/i.test(line)) {
        headerLine = line; // header row
      }
    }

    if (validLines.length === 0) {
      input.value = '❌ ไม่พบข้อมูลที่มีพิกัด — ตรวจสอบว่า Sheets เป็น public (Anyone with link)';
    } else {
      input.value = (headerLine ? headerLine + '\n' : '') + validLines.join('\n');
      input.scrollTop = 0;
      btn.textContent = `✅ ดึงได้ ${validLines.length} แถว — กด "🔬 คำนวณ Calibrate"`;
    }
  } catch(e) {
    input.value = `❌ ดึงไม่ได้: ${e.message}\nตรวจสอบว่า Sheets เป็น public (Anyone with link) และ ID ถูกต้อง`;
    btn.textContent = '📊 ดึงจาก Google Sheets';
  }
  btn.disabled = false;
  setTimeout(() => { btn.textContent = '📊 ดึงจาก Google Sheets'; }, 5000);
}

// parse + calibrate
function runValidateK() {
  const raw = document.getElementById('v33-input').value.trim();
  const resultEl = document.getElementById('v33-result');
  if (!raw) { resultEl.innerHTML = '<div style="color:#c00;font-size:12px;">⚠ กรุณา paste ข้อมูลก่อน</div>'; return; }

  const lines = raw.split('\n').filter(l => l.trim());
  const points = [];
  let skipped = 0;

  // auto-detect column positions from header or first data row
  let colCoord = -1, colFrc = -1, colContour = -1, colSource = -1;
  for (const line of lines) {
    const cols = line.split('\t');
    for (let i = 0; i < cols.length; i++) {
      const c = (cols[i]||'').trim().toLowerCase();
      if (c.includes('พิกัด') || c.includes('coord')) colCoord = i;
      if (c === 'คลอรีน' || c === 'frc' || c.includes('คลอรีน')) { if (colFrc < 0) colFrc = i; }
      if (c.includes('contour') || c.includes('จาก contour') || c.includes('จา่ก contour')) colContour = i;
      if (c.includes('รับน้ำ') || c.includes('source')) colSource = i;
    }
    if (colCoord >= 0) break; // found header
  }

  for (const line of lines) {
    const cols = line.split('\t');
    let lat=null, lon=null, frcReal=null, frcContour=null, sourceName='';

    // 1. หาพิกัด — ลอง colCoord ก่อน แล้ว scan ทุก column
    const tryCoord = (s) => {
      const m = (s||'').match(/(1[0-9]\.\d{3,})\s*,\s*(\d{2,3}\.\d{3,})/);
      if (m) { lat = parseFloat(m[1]); lon = parseFloat(m[2]); return true; }
      return false;
    };
    if (colCoord >= 0) tryCoord(cols[colCoord]);
    if (lat == null) { for (const c of cols) { if (tryCoord(c)) break; } }
    if (lat == null) { skipped++; continue; }

    // 2. หาค่าคลอรีนจริง — ลอง colFrc ก่อน แล้ว scan หาตัวเลข 0-2 mg/L ก่อนพิกัด
    if (colFrc >= 0) frcReal = parseFloat(cols[colFrc]);
    if (isNaN(frcReal) || frcReal == null) {
      // scan: หาตัวเลข 0.01-3.0 ในคอลัมน์ก่อนพิกัด
      const coordIdx = cols.findIndex(c => /1[0-9]\.\d{3,}\s*,\s*\d{2,3}\.\d{3,}/.test(c||''));
      for (let i = coordIdx - 1; i >= 0; i--) {
        const v = parseFloat(cols[i]);
        if (!isNaN(v) && v >= 0.01 && v <= 3.0) { frcReal = v; break; }
      }
    }

    // 3. หาค่า contour — ลอง colContour ก่อน แล้วคอลัมน์หลังพิกัด
    if (colContour >= 0) frcContour = parseFloat(cols[colContour]);
    if (isNaN(frcContour) || frcContour == null) {
      // scan: หาตัวเลข 0.01-3.0 ในคอลัมน์หลังพิกัด
      const coordIdx = cols.findIndex(c => /1[0-9]\.\d{3,}\s*,\s*\d{2,3}\.\d{3,}/.test(c||''));
      for (let i = coordIdx + 1; i < cols.length; i++) {
        const v = parseFloat(cols[i]);
        if (!isNaN(v) && v >= 0.01 && v <= 3.0) { frcContour = v; break; }
      }
    }

    // 4. หา source name
    if (colSource >= 0) sourceName = (cols[colSource]||'').trim();

    if (isNaN(frcReal) || isNaN(frcContour)) { skipped++; continue; }
    if (frcReal <= 0 || frcContour <= 0) { skipped++; continue; }

    // resolve โซน
    const r = _v33ResolvePoint(lat, lon);
    if (!r) { skipped++; continue; }

    // K_new = K_now − ln(จริง/contour) / tt
    const kNew = (r.tt_hr > 0.05) ? (r.kNow - Math.log(frcReal / frcContour) / r.tt_hr) : r.kNow;

    points.push({ lat, lon, frcReal, frcContour, ...r, kNew: Math.max(0, kNew) });
  }

  if (!points.length) {
    resultEl.innerHTML = `<div style="color:#c00;font-size:12px;">⚠ ไม่พบข้อมูลที่ใช้ได้ (ข้าม ${skipped} แถว)<br>ตรวจสอบว่ามีพิกัด, คลอรีนจริง (I), และ contour (AA)</div>`;
    return;
  }

  // จัดกลุ่มตามโซน
  const zones = {};
  for (const p of points) {
    if (!zones[p.sid]) zones[p.sid] = { name: p.sourceName, sid: p.sid, kNow: p.kNow, pts: [] };
    zones[p.sid].pts.push(p);
  }

  // calibrate แต่ละโซน (≥3 จุด)
  window._v33Calibrated = {};
  let html = `<div style="font-size:12px;color:#333;margin-bottom:8px;">✅ ใช้ได้ <b>${points.length}</b> จุด | ข้าม ${skipped} | <b>${Object.keys(zones).length}</b> โซน</div>`;

  const calibratable = [];
  for (const z of Object.values(zones)) {
    const n = z.pts.length;
    const kNews = z.pts.map(p => p.kNew);
    const kAvg = kNews.reduce((a,b)=>a+b,0) / n;
    const errsBefore = z.pts.map(p => Math.abs(p.frcReal - p.frcContour));
    const maeBefore = errsBefore.reduce((a,b)=>a+b,0) / n;
    // คำนวณ error หลัง calibrate
    const errsAfter = z.pts.map(p => {
      const frcPredicted = p.source.frc * Math.exp(-(kAvg/3600) * (p.tt_hr*3600));
      // ใช้ frcContour เป็น proxy: ค่าใหม่ = contour × e^(-(kAvg-kNow)*tt)
      const frcNew = p.frcContour * Math.exp(-((kAvg - p.kNow)/3600) * (p.tt_hr*3600));
      return Math.abs(p.frcReal - frcNew);
    });
    const maeAfter = errsAfter.reduce((a,b)=>a+b,0) / n;
    const canCal = n >= 3;
    if (canCal) { window._v33Calibrated[z.sid] = kAvg; calibratable.push(z.sid); }

    const color = canCal ? '#7b2d8e' : '#999';
    const bg = canCal ? '#faf5ff' : '#f5f5f5';
    html += `<div style="border:1.5px solid ${canCal?'#d0b0f0':'#ddd'};border-radius:10px;padding:10px 12px;margin-bottom:8px;background:${bg};">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:13px;font-weight:700;color:${color};">${z.name} <span style="font-size:10px;font-weight:400;color:#888;">(${z.sid})</span></div>
        <div style="font-size:10px;color:${canCal?'#7b2d8e':'#c00'};font-weight:600;">${canCal ? '✅ Calibrate ได้' : `⚠ ข้อมูลน้อย (${n} จุด)`}</div>
      </div>
      <div style="font-size:11px;color:#555;margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px;font-family:'JetBrains Mono',monospace;">
        <span>จุดข้อมูล: <b>${n}</b></span>
        <span>K ปัจจุบัน: <b>${z.kNow.toFixed(4)}</b>/hr</span>
        <span>K calibrate: <b style="color:${color};">${kAvg.toFixed(4)}</b>/hr</span>
        <span>ΔK: <b>${(kAvg-z.kNow>=0?'+':'')}${(kAvg-z.kNow).toFixed(4)}</b></span>
        <span>MAE ก่อน: <b>${maeBefore.toFixed(3)}</b></span>
        <span>MAE หลัง: <b style="color:${maeAfter<maeBefore?'#2a8':'#c00'};">${maeAfter.toFixed(3)}</b></span>
      </div>`;
    // รายละเอียดจุด
    html += `<details style="margin-top:6px;"><summary style="font-size:10px;color:#888;cursor:pointer;">ดูรายจุด (${n})</summary>
      <table style="width:100%;font-size:9px;margin-top:4px;border-collapse:collapse;">
        <tr style="color:#999;border-bottom:1px solid #eee;"><th style="text-align:left;padding:2px;">จริง</th><th style="text-align:left;">contour</th><th style="text-align:left;">tt(ชม)</th><th style="text-align:left;">K_new</th></tr>`;
    for (const p of z.pts) {
      html += `<tr><td style="padding:2px;">${p.frcReal.toFixed(2)}</td><td>${p.frcContour.toFixed(2)}</td><td>${p.tt_hr.toFixed(1)}</td><td>${p.kNew.toFixed(4)}</td></tr>`;
    }
    html += `</table></details></div>`;
  }

  if (calibratable.length > 0) {
    html += `<button onclick="applyValidateK()" style="width:100%;background:linear-gradient(135deg,#2a8a4a,#176030);color:#fff;border:none;padding:11px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-top:6px;">
      ✅ Apply K calibrate (${calibratable.length} โซน) → บันทึกลงระบบ</button>`;
  } else {
    html += `<div style="text-align:center;color:#c00;font-size:12px;padding:8px;">ไม่มีโซนที่มีข้อมูลพอ (ต้อง ≥3 จุด/โซน)</div>`;
  }

  resultEl.innerHTML = html;
}

// apply calibrated K → STATION_K + CONTOUR_K_OVERRIDE
function applyValidateK() {
  if (!window._v33Calibrated || !Object.keys(window._v33Calibrated).length) return;
  let applied = 0;
  for (const [sid, k] of Object.entries(window._v33Calibrated)) {
    STATION_K[sid] = k;
    if (typeof CONTOUR_K_OVERRIDE !== 'undefined') CONTOUR_K_OVERRIDE[sid] = k;
    // mark source = field validate
    if (typeof STATION_K_SOURCE !== 'undefined') STATION_K_SOURCE[sid] = 'field-validate';
    applied++;
  }
  // persist
  try {
    const stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    Object.assign(stored, window._v33Calibrated);
    localStorage.setItem(LS_KEY, JSON.stringify(stored));
  } catch(e){}
  // save to Firebase ถ้ามี
  try { if (typeof saveStationKToFirebase === 'function') saveStationKToFirebase(); } catch(e){}
  // rebuild contour
  try { if (typeof buildIdwCache === 'function') { buildIdwCache(); redrawContour && redrawContour(0); } } catch(e){}
  try { if (typeof renderKTuner === 'function') renderKTuner(); } catch(e){}

  document.getElementById('v33-result').insertAdjacentHTML('afterbegin',
    `<div style="background:#e8f5e9;border:1.5px solid #2a8a4a;border-radius:8px;padding:10px;margin-bottom:10px;color:#176030;font-size:12px;font-weight:600;">
      ✅ บันทึก K calibrate สำเร็จ ${applied} โซน → contour อัปเดตแล้ว</div>`);
}

function frcZone(lat, lon) {
  // rev16.1: Zone Influence — ใช้ CUSTOM_ZONES polygon เป็นตัวกำหนดโซน
  // Priority: 1) VC zone  2) CUSTOM_ZONES polygon  3) MDIS hardcoded  4) nearest fallback

  // ── 1. VC zone (Valve Chamber) — highest priority ──
  if (typeof VC_STATIONS !== 'undefined' && window.CUSTOM_ZONES) {
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
      if (!sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
      if (!_pip(lat, lon, zone.coords)) continue;
      const vc = VC_STATIONS.find(v => v.id === sid);
      if (!vc || !(vc.valvePct != null && vc.valvePct > 0)) continue;
      const vcFrc = vc.frc || 0;
      // rev20: ถ้า VC active (valvePct>0) แต่ FRC=0 → return 0 (พื้นที่ไม่มีคลอรีน)
      if (vcFrc <= 0) return 0;
      const dKm = Math.sqrt((vc.lat-lat)**2+(vc.lon-lon)**2)*DEG_TO_KM;
      const pair = VC_PAIR ? VC_PAIR[sid] : null;
      const kLocal = pair ? pair.K : 0.05;
      return Math.max(0, vcFrc * Math.exp(-kLocal * (dKm / 1.5)));
    }
  }

  const sources = _ensureFrcSources();
  if (sources.length === 0) return idwDirect(lat, lon, 2);

  let nearest = null;

  // ── 2. CUSTOM_ZONES polygon — สถานีสูบจ่าย (ข้าม VC) ──
  if (window.CUSTOM_ZONES) {
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
      if (sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
      if (!_pip(lat, lon, zone.coords)) continue;
      // หา source station ที่ตรงกับ sid ของโซน
      const src = sources.find(s => String(s.id) === sid);
      if (src && src.frc > 0) { nearest = src; break; }
    }
  }

  // ── 3. MDIS zone hardcoded (fallback เฉพาะพื้นที่มหาสวัสดิ์) ──
  if (!nearest && _inMdisZone(lat, lon)) {
    nearest = sources.find(s => s.name?.trim() === 'สถานีสูบจ่ายน้ำมหาสวัสดิ์' ||
                                s.id === 'SP12' || s.id === 12);
  }

  // ── 4. Nearest zone polygon fallback (rev24) ──
  if (!nearest && window.CUSTOM_ZONES) {
    let minDist = Infinity;
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
      if (sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
      const cx = zone.coords.reduce((a,c)=>a+c[0],0)/zone.coords.length;
      const cy = zone.coords.reduce((a,c)=>a+c[1],0)/zone.coords.length;
      const d = (cx-lat)**2+(cy-lon)**2;
      if (d < minDist) {
        const src = sources.find(s => String(s.id) === sid);
        if (src && src.frc > 0) { minDist = d; nearest = src; }
      }
    }
  }
  if (!nearest) {
    let minDist = Infinity;
    for (const s of sources) {
      const anch = getAnchorLatLon(s);
      const d = (anch.lat - lat) ** 2 + (anch.lon - lon) ** 2;
      if (d < minDist) { minDist = d; nearest = s; }
    }
  }

  const dKm = Math.sqrt(((nearest.lat - lat)**2 + (nearest.lon - lon)**2)) * DEG_TO_KM * EUCLID_PIPE_FACTOR;
  return nearest.frc * epanetDecay(dKm, nearest, lat, lon);
}


// ══════ Pipe-Network-Aware Contour Enhancement ══════
// Grid: pre-computed decay_factor and nearest source sensor index for each contour cell
// Built from KMZ pipe network (21,909 segments) + pipe-property-aware Dijkstra
// Per-segment properties: diameter (400-2300mm), material (10 types), velocity, wall decay
// kw by material: PVC/HDPE=0.02, ST=0.08, DI=0.10, SCP=0.12, PC=0.15, RCP=0.18, AC=0.20, CI=0.25, GI=0.30
// Velocity by diameter: 2300-1800mm=1.8m/s, 1500mm=1.5, 1200mm=1.2, 1000mm=1.0, 800mm=0.8, 600mm=0.6, 400mm=0.4
// (moved to data/)
const _PIPE_SENSOR_IDS = ["SP04", "SP05", "SP06", "SP07", "SP08", "SP09", "SP10", "SP12", "SW01", "SW02", "SW03", "SW04", "SW05", "SW06", "SW07", "SW08", "SW09", "SW10", "SW11"];
let _pipeGrid = null; // Float32: [decay_factor, sensor_idx, ...] — decay_factor = exp(-Σ(K×t)) per-segment pipe-property-aware

(async function loadPipeGrid() {
  try {
    const bin = atob(_PIPE_GRID_B64);
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const wr = ds.writable.getWriter(); wr.write(bytes); wr.close();
    const rd = ds.readable.getReader();
    const ch = []; while(true){const{done,value}=await rd.read();if(done)break;ch.push(value);}
    const tot = ch.reduce((a,c)=>a+c.length,0);
    const res = new Uint8Array(tot); let off=0;
    for(const c of ch){res.set(c,off);off+=c.length;}
    const arr = JSON.parse(new TextDecoder().decode(res));
    _pipeGrid = new Float32Array(arr);
    console.log('✅ Enhanced pipe distance grid loaded:', _pipeGrid.length/2, 'cells (KMZ network + Dijkstra)');
  } catch(e) { console.warn('Pipe grid load failed:', e); }
})();

// ══════ RTU Pressure Factor Grid ══════
// Factor = sqrt(P_nominal / P_local): <1 = high pressure (less decay), >1 = low pressure (more decay)
// (moved to data/)
let _pressureGrid = null; // Float32: one factor per grid cell

(async function loadPressureGrid() {
  try {
    const bin = atob(_PRESSURE_FACTOR_B64);
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const wr = ds.writable.getWriter(); wr.write(bytes); wr.close();
    const rd = ds.readable.getReader();
    const ch = []; while(true){const{done,value}=await rd.read();if(done)break;ch.push(value);}
    const tot = ch.reduce((a,c)=>a+c.length,0);
    const res = new Uint8Array(tot); let off=0;
    for(const c of ch){res.set(c,off);off+=c.length;}
    const arr = JSON.parse(new TextDecoder().decode(res));
    _pressureGrid = new Float32Array(arr);
    console.log('Pressure factor grid loaded:', _pressureGrid.length, 'cells');
  } catch(e) { console.warn('Pressure grid load failed:', e); }
})();

function _getPressureFactor(j, i) {
  if (!_pressureGrid) return 1.0;
  const rows = CACHE_RES + 1;
  const idx = j * rows + i;
  if (idx < 0 || idx >= _pressureGrid.length) return 1.0;
  return _pressureGrid[idx];
}

// Get pipe-network distance and source sensor for a grid cell
function _getPipeDist(j, i) {
  if (!_pipeGrid) return null;
  const rows = CACHE_RES + 1;
  const idx = (j * rows + i) * 2;
  if (idx < 0 || idx+1 >= _pipeGrid.length) return null;
  const val = _pipeGrid[idx];
  const sidx = _pipeGrid[idx + 1];
  if (val < 0 || sidx >= _PIPE_SENSOR_IDS.length) return null;
  // v6: val = equivalent pipe distance (km) from Dijkstra on real pipe network
  // Accounts for per-segment: diameter → velocity → travel time → equiv distance
  // Use with epanetDecay(dist_km, sensor) to apply sensor-specific K values
  return { dist_km: val, sensorId: _PIPE_SENSOR_IDS[sidx] };
}

// Pipe-aware FRC: use pipe distance for decay instead of geographic distance
function _pipeAwareFrc(lat, lon, j, i) {
  const pd = _getPipeDist(j, i);
  if (!pd) return null; // no pipe data → fallback to original

  // Find the source sensor in SENSORS
  const sensor = SENSORS.find(s => String(s.id) === pd.sensorId);
  if (!sensor || !sensor.frc) return null;

  // v6: dist_km = equivalent pipe distance from Dijkstra on real pipe network
  // Use epanetDecay() so sensor-specific K (CONTOUR_K_OVERRIDE / STATION_K_OVERRIDE)
  // is applied consistently — same formula as Zone path
  // v33-fix: pass _pressureGrid factor as distMult — applied ONLY if RTU live is
  //          unavailable (single pressure layer, no double-counting).
  const pGrid = _getPressureFactor ? _getPressureFactor(j, i) : 1;
  return sensor.frc * epanetDecay(pd.dist_km, sensor, lat, lon, pGrid);
}

function buildIdwCache() {
  const rows = CACHE_RES + 1;
  _idwCache = new Float32Array(rows * rows);
  const dlat = (CACHE_LAT1 - CACHE_LAT0) / CACHE_RES;
  const dlon = (CACHE_LON1 - CACHE_LON0) / CACHE_RES;

  // rev16.0: invalidate caches + pre-compute VC FRC
  _zoneCacheKey = ''; _frcZoneSourcesKey = '';
  if (typeof updateVcFrc === 'function') updateVcFrc();
  const _frc = window.frcZone || frcZone;
  const _idw = window.idwZone || idwZone;

  for(let j=0; j<rows; j++) {
    const lat = CACHE_LAT0 + j * dlat;
    for(let i=0; i<rows; i++) {
      const lon = CACHE_LON0 + i * dlon;
      if (PARAM_MODE === 'ec') {
        // rev24: EC zone-aware
        let _ecZV = null;
        if (window.CUSTOM_ZONES) {
          for (const [_es, _ez] of Object.entries(window.CUSTOM_ZONES)) {
            if (_es.startsWith('VC') || !_ez.coords || _ez.coords.length < 3) continue;
            if (!_pip(lat, lon, _ez.coords)) continue;
            const _esr = SENSORS.find(s => String(s.id) === _es);
            if (_esr) { _ecZV = getParamVal(_esr); break; }
          }
        }
        if (_ecZV !== null) { _idwCache[j * rows + i] = _ecZV; }
        else {
          let _ecN = null, _ecD = Infinity;
          if (window.CUSTOM_ZONES) {
            for (const [_es2, _ez2] of Object.entries(window.CUSTOM_ZONES)) {
              if (_es2.startsWith('VC') || !_ez2.coords || _ez2.coords.length < 3) continue;
              const _cx = _ez2.coords.reduce((a,c)=>a+c[0],0)/_ez2.coords.length;
              const _cy = _ez2.coords.reduce((a,c)=>a+c[1],0)/_ez2.coords.length;
              const _d = (_cx-lat)**2+(_cy-lon)**2;
              if (_d < _ecD) { const _s2 = SENSORS.find(s => String(s.id) === _es2); if (_s2) { _ecD = _d; _ecN = _s2; } }
            }
          }
          _idwCache[j * rows + i] = _ecN ? getParamVal(_ecN) : _idw(lat, lon);
        }
      } else {
        // Pipe-network contour: ใช้ค่าจริงตามเส้นท่อ + zone influence
        // 1. VC zone override (highest priority)
        let vcVal = null;
        if (typeof VC_STATIONS !== 'undefined' && window.CUSTOM_ZONES) {
          for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
            if (!sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
            if (!_pip(lat, lon, zone.coords)) continue;
            const vc = VC_STATIONS.find(v => v.id === sid);
            if (!vc || !(vc.valvePct != null && vc.valvePct > 0)) continue;
            const vcFrc = vc.frc || 0;
            // rev20: VC active แต่ FRC=0 → ใช้ 0 (พื้นที่ไม่มีคลอรีน)
            if (vcFrc <= 0) { vcVal = 0; break; }
            const dKm = Math.sqrt((vc.lat-lat)**2+(vc.lon-lon)**2)*DEG_TO_KM;
            const pair = typeof VC_PAIR !== 'undefined' ? VC_PAIR[sid] : null;
            const kLocal = pair ? pair.K : 0.05;
            vcVal = Math.max(0, vcFrc * Math.exp(-kLocal * (dKm / 1.5)));
            break;
          }
        }
        if (vcVal !== null) {
          _idwCache[j * rows + i] = vcVal;
          continue;
        }

        // 2. CUSTOM_ZONES polygon — สถานีสูบจ่าย (highest priority after VC)
        //    rev16.1: Zone Influence polygon กำหนดว่าจุดนี้อยู่ในโซนสถานีสูบจ่ายไหน
        //    ป้องกัน pipe grid assign sensor ข้ามโซน
        let zoneVal = null;
        if (window.CUSTOM_ZONES) {
          const sources = _ensureFrcSources();
          for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
            if (sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
            if (!_pip(lat, lon, zone.coords)) continue;
            const src = sources.find(s => String(s.id) === sid);
            if (src && src.frc > 0) {
              const dKm = Math.sqrt((src.lat-lat)**2+(src.lon-lon)**2)*DEG_TO_KM;
              // ถ้ามี pipe data ในโซนนี้ ใช้ pipe distance แทน Euclidean (แม่นกว่า)
              const pd = _getPipeDist ? _getPipeDist(j, i) : null;
              if (pd && String(pd.sensorId) === String(sid)) {
                // v6: pipe grid ชี้ไปที่ sensor เดียวกับ zone → ใช้ pipe distance
                // epanetDecay() ใช้ K จาก CONTOUR_K_OVERRIDE / STATION_K_OVERRIDE
                // v33-fix: pass _pressureGrid factor as distMult (fallback when no RTU live)
                const pGrid = _getPressureFactor ? _getPressureFactor(j, i) : 1;
                zoneVal = src.frc * epanetDecay(pd.dist_km, src, lat, lon, pGrid);
              } else {
                // ไม่มี pipe data หรือ pipe ชี้ไปสถานีอื่น → ใช้ Euclidean × EUCLID_PIPE_FACTOR
                zoneVal = src.frc * epanetDecay(dKm * EUCLID_PIPE_FACTOR, src, lat, lon);
              }
              break;
            }
          }
        }
        if (zoneVal !== null) {
          _idwCache[j * rows + i] = zoneVal;
          continue;
        }

        // 3. Pipe-network FRC (เฉพาะพื้นที่ไม่มี CUSTOM_ZONES polygon ครอบ)
        const pipeFrc = _pipeAwareFrc(lat, lon, j, i);
        if (pipeFrc !== null) {
          _idwCache[j * rows + i] = pipeFrc;
        } else {
          // 4. Fallback: zone-based FRC (geographic, for areas without pipe coverage)
          _idwCache[j * rows + i] = _frc(lat, lon);
        }
      }
    }
  }
}

// _idwCacheRes: resolution จริงของ _idwCache (CACHE_RES=120 ปกติ, FC_RES=60 ตอน animate)
let _idwCacheRes = CACHE_RES;

function idw(lat, lon) {
  if(!_idwCache) return idwDirect(lat, lon);
  const res  = _idwCacheRes;
  const rows = res + 1;
  const fi = (lon - CACHE_LON0) / (CACHE_LON1 - CACHE_LON0) * res;
  const fj = (lat - CACHE_LAT0) / (CACHE_LAT1 - CACHE_LAT0) * res;
  // nearest-neighbor: กำจัด zone boundary artifacts จาก bilinear interpolation
  const i0 = Math.max(0, Math.min(res, Math.round(fi)));
  const j0 = Math.max(0, Math.min(res, Math.round(fj)));
  return _idwCache[j0 * rows + i0];
}

// ── Full-chain FRC diagnostic (_frcDiag) ─────────────────────────────────────
// Usage in console: _frcDiag(13.910483, 100.745731)
// Walks through the SAME 4-tier priority chain buildIdwCache() uses per pixel,
// reporting which tier decided the value + sensor/distance/K/velocity/decay detail.
window._frcDiag = function(lat, lon) {
  console.log('═══ FRC Chain Diagnostic @', lat, lon, '═══');

  const dlat = (CACHE_LAT1 - CACHE_LAT0) / CACHE_RES;
  const dlon = (CACHE_LON1 - CACHE_LON0) / CACHE_RES;
  const j = Math.max(0, Math.min(CACHE_RES, Math.round((lat - CACHE_LAT0) / dlat)));
  const i = Math.max(0, Math.min(CACHE_RES, Math.round((lon - CACHE_LON0) / dlon)));
  console.log('grid cell (j,i):', j, i);

  function logDecayDetail(sensor, dKm, pGrid) {
    console.log('  sensor:', sensor.id, '| C0 (sensor.frc):', sensor.frc);
    console.log('  ระยะทาง:', dKm.toFixed(3), 'km');
    let vSrc = 'EPANET default (' + EPANET.v + ' m/s)';
    if (sensor.rtuPressure > 0) vSrc = 'RTU Bernoulli (P=' + sensor.rtuPressure + ')';
    console.log('  velocity source:', vSrc);
    const K = (typeof CONTOUR_K_OVERRIDE !== 'undefined' && CONTOUR_K_OVERRIDE[sensor.id]) ||
              (typeof STATION_K_OVERRIDE !== 'undefined' && STATION_K_OVERRIDE[sensor.id]) ||
              (typeof K_total !== 'undefined' ? K_total : '?');
    console.log('  K (decay rate):', K);
    if (window._tempKFactor && window._tempKFactor !== 1) {
      console.log('  🌡 temp corr ON: sysT=' + window._sysTempC + '°C → K ×' + window._tempKFactor.toFixed(2) + ' (K_eff=' + (typeof K === 'number' ? (K*window._tempKFactor).toFixed(4) : '?') + ')');
    } else {
      console.log('  🌡 temp corr: OFF (K ×1)' + (window._sysTempC ? ' | sysT=' + window._sysTempC + '°C พร้อมใช้' : ''));
    }
    const decayFactor = epanetDecay(dKm, sensor, lat, lon, pGrid);
    const frc = sensor.frc * decayFactor;
    console.log('  decay factor:', decayFactor.toFixed(5), '→ FRC = C0 × decay =', frc.toFixed(4), 'mg/L');
    return frc;
  }

  // Tier 1: VC zone override
  if (typeof VC_STATIONS !== 'undefined' && window.CUSTOM_ZONES) {
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
      if (!sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
      if (!_pip(lat, lon, zone.coords)) continue;
      const vc = VC_STATIONS.find(v => v.id === sid);
      if (vc && vc.valvePct != null && vc.valvePct > 0) {
        console.log('⚡ Tier 1: VC zone override —', sid, '| vc.frc:', vc.frc);
        console.log('→→ (VC path ตัดจบตรงนี้ ไม่ผ่าน epanetDecay ปกติ)');
        return;
      }
    }
  }

  // Tier 2: CUSTOM_ZONES polygon (สถานีสูบจ่าย)
  let tier2Hit = false;
  if (window.CUSTOM_ZONES) {
    const sources = typeof _ensureFrcSources === 'function' ? _ensureFrcSources() : SENSORS;
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES)) {
      if (sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
      if (!_pip(lat, lon, zone.coords)) continue;
      const src = sources.find(s => String(s.id) === sid);
      if (src && src.frc > 0) {
        tier2Hit = true;
        console.log('⚡ Tier 2: CUSTOM_ZONES polygon —', sid);
        const dKm = Math.sqrt((src.lat-lat)**2+(src.lon-lon)**2) * DEG_TO_KM;
        const pd = _getPipeDist ? _getPipeDist(j, i) : null;
        const pGrid = _getPressureFactor ? _getPressureFactor(j, i) : 1;
        if (pd && String(pd.sensorId) === String(sid)) {
          console.log('  (ใช้ pipe distance เพราะ pipe grid ชี้มาที่ sensor เดียวกับโซนนี้)');
          logDecayDetail(src, pd.dist_km, pGrid);
        } else {
          console.log('  (ไม่มี pipe data ตรงนี้ หรือ pipe ชี้ sensor อื่น → ใช้ Euclidean × ' + EUCLID_PIPE_FACTOR + ')');
          logDecayDetail(src, dKm * EUCLID_PIPE_FACTOR, 1);
        }
      }
      break;
    }
  }

  // Tier 3: Pipe-network FRC
  if (!tier2Hit) {
    const pd = _getPipeDist ? _getPipeDist(j, i) : null;
    if (pd) {
      const sensor = SENSORS.find(s => String(s.id) === pd.sensorId);
      if (sensor && sensor.frc) {
        console.log('⚡ Tier 3: Pipe-network (Dijkstra) — sensor', pd.sensorId);
        const pGrid = _getPressureFactor ? _getPressureFactor(j, i) : 1;
        logDecayDetail(sensor, pd.dist_km, pGrid);
      } else {
        console.log('⚡ Tier 3 พบ pipe data แต่หา sensor ' + pd.sensorId + ' ไม่เจอ หรือ sensor.frc ว่าง');
      }
    } else {
      // Tier 4: fallback zone-based
      console.log('❌ Tier 3: ไม่มี pipe data ตรงจุดนี้ → fallback Tier 4 (frcZone geographic)');
      const fz = (window.frcZone || frcZone)(lat, lon);
      console.log('Tier 4 frcZone() ผลลัพธ์:', fz);
    }
  }

  const cached = idw(lat, lon);
  console.log('→→ ค่าจริงที่แสดงบนแผนที่ตอนนี้ (จาก _idwCache, อาจมี PARAM_MODE/lag ต่างจากค่าข้างบนเล็กน้อย):',
    cached != null ? cached.toFixed(4) : cached, 'mg/L');
};

// ── validateModel — วัดความแม่น contour เทียบสถานี monitor (RMSE/MAE/MAPE) ──
// หลักการ: contour ใช้เฉพาะ pump/plant (SP/SW) เป็นต้นทาง — สถานี monitor ไม่ได้เป็น input
// จึงเทียบ "ค่าที่แผนที่แสดง ณ พิกัด monitor" กับ "ค่าที่ monitor วัดจริง" ได้แบบ out-of-sample แท้
// ใช้: validateModel()            → วัดจาก snapshot ปัจจุบัน
//      validateModel({save:true}) → วัด + บันทึกผลลง Firebase (validation/) สะสมข้ามวัน
window.validateModel = function(opts = {}) {
  if (!_idwCache) { console.warn('validateModel: _idwCache ยังไม่พร้อม — รอ contour วาดเสร็จก่อน'); return null; }

  // กันปนเปื้อน: ถ้า monitor ตัวไหนบังเอิญเป็น key ของ CUSTOM_ZONES (เป็น source เอง) ให้ตัดออก
  const zoneSids = new Set(Object.keys(window.CUSTOM_ZONES || {}));
  const targets = SENSORS.filter(s =>
    s.type === 'monitor' && s.frc > 0 && isFinite(s.frc) && !zoneSids.has(String(s.id)));

  const rows = [];
  for (const m of targets) {
    const pred = idw(m.lat, m.lon);
    if (pred == null || !isFinite(pred) || pred <= 0) continue;
    const err = pred - m.frc;
    rows.push({
      id: String(m.id), name: (m.name || '').slice(0, 28),
      จริง: +m.frc.toFixed(2), ทาย: +pred.toFixed(2),
      err: +err.toFixed(3), 'APE%': +(Math.abs(err) / m.frc * 100).toFixed(1)
    });
  }
  const n = rows.length;
  if (!n) { console.warn('validateModel: ไม่มีสถานี monitor ที่ใช้ได้'); return null; }

  const rmse = Math.sqrt(rows.reduce((s, r) => s + r.err * r.err, 0) / n);
  const mae  = rows.reduce((s, r) => s + Math.abs(r.err), 0) / n;
  const mape = rows.reduce((s, r) => s + r['APE%'], 0) / n;
  const bias = rows.reduce((s, r) => s + r.err, 0) / n;
  rows.sort((a, b) => Math.abs(b.err) - Math.abs(a.err));

  console.log('📊 validateModel — n=' + n + ' สถานี monitor · ' + new Date().toLocaleString('th-TH'));
  console.log('RMSE = ' + rmse.toFixed(3) + ' mg/L | MAE = ' + mae.toFixed(3) + ' mg/L | MAPE = ' + mape.toFixed(1) + '% | bias = ' + (bias >= 0 ? '+' : '') + bias.toFixed(3) + ' (' + (bias > 0 ? 'contour ทายสูงกว่าจริง' : 'contour ทายต่ำกว่าจริง') + ')');
  console.log('เกณฑ์เทียบ กนว.32/2566 (EPANET-MSX): RMSE 0.09–0.25 mg/L · MAPE 11–14%');
  console.table(rows);
  console.log('สถานีบนสุดของตาราง = พลาดมากสุด → จุดที่ควรตรวจ K / เส้นทางท่อ / zone ก่อน');

  const result = { ts: Date.now(), n, rmse: +rmse.toFixed(3), mae: +mae.toFixed(3),
                   mape: +mape.toFixed(1), bias: +bias.toFixed(3),
                   tempFactor: window._tempKFactor || 1, apiStatus: (typeof apiStatus !== 'undefined' ? apiStatus : '?') };

  if (opts.save && window._fbReady && window._fb) {
    const key = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    window._fbSet(window._fbRef(window._fb, 'validation/' + key), Object.assign({}, result, { rows }))
      .then(() => console.log('💾 บันทึกผลลง Firebase: validation/' + key))
      .catch(e => console.warn('validateModel save error:', e.message));
  }
  return Object.assign({}, result, { rows });
};

// ── MAP ───────────────────────────────────────────────────────
const map=L.map('map',{center:[13.81,100.58],zoom:10,zoomControl:false,attributionControl:false,zoomSnap:0.25,zoomDelta:0.5,wheelPxPerZoomLevel:120,markerZoomAnimation:true});
window.map = map; // expose for search bar & other external scripts
map.fitBounds([[13.45, 100.25],[14.10, 100.97]], {paddingTopLeft: [0, 0], paddingBottomRight: [0, 0]});
L.control.zoom({position:'topright'}).addTo(map);
// Tile layers: ลอง CartoDB ก่อน fallback เป็น OSM ถ้าโหลดไม่ได้
const tileCartoDB = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {maxZoom:19});
const tileOSM     = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',              {maxZoom:19});
const tileHot     = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',           {maxZoom:19});

tileCartoDB.addTo(map);

// fallback: ถ้า CartoDB โหลดไม่ได้ภายใน 6 วินาที → ลอง OSM
let tileOk = false;
tileCartoDB.on('tileload', () => { tileOk = true; });
setTimeout(() => {
  if (!tileOk) {
    console.warn('[Tile] CartoDB timeout → fallback OSM');
    map.removeLayer(tileCartoDB);
    tileOSM.addTo(map);
    let osmOk = false;
    tileOSM.on('tileload', () => { osmOk = true; });
    setTimeout(() => {
      if (!osmOk) {
        console.warn('[Tile] OSM timeout → fallback HOT');
        map.removeLayer(tileOSM);
        tileHot.addTo(map);
      }
    }, 6000);
  }
}, 6000);
L.control.attribution({prefix:'© OpenStreetMap · © CARTO'}).addTo(map);

const layers={fill:true,lines:true,sensors:true,mwa:true,sta:true,thresh:true,flow:true,pipes:true,pipelines:false,rtu:false,'pipe-pressure':false,'pipe-ec':false,epanet:false,rawwater:false,'rawwater-mk':false};

// ══════════════════════════════════════════════════════════════════
// CONTOUR: Single offscreen canvas rendered in lat/lon space
// วาดครั้งเดียว → ไม่ reload เมื่อ pan/zoom → เพียง reposition ด้วย CSS
// ══════════════════════════════════════════════════════════════════

// Offscreen canvas ครอบพื้นที่ให้ใหญ่กว่า viewport มาก เพื่อ pan โดยไม่ต้อง redraw
const OVER = 0.8; // fraction ขยายออกทุกด้าน
let _canvasBounds = null; // L.LatLngBounds ที่ canvas ครอบอยู่ตอนนี้

const contourEl = document.createElement('canvas');
contourEl.style.cssText = 'position:absolute;pointer-events:none;z-index:200;image-rendering:auto;';
map.getPanes().overlayPane.appendChild(contourEl);

function _drawOnCanvas() {
  if(!_idwCache || (!layers.fill && !layers.lines)) {
    contourEl.style.display = 'none';
    return;
  }
  contourEl.style.display = '';

  // ── Retina / HiDPI support ──
  // Safari/iOS มี canvas pixel limit (~16M pixels) — ต้อง cap ไม่ให้เกิน
  const MAX_CANVAS_PIXELS = 4194304; // 4M pixels = safe for all devices
  const rawDpr = Math.min(window.devicePixelRatio || 1, 2);

  // คำนวณ bounds ที่จะวาด (viewport + margin)
  const vb   = map.getBounds();
  const dlat = (vb.getNorth() - vb.getSouth()) * OVER;
  const dlon = (vb.getEast()  - vb.getWest())  * OVER;
  const b = L.latLngBounds(
    [vb.getSouth()-dlat, vb.getWest()-dlon],
    [vb.getNorth()+dlat, vb.getEast()+dlon]
  );
  _canvasBounds = b;

  // ขนาด CSS (logical pixels)
  const sw = map.latLngToContainerPoint(b.getSouthWest());
  const ne = map.latLngToContainerPoint(b.getNorthEast());
  const W  = Math.abs(ne.x - sw.x);
  const H  = Math.abs(sw.y - ne.y);

  // ลด dpr อัตโนมัติถ้า canvas จะใหญ่เกิน limit
  let dpr = rawDpr;
  if (W * dpr * H * dpr > MAX_CANVAS_PIXELS) {
    dpr = Math.max(1, Math.sqrt(MAX_CANVAS_PIXELS / (W * H)));
  }

  // ขนาด canvas จริง (physical pixels) = logical × dpr
  const PW = Math.round(W * dpr);
  const PH = Math.round(H * dpr);
  contourEl.width  = PW;
  contourEl.height = PH;

  // วาง canvas ใน overlayPane (ซึ่ง transform มาจาก Leaflet อยู่แล้ว)
  const origin   = map.latLngToLayerPoint(b.getNorthWest());
  contourEl.style.width  = W + 'px';
  contourEl.style.height = H + 'px';
  contourEl.style.transform = `translate(${origin.x}px,${origin.y}px)`;

  const ctx = contourEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale context for Retina
  ctx.clearRect(0, 0, W, H);

  // helper: lat/lon → canvas pixel (logical coords — ctx.scale handles physical)
  const toXY = (lat, lon) => {
    const pt = map.latLngToLayerPoint([lat, lon]);
    return [pt.x - origin.x, pt.y - origin.y];
  };

  // ── 1. สร้าง IDW value grid ในพิกัด lat/lon (RES×RES) ──────────────
  const RES = 100;
  const latRange = b.getNorth() - b.getSouth();
  const lonRange = b.getEast()  - b.getWest();
  const gv = new Float32Array((RES+1)*(RES+1));
  for(let j=0; j<=RES; j++) {
    const lat = b.getNorth() - j/RES * latRange;
    for(let i=0; i<=RES; i++) {
      gv[j*(RES+1)+i] = idw(lat, b.getWest() + i/RES * lonRange);
    }
  }

  // ── 2. Fill: render pixel-by-pixel ด้วย ImageData (at physical resolution) ──
  if(layers.fill) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset for pixel-level rendering
    const imgData = ctx.createImageData(PW, PH);
    const px = imgData.data;

    // สร้าง clip mask ก่อน (วาดบน offscreen canvas at physical resolution)
    const maskC = document.createElement('canvas');
    maskC.width=PW; maskC.height=PH;
    const mctx = maskC.getContext('2d');
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.fillStyle='#000';
    mctx.fillRect(0,0,W,H);
    mctx.fillStyle='#fff';
    mctx.beginPath();
    if (window._dashClipCoords && window._dashClipCoords.length > 2) {
      // v38.0: เลือกโซนจากแดชบอร์ด → contour เฉพาะในพื้นที่อิทธิพลนั้น (นอกกรอบ = แผนที่พื้น)
      let first = true;
      for (const [la, lo] of window._dashClipCoords) {
        const [x, y] = toXY(la, lo);
        if (first) { mctx.moveTo(x, y); first = false; } else mctx.lineTo(x, y);
      }
      mctx.closePath();
    } else {
      for(const poly of [...STA_POLYS,...MWA_POLYS]) {
        let first=true;
        for(const [la,lo] of poly.coords) {
          const [x,y]=toXY(la,lo);
          if(first){mctx.moveTo(x,y);first=false;} else mctx.lineTo(x,y);
        }
        mctx.closePath();
      }
    }
    mctx.fill('nonzero');
    const maskData = mctx.getImageData(0,0,PW,PH).data;

    // ── Pre-compute color LUT (256 entries) ─────────────────────────
    const LUT_SIZE = 256;
    let lutMin, lutMax;
    if (PARAM_MODE === 'ec') { lutMin = 0; lutMax = 1500; }
    else { lutMin = 0; lutMax = 2.5; }
    const lutScale = (LUT_SIZE - 1) / (lutMax - lutMin);
    const lutR = new Uint8Array(LUT_SIZE);
    const lutG = new Uint8Array(LUT_SIZE);
    const lutB = new Uint8Array(LUT_SIZE);
    const lutA = Math.round(0.60 * 255);
    for (let li = 0; li < LUT_SIZE; li++) {
      const lv = lutMin + li / lutScale;
      const _c = paramColorRGBA(lv, 0.60);
      lutR[li] = _c[0]; lutG[li] = _c[1]; lutB[li] = _c[2];
    }

    // ── Pre-compute lat/lon lookup tables (direct math — ไม่เรียก Leaflet) ──
    const _rowLat = new Float64Array(PH);
    const _colLon = new Float64Array(PW);
    const bSouth = b.getSouth(), _bNorth = b.getNorth();
    const bWest = b.getWest(), bEast = b.getEast();
    for (let py2 = 0; py2 < PH; py2++) {
      _rowLat[py2] = _bNorth - (py2 / PH) * (_bNorth - bSouth);
    }
    for (let px2 = 0; px2 < PW; px2++) {
      _colLon[px2] = bWest + (px2 / PW) * (bEast - bWest);
    }
    const bNorth = _bNorth;
    const _invLatRange = RES / latRange;
    const _invLonRange = RES / lonRange;
    const _res1 = RES + 1;
    const _resMinus1 = RES - 1;

    for(let py2=0; py2<PH; py2++) {
      const lat = _rowLat[py2];
      const fj = (bNorth - lat) * _invLatRange;
      const j0 = fj > 0 ? (fj < _resMinus1 ? fj|0 : _resMinus1) : 0;
      const ty = fj - j0;
      const oty = 1 - ty;
      const j0Row = j0 * _res1;
      const j1Row = j0Row + _res1;
      const rowOff = py2 * PW;
      for(let px2=0; px2<PW; px2++) {
        const idx4 = (rowOff + px2) << 2;
        if(maskData[idx4] < 128) continue;
        const fi = (_colLon[px2] - bWest) * _invLonRange;
        const i0 = fi > 0 ? (fi < _resMinus1 ? fi|0 : _resMinus1) : 0;
        const tx = fi - i0;
        const v = gv[j0Row+i0]*(1-tx)*oty
                + gv[j0Row+i0+1]*tx*oty
                + gv[j1Row+i0]*(1-tx)*ty
                + gv[j1Row+i0+1]*tx*ty;
        // LUT lookup แทน paramColorRGBA
        const li = v <= lutMin ? 0 : v >= lutMax ? LUT_SIZE-1 : ((v - lutMin) * lutScale + 0.5)|0;
        px[idx4]   = lutR[li];
        px[idx4+1] = lutG[li];
        px[idx4+2] = lutB[li];
        px[idx4+3] = lutA;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // restore scale for lines
  }

  // ── 3. Contour lines (marching squares บน grid) ─────────────────────
  if(layers.lines) {
    ctx.save();
    const clip = new Path2D();
    for(const poly of [...STA_POLYS,...MWA_POLYS]) {
      let first=true;
      for(const [la,lo] of poly.coords) {
        const [x,y]=toXY(la,lo); if(first){clip.moveTo(x,y);first=false;} else clip.lineTo(x,y);
      }
      clip.closePath();
    }
    ctx.clip(clip,'nonzero');

    // หา max/min จาก gv grid ที่เพิ่งคำนวณ (ตรงกว่า _idwCache)
    window._gvMax = 0; let _gvMax = 0, _gvMin = Infinity;
    for (let i=0; i<gv.length; i++) {
      if (gv[i] > _gvMax) { _gvMax = gv[i]; window._gvMax = gv[i]; }
      if (gv[i] < _gvMin && gv[i] > 0) _gvMin = gv[i];
    }
    const levels=[];
    if (PARAM_MODE === 'ec') {
      for(let v=50; v<=1000; v+=50) {
        if (v >= (_gvMin - 25) && v <= (_gvMax + 25)) levels.push(v);
      }
    } else {
      for(let v=0.1;v<=2.05;v=+(v+0.1).toFixed(2)) levels.push(v);
    }

    // สะสม segments ของเส้น labeled เพื่อวาด label ทีหลัง
    const labelSegs = []; // {x,y,angle,text,color}

    for(const level of levels) {
      // ข้าม level ที่สูงกว่าค่าสูงสุดจริงในแผนที่
      if (PARAM_MODE === 'ec' && level > _gvMax + 10) continue;
      let isMajor, isLabeled, is_lo, is_hi;
      if (PARAM_MODE === 'ec') {
        isMajor   = level % 100 === 0;
        is_lo     = level === EC_CONFIG.lo;  // 300
        is_hi     = level === EC_CONFIG.hi;  // 600
        const is_200   = level === 200;
        const is_pivot = level === 250;
        isLabeled = is_lo || (is_hi && _gvMax >= EC_CONFIG.hi - 25) || is_200 || is_pivot;
      } else {
        isMajor   = Math.round(level*10)%5===0;
        is_lo     = Math.abs(level-0.2)<0.005;
        is_hi     = Math.abs(level-1.0)<0.005;
        isLabeled = is_lo || is_hi;
      }
      // EC mode: ไม่วาดเส้น threshold (300/600) เพราะ contour ปกติแสดงอยู่แล้ว
      if(PARAM_MODE === 'ec' && isLabeled) continue;
      if(isLabeled && !layers.thresh) continue;
      ctx.beginPath();
      if(is_lo)         {ctx.strokeStyle=PARAM_MODE==='ec'?'rgba(200,80,0,0.95)':'rgba(180,0,0,0.90)';ctx.lineWidth=1.2;ctx.setLineDash([6,4]);}
      else if(is_hi)    {ctx.strokeStyle=PARAM_MODE==='ec'?'rgba(140,20,0,0.95)':'rgba(0,120,220,0.85)'; ctx.lineWidth=0.8;ctx.setLineDash([6,4]);}
      else if(PARAM_MODE==='ec' && level===200) {ctx.strokeStyle='rgba(60,60,60,0.75)';ctx.lineWidth=1.8;ctx.setLineDash([10,5]);}
      else if(PARAM_MODE==='ec' && level===250) {ctx.strokeStyle='rgba(80,80,80,0.70)';ctx.lineWidth=1.8;ctx.setLineDash([12,5]);}
      // removed duplicate level===200 teal line
      else if(isMajor)  {ctx.strokeStyle=PARAM_MODE==='ec'?'rgba(100,100,100,0.30)':'rgba(180,0,70,0.50)';ctx.lineWidth=1.0;ctx.setLineDash([]);}
      else              {ctx.strokeStyle=PARAM_MODE==='ec'?'rgba(120,120,120,0.12)':'rgba(210,60,120,0.25)';ctx.lineWidth=0.5;ctx.setLineDash([]);}

      const segs = isLabeled ? [] : null;

      for(let j=0;j<RES;j++) for(let i=0;i<RES;i++) {
        const v00=gv[j*(RES+1)+i], v10=gv[j*(RES+1)+i+1];
        const v01=gv[(j+1)*(RES+1)+i], v11=gv[(j+1)*(RES+1)+i+1];
        const cv=[v00,v10,v11,v01];
        const cb=cv.map(x=>x>=level?1:0);
        if(cb[0]+cb[1]+cb[2]+cb[3]===0||cb[0]+cb[1]+cb[2]+cb[3]===4) continue;
        const ip=(a,b3)=>a/(a-b3+1e-9);
        const [x0,y0]=toXY(b.getNorth()-j/RES*latRange,   b.getWest()+i/RES*lonRange);
        const [x1,y1]=toXY(b.getNorth()-j/RES*latRange,   b.getWest()+(i+1)/RES*lonRange);
        const [x2,y2]=toXY(b.getNorth()-(j+1)/RES*latRange,b.getWest()+i/RES*lonRange);
        const cw2=x1-x0, ch2=y2-y0;
        const P={
          T:[x0+ip(cv[0]-level,cv[1]-level)*cw2, y0],
          R:[x0+cw2, y0+ip(cv[1]-level,cv[2]-level)*ch2],
          B:[x0+ip(cv[3]-level,cv[2]-level)*cw2, y0+ch2],
          L:[x0, y0+ip(cv[0]-level,cv[3]-level)*ch2]
        };
        const e=[];
        if(cb[0]!==cb[1]) e.push(P.T);
        if(cb[1]!==cb[2]) e.push(P.R);
        if(cb[2]!==cb[3]) e.push(P.B);
        if(cb[3]!==cb[0]) e.push(P.L);
        if(e.length>=2){
          ctx.moveTo(...e[0]);ctx.lineTo(...e[1]);
          if(segs) segs.push(e);
        }
      }
      ctx.stroke(); ctx.setLineDash([]);

      // เลือก segments สำหรับ label — กระจายทั่วภาพ
      if(isLabeled && segs && segs.length > 0) {
        let labelColor, labelText, fontSize;
        if (PARAM_MODE === 'ec') {
          labelColor = is_lo ? 'rgba(30,120,200,1)' : 'rgba(160,30,0,1)';
          labelText  = is_lo ? '300' : '600';
          fontSize   = 10;
        } else {
          labelColor = is_lo ? 'rgba(180,0,0,0.90)' : 'rgba(0,120,220,0.85)';
          labelText  = is_lo ? '0.2' : '1.0';
          fontSize   = is_lo ? 7 : 8;
        }
        const step = Math.max(1, Math.floor(segs.length / 8));
        for(let si=0; si<segs.length; si+=step) {
          const [p1,p2] = segs[si];
          const mx=(p1[0]+p2[0])/2, my=(p1[1]+p2[1])/2;
          const angle=Math.atan2(p2[1]-p1[1], p2[0]-p1[0]);
          labelSegs.push({x:mx,y:my,angle,text:labelText,color:labelColor,fs:fontSize});
        }
      }
    }

    // วาด labels ทั้งหมดทีเดียว (อยู่บนสุด)
    ctx.save();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    for(const lb of labelSegs) {
      ctx.save();
      ctx.translate(lb.x, lb.y);
      let angle = lb.angle;
      if(angle > Math.PI/2)  angle -= Math.PI;
      if(angle < -Math.PI/2) angle += Math.PI;
      ctx.rotate(angle);
      ctx.font = `bold ${lb.fs}px 'JetBrains Mono',monospace`;
      ctx.fillStyle = lb.color;
      ctx.fillText(lb.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();

    ctx.restore();
  }
}

// ระหว่าง pan → แค่ขยับ canvas ตาม layerPoint ใหม่ (ไม่ redraw)
function _repositionCanvas() {
  if(!_canvasBounds) return;
  const origin = map.latLngToLayerPoint(_canvasBounds.getNorthWest());
  contourEl.style.transform = `translate(${origin.x}px,${origin.y}px)`;
}

// ตรวจว่า viewport เลยขอบ canvas ที่วาดไว้หรือยัง
function _needsRedraw() {
  if(!_canvasBounds) return true;
  const vb = map.getBounds();
  return !_canvasBounds.contains(vb.getNorthEast()) || !_canvasBounds.contains(vb.getSouthWest());
}

map.on('move', _repositionCanvas);
map.on('zoomend', () => { _drawOnCanvas(); });
map.on('moveend', () => { if(_needsRedraw()) redrawContour(50); });

// alias

let _redrawTimer = null;
function redrawContour(delay=100) {
  clearTimeout(_redrawTimer);
  _redrawTimer = setTimeout(_drawOnCanvas, delay);
}

// STA borders
const staGroup=L.layerGroup().addTo(map);
for(const p of STA_POLYS)
  L.polygon(p.coords,{color:'#cc6688',weight:1.0,fill:false,opacity:0.45,interactive:false}).addTo(staGroup);

// MWA borders + labels
const mwaGroup=L.layerGroup().addTo(map);
for(const p of MWA_POLYS) {
  L.polygon(p.coords,{color:'#880030',weight:2.2,fill:false,opacity:0.78,interactive:false}).addTo(mwaGroup);
  if(p.name) {
    const lats=p.coords.map(c=>c[0]),lons=p.coords.map(c=>c[1]);
    L.marker(
      [lats.reduce((a,b)=>a+b,0)/lats.length, lons.reduce((a,b)=>a+b,0)/lons.length],
      {icon:L.divIcon({
        html:`<div style="color:#880030;font-size:11px;font-weight:700;text-shadow:0 0 3px #fff,0 0 6px #fff;white-space:nowrap;font-family:'Sarabun',sans-serif;">${p.name}</div>`,
        className:'',iconAnchor:[30,8]
      }),interactive:false}
    ).addTo(mwaGroup);
  }
}

// Sensors
const sensorGroup=L.layerGroup().addTo(map);

// ══════ EPANET Pipe Network Layer ══════
const pipeNetGroup = L.layerGroup(); // default: added to map
pipeNetGroup.addTo(map);
const _pipeCanvasRenderer = L.canvas({padding: 0.5});
(async function loadPipeNetwork(){
  try {
    const b64 = PIPE_NET_KMZ_B64; // data/pipes.js
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const wr = ds.writable.getWriter(); wr.write(bytes); wr.close();
    const rd = ds.readable.getReader();
    const ch = []; while(true){const{done,value}=await rd.read();if(done)break;ch.push(value);}
    const tot = ch.reduce((a,c)=>a+c.length,0);
    const res = new Uint8Array(tot); let off=0;
    for(const c of ch){res.set(c,off);off+=c.length;}
    const pipes = JSON.parse(new TextDecoder().decode(res));
    // pipes: [[lat1,lon1,lat2,lon2,diameter], ...]
    // Color by diameter
    // Pipe data now has FRC: [lat1,lon1,lat2,lon2,diameter,frc_sim]
    function frcPipeColor(f){
      if(f>=1.5) return '#06b6d4';  // cyan - FRC สูง
      if(f>=1.0) return '#22c55e';  // green
      if(f>=0.5) return '#eab308';  // yellow
      if(f>=0.2) return '#f97316';  // orange
      return '#ef4444';              // red - FRC ต่ำ
    }
    for(const p of pipes){
      L.polyline([[p[0],p[1]],[p[2],p[3]]], {
        color: frcPipeColor(p[5]||0),
        weight: Math.max(0.8, Math.min(2.5, p[4]/600)),
        opacity: 0.55,
        interactive: false,
        renderer: _pipeCanvasRenderer
      }).addTo(pipeNetGroup);
    }
    console.log('✅ Enhanced EPANET pipe network loaded:', pipes.length, 'segments (KMZ geometry + FRC sim)');
  } catch(e) { console.warn('Pipe network load failed:', e); }
})();

// ══════ MWA Pipe Line Visualization Layer (KMZ data) ══════
const _pipeLineRenderer = L.canvas({padding: 0.5, tolerance: 5});
const pipeLineGroup = L.layerGroup();
(async function loadPipeLines(){
  try {
    const _plB64 = PIPE_LINES_B64; // data/pipes.js
    const _plBin = atob(_plB64);
    const _plBytes = new Uint8Array(_plBin.length);
    for(let i=0;i<_plBin.length;i++) _plBytes[i]=_plBin.charCodeAt(i);
    const _plDs = new DecompressionStream('gzip');
    const _plWr = _plDs.writable.getWriter(); _plWr.write(_plBytes); _plWr.close();
    const _plRd = _plDs.readable.getReader();
    const _plCh = [];
    while(true){const{done,value}=await _plRd.read();if(done)break;_plCh.push(value);}
    const _plTot = _plCh.reduce((a,c)=>a+c.length,0);
    const _plRes = new Uint8Array(_plTot); let _plOff=0;
    for(const c of _plCh){_plRes.set(c,_plOff);_plOff+=c.length;}
    const pipeData = JSON.parse(new TextDecoder().decode(_plRes));
    const _plColors = {
      400:'#f97316', 500:'#e11d48', 560:'#e11d48', 600:'#3b82f6', 630:'#3b82f6',
      700:'#059669', 710:'#059669', 800:'#7c3aed', 900:'#dc2626',
      1000:'#2563eb', 1200:'#15803d', 1250:'#15803d',
      1500:'#b91c1c', 1800:'#1e3a5f', 2300:'#0f172a'
    };
    const _plNames = {
      CI:'เหล็กหล่อ',ST:'เหล็กเหนียว',PVC:'PVC',AC:'ใยหิน',
      HDPE:'HDPE',PC:'คอนกรีต',DI:'เหล็กดัคไทล์',
      RCP:'ค.ส.ล.',SCP:'เหล็กเคลือบ',GI:'เหล็กอาบสังกะสี'
    };
    let count = 0;
    for (const [key, segments] of Object.entries(pipeData)) {
      const [dStr, mat] = key.split('|');
      const d = parseInt(dStr);
      const color = _plColors[d] || (d >= 1000 ? '#2563eb' : d >= 600 ? '#3b82f6' : '#f97316');
      const weight = d >= 1500 ? 4 : d >= 1000 ? 3 : d >= 600 ? 2 : 1.2;
      const matName = _plNames[mat] || mat;
      for (const coords of segments) {
        const latlngs = coords.map(c => [c[1], c[0]]);
        L.polyline(latlngs, {
          color: color, weight: weight, opacity: 0.65,
          renderer: _pipeLineRenderer
        }).bindPopup('<div style="text-align:center;font-size:13px;"><b style="font-size:15px;color:'+color+';">\u2B24 '+d+' mm</b><br><span style="color:#888;">\u0E27\u0E31\u0E2A\u0E14\u0E38: '+matName+' ('+mat+')</span></div>'
        ).addTo(pipeLineGroup);
        count++;
      }
    }
    console.log('MWA Pipe lines loaded:', count, 'segments from KMZ');
  } catch(e) { console.warn('MWA Pipe line load failed:', e); }
})();

// ══════ RTU Real-Time Monitoring Layer ══════
const rtuGroup = L.layerGroup(); // default: NOT added to map
(async function loadRtuStations(){
  try {
    const b64 = RTU_STATIONS_B64; // data/rtu.js
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
    const ds = new DecompressionStream('gzip');
    const wr = ds.writable.getWriter(); wr.write(bytes); wr.close();
    const rd = ds.readable.getReader();
    const ch = []; while(true){const{done,value}=await rd.read();if(done)break;ch.push(value);}
    const tot = ch.reduce((a,c)=>a+c.length,0);
    const res = new Uint8Array(tot); let off=0;
    for(const c of ch){res.set(c,off);off+=c.length;}
    const rtus = JSON.parse(new TextDecoder().decode(res));
    // rtus: [{id,b,loc,lt,ln,p,q,qr,d,s,c,lP,lF,lC,lA,ptc}, ...]
    // rev25: expose RTU live pressure globally for contour calculation
    window._rtuLive = rtus.filter(r => r.c === 1 && r.lP > 0);
    window._rtuPNominal = (function(){
      const online = rtus.filter(r => r.c === 1 && r.lP > 0);
      if (!online.length) return 15;
      return online.reduce((s,r) => s + r.lP, 0) / online.length;
    })();
    console.log('RTU live pressure: ' + window._rtuLive.length + ' stations, P_nominal=' + window._rtuPNominal.toFixed(1) + ' mwc');
    // inject RTU pressure into SENSORS after B64 init
    // ใช้ setTimeout เพื่อรอให้ SENSORS โหลดเสร็จก่อน (fetchAndUpdate อาจยังไม่ run)
    setTimeout(() => {
      if (typeof injectRtuPressureToSensors === 'function' && typeof SENSORS !== 'undefined' && SENSORS.length > 0) {
        injectRtuPressureToSensors();
        if (typeof buildIdwCache === 'function') buildIdwCache();
        if (typeof redrawContour === 'function') redrawContour();
      }
    }, 3000);
    
    // RTU comparison data from EPANET simulation
    const _rtuCompB64 = RTU_COMP_B64; // data/rtu.js
    let _rtuFrcMap = {};
    try {
      const _rcBin = atob(_rtuCompB64);
      const _rcBytes = new Uint8Array(_rcBin.length);
      for(let i=0;i<_rcBin.length;i++) _rcBytes[i]=_rcBin.charCodeAt(i);
      const _rcDs = new DecompressionStream('gzip');
      const _rcWr = _rcDs.writable.getWriter(); _rcWr.write(_rcBytes); _rcWr.close();
      const _rcRd = _rcDs.readable.getReader();
      const _rcCh = []; 
      while(true){const{done,value}=await _rcRd.read();if(done)break;_rcCh.push(value);}
      const _rcTot = _rcCh.reduce((a,c)=>a+c.length,0);
      const _rcRes = new Uint8Array(_rcTot); let _rcOff=0;
      for(const c of _rcCh){_rcRes.set(c,_rcOff);_rcOff+=c.length;}
      const _rtuComps = JSON.parse(new TextDecoder().decode(_rcRes));
      for(const rc of _rtuComps) _rtuFrcMap[rc.id] = {f:rc.f, ds:rc.ds};
      console.log('RTU FRC comparison loaded:', _rtuComps.length, 'stations');
    } catch(e) { console.warn('RTU comparison load failed:', e); }

    function rtuColor(r) {
      if (r.c !== 1) return '#ef4444';
      if (r.lC && r.lC !== 'black') return r.lC;
      if (r.lP >= 10) return '#22c55e';
      if (r.lP >= 5) return '#3b82f6';
      if (r.lP > 0) return '#f59e0b';
      return '#6b7280';
    }
    function rtuStatus(r) {
      if (r.c === 0 || r.c === null) return '❌ Offline';
      if (r.c === 1) return '✅ Online';
      if (r.c === 2) return '⚠️ Warning';
      if (r.c === 3) return '🔴 Error';
      return '?';
    }
    function pressureBar(val, max) {
      const pct = Math.min(100, (val/max)*100);
      const col = pct > 60 ? '#22c55e' : pct > 30 ? '#f59e0b' : '#ef4444';
      return '<div style="width:100%;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;margin:2px 0">' +
        '<div style="width:'+pct+'%;height:100%;background:'+col+';border-radius:3px"></div></div>';
    }
    
    let online=0, offline=0;
    for(const r of rtus) {
      const color = rtuColor(r);
      const isOnline = r.c === 1;
      if(isOnline) online++; else offline++;
      
      const icon = L.divIcon({
        className:'',
        html: '<div style="width:12px;height:12px;border-radius:50%;background:'+color+
              ';border:2px solid '+(isOnline?'#fff':'#666')+
              ';box-shadow:0 0 6px '+color+'80;opacity:'+(isOnline?'0.9':'0.4')+'"></div>',
        iconSize:[12,12], iconAnchor:[6,6]
      });
      
      const popup = '<div style="min-width:200px">'+
        '<div class="popup-title">📡 '+r.id+'</div>'+
        '<div style="font-size:11px;color:#94a3b8;margin-bottom:6px">'+r.loc+'</div>'+
        '<div class="popup-row"><span class="popup-label">สาขา</span><span class="popup-val">'+r.b+'</span></div>'+
        '<div class="popup-row"><span class="popup-label">สถานะ</span><span class="popup-val">'+rtuStatus(r)+'</span></div>'+
        '<div class="popup-row"><span class="popup-label">Live Pressure</span><span class="popup-val" style="color:'+(r.lC&&r.lC!=='black'?r.lC:(r.lP>=5?'#22c55e':'#f59e0b'))+';font-weight:700">'+(r.lP>0?r.lP.toFixed(2)+' mwc':'—')+'</span></div>'+
        pressureBar(r.lP, 25)+
        '<div class="popup-row"><span class="popup-label">Live Flow</span><span class="popup-val" style="color:'+(r.lA&&r.lA!=='black'?r.lA:'#94a3b8')+';font-weight:700">'+(r.lF!==0?r.lF.toLocaleString()+' m³/h':'—')+'</span></div>'+
        '<div class="popup-row"><span class="popup-label">ช่วงปกติ</span><span class="popup-val">'+(r.ptc||'—')+' mwc</span></div>'+
        (r.d > 0 ? '<div class="popup-row"><span class="popup-label">Diameter</span><span class="popup-val">'+r.d+' mm</span></div>' : '')+
        (_rtuFrcMap[r.id] ? '<div class="popup-row"><span class="popup-label">FRC sim (EPANET)</span><span class="popup-val" style="color:'+(_rtuFrcMap[r.id].f>=1.0?'#22c55e':_rtuFrcMap[r.id].f>=0.5?'#eab308':'#ef4444')+'">'+_rtuFrcMap[r.id].f+' mg/L</span></div><div class="popup-row"><span class="popup-label">Dist from source</span><span class="popup-val">'+(_rtuFrcMap[r.id].ds/1000).toFixed(1)+' km</span></div>' : '')+
        '</div>';
      
      L.marker([r.lt, r.ln], {icon, zIndexOffset: isOnline ? 100 : -100})
        .bindPopup(popup)
        .addTo(rtuGroup);
    }
    console.log('RTU loaded:', rtus.length, 'stations ('+online+' online, '+offline+' offline)');
  } catch(e) { console.warn('RTU load failed:', e); }
})();
// ══════ rev26: RTU Live Auto-Refresh (Intranet only) ══════
(function initRtuAutoRefresh() {
  const RTU_API_REGISTRY = 'http://172.16.193.162/smartmap/kml/rtu_db.php';
  const RTU_API_QUERY = 'http://172.16.193.162/smartmap/rtu_query2.php';
  const RTU_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 นาที
  let _rtuIsIntranet = false;

  // ทดสอบว่าอยู่บน intranet หรือไม่
  async function checkIntranet() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000); // timeout 3 วินาที
      const resp = await fetch(RTU_API_REGISTRY, { signal: ctrl.signal, mode: 'no-cors' });
      clearTimeout(timer);
      _rtuIsIntranet = true;
      console.log('[RTU-Refresh] ✅ Intranet detected — auto-refresh enabled (every 5 min)');
      return true;
    } catch(e) {
      _rtuIsIntranet = false;
      console.log('[RTU-Refresh] ℹ️ Not on intranet — using embedded B64 data (no refresh)');
      return false;
    }
  }

  // ดึงข้อมูล RTU จาก intranet API
  async function fetchRtuLive() {
    if (!_rtuIsIntranet) return null;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      
      // Fetch registry (station info) — GeoJSON
      const regResp = await fetch(RTU_API_REGISTRY, { signal: ctrl.signal });
      const regData = await regResp.json();
      
      // Fetch live query (pressure/flow) — flat object [{P019_P, P019_F, P019_C, ...}]
      const qResp = await fetch(RTU_API_QUERY + '?ts=' + Date.now(), { signal: ctrl.signal });
      const qText = await qResp.text();
      // rtu_query2.php ส่ง single-quoted JSON
      // แปลงแบบ token-based: เฉพาะ quote ที่เป็น key/value delimiter เท่านั้น
      const _fixSingleQuoteJson = (s) => {
        let out = '', i = 0;
        while (i < s.length) {
          const ch = s[i];
          if (ch === "'") {
            // หา closing single quote
            let j = i + 1;
            while (j < s.length && s[j] !== "'") j++;
            out += '"' + s.slice(i+1, j) + '"';
            i = j + 1;
          } else {
            out += ch; i++;
          }
        }
        return out;
      };
      // ลบ trailing comma ก่อน } หรือ ] ที่ทำให้ JSON.parse พัง
      const qCleaned = _fixSingleQuoteJson(qText).replace(/,\s*([}\]])/g, '$1');
      const qData = JSON.parse(qCleaned);
      clearTimeout(timer);

      // Parse flat live map: {"P019_P":"3.45","P019_F":"-1000.00","P019_C":"#FF0000",...}
      const liveMap = {};
      if (qData && qData[0]) {
        const flat = qData[0];
        const seen = new Set();
        for (const key of Object.keys(flat)) {
          const m = key.match(/^(.+)_P$/);
          if (m) seen.add(m[1]);
        }
        for (const sid of seen) {
          liveMap[sid] = {
            lP: parseFloat(flat[sid + '_P']) || 0,
            lF: parseFloat(flat[sid + '_F']) || 0,
            lC: flat[sid + '_C'] || '',
            lA: flat[sid + '_A'] || ''
          };
        }
      }

      const stations = [];
      if (regData && regData.features) {
        for (const f of regData.features) {
          const p = f.properties || {};
          const coords = f.geometry ? f.geometry.coordinates : [0,0];
          const sid = p.site_id || p.id || '';
          const live = liveMap[sid] || {};
          stations.push({
            id: sid,
            b: p.branch || '',
            loc: p.location || '',
            lt: coords[1] || 0,
            ln: coords[0] || 0,
            c: live.lP > 0 ? 1 : 0,
            lP: live.lP || 0,
            lF: live.lF || 0,
            lC: live.lC || '',
            lA: live.lA || ''
          });
        }
      }
      return stations.length > 0 ? stations : null;
    } catch(e) {
      console.warn('[RTU-Refresh] Fetch failed:', e.message);
      return null;
    }
  }

  // อัปเดต global RTU data + redraw contour
  async function refreshRtu() {
    const stations = await fetchRtuLive();
    if (!stations) return;
    
    const online = stations.filter(r => r.c === 1 && r.lP > 0);
    window._rtuLive = online;
    window._rtuPNominal = online.length > 0 
      ? online.reduce((s,r) => s + r.lP, 0) / online.length 
      : 15;
    
    console.log('[RTU-Refresh] ✅ Updated: ' + online.length + ' online, P_nominal=' + window._rtuPNominal.toFixed(1) + ' mwc');
    
    // re-inject RTU pressure into SENSORS after live update
    if (typeof injectRtuPressureToSensors === 'function') injectRtuPressureToSensors();
    
    // Redraw FRC contour with new pressure data
    if (typeof buildIdwCache === 'function') buildIdwCache();
    if (typeof redrawContour === 'function') redrawContour();
    
    // Update RTU markers on map
    if (typeof rtuGroup !== 'undefined') {
      rtuGroup.clearLayers();
      for (const r of stations) {
        const isOn = r.c === 1;
        const color = r.lP >= 10 ? '#22c55e' : r.lP >= 5 ? '#3b82f6' : r.lP > 0 ? '#f59e0b' : '#6b7280';
        L.circleMarker([r.lt, r.ln], {
          radius: 5, fillColor: color, fillOpacity: isOn ? 0.8 : 0.3,
          color: '#fff', weight: 1.5, opacity: isOn ? 0.9 : 0.4
        }).bindPopup('<b>📡 '+r.id+'</b><br>P: '+(r.lP>0?r.lP.toFixed(1)+' mwc':'—')+'<br>F: '+(r.lF?r.lF.toLocaleString()+' m³/h':'—'))
         .addTo(rtuGroup);
      }
    }
  }

  // เริ่มต้น
  checkIntranet().then(function(isIntra) {
    if (isIntra) {
      // Refresh ทันทีครั้งแรก
      refreshRtu();
      // ตั้ง interval ทุก 5 นาที
      setInterval(refreshRtu, RTU_REFRESH_INTERVAL);
    }
  });
})();



// ══════ EPANET Contour Overlay (FRC simulation) ══════
const epanetContourLayer = L.imageOverlay(
  EPANET_OVERLAY_PNG, // data/assets.js
  [[13.48691554, 100.29992236], [14.037307460000001, 100.94189564000001]],
  {opacity: 0.5, interactive: false}
);
console.log('EPANET contour overlay ready');





// Global alias — ROOT_SOURCE_MAP accessible outside buildMarkers
// EC source map — ต้นทาง EC ที่แท้จริง
const EC_SOURCE_MAP = {
  // TR1/TR2/TR3 = อุโมงค์ส่งน้ำของโรงงานผลิตน้ำบางเขน → ใช้สถานีสูบส่งบางเขนเป็น source
  'TR1':   'สถานีสูบส่งน้ำบางเขน 1 (TR1)',
  'TR2':   'สถานีสูบส่งน้ำบางเขน 2 (TR2)',
  'TR3':   'สถานีสูบส่งน้ำบางเขน 3 (TR3)',
  // MTR = อุโมงค์ส่งน้ำของโรงงานผลิตน้ำมหาสวัสดิ์
  'MTR':   'สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)',
  'MH':    'สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)',
  // Dis1/Dis2 = สถานีสูบจ่ายน้ำบางเขน
  'Dis1':  'สถานีสูบจ่ายน้ำบางเขน 1 (Dis1)',
  'Dis2':  'สถานีสูบจ่ายน้ำบางเขน 2 (Dis2)',
  // MDIS = สถานีสูบจ่ายน้ำมหาสวัสดิ์
  'MDIS':  'สถานีสูบจ่ายน้ำมหาสวัสดิ์',
  // โรงงานอื่น
  'ธนบุรี':    'โรงงานผลิตน้ำธนบุรี',
  'สามเสน3':   'โรงงานผลิตน้ำสามเสน 3',
  // rev19: น้ำดิบสำแล — ใช้ EC จาก API น้ำดิบ
  'RAW_SAMLE':  '_RAW_WATER_SAMLE_',
  // rev20: น้ำดิบแม่กลอง — ใช้ EC จาก API แม่กลอง (S11)
  'RAW_MAEKLONG': '_RAW_WATER_MAEKLONG_',
};

// rev22: confidence band for EC forecast (±15%)
const EC_FORECAST_BAND = 0.10; // ±10% confidence band

const EC_ROOT_SOURCE_MAP = {
  // ── rev28: ทุกสถานี root จากน้ำดิบสำแล / คลองตะวันตก กม.14 ──────────────────
  // ttRoot = เวลาเดินทางรวม (น้ำดิบ → โรงผลิต+ผลิต 2ชม.+reservoir 2ชม. → อุโมงค์ → สถานี)
  //
  // ฝั่งตะวันออก: สำแล +13 + ผลิต 2 + reservoir 2 = 17 ชม. → TR/Dis → สถานี
  // ฝั่งตะวันตก: คลองตะวันตก กม.14 +23 + ผลิต 2 + reservoir 2 = 27 ชม. → MTR/MDIS → สถานี
  //
  // ── TR1 (สำแล 17 + TR1→สถานี) ─────────────────────────────────────
  'สำนักงานประปาสาขาทุ่งมหาเมฆ':                              { root: 'RAW_SAMLE',  ttRoot: 24   }, // 17+7
  'บริษัท ศิครินทร์ จำกัด (มหาชน) (โรงพยาบาลศิครินทร์)':    { root: 'RAW_SAMLE',  ttRoot: 28.5 }, // 17+7+4.5
  'โรงเรียนหาดอมราอักษรลักษณ์วิทยา':                          { root: 'RAW_SAMLE',  ttRoot: 30.5 }, // 17+7+6.5
  'บริษัท เอจีซี แฟลทกลาส (ประเทศไทย) จำกัด (มหาชน)':       { root: 'RAW_SAMLE',  ttRoot: 27.5 }, // 17+7+3.5
  'สำนักงานประปาสาขาสมุทรปราการ':                             { root: 'RAW_SAMLE',  ttRoot: 26.5 }, // 17+7+2.5
  'โรงไฟฟ้าพระนครใต้':                                         { root: 'RAW_SAMLE',  ttRoot: 28   }, // 17+7+4
  // ── TR2 (สำแล 17 + TR2→สถานี) ─────────────────────────────────────
  'บริษัท โอสถสภา จำกัด (มหาชน)':                             { root: 'RAW_SAMLE',  ttRoot: 21.5 }, // 17+3+1.5
  'สถานคุ้มครองและพัฒนาอาชีพบ้านเกร็ดตระการ':                 { root: 'RAW_SAMLE',  ttRoot: 25   }, // 17+3+5
  'ศูนย์วิทยาศาสตร์เพื่อการศึกษาแห่งชาติ':                    { root: 'RAW_SAMLE',  ttRoot: 26   }, // 17+4+5
  'สำนักงานประปาสาขาสุขุมวิท-พระโขนง':                        { root: 'RAW_SAMLE',  ttRoot: 23.5 }, // 17+4+2.5
  // ── TR3 (สำแล 17 + TR3→สถานี) ─────────────────────────────────────
  'นิคมอุตสาหกรรมบางพลี':                                      { root: 'RAW_SAMLE',  ttRoot: 35   }, // 17+13+5
  'สถานีตำรวจภูธรคลองด่าน':                                    { root: 'RAW_SAMLE',  ttRoot: 47   }, // 17+30
  'นิคมอุตสาหกรรมบางปู':                                       { root: 'RAW_SAMLE',  ttRoot: 37   }, // 17+13+7
  'มหาวิทยาลัยหัวเฉียวเฉลิมพระเกียรติ (วิทยาเขตบางพลี)':     { root: 'RAW_SAMLE',  ttRoot: 36   }, // 17+13+6
  'บริษัท มหาจักรออโตพาร์ท จำกัด':                            { root: 'RAW_SAMLE',  ttRoot: 39   }, // 17+22
  'สำนักงานประปาสาขามีนบุรี':                                  { root: 'RAW_SAMLE',  ttRoot: 26.5 }, // 17+7+2.5
  'นิคมอุตสาหกรรมบางชัน':                                      { root: 'RAW_SAMLE',  ttRoot: 25.5 }, // 17+7+1.5
  'ศูนย์ไตเทียมเทียนฟ้าประชาการุณย์':                         { root: 'RAW_SAMLE',  ttRoot: 28.5 }, // 17+7+4.5
  'นิคมอุตสาหกรรมลาดกระบัง':                                   { root: 'RAW_SAMLE',  ttRoot: 30   }, // 17+13
  'บริษัท ท่าอากาศยานไทย มหาชน จำกัด (สุวรรณภูมิ)':          { root: 'RAW_SAMLE',  ttRoot: 30   }, // 17+13
  // ── MTR (คลองตะวันตก กม.14 → มหาสวัสดิ์ 23+4=27 + MTR→สถานี) ─────
  'ม.เทคโนโลยีพระจอมเกล้าธนบุรี (วิทยาเขตบางขุนเทียน)':      { root: 'RAW_MAEKLONG', ttRoot: 116.5}, // 100+7+9.5
  'ศูนย์กีฬาเฉลิมพระเกียรติ':                                  { root: 'RAW_MAEKLONG', ttRoot: 110.5}, // 100+7+3.5
  'มหาวิทยาลัยเอเชียอาคเนย์':                                  { root: 'RAW_MAEKLONG', ttRoot: 108.5}, // 100+2+6.5
  'เรือนจำพิเศษธนบุรี':                                         { root: 'RAW_MAEKLONG', ttRoot: 107.5}, // 100+2+5.5
  'ศูนย์พัฒนาการจัดสวัสดิการสังคมผู้สูงอายุบ้านบางแค (บ้านพักคนชราบางแค)': { root: 'RAW_MAEKLONG', ttRoot: 110.5}, // 100+7+3.5
  // ── Dis1 (สำแล 17 + Dis1→สถานี) ───────────────────────────────────
  'สำนักงานประปาสาขานนทบุรี':                                  { root: 'RAW_SAMLE',  ttRoot: 21.5 }, // 17+4.5
  'กองพันทหารสื่อสาร':                                          { root: 'RAW_SAMLE',  ttRoot: 22   }, // 17+5
  'กองพันทหารสื่อสาร กองบัญชาการกองทัพไทย':                   { root: 'RAW_SAMLE',  ttRoot: 22   }, // 17+5
  'โรงเรียนทหารขนส่ง กรมการขนส่งทหารบก':                      { root: 'RAW_SAMLE',  ttRoot: 23   }, // 17+6
  'โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า นนทบุรี':                 { root: 'RAW_SAMLE',  ttRoot: 28.5 }, // 17+11.5
  // ── Dis2 (สำแล 17 + Dis2→สถานี) ───────────────────────────────────
  'โรงพยาบาลภูมิพลอดุลยเดช':                                   { root: 'RAW_SAMLE',  ttRoot: 20.5 }, // 17+3.5
  'โรงพยาบาลซีจีเอช สายไหม':                                   { root: 'RAW_SAMLE',  ttRoot: 27   }, // 17+10
  // ── ธนบุรี (สำแล 44+4=48 + สามเสน→ธนบุรี 2) ──────────────────────
  'โรงพยาบาลศิริราช':                                           { root: 'RAW_SAMLE',  ttRoot: 50   }, // 48+2
  // ── MDIS (คลองตะวันตก กม.14 → มหาสวัสดิ์ 27 + MDIS→สถานี) ────────
  'โรงเรียนราชวินิต นนทบุรี':                                   { root: 'RAW_MAEKLONG', ttRoot: 112 }, // 100+12
  'โรงเรียนตั้งพิรุฬห์ธรรม':                                    { root: 'RAW_MAEKLONG', ttRoot: 106.5}, // 100+6.5
  'โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี) นนทบุรี':              { root: 'RAW_MAEKLONG', ttRoot: 104.5}, // 100+4.5
  'สำนักงานประปาสาขาบางบัวทอง':                                { root: 'RAW_MAEKLONG', ttRoot: 110.5}, // 100+10.5
  'สถานีตำรวจภูธรไทรน้อย':                                     { root: 'RAW_MAEKLONG', ttRoot: 116.5}, // 100+16.5
  // ── สถานีสูบจ่ายน้ำ → RAW source ─────────────────────────────────
  'สถานีสูบจ่ายน้ำลุมพินี':    { root: 'RAW_SAMLE',    ttRoot: 23  }, // 17+6
  'สถานีสูบจ่ายน้ำพหลโยธิน':   { root: 'RAW_SAMLE',    ttRoot: 22  }, // 17+5
  'สถานีสูบจ่ายน้ำสำโรง':       { root: 'RAW_SAMLE',    ttRoot: 24  }, // 17+7
  'สถานีสูบจ่ายน้ำลาดพร้าว':    { root: 'RAW_SAMLE',    ttRoot: 20  }, // 17+3
  'สถานีสูบจ่ายน้ำคลองเตย':     { root: 'RAW_SAMLE',    ttRoot: 21  }, // 17+4
  'สถานีสูบจ่ายน้ำบางพลี':       { root: 'RAW_SAMLE',    ttRoot: 30  }, // 17+13
  'สถานีสูบจ่ายน้ำมีนบุรี':      { root: 'RAW_SAMLE',    ttRoot: 24  }, // 17+7
  'สถานีสูบจ่ายน้ำลาดกระบัง':   { root: 'RAW_SAMLE',    ttRoot: 25  }, // 17+8
  'สถานีสูบจ่ายน้ำราษฎร์บูรณะ': { root: 'RAW_MAEKLONG', ttRoot: 107 }, // 100+7
  'สถานีสูบจ่ายน้ำเพชรเกษม':    { root: 'RAW_MAEKLONG', ttRoot: 102 }, // 100+2
  'สถานีสูบจ่ายน้ำท่าพระ':       { root: 'RAW_MAEKLONG', ttRoot: 107 }, // 100+7
  // ── พระราชวังดุสิต (สามเสน 3 → สำแล 44+4=48 +1) ─────────────────
  'พระราชวังดุสิต สวนจิตรลดา':   { root: 'RAW_SAMLE',    ttRoot: 49  }, // 48+1
  // ── โรงงานบางเขน — source จากน้ำดิบสำแล +13+4=17 ชม. ──────────────
  'สถานีสูบส่งน้ำบางเขน 1 (TR1)':   { root: 'RAW_SAMLE', ttRoot: 17 },
  'สถานีสูบส่งน้ำบางเขน 2 (TR2)':   { root: 'RAW_SAMLE', ttRoot: 17 },
  'สถานีสูบส่งน้ำบางเขน 3 (TR3)':   { root: 'RAW_SAMLE', ttRoot: 17 },
  'สถานีสูบจ่ายน้ำบางเขน 1 (Dis1)': { root: 'RAW_SAMLE', ttRoot: 17 },
  'สถานีสูบจ่ายน้ำบางเขน 2 (Dis2)': { root: 'RAW_SAMLE', ttRoot: 17 },
  // โรงงานสามเสน 1–4 — source จากน้ำดิบสำแล +44+4=48 ชม.
  'โรงงานผลิตน้ำสามเสน 1':          { root: 'RAW_SAMLE', ttRoot: 48 },
  'โรงงานผลิตน้ำสามเสน 2':          { root: 'RAW_SAMLE', ttRoot: 48 },
  'โรงงานผลิตน้ำสามเสน 3':          { root: 'RAW_SAMLE', ttRoot: 48 },
  'โรงงานผลิตน้ำสามเสน 4':          { root: 'RAW_SAMLE', ttRoot: 48 },
  // มหาสวัสดิ์ — source จากคลองตะวันตก กม.14 +23+4=27 ชม.
  'สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)': { root: 'RAW_MAEKLONG', ttRoot: 100 }, // 96+4
  'สถานีสูบจ่ายน้ำมหาสวัสดิ์':      { root: 'RAW_MAEKLONG', ttRoot: 100 }, // 96+4
};
let ROOT_SOURCE_MAP = {};
function buildMarkers() {
  if (typeof updateVcFrc === 'function') updateVcFrc();
  sensorGroup.clearLayers();
  if(!layers.sensors) return;
  // ── ระยะเวลาเดินทางน้ำ (ชม.) UPDATE: 31 มี.ค.68 ────────────────────────────
  // tt_from = เวลาจากโรงงาน/สถานีสูบส่ง → สถานีนี้  (ชม.)
  // tt_label = ป้ายอธิบายต้นทาง
  const TRAVEL_TIME = {
    // rev19: โรงงานบางเขน — source จากน้ำดิบสำแล (คลองประปา 13 ชม. + ผลิต 2 + reservoir 2 = 17 ชม.)
    'สถานีสูบส่งน้ำบางเขน 1 (TR1)':   { tt_from: '17', tt_label: 'จาก สำแล (น้ำดิบ)' },
    'สถานีสูบส่งน้ำบางเขน 2 (TR2)':   { tt_from: '17', tt_label: 'จาก สำแล (น้ำดิบ)' },
    'สถานีสูบส่งน้ำบางเขน 3 (TR3)':   { tt_from: '17', tt_label: 'จาก สำแล (น้ำดิบ)' },
    'สถานีสูบจ่ายน้ำบางเขน 1 (Dis1)': { tt_from: '17', tt_label: 'จาก สำแล (น้ำดิบ)' },
    'สถานีสูบจ่ายน้ำบางเขน 2 (Dis2)': { tt_from: '17', tt_label: 'จาก สำแล (น้ำดิบ)' },
    // rev20: โรงงานสามเสน 1–4 — source จากน้ำดิบสำแล (คลองประปา สำแล→บางเขน→สามเสน 44 ชม. + ผลิต 2 + reservoir 2 = 48 ชม.)
    'โรงงานผลิตน้ำสามเสน 1':          { tt_from: '48', tt_label: 'จาก สำแล (น้ำดิบ)' },
    'โรงงานผลิตน้ำสามเสน 2':          { tt_from: '48', tt_label: 'จาก สำแล (น้ำดิบ)' },
    'โรงงานผลิตน้ำสามเสน 3':          { tt_from: '48', tt_label: 'จาก สำแล (น้ำดิบ)' },
    'โรงงานผลิตน้ำสามเสน 4':          { tt_from: '48', tt_label: 'จาก สำแล (น้ำดิบ)' },
    // rev28: มหาสวัสดิ์ — source จากคลองตะวันตก กม.14 → โรงงานมหาสวัสดิ์ 23 ชม. + ผลิต 2 + reservoir 2 = 27 ชม.
    'สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)': { tt_from: '27', tt_label: 'จาก เขื่อนแม่กลอง' },
    'สถานีสูบจ่ายน้ำมหาสวัสดิ์':      { tt_from: '27', tt_label: 'จาก เขื่อนแม่กลอง' },
    // สถานีสูบจ่ายน้ำ (สจ.) — จากโรงงาน/สถานีสูบส่ง
    'สถานีสูบจ่ายน้ำลุมพินี':          { tt_from: '6',     tt_label: 'จาก TR1' },
    'สถานีสูบจ่ายน้ำพหลโยธิน':         { tt_from: '5',     tt_label: 'จาก TR1' },
    'สถานีสูบจ่ายน้ำสำโรง':             { tt_from: '7',     tt_label: 'จาก TR1' },
    'สถานีสูบจ่ายน้ำลาดพร้าว':          { tt_from: '3',     tt_label: 'จาก TR2' },
    'สถานีสูบจ่ายน้ำคลองเตย':           { tt_from: '4',     tt_label: 'จาก TR2' },
    'สถานีสูบจ่ายน้ำบางพลี':             { tt_from: '12-13', tt_label: 'จาก TR3' },
    'สถานีสูบจ่ายน้ำมีนบุรี':            { tt_from: '7',     tt_label: 'จาก TR3' },
    'สถานีสูบจ่ายน้ำลาดกระบัง':         { tt_from: '7-8',   tt_label: 'จาก TR3' },
    'สถานีสูบจ่ายน้ำราษฎร์บูรณะ':       { tt_from: '6-8',   tt_label: 'จาก MH' },
    'สถานีสูบจ่ายน้ำเพชรเกษม':          { tt_from: '2',     tt_label: 'จาก MH' },
    'สถานีสูบจ่ายน้ำท่าพระ':             { tt_from: '6-8',   tt_label: 'จาก MH' },
    // ปลายสาย/สถานีสาขา — จาก สจ.
    'สำนักงานประปาสาขาทุ่งมหาเมฆ':       { tt_from: '1',     tt_label: 'จาก สจ.ลุมพินี' },
    'บริษัท โอสถสภา จำกัด (มหาชน)':      { tt_from: '1-2',   tt_label: 'จาก สจ.ลาดพร้าว' },
    'สถานคุ้มครองและพัฒนาอาชีพบ้านเกร็ดตระการ': { tt_from: '5', tt_label: 'จาก สจ.ลาดพร้าว' },
    'ศูนย์วิทยาศาสตร์เพื่อการศึกษาแห่งชาติ': { tt_from: '5', tt_label: 'จาก สจ.คลองเตย' },
    'สำนักงานประปาสาขาสุขุมวิท-พระโขนง':          { tt_from: '2-3',   tt_label: 'จาก สจ.คลองเตย' },
    'บริษัท ศิครินทร์ จำกัด (มหาชน) (โรงพยาบาลศิครินทร์)': { tt_from: '4-5', tt_label: 'จาก สจ.สำโรง' },
    'โรงเรียนหาดอมราอักษรลักษณ์วิทยา':   { tt_from: '6-7',   tt_label: 'จาก สจ.สำโรง' },
    'บริษัท เอจีซี แฟลทกลาส (ประเทศไทย) จำกัด (มหาชน)': { tt_from: '3-4', tt_label: 'จาก สจ.สำโรง' },
    'สำนักงานประปาสาขาสมุทรปราการ':       { tt_from: '2-3',   tt_label: 'จาก สจ.สำโรง' },
    'โรงไฟฟ้าพระนครใต้':                  { tt_from: '3-5',   tt_label: 'จาก สจ.สำโรง' },
    'นิคมอุตสาหกรรมบางพลี':              { tt_from: '4-6',   tt_label: 'จาก สจ.บางพลี' },
    'สถานีตำรวจภูธรคลองด่าน':             { tt_from: '17',    tt_label: 'จาก สจ.บางพลี' },
    'นิคมอุตสาหกรรมบางปู':               { tt_from: '6-8',   tt_label: 'จาก สจ.บางพลี' },
    'บริษัท มหาจักรออโตพาร์ท จำกัด':     { tt_from: '15',    tt_label: 'จาก สจ.มีนบุรี' },
    'สำนักงานประปาสาขามีนบุรี':           { tt_from: '2-3',   tt_label: 'จาก สจ.มีนบุรี' },
    'นิคมอุตสาหกรรมบางชัน':              { tt_from: '1-2',   tt_label: 'จาก สจ.มีนบุรี' },
    'ศูนย์ไตเทียมเทียนฟ้าประชาการุณย์':   { tt_from: '4-5',   tt_label: 'จาก สจ.มีนบุรี' },
    'นิคมอุตสาหกรรมลาดกระบัง':           { tt_from: '5',     tt_label: 'จาก สจ.ลาดกระบัง' },
    'บริษัท ท่าอากาศยานไทย มหาชน จำกัด (สุวรรณภูมิ)': { tt_from: '5', tt_label: 'จาก สจ.ลาดกระบัง' },
    'มหาวิทยาลัยหัวเฉียวเฉลิมพระเกียรติ (วิทยาเขตบางพลี)': { tt_from: '5-7',   tt_label: 'จาก สจ.บางพลี' },
    'สำนักงานประปาสาขานนทบุรี':           { tt_from: '4.5',  tt_label: 'จาก Dis1' },
    'กองพันทหารสื่อสาร กองบัญชาการกองทัพไทย':                  { tt_from: '5',    tt_label: 'จาก Dis1' },
    'โรงเรียนทหารขนส่ง กรมการขนส่งทหารบก': { tt_from: '5-7', tt_label: 'จาก Dis1' },
    'โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า นนทบุรี': { tt_from: '11-12', tt_label: 'จาก Dis1' },
    'โรงพยาบาลซีจีเอช สายไหม':            { tt_from: '10',   tt_label: 'จาก Dis2' },
    'โรงพยาบาลภูมิพลอดุลยเดช':            { tt_from: '3.5',  tt_label: 'จาก Dis2' },
    'โรงพยาบาลศิริราช':                   { tt_from: '2',     tt_label: 'จากโรงงานธนบุรี' },
    'พระราชวังดุสิต สวนจิตรลดา':          { tt_from: '1',     tt_label: 'จากโรงงานสามเสน 3' },
    'ม.เทคโนโลยีพระจอมเกล้าธนบุรี (วิทยาเขตบางขุนเทียน)': { tt_from: '8-11', tt_label: 'จาก สจ.ราษฎร์บูรณะ' },
    'ศูนย์กีฬาเฉลิมพระเกียรติ':            { tt_from: '3-4',   tt_label: 'จาก สจ.ราษฎร์บูรณะ' },
    'มหาวิทยาลัยเอเชียอาคเนย์':            { tt_from: '6-7',   tt_label: 'จาก สจ.เพชรเกษม' },
    'เรือนจำพิเศษธนบุรี':                  { tt_from: '5-6',   tt_label: 'จาก สจ.เพชรเกษม' },
    'ศูนย์พัฒนาการจัดสวัสดิการสังคมผู้สูงอายุบ้านบางแค (บ้านพักคนชราบางแค)': { tt_from: '3-4', tt_label: 'จาก สจ.ท่าพระ' },
    'โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี) นนทบุรี': { tt_from: '4.5',  tt_label: 'จาก MDIS' },
    'สำนักงานประปาสาขาบางบัวทอง':         { tt_from: '10.5', tt_label: 'จาก MDIS' },
    'สถานีตำรวจภูธรไทรน้อย':              { tt_from: '16.5', tt_label: 'จาก MDIS' },
    'โรงเรียนราชวินิต นนทบุรี':            { tt_from: '12',   tt_label: 'จาก MDIS' },
    'โรงเรียนตั้งพิรุฬห์ธรรม':             { tt_from: '6-7',   tt_label: 'จาก MDIS' },
  };

  // ── map: tt_label shorthand → ชื่อเต็มของ sensor ต้นทาง ──────────────────
  const SOURCE_MAP = {
    'จาก TR1':              'สถานีสูบส่งน้ำบางเขน 1 (TR1)',
    'จาก TR2':              'สถานีสูบส่งน้ำบางเขน 2 (TR2)',
    'จาก TR3':              'สถานีสูบส่งน้ำบางเขน 3 (TR3)',
    'จาก MH':               'สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)',
    'จาก Dis1':             'สถานีสูบจ่ายน้ำบางเขน 1 (Dis1)',
    'จาก Dis2':             'สถานีสูบจ่ายน้ำบางเขน 2 (Dis2)',
    'จาก MTR':              'สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)',
    'จาก MDIS':             'สถานีสูบจ่ายน้ำมหาสวัสดิ์',
    'จากโรงงานธนบุรี':      'โรงงานผลิตน้ำธนบุรี',
    'จากโรงงานสามเสน 3':   'โรงงานผลิตน้ำสามเสน 3',
    'จาก สจ.ลุมพินี':       'สถานีสูบจ่ายน้ำลุมพินี',
    'จาก สจ.พหลโยธิน':     'สถานีสูบจ่ายน้ำพหลโยธิน',
    'จาก สจ.สำโรง':         'สถานีสูบจ่ายน้ำสำโรง',
    'จาก สจ.ลาดพร้าว':      'สถานีสูบจ่ายน้ำลาดพร้าว',
    'จาก สจ.คลองเตย':       'สถานีสูบจ่ายน้ำคลองเตย',
    'จาก สจ.บางพลี':        'สถานีสูบจ่ายน้ำบางพลี',
    'จาก สจ.มีนบุรี':        'สถานีสูบจ่ายน้ำมีนบุรี',
    'จาก สจ.ลาดกระบัง':     'สถานีสูบจ่ายน้ำลาดกระบัง',
    'จาก สจ.ราษฎร์บูรณะ':   'สถานีสูบจ่ายน้ำราษฎร์บูรณะ',
    'จาก สจ.เพชรเกษม':      'สถานีสูบจ่ายน้ำเพชรเกษม',
    'จาก สจ.ท่าพระ':        'สถานีสูบจ่ายน้ำท่าพระ',
  };

  // ── ROOT_SOURCE_MAP: trace ปลายทาง → root source (โรงงาน/TR/MH/MDIS) ──────
  // key = ชื่อสถานีปลายทาง, value = { rootName, ttTotal (ชม.) }
  // ttTotal = tt จาก สจ. + tt จาก สจ. → root
  ROOT_SOURCE_MAP = window._ROOT_SOURCE_MAP = {
    // สจ. → root โดยตรง (สจ. เป็นปลายทางเอง)
    'สถานีสูบจ่ายน้ำลุมพินี':    { root: 'จาก TR1', ttRoot: 6   },
    'สถานีสูบจ่ายน้ำพหลโยธิน':   { root: 'จาก TR1', ttRoot: 5   },
    'สถานีสูบจ่ายน้ำสำโรง':       { root: 'จาก TR1', ttRoot: 7   },
    'สถานีสูบจ่ายน้ำลาดพร้าว':    { root: 'จาก TR2', ttRoot: 3   },
    'สถานีสูบจ่ายน้ำคลองเตย':     { root: 'จาก TR2', ttRoot: 4   },
    'สถานีสูบจ่ายน้ำบางพลี':       { root: 'จาก TR3', ttRoot: 13  },
    'สถานีสูบจ่ายน้ำมีนบุรี':      { root: 'จาก TR3', ttRoot: 7   },
    'สถานีสูบจ่ายน้ำลาดกระบัง':   { root: 'จาก TR3', ttRoot: 8   },
    'สถานีสูบจ่ายน้ำราษฎร์บูรณะ': { root: 'จาก MTR', ttRoot: 7  },
    'สถานีสูบจ่ายน้ำเพชรเกษม':    { root: 'จาก MTR', ttRoot: 2  },
    'สถานีสูบจ่ายน้ำท่าพระ':      { root: 'จาก MTR', ttRoot: 7  },
    // ปลายทาง monitor → root (tt = tt_สจ. + tt_root)
    'สำนักงานประปาสาขาทุ่งมหาเมฆ':       { root: 'จาก สจ.ลุมพินี', ttRoot: 1   },
    'บริษัท โอสถสภา จำกัด (มหาชน)':      { root: 'จาก สจ.ลาดพร้าว', ttRoot: 1.5 },
    'สถานคุ้มครองและพัฒนาอาชีพบ้านเกร็ดตระการ': { root: 'จาก สจ.ลาดพร้าว', ttRoot: 5  },
    'ศูนย์วิทยาศาสตร์เพื่อการศึกษาแห่งชาติ': { root: 'จาก สจ.คลองเตย', ttRoot: 5  },
    'สำนักงานประปาสาขาสุขุมวิท-พระโขนง':          { root: 'จาก สจ.คลองเตย', ttRoot: 2.5 },
    'บริษัท ศิครินทร์ จำกัด (มหาชน) (โรงพยาบาลศิครินทร์)': { root: 'จาก สจ.สำโรง', ttRoot: 4.5 },
    'โรงเรียนหาดอมราอักษรลักษณ์วิทยา':   { root: 'จาก สจ.สำโรง', ttRoot: 6.5 },
    'บริษัท เอจีซี แฟลทกลาส (ประเทศไทย) จำกัด (มหาชน)': { root: 'จาก สจ.สำโรง', ttRoot: 3.5 },
    'สำนักงานประปาสาขาสมุทรปราการ':       { root: 'จาก สจ.สำโรง', ttRoot: 2.5 },
    'โรงไฟฟ้าพระนครใต้':                  { root: 'จาก สจ.สำโรง', ttRoot: 4.0 },
    'นิคมอุตสาหกรรมบางพลี':              { root: 'จาก สจ.บางพลี', ttRoot: 5.0 },
    'สถานีตำรวจภูธรคลองด่าน':             { root: 'จาก สจ.บางพลี', ttRoot: 17.0 },
    'นิคมอุตสาหกรรมบางปู':               { root: 'จาก สจ.บางพลี', ttRoot: 7.0  },
    'บริษัท มหาจักรออโตพาร์ท จำกัด':     { root: 'จาก สจ.มีนบุรี', ttRoot: 15.0 },
    'สำนักงานประปาสาขามีนบุรี':           { root: 'จาก สจ.มีนบุรี', ttRoot: 2.5 },
    'นิคมอุตสาหกรรมบางชัน':              { root: 'จาก สจ.มีนบุรี', ttRoot: 1.5  },
    'ศูนย์ไตเทียมเทียนฟ้าประชาการุณย์':   { root: 'จาก สจ.มีนบุรี', ttRoot: 4.5  },
    'นิคมอุตสาหกรรมลาดกระบัง':           { root: 'จาก สจ.ลาดกระบัง', ttRoot: 5.0 },
    'บริษัท ท่าอากาศยานไทย มหาชน จำกัด (สุวรรณภูมิ)': { root: 'จาก สจ.ลาดกระบัง', ttRoot: 5.0 },
    'มหาวิทยาลัยหัวเฉียวเฉลิมพระเกียรติ (วิทยาเขตบางพลี)': { root: 'จาก สจ.บางพลี', ttRoot: 6.0 },
    'สำนักงานประปาสาขานนทบุรี':           { root: 'จาก Dis1', ttRoot: 4.5 },
    'กองพันทหารสื่อสาร กองบัญชาการกองทัพไทย':                  { root: 'จาก Dis1', ttRoot: 5   },
    'โรงเรียนทหารขนส่ง กรมการขนส่งทหารบก': { root: 'จาก Dis1', ttRoot: 6   },
    'โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า นนทบุรี': { root: 'จาก Dis1', ttRoot: 11.5 },
    'โรงพยาบาลซีจีเอช สายไหม':            { root: 'จาก Dis2', ttRoot: 10  },
    'โรงพยาบาลภูมิพลอดุลยเดช':            { root: 'จาก Dis2', ttRoot: 3.5 },
    'โรงพยาบาลศิริราช':                   { root: 'จากโรงงานธนบุรี',   ttRoot: 2  },
    'พระราชวังดุสิต สวนจิตรลดา':          { root: 'จากโรงงานสามเสน 3', ttRoot: 1  },
    'ม.เทคโนโลยีพระจอมเกล้าธนบุรี (วิทยาเขตบางขุนเทียน)': { root: 'จาก สจ.ราษฎร์บูรณะ', ttRoot: 9.5 },
    'ศูนย์กีฬาเฉลิมพระเกียรติ':            { root: 'จาก สจ.ราษฎร์บูรณะ', ttRoot: 3.5 },
    'มหาวิทยาลัยเอเชียอาคเนย์':            { root: 'จาก สจ.เพชรเกษม', ttRoot: 6.5 },
    'เรือนจำพิเศษธนบุรี':                  { root: 'จาก สจ.เพชรเกษม', ttRoot: 5.5 },
    'ศูนย์พัฒนาการจัดสวัสดิการสังคมผู้สูงอายุบ้านบางแค (บ้านพักคนชราบางแค)': { root: 'จาก สจ.ท่าพระ', ttRoot: 3.5 },
    'โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี) นนทบุรี': { root: 'จาก MDIS', ttRoot: 4.5 },
    'สำนักงานประปาสาขาบางบัวทอง':         { root: 'จาก MDIS', ttRoot: 10.5 },
    'สถานีตำรวจภูธรไทรน้อย':              { root: 'จาก MDIS', ttRoot: 16.5 },
    'โรงเรียนราชวินิต นนทบุรี':            { root: 'จาก MDIS', ttRoot: 12.0 },
    'โรงเรียนตั้งพิรุฬห์ธรรม':             { root: 'จาก MDIS', ttRoot: 6.5 },
  };

  // ── parse travel time → ค่าตัวเลข (ใช้ค่าสูงสุดของช่วง) ──────────────
  function parseTTmax(str) {
    if (!str) return null;
    const m = String(str).match(/(\d+(?:\.\d+)?)/g);
    if (!m) return null;
    return parseFloat(m[m.length - 1]);
  }

  // ── สร้างกราฟ decay SVG ──────────────────────────────────────────────
  // ── EC Forecast Chart ────────────────────────────────────────────────────────
  // ช่วง 1 (เส้นทึบ): EC ปัจจุบันของสถานีนี้ → คงที่ตลอด tt ชม. (EC ไม่ decay ตามระยะ)
  // ช่วง 2 (เส้นปะ): น้ำชุดใหม่จากต้นทาง → EC ของสถานีต้นทาง ± confidence band

  function smoothPath(pts, pxFn, pyFn) {
    // Filter out points with NaN/null/undefined values
    const valid = pts.filter(p => p && isFinite(p.t) && isFinite(p.f));
    if (valid.length === 0) return '';
    if (valid.length === 1) return `M${pxFn(valid[0].t).toFixed(1)},${pyFn(valid[0].f).toFixed(1)}`;
    let d = `M${pxFn(valid[0].t).toFixed(1)},${pyFn(valid[0].f).toFixed(1)}`;
    for (let i = 1; i < valid.length; i++) {
      const x0 = pxFn(valid[i-1].t), y0 = pyFn(valid[i-1].f);
      const x1 = pxFn(valid[i].t),   y1 = pyFn(valid[i].f);
      const cpx = (x0 + x1) / 2;
      d += ` C${cpx.toFixed(1)},${y0.toFixed(1)} ${cpx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
  }

  function buildEcForecastChart(ecSource, sourceName, ttHours, sensorId, ecNow, srcId, opts) {
    // opts = { band: 0.10, rwHistKey: 'S1' or 'S11' } — raw water history key
    const bandPct   = (opts && opts.band != null) ? opts.band : 0.10;
    const rwHistKey = (opts && opts.rwHistKey) || null;
    if (!ttHours || ttHours <= 0) return '';
    const ec0 = (ecNow != null && ecNow > 0) ? ecNow : ecSource;
    const W = Math.min(420, (window.innerWidth||420)*0.82), H = Math.min(220, W*0.52), PL = 30, PR = 14, PT = 22, PB = 52;
    const cw = W - PL - PR, ch = H - PT - PB;
    const now = new Date();
    const nowMs = now.getTime();
    const nowHr = now.getHours() + now.getMinutes() / 60;

    // ── 24h ย้อนหลัง + คาดการณ์ถึง ttHours ──
    const HIST_WIN = 24;   // x-axis ย้อนหลัง 24hr
    const DATA_WIN = 240;  // rev29.1: filter ข้อมูล 10 วัน (ครอบคลุม ttRoot ฝั่งตะวันตก 100+ ชม.)
    // rev22: FORE_WIN dynamic — ขยายตาม ttHours (min 24, max 72)
    const FORE_WIN = Math.min(72, Math.max(24, Math.ceil(ttHours / 6) * 6 + 6));
    const totalT = HIST_WIN + FORE_WIN;
    const steps = 60;

    const ecH = loadHistory();
    const destKey = sensorId?.toString();
    const destHist = (ecH[destKey] || [])
      .filter(p => p.ts >= nowMs - DATA_WIN * 3600000 && p.ec != null && p.ec > 0)
      .sort((a, b) => a.ts - b.ts);

    // candlePts: จุดที่มี hi/lo (จาก TWQ) → แสดงเป็น candlestick
    // linePts: จุดที่มีแค่ค่าเดียว (จาก live API) → แสดงเป็นจุด
    const candlePts = destHist
      .filter(p => p.ecHi != null && p.ecLo != null)
      .map(p => ({ t: -(nowMs - p.ts)/3600000, f: p.ec, hi: p.ecHi, lo: p.ecLo }))
      .filter(p => p.t >= -HIST_WIN && p.t < 0);

    const destPts = destHist.map(p => ({
      t: -(nowMs - p.ts) / 3600000,
      f: p.ec
    })).filter(p => p.t >= -HIST_WIN && p.t < 0 && p.f != null);

    const pts1 = destPts.length >= 1 ? [...destPts.sort((a,b) => a.t - b.t)] : [];
    pts1.push({ t: 0, f: ec0 });

    // rev22: EC forecast ใช้ history ของน้ำดิบ shifted ตาม travel time
    // น้ำที่ถึงสถานี ณ เวลา (now + t) ออกจากต้นทาง ณ เวลา (now + t - ttHours)
    // ดังนั้น forecast EC ที่เวลา t = EC น้ำดิบ ณ (now + t - ttHours)
    const foreSteps = Math.round(steps * ttHours / FORE_WIN);
    const pts2 = [];

    // ดึง raw water history
    let rwHist = [];
    if (rwHistKey) {
      const rwH = rwHistKey === 'S1' ? (window._rawWaterHistory || {}) : (window._mkRawWaterHistory || {});
      rwHist = (rwH[rwHistKey] || []).filter(p => p.ec != null && p.ec > 0).sort((a,b) => a.ts - b.ts);
    }
    // rev29.1: debug — ตรวจว่า history ครอบคลุม ttHours หรือไม่
    if (rwHist.length > 0) {
      const coverageHrs = ((nowMs - rwHist[0].ts) / 3600000).toFixed(1);
      const neededHrs = ttHours.toFixed ? ttHours.toFixed(1) : ttHours;
      if (parseFloat(coverageHrs) < ttHours) {
        console.warn(`[EC Forecast] ⚠️ ${rwHistKey} history covers ${coverageHrs}h but ttRoot needs ${neededHrs}h — forecast may be flat for early portion`);
      }
    }

    // helper: interpolate EC from history at given timestamp
    // rev29.1: ถ้า timestamp ห่างจากขอบ history มากกว่า 12 ชม. → ใช้ ecSource แทน
    //          (ป้องกันค่าค้างกรณี history ยังสะสมไม่ครบ ttRoot)
    const HIST_GAP_LIMIT = 12 * 3600000; // 12 ชม.
    function getRwEcAt(ts) {
      if (rwHist.length === 0) return ecSource;
      if (ts <= rwHist[0].ts) {
        return (rwHist[0].ts - ts > HIST_GAP_LIMIT) ? ecSource : rwHist[0].ec;
      }
      if (ts >= rwHist[rwHist.length-1].ts) {
        return (ts - rwHist[rwHist.length-1].ts > HIST_GAP_LIMIT) ? ecSource : rwHist[rwHist.length-1].ec;
      }
      // interpolate
      for (let i = 1; i < rwHist.length; i++) {
        if (rwHist[i].ts >= ts) {
          const p0 = rwHist[i-1], p1 = rwHist[i];
          const frac = (ts - p0.ts) / (p1.ts - p0.ts);
          return p0.ec + (p1.ec - p0.ec) * frac;
        }
      }
      return ecSource;
    }

    for (let i = 0; i <= foreSteps; i++) {
      const t = (i / foreSteps) * ttHours;
      // น้ำที่ถึงสถานี ณ now+t ออกจากต้นทาง ณ now+t-ttHours
      const srcTs = nowMs + (t - ttHours) * 3600000;
      const ecVal = getRwEcAt(srcTs);
      pts2.push({ t, f: ecVal });
    }

    const BAND = bandPct;
    // แกน Y คงที่ 0–500 μS/cm
    const yMax = (typeof EC_CONFIG !== 'undefined' && EC_CONFIG.yMax) ? EC_CONFIG.yMax : 400;
    const yMin = (typeof EC_CONFIG !== 'undefined' && EC_CONFIG.yMin != null) ? EC_CONFIG.yMin : 0;

    function px(t) { return PL + ((t + HIST_WIN) / totalT) * cw; }
    function py(f) { return PT + (1 - (f - yMin) / (yMax - yMin)) * ch; }
    function pyClamp(f) { return Math.max(PT, Math.min(PT+ch, py(f))); }

    const pathSolid = smoothPath(pts1, px, py);
    const pathDash  = smoothPath(pts2, px, py);
    const fillDash  = pathDash+' L'+px(ttHours).toFixed(1)+','+(PT+ch).toFixed(1)+' L'+px(0).toFixed(1)+','+(PT+ch).toFixed(1)+' Z';

    const xNow = px(0);
    const xTTend  = px(ttHours);
    const xForeEnd = px(FORE_WIN);
    const ecEnd = pts2[pts2.length-1].f;
    const endColor = ecEnd >= EC_CONFIG.hi ? '#b32800' : ecEnd >= EC_CONFIG.lo ? '#1565c0' : '#40b0e0';
    const ex2 = px(ttHours), ey2 = py(ecEnd);

    const yLo = py(EC_CONFIG.lo), yHi = py(EC_CONFIG.hi);
    function inR(v) { return v > yMin && v < yMax; }
    let stdLines = '';
    if (inR(EC_CONFIG.lo)) stdLines += '<line x1="'+PL+'" y1="'+yLo.toFixed(1)+'" x2="'+(PL+cw).toFixed(1)+'" y2="'+yLo.toFixed(1)+'" stroke="#1a7ab0" stroke-width="1" stroke-dasharray="3,2" opacity="0.7"/>';
    if (inR(EC_CONFIG.hi)) stdLines += '<line x1="'+PL+'" y1="'+yHi.toFixed(1)+'" x2="'+(PL+cw).toFixed(1)+'" y2="'+yHi.toFixed(1)+'" stroke="#b32800" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>';
    let stdLabels = '';
    if (inR(EC_CONFIG.lo) && yLo > PT+4 && yLo < PT+ch-2) stdLabels += '<text x="'+(PL+1).toFixed(1)+'" y="'+(yLo-2).toFixed(1)+'" font-size="9" fill="#1a7ab0" font-family="JetBrains Mono,monospace">'+EC_CONFIG.lo+'</text>';
    if (inR(EC_CONFIG.hi) && yHi > PT+4 && yHi < PT+ch-2) stdLabels += '<text x="'+(PL+1).toFixed(1)+'" y="'+(yHi-2).toFixed(1)+'" font-size="9" fill="#b32800" font-family="JetBrains Mono,monospace">'+EC_CONFIG.hi+'</text>';

    const yTickValsEc = [];
    const yRangeEc = yMax - yMin;
    const yStepEc = yRangeEc <= 100 ? 20 : yRangeEc <= 300 ? 50 : 100;
    const yStartEc = Math.ceil(yMin / yStepEc) * yStepEc;
    for (let v = yStartEc; v <= yMax*1.01; v += yStepEc) yTickValsEc.push(Math.round(v));
    let yLabels = '<text transform="rotate(-90)" x="'+(-(PT+ch/2)).toFixed(1)+'" y="11" font-size="9" font-weight="bold" fill="#6090c0" text-anchor="middle" font-family="Sarabun,sans-serif">\u03bcS/cm</text>';
    for (const v of yTickValsEc) {
      const y = py(v);
      if (y < PT-2 || y > PT+ch+2) continue;
      yLabels += '<line x1="'+(PL-3).toFixed(1)+'" y1="'+y.toFixed(1)+'" x2="'+PL+'" y2="'+y.toFixed(1)+'" stroke="#c0d8f0" stroke-width="0.8"/>';
      yLabels += '<text x="'+(PL-5).toFixed(1)+'" y="'+(y+3).toFixed(1)+'" font-size="9" font-weight="bold" fill="'+(document.body.classList.contains('dark')?'#c0c0e0':'#222')+'" text-anchor="end" font-family="JetBrains Mono,monospace">'+v+'</text>';
    }

    function toHHMM(hr) {
      const h = Math.floor(((hr % 24) + 24) % 24);
      const m = Math.round((hr % 1) * 60) % 60;
      return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
    }
    // rev22: แสดงวันที่บน x-axis เมื่อข้ามวัน
    function toDateLabel(tOffset) {
      const d = new Date(nowMs + tOffset * 3600000);
      const dd = d.getDate();
      const mmNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      return dd + ' ' + mmNames[d.getMonth()];
    }

    // hourly ticks -24h → +24h
    const hourTicksEc = [];
    const startHrEc = Math.ceil(nowHr - HIST_WIN);
    for (let hh = startHrEc; hh <= nowHr + FORE_WIN; hh++) {
      const t = hh - nowHr;
      if (t >= -HIST_WIN && t <= FORE_WIN) hourTicksEc.push({ t, hr: hh });
    }
    const MIN_TICK_PX = 28;
    let lastXEc = -999;
    const visibleTicksEc = [];
    for (const tick of hourTicksEc) {
      const x = px(tick.t);
      if (x >= PL+10 && x <= PL+cw-8 && x - lastXEc >= MIN_TICK_PX) {
        visibleTicksEc.push(tick); lastXEc = x;
      }
    }

    let hourlyMarksEc = '';
    let lastDateStr = '';
    for (const { t } of visibleTicksEc) {
      const x = px(t);
      const isFuture = t > 0;
      const beyondFore = t > ttHours;
      const isNowTick = Math.abs(t) < 0.05;
      let ecVal = null, showDot = true;
      if (!isFuture) {
        const ptNear = pts1.reduce((a,b) => Math.abs(b.t-t)<Math.abs(a.t-t)?b:a, pts1[0]);
        ecVal = ptNear ? ptNear.f : null;
      } else if (!beyondFore) {
        const ptNear2 = pts2.reduce((a,b) => Math.abs(b.t-t)<Math.abs(a.t-t)?b:a, pts2[0]);
        ecVal = ptNear2 ? ptNear2.f : null;
      } else {
        showDot = false;
      }
      const _dkMark = document.body.classList.contains('dark');
      const ecColor  = ecVal != null ? (ecVal >= EC_CONFIG.hi ? (_dkMark?'#ff6666':'#b32800') : ecVal >= EC_CONFIG.lo ? (_dkMark?'#4ea8de':'#1565c0') : (_dkMark?'#6dd5fa':'#40b0e0')) : '#bbb';
      const cy = ecVal != null ? pyClamp(ecVal) : PT + ch/2;
      const lineColor = isNowTick ? '#1565c0' : beyondFore ? '#ccc' : isFuture ? '#4060c0' : '#b0c8e8';
      const sw = isNowTick ? 1.5 : 0.7;
      const r  = isNowTick ? 3.5 : isFuture ? 2.5 : 3;
      const tColor = beyondFore ? '#bbb' : isFuture ? '#4060a0' : '#6090c0';
      // rev22: แสดงวันที่เมื่อข้ามวัน
      const curDateStr = toDateLabel(t);
      const showDate = curDateStr !== lastDateStr;
      if (showDate) lastDateStr = curDateStr;
      const tickLabel = toHHMM(nowHr+t) + (showDate ? '\\n' + curDateStr : '');
      hourlyMarksEc +=
        (isNowTick?'<line x1="'+x.toFixed(1)+'" y1="'+PT+'" x2="'+x.toFixed(1)+'" y2="'+(PT+ch).toFixed(1)+'" stroke="'+lineColor+'" stroke-width="'+sw+'" stroke-dasharray="2,3" opacity="0.8"/>':'')
       
       +'<text transform="rotate(-90,'+x.toFixed(1)+','+(PT+ch+32).toFixed(1)+')" x="'+x.toFixed(1)+'" y="'+(PT+ch+32).toFixed(1)+'" font-size="9" font-weight="bold" fill="'+(document.body.classList.contains('dark')?'#c0c0e0':'#222')+'" text-anchor="start" font-family="JetBrains Mono,monospace">'+toHHMM(nowHr+t)+'</text>'
       +(showDate ? '<text x="'+x.toFixed(1)+'" y="'+(PT+ch+48).toFixed(1)+'" font-size="8" font-weight="700" fill="'+(document.body.classList.contains('dark')?'#80b0e0':'#1565c0')+'" text-anchor="middle" font-family="Sarabun,sans-serif">'+curDateStr+'</text>' : '');
    }

    const endStatus = ecEnd >= EC_CONFIG.hi ? '⚠ เกินมาตรฐาน' : ecEnd >= EC_CONFIG.lo ? '✓ ปกติ' : '↓ ต่ำ';
    const hasHistory = destHist.length >= 1;

    // แรเงาเทาช่วง ttHours → FORE_WIN — removed for cleaner look
    const beyondW = xForeEnd - xTTend;
    const beyondZoneEc = '';

    return '<div style="margin-top:8px;border-top:1px solid '+(document.body.classList.contains('dark')?'rgba(255,255,255,.08)':'#d0e8f8')+';padding-top:7px;overflow:hidden;max-width:100%;">'
      +'<div style="font-size:9.5px;font-weight:700;color:'+(document.body.classList.contains('dark')?'#80c0ff':'#1040a0')+';letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px;">📈 คาดการณ์ EC ล่วงหน้า <span style="font-size:9px;font-weight:600;color:'+(document.body.classList.contains('dark')?'#90b8ff':'#4060c0')+';text-transform:none;letter-spacing:0;background:'+(document.body.classList.contains('dark')?'rgba(80,140,255,.1)':'#e8eeff')+';border-radius:4px;padding:1px 6px;margin-left:4px;">← '+sourceName+'</span></div>'
      +'<div style="font-size:9px;color:'+(document.body.classList.contains('dark')?'#90b8d8':'#6090c0')+';margin-bottom:4px;">'
      +'ปัจจุบัน '+Math.round(ec0)+' μS/cm · คาดการณ์ '+Math.round(ecEnd)+' (ถึง +'+ttHours+'ชม.)'
      +(opts && opts.detail ? '<br><span style="font-size:8.5px;color:'+(document.body.classList.contains('dark')?'#70a8d8':'#2255a0')+'">📐 '+opts.detail+'</span>' : '')
      +(hasHistory ? ' · <span style="color:'+(document.body.classList.contains('dark')?'#60dd80':'#006020')+'">✅ ข้อมูลจริง '+destHist.length+' จุด</span>' : ' · <span style="color:'+(document.body.classList.contains('dark')?'#e0c060':'#a06000')+'">⏳ รอสะสมข้อมูล</span>')
      +'</div>'
      +'<svg width="'+W+'" height="'+H+'" style="display:block;overflow:visible;max-width:100%;height:auto;" viewBox="0 0 '+W+' '+H+'">'
      +'<defs><clipPath id="ecclip_'+sensorId+'"><rect x="'+PL+'" y="'+PT+'" width="'+cw+'" height="'+ch+'"/></clipPath></defs>'
      +'<rect x="'+PL+'" y="'+PT+'" width="'+cw+'" height="'+ch+'" fill="'+(document.body.classList.contains('dark')?'rgba(20,20,40,.85)':'#fafbff')+'" rx="3"/>'
      +'<rect x="'+xNow.toFixed(1)+'" y="'+PT+'" width="'+(xTTend-xNow).toFixed(1)+'" height="'+ch+'" fill="'+(document.body.classList.contains('dark')?'rgba(30,80,160,.12)':'rgba(30,80,200,.06)')+'" opacity="0.5"/>'
      +beyondZoneEc
      +stdLines+stdLabels
      +'<path d="'+smoothPath(pts1,px,py)+'" fill="none" stroke="'+(document.body.classList.contains('dark')?'#4ea8de':'#1565c0')+'" stroke-width="2" stroke-linejoin="round" clip-path="url(#ecclip_'+sensorId+')"/>'
      +pts1.map(p=>'<circle cx="'+px(p.t).toFixed(1)+'" cy="'+py(p.f).toFixed(1)+'" r="2.5" fill="'+(document.body.classList.contains('dark')?'#4ea8de':'#1565c0')+'" stroke="'+(document.body.classList.contains('dark')?'rgba(255,255,255,.3)':'#fff')+'" stroke-width="1" clip-path="url(#ecclip_'+sensorId+')"/>').join('')
      +(()=>{
        // Confidence Band ±10% — rev22: เพิ่มความชัด
        const _dkEC = document.body.classList.contains('dark');
        const pts2hi = pts2.map(p => ({ t:p.t, f:p.f*(1+BAND) }));
        const pts2lo = pts2.map(p => ({ t:p.t, f:Math.max(0, p.f*(1-BAND)) }));
        let bandD = 'M'+px(pts2hi[0].t).toFixed(1)+','+pyClamp(pts2hi[0].f).toFixed(1);
        for (let i=1;i<pts2hi.length;i++) bandD += ' L'+px(pts2hi[i].t).toFixed(1)+','+pyClamp(pts2hi[i].f).toFixed(1);
        for (let i=pts2lo.length-1;i>=0;i--) bandD += ' L'+px(pts2lo[i].t).toFixed(1)+','+pyClamp(pts2lo[i].f).toFixed(1);
        bandD += ' Z';
        const hiPath = 'M'+pts2hi.map(p=>px(p.t).toFixed(1)+','+pyClamp(p.f).toFixed(1)).join(' L');
        const loPath = 'M'+pts2lo.map(p=>px(p.t).toFixed(1)+','+pyClamp(p.f).toFixed(1)).join(' L');
        return '<path d="'+bandD+'" fill="'+(_dkEC?'#4ecca3':'#81c784')+'" opacity="'+(_dkEC?'0.28':'0.22')+'" stroke="none" clip-path="url(#ecclip_'+sensorId+')"/>'
          +'<path d="'+hiPath+'" fill="none" stroke="'+(_dkEC?'#4ecca3':'#43a047')+'" stroke-width="'+(_dkEC?'1.5':'1.2')+'" opacity="'+(_dkEC?'0.8':'0.6')+'" stroke-dasharray="4,2" clip-path="url(#ecclip_'+sensorId+')"/>'
          +'<path d="'+loPath+'" fill="none" stroke="'+(_dkEC?'#4ecca3':'#43a047')+'" stroke-width="'+(_dkEC?'1.5':'1.2')+'" opacity="'+(_dkEC?'0.8':'0.6')+'" stroke-dasharray="4,2" clip-path="url(#ecclip_'+sensorId+')"/>'
          +'<path d="'+smoothPath(pts2,px,py)+'" fill="none" stroke="'+(_dkEC?'#80b0ff':'#4060c0')+'" stroke-width="1.8" stroke-dasharray="5,3" stroke-linejoin="round" clip-path="url(#ecclip_'+sensorId+')"/>';
      })()
      // rev19: เส้น forecast น้ำดิบจากสำแล (เส้นประแดง) สำหรับ SP01-SP05
      +(()=>{
        const rw = window._rawWaterEc;
        const bangkhenIds = ['SP01','SP02','SP03','SP04','SP05','SP07','SP08','SP09','SP10','1','2','3','4','5','7','8','9','10'];
        if (!rw || !rw.ec || !bangkhenIds.includes(String(sensorId))) return '';
        const rwEc = rw.ec;
        const samsenIds = ['SP07','SP08','SP09','SP10','7','8','9','10'];
        const isSamsen = samsenIds.includes(String(sensorId));
        const rwTT = isSamsen ? 44 : (rw.travelHours || 13);
        const rwLabel = isSamsen ? '🌊 สำแล→สามเสน +'+rwTT+'ชม.' : '🌊 สำแล→บางเขน +'+rwTT+'ชม.';
        const _dk = document.body.classList.contains('dark');
        // เส้นแนวนอนแสดง EC น้ำดิบที่จะถึง ที่ t = rwTT
        const yRw = pyClamp(rwEc);
        const xStart = px(0);  // จาก "ตอนนี้"
        const xEnd = px(rwTT); // ถึงใน rwTT ชม.
        const xEndClamped = Math.min(xEnd, PL + cw);
        // เส้นประแดง
        let rwSvg = '<line x1="'+xStart.toFixed(1)+'" y1="'+yRw.toFixed(1)+'" x2="'+xEndClamped.toFixed(1)+'" y2="'+yRw.toFixed(1)+'" stroke="'+(_dk?'#ff6666':'#cc0055')+'" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.8" clip-path="url(#ecclip_'+sensorId+')"/>';
        // จุดที่ถึง
        if (xEnd <= PL + cw) {
          rwSvg += '<circle cx="'+xEnd.toFixed(1)+'" cy="'+yRw.toFixed(1)+'" r="4" fill="'+(_dk?'#ff6666':'#cc0055')+'" stroke="#fff" stroke-width="1.5" clip-path="url(#ecclip_'+sensorId+')"/>';
          rwSvg += '<text x="'+(xEnd+5).toFixed(1)+'" y="'+(yRw-4).toFixed(1)+'" font-size="9" font-weight="700" fill="'+(_dk?'#ff8888':'#cc0055')+'" font-family="JetBrains Mono,monospace" clip-path="url(#ecclip_'+sensorId+')">น้ำดิบ '+rwEc+'</text>';
        }
        // ป้ายกำกับ
        // annotation text removed (rev27)
        return rwSvg;
      })()
      // rev20: เส้น forecast น้ำดิบจากเขื่อนแม่กลอง (เส้นประเขียว) สำหรับ SP11/SP12
      +(()=>{
        const mkData = window._mkRawWaterData;
        const mkIds = ['SP11','SP12','11','12'];
        if (!mkData || !mkData['S11'] || !mkData['S11'].ec || !mkIds.includes(String(sensorId))) return '';
        const mkEc = mkData['S11'].ec;
        const mkTT = 48;
        const _dk = document.body.classList.contains('dark');
        const yMk = pyClamp(mkEc);
        const xStart = px(0);
        const xEnd = px(mkTT);
        const xEndClamped = Math.min(xEnd, PL + cw);
        // เส้นประเขียว
        let mkSvg = '<line x1="'+xStart.toFixed(1)+'" y1="'+yMk.toFixed(1)+'" x2="'+xEndClamped.toFixed(1)+'" y2="'+yMk.toFixed(1)+'" stroke="'+(_dk?'#60d0a0':'#0a6050')+'" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.8" clip-path="url(#ecclip_'+sensorId+')"/>';
        if (xEnd <= PL + cw) {
          mkSvg += '<circle cx="'+xEnd.toFixed(1)+'" cy="'+yMk.toFixed(1)+'" r="4" fill="'+(_dk?'#60d0a0':'#0a6050')+'" stroke="#fff" stroke-width="1.5" clip-path="url(#ecclip_'+sensorId+')"/>';
          mkSvg += '<text x="'+(xEnd+5).toFixed(1)+'" y="'+(yMk-4).toFixed(1)+'" font-size="9" font-weight="700" fill="'+(_dk?'#80e0b0':'#0a6050')+'" font-family="JetBrains Mono,monospace" clip-path="url(#ecclip_'+sensorId+')">น้ำดิบ '+mkEc+'</text>';
        }
        // annotation text removed (rev27)
        return mkSvg;
      })()
      +'<line x1="'+xNow.toFixed(1)+'" y1="'+PT+'" x2="'+xNow.toFixed(1)+'" y2="'+(PT+ch).toFixed(1)+'" stroke="'+(document.body.classList.contains('dark')?'#80b0ff':'#1565c0')+'" stroke-width="1.5" opacity="0.5"/>'
      +'<text x="'+xNow.toFixed(1)+'" y="'+(PT-3).toFixed(1)+'" font-size="9" font-weight="bold" fill="'+(document.body.classList.contains('dark')?'#80b0ff':'#1565c0')+'" text-anchor="middle" font-family="Sarabun,sans-serif">ตอนนี้</text>'
      +'<line x1="'+PL+'" y1="'+PT+'" x2="'+PL+'" y2="'+(PT+ch).toFixed(1)+'" stroke="#c0d8f0" stroke-width="1"/>'
      +'<line x1="'+PL+'" y1="'+(PT+ch).toFixed(1)+'" x2="'+(PL+cw).toFixed(1)+'" y2="'+(PT+ch).toFixed(1)+'" stroke="#c0d8f0" stroke-width="1"/>'
      +yLabels+hourlyMarksEc
      +'<g id="chart-tt-'+sensorId+'" style="display:none;pointer-events:none;">'
      +'<line id="chart-tt-line-'+sensorId+'" x1="0" y1="'+PT+'" x2="0" y2="'+(PT+ch)+'" stroke="#666" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>'
      +'<rect id="chart-tt-bg-'+sensorId+'" rx="4" ry="4" fill="rgba(10,20,50,0.82)" width="120" height="36"/>'
      +'<text id="chart-tt-val-'+sensorId+'" font-size="12" font-weight="700" fill="#fff" font-family="JetBrains Mono,monospace" x="8" y="15"></text>'
      +'<text id="chart-tt-time-'+sensorId+'" font-size="10" fill="#c8ddff" font-family="Sarabun,sans-serif" x="8" y="29"></text>'
      +'</g>'
      +'<rect x="'+PL+'" y="'+PT+'" width="'+cw+'" height="'+ch+'" fill="transparent"'
      +' onmousemove="chartHover(event,\''+sensorId+'\','+PL+','+cw+','+HIST_WIN+','+totalT+','+yMin+','+yMax+','+PT+','+ch+',['+[...pts1,...pts2].map(p=>'['+p.t.toFixed(3)+','+p.f.toFixed(2)+']').join(',')+'],\'ec\')"'
      +' onmouseleave="document.getElementById(\'chart-tt-'+sensorId+'\').style.display=\'none\'"'
      +' ontouchmove="chartHover(event.touches[0],\''+sensorId+'\','+PL+','+cw+','+HIST_WIN+','+totalT+','+yMin+','+yMax+','+PT+','+ch+',['+[...pts1,...pts2].map(p=>'['+p.t.toFixed(3)+','+p.f.toFixed(2)+']').join(',')+'],\'ec\')"'
      +' ontouchend="document.getElementById(\'chart-tt-'+sensorId+'\').style.display=\'none\'"'
      +'/>'
      +'</svg>'
      +'<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-top:4px;font-family:\'JetBrains Mono\',monospace;">'
      +'<span><span style="color:#1565c0">— จริง</span>&nbsp;&nbsp;<span style="color:#4060c0">- - คาดการณ์</span>&nbsp;&nbsp;<span style="color:#43a047">▓ Confidence band ±'+Math.round(BAND*100)+'%</span>'
      +(window._rawWaterEc && opts && opts.rootKey === 'RAW_SAMLE' ? '&nbsp;&nbsp;<span style="color:#cc0055">- - น้ำดิบสำแล</span>' : '')
      +(window._mkRawWaterData && window._mkRawWaterData['S11'] && opts && opts.rootKey === 'RAW_MAEKLONG' ? '&nbsp;&nbsp;<span style="color:#0a6050">- - เขื่อนแม่กลอง</span>' : '')
      +'</span>'
      +'<span style="color:'+endColor+';font-weight:700">'+endStatus+' ที่ '+toHHMM(nowHr+ttHours)+'</span>'
      +'</div></div>';
  }

  function buildDecayChart(frcSource, sourceName, ttHours, sensorId, frcNow, srcId, sensorName) {
      if (!ttHours || ttHours <= 0) return '';
      const frc0 = (frcNow != null && frcNow > 0) ? frcNow : frcSource;
      const W = Math.min(420, (window.innerWidth||420)*0.82), H = Math.min(220, W*0.52), PL = 30, PR = 14, PT = 22, PB = 52;
      const cw = W - PL - PR, ch = H - PT - PB;
      const k_hr = getStationKhr(sensorId);

      const now = new Date();
      const nowMs = now.getTime();
      const nowHr = now.getHours() + now.getMinutes() / 60;

      // ── คงที่ 24h ย้อนหลัง + 24h ล่วงหน้า ──
      const HIST_WIN = 24;   // x-axis ย้อนหลัง 24hr
      const DATA_WIN = 168;  // filter ข้อมูล Excel 7 วัน
      const FORE_WIN = 24;
      const totalT = HIST_WIN + FORE_WIN; // 48h
      const steps = 60;

      // ── ดึง history จริงของสถานีนี้ ─────────────────────────────────────
      const hist = loadHistory();
      const srcKey = srcId?.toString();
      const destKey = sensorId?.toString();

      const destHist = (hist[destKey] || [])
        .filter(p => p.ts >= nowMs - DATA_WIN * 3600000)
        .sort((a, b) => a.ts - b.ts);

      const destPts = destHist.map(p => ({
        t: -(nowMs - p.ts) / 3600000,
        f: p.frc
      })).filter(p => p.t >= -HIST_WIN && p.t < 0 && p.f != null);
      console.log('[Chart] destKey:', destKey, 'destHist len:', destHist.length, 'destPts len:', destPts.length, 'HIST_WIN:', HIST_WIN);

      const srcHist = (hist[srcKey] || [])
        .filter(p => p.ts >= nowMs - DATA_WIN * 3600000)
        .sort((a, b) => a.ts - b.ts);

      const pts1 = destPts.length >= 1
        ? [...destPts.sort((a,b) => a.t - b.t)]
        : [];
      pts1.push({ t: 0, f: frc0 });

      // ── Trend ──
      const srcHistAll = (hist[srcKey] || [])
        .filter(p => p.ts >= Date.now() - 1*3600000)
        .sort((a,b) => a.ts - b.ts);
      let srcSlope = 0;
      if (srcHistAll.length >= 3) {
        const n = srcHistAll.length;
        const tArr = srcHistAll.map(p => p.ts / 3600000);
        const fArr = srcHistAll.map(p => p.frc);
        const tMean = tArr.reduce((a,b)=>a+b,0)/n;
        const fMean = fArr.reduce((a,b)=>a+b,0)/n;
        let num=0, den=0;
        for (let i=0; i<n; i++) { num += (tArr[i]-tMean)*(fArr[i]-fMean); den += (tArr[i]-tMean)**2; }
        srcSlope = den > 0 ? num/den : 0;
        srcSlope = Math.max(-0.05, Math.min(0.05, srcSlope));
      }

      // ── เส้นปะ: วาดถึงแค่ ttHours จริง ──
      const foreSteps = Math.round(steps * ttHours / FORE_WIN);
      const pts2 = [];
      for (let i = 0; i <= foreSteps; i++) {
        const t = (i / foreSteps) * ttHours;
        const frac = t / ttHours;
        const fOld = frc0 * Math.exp(-k_hr * t);
        const srcTargetTs = nowMs + (t - ttHours) * 3600000;
        const fSrcAtT = srcKey
          ? getHistFrcAt(srcKey, srcTargetTs, frcSource, srcSlope)
          : (frcSource + srcSlope * t);
        const fNew = fSrcAtT * Math.exp(-k_hr * ttHours);
        let fVal = fOld * (1-frac) + fNew * frac;
        // Guard NaN/Infinity
        if (!isFinite(fVal) || fVal == null) fVal = frc0 * Math.exp(-k_hr * t);
        if (!isFinite(fVal)) fVal = frc0;
        pts2.push({ t, f: Math.max(0, fVal) });
      }

      const allF = [
        ...pts1.map(p=>p.f),
        ...pts2.map(p=>p.f),
        ...(destPts||[]).map(p=>p.f),
        frc0,
      ].filter(v => v != null && isFinite(v) && v >= 0);
      const allFmax = allF.length > 0 ? Math.max(...allF) : (isFinite(frc0) ? frc0 : 1);
      const yMax = Math.max(isFinite(allFmax) ? allFmax * 1.15 : 2.0, 2.0);
      const yMin = 0;

      // px: t ∈ [-HIST_WIN, FORE_WIN]
      function px(t) { return PL + ((t + HIST_WIN) / totalT) * cw; }
      function py(f) { return PT + (1 - (f - yMin) / (yMax - yMin)) * ch; }
      function pyClamp(f) { return Math.max(PT, Math.min(PT+ch, py(f))); }

      const pts2hi = pts2.map(p => ({ t:p.t, f:p.f*(1 + 0.15*(p.t/ttHours)) }));
      const pts2lo = pts2.map(p => ({ t:p.t, f:Math.max(0, p.f*(1 - 0.15*(p.t/ttHours))) }));

      const pathSolid = smoothPath(pts1, px, py);
      const pathDash  = smoothPath(pts2, px, py);
      const fillDash  = pathDash ? (pathDash + ` L${px(ttHours).toFixed(1)},${(PT+ch).toFixed(1)} L${px(0).toFixed(1)},${(PT+ch).toFixed(1)} Z`) : '';

      const xNow = px(0);
      const xTTend = px(ttHours);   // จุดสิ้นสุดคาดการณ์จริง
      const xForeEnd = px(FORE_WIN); // ขอบขวาสุด 24h

      // endpoint
      const frcEnd = pts2[pts2.length-1].f;
      const endColor = frcEnd >= 1.0 ? '#cc0055' : frcEnd >= 0.2 ? '#e06030' : '#b07000';
      const ex = px(ttHours), ey = py(frcEnd);
      const frcEnd2 = frcEnd, endColor2 = endColor, ex2 = ex, ey2 = ey;

      const y02 = py(0.2), y10 = py(1.0);
      const stdLines = [
        yMax >= 0.2 ? `<line x1="${PL}" y1="${y02.toFixed(1)}" x2="${(PL+cw).toFixed(1)}" y2="${y02.toFixed(1)}" stroke="#c0a000" stroke-width="1" stroke-dasharray="3,2" opacity="0.7"/>` : '',
        yMax >= 1.0 ? `<line x1="${PL}" y1="${y10.toFixed(1)}" x2="${(PL+cw).toFixed(1)}" y2="${y10.toFixed(1)}" stroke="#cc0055" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>` : '',
      ].join('');
      const stdLabels = [
        (yMax >= 0.2 && y02 > PT+4 && y02 < PT+ch-2) ? `<text x="${(PL+1).toFixed(1)}" y="${(y02-2).toFixed(1)}" font-size="9" fill="#b08000" font-family="JetBrains Mono,monospace">0.2</text>` : '',
        (yMax >= 1.0 && y10 > PT+4 && y10 < PT+ch-2) ? `<text x="${(PL+1).toFixed(1)}" y="${(y10-2).toFixed(1)}" font-size="9" fill="#cc0055" font-family="JetBrains Mono,monospace">1.0</text>` : '',
      ].join('');

      const yTickVals = [];
      const yStep = yMax <= 0.5 ? 0.1 : yMax <= 1.5 ? 0.2 : 0.5;
      for (let v = 0; v <= yMax * 1.01; v = Math.round((v + yStep) * 100) / 100) {
        if (v >= yMin && v <= yMax) yTickVals.push(v);
      }
      const yLabels = `
        <text transform="rotate(-90)" x="${(-(PT + ch/2)).toFixed(1)}" y="11"
          font-size="9" font-weight="bold" fill="#c080a0" text-anchor="middle" font-family="Sarabun,sans-serif">mg/L</text>
        ${yTickVals.map(v => {
          const y = py(v);
          if (y < PT-2 || y > PT+ch+2) return '';
          return `<line x1="${(PL-3).toFixed(1)}" y1="${y.toFixed(1)}" x2="${PL}" y2="${y.toFixed(1)}" stroke="${document.body.classList.contains('dark')?'rgba(255,255,255,.15)':'#d0d5e0'}" stroke-width="0.8"/>
                  <text x="${(PL-5).toFixed(1)}" y="${(y+3).toFixed(1)}" font-size="9" font-weight="bold" fill="${document.body.classList.contains('dark')?'#c0c0e0':'#636e8a'}" text-anchor="end" font-family="JetBrains Mono,monospace">${v.toFixed(1)}</text>`;
        }).join('')}`;

      function toHHMM(hr) {
        const h = Math.floor(((hr % 24) + 24) % 24);
        const m = Math.round((hr % 1) * 60) % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      }
      // rev22: แสดงวันที่บน x-axis
      function toDateLabel(tOffset) {
        const d = new Date(nowMs + tOffset * 3600000);
        const dd = d.getDate();
        const mmNames = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
        return dd + ' ' + mmNames[d.getMonth()];
      }

      // hourly ticks ทั้ง -24h ถึง +24h
      const hourTicksAll = [];
      const startHr = Math.ceil(nowHr - HIST_WIN);
      for (let h = startHr; h <= nowHr + FORE_WIN; h++) {
        const t = h - nowHr;
        if (t >= -HIST_WIN && t <= FORE_WIN) hourTicksAll.push({ t, hr: h });
      }
      const MIN_TICK_PX = 28;
      const allVisible = hourTicksAll.filter(tick => {
        const x = px(tick.t);
        return x >= PL + 10 && x <= PL + cw - 8;
      });
      const visibleTicks = [];
      let lastX = -999;
      for (const tick of allVisible) {
        const x = px(tick.t);
        if (x - lastX >= MIN_TICK_PX) { visibleTicks.push(tick); lastX = x; }
      }

      let _lastDateStrFrc = '';
      const hourlyMarks = visibleTicks.map(({ t, hr }) => {
        const x = px(t);
        const isFuture = t > 0;
        const beyondFore = t > ttHours; // เกินช่วงคาดการณ์จริง

        let fVal = null, showDot = true;
        if (!isFuture) {
          const ptNear = pts1.reduce((a,b) => Math.abs(b.t-t)<Math.abs(a.t-t)?b:a, pts1[0]);
          fVal = ptNear ? ptNear.f : null;
        } else if (!beyondFore) {
          const ptNear2 = pts2.reduce((a,b) => Math.abs(b.t-t)<Math.abs(a.t-t)?b:a, pts2[0]);
          fVal = ptNear2 ? ptNear2.f : null;
        } else {
          showDot = false; // ไม่มีข้อมูลคาดการณ์
        }

        const fColor = fVal != null ? (fVal >= 1.0 ? '#cc0055' : fVal >= 0.2 ? '#e06030' : '#b07000') : '#bbb';
        const cy = fVal != null ? pyClamp(fVal) : PT + ch/2;
        const isNowTick = Math.abs(t) < 0.05;

        // rev22: วันที่เมื่อข้ามวัน
        const curDateStrFrc = toDateLabel(t);
        const showDateFrc = curDateStrFrc !== _lastDateStrFrc;
        if (showDateFrc) _lastDateStrFrc = curDateStrFrc;

        const _dk2 = document.body.classList.contains('dark');
        return `
          ${isNowTick ? `<line x1="${x.toFixed(1)}" y1="${PT}" x2="${x.toFixed(1)}" y2="${(PT+ch).toFixed(1)}"
            stroke="${_dk2?'#ff4477':'#e84393'}"
            stroke-width="1.5" stroke-dasharray="2,3" opacity="0.8"/>` : ''}
          <text transform="rotate(-90,${x.toFixed(1)},${(PT+ch+32).toFixed(1)})"
            x="${x.toFixed(1)}" y="${(PT+ch+32).toFixed(1)}"
            font-size="9" font-weight="bold" fill="${document.body.classList.contains('dark')?'#c0c0e0':'#636e8a'}" text-anchor="start" font-family="JetBrains Mono,monospace">${toHHMM(nowHr+t)}</text>
          ${showDateFrc ? `<text x="${x.toFixed(1)}" y="${(PT+ch+48).toFixed(1)}"
            font-size="8" font-weight="700" fill="${_dk2?'#d080b0':'#e84393'}" text-anchor="middle" font-family="Sarabun,sans-serif">${curDateStrFrc}</text>` : ''}
          `;
      }).join('');

      const hasHistory = destHist.length >= 1;

      // แรเงาเทาช่วง ttHours → FORE_WIN (ไม่มีข้อมูลคาดการณ์)
      const beyondW = xForeEnd - xTTend;
      const beyondZone = ttHours < FORE_WIN && beyondW > 0
        ? `<rect x="${xTTend.toFixed(1)}" y="${PT}" width="${beyondW.toFixed(1)}" height="${ch}"
             fill="${document.body.classList.contains('dark')?'rgba(60,60,80,.5)':'#e0e2ea'}" opacity="${document.body.classList.contains('dark')?'0.7':'0.85'}"/>
           <text x="${((xTTend+xForeEnd)/2).toFixed(1)}" y="${(PT+ch/2).toFixed(1)}"
             font-size="9" font-weight="bold" fill="${document.body.classList.contains('dark')?'#606088':'#b0b4c0'}" text-anchor="middle" font-family="Sarabun,sans-serif"
             transform="rotate(-90,${((xTTend+xForeEnd)/2).toFixed(1)},${(PT+ch/2).toFixed(1)})">ไม่มีข้อมูลคาดการณ์</text>`
        : '';

      return `
<div style="margin-top:8px;border-top:1px solid ${document.body.classList.contains('dark')?'rgba(255,255,255,.08)':'#f5d8ec'};padding-top:7px;overflow:hidden;max-width:100%;">
  <div style="font-size:9.5px;font-weight:700;color:${document.body.classList.contains('dark')?'#ff88aa':'#aa0044'};letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px;">
    📈 คาดการณ์ FRC ล่วงหน้า <span style="font-size:9px;font-weight:600;color:${document.body.classList.contains('dark')?'#ff6699':'#cc0055'};text-transform:none;letter-spacing:0;background:${document.body.classList.contains('dark')?'rgba(255,100,150,.1)':'#fff0f5'};border-radius:4px;padding:1px 6px;margin-left:4px;">← ${sourceName}</span>
  </div>
  <div style="font-size:9px;color:${document.body.classList.contains('dark')?'#d0a0c0':'#c080a0'};margin-bottom:4px;">
    ปัจจุบัน ${frc0.toFixed(3)} mg/L · คาดการณ์ (ถึง +${ttHours}ชม.)
    ${hasHistory ? `· <span style="color:${document.body.classList.contains('dark')?'#60dd80':'#006020'}">✅ ข้อมูลจริง ${destHist.length} จุด</span>` : `· <span style="color:${document.body.classList.contains('dark')?'#e0c060':'#a06000'}">⏳ รอสะสมข้อมูล</span>`}
    ${srcHistAll.length >= 3 ? `· <span style="color:${document.body.classList.contains('dark')?'#80a0e0':'#4060a0'}">trend ต้นทาง: ${srcSlope>=0?'↑':'↓'}${Math.abs(srcSlope*60).toFixed(2)}/ชม.</span>` : ''}
  </div>
  <svg width="${W}" height="${H}" style="display:block;overflow:visible;max-width:100%;height:auto;" viewBox="0 0 ${W} ${H}">
    <defs>
      <clipPath id="chartclip_${sensorId}">
        <rect x="${PL}" y="${PT}" width="${cw}" height="${ch}"/>
      </clipPath>
    </defs>
    <rect x="${PL}" y="${PT}" width="${cw}" height="${ch}" fill="${document.body.classList.contains('dark')?'rgba(20,20,40,.85)':'#fafbff'}" rx="3"/>
    <!-- พื้นหลังช่วงคาดการณ์ (0 → ttHours) -->
    <rect x="${xNow.toFixed(1)}" y="${PT}" width="${(xTTend-xNow).toFixed(1)}" height="${ch}" fill="${document.body.classList.contains('dark')?'rgba(100,60,180,.12)':'rgba(100,70,200,.06)'}" opacity="0.5"/>
    <!-- แรเงาเทาช่วงไม่มีคาดการณ์ -->
    ${beyondZone}
    ${stdLines}${stdLabels}
    <path d="${fillDash}" fill="${document.body.classList.contains('dark')?'#7040b0':'#6c5ce7'}" opacity="0.06" stroke="none" clip-path="url(#chartclip_${sensorId})"/>
    <path d="${pathSolid}" fill="none" stroke="${document.body.classList.contains('dark')?'#ff4477':'#e84393'}" stroke-width="2" stroke-linejoin="round" clip-path="url(#chartclip_${sensorId})"/>
    ${(() => {
      if (pts1.length < 2) return '';
      const _dk3 = document.body.classList.contains('dark');
      let d = `M${px(pts1[0].t).toFixed(1)},${py(pts1[0].f).toFixed(1)}`;
      for (let i=1;i<pts1.length;i++) d += ` L${px(pts1[i].t).toFixed(1)},${py(pts1[i].f).toFixed(1)}`;
      return `<path d="${d}" fill="none" stroke="${_dk3?'#ff4477':'#e84393'}" stroke-width="1.5" stroke-dasharray="none" opacity="0.7" clip-path="url(#chartclip_${sensorId})"/>`;
    })()}
    ${pts1.map(p => {
      const _dk4 = document.body.classList.contains('dark');
      return `<circle cx="${px(p.t).toFixed(1)}" cy="${py(p.f).toFixed(1)}" r="2.5" fill="${_dk4?'#ff4477':'#e84393'}" stroke="${_dk4?'rgba(255,255,255,.3)':'#fff'}" stroke-width="1" clip-path="url(#chartclip_${sensorId})"/>`;
    }).join('')}
    ${(()=>{
      // Confidence Band ±10% with minimum visible absolute spread
      const FRC_BAND = 0.10;
      const _dk = document.body.classList.contains('dark');
      const bandFill = _dk ? '#4ecca3' : '#00b894';
      const bandFillOp = _dk ? '0.15' : '0.12';
      const bandStroke = _dk ? '#4ecca3' : '#00b894';
      const bandStrokeOp = _dk ? '0.6' : '0.4';
      const bandStrokeW = _dk ? '1' : '0.8';
      if (pts2.length < 2) return '';
      // Minimum absolute spread of 0.06 mg/L so band is always visible even when FRC is low
      const MIN_ABS = 0.06;
      const bandHi = pts2.map(p => {
        const pctSpread = p.f * FRC_BAND * (p.t / ttHours);
        const spread = Math.max(MIN_ABS, pctSpread);
        const f = Math.min(4, p.f + spread);
        return { t:p.t, f: isFinite(f) ? f : p.f };
      });
      const bandLo = pts2.map(p => {
        const pctSpread = p.f * FRC_BAND * (p.t / ttHours);
        const spread = Math.max(MIN_ABS, pctSpread);
        const f = Math.max(0, p.f - spread);
        return { t:p.t, f: isFinite(f) ? f : p.f };
      });
      // Guard: skip if any coordinate is NaN
      const safeClamp = (f) => { const v = pyClamp(f); return isFinite(v) ? v : PT + ch/2; };
      let bd = 'M'+px(bandHi[0].t).toFixed(1)+','+safeClamp(bandHi[0].f).toFixed(1);
      for(let i=1;i<bandHi.length;i++) bd += ' L'+px(bandHi[i].t).toFixed(1)+','+safeClamp(bandHi[i].f).toFixed(1);
      for(let i=bandLo.length-1;i>=0;i--) bd += ' L'+px(bandLo[i].t).toFixed(1)+','+safeClamp(bandLo[i].f).toFixed(1);
      bd += ' Z';
      const hiP = 'M'+bandHi.map(p=>px(p.t).toFixed(1)+','+safeClamp(p.f).toFixed(1)).join(' L');
      const loP = 'M'+bandLo.map(p=>px(p.t).toFixed(1)+','+safeClamp(p.f).toFixed(1)).join(' L');
      return '<path d="'+bd+'" fill="'+bandFill+'" opacity="'+bandFillOp+'" stroke="none" clip-path="url(#chartclip_'+sensorId+')"/>'
        +'<path d="'+hiP+'" fill="none" stroke="'+bandStroke+'" stroke-width="'+bandStrokeW+'" opacity="'+bandStrokeOp+'" clip-path="url(#chartclip_'+sensorId+')"/>'
        +'<path d="'+loP+'" fill="none" stroke="'+bandStroke+'" stroke-width="'+bandStrokeW+'" opacity="'+bandStrokeOp+'" clip-path="url(#chartclip_'+sensorId+')"/>';
    })()}
    <path d="${pathDash}" fill="none" stroke="${document.body.classList.contains('dark')?'#a080d0':'#6c5ce7'}" stroke-width="1.8" stroke-dasharray="5,3" stroke-linejoin="round" clip-path="url(#chartclip_${sensorId})"/>
    <line x1="${xNow.toFixed(1)}" y1="${PT}" x2="${xNow.toFixed(1)}" y2="${(PT+ch).toFixed(1)}" stroke="${document.body.classList.contains('dark')?'#ff4477':'#e84393'}" stroke-width="1.5" opacity="0.5"/>
    <text x="${xNow.toFixed(1)}" y="${(PT-3).toFixed(1)}" font-size="9" font-weight="bold" fill="${document.body.classList.contains('dark')?'#ff4477':'#e84393'}" text-anchor="middle" font-family="Sarabun,sans-serif">ตอนนี้</text>
    <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${(PT+ch).toFixed(1)}" stroke="${document.body.classList.contains('dark')?'rgba(255,255,255,.15)':'#d0d5e0'}" stroke-width="1"/>
    <line x1="${PL}" y1="${(PT+ch).toFixed(1)}" x2="${(PL+cw).toFixed(1)}" y2="${(PT+ch).toFixed(1)}" stroke="${document.body.classList.contains('dark')?'rgba(255,255,255,.15)':'#d0d5e0'}" stroke-width="1"/>
    ${yLabels}${hourlyMarks}
    <!-- Tooltip group -->
    <g id="chart-tt-${sensorId}" style="display:none;pointer-events:none;">
      <line id="chart-tt-line-${sensorId}" x1="0" y1="${PT}" x2="0" y2="${PT+ch}" stroke="#666" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>
      <rect id="chart-tt-bg-${sensorId}" rx="4" ry="4" fill="rgba(30,10,20,0.82)" width="110" height="36"/>
      <text id="chart-tt-val-${sensorId}" font-size="12" font-weight="700" fill="#fff" font-family="JetBrains Mono,monospace" x="8" y="15"></text>
      <text id="chart-tt-time-${sensorId}" font-size="10" fill="#ffccdd" font-family="Sarabun,sans-serif" x="8" y="29"></text>
    </g>
    <!-- Invisible overlay for mouse/touch -->
    <rect x="${PL}" y="${PT}" width="${cw}" height="${ch}" fill="transparent"
      onmousemove="chartHover(event,'${sensorId}',${PL},${cw},${HIST_WIN},${totalT},${yMin},${yMax},${PT},${ch},[${[...pts1,...pts2].map(p=>`[${p.t.toFixed(3)},${p.f.toFixed(4)}]`).join(',')}],'frc')"
      onmouseleave="document.getElementById('chart-tt-${sensorId}').style.display='none'"
      ontouchmove="chartHover(event.touches[0],'${sensorId}',${PL},${cw},${HIST_WIN},${totalT},${yMin},${yMax},${PT},${ch},[${[...pts1,...pts2].map(p=>`[${p.t.toFixed(3)},${p.f.toFixed(4)}]`).join(',')}],'frc')"
      ontouchend="document.getElementById('chart-tt-${sensorId}').style.display='none'"
    />
  </svg>
  <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-top:4px;font-family:'JetBrains Mono',monospace;">
    <span><span style="color:${document.body.classList.contains('dark')?'#ff4477':'#e84393'}">— จริง</span>&nbsp;&nbsp;<span style="color:${document.body.classList.contains('dark')?'#a080d0':'#6c5ce7'}">- - คาดการณ์</span>&nbsp;&nbsp;<span style="color:${document.body.classList.contains('dark')?'#4ecca3':'#00b894'}">▓ Confidence Band (±10%)</span></span>
    <span style="color:${endColor2};font-weight:700">${frcEnd2 >= 1.0 ? '✓ ดี' : frcEnd2 >= 0.2 ? '✓ ผ่าน' : '⚠ ต่ำ'} ที่ ${toHHMM(nowHr+ttHours)}</span>
  </div>
</div>`;
    }


  // ── buildSourceChart: กราฟค่าจริง 24ชม. สำหรับสถานีต้นทาง ─────────────────
  function buildSourceChart(sensor) {
    var sId = sensor.id != null ? String(sensor.id) : 'x';
    var isEC = PARAM_MODE === 'ec';
    var val  = getParamVal(sensor);
    var unit = isEC ? 'μS/cm' : 'mg/L';
    var mc   = isEC ? '#1565c0' : '#cc0055';
    var vStr = isEC ? String(Math.round(val)) : val.toFixed(3);
    var nowMs = Date.now();
    var nowD  = new Date();
    var nowHr = nowD.getHours() + nowD.getMinutes()/60;
    var HW = 24;

    var raw  = loadHistory();
    // ลอง key หลายรูปแบบ: stationCode (SW02), numeric id (14), string id
    var stCode = sensor.stationCode || sensor.code || '';
    var rows = (raw[stCode] || raw[sId] || raw[sensor.id] || raw[String(sensor.id)] || [])
      .filter(function(p){ return p.ts >= nowMs - HW*3600000; })
      .sort(function(a,b){ return a.ts - b.ts; });

    var hpts = rows.map(function(p){
      var f = isEC ? (p.ec != null && p.ec > 0 ? p.ec : p.frc) : p.frc;
      return {t: -(nowMs-p.ts)/3600000, f: f};
    }).filter(function(p){ return p.f != null && p.f > 0; });

    var pts = hpts.concat([{t:0, f:val}]);

    // no history → simple card
    if (hpts.length === 0) {
      var sc = !isEC ? (val>=1.0?'#cc0055':val>=0.2?'#e05080':'#c08000')
                     : (val>=EC_CONFIG.hi?'#b32800':val>=EC_CONFIG.lo?'#1565c0':'#40b0e0');
      var ss = !isEC ? (val>=1.0?'สูง ≥1.0':val>=0.2?'ผ่านมาตรฐาน':'ต่ำกว่ามาตรฐาน ⚠')
                     : (val>=EC_CONFIG.hi?'เกินมาตรฐาน ⚠':val>=EC_CONFIG.lo?'ปกติ':'ต่ำกว่าปกติ');
      var bg0 = isEC ? '#f0f6ff' : '#fff5f8';
      var bd0 = isEC ? '#c0d8f8' : '#f5d0e0';
      var h = '';
      h += '<div style="margin-top:8px;border-top:1px solid ' + bd0 + ';padding-top:8px;">';
      h += '<div style="font-size:9.5px;font-weight:700;color:' + mc + ';text-transform:uppercase;margin-bottom:6px;">📊 กราฟค่าจริง (ย้อนหลัง 24 ชม.)</div>';
      h += '<div style="background:' + bg0 + ';border:1px solid ' + bd0 + ';border-radius:8px;padding:14px;text-align:center;">';
      h += '<div style="font-size:26px;font-weight:700;color:' + sc + ';margin-bottom:4px;font-family:monospace;">' + vStr + ' ' + unit + '</div>';
      h += '<div style="font-size:11px;font-weight:600;color:' + sc + ';margin-bottom:10px;">' + ss + '</div>';
      h += '<div style="font-size:10px;color:#a080a0;line-height:1.7;">ℹ️ ไม่มีข้อมูลคาดการณ์<br>';
      h += '<span style="font-size:9px;color:#c0a0b0;">ระบบสะสมข้อมูลจริงทุก 15 นาที (สูงสุด 24 ชม.)</span></div>';
      h += '</div></div>';
      return h;
    }

    // Y scale
    var fArr = pts.map(function(p){ return p.f; });
    var fMax = Math.max.apply(null,fArr), fMin = Math.min.apply(null,fArr);
    var yMax, yMin;
    if (!isEC) { yMax = Math.max(fMax*1.2,2.0); yMin = Math.max(0,fMin-0.15); }
    else        { yMax = Math.max(fMax*1.15,500); yMin = 0; }
    if (yMax - yMin < 0.01) { yMax += 1; }
    var yR = yMax - yMin;

    var W=420, H=200, PL=36, PR=12, PT=20, PB=48;
    var cw=W-PL-PR, ch=H-PT-PB;
    function px(t) { return PL + ((t+HW)/HW)*cw; }
    function py(f) { return PT + ch - ((f-yMin)/yR)*ch; }
    function pyC(f){ return Math.max(PT, Math.min(PT+ch, py(f))); }

    // standard lines
    var stds = isEC
      ? [{v:EC_CONFIG.lo, c:'#1565c0', lb:String(EC_CONFIG.lo)},
         {v:EC_CONFIG.hi, c:'#b32800', lb:String(EC_CONFIG.hi)}]
      : [{v:0.2, c:'#c0a000', lb:'0.2'},
         {v:1.0, c:'#cc0055', lb:'1.0'}];
    var stdSVG = '';
    for (var i=0; i<stds.length; i++) {
      var st = stds[i];
      if (st.v < yMin || st.v > yMax) continue;
      var sy = py(st.v);
      stdSVG += '<line x1="' + PL + '" y1="' + sy.toFixed(1) + '" x2="' + (PL+cw) + '" y2="' + sy.toFixed(1) + '" stroke="' + st.c + '" stroke-width="1" stroke-dasharray="5,3" opacity="0.7"/>';
      stdSVG += '<text x="' + (PL-4) + '" y="' + (sy+3.5).toFixed(1) + '" font-size="9" font-weight="bold" fill="' + st.c + '" text-anchor="end" font-family="monospace">' + st.lb + '</text>';
    }

    // Y axis ticks
    var yAx = '';
    var yStep = isEC ? 100 : (yR > 2 ? 0.5 : 0.2);
    var vv = Math.ceil(yMin/yStep)*yStep;
    for (; vv <= yMax+0.001; vv = Math.round((vv+yStep)*10000)/10000) {
      var yy = py(vv);
      if (yy < PT-2 || yy > PT+ch+2) continue;
      yAx += '<line x1="' + (PL-3) + '" y1="' + yy.toFixed(1) + '" x2="' + PL + '" y2="' + yy.toFixed(1) + '" stroke="#ddd" stroke-width="0.8"/>';
      yAx += '<line x1="' + PL + '" y1="' + yy.toFixed(1) + '" x2="' + (PL+cw) + '" y2="' + yy.toFixed(1) + '" stroke="#eee" stroke-width="0.5"/>';
      var lb2 = isEC ? String(Math.round(vv)) : vv.toFixed(1);
      yAx += '<text x="' + (PL-5) + '" y="' + (yy+3.5).toFixed(1) + '" font-size="9" font-weight="bold" fill="#222" text-anchor="end" font-family="monospace">' + lb2 + '</text>';
    }

    // X axis time ticks
    function toHM(hr) {
      var h = Math.floor(((hr%24)+24)%24), m = Math.round((hr%1)*60)%60;
      return (h<10?'0':'') + h + ':' + (m<10?'0':'') + m;
    }
    var xAx = '', lastXt = -999;
    for (var hh = Math.ceil(nowHr-HW); hh <= Math.floor(nowHr); hh++) {
      var xt = hh - nowHr, xx = px(xt);
      if (xx < PL+8 || xx > PL+cw-4 || xx - lastXt < 30) continue;
      lastXt = xx;
      var isNT = Math.abs(xt) < 0.05;
      xAx += '<line x1="' + xx.toFixed(1) + '" y1="' + PT + '" x2="' + xx.toFixed(1) + '" y2="' + (PT+ch) + '" stroke="' + (isNT?mc:'#e0d0e8') + '" stroke-width="' + (isNT?'1.5':'0.6') + '" ' + (isNT?'':'stroke-dasharray="2,4"') + ' opacity="' + (isNT?'0.7':'0.45') + '"/>';
      xAx += '<text transform="rotate(-90 ' + xx.toFixed(1) + ' ' + (PT+ch+32) + ')" x="' + xx.toFixed(1) + '" y="' + (PT+ch+32) + '" font-size="9" font-weight="bold" fill="#222" text-anchor="start" font-family="monospace">' + toHM(hh) + '</text>';
    }

    // smooth line + fill
    var linePath = 'M' + px(pts[0].t).toFixed(1) + ',' + pyC(pts[0].f).toFixed(1);
    var fillPath = 'M' + px(pts[0].t).toFixed(1) + ',' + (PT+ch) + ' L' + px(pts[0].t).toFixed(1) + ',' + pyC(pts[0].f).toFixed(1);
    for (var j=1; j<pts.length; j++) {
      var ax0=px(pts[j-1].t), ay0=pyC(pts[j-1].f);
      var ax1=px(pts[j].t),   ay1=pyC(pts[j].f);
      var acx = (ax0+ax1)/2;
      var seg = ' C' + acx.toFixed(1) + ',' + ay0.toFixed(1) + ' ' + acx.toFixed(1) + ',' + ay1.toFixed(1) + ' ' + ax1.toFixed(1) + ',' + ay1.toFixed(1);
      linePath += seg;
      fillPath += seg;
    }
    fillPath += ' L' + px(pts[pts.length-1].t).toFixed(1) + ',' + (PT+ch) + ' Z';

    // dots
    var dots = '';
    for (var k=0; k<pts.length; k++) {
      var dcx = px(pts[k].t), dcy = pyC(pts[k].f);
      var isN2 = Math.abs(pts[k].t) < 0.05;
      dots += '<circle cx="' + dcx.toFixed(1) + '" cy="' + dcy.toFixed(1) + '" r="' + (isN2?4:2.5) + '" fill="' + mc + '" stroke="#fff" stroke-width="1.2" opacity="' + (isN2?1:0.8) + '"/>';
    }

    var xN  = px(0);
    var bg2 = isEC ? '#f5f8ff' : '#fff8fa';
    var bd2 = isEC ? '#d0e8f8' : '#f0d0e8';
    var cid = 'sc' + sId + String(Math.floor(Math.random()*9999));

    var o = '';
    o += '<div style="margin-top:8px;border-top:1px solid ' + bd2 + ';padding-top:7px;">';
    o += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">';
    o += '<div style="font-size:9.5px;font-weight:700;color:' + mc + ';text-transform:uppercase;">📊 กราฟค่าจริง (ย้อนหลัง 24 ชม.)</div>';
    o += '<div style="font-size:9px;color:#a080a0;"><span style="color:#006020">✅ ' + hpts.length + ' จุด</span>';
    o += ' ปัจจุบัน <b style="color:' + mc + ';font-family:monospace;">' + vStr + ' ' + unit + '</b></div>';
    o += '</div>';
    o += '<div style="font-size:9px;color:#b0a0b0;margin-bottom:3px;">ℹ️ ไม่มีข้อมูลคาดการณ์</div>';
    o += '<svg width="' + W + '" height="' + H + '" style="display:block;overflow:visible;">';
    o += '<defs><clipPath id="' + cid + '"><rect x="' + PL + '" y="' + PT + '" width="' + cw + '" height="' + ch + '"/></clipPath></defs>';
    o += '<rect x="' + PL + '" y="' + PT + '" width="' + cw + '" height="' + ch + '" fill="' + bg2 + '" rx="3"/>';
    o += stdSVG;
    o += '<path d="' + fillPath + '" fill="' + mc + '" opacity="0.07" clip-path="url(#' + cid + ')"/>';
    o += '<path d="' + linePath + '" fill="none" stroke="' + mc + '" stroke-width="2" stroke-linejoin="round" clip-path="url(#' + cid + ')"/>';
    o += dots;
    o += '<line x1="' + xN.toFixed(1) + '" y1="' + PT + '" x2="' + xN.toFixed(1) + '" y2="' + (PT+ch) + '" stroke="' + mc + '" stroke-width="1.5" opacity="0.45"/>';
    o += '<text x="' + xN.toFixed(1) + '" y="' + (PT-3) + '" font-size="9" font-weight="bold" fill="' + mc + '" text-anchor="middle" font-family="monospace">ตอนนี้</text>';
    o += '<line x1="' + PL + '" y1="' + PT + '" x2="' + PL + '" y2="' + (PT+ch) + '" stroke="#ccc" stroke-width="1"/>';
    o += '<line x1="' + PL + '" y1="' + (PT+ch) + '" x2="' + (PL+cw) + '" y2="' + (PT+ch) + '" stroke="#ccc" stroke-width="1"/>';
    o += yAx + xAx;
    o += '</svg>';
    o += '<div style="font-size:12px;font-weight:700;margin-top:4px;"><span style="color:'+mc+'">— จริง</span> <span style="color:#aaa">| เส้นประ = เกณฑ์มาตรฐาน</span></div>';
    o += '</div>';
    return o;
  }



  // ── SOURCE_STATION_IDS: สถานีต้นทางที่ต้องการกราฟ ──────────────────────────
  const SOURCE_STATION_IDS = new Set([
    // SP (source/plant)
    'SP01','SP02','SP03','SP04','SP05',
    'SP06','SP07','SP08','SP09','SP10',
    'SP11','SP12',
    // SW (สจ. pump stations)
    'SW01','SW02','SW03','SW04','SW05',
    'SW06','SW07','SW08','SW09','SW10','SW11',
    // numeric fallback
    1,2,3,4,5,6,7,8,9,10,11,12,
    13,14,15,16,17,18,19,20,21,22,33
  ]);

  for(const s of SENSORS) {
    const pv = getParamVal(s);
    // marker color: FRC ใช้ statusColor (solid #cc0055/#e05080/#b07000 เหมือนต้นฉบับ)
    //               EC  ใช้ ecColor (solid blue/orange)
    const c = PARAM_MODE === 'frc' ? statusColor(pv) : ecStatus(pv) === `เกินมาตรฐาน ⚠ (≥${EC_CONFIG.hi})` ? '#b32800' : pv >= EC_CONFIG.lo ? '#1565c0' : '#1a7ab0';
    const sz=s.type==='plant'?22:s.type==='pump'?18:7;   // v38.0: icon ต้นทางใหญ่ชัดเป็นลำดับชั้น
    const br=s.type==='monitor'?'50%':'3px';
    const tt = TRAVEL_TIME[s.name] || TRAVEL_TIME[s.name.replace(/\s+/g, ' ').trim()];

    const ttHours = tt ? parseTTmax(tt.tt_from) : null;

    // กราฟสถานีต้นทาง (TR1/TR2/TR3/Dis1/Dis2/MTR/MDIS/โรงงาน)
    // กราฟสถานีต้นทาง (TR1/TR2/TR3/Dis1/Dis2/MTR/MDIS/โรงงาน)
    let sourceChart = '';
    // sourceChart เฉพาะ SP (โรงงาน/MTR/MDIS) ไม่แสดงสำหรับ SW/SM
    const _bangkhenIds = new Set(['SP01','SP02','SP03','SP04','SP05']);
    if (s.type === 'plant' || (s.type === 'pump' && String(s.id).startsWith('SP'))) {
      try { sourceChart = buildSourceChart(s); } catch(e) { console.error('[SC]',e); }
    }

    // กราฟคาดการณ์: เฉพาะ FRC mode + monitor + มี travel time
    let decayChart = '';
    if (PARAM_MODE === 'frc' && (s.type === 'monitor' || s.type === 'pump') && tt && ttHours) {
      // ใช้ ROOT_SOURCE_MAP ก่อน (pair ที่ตรวจสอบแล้ว) fallback → SOURCE_MAP
      const sName = s.name?.trim();
      const rootInfoFrc = ROOT_SOURCE_MAP[sName] || ROOT_SOURCE_MAP[sName?.replace(/\s+/g,' ')];
      let srcSensor = null;
      let useTT = ttHours;
      let useLabel = tt.tt_label.replace(/^จาก\s*/,'');

      if (rootInfoFrc) {
        const srcCode = getSrcCodeFromLabel(rootInfoFrc.root);
        srcSensor = srcCode ? SENSORS.find(x => x.id?.toString()===srcCode) : null;
        useTT = rootInfoFrc.ttRoot;
        useLabel = rootInfoFrc.root.replace(/^จาก\s*/,'');
      }

      if (!srcSensor) {
        // fallback: SOURCE_MAP
        const srcName2 = SOURCE_MAP[tt.tt_label];
        srcSensor = srcName2 ? SENSORS.find(x => x.name === srcName2) : null;
        if (!srcSensor && srcName2) {
          const key = srcName2.replace(/\s*\([^)]+\)\s*$/, '').trim();
          srcSensor = SENSORS.find(x => {
            const xk = x.name.replace(/\s*\([^)]+\)\s*$/, '').trim();
            return xk === key || x.name.includes(key) || key.includes(xk);
          });
        }
      }

      if (srcSensor) {
        decayChart = buildDecayChart(srcSensor.frc, useLabel, useTT, s.id, s.frc, srcSensor.id, s.name);
        // บันทึกค่าคาดการณ์ FRC ที่ปลายทาง
        (()=>{
          const foreTs = Date.now() + useTT * 3600000;
          const frcFore = srcSensor.frc * Math.exp(-((s.STATION_K||EPANET.kb) * useTT));
          saveFrcForecast(s.id, foreTs, frcFore, frcFore*1.15, Math.max(0,frcFore*0.85));
        })();
      }
    }

    // กราฟคาดการณ์ EC: monitor + มี travel time
    // ใช้ root source (TR/MH/MDIS/โรงงาน) แทน สจ. → forecast ไกลและถูกต้องกว่า
    if (PARAM_MODE === 'ec' && (s.type === 'monitor' || s.type === 'pump' || s.type === 'plant') && tt && ttHours) {
      const rootInfo = EC_ROOT_SOURCE_MAP[s.name] || EC_ROOT_SOURCE_MAP[s.name?.replace(/\s+/g, ' ').trim()];
      const rootLabel = rootInfo ? rootInfo.root : tt.tt_label;
      const rootTT    = rootInfo ? rootInfo.ttRoot : ttHours;

      // helper: หา sensor จากชื่อ (exact → partial)
      function findSensorBySourceKey(srcKey) {
        // EC mode: ใช้ EC_SOURCE_MAP → โรงงานผลิตน้ำเป็นต้นทาง
        const ecName = EC_SOURCE_MAP[srcKey] || EC_SOURCE_MAP[srcKey?.replace(/^จาก\s*/, '')];
        const sName = ecName || SOURCE_MAP[srcKey];
        if (!sName) return null;
        let found = SENSORS.find(x => x.name === sName);
        if (!found) {
          const key = sName.replace(/\s*\([^)]+\)\s*$/, '').trim();
          found = SENSORS.find(x => {
            const xk = x.name.replace(/\s*\([^)]+\)\s*$/, '').trim();
            return xk === key || x.name.includes(key) || key.includes(xk);
          });
        }
        return found;
      }

      const ecNow = getParamVal(s);

      // ── ใช้ EC_ROOT_SOURCE_MAP เป็นหลัก (ที่มาสถานีคาดการณ์ EC) ──
      const ecRootInfo = EC_ROOT_SOURCE_MAP[s.name?.trim()] || EC_ROOT_SOURCE_MAP[s.name?.replace(/\s+/g,' ').trim()];
      if (ecRootInfo) {
        // หา sensor ของ root (TR1/TR2/TR3/MTR) จาก EC_SOURCE_MAP
        const ecRootKey = ecRootInfo.root; // เช่น "TR1", "TR2", "MTR", "RAW_SAMLE"
        const ecTT     = ecRootInfo.ttRoot || 0;

        // rev19: RAW_SAMLE → ดึง EC จาก API น้ำดิบสำแล
        if (ecRootKey === 'RAW_SAMLE' && window._rawWaterEc && window._rawWaterEc.ec > 0) {
          const rwEc = window._rawWaterEc.ec;
          if (ecTT > 0) {
            // rev28: short label สำหรับ header, full detail สำหรับ sub-label
            const ttInfo = TRAVEL_TIME[s.name] || TRAVEL_TIME[s.name?.replace(/\s+/g,' ').trim()];
            const ttLocal = ttInfo ? ttInfo.tt_from : '';
            const ttSrc   = ttInfo ? ttInfo.tt_label.replace(/^จาก\s*/, '') : '';
            let rwLabel, rwDetail;

            // หา hop กลาง TR/Dis → สจ.
            const RW_HOP_TT = {
              'TR1': { name: 'TR1', tt: '' }, // source เอง
              'TR2': { name: 'TR2', tt: '' },
              'TR3': { name: 'TR3', tt: '' },
              'Dis1': { name: 'Dis1', tt: '' },
              'Dis2': { name: 'Dis2', tt: '' },
              'สจ.ลุมพินี':    { name: 'สจ.ลุมพินี',    tt: '6' },
              'สจ.พหลโยธิน':   { name: 'สจ.พหลโยธิน',   tt: '5' },
              'สจ.สำโรง':      { name: 'สจ.สำโรง',       tt: '7' },
              'สจ.ลาดพร้าว':   { name: 'สจ.ลาดพร้าว',   tt: '3' },
              'สจ.คลองเตย':    { name: 'สจ.คลองเตย',    tt: '4' },
              'สจ.บางพลี':     { name: 'สจ.บางพลี',      tt: '13' },
              'สจ.มีนบุรี':    { name: 'สจ.มีนบุรี',     tt: '7' },
              'สจ.ลาดกระบัง':  { name: 'สจ.ลาดกระบัง',  tt: '8' },
            };
            const rwHopInfo = RW_HOP_TT[ttSrc];
            const rwHopStr  = rwHopInfo && rwHopInfo.tt ? ' → ' + rwHopInfo.name + ' ' + rwHopInfo.tt + 'ชม.' : '';
            const isRwRoot = !ttSrc || ttSrc.includes('สำแล') || ttSrc.includes('บางเขน') || ttSrc.includes('สามเสน') || ['TR1','TR2','TR3','Dis1','Dis2'].includes(ttSrc);
            const rwDestName = (s.name || '').replace(/\s*\(.*?\)\s*/g, '').trim();

            if (ecTT >= 44 && ecTT <= 50) {
              rwLabel  = '🌊 สำแล (สามเสน)';
              rwDetail = 'สำแล 13ชม. + ผลิตน้ำ 2ชม. + reservoir 2ชม. + ส่งสามเสน 29ชม. รวม 48ชม.'
                + (!isRwRoot && ttLocal ? ' → ' + rwDestName + ' ' + ttLocal + 'ชม.' : '');
            } else if (ecTT > 13) {
              rwLabel  = '🌊 สำแล (บางเขน)';
              rwDetail = 'สำแล 13ชม. + ผลิตน้ำ 2ชม. + reservoir 2ชม. รวม 17ชม.'
                + rwHopStr
                + (!isRwRoot && ttLocal ? ' → ' + rwDestName + ' ' + ttLocal + 'ชม.' : '');
            } else {
              rwLabel  = '🌊 สำแล (น้ำดิบ)';
              rwDetail = '';
            }
            decayChart = buildEcForecastChart(rwEc, rwLabel, ecTT, s.id, ecNow, null, { rwHistKey: 'S1', rootKey: 'RAW_SAMLE', detail: rwDetail });
            const foreTs = Date.now() + ecTT * 3600000;
            saveEcForecast(s.id, foreTs, rwEc, rwEc*(1+EC_FORECAST_BAND), rwEc*(1-EC_FORECAST_BAND));
          }
        // rev20: RAW_MAEKLONG → ดึง EC จาก API น้ำดิบคลองตะวันตก (S11)
        } else if (ecRootKey === 'RAW_MAEKLONG' && window._mkRawWaterData && window._mkRawWaterData['S11'] && window._mkRawWaterData['S11'].ec > 0) {
          const mkEc = window._mkRawWaterData['S11'].ec;
          if (ecTT > 0) {
            // rev28: short label สำหรับ header, full detail สำหรับ sub-label
            const ttInfo = TRAVEL_TIME[s.name] || TRAVEL_TIME[s.name?.replace(/\s+/g,' ').trim()];
            const ttLocal = ttInfo ? ttInfo.tt_from : '';
            const ttSrc   = ttInfo ? ttInfo.tt_label.replace(/^จาก\s*/, '') : '';
            // short: แสดงใน checkbox header — สั้น ไม่ซ้ำ
            const mkLabel = '🏔️ เขื่อนแม่กลอง';

            // หา hop กลาง: MH→สจ. (ถ้า monitor อยู่ใต้ สจ. ฝั่งตะวันตก)
            // ttSrc = ชื่อ สจ. เช่น "สจ.ราษฎร์บูรณะ", "สจ.เพชรเกษม", "สจ.ท่าพระ", "MDIS"
            const MK_HOP_TT = {
              'MH':              { name: 'มหาสวัสดิ์',    tt: '' }, // root เอง
              'MTR':             { name: 'มหาสวัสดิ์',    tt: '' },
              'สจ.ราษฎร์บูรณะ': { name: 'สจ.ราษฎร์บูรณะ', tt: '7' },
              'สจ.เพชรเกษม':    { name: 'สจ.เพชรเกษม',    tt: '2' },
              'สจ.ท่าพระ':      { name: 'สจ.ท่าพระ',       tt: '7' },
            };
            const hopInfo = MK_HOP_TT[ttSrc];
            const hopStr  = hopInfo && hopInfo.tt ? ' → ' + hopInfo.name + ' ' + hopInfo.tt + 'ชม.' : '';

            // full detail — ท่อนสุดท้ายใช้ชื่อสถานีปลายทางจริง (s.name)
            // สำหรับ pump station (ไม่มีใน TRAVEL_TIME) ใช้ PUMP_HOP แทน
            const MK_PUMP_HOP = {
              'สถานีสูบจ่ายน้ำราษฎร์บูรณะ': { tt: '7' },
              'สถานีสูบจ่ายน้ำเพชรเกษม':    { tt: '2' },
              'สถานีสูบจ่ายน้ำท่าพระ':       { tt: '7' },
              'สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)': { tt: '' },
              'สถานีสูบจ่ายน้ำมหาสวัสดิ์':      { tt: '' },
            };
            const isPumpStation = s.type === 'pump' && MK_PUMP_HOP[s.name] !== undefined;
            const isMkRoot = !ttSrc || ttSrc.includes('คลองตะวันตก') || ttSrc === 'MH' || ttSrc === 'MTR' || (isPumpStation && !MK_PUMP_HOP[s.name]?.tt);
            const isMdis   = ttSrc === 'MDIS' || ttSrc === 'สจ.มหาสวัสดิ์';
            const destName = (s.name || '').replace(/\s*\(.*?\)\s*/g, '').trim();

            let mkDetail = 'เขื่อนแม่กลอง 96ชม. + ผลิตน้ำ 2ชม. + reservoir 2ชม. รวม 100ชม.';
            if (isPumpStation && MK_PUMP_HOP[s.name]?.tt) {
              // pump station — แสดง → สจ.xxx Nชม.
              mkDetail += ' → ' + destName + ' ' + MK_PUMP_HOP[s.name].tt + 'ชม.';
            } else {
              mkDetail += hopStr
                + (isMdis && ttLocal ? ' → สจ.มหาสวัสดิ์ → ' + destName + ' ' + ttLocal + 'ชม.' : '')
                + (!isMkRoot && !isMdis && ttLocal ? ' → ' + destName + ' ' + ttLocal + 'ชม.' : '');
            }
            decayChart = buildEcForecastChart(mkEc, mkLabel, ecTT, s.id, ecNow, null, { rwHistKey: 'S11', rootKey: 'RAW_MAEKLONG', detail: mkDetail });
            const foreTs = Date.now() + ecTT * 3600000;
            saveEcForecast(s.id, foreTs, mkEc, mkEc*(1+EC_FORECAST_BAND), mkEc*(1-EC_FORECAST_BAND));
          }
        } else {
          const ecPlantName = EC_SOURCE_MAP[ecRootKey];
          const ecPlantSensor = ecPlantName
            ? SENSORS.find(x => x.name === ecPlantName || x.name.includes(ecPlantName.replace(/\s*\d+$/, '').trim()))
            : null;
          const ecSrcVal = ecPlantSensor ? getParamVal(ecPlantSensor) : ecNow;
          const ecSrcId  = ecPlantSensor ? ecPlantSensor.id : null;
          const ecLabel  = ecRootKey === 'RAW_SAMLE' ? '🌊 สำแล (บางเขน)' : ecRootKey === 'RAW_MAEKLONG' ? '🏔️ เขื่อนแม่กลอง' : ecRootKey;
          // สร้าง detail สำหรับ pump station
          const ecPumpDestName = (s.name || '').replace(/\s*\(.*?\)\s*/g, '').trim();
          // หา hop กลาง TR→สจ. จาก PUMP_ROOT_MAP (inner ROOT_SOURCE_MAP)
          const PUMP_HOP = {
            'สถานีสูบจ่ายน้ำลุมพินี':    { src: 'TR1', tt: 6  },
            'สถานีสูบจ่ายน้ำพหลโยธิน':   { src: 'TR1', tt: 5  },
            'สถานีสูบจ่ายน้ำสำโรง':       { src: 'TR1', tt: 7  },
            'สถานีสูบจ่ายน้ำลาดพร้าว':    { src: 'TR2', tt: 3  },
            'สถานีสูบจ่ายน้ำคลองเตย':     { src: 'TR2', tt: 4  },
            'สถานีสูบจ่ายน้ำบางพลี':       { src: 'TR3', tt: 13 },
            'สถานีสูบจ่ายน้ำมีนบุรี':      { src: 'TR3', tt: 7  },
            'สถานีสูบจ่ายน้ำลาดกระบัง':   { src: 'TR3', tt: 8  },
            'สถานีสูบจ่ายน้ำราษฎร์บูรณะ': { src: 'MH',  tt: 7  },
            'สถานีสูบจ่ายน้ำเพชรเกษม':    { src: 'MH',  tt: 2  },
            'สถานีสูบจ่ายน้ำท่าพระ':       { src: 'MH',  tt: 7  },
          };
          const pumpHop = PUMP_HOP[s.name] || PUMP_HOP[s.name?.trim()] ||
            Object.entries(PUMP_HOP).find(([k]) => s.name && s.name.includes(k.replace('สถานีสูบจ่ายน้ำ','')))?.[1];
          let ecDetail = '';
          if (ecRootKey === 'RAW_SAMLE') {
            ecDetail = 'สำแล 13ชม. + ผลิตน้ำ 2ชม. + reservoir 2ชม. รวม 17ชม.'
              + (pumpHop ? ' → ' + ecPumpDestName + ' ' + pumpHop.tt + 'ชม.' : ecTT > 17 ? ' → ' + ecPumpDestName + ' ' + (ecTT - 17) + 'ชม.' : '');
          } else if (ecRootKey === 'RAW_MAEKLONG') {
            ecDetail = 'เขื่อนแม่กลอง 96ชม. + ผลิตน้ำ 2ชม. + reservoir 2ชม. รวม 100ชม.'
              + (pumpHop ? ' → ' + ecPumpDestName + ' ' + pumpHop.tt + 'ชม.' : ecTT > 100 ? ' → ' + ecPumpDestName + ' ' + (ecTT - 100) + 'ชม.' : '');
          }
          if (ecTT > 0) {
            decayChart = buildEcForecastChart(ecSrcVal, ecLabel, ecTT, s.id, ecNow, ecSrcId, { rwHistKey: ecRootKey==='RAW_SAMLE'?'S1':ecRootKey==='RAW_MAEKLONG'?'S11':null, rootKey: ecRootKey, detail: ecDetail });
            const foreTs = Date.now() + ecTT * 3600000;
            saveEcForecast(s.id, foreTs, ecSrcVal, ecSrcVal*1.15, ecSrcVal*0.85);
          }
        }
      } else if (rootInfo && rootInfo.mix) {
        // mix fallback
        let ecMixed = 0, wTotal = 0, labelParts = [], useTTmix = 0;
        for (const m of rootInfo.mix) {
          const mSensor = findSensorBySourceKey(m.root);
          if (mSensor) {
            ecMixed += getParamVal(mSensor) * m.w;
            wTotal  += m.w;
            labelParts.push(m.root.replace(/^จาก\s*/, '') + ' ' + Math.round(m.w*100) + '%');
            useTTmix = Math.max(useTTmix, m.tt);
          }
        }
        if (wTotal > 0) {
          ecMixed /= wTotal;
          decayChart = buildEcForecastChart(ecMixed, labelParts.join('+'), useTTmix, s.id, ecNow, null, { rwHistKey: (rootInfo&&rootInfo.mix&&rootInfo.mix[0]&&rootInfo.mix[0].root==='RAW_SAMLE')?'S1':(rootInfo&&rootInfo.mix&&rootInfo.mix[0]&&rootInfo.mix[0].root==='RAW_MAEKLONG')?'S14':null, rootKey: rootInfo&&rootInfo.mix&&rootInfo.mix[0]?rootInfo.mix[0].root:null });
        }
      } else {
        // single source fallback
        const rootSensor = findSensorBySourceKey(rootLabel);
        const useSensor  = rootSensor || findSensorBySourceKey(tt.tt_label);
        const useTT      = rootSensor ? rootTT : ttHours;
        const useLabel   = (rootSensor ? rootLabel : tt.tt_label).replace(/^จาก\s*/, '');
        if (useSensor) {
          decayChart = buildEcForecastChart(getParamVal(useSensor), useLabel, useTT, s.id, ecNow, useSensor.id, { rwHistKey: (rootLabel==='RAW_SAMLE'||rootLabel.includes('สำแล'))?'S1':(rootLabel==='RAW_MAEKLONG'||rootLabel.includes('แม่กลอง'))?'S11':null, rootKey: (rootLabel==='RAW_SAMLE'||rootLabel.includes('สำแล'))?'RAW_SAMLE':'RAW_MAEKLONG' });
        }
      }
    }

    // EC extra info
    const ecRow = PARAM_MODE === 'ec'
      ? `<div class="pr" style="margin-top:5px"><span>FRC</span><span class="pv">${s.frc.toFixed(3)} mg/L</span></div>`
      : `<div class="pr" style="margin-top:5px"><span>EC</span><span class="pv">${EC_FALLBACK[s.id]||'—'} μS/cm</span></div>`;

    const ttHtml = tt
      ? `<div class="pr" style="margin-top:5px;border-top:1px solid #f5d8ec;padding-top:5px;">
           <span>⏱ เวลาเดินน้ำ</span>
           <span class="pv">${tt.tt_from} ชม.</span>
         </div>
         <div class="pr"><span style="font-size:9.5px;color:#888">${tt.tt_label}</span><span></span></div>`
      : '';
    // พื้นที่รับน้ำ = zone influence (จาก SENSORS_FALLBACK หรือ API)
    // สาขา = branch จาก SENSORS_FALLBACK หรือ MWA_POLYS
    let _area = s.area || '';
    let _branch = s.branch || '';
    // fallback จาก SENSORS_FALLBACK (match by lat/lon)
    if (!_area || !_branch) {
      try {
        var fbMatch = SENSORS_FALLBACK.find(function(f) {
          return Math.abs(f.lat - s.lat) < 0.001 && Math.abs(f.lon - s.lon) < 0.001;
        });
        if (fbMatch) {
          if (!_area && fbMatch.area) _area = fbMatch.area;
          if (!_branch && fbMatch.branch) _branch = fbMatch.branch;
        }
      } catch(e) {}
    }
    // fallback สาขาจาก MWA_POLYS ถ้ายังไม่มี
    if (!_branch) {
      try {
        for (var pi = 0; pi < MWA_POLYS.length; pi++) {
          if (MWA_POLYS[pi].name && pointInPoly(s.lat, s.lon, MWA_POLYS[pi].coords)) {
            _branch = 'สาขา' + MWA_POLYS[pi].name;
            break;
          }
        }
      } catch(e) {}
    }
    if (!_area) _area = '—';
    if (!_branch) _branch = '—';

    // rev16.0: VC marker — แยก icon + popup ตามสถานะเปิด/ปิด
    const _isVc = s.type === 'vc';
    const _vcActive = _isVc && (typeof isVcActive === 'function') && isVcActive(s);
    const _vcClosed = _isVc && !_vcActive;
    const _vcLabel = _vcClosed ? '❌ ปิด' : (s.valvePct != null ? s.valvePct + '%' : '');

    // VC ใช้ icon สี่เหลี่ยม + label สถานะ
    const _markerHtml = _isVc
      ? `<div style="display:flex;flex-direction:column;align-items:center;">
           <div style="width:${sz}px;height:${sz}px;border-radius:4px;background:${_vcClosed?'#999':c};border:2.5px solid rgba(255,255,255,.95);box-shadow:0 2px 8px ${_vcClosed?'#99999988':c+'88'};cursor:pointer;${_vcClosed?'opacity:.6;':''}"></div>
           <div style="margin-top:2px;font-size:8px;font-weight:700;color:${_vcClosed?'#999':'#6c3483'};white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff;">${s.name.replace('VC ','')}</div>
           ${_vcClosed?'<div style="font-size:7px;color:#c00;font-weight:700;">ปิด</div>':''}
         </div>`
      : (s.type === 'plant' || s.type === 'pump')
      ? `<div style="position:relative;width:${sz}px;height:${sz}px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4));cursor:pointer;">
           <svg viewBox="0 0 24 24" width="${sz}" height="${sz}">${
             s.type === 'plant'
               ? '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#16306b" stroke="#fff" stroke-width="1.8"/><path d="M12 6.3c2.3 2.8 3.6 4.6 3.6 6.2a3.6 3.6 0 1 1-7.2 0c0-1.6 1.3-3.4 3.6-6.2z" fill="#fff"/>'
               : '<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#2563a8" stroke="#fff" stroke-width="1.8"/><path d="M12 6.3c2.3 2.8 3.6 4.6 3.6 6.2a3.6 3.6 0 1 1-7.2 0c0-1.6 1.3-3.4 3.6-6.2z" fill="#fff"/>'
           }</svg>
           <div style="position:absolute;right:-3px;bottom:-3px;width:8px;height:8px;border-radius:50%;background:${c};border:1.6px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>
         </div>`
      : `<div style="width:${sz}px;height:${sz}px;border-radius:${br};background:${c};border:2.5px solid rgba(255,255,255,.95);box-shadow:0 2px 8px ${c}88;cursor:pointer;"></div>`;

    // VC popup — แสดงสถานะเปิด/ปิด + valve%
    const _vcStatusHtml = _isVc
      ? `<div class="pr"><span>สถานะวาล์ว</span><span class="pv" style="color:${_vcClosed?'#c00':'#27ae60'};font-weight:700">${_vcClosed?'❌ ปิด (0%)':'✅ เปิด ('+(_vcLabel||'?')+')' }</span></div>`
      : '';

    L.marker([s.lat,s.lon],{icon:L.divIcon({
      html: _markerHtml,
      className:'',iconSize:[sz, _isVc ? sz+18 : sz],iconAnchor:[sz/2, _isVc ? sz/2 : sz/2]
    })}).addTo(sensorGroup)
    .bindPopup(`<div class="lpop">
      <h4 style="color:#111">${s.name}</h4>
      <div class="bigval" style="color:${_vcClosed?'#999':c}">${_vcClosed?'— ปิด —':paramFormat(pv)+' <span style="font-size:14px;color:#555">'+paramUnit()+'</span>'}</div>
      <div class="pr"><span>พื้นที่รับน้ำ</span><span class="pv" style="color:#111">${_area}</span></div>
      <div class="pr"><span>สาขา</span><span class="pv" style="color:#111">${_branch}</span></div>
      <div class="pr"><span>พิกัด</span><span class="pv" style="color:#111">${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}</span></div>
      <div class="pr"><span>ประเภท</span><span class="pv" style="color:#111">${s.type==='plant'?'โรงงานผลิต':s.type==='pump'?'สถานีสูบ':s.type==='vc'?'🔗 Valve Chamber (sim)':'จุดตรวจวัด'}</span></div>
      ${s.type==='vc'?'<div class="pr"><span>ข้อมูล</span><span class="pv" style="color:#6c3483">ค่า simulate จาก EPANET (ไม่ใช่ค่าวัดจริง)</span></div>':''}
      ${_vcStatusHtml}
      ${_vcClosed?'':'<div class="pr" style="margin-top:5px"><span>สถานะ</span><span class="pv" style="color:'+c+'">'+paramStatus(pv)+'</span></div>'}
      ${ecRow}
      ${_vcClosed?'':ttHtml}
      ${_vcClosed?'':(sourceChart && !decayChart ? '<div class="'+ (_bangkhenIds.has(String(s.id)) ? 'bangkhen-source-chart' : '') +'">' + sourceChart + '</div>' : '')}
      ${_vcClosed?'':decayChart}
    </div>`,{className:'pk-pop',maxWidth:Math.min(480,window.innerWidth-20),minWidth:Math.min(350,window.innerWidth-30),autoPan:true,autoPanPaddingTopLeft:[10,80],autoPanPaddingBottomRight:[10,40],keepInView:false});
  }

  // rev16.0: วาด VC markers แยกจาก SENSORS (VC ไม่อยู่ใน SENSORS)
  if (typeof VC_STATIONS !== 'undefined' && layers.sensors) {
    if (typeof updateVcFrc === 'function') updateVcFrc();
    for (const vc of VC_STATIONS) {
      const active = isVcActive(vc);
      const closed = !active;
      const _vcSrc = SENSORS.find(s=>String(s.id)===vc.sourceId);
      // FRC mode: ใช้ vc.frc (sim), EC mode: ใช้ EC จาก source
      const pv = closed ? 0 : (PARAM_MODE === 'ec' ? (_vcSrc ? getParamVal(_vcSrc) : 300) : (vc.frc || 0));
      const c = active ? (PARAM_MODE === 'ec' ? '#1565c0' : statusColor(pv)) : '#999';
      const sz = 9;
      const pair = VC_PAIR[vc.id] || {};
      const srcName = {SP01:'TR1',SP02:'TR2',SP03:'TR3',SP11:'MTR'}[vc.sourceId] || vc.sourceId;
      const srcFrc = _vcSrc ? (_vcSrc.frc||'?') : '?';
      const srcEc = _vcSrc ? getParamVal({..._vcSrc, frc:null}) : '?';

      const markerHtml = `<div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:${sz}px;height:${sz}px;border-radius:4px;background:${closed?'#999':c};border:2.5px solid rgba(255,255,255,.95);box-shadow:0 2px 8px ${closed?'#99999988':c+'88'};cursor:pointer;${closed?'opacity:.6;':''}"></div>
        <div style="margin-top:2px;font-size:8px;font-weight:700;color:${closed?'#999':'#6c3483'};white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff;">${vc.name.replace('VC ','')}</div>
        ${closed?'<div style="font-size:7px;color:#c00;font-weight:700;">ปิด</div>':''}
      </div>`;

      L.marker([vc.lat,vc.lon],{icon:L.divIcon({
        html: markerHtml,
        className:'',iconSize:[sz,sz+18],iconAnchor:[sz/2,sz/2]
      })}).addTo(sensorGroup)
      .bindPopup(`<div class="lpop">
        <h4 style="color:#111">${vc.name}</h4>
        <div class="bigval" style="color:${closed?'#999':c}">${closed?'— ปิด —':paramFormat(pv)+' <span style="font-size:14px;color:#555">'+paramUnit()+'</span>'}</div>
        <div class="pr"><span>ประเภท</span><span class="pv" style="color:#6c3483">🔗 Valve Chamber (sim)</span></div>
        <div class="pr"><span>ข้อมูล</span><span class="pv" style="color:#6c3483">ค่า simulate จาก EPANET (ไม่ใช่ค่าวัดจริง)</span></div>
        <div class="pr"><span>ต้นทาง</span><span class="pv" style="color:#111">${srcName} (FRC ${srcFrc} / EC ${typeof srcEc === 'number' ? srcEc : '?'} µS/cm)</span></div>
        <div class="pr"><span>TT</span><span class="pv" style="color:#111">${pair.tt||'?'} ชม. (ประมาณการ)</span></div>
        <div class="pr"><span>K</span><span class="pv" style="color:#111">${pair.K||'?'} /hr</span></div>
        <div class="pr"><span>สถานะวาล์ว</span><span class="pv" style="color:${closed?'#c00':'#27ae60'};font-weight:700">${closed?'❌ ปิด':'✅ เปิด ('+vc.valvePct+'%)'}</span></div>
        <div class="pr"><span>พิกัด</span><span class="pv" style="color:#111">${vc.lat.toFixed(5)}, ${vc.lon.toFixed(5)}</span></div>
      </div>`,{className:'pk-pop',maxWidth:Math.min(480,window.innerWidth-20),minWidth:Math.min(350,window.innerWidth-30),autoPan:true,autoPanPaddingTopLeft:[10,80],autoPanPaddingBottomRight:[10,40],keepInView:false});
    }
  }
}
buildMarkers();

// ตรวจสอบว่าจุดอยู่ในพื้นที่บริการหรือไม่ (ray casting)
function pointInPoly(lat, lon, coords) {
  let inside = false;
  for(let i=0,j=coords.length-1; i<coords.length; j=i++) {
    const [lati,loni]=coords[i], [latj,lonj]=coords[j];
    if(((loni>lon)!==(lonj>lon)) && (lat < (latj-lati)*(lon-loni)/(lonj-loni)+lati))
      inside = !inside;
  }
  return inside;
}
// ── Pre-computed service area bounding boxes for fast rejection ──────────────
let _servicePolysBB = null;
function _ensureServiceBB() {
  if (_servicePolysBB) return;
  const allPolys = [...STA_POLYS, ...MWA_POLYS];
  _servicePolysBB = allPolys.map(p => {
    let minLat=90, maxLat=-90, minLon=180, maxLon=-180;
    for (const [la,lo] of p.coords) {
      if (la < minLat) minLat = la; if (la > maxLat) maxLat = la;
      if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo;
    }
    return { coords: p.coords, minLat, maxLat, minLon, maxLon };
  });
}
function isInServiceArea(lat, lon) {
  _ensureServiceBB();
  for (const p of _servicePolysBB) {
    if (lat < p.minLat || lat > p.maxLat || lon < p.minLon || lon > p.maxLon) continue;
    if (pointInPoly(lat, lon, p.coords)) return true;
  }
  return false;
}

// Hover tooltip (throttled)
let _tipThrottled = false;
let _popupOpen = false;
let _tipEl = null, _tipValEl = null, _tipStEl = null, _tipLlEl = null, _tipLabelEl = null;
function _ensureTipEls() {
  if (!_tipEl) {
    _tipEl = document.getElementById('tip');
    _tipValEl = document.getElementById('tip-val');
    _tipStEl = document.getElementById('tip-st');
    _tipLlEl = document.getElementById('tip-ll');
    _tipLabelEl = document.getElementById('tip-label');
  }
}
map.on('popupopen',  () => { _popupOpen = true;  _ensureTipEls(); if(_tipEl) _tipEl.style.display='none'; var fc=document.getElementById('flow-canvas'); if(fc) fc.style.opacity='0.08'; if(window.innerWidth<=640){var lp=document.getElementById('legend-panel');if(lp)lp.style.display='none';} });
map.on('popupclose', () => { _popupOpen = false; var fc=document.getElementById('flow-canvas'); if(fc) fc.style.opacity='1'; if(window.innerWidth<=640){var lp=document.getElementById('legend-panel');if(lp)lp.style.display='';} });
map.on('mousemove',e=>{
  _ensureTipEls();
  const tip=_tipEl;
  // ซ่อน tip เมื่อมี popup เปิดอยู่
  if(_popupOpen) { tip.style.display='none'; return; }
  if(!isInServiceArea(e.latlng.lat, e.latlng.lng)) {
    tip.style.display='none'; return;
  }
  // Throttle: ข้ามถ้ายังไม่ถึงเวลา (ทุก ~50ms)
  if (_tipThrottled) {
    const pt=map.latLngToContainerPoint(e.latlng);
    tip.style.left=(pt.x+16)+'px'; tip.style.top=(pt.y-22)+'px';
    // clamp ไม่ให้ตกขอบ
    var tipR=tip.getBoundingClientRect();
    if(tipR.right>window.innerWidth) tip.style.left=Math.max(4,pt.x-tipR.width-8)+'px';
    if(tipR.bottom>window.innerHeight) tip.style.top=Math.max(4,pt.y-tipR.height-8)+'px';
    if(tipR.left<0) tip.style.left='4px';
    if(tipR.top<0) tip.style.top='4px';
    return;
  }
  _tipThrottled = true;
  setTimeout(() => { _tipThrottled = false; }, 50);

  // ── Snap-to-sensor: ถ้า hover ใกล้สถานี → แสดงค่าจริงจาก API ──
  const _lat = e.latlng.lat, _lon = e.latlng.lng;
  let snapSensor = null, snapDist = Infinity;
  for (const s of SENSORS) {
    const d = (s.lat - _lat)**2 + (s.lon - _lon)**2;
    if (d < snapDist) { snapDist = d; snapSensor = s; }
  }
  // rev16.0: เช็ค VC_STATIONS แยก (VC ไม่อยู่ใน SENSORS)
  if (typeof VC_STATIONS !== 'undefined') {
    for (const vc of VC_STATIONS) {
      const d = (vc.lat - _lat)**2 + (vc.lon - _lon)**2;
      if (d < snapDist) { snapDist = d; snapSensor = vc; }
    }
  }
  const snapThresh = 0.002; // ~0.2km — ถ้าใกล้กว่านี้ snap เป็นค่าจริง
  let v, isSnapped = false;
  if (snapSensor && snapDist < snapThresh * snapThresh) {
    v = getParamVal(snapSensor);
    isSnapped = true;
  } else {
    v = idw(_lat, _lon);
  }

  // สีแดงเมื่อต่ำกว่ามาตรฐาน (FRC<0.2 หรือ EC>600)
  const isAlert = PARAM_MODE==='frc' ? v < FRC_MIN : v >= EC_CONFIG.hi;
  const _isDark = document.body.classList.contains('dark');
  const alertColor = _isDark ? '#ff4444' : '#d63031';
  const normalValColor = _isDark ? '#ffffff' : '#2d3436';
  const normalStColor = _isDark ? '#4ecca3' : '#00b894';
  const _tipVcClosed = isSnapped && snapSensor && snapSensor.type === 'vc' && (typeof isVcActive === 'function') && !isVcActive(snapSensor);
  _tipValEl.textContent = _tipVcClosed ? '— ปิด —' : paramFormat(v)+' '+paramUnit();
  _tipValEl.style.setProperty('color', _tipVcClosed ? '#999' : (isAlert ? alertColor : normalValColor), 'important');
  _tipStEl.textContent=isSnapped ? snapSensor.name : paramStatus(v);
  _tipStEl.style.setProperty('color', isSnapped ? (_isDark?'#ff6699':'#cc0055') : (isAlert ? alertColor : normalStColor), 'important');
  _tipLlEl.textContent=e.latlng.lat.toFixed(5)+', '+e.latlng.lng.toFixed(5);
  _tipLabelEl.textContent = _tipVcClosed ? 'VC ปิด (0%)'
    : isSnapped
    ? (snapSensor && snapSensor.type === 'vc'
      ? (PARAM_MODE==='ec'?'ค่า EC sim (EPANET)':'ค่า FRC sim (EPANET)')
      : (PARAM_MODE==='ec'?'ค่า EC จริง (API)':'ค่า FRC จริง (API)'))
    : (PARAM_MODE==='ec'?'ค่า EC Interpolated':'ค่า FRC Interpolated');
  const pt=map.latLngToContainerPoint(e.latlng);
  tip.style.left=(pt.x+16)+'px'; tip.style.top=(pt.y-22)+'px'; tip.style.display='block';
});
map.on('mouseout',()=>{ _ensureTipEls(); if(_tipEl) _tipEl.style.display='none'; });

function toggleLayer(name) {
  layers[name]=!layers[name];
  document.getElementById('t-'+name).className='tog '+(layers[name]?'on':'off');
  if(['fill','lines','thresh'].includes(name)) redrawContour();
  else if(name==='sensors') buildMarkers();
  else if(name==='mwa') layers.mwa?map.addLayer(mwaGroup):map.removeLayer(mwaGroup);
  else if(name==='sta')  layers.sta?map.addLayer(staGroup):map.removeLayer(staGroup);
  else if(name==='pipes') layers.pipes?map.addLayer(pipeNetGroup):map.removeLayer(pipeNetGroup);
  else if(name==='pipelines') {
    layers.pipelines?map.addLayer(pipeLineGroup):map.removeLayer(pipeLineGroup);
    const plLeg=document.getElementById('lg-pipe-legend');
    if(plLeg) plLeg.style.display=layers.pipelines?'':'none';
  }
  else if(name==='rtu') layers.rtu?map.addLayer(rtuGroup):map.removeLayer(rtuGroup);
  else if(name==='pipe-pressure') { if(window._pipePressureGroup){if(layers['pipe-pressure'])window._pipePressureGroup.addTo(map);else map.removeLayer(window._pipePressureGroup);} }
  else if(name==='pipe-ec') { if(window._pipeEcGroup){if(layers['pipe-ec'])window._pipeEcGroup.addTo(map);else map.removeLayer(window._pipeEcGroup);} }
  else if(name==='epanet') layers.epanet?map.addLayer(epanetContourLayer):map.removeLayer(epanetContourLayer);
  else if(name==='flow') { if(layers.flow) startFlowAnimation(); else stopFlowAnimation(); }
}

function toggleFlow() {
  layers.flow = !layers.flow;
  document.getElementById('flow-btn').classList.toggle('active', layers.flow);
  if (layers.flow) startFlowAnimation(); else stopFlowAnimation();
}

function toggleSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('sidebar-overlay');
  const open=sb.classList.toggle('open');
  ov.classList.toggle('open',open);
  document.body.classList.toggle('sb-open',open); // rev16.0
  _syncFloatingBtns();
}

// ── Hide floating buttons when any panel overlaps them ──
function _syncFloatingBtns() {
  var sb = document.getElementById('sidebar');
  var ai = document.getElementById('ai-panel');
  var ze = document.getElementById('zone-editor-panel');
  var anyOpen = (sb && sb.classList.contains('open')) ||
                (ai && ai.classList.contains('open')) ||
                (ze && ze.classList.contains('open'));
  var btns = ['zone-editor-btn','ai-insight-btn','flow-btn','terrain3d-btn','whatif-btn'];
  for (var i=0;i<btns.length;i++) {
    var b = document.getElementById(btns[i]);
    if (b) b.style.display = anyOpen ? 'none' : '';
  }
}

// ── Accordion sidebar menus ──
function toggleSbMenu(el) {
  // Don't toggle if click was on a button/input/toggle inside sb-body
  if (event && event.target.closest('.sb-body')) return;
  var wasOpen = el.classList.contains('open');
  // Close all menus
  document.querySelectorAll('.sb-menu').forEach(function(m) {
    m.classList.remove('open');
    var body = m.querySelector('.sb-body');
    if (body) body.style.display = 'none';
  });
  // Open clicked (if it wasn't already open)
  if (!wasOpen) {
    el.classList.add('open');
    var body = el.querySelector('.sb-body');
    if (body) body.style.display = 'block';
  }
}

let activeTab='alert';
function setTab(t) {
  activeTab=t;
  ['alert','list'].forEach(id=>{
    document.getElementById('tab-'+id).className='tab-btn '+(id===t?'active':'inactive');
  });
  renderTab();
}
function renderTab() {
  const el=document.getElementById('tab-content');
  if(activeTab==='alert') {
    let sorted;
    if (PARAM_MODE === 'ec') {
      sorted = [...SENSORS].filter(s=>getParamVal(s)>=EC_CONFIG.hi).sort((a,b)=>getParamVal(b)-getParamVal(a));
      if(!sorted.length) {el.innerHTML='<div style="font-size:12px;color:#c080a0;text-align:center;padding:20px 0;">✓ ทุกสถานี EC ปกติ (<600 μS/cm)</div>';return;}
      el.innerHTML=sorted.map(s=>{
        const v=getParamVal(s);const c=paramColor(v);
        return `<div class="alert-item" onclick="flyTo(${s.lat},${s.lon})">
          <div class="alert-name">${s.name}</div>
          <div class="alert-val" style="color:${c}">${Math.round(v)} μS/cm — ${ecStatus(v)}</div>
        </div>`;
      }).join('');
    } else {
      sorted=[...SENSORS].filter(s=>s.frc<FRC_MIN).sort((a,b)=>a.frc-b.frc);
      if(!sorted.length) {el.innerHTML='<div style="font-size:12px;color:#c080a0;text-align:center;padding:20px 0;">✓ ทุกสถานีผ่านมาตรฐาน (≥0.2)</div>';return;}
      el.innerHTML=sorted.map(s=>`<div class="alert-item" onclick="flyTo(${s.lat},${s.lon})">
        <div class="alert-name">${s.name}</div>
        <div class="alert-val" style="color:${statusColor(s.frc)}">${s.frc.toFixed(3)} mg/L — ${statusText(s.frc)}</div>
      </div>`).join('');
    }
  } else {
    if (PARAM_MODE === 'ec') {
      el.innerHTML=`<table class="stbl"><thead><tr><th>สถานี</th><th>μS/cm</th><th>สถานะ</th></tr></thead><tbody>`+
        SENSORS.map(s=>{
          const v=getParamVal(s);
          const cl=v>=EC_CONFIG.hi?'ok':v>=EC_CONFIG.lo?'mid':'lo';
          const st=v>=EC_CONFIG.hi?'สูง':v>=EC_CONFIG.lo?'ปกติ':'ต่ำ';
          return `<tr onclick="flyTo(${s.lat},${s.lon})"><td style="color:#1a0a10">${s.name}</td>
            <td style="font-family:'JetBrains Mono',monospace;color:${paramColor(v)};font-weight:600;">${Math.round(v)}</td>
            <td><span class="sbadge ${cl}">${st}</span></td></tr>`;
        }).join('')+`</tbody></table>`;
    } else {
      el.innerHTML=`<table class="stbl"><thead><tr><th>สถานี</th><th>mg/L</th><th>สถานะ</th></tr></thead><tbody>`+
        SENSORS.map(s=>{
          const cl=s.frc>=FRC_HI?'ok':s.frc>=FRC_MIN?'mid':'lo';
          const st=s.frc>=FRC_HI?'ดี':s.frc>=FRC_MIN?'ผ่าน':'ต่ำ';
          return `<tr onclick="flyTo(${s.lat},${s.lon})"><td style="color:#1a0a10">${s.name}</td>
            <td style="font-family:'JetBrains Mono',monospace;color:${statusColor(s.frc)};font-weight:600;">${s.frc.toFixed(3)}</td>
            <td><span class="sbadge ${cl}">${st}</span></td></tr>`;
        }).join('')+`</tbody></table>`;
    }
  }
}
function flyTo(lat,lon){map.flyTo([lat,lon],13,{duration:1});}

// ── GPS: ไปยังตำแหน่งปัจจุบัน ──
var _gpsMarker = null;
var _gpsCircle = null;
function goToMyLocation() {
  var btn = document.getElementById('gps-btn');
  if (!navigator.geolocation) {
    alert('เบราว์เซอร์ไม่รองรับ GPS');
    return;
  }
  btn.classList.add('tracking');
  btn.innerHTML = '⏳';

  function onSuccess(pos) {
    var lat = pos.coords.latitude;
    var lon = pos.coords.longitude;
    var acc = pos.coords.accuracy;

    // ลบ marker/circle เก่า
    if (_gpsMarker) { map.removeLayer(_gpsMarker); _gpsMarker = null; }
    if (_gpsCircle) { map.removeLayer(_gpsCircle); _gpsCircle = null; }

    // วงกลมแสดงความแม่นยำ
    _gpsCircle = L.circle([lat, lon], {
      radius: Math.min(acc, 500),
      color: '#cc0055', fillColor: '#cc0055', fillOpacity: 0.08,
      weight: 1, opacity: 0.3
    }).addTo(map);

    // ใช้ search bar เพื่อให้ได้ popup คุณภาพน้ำเหมือน search
    var searchInput = document.getElementById('map-search-input');
    if (searchInput) {
      searchInput.value = lat.toFixed(5) + ', ' + lon.toFixed(5);
      searchInput.dispatchEvent(new Event('input'));
      setTimeout(function() {
        var searchBtn = document.getElementById('map-search-btn');
        if (searchBtn) searchBtn.click();

        // เพิ่ม GPS marker เฉพาะ (จุดสีชมพู) หลัง search pin
        setTimeout(function() {
          var gpsIcon = L.divIcon({
            className: 'gps-loc-marker',
            html: '<div style="width:16px;height:16px;background:#cc0055;border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 4px rgba(204,0,85,0.25),0 2px 6px rgba(0,0,0,0.3);"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          });
          _gpsMarker = L.marker([lat, lon], { icon: gpsIcon, zIndexOffset: 9999 }).addTo(map);
        }, 800);
      }, 500);
    } else {
      // fallback ถ้าไม่มี search bar
      map.flyTo([lat, lon], 15, { duration: 1.2 });
    }

    btn.innerHTML = '📍';
    setTimeout(function(){ btn.classList.remove('tracking'); }, 2000);
  }

  function onError(err) {
    if (err.code !== 1) {
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        function() {
          btn.innerHTML = '📍';
          btn.classList.remove('tracking');
          alert('ไม่สามารถระบุตำแหน่งได้\nกรุณาเปิด Location/GPS ในการตั้งค่ามือถือ');
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    } else {
      btn.innerHTML = '📍';
      btn.classList.remove('tracking');
      alert('กรุณาอนุญาตการเข้าถึงตำแหน่ง\n\nวิธีเปิด:\n• iPhone: Settings → Safari → Location → Allow\n• Android: กดอนุญาตที่ popup');
    }
  }

  navigator.geolocation.getCurrentPosition(onSuccess, onError,
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
}

// ── updateStats: อัปเดต sidebar stats ────────────────────────────────────
function updateStats() {
  var _el = function(id) { return document.getElementById(id); };
  var _set = function(id, val) { var e = _el(id); if(e) e.textContent = val; };
  var _css = function(id, prop, val) { var e = _el(id); if(e) e.style[prop] = val; };
  const vals = SENSORS.map(s => getParamVal(s));
  _set('s-total', SENSORS.length);
  _set('s-avg', PARAM_MODE==='ec'
    ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length).toString()
    : (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(3));

  if (PARAM_MODE === 'ec') {
    const hiCount = vals.filter(v=>v>=EC_CONFIG.hi).length;
    const loCount = vals.filter(v=>v<EC_CONFIG.lo).length;
    _set('s-hi', hiCount); _set('s-lo', loCount);
    _set('s-avg-label', 'เฉลี่ย μS/cm');
    _set('s-hi-label', '⚡ EC ≥'+EC_CONFIG.hi);
    _set('s-lo-label', '⚠ EC <'+EC_CONFIG.lo);
    _set('alert-badge', hiCount||'');
    _css('s-total','color','#1565c0'); _css('s-avg','color','#1565c0');
    _css('s-hi','color','#b32800'); _css('s-lo','color','#1a7ab0');
  } else {
    const hiCount = vals.filter(v=>v>=1.0).length;
    const loCount = vals.filter(v=>v<0.2).length;
    _set('s-hi', hiCount); _set('s-lo', loCount);
    _set('s-avg-label', 'เฉลี่ย mg/L');
    _set('s-hi-label', '🌸 FRC ≥ 1.0');
    _set('s-lo-label', '⚠ FRC < 0.2');
    _set('alert-badge', loCount||'');
    _css('s-total','color','#cc0055'); _css('s-avg','color','#cc0055');
    _css('s-hi','color','#cc0055'); _css('s-lo','color','#c08000');
  }
  try { if (typeof buildDashboard === 'function') buildDashboard(); } catch(e) {}
}

function updateLegendPanel() {
  const isEC = PARAM_MODE === 'ec';
  document.getElementById('lg-title').textContent = isEC ? 'มาตราส่วนสี' : 'มาตราส่วนสี';
  document.getElementById('lg-unit').textContent  = isEC ? '(μS/cm)' : '(mg/L)';
  document.getElementById('lg-grad-bar').style.background = isEC
    ? 'linear-gradient(to bottom, #c81414 0%, #f0d220 30%, #7eff60 55%, #c0e8ff 80%, #8cd2ff 100%)'
    : 'linear-gradient(to bottom, #642896 0%, #2850b4 20%, #32beaa 40%, #78c850 55%, #f0aa14 75%, #be1e14 100%)';
  document.getElementById('lg-ticks').innerHTML = isEC
    ? '<span>≥1200</span><span>500</span><span>200</span><span>150</span>'
    : '<span>≥1.2</span><span>0.8</span><span>0.5</span><span>0.3</span><span>0.2</span><span>&lt;0.2</span>';
  document.getElementById('lg-items').innerHTML = isEC
    ? `<div class="lg-item"><div class="lg-swatch" style="background:#c81414;"></div><span>&gt;1200<br>สูงกว่ามาตรฐาน</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#f0d220;border:1px solid #ccc;"></div><span>501–1200<br>เฝ้าระวัง</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#aaff20;border:1px solid #aaa;"></div><span>200–500<br>ผ่านมาตรฐาน</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#d8f0ff;border:1px solid #aad;"></div><span>150–200<br>ดี</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#c8e8ff;border:1px solid #aad;"></div><span>&lt;150<br>ดีมาก</span></div>`
    : `<div class="lg-item"><div class="lg-swatch" style="background:#642896;"></div><span>≥1.2<br>ม่วง · สูงมาก</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#2850b4;"></div><span>0.8–1.2<br>น้ำเงิน · ดีมาก</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#32beaa;"></div><span>0.5–0.8<br>เขียวฟ้า · ดี</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#78c850;"></div><span>0.3–0.5<br>เขียว · ผ่าน</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#f0aa14;"></div><span>0.2–0.3<br>ส้ม · เฝ้าระวัง</span></div>
       <div class="lg-item"><div class="lg-swatch" style="background:#be1e14;"></div><span>&lt;0.2<br>แดง
ต่ำกว่ามาตรฐาน ⚠</span></div>`;
  document.getElementById('lg-line1-label').textContent = isEC ? '200 μS/cm' : '0.2 mg/L';
  document.getElementById('lg-line1-label').style.color  = isEC ? '#1e78dc' : '#b40000';
  document.getElementById('lg-line2-label').textContent = isEC ? '300 μS/cm' : '1.0 mg/L';
  document.getElementById('lg-line2-label').style.color  = isEC ? '#c81414' : '#0088dd';
  const svgLine1 = document.querySelector('#lg-thresh-lines svg:first-child line');
  const svgLine2 = document.querySelector('#lg-thresh-lines svg:last-child line');
  if (svgLine1) svgLine1.setAttribute('stroke', isEC ? '#1a7ab0' : '#b40000');
  if (svgLine2) svgLine2.setAttribute('stroke', isEC ? '#b32800' : '#0088dd');
  // Update marker symbols colors
  var pumpRect = document.getElementById('lg-pump-rect');
  var monCircle = document.getElementById('lg-monitor-circle');
  if (pumpRect) pumpRect.setAttribute('fill', isEC ? '#1565c0' : '#cc0055');
  if (monCircle) monCircle.setAttribute('fill', isEC ? '#4090d0' : '#e05080');
}

function setParam(mode) {
  PARAM_MODE = mode;
  document.getElementById('btn-frc').className = 'param-btn' + (mode==='frc'?' active':'');
  document.getElementById('btn-ec').className  = 'param-btn' + (mode==='ec'?' active':'');
  document.getElementById('header-title').textContent =
    mode === 'ec'
      ? '⚡ M sandbox : Real-Time Chlorine Contour — EC Mode'
      : '🌸 M sandbox : Real-Time Chlorine Contour';
  // อัปเดต disclaimer bar
  const ticker = document.getElementById('disclaimer-ticker');
  if (ticker) {
    ticker.innerHTML = mode === 'ec'
      ? '<span>⚠ v37.0 — EPANET Pipe-Aware Contour + KMZ Network + Auto K อุณหภูมิ (Arrhenius/TWQMS tmp_6, ref sync Firebase) · Firebase + github (M ก.ค.69)</span>'
      : '<span>⚠ v37.0 — EPANET Pipe-Aware Contour (KMZ 21,909 segments) + Auto K อุณหภูมิ (Arrhenius/TWQMS tmp_6, ref sync Firebase) · Firebase + github (M ก.ค.69)</span>';
  }
  // ซ่อน EPANET panel ตอน EC mode (ไม่มี decay)
  document.getElementById('epanet-block').style.display = mode === 'ec' ? 'none' : '';
  // อัปเดต threshold toggle label
  const threshToggle = document.querySelector('.toggle-row span:last-of-type');
  document.querySelector('#t-thresh').parentElement.querySelector('span').textContent =
    mode === 'ec' ? 'เส้น 300 / 600 μS/cm' : 'เส้น 0.2 / 1.0 mg/L';
  updateLegendPanel();
  buildIdwCache();
  redrawContour();
  buildMarkers();
  updateStats();
  renderTab();

  // rev21: EC → เปิดน้ำดิบทั้ง 2 ฝั่ง / FRC → ปิดทั้ง 2 ฝั่ง อัตโนมัติ
  // rev22: ใช้ _autoToggle flag เพื่อไม่ zoom เมื่อ auto-toggle
  window._mkAutoToggle = true;
  if (mode === 'ec') {
    if (!layers.rawwater)       toggleLayer('rawwater');
    if (!layers['rawwater-mk']) toggleLayer('rawwater-mk');
  } else {
    if (layers.rawwater)        toggleLayer('rawwater');
    if (layers['rawwater-mk'])  toggleLayer('rawwater-mk');
  }
  window._mkAutoToggle = false;
  // reset unified timeline เมื่อเปลี่ยน mode (FRC/EC ใช้ frame ต่างกัน)
  _unifiedLoaded = false;
  _unifiedFrames = [];
  try { if (typeof buildDashboard === 'function') { _dashClearSelect(); buildDashboard(); } } catch(e) {}
}


// MWA API: longtitude (สะกดผิด), FRC อยู่ใน value.frc_2
function mapApiData(raw) {
  const arr = Array.isArray(raw) ? raw : (raw.data || raw.stations || raw.result || []);
  // DEBUG: แสดง structure ของ station แรก
  if (arr.length > 0) {
    console.log('[DEBUG] Raw station[0]:', JSON.stringify(arr[0], null, 2));
    console.log('[DEBUG] station[0].value keys:', arr[0].value ? Object.keys(arr[0].value) : 'no value field');
  }
  return arr
    .filter(s => s.latitude != null && (s.longtitude != null || s.longitude != null))
    .map(s => {
      const code = (s.stationCode || "").toUpperCase();
      let type = "monitor";
      if (["SP06","SP07","SP08","SP09","SP10"].includes(code)) type = "plant";
      else if (code.startsWith("SP") || code.startsWith("SW")) type = "pump";
      const frcRaw = (s.value && s.value.frc_2 != null) ? s.value.frc_2 : (s.frc || s.chlorine || 0);
      const frc = parseFloat(frcRaw);
      // EC: ดึงจาก value.ecm_5 เป็นหลัก
      const ecRaw = (s.value && s.value.ecm_5 != null) ? s.value.ecm_5
                  : (s.value && s.value.conductivity != null) ? s.value.conductivity
                  : (s.value && s.value.ec != null) ? s.value.ec
                  : (s.conductivity || s.ec || null);
      const ec = ecRaw != null ? parseFloat(ecRaw) : null;
      // อุณหภูมิน้ำในเส้นท่อจาก TWQMS (value.tmp_6) — ไม่ทุกสถานีมี
      const tmpRaw = (s.value && s.value.tmp_6 != null) ? parseFloat(s.value.tmp_6) : NaN;
      const tempC = (isFinite(tmpRaw) && tmpRaw > 0) ? tmpRaw : null;
      return {
        id     : s.stationCode || s.id || 0,
        name   : (s.stationName || "สถานี").trim(),
        area   : s.area   || "",
        branch : s.branch || "",
        lat    : parseFloat(s.latitude),
        lon    : parseFloat(s.longtitude || s.longitude),
        frc    : isNaN(frc) ? 0 : frc,
        ec,
        tempC,
        type,
      };
    })
    .filter(s => s.lat !== 0 && s.lon !== 0)
    .map(s => {
      // fallback area/branch จาก SENSORS_FALLBACK ถ้า API ไม่ส่งมา
      if (!s.area || !s.branch) {
        const fb = SENSORS_FALLBACK.find(f => String(f.id) === String(s.id));
        if (fb) {
          if (!s.area && fb.area) s.area = fb.area;
          if (!s.branch && fb.branch) s.branch = fb.branch;
        }
      }
      return s;
    });
}

// ── Historical API: probe + fetch + fit k ────────────────────────────────────
const BASE_URL = 'https://twqonline.mwa.co.th/TWQMSServicepublic/api/mwaonmobile';

// เก็บ endpoint ที่ใช้ได้ และ k ที่ fit ได้รายสถานี
let HIST_ENDPOINT = null;   // endpoint ที่ใช้ได้
let STATION_K = {};         // { stationCode: k_per_hr } — ค่า K ที่ใช้งานจริง (runtime)
let STATION_K_PENDING = {}; // { stationCode: k_per_hr } — ค่า K ที่เพิ่ง auto-fit แต่ยังไม่ confirm

// ═══════════════════════════════════════════════════════════════════
// ระบบ K Default (v8.3 redesign)
// ─────────────────────────────────────────────────────────────────
// 1. Firebase 'history/_station_k_default' เก็บ K default ที่ยืนยันแล้ว
// 2. เปิดเว็บ → โหลด K default จาก Firebase → ใส่ STATION_K
// 3. Auto-fit K All → fit ค่าใหม่ → เก็บใน STATION_K_PENDING (ยังไม่ confirm)
//    - กราฟจะใช้ค่า pending ถ้ามี (preview)
//    - แสดงปุ่ม "บันทึกเป็น K Default ใหม่"
// 4. กดยืนยัน → เขียน STATION_K_PENDING ลง Firebase K default
//    → STATION_K = STATION_K_PENDING → ล้าง pending
// 5. ไม่กดยืนยัน / reload → STATION_K_PENDING หาย → กลับไปใช้ K default
// ═══════════════════════════════════════════════════════════════════

// โหลด K default จาก Firebase
async function fbLoadKDefault() {
  if (!window._fbReady || !window._fb) { console.warn('[K] Firebase not ready'); return 0; }
  try {
    var snap = await window._fbGet(window._fbRef(window._fb, 'history/_station_k_default'));
    if (snap.exists()) {
      var count = 0;
      snap.forEach(function(child) {
        var val = child.val();
        if (val && val.k > 0) {
          STATION_K[child.key] = val.k;
          count++;
        }
      });
      console.log('[K Default] loaded from Firebase:', count, 'stations');
      // cache ลง localStorage ด้วย (offline fallback)
      try {
        localStorage.setItem('frc_k_default', JSON.stringify(
          Object.fromEntries(Object.entries(STATION_K).filter(([,v]) => v > 0))
        ));
      } catch(e){}
      return count;
    } else {
      console.log('[K Default] Firebase path empty — will use STATION_K_OVERRIDE');
      return 0;
    }
  } catch(e) {
    console.error('[K Default] FB load error:', e.message);
    return -1;
  }
}

// Fallback: โหลดจาก localStorage ถ้า Firebase ยังไม่พร้อม
try {
  var _cachedDefault = JSON.parse(localStorage.getItem('frc_k_default') || '{}');
  if (Object.keys(_cachedDefault).length > 0) {
    Object.assign(STATION_K, _cachedDefault);
    console.log('[K Default] loaded from localStorage cache:', Object.keys(_cachedDefault).length, 'stations');
  }
} catch(e){}

// บันทึก K default ทั้งหมดลง Firebase (เรียกเมื่อ user กดยืนยัน)
async function fbSaveKDefault(kMap) {
  if (!window._fbReady || !window._fb) {
    alert('⚠ Firebase ยังไม่พร้อม กรุณารอสักครู่');
    return false;
  }
  try {
    var saveObj = {};
    Object.keys(kMap).forEach(function(code) {
      saveObj[code] = { k: kMap[code], ts: Date.now() };
    });
    await window._fbSet(
      window._fbRef(window._fb, 'history/_station_k_default'),
      saveObj
    );
    // อัปเดต runtime
    Object.assign(STATION_K, kMap);
    STATION_K_PENDING = {}; // ล้าง pending
    // อัปเดต localStorage cache
    try {
      localStorage.setItem('frc_k_default', JSON.stringify(
        Object.fromEntries(Object.entries(STATION_K).filter(([,v]) => v > 0))
      ));
    } catch(e){}
    console.log('[K Default] ✅ saved to Firebase:', Object.keys(kMap).length, 'stations');
    return true;
  } catch(e) {
    console.error('[K Default] ❌ save failed:', e.message);
    alert('❌ บันทึก K Default ล้มเหลว: ' + e.message);
    return false;
  }
}

// เรียกหลัง Firebase ready
// _tryLoadKDefault ไม่จำเป็นแล้ว — initFromFirebase จะ await fbLoadKDefault() ก่อน fitAllK
// (เก็บฟังก์ชันไว้กรณี manual call)
function _tryLoadKDefault(attempts) {
  if (window._fbReady) { fbLoadKDefault(); }
  else if (attempts > 0) { setTimeout(function(){ _tryLoadKDefault(attempts-1); }, 2000); }
}
// ไม่ auto-call _tryLoadKDefault แล้ว — ให้ initFromFirebase จัดการ

// ── Default k ตามโซนโรงงาน (ใช้ก่อน auto-fit ได้ข้อมูลเพียงพอ) ──────────
// โซนบางเขน/สามเสน/ธนบุรี: k = 0.06/hr
// โซนมหาสวัสดิ์: k = 0.03/hr
const STATION_K_DEFAULT = {};
(function initDefaultK() {
  // ── กลุ่มแม่กลอง (MTR/MDIS) — fit จากข้อมูลจริง 3 เดือน k median=0.038/hr hl~19h ──
  const MH_NAMES = [
    'สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)', 'สถานีสูบจ่ายน้ำมหาสวัสดิ์',
    'สถานีสูบจ่ายน้ำราษฎร์บูรณะ', 'สถานีสูบจ่ายน้ำเพชรเกษม', 'สถานีสูบจ่ายน้ำท่าพระ',
    'ศูนย์กีฬาเฉลิมพระเกียรติ',
    'ม.เทคโนโลยีพระจอมเกล้าธนบุรี (วิทยาเขตบางขุนเทียน)',
    'มหาวิทยาลัยเอเชียอาคเนย์', 'เรือนจำพิเศษธนบุรี',
    'ศูนย์พัฒนาการจัดสวัสดิการสังคมผู้สูงอายุบ้านบางแค (บ้านพักคนชราบางแค)',
    'สำนักงานประปาสาขาบางบัวทอง', 'โรงเรียนราชวินิต นนทบุรี',
    'โรงเรียนตั้งพิรุฬห์ธรรม', 'โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี) นนทบุรี',
    'สถานีตำรวจภูธรไทรน้อย',
  ];
  for (const name of MH_NAMES) STATION_K_DEFAULT[name] = 0.038; // MH default (3mo-fit median)
  // ── กลุ่มเจ้าพระยา (TR/สามเสน/ธนบุรี) — k median=0.062/hr hl~11h ──
  // สถานีที่ไม่ได้อยู่ใน MH_NAMES และไม่มีใน STATION_K_OVERRIDE จะใช้ค่า fallback ใน getStationKhr
  // fallback default เปลี่ยนจาก 0.008 → 0.062 สำหรับกลุ่มเจ้าพระยา
})();

function getStationKhr(stationCode) {
  // priority: pending → K default (Firebase) → hardcode override → default by zone → fallback
  if (STATION_K_PENDING[stationCode] != null) return STATION_K_PENDING[stationCode];
  if (STATION_K[stationCode] != null) return STATION_K[stationCode];
  // V27 Hybrid: ใช้ K ที่ back-calc จาก live FRC (ถ้ามี)
  if (STATION_K_OVERRIDE[stationCode] != null) return STATION_K_OVERRIDE[stationCode];
  // หา sensor name จาก stationCode
  const s = SENSORS.find(x => x.id != null && x.id.toString() === stationCode.toString());
  const name = s ? s.name : stationCode;
  if (STATION_K_DEFAULT[name] != null) return STATION_K_DEFAULT[name];
  // default CP (ไม่อยู่ใน STATION_K_OVERRIDE)
  return 0.008;
}

// endpoints ที่จะลอง probe
const PROBE_ENDPOINTS = [
  '/getStationHistory',
  '/getHistory',
  '/getStationData',
  '/getStationByHour',
  '/getDataByStation',
  '/getStationHistoryByCode',
  '/getHourlyData',
  '/getStations/history',
];

async function probeHistoricalApi() {
  console.log('[Historical] เริ่ม probe endpoints...');
  const badge = document.getElementById('hist-api-badge');
  if (badge) { badge.textContent = '🔍 กำลัง probe...'; badge.style.color = '#a06000'; }

  // ลอง stationCode ตัวอย่าง
  const testCode = 'SP01';
  const results = [];

  for (const ep of PROBE_ENDPOINTS) {
    const urls = [
      `${BASE_URL}${ep}`,
      `${BASE_URL}${ep}?stationCode=${testCode}`,
      `${BASE_URL}${ep}?station=${testCode}`,
      `${BASE_URL}${ep}?code=${testCode}&hours=24`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('json')) {
          const json = await res.json();
          const keys = Array.isArray(json) ? Object.keys(json[0] || {}) : Object.keys(json);
          console.log(`[Historical] ✅ พบ: ${url}`, keys);
          results.push({ url, keys, sample: json });
          if (!HIST_ENDPOINT) HIST_ENDPOINT = url.split('?')[0];
        }
      } catch(e) { /* timeout หรือ network error */ }
    }
  }

  if (results.length === 0) {
    console.warn('[Historical] ❌ ไม่พบ historical endpoint ที่ใช้ได้');
    if (badge) { badge.textContent = '❌ ไม่พบ Historical API'; badge.style.color = '#a00000'; }
    showHistResult('❌ ไม่พบ Historical API\nAPI ที่ลอง:\n' + PROBE_ENDPOINTS.join('\n'));
  } else {
    console.log('[Historical] พบ endpoints:', results.map(r => r.url));
    if (badge) { badge.textContent = `✅ พบ ${results.length} endpoint`; badge.style.color = '#006020'; }
    showHistResult('✅ พบ Historical API:\n' + results.map(r => `${r.url}\nkeys: ${r.keys.join(', ')}`).join('\n\n'));
    // ลอง fit k จาก endpoint แรกที่เจอ
    await fitKFromHistory(results[0]);
  }
}

async function fitKFromHistory(result) {
  // พยายาม parse ข้อมูลรายชั่วโมง แล้ว fit first-order decay: ln(C/C0) = -k*t
  try {
    const data = Array.isArray(result.sample) ? result.sample : (result.sample.data || []);
    if (data.length < 3) return;

    // หา field ที่น่าจะเป็น FRC, stationCode, timestamp
    const sample = data[0];
    const timeKey = ['timestamp','time','datetime','date','recordTime','created_at'].find(k => sample[k]);
    const frcKey  = ['frc_2','frc','chlorine','value','frcValue'].find(k => sample[k] != null);
    const codeKey = ['stationCode','station_code','code','stationId'].find(k => sample[k]);

    if (!timeKey || !frcKey) {
      console.warn('[Historical] ไม่พบ field time/frc ใน data');
      return;
    }

    // group by stationCode แล้ว fit k ของแต่ละสถานี
    const groups = {};
    for (const row of data) {
      const code = codeKey ? row[codeKey] : 'default';
      if (!groups[code]) groups[code] = [];
      const t = new Date(row[timeKey]).getTime() / 3600000; // hours
      const f = parseFloat(row[frcKey]);
      if (!isNaN(f) && f > 0) groups[code].push({ t, f });
    }

    let fitted = 0;
    for (const [code, pts] of Object.entries(groups)) {
      if (pts.length < 3) continue;
      pts.sort((a, b) => a.t - b.t);
      const t0 = pts[0].t, f0 = pts[0].f;
      // linear regression: ln(f/f0) vs (t-t0) → slope = -k
      let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
      for (const p of pts) {
        if (p.f <= 0) continue;
        const x = p.t - t0;
        const y = Math.log(p.f / f0);
        sx += x; sy += y; sxx += x*x; sxy += x*y; n++;
      }
      if (n < 2) continue;
      const k = -(n*sxy - sx*sy) / (n*sxx - sx*sx); // k_per_hour (positive)
      // เฉพาะสถานีที่ user ยังไม่ได้ auto-fit เท่านั้น
      if (k > 0 && k < 5 && STATION_K[code] == null) { STATION_K[code] = k; fitted++; }
    }

    console.log(`[Historical] fit k สำเร็จ ${fitted} สถานี (ข้ามสถานีที่ user fit แล้ว):`, STATION_K);
    if (fitted > 0) {
      const badge = document.getElementById('hist-api-badge');
      if (badge) badge.textContent = `✅ fit k ได้ ${fitted} สถานี`;
      // บันทึก K ลง localStorage เท่านั้น (ไม่ overwrite Firebase)
      try {
        var stored = JSON.parse(localStorage.getItem('frc_station_k')||'{}');
        Object.keys(STATION_K).forEach(function(c){ if(!stored[c]) stored[c] = STATION_K[c]; });
        localStorage.setItem('frc_station_k', JSON.stringify(stored));
      } catch(e2){}
      // ไม่ save K Tuner ลง Firebase — เฉพาะ user Auto-fit K เท่านั้นที่ save Firebase
      buildMarkers(); // redraw popup ด้วย k ใหม่
    }
  } catch(e) {
    console.error('[Historical] fit error:', e);
  }
}

function showHistResult(msg) {
  const el = document.getElementById('hist-result');
  if (el) { el.style.display = 'block'; el.textContent = msg; }
}

// ดึง k ของสถานี (ใช้ใน forecast) — fallback เป็น K_total*3600
// K override จาก K Tuner panel (ผู้ใช้ปรับเอง)
// ── STATION_K_OVERRIDE: fitted จากข้อมูล 3 เดือน (ม.ค.–มี.ค. 2569) ──────
// pair-fit 52 สถานี (40 คู่), self-fit 9 สถานี
const STATION_K_OVERRIDE = {
  // ── กลุ่มแม่กลอง (MH) — fit 3เดือน ม.ค.-มี.ค.2569 ─────────────────────
  'S024': 0.03477,  // สจ.ท่าพระ→บางแค hl=20h [3mo-fit]
  'S025': 0.05496,  // สจ.ราษฎร์ฯ→ศูนย์กีฬา hl=13h [3mo-fit]
  'S026': 0.05175,  // สจ.ราษฎร์ฯ→มจธ hl=13h [3mo-fit]
  'S027': 0.03163,  // สจ.เพชรเกษม→เอเชียฯ hl=22h [3mo-fit]
  'S028': 0.04413,  // สจ.เพชรเกษม→เรือนจำ hl=16h [3mo-fit]
  'S029': 0.05851,  // MDIS→บดินทรเดชา hl=12h [3mo-fit]
  'S030': 0.03737,  // MDIS→ราชวินิต hl=19h [3mo-fit]
  'S031': 0.03628,  // MDIS→ไทรน้อย hl=19h [3mo-fit]
  'S032': 0.06459,  // MDIS→ตั้งพิรุฬห์ hl=11h [3mo-fit]
  'SM06': 0.02595,  // MDIS→บางบัวทอง hl=27h [3mo-fit]
  'SP11': 0.02221,  // MTR→ราษฎร์บูรณะ hl=31h [3mo-fit]
  'SP12': 0.03181,  // MDIS median hl=22h [3mo-fit]
  'SW08': 0.02221,  // MTR→ราษฎร์บูรณะ hl=31h [3mo-fit]
  'SW09': 0.04684,  // MTR→เพชรเกษม hl=15h [3mo-fit]
  'SW10': 0.02026,  // MTR→ท่าพระ hl=34h [3mo-fit]
  // ── กลุ่มเจ้าพระยา (CP) — ค่าเดิม rev.21 ──────────────────────────────
  'S001': 0.01728,  // เตรียมอุดม hl=40h [self-fit]
  'S002': 0.03913,  // ทหารขนส่ง hl=18h [pair-fit]
  'S003': 0.02406,  // กองพัน hl=29h [pair-fit]
  'S004': 0.00987,  // ภูมิพล hl=70h [self-fit]
  'S005': 0.04542,  // ซีจีเอช hl=15h [pair-fit]
  'S006': 0.03008,  // จิตรลดา hl=23h [pair-fit]
  'S007': 0.02963,  // ศิริราช hl=23h [pair-fit]
  'S008': 0.03086,  // โอสถสภา hl=22h [pair-fit]
  'S009': 0.02553,  // เกร็ดตระการ hl=27h [pair-fit]
  'S010': 0.03071,  // ท้องฟ้าจำลอง hl=23h [pair-fit]
  'S011': 0.03209,  // ศิครินทร์ hl=22h [pair-fit]
  'S012': 0.04095,  // หาดอมรา hl=17h [pair-fit]
  'S013': 0.01122,  // เอจีซี hl=62h [self-fit]
  'S014': 0.03925,  // โรงไฟฟ้า hl=18h [pair-fit]
  'S015': 0.03451,  // มหาจักร hl=20h [pair-fit]
  'S016': 0.02235,  // บางชัน hl=31h [pair-fit]
  'S017': 0.02580,  // ไตเทียม hl=27h [pair-fit]
  'S018': 0.05000,  // ลาดกระบังนิคม hl=14h [cap]
  'S019': 0.05000,  // สุวรรณภูมิ hl=14h [cap]
  'S020': 0.02748,  // หัวเฉียว hl=25h [pair-fit]
  'S021': 0.02540,  // บางพลีนิคม hl=27h [pair-fit]
  'S022': 0.02957,  // คลองด่าน hl=23h [pair-fit]
  'S023': 0.03455,  // บางปู hl=20h [pair-fit]
  'SM01': 0.03706,  // นนทบุรี hl=19h [pair-fit]
  'SM02': 0.02956,  // ทุ่งมหาเมฆ hl=23h [pair-fit]
  'SM03': 0.03639,  // สุขุมวิท hl=19h [pair-fit]
  'SM04': 0.04500,  // สมุทรปราการ hl=15h [manual]
  'SM05': 0.02286,  // มีนบุรีสาขา hl=30h [pair-fit]
  'SP01': 0.00860,  // TR1 hl=81h [self-fit]
  'SP02': 0.00667,  // TR2 hl=104h [self-fit]
  'SP03': 0.04350,  // TR3 hl=16h [pair-fit]
  'SP04': 0.03913,  // Dis1 hl=18h [pair-fit]
  'SP05': 0.04542,  // Dis2 hl=15h [pair-fit]
  'SP06': 0.02963,  // ธนบุรี hl=23h [pair-fit]
  'SP07': 0.01273,  // สามเสน1 hl=54h [self-fit]
  'SP08': 0.01134,  // สามเสน2 hl=61h [self-fit]
  'SP09': 0.03008,  // สามเสน3 hl=23h [pair-fit]
  'SP10': 0.00942,  // สามเสน4 hl=74h [self-fit]
  'SW01': 0.02956,  // ลุมพินี hl=23h [pair-fit]
  'SW02': 0.02819,  // ลาดพร้าว hl=25h [pair-fit]
  'SW03': 0.03355,  // คลองเตย hl=21h [pair-fit]
  'SW04': 0.03567,  // สำโรง hl=19h [pair-fit]
  'SW05': 0.02433,  // มีนบุรี hl=28h [pair-fit]
  'SW06': 0.03977,  // ลาดกระบัง hl=17h [pair-fit]
  'SW07': 0.02852,  // บางพลี hl=24h [pair-fit]
  'SW11': 0.02912,  // พหลโยธิน hl=24h [pair-fit]
}; // รวม 61 สถานี | MH=rev.25 fit, CP=rev.21 original
 // รวม 51 สถานี | rev.25 fit จากข้อมูลจริง 3 เดือน (ม.ค.-มี.ค. 2569)

// getStationKhr defined above with default k by zone

// ── localStorage History System ──────────────────────────────────────────────
// เก็บประวัติ FRC รายสถานี ทุก 15 นาที สะสมใน localStorage สูงสุด 24 ชม.
const LS_KEY = 'mwa_frc_history_v2'; // v2: รองรับ SW stations
const HIST_MAX_HOURS = 168;
const MIN_PTS_TO_FIT = 3; // ต้องการ ≥ 3 จุด (45 นาที) จึง fit ได้

// ── Firebase History Helpers ──────────────────────────────────────────────────
function fbPath(code) { return `history/${code.replace(/\/|\./g,'-')}`; }

async function fbSaveReading(code, point) {
  if (!window._fbReady || !window._fb) return;
  try {
    const r = window._fbRef(window._fb, `${fbPath(code)}/${point.ts}`);
    await window._fbSet(r, { frc: point.frc ?? null, ec: point.ec ?? null, ts: point.ts });
  } catch(e) { console.warn('[FB] save error', e.message); }
}

async function fbLoadHistory() {
  if (!window._fbReady || !window._fb) return {};
  const cutoff = Date.now() - HIST_MAX_HOURS * 3600000;
  const out = {};
  try {
    const snap = await window._fbGet(window._fbRef(window._fb, 'history'));
    if (!snap.exists()) return {};
    snap.forEach(codeSnap => {
      const code = codeSnap.key.replace(/-/g, '_'); // restore key
      const pts  = [];
      codeSnap.forEach(ptSnap => {
        const p = ptSnap.val();
        if (p.ts >= cutoff) pts.push(p);
      });
      if (pts.length) out[code] = pts;
    });
  } catch(e) { console.warn('[FB] load error', e.message); }
  return out;
}

// เก็บ forecast ขึ้น Firebase


// realtime listener — อัปเดต badge เมื่อข้อมูลเปลี่ยน
// ** CRITICAL: ไม่ overwrite ค่า API ด้วยค่าเก่าจาก Firebase **
// Firebase /live ใช้เฉพาะเมื่อ API offline เท่านั้น
let _fbUpdateTimer = null;
function fbListenRealtime() {
  if (!window._fbReady || !window._fb) return;
  const r = window._fbRef(window._fb, 'live');
  window._fbOnValue(r, snap => {
    if (!snap.exists()) return;
    // *** ถ้า API เคย poll สำเร็จแล้ว หรือกำลังรอ API → ไม่ใช้ Firebase /live ***
    // ใช้ Firebase /live เฉพาะเมื่อ API confirmed offline (fallback) เท่านั้น
    if (apiStatus !== 'fallback') return;
    
    const live = snap.val();
    let updated = 0;
    for (const s of SENSORS) {
      const key = String(s.id);
      if (live[key]) {
        if (live[key].frc != null) { s.frc = live[key].frc; updated++; }
        if (live[key].ec  != null) { s.ec  = live[key].ec;  }
        if (live[key].ts)          { s.liveTs = live[key].ts; }
      }
    }
    if (updated > 0) {
      // Debounce: Firebase may fire rapidly — batch updates
      clearTimeout(_fbUpdateTimer);
      _fbUpdateTimer = setTimeout(() => {
        _histCache = null;
        buildIdwCache();
        redrawContour();
        buildMarkers();
        updateStats();
        renderTab();
        const badge = document.querySelector('#header .badge');
        if (badge) {
          badge.textContent = '🔴 Live — ' + new Date().toLocaleTimeString('th-TH');
          badge.style.color = '#006020';
        }
      }, 500);
    }
  });
}

// บันทึก live ค่าปัจจุบันขึ้น Firebase
async function fbSaveLive(sensors) {
  if (!window._fbReady || !window._fb) return;
  const live = {};
  for (const s of sensors) {
    if (s.frc == null && s.ec == null) continue;
    live[String(s.id)] = {
      frc: s.frc ?? null,
      ec:  s.ec  ?? null,
      ts:  Date.now()
    };
  }
  try {
    await window._fbSet(window._fbRef(window._fb, 'live'), live);
  } catch(e) { console.warn('[FB] live save error', e.message); }
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch(e) { return {}; }
}

function clearAllHistory() {
  localStorage.removeItem(LS_KEY);
  console.log('[History] cleared all history');
  alert('ล้าง history เรียบร้อย — กราฟจะเริ่มสะสมข้อมูลใหม่');
}

function saveHistory(hist) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(hist));
  } catch(e) {
    console.warn('[History] localStorage full — trimming progressively');
    // ลองทีละชั้น: 120h → 72h → 48h → 24h → 12h
    const trimHours = [120, 72, 48, 24, 12];
    let saved = false;
    for (const th of trimHours) {
      const cutoff = Date.now() - th * 3600000;
      for (const code of Object.keys(hist)) {
        hist[code] = hist[code].filter(p => p.ts >= cutoff);
        if (hist[code].length === 0) delete hist[code];
      }
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(hist));
        console.log(`[History] saved after trim to ${th}h`);
        saved = true;
        break;
      } catch(e2) { /* ยังเต็ม ลอง trim ต่อ */ }
    }
    if (!saved) {
      console.warn('[History] still full — clearing all');
      localStorage.removeItem(LS_KEY);
      try { localStorage.setItem(LS_KEY, JSON.stringify(hist)); } catch(e3) {}
    }
  }
}

function clearOldHistory() {
  try {
    const hist = loadHistory();
    const cutoff = Date.now() - HIST_MAX_HOURS * 3600000;
    for (const code of Object.keys(hist)) {
      hist[code] = hist[code].filter(p => p.ts >= cutoff);
      if (hist[code].length === 0) delete hist[code];
    }
    saveHistory(hist);
  } catch(e) { localStorage.removeItem(LS_KEY); }
}

function recordHistory(sensors) {
  const hist = loadHistory();
  const now = Date.now();
  const cutoff = now - HIST_MAX_HOURS * 3600000;

  for (const s of sensors) {
    // ข้อ 1: บันทึกเฉพาะ mapped (API) sensors เท่านั้น
    // fallback sensors มี id เป็น number (จาก SENSORS_FALLBACK) → ข้าม
    if (typeof s.id === 'number') continue;
    // ต้องมี id เป็น string (stationCode จาก API)
    if (!s.id || typeof s.id !== 'string') continue;

    if (s.frc == null || s.frc <= 0) continue;
    // ข้อ 4: sanity check — FRC ระบบประปาต้องอยู่ในช่วง 0.001–4.0 mg/L
    if (s.frc < 0.001 || s.frc > 4.0) continue;

    const code = s.id;
    if (!hist[code]) hist[code] = [];
    hist[code] = hist[code].filter(p => p.ts >= cutoff);

    // ข้อ 4: spike detection — ถ้าค่าใหม่ต่างจากค่าก่อนหน้า > 50% → ข้าม
    const last = hist[code][hist[code].length - 1];
    if (last && last.frc > 0) {
      const changePct = Math.abs(s.frc - last.frc) / last.frc;
      if (changePct > 0.5) {
        console.warn(`[History] spike detected ${code}: ${last.frc.toFixed(3)} → ${s.frc.toFixed(3)} (${(changePct*100).toFixed(0)}%) ข้าม`);
        continue;
      }
    }

    if (!last || now - last.ts >= 4 * 60000) {
      hist[code].push({ ts: now, frc: s.frc, ec: s.ec ?? null });
    }
  }
  saveHistory(hist);
  return hist;
}

function fitAllK(hist) {
  // ── วิธีที่ถูกต้อง: fit k จากคู่ (ต้นทาง, ปลายทาง) ──────────────────
  // k = -ln(FRC_ปลาย / FRC_ต้น) / tt
  // โดยจับคู่ค่าที่วัดได้ ณ เวลาที่ตรงกัน (ต้นทาง ณ t, ปลายทาง ณ t+tt)
  let fitted = 0;

  // สร้าง lookup: sensor name → id จาก SENSORS
  const nameToId = {};
  for (const s of SENSORS) nameToId[s.name] = s.id?.toString();

  // PAIR_TT: คู่ (srcId, destId, tt_hr) จาก TRAVEL_TIME ที่มีอยู่
  // ดึงจาก TRAVEL_TIME ซึ่งอยู่ใน buildMarkers scope — ต้องสร้างใหม่ที่นี่
  // ข้อ 3: PAIR_TT_GLOBAL — 25 คู่ src-dest ตาม travel time
  const PAIR_TT_GLOBAL = [
    // srcId, destId, tt (ชม.) — จาก TRAVEL_TIME + SOURCE_MAP
    // กลุ่ม TR/MDIS (2 คู่)
    { src: '4',  dest: '23', tt: 4.5  }, // Dis1 → นนทบุรี
    { src: '4',  dest: '30', tt: 6    }, // Dis1 → ทหารขนส่ง
    // กลุ่ม Dis2 (3 คู่)
    { src: '5',  dest: '32', tt: 3.5  }, // Dis2 → รพ.ภูมิพล
    { src: '5',  dest: '34', tt: 10   }, // Dis2 → รพ.ซีจีเอช
    { src: '5',  dest: '29', tt: 11.5 }, // Dis2 → เตรียมอุดมฯ
    // กลุ่มสจ.ลุมพินี (1 คู่)
    { src: '13', dest: '24', tt: 1    }, // สจ.ลุมพินี → ทุ่งมหาเมฆ
    // กลุ่มสจ.ลาดพร้าว (2 คู่)
    { src: '14', dest: '37', tt: 1.5  }, // สจ.ลาดพร้าว → โอสถสภา
    { src: '14', dest: '38', tt: 5    }, // สจ.ลาดพร้าว → เกร็ดตระการ
    // กลุ่มสจ.คลองเตย (2 คู่)
    { src: '15', dest: '25', tt: 2.5  }, // สจ.คลองเตย → สุขุมวิท
    { src: '15', dest: '39', tt: 5    }, // สจ.คลองเตย → ท้องฟ้าจำลอง
    // กลุ่มสจ.สำโรง (3 คู่)
    { src: '16', dest: '26', tt: 2.5  }, // สจ.สำโรง → สมุทรปราการ
    { src: '16', dest: '40', tt: 4.5  }, // สจ.สำโรง → ศิครินทร์
    { src: '16', dest: '41', tt: 6.5  }, // สจ.สำโรง → หาดอมรา
    // กลุ่มสจ.มีนบุรี (2 คู่)
    { src: '17', dest: '27', tt: 2.5  }, // สจ.มีนบุรี → สาขามีนบุรี
    { src: '17', dest: '45', tt: 1.5  }, // สจ.มีนบุรี → บางชัน
    // กลุ่มสจ.ลาดกระบัง (2 คู่)
    { src: '18', dest: '47', tt: 1    }, // สจ.ลาดกระบัง → นิคมลาดกระบัง
    { src: '18', dest: '48', tt: 1    }, // สจ.ลาดกระบัง → สุวรรณภูมิ
    // กลุ่มสจ.บางพลี (2 คู่)
    { src: '19', dest: '50', tt: 5    }, // สจ.บางพลี → นิคมบางพลี
    { src: '19', dest: '52', tt: 7    }, // สจ.บางพลี → บางปู
    // กลุ่มสจ.ราษฎร์บูรณะ (1 คู่)
    { src: '20', dest: '54', tt: 3.5  }, // สจ.ราษฎร์บูรณะ → ศูนย์กีฬา
    // กลุ่มสจ.เพชรเกษม (1 คู่)
    { src: '21', dest: '56', tt: 6.5  }, // สจ.เพชรเกษม → เอเชียอาคเนย์
    // กลุ่มสจ.ท่าพระ (1 คู่)
    { src: '22', dest: '53', tt: 3.5  }, // สจ.ท่าพระ → บางแค
    // กลุ่ม MDIS (5 คู่)
    { src: '12', dest: '28', tt: 10.5 }, // MDIS → บางบัวทอง
    { src: '12', dest: '59', tt: 12   }, // MDIS → ราชวินิต
    { src: '12', dest: '58', tt: 4.5  }, // MDIS → บดินทรเดชา
    { src: '12', dest: '60', tt: 16.5 }, // MDIS → ไทรน้อย (tt_from 15-18 → mid 16.5)
    { src: '12', dest: '61', tt: 13   }, // MDIS → ตั้งพิรุฬห์ธรรม
    // สถานีที่ขาดคู่ — เพิ่มเพื่อ auto-fit k ครบทุกสถานี
    { src: '4',  dest: '31', tt: 5    }, // Dis1 → กองพัน
    { src: '4',  dest: '29', tt: 11.5 }, // Dis1 → เตรียมอุดมฯ
    { src: '9',  dest: '35', tt: 1    }, // สามเสน3 → จิตรลดา
    { src: '6',  dest: '36', tt: 2    }, // ธนบุรี → ศิริราช
    { src: '16', dest: '43', tt: 4    }, // สำโรง → โรงไฟฟ้า
    { src: '17', dest: '44', tt: 15   }, // มีนบุรี → มหาจักร
    { src: '17', dest: '46', tt: 4.5  }, // มีนบุรี → ไตเทียม
    { src: '18', dest: '49', tt: 6    }, // ลาดกระบัง → หัวเฉียวบางพลี
    { src: '19', dest: '51', tt: 17   }, // บางพลี → คลองด่าน
    { src: '20', dest: '55', tt: 9.5  }, // ราษฎร์บูรณะ → มจธ บางขุนเทียน
    { src: '21', dest: '57', tt: 5.5  }, // เพชรเกษม → เรือนจำธนบุรี
    { src: '14', dest: '38', tt: 5    }, // ลาดพร้าว → เกร็ดตระการ *เพิ่ม dest id
    { src: '16', dest: '42', tt: 3.5  }, // สำโรง → เอจีซี
  ]; // รวม 40 คู่

  for (const pair of PAIR_TT_GLOBAL) {
    const srcPts = (hist[pair.src] || []).sort((a,b) => a.ts - b.ts);
    const destPts = (hist[pair.dest] || []).sort((a,b) => a.ts - b.ts);
    if (srcPts.length < 2 || destPts.length < 2) continue;

    const ttMs = pair.tt * 3600000;
    const kSamples = [];

    // จับคู่: ต้นทาง ณ ts_src → ปลายทาง ณ ts_src + tt (time-matched)
    for (const sp of srcPts) {
      if (sp.frc <= 0) continue;
      const targetTs = sp.ts + ttMs;
      const dp = destPts.reduce((a,b) =>
        Math.abs(b.ts - targetTs) < Math.abs(a.ts - targetTs) ? b : a
      );
      if (Math.abs(dp.ts - targetTs) > 15*60000) continue; // ห่างเกิน 15 นาที
      if (dp.frc <= 0 || dp.frc > sp.frc * 1.5) continue; // sanity

      const k = -Math.log(dp.frc / sp.frc) / pair.tt;
      // cap: k ระบบประปาไม่ควรเกิน 0.5/hr (conservative)
      if (k >= 0.003 && k <= 0.05) kSamples.push(k); // cap: 0.003–0.05/hr (half-life 14–231 hr)
    }

    if (kSamples.length === 0) continue;

    // ใช้ median แทน mean เพื่อ robust ต่อ outlier
    const sorted_k = [...kSamples].sort((a,b) => a-b);
    const mid = Math.floor(sorted_k.length / 2);
    const kMedian = sorted_k.length % 2
      ? sorted_k[mid]
      : (sorted_k[mid-1] + sorted_k[mid]) / 2;

    // ต้องการ sample ≥ 3 จึงเชื่อถือได้ ไม่งั้นรอข้อมูลเพิ่ม
    if (kSamples.length < 3) continue;

    // ไม่ overwrite K ที่ user auto-fit ไว้แล้ว (จาก Firebase)
    if (STATION_K[pair.dest] == null) { STATION_K[pair.dest] = kMedian; }
    if (!STATION_K[pair.src]) STATION_K[pair.src] = kMedian;
    fitted++;
  }

  // fallback: self-fit ด้วย linear regression บน ln(frc) vs t
  // ใช้เฉพาะสถานีที่มีข้อมูลเพียงพอ (≥ 6 จุด = 30 นาที)
  for (const [code, pts] of Object.entries(hist)) {
    if (STATION_K[code]) continue;
    if (pts.length < 6) continue; // ต้องการ ≥ 6 จุดสำหรับ self-fit
    const sorted = [...pts].sort((a,b) => a.ts - b.ts);
    const t0 = sorted[0].ts / 3600000;
    const f0 = sorted[0].frc;
    if (f0 <= 0) continue;
    let sx=0,sy=0,sxx=0,sxy=0,n=0;
    for (const p of sorted) {
      if (p.frc <= 0) continue;
      const x = p.ts/3600000 - t0;
      const y = Math.log(p.frc/f0);
      sx+=x; sy+=y; sxx+=x*x; sxy+=x*y; n++;
    }
    if (n < 4 || (n*sxx-sx*sx) === 0) continue;
    const k = -(n*sxy-sx*sy)/(n*sxx-sx*sx);
    // self-fit cap เข้มกว่า: ไม่เกิน 0.3/hr
    if (k >= 0.003 && k <= 0.05) { STATION_K[code] = k; fitted++; } // cap: 0.003–0.05/hr
  }

  return fitted;
}

function updateHistBadge(hist) {
  const badge = document.getElementById('hist-api-badge');
  const detail = document.getElementById('hist-result');
  if (!badge) return;

  const codes = Object.keys(hist);
  const totalPts = codes.reduce((s, c) => s + hist[c].length, 0);
  const fittedCodes = codes.filter(c => STATION_K[c]);
  const needMore = codes.filter(c => hist[c].length > 0 && hist[c].length < MIN_PTS_TO_FIT);

  if (fittedCodes.length > 0) {
    badge.style.color = '#006020';
    badge.textContent = `✅ fit k ได้ ${fittedCodes.length} สถานี (${totalPts} จุด)`;
  } else if (totalPts > 0) {
    badge.style.color = '#a06000';
    badge.textContent = `⏳ สะสม ${totalPts} จุด — รอครบ ${MIN_PTS_TO_FIT} จุด/สถานี`;
  } else {
    badge.style.color = '#a060c0';
    badge.textContent = '📡 รอข้อมูล poll รอบแรก...';
  }

  if (detail && detail.style.display !== 'none') {
    const lines = fittedCodes.map(c => `${c}: k=${STATION_K[c].toFixed(4)}/hr (${hist[c]?.length||0} จุด)`);
    detail.textContent = lines.length > 0
      ? `k ที่ fit ได้:\n${lines.join('\n')}`
      : `ยังสะสมข้อมูลไม่พอ\nจำนวนจุดที่มี:\n${codes.map(c=>`${c}: ${hist[c].length} จุด`).join('\n')}`;
  }
  // refresh K Tuner panel ทุกครั้งที่ badge อัปเดต
  renderKTuner();
}

// ── inject RTU pressure into each SENSOR (nearest RTU by lat/lon) ──
// เรียกหลัง SENSORS.push เสร็จ และหลัง refreshRtu() อัปเดต _rtuLive
// ผล: sensor.rtuPressure = lP ของ RTU ที่ใกล้ที่สุด
//     epanetDecay() อ่านค่านี้ได้เลย ไม่ต้อง scan _rtuLive ทุก pixel (O(1) แทน O(N))
function injectRtuPressureToSensors() {
  const rtus = window._rtuLive;
  if (!rtus || rtus.length === 0) return;
  let injected = 0;
  for (const s of SENSORS) {
    let minD2 = Infinity, nearP = 0;
    for (const r of rtus) {
      const d2 = (r.lt - s.lat)**2 + (r.ln - s.lon)**2;
      if (d2 < minD2) { minD2 = d2; nearP = r.lP; }
    }
    s.rtuPressure = nearP > 0 ? nearP : 0;
    if (nearP > 0) injected++;
  }
  console.log('[RTU] injectRtuPressureToSensors: ' + injected + '/' + SENSORS.length + ' sensors got RTU pressure');
  // อัปเดต v2-badge แสดงสถานะ RTU
  const _v2b = document.getElementById('v2-badge');
  if (_v2b) {
    if (injected > 0) {
      _v2b.textContent = appBadge('TEMP·RTU');
      _v2b.title = `RTU pressure injected: ${injected}/${SENSORS.length} sensors, P_nominal=${window._rtuPNominal?.toFixed(1)} mwc`;
    } else {
      _v2b.textContent = appBadge('TEMP');
    }
  }
}

// ── fetchAndUpdate: ดึง API แล้ว redraw ทั้งหมด ───────────────────────────
let apiStatus = 'loading'; // 'loading' | 'live' | 'fallback'

async function fetchAndUpdate() {
  const badge = document.querySelector('#header .badge');
  try {
    const res = await fetch(API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const mapped = mapApiData(json);
    if (mapped.length === 0) throw new Error('ไม่มีข้อมูลสถานี');

    // merge: เติมสถานีจาก SENSORS_FALLBACK ที่ไม่มีใน API (match ด้วย lat/lon 3 ตำแหน่ง)
    const apiCoords = new Set(mapped.map(s => `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`));
    const merged = [...mapped];
    SENSORS_FALLBACK.forEach(fb => {
      const key = `${fb.lat.toFixed(3)},${fb.lon.toFixed(3)}`;
      if (!apiCoords.has(key)) merged.push(fb);
    });
    SENSORS.length = 0;
    merged.forEach(s => SENSORS.push(s));

    // อัปเดต temp factor ทันทีหลังได้ SENSORS (ย้ายขึ้นมากันโค้ดอื่น throw ตัดตอน)
    try { updateTempFactor(SENSORS); } catch(e) { console.warn('[TempK] update fail:', e); }

    // บันทึกประวัติ (ไม่ fit k อัตโนมัติ — ใช้ K Default จาก Firebase)
    const hist = recordHistory(SENSORS);
    updateHistBadge(hist);

    // sync ขึ้น Firebase
    fbSaveLive(SENSORS);
    // บันทึก history ทุกสถานีที่มีค่าใหม่
    const now = Date.now();
    for (const s of SENSORS) {
      if (s.frc != null) fbSaveReading(String(s.id), { frc: s.frc, ec: s.ec ?? null, ts: now });
    }

    apiStatus = 'live';
    badge.textContent   = '● Live — ' + new Date().toLocaleTimeString('th-TH');
    badge.style.background = '#f0fff4';
    badge.style.borderColor = '#80e0a0';
    badge.style.color      = '#006020';
  } catch (err) {
    console.warn('[FRC] API error:', err.message);
    if (apiStatus === 'loading') {
      // ครั้งแรก: โหลด fallback
      SENSORS.length = 0;
      SENSORS_FALLBACK.forEach(s => SENSORS.push(s));
    }
    apiStatus = 'fallback';
    badge.textContent   = '⚠ Offline — ข้อมูลสำรอง';
    badge.style.background = '#fff8f0';
    badge.style.borderColor = '#f0c060';
    badge.style.color      = '#a05000';
  }

  // V27 Hybrid K — back-calculate K จาก live FRC ก่อน rebuild cache
  // (dangling renderHybridKPanel call removed in v37)

  // redraw ทุก layer
  // ครอบ fallback path ด้วย (ห่อกัน error ตัดตอน redraw)
  try { updateTempFactor(SENSORS); } catch(e) { console.warn('[TempK] update fail:', e); }

  _histCache = null; // invalidate history cache after new data
  buildMarkers();
  buildIdwCache();   // rebuild cache หลังได้ข้อมูล sensor ใหม่
  // re-inject after buildIdwCache so contour uses fresh RTU pressure
  injectRtuPressureToSensors();
  redrawContour();
  updateStats();
  renderTab();

  // ── Auto-start flow หลังข้อมูลพร้อม ──
  if (layers.flow && typeof startFlowAnimation === 'function' && SENSORS.length > 0) {
    document.getElementById('flow-btn').classList.add('active');
    startFlowAnimation();
  }
}

// ── K Tuner functions ────────────────────────────────────────────────────────
function renderKTuner() {
  const container = document.getElementById('ktuner-list');
  if (!container) return;

  const monitorSensors = SENSORS.filter(s => s.type === 'monitor' && s.id && typeof s.id === 'string');
  const fitCodes = Object.keys(STATION_K);

  const seen = new Set();
  const entries = [];
  for (const s of monitorSensors) {
    if (!seen.has(s.id)) { seen.add(s.id); entries.push({ code: s.id, name: s.name }); }
  }
  for (const c of fitCodes) {
    if (!seen.has(c)) {
      seen.add(c);
      const s = SENSORS.find(x => x.id != null && x.id.toString() === c);
      entries.push({ code: c, name: s ? s.name : c });
    }
  }

  if (entries.length === 0) {
    container.innerHTML = '<div style="font-size:10px;color:#c090c0;text-align:center;padding:8px;">รอสะสมข้อมูล...</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < entries.length; i++) {
    var code = entries[i].code;
    var name = entries[i].name;
    var kFit      = STATION_K[code];
    var kOverride = STATION_K_OVERRIDE[code];
    var kActive   = kOverride != null ? kOverride : (kFit != null ? kFit : K_total * 3600);
    var isOverride = kOverride != null;
    var isFitted   = kFit != null;
    var srcLabel = isOverride ? '✏️ manual' : isFitted ? '🤖 fit' : '⚙️ epanet';
    var srcColor = isOverride ? '#a04000' : isFitted ? '#006020' : '#8060a0';
    var kStr = kActive.toFixed(3);

    html += '<div style="border-bottom:1px solid #f8eef4;padding:5px 2px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">';
    html += '<span style="font-size:10px;color:#3a1020;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + name + '">' + name + '</span>';
    html += '<span style="font-size:8px;color:' + srcColor + ';margin-left:3px;flex-shrink:0;">' + srcLabel + '</span>';
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:4px;">';
    html += '<input type="range" id="kslider_' + code + '" min="0.01" max="3.0" step="0.01" value="' + kStr + '"';
    html += ' style="flex:1;accent-color:#cc0055;height:4px;cursor:pointer;"';
    html += ' oninput="onKSlider(\'' + code + '\',this.value)">';
    html += '<input type="number" id="kinput_' + code + '" min="0.01" max="3.0" step="0.01" value="' + kStr + '"';
    html += ' style="width:50px;border:1px solid #f0c8d8;border-radius:4px;padding:2px 4px;font-family:\'JetBrains Mono\',monospace;font-size:10px;color:#1a0a10;background:#fff8fa;text-align:right;"';
    html += ' oninput="onKInput(\'' + code + '\',this.value)">';
    html += '<span style="font-size:9px;color:#c080a0;width:16px;">/hr</span>';
    if (isOverride) {
      html += '<button onclick="resetOneK(\'' + code + '\')" title="reset" style="border:none;background:none;cursor:pointer;font-size:12px;padding:0 1px;color:#c06030;line-height:1;">↺</button>';
    } else {
      html += '<div style="width:16px;"></div>';
    }
    html += '</div>';
    if (isFitted) {
      html += '<div style="font-size:8px;color:#60a040;margin-top:1px;">fit: ' + kFit.toFixed(3) + '/hr</div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
}
function onKSlider(code, val) {
  const v = parseFloat(val);
  if (isNaN(v) || v <= 0) return;
  STATION_K_OVERRIDE[code] = v;
  const inp = document.getElementById('kinput_' + code);
  if (inp) inp.value = v.toFixed(3);
  buildMarkers();
}

function onKInput(code, val) {
  const v = parseFloat(val);
  if (isNaN(v) || v <= 0 || v > 3) return;
  STATION_K_OVERRIDE[code] = v;
  const sl = document.getElementById('kslider_' + code);
  if (sl) sl.value = v.toFixed(3);
  buildMarkers();
}

function resetOneK(code) {
  delete STATION_K_OVERRIDE[code];
  renderKTuner();
  buildMarkers();
}

function resetAllK() {
  Object.keys(STATION_K_OVERRIDE).forEach(k => delete STATION_K_OVERRIDE[k]);
  renderKTuner();
  buildMarkers();
}

// ── Export / Import localStorage History ────────────────────────────────────
function exportHistory() {
  try {
    const hist = loadHistory();
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      history: hist,
      stationK: STATION_K
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = 'mwa_history_' + dateStr + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showExportMsg('✅ Export สำเร็จ', '#006020');
  } catch(e) {
    showExportMsg('❌ Export ล้มเหลว: ' + e.message, '#a00000');
  }
}

function importHistory(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      // รองรับทั้ง format ใหม่ (version:1) และ raw history object
      const hist = data.version === 1 ? data.history : data;
      const kData = data.version === 1 ? (data.stationK || {}) : {};

      // validate
      if (typeof hist !== 'object' || Array.isArray(hist)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');

      // merge กับข้อมูลเดิม (ไม่ทับ)
      const existing = loadHistory();
      const cutoff = Date.now() - HIST_MAX_HOURS * 3600000;
      for (const [code, pts] of Object.entries(hist)) {
        if (!existing[code]) existing[code] = [];
        // เพิ่มเฉพาะจุดที่ไม่ซ้ำ ts
        const existingTs = new Set(existing[code].map(p => p.ts));
        const newPts = pts.filter(p => p.ts >= cutoff && !existingTs.has(p.ts));
        existing[code] = [...existing[code], ...newPts].sort((a,b) => a.ts - b.ts);
      }
      saveHistory(existing);

      // merge STATION_K
      for (const [code, k] of Object.entries(kData)) {
        if (!STATION_K[code]) STATION_K[code] = k;
      }

      // refit ไม่ทำอัตโนมัติแล้ว — ใช้ K Default จาก Firebase
      updateHistBadge(existing);
      renderKTuner();
      buildMarkers();

      const codes = Object.keys(hist).length;
      const pts = Object.values(hist).reduce((s,a) => s + a.length, 0);
      showExportMsg(`✅ Import สำเร็จ ${codes} สถานี ${pts} จุด`, '#006020');
    } catch(err) {
      showExportMsg('❌ Import ล้มเหลว: ' + err.message, '#a00000');
    }
    input.value = ''; // reset input
  };
  reader.readAsText(file);
}

function showExportMsg(msg, color) {
  const el = document.getElementById('export-msg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = color || '#333';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}


// ── Polling loop ──────────────────────────────────────────────────────────
buildIdwCache();                           // pre-compute cache ด้วย fallback sensors
fetchAndUpdate();                          // โหลดครั้งแรก
setInterval(fetchAndUpdate, POLL_INTERVAL); // poll ทุก 15 นาที

// ── URL Parameter Handler — flyTo + popup คุณภาพน้ำ สำหรับ LINE Bot ──────
(function handleUrlParams() {
  var params = new URLSearchParams(window.location.search);
  var flytoParam = params.get('flyto');
  var pinParam = params.get('pin');
  var stationParam = params.get('station');

  if (flytoParam) {
    var parts = flytoParam.split(',').map(Number);
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      var lat = parts[0];
      var lon = parts[1];
      var zoom = parts[2] || 15;

      // รอให้ map + data + search module โหลดเสร็จ
      setTimeout(function() {
        // ใช้ search input + trigger เพื่อให้ได้ popup คุณภาพน้ำเหมือน search บนแผนที่
        var searchInput = document.getElementById('map-search-input');
        if (searchInput) {
          searchInput.value = lat.toFixed(5) + ', ' + lon.toFixed(5);
          // dispatch input event เพื่อ trigger clear button
          searchInput.dispatchEvent(new Event('input'));
          setTimeout(function() {
            var searchBtn = document.getElementById('map-search-btn');
            if (searchBtn) searchBtn.click();

            // ปักหมุด pin เพิ่มเติม (ถ้ามี)
            if (pinParam) {
              setTimeout(function() {
                var pinParts = pinParam.split(',').map(Number);
                if (pinParts.length >= 2 && !isNaN(pinParts[0]) && !isNaN(pinParts[1])) {
                  var pinIcon = L.divIcon({
                    className: 'url-pin-marker',
                    html: '<div style="width:20px;height:20px;background:#cc0055;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(204,0,85,0.5),0 0 0 4px rgba(204,0,85,0.15);"></div>',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                  });
                  L.marker([pinParts[0], pinParts[1]], { icon: pinIcon, zIndexOffset: 8000 }).addTo(map);
                }
              }, 1000);
            }
          }, 800);
        } else {
          // fallback ถ้าไม่มี search input
          map.flyTo([lat, lon], zoom, { duration: 1.5 });
        }

        // ถ้ามี station → ค้นหาสถานีแล้ว flyTo พร้อม popup
        if (stationParam) {
          setTimeout(function() {
            var targetSensor = SENSORS.find(function(s) {
              return String(s.id).toUpperCase() === stationParam.toUpperCase();
            });
            if (targetSensor && searchInput) {
              searchInput.value = targetSensor.lat.toFixed(5) + ', ' + targetSensor.lon.toFixed(5);
              searchInput.dispatchEvent(new Event('input'));
              setTimeout(function() {
                var searchBtn = document.getElementById('map-search-btn');
                if (searchBtn) searchBtn.click();
              }, 500);
            }
          }, 1500);
        }
      }, 3000);
    }
  }
})();

// ── Auto-start flow เมื่อแผนที่พร้อม ──
setTimeout(function() {
  if (layers.flow && typeof startFlowAnimation === 'function') {
    document.getElementById('flow-btn').classList.add('active');
    startFlowAnimation();
  }
}, 800);

// โหลด history จาก Firebase เมื่อ SDK พร้อม
async function initFromFirebase() {
  const badge = document.querySelector('#header .badge');
  if (badge) { badge.textContent = '⏳ โหลดข้อมูลย้อนหลัง...'; badge.style.color = '#555'; }
  try {
    // ═══ CRITICAL: โหลด K Default จาก Firebase ก่อน fitAllK ═══
    // เพื่อให้ fitAllK ไม่ทับค่า K ที่ user ยืนยันแล้ว
    var kCount = await fbLoadKDefault();
    console.log('[init] K Default loaded:', kCount, 'stations → STATION_K has', Object.keys(STATION_K).length, 'entries');
    
    // โหลด history ย้อนหลัง 24h
    const fbHist = await fbLoadHistory();
    const localHist = loadHistory();
    // merge: Firebase + localStorage
    const merged = { ...localHist };
    for (const [code, pts] of Object.entries(fbHist)) {
      if (!merged[code]) merged[code] = [];
      // เพิ่มจุดที่ไม่มีใน local
      const localTs = new Set(merged[code].map(p => p.ts));
      for (const p of pts) {
        if (!localTs.has(p.ts)) merged[code].push(p);
      }
      merged[code].sort((a,b) => a.ts - b.ts);
    }
    saveHistory(merged);
    const totalPts = Object.values(merged).reduce((s,a) => s+a.length, 0);
    console.log(`[Firebase] โหลด history ${totalPts} จุด จาก Firebase`);
    updateHistBadge(merged);
    // ═══ ไม่เรียก fitAllK อีกแล้ว ═══
    // K Default จาก Firebase (_k_default) คือ truth
    // fitAllK จะ fit ค่า K ใหม่จาก history ซึ่งอาจไม่ตรงกับค่าที่ user ยืนยันไว้
    // ถ้าต้องการ fit ใหม่ → ให้กด "Auto-fit K All" ใน Report แล้วกดยืนยัน
    console.log('[init] ข้าม fitAllK — ใช้ K Default จาก Firebase (' + Object.keys(STATION_K).length + ' stations)');

    // เริ่ม realtime listener
    fbListenRealtime();

    if (badge && totalPts > 0 && apiStatus !== 'live') {
      // แสดงเฉพาะตอน API ยังไม่ live — ไม่ทับสถานะ "● Live" ของ poll ที่สำเร็จไปแล้ว
      badge.textContent = `✅ โหลด ${totalPts} จุดย้อนหลัง`;
      badge.style.color = '#006020';
    }
  } catch(e) {
    console.warn('[Firebase] init error:', e.message);
  }
}

// รอ Firebase SDK พร้อม แล้วโหลด
if (window._fbReady) {
  initFromFirebase();
} else {
  window.addEventListener('firebase-ready', () => initFromFirebase(), { once: true });
}

// ── Clock ─────────────────────────────────────────────────────────────────
function tick(){document.getElementById('clock').textContent=new Date().toLocaleTimeString('th-TH');}









// ── Unified Timeline (History + Forecast) ─────────────────────────────────
// slider: 0-(N-1) = ย้อนหลัง Nh, N = ปัจจุบัน, N+1..N+6 = forecast
let FC_HIST_STEPS = 72;  // default 72h (เปลี่ยนได้ 24/72/168)
let FC_NOW_STEP   = 72;
const FC_FORE_STEPS = 6;
let FC_TOTAL      = FC_HIST_STEPS + FC_FORE_STEPS;

let _unifiedFrames = []; // array of {ts, arr} รวม hist+fore
let _unifiedLoaded = false;

function _updateNowMarker() {
  const slider = document.getElementById('forecast-slider');
  const marker = document.getElementById('fc-now-marker');
  if (!slider || !marker) return;
  const max = parseInt(slider.max) || FC_TOTAL;
  const pct = (FC_HIST_STEPS / max) * 100;
  marker.style.left = pct + '%';
}

let _unifiedLoading = false; // guard ป้องกันโหลดซ้อน
async function loadUnifiedTimeline() {
  if (_unifiedLoading) { console.warn('[Timeline] skip — already loading'); return; }
  _unifiedLoading = true;
  _pauseTick = true; // หยุด tick() ชั่วคราวกัน race condition
  const lbl  = document.getElementById('forecast-time-label');
  const badge = document.getElementById('fc-mode-badge');
  if (lbl) lbl.textContent = 'กำลังโหลด...';
  _unifiedFrames = [];
  _unifiedLoaded = false;

  // ── HISTORY frames (ย้อนหลัง ทุก 1h) ──
  const bins = await getHistoryBins(); // {ts, snap, snapEc}[]
  // resample เป็น FC_HIST_STEPS ช่อง (1 ช่อง/ชั่วโมง)
  const nowMs = Date.now();
  for (let h = FC_HIST_STEPS - 1; h >= 0; h--) {
    const targetTs = nowMs - h * 3600000;
    // หา bin ที่ใกล้ที่สุด
    let closest = null, closestD = Infinity;
    for (const b of bins) {
      const d = Math.abs(b.ts - targetTs);
      if (d < closestD) { closestD = d; closest = b; }
    }
    let arr;
    if (closest && closestD < 2*3600000) {
      if (PARAM_MODE === 'ec') {
        // ถ้า snapEc ว่าง (ช่วงก่อน fix) → ใช้ค่าปัจจุบัน (s.ec)
        const snapEc = (Object.keys(closest.snapEc||{}).length > 0)
          ? closest.snapEc : {};
        arr = await buildSnapFrameAsync(()=>buildSnapFrameEc(snapEc));
      } else {
        arr = await buildSnapFrameAsync(()=>buildSnapFrame(closest.snap||{}));
      }
    } else {
      arr = PARAM_MODE === 'ec'
        ? await buildSnapFrameAsync(()=>buildSnapFrameEc({}))
        : await buildSnapFrameAsync(()=>buildSnapFrame({}));
    }
    _unifiedFrames.push({ ts: targetTs, arr, isHistory: true });
    if (lbl && (h % 10 === 0)) lbl.textContent = `โหลด ${FC_HIST_STEPS-h}/${FC_HIST_STEPS}...`;
    if (h % 10 === 0) await new Promise(r => setTimeout(r, 0)); // yield ทุก 10 frames
  }

  // ── NOW frame ──
  const nowArr = PARAM_MODE === 'ec'
    ? await buildSnapFrameAsync(()=>buildSnapFrameEc({}))
    : await buildSnapFrameAsync(()=>buildSnapFrame({}));
  _unifiedFrames.push({ ts: nowMs, arr: nowArr, isNow: true });

  // ── FORECAST frames (+1h..+6h) ──
  if (PARAM_MODE !== 'ec') {
    for (let f = 1; f <= 6; f++) {
      const ts = nowMs + f * 3600000;
      const arr = await buildSnapFrameAsync(()=>buildForecastSnap(f));
      _unifiedFrames.push({ ts, arr, isForecast: true });
      if (lbl) lbl.textContent = `คาดการณ์ ${f}/6...`;
      await new Promise(r => setTimeout(r, 0));
    }
  } else {
    // EC forecast: EC ไม่มี decay → ใช้ค่าปัจจุบันทุก frame
    for (let f = 1; f <= 6; f++) {
      const ts = nowMs + f * 3600000;
      const arr = await buildSnapFrameAsync(()=>buildSnapFrameEc({}));
      _unifiedFrames.push({ ts, arr, isForecast: true });
      await new Promise(r => setTimeout(r, 0));
    }
  }

  _unifiedLoaded = true;
  _unifiedLoading = false;
  _pauseTick = false; // กลับมา tick() ปกติ
  // debug: verify frame order
  let orderOk = true;
  for (let i = 1; i < _unifiedFrames.length; i++) {
    if (_unifiedFrames[i].ts < _unifiedFrames[i-1].ts) {
      console.error(`[Timeline] ORDER BUG at index ${i}: ${new Date(_unifiedFrames[i-1].ts).toLocaleString()} > ${new Date(_unifiedFrames[i].ts).toLocaleString()}`);
      orderOk = false;
    }
  }
  if (orderOk) {
    console.log(`[Timeline] ✅ loaded ${_unifiedFrames.length} frames IN ORDER`);
  } else {
    console.error(`[Timeline] ❌ FRAMES NOT IN ORDER — sorting now`);
    // emergency sort เพื่อให้ ticks ถูก
    const nowFrame = _unifiedFrames.find(f => f.isNow);
    const foreFrames = _unifiedFrames.filter(f => f.isForecast);
    const histFrames = _unifiedFrames.filter(f => f.isHistory);
    histFrames.sort((a,b) => a.ts - b.ts);
    foreFrames.sort((a,b) => a.ts - b.ts);
    _unifiedFrames = [...histFrames, ...(nowFrame ? [nowFrame] : []), ...foreFrames];
    console.log(`[Timeline] sorted: first=${new Date(_unifiedFrames[0]?.ts).toLocaleString()}, last=${new Date(_unifiedFrames[_unifiedFrames.length-1]?.ts).toLocaleString()}`);
  }
  console.log(`[Timeline] first=${new Date(_unifiedFrames[0]?.ts).toLocaleString()}, last=${new Date(_unifiedFrames[_unifiedFrames.length-1]?.ts).toLocaleString()}`);
  const slider = document.getElementById('forecast-slider');
  if (slider) {
    const nowIdx = _unifiedFrames.findIndex(f => f.isNow);
    const nowI   = nowIdx >= 0 ? nowIdx : FC_HIST_STEPS;
    const lastI  = _unifiedFrames.length - 1;
    // default: history mode เริ่มที่ปัจจุบัน
    slider.min   = 0;
    slider.max   = nowI;
    slider.value = nowI;
  }
  _updateNowMarker();
  buildUnifiedTicks();
  seekForecastUnified(FC_HIST_STEPS);
  if (lbl) lbl.textContent = 'ปัจจุบัน';
}

function buildSnapFrameAsync(buildFn) {
  // เมื่อ _pauseTick = true (ระหว่างโหลด timeline) → ทำ sync เลย ไม่ yield
  if (_pauseTick) {
    try {
      const result = buildFn();
      if (result instanceof Float32Array) return Promise.resolve(result);
      if (_idwCache) return Promise.resolve(new Float32Array(_idwCache));
      return Promise.resolve(null);
    } catch(e) { return Promise.resolve(null); }
  }
  return new Promise(resolve => {
    setTimeout(() => {
      try {
        const result = buildFn();
        if (result instanceof Float32Array) {
          resolve(result);
        } else if (_idwCache) {
          resolve(new Float32Array(_idwCache));
        } else {
          resolve(null);
        }
      } catch(e) {
        resolve(null);
      }
    }, 0);
  });
}

function buildForecastSnap(foreHr) {
  // คำนวณ FRC forecast ของทุกสถานี ณ เวลา +foreHr
  const origFrc = {};
  const origEc = {};
  const nowMs = Date.now();
  
  for (const s of SENSORS) {
    origFrc[String(s.id)] = s.frc;
    origEc[String(s.id)] = s.ec;
    
    if (s.type === 'plant') {
      // โรงผลิต → ค้างที่ค่าปัจจุบัน (flat) เพราะเติมคลอรีนตลอด
      // s.frc คงเดิม ไม่เปลี่ยน
    } else if (s.type === 'pump' || s.type === 'monitor') {
      // Pump/Monitor → Blend จาก source + travel time
      const sName = (s.name||'').trim();
      const rootInfo = ROOT_SOURCE_MAP[sName] || ROOT_SOURCE_MAP[sName.replace(/\s+/g,' ')];
      if (rootInfo && rootInfo.root) {
        const srcCode = typeof getSrcCodeFromLabel==='function' ? getSrcCodeFromLabel(rootInfo.root) : null;
        const srcSensor = srcCode ? SENSORS.find(x => x.id && x.id.toString()===srcCode) : null;
        const ttHours = rootInfo.ttRoot || 0;
        if (srcSensor && ttHours > 0) {
          const stCode = String(s.id).replace(/\/|\./g,'-');
          const k_hr = getStationKhr(stCode);
          const frc0 = origFrc[String(s.id)] || s.frc || 0;
          
          // Blend
          const frac = Math.min(1, foreHr / ttHours);
          const fOld = frc0 * Math.exp(-k_hr * foreHr);
          
          // source FRC ณ เวลาที่น้ำออกจาก source (อนาคต → ค่าล่าสุด flat)
          const srcTargetTs = nowMs + (foreHr - ttHours) * 3600000;
          const srcCode2 = String(srcSensor.id).replace(/\/|\./g,'-');
          const fSrcAtT = typeof getHistFrcAt==='function'
            ? getHistFrcAt(srcCode2, srcTargetTs, srcSensor.frc||1.0, 0)
            : (srcSensor.frc||1.0);
          const fNew = fSrcAtT * Math.exp(-k_hr * ttHours);
          
          s.frc = Math.max(0, fOld*(1-frac) + fNew*frac);
        } else {
          // ไม่มี source mapping → ค้าง flat
        }
      }
      // ถ้าไม่มี rootInfo → ค้าง flat (ค่าปัจจุบัน)
    }
  }
  
  try {
    const _frcFn = window.frcZone || frcZone;
    const arr = buildOneFrame((lat, lon) => _frcFn(lat, lon));
    return arr;
  } finally {
    for (const s of SENSORS) {
      s.frc = origFrc[String(s.id)];
      s.ec = origEc[String(s.id)];
    }
  }
}

function buildUnifiedTicks() {
  const el = document.getElementById('forecast-ticks');
  if (!el || !_unifiedFrames.length) return;
  el.innerHTML = '';
  el.style.cssText = 'position:relative;height:16px;margin:0 2px;';

  const slider = document.getElementById('forecast-slider');
  const minI = parseInt(slider.min);
  const maxI = parseInt(slider.max);
  const total = maxI - minI;
  if (total <= 0) return;

  // จำนวน tick ที่ต้องการ (ไม่เกิน 8)
  const numTicks = Math.min(8, total + 1);
  const isDark = document.body.classList.contains('dark');
  const histColor = isDark ? '#d0d0d0' : '#444';

  for (let t = 0; t < numTicks; t++) {
    const frameIdx = minI + Math.round(t * total / (numTicks - 1));
    const f = _unifiedFrames[frameIdx];
    if (!f) continue;
    const pct = ((frameIdx - minI) / total) * 100;
    const d = new Date(f.ts);
    const s = document.createElement('span');
    const color = f.isNow ? '#ff6600' : f.isForecast ? '#4499dd' : histColor;
    s.style.cssText = `position:absolute;font-size:9px;font-weight:700;white-space:nowrap;color:${color};top:0;`;

    // จัดตำแหน่ง: ซ้ายสุด align left, ขวาสุด align right, กลางๆ center
    if (t === 0) {
      s.style.left = '0';
    } else if (t === numTicks - 1) {
      s.style.right = '0';
    } else {
      s.style.left = pct + '%';
      s.style.transform = 'translateX(-50%)';
    }

    if (f.isNow) {
      s.textContent = '▼now';
    } else {
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const hh = String(d.getHours()).padStart(2,'0');
      s.textContent = total > 25 ? `${dd}/${mm} ${hh}:00` : `${hh}:00`;
    }
    el.appendChild(s);
  }
}

function showSliderTooltip(slider) {
  const tip = document.getElementById('fc-tooltip');
  if (!tip || !_unifiedLoaded) return;
  const idx = parseInt(slider.value);
  const frame = _unifiedFrames[idx];
  if (!frame) return;
  const d = new Date(frame.ts);
  const thDays = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const dayName = thDays[d.getDay()];
  tip.textContent = frame.isNow ? '⬤ ปัจจุบัน'
    : `${dayName} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;
  // position tooltip above thumb
  const min = parseInt(slider.min), max = parseInt(slider.max);
  const pct = ((idx - min) / (max - min)) * 100;
  tip.style.left = pct + '%';
  tip.style.display = 'block';
}

function seekForecastUnified(idx) {
  idx = parseInt(idx);
  if (!_unifiedLoaded || !_unifiedFrames[idx]) return;
  const frame = _unifiedFrames[idx];
  const badge = document.getElementById('fc-mode-badge');
  const lbl   = document.getElementById('forecast-time-label');

  // อัปเดต contour
  if (frame.arr) {
    _idwCache = frame.arr;
    // set resolution ให้ตรงกับ frame (FC_RES หรือ CACHE_RES)
    _idwCacheRes = FC_RES; // ทุก frame ใช้ FC_RES=30
    redrawContour(0);
  } else {
    _idwCacheRes = CACHE_RES;
    buildIdwCache(); redrawContour(0);
  }

  // label
  const d = new Date(frame.ts);
  const thDays = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const dayName = thDays[d.getDay()];
  const timeStr = `${dayName} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;
  if (lbl) lbl.textContent = frame.isNow ? '⬤ ปัจจุบัน' : timeStr;
  if (badge) {
    badge.textContent = frame.isForecast ? '⏩ คาดการณ์' : frame.isNow ? '⬤ Live' : '⏪ ย้อนหลัง';
    badge.style.background = frame.isForecast ? '#1a3a5c' : frame.isNow ? '#3a1500' : '#222';
    badge.style.color = frame.isForecast ? '#88ccff' : frame.isNow ? '#ff9955' : '#aaa';
  }
}

// openForecastBar override merged into main function below

let _pauseTick = false;
setInterval(()=>{ if (!_pauseTick) tick(); },1000); tick();

// Auto-open forecast bar disabled


// ══════════════════════════════════════════════════════════════════
// FORECAST ANIMATION ENGINE
// ══════════════════════════════════════════════════════════════════
let _fcFrames = null, _fcFrame = 0, _fcPlaying = false, _fcRAF = null, _fcLastTime = 0;

// ── helper: หา stationCode ของต้นทางจาก rootLabel ─────────────────────────
function getSrcCodeFromLabel(rootLabel) {
  if (!rootLabel) return null;
  const s = SENSORS.find(s => {
    const n = s.name?.trim() || '';
    if (rootLabel.includes('TR1') && n.includes('TR1') && n.includes('สูบส่ง')) return true;
    if (rootLabel.includes('TR2') && n.includes('TR2') && n.includes('สูบส่ง')) return true;
    if (rootLabel.includes('TR3') && n.includes('TR3') && n.includes('สูบส่ง')) return true;
    // MDIS = สถานีสูบจ่ายน้ำมหาสวัสดิ์ (SP12) ≠ MTR = สถานีสูบส่งน้ำมหาสวัสดิ์ (SP11)
    if (rootLabel.includes('MDIS') && n.includes('สูบจ่ายน้ำมหาสวัสดิ์')) return true;
    if ((rootLabel.includes('MH') || rootLabel.includes('MTR')) && !rootLabel.includes('MDIS') && n.includes('สูบส่งน้ำมหาสวัสดิ์')) return true;
    if (rootLabel.includes('Dis1') && n.includes('Dis1')) return true;
    if (rootLabel.includes('Dis2') && n.includes('Dis2')) return true;
    if (rootLabel.includes('ธนบุรี') && n.includes('ธนบุรี') && n.includes('โรงงาน')) return true;
    if (rootLabel.includes('สามเสน') && n.includes('สามเสน')) return true;
    // สจ. ต่างๆ (สำหรับ monitor 1 hop)
    if (rootLabel.includes('สจ.ลุมพินี') && n.includes('ลุมพินี')) return true;
    if (rootLabel.includes('สจ.สำโรง') && n.includes('สำโรง')) return true;
    if (rootLabel.includes('สจ.มีนบุรี') && n.includes('มีนบุรี') && n.includes('สูบจ่าย')) return true;
    if (rootLabel.includes('สจ.คลองเตย') && n.includes('คลองเตย')) return true;
    if (rootLabel.includes('สจ.ลาดพร้าว') && n.includes('ลาดพร้าว')) return true;
    if (rootLabel.includes('สจ.ราษฎร์บูรณะ') && n.includes('ราษฎร์บูรณะ')) return true;
    if (rootLabel.includes('สจ.ลาดกระบัง') && n.includes('ลาดกระบัง') && n.includes('สูบจ่าย')) return true;
    if (rootLabel.includes('สจ.บางพลี') && n.includes('บางพลี') && n.includes('สูบจ่าย')) return true;
    if (rootLabel.includes('สจ.ราษฎร์บูรณะ') && n.includes('ราษฎร์บูรณะ')) return true;
    if (rootLabel.includes('สจ.เพชรเกษม') && n.includes('เพชรเกษม')) return true;
    if (rootLabel.includes('สจ.ท่าพระ') && n.includes('ท่าพระ')) return true;
    if (rootLabel.includes('สจ.ลุมพินี') && n.includes('ลุมพินี')) return true;
    return false;
  });
  return s?.id?.toString() || null;
}

// ── History cache for forecast computation (avoid repeated JSON.parse) ────────
let _histCache = null;
let _histCacheTs = 0;
function getHistCached() {
  const now = Date.now();
  if (!_histCache || now - _histCacheTs > 10000) { // refresh every 10s
    _histCache = loadHistory();
    // merge Firebase history ด้วย
    var fbH = window._rpFirebaseHist || {};
    Object.keys(fbH).forEach(function(code) {
      if (!_histCache[code]) _histCache[code] = [];
      var existing = new Set(_histCache[code].map(function(p){return Math.round(p.ts/60000);}));
      (fbH[code]||[]).forEach(function(p) {
        if (p && p.ts && !existing.has(Math.round(p.ts/60000))) {
          _histCache[code].push(p);
        }
      });
    });
    _histCacheTs = now;
  }
  return _histCache;
}

// ── หา frc ต้นทาง ณ เวลา targetTs จาก history ───────────────────────────────
function getHistFrcAt(srcCode, targetTs, fallback, fallbackSlope) {
  const hist = getHistCached();
  const pts = (hist[srcCode] || []).sort((a,b) => a.ts-b.ts);
  if (!pts.length) return fallback;
  
  let best = null, bestDt = Infinity;
  for (const p of pts) {
    const dt = Math.abs(p.ts - targetTs);
    if (dt < bestDt) { bestDt = dt; best = p; }
  }
  // ถ้าอยู่ใน ±2 ชม. ใช้ค่าจริง
  if (best && bestDt < 2*3600000) return best.frc;
  
  // ถ้า targetTs อยู่ในอนาคต (ไม่มีข้อมูลจริง) → ใช้ค่าล่าสุด flat
  // สมมติโรงผลิตจ่ายคลอรีนคงที่ที่ระดับปัจจุบัน
  if (targetTs > Date.now()) {
    var lastPt = pts[pts.length-1];
    return lastPt ? lastPt.frc : fallback;
  }
  
  // ถ้า targetTs อยู่ในอดีต แต่ไกลกว่า 2 ชม. → ใช้จุดที่ใกล้ที่สุด
  return best ? best.frc : fallback;
}

// คำนวณ FRC forecast ของ pump station ณ เวลา +deltaHr
// ใช้ history จริงของต้นทาง offset ด้วย travel time

// คำนวณ FRC forecast ที่จุด (lat,lon) ณ เวลา +deltaHr
// = FRC_forecast ของ pump ต้นทาง × spatial decay

// ── ใช้ resolution ต่ำกว่าตอน animate เพื่อไม่ให้ค้าง ──────────────────────
const FC_RES = 50; // 51×51 grid — ละเอียดขึ้น

function buildOneFrame(fn) {
  // build 1 frame ด้วย resolution ต่ำ
  const rows = FC_RES + 1;
  const arr = new Float32Array(rows * rows);
  const dlat = (CACHE_LAT1-CACHE_LAT0)/FC_RES;
  const dlon = (CACHE_LON1-CACHE_LON0)/FC_RES;
  for (let j=0; j<rows; j++) {
    const lat = CACHE_LAT0 + j*dlat;
    for (let i=0; i<rows; i++) {
      arr[j*rows+i] = fn(lat, CACHE_LON0+i*dlon);
    }
  }
  return arr;
}

// bilinear lookup สำหรับ FC_RES cache

// ── History: สร้าง snapshot จาก localStorage ─────────────────────────────────
async function getHistoryBins() {
  // ดึงจาก Firebase เท่านั้น (เสถียรกว่า localStorage)
  // fallback localStorage เฉพาะเมื่อ Firebase ไม่พร้อม
  let hist = {};
  if (window._fbReady && window._fb) {
    try {
      hist = await fbLoadHistory();
      console.log('[HistBins] loaded from Firebase:', Object.keys(hist).length, 'stations');
    } catch(e) {
      console.warn('[HistBins] Firebase failed, fallback to localStorage:', e.message);
      hist = loadHistory();
    }
  } else {
    console.warn('[HistBins] Firebase not ready, fallback to localStorage');
    hist = loadHistory();
  }

  const BIN = 30*60000, cutoff = Date.now()-Math.max(FC_HIST_STEPS, 168)*3600000;
  const binMap = {};
  for (const [code,pts] of Object.entries(hist)) {
    for (const p of pts) {
      if (p.ts < cutoff) continue;
      const b = Math.round(p.ts/BIN)*BIN;
      if (!binMap[b]) binMap[b] = {};
      if (p.frc != null) binMap[b][code] = p.frc;
      if (p.ec  != null) { if (!binMap[b]._ec) binMap[b]._ec={}; binMap[b]._ec[code] = p.ec; }
    }
  }
  const result = Object.keys(binMap).sort().map(b=>({ts:parseInt(b), snap:binMap[b], snapEc:binMap[b]._ec||{}}));
  console.log(`[HistBins] ${result.length} bins, range: ${result.length ? new Date(result[0].ts).toLocaleString() + ' → ' + new Date(result[result.length-1].ts).toLocaleString() : 'empty'}`);
  return result;
}


function buildSnapFrameEc(snapEc) {
  // EC history snapshot — nearest zone ใช้ค่า EC จาก snapEc
  const sources = SENSORS
    .filter(s => _SOURCE_TYPES.has(s.type) && !_FRC_ZONE_EXCL_IDS.has(String(s.id)) && !_FRC_ZONE_EXCL_NAMES.has(s.name?.trim()))
    .map(s => {
      const c = s.id?.toString();
      const ecVal = snapEc[c] != null ? snapEc[c] : (s.ec != null ? s.ec : getParamVal(s));
      return { ...s, _snapEc: ecVal };
    });

  function ecZoneSnap(lat, lon) {
    // rev16.0: VC zone — ใช้ค่า EC จาก source ตรงๆ (ไม่มีการสลายตัว)
    if (typeof VC_STATIONS !== 'undefined') {
      for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES || {})) {
        if (!sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
        if (!pointInPolygon(lat, lon, zone.coords)) continue;
        const vc = VC_STATIONS.find(v => v.id === sid);
        if (!vc || !isVcActive(vc)) continue;
        // EC จาก source ตรงๆ — ไม่ decay
        const src = sources.find(x => String(x.id) === vc.sourceId);
        if (src && src._snapEc != null) return src._snapEc;
      }
    }
    // zone สถานีปกติ (ข้าม VC)
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES || {})) {
      if (!zone.coords || zone.coords.length < 3) continue;
      if (sid.startsWith('VC')) continue;
      if (pointInPolygon(lat, lon, zone.coords)) {
        const s = sources.find(x => String(x.id) === sid);
        if (s) return s._snapEc;
      }
    }
    if (!sources.length) return 0;
    let nearest = null, minD = Infinity;
    for (const s of sources) {
      const a = getAnchorLatLon(s);
      const d = (a.lat-lat)**2 + (a.lon-lon)**2;
      if (d < minD) { minD = d; nearest = s; }
    }
    return nearest._snapEc;
  }
  return buildOneFrame(ecZoneSnap);
}

function buildSnapFrame(snap) {
  // สร้าง closure frcZone ที่ใช้ snap โดยตรง ไม่ต้อง override SENSORS
  // เพื่อป้องกัน race condition กับ poll API
  // สร้าง sources พร้อม frc จาก snap (ไม่แตะ SENSORS จริง)
  const sources = SENSORS
    .filter(s => _SOURCE_TYPES.has(s.type) && !_FRC_ZONE_EXCL_IDS.has(String(s.id))
      && !_FRC_ZONE_EXCL_NAMES.has(s.name?.trim()))
    .map(s => {
      const c = s.id?.toString();
      return { ...s, frc: snap[c] != null ? snap[c] : s.frc };
    });

  function frcZoneSnap(lat, lon) {
    // rev16.0: VC Zone — ถ้า VC เปิด (>0%) ยึดพื้นที่ / ถ้า VC ปิด (0%) ไม่มีผล ปล่อย fallback
    if (typeof VC_STATIONS !== 'undefined') {
      for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES || {})) {
        if (!sid.startsWith('VC') || !zone.coords || zone.coords.length < 3) continue;
        if (!pointInPolygon(lat, lon, zone.coords)) continue;
        const vc = VC_STATIONS.find(v => v.id === sid);
        if (!vc || !isVcActive(vc)) continue; // VC ปิด (0%) / null → ไม่มีผล ข้ามไป
        const vcFrc = (typeof getVcFrc === 'function') ? getVcFrc(sid) : vc.frc;
        if (vcFrc <= 0) return 0;
        // Decay ต่อจาก VC ไปยังจุดนี้
        const dKm = Math.sqrt((vc.lat-lat)**2+(vc.lon-lon)**2)*DEG_TO_KM;
        const pair = (typeof VC_PAIR !== 'undefined') ? VC_PAIR[sid] : null;
        const kLocal = pair ? pair.K : 0.05;
        const tLocal = dKm / 1.5;
        return Math.max(0, vcFrc * Math.exp(-kLocal * tLocal));
      }
    }
    // เช็ค CUSTOM_ZONES (สถานีสูบจ่ายปกติ — ข้าม VC)
    for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES || {})) {
      if (!zone.coords || zone.coords.length < 3) continue;
      if (sid.startsWith('VC')) continue;
      if (pointInPolygon(lat, lon, zone.coords)) {
        const s = sources.find(x => String(x.id) === sid);
        if (s) {
          const dKm = Math.sqrt((s.lat-lat)**2+(s.lon-lon)**2)*DEG_TO_KM;
          return Math.max(0, s.frc * epanetDecay(dKm, s));
        }
      }
    }
    // fallback: nearest-neighbor เดิม
    if (!sources.length) return 0;
    let nearest = null, minD = Infinity;
    for (const s of sources) {
      const a = getAnchorLatLon(s);
      const d = (a.lat-lat)**2 + (a.lon-lon)**2;
      if (d < minD) { minD = d; nearest = s; }
    }
    const dKm = Math.sqrt((nearest.lat-lat)**2+(nearest.lon-lon)**2)*DEG_TO_KM;
    return Math.max(0, nearest.frc * epanetDecay(dKm, nearest));
  }

  return buildOneFrame(frcZoneSnap);
}

// ── สร้าง frames ทีละ frame ด้วย async setTimeout ────────────────────────────
let _fcBuildQueue = [];
let _fcBuildTimer = null;

function cancelBuild() {
  if (_fcBuildTimer) { clearTimeout(_fcBuildTimer); _fcBuildTimer=null; }
  _fcBuildQueue = [];
}


// ── Apply frame ───────────────────────────────────────────────────────────────

// idw patch removed — ใช้ _idwCache swap แทน

// ── Playback control ──────────────────────────────────────────────────────────
let _fcMode = 'history';

function stopForecastPlay() {
  _fcPlaying = false;
  if (_fcRAF) { cancelAnimationFrame(_fcRAF); _fcRAF=null; }
  const btn = document.getElementById('fc-play-btn');
  if (btn) { btn.textContent='▶ Play'; btn.classList.remove('active'); }
}

function startForecastPlay() {
  if (!_unifiedLoaded || !_unifiedFrames.length) return;
  const slider = document.getElementById('forecast-slider');
  const min = parseInt(slider.min);
  const max = parseInt(slider.max);

  // ถ้า slider อยู่ที่ max แล้ว → reset กลับไปที่ min ก่อน play
  if (parseInt(slider.value) >= max) {
    slider.value = min;
    seekForecastUnified(min);
  }

  _fcPlaying = true; _fcLastTime = performance.now();
  const btn = document.getElementById('fc-play-btn');
  if (btn) { btn.textContent='⏸'; btn.classList.add('active'); }
  const fps = _fcMode === 'history' ? 1.5 : 0.8;

  function tick(now) {
    if (!_fcPlaying) return;
    if ((now - _fcLastTime) / 1000 >= 1/fps) {
      _fcLastTime = now;
      const cur = parseInt(slider.value);
      const next = cur + 1;
      if (next > parseInt(slider.max)) { stopForecastPlay(); return; }
      seekForecastUnified(next);
      slider.value = next;
    }
    _fcRAF = requestAnimationFrame(tick);
  }
  _fcRAF = requestAnimationFrame(tick);
}

function toggleForecast() { _fcPlaying ? stopForecastPlay() : startForecastPlay(); }
function resetForecast() {
  stopForecastPlay();
  const slider = document.getElementById('forecast-slider');
  const nowI = _unifiedFrames.findIndex(f => f.isNow);
  const idx = nowI >= 0 ? nowI : FC_HIST_STEPS;
  if (slider) slider.value = idx;
  seekForecastUnified(idx);
}

function setFcMode(mode) {
  _fcMode = mode;
  stopForecastPlay(); cancelBuild();
  _fcFrames = null;
  document.getElementById('fc-mode-hist').classList.toggle('active', mode==='history');
  document.getElementById('fc-mode-fore').classList.toggle('active', mode==='forecast');

  const slider = document.getElementById('forecast-slider');
  if (slider && _unifiedLoaded && _unifiedFrames.length > 0) {
    const nowIdx = _unifiedFrames.findIndex(f => f.isNow);
    const nowI   = nowIdx >= 0 ? nowIdx : FC_HIST_STEPS;
    const lastI  = _unifiedFrames.length - 1;

    if (mode === 'history') {
      slider.min   = 0;
      slider.max   = nowI;   // ถึงปัจจุบัน
      slider.value = 0;      // เริ่มจากต้น (-24h)
    } else {
      slider.min   = nowI;   // เริ่มที่ปัจจุบัน (รวม NOW frame)
      slider.max   = lastI;  // ถึง +6h
      slider.value = nowI;   // เริ่มที่ปัจจุบัน
    }
    buildUnifiedTicks(); // rebuild ticks ตาม range ใหม่
    seekForecastUnified(parseInt(slider.value));
  } else {
    loadUnifiedTimeline().then(() => setFcMode(mode));
  }
}

async function changeHistRange(hours) {
  hours = parseInt(hours);
  FC_HIST_STEPS = hours;
  FC_NOW_STEP   = hours;
  FC_TOTAL      = FC_HIST_STEPS + FC_FORE_STEPS;
  // update label
  const rl = document.getElementById('fc-range-label');
  if (rl) rl.textContent = hours >= 168 ? '-7d' : `-${hours}h`;
  // force reload
  _unifiedLoaded = false;
  _unifiedLoading = false; // reset guard
  _unifiedFrames = [];
  await loadUnifiedTimeline();
  setFcMode(_fcMode || 'history');
}



function openForecastBar() {
  const bar = document.getElementById('forecast-bar');
  if (!bar) return; // guard
  const togFloat = document.getElementById('forecast-toggle-float');
  if (bar.classList.contains('visible')) {
    bar.classList.remove('visible');
    document.body.classList.remove('fc-open');
    if (togFloat) togFloat.style.display = '';
    stopForecastPlay(); cancelBuild();
    _idwCacheRes = CACHE_RES; buildIdwCache(); redrawContour();
  } else {
    bar.classList.add('visible');
    document.body.classList.add('fc-open');
    if (togFloat) togFloat.style.display = 'none';
    _fcMode = 'history';
    document.getElementById('fc-mode-hist').classList.add('active');
    document.getElementById('fc-mode-fore').classList.remove('active');
    _fcFrames = null;
    if (_unifiedLoaded) {
      setFcMode('history');
    } else {
      loadUnifiedTimeline();
    }
  }
}

// ── Import TWQ XLSX/CSV ───────────────────────────────────────────────────────
function thaiDateToTs(val) {
  if (!val) return null;
  const m = String(val).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const [,d,mo,yBE,h,mn] = m;
  const yAD = parseInt(yBE) - 543;
  return new Date(yAD, parseInt(mo)-1, parseInt(d), parseInt(h), parseInt(mn)).getTime();
}

function resolveStationId(name) {
  if (!name) return null;
  const clean = name.trim().replace(/\s+/g,' ');
  let s = SENSORS.find(x => (x.name||'').trim().replace(/\s+/g,' ') === clean);
  if (s) return s.id?.toString();
  s = SENSORS.find(x => (x.name||'').trim().replace(/\s+/g,' ').startsWith(clean));
  if (s) return s.id?.toString();
  s = SENSORS.find(x => clean.startsWith((x.name||'').trim().replace(/\s+/g,' ')));
  if (s) return s.id?.toString();
  s = SENSORS.find(x => {
    const xn = (x.name||'').trim().replace(/\s+/g,' ');
    return clean.includes(xn.substring(0,10)) || xn.includes(clean.substring(0,10));
  });
  return s ? s.id?.toString() : null;
}

function parseTWQRows(rows, stationName) {
  const sid = resolveStationId(stationName);
  console.log('[TWQ] stationName:', stationName, '→ sid:', sid);
  if (!sid) return 0;
  const hist = loadHistory();
  const cutoff = Date.now() - 48*3600000;
  if (!hist[sid]) hist[sid] = [];
  let added = 0, skipped = 0;
  for (const row of rows) {
    if (!row || !row[0]) continue;
    const ts = thaiDateToTs(row[0]);
    if (!ts) { skipped++; continue; }
    if (ts < cutoff) { skipped++; continue; }
    const frc = row[3] != null ? parseFloat(row[3]) : null;
    const ec  = row.length > 12 && row[12] != null ? parseFloat(row[12]) : null;
    // col 10=EC max, 11=EC min (TWQ format)
    const ecHiRaw = row.length > 10 && row[10] != null ? parseFloat(row[10]) : null;
    const ecLoRaw = row.length > 11 && row[11] != null ? parseFloat(row[11]) : null;
    if ((frc != null && isNaN(frc)) || (ec != null && isNaN(ec))) { skipped++; continue; }
    if (frc != null && (frc < 0 || frc > 10)) { skipped++; continue; }
    // TWQ override: ลบจุดที่ timestamp ใกล้เคียงใน window ±15 นาที แล้วเพิ่มใหม่
    const WIN_MS = 15 * 60000;
    hist[sid] = hist[sid].filter(p => Math.abs(p.ts - ts) > WIN_MS);
    const pt = { ts };
    if (frc != null && frc >= 0) pt.frc = Math.round(frc*1000)/1000;
    if (ec  != null && ec  > 0) pt.ec  = Math.round(ec*10)/10;
    if (ecHiRaw != null && !isNaN(ecHiRaw) && ecHiRaw > 0) pt.ecHi = Math.round(ecHiRaw*10)/10;
    if (ecLoRaw != null && !isNaN(ecLoRaw) && ecLoRaw > 0) pt.ecLo = Math.round(ecLoRaw*10)/10;
    if (pt.frc != null || pt.ec) { hist[sid].push(pt); added++; }
    else skipped++;
  }
  hist[sid].sort((a,b) => a.ts - b.ts);
  saveHistory(hist);
  console.log('[TWQ] sid:', sid, 'added:', added, 'skipped:', skipped, 'total in hist:', hist[sid].length);
  const sample = hist[sid].slice(-3);
  console.log('[TWQ] last 3 pts:', JSON.stringify(sample));
  return added;
}

async function importTWQ(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const msg = document.getElementById('twq-import-msg');
  msg.style.display = 'block';
  msg.style.color = '#604080';
  msg.style.background = '#f8f0ff';
  msg.style.borderColor = '#d0b0f0';
  msg.textContent = '⏳ กำลัง import...';
  try {
    let totalAdded=0, totalStations=0, totalUnmatched=0;
    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const lines = text.replace(/\r/g,'').split('\n');
      const stationName = (lines[2]||'').replace(/^สถานี\s*:\s*/,'').trim();
      const rows = lines.slice(5).map(l=>l.split(','));
      const sid = resolveStationId(stationName);
      if (!sid) totalUnmatched++;
      const added = parseTWQRows(rows, stationName);
      totalAdded+=added; if(sid) totalStations++;
      msg.style.color = sid ? '#1a5020' : '#804000';
      msg.style.background = sid ? '#f0fff0' : '#fff8f0';
      msg.style.borderColor = sid ? '#80c080' : '#e0a060';
      msg.textContent = sid
        ? `✅ CSV: ${stationName.substring(0,25)} — เพิ่ม ${added} จุด`
        : `⚠ ไม่พบสถานี: "${stationName.substring(0,25)}"`;
    } else if (file.name.endsWith('.xlsx')) {
      const buf = await file.arrayBuffer();
      if (!window.XLSX) {
        msg.textContent = '❌ XLSX library ยังไม่โหลด — รอสักครู่แล้วลองใหม่';
        throw new Error('XLSX not loaded');
      }
      const wb = window.XLSX.read(buf, {type:'array'});
      const unmatchedNames = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const data = window.XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
        let stationName = sheetName.trim();
        if (data[2] && data[2][0]) {
          const r2 = String(data[2][0]).replace(/^สถานี\s*:\s*/,'').trim();
          if (r2) stationName = r2;
        }
        const sid = resolveStationId(stationName);
        if (!sid) { unmatchedNames.push(stationName.substring(0,20)); totalUnmatched++; continue; }
        const added = parseTWQRows(data.slice(5), stationName);
        totalAdded+=added; totalStations++;
      }
      msg.style.color='#1a5020'; msg.style.background='#f0fff0'; msg.style.borderColor='#80c080';
      msg.textContent = `✅ XLSX: ${totalStations} สถานี เพิ่ม ${totalAdded} จุด`
        + (totalUnmatched ? ` | ⚠ ไม่พบ ${totalUnmatched} สถานี` : '');
      if (unmatchedNames.length) console.warn('[importTWQ] unmatched:', unmatchedNames);
    }
    const h = loadHistory();
    updateHistBadge(h);
  } catch(e) {
    msg.style.color='#800'; msg.style.background='#fff0f0'; msg.style.borderColor='#e08080';
    msg.textContent = '❌ Error: ' + e.message;
    console.error('[importTWQ]', e);
  }
}
// ═══════════ [2/11] ZONES — zone store, DEFAULT_ZONES, zone editor, district boundaries ═══════════
// ═══════════════════════════════════════════════════════════════════
// V.2.0 — ZONE INFLUENCE EDITOR
// กำหนดขอบเขตพื้นที่อิทธิพลของสถานีสูบจ่ายน้ำบนแผนที่
// แทนที่ nearest-neighbor ใน frcZone() / idwZone()
// ═══════════════════════════════════════════════════════════════════

// ── Zone data store ─────────────────────────────────────────────────
// zoneMap: { stationId: { coords: [[lat,lon],...], type: 'polygon'|'circle', radius?: m, layer: L.Layer } }
// ── Default zones (pre-loaded from mwa_zones_2026-03-18) ────────────────
// DEFAULT_ZONES → data/zones.js

window.CUSTOM_ZONES = {}; // stationId → array of [lat,lon] polygon coords
let _zepSelectedStation = null;   // currently selected station object
let _drawMode            = null;  // 'polygon' | 'circle' | null
let _zoneLayerGroup      = null;  // Leaflet layer group for zone overlays
let _drawCoords          = [];    // accumulating click coords during polygon draw
let _drawPolyline        = null;  // preview polyline during draw
let _drawMarkers         = [];    // dot markers during draw
let _drawActive          = false;

// Color palette for zones
const ZONE_COLORS = [
  '#cc0055','#1a6aaa','#00887a','#e67e22','#8e44ad',
  '#16a085','#d35400','#2980b9','#c0392b','#27ae60',
];
let _zoneColorIdx = 0;
function nextZoneColor() { return ZONE_COLORS[(_zoneColorIdx++) % ZONE_COLORS.length]; }

// ── Station colors (for list) ────────────────────────────────────────
const PUMP_COLORS = {};
function getPumpColor(id) {
  if (!PUMP_COLORS[id]) PUMP_COLORS[id] = nextZoneColor();
  return PUMP_COLORS[id];
}

// ── Init ─────────────────────────────────────────────────────────────
function initZoneEditor() {
  _zoneLayerGroup = L.layerGroup().addTo(map); // แสดงเฉพาะ zone ที่เลือก

  // หยุด Leaflet จาก intercept click บน indicator bar
  const indEl = document.getElementById('draw-mode-indicator');
  if (indEl) {
    L.DomEvent.disableClickPropagation(indEl);
    L.DomEvent.disableScrollPropagation(indEl);
  }

  // Wire buttons via addEventListener
  function _wireBtn(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mousedown', function(e) { L.DomEvent.stop(e); });
    el.addEventListener('click',     function(e) { L.DomEvent.stop(e); fn(); });
    el.addEventListener('touchend',  function(e) { L.DomEvent.stop(e); fn(); });
  }
  _wireBtn('draw-finish-btn', finishDraw);
  _wireBtn('draw-cancel-btn', cancelDraw);
  _wireBtn('draw-undo-btn',   undoLastPoint);

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _drawActive) cancelDraw();
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && _drawActive) {
      e.preventDefault();
      undoLastPoint();
    }
  });

  // ── โหลด zones: DEFAULT_ZONES ก่อน (baseline) → Firebase/localStorage override ทีหลัง ──

  // Step 1: โหลด DEFAULT_ZONES ทันทีเป็น baseline
  _loadZonesData(DEFAULT_ZONES);
  populateStationList();
  renderZoneList();
  buildIdwCache();
  redrawContour();

  // Step 2: พยายามโหลดจาก Firebase/localStorage มาทับ (async)
  async function _loadSavedZonesOverride() {
    // รอ Firebase พร้อม (สูงสุด 10 วินาที)
    if (!window._fbReady) {
      await new Promise(resolve => {
        const handler = () => resolve();
        window.addEventListener('firebase-ready', handler, { once: true });
        setTimeout(() => { window.removeEventListener('firebase-ready', handler); resolve(); }, 10000);
      });
    }

    // 1. ลอง Firebase
    if (window._fbReady && window._fb) {
      try {
        const snap = await window._fbGet(window._fbRef(window._fb, 'zones/custom'));
        if (snap && snap.exists()) {
          const fbData = snap.val();
          const count = Object.keys(fbData).length;
          if (count > 0) {
            _loadZonesData(fbData, true);
            populateStationList();
            renderZoneList();
            buildIdwCache();
            redrawContour();
            console.log(`[Zone] ✅ loaded ${count} zones from Firebase (override default)`);
            return;
          }
        }
      } catch(e) {
        console.warn('[Zone] Firebase load error:', e.message);
      }
    }

    // 2. ลอง localStorage
    try {
      const saved = localStorage.getItem('mwa_custom_zones');
      if (saved) {
        const lsData = JSON.parse(saved);
        const count = Object.keys(lsData).length;
        if (count > 0) {
          _loadZonesData(lsData, true);
          populateStationList();
          renderZoneList();
          buildIdwCache();
          redrawContour();
          console.log(`[Zone] ✅ loaded ${count} zones from localStorage (override default)`);
          return;
        }
      }
    } catch(e) {}

    console.log('[Zone] ไม่พบ saved zones — ใช้ DEFAULT_ZONES');
  }

  _loadSavedZonesOverride();
}

// ── Toggle panel ──────────────────────────────────────────────────────
function toggleZoneEditor() {
  hideAllZoneLayers();
  const panel = document.getElementById('zone-editor-panel');
  const btn   = document.getElementById('zone-editor-btn');
  const isOpen = panel.classList.contains('open');
  // จัดการ overlay
  var overlay = document.getElementById('zep-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'zep-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:940;';
    overlay.onclick = function(){ toggleZoneEditor(); };
    document.body.appendChild(overlay);
  }
  if (isOpen) {
    panel.classList.remove('open');
    btn.classList.remove('active');
    overlay.style.display = 'none';
    if (_drawActive) cancelDraw();
  } else {
    panel.classList.add('open');
    btn.classList.add('active');
    if (window.innerWidth <= 640) overlay.style.display = 'block';
    populateStationList();
  }
  _syncFloatingBtns();
}

// ── Populate station list ─────────────────────────────────────────────
function populateStationList() {
  const list = document.getElementById('zep-station-list');
  if (!list || !SENSORS || SENSORS.length === 0) return;
  const PUMP_TYPES = new Set(['pump','plant','vc']);
  const EXCLUDE_TR_MTR = new Set([
    'สถานีสูบส่งน้ำบางเขน 1 (TR1)','สถานีสูบส่งน้ำบางเขน 2 (TR2)',
    'สถานีสูบส่งน้ำบางเขน 3 (TR3)','สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)',
    'สถานีสูบส่งน้ำมหาสวัสดิ์',
  ]);
  const pumps = SENSORS.filter(s =>
    PUMP_TYPES.has(s.type) && !EXCLUDE_TR_MTR.has(s.name?.trim())
  );
  // rev16.0: เพิ่ม VC_STATIONS ใน Zone Editor (VC แยกจาก SENSORS)
  if (typeof VC_STATIONS !== 'undefined') {
    for (const vc of VC_STATIONS) {
      if (!pumps.find(p => String(p.id) === vc.id)) {
        pumps.push(vc);
      }
    }
  }
  list.innerHTML = '';
  pumps.forEach(s => {
    const sid = String(s.id);
    const color = getPumpColor(sid);
    const hasZone = !!window.CUSTOM_ZONES[sid];
    const el = document.createElement('div');
    el.className = 'zep-station-item' + (_zepSelectedStation?.id == s.id ? ' selected' : '');
    el.dataset.sid = sid;
    el.innerHTML = `
      <div class="zep-station-dot" style="background:${color};"></div>
      <div class="zep-station-name">${s.name?.replace('สถานีสูบจ่ายน้ำ','สจ.').replace('สถานีสูบส่งน้ำ','สจส.').replace('โรงงานผลิตน้ำ','รง.')}</div>
      <div class="zep-station-badge">${hasZone ? '✓' : ''}</div>`;
    el.onclick = () => selectStation(s);
    list.appendChild(el);
  });
}

// ── Select station ────────────────────────────────────────────────────
function hideAllZoneLayers() {
  _zoneLayerGroup.eachLayer(l => {
    if (l instanceof L.Polygon || l instanceof L.Circle) {
      l.setStyle({opacity:0, fillOpacity:0});
    } else if (l instanceof L.Marker) {
      l.setOpacity(0);
    }
  });
}

function showZoneForStation(sid) {
  hideAllZoneLayers();
  if (!sid) return;
  _zoneLayerGroup.eachLayer(l => {
    if (l._zoneStationId !== sid) return;
    if (l instanceof L.Polygon || l instanceof L.Circle) {
      const color = (window.CUSTOM_ZONES[sid] && window.CUSTOM_ZONES[sid].color) || '#cc0055';
      l.setStyle({opacity:0.85, fillOpacity:0.20, color, weight:2});
    } else if (l instanceof L.Marker) {
      l.setOpacity(1);
    }
  });
}

function selectStation(s) {
  _zepSelectedStation = s;
  // Update list UI
  document.querySelectorAll('.zep-station-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.sid == String(s.id));
  });
  // Enable draw buttons
  document.getElementById('zep-btn-polygon').disabled = false;
  document.getElementById('zep-btn-circle').disabled  = false;
  const sid = String(s.id);
  document.getElementById('zep-btn-edit').disabled  = !window.CUSTOM_ZONES[sid];
  document.getElementById('zep-btn-clear').disabled = !window.CUSTOM_ZONES[sid];
  // Flash station on map
  map.panTo([s.lat, s.lon], {animate:true, duration:0.5});
  showZepMsg(`เลือก: ${s.name}`, '#1a5020', '#f0fff0', '#80c080');

  // ── แสดง zone ของสถานีที่เลือก (ทึบ) + zone ข้างเคียง (จาง) ──
  hideAllZoneLayers();
  // ลบ reference layers เก่า
  if (_zoneLayerGroup) {
    _zoneLayerGroup.eachLayer(l => {
      if (l._isEditRef) _zoneLayerGroup.removeLayer(l);
    });
  }

  // แสดง zone ของตัวเอง (ทึบ)
  showZoneForStation(sid);

  // แสดง zone ข้างเคียง (จาง) เพื่อให้เห็นบริบท
  for (const [adjSid, adjZone] of Object.entries(window.CUSTOM_ZONES)) {
    if (adjSid === sid) continue;
    const adjCoords = adjZone.coords || adjZone;
    const adjColor = adjZone.color || '#999';
    if (!adjCoords || !adjCoords.length) continue;

    const adjPoly = L.polygon(adjCoords, {
      color: adjColor, weight: 1, dashArray: '4,4',
      opacity: 0.35, fillColor: adjColor, fillOpacity: 0.05,
      interactive: false
    }).addTo(_zoneLayerGroup);
    adjPoly._zoneStationId = sid + '_adj';
    adjPoly._isEditRef = true;
  }
}

// ── Start draw ────────────────────────────────────────────────────────
function startDraw(mode) {
  if (!_zepSelectedStation) return;
  if (_drawActive) cancelDraw();
  _drawMode   = mode;
  _drawActive = true;
  _drawCoords = [];
  _drawMarkers = [];
  // Update button states
  document.getElementById('zep-btn-polygon').classList.toggle('active', mode==='polygon');
  document.getElementById('zep-btn-circle').classList.toggle('active', mode==='circle');
  // Show indicator bar
  const ind = document.getElementById('draw-mode-indicator');
  const txt = document.getElementById('draw-mode-text');
  const finBtn = document.getElementById('draw-finish-btn');
  if (txt) txt.textContent = mode === 'polygon'
    ? '⬡ คลิกวางจุดขอบเขต'
    : '⭕ คลิกศูนย์กลาง';
  if (finBtn) { finBtn.disabled = true; finBtn.textContent = '✓ ปิดโซน (≥3 จุด)'; }
  ind.classList.add('visible');
  // Change cursor
  map.getContainer().style.cursor = 'crosshair';
  // Bind click handler
  map.on('click', onDrawClick);
  if (mode === 'polygon') {
    const color = getPumpColor(String(_zepSelectedStation.id));
    _drawPolyline = L.polyline([], {color, weight:2, dashArray:'5,4', opacity:0.85}).addTo(map);
  }
  showZepMsg('คลิกบนแผนที่เพื่อวางจุด...', '#1a4080', '#f0f6ff', '#c0d8f8');
}

// ── Draw click handler ────────────────────────────────────────────────
function onDrawClick(e) {
  if (!_drawActive) return;
  // ถ้า originalEvent มาจาก indicator bar หรือ zone-editor-panel → ข้าม
  const orig = e.originalEvent;
  if (orig) {
    const bar   = document.getElementById('draw-mode-indicator');
    const panel = document.getElementById('zone-editor-panel');
    if ((bar   && bar.contains(orig.target))   ||
        (panel && panel.contains(orig.target))) return;
  }
  const {lat, lng} = e.latlng;
  if (_drawMode === 'circle') {
    if (_drawCoords.length === 0) {
      _drawCoords.push([lat, lng]);
      const m = L.circleMarker([lat,lng],{radius:6,color:'#cc0055',fillColor:'#cc0055',fillOpacity:1,weight:2}).addTo(_zoneLayerGroup);
      _drawMarkers.push(m);
      const txt = document.getElementById('draw-mode-text');
      if (txt) txt.textContent = '⭕ คลิกจุดขอบวงกลม';
      const finBtn = document.getElementById('draw-finish-btn');
      if (finBtn) { finBtn.disabled = false; finBtn.textContent = '✓ ยืนยัน'; }
      showZepMsg('คลิกจุดขอบวงกลมเพื่อกำหนดรัศมี', '#1a4080', '#f0f6ff', '#c0d8f8');
    } else {
      const center = _drawCoords[0];
      const R = map.distance(center, [lat,lng]);
      finishCircleDraw(center, R);
    }
    return;
  }
  // Polygon — add point
  _drawCoords.push([lat, lng]);
  const num = _drawCoords.length;
  const m = L.circleMarker([lat,lng], {
    radius:5, color:'#cc0055', fillColor:'#fff', fillOpacity:1, weight:2,
    pane:'markerPane'
  }).addTo(map);
  m.bindTooltip(String(num), {permanent:true, direction:'top', offset:[0,-8], className:'zep-dot-label'});
  _drawMarkers.push(m);
  if (_drawPolyline) _drawPolyline.setLatLngs(_drawCoords.map(c=>c));
  _updateDrawUI();
}

// ── Update draw bar UI ────────────────────────────────────────────────
function _updateDrawUI() {
  const num    = _drawCoords.length;
  const finBtn = document.getElementById('draw-finish-btn');
  const undoBtn= document.getElementById('draw-undo-btn');
  const txt    = document.getElementById('draw-mode-text');
  if (undoBtn) undoBtn.disabled = (num === 0);
  if (num >= 3) {
    if (finBtn) { finBtn.disabled = false; finBtn.textContent = `✓ ปิดโซน (${num} จุด)`; }
    if (txt) txt.textContent = `⬡ จุดที่ ${num} — กด ✓ ปิดโซน หรือคลิกเพิ่ม`;
  } else {
    if (finBtn) { finBtn.disabled = true; finBtn.textContent = `✓ ปิดโซน (${num}/3 จุด)`; }
    if (txt) txt.textContent = num === 0
      ? '⬡ คลิกวางจุดขอบเขต'
      : `⬡ จุดที่ ${num} — ต้องการอย่างน้อย 3 จุด`;
  }
}

// ── Undo last point ───────────────────────────────────────────────────
function undoLastPoint() {
  if (!_drawActive || _drawMode !== 'polygon' || _drawCoords.length === 0) return;
  _drawCoords.pop();
  const lastMarker = _drawMarkers.pop();
  if (lastMarker) {
    try { lastMarker.unbindTooltip(); } catch(e){}
    try { _zoneLayerGroup.removeLayer(lastMarker); } catch(e){}
    try { map.removeLayer(lastMarker); } catch(e){}
  }
  if (_drawPolyline) _drawPolyline.setLatLngs(_drawCoords.map(c => c));
  // Re-number remaining tooltips
  _drawMarkers.forEach((m, i) => {
    try { m.setTooltipContent(String(i + 1)); } catch(e){}
  });
  _updateDrawUI();
}

// ── Finish draw (button press) ────────────────────────────────────────
function finishDraw() {
  if (!_drawActive) return;
  if (_drawMode === 'polygon') {
    if (_drawCoords.length < 3) {
      showZepMsg('⚠ ต้องมีอย่างน้อย 3 จุด', '#804000', '#fffaf0', '#e0c060');
      return;
    }
    finishPolygonDraw(_drawCoords.slice());
  } else if (_drawMode === 'circle' && _drawCoords.length >= 2) {
    const R = map.distance(_drawCoords[0], _drawCoords[1]);
    finishCircleDraw(_drawCoords[0], R);
  }
}

// ── Finish polygon draw ───────────────────────────────────────────────
function finishPolygonDraw(coords) {
  // ลบ preview polyline และ markers ทันทีก่อน cleanupDraw
  if (_drawPolyline) {
    _drawPolyline.setLatLngs([]);
    map.removeLayer(_drawPolyline);
    _drawPolyline = null;
  }
  _drawMarkers.forEach(m => {
    try { m.unbindTooltip(); } catch(e){}
    try { map.removeLayer(m); } catch(e){}
  });
  _drawMarkers = [];
  cleanupDraw();
  const sid   = String(_zepSelectedStation.id);
  const color = getPumpColor(sid);
  // Remove old zone layer if exists
  removeZoneLayerForStation(sid);
  // Draw filled polygon
  const poly = L.polygon(coords, {
    color: color, weight: 0, fillColor: color, fillOpacity: 0.20, stroke: false
  }).addTo(_zoneLayerGroup);
  poly._zoneStationId = sid;
  // Add centroid label
  const cen  = poly.getBounds().getCenter();
  const sName = _zepSelectedStation.name?.replace('สถานีสูบจ่ายน้ำ','สจ.').replace('สถานีสูบส่งน้ำ','สจส.').replace('โรงงานผลิตน้ำ','รง.');
  const lbl  = L.marker(cen, {icon:L.divIcon({
    html:`<div style="color:${color};font-size:10px;font-weight:700;font-family:'Sarabun',sans-serif;text-shadow:0 0 3px #fff;white-space:nowrap;background:rgba(255,255,255,.75);padding:1px 4px;border-radius:4px;">${sName}</div>`,
    className:'', iconAnchor:[40,8]
  }), interactive:false}).addTo(_zoneLayerGroup);
  lbl._zoneStationId = sid;
  // Store zone
  window.CUSTOM_ZONES[sid] = { coords, type:'polygon', color };
  updateUI();
  showZepMsg(`✅ บันทึกโซน "${sName}" แล้ว (${coords.length} จุด)`, '#1a5020', '#f0fff0', '#80c080');
}

// ── Finish circle draw ────────────────────────────────────────────────
function finishCircleDraw(center, radiusM) {
  cleanupDraw();
  const sid   = String(_zepSelectedStation.id);
  const color = getPumpColor(sid);
  removeZoneLayerForStation(sid);
  const circle = L.circle(center, {
    radius: radiusM, color: color, weight: 2,
    fillColor: color, fillOpacity: 0.18, stroke: false, weight: 0
  }).addTo(_zoneLayerGroup);
  circle._zoneStationId = sid;
  // Convert circle to polygon coords (approx, 36 points)
  const pts = [];
  for (let a=0; a<360; a+=10) {
    const rad = a * Math.PI / 180;
    const dlat = (radiusM / 111320) * Math.cos(rad);
    const dlon = (radiusM / (111320 * Math.cos(center[0]*Math.PI/180))) * Math.sin(rad);
    pts.push([center[0]+dlat, center[1]+dlon]);
  }
  const sName = _zepSelectedStation.name?.replace('สถานีสูบจ่ายน้ำ','สจ.').replace('โรงงานผลิตน้ำ','รง.');
  window.CUSTOM_ZONES[sid] = { coords: pts, type:'circle', center, radiusM, color };
  // Label
  const lbl = L.marker(center, {icon:L.divIcon({
    html:`<div style="color:${color};font-size:10px;font-weight:700;font-family:'Sarabun',sans-serif;text-shadow:0 0 3px #fff;background:rgba(255,255,255,.75);padding:1px 4px;border-radius:4px;">${sName}</div>`,
    className:'', iconAnchor:[40,8]
  }), interactive:false}).addTo(_zoneLayerGroup);
  lbl._zoneStationId = sid;
  updateUI();
  showZepMsg(`✅ บันทึกวงกลม r=${(radiusM/1000).toFixed(1)}km สำหรับ "${sName}"`, '#1a5020', '#f0fff0', '#80c080');
}

// ── Edit zone (re-draw) ───────────────────────────────────────────────
function editZone() {
  if (!_zepSelectedStation) return;
  const sid = String(_zepSelectedStation.id);
  if (!window.CUSTOM_ZONES[sid]) return;

  // ── 1. แสดง zone เดิมเป็นพื้นทึบ (reference) ──
  const oldZone = window.CUSTOM_ZONES[sid];
  const oldCoords = oldZone.coords || oldZone;
  const oldColor = oldZone.color || getPumpColor(sid);

  // ลบ layer เดิมก่อน แล้ววาดใหม่แบบ reference (ทึบ + dash)
  removeZoneLayerForStation(sid);

  const refPoly = L.polygon(oldCoords, {
    color: oldColor,
    weight: 2.5,
    dashArray: '8,6',
    opacity: 0.9,
    fillColor: oldColor,
    fillOpacity: 0.25,
    interactive: false
  }).addTo(_zoneLayerGroup);
  refPoly._zoneStationId = sid + '_ref';
  refPoly._isEditRef = true;

  // Label กลาง polygon เดิม
  const center = refPoly.getBounds().getCenter();
  const refLabel = L.marker(center, {
    icon: L.divIcon({
      html: `<div style="background:rgba(255,255,255,.9);color:${oldColor};font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;border:1.5px solid ${oldColor};box-shadow:0 2px 6px rgba(0,0,0,.15);white-space:nowrap;font-family:'Sarabun',sans-serif;">✏️ พื้นที่เดิม</div>`,
      className: '', iconAnchor: [40, 10]
    }), interactive: false
  }).addTo(_zoneLayerGroup);
  refLabel._zoneStationId = sid + '_ref';
  refLabel._isEditRef = true;

  // ── 2. แสดง zone ข้างเคียง (สจ. อื่นที่มี zone แล้ว) ──
  // สร้าง panel toggle สำหรับเปิด/ปิดแต่ละโซน
  const adjList = [];
  for (const [adjSid, adjZone] of Object.entries(window.CUSTOM_ZONES)) {
    if (adjSid === sid) continue;
    const adjCoords = adjZone.coords || adjZone;
    const adjColor = adjZone.color || getPumpColor(adjSid);
    if (!adjCoords || !adjCoords.length) continue;

    const adjPoly = L.polygon(adjCoords, {
      color: adjColor,
      weight: 2.5,
      dashArray: '6,4',
      opacity: 0.8,
      fillColor: adjColor,
      fillOpacity: 0.15,
      interactive: false
    }).addTo(_zoneLayerGroup);
    adjPoly._zoneStationId = sid + '_adj_' + adjSid;
    adjPoly._isEditRef = true;

    // Label ชื่อ สจ. ข้างเคียง
    const adjCenter = adjPoly.getBounds().getCenter();
    const adjStation = SENSORS.find(s => String(s.id) === adjSid);
    const adjName = adjStation
      ? (adjStation.name || adjSid).replace('สถานีสูบจ่ายน้ำ','สจ.').replace('สถานีสูบส่งน้ำ','สจส.').replace('โรงงานผลิตน้ำ','รง.')
      : adjSid;
    const adjLabel = L.marker(adjCenter, {
      icon: L.divIcon({
        html: `<div style="background:rgba(255,255,255,.85);color:${adjColor};font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;border:1.5px solid ${adjColor};white-space:nowrap;font-family:'Sarabun',sans-serif;">${adjName}</div>`,
        className: '', iconAnchor: [30, 8]
      }), interactive: false
    }).addTo(_zoneLayerGroup);
    adjLabel._zoneStationId = sid + '_adj_' + adjSid;
    adjLabel._isEditRef = true;

    adjList.push({ sid: adjSid, name: adjName, color: adjColor, visible: true });
  }

  // สร้าง toggle panel ใน zep-draw-hint
  if (adjList.length > 0) {
    const hintEl = document.getElementById('zep-draw-hint');
    if (hintEl) {
      let toggleHtml = `<div id="zep-adj-toggles" style="margin-top:8px;padding:8px;background:#f8f0f4;border-radius:8px;border:1px solid #e0c0d0;">
        <div style="font-size:10px;font-weight:700;color:#cc0055;margin-bottom:6px;">👁 โซนข้างเคียง (${adjList.length})</div>`;
      for (const adj of adjList) {
        toggleHtml += `<label style="display:flex;align-items:center;gap:5px;font-size:10px;cursor:pointer;padding:2px 0;">
          <input type="checkbox" checked onchange="toggleAdjZone('${sid}','${adj.sid}',this.checked)" style="accent-color:${adj.color};margin:0;">
          <span style="width:8px;height:8px;border-radius:50%;background:${adj.color};flex-shrink:0;"></span>
          <span style="color:#555;">${adj.name}</span>
        </label>`;
      }
      toggleHtml += `<div style="margin-top:4px;display:flex;gap:4px;">
        <button onclick="toggleAllAdj('${sid}',true)" style="flex:1;font-size:9px;padding:2px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">✅ ทั้งหมด</button>
        <button onclick="toggleAllAdj('${sid}',false)" style="flex:1;font-size:9px;padding:2px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;">❌ ซ่อนทั้งหมด</button>
      </div></div>`;
      hintEl.insertAdjacentHTML('beforeend', toggleHtml);
    }
  }

  // ── 3. ลบ zone data เดิมแล้วเริ่มวาดใหม่ ──
  delete window.CUSTOM_ZONES[sid];
  updateUI();
  startDraw('polygon');

  showZepMsg(
    '✏️ แก้ไขโซน — พื้นที่เดิมแสดงเป็นเส้นประ\nเปิด/ปิดโซนข้างเคียงได้ด้านล่าง',
    '#1a4080', '#f0f6ff', '#c0d8f8'
  );
}

// ── Clear current zone ────────────────────────────────────────────────
function clearCurrentZone() {
  if (!_zepSelectedStation) return;
  const sid = String(_zepSelectedStation.id);
  if (!window.CUSTOM_ZONES[sid]) return;
  removeZoneLayerForStation(sid);
  delete window.CUSTOM_ZONES[sid];
  updateUI();
  showZepMsg('🗑 ลบโซนแล้ว', '#804000', '#fffaf0', '#e0c060');
  // Rebuild contour immediately
  buildIdwCache(); redrawContour();
}

// ── Remove layer helpers ──────────────────────────────────────────────
function removeZoneLayerForStation(sid) {
  _zoneLayerGroup.eachLayer(l => {
    if (l._zoneStationId === sid) _zoneLayerGroup.removeLayer(l);
  });
}

// toggle โซนข้างเคียงแต่ละอัน
function toggleAdjZone(editSid, adjSid, show) {
  const tag = editSid + '_adj_' + adjSid;
  _zoneLayerGroup.eachLayer(l => {
    if (l._zoneStationId === tag) {
      if (show) {
        l.setStyle && l.setStyle({ opacity: 0.8, fillOpacity: 0.15 });
        l._icon && (l._icon.style.display = '');
      } else {
        l.setStyle && l.setStyle({ opacity: 0, fillOpacity: 0 });
        l._icon && (l._icon.style.display = 'none');
      }
    }
  });
}

// เปิด/ปิดทั้งหมด
function toggleAllAdj(editSid, show) {
  const panel = document.getElementById('zep-adj-toggles');
  if (panel) {
    panel.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.checked = show;
      cb.onchange && cb.dispatchEvent(new Event('change'));
    });
  }
  _zoneLayerGroup.eachLayer(l => {
    if (l._zoneStationId && l._zoneStationId.includes(editSid + '_adj_')) {
      if (show) {
        l.setStyle && l.setStyle({ opacity: 0.8, fillOpacity: 0.15 });
        l._icon && (l._icon.style.display = '');
      } else {
        l.setStyle && l.setStyle({ opacity: 0, fillOpacity: 0 });
        l._icon && (l._icon.style.display = 'none');
      }
    }
  });
}

// ── Cancel draw ───────────────────────────────────────────────────────
function cancelDraw() {
  cleanupDraw();
  showZepMsg('ยกเลิกการวาด', '#804000', '#fffaf0', '#e0c060');
}

function cleanupDraw() {
  _drawActive = false;
  _drawMode   = null;
  map.off('click', onDrawClick);
  map.getContainer().style.cursor = '';
  // Hide indicator bar
  document.getElementById('draw-mode-indicator').classList.remove('visible');
  document.getElementById('zep-btn-polygon').classList.remove('active');
  document.getElementById('zep-btn-circle').classList.remove('active');
  // Reset finish + undo buttons
  const finBtn = document.getElementById('draw-finish-btn');
  if (finBtn) { finBtn.disabled = true; finBtn.textContent = '✓ ปิดโซน (≥3 จุด)'; }
  const undoBtn = document.getElementById('draw-undo-btn');
  if (undoBtn) undoBtn.disabled = true;
  // Remove preview polyline
  if (_drawPolyline) {
    try { _zoneLayerGroup.removeLayer(_drawPolyline); } catch(e){}
    try { map.removeLayer(_drawPolyline); } catch(e){}
    _drawPolyline = null;
  }
  // Remove all dot markers (and their tooltips)
  _drawMarkers.forEach(m => {
    try { m.unbindTooltip(); } catch(e){}
    try { _zoneLayerGroup.removeLayer(m); } catch(e){}
    try { map.removeLayer(m); } catch(e){}
  });
  _drawMarkers = [];
  _drawCoords  = [];
  // ── ลบ reference layers จาก editZone (พื้นที่เดิม + ข้างเคียง) ──
  if (_zoneLayerGroup) {
    _zoneLayerGroup.eachLayer(l => {
      if (l._isEditRef) _zoneLayerGroup.removeLayer(l);
    });
  }
}

// ── Render zone list ──────────────────────────────────────────────────
function renderZoneList() {
  const container = document.getElementById('zep-zone-list');
  const countEl   = document.getElementById('zep-zone-count');
  if (!container) return;
  const zones = Object.entries(window.CUSTOM_ZONES);
  if (countEl) countEl.textContent = zones.length ? `(${zones.length})` : '';
  if (zones.length === 0) {
    container.innerHTML = '<div style="font-size:10.5px;color:#b080a0;text-align:center;padding:10px 0;">ยังไม่มีโซน</div>';
    return;
  }
  container.innerHTML = '';
  zones.forEach(([sid, zone]) => {
    const s = SENSORS.find(x => String(x.id) === sid);
    if (!s) return;
    const shortName = s.name?.replace('สถานีสูบจ่ายน้ำ','สจ.').replace('สถานีสูบส่งน้ำ','สจส.').replace('โรงงานผลิตน้ำ','รง.');
    const meta = zone.type === 'circle'
      ? `วงกลม r=${(zone.radiusM/1000).toFixed(1)}km`
      : `${zone.coords.length} จุด`;
    const card = document.createElement('div');
    card.className = 'zep-zone-card';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:7px;">
        <div style="width:10px;height:10px;border-radius:2px;background:${zone.color||'#cc0055'};flex-shrink:0;"></div>
        <div class="zep-zone-card-name">${shortName}</div>
      </div>
      <div class="zep-zone-card-meta">${meta}</div>
      <div class="zep-zone-card-actions">
        <button class="zep-zone-act-btn" onclick="zoomToZone('${sid}')">🔍 ดู</button>
        <button class="zep-zone-act-btn danger" onclick="deleteZone('${sid}')">🗑 ลบ</button>
      </div>`;
    container.appendChild(card);
  });
}

function updateUI() {
  renderZoneList();
  populateStationList();
  if (_zepSelectedStation) {
    const sid = String(_zepSelectedStation.id);
    document.getElementById('zep-btn-edit').disabled  = !window.CUSTOM_ZONES[sid];
    document.getElementById('zep-btn-clear').disabled = !window.CUSTOM_ZONES[sid];
  }
}

// ── Zoom to zone ──────────────────────────────────────────────────────
function zoomToZone(sid) {
  const zone = window.CUSTOM_ZONES[sid];
  if (!zone) return;
  const bounds = L.latLngBounds(zone.coords);
  map.fitBounds(bounds.pad(0.2));
}

function deleteZone(sid) {
  removeZoneLayerForStation(sid);
  delete window.CUSTOM_ZONES[sid];
  updateUI();
  buildIdwCache(); redrawContour();
  showZepMsg('🗑 ลบโซนแล้ว', '#804000', '#fffaf0', '#e0c060');
}

// ── Apply zones to contour ────────────────────────────────────────────
function applyZonesToContour() {
  // Auth check
  if (!window._fbUser) {
    alert('⚠️ กรุณา Login ก่อนบันทึก Zone\n\nไปที่ ☰ → Login (ล่างสุด sidebar)');
    return;
  }
  const count = Object.keys(window.CUSTOM_ZONES).length;
  const btn = document.querySelector('.zep-apply-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving & Rebuilding...'; }
  setTimeout(async () => {
    buildIdwCache();
    redrawContour();

    // ── บันทึกลง Firebase เพื่อให้ persist หลัง refresh ──
    let saveOk = false;
    if (window._fbReady && window._fb) {
      try {
        const data = {};
        Object.entries(window.CUSTOM_ZONES).forEach(([sid, z]) => {
          data[sid] = { coords: z.coords, type: z.type, radiusM: z.radiusM || null, center: z.center || null, color: z.color || null };
        });
        await window._fbSet(window._fbRef(window._fb, 'zones/custom'), data);
        saveOk = true;
        console.log(`[Zone] ✅ saved ${count} zones to Firebase`);
      } catch(e) {
        console.error('[Zone] Firebase save error:', e.message);
        showZepMsg('⚠ Firebase save ล้มเหลว: ' + e.message + '\nบันทึกลง localStorage แทน', '#804000', '#fffaf0', '#e0c060');
      }
    }

    // ── บันทึกลง localStorage เป็น backup ──
    try {
      const data = {};
      Object.entries(window.CUSTOM_ZONES).forEach(([sid, z]) => {
        data[sid] = { coords: z.coords, type: z.type, radiusM: z.radiusM || null, center: z.center || null, color: z.color || null };
      });
      localStorage.setItem('mwa_custom_zones', JSON.stringify(data));
    } catch(e) {}

    if (btn) { btn.disabled = false; btn.textContent = '🔄 Apply & Rebuild Contour'; }
    showZepMsg(
      count > 0
        ? `✅ Apply + ${saveOk ? 'บันทึก Firebase' : 'บันทึก localStorage'} แล้ว — ${count} zone`
        : '✅ Rebuild แล้ว (ใช้ค่า default)',
      '#1a5020', '#f0fff0', '#80c080'
    );
  }, 30);
}

// ── Shared zone loader (ใช้กับทั้ง import และ default) ───────────────
function _loadZonesData(data, clearExisting = false) {
  if (clearExisting) {
    _zoneLayerGroup.clearLayers();
    window.CUSTOM_ZONES = {};
  }
  Object.entries(data).forEach(([sid, z]) => {
    if (!z.coords || z.coords.length < 3) return;
    window.CUSTOM_ZONES[sid] = z;
    const color = z.color || getPumpColor(sid);
    // วาด polygon บน map
    const poly = L.polygon(z.coords, {
      color, weight: 2, fillColor: color, fillOpacity: 0.20, stroke: true, opacity: 0.8
    }).addTo(_zoneLayerGroup);
    poly._zoneStationId = sid;
    poly.setStyle({opacity:0, fillOpacity:0}); // ซ่อนไว้ก่อน
    // Label
    const cen = poly.getBounds().getCenter();
    const s = SENSORS.find(x => String(x.id) === sid);
    if (s) {
      const sName = s.name
        ?.replace('สถานีสูบจ่ายน้ำ', 'สจ.')
        ?.replace('สถานีสูบส่งน้ำ', 'สจส.')
        ?.replace('โรงงานผลิตน้ำ', 'รง.');
      const lbl = L.marker(cen, {
        icon: L.divIcon({
          html: `<div style="color:${color};font-size:10px;font-weight:700;font-family:'Sarabun',sans-serif;text-shadow:0 0 3px #fff;background:rgba(255,255,255,.75);padding:1px 4px;border-radius:4px;">${sName}</div>`,
          className: '', iconAnchor: [40, 8]
        }), interactive: false, opacity: 0
      }).addTo(_zoneLayerGroup);
      lbl._zoneStationId = sid;
      lbl._isZoneLabel = true;
      lbl.setOpacity(0); // ซ่อนไว้ก่อน
    }
  });
  buildIdwCache();
  redrawContour();
}

// ── Export / Import ───────────────────────────────────────────────────
function exportZones() {
  const data = {};
  Object.entries(window.CUSTOM_ZONES).forEach(([sid, z]) => {
    data[sid] = { coords: z.coords, type: z.type, radiusM: z.radiusM, center: z.center, color: z.color };
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mwa_zones_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showZepMsg('💾 Export สำเร็จ', '#1a5020', '#f0fff0', '#80c080');
}

function importZones(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      _loadZonesData(data, true); // clearExisting = true
      updateUI();
      showZepMsg(`✅ Import สำเร็จ ${Object.keys(data).length} zone`, '#1a5020', '#f0fff0', '#80c080');
    } catch(err) {
      showZepMsg('❌ Import ไม่สำเร็จ: ' + err.message, '#800', '#fff0f0', '#e08080');
    }
  };
  reader.readAsText(file);
}

// ── Show message ──────────────────────────────────────────────────────
function showZepMsg(text, color, bg, border) {
  const el = document.getElementById('zep-msg');
  if (!el) return;
  el.textContent = text;
  el.style.color   = color || '#3a1020';
  el.style.background  = bg || '#fff5f8';
  el.style.borderColor = border || '#f0c0d8';
  el.style.border = '1px solid ' + (border||'#f0c0d8');
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ═══════════════════════════════════════════════════════════════════
// OVERRIDE frcZone() to respect CUSTOM_ZONES
// Point-in-polygon check: if point falls in a custom zone → use that station
// ═══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// rev16.0: Performance-optimized zone overrides
// Pre-cache VC data + bounding box reject → ลด O(n×m) เหลือ O(1) per pixel
// ══════════════════════════════════════════════════════════════════════
let _zoneCache = null;
var _zoneCacheKey = '';

function _rebuildZoneCache() {
  const key = JSON.stringify(Object.keys(window.CUSTOM_ZONES || {})) + '_' + (typeof VC_STATIONS !== 'undefined' ? VC_STATIONS.map(v=>v.id+v.valvePct).join() : '');
  if (_zoneCacheKey === key && _zoneCache) return _zoneCache;
  _zoneCacheKey = key;

  const vcZones = [];
  const stZones = [];
  const vcMap = {};
  const sensorMap = {};

  // Build VC lookup
  if (typeof VC_STATIONS !== 'undefined') {
    for (const vc of VC_STATIONS) vcMap[vc.id] = vc;
  }
  // Build sensor lookup
  for (const s of SENSORS) sensorMap[String(s.id)] = s;

  // Pre-compute VC FRC values
  const vcFrcCache = {};
  if (typeof VC_STATIONS !== 'undefined') {
    for (const vc of VC_STATIONS) {
      vcFrcCache[vc.id] = (typeof getVcFrc === 'function') ? getVcFrc(vc.id) : (vc.frc || 0);
    }
  }

  // Split zones into VC + station, pre-compute bounding boxes
  for (const [sid, zone] of Object.entries(window.CUSTOM_ZONES || {})) {
    if (!zone.coords || zone.coords.length < 3) continue;
    // Bounding box
    let minLat=90, maxLat=-90, minLon=180, maxLon=-180;
    for (const [la,lo] of zone.coords) {
      if (la < minLat) minLat = la; if (la > maxLat) maxLat = la;
      if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo;
    }
    const entry = { sid, coords: zone.coords, minLat, maxLat, minLon, maxLon };

    if (sid.startsWith('VC')) {
      const vc = vcMap[sid];
      if (!vc || !(vc.valvePct != null && vc.valvePct > 0)) continue;
      const frc = vcFrcCache[sid] || 0;
      if (frc <= 0) continue;
      const pair = (typeof VC_PAIR !== 'undefined') ? VC_PAIR[sid] : null;
      entry.vc = vc;
      entry.vcFrc = frc;
      entry.K = pair ? pair.K : 0.05;
      vcZones.push(entry);
    } else {
      entry.sensor = sensorMap[sid] || null;
      stZones.push(entry);
    }
  }

  _zoneCache = { vcZones, stZones, vcMap, sensorMap, vcFrcCache };
  return _zoneCache;
}

const _origFrcZone = frcZone;
window.frcZone = function frcZone(lat, lon) {
  const c = _rebuildZoneCache();

  // VC zones (pre-filtered, bbox reject)
  for (let i = 0; i < c.vcZones.length; i++) {
    const z = c.vcZones[i];
    if (lat < z.minLat || lat > z.maxLat || lon < z.minLon || lon > z.maxLon) continue;
    if (!pointInPolygon(lat, lon, z.coords)) continue;
    const dKm = Math.sqrt((z.vc.lat-lat)**2+(z.vc.lon-lon)**2) * 111.0;
    return Math.max(0, z.vcFrc * Math.exp(-z.K * (dKm / 1.5)));
  }

  // Station zones (bbox reject)
  for (let i = 0; i < c.stZones.length; i++) {
    const z = c.stZones[i];
    if (lat < z.minLat || lat > z.maxLat || lon < z.minLon || lon > z.maxLon) continue;
    if (!pointInPolygon(lat, lon, z.coords)) continue;
    if (z.sensor) {
      const dKm = Math.sqrt((z.sensor.lat-lat)**2+(z.sensor.lon-lon)**2) * 111.0;
      return z.sensor.frc * epanetDecay(dKm, z.sensor);
    }
  }

  return _origFrcZone(lat, lon);
};

// Same for idwZone (EC mode)
const _origIdwZone = idwZone;
window.idwZone = function idwZone(lat, lon) {
  const c = _rebuildZoneCache();

  // VC zone — ใช้ค่า EC จาก source ตรงๆ (ไม่มีการสลายตัว)
  for (let i = 0; i < c.vcZones.length; i++) {
    const z = c.vcZones[i];
    if (lat < z.minLat || lat > z.maxLat || lon < z.minLon || lon > z.maxLon) continue;
    if (!pointInPolygon(lat, lon, z.coords)) continue;
    const src = c.sensorMap[z.vc.sourceId];
    if (src) return getParamVal(src);
  }

  for (let i = 0; i < c.stZones.length; i++) {
    const z = c.stZones[i];
    if (lat < z.minLat || lat > z.maxLat || lon < z.minLon || lon > z.maxLon) continue;
    if (!pointInPolygon(lat, lon, z.coords)) continue;
    if (z.sensor) return getParamVal(z.sensor);
  }

  return _origIdwZone(lat, lon);
};

// ── Point-in-polygon (ray casting) ───────────────────────────────────
function pointInPolygon(lat, lon, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [lati, loni] = coords[i];
    const [latj, lonj] = coords[j];
    if (((loni > lon) !== (lonj > lon)) &&
        (lat < (latj - lati) * (lon - loni) / (lonj - loni) + lati)) {
      inside = !inside;
    }
  }
  return inside;
}


// ── Mobile legend toggle ─────────────────────────────────────────────────────
function toggleLegend() {
  const panel = document.getElementById('legend-panel');
  const btn   = document.getElementById('lg-toggle-btn');
  if (!panel) return;
  const collapsed = panel.classList.toggle('lg-collapsed');
  if (btn) {
    btn.textContent = collapsed ? '▶' : '◀';
    if (collapsed) {
      btn.style.cssText = 'writing-mode:vertical-rl;transform:rotate(180deg);font-size:11px;height:auto;width:28px;background:none;border:none;color:#cc0055;font-family:\'Sarabun\',sans-serif;font-weight:700;cursor:pointer;padding:8px 0;white-space:nowrap;';
    } else {
      btn.removeAttribute('style');
    }
  }
}

function toggleNote() {
  const frc = document.getElementById('note-panel-frc');
  const ec  = document.getElementById('note-panel-ec');
  const arr = document.getElementById('note-arrow');
  const lbl = document.getElementById('note-mode-label');
  const isEC = (typeof PARAM_MODE !== 'undefined' && PARAM_MODE === 'ec');
  const panel = isEC ? ec : frc;
  const other = isEC ? frc : ec;
  if (lbl) { lbl.textContent = isEC ? 'EC' : 'FRC'; lbl.style.color = isEC ? '#1040a0' : '#e91e8c'; }
  if (other) other.style.display = 'none';
  const isOpen = panel && panel.style.display !== 'none';
  if (panel) panel.style.display = isOpen ? 'none' : 'block';
  if (arr) arr.textContent = isOpen ? '▸' : '▾';
}

// อัปเดต label เมื่อสลับ FRC/EC


function applyLegendMobileStyle() {
  const panel = document.getElementById('legend-panel');
  if (!panel) return;
  if (window.innerWidth > 640) {
    // Desktop: reset inline styles
    panel.removeAttribute('style');
    panel.querySelectorAll(':scope > *').forEach(el => {
      const id2 = el.id || '';
      if (id2 === 'note-panel-frc' || id2 === 'note-panel-ec') return; // ปล่อยให้ toggleNote() จัดการ
      el.removeAttribute('style');
    });
    return;
  }
  const expanded = panel.classList.contains('lg-expanded');
  // Force panel style
  panel.setAttribute('style',
    'position:absolute;bottom:0;left:0;right:0;width:100%;' +
    (expanded ? 'height:auto;max-height:50vh;flex-direction:column;align-items:stretch;padding:10px 14px;overflow-y:auto;' : 'height:44px;max-height:44px;flex-direction:row;align-items:center;padding:0 12px;overflow:hidden;') +
    'display:flex;gap:' + (expanded?'0':'8px') + ';' +
    'border-left:none;border-top:1.5px solid #f0d0e0;background:#fff;z-index:600;' +
    'box-shadow:0 -2px 12px rgba(180,0,80,.10);box-sizing:border-box;'
  );
  // Force each child
  panel.querySelectorAll(':scope > *').forEach(el => {
    const id = el.id || '';
    const isTitleEl = (id === 'lg-title' || el.tagName === 'H4');
    const isMiniBar = el.classList.contains('lg-mini-bar');
    const isToggle = (id === 'lg-toggle-btn');
    const isNotePanel = (id === 'note-panel-frc' || id === 'note-panel-ec');
    if (expanded) {
      if (isToggle) el.setAttribute('style','display:flex;margin-left:auto;');
      else if (isTitleEl) el.setAttribute('style','flex:1;');
      else if (isMiniBar) el.setAttribute('style','display:none;');
      else if (isNotePanel || isNoteBtn) { /* ปล่อยให้ CSS class จัดการ */ }
      else el.removeAttribute('style');
    } else {
      if (isTitleEl) el.setAttribute('style','flex:1;margin:0;font-size:12px;font-weight:700;white-space:nowrap;');
      else if (isMiniBar) el.setAttribute('style','flex:1;height:10px;border-radius:5px;display:block;');
      else if (isToggle) el.setAttribute('style','display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:#fff0f5;border:1px solid #f0c0d8;border-radius:50%;font-size:11px;color:#cc0055;cursor:pointer;flex-shrink:0;padding:0;');
      else el.setAttribute('style','display:none;');
    }
  });
}

function updateLegendMiniBar() {
  const bar = document.getElementById('lg-mini-bar');
  if (!bar) return;
  if (typeof PARAM_MODE !== 'undefined' && PARAM_MODE === 'ec') {
    bar.style.background = 'linear-gradient(90deg,#c8e8ff,#aaddff,#aaff20,#f0d220,#c81414)';
  } else {
    bar.style.background = 'linear-gradient(90deg,#be1e14,#f0aa14,#78c850,#32beaa,#2850b4,#642896)';
  }
}

// Init mini bar + watch param mode changes
window.addEventListener('load', () => {
  updateLegendMiniBar();
});

// Hide toggle btn on desktop, show on mobile
(function() {
  function checkSize() {
    const btn = document.getElementById('lg-toggle-btn');
    const bar = document.getElementById('lg-mini-bar');
    const isMobile = window.innerWidth <= 640;
    if (btn) btn.style.display = isMobile ? 'flex' : 'none';
    if (bar) bar.style.display = isMobile ? 'block' : 'none';
    // reset expanded state on desktop
    if (!isMobile) {
      const panel = document.getElementById('legend-panel');
      if (panel) panel.classList.remove('lg-expanded');
    }
    updateLegendMiniBar();
  }
  checkSize();
  applyLegendMobileStyle();
  window.addEventListener('resize', () => { checkSize(); applyLegendMobileStyle(); });
})();




// ── FRC Forecast Storage ─────────────────────────────────────────────────────
const FRC_FORE_KEY = 'mwa_frc_forecast_v1';
function saveFrcForecast(sensorId, forecastTs, frcFore, frcHi, frcLo) {
  try {
    const store = JSON.parse(localStorage.getItem(FRC_FORE_KEY) || '{}');
    const key = String(sensorId);
    if (!store[key]) store[key] = [];
    const cutoff = Date.now() - 7*24*3600000;
    store[key] = store[key].filter(p => p.foreTs > cutoff && Math.abs(p.foreTs - forecastTs) > 60000);
    store[key].push({ savedTs: Date.now(), foreTs: forecastTs, fore: +frcFore.toFixed(4), hi: +frcHi.toFixed(4), lo: +frcLo.toFixed(4) });
    store[key].sort((a,b) => a.foreTs - b.foreTs);
    localStorage.setItem(FRC_FORE_KEY, JSON.stringify(store));
  } catch(e) {}
}

// ── EC Forecast Storage — บันทึกค่าคาดการณ์เพื่อเปรียบเทียบกับค่าจริง ──────
const EC_FORE_KEY = 'mwa_ec_forecast_v1';

function saveEcForecast(sensorId, forecastTs, ecForecast, ecBandHi, ecBandLo) {
  try {
    const store = JSON.parse(localStorage.getItem(EC_FORE_KEY) || '{}');
    const key = String(sensorId);
    if (!store[key]) store[key] = [];
    // ลบ duplicate และเก่าเกิน 7 วัน
    const cutoff = Date.now() - 7*24*3600000;
    store[key] = store[key].filter(p => p.foreTs > cutoff && Math.abs(p.foreTs - forecastTs) > 60000);
    store[key].push({ savedTs: Date.now(), foreTs: forecastTs, fore: Math.round(ecForecast), hi: Math.round(ecBandHi), lo: Math.round(ecBandLo) });
    store[key].sort((a,b) => a.foreTs - b.foreTs);
    localStorage.setItem(EC_FORE_KEY, JSON.stringify(store));
  } catch(e) { console.warn('[EC Forecast]', e); }
}


// ── Chart hover tooltip (FRC & EC) ──────────────────────────────────────────
function chartHover(e, sid, PL, cw, HIST_WIN, totalT, yMin, yMax, PT, ch, pts, mode) {
  const svg = e.target ? e.target.closest('svg') : null;
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const mx = (e.clientX || e.pageX) - rect.left;
  const tVal = ((mx - PL) / cw) * totalT - HIST_WIN; // ชม. relative to now

  // หาค่าจาก pts ที่ใกล้ที่สุด
  let best = null, bestD = Infinity;
  for (const [t, f] of pts) {
    if (f == null || isNaN(f)) continue;
    const d = Math.abs(t - tVal);
    if (d < bestD) { bestD = d; best = { t, f }; }
  }
  if (!best || best.f == null || isNaN(best.f)) return;

  const g    = document.getElementById('chart-tt-' + sid);
  const line = document.getElementById('chart-tt-line-' + sid);
  const bg   = document.getElementById('chart-tt-bg-' + sid);
  const valT = document.getElementById('chart-tt-val-' + sid);
  const tmT  = document.getElementById('chart-tt-time-' + sid);
  if (!g) return;

  // คำนวณ x pixel — guard NaN
  const yRange = yMax - yMin;
  if (yRange === 0 || !isFinite(yRange)) return;
  const xPx = PL + ((best.t + HIST_WIN) / totalT) * cw;
  const yPx = PT + (1 - (best.f - yMin) / yRange) * ch;
  if (!isFinite(xPx) || !isFinite(yPx)) return;

  // format value
  const valStr = mode === 'ec' ? Math.round(best.f) + ' μS/cm' : best.f.toFixed(3) + ' mg/L';

  // format time
  const now = new Date();
  const absMs = now.getTime() + best.t * 3600000;
  const absD  = new Date(absMs);
  const hh = String(absD.getHours()).padStart(2,'0');
  const mm = String(absD.getMinutes()).padStart(2,'0');
  const timeStr = (best.t < 0 ? '(ย้อนหลัง) ' : '(คาดการณ์) ') + hh + ':' + mm;

  // position tooltip box
  const BOX_W = 118, BOX_H = 36;
  let bx = xPx + 6;
  if (bx + BOX_W > PL + cw) bx = xPx - BOX_W - 6;
  const by = Math.max(PT, Math.min(PT + ch - BOX_H, yPx - BOX_H/2));

  line.setAttribute('x1', xPx.toFixed(1));
  line.setAttribute('x2', xPx.toFixed(1));
  bg.setAttribute('x', bx.toFixed(1));
  bg.setAttribute('y', by.toFixed(1));
  bg.setAttribute('width', BOX_W);
  valT.setAttribute('x', (bx+8).toFixed(1));
  valT.setAttribute('y', (by+15).toFixed(1));
  tmT.setAttribute('x',  (bx+8).toFixed(1));
  tmT.setAttribute('y',  (by+29).toFixed(1));
  valT.textContent = valStr;
  tmT.textContent  = timeStr;
  g.style.display  = '';
}

// ── Mobile legend: apply immediately on load ─────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  if (window.innerWidth <= 640) {
    // Hide all legend children immediately before paint
    var panel = document.getElementById('legend-panel');
    if (panel) {
      var children = panel.children;
      for (var i = 0; i < children.length; i++) {
        var el = children[i];
        var id = el.id || '';
        var isMini = el.classList.contains('lg-mini-bar');
        var isTitle = (id === 'lg-title' || el.tagName === 'H4');
        var isBtn = (id === 'lg-toggle-btn');
        if (!isTitle && !isMini && !isBtn) el.style.display = 'none';
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// 📊 DAILY REPORT (embedded overlay)
// ═══════════════════════════════════════════════════════════════════
let _rpCharts = {};

function openReport() {
  document.getElementById('report-overlay').classList.add('open');
  buildReport();
}
function closeReport() {
  document.getElementById('report-overlay').classList.remove('open');
  Object.values(_rpCharts).forEach(c => c.destroy());
  _rpCharts = {};
}
function rpTab(mode) {
  document.querySelectorAll('.rp-tab').forEach((b,i) => b.classList.toggle('active', (mode==='frc'&&i===0)||(mode==='ec'&&i===1)||(mode==='feedback'&&i===2)||(mode==='stats'&&i===3)));
  document.getElementById('rp-frc').style.display = mode==='frc'?'':'none';
  document.getElementById('rp-ec').style.display = mode==='ec'?'':'none';
  var trendEl = document.getElementById('rp-trend');
  if (trendEl) trendEl.style.display = 'none';
  document.getElementById('rp-feedback').style.display = mode==='feedback'?'':'none';
  document.getElementById('rp-stats').style.display = mode==='stats'?'':'none';
  if (mode==='stats' && typeof _loadRpStats === 'function') _loadRpStats();
  // rev11.0: auto-check auth state เมื่อเปิด feedback tab
  if (mode==='feedback' && window.fbIsLoggedIn && window.fbIsLoggedIn()) {
    document.getElementById('rp-fb-auth').style.display='none';
    document.getElementById('rp-fb-list').style.display='';
    rpRenderFeedbacks();
  }
}
// ── Trend: เปรียบเทียบค่าจริง vs คาดการณ์ ย้อนหลัง 24 ชม. ──
function rpTrendRefresh() {
  var list = document.getElementById('rp-trend-list');
  var param = document.getElementById('rp-trend-param').value;
  var stations = SENSORS.filter(function(s) { return true; });
  // แบ่งกลุ่ม
  var pumps = stations.filter(function(s){return s.type==='pump'||s.type==='plant';});
  var mons = stations.filter(function(s){return s.type==='monitor';});
  var html = '<div style="font-size:9px;color:#a06080;padding:4px 8px;font-weight:700;">สถานีสูบจ่าย / โรงผลิต</div>';
  pumps.forEach(function(s){
    html += '<div class="rp-trend-item" data-id="'+s.id+'" data-name="'+s.name+'" onclick="rpTrendSelect(\''+s.id+'\')" style="padding:5px 10px;font-size:11px;cursor:pointer;border-bottom:1px solid #faeef4;transition:background .15s;">'+s.name+'</div>';
  });
  html += '<div style="font-size:9px;color:#a06080;padding:4px 8px;font-weight:700;border-top:2px solid #f0d0e0;">สถานี Monitor</div>';
  mons.forEach(function(s){
    html += '<div class="rp-trend-item" data-id="'+s.id+'" data-name="'+s.name+'" onclick="rpTrendSelect(\''+s.id+'\')" style="padding:5px 10px;font-size:11px;cursor:pointer;border-bottom:1px solid #faeef4;transition:background .15s;">'+s.name+'</div>';
  });
  list.innerHTML = html;
  document.getElementById('rp-trend-search').value = '';
  document.getElementById('rp-trend-chart').style.display = 'none';
}
function rpTrendFilter() {
  var q = document.getElementById('rp-trend-search').value.trim().toLowerCase();
  var items = document.querySelectorAll('#rp-trend-list .rp-trend-item');
  items.forEach(function(el){
    var name = (el.getAttribute('data-name')||'').toLowerCase();
    el.style.display = (!q || name.indexOf(q)>=0) ? '' : 'none';
  });
}
async function rpTrendSelect(sid) {
  var param = document.getElementById('rp-trend-param').value;
  var s = SENSORS.find(function(x){return String(x.id)===String(sid);});
  if (!s) return;
  document.querySelectorAll('#rp-trend-list .rp-trend-item').forEach(function(el){
    el.style.background = el.getAttribute('data-id')===String(sid) ? '#fff0f5' : '';
    el.style.fontWeight = el.getAttribute('data-id')===String(sid) ? '700' : '';
  });
  document.getElementById('rp-trend-chart').style.display = '';
  document.getElementById('rp-trend-chart-title').textContent = s.name + ' — ' + (param==='frc'?'FRC (mg/L)':'EC (μS/cm)');
  
  var code = String(s.id).replace(/\/|\./g, '-');
  var nowMs = Date.now();
  
  // ใช้ data จาก buildReport ที่โหลดไว้แล้ว (เร็วมาก ไม่ต้องดึง Firebase ซ้ำ)
  var fbHist = window._rpFirebaseHist || {};
  var localHist = loadHistory();
  
  // ลอง key หลายรูปแบบ
  var fbData = fbHist[code] || fbHist[String(s.id)] || [];
  var localData = localHist[code] || localHist[String(s.id)] || [];
  
  // ถ้ายังไม่เจอ ลอง brute force
  if (fbData.length === 0) {
    var fbKeys = Object.keys(fbHist);
    for (var i=0; i<fbKeys.length; i++) {
      if (fbKeys[i].toLowerCase() === code.toLowerCase() || fbKeys[i] === String(s.id)) {
        fbData = fbHist[fbKeys[i]]; break;
      }
    }
  }
  
  // merge + deduplicate
  var all = [].concat(fbData).concat(localData);
  var seen = {};
  var merged = all.filter(function(p) {
    if (!p || !p.ts) return false;
    var k = Math.round(p.ts / 60000);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }).sort(function(a,b){return a.ts - b.ts;});
  
  // debug info
  var oldest = merged.length>0 ? new Date(merged[0].ts) : null;
  var newest = merged.length>0 ? new Date(merged[merged.length-1].ts) : null;
  var in24h = merged.filter(function(p){return p.ts >= nowMs-24*3600000;}).length;
  
  var statusMsg = 'Firebase: '+fbData.length+' จุด · localStorage: '+localData.length+' จุด · รวม: '+merged.length+' จุด';
  statusMsg += '<br>ข้อมูล: '+(oldest?oldest.toLocaleString('th-TH'):'N/A')+' → '+(newest?newest.toLocaleString('th-TH'):'N/A')+' · ใน 24 ชม.: '+in24h+' จุด';
  document.getElementById('rp-trend-stats').innerHTML = statusMsg;
  
  console.log('[Trend] code:', code, 'FB:', fbData.length, 'local:', localData.length, 'merged:', merged.length, 'fbHist keys:', Object.keys(fbHist).slice(0,5));
  
  // store สำหรับ auto-fit
  _trendCurrentSensor = s;
  _trendCurrentParam = param;
  _trendCurrentData = merged;
  
  // แสดงปุ่ม Auto-fit K เฉพาะ FRC mode + มี source
  var rootInfo = ROOT_SOURCE_MAP[(s.name||'').trim()] || ROOT_SOURCE_MAP[(s.name||'').replace(/\s+/g,' ')];
  var showAutoFit = param === 'frc' && rootInfo && rootInfo.root;
  document.getElementById('rp-trend-autofit-btn').style.display = showAutoFit ? '' : 'none';
  document.getElementById(_trendKinfoId||'rp-trend-kinfo').style.display = 'none';
  
  rpTrendDraw(s, param, merged);
}
function rpTrendDraw(sensor, param, allData, _ids) {
  var IDS = _ids || {};
  // rev26: force dark colors for readability in both themes
  var _forceVividColors = true;
  var CVID = IDS.canvas || 'rp-trend-canvas';
  var STID = IDS.stats || 'rp-trend-stats';
  var KIID = IDS.kinfo || 'rp-trend-kinfo';
  try {
  var canvas = document.getElementById(CVID);
  if (!canvas) { console.error('[TrendDraw] canvas not found:', CVID); return; }
  // responsive: match CSS size
  var rect = canvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) {
    // retry after layout
    setTimeout(function(){ rpTrendDraw(sensor, param, allData, _ids); }, 100);
    return;
  }
  var dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  var ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  var W = rect.width, H = rect.height;
  ctx.clearRect(0,0,W,H);
  var isDk = _forceVividColors || document.body.classList.contains('dark');
  var PL=46, PR=16, PT=16, PB=50;
  var cw = W-PL-PR, ch = H-PT-PB;
  var nowMs = Date.now();

  var raw = allData || [];
  var data = raw.filter(function(p){return p&&p.ts&&p.ts>=nowMs-24*3600000;}).sort(function(a,b){return a.ts-b.ts;});
  if (data.length===0) data = raw.filter(function(p){return p&&p.ts;}).sort(function(a,b){return a.ts-b.ts;});

  var actPts = [];
  for (var i=0;i<data.length;i++) {
    var v = param==='frc'?(data[i].frc||data[i].FRC):(data[i].ec||data[i].EC);
    if (v!=null&&v>0&&isFinite(v)) actPts.push({ts:data[i].ts,v:Number(v)});
  }

  var statsEl = document.getElementById(STID);
  if (actPts.length===0) {
    // rev26: fallback — ใช้ค่า live ปัจจุบันจาก sensor object
    var _liveVal = param==='frc'?(sensor.frc||0):(sensor.ec||0);
    if (_liveVal > 0) {
      actPts.push({ts:nowMs-3600000, v:_liveVal});
      actPts.push({ts:nowMs, v:_liveVal});
    }
  }
  if (actPts.length===0) {
    ctx.fillStyle=isDk?'#ff8888':'#cc0044';ctx.font='bold 13px Sarabun,sans-serif';ctx.textAlign='center';
    ctx.fillText('ไม่พบค่า '+(param==='frc'?'FRC':'EC')+' ใน '+data.length+' records',W/2,H/2-10);
    if(data.length>0){ctx.font='10px JetBrains Mono';ctx.fillStyle=isDk?'#c0a0b0':'#a06080';ctx.fillText('fields: '+Object.keys(data[0]).join(', '),W/2,H/2+10);}
    return;
  }

  // Source + forecast
  var forePts=[], futPts=[];
  var key=String(sensor.id).replace(/\/|\./g,'-');
  var sName=(sensor.name||'').trim();
  var rootInfo=ROOT_SOURCE_MAP[sName]||ROOT_SOURCE_MAP[sName.replace(/\s+/g,' ')];
  var srcSensor=null, ttHours=0;
  if (rootInfo&&rootInfo.root) {
    var srcCode=typeof getSrcCodeFromLabel==='function'?getSrcCodeFromLabel(rootInfo.root):null;
    srcSensor=srcCode?SENSORS.find(function(x){return x.id&&x.id.toString()===srcCode;}):null;
    ttHours=rootInfo.ttRoot||0;
  }
  // forecast ย้อนหลัง — ใช้สูตรเดียวกับ buildDecayChart
  if (param==='frc'&&srcSensor&&ttHours>0) {
    var k_hr=typeof getStationKhr==='function'?getStationKhr(key):0.05;
    var srcCode2=String(srcSensor.id).replace(/\/|\./g,'-');
    // debug: ดู K source + source history
    var _kSrc = STATION_K_PENDING[key]!=null?'pending(auto-fit)':STATION_K[key]!=null?'K-default(Firebase)':STATION_K_OVERRIDE[key]!=null?'OVERRIDE(3mo-hardcode)':'fallback';
    var _dbgHist = getHistCached();
    var _dbgSrcPts = (_dbgHist[srcCode2]||[]).length;
    var _dbgSample = _dbgSrcPts>0 ? (_dbgHist[srcCode2][_dbgSrcPts-1]) : null;
    console.log('[TrendDraw] key:', key, 'K:', k_hr, '(source:', _kSrc, ') srcCode:', srcCode2, 'srcHistPts:', _dbgSrcPts, 'srcSample:', _dbgSample?JSON.stringify(_dbgSample).substring(0,80):'none');
    for(var fi=0;fi<actPts.length;fi++){
      // ณ เวลา actPts[fi].ts ค่าคาดการณ์ = source FRC ณ (t - ttHours) × e^(-k × tt)
      var srcTargetTs = actPts[fi].ts - ttHours*3600000;
      var srcFrcAtT = typeof getHistFrcAt==='function' 
        ? getHistFrcAt(srcCode2, srcTargetTs, srcSensor.frc||1.5, 0)
        : (srcSensor.frc||1.5);
      var predicted = srcFrcAtT * Math.exp(-k_hr * ttHours);
      if(!isFinite(predicted)) predicted = (srcSensor.frc||1.5)*Math.exp(-k_hr*ttHours);
      forePts.push({ts:actPts[fi].ts, v:Math.max(0,predicted)});
    }
    // forecast อนาคต — blend เหมือน buildDecayChart
    var lastActFrc = actPts[actPts.length-1].v;
    var futSteps = 12;
    for(var fs=0;fs<=futSteps;fs++){
      var t = (fs/futSteps)*ttHours;
      var frac = t/ttHours;
      var fOld = lastActFrc * Math.exp(-k_hr * t);
      var srcFutTs = nowMs + (t - ttHours)*3600000;
      var fSrcFut = typeof getHistFrcAt==='function'
        ? getHistFrcAt(srcCode2, srcFutTs, srcSensor.frc||1.5, 0)
        : (srcSensor.frc||1.5);
      var fNew = fSrcFut * Math.exp(-k_hr * ttHours);
      var fVal = fOld*(1-frac) + fNew*frac;
      if(!isFinite(fVal)) fVal = lastActFrc*Math.exp(-k_hr*t);
      futPts.push({ts:nowMs+t*3600000, v:Math.max(0,fVal)});
    }
  } else if (param==='ec') {
    // EC ใช้ EC_ROOT_SOURCE_MAP → โรงผลิต/อุโมงค์ต้นทาง (เหมือน popup chart)
    var ecRootInfo = typeof EC_ROOT_SOURCE_MAP!=='undefined' ? (EC_ROOT_SOURCE_MAP[sName]||EC_ROOT_SOURCE_MAP[sName.replace(/\s+/g,' ')]) : null;
    var ecSrcSensor = null, ecTT = 0;
    if (ecRootInfo) {
      var ecRootKey = ecRootInfo.root;
      ecTT = ecRootInfo.ttRoot || 0;
      var ecPlantName = typeof EC_SOURCE_MAP!=='undefined' ? EC_SOURCE_MAP[ecRootKey] : null;
      if (ecPlantName) {
        ecSrcSensor = SENSORS.find(function(x){return x.name===ecPlantName || (x.name&&x.name.includes(ecPlantName.replace(/\s*\d+$/,'').trim()));});
      }
    }
    // fallback: ใช้ ROOT_SOURCE_MAP ถ้าไม่มี EC_ROOT_SOURCE_MAP
    if (!ecSrcSensor && srcSensor && ttHours > 0) { ecSrcSensor = srcSensor; ecTT = ttHours; }
    
    if (ecSrcSensor && ecTT > 0) {
      var ecSrcCode = String(ecSrcSensor.id).replace(/\/|\./g,'-');
      var _ecHist = getHistCached();
      var ecSrcHist = (_ecHist[ecSrcCode]||[]).filter(function(p){return p.ts>=nowMs-72*3600000&&p.ec!=null&&p.ec>0;}).sort(function(a,b){return a.ts-b.ts;});
      for(var fi2=0;fi2<actPts.length;fi2++){
        var srcTs2=actPts[fi2].ts-ecTT*3600000, srcEc=ecSrcSensor.ec||250;
        // rev26: interpolate from raw water history
        var _rwK3=null;
        var _ecRI3=typeof EC_ROOT_SOURCE_MAP!=='undefined'?(EC_ROOT_SOURCE_MAP[sName]||EC_ROOT_SOURCE_MAP[sName.replace(/\s+/g,' ')]):null;
        if(_ecRI3&&_ecRI3.root==='RAW_SAMLE')_rwK3='S1';
        else if(_ecRI3&&_ecRI3.root==='RAW_MAEKLONG')_rwK3='S11';
        if(_rwK3){
          var _rwH3=_rwK3==='S1'?(window._rawWaterHistory||{}):(window._mkRawWaterHistory||{});
          var _rwHist3=(_rwH3[_rwK3]||[]).filter(function(p){return p.ec>0;}).sort(function(a,b){return a.ts-b.ts;});
          if(_rwHist3.length>0){
            if(srcTs2<=_rwHist3[0].ts)srcEc=_rwHist3[0].ec;
            else if(srcTs2>=_rwHist3[_rwHist3.length-1].ts)srcEc=_rwHist3[_rwHist3.length-1].ec;
            else{for(var j2=1;j2<_rwHist3.length;j2++){if(_rwHist3[j2].ts>=srcTs2){var _p0=_rwHist3[j2-1],_p1=_rwHist3[j2];srcEc=_p0.ec+(_p1.ec-_p0.ec)*((srcTs2-_p0.ts)/(_p1.ts-_p0.ts));break;}}}
          }
        } else {
          for(var j2=0;j2<ecSrcHist.length;j2++){if(ecSrcHist[j2].ts<=srcTs2&&ecSrcHist[j2].ec!=null)srcEc=ecSrcHist[j2].ec;}
        }
        forePts.push({ts:actPts[fi2].ts, v:srcEc});
      }
      // forecast อนาคต — rev26: ใช้ raw water history shifted ตาม travel time
      var _rwKey2=null;
      var _ecRI2=typeof EC_ROOT_SOURCE_MAP!=='undefined'?(EC_ROOT_SOURCE_MAP[sName]||EC_ROOT_SOURCE_MAP[sName.replace(/\s+/g,' ')]):null;
      if(_ecRI2&&_ecRI2.root==='RAW_SAMLE')_rwKey2='S1';
      else if(_ecRI2&&_ecRI2.root==='RAW_MAEKLONG')_rwKey2='S11';
      var _rwH2=_rwKey2==='S1'?(window._rawWaterHistory||{}):(window._mkRawWaterHistory||{});
      var _rwHist2=(_rwH2[_rwKey2]||[]).filter(function(p){return p.ec>0;}).sort(function(a,b){return a.ts-b.ts;});
      function _getRwEc2(ts){
        if(!_rwHist2.length)return ecSrcSensor.ec||250;
        if(ts<=_rwHist2[0].ts)return _rwHist2[0].ec;
        if(ts>=_rwHist2[_rwHist2.length-1].ts)return _rwHist2[_rwHist2.length-1].ec;
        for(var ri=1;ri<_rwHist2.length;ri++){if(_rwHist2[ri].ts>=ts){var f0=_rwHist2[ri-1],f1=_rwHist2[ri];return f0.ec+(f1.ec-f0.ec)*((ts-f0.ts)/(f1.ts-f0.ts));}}
        return ecSrcSensor.ec||250;
      }
      var _futStepsEc=12;
      for(var fs2=0;fs2<=_futStepsEc;fs2++){var _ft2=(fs2/_futStepsEc)*ecTT;var _fSrcTs2=nowMs+(_ft2-ecTT)*3600000;futPts.push({ts:nowMs+_ft2*3600000,v:_getRwEc2(_fSrcTs2)});}
    }
  }

  // Y/X range — include future forecast
  var allVals=actPts.map(function(p){return p.v;}).concat(forePts.map(function(p){return p.v;})).concat(futPts.map(function(p){return p.v;}));
  var yMin=0, yMax=Math.max.apply(null,allVals)*1.2;
  if(param==='frc')yMax=Math.max(yMax,2.0);else yMax=Math.max(yMax,400);
  var tMin=actPts[0].ts;
  var tMax=futPts.length>0?futPts[futPts.length-1].ts:Math.max(actPts[actPts.length-1].ts,nowMs);
  tMax=Math.max(tMax,nowMs+1*3600000);
  if(tMax-tMin<3600000)tMax=tMin+3600000;

  function px(ts){return PL+((ts-tMin)/(tMax-tMin))*cw;}
  function py(v){return PT+(1-(v-yMin)/(yMax-yMin))*ch;}

  // === BG ===
  ctx.fillStyle=isDk?'rgba(20,20,40,.85)':'#fafbff';
  ctx.fillRect(PL,PT,cw,ch);
  // future zone
  if(futPts.length>0){
    ctx.fillStyle=isDk?'rgba(60,40,100,.15)':'rgba(100,70,200,.04)';
    ctx.fillRect(px(nowMs),PT,px(tMax)-px(nowMs),ch);
  }

  // grid
  for(var gi=0;gi<=4;gi++){
    var gy=PT+ch*gi/4;
    ctx.strokeStyle=isDk?'rgba(255,255,255,.08)':'#e8e0f0';ctx.lineWidth=0.5;
    ctx.beginPath();ctx.moveTo(PL,gy);ctx.lineTo(PL+cw,gy);ctx.stroke();
    ctx.fillStyle=isDk?'#b0b0d0':'#806080';ctx.font='bold 9px JetBrains Mono,monospace';ctx.textAlign='right';
    var lv=yMax-(yMax-yMin)*gi/4;
    ctx.fillText(param==='frc'?lv.toFixed(2):Math.round(lv).toString(),PL-5,gy+3);
  }

  // X time labels (rev24)
  ctx.font='9px JetBrains Mono,monospace';ctx.textAlign='center';
  var totalHrs=Math.max(1,Math.round((tMax-tMin)/3600000));
  var tickStep=totalHrs<=8?1:totalHrs<=24?3:6;
  var _mmN=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  var _lastDL='';
  for(var h=0;h<=totalHrs;h+=tickStep){
    var tx=tMin+h*3600000;if(tx>tMax)break;
    var dd=new Date(tx);
    var isFut=tx>nowMs;
    ctx.save();ctx.translate(px(tx),PT+ch+13);ctx.rotate(-Math.PI/2);
    ctx.fillStyle=isFut?(isDk?'#a080d0':'#6050a0'):(isDk?'#b0b0d0':'#806080');
    ctx.textAlign='right';ctx.font='8px JetBrains Mono,monospace';
    ctx.fillText(String(dd.getHours()).padStart(2,'0')+':00',0,0);
    ctx.restore();
    var _dl=dd.getDate()+' '+_mmN[dd.getMonth()];
    if(_dl!==_lastDL){_lastDL=_dl;ctx.fillStyle=isDk?'#80b0e0':'#1565c0';ctx.font='bold 8px Sarabun,sans-serif';ctx.textAlign='center';ctx.fillText(_dl,px(tx),PT+ch+48);}
  }

  // FRC thresholds
  if(param==='frc'){
    ctx.setLineDash([4,3]);
    if(yMax>=0.2){ctx.strokeStyle='rgba(180,0,0,0.4)';ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(PL,py(0.2));ctx.lineTo(PL+cw,py(0.2));ctx.stroke();ctx.fillStyle=isDk?'#ff8888':'#b40000';ctx.font='bold 8px JetBrains Mono';ctx.textAlign='left';ctx.fillText('0.2',PL+3,py(0.2)-3);}
    if(yMax>=1.0){ctx.strokeStyle='rgba(0,120,220,0.35)';ctx.beginPath();ctx.moveTo(PL,py(1.0));ctx.lineTo(PL+cw,py(1.0));ctx.stroke();ctx.fillStyle=isDk?'#80b0ff':'#0078dc';ctx.fillText('1.0',PL+3,py(1.0)-3);}
    ctx.setLineDash([]);
  }

  // "ตอนนี้" line
  ctx.strokeStyle=isDk?'rgba(255,255,255,.25)':'rgba(0,0,0,.15)';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);
  ctx.beginPath();ctx.moveTo(px(nowMs),PT);ctx.lineTo(px(nowMs),PT+ch);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=isDk?'#e0d0f0':'#5030a0';ctx.font='bold 10px Sarabun,sans-serif';ctx.textAlign='center';
  ctx.fillText('ตอนนี้',px(nowMs),PT-3);

  // Confidence band (past)
  if(forePts.length>=2){
    ctx.fillStyle=isDk?'rgba(78,204,163,0.10)':'rgba(0,184,148,0.08)';
    ctx.beginPath();
    for(var bi=0;bi<forePts.length;bi++)ctx.lineTo(px(forePts[bi].ts),py(forePts[bi].v*1.15));
    for(var bi2=forePts.length-1;bi2>=0;bi2--)ctx.lineTo(px(forePts[bi2].ts),py(Math.max(0,forePts[bi2].v*0.85)));
    ctx.closePath();ctx.fill();
  }
  // Confidence band (future)
  if(futPts.length>=2){
    ctx.fillStyle=isDk?'rgba(120,80,200,0.10)':'rgba(100,70,200,0.06)';
    ctx.beginPath();
    for(var ci=0;ci<futPts.length;ci++)ctx.lineTo(px(futPts[ci].ts),py(futPts[ci].v*1.15));
    for(var ci2=futPts.length-1;ci2>=0;ci2--)ctx.lineTo(px(futPts[ci2].ts),py(Math.max(0,futPts[ci2].v*0.85)));
    ctx.closePath();ctx.fill();
  }

  // forecast line (past) — dashed green
  if(forePts.length>=2){
    ctx.strokeStyle=isDk?'#4ecca3':'#00b894';ctx.lineWidth=1.5;ctx.setLineDash([5,3]);
    ctx.beginPath();ctx.moveTo(px(forePts[0].ts),py(forePts[0].v));
    for(var fl=1;fl<forePts.length;fl++)ctx.lineTo(px(forePts[fl].ts),py(forePts[fl].v));
    ctx.stroke();ctx.setLineDash([]);
  }
  // forecast line (future) — dashed purple
  if(futPts.length>=2){
    ctx.strokeStyle=isDk?'#a080d0':'#7c5ce7';ctx.lineWidth=1.8;ctx.setLineDash([6,4]);
    ctx.beginPath();ctx.moveTo(px(futPts[0].ts),py(futPts[0].v));
    for(var fl2=1;fl2<futPts.length;fl2++)ctx.lineTo(px(futPts[fl2].ts),py(futPts[fl2].v));
    ctx.stroke();ctx.setLineDash([]);
    // label
    var lastFut=futPts[futPts.length-1];
    ctx.fillStyle=isDk?'#a080d0':'#7c5ce7';ctx.font='bold 9px Sarabun';ctx.textAlign='left';
    ctx.fillText('คาดการณ์',px(lastFut.ts)+4,py(lastFut.v)+3);
  }

  // Actual line
  var actColor=param==='frc'?(isDk?'#ff4477':'#e84393'):(isDk?'#4ea8de':'#1565c0');
  ctx.strokeStyle=actColor;ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(px(actPts[0].ts),py(actPts[0].v));
  for(var ai=1;ai<actPts.length;ai++)ctx.lineTo(px(actPts[ai].ts),py(actPts[ai].v));
  ctx.stroke();
  // dots (every Nth for performance)
  var dotStep=Math.max(1,Math.floor(actPts.length/60));
  for(var di=0;di<actPts.length;di+=dotStep){
    ctx.beginPath();ctx.arc(px(actPts[di].ts),py(actPts[di].v),1.8,0,Math.PI*2);
    ctx.fillStyle=actColor;ctx.fill();
  }

  // Legend (bottom)
  var ly=PT+ch+26;
  ctx.font='10px Sarabun,sans-serif';ctx.textAlign='left';
  var lx=PL;
  // actual
  ctx.fillStyle=actColor;ctx.fillRect(lx,ly-4,12,2.5);ctx.fillText('ค่าจริง ('+actPts.length+' จุด)',lx+16,ly);
  lx+=130;
  if(forePts.length>0){
    ctx.strokeStyle=isDk?'#4ecca3':'#00b894';ctx.lineWidth=1.5;ctx.setLineDash([3,2]);
    ctx.beginPath();ctx.moveTo(lx,ly-2);ctx.lineTo(lx+12,ly-2);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=isDk?'#4ecca3':'#00b894';ctx.fillText('คาดการณ์ย้อนหลัง',lx+16,ly);
    lx+=140;
  }
  if(futPts.length>0){
    ctx.strokeStyle=isDk?'#a080d0':'#7c5ce7';ctx.lineWidth=1.5;ctx.setLineDash([3,2]);
    ctx.beginPath();ctx.moveTo(lx,ly-2);ctx.lineTo(lx+12,ly-2);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=isDk?'#a080d0':'#7c5ce7';ctx.fillText('คาดการณ์อนาคต (+'+Math.round(param==='ec'?ecTT:ttHours)+'ชม.)',lx+16,ly);
    lx+=180;
  }
  if(forePts.length>0||futPts.length>0){
    ctx.fillStyle=isDk?'rgba(78,204,163,0.35)':'rgba(0,184,148,0.25)';ctx.fillRect(lx,ly-6,12,10);
    ctx.fillStyle=isDk?'#90b0a0':'#607060';ctx.fillText('Band ±15%',lx+16,ly);
  }

  // axis border
  ctx.strokeStyle=isDk?'rgba(255,255,255,.1)':'rgba(0,0,0,.08)';ctx.lineWidth=1;
  ctx.strokeRect(PL,PT,cw,ch);

  // Stats
  var sh='';
  if(forePts.length>0){
    var errs=[],wb=0;
    for(var si=0;si<Math.min(actPts.length,forePts.length);si++){
      errs.push(Math.abs(actPts[si].v-forePts[si].v));
      if(actPts[si].v>=forePts[si].v*0.85&&actPts[si].v<=forePts[si].v*1.15)wb++;
    }
    var mae=errs.reduce(function(a,b){return a+b;},0)/errs.length;
    var pct=Math.round(wb/errs.length*100);
    sh='📊 เปรียบเทียบ <b>'+errs.length+'</b> จุด · MAE: <b>'+(param==='frc'?mae.toFixed(3):Math.round(mae))+'</b> '+(param==='frc'?'mg/L':'μS/cm')+' · อยู่ใน Band: <b>'+pct+'%</b> '+(pct>=70?'<span style="color:'+(isDk?'#4ecca3':'#00b894')+'">✓ ดี</span>':pct>=50?'<span style="color:#e0a000">⚡ พอใช้</span>':'<span style="color:#e84393">⚠ ต้องปรับปรุง</span>');
    if(param==='frc') {
      if(srcSensor) sh+=' · source: '+((srcSensor.name||'').substring(0,25))+' (tt='+ttHours+'ชม.)';
      if(srcSensor&&ttHours>0) {
        var _srcH2 = getHistCached();
        var _srcPts2 = (_srcH2[srcCode2]||[]).length;
        sh+=' · <b>K='+k_hr.toFixed(4)+'</b>/ชม. ['+_kSrc+'] · srcHist:'+_srcPts2+'pts';
      }
    } else if(param==='ec') {
      // แสดง EC source ที่ใช้จริง (จาก EC_ROOT_SOURCE_MAP)
      var _ecRI = typeof EC_ROOT_SOURCE_MAP!=='undefined' ? (EC_ROOT_SOURCE_MAP[(sensor.name||'').trim()]||EC_ROOT_SOURCE_MAP[(sensor.name||'').replace(/\s+/g,' ')]) : null;
      if(_ecRI) {
        var _ecPN = typeof EC_SOURCE_MAP!=='undefined' ? EC_SOURCE_MAP[_ecRI.root] : null;
        var _ecSrc = _ecPN ? SENSORS.find(function(x){return x.name===_ecPN||x.name.includes(_ecPN.replace(/\s*\d+$/,'').trim());}) : null;
        sh+=' · source: '+(_ecRI.root)+(_ecSrc?' ('+(_ecSrc.name||'').substring(0,20)+')':'')+' (tt='+_ecRI.ttRoot+'ชม.)';
      } else if(srcSensor) {
        sh+=' · source: '+((srcSensor.name||'').substring(0,25))+' (tt='+ttHours+'ชม.)';
      }
    }
  } else {
    sh='📊 ค่าจริง <b>'+actPts.length+'</b> จุด';
    if(!srcSensor) sh+=' · <span style="color:'+(isDk?'#e0c060':'#a06000')+'">สถานี source — ไม่มีเส้นคาดการณ์</span>';
  }
  statsEl.innerHTML=sh;

  } catch(e) {
    console.error('[TrendDraw] ERROR:',e);
    var c2=document.getElementById(CVID).getContext('2d');
    c2.fillStyle='#ff4444';c2.font='bold 13px Sarabun';c2.textAlign='center';
    c2.fillText('Error: '+e.message,300,160);
    document.getElementById(STID).innerHTML='<b style="color:red;">'+e.message+'</b>';
  }
}


// ── Report: Dropdown station filter for charts ──
var _rpChartData = {};

function rpPopulateDropdowns(pumps, mons, hist) {
  var sels = {
    'rp-frc-pump-sel': pumps, 'rp-frc-mon-sel': mons,
    'rp-ec-pump-sel': pumps, 'rp-ec-mon-sel': mons
  };
  var trendSels = {'rp-frc-trend-sel': pumps.concat(mons), 'rp-ec-trend-sel': pumps.concat(mons)};
  
  Object.keys(sels).forEach(function(id){
    var sel=document.getElementById(id); if(!sel) return;
    while(sel.options.length>1) sel.remove(1);
    sels[id].forEach(function(s){
      var o=document.createElement('option'); o.value=String(s.id); o.textContent=s.name; sel.appendChild(o);
    });
  });
  Object.keys(trendSels).forEach(function(id){
    var sel=document.getElementById(id); if(!sel) return;
    while(sel.options.length>1) sel.remove(1);
    // แบ่งกลุ่ม
    var og1=document.createElement('optgroup'); og1.label='สถานีสูบจ่าย / โรงผลิต';
    pumps.forEach(function(s){var o=document.createElement('option');o.value=String(s.id);o.textContent=s.name;og1.appendChild(o);});
    sel.appendChild(og1);
    var og2=document.createElement('optgroup'); og2.label='สถานี Monitor';
    mons.forEach(function(s){var o=document.createElement('option');o.value=String(s.id);o.textContent=s.name;og2.appendChild(o);});
    sel.appendChild(og2);
  });
  _rpChartData = {pumps:pumps, mons:mons, hist:hist};
}

function rpChartSelectStation(param, type) {
  var sel=document.getElementById('rp-'+param+'-'+type+'-sel'); if(!sel) return;
  var sid=sel.value, d=_rpChartData;
  var stations=type==='pump'?d.pumps:d.mons;
  var thr=param==='frc'?[FRC_MIN,FRC_HI]:[EC_LO,EC_HI];
  var canvasId='rp-'+param+'-chart-'+type;
  if (sid !== 'all') {
    // rev26: single station → use rpTrendDraw (with forecast + band like popup)
    var s = stations.find(function(x){return String(x.id)===sid;});
    if (s) {
      // Destroy existing Chart.js chart
      if (_rpCharts[canvasId]) { _rpCharts[canvasId].destroy(); _rpCharts[canvasId]=null; }
      var code=String(s.id).replace(/\/|\./g,'-');
      var fb=d.hist[code]||d.hist[String(s.id)]||[];
      var lc=(typeof loadHistory==='function'?loadHistory():{})[code]||[];
      var seen={};
      var merged=[].concat(fb).concat(lc).filter(function(p){if(!p||!p.ts)return false;var k=Math.round(p.ts/60000);if(seen[k])return false;seen[k]=true;return true;}).sort(function(a,b){return a.ts-b.ts;});
      rpTrendDraw(s, param, merged, { canvas:canvasId, stats:'rp-'+param+'-chart-'+type+'-stats' });
      return;
    }
  }
  rpBuildChart(canvasId, sid==='all'?stations:stations.filter(function(s){return String(s.id)===sid;}), d.hist, param, thr);
}

async function rpTrendFromReport(param) {
  var sel=document.getElementById('rp-'+param+'-trend-sel');
  var chartDiv=document.getElementById('rp-'+param+'-trend-chart');
  if(!sel||!sel.value){if(chartDiv)chartDiv.style.display='none';return;}
  var s=SENSORS.find(function(x){return String(x.id)===String(sel.value);});
  if(!s) return;
  chartDiv.style.display='';
  _trendCurrentSensor=s; _trendCurrentParam=param;
  // load data
  var code=String(s.id).replace(/\/|\./g,'-');
  var fbH=window._rpFirebaseHist||{}, lcH=loadHistory();
  var fb=fbH[code]||fbH[String(s.id)]||[], lc=lcH[code]||lcH[String(s.id)]||[];
  var seen={};
  var merged=[].concat(fb).concat(lc).filter(function(p){if(!p||!p.ts)return false;var k=Math.round(p.ts/60000);if(seen[k])return false;seen[k]=true;return true;}).sort(function(a,b){return a.ts-b.ts;});
  _trendCurrentData=merged;
  _trendKinfoId='rp-'+param+'-trend-kinfo';
  // auto-fit button
  var ri=ROOT_SOURCE_MAP[(s.name||'').trim()]||ROOT_SOURCE_MAP[(s.name||'').replace(/\s+/g,' ')];
  var afBtn=document.getElementById('rp-'+param+'-autofit-btn');
  if(afBtn) afBtn.style.display=(param==='frc'&&ri&&ri.root)?'':'none';
  var ki=document.getElementById('rp-'+param+'-trend-kinfo');
  if(ki) ki.style.display='none';
  // draw with correct IDs — ต้องรอ browser render ก่อน
  requestAnimationFrame(function(){
    rpTrendDraw(s, param, merged, {
      canvas: 'rp-'+param+'-trend-canvas',
      stats: 'rp-'+param+'-trend-stats',
      kinfo: 'rp-'+param+'-trend-kinfo'
    });
  });
}

// store สำหรับ auto-fit
var _trendCurrentSensor = null, _trendCurrentParam = null, _trendCurrentData = null;
var _trendKinfoId = 'rp-trend-kinfo';

// ── Auto-fit K All: fit ทุกสถานีที่มี source mapping ──
async function rpAutoFitKAll(param) {
  if (param !== 'frc') return;
  var statusEl = document.getElementById('rp-frc-fitall-status');
  statusEl.style.display = '';
  statusEl.innerHTML = '⏳ กำลัง Auto-fit K ทุกสถานี...';

  var nowMs = Date.now();
  var fbHist = window._rpFirebaseHist || {};
  var lcHist = loadHistory();
  var results = [];
  var total = 0, success = 0, skipped = 0;

  for (var si = 0; si < SENSORS.length; si++) {
    var s = SENSORS[si];
    var sName = (s.name || '').trim();
    var rootInfo = ROOT_SOURCE_MAP[sName] || ROOT_SOURCE_MAP[sName.replace(/\s+/g, ' ')];
    if (!rootInfo || !rootInfo.root) continue;
    var srcCode = typeof getSrcCodeFromLabel === 'function' ? getSrcCodeFromLabel(rootInfo.root) : null;
    var srcSensor = srcCode ? SENSORS.find(function(x) { return x.id && x.id.toString() === srcCode; }) : null;
    if (!srcSensor) continue;
    var ttHours = rootInfo.ttRoot || 0;
    if (ttHours <= 0) continue;

    total++;
    var key = String(s.id).replace(/\/|\./g, '-');
    var srcCode2 = String(srcSensor.id).replace(/\/|\./g, '-');

    // load data
    var code = key;
    var fb = fbHist[code] || fbHist[String(s.id)] || [];
    var lc = lcHist[code] || lcHist[String(s.id)] || [];
    var seen = {};
    var merged = [].concat(fb).concat(lc).filter(function(p) {
      if (!p || !p.ts) return false;
      var k2 = Math.round(p.ts / 60000);
      if (seen[k2]) return false; seen[k2] = true; return true;
    });

    var data = merged.filter(function(p) { return p.ts >= nowMs - 24 * 3600000; });
    if (data.length === 0) data = merged;

    var actPts = [];
    for (var di = 0; di < data.length; di++) {
      var v = data[di].frc || data[di].FRC;
      if (v != null && v > 0 && isFinite(v)) actPts.push({ ts: data[di].ts, v: Number(v) });
    }
    if (actPts.length < 5) { skipped++; continue; }

    // Grid search K
    var bestK = 0.05, bestMAE = Infinity;
    for (var kTry = 0.001; kTry <= 0.500; kTry += 0.001) {
      var totalErr = 0, count = 0;
      for (var j = 0; j < actPts.length; j++) {
        var srcTs = actPts[j].ts - ttHours * 3600000;
        var srcFrc = typeof getHistFrcAt === 'function'
          ? getHistFrcAt(srcCode2, srcTs, srcSensor.frc || 1.5, 0)
          : (srcSensor.frc || 1.5);
        var predicted = srcFrc * Math.exp(-kTry * ttHours);
        if (isFinite(predicted) && predicted > 0) {
          totalErr += Math.abs(actPts[j].v - predicted);
          count++;
        }
      }
      if (count > 0) {
        var mae = totalErr / count;
        if (mae < bestMAE) { bestMAE = mae; bestK = kTry; }
      }
    }

    // Save to PENDING (ยังไม่ confirm)
    STATION_K_PENDING[key] = bestK;
    results.push({ name: s.name, code: key, k: bestK, mae: bestMAE, pts: actPts.length });
    success++;

    // update status ทุก 5 สถานี
    if (success % 5 === 0) {
      statusEl.innerHTML = '⏳ กำลัง fit... ' + success + '/' + total + ' สถานี';
    }
  }

  // Save all to PENDING only (ยังไม่บันทึก Firebase จนกว่า user จะกดยืนยัน)
  // ค่า pending จะถูกใช้ผ่าน getStationKhr โดยอัตโนมัติ
  console.log('[K All] auto-fit done:', success, 'stations → saved to STATION_K_PENDING (awaiting confirm)');

  // แสดงผล
  results.sort(function(a, b) { return a.mae - b.mae; });
  var isDk = document.body.classList.contains('dark');
  var html = '✅ <b>Auto-fit K เสร็จ ' + success + '/' + total + ' สถานี</b> (ข้าม ' + skipped + ' — ข้อมูลน้อย)<br>';
  html += '<div style="background:'+(isDk?'rgba(0,180,100,.1)':'#f0fff5')+';border:1.5px solid '+(isDk?'rgba(0,180,100,.3)':'#80d0a0')+';border-radius:10px;padding:10px 12px;margin:8px 0;">';
  html += '<div style="font-size:11px;font-weight:700;color:'+(isDk?'#4ecca3':'#008060')+';margin-bottom:6px;">⚠ ค่า K ใหม่ยังไม่ถูกบันทึก — กดปุ่มด้านล่างเพื่อใช้เป็น Default</div>';
  html += '<button onclick="confirmKDefault()" style="width:100%;padding:10px;font-size:13px;font-weight:800;font-family:Sarabun,sans-serif;background:linear-gradient(135deg,#00b894,#009874);color:#fff;border:none;border-radius:8px;cursor:pointer;box-shadow:0 2px 12px rgba(0,184,148,.3);transition:all .2s;letter-spacing:.5px;">✅ บันทึกเป็น K Default ใหม่ ('+success+' สถานี)</button>';
  html += '<div style="font-size:9px;color:'+(isDk?'#80a090':'#609070')+';margin-top:4px;text-align:center;">กดแล้ว Firebase จะเก็บค่านี้ถาวร · ถ้าไม่กด จะกลับเป็นค่าเดิมเมื่อ reload</div>';
  html += '</div>';
  html += '<div style="max-height:200px;overflow-y:auto;margin-top:6px;">';
  html += '<table style="width:100%;font-size:9px;border-collapse:collapse;">';
  html += '<tr style="background:' + (isDk ? '#2a0a20' : '#fff0f5') + ';font-weight:700;"><td style="padding:3px 6px;">สถานี</td><td>K</td><td>hl</td><td>MAE</td><td>จุด</td></tr>';
  for (var i = 0; i < results.length; i++) {
    var r3 = results[i];
    var hl = Math.round(0.693 / r3.k);
    html += '<tr style="border-bottom:1px solid ' + (isDk ? 'rgba(255,255,255,.05)' : '#f0e0f0') + ';"><td style="padding:2px 6px;">' + r3.name.substring(0, 25) + '</td><td style="font-family:JetBrains Mono;font-weight:600;">' + r3.k.toFixed(4) + '</td><td>' + hl + 'h</td><td>' + r3.mae.toFixed(3) + '</td><td>' + r3.pts + '</td></tr>';
  }
  html += '</table></div>';
  statusEl.innerHTML = html;

  // rebuild report compare
  if (typeof rpBuildCompare === 'function') {
    rpBuildCompare('rp-frc-compare', 'frc');
  }
  buildMarkers();
  // clear cache เพื่อให้ getHistFrcAt ใช้ K ใหม่
  _histCache = null; _histCacheTs = 0;
  // redraw กราฟที่เปิดอยู่
  var sel = document.getElementById('rp-frc-trend-sel');
  if (sel && sel.value) {
    setTimeout(function(){
      rpTrendFromReport('frc');
      statusEl.innerHTML += '<br>✅ กราฟ update ด้วย K ใหม่แล้ว';
    }, 500);
  }
}

// ── Auto-fit K: หาค่า K ที่ minimize MAE จาก actual vs forecast ──
// ── Confirm K Default: บันทึก STATION_K_PENDING ลง Firebase เป็น K default ──
async function confirmSingleKDefault(stationCode, newK) {
  var kinfo = document.getElementById(_trendKinfoId||'rp-trend-kinfo');
  if (kinfo) kinfo.innerHTML = '⏳ กำลังบันทึก...';
  try {
    await window._fbSet(
      window._fbRef(window._fb, 'history/_station_k_default/' + stationCode.replace(/\/|\./g, '-')),
      { k: newK, ts: Date.now() }
    );
    STATION_K[stationCode] = newK;
    delete STATION_K_PENDING[stationCode];
    // update localStorage cache
    try {
      var cached = JSON.parse(localStorage.getItem('frc_k_default') || '{}');
      cached[stationCode] = newK;
      localStorage.setItem('frc_k_default', JSON.stringify(cached));
    } catch(e){}
    if (kinfo) {
      var isDk = document.body.classList.contains('dark');
      kinfo.innerHTML = '✅ <b>K = ' + newK.toFixed(4) + '</b>/ชม. — บันทึกเป็น Default แล้ว';
      kinfo.style.color = isDk ? '#4ecca3' : '#008060';
    }
    buildMarkers();
    _histCache = null; _histCacheTs = 0;
  } catch(e) {
    if (kinfo) kinfo.innerHTML = '❌ บันทึกล้มเหลว: ' + e.message;
    console.error('[K] single save failed:', e);
  }
}

async function confirmKDefault() {
  var pendingCount = Object.keys(STATION_K_PENDING).length;
  if (pendingCount === 0) {
    alert('ไม่มีค่า K ที่รอยืนยัน — กรุณา Auto-fit K All ก่อน');
    return;
  }
  var statusEl = document.getElementById('rp-frc-fitall-status');
  if (statusEl) statusEl.innerHTML = '⏳ กำลังบันทึก K Default ลง Firebase...';

  var success = await fbSaveKDefault(STATION_K_PENDING);
  if (success) {
    if (statusEl) {
      var isDk = document.body.classList.contains('dark');
      statusEl.innerHTML = '<div style="background:'+(isDk?'rgba(0,180,100,.15)':'#e0fff0')+';border:1.5px solid '+(isDk?'#4ecca3':'#00b894')+';border-radius:8px;padding:12px;text-align:center;">'
        + '<div style="font-size:16px;margin-bottom:4px;">✅</div>'
        + '<div style="font-size:13px;font-weight:700;color:'+(isDk?'#4ecca3':'#008060')+';">บันทึก K Default สำเร็จ!</div>'
        + '<div style="font-size:10px;color:'+(isDk?'#80a090':'#609070')+';margin-top:4px;">'+pendingCount+' สถานี · จะใช้ค่านี้เป็น default ทุกครั้งที่เปิดเว็บ</div>'
        + '</div>';
    }
    // rebuild
    buildMarkers();
    _histCache = null; _histCacheTs = 0;
    if (typeof rpBuildCompare === 'function') rpBuildCompare('rp-frc-compare', 'frc');
    var sel = document.getElementById('rp-frc-trend-sel');
    if (sel && sel.value) setTimeout(function(){ rpTrendFromReport('frc'); }, 300);
  }
}

function rpTrendAutoFitK() {
  var sensor = _trendCurrentSensor;
  var param = _trendCurrentParam;
  var allData = _trendCurrentData;
  if (!sensor || param !== 'frc' || !allData) return;

  var isDk = document.body.classList.contains('dark');
  var nowMs = Date.now();
  var key = String(sensor.id).replace(/\/|\./g, '-');
  var sName = (sensor.name || '').trim();
  var rootInfo = ROOT_SOURCE_MAP[sName] || ROOT_SOURCE_MAP[sName.replace(/\s+/g, ' ')];
  if (!rootInfo || !rootInfo.root) {
    document.getElementById(_trendKinfoId||'rp-trend-kinfo').style.display = '';
    document.getElementById(_trendKinfoId||'rp-trend-kinfo').innerHTML = '⚠ ไม่สามารถ fit K ได้ — สถานีนี้ไม่มี source mapping';
    return;
  }
  var srcCode = typeof getSrcCodeFromLabel === 'function' ? getSrcCodeFromLabel(rootInfo.root) : null;
  var srcSensor = srcCode ? SENSORS.find(function(x) { return x.id && x.id.toString() === srcCode; }) : null;
  if (!srcSensor) {
    document.getElementById(_trendKinfoId||'rp-trend-kinfo').style.display = '';
    document.getElementById(_trendKinfoId||'rp-trend-kinfo').innerHTML = '⚠ ไม่พบ source sensor สำหรับ ' + rootInfo.root;
    return;
  }
  var ttHours = rootInfo.ttRoot || 0;
  if (ttHours <= 0) return;

  var srcCode2 = String(srcSensor.id).replace(/\/|\./g, '-');

  // ดึง actual points
  var data = (allData || []).filter(function(p) { return p && p.ts && p.ts >= nowMs - 24 * 3600000; }).sort(function(a, b) { return a.ts - b.ts; });
  var actPts = [];
  for (var i = 0; i < data.length; i++) {
    var v = data[i].frc || data[i].FRC;
    if (v != null && v > 0 && isFinite(v)) actPts.push({ ts: data[i].ts, v: Number(v) });
  }
  if (actPts.length < 5) {
    document.getElementById(_trendKinfoId||'rp-trend-kinfo').style.display = '';
    document.getElementById(_trendKinfoId||'rp-trend-kinfo').innerHTML = '⚠ ข้อมูลไม่เพียงพอ (ต้องมีอย่างน้อย 5 จุด, มี ' + actPts.length + ')';
    return;
  }

  // Grid search K: 0.001 → 0.200 step 0.001
  var bestK = 0.05, bestMAE = Infinity;
  for (var kTry = 0.001; kTry <= 0.500; kTry += 0.001) {
    var totalErr = 0, count = 0;
    for (var j = 0; j < actPts.length; j++) {
      var srcTs = actPts[j].ts - ttHours * 3600000;
      var srcFrc = typeof getHistFrcAt === 'function'
        ? getHistFrcAt(srcCode2, srcTs, srcSensor.frc || 1.5, 0)
        : (srcSensor.frc || 1.5);
      var predicted = srcFrc * Math.exp(-kTry * ttHours);
      if (isFinite(predicted) && predicted > 0) {
        totalErr += Math.abs(actPts[j].v - predicted);
        count++;
      }
    }
    if (count > 0) {
      var mae = totalErr / count;
      if (mae < bestMAE) { bestMAE = mae; bestK = kTry; }
    }
  }

  // คำนวณ half-life
  var halfLife = Math.round(0.693 / bestK);
  var oldK = typeof getStationKhr === 'function' ? getStationKhr(key) : 0.008;
  var oldMAE = 0;
  // คำนวณ MAE ของ K เดิม
  for (var j2 = 0; j2 < actPts.length; j2++) {
    var srcTs2 = actPts[j2].ts - ttHours * 3600000;
    var srcFrc2 = typeof getHistFrcAt === 'function'
      ? getHistFrcAt(srcCode2, srcTs2, srcSensor.frc || 1.5, 0)
      : (srcSensor.frc || 1.5);
    var pred2 = srcFrc2 * Math.exp(-oldK * ttHours);
    if (isFinite(pred2)) oldMAE += Math.abs(actPts[j2].v - pred2);
  }
  oldMAE = oldMAE / actPts.length;
  var improvement = oldMAE > 0 ? Math.round((1 - bestMAE / oldMAE) * 100) : 0;

  // แสดงผล
  var kinfo = document.getElementById(_trendKinfoId||'rp-trend-kinfo');
  kinfo.style.display = '';
  kinfo.innerHTML = '🎯 <b>Auto-fit K</b>: <span style="color:' + (isDk ? '#4ecca3' : '#00b894') + ';font-family:JetBrains Mono;font-weight:700;">' + bestK.toFixed(4) + '</span>/ชม. (half-life ' + halfLife + ' ชม.)'
    + ' · MAE ใหม่: <b>' + bestMAE.toFixed(3) + '</b> mg/L'
    + ' · K เดิม: ' + oldK.toFixed(4) + ' (MAE ' + oldMAE.toFixed(3) + ')'
    + (improvement > 0 ? ' · <span style="color:' + (isDk ? '#4ecca3' : '#00b894') + '">ดีขึ้น ' + improvement + '%</span>' : '')
    + '<br><button onclick="rpTrendApplyK(\'' + key + '\',' + bestK + ')" style="margin-top:4px;padding:4px 12px;font-size:10px;font-weight:700;font-family:Sarabun,sans-serif;background:linear-gradient(135deg,#cc0055,#aa0044);color:#fff;border:none;border-radius:6px;cursor:pointer;">✅ ใช้ K = ' + bestK.toFixed(4) + ' สำหรับสถานีนี้</button>'
    + ' <button onclick="document.getElementById(_trendKinfoId||\'rp-trend-kinfo\').style.display=\'none\'" style="margin-top:4px;padding:4px 10px;font-size:10px;font-family:Sarabun,sans-serif;background:#555;color:#ddd;border:none;border-radius:6px;cursor:pointer;">ยกเลิก</button>';
}

function rpTrendApplyK(stationCode, newK) {
  // บันทึก K ลง STATION_K_PENDING (preview) — ยังไม่ confirm เป็น default
  STATION_K_PENDING[stationCode] = newK;
  // แสดง feedback + ปุ่มยืนยัน
  var kinfo = document.getElementById(_trendKinfoId||'rp-trend-kinfo');
  if (kinfo) {
    var isDk = document.body.classList.contains('dark');
    kinfo.innerHTML = '✅ K = ' + newK.toFixed(4) + '/ชม. — <b style="color:'+(isDk?'#f0a030':'#c08000')+'">ยังไม่บันทึกเป็น Default</b>'
      + '<br><button onclick="confirmSingleKDefault(\''+stationCode+'\','+newK+')" style="margin-top:4px;padding:5px 14px;font-size:10px;font-weight:700;font-family:Sarabun,sans-serif;background:linear-gradient(135deg,#00b894,#009874);color:#fff;border:none;border-radius:6px;cursor:pointer;">✅ บันทึกเป็น K Default</button>'
      + ' <span style="font-size:9px;color:'+(isDk?'#808090':'#a0a0b0')+'">reload = กลับค่าเดิม</span>';
  }
  // วาดกราฟใหม่ด้วย K pending
  setTimeout(function () {
    if (_trendCurrentParam) {
      rpTrendFromReport(_trendCurrentParam);
    }
  }, 300);
}

async function rpFbLogin(){
  var email=document.getElementById('rp-fb-user').value.trim();
  var pass=document.getElementById('rp-fb-pass').value.trim();
  var errEl=document.getElementById('rp-fb-err');
  if(!email||!pass){
    errEl.textContent='กรุณากรอก Email และ Password';
    errEl.style.display='block';
    return;
  }
  // แสดงสถานะกำลังเข้าสู่ระบบ
  errEl.textContent='⏳ กำลังเข้าสู่ระบบ...';
  errEl.style.display='block';
  errEl.style.color='#4488ff';
  
  var result = await window.fbAuthLogin(email, pass);
  if(result.success){
    errEl.style.display='none';
    document.getElementById('rp-fb-auth').style.display='none';
    document.getElementById('rp-fb-list').style.display='';
    rpRenderFeedbacks();
  } else {
    errEl.textContent='❌ ' + result.error;
    errEl.style.color='#cc0055';
    errEl.style.display='block';
  }
}
function rpRenderFeedbacks(){
  // โหลดจาก localStorage
  var localFb=JSON.parse(localStorage.getItem('frc_feedbacks')||'[]');
  
  // โหลดจาก Firebase แล้ว render
  if(window._fbReady&&window._fb){
    window._fbGet(window._fbRef(window._fb,'history/_feedbacks')).then(function(snap){
      var fbFb=[];
      if(snap.exists()){
        snap.forEach(function(child){var v=child.val();if(v&&v.msg) fbFb.push(v);});
      }
      // merge: deduplicate by time+name
      var seen={};
      var all=localFb.concat(fbFb).filter(function(f){
        var key=(f.time||'')+'|'+(f.name||'');
        if(seen[key]) return false; seen[key]=true; return true;
      });
      // save merged back to localStorage
      try{localStorage.setItem('frc_feedbacks',JSON.stringify(all));}catch(e){}
      renderFeedbackList(all);
    }).catch(function(){renderFeedbackList(localFb);});
  } else {
    renderFeedbackList(localFb);
  }
}
function renderFeedbackList(feedbacks){
  var el=document.getElementById('rp-fb-list');
  if(feedbacks.length===0){el.innerHTML='<div style="text-align:center;padding:20px;color:#c080a0;font-size:12px;">ยังไม่มีข้อเสนอแนะ</div>';return;}
  feedbacks.sort(function(a,b){return new Date(b.time)-new Date(a.time);});
  var h='<div style="font-size:11px;color:#a06080;margin-bottom:8px;">ทั้งหมด '+feedbacks.length+' รายการ</div>';
  for(var i=0;i<feedbacks.length;i++){
    var f=feedbacks[i];var d=new Date(f.time);
    var ts=d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
    h+='<div style="background:#fff5f8;border-left:3px solid #cc0055;border-radius:0 8px 8px 0;padding:8px 10px;margin-bottom:6px;"><span style="font-size:11.5px;font-weight:700;color:#3a0a20;">'+f.name+'</span><span style="font-size:9px;color:#c080a0;font-family:JetBrains Mono,monospace;margin-left:8px;">'+ts+'</span><div style="font-size:11.5px;color:#5a3040;margin-top:3px;line-height:1.4;">'+f.msg.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</div></div>';
  }
  el.innerHTML=h;
}

async function buildReport() {
  const now = new Date();
  document.getElementById('rp-date').textContent = now.toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
  document.getElementById('rp-info').textContent = 'กำลังโหลดจาก Firebase...';

  // Force reload K default จาก Firebase ก่อน build report
  if (window._fbReady) {
    try { await fbLoadKDefault(); } catch(e) { console.warn('[Report] K load failed', e); }
  }

  // ถ้า SENSORS ยังว่าง (API ยังไม่ poll) ใช้ fallback
  if (!SENSORS.length) {
    SENSORS = SENSORS_FALLBACK.map(s => ({ ...s }));
  }

  // Load history from Firebase (reuse existing fb helpers)
  const t0 = performance.now();
  let hist = {};
  if (window._fbReady && window._fb) {
    const cutoff = Date.now() - 24*3600000;
    try {
      const snap = await window._fbGet(window._fbRef(window._fb, 'history'));
      if (snap.exists()) {
        snap.forEach(codeSnap => {
          const code = codeSnap.key;
          const pts = [];
          codeSnap.forEach(ptSnap => {
            const p = ptSnap.val();
            if (p.ts >= cutoff) pts.push(p);
          });
          if (pts.length) hist[code] = pts.sort((a,b) => a.ts - b.ts);
        });
      }
    } catch(e) { console.warn('[Report] FB error', e); }
  }
  const loadMs = Math.round(performance.now() - t0);
  const histCount = Object.keys(hist).length;
  const histPts = Object.values(hist).reduce((a,b) => a+b.length, 0);
  // เก็บ Firebase hist ไว้ให้ trend tab ใช้
  window._rpFirebaseHist = hist;
  document.getElementById('rp-info').textContent = `${SENSORS.length} สถานี · Firebase: ${histCount} สถานี (${histPts.toLocaleString()} จุด · ${loadMs}ms) · ${now.toLocaleTimeString('th-TH')}`;

  // ── FRC Report ──
  const all = SENSORS;
  const pumps = all.filter(s => s.type==='pump'||s.type==='plant');
  const mons = all.filter(s => s.type==='monitor');
  const frcVals = all.map(s=>s.frc).filter(v=>v>0);
  const avg = frcVals.length ? frcVals.reduce((a,b)=>a+b,0)/frcVals.length : 0;
  const mn = frcVals.length ? Math.min(...frcVals) : 0;
  const mx = frcVals.length ? Math.max(...frcVals) : 0;
  const good = all.filter(s=>s.frc>=FRC_HI).length;
  const mid = all.filter(s=>s.frc>=FRC_MIN&&s.frc<FRC_HI).length;
  const bad = all.filter(s=>s.frc<FRC_MIN&&s.frc>0).length;

  document.getElementById('rp-frc-stats').innerHTML =
    `<div class="rp-stat"><div class="sl">ค่าเฉลี่ย</div><div class="sv rv-pink">${avg.toFixed(2)}</div><div class="ss">mg/L</div></div>` +
    `<div class="rp-stat"><div class="sl">ต่ำสุด</div><div class="sv ${mn<FRC_MIN?'rv-bad':'rv-warn'}">${mn.toFixed(2)}</div><div class="ss">mg/L</div></div>` +
    `<div class="rp-stat"><div class="sl">สูงสุด</div><div class="sv rv-good">${mx.toFixed(2)}</div><div class="ss">mg/L</div></div>` +
    `<div class="rp-stat"><div class="sl">ดี (≥1.0)</div><div class="sv rv-good">${good}</div><div class="ss">สถานี</div></div>` +
    `<div class="rp-stat"><div class="sl">ผ่าน</div><div class="sv rv-warn">${mid}</div><div class="ss">สถานี</div></div>` +
    `<div class="rp-stat"><div class="sl">ต่ำกว่า</div><div class="sv rv-bad">${bad}</div><div class="ss">< 0.2</div></div>`;

  // Alerts
  const alerts = all.filter(s=>s.frc<FRC_MIN&&s.frc>0).sort((a,b)=>a.frc-b.frc);
  const warns = all.filter(s=>s.frc>=FRC_MIN&&s.frc<0.5).sort((a,b)=>a.frc-b.frc);
  let ah = '';
  if (!alerts.length&&!warns.length) ah = '<div style="text-align:center;padding:12px;color:#2dd4a0;">✓ ไม่มีสถานีเฝ้าระวัง</div>';
  alerts.forEach(s => { ah += `<div class="rp-alert"><span class="ra-name">${s.name}</span><span class="ra-val rv-bad">${s.frc.toFixed(2)}</span></div>`; });
  warns.forEach(s => { ah += `<div class="rp-alert warn"><span class="ra-name">${s.name}</span><span class="ra-val rv-warn">${s.frc.toFixed(2)}</span></div>`; });
  document.getElementById('rp-frc-alerts').innerHTML = ah;

  // Table
  let tb = '';
  [...all].sort((a,b)=>a.frc-b.frc).forEach((s,i) => {
    const c = s.frc>=FRC_HI?'g':s.frc>=FRC_MIN?'w':'b';
    const st = s.frc>=FRC_HI?'✓ ดี':s.frc>=FRC_MIN?'✓ ผ่าน':'⚠ ต่ำ';
    const tp = s.type==='pump'?'สูบจ่าย':s.type==='plant'?'โรงผลิต':'monitor';
    tb += `<tr><td>${i+1}</td><td>${s.name}</td><td>${tp}</td><td>${s.area||'-'}</td><td style="font-family:'JetBrains Mono',monospace;font-weight:600;"><span class="sdot ${c}"></span>${s.frc.toFixed(2)}</td><td>${st}</td></tr>`;
  });
  document.getElementById('rp-frc-tbody').innerHTML = tb;

  // Charts + Dropdowns
  rpPopulateDropdowns(pumps, mons, hist);
  rpBuildChart('rp-frc-chart-pump', pumps, hist, 'frc', [FRC_MIN, FRC_HI]);
  rpBuildChart('rp-frc-chart-mon', mons, hist, 'frc', [FRC_MIN, FRC_HI]);
  rpBuildCompare('rp-frc-compare', 'frc');

  // ── EC Report ──
  const ecAll = all.map(s => ({ ...s, ecVal: s.ec!=null ? s.ec : (EC_FALLBACK[s.id]||300) }));
  const ecVals = ecAll.map(s=>s.ecVal);
  const ea = ecVals.reduce((a,b)=>a+b,0)/ecVals.length;
  const emn = Math.min(...ecVals), emx = Math.max(...ecVals);
  const eg = ecAll.filter(s=>s.ecVal<EC_LO).length;
  const en = ecAll.filter(s=>s.ecVal>=EC_LO&&s.ecVal<=EC_HI).length;
  const eb = ecAll.filter(s=>s.ecVal>EC_HI).length;

  document.getElementById('rp-ec-stats').innerHTML =
    `<div class="rp-stat"><div class="sl">ค่าเฉลี่ย</div><div class="sv rv-info">${Math.round(ea)}</div><div class="ss">μS/cm</div></div>` +
    `<div class="rp-stat"><div class="sl">ต่ำสุด</div><div class="sv rv-good">${Math.round(emn)}</div><div class="ss">μS/cm</div></div>` +
    `<div class="rp-stat"><div class="sl">สูงสุด</div><div class="sv ${emx>EC_HI?'rv-bad':'rv-warn'}">${Math.round(emx)}</div><div class="ss">μS/cm</div></div>` +
    `<div class="rp-stat"><div class="sl">ดี (<200)</div><div class="sv rv-good">${eg}</div><div class="ss">สถานี</div></div>` +
    `<div class="rp-stat"><div class="sl">ปกติ</div><div class="sv rv-warn">${en}</div><div class="ss">สถานี</div></div>` +
    `<div class="rp-stat"><div class="sl">เกิน</div><div class="sv rv-bad">${eb}</div><div class="ss">> 600</div></div>`;

  const ecAlerts = ecAll.filter(s=>s.ecVal>EC_HI).sort((a,b)=>b.ecVal-a.ecVal);
  let eah = '';
  if (!ecAlerts.length) eah = '<div style="text-align:center;padding:12px;color:#2dd4a0;">✓ ไม่มีสถานีเฝ้าระวัง</div>';
  ecAlerts.forEach(s => { eah += `<div class="rp-alert"><span style="flex:1;font-weight:600;">${s.name}</span><span style="font-family:var(--mono);font-weight:600;" class="rv-bad">${Math.round(s.ecVal)} μS/cm</span></div>`; });
  document.getElementById('rp-ec-alerts').innerHTML = eah;

  let etb = '';
  [...ecAll].sort((a,b)=>b.ecVal-a.ecVal).forEach((s,i) => {
    const c = s.ecVal>EC_HI?'b':s.ecVal>400?'w':'g';
    const st = s.ecVal>EC_HI?'⚠ เกิน':s.ecVal>EC_LO?'✓ ปกติ':'✓ ดี';
    const tp = s.type==='pump'?'สูบจ่าย':s.type==='plant'?'โรงผลิต':'monitor';
    etb += `<tr><td>${i+1}</td><td>${s.name}</td><td>${tp}</td><td>${s.area||'-'}</td><td style="font-family:'JetBrains Mono',monospace;font-weight:600;"><span class="sdot ${c}"></span>${Math.round(s.ecVal)}</td><td>${st}</td></tr>`;
  });
  document.getElementById('rp-ec-tbody').innerHTML = etb;

  rpBuildChart('rp-ec-chart-pump', pumps, hist, 'ec', [EC_LO, EC_HI]);
  rpBuildChart('rp-ec-chart-mon', mons, hist, 'ec', [EC_LO, EC_HI]);
  rpBuildCompare('rp-ec-compare', 'ec');
}

const _rpColors = ['#cc0055','#4ea8de','#2dd4a0','#f0a030','#e04060','#a855f7','#06b6d4','#f97316','#84cc16','#ec4899','#8b5cf6','#14b8a6','#ef4444','#3b82f6','#eab308','#10b981','#f43f5e','#6366f1','#22d3ee','#fb923c'];

function rpBuildChart(canvasId, stations, hist, param, thresholds) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (_rpCharts[canvasId]) _rpCharts[canvasId].destroy();
  const isFRC = param === 'frc';
  const datasets = [];
  stations.forEach((s, i) => {
    const code = String(s.id).replace(/\/|\./g, '-');
    const pts = hist[code] || [];
    const data = pts.map(p => ({ x: p.ts, y: isFRC ? (p.frc??null) : (p.ec??null) })).filter(d => d.y!=null && d.y>0);
    if (!data.length) return;
    datasets.push({ label: s.name, _fullName: s.name, data, borderColor: _rpColors[i%_rpColors.length], backgroundColor:'transparent', borderWidth:1.5, pointRadius:0, tension:.3 });
  });
  if (!datasets.length) { ctx.parentElement.innerHTML = '<div style="text-align:center;padding:30px;color:#e84393;">ไม่มีข้อมูล 24 ชม. ใน Firebase</div>'; return; }
  _rpCharts[canvasId] = new Chart(ctx, {
    type:'line', data:{datasets},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'nearest',axis:'x',intersect:false},
      plugins:{
        legend:{display:true,position:'bottom',labels:{color:'#ff6090',font:{size:9,family:'Sarabun'},boxWidth:10,padding:6,
          generateLabels:function(chart){
            return chart.data.datasets.map(function(ds,i){
              return {text:ds.label, fillStyle:ds.borderColor, strokeStyle:ds.borderColor, lineWidth:2, hidden:!chart.isDatasetVisible(i), datasetIndex:i, fontColor:'#ff6090'};
            });
          }
        }},
        tooltip:{
          enabled:false,
          mode:'index',intersect:false,
          external:function(context){
            var tooltipEl=document.getElementById('rp-chart-tooltip');
            var inner2;
            if(!tooltipEl){
              tooltipEl=document.createElement('div');
              tooltipEl.id='rp-chart-tooltip';
              tooltipEl.style.cssText='position:fixed;z-index:99999;background:rgba(10,10,30,0.95);color:#f0e8ff;font-family:Sarabun,sans-serif;font-size:11px;border-radius:8px;padding:0;max-height:320px;min-width:220px;max-width:450px;box-shadow:0 4px 20px rgba(0,0,0,.5);transition:opacity .15s;display:flex;flex-direction:column;pointer-events:auto;';
              inner2=document.createElement('div');
              inner2.id='rp-chart-tooltip-inner';
              inner2.style.cssText='overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:8px 10px;flex:1;scrollbar-width:thin;scrollbar-color:#666 transparent;max-height:310px;';
              tooltipEl.appendChild(inner2);
              document.body.appendChild(tooltipEl);
              // wheel event — ให้ scroll ภายใน + block scroll จอ
              inner2.addEventListener('wheel',function(e){
                e.stopPropagation();inner2.scrollTop+=e.deltaY;e.preventDefault();
              },{passive:false});
              // ปิด tooltip เมื่อ touch/click ที่อื่น
              document.addEventListener('touchstart',function(e){
                if(tooltipEl&&!tooltipEl.contains(e.target)){tooltipEl.style.opacity='0';tooltipEl.style.pointerEvents='none';}
              },{passive:true});
              document.addEventListener('click',function(e){
                if(tooltipEl&&!tooltipEl.contains(e.target)){tooltipEl.style.opacity='0';tooltipEl.style.pointerEvents='none';}
              });
            } else {
              inner2=document.getElementById('rp-chart-tooltip-inner');
            }
            var tooltip=context.tooltip;
            if(tooltip.opacity===0){tooltipEl.style.opacity='0';tooltipEl.style.pointerEvents='none';return;}
            // แปลงเวลาจาก tooltip data point
            var timeStr='';
            if(tooltip.dataPoints&&tooltip.dataPoints.length>0){
              var ts=tooltip.dataPoints[0].parsed.x;
              var d=new Date(ts);
              timeStr=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
            }
            var html='<div style="display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:rgba(10,10,30,0.98);padding:6px 0 4px 0;z-index:1;"><span style="font-family:JetBrains Mono,monospace;font-size:11px;color:#e0d0f0;font-weight:700;">⏱ '+timeStr+'</span><button onclick="document.getElementById(\'rp-chart-tooltip\').style.opacity=\'0\';document.getElementById(\'rp-chart-tooltip\').style.pointerEvents=\'none\';" style="background:none;border:none;color:#ff8888;font-size:18px;cursor:pointer;padding:2px 6px;line-height:1;">✕</button></div>';
            if(tooltip.body){
              tooltip.body.forEach(function(b,i){
                var colors=tooltip.labelColors?tooltip.labelColors[i]:{borderColor:'#fff'};
                html+='<div style="display:flex;align-items:center;gap:6px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.05);"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+(colors.borderColor||'#fff')+';flex-shrink:0;"></span><span style="flex:1;">'+b.lines[0]+'</span></div>';
              });
            }
            if(tooltip.body&&tooltip.body.length>10){
              html+='<div style="font-size:9px;color:#8070a0;margin-top:4px;text-align:center;position:sticky;bottom:0;background:rgba(10,10,30,0.95);padding:2px 0;">↕ เลื่อนเพื่อดูทั้งหมด '+tooltip.body.length+' สถานี</div>';
            }
            inner2.innerHTML=html;
            tooltipEl.style.opacity='1';
            tooltipEl.style.pointerEvents='auto';
            var pos=context.chart.canvas.getBoundingClientRect();
            var left=pos.left+tooltip.caretX+12;
            var top=pos.top+tooltip.caretY-20;
            if(left+460>window.innerWidth) left=pos.left+tooltip.caretX-460;
            if(left<4) left=4;
            if(top+330>window.innerHeight) top=window.innerHeight-330;
            if(top<0) top=0;
            tooltipEl.style.left=left+'px';
            tooltipEl.style.top=top+'px';
          }
        }
      },
      scales:{
        x:{type:'linear',ticks:{color:'#706080',font:{size:8,family:'JetBrains Mono'},callback:v=>new Date(v).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}),maxTicksLimit:10},grid:{color:'rgba(204,0,85,.15)'}},
        y:{ticks:{color:'#706080',font:{size:9,family:'JetBrains Mono'}},grid:{color:'rgba(204,0,85,.20)'}}
      }
    },
    plugins:[{id:'thr',afterDraw(chart){const ya=chart.scales.y;const c2=chart.ctx;thresholds.forEach((t,i)=>{const y=ya.getPixelForValue(t);if(y<chart.chartArea.top||y>chart.chartArea.bottom)return;c2.save();c2.strokeStyle=i===0?'rgba(240,160,48,.4)':'rgba(45,212,160,.4)';c2.lineWidth=1;c2.setLineDash([5,3]);c2.beginPath();c2.moveTo(chart.chartArea.left,y);c2.lineTo(chart.chartArea.right,y);c2.stroke();c2.fillStyle=c2.strokeStyle;c2.font='9px JetBrains Mono';c2.fillText(t.toString(),chart.chartArea.right+3,y+3);c2.restore();});}}]
  });
}

function rpBuildCompare(containerId, mode) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let h = '';
  // ใช้ ROOT_SOURCE_MAP + getStationKhr เหมือนกราฟ
  SENSORS.forEach(s => {
    const sName = (s.name||'').trim();
    const rootInfo = ROOT_SOURCE_MAP[sName] || ROOT_SOURCE_MAP[sName.replace(/\s+/g,' ')];
    if (!rootInfo || !rootInfo.root) return;
    const srcCode = typeof getSrcCodeFromLabel==='function' ? getSrcCodeFromLabel(rootInfo.root) : null;
    const src = srcCode ? SENSORS.find(x => x.id && x.id.toString()===srcCode) : null;
    if (!src) return;
    const tt = rootInfo.ttRoot || 0;
    if (tt <= 0) return;
    const stCode = String(s.id).replace(/\/|\./g,'-');
    const k = typeof getStationKhr==='function' ? getStationKhr(stCode) : 0.05;
    const srcLabel = rootInfo.root.replace(/^จาก\s*/,'');
    if (mode==='frc') {
      if (!src.frc || !s.frc) return;
      // ใช้ FRC ของ source ณ เวลา tt ชม. ก่อน (เหมือนกราฟ)
      const srcCode2 = String(src.id).replace(/\/|\./g,'-');
      const srcFrcAtTT = typeof getHistFrcAt==='function'
        ? getHistFrcAt(srcCode2, Date.now() - tt*3600000, src.frc, 0)
        : src.frc;
      const fore = srcFrcAtTT * Math.exp(-k * tt);
      const diff = s.frc - fore;
      const pct = fore>0?((diff/fore)*100).toFixed(1):'—';
      h += `<div class="rp-ccard"><div class="cc-t">${s.name}</div>
        <div class="cc-r"><span style="color:#706080">ต้นทาง</span><span style="font-family:'JetBrains Mono',monospace;font-size:10px;">${srcLabel} (${src.name.length>20?src.name.substring(0,18)+'…':src.name})</span></div>
        <div class="cc-r"><span style="color:#706080">FRC ต้นทาง (ณ -${tt}ชม.)</span><span style="font-family:'JetBrains Mono',monospace">${srcFrcAtTT.toFixed(2)}</span></div>
        <div class="cc-r"><span style="color:#706080">K</span><span style="font-family:'JetBrains Mono',monospace;font-size:10px;">${k.toFixed(4)}/ชม. (hl=${Math.round(0.693/k)}h) · tt=${tt}ชม.</span></div>
        <div class="cc-r"><span style="color:#706080">คาดการณ์</span><span style="font-family:'JetBrains Mono',monospace">${fore.toFixed(2)}</span></div>
        <div class="cc-r"><span style="color:#706080">ค่าจริง</span><span style="font-family:'JetBrains Mono',monospace;color:${s.frc>=FRC_HI?'#2dd4a0':s.frc>=FRC_MIN?'#f0a030':'#e04060'}">${s.frc.toFixed(2)}</span></div>
        <div class="cc-r"><span style="color:#706080">ผลต่าง</span><span style="font-family:'JetBrains Mono',monospace;color:${Math.abs(diff/fore)<0.15?'#2dd4a0':Math.abs(diff/fore)<0.3?'#f0a030':'#e04060'}">${diff>=0?'+':''}${diff.toFixed(2)} (${pct}%)</span></div></div>`;
    } else {
      // EC: ใช้ EC_ROOT_SOURCE_MAP → โรงผลิต/อุโมงค์ต้นทาง (เหมือน popup chart)
      const ecRootInfo = typeof EC_ROOT_SOURCE_MAP!=='undefined' ? (EC_ROOT_SOURCE_MAP[sName]||EC_ROOT_SOURCE_MAP[sName.replace(/\s+/g,' ')]) : null;
      let ecSrc = src, ecLabel = srcLabel, ecTT = tt;
      if (ecRootInfo) {
        const ecRootKey = ecRootInfo.root;
        ecTT = ecRootInfo.ttRoot || tt;
        ecLabel = ecRootKey;
        const ecPlantName = typeof EC_SOURCE_MAP!=='undefined' ? EC_SOURCE_MAP[ecRootKey] : null;
        if (ecPlantName) {
          const ecPlant = SENSORS.find(x => x.name===ecPlantName || (x.name&&x.name.includes(ecPlantName.replace(/\s*\d+$/,'').trim())));
          if (ecPlant) ecSrc = ecPlant;
        }
      }
      const srcEc = ecSrc.ec||250;
      const actEc = s.ec||250;
      const diff = actEc - srcEc;
      h += `<div class="rp-ccard"><div class="cc-t">${s.name}</div>
        <div class="cc-r"><span style="color:#706080">ต้นทาง</span><span style="font-family:'JetBrains Mono',monospace;font-size:10px;">${ecLabel} (${ecSrc.name.length>20?ecSrc.name.substring(0,18)+'…':ecSrc.name})</span></div>
        <div class="cc-r"><span style="color:#706080">EC ต้นทาง</span><span style="font-family:'JetBrains Mono',monospace">${Math.round(srcEc)}</span></div>
        <div class="cc-r"><span style="color:#706080">tt</span><span style="font-family:'JetBrains Mono',monospace;font-size:10px;">${ecTT} ชม.</span></div>
        <div class="cc-r"><span style="color:#706080">คาดการณ์</span><span style="font-family:'JetBrains Mono',monospace">${Math.round(srcEc)}</span></div>
        <div class="cc-r"><span style="color:#706080">ค่าจริง</span><span style="font-family:'JetBrains Mono',monospace">${Math.round(actEc)}</span></div>
        <div class="cc-r"><span style="color:#706080">ผลต่าง</span><span style="font-family:'JetBrains Mono',monospace;color:${Math.abs(diff)<30?'#2dd4a0':'#f0a030'}">${diff>=0?'+':''}${Math.round(diff)}</span></div></div>`;
    }
  });
  el.innerHTML = h || '<div style="color:#706080;text-align:center;padding:16px;">ไม่มีข้อมูล</div>';
}

const EC_LO = 210, EC_HI = 600;

// ═══════════════════════════════════════════════════════════════════
// 🌙 DARK MODE TOGGLE
// ═══════════════════════════════════════════════════════════════════
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark');
  const btn = document.getElementById('dark-toggle');
  btn.textContent = isDark ? '☀️' : '🌙';
  try { localStorage.setItem('mwa_dark_mode', isDark ? '1' : '0'); } catch(e) {}
  // Rebuild markers so popup charts get correct dark/light colors
  buildMarkers();
}
// Auto-restore dark mode from localStorage (default: light)
(function() {
  try {
    const stored = localStorage.getItem('mwa_dark_mode');
    // Default to light mode if no preference stored
    if (stored === '1') {
      document.body.classList.add('dark');
      const btn = document.getElementById('dark-toggle');
      if (btn) btn.textContent = '☀️';
    }
  } catch(e) {
    // fallback: default light — ไม่ต้องทำอะไร
  }
})();

// ═══════════════════════════════════════════════════════════════════
// 🧠 AI INSIGHT PANEL — วิเคราะห์แนวโน้มคุณภาพน้ำอัตโนมัติ
// ═══════════════════════════════════════════════════════════════════

function toggleAiPanel() {
  const panel = document.getElementById('ai-panel');
  const btn = document.getElementById('ai-insight-btn');
  const isOpen = panel.classList.contains('open');
  // overlay
  var overlay = document.getElementById('ai-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ai-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:940;';
    overlay.onclick = function(){ toggleAiPanel(); };
    document.body.appendChild(overlay);
  }
  if (isOpen) {
    panel.classList.remove('open');
    if(btn) btn.classList.remove('active');
    overlay.style.display = 'none';
    document.body.classList.remove('ai-open'); // rev16.0
  } else {
    panel.classList.add('open');
    if(btn) btn.classList.add('active');
    if (window.innerWidth <= 640) overlay.style.display = 'block';
    document.body.classList.add('ai-open'); // rev16.0
    runAiAnalysis();
  }
  _syncFloatingBtns();
}

function runAiAnalysis() {
  const content = document.getElementById('ai-content');
  const loading = document.getElementById('ai-loading');
  loading.style.display = 'flex';
  content.style.display = 'none';

  setTimeout(() => {
    const analysis = generateInsight();
    content.innerHTML = analysis;
    loading.style.display = 'none';
    content.style.display = 'block';
  }, 600);
}

function generateInsight() {
  const mode = PARAM_MODE;
  const vals = SENSORS.map(s => ({ name: s.name, id: s.id, type: s.type, val: getParamVal(s), lat: s.lat, lon: s.lon }));
  const monitors = vals.filter(v => v.type === 'monitor');
  const pumps = vals.filter(v => v.type === 'pump' || v.type === 'plant');
  const total = vals.length;
  const unit = paramUnit();

  // ── Statistics ──
  const allVals = vals.map(v => v.val).filter(v => v > 0);
  const avg = allVals.reduce((a,b) => a+b, 0) / allVals.length;
  const sorted = [...allVals].sort((a,b) => a-b);
  const median = sorted[Math.floor(sorted.length/2)];
  const min = sorted[0], max = sorted[sorted.length-1];
  const std = Math.sqrt(allVals.reduce((s,v) => s + (v-avg)**2, 0) / allVals.length);

  // ── Trend from history ──
  const hist = loadHistory();
  let trendDir = 'stable', trendPct = 0;
  const histCodes = Object.keys(hist);
  if (histCodes.length > 0) {
    let sumSlope = 0, nSlope = 0;
    for (const code of histCodes) {
      const pts = hist[code];
      if (!pts || pts.length < 6) continue;
      const recent = pts.slice(-12);
      if (recent.length < 4) continue;
      const t0 = recent[0].ts, tN = recent[recent.length-1].ts;
      const f0 = recent[0].frc, fN = recent[recent.length-1].frc;
      if (tN > t0 && f0 > 0 && fN > 0) {
        sumSlope += (fN - f0) / f0;
        nSlope++;
      }
    }
    if (nSlope > 0) {
      trendPct = (sumSlope / nSlope) * 100;
      trendDir = trendPct > 2 ? 'up' : trendPct < -2 ? 'down' : 'stable';
    }
  }

  // ── Risk stations ──
  let riskStations = [];
  if (mode === 'frc') {
    riskStations = monitors.filter(v => v.val < 0.2).sort((a,b) => a.val - b.val);
  } else {
    riskStations = monitors.filter(v => v.val >= EC_CONFIG.hi).sort((a,b) => b.val - a.val);
  }

  // ── Lowest / Highest ranking ──
  const monSorted = [...monitors].sort((a,b) => a.val - b.val);
  const lowest5 = monSorted.slice(0, 5);
  const highest5 = [...monitors].sort((a,b) => b.val - a.val).slice(0, 5);

  // ── Build HTML ──
  let html = '';

  // Section 1: Overview cards
  const trendIcon = trendDir === 'up' ? '📈' : trendDir === 'down' ? '📉' : '➡️';
  const trendClass = trendDir === 'up' ? 'ai-trend-up' : trendDir === 'down' ? 'ai-trend-down' : 'ai-trend-stable';
  const trendText = trendDir === 'up' ? 'แนวโน้มเพิ่มขึ้น' : trendDir === 'down' ? 'แนวโน้มลดลง' : 'ทรงตัว';

  const isFrc = mode === 'frc';
  const riskCount = riskStations.length;
  const passCount = isFrc ? monitors.filter(v => v.val >= 0.2).length : monitors.filter(v => v.val < EC_CONFIG.hi).length;
  const passRate = monitors.length > 0 ? Math.round(passCount / monitors.length * 100) : 0;

  html += '<div class="ai-section"><h4>ภาพรวมระบบ</h4>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  html += `<div class="ai-card">
    <div class="ai-card-title">ค่าเฉลี่ย</div>
    <div class="ai-card-val">${isFrc ? avg.toFixed(3) : Math.round(avg)}</div>
    <div class="ai-card-sub">${unit} · ${total} สถานี</div>
  </div>`;
  html += `<div class="ai-card">
    <div class="ai-card-title">ผ่านเกณฑ์</div>
    <div class="ai-card-val" style="color:${passRate >= 80 ? '#4ecca3' : passRate >= 50 ? '#f0d220' : '#e94560'}">${passRate}%</div>
    <div class="ai-card-sub">${passCount}/${monitors.length} จุดตรวจ</div>
  </div>`;
  html += `<div class="ai-card">
    <div class="ai-card-title">${trendIcon} แนวโน้ม 1 ชม.</div>
    <div class="ai-card-val ${trendClass}" style="font-size:16px;">${trendText}</div>
    <div class="ai-card-sub">${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%</div>
  </div>`;
  html += `<div class="ai-card">
    <div class="ai-card-title">⚠ จุดเสี่ยง</div>
    <div class="ai-card-val" style="color:${riskCount > 0 ? '#e94560' : '#4ecca3'}">${riskCount}</div>
    <div class="ai-card-sub">${isFrc ? 'FRC < 0.2 mg/L' : 'EC ≥ ' + EC_CONFIG.hi + ' μS/cm'}</div>
  </div>`;
  html += '</div></div>';

  // Section 2: AI Recommendations
  html += '<div class="ai-section"><h4>คำแนะนำ</h4>';

  if (riskCount === 0) {
    html += `<div class="ai-rec">
      <div class="ai-rec-text"><span class="ai-rec-icon">✅</span>
        <strong>สถานะดี</strong> — ทุกจุดตรวจ${isFrc ? 'ผ่านเกณฑ์ FRC ≥ 0.2 mg/L' : 'ค่า EC อยู่ในเกณฑ์ปกติ'}
        ค่าเฉลี่ย ${isFrc ? avg.toFixed(3) + ' mg/L' : Math.round(avg) + ' μS/cm'}
        ${trendDir === 'down' && isFrc ? '<br>⚡ <strong>เฝ้าระวัง:</strong> แนวโน้มลดลง ควรติดตามอย่างใกล้ชิด' : ''}
      </div>
    </div>`;
  } else {
    html += `<div class="ai-rec">
      <div class="ai-rec-text"><span class="ai-rec-icon">🚨</span>
        <strong>พบ ${riskCount} จุดเสี่ยง</strong> — ${isFrc ? 'FRC ต่ำกว่า 0.2 mg/L' : 'EC สูงเกิน ' + EC_CONFIG.hi + ' μS/cm'}
        <br>สถานีที่ต้องดำเนินการ:
      </div>
    </div>`;
    riskStations.slice(0, 3).forEach(s => {
      const shortName = s.name?.replace('บริษัท ','').replace(' จำกัด','').replace(' (มหาชน)','').replace('สำนักงานประปาสาขา','สาขา');
      html += `<div class="ai-rec" style="cursor:pointer;padding:8px 14px;" onclick="map.flyTo([${s.lat},${s.lon}],13);toggleAiPanel();">
        <div class="ai-rec-text"><span class="ai-rec-icon">📍</span>
          <strong>${shortName}</strong><br>
          ${isFrc ? s.val.toFixed(3) + ' mg/L' : Math.round(s.val) + ' μS/cm'}
          — <strong style="color:#ff6b6b">ต้องดำเนินการ</strong>
        </div>
      </div>`;
    });
  }

  // Pump performance insight
  if (isFrc && pumps.length > 0) {
    const pumpAvg = pumps.map(v => v.val).reduce((a,b) => a+b, 0) / pumps.length;
    const monAvg = monitors.length > 0 ? monitors.map(v => v.val).reduce((a,b) => a+b, 0) / monitors.length : 0;
    const decayPct = pumpAvg > 0 ? Math.round((1 - monAvg/pumpAvg) * 100) : 0;
    html += `<div class="ai-rec">
      <div class="ai-rec-text"><span class="ai-rec-icon">🔬</span>
        <strong>Decay Analysis:</strong> ค่า FRC ลดลงเฉลี่ย <strong>${decayPct}%</strong> จากสถานีสูบจ่าย (${pumpAvg.toFixed(2)}) ถึงจุดตรวจ (${monAvg.toFixed(2)})
        ${decayPct > 60 ? '<br>⚡ decay สูงผิดปกติ — อาจมีปัญหาท่อเก่า/รั่ว' : ''}
      </div>
    </div>`;
  }
  html += '</div>';

  // Section 3: Risk Ranking
  html += '<div class="ai-section"><h4>' + (isFrc ? 'สถานี FRC ต่ำสุด' : 'สถานี EC สูงสุด') + '</h4>';
  const rankList = isFrc ? lowest5 : highest5;
  rankList.forEach((s, i) => {
    const shortName = s.name?.replace('บริษัท ','').replace(' จำกัด','').replace(' (มหาชน)','')
      .replace('สำนักงานประปาสาขา','สาขา').replace('นิคมอุตสาหกรรม','นิคมฯ');
    const valStr = isFrc ? s.val.toFixed(3) : Math.round(s.val);
    const valColor = isFrc
      ? (s.val < 0.2 ? '#e94560' : s.val < 0.5 ? '#f0d220' : '#4ecca3')
      : (s.val >= EC_CONFIG.hi ? '#e94560' : '#87ceeb');
    const rankCls = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
    html += `<div class="ai-rank-item" onclick="map.flyTo([${s.lat},${s.lon}],14);toggleAiPanel();" style="cursor:pointer;">
      <div class="ai-rank-num ${rankCls}">${i+1}</div>
      <div class="ai-rank-name">${shortName}</div>
      <div class="ai-rank-val" style="color:${valColor}">${valStr}</div>
    </div>`;
  });
  html += '</div>';

  // Section 4: System health
  html += '<div class="ai-section"><h4>สุขภาพระบบ</h4>';
  const healthScore = Math.min(100, Math.round(passRate * 0.6 + (trendDir !== 'down' ? 25 : 5) + (riskCount === 0 ? 15 : Math.max(0, 15 - riskCount * 3))));
  const healthColor = healthScore >= 80 ? '#4ecca3' : healthScore >= 50 ? '#f0d220' : '#e94560';
  const healthLabel = healthScore >= 80 ? 'ดีมาก' : healthScore >= 60 ? 'ดี' : healthScore >= 40 ? 'ปานกลาง' : 'ต้องปรับปรุง';
  html += `<div class="ai-card" style="text-align:center;padding:16px;">
    <div style="position:relative;width:80px;height:80px;margin:0 auto 8px;">
      <svg viewBox="0 0 36 36" style="width:80px;height:80px;transform:rotate(-90deg);">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="3"/>
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="${healthColor}" stroke-width="3"
          stroke-dasharray="${healthScore} ${100-healthScore}" stroke-linecap="round"
          style="transition:stroke-dasharray 1s ease;"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;">
        <div style="font-size:20px;font-weight:800;color:${healthColor};font-family:'JetBrains Mono',monospace;">${healthScore}</div>
      </div>
    </div>
    <div style="font-size:13px;font-weight:700;color:${healthColor};margin-bottom:2px;">${healthLabel}</div>
    <div style="font-size:9px;color:#8888bb;">คะแนนสุขภาพระบบจ่ายน้ำ</div>
  </div>`;
  html += '</div>';

  document.getElementById('ai-pts-count').textContent = allVals.length;
  return html;
}

// Auto-refresh AI panel every 15 min if open
setInterval(() => {
  if (document.getElementById('ai-panel')?.classList.contains('open')) runAiAnalysis();
}, 15 * 60 * 1000);

// ── Auto-init after map ready ─────────────────────────────────────────
// Wait until SENSORS populated
const _zepInitTimer = setInterval(() => {
  if (SENSORS && SENSORS.length > 0) {
    clearInterval(_zepInitTimer);
    initZoneEditor();
  }
}, 800);


// ══════════════════════════════════════════════════════════════════
// 💧 WATER FLOW PARTICLE ANIMATION V5
// Particles flow FROM pump/plant stations TOWARD their CUSTOM_ZONE
// ══════════════════════════════════════════════════════════════════

(function(){
  var wrap = document.getElementById('map-wrap');
  var fc = document.createElement('canvas');
  fc.id = 'flow-canvas';
  fc.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:450;display:none;';
  wrap.appendChild(fc);

  var _raf = null, _on = false, _parts = [];
  var MAX = 2000, TRAIL = 16;

  // ── point-in-polygon ──
  function pip(lat, lon, c) {
    var ins = false;
    for (var i = 0, j = c.length - 1; i < c.length; j = i++) {
      var yi = c[i][0], xi = c[i][1], yj = c[j][0], xj = c[j][1];
      if (((xi > lon) !== (xj > lon)) && (lat < (yj - yi) * (lon - xi) / (xj - xi) + yi)) ins = !ins;
    }
    return ins;
  }

  // ── bounding box of polygon ──
  function polyBBox(coords) {
    var minLat=90,maxLat=-90,minLon=180,maxLon=-180;
    for (var i=0;i<coords.length;i++) {
      if(coords[i][0]<minLat) minLat=coords[i][0];
      if(coords[i][0]>maxLat) maxLat=coords[i][0];
      if(coords[i][1]<minLon) minLon=coords[i][1];
      if(coords[i][1]>maxLon) maxLon=coords[i][1];
    }
    return {minLat:minLat,maxLat:maxLat,minLon:minLon,maxLon:maxLon};
  }

  // ── random point inside polygon (rejection sampling with bbox) ──
  function randInPoly(coords, bbox) {
    for (var tries = 0; tries < 30; tries++) {
      var lat = bbox.minLat + Math.random() * (bbox.maxLat - bbox.minLat);
      var lon = bbox.minLon + Math.random() * (bbox.maxLon - bbox.minLon);
      if (pip(lat, lon, coords)) return [lat, lon];
    }
    // fallback: random vertex
    var vi = Math.random() * coords.length | 0;
    return [coords[vi][0], coords[vi][1]];
  }

  // ── find zone for a station ──
  // Priority: CUSTOM_ZONES[stationId] > STA_POLYS > MWA_POLYS
  function findStationZone(s) {
    var sid = String(s.id);
    var cz = window.CUSTOM_ZONES || {};
    // 1. CUSTOM_ZONE keyed by station ID
    if (cz[sid] && cz[sid].coords && cz[sid].coords.length >= 3) {
      return cz[sid].coords;
    }
    // 2. CUSTOM_ZONE that contains the station
    for (var k in cz) {
      var z = cz[k];
      if (z.type === 'polygon' && z.coords && z.coords.length >= 3 && pip(s.lat, s.lon, z.coords)) return z.coords;
    }
    // 3. STA_POLYS that contains station
    for (var i = 0; i < STA_POLYS.length; i++) {
      if (pip(s.lat, s.lon, STA_POLYS[i].coords)) return STA_POLYS[i].coords;
    }
    // 4. MWA_POLYS
    for (var i = 0; i < MWA_POLYS.length; i++) {
      if (pip(s.lat, s.lon, MWA_POLYS[i].coords)) return MWA_POLYS[i].coords;
    }
    return null;
  }

  // ── source cache ──
  var srcList = []; // [{s, zone, bbox, area}]
  var srcWeights = []; // cumulative weight for weighted random
  var srcTotalWeight = 0;

  // ── Calculate polygon area (Shoelace formula) ──
  function polyArea(coords) {
    var a = 0;
    for (var i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      a += (coords[j][1] + coords[i][1]) * (coords[j][0] - coords[i][0]);
    }
    return Math.abs(a) / 2;
  }

  // ── Weight multiplier: ปรับน้ำหนัก particle spawn ต่อสถานี ──
  var SPAWN_WEIGHT_MUL = {
    'SP12': 1.0,    // สถานีสูบจ่ายน้ำมหาสวัสดิ์ — ปกติ
    'SP06': 3.0,    // โรงงานผลิตน้ำธนบุรี — เพิ่ม 3x
    'SW02': 3.5,    // สถานีสูบจ่ายน้ำลาดพร้าว — เพิ่ม 3.5x
    'SW03': 4.0,    // สถานีสูบจ่ายน้ำคลองเตย — เพิ่ม 4x
    'SW10': 3.5,    // สถานีสูบจ่ายน้ำท่าพระ — เพิ่ม 3.5x
    'SP05': 3.0,    // สถานีสูบจ่ายน้ำบางเขน 2 (Dis2) — เพิ่ม 3x
  };

  // ── อุโมงค์ส่งน้ำ — ไม่ spawn particle (ไม่ใช่สถานีสูบจ่าย) ──
  var SPAWN_EXCLUDE = {
    'SP01': true,   // สถานีสูบส่งน้ำบางเขน 1 (TR1)
    'SP02': true,   // สถานีสูบส่งน้ำบางเขน 2 (TR2)
    'SP03': true,   // สถานีสูบส่งน้ำบางเขน 3 (TR3)
    'SP11': true    // สถานีสูบส่งน้ำมหาสวัสดิ์ (MTR)
  };

  function cacheSrc() {
    srcList = [];
    srcWeights = [];
    srcTotalWeight = 0;
    for (var i = 0; i < SENSORS.length; i++) {
      var s = SENSORS[i];
      if (s.type === 'pump' || s.type === 'plant') {
        // ข้ามอุโมงค์ส่งน้ำ
        if (SPAWN_EXCLUDE[String(s.id)]) continue;
        var zone = findStationZone(s);
        var area = zone ? polyArea(zone) : 0.0001;
        // ใช้ weight multiplier ถ้ามี
        var mul = SPAWN_WEIGHT_MUL[String(s.id)] || 1.0;
        var weightedArea = area * mul;
        srcList.push({
          s: s,
          zone: zone,
          bbox: zone ? polyBBox(zone) : null,
          area: weightedArea
        });
        srcTotalWeight += weightedArea;
        srcWeights.push(srcTotalWeight);
      }
    }
  }

  // ── FRC color string ──
  // ── Flow particle color: Deep Navy Glow (single color) ──

  // ── spawn: weighted by zone area → โซนกว้างได้ particle เยอะกว่า ──
  function spawnOne() {
    if (!srcList.length) return null;

    // Weighted random: โซนพื้นที่ใหญ่ ถูกเลือกบ่อยกว่า
    var r = Math.random() * srcTotalWeight;
    var idx = 0;
    for (var i = 0; i < srcWeights.length; i++) {
      if (r <= srcWeights[i]) { idx = i; break; }
    }
    var entry = srcList[idx];
    var s = entry.s;
    var zone = entry.zone;

    // Target: random point inside zone polygon
    var tLat, tLon;
    if (zone && entry.bbox) {
      var pt = randInPoly(zone, entry.bbox);
      tLat = pt[0]; tLon = pt[1];
    } else {
      // No zone: radial outward with random angle
      var ang = Math.random() * 6.283;
      var r = 0.02 + Math.random() * 0.05;
      tLat = s.lat + Math.sin(ang) * r;
      tLon = s.lon + Math.cos(ang) * r;
    }

    // Direction vector from source to target
    var dLat = tLat - s.lat;
    var dLon = tLon - s.lon;
    var dDist = Math.sqrt(dLat*dLat + dLon*dLon) || 0.001;

    // Long life, slow graceful flow
    var life = 250 + (Math.random() * 300) | 0;
    var baseSpd = dDist / life * 1.1;

    return {
      lat: s.lat + (Math.random()-0.5)*0.003,
      lon: s.lon + (Math.random()-0.5)*0.003,
      olat: s.lat, olon: s.lon,
      tLat: tLat, tLon: tLon,
      frc: s.frc || 1,
      spd: baseSpd,
      dirLat: dLat/dDist,
      dirLon: dLon/dDist,
      tx: new Float32Array(TRAIL),
      ty: new Float32Array(TRAIL),
      tN: 0, age: 0,
      life: life,
      zone: zone
    };
  }

  function doResize() {
    var r = wrap.getBoundingClientRect();
    fc.width = Math.round(r.width);
    fc.height = Math.round(r.height);
  }

  var _frameCount = 0;

  function doFrame() {
    if (!_on) return;
    var W = fc.width, H = fc.height;
    if (!W || !H) { doResize(); _raf = requestAnimationFrame(doFrame); return; }

    _frameCount++;
    var ctx = fc.getContext('2d');

    // Gentle fade
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';

    // Remove dead (ทำทุก 3 เฟรม เพื่อลด GC)
    if (_frameCount % 3 === 0) {
      var alive = [];
      for (var i = 0; i < _parts.length; i++) {
        if (_parts[i].age < _parts[i].life) alive.push(_parts[i]);
      }
      _parts = alive;
    }

    // Spawn: ผสม source-based + scatter ในโซน เพื่อรักษาความหนาแน่นทั่วพื้นที่
    var bgt = 5;
    while (_parts.length < MAX && bgt-- > 0) {
      // 50% spawn จาก source (เดิม), 50% scatter ตรงจุดสุ่มในโซน
      if (Math.random() < 0.5) {
        var np = spawnOne();
        if (!np) break;
        np.age = (Math.random() * 10) | 0;
        _parts.push(np);
      } else {
        // scatter spawn — ทิศ outward จาก source เสมอ
        if (!srcList.length) break;
        var r2 = Math.random() * srcTotalWeight;
        var idx2 = 0;
        for (var si = 0; si < srcWeights.length; si++) {
          if (r2 <= srcWeights[si]) { idx2 = si; break; }
        }
        var en = srcList[idx2];
        if (!en.zone || !en.bbox) continue;
        var spt = randInPoly(en.zone, en.bbox);
        // ทิศ outward จาก source
        var soLat = spt[0] - en.s.lat;
        var soLon = spt[1] - en.s.lon;
        var soD = Math.sqrt(soLat*soLat + soLon*soLon) || 0.001;
        var soDirLat = soLat / soD;
        var soDirLon = soLon / soD;
        var sProjD = 0.01 + Math.random() * 0.04;
        var sTLat = spt[0] + soDirLat * sProjD;
        var sTLon = spt[1] + soDirLon * sProjD;
        var sdLat = sTLat - spt[0], sdLon = sTLon - spt[1];
        var sdD = Math.sqrt(sdLat*sdLat+sdLon*sdLon)||0.001;
        var slife = 250+(Math.random()*300)|0;
        var ssp = {
          lat:spt[0], lon:spt[1],
          olat:en.s.lat, olon:en.s.lon,
          tLat:sTLat, tLon:sTLon,
          frc:en.s.frc||1, spd:sdD/slife*1.1,
          dirLat:soDirLat, dirLon:soDirLon,
          tx:new Float32Array(TRAIL), ty:new Float32Array(TRAIL),
          tN:0, age:(Math.random()*8)|0, life:slife, zone:en.zone
        };
        _parts.push(ssp);
      }
    }

    var dark = document.body.classList.contains('dark');

    // Projection cache (cache DOM lookup)
    if (!doFrame._mapEl) doFrame._mapEl = document.getElementById('map');
    var mapEl = doFrame._mapEl;
    var mRect = mapEl.getBoundingClientRect();
    var wRect = wrap.getBoundingClientRect();
    var offX = mRect.left - wRect.left;
    var offY = mRect.top - wRect.top;
    var bounds = map.getBounds();
    var pNW = map.latLngToContainerPoint(bounds.getNorthWest());
    var pSE = map.latLngToContainerPoint(bounds.getSouthEast());
    var bN = bounds.getNorth(), bS = bounds.getSouth(), bW = bounds.getWest(), bE = bounds.getEast();
    var pxPerLon = (pSE.x - pNW.x) / (bE - bW);
    var pxPerLat = (pSE.y - pNW.y) / (bS - bN);

    // ── Mega-batch: 4 width buckets × 8 alpha bands = 32 paths max ──
    var ABANDS = 8;
    // buckets[widthIdx][alphaIdx] = Path2D
    var paths = new Array(4);
    for (var wi = 0; wi < 4; wi++) {
      paths[wi] = new Array(ABANDS);
      for (var ai = 0; ai < ABANDS; ai++) paths[wi][ai] = null;
    }
    var widths = [0.06, 0.2, 0.45, 0.8];
    var headX = [], headY = [], headAlpha = [];

    for (var k = 0; k < _parts.length; k++) {
      var p = _parts[k];
      if (p.age >= p.life) continue;

      // ── Physics ──
      var toTLat = p.tLat - p.lat;
      var toTLon = p.tLon - p.lon;
      var toDist = Math.sqrt(toTLat*toTLat + toTLon*toTLon) || 0.0001;

      var blend = Math.min(1, p.age / 30);
      var steerLat = p.dirLat * (1-blend*0.5) + (toTLat/toDist) * (blend*0.5 + 0.5);
      var steerLon = p.dirLon * (1-blend*0.5) + (toTLon/toDist) * (blend*0.5 + 0.5);
      var steerD = Math.sqrt(steerLat*steerLat + steerLon*steerLon) || 1;
      steerLat /= steerD; steerLon /= steerD;

      var t = p.age * 0.02 + p.olat * 50 + p.olon * 50;
      var curl = Math.sin(t + p.lat * 8) * Math.cos(t * 0.4 + p.lon * 8)
               + Math.sin(t * 1.7 + p.lat * 15) * 0.5
               + Math.cos(t * 0.6 + p.lon * 12 + p.lat * 6) * 0.3;
      var perpLat = -steerLon, perpLon = steerLat;

      var spdMul = p.spd * (0.9 + 0.15 * Math.sin(p.age * 0.05));
      p.lat += (steerLat * 0.6 + perpLat * curl * 0.4) * spdMul;
      p.lon += (steerLon * 0.6 + perpLon * curl * 0.4) * spdMul;
      p.age++;

      if (p.zone && p.age > 5 && (p.age % 30 === 0)) {
        if (!pip(p.lat, p.lon, p.zone)) { p.age = p.life; continue; }
      }
      if (p.lat<13.4||p.lat>14.1||p.lon<100.2||p.lon>101.1) { p.age=p.life; continue; }
      if (toDist < 0.001) { p.age = p.life; continue; }

      var sx = pNW.x + (p.lon - bW) * pxPerLon + offX;
      var sy = pNW.y + (p.lat - bN) * pxPerLat + offY;

      if (p.tN < TRAIL) {
        p.tx[p.tN] = sx; p.ty[p.tN] = sy; p.tN++;
      } else {
        p.tx.copyWithin(0, 1); p.ty.copyWithin(0, 1);
        p.tx[TRAIL-1] = sx; p.ty[TRAIL-1] = sy;
      }
      if (p.tN < 2) continue;

      var lf = p.age / p.life;
      var aIn = p.age < 10 ? p.age / 10 : 1;
      var aOut = lf > 0.75 ? (1-lf)/0.25 : 1;
      var baseA = Math.min(aIn, aOut) * (dark ? 0.20 : 0.12);
      if (baseA < 0.01) continue;

      // Add segments to Path2D buckets
      var nSeg = p.tN;
      var invNSeg = 1 / (nSeg - 1);
      for (var j = 1; j < nSeg; j++) {
        var segP = j * invNSeg;
        var segA = baseA * segP * segP * segP;
        if (segA < 0.003) continue;
        var wi2 = segP < 0.25 ? 0 : segP < 0.5 ? 1 : segP < 0.75 ? 2 : 3;
        var ai2 = Math.min(ABANDS - 1, (segA * ABANDS / 0.20) | 0);
        var path = paths[wi2][ai2];
        if (!path) { path = new Path2D(); paths[wi2][ai2] = path; }
        path.moveTo(p.tx[j-1], p.ty[j-1]);
        path.lineTo(p.tx[j], p.ty[j]);
      }

      // Head dot
      var headA2 = baseA * (dark ? 0.5 : 0.35);
      if (headA2 > 0.008) { headX.push(sx); headY.push(sy); headAlpha.push(headA2); }
    }

    // ── Draw all paths: max 32 draw calls ──
    var cr = dark ? 230 : 60, cg = dark ? 240 : 100, cb = dark ? 255 : 210;
    ctx.lineCap = 'round';
    for (var wi3 = 0; wi3 < 4; wi3++) {
      ctx.lineWidth = widths[wi3] * (dark ? 1.0 : 0.85);
      for (var ai3 = 0; ai3 < ABANDS; ai3++) {
        var p2d = paths[wi3][ai3];
        if (!p2d) continue;
        var bandA = ((ai3 + 0.5) / ABANDS * 0.20).toFixed(3);
        ctx.strokeStyle = 'rgba(' + cr + ',' + cg + ',' + cb + ',' + bandA + ')';
        ctx.stroke(p2d);
      }
    }

    // ── Head dots: batch by alpha band ──
    if (headX.length) {
      var dotR = dark ? 0.55 : 0.45;
      // Simple: just draw all with average alpha for perf
      for (var di = 0; di < headX.length; di++) {
        ctx.beginPath();
        ctx.arc(headX[di], headY[di], dotR, 0, 6.283);
        ctx.fillStyle = dark
          ? 'rgba(255,255,255,' + headAlpha[di].toFixed(3) + ')'
          : 'rgba(40,80,200,' + headAlpha[di].toFixed(3) + ')';
        ctx.fill();
      }
    }

    _raf = requestAnimationFrame(doFrame);
  }

  // ── Public API ──
  window.startFlowAnimation = function() {
    cacheSrc();
    if (!srcList.length) { console.warn('[Flow] No pump/plant sources'); return; }
    _on = true; _parts = [];
    doResize();
    fc.style.display = 'block';
    fc.getContext('2d').clearRect(0, 0, fc.width, fc.height);
    if (_raf) cancelAnimationFrame(_raf);

    // ── Pre-fill: กระจาย particle ทั่วทั้งพื้นที่โซน รวมถึงขอบ ──
    // Strategy: 40% spawn จาก source แล้ว simulate (เดิม), 60% spawn ตรงจุดสุ่มในโซน (ใหม่)
    var preFillFromSrc = Math.round(MAX * 0.4);
    var preFillScatter = MAX - preFillFromSrc;

    // --- Part A: spawn จาก source แล้ว simulate (เดิม แต่ preAge กว้างขึ้น) ---
    for (var i = 0; i < preFillFromSrc; i++) {
      var np = spawnOne();
      if (!np) break;
      var preAge = (Math.random() * np.life * 0.96) | 0;
      var simSteps = (preAge / 3) | 0;
      var spdX3 = np.spd * 3;
      for (var step = 0; step < simSteps; step++) {
        var toTLat = np.tLat - np.lat;
        var toTLon = np.tLon - np.lon;
        var toDist = Math.sqrt(toTLat*toTLat + toTLon*toTLon) || 0.0001;
        if (toDist < 0.001) break;
        var stLat = toTLat / toDist;
        var stLon = toTLon / toDist;
        var t = step * 0.06 + np.olat * 50 + np.olon * 50;
        var curl = Math.sin(t + np.lat * 8) * Math.cos(t * 0.4 + np.lon * 8);
        var pLat = -stLon, pLon = stLat;
        np.lat += (stLat * 0.6 + pLat * curl * 0.4) * spdX3;
        np.lon += (stLon * 0.6 + pLon * curl * 0.4) * spdX3;
      }
      np.age = preAge;
      if (np.lat >= 13.4 && np.lat <= 14.1 && np.lon >= 100.2 && np.lon <= 101.1) {
        _parts.push(np);
      }
    }

    // --- Part B: scatter ตรงจุดสุ่มทั่วโซน — ทิศทางวิ่งออกจาก source เสมอ ---
    for (var i = 0; i < preFillScatter; i++) {
      if (!srcList.length) break;
      // Weighted random เลือกโซน
      var r = Math.random() * srcTotalWeight;
      var idx = 0;
      for (var wi = 0; wi < srcWeights.length; wi++) {
        if (r <= srcWeights[wi]) { idx = wi; break; }
      }
      var entry = srcList[idx];
      var s = entry.s;
      var zone = entry.zone;
      if (!zone || !entry.bbox) continue;

      // สุ่มจุดภายในโซนโดยตรง
      var pt = randInPoly(zone, entry.bbox);
      var scLat = pt[0], scLon = pt[1];

      // ทิศทาง outward = จาก source ผ่านจุดนี้แล้วยิงออกไป
      var outLat = scLat - s.lat;
      var outLon = scLon - s.lon;
      var outDist = Math.sqrt(outLat*outLat + outLon*outLon) || 0.001;
      var outDirLat = outLat / outDist;
      var outDirLon = outLon / outDist;

      // target = ยิงต่อจากจุดปัจจุบันไปในทิศ outward
      var projDist = 0.01 + Math.random() * 0.04;
      var tLat2 = scLat + outDirLat * projDist;
      var tLon2 = scLon + outDirLon * projDist;

      var dLat = tLat2 - scLat;
      var dLon = tLon2 - scLon;
      var dDist = Math.sqrt(dLat*dLat + dLon*dLon) || 0.001;

      var life = 250 + (Math.random() * 300) | 0;
      var baseSpd = dDist / life * 1.1;
      var preAge = (Math.random() * life * 0.85) | 0;

      var sp = {
        lat: scLat, lon: scLon,
        olat: s.lat, olon: s.lon,
        tLat: tLat2, tLon: tLon2,
        frc: s.frc || 1,
        spd: baseSpd,
        dirLat: outDirLat, dirLon: outDirLon,
        tx: new Float32Array(TRAIL),
        ty: new Float32Array(TRAIL),
        tN: 0, age: preAge,
        life: life,
        zone: zone
      };

      if (sp.lat >= 13.4 && sp.lat <= 14.1 && sp.lon >= 100.2 && sp.lon <= 101.1) {
        _parts.push(sp);
      }
    }

    console.log('[Flow] Started — ' + srcList.length + ' sources, pre-filled ' + _parts.length + ' particles');
    doFrame();
  };

  window.stopFlowAnimation = function() {
    _on = false;
    fc.style.display = 'none';
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
    _parts = [];
  };

  map.on('movestart zoomstart', function() {
    for (var i = 0; i < _parts.length; i++) _parts[i].tN = 0;
  });
  map.on('moveend zoomend', function() {
    if (_on) { doResize(); for (var i = 0; i < _parts.length; i++) _parts[i].tN = 0; }
  });
  window.addEventListener('resize', function() { if (_on) doResize(); });
})();
// ═══════════ [3/11] DISCLAIMER TICKER — โหมด FRC/EC ═══════════
function submitFeedback(){
  var name=document.getElementById('fb-name').value.trim();
  var msg=document.getElementById('fb-msg').value.trim();
  if(!name){alert('กรุณาระบุชื่อผู้เสนอแนะ');document.getElementById('fb-name').focus();return;}
  if(!msg){alert('กรุณาพิมพ์ข้อเสนอแนะ');document.getElementById('fb-msg').focus();return;}
  var feedbacks=JSON.parse(localStorage.getItem('frc_feedbacks')||'[]');
  var fbEntry={name:name,msg:msg,time:new Date().toISOString()};
  feedbacks.push(fbEntry);
  localStorage.setItem('frc_feedbacks',JSON.stringify(feedbacks));
  // บันทึกลง Firebase
  if(window._fbReady&&window._fb){
    try{
      var fbId='fb_'+Date.now()+'_'+Math.random().toString(36).substring(2,8);
      var r=window._fbRef(window._fb,'history/_feedbacks/'+fbId);
      window._fbSet(r,fbEntry);
      console.log('[Feedback] saved to Firebase');
    }catch(e){console.warn('[Feedback] FB save error',e);}
  }
  console.log('[Feedback]',fbEntry);
  document.getElementById('fb-form').style.display='none';
  document.getElementById('fb-success').style.display='';
  setTimeout(function(){document.getElementById('fb-overlay').classList.remove('open');},1800);
}
// ═══════════ [4/11] MISC INIT ═══════════
// Force disclaimer visible on iOS/iPad
(function(){
  var d=document.getElementById('disclaimer-bar');
  if(!d)return;
  // iOS detection
  var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isIOS||/Safari/.test(navigator.userAgent)){
    d.style.display='flex';
    d.style.visibility='visible';
    d.style.minHeight='34px';
    // restart animation
    var track=d.querySelector('.ticker-track');
    if(track){
      track.style.animation='none';
      track.offsetHeight; // force reflow
      track.style.animation='ticker-scroll 30s linear infinite';
      track.style.webkitAnimation='ticker-scroll 30s linear infinite';
    }
    console.log('[Disclaimer] forced visible for iOS/Safari');
  }
})();
// ═══════════ [5/11] 3D VIEW — three.js contour surface ═══════════
/* ═══════════════════════════════════════════════════════════
   V8.5 — 3D TERRAIN CONTOUR (Three.js)
   ═══════════════════════════════════════════════════════════ */
(function(){
  var _scene, _camera, _renderer, _mesh, _raf3d, _autoRotate = true, _wireframe = true;
  var _heightMul = 0.6;
  var _heightSteps = [0.3, 0.6, 1.0, 2.0];
  var _heightIdx = 1;
  var _mouseDown = false, _lastMx = 0, _lastMy = 0;
  var _rotX = -0.55, _rotY = 0.0, _dist = 3.2;
  var _touchDist = 0;
  var _isOpen = false;
  var _gridData = null;
  var _labelsVisible = false;
  var _labelSprites = [];
  var _autoRotateTime = 0;
  // Y rotation limits: ±80° (no back-flip)
  var _rotYmin = -Math.PI * 0.44, _rotYmax = Math.PI * 0.44;
  // X rotation limits: always looking down (never from below)
  var _rotXmin = -1.2, _rotXmax = -0.2;

  window.open3DTerrain = function() {
    var ov = document.getElementById('terrain3d-overlay');
    ov.classList.add('open');
    _isOpen = true;
    document.getElementById('terrain3d-btn').classList.add('active');
    var isEC = (typeof PARAM_MODE !== 'undefined' && PARAM_MODE === 'ec');
    document.getElementById('t3d-title').textContent = isEC ? '3D Conductivity Concentration Map' : '3D FRC Concentration Map';
    // EC default ×1.0, FRC default ×0.6
    if (isEC) { _heightIdx = 2; _heightMul = 1.0; }
    else      { _heightIdx = 1; _heightMul = 0.6; }
    _wireframe = true;
    document.getElementById('t3d-height-btn').textContent = '↕ ×' + _heightMul.toFixed(1);
    document.getElementById('t3d-wire-btn').classList.add('active');
    _labelsVisible = false;
    _autoRotateTime = 0;
    document.getElementById('t3d-label-btn').classList.remove('active');
    // Legend mode
    var legend = document.getElementById('t3d-legend');
    if (isEC) {
      legend.classList.add('ec-mode');
      document.getElementById('t3d-legend-title').textContent = 'EC (μS/cm)';
      document.querySelector('#t3d-legend-ticks').innerHTML = '<span>&gt;1200</span><span>600</span><span>500</span><span>300</span><span>210</span><span>150</span><span>&lt;150</span>';
      document.querySelector('#t3d-legend-labels').innerHTML =
        '<div><span style="background:#dc1414;"></span> สูงกว่ามาตรฐาน</div>'
       +'<div><span style="background:#ffd200;"></span> เฝ้าระวัง</div>'
       +'<div><span style="background:#a0e600;"></span> ผ่านมาตรฐาน</div>'
       +'<div><span style="background:#78d2ff;"></span> ดี</div>'
       +'<div><span style="background:#50b4ff;"></span> ดีมาก</div>';
    } else {
      legend.classList.remove('ec-mode');
      document.getElementById('t3d-legend-title').textContent = 'FRC (mg/L)';
      document.querySelector('#t3d-legend-ticks').innerHTML = '<span>≥1.2</span><span>1.0</span><span>0.8</span><span>0.5</span><span>0.3</span><span>0.2</span><span>&lt;0.2</span>';
      document.querySelector('#t3d-legend-labels').innerHTML =
        '<div><span style="background:#642896;"></span> สูงมาก</div>'
       +'<div><span style="background:#2850b4;"></span> ดีมาก</div>'
       +'<div><span style="background:#32beaa;"></span> ดี</div>'
       +'<div><span style="background:#78c850;"></span> ผ่าน</div>'
       +'<div><span style="background:#f0aa14;"></span> เฝ้าระวัง</div>'
       +'<div><span style="background:#be1e14;"></span> ต่ำ ⚠</div>';
    }
    document.getElementById('terrain3d-loading').style.display = 'flex';
    setTimeout(function(){ buildTerrain3D(); }, 80);
  };

  window.close3DTerrain = function() {
    _isOpen = false;
    document.getElementById('terrain3d-overlay').classList.remove('open');
    document.getElementById('terrain3d-btn').classList.remove('active');
    if (_raf3d) cancelAnimationFrame(_raf3d);
    _raf3d = null;
    // Cleanup
    var wrap = document.getElementById('terrain3d-canvas-wrap');
    var cvs = wrap.querySelector('canvas');
    if (cvs) wrap.removeChild(cvs);
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    _scene = null; _camera = null; _mesh = null;
  };

  window.t3dToggleRotate = function() {
    _autoRotate = !_autoRotate;
    document.getElementById('t3d-rotate-btn').classList.toggle('active', _autoRotate);
  };

  window.t3dToggleWireframe = function() {
    _wireframe = !_wireframe;
    document.getElementById('t3d-wire-btn').classList.toggle('active', _wireframe);
    if (_mesh) _mesh.material.wireframe = _wireframe;
  };

  window.t3dCycleHeight = function() {
    _heightIdx = (_heightIdx + 1) % _heightSteps.length;
    _heightMul = _heightSteps[_heightIdx];
    document.getElementById('t3d-height-btn').textContent = '↕ ×' + _heightMul.toFixed(1);
    if (_gridData && _mesh) applyHeight(_mesh.geometry, _gridData);
  };

  window.t3dToggleLabels = function() {
    _labelsVisible = !_labelsVisible;
    document.getElementById('t3d-label-btn').classList.toggle('active', _labelsVisible);
    for (var i = 0; i < _labelSprites.length; i++) {
      _labelSprites[i].visible = _labelsVisible;
    }
  };

  // ── Point-in-polygon test (ray casting) ────────────────
  function _pip3d(lat, lon, coords) {
    var inside = false;
    for (var i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      var lati = coords[i][0], loni = coords[i][1];
      var latj = coords[j][0], lonj = coords[j][1];
      if (((loni > lon) !== (lonj > lon)) &&
          (lat < (latj - lati) * (lon - loni) / (lonj - loni) + lati))
        inside = !inside;
    }
    return inside;
  }

  // ── Check if point is inside any MWA service polygon ────
  function _inMWA(lat, lon) {
    var polys = [];
    if (typeof STA_POLYS !== 'undefined') polys = polys.concat(STA_POLYS);
    if (typeof MWA_POLYS !== 'undefined') polys = polys.concat(MWA_POLYS);
    for (var p = 0; p < polys.length; p++) {
      if (_pip3d(lat, lon, polys[p].coords)) return true;
    }
    return false;
  }

  function sampleGrid() {
    var RES = 100;
    var grid = new Float32Array((RES+1)*(RES+1));
    var mask = new Uint8Array((RES+1)*(RES+1)); // 1 = inside MWA, 0 = outside
    var lat0 = 13.45, lat1 = 14.05, lon0 = 100.25, lon1 = 101.00;
    var isEC = (typeof PARAM_MODE !== 'undefined' && PARAM_MODE === 'ec');

    // Build mask first
    for (var mj = 0; mj <= RES; mj++) {
      var mlat = lat0 + (mj/RES) * (lat1-lat0);
      for (var mi = 0; mi <= RES; mi++) {
        var mlon = lon0 + (mi/RES) * (lon1-lon0);
        mask[mj*(RES+1)+mi] = _inMWA(mlat, mlon) ? 1 : 0;
      }
    }

    if (typeof _idwCache !== 'undefined' && _idwCache && typeof CACHE_RES !== 'undefined') {
      var cacheRows = CACHE_RES + 1;
      for (var j = 0; j <= RES; j++) {
        var fj = j / RES * CACHE_RES;
        var j0 = Math.min(CACHE_RES-1, Math.floor(fj));
        var jt = fj - j0;
        for (var i = 0; i <= RES; i++) {
          var idx = j*(RES+1)+i;
          if (!mask[idx]) { grid[idx] = -1; continue; }
          var fi = i / RES * CACHE_RES;
          var i0 = Math.min(CACHE_RES-1, Math.floor(fi));
          var it = fi - i0;
          var v = _idwCache[j0*cacheRows+i0]*(1-it)*(1-jt)
                + _idwCache[j0*cacheRows+i0+1]*it*(1-jt)
                + _idwCache[(j0+1)*cacheRows+i0]*(1-it)*jt
                + _idwCache[(j0+1)*cacheRows+i0+1]*it*jt;
          grid[idx] = v;
        }
      }
    } else {
      for (var j2 = 0; j2 <= RES; j2++) {
        var lat = lat0 + (j2/RES) * (lat1-lat0);
        for (var i2 = 0; i2 <= RES; i2++) {
          var idx2 = j2*(RES+1)+i2;
          if (!mask[idx2]) { grid[idx2] = -1; continue; }
          var lon = lon0 + (i2/RES) * (lon1-lon0);
          grid[idx2] = (typeof idw === 'function') ? idw(lat, lon) : 0.5;
        }
      }
    }
    return { grid: grid, res: RES, mask: mask };
  }

  function frcToColor(v) {
    // Same color scale as the contour map
    v = Math.max(0, Math.min(2.5, v));
    var r, g, b;
    function lerp(a,b2,t){ return a+(b2-a)*t; }
    if (v < 0.2) { var u=v/0.2; r=lerp(190,220,u)/255; g=lerp(30,80,u)/255; b=lerp(20,10,u)/255; }
    else if (v < 0.3) { var u2=(v-0.2)/0.1; r=lerp(220,240,u2)/255; g=lerp(80,170,u2)/255; b=lerp(10,20,u2)/255; }
    else if (v < 0.5) { var u3=(v-0.3)/0.2; r=lerp(240,120,u3)/255; g=lerp(170,200,u3)/255; b=lerp(20,80,u3)/255; }
    else if (v < 0.8) { var u4=(v-0.5)/0.3; r=lerp(120,50,u4)/255; g=lerp(200,190,u4)/255; b=lerp(80,170,u4)/255; }
    else if (v < 1.2) { var u5=(v-0.8)/0.4; r=lerp(50,40,u5)/255; g=lerp(190,80,u5)/255; b=lerp(170,180,u5)/255; }
    else { var u6=Math.min(1,(v-1.2)/0.3); r=lerp(40,100,u6)/255; g=lerp(80,40,u6)/255; b=lerp(180,150,u6)/255; }
    return new THREE.Color(r, g, b);
  }

  function ecToColor(v) {
    function lerp3(r1,g1,b1,r2,g2,b2,t) {
      t = Math.max(0,Math.min(1,t));
      return new THREE.Color(
        (r1+(r2-r1)*t)/255,
        (g1+(g2-g1)*t)/255,
        (b1+(b2-b1)*t)/255
      );
    }
    if (v < 150) return new THREE.Color(80/255, 180/255, 255/255);
    if (v < 210) return lerp3(80,180,255, 120,210,255, (v-150)/60);
    if (v < 240) return lerp3(120,210,255, 160,230,0, (v-210)/30);
    if (v < 500) return lerp3(160,230,0, 180,220,0, (v-240)/260);
    if (v < 1200) return lerp3(100,210,20, 255,210,0, (v-500)/700);
    return lerp3(255,200,0, 220,20,20, Math.min(1,(v-1200)/300));
  }

  function applyHeight(geo, data) {
    var grid = data.grid;
    var mask = data.mask;
    var res = data.res;
    var rows = res + 1;
    var pos = geo.attributes.position;
    var isEC = (typeof PARAM_MODE !== 'undefined' && PARAM_MODE === 'ec');
    var maxH = isEC ? 0.25 : 0.35;
    var colors = [];

    // PlaneBufferGeometry after rotateX(-PI/2):
    //   vertex index goes row-by-row: row0 = -Z (north), rowLast = +Z (south)
    //   within row: col0 = -X (west), colLast = +X (east)
    // Our grid: j=0 → lat_min (south), j=RES → lat_max (north)
    //           i=0 → lon_min (west),  i=RES → lon_max (east)
    // So we need to flip j: plane row r corresponds to grid j = (RES - r)

    for (var r = 0; r < rows; r++) {       // plane row (0 = north Z-)
      var gj = res - r;                     // grid j (flip: north = high lat)
      for (var c = 0; c < rows; c++) {      // plane col (0 = west X-)
        var gi = c;                          // grid i (west to east, no flip)
        var vtxIdx = r * rows + c;           // vertex index in PlaneGeometry
        var gridIdx = gj * rows + gi;        // index in our data grid
        var v = grid[gridIdx];
        var isOutside = mask && !mask[gridIdx];
        var h;
        if (isOutside || v < 0) {
          h = -0.02;
          colors.push(0.04, 0.04, 0.08);
        } else {
          if (isEC) {
            h = Math.min(1, v / 500) * maxH * _heightMul;
          } else {
            h = Math.min(1, v / 1.5) * maxH * _heightMul;
          }
          var clr = isEC ? ecToColor(v) : frcToColor(v);
          colors.push(clr.r, clr.g, clr.b);
        }
        pos.setY(vtxIdx, h);
      }
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function buildTerrain3D() {
    var wrap = document.getElementById('terrain3d-canvas-wrap');
    var W = wrap.clientWidth, H = wrap.clientHeight;
    if (!W || !H) { W = window.innerWidth; H = window.innerHeight - 50; }

    _scene = new THREE.Scene();
    _scene.background = new THREE.Color(0x030810);
    _scene.fog = new THREE.FogExp2(0x030810, 0.1);

    _camera = new THREE.PerspectiveCamera(45, W/H, 0.01, 100);
    _camera.position.set(0, 2.0, 3.0);
    // Mobile: zoom out more so full area visible
    if (W <= 640) _dist = 4.2;
    else _dist = 3.2;
    _camera.lookAt(0, 0, 0);

    _renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    _renderer.setSize(W, H);
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    wrap.appendChild(_renderer.domElement);

    // Lighting — Digital Twin holographic
    var ambLight = new THREE.AmbientLight(0x1a2a40, 0.4);
    _scene.add(ambLight);
    var dirLight = new THREE.DirectionalLight(0x66aadd, 0.6);
    dirLight.position.set(3, 5, 4);
    _scene.add(dirLight);
    var dirLight2 = new THREE.DirectionalLight(0x5533aa, 0.3);
    dirLight2.position.set(-3, 4, -2);
    _scene.add(dirLight2);
    // Cyan glow from below
    var ptLight = new THREE.PointLight(0x00ccff, 0.35, 8);
    ptLight.position.set(0, -0.5, 0);
    _scene.add(ptLight);

    // ── Geographic bounds (same as contour) ──
    var LAT0 = 13.45, LAT1 = 14.05, LON0 = 100.25, LON1 = 101.00;
    var dLat = LAT1 - LAT0;  // 0.60
    var dLon = LON1 - LON0;  // 0.75
    // At ~lat 13.75, 1° lon ≈ 107km, 1° lat ≈ 111km
    var kmLon = dLon * 107;  // ~80 km
    var kmLat = dLat * 111;  // ~67 km
    // Plane size proportional to real-world km (scale to fit ~3 units wide)
    var SCALE = 3.0 / Math.max(kmLon, kmLat);
    var planeW = kmLon * SCALE; // X (lon)
    var planeH = kmLat * SCALE; // Z (lat)

    // Sample data
    var data = sampleGrid();
    _gridData = data;
    var res = data.res;

    // Create PlaneGeometry with correct aspect ratio
    var geo = new THREE.PlaneBufferGeometry(planeW, planeH, res, res);
    geo.rotateX(-Math.PI / 2);
    applyHeight(geo, data);

    var mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      wireframe: _wireframe,
      shininess: 25,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    _mesh = new THREE.Mesh(geo, mat);
    _mesh.position.set(0, -0.15, 0);
    _scene.add(_mesh);

    // Base plate (holographic ground)
    var baseMat = new THREE.MeshBasicMaterial({ color: 0x061020, transparent: true, opacity: 0.9 });
    var baseGeo = new THREE.PlaneBufferGeometry(planeW * 1.3, planeH * 1.3);
    baseGeo.rotateX(-Math.PI / 2);
    var baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.set(0, -0.17, 0);
    _scene.add(baseMesh);

    // Grid helper — subtle holographic grid
    var gridHelper = new THREE.GridHelper(Math.max(planeW, planeH) * 1.2, 20, 0x0a2040, 0x061530);
    gridHelper.position.y = -0.16;
    _scene.add(gridHelper);

    // ── Station markers with correct geo-to-3D mapping ──
    // Helper: clean outlined text sprite (name only, no bg box)
    function makeTextSprite(text, opts) {
      opts = opts || {};
      var dpr = 2;
      var fontSize = (opts.fontSize || 24) * dpr;
      var color = opts.color || '#ffffff';
      var outlineColor = opts.outline || '#000000';
      var cvs2 = document.createElement('canvas');
      var ctx2 = cvs2.getContext('2d');
      ctx2.font = '700 ' + fontSize + 'px Sarabun, sans-serif';
      var tw = ctx2.measureText(text).width;
      cvs2.width = tw + 8 * dpr;
      cvs2.height = fontSize + 8 * dpr;
      ctx2.font = '700 ' + fontSize + 'px Sarabun, sans-serif';
      ctx2.textBaseline = 'middle';
      ctx2.textAlign = 'center';
      var cx = cvs2.width / 2, cy = cvs2.height / 2;
      // Outline (stroke text multiple offsets for thick outline)
      ctx2.strokeStyle = outlineColor;
      ctx2.lineWidth = 3.5 * dpr;
      ctx2.lineJoin = 'round';
      ctx2.strokeText(text, cx, cy);
      // Fill
      ctx2.fillStyle = color;
      ctx2.fillText(text, cx, cy);
      var tex = new THREE.CanvasTexture(cvs2);
      tex.minFilter = THREE.LinearFilter;
      var spMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, sizeAttenuation: true });
      var sp = new THREE.Sprite(spMat);
      var aspect = cvs2.width / cvs2.height;
      var spH = opts.scale || 0.05;
      sp.scale.set(spH * aspect, spH, 1);
      return sp;
    }

    var _isEC3 = (typeof PARAM_MODE !== 'undefined' && PARAM_MODE === 'ec');
    _labelSprites = [];

    // ── Digital Twin holographic materials ──
    var _dtGlassCyan = new THREE.MeshPhongMaterial({
      color: 0x00ddff, emissive: 0x003344, transparent: true, opacity: 0.25,
      shininess: 120, specular: 0x00aaff, side: THREE.DoubleSide, depthWrite: false
    });
    var _dtGlassMagenta = new THREE.MeshPhongMaterial({
      color: 0xcc44ff, emissive: 0x220033, transparent: true, opacity: 0.2,
      shininess: 100, specular: 0x8844ff, side: THREE.DoubleSide, depthWrite: false
    });
    var _dtEdgeCyan = new THREE.LineBasicMaterial({ color: 0x00eeff, transparent: true, opacity: 0.7 });
    var _dtEdgeMagenta = new THREE.LineBasicMaterial({ color: 0xaa55ff, transparent: true, opacity: 0.6 });
    var _dtSolidCyan = new THREE.MeshPhongMaterial({
      color: 0x00ccee, emissive: 0x004455, shininess: 80, specular: 0x0088cc
    });
    var _dtSolidPink = new THREE.MeshPhongMaterial({
      color: 0xff44aa, emissive: 0x330022, shininess: 60
    });
    var _dtGlowCyan = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.15, depthWrite: false
    });

    function addEdges(mesh, mat, parent) {
      var eg = new THREE.EdgesGeometry(mesh.geometry);
      var ln = new THREE.LineSegments(eg, mat);
      ln.position.copy(mesh.position);
      ln.rotation.copy(mesh.rotation);
      ln.scale.copy(mesh.scale);
      parent.add(ln);
    }

    // ── Water Treatment Plant (Digital Twin) ──
    // Based on real WTP layout: sedimentation basins (round), 
    // clear water tanks (tall cylinders), filter basins (rect), pump house
    function buildFactory(h) {
      var g = new THREE.Group();
      var s = h;

      // ── Ground platform ──
      var platGeo = new THREE.BoxBufferGeometry(s*2.2, s*0.025, s*1.8);
      var platMat = new THREE.MeshPhongMaterial({ color: 0x1a3040, emissive: 0x061520, shininess: 20 });
      var plat = new THREE.Mesh(platGeo, platMat);
      plat.position.y = s*0.01;
      g.add(plat); addEdges(plat, _dtEdgeCyan, g);

      // ── Sedimentation basins (4 round tanks, blue water) ──
      var sedMat = new THREE.MeshPhongMaterial({
        color: 0x0088bb, emissive: 0x003344, transparent: true, opacity: 0.5,
        shininess: 100, specular: 0x00aaff, side: THREE.DoubleSide
      });
      var sedWall = new THREE.MeshPhongMaterial({
        color: 0x556666, emissive: 0x112222, shininess: 40
      });
      for (var si2 = 0; si2 < 4; si2++) {
        var sx2 = -s*0.55 + (si2 % 2) * s*0.55;
        var sz2 = -s*0.45 + Math.floor(si2 / 2) * s*0.55;
        // Outer wall (torus-like cylinder shell)
        var wallGeo = new THREE.CylinderBufferGeometry(s*0.22, s*0.22, s*0.12, 20);
        var wall = new THREE.Mesh(wallGeo, sedWall);
        wall.position.set(sx2, s*0.085, sz2);
        g.add(wall); addEdges(wall, _dtEdgeCyan, g);
        // Water surface
        var waterGeo = new THREE.CylinderBufferGeometry(s*0.2, s*0.2, s*0.02, 20);
        var water = new THREE.Mesh(waterGeo, sedMat);
        water.position.set(sx2, s*0.13, sz2);
        g.add(water);
        // Center scraper pivot
        var pivGeo = new THREE.CylinderBufferGeometry(s*0.01, s*0.01, s*0.15, 6);
        var piv = new THREE.Mesh(pivGeo, _dtSolidCyan);
        piv.position.set(sx2, s*0.1, sz2);
        g.add(piv);
        // Scraper arm
        var armGeo = new THREE.BoxBufferGeometry(s*0.18, s*0.008, s*0.01);
        var arm = new THREE.Mesh(armGeo, _dtSolidCyan);
        arm.position.set(sx2 + s*0.05, s*0.15, sz2);
        arm.rotation.y = si2 * 0.7;
        g.add(arm);
      }

      // ── Clear water storage tanks (2 tall cylinders, right side) ──
      var tankMat = new THREE.MeshPhongMaterial({
        color: 0x88ccdd, emissive: 0x1a3a44, transparent: true, opacity: 0.4,
        shininess: 120, specular: 0x66bbcc, side: THREE.DoubleSide
      });
      var tankRoof = new THREE.MeshPhongMaterial({
        color: 0x99ddee, emissive: 0x224455, shininess: 60
      });
      for (var ti = 0; ti < 2; ti++) {
        var tx2 = s*0.65;
        var tz2 = -s*0.3 + ti * s*0.5;
        // Tank body
        var tbGeo = new THREE.CylinderBufferGeometry(s*0.18, s*0.18, s*0.6, 16);
        var tb = new THREE.Mesh(tbGeo, tankMat);
        tb.position.set(tx2, s*0.33, tz2);
        g.add(tb); addEdges(tb, _dtEdgeCyan, g);
        // Tank dome roof
        var tdGeo = new THREE.SphereBufferGeometry(s*0.18, 16, 8, 0, Math.PI*2, 0, Math.PI*0.35);
        var td = new THREE.Mesh(tdGeo, tankRoof);
        td.position.set(tx2, s*0.63, tz2);
        g.add(td); addEdges(td, _dtEdgeCyan, g);
        // Ring bands
        for (var ri2 = 0; ri2 < 3; ri2++) {
          var rrGeo = new THREE.TorusBufferGeometry(s*0.185, s*0.005, 6, 20);
          var rrMat = new THREE.MeshBasicMaterial({ color: 0x00ddff, transparent: true, opacity: 0.5, depthWrite: false });
          var rr = new THREE.Mesh(rrGeo, rrMat);
          rr.position.set(tx2, s*0.15 + ri2*s*0.18, tz2);
          rr.rotation.x = Math.PI/2;
          g.add(rr);
        }
      }

      // ── Filter basins (3 rectangular, center) ──
      var filtMat = new THREE.MeshPhongMaterial({
        color: 0x336666, emissive: 0x112233, transparent: true, opacity: 0.45,
        shininess: 60, side: THREE.DoubleSide
      });
      var filtWater = new THREE.MeshPhongMaterial({
        color: 0x00aacc, emissive: 0x004466, transparent: true, opacity: 0.5, shininess: 100
      });
      for (var fi = 0; fi < 3; fi++) {
        var fx = s*0.15;
        var fz = -s*0.5 + fi * s*0.35;
        // Basin walls
        var fbGeo = new THREE.BoxBufferGeometry(s*0.3, s*0.1, s*0.25);
        var fb = new THREE.Mesh(fbGeo, filtMat);
        fb.position.set(fx, s*0.075, fz);
        g.add(fb); addEdges(fb, _dtEdgeCyan, g);
        // Water top
        var fwGeo = new THREE.BoxBufferGeometry(s*0.28, s*0.015, s*0.23);
        var fw = new THREE.Mesh(fwGeo, filtWater);
        fw.position.set(fx, s*0.12, fz);
        g.add(fw);
      }

      // ── Pump/chemical building ──
      var bldGeo = new THREE.BoxBufferGeometry(s*0.4, s*0.3, s*0.35);
      var bld = new THREE.Mesh(bldGeo, _dtGlassCyan);
      bld.position.set(-s*0.7, s*0.175, s*0.5);
      g.add(bld); addEdges(bld, _dtEdgeCyan, g);
      // Roof
      var rfGeo = new THREE.BoxBufferGeometry(s*0.44, s*0.02, s*0.39);
      var rfMat = new THREE.MeshPhongMaterial({ color: 0x1a4050, emissive: 0x0a2030 });
      var rf = new THREE.Mesh(rfGeo, rfMat);
      rf.position.set(-s*0.7, s*0.34, s*0.5);
      g.add(rf); addEdges(rf, _dtEdgeCyan, g);
      // Windows (glowing strips)
      var winMat2 = new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.6 });
      for (var wi = 0; wi < 3; wi++) {
        var wwGeo = new THREE.BoxBufferGeometry(s*0.08, s*0.1, s*0.005);
        var ww = new THREE.Mesh(wwGeo, winMat2);
        ww.position.set(-s*0.82 + wi*s*0.1, s*0.2, s*0.5 + s*0.177);
        g.add(ww);
      }

      // ── Pipes connecting tanks (horizontal cylinders) ──
      var pipeMat = _dtSolidCyan;
      var pipeGeo = new THREE.CylinderBufferGeometry(s*0.012, s*0.012, s*0.5, 6);
      var pipe1 = new THREE.Mesh(pipeGeo, pipeMat);
      pipe1.rotation.z = Math.PI/2;
      pipe1.position.set(s*0.0, s*0.06, -s*0.2);
      g.add(pipe1);
      var pipe2 = new THREE.Mesh(pipeGeo.clone(), pipeMat);
      pipe2.rotation.z = Math.PI/2;
      pipe2.position.set(s*0.0, s*0.06, s*0.2);
      g.add(pipe2);

      // ── Holographic glow beam ──
      var beamGeo = new THREE.CylinderBufferGeometry(s*0.01, s*0.2, s*1.5, 8);
      var beam = new THREE.Mesh(beamGeo, _dtGlowCyan);
      beam.position.y = s*0.75;
      g.add(beam);

      return g;
    }

    // ── Pump Station (Digital Twin) ──
    // Based on reference: dark cylinder tank + steel frame, blue storage tank, office building
    function buildPumpStation(h) {
      var g = new THREE.Group();
      var s = h;

      // ── Ground platform ──
      var platGeo = new THREE.BoxBufferGeometry(s*1.6, s*0.02, s*0.9);
      var platMat = new THREE.MeshPhongMaterial({ color: 0x1a3040, emissive: 0x061520, shininess: 20 });
      var plat = new THREE.Mesh(platGeo, platMat);
      plat.position.y = s*0.01;
      g.add(plat); addEdges(plat, _dtEdgeCyan, g);

      // ── Dark cylindrical tank (left) with steel lattice frame ──
      var dkTankGeo = new THREE.CylinderBufferGeometry(s*0.18, s*0.18, s*0.55, 16);
      var dkTankMat = new THREE.MeshPhongMaterial({
        color: 0x2a3a4a, emissive: 0x0a1520, transparent: true, opacity: 0.6,
        shininess: 60, specular: 0x334455, side: THREE.DoubleSide
      });
      var dkTank = new THREE.Mesh(dkTankGeo, dkTankMat);
      dkTank.position.set(-s*0.5, s*0.3, 0);
      g.add(dkTank); addEdges(dkTank, _dtEdgeCyan, g);
      // Tank top cap
      var capGeo = new THREE.CylinderBufferGeometry(s*0.19, s*0.19, s*0.02, 16);
      var capMat = new THREE.MeshPhongMaterial({ color: 0x3a4a5a, emissive: 0x101820 });
      var cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(-s*0.5, s*0.58, 0);
      g.add(cap);
      // Steel lattice frame (X-braces around tank)
      var frameMat = new THREE.LineBasicMaterial({ color: 0x00ccdd, transparent: true, opacity: 0.6 });
      for (var fi2 = 0; fi2 < 4; fi2++) {
        var fa = (fi2/4)*Math.PI*2;
        var fx1 = -s*0.5 + Math.cos(fa)*s*0.2;
        var fz1 = Math.sin(fa)*s*0.2;
        var fx2 = -s*0.5 + Math.cos(fa + Math.PI/4)*s*0.2;
        var fz2 = Math.sin(fa + Math.PI/4)*s*0.2;
        // Vertical strut
        var strGeo = new THREE.BufferGeometry();
        strGeo.setAttribute('position', new THREE.Float32BufferAttribute([
          fx1, s*0.03, fz1, fx1, s*0.57, fz1
        ], 3));
        g.add(new THREE.Line(strGeo, frameMat));
        // X-brace
        var xGeo = new THREE.BufferGeometry();
        xGeo.setAttribute('position', new THREE.Float32BufferAttribute([
          fx1, s*0.1, fz1, fx2, s*0.5, fz2,
        ], 3));
        g.add(new THREE.Line(xGeo, frameMat));
        var x2Geo = new THREE.BufferGeometry();
        x2Geo.setAttribute('position', new THREE.Float32BufferAttribute([
          fx2, s*0.1, fz2, fx1, s*0.5, fz1,
        ], 3));
        g.add(new THREE.Line(x2Geo, frameMat));
      }

      // ── Blue storage tank (center, tall cylinder with dome) ──
      var blTankGeo = new THREE.CylinderBufferGeometry(s*0.15, s*0.15, s*0.5, 16);
      var blTankMat = new THREE.MeshPhongMaterial({
        color: 0x4499cc, emissive: 0x1a3344, transparent: true, opacity: 0.45,
        shininess: 100, specular: 0x44aacc, side: THREE.DoubleSide
      });
      var blTank = new THREE.Mesh(blTankGeo, blTankMat);
      blTank.position.set(-s*0.1, s*0.28, 0);
      g.add(blTank); addEdges(blTank, _dtEdgeCyan, g);
      // Dome top
      var dmGeo2 = new THREE.SphereBufferGeometry(s*0.15, 16, 8, 0, Math.PI*2, 0, Math.PI*0.4);
      var dmMat2 = new THREE.MeshPhongMaterial({
        color: 0x55aadd, emissive: 0x224455, shininess: 80
      });
      var dm2 = new THREE.Mesh(dmGeo2, dmMat2);
      dm2.position.set(-s*0.1, s*0.53, 0);
      g.add(dm2); addEdges(dm2, _dtEdgeCyan, g);
      // Holographic rings on blue tank
      for (var hri = 0; hri < 2; hri++) {
        var hrGeo = new THREE.TorusBufferGeometry(s*0.16, s*0.004, 6, 20);
        var hrMat = new THREE.MeshBasicMaterial({ color: 0x00eeff, transparent: true, opacity: 0.45, depthWrite: false });
        var hr = new THREE.Mesh(hrGeo, hrMat);
        hr.position.set(-s*0.1, s*0.15 + hri*s*0.2, 0);
        hr.rotation.x = Math.PI/2;
        g.add(hr);
      }

      // ── Office / pump building (right, box with grid windows) ──
      var offGeo = new THREE.BoxBufferGeometry(s*0.55, s*0.3, s*0.45);
      var offMat = new THREE.MeshPhongMaterial({
        color: 0x8899aa, emissive: 0x1a2233, transparent: true, opacity: 0.35,
        shininess: 60, side: THREE.DoubleSide
      });
      var off = new THREE.Mesh(offGeo, offMat);
      off.position.set(s*0.4, s*0.17, 0);
      g.add(off); addEdges(off, _dtEdgeCyan, g);
      // Flat roof
      var roofGeo2 = new THREE.BoxBufferGeometry(s*0.58, s*0.015, s*0.48);
      var roofMat2 = new THREE.MeshPhongMaterial({ color: 0x2a3a4a, emissive: 0x0a1520 });
      var roof2 = new THREE.Mesh(roofGeo2, roofMat2);
      roof2.position.set(s*0.4, s*0.33, 0);
      g.add(roof2); addEdges(roof2, _dtEdgeCyan, g);
      // Grid windows (front face — 4 cols × 3 rows)
      var winGlow = new THREE.MeshBasicMaterial({ color: 0x44ddff, transparent: true, opacity: 0.55 });
      for (var wr = 0; wr < 3; wr++) {
        for (var wc = 0; wc < 4; wc++) {
          var wGeo = new THREE.BoxBufferGeometry(s*0.08, s*0.06, s*0.005);
          var wMesh = new THREE.Mesh(wGeo, winGlow);
          wMesh.position.set(
            s*0.22 + wc*s*0.1,
            s*0.08 + wr*s*0.08,
            s*0.228
          );
          g.add(wMesh);
        }
      }

      // ── Connecting pipe from tanks to building ──
      var pipeGeo2 = new THREE.CylinderBufferGeometry(s*0.012, s*0.012, s*0.4, 6);
      var pipe = new THREE.Mesh(pipeGeo2, _dtSolidCyan);
      pipe.rotation.z = Math.PI/2;
      pipe.position.set(s*0.05, s*0.12, 0);
      g.add(pipe);

      // ── Glow beam ──
      var bmGeo = new THREE.CylinderBufferGeometry(s*0.008, s*0.12, s*0.9, 8);
      var bm = new THREE.Mesh(bmGeo, _dtGlowCyan);
      bm.position.y = s*0.5;
      g.add(bm);

      return g;
    }

    // ── Monitor Station (Digital Twin) ──
    // MWA Water Quality Monitoring Kiosk: stainless cabinet + solar canopy + poles + base
    function buildMonitorPin(h) {
      var g = new THREE.Group();
      var s = h;

      // ── Concrete base ──
      var baseGeo = new THREE.BoxBufferGeometry(s*0.5, s*0.06, s*0.35);
      var baseMat = new THREE.MeshPhongMaterial({ color: 0x556060, emissive: 0x1a2222, shininess: 20 });
      var base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = s*0.03;
      g.add(base); addEdges(base, _dtEdgeCyan, g);

      // ── Stainless steel cabinet (main body) ──
      var cabGeo = new THREE.BoxBufferGeometry(s*0.28, s*0.45, s*0.18);
      var cabMat = new THREE.MeshPhongMaterial({
        color: 0x99aabb, emissive: 0x1a2530, transparent: true, opacity: 0.55,
        shininess: 120, specular: 0x88aacc, side: THREE.DoubleSide
      });
      var cab = new THREE.Mesh(cabGeo, cabMat);
      cab.position.set(0, s*0.285, 0);
      g.add(cab); addEdges(cab, _dtEdgeCyan, g);

      // Front panel glow (screen / display area)
      var panelGeo = new THREE.BoxBufferGeometry(s*0.22, s*0.2, s*0.005);
      var panelMat = new THREE.MeshBasicMaterial({ color: 0x22bbff, transparent: true, opacity: 0.5 });
      var panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(0, s*0.35, s*0.093);
      g.add(panel);

      // Data indicator lights (3 small dots)
      var dotMat1 = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
      var dotMat2 = new THREE.MeshBasicMaterial({ color: 0x00ccff });
      var dotMat3 = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      var dotGeo2 = new THREE.SphereBufferGeometry(s*0.012, 6, 4);
      var d1 = new THREE.Mesh(dotGeo2, dotMat1);
      d1.position.set(-s*0.06, s*0.47, s*0.093);
      g.add(d1);
      var d2 = new THREE.Mesh(dotGeo2.clone(), dotMat2);
      d2.position.set(0, s*0.47, s*0.093);
      g.add(d2);
      var d3 = new THREE.Mesh(dotGeo2.clone(), dotMat3);
      d3.position.set(s*0.06, s*0.47, s*0.093);
      g.add(d3);

      // ── Support poles (2 vertical blue poles) ──
      var poleMat2 = new THREE.MeshPhongMaterial({
        color: 0x2266cc, emissive: 0x0a1a44, shininess: 80, specular: 0x3388dd
      });
      var poleGeo2 = new THREE.CylinderBufferGeometry(s*0.02, s*0.02, s*0.75, 8);
      var poleL = new THREE.Mesh(poleGeo2, poleMat2);
      poleL.position.set(-s*0.2, s*0.4, 0);
      g.add(poleL); addEdges(poleL, _dtEdgeCyan, g);
      var poleR = new THREE.Mesh(poleGeo2.clone(), poleMat2);
      poleR.position.set(s*0.2, s*0.4, 0);
      g.add(poleR); addEdges(poleR, _dtEdgeCyan, g);

      // ── Solar panel canopy (flat tilted panel on top) ──
      var solarGeo = new THREE.BoxBufferGeometry(s*0.55, s*0.015, s*0.35);
      var solarMat = new THREE.MeshPhongMaterial({
        color: 0x224466, emissive: 0x0a1a33, transparent: true, opacity: 0.6,
        shininess: 100, specular: 0x3366aa, side: THREE.DoubleSide
      });
      var solar = new THREE.Mesh(solarGeo, solarMat);
      solar.position.set(0, s*0.78, 0);
      solar.rotation.z = -0.05; // slight tilt
      g.add(solar); addEdges(solar, _dtEdgeCyan, g);

      // Solar panel grid lines
      var gridMat = new THREE.LineBasicMaterial({ color: 0x3388cc, transparent: true, opacity: 0.4 });
      for (var gi = 0; gi < 4; gi++) {
        var gLineGeo = new THREE.BufferGeometry();
        var gx = -s*0.22 + gi * s*0.15;
        gLineGeo.setAttribute('position', new THREE.Float32BufferAttribute([
          gx, s*0.79, -s*0.16, gx, s*0.79, s*0.16
        ], 3));
        g.add(new THREE.Line(gLineGeo, gridMat));
      }
      for (var gj = 0; gj < 3; gj++) {
        var gLineGeo2 = new THREE.BufferGeometry();
        var gz = -s*0.12 + gj * s*0.12;
        gLineGeo2.setAttribute('position', new THREE.Float32BufferAttribute([
          -s*0.26, s*0.79, gz, s*0.26, s*0.79, gz
        ], 3));
        g.add(new THREE.Line(gLineGeo2, gridMat));
      }

      // ── Water pipe (horizontal, blue, at base) ──
      var wpGeo = new THREE.CylinderBufferGeometry(s*0.015, s*0.015, s*0.3, 6);
      var wpMat = new THREE.MeshPhongMaterial({ color: 0x2288cc, emissive: 0x0a2244 });
      var wp = new THREE.Mesh(wpGeo, wpMat);
      wp.rotation.z = Math.PI/2;
      wp.position.set(-s*0.3, s*0.08, s*0.05);
      g.add(wp);

      // ── Holographic data ring ──
      var haloGeo2 = new THREE.TorusBufferGeometry(s*0.2, s*0.004, 6, 20);
      var haloMat2 = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
      var halo2 = new THREE.Mesh(haloGeo2, haloMat2);
      halo2.position.y = s*0.85;
      halo2.rotation.x = Math.PI/2;
      g.add(halo2);

      return g;
    }

    if (typeof SENSORS !== 'undefined') {
      for (var si = 0; si < SENSORS.length; si++) {
        var s = SENSORS[si];
        var nx = ((s.lon - LON0) / dLon - 0.5) * planeW;
        var nz = -((s.lat - LAT0) / dLat - 0.5) * planeH;
        var pv = (typeof getParamVal === 'function') ? getParamVal(s) : (s.frc || 0.5);
        var maxH2 = _isEC3 ? 0.25 : 0.35;
        var py2 = _isEC3
          ? Math.min(1, pv / 500) * maxH2 * _heightMul
          : Math.min(1, pv / 1.5) * maxH2 * _heightMul;
        var isPumpPlant = (s.type === 'plant' || s.type === 'pump');
        var dotY = py2 - 0.15;

        // Digital Twin building
        var building;
        if (s.type === 'plant') {
          building = buildFactory(0.08);
        } else if (s.type === 'pump') {
          building = buildPumpStation(0.065);
        } else {
          building = buildMonitorPin(0.05);
        }
        building.position.set(nx, dotY, nz);
        _scene.add(building);

        // Name label
        var labelName = (s.name || '').trim();
        if (labelName) {
          var labelH = s.type === 'plant' ? 0.12 : (s.type === 'pump' ? 0.08 : 0.055);
          var sprite = makeTextSprite(labelName, isPumpPlant ? {
            color: '#88ffff', outline: 'rgba(0,20,40,0.9)',
            scale: 0.055, fontSize: 22
          } : {
            color: '#aaeeff', outline: 'rgba(0,10,30,0.85)',
            scale: 0.038, fontSize: 18
          });
          sprite.position.set(nx, dotY + labelH + 0.015, nz);
          sprite.visible = _labelsVisible;
          _scene.add(sprite);
          _labelSprites.push(sprite);
        }
      }
    }

    // ── rev16.0: VC Mini Valve Markers ─────────────────────────────
    if (typeof VC_STATIONS !== 'undefined') {
      var _vcPipeMat = new THREE.MeshPhongMaterial({
        color: 0x7744bb, emissive: 0x1a0e33, transparent: true, opacity: 0.5, shininess: 40
      });
      var _vcBodyActive = new THREE.MeshPhongMaterial({
        color: 0x5522aa, emissive: 0x1a0833, shininess: 80, specular: 0xaa66ff
      });
      var _vcBodyClosed = new THREE.MeshPhongMaterial({
        color: 0x555555, emissive: 0x1a1a1a, transparent: true, opacity: 0.35, shininess: 20
      });
      var _vcWheelActive = new THREE.MeshPhongMaterial({
        color: 0xcc88ff, emissive: 0x331155, shininess: 100
      });
      var _vcWheelClosed = new THREE.MeshPhongMaterial({
        color: 0x888888, emissive: 0x222222, transparent: true, opacity: 0.4
      });
      var _vcEdgeA = new THREE.LineBasicMaterial({ color: 0xcc88ff, transparent: true, opacity: 0.6 });
      var _vcEdgeC = new THREE.LineBasicMaterial({ color: 0x777777, transparent: true, opacity: 0.3 });

      for (var vi = 0; vi < VC_STATIONS.length; vi++) {
        var vc = VC_STATIONS[vi];
        var vcAct = vc.valvePct != null && vc.valvePct > 0;
        var vnx = ((vc.lon - LON0) / dLon - 0.5) * planeW;
        var vnz = -((vc.lat - LAT0) / dLat - 0.5) * planeH;
        var vcFrc = vcAct ? (vc.frc || 0) : 0;
        var vcH = _isEC3 ? 0.03 : Math.min(1, vcFrc / 1.5) * 0.25 * _heightMul;
        var vcY = vcH - 0.15;

        // Pipe (horizontal)
        var pGeo = new THREE.CylinderBufferGeometry(0.004, 0.004, 0.05, 6);
        var pL = new THREE.Mesh(pGeo, _vcPipeMat);
        pL.rotation.z = Math.PI / 2;
        pL.position.set(vnx, vcY + 0.015, vnz);
        _scene.add(pL);

        // Valve body (sphere)
        var bGeo = new THREE.SphereBufferGeometry(0.012, 8, 6);
        var body = new THREE.Mesh(bGeo, vcAct ? _vcBodyActive : _vcBodyClosed);
        body.position.set(vnx, vcY + 0.015, vnz);
        _scene.add(body);
        addEdges(body, vcAct ? _vcEdgeA : _vcEdgeC, _scene);

        // Stem (vertical)
        var stGeo = new THREE.CylinderBufferGeometry(0.002, 0.002, 0.02, 4);
        var stem = new THREE.Mesh(stGeo, vcAct ? _vcWheelActive : _vcWheelClosed);
        stem.position.set(vnx, vcY + 0.035, vnz);
        _scene.add(stem);

        // Handwheel (torus)
        var whGeo = new THREE.TorusBufferGeometry(0.008, 0.0015, 6, 12);
        var wheel = new THREE.Mesh(whGeo, vcAct ? _vcWheelActive : _vcWheelClosed);
        wheel.position.set(vnx, vcY + 0.045, vnz);
        wheel.rotation.x = Math.PI / 2;
        _scene.add(wheel);

        // Label
        var vcLbl = (vc.name || vc.id).replace('VC ','');
        vcLbl += vcAct ? ' (' + vcFrc.toFixed(2) + ')' : ' (ปิด)';
        var vcSp = makeTextSprite(vcLbl, {
          color: vcAct ? '#cc88ff' : '#999999',
          outline: 'rgba(10,0,20,0.9)',
          scale: 0.03, fontSize: 14
        });
        vcSp.position.set(vnx, vcY + 0.065, vnz);
        vcSp.visible = _labelsVisible;
        _scene.add(vcSp);
        _labelSprites.push(vcSp);
      }
    }
    document.getElementById('terrain3d-loading').style.display = 'none';
    document.getElementById('t3d-rotate-btn').classList.toggle('active', _autoRotate);

    // Mouse/touch controls
    var cvs = _renderer.domElement;
    cvs.addEventListener('mousedown', function(e){ _mouseDown = true; _lastMx = e.clientX; _lastMy = e.clientY; });
    window.addEventListener('mouseup', function(){ _mouseDown = false; });
    cvs.addEventListener('mousemove', function(e){
      if (!_mouseDown) return;
      var dx = e.clientX - _lastMx, dy = e.clientY - _lastMy;
      _rotY = Math.max(_rotYmin, Math.min(_rotYmax, _rotY + dx * 0.005));
      _rotX = Math.max(_rotXmin, Math.min(_rotXmax, _rotX - dy * 0.005));
      _lastMx = e.clientX; _lastMy = e.clientY;
      _autoRotate = false;
      document.getElementById('t3d-rotate-btn').classList.remove('active');
    });
    cvs.addEventListener('wheel', function(e){
      e.preventDefault();
      _dist = Math.max(1.5, Math.min(8, _dist + e.deltaY * 0.003));
    }, { passive: false });
    // Touch
    cvs.addEventListener('touchstart', function(e){
      if (e.touches.length === 1) { _lastMx = e.touches[0].clientX; _lastMy = e.touches[0].clientY; }
      if (e.touches.length === 2) {
        var dx2 = e.touches[0].clientX - e.touches[1].clientX;
        var dy2 = e.touches[0].clientY - e.touches[1].clientY;
        _touchDist = Math.sqrt(dx2*dx2 + dy2*dy2);
      }
    }, { passive: true });
    cvs.addEventListener('touchmove', function(e){
      e.preventDefault();
      if (e.touches.length === 1) {
        var dx3 = e.touches[0].clientX - _lastMx, dy3 = e.touches[0].clientY - _lastMy;
        _rotY = Math.max(_rotYmin, Math.min(_rotYmax, _rotY + dx3 * 0.005));
        _rotX = Math.max(_rotXmin, Math.min(_rotXmax, _rotX - dy3 * 0.005));
        _lastMx = e.touches[0].clientX; _lastMy = e.touches[0].clientY;
        _autoRotate = false;
        document.getElementById('t3d-rotate-btn').classList.remove('active');
      }
      if (e.touches.length === 2) {
        var dx4 = e.touches[0].clientX - e.touches[1].clientX;
        var dy4 = e.touches[0].clientY - e.touches[1].clientY;
        var d2 = Math.sqrt(dx4*dx4 + dy4*dy4);
        if (_touchDist > 0) { _dist = Math.max(1.5, Math.min(8, _dist - (d2 - _touchDist) * 0.008)); }
        _touchDist = d2;
      }
    }, { passive: false });

    // Handle resize
    var _resizeTimer3d = null;
    window.addEventListener('resize', function(){
      if (!_isOpen || !_renderer) return;
      clearTimeout(_resizeTimer3d);
      _resizeTimer3d = setTimeout(function(){
        var w2 = wrap.clientWidth, h2 = wrap.clientHeight;
        if (!w2 || !h2) return;
        _camera.aspect = w2 / h2;
        _camera.updateProjectionMatrix();
        _renderer.setSize(w2, h2);
      }, 200);
    });

    // Animation loop
    function animate() {
      if (!_isOpen) return;
      _raf3d = requestAnimationFrame(animate);
      if (_autoRotate) {
        _autoRotateTime += 0.003;
        // Oscillate Y within limits (smooth sine wave ±80°)
        _rotY = Math.sin(_autoRotateTime) * _rotYmax * 0.9;
        // Gentle X sway (depth tilt) — stays within looking-down range
        _rotX = -0.5 + Math.sin(_autoRotateTime * 0.37) * 0.15;
      }
      // Orbit camera
      _camera.position.x = Math.sin(_rotY) * Math.cos(_rotX) * _dist;
      _camera.position.y = -Math.sin(_rotX) * _dist;
      _camera.position.z = Math.cos(_rotY) * Math.cos(_rotX) * _dist;
      _camera.lookAt(0, 0, 0);
      _renderer.render(_scene, _camera);
    }
    animate();
  }
})();
// ═══════════ [6/11] SEARCH — สถานี / lat,lon / geocode ═══════════
(function(){
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  let _searchTimer   = null;
  let _flyMarker     = null;
  let _activeIdx     = -1;
  let _results       = [];      // [{type,label,sub,lat,lon}]
  let _lastQuery     = '';

  const inp  = () => document.getElementById('map-search-input');
  const drop = () => document.getElementById('map-search-dropdown');
  const clr  = () => document.getElementById('map-search-clear');

  // ── Lat/Lon parser — รับหลายรูปแบบ ────────────────────────────────────────
  // รองรับ: "13.75, 100.52"  "13.75 100.52"  "13°45'N 100°31'E"  "13.75N 100.52E"
  function parseLatLon(q) {
    q = q.trim();
    // pattern: สองตัวเลข คั่นด้วย comma/space/tab
    const m1 = q.match(/^([+-]?\d+(?:\.\d+)?)[°\s,]+([+-]?\d+(?:\.\d+)?)°?\s*$/);
    if (m1) {
      const a = parseFloat(m1[1]), b = parseFloat(m1[2]);
      if (!isNaN(a) && !isNaN(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180)
        return { lat: a, lon: b };
    }
    // pattern: DMS "13°45'30\"N 100°31'20\"E"
    const m2 = q.match(/(\d+)[°d]\s*(\d+)['\u2019m]\s*([\d.]+)["\u201ds]?\s*([NS])\s+(\d+)[°d]\s*(\d+)['\u2019m]\s*([\d.]+)["\u201ds]?\s*([EW])/i);
    if (m2) {
      let lat = +m2[1] + +m2[2]/60 + +m2[3]/3600;
      if (m2[4].toUpperCase()==='S') lat = -lat;
      let lon = +m2[5] + +m2[6]/60 + +m2[7]/3600;
      if (m2[8].toUpperCase()==='W') lon = -lon;
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
    }
    // pattern: "13.75N 100.52E"
    const m3 = q.match(/^([\d.]+)\s*([NS])[,\s]+([\d.]+)\s*([EW])$/i);
    if (m3) {
      let lat = parseFloat(m3[1]); if (m3[2].toUpperCase()==='S') lat=-lat;
      let lon = parseFloat(m3[3]); if (m3[4].toUpperCase()==='W') lon=-lon;
      if (lat>=-90&&lat<=90&&lon>=-180&&lon<=180) return {lat,lon};
    }
    return null;
  }

  // ── Get map (อาจยังไม่พร้อมตอน script โหลด) ──────────────────────────────
  function getMap() { return window.map || null; }

  // ── Search Stations ในข้อมูลของ app ────────────────────────────────────────
  function searchStations(q) {
    // SENSORS เป็น let ใน outer script — ดึงมาตรงๆ ได้เลย (same page)
    let src = [];
    try {
      if (typeof SENSORS !== 'undefined' && SENSORS && SENSORS.length) src = SENSORS;
      else if (typeof SENSORS_FALLBACK !== 'undefined' && SENSORS_FALLBACK) src = SENSORS_FALLBACK;
    } catch(e) { src = []; }
    if (!src.length) return [];
    const ql = q.toLowerCase();
    return src
      .filter(s => {
        const name = (s.name || s.label || String(s.id||'') || '').toLowerCase();
        return name.includes(ql) && s.lat != null && s.lon != null;
      })
      .slice(0, 5)
      .map(s => ({
        type: 'station',
        label: s.name || s.label || String(s.id),
        sub: `สถานี · ${(s.frc != null ? (+s.frc).toFixed(3)+' mg/L' : '')} ${(s.ec != null ? '⚡'+s.ec : '')}`.trim(),
        lat: +s.lat, lon: +s.lon,
        id: s.id
      }));
  }

  // ── Nominatim geocoding ─────────────────────────────────────────────────────
  async function nominatimSearch(q) {
    // ไม่ lock countrycodes=th เพื่อให้หาชื่อภาษาอังกฤษ/ต่างประเทศได้ด้วย
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&accept-language=th,en`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      return data.map(d => ({
        type: 'place',
        label: d.display_name.split(',').slice(0,2).join(',').trim(),
        sub: d.display_name.split(',').slice(2,4).join(',').trim() || d.type,
        lat: parseFloat(d.lat),
        lon: parseFloat(d.lon),
        osm_type: d.osm_type,
        category: d.category
      }));
    } catch(e) {
      // fallback: ไม่แสดง error
      return [];
    }
  }

  // ── Show dropdown ───────────────────────────────────────────────────────────
  function showDropdown(items, loading) {
    _results = items;
    _activeIdx = -1;
    const d = drop();
    if (loading) {
      d.innerHTML = '<div class="msd-spinner">กำลังค้นหา…</div>';
      d.classList.add('open');
      return;
    }
    if (!items.length) {
      d.innerHTML = '<div class="msd-empty">ไม่พบสถานที่ — ลองพิมพ์ lat, lon</div>';
      d.classList.add('open');
      return;
    }
    d.innerHTML = items.map((it, i) => {
      const icon = it.type === 'latlng' ? '📍' : it.type === 'station' ? '🌸' : '🗺️';
      return `<div class="msd-item${it.type==='latlng'?' msd-latlng':''}" 
        onmousedown="event.preventDefault()" 
        onclick="window._mapSearchSelect(${i})" 
        onmouseover="window._mapSearchHover(${i})">
        <span class="msd-icon">${icon}</span>
        <div>
          <div class="msd-main">${escapeHtml(it.label)}</div>
          ${it.sub ? `<div class="${it.type==='latlng'?'msd-latlon':'msd-sub'}">${escapeHtml(it.sub)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    d.classList.add('open');
  }

  function hideDropdown() {
    drop().classList.remove('open');
    _activeIdx = -1;
  }

  function escapeHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── FlyTo ──────────────────────────────────────────────────────────────────
  function flyTo(lat, lon, label, zoom) {
    const m = getMap();
    if (!m) {
      // map ยังไม่พร้อม — รอ 300ms แล้วลองใหม่
      setTimeout(() => flyTo(lat, lon, label, zoom), 300);
      return;
    }
    zoom = zoom || 15;
    // ปิด popup เก่าก่อน flyTo เพื่อลด reposition jank
    try { m.closePopup(); } catch(e){}
    m.flyTo([lat, lon], zoom, { animate: true, duration: 0.6 });
    // ลบ marker เก่า — ปิดเพื่อรองรับ multi-pin
    // if (_flyMarker) { try { m.removeLayer(_flyMarker); } catch(e){} }
    // สร้าง custom pin marker (numbered for multi-pin)
    const pinNum = (window._msdPins ? window._msdPins.length : 0) + 1;
    const pinColors = ['#cc0055','#1565c0','#00897b','#e65100','#6a1b9a','#c62828','#2e7d32','#4527a0'];
    const pinClr = pinColors[(pinNum - 1) % pinColors.length];
    const ic = L.divIcon({
      className: '',
      html: `<div style="
        background:${pinClr};color:#fff;
        border:2.5px solid #fff;border-radius:50% 50% 50% 0;
        width:28px;height:28px;display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;transform:rotate(-45deg);
        box-shadow:0 2px 6px ${pinClr}60;
      "><span style="transform:rotate(45deg)">${pinNum}</span></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28]
    });
    _flyMarker = L.marker([lat, lon], { icon: ic, zIndexOffset: 5000 });
    _flyMarker.addTo(m);
    // ── คำนวณคุณภาพน้ำ ณ จุดที่ search ──
    let wqHtml = '';
    try {
      // --- Sensor data ---
      const _sensors = (typeof SENSORS !== 'undefined' && SENSORS && SENSORS.length) ? SENSORS
                     : (typeof SENSORS_FALLBACK !== 'undefined' ? SENSORS_FALLBACK : []);
      const _srcTypes = (typeof _SOURCE_TYPES !== 'undefined') ? _SOURCE_TYPES : new Set(['pump','plant']);
      const _exclIds = (typeof _FRC_ZONE_EXCL_IDS !== 'undefined') ? _FRC_ZONE_EXCL_IDS : new Set();
      const _exclNames = (typeof _FRC_ZONE_EXCL_NAMES !== 'undefined') ? _FRC_ZONE_EXCL_NAMES : new Set();
      const _ecFb = (typeof EC_FALLBACK !== 'undefined') ? EC_FALLBACK : {};
      const _degKm = (typeof DEG_TO_KM !== 'undefined') ? DEG_TO_KM : 111.0;

      // --- Find nearest source station (ใช้ zone influence เหมือน frcZone) ---
      const sources = _sensors.filter(function(s) {
        return _srcTypes.has(s.type) && !_exclIds.has(String(s.id)) && !_exclNames.has((s.name||'').trim());
      });
      let nearest = null, minD = Infinity, nearestDist = 0;

      // 0. เช็ค VC zone ก่อน (VC อยู่ใน CUSTOM_ZONES แต่ไม่อยู่ใน SENSORS)
      let _popupVcInfo = null; // เก็บข้อมูล VC สำหรับแสดง popup
      try {
        if (typeof VC_STATIONS !== 'undefined') {
          var czones0 = Object.entries(window.CUSTOM_ZONES || {});
          for (var vi = 0; vi < czones0.length; vi++) {
            var vz = czones0[vi];
            var vzSid = vz[0], vzData = vz[1];
            if (!vzSid.startsWith('VC')) continue;
            if (vzData && vzData.coords && pointInPoly(lat, lon, vzData.coords)) {
              var vc = VC_STATIONS.find(function(v){ return v.id === vzSid; });
              if (vc && vc.valvePct != null && vc.valvePct > 0) {
                // สร้าง pseudo source จาก VC เพื่อแสดงใน popup
                var vcPair = (typeof VC_PAIR !== 'undefined') ? VC_PAIR[vc.id] : null;
                _popupVcInfo = { vcName: vc.name, vcId: vc.id, sourceId: vc.sourceId, tt: vcPair ? vcPair.tt : null };
                nearest = { id: vc.id, name: vc.name, lat: vc.lat, lon: vc.lon, type: 'vc', frc: (typeof getVcFrc === 'function') ? getVcFrc(vc.id) : 0 };
                break;
              }
            }
          }
        }
      } catch(e0){}

      // 1. เช็ค CUSTOM_ZONES ก่อน
      try {
        var czones = Object.entries(window.CUSTOM_ZONES || {});
        for (var ci = 0; ci < czones.length; ci++) {
          var cz = czones[ci];
          var czSid = cz[0], czData = cz[1];
          if (czData && czData.coords && pointInPoly(lat, lon, czData.coords)) {
            var czSrc = sources.find(function(s){ return String(s.id) === czSid; });
            if (czSrc) { nearest = czSrc; break; }
          }
        }
      } catch(e3){}

      // 2. เช็ค MDIS zone
      if (!nearest) {
        try {
          if (typeof _inMdisZone === 'function' && _inMdisZone(lat, lon)) {
            nearest = sources.find(function(s) {
              return (s.name||'').trim() === 'สถานีสูบจ่ายน้ำมหาสวัสดิ์' || s.id === 'SP12';
            });
          }
        } catch(e4){}
      }

      // 3. fallback: nearest by anchor distance
      if (!nearest) {
        for (var si = 0; si < sources.length; si++) {
          var s = sources[si];
          var aLat = s.lat, aLon = s.lon;
          try { var anch = (typeof getAnchorLatLon !== 'undefined') ? getAnchorLatLon(s) : s; aLat = anch.lat; aLon = anch.lon; } catch(e2){}
          var d = (aLat - lat) * (aLat - lat) + (aLon - lon) * (aLon - lon);
          if (d < minD) { minD = d; nearest = s; }
        }
      }
      if (nearest) {
        nearestDist = Math.sqrt((nearest.lat - lat) * (nearest.lat - lat) + (nearest.lon - lon) * (nearest.lon - lon)) * _degKm;
      }

      // --- FRC value ---
      let frcVal = null;
      try {
        const _frcFn = window.frcZone || (typeof frcZone !== 'undefined' ? frcZone : null);
        if (_frcFn) frcVal = _frcFn(lat, lon);
      } catch(e){}

      // --- EC value ---
      let ecVal = null;
      if (nearest) {
        ecVal = (nearest.ec != null) ? nearest.ec
              : (typeof nearest.id === 'number' && _ecFb[nearest.id]) ? _ecFb[nearest.id]
              : 300;
      }

      // --- Travel time estimate (distance / velocity) ---
      let ttHours = null;
      if (nearestDist > 0) {
        const _v = (typeof EPANET !== 'undefined' && EPANET.v) ? EPANET.v : 0.45;
        ttHours = (nearestDist * 1000 / _v) / 3600;
      }

      // ⚠ FRC WARNING — แจ้งเตือนเมื่อต่ำกว่ามาตรฐาน
      if (frcVal != null && frcVal < 0.2) {
        wqHtml += '<div style="margin-top:8px;padding:8px 10px;background:linear-gradient(135deg,#fff0f0,#ffe0e0);border:1.5px solid #e04040;border-radius:8px;">';
        wqHtml += '<div style="font-size:12px;font-weight:700;color:#cc2200;">⚠️ คลอรีนต่ำกว่ามาตรฐาน!</div>';
        wqHtml += '<div style="font-size:10px;color:#993300;margin-top:2px;">FRC ' + frcVal.toFixed(3) + ' mg/L — ต่ำกว่าเกณฑ์ 0.2 mg/L</div>';
        wqHtml += '</div>';
      }

      // 🏭 Source station + travel time + โซนสาขา
      if (nearest) {
        // หาโซนสาขาประปา
        let zoneName = '';
        try {
          const _mwp = (typeof MWA_POLYS !== 'undefined') ? MWA_POLYS : [];
          const _pip = (typeof pointInPoly !== 'undefined') ? pointInPoly : null;
          if (_pip && _mwp.length) {
            for (var zi = 0; zi < _mwp.length; zi++) {
              if (_mwp[zi].name && _pip(lat, lon, _mwp[zi].coords)) { zoneName = _mwp[zi].name; break; }
            }
          }
        } catch(e){}

        wqHtml += '<div style="margin-top:8px;padding-top:7px;border-top:1.5px solid rgba(200,100,150,0.3);">';

        if (_popupVcInfo) {
          // แสดงเป็นอิทธิพล VC
          wqHtml += '<div style="font-size:9px;color:#d0a0ff;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">🟣 อิทธิพล Valve Chamber</div>';
          wqHtml += '<div style="font-size:11.5px;font-weight:600;color:#e0c0ff;cursor:pointer;" onclick="(function(){var m=window.map;if(m)m.flyTo(['+nearest.lat+','+nearest.lon+'],15,{duration:0.6});})()">'+escapeHtml(_popupVcInfo.vcName)+' ↗</div>';
          if (_popupVcInfo.sourceId) {
            var vcSrcStation = sources.find(function(s){ return String(s.id) === _popupVcInfo.sourceId; });
            var vcSrcName = vcSrcStation ? (vcSrcStation.name || _popupVcInfo.sourceId) : _popupVcInfo.sourceId;
            wqHtml += '<div style="font-size:9px;color:#c0a0b0;margin-top:3px;">← รับน้ำจาก '+escapeHtml(vcSrcName)+'</div>';
          }
          wqHtml += '<div style="display:flex;gap:10px;margin-top:3px;font-size:10px;color:#c0a0b0;font-family:\'JetBrains Mono\',monospace;">';
          wqHtml += '<span>📏 '+nearestDist.toFixed(1)+' km</span>';
          if (_popupVcInfo.tt != null) wqHtml += '<span>⏱ ~'+_popupVcInfo.tt+' ชม. (จากต้นทาง)</span>';
          wqHtml += '</div>';
        } else {
          wqHtml += '<div style="font-size:9px;color:#e8a0c0;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">🏭 สถานีต้นทาง</div>';
          wqHtml += '<div style="font-size:11.5px;font-weight:600;color:#ffccdd;cursor:pointer;" onclick="(function(){var m=window.map;if(m)m.flyTo(['+nearest.lat+','+nearest.lon+'],15,{duration:0.6});})()">'+escapeHtml(nearest.name || String(nearest.id))+' ↗</div>';
          wqHtml += '<div style="display:flex;gap:10px;margin-top:3px;font-size:10px;color:#c0a0b0;font-family:\'JetBrains Mono\',monospace;">';
          wqHtml += '<span>📏 '+nearestDist.toFixed(1)+' km</span>';
          if (ttHours != null) wqHtml += '<span>⏱ ~'+(ttHours < 1 ? Math.round(ttHours*60)+' นาที' : ttHours.toFixed(1)+' ชม.')+'</span>';
          wqHtml += '</div>';
        }

        if (zoneName) wqHtml += '<div style="margin-top:3px;font-size:10px;color:#90d0ff;">🗺️ สาขา ' + escapeHtml(zoneName) + '</div>';
        wqHtml += '</div>';
      }

      // 📊 Sparkline FRC 24 ชม. (nearest source station)
      if (nearest) {
        try {
          const _loadHist = (typeof loadHistory !== 'undefined') ? loadHistory : null;
          if (_loadHist) {
            const hist = _loadHist();
            const sKey = String(nearest.id);
            const pts = (hist[sKey] || []).filter(function(p) { return p.ts >= Date.now() - 24*3600000 && p.frc != null; });
            if (pts.length >= 3) {
              pts.sort(function(a,b){ return a.ts - b.ts; });
              var fMin = Infinity, fMax = -Infinity;
              for (var pi = 0; pi < pts.length; pi++) { if(pts[pi].frc < fMin) fMin = pts[pi].frc; if(pts[pi].frc > fMax) fMax = pts[pi].frc; }
              // ขยาย range เล็กน้อยให้กราฟไม่ชิดขอบ
              var fPad = (fMax - fMin) * 0.1 || 0.05;
              fMin = Math.max(0, fMin - fPad);
              fMax = fMax + fPad;
              var fRange = fMax - fMin || 0.1;

              // Chart dimensions with axis margins
              var mL = 32, mR = 6, mT = 4, mB = 18; // margins: left, right, top, bottom
              var totalW = 220, totalH = 70;
              var cW = totalW - mL - mR; // chart area width
              var cH = totalH - mT - mB; // chart area height

              // Time range
              var tMin = pts[0].ts, tMax = pts[pts.length - 1].ts;
              var tRange = tMax - tMin || 1;

              // Build path
              var sparkPts = '';
              for (var pi = 0; pi < pts.length; pi++) {
                var sx = mL + ((pts[pi].ts - tMin) / tRange) * cW;
                var sy = mT + cH - ((pts[pi].frc - fMin) / fRange) * cH;
                sparkPts += (pi === 0 ? 'M' : 'L') + sx.toFixed(1) + ',' + sy.toFixed(1);
              }

              var lastPt = pts[pts.length - 1];
              var ageMin = Math.round((Date.now() - lastPt.ts) / 60000);
              var ageText = ageMin < 60 ? ageMin + ' นาทีที่แล้ว' : Math.round(ageMin/60) + ' ชม. ที่แล้ว';
              var ageColor = ageMin > 60 ? '#ff6666' : '#80e0a0';

              wqHtml += '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed rgba(200,100,150,0.2);">';
              wqHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
              wqHtml += '<span style="font-size:9px;color:#c080a0;font-weight:700;text-transform:uppercase;letter-spacing:1px;">📊 FRC ต้นทาง 24 ชม. (mg/L)</span>';
              wqHtml += '<span style="font-size:9px;color:'+ageColor+';font-family:\'JetBrains Mono\',monospace;">🕐 '+ageText+'</span>';
              wqHtml += '</div>';

              wqHtml += '<svg width="'+totalW+'" height="'+totalH+'" style="display:block;font-family:\'JetBrains Mono\',monospace;">';

              // Y-axis gridlines + labels (3 ticks)
              var yTicks = [fMin, (fMin+fMax)/2, fMax];
              for (var yi = 0; yi < yTicks.length; yi++) {
                var yy = mT + cH - ((yTicks[yi] - fMin) / fRange) * cH;
                // gridline
                wqHtml += '<line x1="'+mL+'" y1="'+yy.toFixed(1)+'" x2="'+(mL+cW)+'" y2="'+yy.toFixed(1)+'" stroke="rgba(180,120,150,0.15)" stroke-width="0.5" stroke-dasharray="3,2"/>';
                // label
                wqHtml += '<text x="'+(mL-3)+'" y="'+(yy+3).toFixed(1)+'" text-anchor="end" fill="#c0a0b0" font-size="8">'+yTicks[yi].toFixed(2)+'</text>';
              }

              // X-axis labels (first, middle, last timestamps)
              var xTimes = [pts[0], pts[Math.floor(pts.length/2)], pts[pts.length-1]];
              for (var xi = 0; xi < xTimes.length; xi++) {
                var xp = mL + ((xTimes[xi].ts - tMin) / tRange) * cW;
                var tDate = new Date(xTimes[xi].ts);
                var tLabel = ('0'+tDate.getHours()).slice(-2) + ':' + ('0'+tDate.getMinutes()).slice(-2);
                var anchor = xi === 0 ? 'start' : xi === xTimes.length-1 ? 'end' : 'middle';
                wqHtml += '<text x="'+xp.toFixed(1)+'" y="'+(totalH-2)+'" text-anchor="'+anchor+'" fill="#c0a0b0" font-size="8">'+tLabel+'</text>';
              }

              // Axis lines
              wqHtml += '<line x1="'+mL+'" y1="'+mT+'" x2="'+mL+'" y2="'+(mT+cH)+'" stroke="rgba(180,120,150,0.3)" stroke-width="0.5"/>';
              wqHtml += '<line x1="'+mL+'" y1="'+(mT+cH)+'" x2="'+(mL+cW)+'" y2="'+(mT+cH)+'" stroke="rgba(180,120,150,0.3)" stroke-width="0.5"/>';

              // FRC threshold line at 0.2
              if (fMin < 0.2 && fMax > 0.2) {
                var thY = mT + cH - ((0.2 - fMin) / fRange) * cH;
                wqHtml += '<line x1="'+mL+'" y1="'+thY.toFixed(1)+'" x2="'+(mL+cW)+'" y2="'+thY.toFixed(1)+'" stroke="#e04040" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.7"/>';
                wqHtml += '<text x="'+(mL+cW+2)+'" y="'+(thY+3).toFixed(1)+'" fill="#e04040" font-size="7">0.2</text>';
              }

              // Data line
              wqHtml += '<path d="'+sparkPts+'" fill="none" stroke="#cc0055" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';

              // Last point dot
              var lastX = mL + ((lastPt.ts - tMin) / tRange) * cW;
              var lastY = mT + cH - ((lastPt.frc - fMin) / fRange) * cH;
              wqHtml += '<circle cx="'+lastX.toFixed(1)+'" cy="'+lastY.toFixed(1)+'" r="3" fill="#cc0055" stroke="#fff" stroke-width="1"/>';

              wqHtml += '</svg></div>';
            }
          }
        } catch(e){}
      }

      // 🌸 FRC section
      if (frcVal != null && frcVal > 0) {
        const _sColor = (typeof statusColor !== 'undefined') ? statusColor(frcVal) : '#666';
        const _sText  = (typeof statusText  !== 'undefined') ? statusText(frcVal)  : '';
        wqHtml += '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #f0d0e0;">';
        wqHtml += '<div style="font-size:9px;color:#c080a0;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">🌸 ค่า FRC (คลอรีนอิสระคงเหลือ)</div>';
        wqHtml += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:22px;font-weight:700;color:'+_sColor+';">'+frcVal.toFixed(3)+' <span style="font-size:11px;font-weight:400;">mg/L</span></div>';
        wqHtml += '<div style="font-size:11px;font-weight:600;color:'+_sColor+';margin-top:2px;">'+_sText+'</div>';
        wqHtml += '</div>';
      }
      // ⚡ EC section
      if (ecVal != null && ecVal > 0) {
        const _ecSt = (typeof ecStatus !== 'undefined') ? ecStatus(ecVal) : '';
        const _ecClr = ecVal > 1200 ? '#b32800' : ecVal > 500 ? '#cc6600' : '#1565c0';
        wqHtml += '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed #e0d0e0;">';
        wqHtml += '<div style="font-size:9px;color:#6090c0;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">⚡ ค่า Conductivity (ความนำไฟฟ้า)</div>';
        wqHtml += '<div style="font-family:\'JetBrains Mono\',monospace;font-size:18px;font-weight:700;color:'+_ecClr+';">'+Math.round(ecVal)+' <span style="font-size:11px;font-weight:400;">μS/cm</span></div>';
        wqHtml += '<div style="font-size:11px;font-weight:600;color:'+_ecClr+';margin-top:2px;">'+_ecSt+'</div>';
        wqHtml += '</div>';
      }
      // ถ้าไม่มีค่าเลย
      if (!wqHtml) {
        wqHtml = '<div style="margin-top:6px;padding-top:5px;border-top:1px solid #f0e0e8;font-size:10px;color:#c0a0b0;">📍 จุดนี้อยู่นอกพื้นที่ครอบคลุมของโมเดล</div>';
      }
    } catch(e) {
      wqHtml = '';
    }

    // --- สร้างข้อความสำหรับ share ---
    const _shareId = 'msd_share_' + Date.now();
    let shareText = label + '\\n📍 ' + lat.toFixed(6) + ', ' + lon.toFixed(6);
    try {
      const _frcFn2 = window.frcZone || (typeof frcZone !== 'undefined' ? frcZone : null);
      const _fv = _frcFn2 ? _frcFn2(lat, lon) : null;
      if (_fv != null && _fv > 0) shareText += '\\n🌸 FRC: ' + _fv.toFixed(3) + ' mg/L';
    } catch(e){}

    // Popup with share + remove buttons
    const popHtml = `<div style="font-family:'Sarabun',sans-serif;padding:4px 2px;min-width:220px;max-width:320px;">
      <div style="font-weight:700;font-size:12px;color:#cc0055;margin-bottom:3px;">${escapeHtml(label)}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#a06080;">
        ${lat.toFixed(6)}, ${lon.toFixed(6)}
      </div>
      ${wqHtml}
      <div style="margin-top:8px;padding-top:6px;border-top:1px solid #f0e0e8;display:flex;gap:6px;flex-wrap:wrap;">
        <button id="${_shareId}" onclick="(function(){var t='${shareText.replace(/'/g,"\\'")}';if(navigator.clipboard){navigator.clipboard.writeText(t.replace(/\\\\n/g,'\\n'));}var b=document.getElementById('${_shareId}');if(b){b.textContent='✓ คัดลอกแล้ว';b.style.color='#00b894';setTimeout(function(){b.textContent='📋 แชร์พิกัด';b.style.color='#1565c0';},1500);}})()"
          style="font-size:10px;color:#1565c0;background:#eef4ff;border:1px solid #c0d8f0;border-radius:5px;cursor:pointer;padding:3px 8px;font-family:'Sarabun',sans-serif;font-weight:600;">
          📋 แชร์พิกัด
        </button>
        <button onclick="(function(){var mk=window._msdPins||[];var lat=${lat},lon=${lon};for(var i=0;i<mk.length;i++){if(mk[i]._msdLat===lat&&mk[i]._msdLon===lon){try{window.map.removeLayer(mk[i]);}catch(e){}mk.splice(i,1);break;}}window._msdPins=mk;window.map.closePopup();})()"
          style="font-size:10px;color:#cc0055;background:#fff0f5;border:1px solid #f0c0d8;border-radius:5px;cursor:pointer;padding:3px 8px;font-family:'Sarabun',sans-serif;font-weight:600;">
          ✕ ลบหมุด
        </button>
        <button onclick="(function(){var mk=window._msdPins||[];for(var i=mk.length-1;i>=0;i--){try{window.map.removeLayer(mk[i]);}catch(e){}}window._msdPins=[];window.map.closePopup();})()"
          style="font-size:10px;color:#806070;background:#f8f0f4;border:1px solid #e0d0d8;border-radius:5px;cursor:pointer;padding:3px 8px;font-family:'Sarabun',sans-serif;font-weight:600;">
          🗑 ลบทั้งหมด
        </button>
      </div>
    </div>`;
    // --- Multi-pin: เก็บ marker ใน array แทนที่จะ replace ---
    _flyMarker._msdLat = lat;
    _flyMarker._msdLon = lon;
    if (!window._msdPins) window._msdPins = [];
    window._msdPins.push(_flyMarker);
    _flyMarker.bindPopup(popHtml, { className: 'msd-flyto-popup pk-pop', closeButton: false, maxWidth: 360, autoPan: true, autoPanPaddingTopLeft: [10, 80], autoPanPaddingBottomRight: [10, 40] });
    // เปิด popup หลัง flyTo animation เสร็จ
    setTimeout(() => { try { _flyMarker.openPopup(); } catch(e){} }, 700);
    window._msdFlyMarker = _flyMarker;
  }

  // ── Select item ────────────────────────────────────────────────────────────
  window._mapSearchSelect = function(i) {
    const it = _results[i];
    if (!it) return;
    inp().value = it.label;
    clr().classList.add('visible');
    hideDropdown();
    const zoom = it.type === 'station' ? 16 : it.type === 'latlng' ? 15 : 14;
    flyTo(it.lat, it.lon, it.label, zoom);
  };

  window._mapSearchHover = function(i) {
    _activeIdx = i;
    Array.from(drop().querySelectorAll('.msd-item')).forEach((el, j) => {
      el.style.background = j === i ? (document.body.classList.contains('dark') ? 'rgba(233,69,96,.12)' : '#fff0f5') : '';
    });
  };

  // ── Input handler ──────────────────────────────────────────────────────────
  window.onMapSearchInput = function(val) {
    clr().classList.toggle('visible', val.length > 0);
    _lastQuery = val;
    clearTimeout(_searchTimer);

    if (!val.trim()) { hideDropdown(); return; }

    // 1. ลอง parse lat/lon ก่อน
    const ll = parseLatLon(val);
    const localItems = [];
    if (ll) {
      localItems.push({
        type: 'latlng',
        label: `📍 ${ll.lat.toFixed(6)}, ${ll.lon.toFixed(6)}`,
        sub: `lat ${ll.lat.toFixed(6)}  lon ${ll.lon.toFixed(6)}`,
        lat: ll.lat, lon: ll.lon
      });
    }

    // 2. ค้นหาสถานีในข้อมูล app
    const stItems = searchStations(val);
    const combined = [...localItems, ...stItems];
    if (combined.length) showDropdown(combined, false);
    else showDropdown([], true);

    // 3. เรียก Nominatim หลัง debounce 500ms
    _searchTimer = setTimeout(async () => {
      if (val !== _lastQuery) return;
      showDropdown(combined, true);
      const places = await nominatimSearch(val);
      if (val !== _lastQuery) return;
      const merged = [...localItems, ...stItems, ...places];
      showDropdown(merged.slice(0, 8), false);
    }, 500);
  };

  // ── Key handler ────────────────────────────────────────────────────────────
  window.onMapSearchKey = function(e) {
    const d = drop();
    const items = d.querySelectorAll('.msd-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIdx = Math.min(_activeIdx + 1, items.length - 1);
      items.forEach((el,j) => el.style.background = j===_activeIdx ? (document.body.classList.contains('dark') ? 'rgba(233,69,96,.12)' : '#fff0f5') : '');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIdx = Math.max(_activeIdx - 1, -1);
      items.forEach((el,j) => el.style.background = j===_activeIdx ? (document.body.classList.contains('dark') ? 'rgba(233,69,96,.12)' : '#fff0f5') : '');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_activeIdx >= 0 && _results[_activeIdx]) {
        window._mapSearchSelect(_activeIdx);
      } else {
        doMapSearch();
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
      inp().blur();
    }
  };

  // ── Explicit search button ─────────────────────────────────────────────────
  window.doMapSearch = async function() {
    const val = inp().value.trim();
    if (!val) return;
    // lat/lon ตรง
    const ll = parseLatLon(val);
    if (ll) {
      hideDropdown();
      flyTo(ll.lat, ll.lon, `${ll.lat.toFixed(6)}, ${ll.lon.toFixed(6)}`, 15);
      return;
    }
    // Nominatim
    showDropdown([], true);
    const places = await nominatimSearch(val);
    if (places.length) {
      const stItems = searchStations(val);
      showDropdown([...stItems, ...places].slice(0, 8), false);
    } else {
      showDropdown([], false);
    }
  };

  // ── Clear ──────────────────────────────────────────────────────────────────
  window.clearMapSearch = function() {
    inp().value = '';
    clr().classList.remove('visible');
    hideDropdown();
    inp().focus();
    const m = getMap();
    // ลบ pin ทั้งหมด (multi-pin)
    if (window._msdPins && m) {
      for (var i = window._msdPins.length - 1; i >= 0; i--) {
        try { m.removeLayer(window._msdPins[i]); } catch(e){}
      }
      window._msdPins = [];
    }
    if (_flyMarker && m) {
      try { m.removeLayer(_flyMarker); } catch(e){}
      _flyMarker = null;
    }
  };

  // ── Close dropdown when clicking outside ──────────────────────────────────
  document.addEventListener('click', function(e) {
    const wrap = document.getElementById('map-search-wrap');
    if (wrap && !wrap.contains(e.target)) hideDropdown();
  });

  // ── Prevent map interaction bleeding into search ───────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    const wrap = document.getElementById('map-search-wrap');
    if (!wrap) return;
    ['click','dblclick','mousedown','touchstart','wheel','pointerdown']
      .forEach(ev => wrap.addEventListener(ev, e => e.stopPropagation(), { passive: false }));
  });

})();
// ═══════════ [7/11] FIREBASE HELPERS — _ref/_get shortcuts ═══════════
(function(){
  function _fb() { return window._fb; }
  function _ref(path) { return window._fbRef(window._fb, path); }
  function _get(r) { return window._fbGet(r); }
  function _set(r, v) { return window._fbSet(r, v); }
  function _push(r, v) { return window._fbPush(r, v); }
  function _ready() { return window._fbReady && window._fb; }

  // ── Page View Tracker ──
  function trackView() {
    if (!_ready()) { setTimeout(trackView, 2000); return; }
    try {
      var now = new Date();
      var dateKey = now.toISOString().slice(0, 10);
      var pvData = { ts: Date.now(), date: dateKey, ua: navigator.userAgent.substring(0, 100), w: screen.width, h: screen.height };
      _push(_ref('analytics/views'), pvData);
      _get(_ref('analytics/daily/' + dateKey)).then(function(snap) {
        var cur = (snap && snap.exists()) ? snap.val() : 0;
        _set(_ref('analytics/daily/' + dateKey), cur + 1);
      }).catch(function(){});
      _get(_ref('analytics/total')).then(function(snap) {
        var cur = (snap && snap.exists()) ? snap.val() : 0;
        _set(_ref('analytics/total'), cur + 1);
      }).catch(function(){});
    } catch(e) { console.log('[Analytics]', e.message); }
  }
  // รอ Firebase พร้อมก่อน
  if (_ready()) trackView(); else setTimeout(trackView, 3000);

  // ── Load Stats (exposed as _loadRpStats for report panel) ──
  window._loadRpStats = _loadStats;
  async function _loadStats() {
    var el = document.getElementById('rp-stats-content');
    if (!el) return;
    if (!_ready()) {
      el.innerHTML = '⏳ กำลังรอ Firebase...';
      setTimeout(function() { _loadStats(); }, 2000);
      return;
    }
    el.innerHTML = '⏳ กำลังโหลด...';
    try {
      var now = new Date();
      var todayKey = now.toISOString().slice(0, 10);
      var monthPrefix = now.toISOString().slice(0, 7);
      var totalSnap = await _get(_ref('analytics/total'));
      var total = (totalSnap && totalSnap.exists()) ? totalSnap.val() : 0;
      var todaySnap = await _get(_ref('analytics/daily/' + todayKey));
      var today = (todaySnap && todaySnap.exists()) ? todaySnap.val() : 0;
      var dailySnap = await _get(_ref('analytics/daily'));
      var month = 0, dailyData = [];
      if (dailySnap && dailySnap.exists()) {
        dailySnap.forEach(function(child) {
          var k = child.key, v = child.val() || 0;
          if (k.startsWith(monthPrefix)) month += v;
          dailyData.push({ date: k, count: v });
        });
      }
      dailyData.sort(function(a,b) { return b.date.localeCompare(a.date); });
      var isDk = document.body.classList.contains('dark');
      var tc = isDk ? '#e0e0ff' : '#1a1a2e';
      var sc = isDk ? '#a0a0c0' : '#999';
      var html = '<div style="display:flex;gap:8px;margin-bottom:16px;">';
      html += '<div style="flex:1;background:'+(isDk?'#2a1a3e':'#f8f4f6')+';border-radius:10px;padding:12px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#cc0055;">'+today+'</div><div style="font-size:10px;color:'+sc+';">วันนี้</div></div>';
      html += '<div style="flex:1;background:'+(isDk?'#2a1a3e':'#f8f4f6')+';border-radius:10px;padding:12px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#4488ff;">'+month+'</div><div style="font-size:10px;color:'+sc+';">เดือนนี้</div></div>';
      html += '<div style="flex:1;background:'+(isDk?'#2a1a3e':'#f8f4f6')+';border-radius:10px;padding:12px;text-align:center;"><div style="font-size:24px;font-weight:700;color:#00C853;">'+total+'</div><div style="font-size:10px;color:'+sc+';">ทั้งหมด</div></div>';
      html += '</div>';
      html += '<div style="font-size:12px;font-weight:700;color:'+tc+';margin-bottom:6px;">📅 รายวัน (7 วันล่าสุด)</div>';
      html += '<table style="width:100%;font-size:11px;border-collapse:collapse;">';
      html += '<tr style="color:'+sc+';"><td style="padding:4px;">วันที่</td><td style="padding:4px;text-align:right;">จำนวน</td></tr>';
      for (var i = 0; i < Math.min(7, dailyData.length); i++) {
        var d = dailyData[i];
        html += '<tr style="border-top:1px solid '+(isDk?'#333':'#f0e0f0')+';"><td style="padding:4px;color:'+tc+';">'+d.date+'</td><td style="padding:4px;text-align:right;font-weight:700;color:#cc0055;">'+d.count+'</td></tr>';
      }
      html += '</table>';
      el.innerHTML = html;
    } catch(e) { el.innerHTML = '❌ ' + e.message; }
  }

  // ── Login ── (rev11.0: ย้ายไปใช้ Firebase Auth แล้ว — ดู rpFbLogin)
  // hardcoded credentials ถูกลบออกเพื่อความปลอดภัย
})();
// ═══════════ [8/11] WHAT-IF — สถานการณ์จำลอง K/ระยะ ═══════════
(function(){
  let _wifStation = null;
  let _wifDelta = 0;
  let _wifOrigFrc = {};
  let _wifActive = false;

  // Toggle What-If floating panel
  window.toggleWhatIfPanel = function() {
    const panel = document.getElementById('whatif-panel');
    const btn = document.getElementById('whatif-btn');
    if (!panel) return;
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', open);
    if (open) wifPopulate2();
  };

  // Populate dropdown — ทั้ง sidebar + panel
  function wifPopulate() {
    _populateSelect('wif-station');
    _populateSelect('wif-station2');
  }
  function wifPopulate2() { _populateSelect('wif-station2'); }

  function _populateSelect(selId) {
    const sel = document.getElementById(selId);
    if (!sel || typeof SENSORS === 'undefined') return;
    const EXCL = new Set(['SP01','SP02','SP03','SP11','1','2','3','11']);
    const pumps = SENSORS.filter(s =>
      (s.type === 'pump' || s.type === 'plant') && !EXCL.has(String(s.id))
    );
    sel.innerHTML = '<option value="">-- เลือกสถานี --</option>';
    pumps.forEach(s => {
      const name = s.name?.replace('สถานีสูบจ่ายน้ำ','สจ.').replace('โรงงานผลิตน้ำ','รง.');
      const frc = _wifActive && _wifOrigFrc[String(s.id)] != null ? _wifOrigFrc[String(s.id)] : s.frc;
      sel.innerHTML += '<option value="'+s.id+'">'+name+' (FRC '+(frc||0).toFixed(2)+')</option>';
    });
    if (_wifStation) sel.value = String(_wifStation.id);
  }

  // Select station — sidebar version
  window.wifSelectStation = function() {
    const sid = document.getElementById('wif-station')?.value;
    _wifStation = SENSORS.find(s => String(s.id) === sid) || null;
    _wifDelta = 0;
    document.querySelectorAll('.wif-btn:not(.wif-btn2)').forEach(b => b.classList.remove('active'));
    _syncSelect('wif-station2');
    wifUpdateInfo('wif-info', 'wif-impact');
    wifUpdateInfo('wif-info2', 'wif-impact2');
  };

  // Select station — panel version
  window.wifSelectStation2 = function() {
    const sid = document.getElementById('wif-station2')?.value;
    _wifStation = SENSORS.find(s => String(s.id) === sid) || null;
    _wifDelta = 0;
    document.querySelectorAll('.wif-btn2').forEach(b => b.classList.remove('active'));
    _syncSelect('wif-station');
    wifUpdateInfo('wif-info', 'wif-impact');
    wifUpdateInfo('wif-info2', 'wif-impact2');
  };

  function _syncSelect(targetId) {
    const sel = document.getElementById(targetId);
    if (sel && _wifStation) sel.value = String(_wifStation.id);
  }

  // Adjust — sidebar
  window.wifAdjust = function(delta) {
    _wifDelta = delta;
    document.querySelectorAll('.wif-btn:not(.wif-btn2)').forEach(b => b.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    wifUpdateInfo('wif-info', 'wif-impact');
    wifUpdateInfo('wif-info2', 'wif-impact2');
  };

  // Adjust — panel
  window.wifAdjust2 = function(delta) {
    _wifDelta = delta;
    document.querySelectorAll('.wif-btn2').forEach(b => b.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    wifUpdateInfo('wif-info', 'wif-impact');
    wifUpdateInfo('wif-info2', 'wif-impact2');
  };

  function wifUpdateInfo(infoId, impactId) {
    const info = document.getElementById(infoId);
    const impact = document.getElementById(impactId);
    if (!info) return;

    if (!_wifStation) {
      info.innerHTML = '<span style="color:#999;">เลือกสถานีก่อน</span>';
      if (impact) impact.innerHTML = '';
      return;
    }

    const origFrc = _wifActive && _wifOrigFrc[String(_wifStation.id)] != null
      ? _wifOrigFrc[String(_wifStation.id)] : _wifStation.frc || 0;
    const newFrc = Math.max(0, origFrc + _wifDelta);
    const sign = _wifDelta >= 0 ? '+' : '';
    const color = _wifDelta > 0 ? '#0F6E56' : _wifDelta < 0 ? '#A32D2D' : '#888';

    info.innerHTML = '<div style="background:#E1F5EE;border-radius:6px;padding:6px 8px;margin:4px 0;">' +
      '<div style="font-size:11px;font-weight:600;color:#085041;">' + _wifStation.name?.replace('สถานีสูบจ่ายน้ำ','สจ.').replace('โรงงานผลิตน้ำ','รง.') + '</div>' +
      '<div style="font-size:13px;font-weight:700;color:'+color+';margin-top:2px;">' +
      origFrc.toFixed(2) + ' → ' + newFrc.toFixed(2) + ' mg/L (' + sign + _wifDelta.toFixed(1) + ')</div></div>';

    if (impact) {
      const monitors = SENSORS.filter(s => s.type === 'monitor');
      const sid = String(_wifStation.id);
      let h = '<div style="font-size:9px;color:#888;margin:4px 0;">ผลกระทบต่อ Monitor (Zone Influence):</div>';
      h += '<table style="width:100%;border-collapse:collapse;font-size:10px;">';
      h += '<tr style="background:#f5f5f5;"><th style="padding:3px 4px;text-align:left;">สถานี</th><th style="padding:3px;text-align:right;">เดิม</th><th style="padding:3px;text-align:right;">ใหม่</th><th style="padding:3px;text-align:right;">ต่าง</th></tr>';

      // หา monitor ที่อยู่ใน zone ของสถานีที่เลือก
      // 1. เช็ค CUSTOM_ZONES ก่อน
      // 2. ถ้าไม่มี zone → ใช้ nearest-neighbor
      let count = 0;
      for (const m of monitors) {
        let inZone = false;

        // เช็คว่า monitor อยู่ใน CUSTOM_ZONES ของสถานีนี้ไหม
        if (typeof pointInPolygon === 'function' && window.CUSTOM_ZONES && window.CUSTOM_ZONES[sid]) {
          const zone = window.CUSTOM_ZONES[sid];
          if (zone.coords && zone.coords.length >= 3) {
            inZone = pointInPolygon(m.lat, m.lon, zone.coords);
          }
        }

        // ถ้าไม่มี CUSTOM_ZONE → เช็คว่าสถานีนี้เป็น nearest source ของ monitor หรือไม่
        if (!inZone) {
          const _SRC = new Set(['pump','plant']);
          const _EXCL_IDS = new Set(['SP01','SP02','SP03','SP11','1','2','3','11']);
          const srcs = SENSORS.filter(x => _SRC.has(x.type) && !_EXCL_IDS.has(String(x.id)));
          let nearestSid = null, minD = Infinity;
          for (const x of srcs) {
            const d = (x.lat - m.lat)**2 + (x.lon - m.lon)**2;
            if (d < minD) { minD = d; nearestSid = String(x.id); }
          }
          // เช็คว่า monitor อยู่ใน CUSTOM_ZONE ของสถานีอื่นไหม (ถ้าอยู่ → ไม่ใช่ nearest)
          let foundOtherZone = false;
          if (typeof pointInPolygon === 'function' && window.CUSTOM_ZONES) {
            for (const [zSid, zone] of Object.entries(window.CUSTOM_ZONES)) {
              if (zSid === sid || !zone.coords || zone.coords.length < 3) continue;
              if (pointInPolygon(m.lat, m.lon, zone.coords)) { foundOtherZone = true; break; }
            }
          }
          if (!foundOtherZone && nearestSid === sid) inZone = true;
        }

        if (!inZone) continue;

        // คำนวณ decay จากสถานีที่เลือก → monitor
        const dKm = Math.sqrt((m.lat - _wifStation.lat)**2 + (m.lon - _wifStation.lon)**2) * 111.0;
        const kb = 0.80, kw = 0.10, D = 0.20, v = 0.45;
        const K_total = (kb + kw * (4/D)) / 86400;
        const t = (dKm * 1000) / v;
        const decay = Math.exp(-K_total * t);
        const origAtM = origFrc * decay;
        const newAtM = newFrc * decay;
        const diff = newAtM - origAtM;
        const dc = diff > 0.01 ? '#0F6E56' : diff < -0.01 ? '#A32D2D' : '#888';
        const ds = diff >= 0 ? '+' : '';
        const mName = m.name?.length > 18 ? m.name.substring(0, 18) + '…' : m.name;
        h += '<tr style="border-bottom:1px solid #eee;"><td style="padding:2px 4px;">'+mName+'</td><td style="padding:2px;text-align:right;font-family:monospace;">'+origAtM.toFixed(3)+'</td><td style="padding:2px;text-align:right;font-family:monospace;color:'+dc+';">'+newAtM.toFixed(3)+'</td><td style="padding:2px;text-align:right;font-family:monospace;color:'+dc+';font-weight:600;">'+ds+diff.toFixed(3)+'</td></tr>';
        count++;
      }
      h += '</table>';
      if (count === 0) h += '<div style="color:#999;font-size:9px;">ไม่มี monitor ใน zone ของสถานีนี้</div>';
      impact.innerHTML = h;
    }
  }

  window.wifApply = function() {
    if (!_wifStation) { alert('เลือกสถานีก่อน'); return; }
    if (!_wifActive) {
      _wifOrigFrc = {};
      SENSORS.forEach(s => { _wifOrigFrc[String(s.id)] = s.frc; });
    }
    _wifActive = true;
    const origFrc = _wifOrigFrc[String(_wifStation.id)] || _wifStation.frc;
    _wifStation.frc = Math.max(0, origFrc + _wifDelta);
    if (typeof updateVcFrc === 'function') updateVcFrc();
    if (typeof buildIdwCache === 'function') buildIdwCache();
    if (typeof redrawContour === 'function') redrawContour();
    if (typeof buildMarkers === 'function') buildMarkers();
    console.log('[What-If] Applied: ' + _wifStation.name + ' FRC → ' + _wifStation.frc.toFixed(3));
  };

  window.wifReset = function() {
    if (!_wifActive || !_wifOrigFrc) return;
    SENSORS.forEach(s => {
      const orig = _wifOrigFrc[String(s.id)];
      if (orig != null) s.frc = orig;
    });
    _wifActive = false; _wifOrigFrc = {}; _wifDelta = 0; _wifStation = null;
    document.querySelectorAll('.wif-btn').forEach(b => b.classList.remove('active'));
    ['wif-station','wif-station2'].forEach(id => { const s = document.getElementById(id); if (s) s.value = ''; });
    ['wif-info','wif-info2'].forEach(id => { const e = document.getElementById(id); if (e) e.innerHTML = '<span style="color:#27ae60;font-weight:600;">✓ คืนค่าเดิมแล้ว</span>'; });
    ['wif-impact','wif-impact2'].forEach(id => { const e = document.getElementById(id); if (e) e.innerHTML = ''; });
    if (typeof updateVcFrc === 'function') updateVcFrc();
    if (typeof buildIdwCache === 'function') buildIdwCache();
    if (typeof redrawContour === 'function') redrawContour();
    if (typeof buildMarkers === 'function') buildMarkers();
    wifPopulate();
    console.log('[What-If] Reset');
  };

  const _do = () => setTimeout(wifPopulate, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _do);
  else _do();
})();
// ═══════════ [9/11] VC SIM — valve control simulation ═══════════
(function(){
  function _srcName(id) {
    const map = {'SP01':'TR1 (สูบส่งบางเขน 1)','SP02':'TR2 (สูบส่งบางเขน 2)','SP03':'TR3 (สูบส่งบางเขน 3)',
                 'SP11':'MTR (สูบส่งมหาสวัสดิ์)','SP06':'รง.ธนบุรี','SP12':'สจ.มหาสวัสดิ์'};
    return map[id] || id || '—';
  }

  function renderVcList() {
    const el = document.getElementById('vc-config-list');
    if (!el || typeof VC_STATIONS === 'undefined') return;
    let h = '';
    for (const vc of VC_STATIONS) {
      const active = vc.valvePct != null && vc.valvePct > 0;
      const closed = vc.valvePct === 0;
      const nodata = vc.valvePct == null;
      const vcFrc = active ? getVcFrc(vc.id).toFixed(3) : '—';
      const pair = VC_PAIR[vc.id] || {K:0.05};
      const bg = active ? '#f3e8ff' : closed ? '#f5f5f5' : '#fffbeb';
      const border = active ? '#d0b0f0' : closed ? '#ddd' : '#f0d080';
      const tag = closed ? '<span style="color:#999;font-size:8px;"> (0% ปิด)</span>'
                 : nodata ? '<span style="color:#c0a030;font-size:8px;"> (ไม่มีข้อมูล)</span>'
                 : '<span style="color:#6c3483;font-size:8px;"> ('+vc.valvePct+'%)</span>';

      h += '<div style="background:'+bg+';border:1px solid '+border+';border-radius:8px;padding:8px 10px;margin-bottom:5px;">';
      h += '<div style="font-size:11px;font-weight:700;color:'+(active?'#6c3483':'#999')+';margin-bottom:3px;">';
      h += (active?'🟣':'⚪') + ' ' + vc.name.replace('VC ','') + tag + '</div>';
      h += '<div style="font-size:9px;color:#888;margin-bottom:3px;">← ' + _srcName(vc.sourceId) + '</div>';

      if (active) {
        h += '<div style="display:flex;gap:4px;align-items:center;margin-bottom:2px;">';
        h += '<span style="font-size:8px;color:#888;width:45px;">Valve%</span>';
        h += '<input type="number" step="1" min="0" max="100" value="'+vc.valvePct+'" data-vc="'+vc.id+'" data-f="pct" style="flex:1;font-size:10px;padding:2px 5px;border:1px solid #d0b0f0;border-radius:3px;font-family:JetBrains Mono,monospace;" onchange="window._vcCfg(this)">';
        h += '<span style="font-size:8px;color:#888;width:30px;">K</span>';
        h += '<input type="number" step="0.001" min="0" max="0.5" value="'+pair.K+'" data-vc="'+vc.id+'" data-f="K" style="flex:1;font-size:10px;padding:2px 5px;border:1px solid #d0b0f0;border-radius:3px;font-family:JetBrains Mono,monospace;" onchange="window._vcCfg(this)">';
        h += '</div>';
        h += '<div style="font-size:9px;color:#6c3483;font-family:JetBrains Mono,monospace;">FRC<sub>sim</sub> = <b>'+vcFrc+'</b> mg/L <span style="color:#999;font-size:7px;">(EPANET)</span></div>';
      }
      h += '</div>';
    }
    el.innerHTML = h;
  }

  window._vcCfg = function(inp) {
    const vcId = inp.dataset.vc, f = inp.dataset.f;
    const vc = VC_STATIONS.find(v => v.id === vcId);
    if (f === 'pct' && vc) vc.valvePct = parseFloat(inp.value) || 0;
    if (f === 'K') { if (!VC_PAIR[vcId]) VC_PAIR[vcId] = {K:0.05}; VC_PAIR[vcId].K = parseFloat(inp.value) || 0.05; }
    renderVcList();
  };

  window.applyVcConfig = function() {
    if (typeof updateVcFrc === 'function') updateVcFrc();
    if (typeof buildIdwCache === 'function') buildIdwCache();
    if (typeof redrawContour === 'function') redrawContour();
    if (typeof buildMarkers === 'function') buildMarkers();
    try {
      const save = {};
      Object.entries(VC_PAIR).forEach(([id,c]) => { save[id] = {K:c.K}; });
      const vcSave = {};
      VC_STATIONS.forEach(v => { vcSave[v.id] = {valvePct:v.valvePct, sourceId:v.sourceId}; });
      localStorage.setItem('vc_pair_v32', JSON.stringify(save));
      localStorage.setItem('vc_stations_v32', JSON.stringify(vcSave));
    } catch(e){}
    console.log('[VC] ✅ Applied');
  };

  // Load saved valve% overrides
  try {
    const s = JSON.parse(localStorage.getItem('vc_stations_v32') || '{}');
    Object.entries(s).forEach(([id,cfg]) => {
      const vc = VC_STATIONS.find(v => v.id === id);
      if (vc && cfg.valvePct !== undefined) vc.valvePct = cfg.valvePct;
      if (vc && cfg.sourceId) vc.sourceId = cfg.sourceId;
    });
  } catch(e){}

  // Render on ready
  const _doRender = () => setTimeout(renderVcList, 1200);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _doRender);
  else _doRender();
})();
// ═══════════ [10/11] RAW WATER EC — สีและ interpolation ═══════════
(function() {
  'use strict';

  // ── 1. สถานีน้ำดิบ กปน. (พิกัดปรับ rev19) ─────────────────────────
  const RAW_WATER_STATIONS = {
    'T3': { name: 'วัดบ้านแป้ง',           lat: 14.2388, lon: 100.5755 },
    'S1': { name: 'สำแล',                 lat: 14.0406, lon: 100.5560 },
    'S3': { name: 'วัดไผ่ล้อม',           lat: 14.0770, lon: 100.5254 },
    'S4': { name: 'วัดมะขาม',             lat: 14.0041, lon: 100.5405 },
    'T4': { name: 'สะพานพระนั่งเกล้า',    lat: 13.8636, lon: 100.4881 },
    'S7': { name: 'สะพานพระพุทธยอดฟ้า',  lat: 13.7404, lon: 100.5000 },
    'T1': { name: 'การท่าเรือ',           lat: 13.7075, lon: 100.5728 },
    'S6': { name: 'คลองลัดโพธิ์',         lat: 13.6538, lon: 100.5306 },
    'T2': { name: 'โรงไฟฟ้าพระนครใต้',    lat: 13.6122, lon: 100.5616 },
  };

  // ── 2. API endpoint ─────────────────────────────────────────────────
  const RAW_WATER_API = 'https://bigdata.mwa.co.th/data-service/internal/big-data/api/v1/783f543c-666c-35b4-795b-40dd2446b291/720721b3-cdaa-199d-9286-52f97cf00dfb/data?token=y0pBvoNbZSQWULB88PXeHBn2dHEgzaFyxSeH3V7a9jgWwn9VAmuGLhqkwrHLpdRm7wNn4DJsYLUT81JpZTwFqZkawNqdq2Osi1igZmYMlD37sKnU8Sy3aLgAQjKoHcdN';

  // ── 3. State ────────────────────────────────────────────────────────
  let _rwLayerGroup = null;
  let _rwContourLayer = null;
  let _rwData = {};  // stn_id → { ec, time, temp, ... }
  let _rwHistory = {}; // stn_id → [{ec, time}, ...]
  let _rwFetchTimer = null;

  // ── 4. EC Color scale (สำหรับน้ำดิบ: 100-2000 µS/cm) ──────────────
  function rwEcColor(ec) {
    if (ec == null || ec <= 0) return 'rgba(150,150,150,0.6)';
    if (ec < 200) return 'rgba(40,80,200,0.75)';       // น้ำเงิน = ดีมาก
    if (ec < 400) return 'rgba(50,190,170,0.75)';       // เขียวฟ้า = ดี
    if (ec < 600) return 'rgba(120,200,80,0.7)';        // เขียว = ปกติ
    if (ec < 800) return 'rgba(240,170,20,0.75)';       // ส้ม = สูง
    if (ec < 1000) return 'rgba(220,80,16,0.8)';        // แดง = สูงมาก
    return 'rgba(160,0,80,0.85)';                        // ม่วง = วิกฤต (เค็ม)
  }

  function rwEcText(ec) {
    if (ec == null) return '—';
    if (ec < 200) return 'ดีมาก';
    if (ec < 400) return 'ดี';
    if (ec < 600) return 'ปกติ';
    if (ec < 800) return 'สูง ⚠';
    if (ec < 1000) return 'สูงมาก ⚠';
    return 'วิกฤต (น้ำเค็ม) 🔴';
  }

  // ── 5. Rich popup builder (เจ้าพระยา) — เหมือนสถานีน้ำประปา ──────
  function buildRwPopupHtml(sid, st, d, history) {
    const ec = d ? d.ec : null;
    const time = d ? d.time : null;
    const ecStr = ec != null ? `${ec} µS/cm` : 'ไม่มีข้อมูล';
    const timeStr = time ? new Date(time).toLocaleString('th-TH', {hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}) : '—';
    const tempStr = d && d.temp != null ? `${d.temp}°C` : '—';
    const phStr = d && d.ph != null ? `${d.ph}` : '—';
    const turbStr = d && d.turbid != null ? `${d.turbid} NTU` : '—';
    const salStr = d && d.salinity != null ? `${d.salinity} ppt` : '—';
    const tdsStr = d && d.tds != null ? `${d.tds} mg/L` : '—';
    const _dk = document.body.classList.contains('dark');

    // ── EC Trend Chart จาก _rwHistory ───────────────────────────────
    let chartSvg = '';
    if (history && history.length >= 2) {
      const W = 320, H = 100, pad = 28, padR = 10, padT = 12, padB = 22;
      const now = Date.now();
      const twoDaysAgo = now - 48 * 3600000;  // ย้อนหลัง 2 วัน
      const sorted = [...history].filter(r => r.ts >= twoDaysAgo).sort((a,b) => a.ts - b.ts);
      if (sorted.length >= 2) {
      const minT = sorted[0].ts, maxT = sorted[sorted.length-1].ts;
      const ecVals = sorted.map(r => r.ec);
      const minEc = Math.min(...ecVals), maxEc = Math.max(...ecVals);
      const rangeEc = Math.max(maxEc - minEc, 10);
      const rangeT = Math.max(maxT - minT, 1);
      const x = (ts) => pad + (ts - minT) / rangeT * (W - pad - padR);
      const y = (v) => padT + (1 - (v - (minEc - rangeEc*0.1)) / (rangeEc * 1.2)) * (H - padT - padB);
      let pathD = sorted.map((r,i) => `${i===0?'M':'L'}${x(r.ts).toFixed(1)},${y(r.ec).toFixed(1)}`).join(' ');
      let areaD = pathD + ` L${x(maxT).toFixed(1)},${(H-padB).toFixed(1)} L${x(minT).toFixed(1)},${(H-padB).toFixed(1)} Z`;
      const bgFill = _dk ? 'rgba(20,25,50,0.85)' : '#f5f8ff';
      const gridColor = _dk ? 'rgba(255,255,255,0.1)' : '#e0e8f0';
      const textColor = _dk ? '#9090b8' : '#888';
      const lineColor = '#1a5090';
      const fillColor = _dk ? 'rgba(40,100,200,0.15)' : 'rgba(40,100,200,0.1)';
      chartSvg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;margin:6px auto 2px;">
        <rect x="0" y="0" width="${W}" height="${H}" rx="6" fill="${bgFill}"/>
        <line x1="${pad}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="${gridColor}" stroke-width="1"/>
        <line x1="${pad}" y1="${padT}" x2="${pad}" y2="${H-padB}" stroke="${gridColor}" stroke-width="1"/>
        <path d="${areaD}" fill="${fillColor}"/>
        <path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${sorted.length <= 30 ? sorted.map(r => `<circle cx="${x(r.ts).toFixed(1)}" cy="${y(r.ec).toFixed(1)}" r="2.5" fill="${lineColor}" stroke="#fff" stroke-width="1"/>`).join('') : ''}
        <text x="${pad}" y="${H-4}" font-size="8" fill="${textColor}" font-family="JetBrains Mono,monospace">${new Date(minT).toLocaleString('th-TH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</text>
        <text x="${W-padR}" y="${H-4}" font-size="8" fill="${textColor}" font-family="JetBrains Mono,monospace" text-anchor="end">${new Date(maxT).toLocaleString('th-TH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</text>
        <text x="${pad-3}" y="${padT+8}" font-size="8" fill="${textColor}" font-family="JetBrains Mono,monospace" text-anchor="end">${maxEc}</text>
        <text x="${pad-3}" y="${H-padB}" font-size="8" fill="${textColor}" font-family="JetBrains Mono,monospace" text-anchor="end">${minEc}</text>
        <text x="${W/2}" y="${padT-1}" font-size="8" fill="${_dk?'#6090cc':'#4060a0'}" font-family="Sarabun,sans-serif" font-weight="700" text-anchor="middle">EC ย้อนหลัง 2 วัน (${sorted.length} จุด)</text>
      </svg>`;
      }
    }

    return `
      <div class="lpop" style="font-family:'Sarabun',sans-serif;min-width:220px;max-width:380px;">
        <h4 style="font-size:14px;color:${_dk?'#80c0ff':'#1a3a60'};border-bottom:1.5px solid ${_dk?'rgba(255,255,255,0.08)':'#e0e8f0'};padding-bottom:6px;">
          🌊 ${st.name}
        </h4>
        <div style="font-size:10px;color:#888;">${sid} · น้ำดิบ · แม่น้ำเจ้าพระยา</div>
        <div style="font-size:22px;font-weight:700;color:${_dk?'#80c0ff':'#1a5090'};margin:6px 0 2px;">⚡ ${ecStr}</div>
        <div style="font-size:11px;color:${ec!=null?(_dk?'#4ecca3':'#1a6a40'):'#999'};font-weight:600;">${rwEcText(ec)}</div>
        <div style="font-size:9px;color:#888;margin-top:4px;">🕐 ${timeStr}</div>
        <div style="border-top:1px solid ${_dk?'rgba(255,255,255,0.06)':'#e8f0ff'};margin:8px 0 6px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;font-size:11px;">
          <div class="pr"><span>🌡 อุณหภูมิ</span><span class="pv">${tempStr}</span></div>
          <div class="pr"><span>pH</span><span class="pv">${phStr}</span></div>
          <div class="pr"><span>🌫 ความขุ่น</span><span class="pv">${turbStr}</span></div>
          <div class="pr"><span>🧂 Salinity</span><span class="pv">${salStr}</span></div>
          <div class="pr"><span>TDS</span><span class="pv">${tdsStr}</span></div>
          <div class="pr"><span>📍 พิกัด</span><span class="pv">${st.lat.toFixed(4)}, ${st.lon.toFixed(4)}</span></div>
        </div>
        ${chartSvg}
        <div style="margin-top:8px;padding-top:6px;border-top:1px solid ${_dk?'rgba(255,255,255,0.06)':'#e8f0ff'};">
          <div style="font-size:9px;color:${_dk?'#6090cc':'#4060a0'};font-weight:600;">ℹ️ ค่า EC น้ำดิบนี้ใช้คาดการณ์ EC ที่โรงผลิตน้ำ</div>
        </div>
      </div>
    `;
  }

  // ── 5b. Marker creation ─────────────────────────────────────────────
  function createRwMarkers() {
    if (!_rwLayerGroup) _rwLayerGroup = L.layerGroup();

    _rwLayerGroup.clearLayers();

    Object.entries(RAW_WATER_STATIONS).forEach(([sid, st]) => {
      const d = _rwData[sid];
      const ec = d ? d.ec : null;
      const color = rwEcColor(ec);
      const history = _rwHistory[sid] || [];

      // rev21: S1 สำแล = สถานีหลัก (ต้นทางน้ำดิบ) → marker ใหญ่, สถานีอื่น → เล็กลง
      const isSamle = (sid === 'S1');
      const sz  = isSamle ? 16 : 9;    // วงกลม visual
      const tap = isSamle ? 44 : 36;   // พื้นที่กด
      const marker = L.marker([st.lat, st.lon], {
        icon: L.divIcon({
          html: `<div style="width:${tap}px;height:${tap}px;display:flex;align-items:center;justify-content:center;cursor:pointer;"><div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:${isSamle?'2.5':'2'}px solid rgba(255,255,255,.95);box-shadow:0 2px ${isSamle?'8':'5'}px ${color}88;"></div></div>`,
          className: '',
          iconSize: [tap, tap],
          iconAnchor: [tap/2, tap/2],
        }),
        zIndexOffset: isSamle ? 1200 : 1000,
        interactive: true,
      });

      // Rich popup — เหมือนสถานีน้ำประปา
      marker.bindPopup(buildRwPopupHtml(sid, st, d, history), {
        maxWidth: Math.min(400, window.innerWidth - 20),
        minWidth: Math.min(280, window.innerWidth - 30),
        className: 'pk-pop',
        autoPan: true,
        autoPanPaddingTopLeft: [10, 80],
        autoPanPaddingBottomRight: [10, 40],
        keepInView: false,
      });

      // Label — แสดงรหัส + ชื่อเต็ม (pointer-events:none ใน CSS)
      marker.bindTooltip(`${sid} ${st.name}`, {
        permanent: true, direction: 'top', offset: [0, -14],
        className: 'rw-label',
      });

      _rwLayerGroup.addLayer(marker);
    });
  }

  // ── 6. River EC contour (polyline along river with EC gradient) ──────
  // rev19: เส้นแม่น้ำเจ้าพระยาจริง 81 waypoints (วัดบ้านแป้ง → อ่าวไทย)
  const CHAO_PHRAYA_RIVER = [
    [14.23814,100.57665],[14.23299,100.57440],[14.22151,100.57216],[14.21479,100.57053],
    [14.20192,100.56358],[14.19460,100.55542],[14.19242,100.54460],[14.20212,100.51296],
    [14.20034,100.50745],[14.19361,100.50438],[14.15462,100.51234],[14.12671,100.52439],
    [14.11206,100.54909],[14.10097,100.54787],[14.08474,100.52541],[14.07602,100.52419],
    [14.06751,100.53133],[14.05206,100.55215],[14.04097,100.55399],[14.04124,100.55337],
    [14.03017,100.54225],[14.02331,100.53604],[14.01015,100.53720],[14.00048,100.53965],
    [13.99460,100.53503],[13.98858,100.52825],[13.97947,100.52580],[13.97219,100.52883],
    [13.96042,100.53807],[13.95202,100.53821],[13.94557,100.53186],[13.94347,100.51540],
    [13.94095,100.50385],[13.92147,100.49851],[13.91433,100.49159],[13.91839,100.47311],
    [13.91657,100.46777],[13.91013,100.46676],[13.90438,100.47080],[13.90060,100.48264],
    [13.89836,100.48942],[13.89121,100.49000],[13.87313,100.47571],[13.85884,100.47787],
    [13.84959,100.48682],[13.81550,100.50740],[13.81367,100.51435],[13.80650,100.51779],
    [13.79483,100.51358],[13.78074,100.50217],[13.75915,100.48852],[13.74865,100.48800],
    [13.73981,100.49521],[13.73622,100.50774],[13.72163,100.51289],[13.70963,100.50508],
    [13.70020,100.49187],[13.69612,100.49015],[13.69111,100.49144],[13.68394,100.51384],
    [13.67118,100.53281],[13.67101,100.54551],[13.68219,100.55220],[13.69870,100.55178],
    [13.70646,100.55641],[13.69954,100.57881],[13.69128,100.58800],[13.68377,100.58903],
    [13.67218,100.58113],[13.65667,100.56285],[13.66076,100.54233],[13.65659,100.53504],
    [13.64291,100.53478],[13.62497,100.54422],[13.61113,100.56637],[13.61029,100.58619],
    [13.59703,100.59246],[13.58260,100.58559],[13.56866,100.57735],[13.54955,100.58422],
    [13.53520,100.59744],
  ];

  function drawRwContour() {
    if (_rwContourLayer) _rwLayerGroup.removeLayer(_rwContourLayer);
    _rwContourLayer = L.layerGroup();

    // ── เส้นแม่น้ำเจ้าพระยา (สีน้ำเงินเข้ม สวย) ──────────────────────
    // Outer glow
    const riverGlow = L.polyline(CHAO_PHRAYA_RIVER, {
      color: '#1a3a6a',
      weight: 12,
      opacity: 0.15,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    });
    _rwContourLayer.addLayer(riverGlow);

    // ขอบขาว
    const riverBorder = L.polyline(CHAO_PHRAYA_RIVER, {
      color: '#c8daf0',
      weight: 7,
      opacity: 0.4,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    });
    _rwContourLayer.addLayer(riverBorder);

    // เส้นหลัก สีน้ำเงินเข้ม
    const riverMain = L.polyline(CHAO_PHRAYA_RIVER, {
      color: '#1a3a6a',
      weight: 4,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    });
    riverMain.bindTooltip('แม่น้ำเจ้าพระยา', { sticky: true, className: 'rw-label' });
    _rwContourLayer.addLayer(riverMain);

    // ── EC contour ทับเส้นแม่น้ำ (สีตาม EC ถ้ามีข้อมูล) ─────────────
    const riverOrder = ['T3','S1','S3','S4','T4','S7','T1','S6','T2'];
    const pts = [];
    riverOrder.forEach(sid => {
      const st = RAW_WATER_STATIONS[sid];
      const d = _rwData[sid];
      if (st && d && d.ec != null) {
        pts.push({ lat: st.lat, lon: st.lon, ec: d.ec, sid });
      }
    });

    if (pts.length >= 2) {
      function dist2(a, b) { return (a[0]-b[0])**2 + (a[1]-b[1])**2; }

      const stnRiverIdx = pts.map(p => {
        let minD = 1e9, bestI = 0;
        CHAO_PHRAYA_RIVER.forEach((rp, i) => {
          const d = dist2([p.lat, p.lon], rp);
          if (d < minD) { minD = d; bestI = i; }
        });
        return bestI;
      });

      for (let i = 0; i < CHAO_PHRAYA_RIVER.length - 1; i++) {
        let beforeIdx = 0, afterIdx = pts.length - 1;
        for (let s = 0; s < pts.length; s++) {
          if (stnRiverIdx[s] <= i) beforeIdx = s;
        }
        for (let s = pts.length - 1; s >= 0; s--) {
          if (stnRiverIdx[s] >= i) afterIdx = s;
        }

        const sA = pts[beforeIdx], sB = pts[afterIdx];
        const riA = stnRiverIdx[beforeIdx], riB = stnRiverIdx[afterIdx];
        const t = riA === riB ? 0 : (i - riA) / (riB - riA);
        const ec = sA.ec + (sB.ec - sA.ec) * Math.max(0, Math.min(1, t));
        const color = rwEcColor(ec);

        const seg = L.polyline([CHAO_PHRAYA_RIVER[i], CHAO_PHRAYA_RIVER[i + 1]], {
          color: color,
          weight: 5,
          opacity: 0.45,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
        });
        _rwContourLayer.addLayer(seg);
      }
    }

    _rwLayerGroup.addLayer(_rwContourLayer);
  }

  // ── 7. API Fetch ────────────────────────────────────────────────────
  async function fetchRawWaterData() {
    try {
      console.log('[RawWater] Fetching API...');
      const resp = await fetch(RAW_WATER_API);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const records = json.data || [];
      console.log(`[RawWater] API returned ${records.length} records`);

      // หาค่าล่าสุดของแต่ละสถานี
      const latest = {};
      records.forEach(r => {
        const sid = r.stn_id;
        if (!latest[sid] || r.datetimes > latest[sid].datetimes) {
          latest[sid] = r;
        }
      });

      // อัปเดต _rwData
      Object.entries(latest).forEach(([sid, r]) => {
        _rwData[sid] = {
          ec: r.conducted,
          temp: r.temp,
          tds: r.tds,
          salinity: r.salinity,
          ph: r.ph,
          turbid: r.turbid,
          time: r.datetimes,
        };
      });

      // rev21: populate _rwHistory สำหรับ EC trend chart ใน popup
      // เริ่มจาก API records (อาจมีแค่ snapshot ล่าสุด)
      records.forEach(r => {
        const sid = r.stn_id;
        if (r.conducted == null || r.conducted <= 0) return;
        if (!_rwHistory[sid]) _rwHistory[sid] = [];
        const ts = new Date(r.datetimes).getTime();
        if (!ts || isNaN(ts)) return;
        if (!_rwHistory[sid].find(h => h.ts === ts)) {
          _rwHistory[sid].push({ ec: r.conducted, ts });
        }
      });

      // rev21: ดึง history เพิ่มจาก Firebase (ที่สะสมไว้ทุก 10 นาที)
      if (window._fbReady && window._fb && window._fbGet && window._fbRef) {
        const sevenDaysAgo = Date.now() - 168 * 3600000; // rev22: ขยายเป็น 7 วัน
        for (const sid of Object.keys(RAW_WATER_STATIONS)) {
          try {
            const fbPath = `history/raw_${sid.replace(/\//g,'-')}`;
            const snap = await window._fbGet(window._fbRef(window._fb, fbPath));
            const val = snap.val ? snap.val() : snap;
            if (val && typeof val === 'object') {
              if (!_rwHistory[sid]) _rwHistory[sid] = [];
              Object.values(val).forEach(rec => {
                if (!rec || rec.ec == null || rec.ec <= 0) return;
                const ts = rec.ts || 0;
                if (ts < sevenDaysAgo) return; // เฉพาะ 2 วันล่าสุด
                if (!_rwHistory[sid].find(h => h.ts === ts)) {
                  _rwHistory[sid].push({ ec: rec.ec, ts });
                }
              });
            }
          } catch(e) { /* ignore per-station errors */ }
        }
        // sort & limit
        Object.keys(_rwHistory).forEach(sid => {
          _rwHistory[sid].sort((a,b) => a.ts - b.ts);
          if (_rwHistory[sid].length > 1008) _rwHistory[sid] = _rwHistory[sid].slice(-1008);
        });
        console.log('[RawWater] ✅ Firebase history loaded:', Object.entries(_rwHistory).map(([k,v]) => `${k}:${v.length}`).join(', '));
        // rev22: update global reference
        window._rawWaterHistory = _rwHistory;
      }

      console.log(`[RawWater] ✅ ${Object.keys(latest).length} stations updated`);

      // ── rev19: บันทึก EC น้ำดิบลง Firebase ────────────────────────────
      if (window._fbReady && window._fb) {
        try {
          const now = Date.now();
          for (const [sid, r] of Object.entries(latest)) {
            if (r.conducted == null || r.conducted <= 0) continue;
            const ts = new Date(r.datetimes).getTime() || now;
            const fbKey = `history/raw_${sid.replace(/\//g,'-')}/${ts}`;
            await window._fbSet(
              window._fbRef(window._fb, fbKey),
              { ec: r.conducted, temp: r.temp || null, ts: ts }
            );
          }
          console.log('[RawWater] ✅ saved EC to Firebase');
        } catch(e) {
          console.warn('[RawWater] Firebase save error:', e.message);
        }
      }

      // Rebuild markers + contour
      if (layers.rawwater) {
        createRwMarkers();
        drawRwContour();
      }

      // rev19: rebuild main station markers เพื่อให้ SP01-SP05 popup ใช้ข้อมูลน้ำดิบ
      if (typeof buildMarkers === 'function') buildMarkers();

    } catch (e) {
      console.warn('[RawWater] API fetch failed:', e.message);
    }
  }

  // ── 8. Layer toggle integration ─────────────────────────────────────
  const _origToggle = window.toggleLayer;
  window.toggleLayer = function(name) {
    if (name === 'rawwater') {
      layers.rawwater = !layers.rawwater;
      const el = document.getElementById('t-rawwater');
      if (el) el.className = layers.rawwater ? 'tog on' : 'tog off';

      if (layers.rawwater) {
        if (!_rwLayerGroup) _rwLayerGroup = L.layerGroup();
        _rwLayerGroup.addTo(map);
        createRwMarkers();
        drawRwContour();
        // เริ่ม fetch ถ้ายังไม่มีข้อมูล
        if (Object.keys(_rwData).length === 0) fetchRawWaterData();
        // Auto-refresh ทุก 10 นาที
        if (!_rwFetchTimer) _rwFetchTimer = setInterval(fetchRawWaterData, 600000);
      } else {
        if (_rwLayerGroup) _rwLayerGroup.remove();
        if (_rwFetchTimer) { clearInterval(_rwFetchTimer); _rwFetchTimer = null; }
      }
      return;
    }
    if (_origToggle) _origToggle(name);
  };

  // ── 9. CSS สำหรับ label ─────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .rw-label {
      background: rgba(26,58,96,0.85) !important;
      color: #fff !important;
      border: none !important;
      border-radius: 3px !important;
      padding: 1px 4px !important;
      font-size: 9px !important;
      font-weight: 700 !important;
      font-family: 'JetBrains Mono', monospace !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3) !important;
      pointer-events: none !important;
    }
    .rw-label::before { display: none !important; }
  `;
  document.head.appendChild(style);

  // ── 10. Initial fetch เมื่อ page load (ไม่ต้องรอ toggle) ────────────
  // Pre-fetch เพื่อให้ข้อมูลพร้อมเมื่อ user toggle on
  setTimeout(fetchRawWaterData, 3000);

  // ══════════════════════════════════════════════════════════════════════
  // ── 11. คลองประปา สำแล → บางเขน (rev19) ───────────────────────────
  // เส้นทางน้ำดิบ: travel time 13 ชม. → forecast EC ที่บางเขน
  // ══════════════════════════════════════════════════════════════════════

  const CANAL_WAYPOINTS = [
    [14.04061, 100.55608],  // สถานีสูบน้ำดิบสำแล
    [14.03932, 100.55777],
    [14.03547, 100.55977],
    [14.03175, 100.56105],
    [14.02826, 100.56168],
    [14.02445, 100.56225],
    [14.01995, 100.56301],
    [14.01235, 100.56414],  // ปทุมธานี
    [14.00092, 100.56584],
    [13.98047, 100.56988],
    [13.97081, 100.57237],  // ปากเกร็ด
    [13.94892, 100.56696],
    [13.91859, 100.55985],  // หลักสี่
    [13.89578, 100.55459],
    [13.88517, 100.55221],  // ใกล้โรงงานผลิตน้ำบางเขน
    [13.87791, 100.55039],  // โรงงานผลิตน้ำบางเขน (ปลายคลองประปา)
  ];

  const CANAL_TRAVEL_HOURS = 13; // เวลาเดินทางน้ำดิบ สำแล→บางเขน

  let _canalLayer = null;
  let _canalForecastLayer = null;

  function drawCanalLine() {
    if (_canalLayer) _rwLayerGroup.removeLayer(_canalLayer);
    _canalLayer = L.layerGroup();

    // เส้นคลองประปา — เส้นคู่ (glow + main) สวยกว่า
    // Outer glow
    const canalGlow = L.polyline(CANAL_WAYPOINTS, {
      color: '#40a0ff',
      weight: 8,
      opacity: 0.2,
      lineCap: 'round',
      lineJoin: 'round',
    });
    _canalLayer.addLayer(canalGlow);

    // Main line (ขอบขาว)
    const canalBorder = L.polyline(CANAL_WAYPOINTS, {
      color: '#ffffff',
      weight: 5,
      opacity: 0.6,
      lineCap: 'round',
      lineJoin: 'round',
    });
    _canalLayer.addLayer(canalBorder);

    // Inner line (สีน้ำเงินเข้ม เส้นประ)
    const canalLine = L.polyline(CANAL_WAYPOINTS, {
      color: '#1a5090',
      weight: 3,
      opacity: 0.9,
      dashArray: '10, 6',
      lineCap: 'round',
      lineJoin: 'round',
    });
    canalLine.bindTooltip('คลองประปา (สำแล → บางเขน) ~18 km · 13 ชม. + ผลิต 2 + reservoir 2 = 17 ชม.', {
      sticky: true, className: 'rw-label'
    });
    _canalLayer.addLayer(canalLine);

    // จุดต้นทาง (สำแล) — ใหญ่ขึ้น มี pulse
    const startMarker = L.circleMarker(CANAL_WAYPOINTS[0], {
      radius: 8, fillColor: '#1a5090', fillOpacity: 0.9, color: '#fff', weight: 3
    });
    startMarker.bindTooltip('🌊 สำแล (ต้นทางน้ำดิบ)', { permanent: false, direction: 'top' });
    _canalLayer.addLayer(startMarker);

    // จุดปลายทาง (บางเขน) — แดง ใหญ่ขึ้น
    const endMarker = L.circleMarker(CANAL_WAYPOINTS[CANAL_WAYPOINTS.length - 1], {
      radius: 8, fillColor: '#cc0055', fillOpacity: 0.9, color: '#fff', weight: 3
    });
    endMarker.bindTooltip('🏭 โรงงานผลิตน้ำบางเขน', { permanent: false, direction: 'top' });
    _canalLayer.addLayer(endMarker);

    // ป้ายกำกับกลางเส้น
    const midIdx = Math.floor(CANAL_WAYPOINTS.length / 2);
    const midPt = CANAL_WAYPOINTS[midIdx];
    const labelMarker = L.marker(midPt, {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:rgba(26,80,144,0.85);color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;font-family:Sarabun,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);transform:translate(-50%,-50%);">คลองประปา 18 km · 13 ชม.</div>',
        iconSize: [0, 0],
      }),
      interactive: false,
    });
    _canalLayer.addLayer(labelMarker);

    _rwLayerGroup.addLayer(_canalLayer);
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── 11b. คลองประปา บางเขน → สามเสน (rev20) ────────────────────────
  // ══════════════════════════════════════════════════════════════════════

  const CANAL_BK_SS_WAYPOINTS = [
    [13.87943, 100.55085],  // โรงงานผลิตน้ำบางเขน (ต่อจาก CANAL_WAYPOINTS)
    [13.86607, 100.54769],
    [13.83399, 100.54008],
    [13.80029, 100.53219],
    [13.79729, 100.53812],
    [13.79675, 100.53879],
    [13.79456, 100.53926],
    [13.77367, 100.53080],  // โรงงานผลิตน้ำสามเสน
  ];

  let _canalBkSsLayer = null;

  function drawCanalBkSs() {
    if (_canalBkSsLayer) _rwLayerGroup.removeLayer(_canalBkSsLayer);
    _canalBkSsLayer = L.layerGroup();

    // Outer glow
    _canalBkSsLayer.addLayer(L.polyline(CANAL_BK_SS_WAYPOINTS, {
      color: '#8040c0', weight: 8, opacity: 0.15,
      lineCap: 'round', lineJoin: 'round',
    }));

    // ขอบขาว
    _canalBkSsLayer.addLayer(L.polyline(CANAL_BK_SS_WAYPOINTS, {
      color: '#ffffff', weight: 5, opacity: 0.5,
      lineCap: 'round', lineJoin: 'round',
    }));

    // Inner line (สีม่วงน้ำเงิน เส้นประ — แยก visual จากช่วงสำแล→บางเขน)
    const bkssLine = L.polyline(CANAL_BK_SS_WAYPOINTS, {
      color: '#5030a0', weight: 3, opacity: 0.9,
      dashArray: '10, 6', lineCap: 'round', lineJoin: 'round',
    });
    bkssLine.bindTooltip('คลองประปา (บางเขน → สามเสน)', {
      sticky: true, className: 'rw-label',
    });
    _canalBkSsLayer.addLayer(bkssLine);

    // EC overlay สีตามน้ำดิบสำแล
    const samlaData = _rwData['S1'];
    if (samlaData && samlaData.ec) {
      const color = rwEcColor(samlaData.ec);
      _canalBkSsLayer.addLayer(L.polyline(CANAL_BK_SS_WAYPOINTS, {
        color: color, weight: 6, opacity: 0.35,
        lineCap: 'round', lineJoin: 'round',
      }));
    }

    // จุดปลายทาง — โรงงานสามเสน
    const ssMarker = L.circleMarker(CANAL_BK_SS_WAYPOINTS[CANAL_BK_SS_WAYPOINTS.length - 1], {
      radius: 8, fillColor: '#5030a0', fillOpacity: 0.9, color: '#fff', weight: 3,
    });
    ssMarker.bindTooltip('🏭 โรงงานผลิตน้ำสามเสน', { permanent: false, direction: 'top' });
    _canalBkSsLayer.addLayer(ssMarker);

    // ป้ายกำกับกลางเส้น
    const midPt = CANAL_BK_SS_WAYPOINTS[Math.floor(CANAL_BK_SS_WAYPOINTS.length / 2)];
    _canalBkSsLayer.addLayer(L.marker(midPt, {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:rgba(80,48,160,0.88);color:#fff;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;font-family:Sarabun,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);transform:translate(-50%,-50%);">บางเขน → สามเสน</div>',
        iconSize: [0, 0],
      }),
      interactive: false,
    }));

    _rwLayerGroup.addLayer(_canalBkSsLayer);
  }

  function buildCanalForecast() {
    if (_canalForecastLayer) _rwLayerGroup.removeLayer(_canalForecastLayer);
    _canalForecastLayer = L.layerGroup();

    const samlaData = _rwData['S1'];
    if (!samlaData || !samlaData.ec) return;

    const ecNow = samlaData.ec;

    // เส้นคลองเปลี่ยนสีตาม EC ปัจจุบัน
    const color = rwEcColor(ecNow);
    const animLine = L.polyline(CANAL_WAYPOINTS, {
      color: color,
      weight: 6,
      opacity: 0.5,
    });
    animLine.bindTooltip(`คลองประปา EC=${ecNow} µS/cm → ถึงบางเขน +${CANAL_TRAVEL_HOURS} ชม.`, {
      sticky: true, className: 'rw-label'
    });
    _canalForecastLayer.addLayer(animLine);

    _rwLayerGroup.addLayer(_canalForecastLayer);

    // ── rev19: เพิ่ม EC forecast จากสำแลเข้า popup ของ SP01-SP05 ──
    // โดย set global variable ให้ buildEcForecastChart ดึงค่าจากน้ำดิบได้
    window._rawWaterEc = {
      ec: ecNow,
      time: samlaData.time,
      travelHours: CANAL_TRAVEL_HOURS,
      source: 'สำแล (S1)',
    };
    window._rawWaterHistory = _rwHistory; // rev22: expose history for forecast chart

    // ซ่อนกราฟค่าจริงของ SP01-SP05 (ใช้กราฟ forecast แทน)
    if (!document.getElementById('rw-hide-bangkhen-css')) {
      const css = document.createElement('style');
      css.id = 'rw-hide-bangkhen-css';
      css.textContent = '.bangkhen-source-chart { display: none !important; }';
      document.head.appendChild(css);
    }
  }

  // Hook เข้ากับ createRwMarkers เดิม
  const _origCreateRwMarkers = createRwMarkers;
  createRwMarkers = function() {
    _origCreateRwMarkers();
    drawCanalLine();
    drawCanalBkSs();
    buildCanalForecast();
  };

})();
// ═══════════ [11/11] RAW WATER STATIONS + ALERTS + BOOT — แม่กลอง/เจ้าพระยา, แจ้งเตือน, init สุดท้าย ═══════════
(function() {
  'use strict';

  // ── 1. สถานีน้ำดิบฝั่งตะวันตก (แม่กลอง) ──────────────────────────
  const MK_STATIONS = {
    'T5':  { name: 'แม่น้ำแควใหญ่',     lat: 14.0311914, lon: 99.5206759 },
    'S16': { name: 'แม่น้ำแควน้อย',     lat: 13.9240728, lon: 99.4349268 },
    'S11': { name: 'เขื่อนแม่กลอง',     lat: 13.971605,  lon: 99.577817 },
    'S9':  { name: 'ท่าม่วง',           lat: 13.9746946, lon: 99.6292811 },
    'S12': { name: 'บางเลน กม.35',      lat: 14.010675,  lon: 100.181814 },
    'S13': { name: 'คลองตะวันตก กม.54', lat: 14.036174,  lon: 100.017652 },
    'S14': { name: 'คลองตะวันตก กม.14', lat: 13.910352,  lon: 100.336583 },
  };

  // ── 2. API endpoint (เดียวกับที่ให้มา) ────────────────────────────
  const MK_API = 'https://bigdata.mwa.co.th/data-service/internal/big-data/api/v1/783f543c-666c-35b4-795b-40dd2446b291/7e911fa9-0a52-970a-eef5-2170851f3530/data?token=3XSOeKch6WiCXcw37EWhVX0Z0mPLncwmwTY6fgkm6tVCaIuNU11IiRRydPCUadnFGvfV2mPPrLc6hUk87JtA6rJSPVKNEr0HhJOuRPQ0CR3v3kaFIzk71Bm1N8uqST2b';

  // ── 3. State ────────────────────────────────────────────────────────
  let _mkLayerGroup = null;
  let _mkContourLayer = null;
  let _mkData = {};   // stn_id → { ec, temp, tds, salinity, ph, turbid, deo, nh4, depth, time }
  let _mkFetchTimer = null;
  let _mkApiFetched = false; // rev29.1: true เมื่อ API หรือ Firebase live ดึงค่าจริงสำเร็จ

  // Fallback data จาก API snapshot (ค่าล่าสุด 2026-04-08/09)
  const MK_FALLBACK = {
    'S11': { ec:200, temp:29.00, tds:130, salinity:0.10, deo:5.00, ph:7.50, turbid:3.5, time:'2026-04-29T14:50' },
    'T5':  { ec:244, temp:28.39, tds:170, salinity:0.12, deo:3.26, depth:0.64, ph:7.55, turbid:3.2, time:'2026-04-13T14:50' },
    'S16': { ec:153, temp:27.18, tds:104, salinity:0.07, deo:7.30, ph:7.47, turbid:17.0, time:'2026-04-13T14:50' },
    'S9':  { ec:179, temp:29.78, tds:130, salinity:0.09, deo:5.12, ph:7.50, turbid:4.8, time:'2026-04-13T14:50' },
    'S12': { ec:166, temp:32.00, tds:120, salinity:0.09, deo:9.00, ph:8.20, turbid:4.5, time:'2026-04-13T14:50' },
    'S13': { ec:166, temp:32.37, tds:120, salinity:0.09, deo:9.37, ph:8.40, turbid:4.0, time:'2026-04-13T14:50' },
    'S14': { ec:166, temp:32.00, tds:120, salinity:0.09, deo:9.00, ph:8.20, turbid:4.5, time:'2026-04-13T14:50' },
  };
  // Pre-load fallback ทันที
  Object.entries(MK_FALLBACK).forEach(([sid, d]) => { _mkData[sid] = {...d}; });

  // ── 4. EC Color scale (reuse ฝั่งตะวันออก) ─────────────────────────
  function mkEcColor(ec) {
    if (ec == null || ec <= 0) return 'rgba(150,150,150,0.6)';
    if (ec < 200) return 'rgba(40,80,200,0.75)';
    if (ec < 400) return 'rgba(50,190,170,0.75)';
    if (ec < 600) return 'rgba(120,200,80,0.7)';
    if (ec < 800) return 'rgba(240,170,20,0.75)';
    if (ec < 1000) return 'rgba(220,80,16,0.8)';
    return 'rgba(160,0,80,0.85)';
  }

  function mkEcText(ec) {
    if (ec == null) return '—';
    if (ec < 200) return 'ดีมาก';
    if (ec < 400) return 'ดี';
    if (ec < 600) return 'ปกติ';
    if (ec < 800) return 'สูง ⚠';
    if (ec < 1000) return 'สูงมาก ⚠';
    return 'วิกฤต (น้ำเค็ม) 🔴';
  }

  // ── 5. Build rich popup with mini SVG chart ─────────────────────────
  function buildMkPopupHtml(sid, st, d, history) {
    const ec = d ? d.ec : null;
    const time = d ? d.time : null;
    const ecStr = ec != null ? `${ec} µS/cm` : 'ไม่มีข้อมูล';
    const timeStr = time ? new Date(time).toLocaleString('th-TH', {hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}) : '—';
    const tempStr = d && d.temp != null ? `${d.temp}°C` : '—';
    const phStr = d && d.ph != null ? `${d.ph}` : '—';
    const turbStr = d && d.turbid != null ? `${d.turbid} NTU` : '—';
    const deoStr = d && d.deo != null ? `${d.deo} mg/L` : '—';
    const nh4Str = d && d.nh4 != null ? `${d.nh4} mg/L` : '—';
    const salStr = d && d.salinity != null ? `${d.salinity} ppt` : '—';
    const tdsStr = d && d.tds != null ? `${d.tds} mg/L` : '—';
    const depthStr = d && d.depth != null ? `${d.depth} m` : '—';
    const _dk = document.body.classList.contains('dark');

    let chartSvg = '';
    if (history && history.length >= 2) {
      const W = 320, H = 100, pad = 28, padR = 10, padT = 12, padB = 22;
      const now = Date.now();
      const twoDaysAgo = now - 48 * 3600000;
      const sorted = [...history].filter(r => r.ts >= twoDaysAgo).sort((a,b) => a.ts - b.ts);
      if (sorted.length >= 2) {
      const minT = sorted[0].ts, maxT = sorted[sorted.length-1].ts;
      const ecVals = sorted.map(r => r.ec);
      const minEc = Math.min(...ecVals), maxEc = Math.max(...ecVals);
      const rangeEc = Math.max(maxEc - minEc, 10);
      const rangeT = Math.max(maxT - minT, 1);

      const x = (ts) => pad + (ts - minT) / rangeT * (W - pad - padR);
      const y = (v) => padT + (1 - (v - (minEc - rangeEc*0.1)) / (rangeEc * 1.2)) * (H - padT - padB);

      let pathD = sorted.map((r,i) => `${i===0?'M':'L'}${x(r.ts).toFixed(1)},${y(r.ec).toFixed(1)}`).join(' ');
      let areaD = pathD + ` L${x(sorted[sorted.length-1].ts).toFixed(1)},${(H-padB).toFixed(1)} L${x(sorted[0].ts).toFixed(1)},${(H-padB).toFixed(1)} Z`;

      const bgFill = _dk ? 'rgba(20,25,50,0.85)' : '#f5f8ff';
      const gridColor = _dk ? 'rgba(255,255,255,0.1)' : '#e0e8f0';
      const textColor = _dk ? '#9090b8' : '#888';
      const lineColor = '#1a5090';
      const fillColor = _dk ? 'rgba(40,100,200,0.15)' : 'rgba(40,100,200,0.1)';

      chartSvg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;margin:6px auto 2px;">
        <rect x="0" y="0" width="${W}" height="${H}" rx="6" fill="${bgFill}"/>
        <line x1="${pad}" y1="${H-padB}" x2="${W-padR}" y2="${H-padB}" stroke="${gridColor}" stroke-width="1"/>
        <line x1="${pad}" y1="${padT}" x2="${pad}" y2="${H-padB}" stroke="${gridColor}" stroke-width="1"/>
        <path d="${areaD}" fill="${fillColor}"/>
        <path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${sorted.length <= 30 ? sorted.map(r => `<circle cx="${x(r.ts).toFixed(1)}" cy="${y(r.ec).toFixed(1)}" r="2.5" fill="${lineColor}" stroke="#fff" stroke-width="1"/>`).join('') : ''}
        <text x="${pad}" y="${H-4}" font-size="8" fill="${textColor}" font-family="JetBrains Mono,monospace">${new Date(minT).toLocaleString('th-TH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</text>
        <text x="${W-padR}" y="${H-4}" font-size="8" fill="${textColor}" font-family="JetBrains Mono,monospace" text-anchor="end">${new Date(maxT).toLocaleString('th-TH',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</text>
        <text x="${pad-3}" y="${padT+8}" font-size="8" fill="${textColor}" font-family="JetBrains Mono,monospace" text-anchor="end">${maxEc}</text>
        <text x="${pad-3}" y="${H-padB}" font-size="8" fill="${textColor}" font-family="JetBrains Mono,monospace" text-anchor="end">${minEc}</text>
        <text x="${W/2}" y="${padT-1}" font-size="8" fill="${_dk?'#6090cc':'#4060a0'}" font-family="Sarabun,sans-serif" font-weight="700" text-anchor="middle">EC ย้อนหลัง 2 วัน (${sorted.length} จุด)</text>
      </svg>`;
      }
    }

    return `
      <div class="lpop" style="font-family:'Sarabun',sans-serif;min-width:220px;max-width:340px;">
        <h4 style="font-size:14px;color:${_dk?'#e8e8ff':'#1a3a60'};border-bottom:1.5px solid ${_dk?'rgba(255,255,255,0.08)':'#e0e8f0'};padding-bottom:6px;">
          🏔️ ${st.name}
        </h4>
        <div style="font-size:10px;color:#888;">${sid} · น้ำดิบ · ลุ่มน้ำแม่กลอง</div>
        <div style="font-size:22px;font-weight:700;color:${_dk?'#80c0ff':'#1a5090'};margin:6px 0 2px;">⚡ ${ecStr}</div>
        <div style="font-size:11px;color:${ec!=null?(_dk?'#4ecca3':'#1a6a40'):'#999'};font-weight:600;">${mkEcText(ec)}</div>
        <div style="font-size:9px;color:#888;margin-top:4px;">🕐 ${timeStr}</div>
        <div style="border-top:1px solid ${_dk?'rgba(255,255,255,0.06)':'#e8f0ff'};margin:8px 0 6px;"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;font-size:11px;">
          <div class="pr"><span>🌡 อุณหภูมิ</span><span class="pv">${tempStr}</span></div>
          <div class="pr"><span>pH</span><span class="pv">${phStr}</span></div>
          <div class="pr"><span>🌫 ความขุ่น</span><span class="pv">${turbStr}</span></div>
          <div class="pr"><span>💧 DO</span><span class="pv">${deoStr}</span></div>
          <div class="pr"><span>🧪 NH₄</span><span class="pv">${nh4Str}</span></div>
          <div class="pr"><span>🧂 Salinity</span><span class="pv">${salStr}</span></div>
          <div class="pr"><span>TDS</span><span class="pv">${tdsStr}</span></div>
          <div class="pr"><span>📏 ระดับน้ำ</span><span class="pv">${depthStr}</span></div>
        </div>
        ${chartSvg}
      </div>
    `;
  }

  // ── 6. Marker creation ──────────────────────────────────────────────
  let _mkContour = null;
  let _mkHistory = {}; // stn_id → [{ec, ts}, ...]

  function createMkMarkers() {
    if (!_mkLayerGroup) _mkLayerGroup = L.layerGroup();
    _mkLayerGroup.clearLayers();

    Object.entries(MK_STATIONS).forEach(([sid, st]) => {
      const d = _mkData[sid];
      const ec = d ? d.ec : null;

      // rev22: S11 เขื่อนแม่กลอง = ต้นทาง ใหญ่+สี EC, อื่นๆ = เล็ก+สีเทาเขียวเดียวกัน
      const isMain = (sid === 'S11');
      const sz  = isMain ? 16 : 5;
      const tap = isMain ? 44 : 24;
      const color = isMain ? mkEcColor(ec) : '#0a8070';
      const marker = L.marker([st.lat, st.lon], {
        icon: L.divIcon({
          html: `<div style="width:${tap}px;height:${tap}px;display:flex;align-items:center;justify-content:center;cursor:pointer;"><div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${color};border:${isMain?'2.5':'1.5'}px solid rgba(255,255,255,.${isMain?'95':'7'});box-shadow:0 ${isMain?'2':'1'}px ${isMain?'8':'3'}px ${color}${isMain?'88':'44'};"></div></div>`,
          className: '',
          iconSize: [tap, tap],
          iconAnchor: [tap/2, tap/2],
        }),
        zIndexOffset: isMain ? 1200 : 800,
        interactive: true,
      });

      // Rich popup
      const history = _mkHistory[sid] || [];
      marker.bindPopup(buildMkPopupHtml(sid, st, d, history), {
        maxWidth: Math.min(400, window.innerWidth - 20),
        minWidth: Math.min(280, window.innerWidth - 30),
        className: 'pk-pop',
        autoPan: true,
        autoPanPaddingTopLeft: [10, 80],
        autoPanPaddingBottomRight: [10, 40],
        keepInView: false,
      });

      // Label — S11 แสดงรหัส+ชื่อ, อื่นๆ แสดงแค่รหัส เล็กลง
      if (isMain) {
        marker.bindTooltip(`${sid} ${st.name}`, {
          permanent: true, direction: 'top', offset: [0, -14],
          className: 'mk-label',
        });
      } else {
        marker.bindTooltip(`${sid}`, {
          permanent: true, direction: 'top', offset: [0, -8],
          className: 'mk-label mk-label-sm',
        });
      }

      _mkLayerGroup.addLayer(marker);
    });

    // Draw river line
    drawMkRiver();
  }

  // ── 7. แม่น้ำแม่กลอง waypoints (เขื่อนแม่กลอง → ท่าม่วง → ลงใต้) ──
  const MAE_KLONG_RIVER = [
    [13.97161, 99.57782],  // เขื่อนแม่กลอง (S11)
    [13.97469, 99.62928],  // ท่าม่วง
    [13.9600, 99.6450],
    [13.9400, 99.6550],
    [13.9100, 99.6600],
    [13.8700, 99.6550],
    [13.8300, 99.6400],
    [13.7900, 99.6200],
    [13.7500, 99.6000],    // ราชบุรี
    [13.7000, 99.5800],
    [13.6500, 99.5550],
    [13.6000, 99.5300],
    [13.5500, 99.5050],
    [13.5000, 99.4800],    // สมุทรสงคราม
    [13.4500, 99.4550],
    [13.4050, 99.4350],    // ปากอ่าว
  ];

  // แม่น้ำแควใหญ่ waypoints (T5 → จุดบรรจบเขื่อน)
  const KWAI_YAI_RIVER = [
    [14.03119, 99.52068],  // T5 แม่น้ำแควใหญ่
    [14.01500, 99.53500],
    [14.00000, 99.54800],
    [13.98500, 99.56000],
    [13.97161, 99.57782],  // จุดบรรจบ → เขื่อนแม่กลอง
  ];

  // แม่น้ำแควน้อย waypoints (S16 → จุดบรรจบเขื่อน)
  const KWAI_NOI_RIVER = [
    [13.92407, 99.43493],  // S16 แม่น้ำแควน้อย
    [13.93500, 99.46000],
    [13.94500, 99.48500],
    [13.95500, 99.51000],
    [13.96000, 99.53500],
    [13.96500, 99.55500],
    [13.97161, 99.57782],  // จุดบรรจบ → เขื่อนแม่กลอง
  ];

  function drawMkRiver() {
    if (_mkContour) _mkLayerGroup.removeLayer(_mkContour);
    _mkContour = L.layerGroup();

    // === แม่น้ำแม่กลอง ===
    // Outer glow
    _mkContour.addLayer(L.polyline(MAE_KLONG_RIVER, {
      color: '#0a5040', weight: 10, opacity: 0.12, lineCap: 'round', lineJoin: 'round', interactive: false,
    }));
    // Border
    _mkContour.addLayer(L.polyline(MAE_KLONG_RIVER, {
      color: '#c0e8d8', weight: 6, opacity: 0.35, lineCap: 'round', lineJoin: 'round', interactive: false,
    }));
    // Main line
    const mkMain = L.polyline(MAE_KLONG_RIVER, {
      color: '#1a6050', weight: 3.5, opacity: 0.85, lineCap: 'round', lineJoin: 'round', interactive: false,
    });
    mkMain.bindTooltip('แม่น้ำแม่กลอง', { sticky: true, className: 'mk-label' });
    _mkContour.addLayer(mkMain);

    // === แม่น้ำแควใหญ่ ===
    _mkContour.addLayer(L.polyline(KWAI_YAI_RIVER, {
      color: '#0a4050', weight: 8, opacity: 0.1, lineCap: 'round', lineJoin: 'round', interactive: false,
    }));
    _mkContour.addLayer(L.polyline(KWAI_YAI_RIVER, {
      color: '#b0d8e0', weight: 5, opacity: 0.3, lineCap: 'round', lineJoin: 'round', interactive: false,
    }));
    const kwaiMain = L.polyline(KWAI_YAI_RIVER, {
      color: '#1a5070', weight: 3, opacity: 0.8, lineCap: 'round', lineJoin: 'round', interactive: false,
    });
    kwaiMain.bindTooltip('แม่น้ำแควใหญ่', { sticky: true, className: 'mk-label' });
    _mkContour.addLayer(kwaiMain);

    // === แม่น้ำแควน้อย ===
    _mkContour.addLayer(L.polyline(KWAI_NOI_RIVER, {
      color: '#0a4060', weight: 7, opacity: 0.1, lineCap: 'round', lineJoin: 'round', interactive: false,
    }));
    _mkContour.addLayer(L.polyline(KWAI_NOI_RIVER, {
      color: '#b0d0e8', weight: 4.5, opacity: 0.3, lineCap: 'round', lineJoin: 'round', interactive: false,
    }));
    const knoiMain = L.polyline(KWAI_NOI_RIVER, {
      color: '#1a4070', weight: 2.5, opacity: 0.8, lineCap: 'round', lineJoin: 'round', interactive: false,
    });
    knoiMain.bindTooltip('แม่น้ำแควน้อย', { sticky: true, className: 'mk-label' });
    _mkContour.addLayer(knoiMain);

    // === EC contour overlay (สีตาม EC interpolated) ===
    const s11d = _mkData['S11'];
    if (s11d && s11d.ec != null) {
      for (let i = 0; i < MAE_KLONG_RIVER.length - 1; i++) {
        const t = i / Math.max(MAE_KLONG_RIVER.length - 1, 1);
        // EC อาจเพิ่มขึ้นเล็กน้อยตามที่น้ำไหลไกลจากเขื่อน (mix with runoff)
        const ec = s11d.ec * (1 + t * 0.15);
        const seg = L.polyline([MAE_KLONG_RIVER[i], MAE_KLONG_RIVER[i+1]], {
          color: mkEcColor(ec), weight: 5, opacity: 0.4, lineCap: 'round', lineJoin: 'round', interactive: false,
        });
        _mkContour.addLayer(seg);
      }
    }

    const t5d = _mkData['T5'];
    if (t5d && t5d.ec != null) {
      for (let i = 0; i < KWAI_YAI_RIVER.length - 1; i++) {
        const t = i / Math.max(KWAI_YAI_RIVER.length - 1, 1);
        const ec = t5d.ec * (1 + t * 0.05);
        const seg = L.polyline([KWAI_YAI_RIVER[i], KWAI_YAI_RIVER[i+1]], {
          color: mkEcColor(ec), weight: 4, opacity: 0.35, lineCap: 'round', lineJoin: 'round', interactive: false,
        });
        _mkContour.addLayer(seg);
      }
    }

    // ป้ายกำกับ
    const midMk = MAE_KLONG_RIVER[Math.floor(MAE_KLONG_RIVER.length/2)];
    _mkContour.addLayer(L.marker(midMk, {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:rgba(26,96,80,0.88);color:#fff;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;font-family:Sarabun,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);transform:translate(-50%,-50%);">แม่น้ำแม่กลอง</div>',
        iconSize: [0, 0],
      }),
      interactive: false,
    }));

    const midKw = KWAI_YAI_RIVER[1];
    _mkContour.addLayer(L.marker(midKw, {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:rgba(26,80,112,0.88);color:#fff;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;font-family:Sarabun,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);transform:translate(-50%,-50%);">แควใหญ่</div>',
        iconSize: [0, 0],
      }),
      interactive: false,
    }));

    const midKn = KWAI_NOI_RIVER[1];
    _mkContour.addLayer(L.marker(midKn, {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:rgba(26,64,112,0.88);color:#fff;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;font-family:Sarabun,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);transform:translate(-50%,-50%);">แควน้อย</div>',
        iconSize: [0, 0],
      }),
      interactive: false,
    }));

    _mkLayerGroup.addLayer(_mkContour);
  }

  // ══════════════════════════════════════════════════════════════════════
  // ── 12. คลองประปาฝั่งตะวันตก (แม่กลอง → โรงงานผลิตน้ำมหาสวัสดิ์) ──
  // จากภาพแผนที่ กปน.: เขื่อนแม่กลอง → จุดเก็บ กม.80 → กม.56 →
  //   กม.35.5 → มะสง กม.19 → มหาสวัสดิ์
  // ══════════════════════════════════════════════════════════════════════

  const CANAL_WEST_WAYPOINTS = [
    // ── จากเขื่อนแม่กลอง → ท่าม่วง → คลองส่งน้ำ → กม.54 ──
    [13.97161, 99.57782],   // เขื่อนแม่กลอง (S11)
    [13.97469, 99.62928],   // ท่าม่วง
    [13.9800, 99.6600],
    [13.9900, 99.7000],
    [14.0000, 99.7400],
    [14.0100, 99.7800],
    [14.0200, 99.8200],
    [14.0250, 99.8600],
    [14.0300, 99.9000],
    [14.0330, 99.9400],
    [14.0350, 99.9800],
    [14.03617, 100.01765],  // กม. 54
    // ── กม.54 → บางเลน กม.35 ──
    [14.0350, 100.0500],
    [14.0300, 100.0800],
    [14.0250, 100.1100],
    [14.0200, 100.1400],
    [14.01068, 100.18181],  // บางเลน กม.35
    // ── บางเลน กม.35 → คลองตะวันตก กม.14 → มหาสวัสดิ์ ──
    [14.00971, 100.20758],
    [13.98685, 100.24628],
    [13.96000, 100.28000],
    [13.93000, 100.31000],
    [13.91035, 100.33658],  // คลองตะวันตก กม.14
    [13.87143, 100.34950],
    [13.86707, 100.37586],
    [13.81151, 100.40055],  // โรงงานผลิตน้ำมหาสวัสดิ์
  ];

  // จุดสำคัญตามแนวคลอง (สำหรับ marker)
  const CANAL_WEST_POIS = [
    { lat: 13.97161, lon: 99.57782, name: 'เขื่อนแม่กลอง', icon: '🌊', isStart: true },
    { lat: 13.97469, lon: 99.62928, name: 'ท่าม่วง', icon: '📍' },
    { lat: 14.03617, lon: 100.01765, name: 'กม.54', icon: '📍' },
    { lat: 14.01068, lon: 100.18181, name: 'บางเลน กม.35', icon: '📍' },
    { lat: 13.91035, lon: 100.33658, name: 'คลองตะวันตก กม.14', icon: '⚠️', isAlert: true },
    { lat: 13.81151, lon: 100.40055, name: 'มหาสวัสดิ์', icon: '🏭', isFactory: true },
  ];

  let _canalWestLayer = null;

  function drawCanalWest() {
    if (_canalWestLayer) _mkLayerGroup.removeLayer(_canalWestLayer);
    _canalWestLayer = L.layerGroup();

    // Outer glow — สีเขียวน้ำทะเล
    _canalWestLayer.addLayer(L.polyline(CANAL_WEST_WAYPOINTS, {
      color: '#20a080', weight: 8, opacity: 0.18,
      lineCap: 'round', lineJoin: 'round', interactive: false,
    }));

    // ขอบขาว
    _canalWestLayer.addLayer(L.polyline(CANAL_WEST_WAYPOINTS, {
      color: '#ffffff', weight: 5, opacity: 0.55,
      lineCap: 'round', lineJoin: 'round', interactive: false,
    }));

    // Inner line (สีเขียวเข้ม เส้นประ)
    const canalLine = L.polyline(CANAL_WEST_WAYPOINTS, {
      color: '#0a6050', weight: 3, opacity: 0.9,
      dashArray: '10, 6', lineCap: 'round', lineJoin: 'round', interactive: false,
    });
    canalLine.bindTooltip('คลองประปาฝั่งตะวันตก (แม่กลอง → มหาสวัสดิ์)', {
      sticky: true, className: 'mk-label',
    });
    _canalWestLayer.addLayer(canalLine);

    // EC overlay ตามสีน้ำดิบ S11
    const s11d = _mkData['S11'];
    if (s11d && s11d.ec != null) {
      const ecColor = mkEcColor(s11d.ec);
      _canalWestLayer.addLayer(L.polyline(CANAL_WEST_WAYPOINTS, {
        color: ecColor, weight: 6, opacity: 0.4,
        lineCap: 'round', lineJoin: 'round', interactive: false,
      }));
    }

    // จุดสำคัญตามแนวคลอง
    CANAL_WEST_POIS.forEach(poi => {
      const isFactory = poi.isFactory;
      const isAlert = poi.isAlert;
      const isStart = poi.isStart;
      // rev22: จุดเล็กลง สีเดียวกัน
      const fillColor = isFactory ? '#cc0055' : '#0a8070';
      const radius = isFactory ? 5 : isStart ? 4 : 3;

      const m = L.circleMarker([poi.lat, poi.lon], {
        radius: radius,
        fillColor: fillColor,
        fillOpacity: 0.7,
        color: '#fff',
        weight: 1.5,
      });

      // EC info ใน tooltip
      const ecInfo = s11d && s11d.ec != null ? `EC≈${s11d.ec} µS/cm` : '';
      m.bindTooltip(`${poi.icon} ${poi.name}${ecInfo ? ' · ' + ecInfo : ''}`, {
        permanent: false,
        direction: 'top',
        className: isAlert ? 'rw-label' : 'mk-label',
      });

      // Popup สำหรับจุดสำคัญ
      const _dk = document.body.classList.contains('dark');
      m.bindPopup(`
        <div style="font-family:'Sarabun',sans-serif;min-width:160px;">
          <div style="font-weight:700;color:${_dk?'#80c0ff':'#0a5050'};font-size:13px;">${poi.icon} ${poi.name}</div>
          <div style="font-size:10px;color:#888;">คลองประปาฝั่งตะวันตก</div>
          <hr style="margin:5px 0;border:none;border-top:1px solid ${_dk?'rgba(255,255,255,0.08)':'#d0e8e0'};">
          <div style="font-size:11px;color:#555;">EC จากเขื่อนแม่กลอง: <b style="color:${_dk?'#80c0ff':'#0a6050'}">${ecInfo || '—'}</b></div>
          ${s11d && s11d.time ? '<div style="font-size:9px;color:#999;margin-top:3px;">🕐 ข้อมูล: ' + new Date(s11d.time).toLocaleString('th-TH',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}) + '</div>' : ''}
        </div>
      `, { maxWidth: 250, className: 'pk-pop' });

      _canalWestLayer.addLayer(m);
    });

    // ป้ายกำกับกลางเส้น
    const midIdx = Math.floor(CANAL_WEST_WAYPOINTS.length / 2);
    const midPt = CANAL_WEST_WAYPOINTS[midIdx];
    _canalWestLayer.addLayer(L.marker(midPt, {
      icon: L.divIcon({
        className: '',
        html: '<div style="background:rgba(10,96,80,0.88);color:#fff;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;font-family:Sarabun,sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);transform:translate(-50%,-50%);">คลองประปาฝั่ง ตก.</div>',
        iconSize: [0, 0],
      }),
      interactive: false,
    }));

    _mkLayerGroup.addLayer(_canalWestLayer);
  }

  // Hook drawCanalWest เข้ากับ createMkMarkers
  const _origCreateMkMarkers = createMkMarkers;
  createMkMarkers = function() {
    _origCreateMkMarkers();
    drawCanalWest();
  };

  // ── 8. API Fetch ────────────────────────────────────────────────────
  async function fetchMkData() {
    const MAX_RETRY = 3;
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      // rev29.1: MK_API เป็น endpoint แยกจาก RAW_WATER_API (คนละ UUID)
      console.log(`[MaeKlong] Fetching MK API... (attempt ${attempt}/${MAX_RETRY})`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(MK_API, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const records = json.data || [];
      console.log(`[MaeKlong] API returned ${records.length} records`);

      // หาค่าล่าสุดของแต่ละสถานี
      const latest = {};
      records.forEach(r => {
        const sid = r.stn_id;
        if (!MK_STATIONS[sid]) return; // เฉพาะสถานีที่เรารู้จัก
        if (!latest[sid] || r.datetimes > latest[sid].datetimes) {
          latest[sid] = r;
        }
      });

      // อัปเดต _mkData
      Object.entries(latest).forEach(([sid, r]) => {
        _mkData[sid] = {
          ec: r.conducted,
          temp: r.temp,
          tds: r.tds,
          salinity: r.salinity,
          ph: r.ph,
          turbid: r.turbid,
          deo: r.deo,
          nh4: r.nh4,
          depth: r.depth,
          time: r.datetimes,
        };
      });

      // Build history for charts
      // rev29.1: ไม่ลบ history เก่าแล้ว — append จาก API เหมือนฝั่ง Samle
      //          เพื่อรักษา Firebase history ที่สะสมไว้ (จำเป็นสำหรับ ttRoot 100+ ชม.)
      records.forEach(r => {
        const sid = r.stn_id;
        if (!MK_STATIONS[sid]) return;
        if (r.conducted == null || r.conducted <= 0) return;
        if (!_mkHistory[sid]) _mkHistory[sid] = [];
        const ts = new Date(r.datetimes).getTime();
        if (!ts || isNaN(ts)) return;
        if (!_mkHistory[sid].find(h => h.ts === ts)) {
          _mkHistory[sid].push({ ec: r.conducted, ts });
        }
      });

      console.log(`[MaeKlong] ✅ ${Object.keys(latest).length} stations updated`);
      // rev29.1: debug — แสดง stn_id ทั้งหมดที่ API return มา เพื่อตรวจว่า match MK_STATIONS หรือไม่
      if (Object.keys(latest).length === 0 && records.length > 0) {
        const apiIds = [...new Set(records.map(r => r.stn_id))];
        console.warn(`[MaeKlong] ⚠️ API returned ${records.length} records but 0 matched MK_STATIONS. API stn_ids:`, apiIds.join(', '));
        console.warn(`[MaeKlong] ⚠️ MK_STATIONS keys:`, Object.keys(MK_STATIONS).join(', '));
      }
      if (Object.keys(latest).length > 0) {
        _mkApiFetched = true; // rev29.1: API ดึงข้อมูลจริงสำเร็จ (มี station match)
      }
      break; // สำเร็จ — ออกจาก retry loop

    } catch (e) {
      console.warn(`[MaeKlong] API fetch failed (attempt ${attempt}):`, e.message);
      if (attempt < MAX_RETRY) {
        await new Promise(r => setTimeout(r, 5000 * attempt)); // รอ 5/10/15 วินาที แล้ว retry
      }
    }
    } // end retry loop

    // rev28: อ่านค่า live จาก Firebase rawmk (บันทึกโดย Railway ทุก 10 นาที)
    try {
      if (window._fbReady && window._fb && window._fbGet && window._fbRef) {
        for (const sid of Object.keys(MK_STATIONS)) {
          try {
            const snap = await window._fbGet(window._fbRef(window._fb, `rawmk/${sid}`));
            const val = snap.val ? snap.val() : snap;
            if (val && val.ec > 0 && val.ts && (Date.now() - val.ts) < 21600000) {
              // rev29.1: ค่าไม่เก่าเกิน 6 ชม. (เดิม 1 ชม. — เข้มเกินไป ถ้า Railway server ไม่ได้ run ตลอด)
              _mkData[sid] = {
                ec: val.ec, temp: val.temp, ph: val.ph,
                turbid: val.turbid, deo: val.deo,
                salinity: val.salinity, tds: val.tds,
                time: val.time, ts: val.ts,
              };
              console.log(`[MaeKlong] 🔥 Firebase live: ${sid} EC=${val.ec}`);
              _mkApiFetched = true; // rev29.1: ได้ข้อมูลจริงจาก Firebase
            }
          } catch(e2) {}
        }
      }
    } catch(e1) {}

    // rev22: โหลด Firebase history แม้ API ล้มเหลว + pre-seed จาก fallback
    try {
      if (window._fbReady && window._fb && window._fbGet && window._fbRef) {
        const tenDaysAgo = Date.now() - 240 * 3600000; // rev29.1: ขยายเป็น 10 วัน (240 ชม.) ครอบคลุม ttRoot สูงสุด 116.5 ชม. + HIST_WIN 24 ชม.
        for (const sid of Object.keys(MK_STATIONS)) {
          try {
            const fbPath = `history/rawmk_${sid.replace(/\//g,'-')}`;
            const snap = await window._fbGet(window._fbRef(window._fb, fbPath));
            const val = snap.val ? snap.val() : snap;
            if (val && typeof val === 'object') {
              if (!_mkHistory[sid]) _mkHistory[sid] = [];
              Object.values(val).forEach(rec => {
                if (!rec || rec.ec == null || rec.ec <= 0) return;
                const ts = rec.ts || 0;
                if (ts < tenDaysAgo) return;
                if (!_mkHistory[sid].find(h => h.ts === ts)) {
                  _mkHistory[sid].push({ ec: rec.ec, ts });
                }
              });
            }
          } catch(e2) { /* ignore */ }
        }
        // Sort & limit
        // rev29.1: ลบ record ที่ตรงกับ fallback timestamp (ข้อมูลปลอมที่บันทึกจาก fallback ก่อนหน้า)
        const _fbTs = {};
        Object.entries(MK_FALLBACK).forEach(([sid, d]) => {
          if (d.time) _fbTs[sid] = new Date(d.time).getTime();
        });
        Object.keys(_mkHistory).forEach(sid => {
          if (_fbTs[sid]) {
            const fbTime = _fbTs[sid];
            const fbEc   = MK_FALLBACK[sid] ? MK_FALLBACK[sid].ec : null;
            _mkHistory[sid] = _mkHistory[sid].filter(h => {
              // ลบ record ที่ timestamp ตรง fallback + EC ตรง fallback (เป็น record ปลอม)
              return !(h.ts === fbTime && fbEc != null && Math.abs(h.ec - fbEc) < 0.01);
            });
          }
          _mkHistory[sid].sort((a,b) => a.ts - b.ts);
          if (_mkHistory[sid].length > 1440) _mkHistory[sid] = _mkHistory[sid].slice(-1440); // rev29.1: 10 วัน × 144/วัน
        });
        console.log('[MaeKlong] ✅ Firebase history loaded:', Object.entries(_mkHistory).map(([k,v]) => `${k}:${v.length}`).join(', '));

        // rev29.1: อัปเดต _mkData ด้วยค่าล่าสุดจาก Firebase history
        //          กรณี API fail → _mkData ยังเป็น fallback → ต้องใช้ค่า history ที่ใหม่กว่า
        Object.keys(_mkHistory).forEach(sid => {
          const hist = _mkHistory[sid];
          if (!hist || hist.length === 0) return;
          const latest = hist[hist.length - 1]; // sorted แล้ว → ตัวสุดท้ายคือใหม่สุด
          const curTime = _mkData[sid] && _mkData[sid].time ? new Date(_mkData[sid].time).getTime() : 0;
          if (latest.ts > curTime) {
            // history มีค่าใหม่กว่า _mkData (fallback) → อัปเดต
            _mkData[sid] = Object.assign(_mkData[sid] || {}, { ec: latest.ec, time: new Date(latest.ts).toISOString() });
            _mkApiFetched = true; // ถือว่าได้ข้อมูลจริงจาก Firebase history
            console.log(`[MaeKlong] 📊 Updated ${sid} from history: EC=${latest.ec} (${new Date(latest.ts).toLocaleString('th-TH')})`);
          }
        });
      }

      // Pre-seed: ถ้า _mkHistory ยังว่าง ใส่ค่า current จาก _mkData เป็น 1 จุด
      // rev29.1: เฉพาะเมื่อได้ข้อมูลจริง (ไม่ใช่ fallback)
      if (_mkApiFetched) {
        Object.entries(_mkData).forEach(([sid, d]) => {
          if (d && d.ec > 0 && d.time) {
            if (!_mkHistory[sid]) _mkHistory[sid] = [];
            const ts = new Date(d.time).getTime();
            if (ts > 0 && !_mkHistory[sid].find(h => h.ts === ts)) {
              _mkHistory[sid].push({ ec: d.ec, ts });
            }
          }
        });
      }

      // บันทึก current data ลง Firebase ทุก 10 นาที — เฉพาะเมื่อได้ข้อมูลจริง
      // rev29.1: ห้ามบันทึก fallback data ลง history (ป้องกัน EC 200 ค้างเป็น history ปลอม)
      if (_mkApiFetched && window._fbReady && window._fb && window._fbSet && window._fbRef) {
        const now = Date.now();
        Object.entries(_mkData).forEach(([sid, d]) => {
          if (d && d.ec > 0) {
            const ts = d.time ? new Date(d.time).getTime() : now;
            const fbKey = `history/rawmk_${sid.replace(/\//g,'-')}/${ts}`;
            window._fbSet(window._fbRef(window._fb, fbKey), { ec: d.ec, temp: d.temp || null, ts });
          }
        });
        console.log('[MaeKlong] ✅ saved live EC to Firebase history');
      }
    } catch(e3) {
      console.warn('[MaeKlong] Firebase fallback error:', e3.message);
    }

    // Update global refs (history เท่านั้น — _mkRawWaterData ใช้ getter แล้ว)
    window._mkRawWaterHistory = _mkHistory;

    // Rebuild markers
    if (layers['rawwater-mk']) {
      createMkMarkers();
    }
  }

  // ── 9. Layer toggle integration ─────────────────────────────────────
  const _origToggleMk = window.toggleLayer;
  const _mkDefaultBounds = [[13.45, 100.25],[14.10, 100.97]]; // MWA default
  let _mkPrevBounds = null;

  window.toggleLayer = function(name) {
    if (name === 'rawwater-mk') {
      layers['rawwater-mk'] = !layers['rawwater-mk'];
      const el = document.getElementById('t-rawwater-mk');
      if (el) el.className = layers['rawwater-mk'] ? 'tog on' : 'tog off';

      if (layers['rawwater-mk']) {
        if (!_mkLayerGroup) _mkLayerGroup = L.layerGroup();
        _mkLayerGroup.addTo(map);
        createMkMarkers();
        // fetch ถ้ายังไม่มีข้อมูล
        if (Object.keys(_mkData).length === 0) fetchMkData();
        // rev29: timer ทำงานระดับ global แล้ว — ไม่ต้องสร้างซ้ำที่นี่
        if (!_mkFetchTimer) _mkFetchTimer = setInterval(fetchMkData, 600000);

        // Zoom out ให้เห็นทั้ง กปน. + แม่กลอง (เฉพาะ manual toggle ไม่ใช่ auto)
        if (!window._mkAutoToggle) {
          _mkPrevBounds = map.getBounds();
          map.flyToBounds([[13.75, 99.38],[14.10, 100.50]], {
            padding: [20, 20], duration: 1.0, maxZoom: 10,
          });
        }
      } else {
        if (_mkLayerGroup) _mkLayerGroup.remove();
        // rev29: ห้ามล้าง timer — Forecast ฝั่งตะวันตกยังต้องใช้ค่า S11
        // (เดิม: clearInterval ตอนปิด layer ทำให้ค่าค้าง)
        // กลับ bounds เดิม (เฉพาะ manual toggle)
        if (!window._mkAutoToggle && _mkPrevBounds) {
          map.flyToBounds(_mkPrevBounds, { duration: 0.8 });
          _mkPrevBounds = null;
        }
      }
      return;
    }
    if (_origToggleMk) _origToggleMk(name);
  };

  // ── 10. CSS สำหรับ label ─────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .mk-label {
      background: rgba(26,96,80,0.88) !important;
      color: #fff !important;
      border: none !important;
      border-radius: 3px !important;
      padding: 1px 5px !important;
      font-size: 9px !important;
      font-weight: 700 !important;
      font-family: 'JetBrains Mono', monospace !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3) !important;
      pointer-events: none !important;
    }
    .mk-label::before { display: none !important; }
    .mk-label-sm { font-size: 8px !important; padding: 1px 3px !important; opacity: 0.7 !important; }
  `;
  document.head.appendChild(style);

  // ── 11. Initial fetch เมื่อ page load (ทำเสมอ ไม่รอ toggle) ──────────
  // rev29: auto-refresh ทุก 10 นาที ไม่ผูกกับ toggle layer
  //        เพราะ Forecast ฝั่งตะวันตก ใช้ค่า S11 ตลอด แม้ layer ปิดอยู่
  setTimeout(() => {
    fetchMkData();
    if (!_mkFetchTimer) {
      _mkFetchTimer = setInterval(fetchMkData, 600000); // 10 นาที
      console.log('[MaeKlong] 🔄 rev29 global auto-refresh enabled (every 10 min)');
    }
  }, 4000);

  // ── 12. Expose data globally สำหรับ EC forecast / What-If ───────────
  // ใช้ getter เพื่อให้ window._mkRawWaterData ชี้ไปที่ _mkData ปัจจุบันเสมอ
  Object.defineProperty(window, '_mkRawWaterData', {
    get: () => _mkData,
    configurable: true
  });
  window._mkRawWaterHistory  = _mkHistory;
  window._mkRawWaterStations = MK_STATIONS;

})();

// ══════════════════════════════════════════════════════════════════════════
// rev29.1: 🔬 คุณภาพน้ำ สนป. (Lab sampling from Google Sheet)
// ══════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const SNP_SHEET_ID = '17BLEtEo9HSpTH7sNiWYvkxZhiREkqQTkfHYGpA2NpvY';
  // gviz endpoint ไม่โดน CORS block (ต่างจาก export?format=csv)
  const SNP_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SNP_SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
  const SNP_RADIUS_KM = 5;
  let _snpData = [];       // parsed records
  let _snpLoaded = false;
  let _snpMarkers = [];    // current markers on map

  // ── CSS ──
  const snpCss = document.createElement('style');
  snpCss.textContent = `
    .snp-btn{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#6a1b9a;background:#f3e5f5;border:1px solid #ce93d8;border-radius:5px;cursor:pointer;padding:3px 8px;font-family:'Sarabun',sans-serif;font-weight:600;transition:background .2s;}
    .snp-btn:hover{background:#e1bee7;}
    .snp-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:10px;}
    .snp-panel{background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,.25);}
    .snp-header{padding:14px 18px 10px;border-bottom:1px solid #f0e0f0;display:flex;justify-content:space-between;align-items:center;}
    .snp-header h3{margin:0;font-size:15px;color:#6a1b9a;font-family:'Sarabun',sans-serif;}
    .snp-close{width:28px;height:28px;border-radius:50%;border:none;background:#f3e5f5;color:#6a1b9a;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
    .snp-close:hover{background:#e1bee7;}
    .snp-body{overflow-y:auto;padding:10px 16px 16px;-webkit-overflow-scrolling:touch;}
    .snp-summary{font-size:12px;color:#555;margin-bottom:10px;font-family:'Sarabun',sans-serif;line-height:1.5;}
    .snp-card{border:1px solid #e8d8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#faf5ff;font-family:'Sarabun',sans-serif;}
    .snp-card-head{display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;}
    .snp-card-name{font-size:12px;font-weight:700;color:#4a148c;line-height:1.3;}
    .snp-card-dist{font-size:10px;color:#8e24aa;background:#f3e5f5;border-radius:10px;padding:1px 8px;white-space:nowrap;flex-shrink:0;margin-left:6px;}
    .snp-card-meta{font-size:10px;color:#888;margin-bottom:6px;}
    .snp-card-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 8px;}
    .snp-card-item{font-size:11px;color:#333;}
    .snp-card-item b{color:#6a1b9a;}
    .snp-card-item.good{color:#2e7d32;}
    .snp-card-item.warn{color:#e65100;}
    .snp-card-item.bad{color:#c62828;}
    .snp-empty{text-align:center;padding:30px;color:#999;font-size:13px;font-family:'Sarabun',sans-serif;}
    .snp-popup{min-width:250px;max-width:320px;}
    .snp-pop-row{display:flex;justify-content:space-between;align-items:center;padding:3px 0;font-size:11.5px;}
    .snp-pop-label{color:#888;flex-shrink:0;margin-right:8px;}
    .snp-pop-val{color:#333;font-weight:500;text-align:right;}
    body.dark .snp-panel{background:#1e1e2e;border:1px solid #333;}
    body.dark .snp-header{border-color:#333;}
    body.dark .snp-header h3{color:#ce93d8;}
    body.dark .snp-card{background:#2a2040;border-color:#3a2a50;}
    body.dark .snp-card-name{color:#ce93d8;}
    body.dark .snp-card-item{color:#ccc;}
    body.dark .snp-summary{color:#aaa;}
    body.dark .snp-pop-row .snp-pop-label{color:#999;}
    body.dark .snp-pop-row .snp-pop-val{color:#ddd;}
  `;
  document.head.appendChild(snpCss);

  // ── CSV Parser (simple, handles quoted fields) ──
  function parseCsv(text) {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = parseCsvLine(lines[i]);
      const obj = {};
      headers.forEach((h, j) => { obj[h.trim()] = (vals[j] || '').trim(); });
      rows.push(obj);
    }
    return rows;
  }
  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i+1] === '"') { current += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { result.push(current); current = ''; }
        else current += ch;
      }
    }
    result.push(current);
    return result;
  }

  // ── Load Google Sheet ──
  async function loadSnpData() {
    // ลอง gviz endpoint ก่อน (มักผ่าน CORS)
    const urls = [
      `https://docs.google.com/spreadsheets/d/${SNP_SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`,
      `https://docs.google.com/spreadsheets/d/${SNP_SHEET_ID}/export?format=csv&gid=0`,
    ];
    for (const url of urls) {
      try {
        console.log('[SNP] Trying:', url.substring(0, 80) + '...');
        const resp = await fetch(url, { redirect: 'follow' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        if (text.length < 100) throw new Error('Response too short');
        const rows = parseCsv(text);
        if (rows.length < 5) throw new Error(`Only ${rows.length} rows parsed`);
        _snpData = rows.filter(r => {
          // gviz อาจเปลี่ยนชื่อ column → ลอง match ทั้ง exact และ contains
          const coordCol = r['พิกัด'] || r[Object.keys(r).find(k => k.includes('พิกัด'))] || '';
          if (!coordCol) return false;
          const parts = coordCol.split(',');
          if (parts.length !== 2) return false;
          const lat = parseFloat(parts[0].trim());
          const lng = parseFloat(parts[1].trim());
          if (isNaN(lat) || isNaN(lng) || lat < 5 || lat > 21 || lng < 97 || lng > 106) return false;
          r._lat = lat;
          r._lng = lng;
          // Match columns flexibly
          const getCol = (name) => r[name] || r[Object.keys(r).find(k => k.includes(name)) || ''] || '';
          r._cl2 = parseFloat(getCol('คลอรีน')) || null;
          r._turb = parseFloat(getCol('ความขุ่นจริง')) || parseFloat(getCol('ความขุ่น')) || null;
          r._ec = parseFloat(getCol('ความนำไฟฟ้า')) || null;
          r._ph = parseFloat(getCol('pH')) || null;
          r._color = parseInt(getCol('สีปรากฎ')) || null;
          // Preserve display columns
          r._place = getCol('สถานที่') || getCol('จุดเก็บ') || '—';
          r._date = getCol('วันที่');
          r._time = getCol('เวลา');
          r._road = getCol('ถนน');
          r._branch = getCol('สาขา');
          r._source = getCol('รับน้ำจาก');
          r._ecoli = getCol('อีโคไล') || getCol('อี.โค.ไล');
          r._coliform = getCol('โคลิฟอร์มแบคทีเรีย');
          return true;
        });
        _snpLoaded = true;
        window._snpAllData = _snpData; // V30: expose globally
        console.log(`[SNP] ✅ Loaded ${_snpData.length} records from Google Sheet`);
        if (typeof window.showV30AllStats === 'function') window.showV30AllStats();
        return; // สำเร็จ
      } catch(e) {
        console.warn('[SNP] ⚠️ Failed:', e.message);
      }
    }
    console.error('[SNP] ❌ All fetch methods failed. Sheet must be shared as "Anyone with the link".');
  }

  // ── Haversine distance (km) ──
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // ── Format date ──
  function fmtDate(raw) {
    if (!raw) return '—';
    // Excel serial number or date string
    const num = parseFloat(raw);
    if (!isNaN(num) && num > 40000 && num < 50000) {
      const d = new Date((num - 25569) * 86400000);
      return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
    }
    // Try parsing as date string
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
    } catch(e) {}
    return raw;
  }

  // ── FRC status class ──
  function cl2Class(v) {
    if (v == null) return '';
    if (v >= 0.2 && v <= 1.0) return 'good';
    if (v > 1.0 || v < 0.1) return 'bad';
    return 'warn';
  }
  function cl2Status(v) {
    if (v == null) return '';
    if (v >= 0.2) return '✓ ผ่าน (≥0.2)';
    return '✗ ไม่ผ่าน (<0.2)';
  }

  // ── Build popup HTML for SNP marker ──

  // ── Clear markers ──
  function clearSnpMarkers() {
    _snpMarkers.forEach(m => { try { window.map.removeLayer(m); } catch(e){} });
    _snpMarkers = [];
  }

  // ── Search & Display ──
  window._snpSearch = function(lat, lng) {
    if (!_snpLoaded || _snpData.length === 0) {
      alert('กำลังโหลดข้อมูล สนป. กรุณารอสักครู่...');
      return;
    }

    // Find records within radius
    const nearby = _snpData.map(r => ({
      ...r,
      _dist: haversine(lat, lng, r._lat, r._lng)
    })).filter(r => r._dist <= SNP_RADIUS_KM)
      .sort((a, b) => a._dist - b._dist);

    // Clear old markers
    clearSnpMarkers();

    // Build overlay panel
    const overlay = document.createElement('div');
    overlay.className = 'snp-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.remove(); } };

    let cardsHtml = '';
    if (nearby.length === 0) {
      cardsHtml = `<div class="snp-empty">ไม่พบจุดตรวจ สนป. ในรัศมี ${SNP_RADIUS_KM} km<br><span style="font-size:11px;color:#bbb;">ลองคลิกที่ตำแหน่งอื่น</span></div>`;
    } else {
      // Group by date (latest first), show max 50 records
      const shown = nearby.slice(0, 50);
      shown.forEach(r => {
        const distLabel = r._dist < 1 ? (r._dist * 1000).toFixed(0) + ' m' : r._dist.toFixed(1) + ' km';
        const cl2Html = r._cl2 != null ? `<div class="snp-card-item ${cl2Class(r._cl2)}"><b>Cl₂</b> ${r._cl2.toFixed(2)} mg/L</div>` : '';
        const turbHtml = r._turb != null ? `<div class="snp-card-item"><b>ขุ่น</b> ${r._turb.toFixed(2)} NTU</div>` : '';
        const ecHtml = r._ec != null ? `<div class="snp-card-item"><b>EC</b> ${r._ec} μS/cm</div>` : '';
        const phHtml = r._ph != null ? `<div class="snp-card-item"><b>pH</b> ${r._ph.toFixed(2)}</div>` : '';
        const colorHtml = r._color != null ? `<div class="snp-card-item"><b>สี</b> ${r._color}</div>` : '';
        const ecoliHtml = r._ecoli ? `<div class="snp-card-item"><b>E.coli</b> ${r._ecoli}</div>` : '';
        const coliformHtml = r._coliform ? `<div class="snp-card-item"><b>Coliform</b> ${r._coliform}</div>` : '';

        cardsHtml += `
          <div class="snp-card" onclick="window.map.flyTo([${r._lat},${r._lng}],16);this.style.borderColor='#8e24aa';">
            <div class="snp-card-head">
              <div class="snp-card-name">${r._place}</div>
              <div class="snp-card-dist">📍 ${distLabel}</div>
            </div>
            <div class="snp-card-meta">
              📅 ${fmtDate(r._date)} ⏰ ${r._time || '—'}
              · ${r._road || ''} · ${r._branch || ''} · รับน้ำ: ${r._source || '—'}
            </div>
            <div class="snp-card-grid">
              ${cl2Html}${turbHtml}${ecHtml}${phHtml}${colorHtml}${ecoliHtml}${coliformHtml}
            </div>
          </div>`;

        // Add marker on map — ใช้ divIcon + pane เฉพาะเพื่อให้อยู่เหนือ contour canvas
        // (markers จะถูก group by พิกัดด้านล่าง)
      });

      // Group markers by พิกัด — รวม records ที่อยู่จุดเดียวกันเป็น popup เดียว
      var locMap = {};
      shown.forEach(function(r) {
        var key = r._lat.toFixed(5) + ',' + r._lng.toFixed(5);
        if (!locMap[key]) locMap[key] = { lat: r._lat, lng: r._lng, records: [] };
        locMap[key].records.push(r);
      });

      Object.keys(locMap).forEach(function(key) {
        var loc = locMap[key];
        var recs = loc.records;
        var latest = recs[0]; // records เรียงตามวันที่ล่าสุดแล้ว
        var mkColor = latest._cl2 != null ? (latest._cl2 >= 0.2 ? '#7b1fa2' : '#c62828') : '#9e9e9e';
        var m = L.marker([loc.lat, loc.lng], {
          pane: 'snpPane',
          icon: L.divIcon({
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            html: '<div style="width:14px;height:14px;border-radius:50%;background:' + mkColor + ';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;"></div>'
          })
        }).addTo(window.map);

        // Popup แสดงทุก record ที่พิกัดนี้
        var popupContent = '<div style="font-family:Sarabun,sans-serif;max-height:350px;overflow-y:auto;">';
        popupContent += '<div style="font-size:13px;font-weight:700;color:#6c3483;margin-bottom:6px;">🔬 ' + (latest._place || 'จุดตรวจ สนป.') + '</div>';
        popupContent += '<div style="font-size:10px;color:#888;margin-bottom:8px;">📍 ' + loc.lat.toFixed(5) + ', ' + loc.lng.toFixed(5) + ' | พบ ' + recs.length + ' ครั้ง</div>';
        
        recs.forEach(function(r, idx) {
          var cl2Color = r._cl2 != null ? (r._cl2 >= 0.5 ? '#27ae60' : r._cl2 >= 0.2 ? '#e67e22' : '#c0392b') : '#999';
          var cl2Status = r._cl2 != null ? (r._cl2 >= 0.2 ? '✓' : '✗') : '';
          popupContent += '<div style="border-top:1px solid #f0e0f0;padding:6px 0;' + (idx === 0 ? 'background:#faf5ff;margin:0 -8px;padding:6px 8px;border-radius:6px;' : '') + '">';
          popupContent += '<div style="font-size:10px;color:#888;">📅 ' + fmtDate(r._date) + ' ⏰ ' + (r._time || '—') + ' · ' + (r._branch || '') + '</div>';
          popupContent += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">';
          if (r._cl2 != null) popupContent += '<div style="font-size:11px;"><b>Cl₂</b> <span style="color:' + cl2Color + ';font-weight:700;">' + r._cl2.toFixed(2) + ' mg/L ' + cl2Status + '</span></div>';
          if (r._turb != null) popupContent += '<div style="font-size:11px;"><b>ขุ่น</b> ' + r._turb.toFixed(2) + ' NTU</div>';
          if (r._ec != null) popupContent += '<div style="font-size:11px;"><b>EC</b> ' + r._ec + ' μS/cm</div>';
          if (r._ph != null) popupContent += '<div style="font-size:11px;"><b>pH</b> ' + r._ph.toFixed(2) + '</div>';
          if (r._ecoli) popupContent += '<div style="font-size:11px;"><b>E.coli</b> ' + r._ecoli + '</div>';
          if (r._coliform) popupContent += '<div style="font-size:11px;"><b>Coliform</b> ' + r._coliform + '</div>';
          popupContent += '</div>';
          if (r._source) popupContent += '<div style="font-size:9px;color:#aaa;margin-top:2px;">💧 รับน้ำ: ' + r._source + '</div>';
          popupContent += '</div>';
        });
        
        popupContent += '</div>';

        m.bindPopup(popupContent, {
          className: 'pk-pop', maxWidth: 350, minWidth: 280,
          autoPan: true, autoPanPaddingTopLeft: [10, 80], autoPanPaddingBottomRight: [10, 40]
        });
        m.bindTooltip('<b>' + (latest._place || '').substring(0, 25) + '</b><br>Cl₂: ' + (latest._cl2 != null ? latest._cl2.toFixed(2) : '—') + ' | ' + recs.length + ' records', {
          className: 'snp-tip', direction: 'top', offset: [0, -6]
        });
        _snpMarkers.push(m);
      });

      // Draw radius circle
      const circle = L.circle([lat, lng], {
        radius: SNP_RADIUS_KM * 1000, color: '#8e24aa', weight: 1.5,
        fillColor: '#ce93d8', fillOpacity: 0.08, dashArray: '6,4'
      }).addTo(window.map);
      _snpMarkers.push(circle);
    }

    // Unique dates
    const uniqueDates = [...new Set(nearby.map(r => fmtDate(r._date)))];

    overlay.innerHTML = `
      <div class="snp-panel">
        <div class="snp-header">
          <h3>🔬 คุณภาพน้ำ สนป. ในรัศมี ${SNP_RADIUS_KM} km</h3>
          <button class="snp-close" onclick="this.closest('.snp-overlay').remove()">✕</button>
        </div>
        <div class="snp-body">
          <div class="snp-summary">
            📍 จุดค้นหา: ${lat.toFixed(5)}, ${lng.toFixed(5)}<br>
            📊 พบ <b>${nearby.length}</b> จุดตรวจ จาก <b>${uniqueDates.length}</b> วันที่ (ข้อมูลทั้งหมด ${_snpData.length} records)
            ${nearby.length > 0 ? `<br>
            <button class="snp-btn" style="margin-top:6px;" onclick="(function(){window._snpClearMarkers();this.closest('.snp-overlay').remove();}.bind(this))()">🗑 ลบหมุด สนป.</button>` : ''}
          </div>
          ${cardsHtml}
        </div>
      </div>`;
    document.body.appendChild(overlay);
  };

  window._snpClearMarkers = clearSnpMarkers;

  // ── Inject button into popups ──
  // Hook into Leaflet popup open event to add SNP button
  function injectSnpButton(popup) {
    if (!popup || !popup._contentNode) return;
    const content = popup._contentNode;
    // Don't add twice
    if (content.querySelector('.snp-btn')) return;
    // Find lat/lon from popup content or from the source layer
    let lat, lng;
    const src = popup._source;
    if (src && src.getLatLng) {
      const ll = src.getLatLng();
      lat = ll.lat; lng = ll.lng;
    } else if (src && src._msdLat != null) {
      lat = src._msdLat; lng = src._msdLon;
    }
    if (lat == null || lng == null) return;

    // Find insertion point — look for button rows or end of content
    const btnContainer = content.querySelector('div[style*="border-top"]') || content.querySelector('.lpop') || content.lastElementChild;
    if (!btnContainer) return;

    const btn = document.createElement('button');
    btn.className = 'snp-btn';
    btn.innerHTML = '🔬 คุณภาพน้ำ สนป. ใน 5 km';
    btn.onclick = (e) => {
      e.stopPropagation();
      window._snpSearch(lat, lng);
    };

    // Add with some spacing
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px solid #e8d8f0;';
    wrapper.appendChild(btn);

    if (btnContainer.classList && btnContainer.classList.contains('lpop')) {
      btnContainer.appendChild(wrapper);
    } else {
      btnContainer.parentNode.insertBefore(wrapper, btnContainer.nextSibling);
    }
  }

  // Listen for popup open events
  function hookPopups() {
    if (!window.map) { setTimeout(hookPopups, 500); return; }
    // สร้าง pane เฉพาะสำหรับ SNP markers ให้อยู่เหนือ contour canvas (z-index 650+)
    if (!window.map.getPane('snpPane')) {
      window.map.createPane('snpPane');
      window.map.getPane('snpPane').style.zIndex = 650;
      window.map.getPane('snpPane').style.pointerEvents = 'auto';
    }
    window.map.on('popupopen', (e) => {
      setTimeout(() => injectSnpButton(e.popup), 50);
    });
    console.log('[SNP] ✅ Popup hook installed');
  }

  // ── Init ──
  setTimeout(loadSnpData, 5000);  // Load after main data
  setTimeout(hookPopups, 3000);

})();

// ══════════════════════════════════════════════════════════════════════════
// V30: 🗺️ คุณภาพน้ำตามพื้นที่ (เขต/อำเภอ/ตำบล)
// ══════════════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  const MWA_PROVINCES = ['กรุงเทพมหานคร','นนทบุรี','สมุทรปราการ'];
  // GeoJSON ขอบเขตเขต/อำเภอ + ตำบล/แขวง (embedded — จาก shapefile กรมการปกครอง)
  // districts: 62 features (กทม. 50 + นนทบุรี 6 + สมุทรปราการ 6)
  // subdistricts: 262 features (กทม. 160 + นนทบุรี 52 + สมุทรปราการ 50)
  // GeoJSON embedded — districts (62) + subdistricts นนทบุรี+สมุทรปราการ (102)
  // กทม. 180 แขวง จะ fetch จาก ArcGIS Online ที่ load
  // _V30_DIST_DATA → data/boundaries.js
  // _V30_NONT_SP_SUB → data/boundaries.js
  const BKK_ARCGIS_URL = 'https://services1.arcgis.com/jSaRWj2TDlcN1zOC/arcgis/rest/services/TH_Bangkok_Subdistrict/FeatureServer/0/query';


  let _v30districts = [];
  let _v30subdistricts = [];
  let _v30highlightLayer = null;
  let _v30subdLayer = null;
  let _v30markers = [];
  let _v30loaded = false;

  // ── CSS ──
  const v30css = document.createElement('style');
  v30css.textContent = `
    .v30-stat{margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(108,52,131,.08);border:1px solid rgba(108,52,131,.15);}
    .v30-stat-title{font-size:11px;font-weight:700;color:#6c3483;margin-bottom:6px;}
    .v30-stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}
    .v30-sc{background:#fff;border-radius:6px;padding:6px 8px;text-align:center;border:1px solid #f0e0f0;}
    .v30-sc-val{font-size:16px;font-weight:700;}
    .v30-sc-lbl{font-size:8px;color:#888;margin-top:1px;}
    .v30-sc.good .v30-sc-val{color:#27ae60;}
    .v30-sc.warn .v30-sc-val{color:#e67e22;}
    .v30-sc.bad .v30-sc-val{color:#e74c3c;}
    .v30-sc.info .v30-sc-val{color:#2980b9;}
    .v30-item{padding:6px 8px;border-radius:6px;margin-bottom:3px;background:#faf5ff;border:1px solid #f0e0f0;cursor:pointer;transition:all .15s;}
    .v30-item:hover{border-color:#8e44ad;background:#f3e5f5;}
    .v30-item-name{font-size:10px;font-weight:600;color:#4a148c;line-height:1.3;}
    .v30-item-meta{font-size:9px;color:#888;margin-top:1px;}
    .v30-item-vals{display:flex;gap:6px;margin-top:3px;font-size:9px;flex-wrap:wrap;}
    .v30-item-vals span{padding:1px 5px;border-radius:3px;background:rgba(108,52,131,.06);}
    .v30-item-vals .ok{color:#27ae60;}
    .v30-item-vals .ng{color:#e74c3c;}
    body.dark .v30-stat{background:rgba(108,52,131,.15);border-color:rgba(108,52,131,.25);}
    body.dark .v30-sc{background:rgba(0,0,0,.3);border-color:#333;}
    body.dark .v30-item{background:#2a2040;border-color:#3a2a50;}
    body.dark .v30-item-name{color:#ce93d8;}
  `;
  document.head.appendChild(v30css);

  // ── Point in Polygon ──
  function pip(lat, lng, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][1], yi = poly[i][0], xj = poly[j][1], yj = poly[j][0];
      if (((yi > lng) !== (yj > lng)) && (lat < (xj-xi)*(lng-yi)/(yj-yi)+xi)) inside = !inside;
    }
    return inside;
  }
  function pointInFeature(lat, lng, f) {
    const g = f.geometry;
    if (g.type === 'Polygon') return pip(lat, lng, g.coordinates[0]);
    if (g.type === 'MultiPolygon') return g.coordinates.some(p => pip(lat, lng, p[0]));
    return false;
  }

  // ── Format date ──
  function fmtD(raw) {
    if (!raw) return '—';
    const n = parseFloat(raw);
    if (!isNaN(n) && n > 40000 && n < 50000) {
      return new Date((n-25569)*86400000).toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'2-digit'});
    }
    try { const d=new Date(raw); if(!isNaN(d)) return d.toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'2-digit'}); } catch(e){}
    return raw;
  }

  // ── Get property helper — supports chingchai + UNOCHA/mapthai property names ──
  function gp(props, ...keys) {
    // Map shorthand to all possible field names
    const aliases = {
      'pro_th': ['pro_th','PRO_TH','PROVINCE','adm1_th','ADM1_TH'],
      'amp_th': ['amp_th','AMP_TH','DISTRICT','adm2_th','ADM2_TH'],
      'tam_th': ['tam_th','TAM_TH','SUBDISTRICT','adm3_th','ADM3_TH'],
      'pro_en': ['pro_en','PRO_EN','adm1_en','ADM1_EN'],
      'amp_en': ['amp_en','AMP_EN','adm2_en','ADM2_EN'],
      'tam_en': ['tam_en','TAM_EN','adm3_en','ADM3_EN'],
    };
    for (const k of keys) {
      if (props[k]) return props[k];
      // Check aliases
      const aliasGroup = aliases[k];
      if (aliasGroup) {
        for (const a of aliasGroup) { if (props[a]) return props[a]; }
      }
    }
    return '';
  }

  // ── Load GeoJSON ──
  async function loadV30() {
    try {
      console.log('[V30] Loading districts + subdistricts...');
      
      // Districts (embedded 62 features)
      _v30districts = _V30_DIST_DATA.features;
      
      // Subdistricts: นนทบุรี+สมุทรปราการ (embedded 102) + กทม. (ArcGIS 180)
      _v30subdistricts = _V30_NONT_SP_SUB.features.slice();
      
      // Fetch กทม. 180 แขวง from ArcGIS Online
      try {
        console.log('[V30] Fetching BKK 180 khwaeng from ArcGIS...');
        var params = new URLSearchParams({
          where: '1=1', outFields: 'TAM_NAMT,AMP_NAMT,PROV_NAMT,TAM_NAME,AMP_NAME',
          f: 'geojson', returnGeometry: 'true', outSR: '4326', resultRecordCount: '2000'
        });
        var resp = await fetch(BKK_ARCGIS_URL + '?' + params);
        if (resp.ok) {
          var bkkData = await resp.json();
          if (bkkData.features && bkkData.features.length >= 170) {
            bkkData.features.forEach(function(f) {
              var p = f.properties;
              p.tam_th = p.TAM_NAMT || p.TAM_NAME || '';
              p.amp_th = p.AMP_NAMT || p.AMP_NAME || '';
              p.pro_th = p.PROV_NAMT || 'กรุงเทพมหานคร';
              p.tam_en = p.TAM_NAME || '';
              p.amp_en = p.AMP_NAME || '';
            });
            _v30subdistricts = _v30subdistricts.concat(bkkData.features);
            console.log('[V30] ✅ BKK: ' + bkkData.features.length + ' khwaeng from ArcGIS');
          }
        }
      } catch(e2) {
        console.warn('[V30] ArcGIS BKK failed, using shapefile fallback:', e2.message);
      }
      
      var bkkCount = _v30subdistricts.filter(function(f) { return (gp(f.properties,'pro_th')).indexOf('กรุงเทพ') >= 0; }).length;
      console.log('[V30] ✅ ' + _v30districts.length + ' districts, ' + _v30subdistricts.length + ' subdistricts (กทม. ' + bkkCount + ' แขวง)');
      
      _v30loaded = true;
      populateProvinces();
    } catch(e) {
      console.error('[V30] Failed:', e);
    }
  }

  // ── Populate province dropdown ──
  function populateProvinces() {
    const sel = document.getElementById('v30-province');
    if (!sel) return;
    const provs = [...new Set(_v30districts.map(f => gp(f.properties,'pro_th','PRO_TH','PROVINCE')))].filter(Boolean).sort();
    provs.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      sel.appendChild(opt);
    });
  }

  // ── Clear ──
  function clearV30() {
    if (_v30highlightLayer) { window.map.removeLayer(_v30highlightLayer); _v30highlightLayer = null; }
    if (_v30subdLayer) { window.map.removeLayer(_v30subdLayer); _v30subdLayer = null; }
    _v30markers.forEach(m => { try { window.map.removeLayer(m); } catch(e){} });
    _v30markers = [];
  }

  // ── Get SNP data from SNP module ──
  function getSnpData() {
    // Access from SNP module loaded earlier
    return window._snpSearchData || [];
  }

  // ── Show samples + stats ──
  function showV30Samples(areaName, samples) {
    clearV30Markers();
    const snp = getSnpData();

    const cl2s = samples.filter(s=>s._cl2!=null).map(s=>s._cl2);
    const ecs = samples.filter(s=>s._ec!=null).map(s=>s._ec);
    const turbs = samples.filter(s=>s._turb!=null).map(s=>s._turb);
    const phs = samples.filter(s=>s._ph!=null).map(s=>s._ph);
    const ecoliSamples = samples.filter(s=>s._ecoli);
    const ecoliPass = ecoliSamples.filter(s=>s._ecoli==='ไม่พบ'||s._ecoli==='น้อยกว่า 1'||s._ecoli==='<1'||s._ecoli==='0').length;
    const coliformSamples = samples.filter(s=>s._coliform);
    const coliformPass = coliformSamples.filter(s=>s._coliform==='ไม่พบ'||s._coliform==='น้อยกว่า 1'||s._coliform==='<1'||s._coliform==='0').length;
    const passN = cl2s.filter(v=>v>=0.2).length;
    const passR = cl2s.length>0 ? (passN/cl2s.length*100).toFixed(0) : '—';
    const avgCl = cl2s.length>0 ? (cl2s.reduce((a,b)=>a+b,0)/cl2s.length).toFixed(2) : '—';
    const avgEc = ecs.length>0 ? (ecs.reduce((a,b)=>a+b,0)/ecs.length).toFixed(0) : '—';
    const avgT = turbs.length>0 ? (turbs.reduce((a,b)=>a+b,0)/turbs.length).toFixed(2) : '—';
    const avgPh = phs.length>0 ? (phs.reduce((a,b)=>a+b,0)/phs.length).toFixed(2) : '—';
    const ecoliTxt = ecoliSamples.length>0 ? `${ecoliPass}/${ecoliSamples.length}` : '—';
    const coliformTxt = coliformSamples.length>0 ? `${coliformPass}/${coliformSamples.length}` : '—';
    const pCls = passR==='—'?'info':(parseFloat(passR)>=80?'good':parseFloat(passR)>=50?'warn':'bad');
    const ecoliCls = ecoliSamples.length===0?'info':(ecoliPass===ecoliSamples.length?'good':ecoliPass/ecoliSamples.length>=0.8?'warn':'bad');
    const coliformCls = coliformSamples.length===0?'info':(coliformPass===coliformSamples.length?'good':coliformPass/coliformSamples.length>=0.8?'warn':'bad');

    const statsEl = document.getElementById('v30-stats');
    statsEl.style.display = 'block';
    const fyLabel = getFiscalYearLabel();
    statsEl.innerHTML = `<div class="v30-stat">
      <div class="v30-stat-title">📊 ${areaName} — ${samples.length} จุดตรวจ<br><span style="font-size:10px;font-weight:400;color:#888;">${fyLabel}</span></div>
      <div class="v30-stat-grid">
        <div class="v30-sc ${pCls}"><div class="v30-sc-val">${passR}%</div><div class="v30-sc-lbl">FRC ผ่าน (≥0.2)</div></div>
        <div class="v30-sc info"><div class="v30-sc-val">${avgCl}</div><div class="v30-sc-lbl">Cl₂ เฉลี่ย</div></div>
        <div class="v30-sc info"><div class="v30-sc-val">${avgEc}</div><div class="v30-sc-lbl">EC เฉลี่ย</div></div>
        <div class="v30-sc info"><div class="v30-sc-val">${avgT}</div><div class="v30-sc-lbl">ขุ่นเฉลี่ย</div></div>
        <div class="v30-sc info"><div class="v30-sc-val">${avgPh}</div><div class="v30-sc-lbl">pH เฉลี่ย</div></div>
        <div class="v30-sc ${ecoliCls}"><div class="v30-sc-val">${ecoliTxt}</div><div class="v30-sc-lbl">E.coli ตัวอย่างที่ผ่าน/ทั้งหมด</div></div>
        <div class="v30-sc ${coliformCls}"><div class="v30-sc-val">${coliformTxt}</div><div class="v30-sc-lbl">Coliform ตัวอย่างที่ผ่าน/ทั้งหมด</div></div>
      </div>
    </div>`;

    const sorted = [...samples].sort((a,b)=>(b._date||'').localeCompare(a._date||''));
    const shown = sorted.slice(0, 30);
    let html = '';
    shown.forEach(r => {
      const c = r._cl2!=null?(r._cl2>=0.2?'ok':'ng'):'';
      html += `<div class="v30-item" onclick="window.map.flyTo([${r._lat},${r._lng}],16)">
        <div class="v30-item-name">${r._place||'—'}</div>
        <div class="v30-item-meta">📅 ${fmtD(r._date)} · ${r._branch||''}</div>
        <div class="v30-item-vals">
          ${r._cl2!=null?`<span class="${c}">Cl₂ ${r._cl2.toFixed(2)}</span>`:''}
          ${r._turb!=null?`<span>ขุ่น ${r._turb.toFixed(2)}</span>`:''}
          ${r._ec!=null?`<span>EC ${r._ec}</span>`:''}
          ${r._ph!=null?`<span>pH ${r._ph.toFixed(2)}</span>`:''}
          ${r._ecoli?`<span class="${(r._ecoli==='ไม่พบ'||r._ecoli==='น้อยกว่า 1'||r._ecoli==='<1'||r._ecoli==='0')?'ok':'ng'}">E.coli ${r._ecoli}</span>`:''}
          ${r._coliform?`<span class="${(r._coliform==='ไม่พบ'||r._coliform==='น้อยกว่า 1'||r._coliform==='<1'||r._coliform==='0')?'ok':'ng'}">Coliform ${r._coliform}</span>`:''}
        </div>
      </div>`;

      // marker — จะ group by พิกัดด้านล่าง
    });

    // Group markers by พิกัด — รวม records ที่พิกัดเดียวกันเป็น popup เดียว
    var locGrp = {};
    shown.forEach(function(r) {
      var lk = r._lat.toFixed(5) + ',' + r._lng.toFixed(5);
      if (!locGrp[lk]) locGrp[lk] = { lat: r._lat, lng: r._lng, recs: [] };
      locGrp[lk].recs.push(r);
    });

    Object.keys(locGrp).forEach(function(lk) {
      var g = locGrp[lk];
      var recs = g.recs;
      var latest = recs[0];
      var mc = latest._cl2 != null ? (latest._cl2 >= 0.2 ? '#27ae60' : '#e74c3c') : '#999';
      var m = L.marker([g.lat, g.lng], {
        pane: 'snpPane',
        icon: L.divIcon({
          className:'', iconSize:[12,12], iconAnchor:[6,6],
          html:'<div style="width:12px;height:12px;border-radius:50%;background:' + mc + ';border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;"></div>'
        })
      }).addTo(window.map);

      var popHtml = '<div style="min-width:220px;max-height:350px;overflow-y:auto;font-family:Sarabun;font-size:12px;">';
      popHtml += '<div style="font-weight:700;color:#6c3483;margin-bottom:4px;">🔬 ' + (latest._place || 'จุดตรวจ สนป.') + '</div>';
      popHtml += '<div style="font-size:10px;color:#888;margin-bottom:6px;">📍 พบ ' + recs.length + ' ครั้ง</div>';
      
      recs.forEach(function(r, idx) {
        var cl2Color = r._cl2 != null ? (r._cl2 >= 0.5 ? '#27ae60' : r._cl2 >= 0.2 ? '#e67e22' : '#c0392b') : '#999';
        popHtml += '<div style="border-top:1px solid #f0e0f0;padding:5px 0;' + (idx === 0 ? 'background:#faf5ff;margin:0 -8px;padding:5px 8px;border-radius:4px;' : '') + '">';
        popHtml += '<div style="font-size:10px;color:#888;">📅 ' + fmtD(r._date) + ' ⏰ ' + (r._time || '') + ' · ' + (r._branch || '') + '</div>';
        popHtml += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:3px;">';
        if (r._cl2 != null) popHtml += '<span style="font-size:11px;"><b>Cl₂</b> <span style="color:' + cl2Color + ';font-weight:700;">' + r._cl2.toFixed(2) + ' ' + (r._cl2 >= 0.2 ? '✓' : '✗') + '</span></span>';
        if (r._turb != null) popHtml += '<span style="font-size:11px;"><b>ขุ่น</b> ' + r._turb.toFixed(2) + '</span>';
        if (r._ec != null) popHtml += '<span style="font-size:11px;"><b>EC</b> ' + r._ec + '</span>';
        if (r._ph != null) popHtml += '<span style="font-size:11px;"><b>pH</b> ' + r._ph.toFixed(2) + '</span>';
        if (r._ecoli) popHtml += '<span style="font-size:11px;"><b>E.coli</b> ' + r._ecoli + '</span>';
        if (r._coliform) popHtml += '<span style="font-size:11px;"><b>Coliform</b> ' + r._coliform + '</span>';
        popHtml += '</div>';
        if (r._source) popHtml += '<div style="font-size:9px;color:#aaa;margin-top:2px;">💧 ' + r._source + '</div>';
        popHtml += '</div>';
      });
      popHtml += '</div>';

      m.bindPopup(popHtml, { maxWidth: 340, minWidth: 240, autoPan: true });
      m.bindTooltip('<b>' + (latest._place || '').substring(0, 25) + '</b><br>' + recs.length + ' records', { className: 'snp-tip', direction: 'top', offset: [0, -6] });
      _v30markers.push(m);
    });

    if (samples.length > 30) html += `<div style="text-align:center;padding:6px;font-size:9px;color:#888;">แสดง 30 / ${samples.length}</div>`;
    document.getElementById('v30-samples').innerHTML = html;
  }

  // ── Fiscal year helper ──
  function getFiscalYearLabel() {
    const now = new Date();
    const m = now.getMonth(); // 0-11
    const y = now.getFullYear();
    const fyBE = (m >= 9 ? y + 1 : y) + 543; // ต.ค.=month 9
    const startBE = fyBE - 1;
    return `ปีงบ ${fyBE} (1 ต.ค.${String(startBE).slice(-2)}-ปัจจุบัน)`;
  }

  // ── Show all-data stats (before province selection) ──
  function showV30AllStats() {
    const samples = window._snpAllData || [];
    if (samples.length === 0) {
      document.getElementById('v30-stats').style.display = 'none';
      document.getElementById('v30-samples').innerHTML = '<div style="text-align:center;padding:12px;font-size:11px;color:#999;">กำลังโหลดข้อมูล...</div>';
      return;
    }
    const cl2s = samples.filter(s=>s._cl2!=null).map(s=>s._cl2);
    const ecs = samples.filter(s=>s._ec!=null).map(s=>s._ec);
    const turbs = samples.filter(s=>s._turb!=null).map(s=>s._turb);
    const phs = samples.filter(s=>s._ph!=null).map(s=>s._ph);
    const ecoliSamples = samples.filter(s=>s._ecoli);
    const ecoliPass = ecoliSamples.filter(s=>s._ecoli==='ไม่พบ'||s._ecoli==='น้อยกว่า 1'||s._ecoli==='<1'||s._ecoli==='0').length;
    const coliformSamples = samples.filter(s=>s._coliform);
    const coliformPass = coliformSamples.filter(s=>s._coliform==='ไม่พบ'||s._coliform==='น้อยกว่า 1'||s._coliform==='<1'||s._coliform==='0').length;
    const passN = cl2s.filter(v=>v>=0.2).length;
    const passR = cl2s.length>0 ? (passN/cl2s.length*100).toFixed(0) : '—';
    const avgCl = cl2s.length>0 ? (cl2s.reduce((a,b)=>a+b,0)/cl2s.length).toFixed(2) : '—';
    const avgEc = ecs.length>0 ? (ecs.reduce((a,b)=>a+b,0)/ecs.length).toFixed(0) : '—';
    const avgT = turbs.length>0 ? (turbs.reduce((a,b)=>a+b,0)/turbs.length).toFixed(2) : '—';
    const avgPh = phs.length>0 ? (phs.reduce((a,b)=>a+b,0)/phs.length).toFixed(2) : '—';
    const ecoliTxt = ecoliSamples.length>0 ? `${ecoliPass}/${ecoliSamples.length}` : '—';
    const coliformTxt = coliformSamples.length>0 ? `${coliformPass}/${coliformSamples.length}` : '—';
    const pCls = passR==='—'?'info':(parseFloat(passR)>=80?'good':parseFloat(passR)>=50?'warn':'bad');
    const ecoliCls = ecoliSamples.length===0?'info':(ecoliPass===ecoliSamples.length?'good':ecoliPass/ecoliSamples.length>=0.8?'warn':'bad');
    const coliformCls = coliformSamples.length===0?'info':(coliformPass===coliformSamples.length?'good':coliformPass/coliformSamples.length>=0.8?'warn':'bad');
    const fyLabel = getFiscalYearLabel();

    const statsEl = document.getElementById('v30-stats');
    statsEl.style.display = 'block';
    statsEl.innerHTML = `<div class="v30-stat">
      <div class="v30-stat-title">📊 ข้อมูลทั้งหมด — ${samples.length} จุดตรวจ<br><span style="font-size:10px;font-weight:400;color:#888;">${fyLabel}</span></div>
      <div class="v30-stat-grid">
        <div class="v30-sc ${pCls}"><div class="v30-sc-val">${passR}%</div><div class="v30-sc-lbl">FRC ผ่าน (≥0.2)</div></div>
        <div class="v30-sc info"><div class="v30-sc-val">${avgCl}</div><div class="v30-sc-lbl">Cl₂ เฉลี่ย</div></div>
        <div class="v30-sc info"><div class="v30-sc-val">${avgEc}</div><div class="v30-sc-lbl">EC เฉลี่ย</div></div>
        <div class="v30-sc info"><div class="v30-sc-val">${avgT}</div><div class="v30-sc-lbl">ขุ่นเฉลี่ย</div></div>
        <div class="v30-sc info"><div class="v30-sc-val">${avgPh}</div><div class="v30-sc-lbl">pH เฉลี่ย</div></div>
        <div class="v30-sc ${ecoliCls}"><div class="v30-sc-val">${ecoliTxt}</div><div class="v30-sc-lbl">E.coli ตัวอย่างที่ผ่าน/ทั้งหมด</div></div>
        <div class="v30-sc ${coliformCls}"><div class="v30-sc-val">${coliformTxt}</div><div class="v30-sc-lbl">Coliform ตัวอย่างที่ผ่าน/ทั้งหมด</div></div>
      </div>
    </div>`;
    document.getElementById('v30-samples').innerHTML = '<div style="text-align:center;padding:8px;font-size:10px;color:#999;">เลือกจังหวัด/เขต เพื่อดูรายจุดตรวจ</div>';
  }
  window.showV30AllStats = showV30AllStats; // expose for SNP loader

  // ── Search SNP stations by name ──
  let _searchTimeout = null;
  function searchV30Snp(query) {
    clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(() => _doSearchV30(query), 250); // debounce 250ms
  }
  function _doSearchV30(query) {
    const q = (query || '').trim().toLowerCase();
    if (q.length < 2) {
      // ถ้าว่างหรือสั้นเกิน → กลับไปแสดงตามที่เลือกอยู่
      const prov = document.getElementById('v30-province').value;
      if (!prov) {
        showV30AllStats();
      } else {
        // trigger re-render ตาม dropdown ปัจจุบัน
        const sub = document.getElementById('v30-subdistrict').value;
        const dist = document.getElementById('v30-district').value;
        if (sub) onV30Subdistrict();
        else if (dist) onV30District();
        else onV30Province();
      }
      return;
    }
    const snp = window._snpAllData || [];
    if (!snp.length) return;

    // search ทุก field ที่เกี่ยวข้อง: สถานที่, ถนน, สาขา
    const results = snp.filter(r => {
      const place = (r._place || '').toLowerCase();
      const road = (r._road || '').toLowerCase();
      const branch = (r._branch || '').toLowerCase();
      return place.includes(q) || road.includes(q) || branch.includes(q);
    });

    // แสดง stats สำหรับผลค้นหา
    if (results.length > 0) {
      showV30Samples(`ผลค้นหา "${query.trim()}"`, results);
    } else {
      document.getElementById('v30-stats').style.display = 'none';
      document.getElementById('v30-samples').innerHTML = `<div style="text-align:center;padding:20px;font-size:12px;color:#999;">
        ไม่พบสถานที่ที่ตรงกับ "${query.trim()}"<br>
        <span style="font-size:10px;">ลองค้นหาด้วยคำอื่น เช่น ชื่อโรงเรียน, วัด, สถานี</span>
      </div>`;
    }
  }
  window.searchV30Snp = searchV30Snp; // expose for HTML oninput

  function clearV30Markers() {
    _v30markers.forEach(m => { try { window.map.removeLayer(m); } catch(e){} });
    _v30markers = [];
  }

  // ── Province change ──
  function onV30Province() {
    const searchEl = document.getElementById('v30-search');
    if (searchEl) searchEl.value = '';
    const prov = document.getElementById('v30-province').value;
    const selD = document.getElementById('v30-district');
    const selS = document.getElementById('v30-subdistrict');
    selD.innerHTML = '<option value="">— ทั้งจังหวัด —</option>';
    selS.innerHTML = '<option value="">— เลือกเขตก่อน —</option>';
    selS.disabled = true;
    document.getElementById('v30-stats').style.display = 'none';
    document.getElementById('v30-samples').innerHTML = '';
    clearV30();

    if (!prov) { selD.disabled = true; showV30AllStats(); return; }
    selD.disabled = false;

    const dists = _v30districts.filter(f => gp(f.properties,'pro_th','PRO_TH','PROVINCE') === prov);
    const names = [...new Set(dists.map(f => gp(f.properties,'amp_th','AMP_TH','DISTRICT')))].filter(Boolean).sort();
    names.forEach(n => { const o=document.createElement('option'); o.value=n; o.textContent=n; selD.appendChild(o); });

    // Show province
    _v30highlightLayer = L.geoJSON(dists, {
      style:{color:'#8e44ad',weight:1.5,fillColor:'#8e44ad',fillOpacity:0.06,dashArray:'4,4'}
    }).addTo(window.map);
    window.map.fitBounds(_v30highlightLayer.getBounds(), {padding:[50,50]});

    // SNP samples
    const snp = window._snpAllData || [];
    const samples = snp.filter(r => dists.some(f => pointInFeature(r._lat, r._lng, f)));
    showV30Samples(prov, samples);
  }

  // ── District change ──
  function onV30District() {
    const prov = document.getElementById('v30-province').value;
    const dist = document.getElementById('v30-district').value;
    const selS = document.getElementById('v30-subdistrict');
    selS.innerHTML = '<option value="">— ทั้งเขต/อำเภอ —</option>';
    clearV30();

    if (!prov) return;
    if (!dist) { selS.disabled = true; onV30Province(); return; }

    selS.disabled = false;

    // Populate subdistricts
    const subs = _v30subdistricts.filter(f => {
      const p = f.properties;
      return gp(p,'pro_th','PRO_TH','PROVINCE')===prov && gp(p,'amp_th','AMP_TH','DISTRICT')===dist;
    });
    const subNames = [...new Set(subs.map(f => gp(f.properties,'tam_th','TAM_TH','SUBDISTRICT')))].filter(Boolean).sort();
    subNames.forEach(n => { const o=document.createElement('option'); o.value=n; o.textContent=n; selS.appendChild(o); });

    // Highlight district
    const feat = _v30districts.find(f => {
      const p=f.properties;
      return gp(p,'pro_th','PRO_TH','PROVINCE')===prov && gp(p,'amp_th','AMP_TH','DISTRICT')===dist;
    });
    if (!feat) return;

    _v30highlightLayer = L.geoJSON(feat, {
      style:{color:'#8e44ad',weight:3,fillColor:'#8e44ad',fillOpacity:0.12}
    }).addTo(window.map);

    // Show subdistrict boundaries
    if (subs.length > 0) {
      _v30subdLayer = L.geoJSON(subs, {
        style:{color:'#c39bd3',weight:0.8,fillColor:'transparent',fillOpacity:0,dashArray:'3,3'},
        onEachFeature:(feature,layer) => {
          const name = gp(feature.properties,'tam_th','TAM_TH','SUBDISTRICT');
          layer.bindTooltip(`<b>${name}</b>`,{sticky:true,direction:'top'});
          layer.on('click',() => {
            selS.value = name;
            onV30Subdistrict();
          });
        }
      }).addTo(window.map);
    }

    window.map.fitBounds(_v30highlightLayer.getBounds(), {padding:[50,50]});

    const snp = window._snpAllData || [];
    const samples = snp.filter(r => pointInFeature(r._lat, r._lng, feat));
    showV30Samples(dist, samples);
  }

  // ── Subdistrict change ──
  function onV30Subdistrict() {
    const prov = document.getElementById('v30-province').value;
    const dist = document.getElementById('v30-district').value;
    const sub = document.getElementById('v30-subdistrict').value;
    clearV30();

    if (!prov || !dist) return;
    if (!sub) { onV30District(); return; }

    const feat = _v30subdistricts.find(f => {
      const p=f.properties;
      return gp(p,'pro_th','PRO_TH','PROVINCE')===prov && gp(p,'amp_th','AMP_TH','DISTRICT')===dist && gp(p,'tam_th','TAM_TH','SUBDISTRICT')===sub;
    });
    if (!feat) return;

    _v30highlightLayer = L.geoJSON(feat, {
      style:{color:'#a569bd',weight:3,fillColor:'#a569bd',fillOpacity:0.15}
    }).addTo(window.map);
    window.map.fitBounds(_v30highlightLayer.getBounds(), {padding:[50,50]});

    const snp = window._snpAllData || [];
    const samples = snp.filter(r => pointInFeature(r._lat, r._lng, feat));
    showV30Samples(`${sub} · ${dist}`, samples);
  }

  // ── Events ──
  function bindV30Events() {
    const p = document.getElementById('v30-province');
    const d = document.getElementById('v30-district');
    const s = document.getElementById('v30-subdistrict');
    if (p) p.addEventListener('change', onV30Province);
    if (d) d.addEventListener('change', onV30District);
    if (s) s.addEventListener('change', onV30Subdistrict);
  }

  // ── Init ──
  setTimeout(() => {
    bindV30Events();
    loadV30();
    updateScalePreview();
  }, 6000);

})();

// ── Auth Login/Logout ──
async function doAuthLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const pass = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  errEl.style.display = 'none';
  if (!email || !pass) { errEl.textContent = 'กรุณากรอก email และ password'; errEl.style.display = 'block'; return; }
  try {
    const result = await window.fbAuthLogin(email, pass);
    if (result && result.success) {
      updateAuthUI();
    } else {
      errEl.textContent = (result && result.error) || 'Login ไม่สำเร็จ';
      errEl.style.display = 'block';
    }
  } catch(e) {
    errEl.textContent = e.message || 'เกิดข้อผิดพลาด';
    errEl.style.display = 'block';
  }
}

async function doAuthLogout() {
  try {
    if (window.fbAuthLogout) await window.fbAuthLogout();
    else if (window._fbAuth) { const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'); await signOut(window._fbAuth); }
    window._fbUser = null;
    updateAuthUI();
  } catch(e) { console.warn('Logout error:', e); }
}

function updateAuthUI() {
  const loggedIn = !!(window._fbUser);
  const outEl = document.getElementById('auth-logged-out');
  const inEl = document.getElementById('auth-logged-in');
  const emailEl = document.getElementById('auth-user-email');
  if (outEl) outEl.style.display = loggedIn ? 'none' : 'block';
  if (inEl) inEl.style.display = loggedIn ? 'flex' : 'none';
  if (emailEl && window._fbUser) emailEl.textContent = window._fbUser.email || 'admin';
  // Clear password field
  const passEl = document.getElementById('auth-pass');
  if (passEl) passEl.value = '';
}

// Listen for auth state changes
(function() {
  const checkAuth = setInterval(function() {
    if (window._fbAuth) {
      clearInterval(checkAuth);
      updateAuthUI();
    }
  }, 1000);
})();

// ── V30 Panel Toggle ──
function toggleV30Panel() {
  const p = document.getElementById('v30-panel');
  const b = document.getElementById('v30-tab-btn');
  p.classList.toggle('open');
  b.classList.toggle('active', p.classList.contains('open'));
}

// ── Color Scale Controls ──
// Store custom scale params globally
window._frcScale = { min: 0, max: 2.0, warn: 0.2, good: 0.5 };
window._ecScale  = { min: 0, max: 1200, lo: 200, hi: 500 };

function updateScalePreview() {
  // FRC preview
  const frcBar = document.getElementById('frc-scale-preview');
  if (frcBar) {
    const min = parseFloat(document.getElementById('frc-scale-min').value) || 0;
    const max = parseFloat(document.getElementById('frc-scale-max').value) || 2;
    let grad = '';
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const v = min + (max - min) * i / steps;
      grad += (i > 0 ? ',' : '') + frcColor(v, 1);
    }
    frcBar.style.background = `linear-gradient(to right,${grad})`;
  }
  // EC preview
  const ecBar = document.getElementById('ec-scale-preview');
  if (ecBar) {
    const min = parseFloat(document.getElementById('ec-scale-min').value) || 0;
    const max = parseFloat(document.getElementById('ec-scale-max').value) || 1200;
    let grad = '';
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const v = min + (max - min) * i / steps;
      grad += (i > 0 ? ',' : '') + ecColorContour(v, 1);
    }
    ecBar.style.background = `linear-gradient(to right,${grad})`;
  }
}

function applyFrcScale() {
  const min = parseFloat(document.getElementById('frc-scale-min').value);
  const max = parseFloat(document.getElementById('frc-scale-max').value);
  const warn = parseFloat(document.getElementById('frc-scale-warn').value);
  const good = parseFloat(document.getElementById('frc-scale-good').value);
  window._frcScale = { min, max, warn, good };

  // Patch frcColor to use new scale — override the clamp
  const origFrcColor = window._origFrcColor || frcColor;
  if (!window._origFrcColor) window._origFrcColor = frcColor;

  window.frcColor = function(v, a) {
    // Remap v from [min,max] to [0,2.0] for the original function
    const mapped = (v - min) / (max - min) * 2.0;
    return origFrcColor(mapped, a || 1);
  };

  // Rebuild contour
  if (typeof redrawContour === 'function') redrawContour(0);
  
  updateScalePreview();
  console.log('[V30] ✅ FRC scale applied:', window._frcScale);
}

function applyEcScale() {
  const min = parseFloat(document.getElementById('ec-scale-min').value);
  const max = parseFloat(document.getElementById('ec-scale-max').value);
  const lo = parseFloat(document.getElementById('ec-scale-lo').value);
  const hi = parseFloat(document.getElementById('ec-scale-hi').value);

  // Update EC_CONFIG which controls the contour
  if (typeof EC_CONFIG !== 'undefined') {
    EC_CONFIG.lo = lo;
    EC_CONFIG.hi = hi;
    EC_CONFIG.yMax = max;
    EC_CONFIG.yMin = min;
  }
  window._ecScale = { min, max, lo, hi };

  // Rebuild contour
  if (typeof redrawContour === 'function') redrawContour(0);
  
  updateScalePreview();
  console.log('[V30] ✅ EC scale applied:', window._ecScale);
}

function resetScales() {
  // Reset FRC
  document.getElementById('frc-scale-min').value = 0;
  document.getElementById('frc-scale-max').value = 2.0;
  document.getElementById('frc-scale-warn').value = 0.2;
  document.getElementById('frc-scale-good').value = 0.5;
  if (window._origFrcColor) window.frcColor = window._origFrcColor;
  window._frcScale = { min: 0, max: 2.0, warn: 0.2, good: 0.5 };

  // Reset EC
  document.getElementById('ec-scale-min').value = 0;
  document.getElementById('ec-scale-max').value = 1200;
  document.getElementById('ec-scale-lo').value = 200;
  document.getElementById('ec-scale-hi').value = 500;
  if (typeof EC_CONFIG !== 'undefined') {
    EC_CONFIG.lo = 200; EC_CONFIG.hi = 500; EC_CONFIG.yMax = 400; EC_CONFIG.yMin = 0;
  }
  window._ecScale = { min: 0, max: 1200, lo: 200, hi: 500 };

  // Rebuild
  if (typeof redrawContour === 'function') redrawContour(0);
  
  updateScalePreview();
  console.log('[V30] 🔄 Scales reset to default');
}

// Preview update on input change
document.querySelectorAll('.v30-scale-section input').forEach(inp => {
  inp.addEventListener('input', updateScalePreview);
});

// ══════════════════════════════════════════════════════════════════════════════
// Data Source Status Bar — แสดงสถานะ FRC / RTU
// ══════════════════════════════════════════════════════════════════════════════
(function(){
  const STATUS_FRESH = 15 * 60 * 1000;  // 15 นาที = fresh
  const STATUS_STALE = 30 * 60 * 1000;  // 30 นาที = stale

  window._dsStatus = { frc: null, rtu: null, dma: null };

  function setDot(id, state) {
    const dot = document.getElementById(id + '-dot');
    const label = document.getElementById(id);
    if (!dot || !label) return;
    const colors = { live: '#4CAF50', stale: '#FFC107', offline: '#666' };
    dot.style.background = colors[state] || colors.offline;
    // pulse animation for live
    dot.style.animation = state === 'live' ? 'pulse 2s infinite' : 'none';
  }

  function updateStatusBar() {
    const now = Date.now();

    // FRC Sensors
    if (window.SENSORS && window.SENSORS.length > 0) {
      const frcCount = window.SENSORS.filter(s => s.frc !== null && s.frc !== undefined && Number(s.frc) > 0).length;
      if (frcCount > 0) {
        window._dsStatus.frc = now;
        window._dsFrcCount = frcCount;
        setDot('ds-frc', 'live');
      }
    }

    // RTU
    if (window._rtuLive && window._rtuLive.length > 0) {
      window._dsStatus.rtu = now;
      setDot('ds-rtu', 'live');
    }

    // Update time
    const timeEl = document.getElementById('ds-time');
    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'});
  }

  // Poll status every 30 seconds
  setInterval(updateStatusBar, 30000);
  // Initial update after 10 seconds (wait for SENSORS to load)
  setTimeout(updateStatusBar, 10000);
  // Update again after 30 seconds for safe measure
  setTimeout(updateStatusBar, 30000);


  window.showStatusDetail = function() {
    const frc = window._dsFrcCount || (window.SENSORS ? window.SENSORS.filter(s => Number(s.frc) > 0).length : 0);
    const total = window.SENSORS ? window.SENSORS.length : 61;
    const rtu = window._rtuLive ? window._rtuLive.length : 0;

    alert(
      `📊 Data Source Status\n\n` +
      `🟣 FRC Sensors: ${frc}/${total} สถานี (Firebase real-time)\n` +
      `🔵 RTU Pressure: ${rtu} สถานี (Live ทุก 5 นาที)`
    );
  };
})();

// ═══════════ [12/12] DASHBOARD — GISTDA-style landing view (v38.0) ═══════════
let DASH_GROUP = 'src';    // 'src' = ค่าต้นทางสถานีสูบจ่าย | 'avg' = เฉลี่ยพื้นที่อิทธิพล (ต้นทาง+ปลายทาง)
let _dashChart = null;
let _dashLastTab = 'dash';
let _dashRows = [];
let _dashHilite = null;
let _dashSelKey = null;

function _dashFitHome() {
  try {
    map.fitBounds([[13.45, 100.25], [14.10, 100.97]]);
    setTimeout(() => { try { map.setZoom(map.getZoom() + 0.5); } catch (e) {} }, 60);   // เต็มกรอบ
  } catch (e) {}
}
function setTab(tab) {
  if (tab === 'forecast') {
    if (document.body.classList.contains('dash-mode')) setTab('map');   // view สะอาดก่อน
    setTimeout(() => { if (typeof openForecastBar === 'function') openForecastBar(); }, 260);
    _flashTab('mtab-forecast'); return;
  }
  if (tab === 'report') {
    if (typeof openReport === 'function') openReport();
    _flashTab('mtab-report'); return;
  }
  _dashLastTab = tab;
  document.body.classList.toggle('dash-mode', tab === 'dash');
  document.querySelectorAll('.mtab').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('mtab-' + tab);
  if (btn) btn.classList.add('active');
  setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 160);
  if (tab === 'dash') {
    setTimeout(() => { try {
      if (_dashHilite) map.fitBounds(_dashHilite.getBounds(), { padding: [24, 24] });
      else _dashFitHome();
    } catch (e) {} }, 220);
    buildDashboard();
  }
}

function dashOpenWhatIf() {
  if (document.body.classList.contains('dash-mode')) setTab('map');    // Cl₂ จำลองบนแผนที่เต็ม
  setTimeout(() => { if (typeof toggleWhatIfPanel === 'function') toggleWhatIfPanel(); }, 260);
  _flashTab('mtab-cl2');
}
function dashOpen3D() {
  if (typeof open3DTerrain === 'function') open3DTerrain();
  _flashTab('mtab-3d');
}
function _flashTab(id) {
  const b = document.getElementById(id); if (!b) return;
  b.classList.add('active');
  setTimeout(() => { b.classList.remove('active');
    const cur = document.getElementById('mtab-' + _dashLastTab); if (cur) cur.classList.add('active'); }, 600);
}
function setDashGroup(g) {
  DASH_GROUP = g;
  document.getElementById('dash-grp-src').classList.toggle('on', g === 'src');
  document.getElementById('dash-grp-avg').classList.toggle('on', g === 'avg');
  buildDashboard();
}

// ── param helpers: แดชบอร์ดตามโหมด FRC / EC ──
function _dIsEc() { return typeof PARAM_MODE !== 'undefined' && PARAM_MODE === 'ec'; }
function _dVal(s) { return _dIsEc() ? (s.ec != null ? s.ec : null) : (s.frc != null ? s.frc : null); }
function _dCol(v) {
  if (!_dIsEc()) return frcColor(v);
  return v >= 400 ? '#ef4444' : v >= 300 ? '#f97316' : v >= 250 ? '#eab308' : v >= 200 ? '#22c55e' : v >= 150 ? '#14b8a6' : '#3b82f6';
}
function _dUnit() { return _dIsEc() ? 'µS/cm' : 'mg/L'; }
function _dFmt(v) { return _dIsEc() ? Math.round(v) : v.toFixed(2); }

// ── Zone influence polygon ต่อสถานีสูบจ่าย: CUSTOM_ZONES → STA_POLYS ที่ครอบสถานี ──
let _dashPolyMap = null;
function _dashZonePoly(src) {
  const sid = String(src.id);
  const cz = window.CUSTOM_ZONES || {};
  if (cz[sid] && cz[sid].coords && cz[sid].coords.length >= 3) return cz[sid].coords;
  for (const k in cz) {
    const z = cz[k];
    if (k.startsWith('VC')) continue;
    if (z.coords && z.coords.length >= 3 && _pip(src.lat, src.lon, z.coords)) return z.coords;
  }
  for (let i = 0; i < STA_POLYS.length; i++) {
    if (_pip(src.lat, src.lon, STA_POLYS[i].coords)) return STA_POLYS[i].coords;
  }
  return null;
}
function _dashRebuildPolyMap() {
  _dashPolyMap = {};
  for (const src of _dashSources()) _dashPolyMap[String(src.id)] = _dashZonePoly(src);
}

// ── สังกัด: โซนอิทธิพล (polygon → ใกล้สุด) / สาขา (area → fallback lookup ตามชื่อ) ──
function _dashZoneOf(m) {
  if (!_dashPolyMap) _dashRebuildPolyMap();
  const hits = [];
  for (const [sid, poly] of Object.entries(_dashPolyMap)) {
    if (poly && _pip(m.lat, m.lon, poly)) hits.push(sid);
  }
  const _d2 = sid => {
    const s = SENSORS.find(x => String(x.id) === String(sid));
    return s ? (s.lat - m.lat) ** 2 + (s.lon - m.lon) ** 2 : Infinity;
  };
  if (hits.length) return hits.sort((a, b) => _d2(a) - _d2(b))[0];  // polygon ซ้อน → ต้นทางใกล้สุด
  const sources = _dashSources();
  let best = null, bd = Infinity;
  for (const s of sources) {
    const d = (s.lat - m.lat) ** 2 + (s.lon - m.lon) ** 2;
    if (d < bd) { bd = d; best = String(s.id); }
  }
  return best || '?';
}

function _dashKeyOf(m) { return _dashZoneOf(m); }
function _dashMonitors() {
  return SENSORS.filter(s => s.type === 'monitor' && _dVal(s) != null && isFinite(_dVal(s)));
}
function _dashAllStations() {   // ทุกสถานีที่มีค่า (monitor + pump/plant) — ใช้กับภาพรวม/เฝ้าระวัง
  return SENSORS.filter(s => _dVal(s) != null && isFinite(_dVal(s)));
}
function _dashSources() {
  return SENSORS.filter(s => _SOURCE_TYPES.has(s.type));
}
function _dashMembers(key) { return _dashMonitors().filter(m => _dashKeyOf(m) === key); }
function _dashZoneName(sid) {
  const s = SENSORS.find(x => String(x.id) === String(sid));
  if (!s) return sid;
  return String(s.name || sid).replace(/^สถานีสูบจ่ายน้ำ/, '').replace(/^สถานีสูบส่งน้ำ/, '').trim() || sid;
}

function _dashStats() {
  _dashRebuildPolyMap();
  const all = _dashAllStations();
  const n = all.length;
  const vals = all.map(_dVal).sort((a, b) => a - b);
  const avg = n ? vals.reduce((a, b) => a + b, 0) / n : 0;
  const med = n ? vals[Math.floor(n / 2)] : 0;
  const isEc = _dIsEc();
  const pass = all.filter(m => isEc ? _dVal(m) < 300 : _dVal(m) >= 0.2).length;
  const watch = all.filter(m => isEc ? _dVal(m) >= 300 : _dVal(m) < 0.3)
    .sort((a, b) => isEc ? _dVal(b) - _dVal(a) : _dVal(a) - _dVal(b));

  // แถว = สถานีสูบจ่าย/โรงงานครบทุกแห่ง · เฉลี่ยพื้นที่ = ต้นทาง + สถานีรับน้ำ (ตามเจตนา: พื้นที่ข้างสถานีใช้ต้นทางเป็นตัวแทน)
  const monitors = _dashMonitors();
  const memberMap = {};
  for (const m of monitors) { const k = _dashKeyOf(m); (memberMap[k] = memberMap[k] || []).push(m); }
  const gRows = _dashSources().map(src => {
    const key = String(src.id);
    const mem = memberMap[key] || [];
    const srcVal = _dVal(src);
    const pool = (srcVal != null ? [srcVal] : []).concat(mem.map(_dVal));
    const combAvg = pool.length ? pool.reduce((a, b) => a + b, 0) / pool.length : null;
    const bar = DASH_GROUP === 'src' ? (srcVal != null ? srcVal : combAvg) : combAvg;
    return { key, label: _dashZoneName(key), srcVal, avg: combAvg,
      min: pool.length ? Math.min(...pool) : null, max: pool.length ? Math.max(...pool) : null,
      n: mem.length, bar, lat: src.lat, lon: src.lon };
  }).filter(r => r.bar != null && isFinite(r.bar));
  gRows.sort((a, b) => _dIsEc() ? b.bar - a.bar : a.bar - b.bar);
  return { n, pass, avg, med, watch, gRows };
}

function buildDashboard() {
  if (!document.body.classList.contains('dash-mode')) return;
  if (!SENSORS || !SENSORS.length) return;
  const st = _dashStats();
  _dashRows = st.gRows;
  const isEc = _dIsEc();
  const U = _dUnit();

  // ── donut ──
  const pct = st.n ? Math.round(st.pass / st.n * 100) : 0;
  const R = 44, C = 2 * Math.PI * R;
  const col = pct >= 95 ? '#16a34a' : pct >= 85 ? '#84cc16' : pct >= 70 ? '#f59e0b' : '#dc2626';
  document.querySelector('#dash-summary h4').innerHTML = isEc ? '⚡ ภาพรวมความนำไฟฟ้า (EC)' : '💧 ภาพรวมคุณภาพน้ำ (FRC)';
  document.getElementById('dash-donut').innerHTML =
    `<circle cx="55" cy="55" r="${R}" fill="none" stroke="#eef2f7" stroke-width="11"/>` +
    `<circle cx="55" cy="55" r="${R}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round"` +
    ` stroke-dasharray="${(pct / 100 * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 55 55)"/>` +
    `<text x="55" y="51" text-anchor="middle" font-size="19" font-weight="800" fill="#1e3a5f" font-family="JetBrains Mono,monospace">${pct}%</text>` +
    `<text x="55" y="68" text-anchor="middle" font-size="9" fill="#94a3b8">${isEc ? 'เกณฑ์ดี' : 'ผ่านเกณฑ์'}</text>`;
  document.getElementById('dash-donut-stats').innerHTML = isEc
    ? `EC &lt; 300 ${U}: <b>${st.pass}/${st.n}</b> สถานี<br>เฉลี่ยทั้งระบบ: <b>${Math.round(st.avg)}</b> ${U}<br>มัธยฐาน: <b>${Math.round(st.med)}</b> ${U}`
    : `ผ่าน ≥0.2 ${U}: <b>${st.pass}/${st.n}</b> สถานี<br>เฉลี่ยทั้งระบบ: <b>${st.avg.toFixed(2)}</b> ${U}<br>มัธยฐาน: <b>${st.med.toFixed(2)}</b> ${U}`;

  // ── watchlist ──
  document.querySelector('#dash-watch h4').innerHTML =
    `⚠️ สถานีเฝ้าระวัง <span class="dash-meta" id="dash-watch-meta"></span>`;
  document.getElementById('dash-watch-meta').textContent =
    (isEc ? 'EC ≥ 300 ' + U : 'FRC < 0.3 ' + U) + ' · ' + st.watch.length + ' สถานี';
  const wl = document.getElementById('dash-watch-list');
  wl.innerHTML = st.watch.length ? st.watch.map(m =>
    `<div class="dw-item" onclick="dashGoto(${m.lat},${m.lon})">` +
    `<span class="dw-name">${(m.name || m.id)}</span>` +
    `<span class="dw-val" style="color:${_dCol(_dVal(m))}">${_dFmt(_dVal(m))}</span></div>`).join('')
    : `<div class="dw-empty">✅ ทุกสถานีอยู่ในเกณฑ์ดี</div>`;

  // ── system card ──
  const rtuN = SENSORS.filter(s => s.rtuPressure > 0).length;
  const tf = window._tempKFactor || 1;
  document.getElementById('dash-model').innerHTML =
    `<h4>🧪 สถานะระบบ</h4>` +
    `<div style="font-size:11px;line-height:2;color:#475569;">` +
    `สถานะข้อมูล: <b style="color:${(typeof apiStatus !== 'undefined' && apiStatus === 'live') ? '#16a34a' : '#d97706'}">${(typeof apiStatus !== 'undefined' && apiStatus === 'live') ? '● Live' : '⚠ ' + (typeof apiStatus !== 'undefined' ? apiStatus : '-')}</b>` +
    ` · RTU→sensor: <b>${rtuN}/${SENSORS.length}</b><br>` +
    `🌡 อุณหภูมิระบบ: <b>${window._sysTempC ? window._sysTempC + '°C' : '–'}</b> · K factor: <b>×${tf.toFixed(2)}</b>${tf === 1 ? ' (OFF)' : ''}<br>` +
    `แหล่งจ่าย: Kb 0.778 บข. / 0.400 มส. (กนว.32/2566)</div>`;

  // ── zone cards ──
  document.getElementById('dash-zones').innerHTML = st.gRows.map(g => {
    const v = g.bar;
    const c = _dCol(v);
    const frac = Math.min(isEc ? v / 500 : v / 1.5, 1);
    const sub = DASH_GROUP === 'src'
      ? (g.n ? `รับน้ำ ${g.n} สถานี · เฉลี่ยพื้นที่ ${_dFmt(g.avg)}` : 'ยังไม่มีจุดตรวจปลายทาง')
      : (g.n ? `ต้นทาง ${g.srcVal != null ? _dFmt(g.srcVal) : '–'} · รับน้ำ ${g.n} สถานี` : `ใช้ค่าต้นทาง (ไม่มีจุดตรวจปลายทาง)`);
    return `<div class="dz-card${String(g.key) === String(_dashSelKey) ? ' sel' : ''}" onclick="dashSelectZone('${String(g.key).replace(/'/g, "\\'")}')">` +
      `<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="13" fill="none" stroke="#eef2f7" stroke-width="5"/>` +
      `<circle cx="17" cy="17" r="13" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(frac * 81.7).toFixed(1)} 81.7" transform="rotate(-90 17 17)"/></svg>` +
      `<div class="dz-info"><div class="dz-name">${g.label}</div><div class="dz-sub">${sub}</div></div>` +
      `<span class="dz-val" style="color:${c}">${_dFmt(v)}</span></div>`;
  }).join('');

  // ── legend ในกรอบแผนที่ ──
  try {
    const lg = document.getElementById('dash-map-legend');
    if (lg) {
      const bands = isEc
        ? [[100,'<150'],[175,'200'],[225,'250'],[275,'300'],[350,'400'],[450,'≥400']]
        : [[0.1,'<0.2'],[0.25,'0.3'],[0.4,'0.5'],[0.65,'0.8'],[1.0,'1.2'],[1.35,'≥1.2']];
      lg.innerHTML =
        `<div class="dl-title">มาตราส่วนสี ${isEc ? 'EC (µS/cm)' : 'FRC (mg/L)'}</div>` +
        `<div class="dl-bar">${bands.map(b => `<span style="background:${_dCol(b[0])}"></span>`).join('')}</div>` +
        `<div class="dl-labels">${bands.map(b => `<span>${b[1]}</span>`).join('')}</div>`;
    }
  } catch (e) {}

  // ── bar chart ──
  document.getElementById('dash-chart-title').textContent =
    `📊 ${isEc ? 'EC' : 'FRC'} รายพื้นที่อิทธิพล — ${DASH_GROUP === 'src' ? 'ค่าต้นทางสถานีสูบจ่าย' : 'เฉลี่ยทั้งพื้นที่ (ต้นทาง+ปลายทาง)'} (${U})`;
  document.getElementById('dash-updated').textContent =
    'ปรับปรุงล่าสุด: ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  try {
    const labels = st.gRows.map(g => g.label);
    const data = st.gRows.map(g => +(isEc ? Math.round(g.bar) : g.bar.toFixed(2)));
    const colors = st.gRows.map(g => _dCol(g.bar));
    if (_dashChart) {
      _dashChart.data.labels = labels; _dashChart.data.datasets[0].data = data;
      _dashChart.data.datasets[0].backgroundColor = colors; _dashChart.update('none');
    } else {
      const ctx = document.getElementById('dash-chart').getContext('2d');
      _dashChart = new Chart(ctx, { type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 5, maxBarThickness: 26 }] },
        options: { responsive: true, maintainAspectRatio: false,
          onClick: (e, els) => { if (els && els[0] != null && _dashRows[els[0].index]) dashSelectZone(_dashRows[els[0].index].key); },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' เฉลี่ย ' + c.parsed.y + ' ' + _dUnit() + ' (คลิกเพื่อดูรายละเอียด)' } } },
          scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 } } },
                    x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 30 } } } } });
    }
  } catch (e) { console.warn('[Dash] chart:', e.message); }
}

// ── เลือกโซน: กรอบพื้นที่อิทธิพล + การ์ดรายละเอียด (ต้นทาง + สถานีรับน้ำ) ──
function dashSelectZone(key) {
  if (String(key) === String(_dashSelKey)) { _dashClearSelect(); buildDashboard(); return; }  // กดซ้ำ = ยกเลิก
  const row = _dashRows.find(r => String(r.key) === String(key));
  if (!row) return;
  _dashSelKey = key;
  if (_dashHilite) { try { map.removeLayer(_dashHilite); } catch (e) {} _dashHilite = null; }
  let bounds = null;
  window._dashClipCoords = null;
  if (!_dashPolyMap) _dashRebuildPolyMap();
  const zonePoly = _dashPolyMap[String(key)];
  if (zonePoly && zonePoly.length > 2) {
    _dashHilite = L.polygon(zonePoly,
      { color: '#1d4ed8', weight: 4, fillOpacity: 0, opacity: 1 }).addTo(map);   // เส้นทึบ ไม่ทับสี contour
    bounds = _dashHilite.getBounds();
    window._dashClipCoords = zonePoly;                     // contour เฉพาะในโซน
  } else {
    const members = _dashMembers(key);
    const src = SENSORS.find(x => String(x.id) === String(key));
    const pts = members.map(m => [m.lat, m.lon]);
    if (src) pts.push([src.lat, src.lon]);
    if (pts.length) {
      bounds = L.latLngBounds(pts).pad(0.35);
      _dashHilite = L.rectangle(bounds, { color: '#1d4ed8', weight: 4, fillOpacity: 0, opacity: 1 }).addTo(map);
      const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
      window._dashClipCoords = [[sw.lat, sw.lng], [sw.lat, ne.lng], [ne.lat, ne.lng], [ne.lat, sw.lng]];
    }
  }
  try { redrawContour(0); } catch (e) {}
  if (bounds) { try { map.fitBounds(bounds, { padding: [28, 28] }); } catch (e) {} }
  _dashRenderDetail(key, row);
  buildDashboard(); // refresh .sel highlight บน card
}
function _dashClearSelect() {
  _dashSelKey = null;
  window._dashClipCoords = null;
  try { redrawContour(0); } catch (e) {}
  if (_dashHilite) { try { map.removeLayer(_dashHilite); } catch (e) {} _dashHilite = null; }
  const d = document.getElementById('dash-detail');
  if (d) d.classList.remove('show');
  if (document.body.classList.contains('dash-mode')) _dashFitHome();
}
function _dashRenderDetail(key, row) {
  const d = document.getElementById('dash-detail');
  if (!d) return;
  const isEc = _dIsEc();
  const members = _dashMembers(key).sort((a, b) => isEc ? _dVal(b) - _dVal(a) : _dVal(a) - _dVal(b));
  let srcHtml = '';
  {
    const src = SENSORS.find(x => String(x.id) === String(key));
    if (src) {
      const sv = _dVal(src);
      srcHtml = `<div class="dd-src"><div><div class="dd-src-name">🏭 ${src.name || key}</div>` +
        `<div class="dash-meta">สถานีสูบจ่ายต้นทาง</div></div>` +
        `<span class="dd-src-val" style="color:${sv != null ? _dCol(sv) : '#94a3b8'}">${sv != null ? _dFmt(sv) : '–'}</span></div>`;
    }
  }
  d.innerHTML =
    `<button class="dd-close" onclick="_dashClearSelect()">✕</button>` +
    `<h4>📍 ${row.label}</h4>` + srcHtml +
    `<div class="dd-note">▧ กรอบเส้นสีน้ำเงินบนแผนที่ = พื้นที่อิทธิพลสูบจ่าย (contour แสดงเฉพาะในกรอบ)</div>` +
    `<div class="dash-meta" style="margin-bottom:4px;">${members.length ? 'สถานีรับน้ำ ' + members.length + ' แห่ง · เฉลี่ยพื้นที่ (รวมต้นทาง) ' + _dFmt(row.avg) + ' ' + _dUnit() : 'ยังไม่มีจุดตรวจปลายทางในพื้นที่นี้ — ใช้ค่าสถานีต้นทางเป็นตัวแทน'}</div>` +
    members.map(m =>
      `<div class="dw-item" onclick="dashGoto(${m.lat},${m.lon})">` +
      `<span class="dw-name">${m.name || m.id}</span>` +
      `<span class="dw-val" style="color:${_dCol(_dVal(m))}">${_dFmt(_dVal(m))}</span></div>`).join('');
  d.classList.add('show');
}

function dashGoto(lat, lon) {
  setTab('map');
  setTimeout(() => { try { map.flyTo([lat, lon], 13.5); } catch (e) {} }, 200);
}

// popup เปิดบนแดชบอร์ด → หุบบาร์ชาร์ต + ขยายแผนที่เต็มลงล่าง (ปิดแล้วคืน)
map.on('popupopen', e => {
  if (!document.body.classList.contains('dash-mode')) return;
  document.body.classList.add('dash-popup');
  setTimeout(() => { try { map.invalidateSize(); if (e.popup && e.popup.update) e.popup.update(); } catch (x) {} }, 80);
});
map.on('popupclose', () => {
  if (!document.body.classList.contains('dash-popup')) return;
  document.body.classList.remove('dash-popup');
  setTimeout(() => { try { map.invalidateSize(); } catch (x) {} }, 80);
});

// ESC = ล้างการเลือกโซน
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && _dashSelKey) { _dashClearSelect(); buildDashboard(); }
});

// boot: หน้าแรก = แดชบอร์ด — ซูมเต็มกรอบตั้งแต่เปิด (ระดับเดียวกับกดแท็บ)
setTimeout(() => { try {
  buildDashboard();
  if (document.body.classList.contains('dash-mode')) _dashFitHome();
} catch (e) { console.warn('[Dash] boot:', e.message); } }, 1800);
