/* ═══════════════════════════════════════════════════════════════════════════
   stakeholder_floor5.js — Stakeholder Day · ชั้น 5 อาคารสำนักงานใหญ่ กปน.
   ─ ฉาก 3 มิติคุณภาพสูง (three.js r160 + GTAO) แยกจากแผนที่: อาคารสุทธิอุทกากร 12 ชั้น แยกชั้น → ชั้น 5
   ─ ผังตามภาพร่าง (11.5 px ≈ 1 ม.) · บูธ กปน. ผ้าตึง 3 ม. · บูธเอกชน 2 × 1 ม. · ทัวร์ทีละส่วน (ส่วนอื่นจางลง)
   ใช้:  window.MWA_FLOOR5.play({ onDone })   ·  .stop()  ·  .isOn()
   ═══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ───────────────────────────── ข้อมูลผัง ─────────────────────────────
const PXM = 11.5, OX = 1082, OY = 547;                     // ภาพร่าง: 11.5 px ≈ 1 ม. (ขยายจากร่างแรก ให้โล่งขึ้น) · จุดกลางชั้น
const K = 14 / PXM;                                         // ตัวคูณสำหรับค่าที่กำหนดเป็นเมตรไว้ตอนใช้ 14 px/ม.
const X = px => (px - OX) / PXM, Z = py => (py - OY) / PXM;
const FX0 = X(600), FX1 = X(1565), FZ0 = Z(185), FZ1 = Z(910); // ขอบชั้น ≈ 84 × 63 ม.
const FW = FX1 - FX0, FD = FZ1 - FZ0;
const FH = 4.2, NF = 12, F5 = 4;                           // ความสูงชั้น · 12 ชั้น · ชั้น 5 (index 4)
const WALL_H = 3.0, AUD_H = 4.4, WT = 0.22;

// ลิฟต์ → ลงทะเบียน → ทางเดิน กปน. → นิทรรศการ กปน. (ทางเดินเหนือ) → ห้องแสดงบริษัทพันธมิตร (ครึ่งห้องฝั่งตะวันออก) เข้าประตูตะวันออก ออกประตูตะวันตก → Auditorium
const ROUTE_PX = [[829, 884], [806, 884], [806, 742], [932, 742], [932, 392], [1355, 392], [1355, 269], [1131, 269], [1131, 418], [1310, 418], [1310, 449], [1168, 449], [1168, 662]];
const ROUTE_E_PX = [[1310, 441], [1310, 449], [1507, 449], [1507, 662]];   // ทางแยกบันไดขวา (ฝั่งตะวันออก) ใน Auditorium
// Auditorium แบบลดระดับ: เข้าประตูหลังที่ระดับพื้น → ทางเดินขวาง → บันไดทางเดินซ้าย/ขวา ลงสู่หน้าเวที (ไม่เดินผ่านแถวที่นั่ง)
const AUD = { x0: 1155, x1: 1520, z0: 435, z1: 755, back: 2.4, rows: 15, rowD: 1.05, rise: 0.15, aisleW: 1.6 };
const AUDm = (() => { const ax0 = X(AUD.x0), ax1 = X(AUD.x1), az0 = Z(AUD.z0), az1 = Z(AUD.z1), zb = az0 + AUD.back;
  return { ax0, ax1, az0, az1, zb, zf: zb + AUD.rows * AUD.rowD, pitY: -AUD.rows * AUD.rise, aW: [ax0 + 0.35, ax0 + 0.35 + AUD.aisleW], aE: [ax1 - 0.35 - AUD.aisleW, ax1 - 0.35] }; })();
function floorY(x, z) {                                     // ระดับพื้น ณ จุด (x, z) · บันไดทางเดิน 2 ขั้นต่อแถว
  const A = AUDm; if (x < A.ax0 || x > A.ax1 || z < A.zb || z > A.az1) return 0;
  if (z >= A.zf) return A.pitY;
  return -(Math.floor((z - A.zb) / (AUD.rowD / 2)) + 1) * AUD.rise / 2;
}

const MWA_BOOTHS = [
  { name: 'TWQ Online', sub: 'ระบบตรวจสอบคุณภาพน้ำประปาออนไลน์', prop: 'cabinet' },
  { name: 'Chlorine Care', sub: 'ระบบเติมคลอรีนอัตโนมัติ', prop: 'dosing' },
  { name: 'คลินิกน้ำสะอาด', sub: 'การประปานครหลวง', prop: 'bottles' },
  { name: 'Water Safety Plan', sub: 'แผนน้ำประปาปลอดภัย', prop: 'screen' },
  { name: 'วารีกุญชร', sub: 'หุ่นยนต์สำรวจคลองส่งน้ำดิบ · Wari Kunchorn', prop: 'screen' },
  { name: 'Snap On', sub: 'อุปกรณ์ช่วยขยายแหวนยางยีโบลท์ ขนาด 300 มม.', prop: 'screen' },
  { name: 'บูธ กปน. 07', sub: 'รอกำหนดหัวข้อ', prop: 'screen', tbc: true },
  { name: 'C.I.A.', sub: 'Camera Intelligence Alert · กล้องอัจฉริยะควบคุมงานวางท่อประปา', prop: 'screen' },
  { name: 'บูธ กปน. 09', sub: 'รอกำหนดหัวข้อ', prop: 'screen', tbc: true },
  { name: 'บูธ กปน. 10', sub: 'รอกำหนดหัวข้อ', prop: 'screen', tbc: true },
];
const PARTNERS = [
  { name: 'Yokogawa', sub: 'เครื่องมือวัดและระบบควบคุม', prop: 'analyzer', col: '#2463b8' },
  { name: 'Petroinstrument', sub: 'เครื่องมือวัดคุณภาพน้ำ', prop: 'sensor', col: '#0d8a7a' },
  { name: 'ProMinent', sub: 'ปั๊มจ่ายสารเคมี', prop: 'dosingP', col: '#1f6f4a' },
  { name: 'DKD', sub: 'เครื่องมือวัดภาคสนาม', prop: 'meter', col: '#7a4bc4' },
  { name: 'UHM', sub: 'มาตรวัดอัตราการไหล', prop: 'flow', col: '#c4602b' },
  { name: 'GF', sub: 'ระบบท่อและวาล์ว', prop: 'pipe', col: '#2b4c7e' },
  { name: 'IWAKI', sub: 'ปั๊มเคมี', prop: 'magpump', col: '#c23b3b' },
  { name: 'HACH', sub: 'เครื่องวิเคราะห์คุณภาพน้ำ', prop: 'lab', col: '#1b7fc4' },
  { name: 'พันธมิตร 09', sub: 'รอยืนยัน', prop: 'box', col: '#5d6b7a', tbc: true },
  { name: 'พันธมิตร 10', sub: 'รอยืนยัน', prop: 'box', col: '#5d6b7a', tbc: true },
  { name: 'พันธมิตร 11', sub: 'รอยืนยัน', prop: 'box', col: '#5d6b7a', tbc: true },
  { name: 'พันธมิตร 12', sub: 'รอยืนยัน', prop: 'box', col: '#5d6b7a', tbc: true },
];
const MWA_COL = ['#1d5fc0', '#0f8fb8', '#14a39a', '#2a6fdb', '#3653c4', '#1d5fc0', '#1d5fc0', '#1d5fc0', '#1d5fc0', '#1d5fc0'];

// ตำแหน่งบูธ (ม.) · face = ทิศหน้าบูธ e/w/n/s · kind = แบบบูธ กปน. ตามภาพงานจริง (กว้าง 3 ม.)
function boothSlots() {
  const S = [];
  const xW = X(885) + WT / 2;                              // ผนังตะวันตกของทางเดิน กปน. (ผนังกระจก)
  // ทางเดิน กปน.: วารีกุญชร · บูธ 06 · บูธ 08 (กลาง) · บูธ 07
  [[645, 4, 'wari'], [585, 5, 'snap'], [530, 7, 'cia'], [475, 6, 'generic']].forEach(([py, i, kind]) => S.push({ own: 'mwa', i, x: xW + (kind === 'wari' ? 1.3 : 0.7), z: Z(py), face: 'e', zone: 'mwa', kind, w: 3, d: kind === 'wari' ? 1.9 : kind === 'snap' ? 2.0 : kind === 'cia' ? 1.6 : 1.3 }));
  // บูธ กปน. 09 · 10 ชิดผนังทางเดินเหนือ (ช่วงหน้าพื้นที่ปิด)
  [[1003, 8], [1075, 9]].forEach(([px, i]) => S.push({ own: 'mwa', i, x: X(px), z: Z(350) + WT / 2 + 0.7, face: 's', zone: 'north', kind: 'generic', w: 3, d: 1.3 }));
  // นิทรรศการ กปน. ชิดผนังทางเดินเหนือ (ระหว่างประตูออก–เข้า ห้องแสดง) เรียงแบบภาพงานจริง: Chlorine Care · WSP · คลินิกน้ำสะอาด · TWQ Online
  const zc = Z(350) + WT / 2 + 0.65, xa = X(1152) + 0.1;
  S.push({ own: 'mwa', i: 1, x: xa + 2.5, z: zc, face: 's', zone: 'north', kind: 'cc', w: 5.0, d: 1.3 });
  S.push({ own: 'mwa', i: 3, x: xa + 6.65, z: zc, face: 's', zone: 'north', kind: 'wsp', w: 3, d: 1.3 });
  S.push({ own: 'mwa', i: 2, x: xa + 9.8, z: zc, face: 's', zone: 'north', kind: 'clinic', w: 3, d: 1.3 });
  S.push({ own: 'mwa', i: 0, x: xa + 13.4, z: zc, face: 's', zone: 'north', kind: 'twq', w: 3.9, d: 1.3 });
  // บริษัทพันธมิตรในห้องแสดง (ครึ่งห้องฝั่งตะวันออก) · บูธ 2 × 1 ม. พร้อมผลิตภัณฑ์จัดแสดง
  const zHN = Z(188) + WT / 2 + 0.5, zHS = Z(350) - WT / 2 - 0.5, x0 = X(1108) + 1.9;
  for (let k = 0; k < 8; k++) S.push({ own: 'p', i: k, x: x0 + k * 3.0, z: zHN, face: 's', zone: 'hall', w: 2, d: 1 });
  for (let k = 0; k < 4; k++) S.push({ own: 'p', i: 8 + k, x: X(1152) + 2.4 + k * 3.7, z: zHS, face: 'n', zone: 'hall', w: 2, d: 1 });
  return S;
}
const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };   // หมุนให้หน้าบูธ (แกน +z ของบูธ) ชี้ไปทิศนั้น
const FACEV = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

// ห้อง (พิกเซลภาพร่าง) · gaps = ประตู [จาก, ถึง] บนผนัง n/s/e/w
const ROOMS = [
  { id: 'dining', zone: 'dining', r: [855, 188, 970, 350], floor: 'wood', gaps: { s: [[895, 935]], n: [[855, 970]], w: [[188, 350]] } },   // ผนังเหนือ/ตะวันตก = กระจกอาคาร (มองเห็นคลองประปา)
  { id: 'hall', zone: 'hall', r: [1108, 188, 1390, 350], floor: 'carpet', gaps: { s: [[1112, 1150], [1335, 1375]] } },
  { id: 'elec', zone: 'other', r: [1397, 188, 1565, 350], floor: 'plain', gaps: { s: [[1460, 1500]] } },
  { id: 'aud', zone: 'aud', r: [1155, 435, 1520, 755], floor: 'aud', gaps: { n: [[1290, 1330]] }, h: AUD_H },
  { id: 'mr1', zone: 'other', r: [603, 463, 675, 522], floor: 'plain', gaps: { e: [[480, 505]] } },
  { id: 'mr2', zone: 'other', r: [603, 557, 675, 615], floor: 'plain', gaps: { e: [[575, 600]] } },
  { id: 'mr3', zone: 'other', r: [603, 648, 675, 707], floor: 'plain', gaps: { e: [[665, 690]] } },
  { id: 'mr4', zone: 'other', r: [623, 768, 725, 897], floor: 'plain', gaps: { e: [[790, 820]] } },
  { id: 'wc', zone: 'other', r: [977, 823, 1078, 908], floor: 'plain', gaps: { w: [[882, 906]] } },
];
const CLOSED = [                                           // พื้นที่ไม่ใช้จัดงาน (ทึบ)
  { r: [972, 188, 1106, 350], t: 'ปิด (ไม่ใช้)' },
  { r: [727, 453, 885, 676], t: 'ส่วนบริการ', core: true }, { r: [600, 523, 602, 556], t: '' },
  { r: [1080, 762, 1565, 910], t: 'พื้นที่สำนักงาน' }, { r: [1522, 352, 1565, 760], t: '' },
  { r: [727, 765, 768, 910], t: '' },
  { r: [600, 708, 676, 766], t: '' }, { r: [832, 765, 940, 786], t: '' },
];
// บล็อกระหว่างทางเดิน กปน. กับ Auditorium (ตามรูป 4): ห้องประชุม 6 ห้อง · ลิฟต์ 2 ตัว · ห้องน้ำชาย/หญิง · ทางเดินภายใน 2 แนว (แสดงไว้ ไม่พาเดิน)
[432, 479, 526, 573, 626, 679].forEach((y, i, a) => { const y1 = a[i + 1] || 761, m = (y + y1) / 2; ROOMS.push({ id: 'mrE' + (i + 1), zone: 'other', r: [958, y, 1002, y1], floor: 'plain', gaps: { w: [[m - 12, m + 12]] }, label: 'ห้องประชุม ' + (i + 5), meet: true }); });
CLOSED.push({ r: [1002, 432, 1044, 526], t: '' }, { r: [1002, 526, 1044, 573], t: 'ลิฟต์', small: true, kind: 'lift' }, { r: [1002, 573, 1044, 620], t: 'ลิฟต์', small: true, kind: 'lift' }, { r: [1002, 620, 1044, 761], t: '' });
ROOMS.push({ id: 'wcm', zone: 'other', r: [1076, 520, 1115, 614], floor: 'wcm', gaps: { w: [[540, 568]] }, label: 'ห้องน้ำชาย', wc: true }, { id: 'wcf', zone: 'other', r: [1076, 614, 1115, 708], floor: 'wcf', gaps: { w: [[660, 688]] }, label: 'ห้องน้ำหญิง', wc: true });
CLOSED.push({ r: [1076, 432, 1115, 520], t: '' }, { r: [1076, 708, 1115, 761], t: '' });
ROOMS.forEach(r => { if (/^mr[1-4]$/.test(r.id)) { r.label = 'ห้องประชุม ' + r.id.slice(2); r.meet = true; } });
const GLASS_WALLS = [];
const EXTRA_WALLS = [[940, 787, 940, 882], [940, 882, 977, 882], [915, 908, 977, 908], [676, 522, 676, 557], [676, 615, 676, 648]];

const ZONES = {
  lobby: { name: 'โถงลิฟต์ · ลงทะเบียน', c: [X(806), Z(830)] },
  mwa: { name: 'ทางเดินนวัตกรรม กปน.', c: [X(932), Z(580)] },
  north: { name: 'นิทรรศการ กปน.', c: [X(1240), Z(400)] },
  hall: { name: 'ห้องแสดง · บริษัทพันธมิตร', c: [X(1250), Z(269)] },
  dining: { name: 'ห้องรับประทานอาหาร', c: [X(912), Z(269)] },
  audf: { name: 'หน้าห้อง Auditorium', c: [X(1420), Z(400)] },
  aud: { name: 'ห้องประชุม Auditorium', c: [X(1337), Z(520)] },
};

// ───────────────────────────── ตัวช่วย ─────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let _seed = 7; const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// มือถือ/แท็บเล็ต: ลดความละเอียด ปิด AO เงาเล็กลงและอัปเดตห่างขึ้น → ลื่นไม่กระตุก
const MOBILE = (() => { try { return (matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 1100) || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); } catch (e) { return false; } })();
const Q_AO = opt => opt.ao != null ? opt.ao !== false : !MOBILE;
const Q_DPR = opt => opt.dpr || (MOBILE ? 1.5 : 2);
const F_HEAD = '"Bai Jamjuree","Noto Sans Thai",sans-serif', F_BODY = '"IBM Plex Sans Thai","Noto Sans Thai",sans-serif';

function shade(hex, k) { const c = new THREE.Color(hex); if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new THREE.Color('#fff'), k); return '#' + c.getHexString(); }
function fitText(g, txt, weight, size, family, maxW) { let s = size; g.font = `${weight} ${s}px ${family}`; while (g.measureText(txt).width > maxW && s > 12) { s -= 2; g.font = `${weight} ${s}px ${family}`; } return s; }
function canvasTex(c, aniso) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso || 8; return t; }
// ไฟล์ภาพจริงข้างหน้าเว็บ (ป้ายบูธ/โลโก้) · ระหว่างโหลดใช้ภาพวาดสำรอง แล้วสลับเป็นภาพจริงเมื่อโหลดเสร็จ
const ASSET_BASE = (window.SUTHI_LOGO || '').replace(/[^/]*$/, '');
// มือถือ: หน่วยความจำภาพ (canvas) รวมเกิน ~250 MB ทำให้ iOS ปิดหน้าเว็บ (เด้งออก) → ย่อภาพไม่เกิน 1024 px แล้วคืนหน่วยความจำหลังส่งขึ้น GPU
const TEX_MAX = 900;
const ui = n => (window.SUI ? window.SUI.i(n) : '');
function smallCanvas(src, maxD) { const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, k = Math.min(1, maxD / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k)); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c; }
function freeAfterUpload(t) { t.onUpdate = () => { const c = t.image; if (c && c.tagName === 'CANVAS' && c.width > 1) { c.width = 1; c.height = 1; } }; }
function textureDiet(scene) {
  const seen = new Set(); let b0 = 0, b1 = 0, n = 0;
  scene.traverse(o => [].concat(o.material || []).forEach(m => { for (const key in m) { const t = m[key];
    if (!t || !t.isTexture || seen.has(t) || t.isRenderTargetTexture || t.isDataTexture) continue; seen.add(t);
    const i = t.image; if (!i || !(i.tagName === 'CANVAS' || i.tagName === 'IMG')) continue;
    if (i.tagName === 'IMG' && !(i.complete && i.naturalWidth)) { freeAfterUpload(t); continue; }
    const w = i.naturalWidth || i.width, h = i.naturalHeight || i.height; if (w * h <= 256 * 256) continue;
    const c = smallCanvas(i, TEX_MAX); b0 += w * h * 4; b1 += c.width * c.height * 4; n++; t.image = c; t.needsUpdate = true; freeAfterUpload(t); } }));
  console.info('[F5] textureDiet', n, 'tex', (b0 / 1048576).toFixed(0), '→', (b1 / 1048576).toFixed(0), 'MB (คืนหลังอัปโหลด)');
}
function realImg(tex, file) { const i = new Image(); i.onload = () => { tex.dispose(); tex.image = MOBILE ? smallCanvas(i, TEX_MAX) : i; tex.needsUpdate = true; };   /* dispose: สร้างพื้นผิวใหม่ตามขนาดภาพจริง */ i.src = ASSET_BASE + file; return tex; }
const REAL_BACKDROP = { twq: ['stakeholder_twq_backdrop.jpg', 1900 / 1733], cc: ['stakeholder_cc_backdrop.jpg', 2576 / 2349] };

// ───────────────────────────── พื้นผิว ─────────────────────────────
function floorCanvas(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const base = { stone: '#dcd8d0', carpet: '#bdc8d2', aud: '#33414f', wood: '#cfae84', plain: '#e2e5e8', wcm: '#d5e6f4', wcf: '#f3dde3' }[kind];
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  const R = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  if (kind === 'stone') {                                  // หินขัดแผ่นใหญ่ 1.2 ม. (1 tile = 512 px)
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${R() < .5 ? '255,255,255' : '120,115,105'},${0.03 + R() * 0.05})`; g.fillRect(R() * 512, R() * 512, 1 + R() * 3, 1 + R() * 3); }
    g.strokeStyle = 'rgba(150,145,135,.55)'; g.lineWidth = 2; g.strokeRect(1, 1, 510, 510);
  } else if (kind === 'carpet' || kind === 'aud') {
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < .5 ? '255,255,255' : '0,0,0'},${0.025 + R() * 0.04})`; g.fillRect(R() * 512, R() * 512, 1, 1 + R() * 2); }
    g.strokeStyle = kind === 'aud' ? 'rgba(0,0,0,.18)' : 'rgba(80,95,110,.14)'; g.lineWidth = 1.5; g.strokeRect(0.75, 0.75, 510.5, 510.5);
  } else if (kind === 'wood') {
    for (let y = 0; y < 512; y += 32) { g.fillStyle = `rgba(90,60,30,${0.05 + R() * 0.06})`; g.fillRect(0, y, 512, 32); g.fillStyle = 'rgba(70,45,25,.25)'; g.fillRect(0, y, 512, 1.5); const o = R() * 512; g.fillRect(o, y, 1.5, 32); }
  } else {
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + R() * 0.03})`; g.fillRect(R() * 512, R() * 512, 2, 2); }
  }
  const t = canvasTex(c, 8); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const TILE = { stone: 1.6, carpet: 2.0, aud: 2.0, wood: 2.4, plain: 2.0, wcm: 0.6, wcf: 0.6 };

function glassCanvas() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#a9d0f0'); gr.addColorStop(0.5, '#5d98d6'); gr.addColorStop(1, '#3c74b8'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, 0, 256, 60);
  g.fillStyle = '#e9f1f7'; for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 5, 256); g.fillRect(0, 170, 256, 4);
  const t = canvasTex(c, 4); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// กราฟิกผนังบูธ 2 × 2.4 ม.
function boothGraphic(b) {
  const W = 1000, H = 1200, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const mwa = b.own === 'mwa', col = b.col;
  const gr = g.createLinearGradient(0, 0, W, H);
  if (mwa) { gr.addColorStop(0, '#0a2f66'); gr.addColorStop(1, col); } else { gr.addColorStop(0, col); gr.addColorStop(1, shade(col, -0.45)); }
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // คลื่นน้ำ
  g.save(); g.globalAlpha = 0.2;
  for (let k = 0; k < 7; k++) { g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = 880 + k * 34 + Math.sin(x / 95 + k * 0.7) * 22; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.restore();
  if (!mwa) { g.fillStyle = 'rgba(255,255,255,.95)'; g.fillRect(0, 0, W, 210); }
  // หัว
  g.fillStyle = mwa ? '#7fd6ff' : col; g.font = `600 44px ${F_BODY}`; g.textBaseline = 'middle';
  g.fillText(mwa ? 'การประปานครหลวง · MWA' : 'PARTNER · บริษัทพันธมิตร', 70, mwa ? 120 : 105);
  // ชื่อ
  g.fillStyle = '#ffffff'; const s = fitText(g, b.name, 700, 150, F_HEAD, W - 140);
  g.textBaseline = 'alphabetic'; g.fillText(b.name, 70, mwa ? 420 : 430);
  g.fillStyle = 'rgba(255,255,255,.85)'; fitText(g, b.sub, 500, 54, F_BODY, W - 140); g.fillText(b.sub, 70, (mwa ? 420 : 430) + Math.max(70, s * 0.6));
  // แถบล่าง
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, H - 120, W, 120);
  g.fillStyle = '#ffffff'; g.font = `700 52px ${F_HEAD}`; g.textBaseline = 'middle'; g.fillText(b.code, 70, H - 60);
  g.font = `500 38px ${F_BODY}`; g.textAlign = 'right'; g.fillText('Stakeholder Day · ชั้น 5', W - 60, H - 60);
  if (b.tbc) { g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.75)'; g.font = `600 46px ${F_BODY}`; g.fillText('(รอยืนยัน)', W / 2, 640); }
  return canvasTex(c, 8);
}
function counterGraphic(b) {
  const c = document.createElement('canvas'); c.width = 600; c.height = 560; const g = c.getContext('2d');
  g.fillStyle = b.own === 'mwa' ? b.col : '#ffffff'; g.fillRect(0, 0, 600, 560);
  if (b.own !== 'mwa') { g.fillStyle = b.col; g.fillRect(0, 0, 600, 90); }
  g.fillStyle = b.own === 'mwa' ? '#ffffff' : '#0f2236'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, b.name, 700, 92, F_HEAD, 520); g.fillText(b.name, 300, 300);
  g.fillStyle = b.own === 'mwa' ? 'rgba(255,255,255,.75)' : b.col; g.font = `600 40px ${F_BODY}`; g.fillText(b.code, 300, 420);
  return canvasTex(c, 8);
}
// ── กราฟิกบูธ กปน. แบบผ้าตึง 3 × 2.4 ม. (ตามภาพงานจริง) ──
function drop(g, x, y, s, flip) {                          // มาสคอตหยดน้ำ (วาดแบบเรียบ)
  g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
  const gr = g.createLinearGradient(0, -120, 0, 110); gr.addColorStop(0, '#7fd0ff'); gr.addColorStop(1, '#1f7fe0');
  g.fillStyle = gr; g.strokeStyle = '#0d4f9e'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(0, -125); g.bezierCurveTo(45, -60, 90, -10, 90, 35); g.arc(0, 35, 90, 0, Math.PI); g.bezierCurveTo(-90, -10, -45, -60, 0, -125); g.fill(); g.stroke();
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(-30, 20, 22, 28, 0, 0, 7); g.ellipse(30, 20, 22, 28, 0, 0, 7); g.fill();
  g.fillStyle = '#0b2f5c'; g.beginPath(); g.arc(-26, 26, 11, 0, 7); g.arc(34, 26, 11, 0, 7); g.fill();
  g.strokeStyle = '#0b2f5c'; g.lineWidth = 7; g.beginPath(); g.arc(4, 58, 26, 0.25, Math.PI - 0.25); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-42, -30, 12, 24, 0.5, 0, 7); g.fill();
  g.restore();
}
function waves(g, W, H, y0, a) { g.save(); g.globalAlpha = a; for (let k = 0; k < 5; k++) { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#4fb4ff'); gr.addColorStop(1, '#1d5fc0'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) g.lineTo(x, y0 + k * 26 + Math.sin(x / 160 + k) * 24); g.lineTo(W, H); g.fill(); } g.restore(); }
const LOGO_IMG = (() => { try { const i = new Image(); i.src = window.SUTHI_LOGO || 'stakeholder_logo.png'; return i; } catch (e) { return null; } })();   // ตรา กปน. จริง (โหลดล่วงหน้า)
function emblem(g, x, y, r) { if (LOGO_IMG && LOGO_IMG.complete && LOGO_IMG.naturalWidth) { g.drawImage(LOGO_IMG, x - r, y - r, r * 2, r * 2); return; } g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.strokeStyle = '#1d5fc0'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(x, y, r * 0.88, 0, 7); g.stroke(); g.fillStyle = '#bfe3f7'; g.beginPath(); g.arc(x, y, r * 0.6, 0, 7); g.fill(); }
function mwaBoothCanvas(kind, b) {
  const W = 1500, H = 1200, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.textBaseline = 'alphabetic';
  const roundTop = () => { g.save(); g.beginPath(); g.moveTo(0, H); g.lineTo(0, 90); g.quadraticCurveTo(0, 0, 90, 0); g.lineTo(W - 90, 0); g.quadraticCurveTo(W, 0, W, 90); g.lineTo(W, H); g.closePath(); g.clip(); };
  roundTop();
  if (kind === 'cc') {
    // ตามป้ายจริง: พื้นน้ำเงินเข้ม · แถบหัวฟ้า "CHLORINE CARE ระบบเติมคลอรีนอัตโนมัติ" · กล่องคำอธิบาย · Web App · ไดอะแกรมระบบ
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1f4fb8'); gr.addColorStop(1, '#0b2f86'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(120,190,255,.35)'; for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) if ((i * 3 + j * 5) % 4) g.fillRect(40 + i * 16, 330 + j * 16, 9, 9);
    const hb = g.createLinearGradient(0, 0, W, 0); hb.addColorStop(0, '#3d9cf0'); hb.addColorStop(1, '#2b7fe0'); g.fillStyle = hb; g.beginPath(); g.roundRect(60, 50, 1230, 170, 40); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.beginPath(); g.arc(160, 135, 62, 0.5, Math.PI * 2 - 0.5); g.stroke(); drop(g, 160, 140, 0.32);
    g.fillStyle = '#ffffff'; g.font = `700 58px ${F_HEAD}`; g.fillText('HLORINE', 225, 120); g.fillText('ARE', 225, 190);
    fitText(g, 'ระบบเติมคลอรีนอัตโนมัติ', 700, 104, F_HEAD, 720); g.fillText('ระบบเติมคลอรีนอัตโนมัติ', 520, 172);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(W - 105, 135, 92, 0, 7); g.fill(); emblem(g, W - 105, 135, 84);
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(190, 250, 780, 250, 18); g.fill(); g.strokeStyle = '#7fb8ee'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#2b7fe0'; g.font = `600 46px ${F_BODY}`; g.fillText('Chlorine Care', 220, 305); g.fillRect(220, 318, 720, 3);
    g.fillStyle = '#26364a'; g.font = `400 22px ${F_BODY}`;
    ['ระบบควบคุมค่าคลอรีนอิสระคงเหลืออัตโนมัติให้ได้ตามเกณฑ์อย่างต่อเนื่อง โดยควบคุม', 'การปรับจ่ายด้วยหลักการ P.I.D. (Proportional Integrated Derivative) ร่วมกับ', 'เซนเซอร์ตรวจวัดคลอรีนอิสระคงเหลือแบบ Polarographic ที่มีระบบทำความสะอาด', 'ชนิด Bead Cleaning พร้อมเทคโนโลยีดิจิทัลสั่งการผ่านเว็บแอปฯ แบบ Real-Time', 'และมีระบบแจ้งเตือนเพิ่มความปลอดภัยในการควบคุมการเติมคลอรีนอัตโนมัติ'].forEach((t, i) => g.fillText(t, 220, 355 + i * 30));
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(1000 + i * 40, 280); g.lineTo(1022 + i * 40, 292); g.lineTo(1000 + i * 40, 304); g.fill(); }
    // แผงล่าง (ไดอะแกรม)
    const pb = g.createLinearGradient(0, 520, 0, H); pb.addColorStop(0, '#e8f3fd'); pb.addColorStop(1, '#a9d1f3'); g.fillStyle = pb; g.beginPath(); g.roundRect(150, 520, 1300, 640, 26); g.fill();
    // Web App: จอ + มือถือ
    g.fillStyle = '#eef4fb'; g.beginPath(); g.roundRect(1040, 430, 400, 300, 18); g.fill(); g.strokeStyle = '#c7d7e8'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#1b2633'; g.beginPath(); g.roundRect(1110, 440, 170, 44, 8); g.fill(); g.fillStyle = '#fff'; g.font = `600 18px ${F_BODY}`; g.fillText('Chlorine Care', 1140, 460); g.fillText('Web Application', 1128, 479);
    g.fillStyle = '#2b3440'; g.fillRect(1060, 505, 240, 150); g.fillStyle = '#f6f9fc'; g.fillRect(1066, 511, 228, 138); g.fillStyle = '#2b3440'; g.fillRect(1160, 655, 40, 30); g.fillRect(1130, 683, 100, 8);
    g.fillStyle = '#3d9cf0'; g.fillRect(1072, 520, 100, 8); for (let i = 0; i < 4; i++) { g.fillStyle = ['#2b7fe0', '#36b24a', '#f2b632', '#e04848'][i]; g.beginPath(); g.arc(1110 + i * 45, 590, 12, 0, 7); g.fill(); }
    g.fillStyle = '#2b3440'; g.beginPath(); g.roundRect(1320, 490, 100, 200, 14); g.fill(); g.fillStyle = '#f6f9fc'; g.fillRect(1328, 505, 84, 170); g.strokeStyle = '#2b7fe0'; g.lineWidth = 3; g.beginPath(); g.moveTo(1332, 640); for (let i = 0; i < 9; i++) g.lineTo(1336 + i * 9, 620 - Math.sin(i) * 14); g.stroke();
    g.strokeStyle = '#b05ec0'; g.lineWidth = 4; g.beginPath(); g.moveTo(870, 700); g.lineTo(1030, 700); g.stroke(); g.fillStyle = '#b05ec0'; g.font = `700 34px ${F_HEAD}`; g.fillText('((·))', 905, 680);
    // ตู้ควบคุม
    g.fillStyle = '#1b2633'; g.beginPath(); g.roundRect(600, 545, 210, 44, 8); g.fill(); g.fillStyle = '#fff'; g.font = `600 18px ${F_BODY}`; g.fillText('Control Cabinet', 640, 565); g.fillText('PLC & IOT Router', 632, 583);
    g.fillStyle = '#b9c2cb'; g.fillRect(625, 600, 160, 210); g.fillStyle = '#7d8892'; g.fillRect(637, 612, 136, 186);
    g.fillStyle = '#1b2633'; g.fillRect(650, 625, 50, 22); g.fillRect(710, 625, 50, 22);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { g.fillStyle = ['#e04848', '#36b24a', '#e04848', '#1b2633'][j]; g.beginPath(); g.arc(660 + j * 30, 670 + i * 32, 9, 0, 7); g.fill(); } g.fillStyle = '#e04848'; g.beginPath(); g.arc(705, 780, 13, 0, 7); g.fill();
    // เส้นควบคุม P.I.D. (เขียว) · ท่อจ่ายสาร (ส้ม) · ท่อน้ำ (น้ำเงิน)
    g.strokeStyle = '#2f9a52'; g.lineWidth = 4; g.beginPath(); g.moveTo(625, 700); g.lineTo(380, 700); g.lineTo(380, 860); g.moveTo(785, 760); g.lineTo(1260, 760); g.lineTo(1260, 900); g.stroke();
    g.fillStyle = '#26364a'; g.font = `500 26px ${F_BODY}`; g.fillText('P.I.D. Control', 400, 690);
    g.strokeStyle = '#f0a040'; g.lineWidth = 9; g.beginPath(); g.moveTo(410, 900); g.lineTo(410, 830); g.lineTo(700, 830); g.stroke(); g.fillStyle = '#f0a040'; g.beginPath(); g.moveTo(700, 815); g.lineTo(725, 830); g.lineTo(700, 845); g.fill();
    g.strokeStyle = '#2b7fe0'; g.lineWidth = 9; g.beginPath(); g.moveTo(725, 830); g.lineTo(1260, 830); g.moveTo(780, 830); g.lineTo(780, 960); g.moveTo(1130, 830); g.lineTo(1130, 1080); g.lineTo(1430, 1080); g.moveTo(170, 1080); g.lineTo(560, 1080); g.lineTo(560, 990); g.stroke();
    g.fillStyle = '#2b3440'; g.beginPath(); g.moveTo(1430, 1062); g.lineTo(1452, 1080); g.lineTo(1430, 1098); g.fill();
    // ถังน้ำ
    const tw = g.createLinearGradient(0, 960, 0, 1060); tw.addColorStop(0, '#62b2ef'); tw.addColorStop(1, '#2b7fe0'); g.fillStyle = tw; g.fillRect(590, 960, 470, 100); g.strokeStyle = '#1b2633'; g.lineWidth = 3; g.strokeRect(590, 940, 470, 120);
    g.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(640 + i * 72, 975); g.lineTo(656 + i * 72, 995); g.lineTo(624 + i * 72, 995); g.fill(); }
    // ถังสาร NaOCl + ปั๊มจ่าย
    g.fillStyle = '#5ab0f0'; g.beginPath(); g.ellipse(410, 990, 70, 26, 0, 0, 7); g.fill(); g.fillRect(340, 990, 140, 90); g.fillStyle = '#ffffff'; g.font = `800 34px ${F_HEAD}`; g.fillText('NaOCl', 362, 1050);
    g.fillStyle = '#2b5fae'; g.beginPath(); g.roundRect(370, 900, 80, 60, 12); g.fill();
    g.fillStyle = '#1b2633'; g.beginPath(); g.roundRect(455, 880, 120, 60, 8); g.fill(); g.fillStyle = '#fff'; g.font = `600 20px ${F_BODY}`; g.fillText('Dosing', 478, 905); g.fillText('Pump', 485, 928);
    g.fillStyle = '#26364a'; g.font = `500 22px ${F_BODY}`; g.fillText('Level', 490, 1010); g.fillText('Sensor', 485, 1034); g.fillText('Level', 650, 930); g.fillText('Sensor', 645, 954);
    // เครื่องวิเคราะห์ + ปั๊มหมุนเวียน
    g.fillStyle = '#2b5fae'; g.beginPath(); g.roundRect(1225, 900, 70, 90, 10); g.fill(); g.fillStyle = '#d7ecfb'; g.fillRect(1236, 912, 48, 30);
    g.fillStyle = '#1b2633'; g.beginPath(); g.roundRect(1310, 900, 150, 56, 8); g.fill(); g.fillStyle = '#fff'; g.font = `600 17px ${F_BODY}`; g.fillText('Free Residual', 1330, 922); g.fillText('Chlorine Analyzer', 1318, 944);
    g.fillStyle = '#3a4a5c'; g.beginPath(); g.ellipse(1130, 1030, 34, 22, 0, 0, 7); g.fill();
    g.fillStyle = '#1b2633'; g.beginPath(); g.roundRect(1175, 1005, 170, 56, 8); g.fill(); g.fillStyle = '#fff'; g.font = `600 17px ${F_BODY}`; g.fillText('Circulation Pump', 1192, 1027); g.fillText('(Sampling Pump)', 1192, 1049);
    for (const [t, x] of [['Inlet', 210], ['Outlet', 1300]]) { g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x, 1100, 120, 40, 6); g.fill(); g.fillStyle = '#26364a'; g.font = `500 22px ${F_BODY}`; g.fillText(t, x + 30, 1128); }
  } else if (kind === 'wsp') {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#eaf5ff'); gr.addColorStop(1, '#bfe0fb'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    waves(g, W, H, 1010, 0.6);
    g.fillStyle = '#1d5fc0'; fitText(g, 'เส้นทางน้ำประปาดื่มได้', 700, 120, F_HEAD, 1050); g.fillText('เส้นทางน้ำประปาดื่มได้', 110, 190);
    g.fillStyle = '#5b86b8'; g.font = `500 40px ${F_BODY}`; g.fillText('Water Safety Plan · Quality Water for Quality Living', 110, 250);
    emblem(g, W - 110, 120, 70);
    const cols = ['#7fb36a', '#4f8fc9', '#c2d7e8', '#89a6c0', '#6aa3d8', '#a8c890', '#5b7a99', '#d8c7a0'];
    const lbl = ['ต้นน้ำ', 'ผลิต', 'ส่งจ่าย', 'เฝ้าระวัง', 'ห้องปฏิบัติการ', 'ถึงก๊อก', 'ประเมินความเสี่ยง', 'ทบทวนแผน'];
    for (let i = 0; i < 8; i++) { const x = 110 + (i % 4) * 330, y = 320 + Math.floor(i / 4) * 330; g.fillStyle = '#ffffff'; g.fillRect(x - 8, y - 8, 286, 236); g.fillStyle = cols[i]; g.fillRect(x, y, 270, 170);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(x, y + 170); g.lineTo(x + 90, y + 90); g.lineTo(x + 160, y + 140); g.lineTo(x + 270, y + 60); g.lineTo(x + 270, y + 170); g.fill();
      g.fillStyle = '#1d4f9e'; g.font = `600 30px ${F_BODY}`; g.fillText(lbl[i], x + 6, y + 210); }
    drop(g, 1290, 900, 0.75);
  } else if (kind === 'clinic') {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#d9efff'); gr.addColorStop(1, '#8cc8f5'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc((i * 337) % W, (i * 211) % 700, 14 + (i % 5) * 9, 0, 7); g.fill(); }
    waves(g, W, H, 1000, 0.5);
    g.fillStyle = '#1d5fc0'; fitText(g, 'คลินิกน้ำสะอาด', 700, 170, F_HEAD, 900); g.fillText('คลินิกน้ำสะอาด', 110, 270);
    g.fillStyle = '#0d3f86'; g.font = `800 130px ${F_HEAD}`; g.fillText('MWA', 110, 410);
    g.fillStyle = '#2d6ab8'; g.font = `500 52px ${F_BODY}`; g.fillText('Clean Water Clinic', 110, 480);
    g.fillStyle = '#1d5fc0'; g.beginPath(); g.roundRect(110, 530, 520, 70, 35); g.fill(); g.fillStyle = '#fff'; g.font = `600 34px ${F_BODY}`; g.fillText('MWACleanwaterclinic', 150, 578);
    drop(g, 1000, 470, 1.25); drop(g, 1270, 520, 1.05, true);
  } else if (kind === 'twq') {
    // ตามป้ายจริง: แถบหัวฟ้า · แผนที่เขตบริการ (ฟ้าอ่อน) + หมุดค่าคลอรีน · URL + มาสคอต · ภาพหอถัง/อาคารเดิม/อาคารใหม่ด้านล่าง
    const hg = g.createLinearGradient(0, 0, 0, 230); hg.addColorStop(0, '#3a9ae8'); hg.addColorStop(1, '#2b86dc'); g.fillStyle = hg; g.fillRect(0, 0, W, 230);
    g.fillStyle = '#fff'; g.textAlign = 'center'; fitText(g, 'Tap Water Quality Monitoring System', 700, 92, F_HEAD, 1380); g.fillText('Tap Water Quality Monitoring System', W / 2, 110);
    fitText(g, 'ระบบตรวจสอบคุณภาพน้ำประปาออนไลน์', 700, 84, F_HEAD, 1250); g.fillText('ระบบตรวจสอบคุณภาพน้ำประปาออนไลน์', W / 2, 205); g.textAlign = 'left';
    g.fillStyle = '#efe9dc'; g.fillRect(0, 230, W, 870);                              // พื้นแผนที่
    g.strokeStyle = 'rgba(200,120,110,.35)'; g.lineWidth = 3; let sd = 11; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 22; i++) { g.beginPath(); const y = 240 + R() * 850; g.moveTo(0, y); g.bezierCurveTo(500, y + (R() - .5) * 200, 1000, y + (R() - .5) * 200, W, y + (R() - .5) * 120); g.stroke(); }
    g.strokeStyle = 'rgba(200,120,110,.25)'; for (let i = 0; i < 14; i++) { g.beginPath(); const x = R() * W; g.moveTo(x, 230); g.lineTo(x + (R() - .5) * 300, 1100); g.stroke(); }
    // เขตบริการ: ตารางเบี้ยวในขอบเขต
    g.save(); g.beginPath(); g.moveTo(250, 290); g.lineTo(560, 250); g.lineTo(980, 300); g.lineTo(1260, 360); g.lineTo(1290, 700); g.lineTo(1200, 950); g.lineTo(900, 1020); g.lineTo(560, 990); g.lineTo(330, 900); g.lineTo(230, 640); g.closePath(); g.clip();
    const cols = ['#b7d6f0', '#a3cbed', '#c7e0f4', '#8fbfe8', '#d2e7f7'];
    for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) { const x = 200 + i * 125 + (R() - .5) * 40, y = 240 + j * 120 + (R() - .5) * 40; g.fillStyle = cols[Math.floor(R() * cols.length)]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 130 + R() * 20, y + (R() - .5) * 30); g.lineTo(x + 125, y + 125 + R() * 20); g.lineTo(x - 5, y + 120); g.closePath(); g.fill(); g.strokeStyle = 'rgba(90,110,140,.55)'; g.lineWidth = 2; g.stroke(); }
    g.restore();
    // หมุดค่า FRC
    const pin = (x, y, v, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x, y - 46); g.bezierCurveTo(x + 22, y - 20, x + 26, y - 6, x + 26, y + 4); g.arc(x, y + 4, 26, 0, Math.PI); g.bezierCurveTo(x - 26, y - 6, x - 22, y - 20, x, y - 46); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y + 4, 19, 0, 7); g.fill(); g.fillStyle = '#1b2633'; g.font = `600 17px ${F_BODY}`; g.textAlign = 'center'; g.fillText(v, x, y + 10); g.textAlign = 'left'; };
    for (let i = 0; i < 58; i++) { const x = 300 + R() * 920, y = 340 + R() * 620; pin(x, y, (0.27 + R() * 1.38).toFixed(2), '#7fbf6a'); }
    pin(1060, 560, '0.00', '#e05a5a'); g.fillStyle = '#8a929b'; g.beginPath(); g.arc(1030, 610, 22, 0, 7); g.arc(1110, 660, 22, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(420, 270, 560, 70, 35); g.fill(); g.strokeStyle = '#c9d6e2'; g.lineWidth = 3; g.stroke(); g.fillStyle = '#1b2633'; g.font = `600 40px ${F_BODY}`; g.fillText('https://twqonline.mwa.co.th', 452, 320);
    g.fillStyle = '#3b4a5a'; g.beginPath(); g.roundRect(1000, 262, 52, 90, 8); g.fill(); g.fillStyle = '#7fbf6a'; g.fillRect(1006, 272, 40, 70); drop(g, 1110, 300, 0.42);
    // ภาพอาคารด้านล่าง
    g.fillStyle = '#2b86dc'; g.fillRect(0, 1100, W, 100); g.fillStyle = '#7fbfee'; g.fillRect(0, 1088, W, 14);
    g.fillStyle = '#e9edf1'; g.fillRect(70, 700, 200, 400); g.fillStyle = '#d3d9df'; g.fillRect(70, 700, 200, 24); g.fillRect(70, 1060, 200, 40); emblem(g, 170, 830, 80);         // หอถังสูง
    g.fillStyle = '#f4f6f8'; g.fillRect(320, 900, 520, 200); g.fillRect(520, 860, 120, 240);                                                                         // อาคารเดิม
    for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 3 ? '#2b5fae' : '#5fa6e6'; g.fillRect(338 + i * 50, 925 + j * 52, 34, 36); }
    g.fillStyle = '#2b5fae'; g.fillRect(545, 880, 70, 60); g.beginPath(); g.arc(580, 872, 20, 0, 7); g.fillStyle = '#5fa6e6'; g.fill(); g.fillStyle = '#1b2633'; g.fillRect(552, 1040, 56, 60);
    g.fillStyle = '#7fae5a'; for (const x of [310, 860]) { g.fillRect(x, 1000, 10, 100); g.beginPath(); g.arc(x + 5, 995, 34, 0, 7); g.fill(); }
    g.fillStyle = '#2b5fae'; g.fillRect(900, 880, 380, 220); for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i * j) % 4 ? '#3d78c8' : '#8fc4f0'; g.fillRect(910 + i * 30, 895 + j * 46, 24, 38); }   // อาคารใหม่
    g.fillStyle = '#245ca8'; g.fillRect(1280, 640, 110, 460); for (let j = 0; j < 14; j++) for (let i = 0; i < 4; i++) { g.fillStyle = '#4f8fd8'; g.fillRect(1288 + i * 26, 680 + j * 29, 20, 22); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 12; g.beginPath(); g.arc(1335, 600, 34, 0, 7); g.stroke();
    g.fillStyle = '#7fae5a'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(940 + i * 48, 1080, 22, 0, 7); g.fill(); }
  } else if (kind === 'wari') {
    // ป้าย "WARI KUNCHORN · RAW WATER CANAL SURVEY ROBOT" (ตามภาพงานจริง)
    g.fillStyle = '#f6f7f8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0d2a4f'; g.font = `800 130px ${F_HEAD}`; g.fillText('วารีกุญชร', 70, 150);
    g.fillStyle = '#c9961a'; fitText(g, 'หุ่นยนต์สำรวจคลองส่งน้ำดิบ', 700, 60, F_HEAD, 1050); g.fillText('หุ่นยนต์สำรวจคลองส่งน้ำดิบ', 70, 225);
    g.fillStyle = '#4a5a6c'; g.font = `500 32px ${F_BODY}`; g.fillText('WARI KUNCHORN · Raw Water Canal Survey Robot', 70, 272);
    // ธงเยอรมนี + เหรียญรางวัล
    [['#1b1b1b', 0], ['#dd2a2a', 1], ['#f2c230', 2]].forEach(([c2, i]) => { g.fillStyle = c2; g.fillRect(1180, 50 + i * 45, 270, 45); });
    g.fillStyle = '#c9ced4'; g.beginPath(); g.arc(1300, 420, 120, 0, 7); g.fill(); g.strokeStyle = '#8f98a2'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#2c3a4a'; g.textAlign = 'center'; g.font = `800 52px ${F_HEAD}`; g.fillText('iENA', 1300, 410); g.font = `600 28px ${F_BODY}`; g.fillText('2022', 1300, 450);
    g.font = `700 30px ${F_HEAD}`; g.fillStyle = '#0d2a4f'; g.fillText('SILVER MEDAL', 1300, 590); g.font = `500 24px ${F_BODY}`; g.fillText('& SPECIAL AWARDS · Nuremberg, Germany', 1300, 625); g.textAlign = 'left';
    // คำอธิบาย + ไอคอนคุณสมบัติ
    emblem(g, 120, 360, 55); g.fillStyle = '#c9a54a'; g.beginPath(); g.arc(250, 360, 55, 0, 7); g.fill(); g.fillStyle = '#2d6ab8'; g.beginPath(); g.arc(380, 360, 55, 0, 7); g.fill();
    g.fillStyle = '#4a5a6c'; g.font = `400 26px ${F_BODY}`;
    ['An innovative unmanned surface vehicle designed for raw water', 'source survey with a sonar depth measurement, IoT technology', 'and connected devices for real-time monitoring and safety.'].forEach((t, i) => g.fillText(t, 60, 470 + i * 34));
    ['DEPTH\nMEASUREMENT', 'SAFE-PROOF\nSURVEY', 'IoT &\nREMOTE', 'EASY\nOPERATION'].forEach((t, i) => { const x = 60 + i * 120; g.fillStyle = '#0d2a4f'; g.beginPath(); g.arc(x + 45, 620, 38, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.font = `700 30px ${F_HEAD}`; g.textAlign = 'center'; g.fillText('✓', x + 45, 632);
      g.fillStyle = '#0d2a4f'; g.font = `600 17px ${F_BODY}`; t.split('\n').forEach((l, j) => g.fillText(l, x + 45, 685 + j * 20)); g.textAlign = 'left'; });
    // ภาพเรือบนผิวน้ำ + เมืองนูเรมเบิร์ก (ภาพประกอบเรียบ)
    const ix = 540, iy = 300, iw = 600, ih = 420;
    const sky = g.createLinearGradient(0, iy, 0, iy + ih); sky.addColorStop(0, '#cfe3f3'); sky.addColorStop(0.55, '#e8f1f8'); sky.addColorStop(0.56, '#3f78a8'); sky.addColorStop(1, '#2b5d8a'); g.fillStyle = sky; g.fillRect(ix, iy, iw, ih);
    g.fillStyle = '#9b7b5e'; [[20, 120, 70], [100, 90, 40], [150, 150, 55], [230, 110, 45], [300, 170, 60], [380, 100, 50], [450, 140, 70], [530, 120, 50]].forEach(([dx, h, w]) => { g.fillRect(ix + dx, iy + ih * 0.55 - h, w, h); g.beginPath(); g.moveTo(ix + dx, iy + ih * 0.55 - h); g.lineTo(ix + dx + w / 2, iy + ih * 0.55 - h - 40); g.lineTo(ix + dx + w, iy + ih * 0.55 - h); g.fill(); });
    g.fillStyle = '#e9dfc6'; g.fillRect(ix + 170, iy + 300, 260, 34); g.fillRect(ix + 150, iy + 334, 300, 24); g.fillStyle = '#1e3550'; g.fillRect(ix + 200, iy + 255, 200, 14); g.fillStyle = '#2c4a78'; g.fillRect(ix + 190, iy + 240, 220, 16);
    g.strokeStyle = '#c9ced4'; g.lineWidth = 6; g.strokeRect(ix, iy, iw, ih);
    // คอลัมน์ขวา + แถบล่าง
    g.fillStyle = '#0d2a4f'; g.font = `700 26px ${F_HEAD}`; ['ACCURATE & EFFICIENT SURVEY', 'IoT TECHNOLOGY', 'USER-FRIENDLY SYSTEM', 'COST-EFFECTIVE'].forEach((t, i) => { g.fillText('▸ ' + t, 1180, 720 + i * 62); });
    g.fillStyle = '#0d2a4f'; g.fillRect(0, 1040, W, 160); g.fillStyle = '#ffffff'; g.font = `700 44px ${F_HEAD}`; g.fillText('INTERNATIONAL RECOGNITION', 70, 1130); g.font = `500 30px ${F_BODY}`; g.fillText('การประปานครหลวง · Metropolitan Waterworks Authority', 760, 1128);
  } else if (kind === 'cia') {
    // ป้าย C.I.A. (ตามภาพงานจริง): พื้นน้ำเงิน · หัวข้อ C.I.A. · ธงไทย-ไต้หวัน + เหรียญเงิน Taiwan Innotech Expo 2022 · ตึกไทเป 101 · ไอคอนระบบ · CIA Machine / CIA System
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1543a8'); gr.addColorStop(0.6, '#0d2f7c'); gr.addColorStop(1, '#081d52'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120,190,255,.16)'; g.lineWidth = 3; for (let i = 0; i < 14; i++) { const y = 80 + i * 78; g.beginPath(); g.moveTo(0, y); g.lineTo(220 + (i * 137) % 400, y); g.lineTo(260 + (i * 137) % 400, y + 40); g.lineTo(W, y + 40); g.stroke(); g.fillStyle = 'rgba(120,190,255,.3)'; g.beginPath(); g.arc(260 + (i * 137) % 400, y + 40, 6, 0, 7); g.fill(); }
    g.fillStyle = '#ffffff'; g.font = `900 190px ${F_HEAD}`; g.fillText('C.I.A.', 60, 200);
    g.fillStyle = '#ffd23a'; g.font = `700 50px ${F_HEAD}`; g.fillText('(CAMERA INTELLIGENCE ALERT)', 66, 262);
    g.fillStyle = '#7fd6ff'; fitText(g, 'ระบบกล้องอัจฉริยะควบคุมงานวางท่อประปา', 700, 46, F_HEAD, 820); g.fillText('ระบบกล้องอัจฉริยะควบคุมงานวางท่อประปา', 66, 325);
    g.fillStyle = '#ffffff'; g.font = `500 28px ${F_BODY}`; ['AI (Deep Learning · CNN) ตรวจจับการปิด–เปิดฝาท่อ ตามหลักน้ำประปาปลอดภัย (WSP)', 'แจ้งเตือนทันทีเมื่อพบงานวางท่อไม่ได้มาตรฐาน'].forEach((t, i) => g.fillText(t, 66, 378 + i * 38));
    // ธงไทย + ธงไต้หวัน + เหรียญเงิน
    const flag = (x, y, th) => { g.fillStyle = '#9aa4ae'; g.fillRect(x - 6, y - 10, 5, 140); if (th) { [['#d6252b', 0, 1], ['#ffffff', 1, 1], ['#2b3a8c', 2, 2], ['#ffffff', 4, 1], ['#d6252b', 5, 1]].forEach(([c2, a, n]) => { g.fillStyle = c2; g.fillRect(x, y + a * 13, 120, n * 13); }); }
      else { g.fillStyle = '#d6252b'; g.fillRect(x, y, 120, 80); g.fillStyle = '#1e3d9e'; g.fillRect(x, y, 60, 40); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + 30, y + 20, 11, 0, 7); g.fill(); } };
    flag(1000, 70, true); flag(1160, 70, false);
    g.fillStyle = '#d9dee4'; g.beginPath(); g.arc(1340, 120, 88, 0, 7); g.fill(); g.strokeStyle = '#9aa4ae'; g.lineWidth = 8; g.stroke(); g.fillStyle = '#5c6670'; g.textAlign = 'center'; g.font = `800 34px ${F_HEAD}`; g.fillText('SILVER', 1340, 115); g.fillText('MEDAL', 1340, 150); g.textAlign = 'left';
    g.fillStyle = '#ffffff'; g.font = `700 38px ${F_HEAD}`; g.fillText('Taiwan Innotech Expo 2022', 1000, 260); g.font = `500 28px ${F_BODY}`; g.fillStyle = '#bfe3ff'; g.fillText('(TIE 2022) · TAIPEI, TAIWAN', 1000, 300);
    g.fillStyle = 'rgba(160,210,255,.35)'; g.beginPath(); g.moveTo(1380, 640); for (let k = 0; k < 8; k++) { g.lineTo(1352 + k * 3, 640 - k * 34); g.lineTo(1408 - k * 3, 640 - k * 34); } g.lineTo(1380, 330); g.lineTo(1408, 640); g.fill();   // ไทเป 101
    // ไอคอนระบบ 7 ช่อง
    [['4G', '#1d9be0'], ['AI', '#111827'], ['◉', '#10b0a8'], ['▣', '#2a6fdb'], ['APP', '#2a6fdb'], ['🔔', '#f2a81b'], ['☰', '#6b7a8c']].forEach(([t, c2], i) => { const x = 80 + i * 120, y = 480;
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(x, y, 96, 96, 20); g.fill(); g.fillStyle = c2; g.font = `800 ${t.length > 2 ? 30 : 46}px ${F_HEAD}`; g.textAlign = 'center'; g.fillText(t, x + 48, y + 64); g.textAlign = 'left'; });
    // CIA Machine (ภาพ) · CIA System (แดชบอร์ด + มือถือ)
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(60, 620, 1380, 380, 30); g.fill();
    g.fillStyle = '#9aa4ae'; g.fillRect(205, 660, 10, 230); g.fillStyle = '#d6252b'; g.fillRect(196, 640, 28, 26); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(230, 700, 24, 0, 7); g.fill(); g.fillStyle = '#1b1f26'; g.beginPath(); g.arc(230, 712, 14, 0, 7); g.fill();
    g.fillStyle = '#1f7fe0'; g.beginPath(); g.roundRect(130, 880, 190, 80, 30); g.fill(); g.fillStyle = '#26364a'; g.fillRect(170, 870, 90, 16); g.fillStyle = '#ffffff'; g.font = `700 34px ${F_HEAD}`; g.fillText('CIA Machine', 110, 990);
    g.fillStyle = '#1b1f26'; g.beginPath(); g.roundRect(520, 650, 560, 320, 18); g.fill(); g.fillStyle = '#eef3f8'; g.fillRect(540, 668, 520, 270);
    g.fillStyle = '#c9e3c0'; g.fillRect(620, 700, 280, 230); g.fillStyle = '#7fb6e6'; g.beginPath(); g.moveTo(620, 880); g.quadraticCurveTo(760, 860, 900, 930); g.lineTo(620, 930); g.fill();
    for (let k = 0; k < 9; k++) { g.fillStyle = k % 3 ? '#22b07a' : '#f2a81b'; g.beginPath(); g.arc(700 + (k * 37) % 150, 760 + (k * 29) % 110, 9, 0, 7); g.fill(); }
    g.fillStyle = '#d6252b'; g.fillRect(915, 690, 40, 30); g.fillStyle = '#2a6fdb'; g.fillRect(960, 690, 40, 30); g.fillStyle = '#22b07a'; g.fillRect(1005, 690, 40, 30);
    g.fillStyle = '#f27aa6'; g.beginPath(); g.arc(980, 790, 42, 0, 7); g.fill(); g.fillStyle = '#2a6fdb'; for (let k = 0; k < 8; k++) g.fillRect(915 + k * 17, 900 - (k * 23) % 60, 12, 30 + (k * 23) % 60);
    g.fillStyle = '#1b1f26'; g.beginPath(); g.roundRect(1160, 650, 170, 320, 22); g.fill(); g.fillStyle = '#f4f7fb'; g.fillRect(1172, 672, 146, 276); emblem(g, 1245, 740, 44); g.fillStyle = '#2a6fdb'; g.fillRect(1190, 880, 110, 26);
    g.fillStyle = '#ffffff'; g.font = `700 34px ${F_HEAD}`; g.fillText('CIA System · Private Cloud', 600, 1000 - 2);
    g.fillStyle = '#081d52'; g.fillRect(0, 1040, W, 160); emblem(g, 110, 1120, 58); g.fillStyle = '#ffffff'; g.font = `700 40px ${F_HEAD}`; g.fillText('ควบคุมงานวางท่อได้ทั่วถึงและมีมาตรฐาน · จ่ายน้ำสะอาดบริการประชาชน', 195, 1112);
    g.font = `500 26px ${F_BODY}`; g.fillStyle = '#9fd0ff'; g.fillText('การประปานครหลวง · MWA change for better', 195, 1155);
  } else if (kind === 'snap') {
    // ป้าย "นวัตกรรม SNAP ON" (ตามภาพงานจริง): พื้นน้ำเงินเข้มลายเมือง · หัวข้อขาวตัวใหญ่ · ตรานวัตกรรมเพื่อความปลอดภัย · ภาพอุปกรณ์ + สว่านแดง · ประโยชน์ 4 ข้อ
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#f4f7fb'); gr.addColorStop(0.42, '#e3ecf6'); gr.addColorStop(0.43, '#0c2a5c'); gr.addColorStop(1, '#071a3d'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(29,95,192,.10)'; for (let i = 0; i < 26; i++) { const h = 90 + (i * 53) % 260, x = 640 + i * 34; g.fillRect(x, 500 - h, 26, h); }          // เส้นขอบฟ้าเมือง
    g.fillStyle = 'rgba(120,170,230,.22)'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, 560 + (i * 61) % 600, 3, 3);
    g.fillStyle = '#4a5a6c'; g.font = `600 44px ${F_HEAD}`; g.fillText('นวัตกรรม', 70, 100);
    g.fillStyle = '#0d1f3c'; g.font = `900 170px ${F_HEAD}`; g.fillText('SNAP ON', 60, 260);
    g.fillStyle = '#d6252b'; for (let i = 0; i < 5; i++) g.fillRect(780 + i * 22, 205 + i * 9, 120 - i * 18, 7);                      // ขีดความเร็ว
    g.fillStyle = '#0d1f3c'; g.fillRect(60, 300, 900, 64); g.fillStyle = '#ffffff'; fitText(g, 'อุปกรณ์ช่วยขยายแหวนยางยีโบลท์ ขนาด 300 มม.', 600, 40, F_HEAD, 860); g.fillText('อุปกรณ์ช่วยขยายแหวนยางยีโบลท์ ขนาด 300 มม.', 80, 345);
    g.fillStyle = '#26364a'; g.font = `500 28px ${F_BODY}`; ['“ ถ่างแหวนยางสำหรับใส่ยีโบลท์ ให้งานซ่อมท่อรวดเร็ว', 'เพิ่มประสิทธิภาพ ลดภาระการทำงาน ปลอดภัยในพื้นที่จำกัดหน้างาน ”'].forEach((t, i) => g.fillText(t, 70, 420 + i * 38));
    // ตรา "นวัตกรรมเพื่อความปลอดภัย"
    g.fillStyle = '#0d1f3c'; g.beginPath(); g.arc(W - 130, 130, 92, 0, 7); g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(W - 130, 130, 80, 0, 7); g.stroke();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(W - 130, 82); g.lineTo(W - 92, 98); g.quadraticCurveTo(W - 92, 160, W - 130, 182); g.quadraticCurveTo(W - 168, 160, W - 168, 98); g.closePath(); g.fill();
    g.fillStyle = '#0d1f3c'; g.font = `800 40px ${F_HEAD}`; g.textAlign = 'center'; g.fillText('✓', W - 130, 145); g.fillStyle = '#0d1f3c'; g.font = `600 24px ${F_BODY}`; g.fillText('นวัตกรรมเพื่อความปลอดภัย', W - 130, 262); g.textAlign = 'left';
    // ภาพอุปกรณ์ (วงแหวน + ซี่) + สว่านไร้สายสีแดง
    const dx = 1130, dy = 430; g.strokeStyle = '#1b1b1f'; g.lineWidth = 22; g.beginPath(); g.ellipse(dx, dy, 110, 150, 0, 0, 7); g.stroke();
    g.strokeStyle = '#c8d0d8'; g.lineWidth = 12; g.beginPath(); g.ellipse(dx, dy, 86, 120, 0, 0, 7); g.stroke();
    g.lineWidth = 9; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + Math.cos(a) * 80, dy + Math.sin(a) * 112); g.stroke(); }
    g.fillStyle = '#c9a85a'; g.beginPath(); g.arc(dx, dy, 18, 0, 7); g.fill();
    g.strokeStyle = '#c8d0d8'; g.lineWidth = 7; for (const s2 of [-1, 1]) { g.beginPath(); g.moveTo(dx, dy + s2 * 110); g.lineTo(dx + 200, dy + s2 * 40); g.stroke(); }
    g.fillStyle = '#d6252b'; g.beginPath(); g.roundRect(dx + 190, dy - 40, 150, 70, 18); g.fill(); g.fillStyle = '#1b1b1f'; g.fillRect(dx + 250, dy + 25, 46, 120); g.fillStyle = '#d6252b'; g.beginPath(); g.roundRect(dx + 225, dy + 140, 100, 56, 10); g.fill();
    // ประโยชน์ 4 ข้อ (การ์ดโปร่ง)
    const ben = [['⚡', 'คืนสภาวะจ่ายน้ำได้เร็วขึ้น'], ['⏱', 'ลดเวลาปฏิบัติงาน 1 ชม./งาน'], ['💧', 'อุดรอยรั่วสมบูรณ์ ลดน้ำสูญเสีย'], ['🛡', 'ป้องกันอุบัติเหตุจากการทำงาน']];
    ben.forEach(([ic, t], i) => { const x = 60 + i * 345, y = 640; g.fillStyle = 'rgba(255,255,255,.93)'; g.beginPath(); g.roundRect(x, y, 320, 300, 22); g.fill();
      g.fillStyle = '#1d5fc0'; g.beginPath(); g.arc(x + 160, y + 85, 54, 0, 7); g.fill(); g.fillStyle = '#ffd23a'; g.font = `700 58px ${F_HEAD}`; g.textAlign = 'center'; g.fillText(ic, x + 160, y + 106);
      g.fillStyle = '#0d1f3c'; g.font = `700 30px ${F_HEAD}`; const [a1, a2] = t.length > 16 ? [t.slice(0, t.lastIndexOf(' ') > 0 ? t.lastIndexOf(' ') : 14), t.slice(t.lastIndexOf(' ') > 0 ? t.lastIndexOf(' ') + 1 : 14)] : [t, ''];
      g.fillText(a1, x + 160, y + 200); g.fillText(a2, x + 160, y + 242); g.textAlign = 'left'; });
    g.fillStyle = '#0d1f3c'; g.fillRect(0, 1010, W, 190); emblem(g, 110, 1105, 62);
    g.fillStyle = '#ffffff'; g.font = `700 44px ${F_HEAD}`; g.fillText('สำนักงานประปาสาขาสุวรรณภูมิ (สสสภ.)', 200, 1095); g.font = `500 28px ${F_BODY}`; g.fillStyle = '#9fd0ff'; g.fillText('การประปานครหลวง · รองรับทุกขนาดท่อในอนาคต', 200, 1140);
  } else {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#0a2f66'); gr.addColorStop(1, b.col); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    waves(g, W, H, 900, 0.35);
    g.fillStyle = '#7fd6ff'; g.font = `600 48px ${F_BODY}`; g.fillText('การประปานครหลวง · MWA', 110, 150);
    g.fillStyle = '#ffffff'; fitText(g, b.name, 700, 170, F_HEAD, W - 220); g.fillText(b.name, 110, 430);
    g.fillStyle = 'rgba(255,255,255,.85)'; fitText(g, b.sub, 500, 64, F_BODY, W - 220); g.fillText(b.sub, 110, 530);
    emblem(g, W - 120, 130, 72);
    if (b.tbc) { g.fillStyle = 'rgba(255,255,255,.7)'; g.font = `600 52px ${F_BODY}`; g.fillText('(รอกำหนดหัวข้อ)', 110, 640); }
  }
  g.restore();
  return c;
}
function counterPrintName(b) {                               // หน้าเคาน์เตอร์บูธ กปน. ทั่วไป: ชื่อบูธ
  const c = document.createElement('canvas'); c.width = 1200; c.height = 700; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 700); gr.addColorStop(0, '#e8f4ff'); gr.addColorStop(1, '#b9dcf8'); g.fillStyle = gr; g.fillRect(0, 0, 1200, 700);
  waves(g, 1200, 700, 560, 0.55); emblem(g, 1050, 140, 90);
  g.fillStyle = '#1d5fc0'; fitText(g, b.name, 700, 130, F_HEAD, 850); g.fillText(b.name, 80, 280);
  g.fillStyle = '#2d6ab8'; fitText(g, b.sub, 500, 54, F_BODY, 1000); g.fillText(b.sub, 80, 380);
  return canvasTex(c, 8);
}
function counterPrint(kind) {                                // ผ้าพิมพ์หน้าเคาน์เตอร์ (แบบเดียวกับภาพงาน)
  const c = document.createElement('canvas'); c.width = 1200; c.height = 700; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 700); gr.addColorStop(0, '#e8f4ff'); gr.addColorStop(1, '#b9dcf8'); g.fillStyle = gr; g.fillRect(0, 0, 1200, 700);
  waves(g, 1200, 700, 560, 0.55);
  g.fillStyle = '#1d5fc0'; fitText(g, 'คลินิกน้ำสะอาด', 700, 120, F_HEAD, 700); g.fillText('คลินิกน้ำสะอาด', 80, 210);
  g.fillStyle = '#0d3f86'; g.font = `800 120px ${F_HEAD}`; g.fillText('MWA', 80, 340); g.fillStyle = '#2d6ab8'; g.font = `500 44px ${F_BODY}`; g.fillText('Clean Water Clinic', 80, 400);
  drop(g, 930, 300, 0.9); g.fillStyle = '#0d3f86'; g.font = `700 46px ${F_HEAD}`; g.fillText('☎ 1125', 80, 650);
  return canvasTex(c, 8);
}
function standeeTex() {
  const c = document.createElement('canvas'); c.width = 600; c.height = 900; const g = c.getContext('2d');
  g.clearRect(0, 0, 600, 900);
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(40, 30, 520, 300, 40); g.fill();
  g.fillStyle = '#1d5fc0'; g.font = `800 66px ${F_HEAD}`; g.fillText('อยากรู้', 70, 110); g.font = `700 50px ${F_HEAD}`; g.fillText('คุณภาพน้ำ สแกนเลย', 70, 175);
  g.fillStyle = '#0b2f5c'; for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if ((i * 7 + j * 3) % 4 < 2 || i % 8 === 0 || j % 8 === 0) g.fillRect(420 + i * 13, 190 + j * 13, 12, 12);
  drop(g, 290, 600, 2.1);
  g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(70, 760, 460, 120, 30); g.fill(); g.fillStyle = '#1d5fc0'; g.font = `800 64px ${F_HEAD}`; g.textAlign = 'center'; g.fillText('น้ำประปาดื่มได้', 300, 845);
  return canvasTex(c, 8);
}
function regWallCanvas() {                                      // ผนังลงทะเบียน (แบบงาน IWA)
  const W = 2400, H = 1000, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1d5fc0'); gr.addColorStop(1, '#2f8fe8'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  waves(g, W, H, 820, 0.4);
  g.globalAlpha = .12; g.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 523) % W, (i * 271) % 700, 10 + (i % 6) * 12, 0, 7); g.fill(); } g.globalAlpha = 1;
  emblem(g, W / 2, 210, 130);
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = `600 70px ${F_HEAD}`; g.fillText('ยินดีต้อนรับ · WELCOME', W / 2, 420);
  g.font = `700 160px ${F_HEAD}`; g.fillText('Stakeholder Day', W / 2, 580);
  g.font = `600 74px ${F_HEAD}`; g.fillText('การประปานครหลวง · Metropolitan Waterworks Authority', W / 2, 690);
  g.font = `500 56px ${F_BODY}`; g.globalAlpha = .92; g.fillText('“ประปาคุณภาพ เพื่อชีวิตที่ดี”', W / 2, 780);
  return c;
}
function totemCanvas(t1, t2) {
  const c = document.createElement('canvas'); c.width = 400; c.height = 1200; const g = c.getContext('2d');
  g.fillStyle = '#123f86'; g.fillRect(0, 0, 400, 1200); waves(g, 400, 1200, 1050, 0.45);
  emblem(g, 200, 150, 90); g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = `600 40px ${F_BODY}`; g.fillText('Stakeholder Day', 200, 310);
  fitText(g, t1, 700, 66, F_HEAD, 360); g.fillText(t1, 200, 620); g.fillStyle = '#bfe3ff'; fitText(g, t2, 500, 40, F_BODY, 360); g.fillText(t2, 200, 690);
  return c;
}
function withLogo(make, aniso) {                            // วาดใหม่เมื่อภาพตรา กปน. โหลดเสร็จ
  const t = canvasTex(make(), aniso);
  if (LOGO_IMG && !(LOGO_IMG.complete && LOGO_IMG.naturalWidth)) LOGO_IMG.addEventListener('load', () => { t.image = make(); t.needsUpdate = true; }, { once: true });
  return t;
}
const mwaBoothGraphic = (kind, b) => withLogo(() => mwaBoothCanvas(kind, b), 12);
const regWallTex = () => withLogo(regWallCanvas, 12);
const totemTex = (t1, t2) => withLogo(() => totemCanvas(t1, t2), 8);
function signCanvas(lines, bg, fg, w = 1024, h = 300) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([t, wt, sz, y, color, fam]) => { g.fillStyle = color || fg; fitText(g, t, wt, sz, fam || F_HEAD, w * 0.9); g.fillText(t, w / 2, y); });
  return canvasTex(c, 8);
}
function backdropTex() {
  const W = 1600, H = 1000, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#5d6f3c'); gr.addColorStop(.35, '#2f8f86'); gr.addColorStop(.7, '#2a7fd0'); gr.addColorStop(1, '#7fd8ff');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.globalAlpha = .16; g.fillStyle = '#fff'; let s = 3; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) { g.beginPath(); g.arc(R() * W, R() * H, 6 + R() * 50, 0, 7); g.fill(); } g.globalAlpha = 1;
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 230px ${F_HEAD}`; g.fillText('เส้นทางน้ำ', W / 2, 430);
  g.font = `500 70px ${F_BODY}`; g.fillText('Stakeholder Day · การประปานครหลวง', W / 2, 610);
  g.font = `500 46px ${F_BODY}`; g.globalAlpha = .85; g.fillText('ต้นน้ำ  →  ผลิต  →  ส่งจ่าย  →  ถึงก๊อก', W / 2, 720);
  return canvasTex(c, 8);
}
function screenTex(title, sub, accent) {
  const W = 1600, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#061a33'); gr.addColorStop(1, '#0d3f73'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.globalAlpha = .28; g.strokeStyle = accent || '#4fd0ff'; g.lineWidth = 4;
  for (let k = 0; k < 6; k++) { g.beginPath(); for (let x = 0; x <= W; x += 12) { const y = 650 + k * 30 + Math.sin(x / 140 + k) * 22; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fitText(g, title, 700, 190, F_HEAD, W * 0.86); g.fillText(title, W / 2, 360);
  g.fillStyle = '#8fe0ff'; fitText(g, sub, 500, 76, F_BODY, W * 0.86); g.fillText(sub, W / 2, 510);
  return canvasTex(c, 8);
}

// ───────────────────────────── ฉาก ─────────────────────────────
let S = null;                                              // สถานะฉากปัจจุบัน

function css() {
  if (document.getElementById('f5-css')) return;
  const st = document.createElement('style'); st.id = 'f5-css';
  st.textContent = `
#f5{position:fixed;inset:0;z-index:1000050;background:#dfe5eb;font-family:${F_BODY};color:#0f1d2b;opacity:0;transition:opacity .7s ease;overflow:hidden;-webkit-font-smoothing:antialiased}
#f5.on{opacity:1}#f5:not(.on){pointer-events:none}
#f5 canvas.gl{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
#f5 .card{background:rgba(255,255,255,.93);border:1px solid rgba(214,222,231,.9);border-radius:12px;box-shadow:0 8px 28px rgba(16,34,56,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
#f5 .ui{position:absolute;transition:opacity .5s ease;z-index:2}#f5 #f5xl{position:absolute;inset:0;pointer-events:none;z-index:1}#f5 .xf{position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;white-space:nowrap;font:500 13px -apple-system,BlinkMacSystemFont,'SF Pro Text','IBM Plex Sans Thai',sans-serif;color:#1d1d1f;will-change:transform,opacity}#f5 .xf:before{content:'';width:var(--ll,28px);height:1px;background:rgba(29,29,31,.45)}#f5 .xf b{font-weight:500;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:3px 10px;box-shadow:0 2px 6px rgba(0,0,0,.08)}#f5 .xf.f5 b{background:#0a6fd8;border-color:#0a6fd8;color:#fff;font-weight:600}#f5 .xf.f5:before{background:#0a6fd8;height:2px}#f5 .xp{position:absolute;left:calc(24px + env(safe-area-inset-left));bottom:calc(24px + env(safe-area-inset-bottom));transform:translateY(8px);z-index:4;display:flex;align-items:center;gap:14px;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:24px;padding:8px 8px 8px 20px;box-shadow:0 6px 20px rgba(0,0,0,.12);opacity:0;pointer-events:none;transition:opacity .3s,transform .3s;font:500 14px -apple-system,BlinkMacSystemFont,'SF Pro Text','IBM Plex Sans Thai',sans-serif;color:#1d1d1f}#f5 .xp.on{opacity:1;transform:none;pointer-events:auto}#f5 .xp input{width:min(220px,40vw);accent-color:#0a6fd8}#f5 .xp .btn{height:36px;border-radius:18px;padding:0 14px}#f5 #f5lbl{position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden}
#f5.intro .ui.hide-intro{opacity:0;pointer-events:none}
#f5 .top{left:14px;right:14px;top:12px;height:52px;display:flex;align-items:center;gap:14px;padding:0 10px 0 14px}
#f5 .brand{display:flex;align-items:center;gap:10px;min-width:0}
#f5 .logo{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#1d5fc0,#3fd0ff);display:grid;place-items:center;color:#fff;font:700 15px ${F_HEAD};flex:none}
#f5 .brand b{font:700 16px ${F_HEAD};white-space:nowrap}
#f5 .brand small{display:block;font-size:11.5px;color:#6b7a8c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#f5 .search{flex:1;max-width:340px;display:flex;align-items:center;gap:8px;background:#f2f5f8;border:1px solid #e1e7ee;border-radius:9px;padding:0 10px;height:34px;margin-left:12px}
#f5 .search input{border:0;background:transparent;outline:0;font:500 13px ${F_BODY};color:#0f1d2b;flex:1;min-width:0}
#f5 .sp{flex:1}
#f5 .chip{display:flex;align-items:center;gap:8px;background:#f2f5f8;border:1px solid #e1e7ee;border-radius:9px;padding:5px 10px;font-size:12px;color:#44566a;white-space:nowrap}
#f5 .chip b{color:#0f1d2b;font:700 12.5px ${F_HEAD}}
#f5 .chip .dot{width:22px;height:22px;border-radius:6px;background:#0fa38f;color:#fff;display:grid;place-items:center;font:700 11px ${F_HEAD}}
#f5 .clock{display:flex;align-items:center;gap:6px;background:#e6f7f1;color:#0b7a5d;border-radius:8px;padding:6px 10px;font:700 12.5px ${F_HEAD};font-variant-numeric:tabular-nums}
#f5 .clock i{width:7px;height:7px;border-radius:50%;background:#12b886}
#f5 .btn{border:1px solid #dde4ec;background:#fff;border-radius:9px;height:34px;padding:0 12px;font:600 13px ${F_HEAD};color:#0f1d2b;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap}
#f5 .btn:hover{background:#f3f7fb}
#f5 .btn.pri{background:#1d5fc0;border-color:#1d5fc0;color:#fff}
#f5 .btn:focus-visible,#f5 button:focus-visible{outline:2px solid #3fb0ff;outline-offset:2px}
#f5 .kpis{left:14px;top:76px;display:flex;gap:10px}
#f5 .kpi{padding:7px 12px 7px;min-width:0;display:flex;gap:9px;align-items:center}
#f5 .kpi .ic{width:28px;height:28px;border-radius:8px;background:#e8f3ff;color:#1d5fc0;display:grid;place-items:center;flex:none;font-size:14px}
#f5 .kpi span{display:block;font-size:11.5px;color:#6b7a8c}
#f5 .kpi strong{display:block;font:700 19px/1.1 ${F_HEAD};font-variant-numeric:tabular-nums}
#f5 .kpi strong em{font:500 12px ${F_BODY};color:#6b7a8c;font-style:normal;margin-left:3px}
#f5 .kpi small{display:none}
#f5 .tools{left:14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;padding:5px;gap:2px}
#f5 .tools button{width:34px;height:34px;border:0;background:transparent;border-radius:8px;cursor:pointer;color:#44566a;font-size:15px;display:grid;place-items:center}
#f5 .tools button:hover{background:#eef3f8;color:#0f1d2b}
#f5 .tools hr{border:0;border-top:1px solid #e3e8ee;margin:3px 4px}
#f5 .detail{right:14px;top:76px;width:300px;padding:14px 16px;display:none}
#f5 .detail.on{display:block}
#f5 .detail .hd{display:flex;gap:10px;align-items:center}
#f5 .detail .sw{width:34px;height:34px;border-radius:9px;flex:none;display:grid;place-items:center;color:#fff;font:700 12px ${F_HEAD}}
#f5 .detail h3{margin:0;font:700 18px/1.2 ${F_HEAD}}
#f5 .detail .sub{font-size:12.5px;color:#6b7a8c}
#f5 .detail .x{margin-left:auto;border:0;background:transparent;font-size:16px;color:#8a97a6;cursor:pointer;align-self:flex-start}
#f5 .pill{display:inline-flex;align-items:center;gap:6px;margin:10px 0 6px;padding:4px 10px;border-radius:999px;font:600 12px ${F_HEAD}}
#f5 .pill i{width:7px;height:7px;border-radius:50%;background:currentColor}
#f5 .pill.mwa{background:#e8f1ff;color:#1d5fc0}#f5 .pill.p{background:#e5f7f3;color:#0b8a72}#f5 .pill.tbc{background:#fff4e0;color:#b26a00}
#f5 .row{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-top:1px solid #edf1f5;font-size:13px}
#f5 .row span{color:#6b7a8c}#f5 .row b{font-weight:600;text-align:right}
#f5 .detail .nav{display:flex;gap:8px;margin-top:10px}
#f5 .detail .nav .btn{flex:1;justify-content:center;height:32px}
#f5 .list{right:14px;bottom:14px;width:380px;padding:10px 12px 8px}
#f5 .list.min .items{display:none}#f5 .list.min{padding-bottom:10px}#f5 .list .mn{border:0;background:#eef3f8;border-radius:7px;width:26px;height:24px;cursor:pointer;color:#44566a;margin-left:8px}#f5 .list.min .mn{transform:rotate(180deg)}
#f5 .tabs{display:flex;gap:16px;border-bottom:1px solid #e8edf2;padding:0 2px 7px;font:600 13px ${F_HEAD};color:#8a97a6}
#f5 .tabs button{border:0;background:transparent;font:inherit;color:inherit;cursor:pointer;padding:0}
#f5 .tabs button.on{color:#0f1d2b}
#f5 .tabs button sup{font:500 10.5px ${F_BODY};color:#8a97a6;margin-left:2px}
#f5 .tabs .r{margin-left:auto;font:500 11.5px ${F_BODY};color:#8a97a6}
#f5 .items{max-height:236px;overflow:auto;margin-top:6px;scrollbar-width:thin}
#f5 .it{display:flex;align-items:center;gap:10px;padding:7px 4px;border-radius:8px;cursor:pointer}
#f5 .it:hover,#f5 .it.on{background:#f1f6fb}
#f5 .it .sw{width:30px;height:30px;border-radius:8px;flex:none;display:grid;place-items:center;color:#fff;font:700 10.5px ${F_HEAD}}
#f5 .it b{display:block;font:600 13.5px ${F_HEAD};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#f5 .it small{display:block;font-size:11.5px;color:#7b8898;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#f5 .it .mid{flex:1;min-width:0}
#f5 .it .st{font:600 11px ${F_HEAD};padding:3px 8px;border-radius:999px;white-space:nowrap}
#f5 .it .st.ok{background:#e5f7f3;color:#0b8a72}#f5 .it .st.tbc{background:#fff4e0;color:#b26a00}
#f5 .it .bar{width:46px;height:4px;border-radius:2px;background:#e6ebf0;overflow:hidden;flex:none}
#f5 .it .bar i{display:block;height:100%;background:#1d5fc0}
#f5 .journey{left:14px;bottom:14px;width:min(640px,calc(100vw - 430px));padding:12px 16px 12px}
#f5 .jh{display:flex;align-items:center;gap:8px;font:700 14px ${F_HEAD}}
#f5 .jh small{margin-left:auto;font:500 12px ${F_BODY};color:#7b8898}
#f5 .steps{display:flex;align-items:flex-start;margin:12px 2px 8px;position:relative}
#f5 .steps:before{content:"";position:absolute;left:14px;right:14px;top:13px;height:2px;background:#e3e8ee}
#f5 .steps .fill{position:absolute;left:14px;top:13px;height:2px;background:#12b886;transition:width .6s ease}
#f5 .stp{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;position:relative;cursor:pointer;border:0;background:transparent;padding:0;font:inherit;color:inherit}
#f5 .stp i{width:26px;height:26px;border-radius:50%;border:2px solid #d5dde6;background:#fff;display:grid;place-items:center;font:700 11px ${F_HEAD};color:#9aa7b5;font-style:normal;transition:all .35s}
#f5 .stp.done i{background:#12b886;border-color:#12b886;color:#fff}
#f5 .stp.cur i{background:#fff;border-color:#1d5fc0;color:#1d5fc0;box-shadow:0 0 0 5px rgba(29,95,192,.14)}
#f5 .stp span{font:600 11.5px ${F_HEAD};color:#5b6b7c;text-align:center;line-height:1.25}
#f5 .stp.cur span{color:#1d5fc0}
#f5 .tour{display:flex;gap:12px;align-items:flex-start;border-top:1px solid #edf1f5;padding-top:10px}
#f5 .tour .n{font:700 12px ${F_HEAD};color:#1d5fc0;white-space:nowrap;padding-top:2px}
#f5 .tour h4{margin:0;font:700 16px/1.25 ${F_HEAD}}
#f5 .tour p{margin:3px 0 0;font-size:13px;color:#4a5b6d;line-height:1.55}
#f5 .tour .tx{flex:1;min-width:0}
#f5 .tour .ctl{display:flex;gap:6px;flex:none}
#f5 .tour .ctl .btn{height:32px;padding:0 10px}
#f5 .speed{position:absolute;left:58px;bottom:14px}
#f5 .lbl{position:absolute;left:0;top:0;pointer-events:none;transform:translate(-50%,-100%);white-space:nowrap;transition:opacity .35s}
#f5 .zl{background:rgba(255,255,255,.95);border:1px solid #dfe6ee;border-radius:999px;padding:5px 11px 5px 6px;font:600 12.5px ${F_HEAD};color:#0f1d2b;box-shadow:0 4px 14px rgba(16,34,56,.14);display:flex;align-items:center;gap:7px}
#f5 .zl i{width:20px;height:20px;border-radius:50%;background:#1d5fc0;color:#fff;font:700 11px ${F_HEAD};display:grid;place-items:center;font-style:normal}
#f5 .zl.on{background:#1d5fc0;color:#fff;border-color:#1d5fc0}#f5 .zl.on i{background:#fff;color:#1d5fc0}
#f5 .bl{background:#0f1d2b;color:#fff;border-radius:7px;padding:4px 9px;font:600 12px ${F_HEAD};box-shadow:0 4px 12px rgba(0,0,0,.2)}
#f5 .bl em{font-style:normal;color:#8fd0ff;margin-right:5px;font-weight:500}
#f5 .bl:after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-top-color:#0f1d2b;border-bottom:0}
#f5 .ttl{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;transition:opacity .8s}
#f5 .ttl h1{margin:0;font:700 clamp(36px,5.6vw,78px)/1.05 ${F_HEAD};color:#0f1d2b;letter-spacing:-.01em}
#f5 .ttl p{margin:10px 0 0;font:500 clamp(14px,1.5vw,20px) ${F_BODY};color:#3d5166}
#f5 .ttl .ln{width:240px;height:4px;border-radius:2px;margin:16px auto 0;background:linear-gradient(90deg,#8a9a5b,#3fb0a6,#3fd0ff)}
#f5 .skip{right:14px;bottom:14px}
#f5.intro .skip{display:flex}#f5 .skip{display:none}
#f5 .credit{position:absolute;right:16px;bottom:4px;font-size:10.5px;color:#9aa7b5;pointer-events:none}
@media (max-width:1100px){#f5 .kpis .kpi:nth-child(n+3){display:none}#f5 .search{display:none}}
@media (max-width:900px){#f5 .list{display:none}#f5 .journey{width:calc(100vw - 28px)}#f5 .detail{width:calc(100vw - 28px);top:auto;bottom:250px}#f5 .chip,.clock{display:none!important}#f5 .kpis{display:none}}
#f5 .tools .ls{display:none}
@media (max-width:900px){#f5 .tools .ls{display:grid}#f5 .list.show{display:block;left:10px;right:10px;width:auto;top:64px;bottom:auto;z-index:6}#f5 .list.show .items{display:block;max-height:52vh}#f5 .list .mn{display:none}}
@media (max-width:640px){
#f5 .top{left:8px;right:8px;top:calc(8px + env(safe-area-inset-top));height:46px;gap:8px;padding:0 6px 0 10px}
#f5 .brand b{font-size:14px}#f5 .brand small{font-size:10.5px}#f5 .logo{width:26px;height:26px;font-size:13px}#f5 .top .btn{height:34px;padding:0 10px}
#f5 .tools{left:auto;right:8px;top:calc(62px + env(safe-area-inset-top));transform:none;padding:3px}
#f5 .tools button{width:40px;height:40px;font-size:16px}#f5 .tools [data-k=zin],#f5 .tools [data-k=zout],#f5 .tools [data-k=fs],#f5 .tools hr:first-of-type{display:none}
#f5 .journey{left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom));width:auto;padding:10px 12px}
#f5 .jh{font-size:13px}#f5 .jh small{display:none}
#f5 .steps{margin:8px 0 8px}#f5 .stp i{width:22px;height:22px;font-size:10px}#f5 .steps:before,#f5 .steps .fill{top:11px}#f5 .stp span{display:none}
#f5 .tour{flex-wrap:wrap;gap:6px 10px;padding-top:8px}#f5 .tour .tx{flex:1 1 calc(100% - 60px)}
#f5 .tour h4{font-size:15px}#f5 .tour p{font-size:12.5px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
#f5 .tour .ctl{width:100%}#f5 .tour .ctl .btn{flex:1;justify-content:center;height:40px;font-size:14px}
#f5 .detail{top:calc(62px + env(safe-area-inset-top));bottom:auto;left:8px;right:58px;width:auto;max-height:44vh;overflow:auto;padding:12px 14px}#f5 .detail .row{display:none}#f5 .detail .pill{margin:8px 0 2px}
#f5 .list.show{top:calc(62px + env(safe-area-inset-top));right:58px;left:8px}
#f5 .zl{font-size:11px;padding:3px 8px 3px 4px;gap:5px}#f5 .zl i{width:16px;height:16px;font-size:9.5px}#f5 .bl{font-size:10.5px;padding:3px 7px}
#f5 .credit{display:none}#f5 .skip{bottom:calc(14px + env(safe-area-inset-bottom));height:40px}#f5 .ttl{width:92vw}#f5 .ttl p{font-size:14px}
}
@media (max-height:500px) and (orientation:landscape){
#f5 .top{height:40px;top:6px;left:calc(8px + env(safe-area-inset-left));right:calc(8px + env(safe-area-inset-right))}#f5 .brand small{display:none}
#f5 .tools{left:auto;right:calc(8px + env(safe-area-inset-right));top:54px;transform:none;flex-direction:row;padding:3px}#f5 .tools hr{display:none}#f5 .tools button{width:36px;height:36px}
#f5 .tools [data-k=zin],#f5 .tools [data-k=zout],#f5 .tools [data-k=fs]{display:none}
#f5 .journey{left:calc(8px + env(safe-area-inset-left));right:auto;bottom:6px;width:min(560px,calc(100vw - 120px));padding:8px 12px}
#f5 .jh,#f5 .steps{display:none}#f5 .tour{border-top:0;padding-top:0;flex-wrap:nowrap}#f5 .tour p{-webkit-line-clamp:2}#f5 .tour .ctl{width:auto}
#f5 .detail{top:98px;left:auto;right:calc(8px + env(safe-area-inset-right));width:320px;max-height:calc(100vh - 106px);overflow:auto;bottom:auto;padding:10px 14px}
#f5 .list.show{top:96px;left:auto;right:calc(8px + env(safe-area-inset-right));width:340px}#f5 .list.show .items{max-height:calc(100vh - 160px)}
#f5 .credit{display:none}
}
@media (prefers-reduced-motion:reduce){#f5,#f5 .ui,#f5 .lbl{transition:none}}
`;
  document.head.appendChild(st);
}

function build(opt) {
  css();
  const root = document.createElement('div'); root.id = 'f5'; root.className = 'intro';
  root.innerHTML = `
<canvas class="gl" tabindex="0"></canvas>
<div class="ui top card hide-intro">
  <div class="brand"><div class="logo"><img src="${ASSET_BASE}mwa_logo.png" alt=""></div><div><b>Stakeholder Day</b><small>ชั้น 5 อาคารสำนักงานใหญ่ · ผังการจัดงาน (ร่าง)</small></div></div>
  <div class="search"><span style="color:#8a97a6;display:grid">${ui('search')}</span><input id="f5q" placeholder="ค้นหาบูธ บริษัท หรือโซน" aria-label="ค้นหาบูธ"></div>
  <div class="sp"></div>
  <div class="chip"><div class="dot">F5</div><div><b>ชั้น 5 · 22 บูธ</b><br>กปน. ผ้าตึง 3 ม. · เอกชน 2 × 1 ม.</div></div>
  <div class="clock"><i></i><span id="f5clk">08:30</span><span id="f5spd" style="font-weight:500;opacity:.8">×1</span></div>
  ${opt.onDone ? '<button class="btn" data-k="back" title="ย้อนกลับ (Esc)">' + ui('back') + 'กลับ</button>' : ''}
</div>
<div class="ui kpis hide-intro">
  <div class="kpi card"><div class="ic">${ui('grid')}</div><div><span>บูธทั้งหมด</span><strong>22<em>บูธ</em></strong><small>กปน. 10 · เอกชน 12</small></div></div>
  <div class="kpi card"><div class="ic">${ui('route')}</div><div><span>เส้นทาง ลิฟต์ → ห้องประชุม</span><strong id="f5len">–<em>ม.</em></strong><small>ทางเดินกว้าง 5–7 ม.</small></div></div>
  <div class="kpi card"><div class="ic">${ui('seat')}</div><div><span>ที่นั่ง Auditorium (โดยประมาณ)</span><strong id="f5seat">–<em>ที่</em></strong><small>ที่นั่งขั้นบันได</small></div></div>
  <div class="kpi card"><div class="ic">${ui('clock')}</div><div><span>เวลาเดินชม (ประมาณ)</span><strong>25<em>นาที</em></strong><small>แวะบูธละ ~1 นาที</small></div></div>
</div>
<div class="ui tools card hide-intro">
  <button data-k="list" class="ls" title="รายการบูธ" aria-label="รายการบูธ">${ui('list')}</button><button data-k="zin" title="ซูมเข้า">${ui('plus')}</button><button data-k="zout" title="ซูมออก">${ui('minus')}</button><hr>
  <button data-k="home" title="ภาพรวม">${ui('home')}</button><button data-k="top" title="มุมบน (ผัง)">${ui('plan')}</button><button data-k="spin" title="หมุนรอบ">${ui('spin')}</button><hr>
  <button data-k="explode" title="ดูการแยกชั้นอีกครั้ง">${ui('explode')}</button><button data-k="fs" title="เต็มจอ">${ui('full')}</button>
</div>
<div class="ui detail card" id="f5det"></div>
<div class="ui list card hide-intro min">
  <div class="tabs"><button data-tab="mwa" class="on">บูธ กปน.<sup>10</sup></button><button data-tab="p">เอกชน<sup>12</sup></button><button data-tab="zone">โซน<sup>7</sup></button><span class="r">เรียงตามเส้นทาง</span><button class="mn" data-k="lmin" title="ย่อ/ขยายรายการ">▾</button></div>
  <div class="items" id="f5items"></div>
</div>
<div class="ui journey card hide-intro">
  <div class="jh">${ui('route')}เส้นทางผู้เข้าร่วม<small>ลิฟต์ → Auditorium</small></div>
  <div class="steps" id="f5steps"><div class="fill"></div></div>
  <div class="tour"><div class="n" id="f5n">1 / 10</div><div class="tx"><h4 id="f5t"></h4><p id="f5d"></p></div>
    <div class="ctl"><button class="btn" data-k="prev" title="ก่อนหน้า (←)" aria-label="ก่อนหน้า">${ui('prev')}</button><button class="btn" data-k="next" title="ถัดไป (→)" aria-label="ถัดไป">${ui('next')}</button><button class="btn" data-k="auto" id="f5auto" title="เดินชมตามเส้นทาง จากลิฟต์ถึงห้องประชุม (Space)">${ui('walk')}เดินชม</button></div></div>
</div>
<div class="ttl" id="f5ttl"><h1>Stakeholder Day</h1><p>การประปานครหลวง · ชั้น 5 อาคารสำนักงานใหญ่</p></div>
<button class="ui btn skip" data-k="skip">ข้าม${ui('next')}</button>
<div id="f5lbl"></div><div id="f5xl"></div><div class="xp" id="f5xp"><span>แยกชั้น</span><input type="range" min="0" max="100" value="43" aria-label="ระยะแยกชั้น"><button class="btn pri" data-k="xgo">เข้าชั้น 5${ui('next')}</button></div>
<div class="credit">ภาพจำลองแนวคิด · ขนาดโดยประมาณจากผังร่าง</div>`;
  document.body.appendChild(root);
  return root;
}

function makeScene(root, opt) {
  const canvas = root.querySelector('canvas.gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opt.capture });
  const DPR = Math.min(window.devicePixelRatio || 1, Q_DPR(opt));
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  if (MOBILE) renderer.shadowMap.autoUpdate = false;   /* อัปเดตเงาเป็นช่วง ๆ ใน frame() */
  const scene = new THREE.Scene();
  { const c = document.createElement('canvas'); c.width = 4; c.height = 512; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#b9d1e6'); gr.addColorStop(0.55, '#d6e2ec'); gr.addColorStop(1, '#e3e9ee'); g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }       // ฟ้าไล่สี
  scene.fog = new THREE.Fog('#dfe5eb', 170, 430);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 1400);
  // จอแนวตั้ง (มือถือ): ขยายมุมมองให้เห็นกว้างพอ ๆ กับจอแนวนอน · ค่า fov ที่ตั้งในโค้ดยังเป็นค่าเดิม (ปรับเฉพาะตอนสร้าง projection)
  camera.userData.wide = 1;
  { const upm = camera.updateProjectionMatrix.bind(camera);
    camera.updateProjectionMatrix = function () { const f = this.fov, kf = this.aspect < 1.25 ? Math.min(1.25 / this.aspect, 2.1) : 1, k = 1 + (kf - 1) * this.userData.wide;
      if (k > 1.001) { this.fov = Math.min(Math.max(f, 92), 2 * Math.atan(Math.tan(f * Math.PI / 360) * k) * 180 / Math.PI); upm(); this.fov = f; } else upm(); }; }

  const hemi = new THREE.HemisphereLight('#f4f8ff', '#a9a49a', 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6ea', 2.0);
  sun.position.set(-38, 70, 30); sun.castShadow = true;
  sun.shadow.mapSize.set(MOBILE ? 2048 : 4096, MOBILE ? 2048 : 4096);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 44, bottom: -44, near: 10, far: 220 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 4; controls.maxDistance = 260;
  controls.screenSpacePanning = false;

  // หลังประมวลผล
  let composer = null, gtao = null, bloom = null;
  const useAO = Q_AO(opt);
  function setupComposer(w, h) {
    const rt = new THREE.WebGLRenderTarget(w * DPR, h * DPR, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(DPR);
    composer.addPass(new RenderPass(scene, camera));
    if (useAO) {
      gtao = new GTAOPass(scene, camera, w, h);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.5, scale: 1.15, samples: 16 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      gtao.blendIntensity = 0.85;
      gtao.overrideVisibility = function () {                // ไม่คิดเงาบดบัง (AO) จากกระจก เส้นทาง และโซนที่จางอยู่
        const cache = this._visibilityCache;
        const tr = m => m && m.transparent && (m.opacity < 0.99 || m.depthWrite === false);
        this.scene.traverse(o => { cache.set(o, o.visible);
          if (o.isPoints || o.isLine || o.userData.noAO || (o.material && (Array.isArray(o.material) ? o.material.some(tr) : tr(o.material)))) o.visible = false; });
      };
      composer.addPass(gtao);
    }
    composer.addPass(new OutputPass());
  }
  return { renderer, scene, camera, controls, sun, hemi, setupComposer, get composer() { return composer; }, get gtao() { return gtao; }, get bloom() { return bloom; }, DPR };
}

// วัสดุแยกโซน (ใช้จางโซนอื่นตอนนำชม)
function zoneMats() {
  const byZone = {}, cache = {};
  return {
    m(zone, base) { const key = zone + '|' + base.uuid; if (!cache[key]) { const c = base.clone(); c.userData.op = base.opacity; c.userData.tr = base.transparent; cache[key] = c; (byZone[zone] = byZone[zone] || []).push(c); } return cache[key]; },
    reg(zone, m) { m.userData.op = m.opacity; m.userData.tr = m.transparent; (byZone[zone] = byZone[zone] || []).push(m); return m; },
    set(zone, a) { for (const m of byZone[zone] || []) { if (m.userData.noFade) continue; const tr = a < 0.995 || m.userData.op < 1 || !!m.userData.tr; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = m.userData.op * a; m.depthWrite = a > 0.6 && m.userData.op >= 1 && !m.userData.tr; } },
    zones: () => Object.keys(byZone),
  };
}

// mesh หลายวัสดุ (เช่น ผนังกล่อง 6 หน้า) → รวมหน้าที่ใช้วัสดุเดียวกันให้ติดกัน: 6 draw call เหลือ 1–2
function compactGroups(root) {
  let n0 = 0, n1 = 0;
  root.traverse(o => {
    if (!o.isMesh || !Array.isArray(o.material) || !o.geometry.index || !o.geometry.groups.length) return;
    const g = o.geometry, mats = o.material, idx = g.index.array, uniq = [], gi = new Map();
    for (const gr of g.groups) { const m = mats[gr.materialIndex]; if (!m) continue; if (!gi.has(m)) { gi.set(m, uniq.length); uniq.push(m); } }
    n0 += g.groups.length; if (uniq.length >= g.groups.length) { n1 += g.groups.length; return; }
    const out = new (idx.constructor)(idx.length); let p = 0; const groups = [];
    uniq.forEach((m, mi) => { const st = p; for (const gr of g.groups) if (mats[gr.materialIndex] === m) { out.set(idx.subarray(gr.start, gr.start + gr.count), p); p += gr.count; } groups.push({ start: st, count: p - st, materialIndex: mi }); });
    const g2 = g.clone(); g2.setIndex(new THREE.BufferAttribute(out.subarray(0, p), 1)); g2.clearGroups();
    if (uniq.length === 1) { o.material = uniq[0]; } else { groups.forEach(q => g2.addGroup(q.start, q.count, q.materialIndex)); o.material = uniq; }
    o.geometry = g2; n1 += groups.length;
  });
  return [n0, n1];
}

function staticBatch(roots) {
  const t0 = performance.now(), rootSet = new Set(roots), noRB = THREE.Object3D.prototype.onBeforeRender, inv = new THREE.Matrix4(), mtx = new THREE.Matrix4(), v = new THREE.Vector3();
  roots[0].updateMatrixWorld(true); let before = 0, after = 0;
  for (const R of roots) {
    inv.copy(R.matrixWorld).invert(); const groups = new Map();
    const walk = o => {
      for (const c of o.children) {
        if (rootSet.has(c) || !c.visible || c.userData.wall || c.userData.noBatch) continue;
        if (c.isMesh && !c.isInstancedMesh && !c.isSkinnedMesh && !Array.isArray(c.material) && c.material.visible !== false && !c.material.isShaderMaterial
          && !c.userData.booth && c.onBeforeRender === noRB && !Object.keys(c.geometry.morphAttributes).length && c.matrixWorld.determinant() > 0) {
          const g = c.geometry, at = Object.keys(g.attributes).sort().map(k => k + g.attributes[k].itemSize + (g.attributes[k].normalized ? 'n' : '') + g.attributes[k].array.constructor.name).join(',');
          if (!g.boundingSphere) g.computeBoundingSphere(); v.copy(g.boundingSphere.center).applyMatrix4(c.matrixWorld);
          const key = [c.material.uuid, c.castShadow, c.receiveShadow, c.renderOrder, c.frustumCulled, !!c.userData.noAO, at, !!g.index, Math.floor(v.x / 30), Math.floor(v.z / 30)].join('|');
          let L = groups.get(key); if (!L) groups.set(key, L = []); L.push(c);
        }
        walk(c);
      }
    };
    walk(R);
    for (const L of groups.values()) {
      before += L.length; if (L.length < 2) { after += L.length; continue; }
      try {
        const geos = L.map(c => { const g = c.geometry.clone(); g.applyMatrix4(mtx.multiplyMatrices(inv, c.matrixWorld)); return g; });
        const mg = mergeGeometries(geos, false); if (!mg) { after += L.length; continue; }
        const c0 = L[0], m = new THREE.Mesh(mg, c0.material);
        m.castShadow = c0.castShadow; m.receiveShadow = c0.receiveShadow; m.renderOrder = c0.renderOrder; m.frustumCulled = c0.frustumCulled; if (c0.userData.noAO) m.userData.noAO = true;
        for (const c of L) c.parent.remove(c);
        R.add(m); after += 1; geos.forEach(g => g.dispose());
      } catch (e) { after += L.length; }
    }
  }
  console.info('[F5] staticBatch', before, '→', after, 'mesh ·', Math.round(performance.now() - t0), 'ms');
}

function buildWorld(ctx) {
  const { scene } = ctx;
  const ZM = zoneMats();
  const world = new THREE.Group(); scene.add(world);
  const interior = new THREE.Group(); world.add(interior);       // ชั้น 5 (พื้นอยู่ที่ y = 0)
  const zoneGroups = {}; const zg = z => zoneGroups[z] || (zoneGroups[z] = (() => { const g = new THREE.Group(); g.name = z; interior.add(g); return g; })());
  const M = {
    white: new THREE.MeshStandardMaterial({ color: '#f7f8f9', roughness: 0.82 }),
    wall: new THREE.MeshStandardMaterial({ color: '#cfdcee', roughness: 0.85 }),
    cap: new THREE.MeshStandardMaterial({ color: '#1d5fc0', roughness: 0.6 }),
    closed: new THREE.MeshStandardMaterial({ color: '#c3d3e8', roughness: 0.95 }),
    closedTop: new THREE.MeshStandardMaterial({ color: '#8fb0d8', roughness: 0.9 }),
    glassFace: new THREE.MeshStandardMaterial({ color: '#cfe6f6', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55 }),
    alu: new THREE.MeshStandardMaterial({ color: '#c9d0d7', metalness: 0.75, roughness: 0.32 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1b232c', roughness: 0.45, metalness: 0.2 }),
    screen: new THREE.MeshStandardMaterial({ color: '#0b1520', roughness: 0.25, metalness: 0.1 }),
    glassLite: new THREE.MeshPhysicalMaterial({ color: '#cfe6f7', roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.16, depthWrite: false }),
    wood: new THREE.MeshStandardMaterial({ color: '#c79c6b', roughness: 0.6 }),
    seat: new THREE.MeshStandardMaterial({ color: '#2d5e9a', roughness: 0.75 }),
    seatBack: new THREE.MeshStandardMaterial({ color: '#c49a6c', roughness: 0.6 }),
    stage: new THREE.MeshStandardMaterial({ color: '#d9c4a2', roughness: 0.55 }),
    tier: new THREE.MeshStandardMaterial({ color: '#3a4859', roughness: 0.9 }),
    plant: new THREE.MeshStandardMaterial({ color: '#4f9b5c', roughness: 0.85 }),
    pot: new THREE.MeshStandardMaterial({ color: '#e9e4db', roughness: 0.7 }),
  };
  const lightStripLobby = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 1.4 });
  const add = (zone, geo, mat, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(geo, Array.isArray(mat) ? mat.map(q => ZM.m(zone, q)) : ZM.m(zone, mat));
    m.position.set(x, y, z); if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = opts.cast !== false; m.receiveShadow = true; (opts.parent || zg(zone)).add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ── พื้นฐานชั้น + พื้นทางเดิน (หินขัด)
  const stoneT = floorCanvas('stone'); stoneT.repeat.set(FW / TILE.stone, FD / TILE.stone);
  const slabTop = new THREE.MeshStandardMaterial({ map: stoneT, roughness: 0.38, metalness: 0.0 });
  // พื้นชั้นตามแนวกระจกอาคาร: บล็อกสำนักงานมุมตะวันตกเฉียงเหนือเป็นภายนอก (ไม่มีพื้น) · กระจกใสตามขอบบนส่วนบริการ ข้างทางเดิน กปน. และห้องอาหาร
  const OUTLINE = [[FX0, Z(453)], [X(885), Z(453)], [X(885), Z(350)], [X(855), Z(350)], [X(855), FZ0], [FX1, FZ0], [FX1, FZ1], [FX0, FZ1]];
  { const sh = new THREE.Shape(OUTLINE.map(([x, z]) => new THREE.Vector2(x, -z)));
    { const A = AUDm, e = WT / 2; sh.holes.push(new THREE.Path([[A.ax0 + e, A.zb], [A.ax1 - e, A.zb], [A.ax1 - e, A.az1 - e], [A.ax0 + e, A.az1 - e]].map(([x, z]) => new THREE.Vector2(x, -z)))); }
    const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false }); sg.rotateX(-Math.PI / 2); sg.translate(0, -0.6, 0);
    const st2 = floorCanvas('stone'); st2.repeat.set(1 / TILE.stone, 1 / TILE.stone);
    const top = new THREE.MeshStandardMaterial({ map: st2, roughness: 0.38 });
    add('base', sg, [top, M.white], 0, 0, 0, { cast: false }); }
  // ── พื้นห้อง
  const floorMats = {};
  for (const r of ROOMS) {
    const [a, b, c, d] = r.r, w = X(c) - X(a), dd = r.id === 'aud' ? AUD.back : Z(d) - Z(b);
    const t = floorCanvas(r.floor); t.repeat.set(w / TILE[r.floor], dd / TILE[r.floor]);
    const fm = new THREE.MeshStandardMaterial({ map: t, roughness: r.floor === 'wood' ? 0.55 : 0.92 });
    floorMats[r.id] = fm;
    add(r.zone, box(w, 0.04, dd), fm, (X(a) + X(c)) / 2, 0.02, r.id === 'aud' ? Z(b) + dd / 2 : (Z(b) + Z(d)) / 2, { cast: false });
    if (r.label) {                                         // ชื่อห้องบนพื้น
      const c2 = document.createElement('canvas'); c2.width = 1024; c2.height = 256; const g = c2.getContext('2d');
      g.fillStyle = 'rgba(29,95,192,.78)'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, r.label, 700, 170, F_HEAD, 960); g.fillText(r.label, 512, 128);
      const tw = Math.min(w, dd) * 0.82, mat = ZM.reg(r.zone, new THREE.MeshBasicMaterial({ map: canvasTex(c2), transparent: true, depthWrite: false }));
      const lp = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw / 4), mat); lp.rotation.x = -Math.PI / 2; if (dd > w * 1.6) lp.rotation.z = Math.PI / 2;
      lp.position.set((X(a) + X(c)) / 2, 0.06, r.meet ? Z(b) + dd * 0.22 : (Z(b) + Z(d)) / 2); lp.renderOrder = 2; zg(r.zone).add(lp);
    }
  }
  // ── ผนัง
  const wallMat = [M.wall, M.wall, M.cap, M.wall, M.wall, M.wall];
  function wall(x0, y0, x1, y1, h, zone) {
    const ax = X(x0), az = Z(y0), bx = X(x1), bz = Z(y1), len = Math.hypot(bx - ax, bz - az); if (len < 0.05) return;
    const m = add(zone, box(len + WT, h, WT), wallMat, (ax + bx) / 2, h / 2, (az + bz) / 2);
    m.rotation.y = -Math.atan2(bz - az, bx - ax); markWall(m, zone, h); return m;
  }
  const walls = [];
  const edgeLine = new THREE.LineBasicMaterial({ color: '#33465b', transparent: true, opacity: 0.85 });
  function outline(m) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 30), edgeLine); e.raycast = () => {}; m.add(e); }
  function markWall(m, zone, h) { outline(m); m.userData.wall = true; m.userData.zone = zone; m.userData.h = h; m.userData.k = 1; [].concat(m.material).forEach(q => { q.userData.noFade = true; }); }
  function rectWalls(r, gaps, h, zone) {
    const [x0, y0, x1, y1] = r;
    const side = (a, b, fixed, horiz, gs = []) => { let cur = a; [...gs, [b, b]].sort((p, q) => p[0] - q[0]).forEach(([g0, g1]) => { if (g0 > cur) walls.push(horiz ? wall(cur, fixed, g0, fixed, h, zone) : wall(fixed, cur, fixed, g0, h, zone)); cur = Math.max(cur, g1); }); };
    side(x0, x1, y0, true, gaps.n); side(x0, x1, y1, true, gaps.s); side(y0, y1, x0, false, gaps.w); side(y0, y1, x1, false, gaps.e);
  }
  for (const r of ROOMS) rectWalls(r.r, r.gaps || {}, r.h || WALL_H, r.zone);
  EXTRA_WALLS.forEach(s => walls.push(wall(...s, WALL_H, 'other')));
  // ผนังกระจกฝั่งซ้ายทางเดิน กปน. (บานกระจก + เสาอะลูมิเนียม + คิ้วบน)
  function glassWall(ax, az, bx, bz, h) {
    const len = Math.hypot(bx - ax, bz - az), ry = -Math.atan2(bz - az, bx - ax);
    const g = add('mwa', box(len, h, 0.05), M.glassFace, (ax + bx) / 2, h / 2, (az + bz) / 2, { cast: false }); g.rotation.y = ry; g.renderOrder = 2; g.userData.noAO = true;
    const n = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i <= n; i++) { const t = i / n; add('mwa', box(0.07, h, 0.09), M.alu, lerp(ax, bx, t), h / 2, lerp(az, bz, t), { cast: false }); }
    for (const y of [0.05, h - 0.04]) { const r = add('mwa', box(len, 0.08, 0.1), M.alu, (ax + bx) / 2, y, (az + bz) / 2, { cast: false }); r.rotation.y = ry; }
  }
  GLASS_WALLS.forEach(([a, b, c, d]) => glassWall(X(a), Z(b), X(c), Z(d), WALL_H));
  // ── พื้นที่ทึบ + ตัวอักษรบนหลังคาก้อน
  const topKind = { room: new THREE.MeshStandardMaterial({ color: '#dfe8f4', roughness: 0.9 }), lift: new THREE.MeshStandardMaterial({ color: '#7f9bbf', roughness: 0.8 }),
    wcm: new THREE.MeshStandardMaterial({ color: '#bfdcf3', roughness: 0.9 }), wcf: new THREE.MeshStandardMaterial({ color: '#f1d3dc', roughness: 0.9 }) };
  for (const cb of CLOSED) {
    const [a, b, c, d] = cb.r, w = X(c) - X(a), dd = Z(d) - Z(b), h = cb.core ? WALL_H + 0.2 : WALL_H;
    const m = add('other', box(w, h, dd), [M.closed, M.closed, topKind[cb.kind] || M.closedTop, M.closed, M.closed, M.closed], (X(a) + X(c)) / 2, h / 2, (Z(b) + Z(d)) / 2);
    if (cb.glassE) glassWall(X(c) + 0.02, Z(b), X(c) + 0.02, Z(d), h);
    markWall(m, 'other', h); walls.push(m);
    if (cb.t && (cb.small || (w > 6 && dd > 6))) {
      const c2 = document.createElement('canvas'); c2.width = 1024; c2.height = 256; const g = c2.getContext('2d');
      g.fillStyle = cb.small ? 'rgba(40,60,85,.85)' : 'rgba(70,86,102,.6)'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, cb.t, cb.small ? 700 : 600, cb.small ? 190 : 120, F_HEAD, 980); g.fillText(cb.t, 512, 128);
      const tw = cb.small ? w * 0.96 : Math.min(w * 0.8, 14), mat = ZM.reg('other', new THREE.MeshBasicMaterial({ map: canvasTex(c2), transparent: true, depthWrite: false }));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw / 4), mat); p.rotation.x = -Math.PI / 2; p.position.set((X(a) + X(c)) / 2, h + 0.02, (Z(b) + Z(d)) / 2); zg('other').add(p); m.userData.label = p;
    }
  }
  // ── กระจกรอบชั้น + เสากระจก
  const GH = 3.4;
  OUTLINE.map((p, i) => [...p, ...OUTLINE[(i + 1) % OUTLINE.length]]).forEach(([ax, az, bx, bz]) => {
    const len = Math.hypot(bx - ax, bz - az);
    const g = add('shell', box(len, GH, 0.04), M.glassLite, (ax + bx) / 2, GH / 2, (az + bz) / 2, { cast: false }); g.rotation.y = -Math.atan2(bz - az, bx - ax); g.renderOrder = 2;
    const n = Math.round(len / 1.5);
    for (let i = 0; i <= n; i++) { const t = i / n, mx = lerp(ax, bx, t), mz = lerp(az, bz, t); add('shell', box(0.08, GH, 0.08), M.alu, mx, GH / 2, mz, { cast: false }); }
    const rail = add('shell', box(len, 0.1, 0.1), M.alu, (ax + bx) / 2, GH, (az + bz) / 2, { cast: false }); rail.rotation.y = g.rotation.y;
  });

  // ── ลิฟต์ (ประตูหันตะวันตก)
  {
    const zx0 = X(832), zx1 = X(915), z0 = Z(817), z1 = Z(908);
    const m = add('lobby', box(zx1 - zx0, WALL_H + 0.2, z1 - z0), [M.closed, M.closed, M.closedTop, M.closed, M.closed, M.closed], (zx0 + zx1) / 2, (WALL_H + 0.2) / 2, (z0 + z1) / 2); markWall(m, 'lobby', WALL_H + 0.2); walls.push(m);
    const doorMat = new THREE.MeshStandardMaterial({ color: '#aeb8c2', metalness: 0.85, roughness: 0.28 });
    [Z(842), Z(884)].forEach(z => {
      add('lobby', box(0.06, 2.4, 1.5), M.dark, zx0 - 0.03, 1.2, z);
      add('lobby', box(0.07, 2.25, 0.68), doorMat, zx0 - 0.05, 1.13, z - 0.355); add('lobby', box(0.07, 2.25, 0.68), doorMat, zx0 - 0.05, 1.13, z + 0.355);
      const sg = ZM.reg('lobby', new THREE.MeshBasicMaterial({ map: signCanvas([['ลิฟต์ · Lift', 700, 150, 150]], '#1d5fc0', '#fff', 1024, 300) }));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.41), sg); p.position.set(zx0 - 0.06, 2.75, z); p.rotation.y = -Math.PI / 2; zg('lobby').add(p);
    });
  }
  // ── ทางเข้า: ผนังฉากต้อนรับกลางทางเดิน ชิดผนังส่วนบริการ + โต๊ะลงทะเบียนยาวด้านหน้า (แบบงาน IWA) + ป้ายตั้ง + เสากั้นแถว
  {
    const zw = Z(676) + WT / 2, xc = X(822), WW = 6.2, WH = 3.0;
    const wm = ZM.reg('lobby', new THREE.MeshStandardMaterial({ map: regWallTex(), roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.14 })); wm.emissiveMap = wm.map;
    add('lobby', box(WW + 0.2, WH + 0.2, 0.12), M.white, xc, (WH + 0.2) / 2, zw + 0.06);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), wm); p.position.set(xc, WH / 2 + 0.1, zw + 0.125); zg('lobby').add(p);
    add('lobby', box(WW + 0.2, 0.06, 0.25), lightStripLobby, xc, WH + 0.23, zw + 0.2, { cast: false });
    // โต๊ะลงทะเบียน (หน้าโต๊ะสีน้ำเงินเข้ม "ลงทะเบียน · WELCOME")
    const dz = zw + 1.55, DW = 4.6;
    const fm = ZM.reg('lobby', new THREE.MeshStandardMaterial({ map: signCanvas([['ลงทะเบียน · Registration', 700, 110, 150], ['Stakeholder Day · การประปานครหลวง', 500, 56, 248, '#bfe3ff', F_BODY]], '#123f86', '#fff', 1600, 340), roughness: 0.5 }));
    add('lobby', new RoundedBoxGeometry(DW, 1.0, 0.65, 3, 0.04), M.white, xc, 0.5, dz);
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(DW - 0.06, 0.94), fm); fp.position.set(xc, 0.5, dz + 0.327); zg('lobby').add(fp);
    add('lobby', box(DW + 0.06, 0.04, 0.72), M.wood, xc, 1.02, dz);
    for (const dx of [-1.4, 0, 1.4]) { add('lobby', box(0.42, 0.28, 0.03), M.dark, xc + dx, 1.2, dz - 0.15).rotation.x = -0.2; add('lobby', box(0.04, 0.06, 0.04), M.alu, xc + dx, 1.07, dz - 0.18); }
    // ป้ายตั้ง 3 ป้าย
    [['ลงทะเบียนล่วงหน้า', 'Pre-Registered', -2.75], ['ลงทะเบียนหน้างาน', 'Onsite Registration', 2.75], ['ประชาสัมพันธ์', 'Helpdesk', 3.6]].forEach(([t1, t2, dx]) => { const dd = 0.15;
      const tm = ZM.reg('lobby', new THREE.MeshStandardMaterial({ map: totemTex(t1, t2), roughness: 0.55 }));
      add('lobby', box(0.62, 1.9, 0.08), tm, xc + dx, 0.97, dz + dd);
      add('lobby', box(0.7, 0.04, 0.36), M.dark, xc + dx, 0.02, dz + dd, { cast: false });
    });
    // เสากั้นแถว + สายผ้า
    const belt = new THREE.MeshStandardMaterial({ color: '#123f86', roughness: 0.6 });
    const posts = [[-2.0, 1.3], [-0.7, 1.3], [0.6, 1.3], [1.9, 1.3]];
    posts.forEach(([dx, dd]) => { add('lobby', new THREE.CylinderGeometry(0.03, 0.03, 0.95, 10), M.alu, xc + dx, 0.48, dz + dd); add('lobby', new THREE.CylinderGeometry(0.16, 0.16, 0.03, 18), M.alu, xc + dx, 0.015, dz + dd, { cast: false }); });
    for (const a of [-1.35, 1.25]) add('lobby', box(1.25, 0.05, 0.01), belt, xc + a, 0.9, dz + 1.3, { cast: false });
  }

  // ── บูธ
  const booths = [];
  const slots = boothSlots();
  const pMat = {};
  const propMat = {
    white: new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: '#c9d0d6', metalness: 0.8, roughness: 0.28 }),
    blue: new THREE.MeshStandardMaterial({ color: '#2f7df0', roughness: 0.45 }),
    pvc: new THREE.MeshStandardMaterial({ color: '#8a96a3', roughness: 0.45 }),
    bottle: new THREE.MeshPhysicalMaterial({ color: '#bfe6ff', roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.6 }),
    screenOn: new THREE.MeshStandardMaterial({ color: '#0d2a4a', emissive: '#2f7df0', emissiveIntensity: 0.35, roughness: 0.3 }),
  };
  // บูธ กปน. แบบผ้าตึงโค้ง 3 × 2.4 ม. + เคาน์เตอร์/อุปกรณ์ ตามภาพงานจริง
  const fabricFrame = new THREE.MeshStandardMaterial({ color: '#f1f4f7', roughness: 0.55 });
  const acrylic = new THREE.MeshPhysicalMaterial({ color: '#dff2ff', roughness: 0.04, transparent: true, opacity: 0.28, depthWrite: false });
  const waterM = new THREE.MeshStandardMaterial({ color: '#4fa8e0', roughness: 0.15, transparent: true, opacity: 0.55 });
  const pvcBlue = new THREE.MeshStandardMaterial({ color: '#3d8fd6', roughness: 0.4 });
  const cabBlue = new THREE.MeshStandardMaterial({ color: '#4fa3dc', roughness: 0.45 });
  const greyM = new THREE.MeshStandardMaterial({ color: '#a9b0b7', roughness: 0.55 });
  const carpetMWA = new THREE.MeshStandardMaterial({ color: '#d9dee4', roughness: 0.95 });
  const redM = new THREE.MeshStandardMaterial({ color: '#d63a3a', roughness: 0.5 }), steelM = new THREE.MeshStandardMaterial({ color: '#c8ced4', metalness: 0.85, roughness: 0.3 });
  const acrylicEdge = new THREE.MeshStandardMaterial({ color: '#bfe3f5', roughness: 0.2 }), toolboxM = new THREE.MeshStandardMaterial({ color: '#7d93a8', roughness: 0.5 });
  const lampM = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 1.2 }), pumpBlue = new THREE.MeshStandardMaterial({ color: '#2a4f9a', roughness: 0.45 });
  const platM = new THREE.MeshStandardMaterial({ color: '#8fa3b8', roughness: 0.6 }), skirtTop = new THREE.MeshStandardMaterial({ color: '#5a8fd0', roughness: 0.85 });
  const skirtCache = {}; const skirtM = w => skirtCache[w] || (skirtCache[w] = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    for (let x = 0; x < 512; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, '#4f86c9'); gr.addColorStop(0.5, '#6da0dc'); gr.addColorStop(1, '#3f74b8'); g.fillStyle = gr; g.fillRect(x, 0, 16, 256); }
    g.fillStyle = '#ffffff'; g.fillRect(0, 236, 512, 6); for (let x = 0; x < 512; x += 10) { g.beginPath(); g.arc(x + 5, 244, 5, 0, Math.PI); g.fill(); } g.fillRect(0, 36, 512, 4);
    const t = canvasTex(c, 8); t.wrapS = THREE.RepeatWrapping; t.repeat.set(Math.max(1, Math.round(w / 0.9)), 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }); })());
  const mkTex = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return canvasTex(c, 8); };
  const demoBoardTex = mkTex(256, 840, (g, w, h) => { g.fillStyle = '#eef3f7'; g.fillRect(0, 0, w, h); g.fillStyle = '#c9dbea'; for (let i = 0; i < 9; i++) g.fillRect(10 + i * 26, 520 - (i % 4) * 60, 22, 260 + (i % 4) * 60);
    g.fillStyle = '#4f8fd0'; g.fillRect(70, 160, 120, 380); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(130, 240, 44, 0, 7); g.fill(); g.fillStyle = '#9fc6ea'; g.beginPath(); g.arc(130, 240, 34, 0, 7); g.fill();
    g.fillStyle = '#7fb6e6'; g.fillRect(0, 780, w, 60); g.fillStyle = '#5a9bd8'; g.fillRect(0, 760, w, 22); });
  const tabletScreen = new THREE.MeshStandardMaterial({ map: mkTex(256, 160, (g, w, h) => { g.fillStyle = '#f4f8fc'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b7fe0'; g.fillRect(0, 0, w, 18); g.strokeStyle = '#2b7fe0'; g.lineWidth = 4; g.strokeRect(40, 50, 60, 70); g.strokeRect(150, 60, 60, 50); g.beginPath(); g.moveTo(100, 85); g.lineTo(150, 85); g.stroke(); }), emissive: '#ffffff', emissiveIntensity: 0.5 });
  tabletScreen.emissiveMap = tabletScreen.map;
  const qrTex = mkTex(128, 96, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 96); g.fillStyle = '#2b7fe0'; g.fillRect(0, 0, 128, 14); g.fillStyle = '#111'; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if ((i * 7 + j * 13 + i * j) % 3 === 0 || i % 9 === 0 || j % 9 === 0) g.fillRect(64 + i * 5, 26 + j * 6, 5, 6); });
  const twqScreen = mkTex(640, 360, (g, w, h) => { g.fillStyle = '#eaf2fa'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b86dc'; g.fillRect(0, 0, w, 34); g.fillStyle = '#fff'; g.font = `600 20px ${F_BODY}`; g.fillText('twqonline.mwa.co.th · ระบบตรวจสอบคุณภาพน้ำประปาออนไลน์', 14, 23);
    g.fillStyle = '#b7d6f0'; g.beginPath(); g.moveTo(80, 70); g.lineTo(420, 60); g.lineTo(560, 140); g.lineTo(520, 320); g.lineTo(200, 340); g.lineTo(60, 230); g.closePath(); g.fill();
    let sd = 3; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 40; i++) { g.fillStyle = R() < 0.92 ? '#4fae5a' : '#e05a5a'; g.beginPath(); g.arc(110 + R() * 400, 90 + R() * 220, 7, 0, 7); g.fill(); } });
  function panelTex(make) { const c = document.createElement('canvas'); c.width = 512; c.height = 512; make(c.getContext('2d')); return canvasTex(c, 8); }
  const cabPanel = panelTex(g => { g.fillStyle = '#6fb6e6'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#d5dbe0'; g.fillRect(90, 60, 332, 300); g.strokeStyle = '#7d8790'; g.lineWidth = 8; g.strokeRect(90, 60, 332, 300);
    g.fillStyle = '#1b232c'; g.fillRect(130, 90, 110, 46); g.fillRect(272, 90, 110, 46); const cs = ['#e04848', '#36b24a', '#f2b632', '#2d6ab8'];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = cs[(i + j) % 4]; g.beginPath(); g.arc(150 + j * 70, 180 + i * 42, 14, 0, 7); g.fill(); } g.fillStyle = '#c92a2a'; g.beginPath(); g.arc(380, 330, 20, 0, 7); g.fill();
    g.fillStyle = '#1b232c'; g.fillRect(170, 400, 170, 100); g.fillStyle = '#e8f3ff'; g.fillRect(180, 410, 150, 80); });
  const PM = {
    white: new THREE.MeshStandardMaterial({ color: '#f2f4f6', roughness: 0.35 }), grey: new THREE.MeshStandardMaterial({ color: '#8d969f', roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a3038', roughness: 0.4 }), steel: new THREE.MeshStandardMaterial({ color: '#c6ccd2', metalness: 0.85, roughness: 0.28 }),
    pvcG: new THREE.MeshStandardMaterial({ color: '#7d8a96', roughness: 0.4 }), red: new THREE.MeshStandardMaterial({ color: '#d23a32', roughness: 0.4 }),
    blue: new THREE.MeshStandardMaterial({ color: '#2a63c4', roughness: 0.4 }), green: new THREE.MeshStandardMaterial({ color: '#1f8a4c', roughness: 0.45 }),
    orange: new THREE.MeshStandardMaterial({ color: '#e07a2a', roughness: 0.45 }), yellow: new THREE.MeshStandardMaterial({ color: '#f2b632', roughness: 0.45 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#e6f4ff', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
    lcd: new THREE.MeshStandardMaterial({ color: '#0d2a4a', emissive: '#4fb4ff', emissiveIntensity: 0.5, roughness: 0.3 }),
  };
  const lightStrip = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 1.2 });
  slots.forEach((sl, idx) => {
    const src = sl.own === 'mwa' ? MWA_BOOTHS[sl.i] : PARTNERS[sl.i];
    const b = Object.assign({}, src, sl, { code: sl.own === 'mwa' ? 'M' + String(sl.i + 1).padStart(2, '0') : 'P' + String(sl.i + 1).padStart(2, '0'), col: sl.own === 'mwa' ? MWA_COL[sl.i] : src.col });
    const zone = sl.zone;
    const g = new THREE.Group(); g.position.set(sl.x, 0, sl.z); g.rotation.y = FACE[sl.face]; zg(zone).add(g);
    const inner = new THREE.Group(); g.add(inner);
    const A = (geo, mat, x, y, z, o = {}) => add(zone, geo, mat, x, y, z, Object.assign({ parent: inner }, o));
    if (sl.kind) mwaBooth(sl.kind, b, A, zone, inner);
    else {
    // พรมบูธ
    const carpet = new THREE.MeshStandardMaterial({ color: sl.own === 'mwa' ? '#1b4f9c' : '#4d5a67', roughness: 0.95 });
    A(box(2.0, 0.025, 1.0), carpet, 0, 0.0125, 0, { cast: false });
    // ผนังหลัง (กล่องไฟพิมพ์ลาย)
    A(new RoundedBoxGeometry(2.0, 2.45, 0.1, 2, 0.03), M.white, 0, 1.225, -0.45);
    const gm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: boothGraphic(b), roughness: 0.6, emissive: '#ffffff', emissiveIntensity: sl.own === 'mwa' ? 0.12 : 0.08 }));
    gm.emissiveMap = gm.map;
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(1.94, 2.33), gm); gp.position.set(0, 1.225, -0.395); inner.add(gp);
    // เคาน์เตอร์
    const cm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: counterGraphic(b), roughness: 0.5 }));
    A(new RoundedBoxGeometry(0.84, 0.98, 0.42, 3, 0.04), M.white, 0.52, 0.49, 0.18);
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), cm); cp.position.set(0.52, 0.48, 0.392); inner.add(cp);
    const topMat = pMat[b.col] || (pMat[b.col] = new THREE.MeshStandardMaterial({ color: b.col, roughness: 0.35 }));
    A(new RoundedBoxGeometry(0.9, 0.04, 0.48, 2, 0.015), topMat, 0.52, 1.0, 0.18);
    // อุปกรณ์จัดแสดง
    { const pg = new THREE.Group(); pg.position.set(-0.5, 0, 0.0); pg.scale.setScalar(1.3); inner.add(pg);            // ผลิตภัณฑ์ใหญ่ขึ้น 30% · ชิ้นบนเคาน์เตอร์คงขนาด
      const A2 = (geo, mat, x, y, z, o = {}) => x > 0 ? A(geo, mat, x + 0.22, y, z, o) : add(zone, geo, mat, x + 0.5, y, z, Object.assign({}, o, { parent: pg }));
      prop(b.prop, A2, propMat, M, b); }
    // ไฟส่องป้าย 2 ดวง + ไฟเส้นบนผนัง + ชั้นวางโบรชัวร์บนเคาน์เตอร์
    for (const sx of [-0.55, 0.55]) { A(box(0.025, 0.025, 0.32), propMat.steel, sx, 2.48, -0.27, { cast: false }); const lh = A(new THREE.CylinderGeometry(0.045, 0.06, 0.13, 14), M.dark, sx, 2.44, -0.1, { cast: false }); lh.rotation.x = 0.9; }
    A(box(1.96, 0.035, 0.035), lightStrip, 0, 2.43, -0.38, { cast: false });
    A(box(0.24, 0.2, 0.07), propMat.white, 0.74, 1.12, 0.26, { cast: false }); A(box(0.2, 0.16, 0.012), topMat, 0.74, 1.15, 0.30, { cast: false });
    }
    const hit = new THREE.Mesh(box((sl.w || 2) + 0.1, 2.6, (sl.d || 1) + 0.3), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 1.3, 0); hit.userData.booth = b; inner.add(hit);
    b.group = g; b.inner = inner; b.hit = hit; b.zone = zone;
    booths.push(b);
  });
  function mwaBooth(kind, b, A, zone, inner) {
    const BH = kind === 'cc' ? 2.3 : 2.4, W3 = REAL_BACKDROP[kind] ? BH * REAL_BACKDROP[kind][1] : 3.0, BZ = kind === 'wari' ? -1.05 : -0.55, BX = kind === 'cc' ? 1.0 : kind === 'twq' ? 0.45 : 0;
    A(box(kind === 'cc' ? 5.0 : kind === 'twq' ? 3.9 : 3.2, 0.02, kind === 'wari' ? 2.3 : kind === 'snap' ? 2.2 : 1.3), carpetMWA, 0, 0.01, kind === 'snap' ? 0.45 : 0, { cast: false });
    // ผ้าตึง: โครง + ผืนพิมพ์ + ฐานขาตั้ง
    A(new RoundedBoxGeometry(W3, BH, 0.07, 3, 0.03), fabricFrame, BX, BH / 2 + 0.05, BZ);
    const gtex = mwaBoothGraphic(kind, b); if (REAL_BACKDROP[kind]) realImg(gtex, REAL_BACKDROP[kind][0]);   // ป้ายจริงของ TWQ Online / Chlorine Care
    const gm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: gtex, roughness: 0.62, emissive: '#ffffff', emissiveIntensity: 0.1 })); gm.emissiveMap = gm.map;
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(W3 - 0.04, BH - 0.04), gm); gp.position.set(BX, BH / 2 + 0.05, BZ + 0.037); inner.add(gp);
    for (const fx of [-1.1, 1.1]) A(box(0.06, 0.03, 0.55), greyM, BX + fx, 0.015, BZ, { cast: false });
    const top = pMat['#1d5fc0'] || (pMat['#1d5fc0'] = new THREE.MeshStandardMaterial({ color: '#1d5fc0', roughness: 0.35 }));
    if (kind === 'cc') {
      // ── ตามภาพงานจริง (ซ้าย→ขวา): ชุดถังจำลอง · ตู้ควบคุมสีฟ้า · โต๊ะปั๊มจ่ายสาร + ถังสารเคมี · ผ้าตึงไดอะแกรม
      const pipe = (L, x, y, z, ax = 'y', r = 0.032, mat = pvcBlue) => { const m = A(new THREE.CylinderGeometry(r, r, L, 14), mat, x, y, z); if (ax === 'x') m.rotation.z = Math.PI / 2; if (ax === 'z') m.rotation.x = Math.PI / 2; return m; };
      const elbow = (x, y, z) => A(new THREE.SphereGeometry(0.042, 12, 10), pvcBlue, x, y, z);
      const valve = (x, y, z) => { A(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 12), pvcBlue, x, y, z); A(box(0.12, 0.02, 0.025), redM, x, y + 0.06, z + 0.03); };
      const caster = (x, z) => { A(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), M.dark, x, 0.035, z).rotation.z = Math.PI / 2; };
      // 1) ชุดถังจำลอง: ฐานเทาบนล้อ + ถังอะคริลิก + แผ่นหลังพิมพ์ลาย + ท่อ PVC ฟ้า + สายถักสเตนเลส + เซนเซอร์
      const tx = -2.05;
      for (const [dx, dz] of [[-0.4, -0.22], [0.4, -0.22], [-0.4, 0.3], [0.4, 0.3]]) caster(tx + dx, 0.05 + dz);
      A(box(0.92, 0.55, 0.62), greyM, tx, 0.34, 0.05);
      { const lt = realImg(mkTex(8, 4, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 8, 4); }), 'stakeholder_cc_logo.jpg'); const lm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: lt, roughness: 0.5 }));   // โลโก้ Chlorine Care หน้าฐานชุดถังจำลอง
        const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.74 * 350 / 839), lm); lp.position.set(tx, 0.36, 0.362); inner.add(lp); }
      A(box(0.8, 0.36, 0.5), acrylic, tx + 0.02, 0.8, 0.12, { cast: false }); A(box(0.76, 0.2, 0.46), waterM, tx + 0.02, 0.72, 0.12, { cast: false });
      for (const [dx, dz] of [[-0.4, -0.13], [0.42, -0.13], [-0.4, 0.37], [0.42, 0.37]]) A(box(0.012, 0.36, 0.012), acrylicEdge, tx + dx, 0.8, dz, { cast: false });
      const bm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: demoBoardTex, roughness: 0.6 }));
      A(box(0.62, 1.95, 0.04), greyM, tx + 0.12, 1.6, -0.22); const bp = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 1.9), bm); bp.position.set(tx + 0.12, 1.6, -0.198); inner.add(bp);
      pipe(1.45, tx - 0.36, 1.45, 0.02); elbow(tx - 0.36, 2.18, 0.02); pipe(0.5, tx - 0.11, 2.18, 0.02, 'x', 0.016, steelM);
      A(box(0.14, 0.08, 0.08), steelM, tx + 0.18, 2.18, 0.02); A(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 10), M.dark, tx + 0.18, 2.06, 0.06);
      pipe(0.9, tx + 0.42, 1.65, 0.05); elbow(tx + 0.42, 2.1, 0.05); pipe(0.55, tx + 0.15, 1.3, 0.05, 'x'); elbow(tx - 0.12, 1.3, 0.05); elbow(tx + 0.42, 1.3, 0.05);
      pipe(0.45, tx - 0.12, 1.08, 0.05); pipe(0.6, tx + 0.15, 0.62, 0.38, 'x'); valve(tx - 0.2, 0.62, 0.38); valve(tx - 0.12, 1.5, 0.05); valve(tx + 0.42, 1.0, 0.05);
      A(new THREE.ConeGeometry(0.07, 0.12, 14, 1, true), acrylic, tx + 0.3, 1.42, 0.16, { cast: false });
      const hose = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(tx + 0.3, 2.18, 0.02), new THREE.Vector3(tx + 0.55, 2.25, 0.05), new THREE.Vector3(tx + 0.62, 1.6, 0.1), new THREE.Vector3(tx + 0.75, 0.75, 0.2), new THREE.Vector3(-1.3, 0.4, 0.25)]), 40, 0.012, 8);
      A(hose, steelM, 0, 0, 0, { cast: false });
      // 2) ตู้ควบคุมสีฟ้า: ตู้บน (ประตูเทา จอตัวเลข ปุ่ม ไฟ E-stop) + คอนโซลเอียง + แท็บเล็ต + ชั้นล่างวางกล่องเครื่องมือ
      const cx = -1.12;
      for (const [dx, dz] of [[-0.3, -0.16], [0.3, -0.16], [-0.3, 0.3], [0.3, 0.3]]) caster(cx + dx, 0.07 + dz);
      A(box(0.74, 0.04, 0.64), greyM, cx, 0.07, 0.07);
      for (const dx of [-0.34, 0.34]) A(box(0.04, 0.72, 0.5), cabBlue, cx + dx, 0.43, 0.03);
      A(box(0.64, 0.03, 0.46), greyM, cx, 0.42, 0.03);
      A(new RoundedBoxGeometry(0.34, 0.16, 0.24, 2, 0.02), toolboxM, cx - 0.05, 0.53, 0.05); A(box(0.42, 0.18, 0.3), acrylic, cx, 0.17, 0.05, { cast: false });
      const con = new THREE.Shape([new THREE.Vector2(-0.25, 0), new THREE.Vector2(0.25, 0), new THREE.Vector2(0.25, 0.34), new THREE.Vector2(-0.25, 0.1)]);
      const cg = new THREE.ExtrudeGeometry(con, { depth: 0.72, bevelEnabled: false }); cg.rotateY(Math.PI / 2); cg.translate(-0.36, 0, 0.0);
      A(cg, cabBlue, cx, 0.79, 0.05);
      const tb = A(box(0.3, 0.2, 0.015), M.screen, cx, 1.02, 0.17); tb.rotation.x = -1.18; const tbs = A(box(0.27, 0.17, 0.004), tabletScreen, cx, 1.03, 0.175, { cast: false }); tbs.rotation.x = -1.18;
      A(box(0.74, 0.04, 0.5), cabBlue, cx, 1.14, -0.02);
      A(box(0.74, 0.8, 0.46), cabBlue, cx, 1.56, -0.05); A(box(0.76, 0.06, 0.48), cabBlue, cx, 1.99, -0.05);
      { const lt = realImg(mkTex(8, 4, (g) => { g.fillStyle = '#00c0f0'; g.fillRect(0, 0, 8, 4); }), 'stakeholder_cc_logo_blue.jpg'); const lm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: lt, roughness: 0.45 }));   // ป้ายโลโก้ Chlorine Care บนตู้ควบคุม
        A(box(0.74, 0.31, 0.02), cabBlue, cx, 2.18, 0.02); const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72 * 366 / 904), lm); lp.position.set(cx, 2.18, 0.031); inner.add(lp); }
      const pm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: cabPanel, roughness: 0.5 })); const pp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.66), pm); pp.position.set(cx - 0.05, 1.56, 0.182); inner.add(pp);
      for (const dx of [-0.11, 0.0]) A(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 14), lampM, cx - 0.05 + dx, 1.84, 0.19, { cast: false }).rotation.x = Math.PI / 2;
      // 3) โต๊ะเทา: ปั๊มจ่ายสาร ขวดสาร ป้าย QR · ถังสาร 60 ลิตรใต้โต๊ะ · สายยางขาวโยงไปตู้
      const t2 = -0.36;
      A(box(0.5, 0.03, 0.46), greyM, t2, 0.86, 0.1); for (const [dx, dz] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) A(box(0.03, 0.86, 0.03), greyM, t2 + dx, 0.43, 0.1 + dz);
      A(new RoundedBoxGeometry(0.18, 0.12, 0.14, 2, 0.03), pumpBlue, t2 + 0.05, 0.94, 0.05); A(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 12), M.dark, t2 + 0.16, 0.94, 0.05).rotation.z = Math.PI / 2;
      A(new THREE.CylinderGeometry(0.035, 0.04, 0.14, 12), M.white, t2 - 0.17, 0.95, 0.0);
      const qm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: qrTex, roughness: 0.5 })); const q = A(box(0.16, 0.12, 0.01), qm, t2 - 0.08, 0.94, 0.27); q.rotation.x = -0.35;
      A(new THREE.CylinderGeometry(0.2, 0.21, 0.55, 24), M.white, t2 + 0.02, 0.28, 0.1); A(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), M.white, t2 + 0.02, 0.58, 0.1);
      const tube = (pts) => A(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 30, 0.008, 6), M.white, 0, 0, 0, { cast: false });
      tube([[t2 + 0.02, 0.6, 0.1], [t2 - 0.1, 0.8, 0.2], [t2 + 0.05, 0.94, 0.13]]); tube([[t2 + 0.16, 0.94, 0.05], [t2 + 0.4, 1.1, 0.0], [t2 + 0.55, 0.8, -0.2]]); tube([[cx + 0.37, 1.2, 0.05], [t2 - 0.3, 0.9, 0.25], [t2 - 0.12, 0.95, 0.05]]);
    } else if (kind === 'clinic') {
      // โพเดียมกลมพิมพ์ลาย + ชั้นวางโบรชัวร์
      const cm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: counterPrint('clinic'), roughness: 0.5 }));
      A(new THREE.CylinderGeometry(0.62, 0.62, 0.98, 36, 1, false, -Math.PI / 2.6, Math.PI / 1.3), cm, 0, 0.49, -0.05);
      A(new THREE.CylinderGeometry(0.64, 0.64, 0.04, 36, 1, false, -Math.PI / 2.6, Math.PI / 1.3), M.white, 0, 1.0, -0.05);
      A(box(0.26, 0.3, 0.12), M.white, -0.2, 1.17, 0.25, { cast: false }); A(box(0.22, 0.24, 0.02), top, -0.2, 1.2, 0.31, { cast: false });
    } else if (kind === 'twq') {
      // ── ตามภาพงานจริง: โต๊ะคลุมผ้าจับจีบสีฟ้าขอบลูกไม้ขาว + ทีวีจอใหญ่บนขาตั้ง (ซ้าย) · ผ้าตึงแผนที่ (ขวา) · ป้ายตั้งมาสคอต
      const TX = -1.2, TW = 1.5, TD = 0.75, TH = 0.76;
      A(box(TW, 0.03, TD), skirtTop, TX, TH, 0.0);
      const sk = (w, x, z, ry) => { const m = A(box(w, TH - 0.02, 0.012), skirtM(w), x, (TH - 0.02) / 2 + 0.01, z); m.rotation.y = ry; };
      sk(TW + 0.04, TX, TD / 2 + 0.01, 0); sk(TD + 0.02, TX - TW / 2 - 0.01, 0, Math.PI / 2); sk(TD + 0.02, TX + TW / 2 + 0.01, 0, Math.PI / 2);
      A(box(TW + 0.05, 0.05, TD + 0.05), skirtTop, TX, TH - 0.02, 0.0, { cast: false });
      // ทีวี 55 นิ้ว
      for (const dx of [-0.42, 0.42]) { const l = A(box(0.03, 0.02, 0.26), M.dark, TX + dx, TH + 0.025, 0.02); l.rotation.y = dx < 0 ? 0.35 : -0.35; }
      A(box(1.24, 0.72, 0.05), M.dark, TX, TH + 0.43, -0.02); const scrM = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: twqScreen, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.25 })); scrM.emissiveMap = scrM.map;
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(1.19, 0.67), scrM); sc.position.set(TX, TH + 0.43, 0.006); inner.add(sc);
      A(box(0.18, 0.02, 0.05), M.dark, TX - 0.3, TH + 0.025, 0.25, { cast: false });
      const sm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: standeeTex(), transparent: true, alphaTest: 0.5, roughness: 0.6 }));
      const sd = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), sm); sd.position.set(1.62, 0.6, 0.35); sd.rotation.y = -0.4; sd.castShadow = true; inner.add(sd);
    } else if (kind === 'wari') {
      // แท่นกลม + หุ่นยนต์สำรวจคลอง (เรือสองท้อง แผงโซลาร์ กล่องอุปกรณ์ ใบพัดท้าย)
      const cream = new THREE.MeshStandardMaterial({ color: '#f2c21b', roughness: 0.38 }), creamD = new THREE.MeshStandardMaterial({ color: '#d9a400', roughness: 0.45 });   // เรือสีเหลือง
      const rz = 0.2, rx = 0.15;
      A(new THREE.CylinderGeometry(1.08, 1.1, 0.3, 56), M.white, rx, 0.15, rz); A(new THREE.TorusGeometry(1.09, 0.025, 8, 72), top, rx, 0.3, rz).rotation.x = Math.PI / 2;
      A(new THREE.CylinderGeometry(1.0, 1.0, 0.01, 56), platM, rx, 0.305, rz, { cast: false });
      const robot = new THREE.Group(); robot.position.set(rx, 0.31, rz); robot.rotation.y = 0.75; robot.scale.setScalar(1.25); inner.add(robot);
      const R = (geo, mat, x, y, z, rxx = 0, ryy = 0, rzz = 0) => { const m = new THREE.Mesh(geo, ZM.m(zone, mat)); m.position.set(x, y, z); m.rotation.set(rxx, ryy, rzz); m.castShadow = true; m.receiveShadow = true; robot.add(m); return m; };
      for (const hx of [-0.36, 0.36]) {
        const hull = R(new THREE.CapsuleGeometry(0.15, 1.15, 6, 16), cream, hx, 0.16, 0, Math.PI / 2); hull.scale.set(1, 1, 0.82);
        R(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 20, 1, true), creamD, hx, 0.14, -0.8, Math.PI / 2);                       // ท่อใบพัด
        for (let k = 0; k < 3; k++) R(new THREE.BoxGeometry(0.2, 0.02, 0.05), M.dark, hx, 0.14, -0.8, 0, 0, k * Math.PI / 3);
        R(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10), M.dark, hx, 0.14, -0.72, Math.PI / 2);
      }
      for (const bz of [-0.38, 0.38]) R(new THREE.BoxGeometry(0.9, 0.05, 0.08), creamD, 0, 0.33, bz);
      R(new RoundedBoxGeometry(0.5, 0.3, 0.6, 3, 0.04), cream, 0, 0.5, 0.05);
      R(new THREE.BoxGeometry(0.3, 0.17, 0.01), M.screen, 0, 0.52, 0.355);
      for (const [lx, lz] of [[-0.32, -0.3], [0.32, -0.3], [-0.32, 0.32], [0.32, 0.32]]) R(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), M.alu, lx, 0.62, lz);
      const sol = new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#1d2f4f'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#8aa0bd'; for (let i = 0; i <= 256; i += 32) { g.fillRect(i, 0, 2, 256); g.fillRect(0, i, 256, 2); } return canvasTex(c, 8); })(), roughness: 0.3, metalness: 0.3 });
      R(new THREE.BoxGeometry(0.86, 0.025, 0.78), sol, 0, 0.84, 0.0, -0.08);
      R(new THREE.BoxGeometry(0.9, 0.02, 0.82), M.alu, 0, 0.825, 0.0, -0.08);
      R(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), M.dark, 0.18, 1.0, -0.25);
    } else if (kind === 'snap') {
      // ── ตามภาพงานจริง: โต๊ะผ้าจับจีบฟ้าขอบลูกไม้ · อุปกรณ์ Snap On 2 ชุด + สว่านไร้สาย + เครื่องมือโครงฟ้า + การ์ดการ์ตูน + โน้ตบุ๊ก
      //    หน้าบูธ: ท่อ PVC สีฟ้า "SNAP ON" บนขาหยั่งไม้ ติดแหวนยางดำ + อุปกรณ์ที่ปลายท่อ · ขาตั้งภาพการ์ตูนด้านขวา
      const rubber = new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.85 }), alu = new THREE.MeshStandardMaterial({ color: '#d5dbe1', metalness: 0.8, roughness: 0.28 });
      const brass = new THREE.MeshStandardMaterial({ color: '#c9a85a', metalness: 0.7, roughness: 0.35 }), drillR = new THREE.MeshStandardMaterial({ color: '#d6252b', roughness: 0.45 }), drillK = new THREE.MeshStandardMaterial({ color: '#1e2024', roughness: 0.6 });
      const pvc = new THREE.MeshStandardMaterial({ color: '#5cc3e6', roughness: 0.35 }), woodM = new THREE.MeshStandardMaterial({ color: '#d7b68a', roughness: 0.75 }), toolBlue = new THREE.MeshStandardMaterial({ color: '#3f8fe0', metalness: 0.3, roughness: 0.4 });
      const grp = (x, y, z, ry = 0, s = 1) => { const q = new THREE.Group(); q.position.set(x, y, z); q.rotation.y = ry; q.scale.setScalar(s); inner.add(q); const f = (geo, mat, a, b2, c, o = {}) => A(geo, mat, a, b2, c, Object.assign({ parent: q }, o)); f.g = q; return f; };
      const rod = (D, p, q2, r, mat) => { const a = new THREE.Vector3(...p), b2 = new THREE.Vector3(...q2), d = b2.clone().sub(a); const m = D(new THREE.CylinderGeometry(r, r, d.length(), 8), mat, (a.x + b2.x) / 2, (a.y + b2.y) / 2, (a.z + b2.z) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m; };
      // อุปกรณ์ขยายแหวนยาง: แกนวงแหวนตามแกน z ของกลุ่ม (วงแหวนหน้า z=0 → โครงด้านหลัง → สว่าน)
      const device = (D, drill = true) => {
        D(new THREE.TorusGeometry(0.165, 0.017, 10, 48), rubber, 0, 0, 0);
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, m = D(box(0.11, 0.012, 0.075), alu, Math.cos(a) * 0.147, Math.sin(a) * 0.147, 0.01); m.rotation.z = a + Math.PI / 2;
          const sp = D(box(0.13, 0.016, 0.012), alu, Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.05); sp.rotation.z = a; }
        D(new THREE.CylinderGeometry(0.026, 0.026, 0.09, 16), brass, 0, 0, 0.05).rotation.x = Math.PI / 2;
        D(new THREE.TorusGeometry(0.152, 0.02, 8, 40), alu, 0, 0, 0.13);
        for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; rod(D, [Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.13], [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.42], 0.009, alu); }
        D(box(0.27, 0.27, 0.008), alu, 0, 0, 0.42);
        rod(D, [0, 0, 0.0], [0, 0, 0.52], 0.008, alu);
        if (drill) { D(new THREE.CylinderGeometry(0.036, 0.04, 0.17, 16), drillK, 0, 0, 0.56).rotation.x = Math.PI / 2; D(new THREE.CylinderGeometry(0.041, 0.041, 0.06, 16), drillR, 0, 0, 0.62).rotation.x = Math.PI / 2;
          D(box(0.045, 0.15, 0.05), drillK, 0, -0.1, 0.62); D(new RoundedBoxGeometry(0.075, 0.06, 0.11, 2, 0.012), drillR, 0, -0.2, 0.63); D(box(0.06, 0.012, 0.012), drillR, 0, -0.04, 0.585); }
      };
      // โต๊ะผ้าจับจีบ
      const TX = -0.15, TW = 2.1, TD = 0.75, TH = 0.76, TZ = -0.05;
      A(box(TW, 0.03, TD), skirtTop, TX, TH, TZ);
      const sk = (w, x, z, ry) => { const m = A(box(w, TH - 0.02, 0.012), skirtM(w), x, (TH - 0.02) / 2 + 0.01, z); m.rotation.y = ry; };
      sk(TW + 0.04, TX, TZ + TD / 2 + 0.01, 0); sk(TD + 0.02, TX - TW / 2 - 0.01, TZ, Math.PI / 2); sk(TD + 0.02, TX + TW / 2 + 0.01, TZ, Math.PI / 2);
      A(box(TW + 0.05, 0.05, TD + 0.05), skirtTop, TX, TH - 0.02, TZ, { cast: false });
      device(grp(TX - 0.65, TH + 0.2, TZ + 0.05, -0.55));                                  // ชุดที่ 1 (วงแหวนยางดำ + สว่าน)
      { const D = grp(TX + 0.05, TH + 0.19, TZ - 0.05, 0.25); D(new THREE.TorusGeometry(0.16, 0.02, 8, 40), alu, 0, 0, 0); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, sp = D(box(0.15, 0.022, 0.014), alu, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0); sp.rotation.z = a; }
        D(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 14), alu, 0, 0, 0.02).rotation.x = Math.PI / 2; D(box(0.05, 0.2, 0.05), alu, 0, -0.1, 0.06); }
      { const D = grp(TX + 0.55, TH + 0.015, TZ + 0.0, 0.4); rod(D, [-0.12, 0, 0], [0.12, 0, 0], 0.012, toolBlue); rod(D, [-0.12, 0, 0], [0, 0.3, 0], 0.012, toolBlue); rod(D, [0.12, 0, 0], [0, 0.3, 0], 0.012, toolBlue); rod(D, [0, 0.3, 0], [0, 0.3, 0.25], 0.012, alu); D(box(0.3, 0.012, 0.06), toolBlue, 0, 0.005, 0.05); }
      // การ์ดการ์ตูน "Snap On" + โน้ตบุ๊ก
      const card = mkTex(240, 340, (g, w, h) => { const gg = g.createLinearGradient(0, 0, 0, h); gg.addColorStop(0, '#f39a3c'); gg.addColorStop(1, '#7a3b16'); g.fillStyle = gg; g.fillRect(0, 0, w, h);
        g.fillStyle = '#1f6fd6'; g.beginPath(); g.arc(120, 170, 46, Math.PI, 0); g.fill(); g.fillStyle = '#f2c9a0'; g.beginPath(); g.arc(120, 192, 34, 0, 7); g.fill(); g.fillStyle = '#d8f23a'; g.fillRect(78, 228, 84, 80); g.strokeStyle = '#1f6fd6'; g.lineWidth = 10; g.beginPath(); g.arc(120, 290, 40, 0, 7); g.stroke();
        g.fillStyle = '#ffffff'; g.font = `900 46px ${F_HEAD}`; g.textAlign = 'center'; g.fillText('Snap On', 120, 70); g.fillStyle = '#ffd23a'; g.font = `700 22px ${F_BODY}`; g.fillText('กปน. · สสสภ.', 120, 104); });
      const cardM = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: card, roughness: 0.6 }));
      for (const [x, ry] of [[TX - 0.25, 0.15], [TX + 0.85, -0.2]]) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.24), cardM); c.position.set(x, TH + 0.14, TZ + 0.28); c.rotation.set(-0.15, ry, 0); inner.add(c); A(box(0.18, 0.012, 0.06), M.dark, x, TH + 0.022, TZ + 0.25, { cast: false }); }
      A(box(0.34, 0.015, 0.24), M.dark, TX + 0.85, TH + 0.023, TZ - 0.12); const lid = A(box(0.34, 0.23, 0.012), M.dark, TX + 0.85, TH + 0.13, TZ - 0.24); lid.rotation.x = -0.2;
      const lsc = A(box(0.31, 0.2, 0.003), propMat.screenOn, TX + 0.85, TH + 0.13, TZ - 0.232, { cast: false }); lsc.rotation.x = -0.2;
      // ท่อ PVC สีฟ้าบนขาหยั่งไม้ (หน้าบูธ)
      const PZ = 0.95, PR = 0.17, PL = 1.75, PY = 0.52 + 0.025 + PR;
      A(box(1.15, 0.05, 0.09), woodM, 0, 0.52, PZ);
      for (const sx of [-0.52, 0.52]) for (const sz of [-1, 1]) rod(A, [sx, 0.5, PZ + sz * 0.03], [sx + Math.sign(sx) * 0.06, 0.0, PZ + sz * 0.26], 0.022, woodM);
      for (const sx of [-0.52, 0.52]) A(box(0.04, 0.04, 0.42), woodM, sx + Math.sign(sx) * 0.04, 0.18, PZ);
      A(box(1.1, 0.035, 0.035), woodM, 0, 0.18, PZ);
      const pipe = A(new THREE.CylinderGeometry(PR, PR, PL, 40), pvc, -0.1, PY, PZ); pipe.rotation.z = Math.PI / 2;
      const pin = A(new THREE.CylinderGeometry(PR - 0.012, PR - 0.012, PL + 0.002, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#2f86b0', roughness: 0.5, side: THREE.BackSide }), -0.1, PY, PZ, { cast: false }); pin.rotation.z = Math.PI / 2;
      const ptx = mkTex(256, 1024, (g, w, h) => { g.clearRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillStyle = '#ffffff';
        g.font = `900 150px ${F_HEAD}`; g.fillText('SNAP ON', 0, 10); g.font = `600 46px ${F_BODY}`; g.fillText('สำนักงานประปาสาขาสุวรรณภูมิ', 0, 80); g.restore(); });
      const pd = A(new THREE.CylinderGeometry(PR + 0.002, PR + 0.002, PL * 0.75, 30, 1, true, -0.85, 1.7), new THREE.MeshStandardMaterial({ map: ptx, transparent: true, roughness: 0.4 }), -0.1, PY, PZ, { cast: false }); pd.rotation.z = Math.PI / 2;
      A(new THREE.TorusGeometry(PR - 0.004, 0.022, 10, 44), rubber, -0.1 + PL / 2 - 0.02, PY, PZ).rotation.y = Math.PI / 2;      // แหวนยางยีโบลท์ที่ปากท่อ
      device(grp(-0.1 + PL / 2 + 0.03, PY, PZ, Math.PI / 2, 0.92), true);                   // อุปกรณ์ Snap On สวมที่ปลายท่อ
      // ขาตั้งภาพการ์ตูน (ขวา)
      { const ex = 1.38, ez = 0.15; const D = grp(ex, 0, ez, -0.35);
        rod(D, [0, 1.75, -0.02], [-0.32, 0, 0.12], 0.016, drillK); rod(D, [0, 1.75, -0.02], [0.32, 0, 0.12], 0.016, drillK); rod(D, [0, 1.6, -0.04], [0, 0, -0.45], 0.016, drillK); D(box(0.7, 0.03, 0.08), drillK, 0, 0.82, 0.08);
        const art = mkTex(480, 600, (g, w, h) => { const gg = g.createRadialGradient(240, 260, 40, 240, 300, 380); gg.addColorStop(0, '#ffcf73'); gg.addColorStop(0.6, '#c8692a'); gg.addColorStop(1, '#5a2a12'); g.fillStyle = gg; g.fillRect(0, 0, w, h);
          g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(240, 230, 150, 0, 7); g.fill();
          g.fillStyle = '#1f6fd6'; g.beginPath(); g.arc(200, 210, 62, Math.PI, 0); g.fill(); g.fillRect(132, 205, 140, 14); g.fillStyle = '#f2c9a0'; g.beginPath(); g.arc(200, 245, 46, 0, 7); g.fill();
          g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(184, 240, 6, 0, 7); g.arc(214, 240, 6, 0, 7); g.fill(); g.strokeStyle = '#7a3b16'; g.lineWidth = 4; g.beginPath(); g.arc(200, 258, 14, 0.2, Math.PI - 0.2); g.stroke();
          g.fillStyle = '#d8f23a'; g.beginPath(); g.roundRect(140, 292, 120, 150, 18); g.fill(); g.fillStyle = '#cfd6dc'; g.fillRect(140, 340, 120, 10); g.fillRect(140, 390, 120, 10);
          g.strokeStyle = '#2f86c0'; g.lineWidth = 26; g.beginPath(); g.ellipse(330, 420, 80, 105, 0.2, 0, 7); g.stroke(); g.fillStyle = '#5cc3e6'; g.fillRect(0, 470, w, 130); g.fillStyle = '#ffffff'; g.font = `900 64px ${F_HEAD}`; g.textAlign = 'center'; g.fillText('SNAP ON', 240, 555); });
        D(box(0.62, 0.78, 0.035), new THREE.MeshStandardMaterial({ color: '#efe6d6', roughness: 0.6 }), 0, 1.25, 0.1);
        const am = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: art, roughness: 0.55 })); const ap = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.7), am); ap.position.set(0, 1.25, 0.119); D.g.add(ap); }
    } else if (kind === 'cia') {
      // ── CIA Machine (ตามภาพจริง): ฐานพลาสติกสีฟ้ามีล้อ · แผงโซลาร์ด้านบน · ฝากล่องเทาเปิด · เสาสูงพร้อมกล้อง PTZ โดม · ไฟไซเรนแดง · เสาอากาศ 4G
      //    + มาสคอตหยดน้ำบนกล่องตั้ง "MWA Water Excellence Center" · เคาน์เตอร์โน้ตบุ๊ก CIA System
      const blueP = new THREE.MeshStandardMaterial({ color: '#1f73d6', roughness: 0.45 }), greyP = new THREE.MeshStandardMaterial({ color: '#6f7780', roughness: 0.6 }), mast = new THREE.MeshStandardMaterial({ color: '#c9ced4', metalness: 0.7, roughness: 0.35 });
      const whiteP = new THREE.MeshStandardMaterial({ color: '#f2f4f6', roughness: 0.35 }), redL = new THREE.MeshStandardMaterial({ color: '#ff3b2f', emissive: '#ff2a1a', emissiveIntensity: 0.8, roughness: 0.3 }), blk = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.4 });
      const sol = new THREE.MeshStandardMaterial({ map: mkTex(256, 256, (g, w, h) => { g.fillStyle = '#1d2f4f'; g.fillRect(0, 0, w, h); g.fillStyle = '#8aa0bd'; for (let i = 0; i <= 256; i += 32) { g.fillRect(i, 0, 2, 256); g.fillRect(0, i, 256, 2); } }), roughness: 0.25, metalness: 0.3 });
      const mx = -1.02, mz = 0.38;                                     // ตำแหน่งเครื่อง (หน้าซ้ายของบูธ)
      const body = new THREE.Shape([[-0.45, 0], [0.45, 0], [0.48, 0.12], [0.42, 0.42], [0.2, 0.5], [-0.38, 0.5], [-0.47, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)));
      const bg = new THREE.ExtrudeGeometry(body, { depth: 0.56, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 }); bg.translate(0, 0, -0.28); bg.rotateY(Math.PI / 2);
      A(bg, blueP, mx, 0.07, mz);
      for (const sz of [-0.33, 0.33]) { A(new THREE.CylinderGeometry(0.08, 0.08, 0.05, 18), blk, mx + sz, 0.08, mz - 0.3).rotation.z = Math.PI / 2; }
      A(box(0.4, 0.03, 0.34), greyP, mx, 0.6, mz + 0.05); A(box(0.36, 0.012, 0.3), sol, mx, 0.618, mz + 0.05, { cast: false });
      const lid = A(box(0.44, 0.03, 0.4), greyP, mx, 0.72, mz + 0.42); lid.rotation.x = -1.1;
      A(box(0.05, 2.0, 0.05), mast, mx, 1.55, mz - 0.25); A(box(0.06, 0.04, 0.24), mast, mx, 2.35, mz - 0.15);
      A(new THREE.SphereGeometry(0.11, 18, 14), whiteP, mx, 2.25, mz - 0.04); A(new THREE.SphereGeometry(0.085, 18, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), blk, mx, 2.2, mz - 0.04);
      A(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 16), whiteP, mx, 2.37, mz - 0.04);
      A(new THREE.CylinderGeometry(0.055, 0.06, 0.04, 16), whiteP, mx, 2.6, mz - 0.25); A(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 16), redL, mx, 2.68, mz - 0.25);
      for (const [ax, az] of [[-0.07, -0.05], [0.07, -0.05], [-0.05, 0.06], [0.05, 0.06]]) { const an = A(new THREE.CylinderGeometry(0.008, 0.012, 0.3, 6), blk, mx + ax, 2.5, mz - 0.25 + az); an.rotation.set(az * 6, 0, -ax * 6); }
      // มาสคอตบนกล่องตั้ง
      const cube = mkTex(512, 512, (g, w, h) => { g.fillStyle = '#2a4fd0'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.font = `800 56px ${F_HEAD}`; ['MWA', 'WATER', 'EXCELLENCE', 'CENTER'].forEach((t, i) => g.fillText(t, 256, 170 + i * 72)); });
      const cubeM = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: cube, roughness: 0.5 }));
      A(box(0.5, 0.5, 0.5), cubeM, 1.15, 0.25, 0.3);
      const masc = mkTex(400, 560, (g, w, h) => { g.clearRect(0, 0, w, h); drop(g, 200, 250, 1.35); g.fillStyle = '#5ea8f0'; g.beginPath(); g.roundRect(120, 380, 160, 150, 40); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(305, 420, 32, 0, 7); g.fill(); });
      const mm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: masc, transparent: true, alphaTest: 0.4, roughness: 0.6, side: THREE.DoubleSide }));
      const mp = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.98), mm); mp.position.set(1.15, 0.99, 0.3); mp.rotation.y = -0.3; mp.castShadow = true; inner.add(mp);
      // เคาน์เตอร์ + โน้ตบุ๊ก CIA System + มือถือแอป
      A(new RoundedBoxGeometry(0.9, 0.9, 0.45, 3, 0.04), M.white, 0.35, 0.45, 0.55); A(new RoundedBoxGeometry(0.94, 0.04, 0.5, 2, 0.015), top, 0.35, 0.92, 0.55);
      const dash = mkTex(320, 200, (g, w, h) => { g.fillStyle = '#eef3f8'; g.fillRect(0, 0, w, h); g.fillStyle = '#26364a'; g.fillRect(0, 0, 46, h); g.fillStyle = '#c9e3c0'; g.fillRect(56, 30, 150, 160); for (let k = 0; k < 7; k++) { g.fillStyle = k % 3 ? '#22b07a' : '#f2a81b'; g.beginPath(); g.arc(90 + (k * 31) % 100, 70 + (k * 23) % 90, 5, 0, 7); g.fill(); }
        g.fillStyle = '#d6252b'; g.fillRect(214, 30, 30, 22); g.fillStyle = '#2a6fdb'; g.fillRect(250, 30, 30, 22); g.fillStyle = '#22b07a'; g.fillRect(286, 30, 30, 22); g.fillStyle = '#2a6fdb'; for (let k = 0; k < 6; k++) g.fillRect(216 + k * 16, 180 - (k * 17) % 50 - 30, 10, 30 + (k * 17) % 50); });
      const dm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: dash, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.3 })); dm.emissiveMap = dm.map;
      A(box(0.36, 0.015, 0.25), M.dark, 0.3, 0.95, 0.52); const ld = A(box(0.36, 0.24, 0.012), M.dark, 0.3, 1.07, 0.4); ld.rotation.x = -0.2;
      const ls = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.21), dm); ls.position.set(0.3, 1.07, 0.408); ls.rotation.x = -0.2; inner.add(ls);
      A(box(0.08, 0.15, 0.012), M.dark, 0.66, 1.0, 0.55).rotation.x = -0.35;
    } else if (kind === 'generic') {
      const cm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: counterPrintName(b), roughness: 0.5 }));
      A(new RoundedBoxGeometry(1.3, 0.98, 0.5, 3, 0.05), M.white, 0.55, 0.49, 0.2); const cp = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.9), cm); cp.position.set(0.55, 0.49, 0.452); inner.add(cp);
      A(new RoundedBoxGeometry(1.36, 0.04, 0.56, 2, 0.015), top, 0.55, 1.0, 0.2);
      A(box(0.05, 1.3, 0.05), M.alu, -0.7, 0.65, -0.2); A(box(0.9, 0.53, 0.05), M.dark, -0.7, 1.5, -0.2); A(box(0.84, 0.47, 0.01), propMat.screenOn, -0.7, 1.5, -0.17, { cast: false });
    }
  }
  // ── ผลิตภัณฑ์จัดแสดงของบริษัท (บูธละ 1–2 ชิ้น) วางบนแท่นด้านซ้ายของบูธ · ชิ้นเล็กวางบนเคาน์เตอร์
  function prop(kind, A, P, M, b) {
    const C = b && b.col ? (pMat[b.col] || (pMat[b.col] = new THREE.MeshStandardMaterial({ color: b.col, roughness: 0.35 }))) : PM.blue;
    const cyl = (r, h, m, x, y, z, rx = 0, rz = 0, seg = 20) => { const o = A(new THREE.CylinderGeometry(r, r, h, seg), m, x, y, z); o.rotation.x = rx; o.rotation.z = rz; return o; };
    const plinth = (x, w = 0.6, d = 0.5, h = 0.55) => { A(new RoundedBoxGeometry(w, h, d, 2, 0.03), PM.white, x, h / 2, 0.08); A(box(w + 0.02, 0.02, d + 0.02), C, x, h + 0.01, 0.08, { cast: false }); return h + 0.02; };
    const lcd = (w, h, x, y, z) => A(box(w, h, 0.012), PM.lcd, x, y, z, { cast: false });
    if (kind === 'analyzer') {                      // Yokogawa: ชุดวิเคราะห์บนแผงตั้ง (ตัวส่งสัญญาณ 2 เครื่อง + เซลล์ไหลผ่าน + ท่อ)
      A(box(0.75, 1.6, 0.05), PM.white, -0.5, 0.82, -0.2); A(box(0.6, 0.04, 0.35), PM.grey, -0.5, 0.02, -0.08);
      for (const y of [1.35, 0.95]) { A(new RoundedBoxGeometry(0.26, 0.24, 0.12, 2, 0.02), PM.grey, -0.6, y, -0.12); lcd(0.14, 0.08, -0.6, y + 0.03, -0.059); A(box(0.05, 0.05, 0.02), C, -0.52, y - 0.07, -0.058); }
      cyl(0.04, 0.32, PM.glass, -0.3, 1.1, -0.11); cyl(0.012, 0.6, PM.pvcG, -0.3, 0.65, -0.12); cyl(0.012, 0.35, PM.pvcG, -0.3, 1.38, -0.12);
      A(new RoundedBoxGeometry(0.16, 0.06, 0.24, 2, 0.02), PM.dark, 0.25, 1.05, 0.15); lcd(0.1, 0.05, 0.25, 1.085, 0.15);
    } else if (kind === 'sensor') {                 // Petroinstrument: หัววัดคุณภาพน้ำ 3 แบบ ในตู้กระจก + เครื่องวัดพกพา
      const y = plinth(-0.5); A(box(0.56, 0.5, 0.46), PM.glass, -0.5, y + 0.25, 0.08, { cast: false });
      for (const [dx, m] of [[-0.15, PM.dark], [0, C], [0.15, PM.grey]]) { cyl(0.025, 0.36, m, -0.5 + dx, y + 0.2, 0.08); cyl(0.032, 0.06, PM.steel, -0.5 + dx, y + 0.4, 0.08); }
      A(new RoundedBoxGeometry(0.12, 0.2, 0.05, 2, 0.02), C, 0.3, 1.11, 0.15); lcd(0.08, 0.06, 0.3, 1.15, 0.177);
    } else if (kind === 'dosingP') {                // ProMinent: ปั๊มไดอะแฟรมบนแท่น + ถังสาร + ปั๊มเล็กบนเคาน์เตอร์
      const y = plinth(-0.55, 0.62, 0.5, 0.5);
      A(new RoundedBoxGeometry(0.22, 0.26, 0.2, 2, 0.04), C, -0.62, y + 0.13, 0.08); lcd(0.1, 0.06, -0.62, y + 0.18, 0.181);
      cyl(0.09, 0.06, PM.dark, -0.47, y + 0.11, 0.08, 0, Math.PI / 2, 24); cyl(0.07, 0.04, PM.glass, -0.42, y + 0.11, 0.08, 0, Math.PI / 2);
      cyl(0.012, 0.45, PM.white, -0.4, y + 0.36, 0.08); cyl(0.17, 0.42, PM.white, -0.88, 0.21, -0.12); cyl(0.05, 0.04, C, -0.88, 0.44, -0.12);
      A(new RoundedBoxGeometry(0.14, 0.15, 0.12, 2, 0.03), C, 0.25, 1.09, 0.13);
    } else if (kind === 'meter') {                  // DKD: กระเป๋าเครื่องมือภาคสนามเปิดฝา + เครื่องวัดมือถือ
      const y = plinth(-0.5, 0.64, 0.5, 0.6);
      A(box(0.5, 0.12, 0.36), PM.dark, -0.5, y + 0.06, 0.1); const lid = A(box(0.5, 0.36, 0.03), PM.dark, -0.5, y + 0.3, -0.07); lid.rotation.x = -0.18;
      A(box(0.46, 0.02, 0.32), PM.grey, -0.5, y + 0.12, 0.1, { cast: false });
      A(new RoundedBoxGeometry(0.1, 0.18, 0.05, 2, 0.02), C, -0.58, y + 0.15, 0.12); lcd(0.07, 0.05, -0.58, y + 0.19, 0.147); cyl(0.015, 0.2, PM.dark, -0.4, y + 0.13, 0.1, 0, Math.PI / 2);
      A(new RoundedBoxGeometry(0.1, 0.2, 0.05, 2, 0.02), C, 0.28, 1.12, 0.15); lcd(0.07, 0.06, 0.28, 1.16, 0.177);
    } else if (kind === 'flow') {                   // UHM: ท่อเหล็กหน้าแปลน + เซนเซอร์อัลตราโซนิกแบบรัดท่อ + ตัวแสดงผล
      A(box(0.85, 0.32, 0.35), PM.white, -0.45, 0.16, 0.08); for (const dx of [-0.75, -0.15]) A(box(0.06, 0.2, 0.06), PM.grey, -0.45 + dx + 0.3, 0.42, 0.08);
      cyl(0.11, 0.85, PM.blue, -0.45, 0.62, 0.08, 0, Math.PI / 2, 28); for (const dx of [-0.43, 0.43]) cyl(0.16, 0.04, PM.steel, -0.45 + dx, 0.62, 0.08, 0, Math.PI / 2, 28);
      for (const dx of [-0.15, 0.15]) { A(new RoundedBoxGeometry(0.1, 0.08, 0.06, 2, 0.02), C, -0.45 + dx, 0.75, 0.08); cyl(0.115, 0.03, PM.steel, -0.45 + dx, 0.62, 0.08, 0, Math.PI / 2, 28); }
      A(box(0.03, 0.9, 0.03), PM.steel, -0.92, 0.45, -0.2); A(new RoundedBoxGeometry(0.24, 0.2, 0.1, 2, 0.02), PM.grey, -0.92, 1.0, -0.15); lcd(0.16, 0.1, -0.92, 1.02, -0.099);
    } else if (kind === 'pipe') {                   // GF: ชุดท่อ PVC-U สีเทา + บอลวาล์ว/บัตเตอร์ฟลายวาล์ว + ข้อต่อตัด
      A(box(0.85, 0.3, 0.4), PM.white, -0.45, 0.15, 0.08);
      cyl(0.06, 0.8, PM.pvcG, -0.45, 0.42, 0.08, 0, Math.PI / 2); cyl(0.06, 0.65, PM.pvcG, -0.83, 0.72, 0.08); cyl(0.065, 0.12, PM.pvcG, -0.83, 0.42, 0.08, 0, 0, 16);
      A(new RoundedBoxGeometry(0.16, 0.14, 0.14, 2, 0.03), PM.pvcG, -0.45, 0.42, 0.08); A(box(0.2, 0.03, 0.05), PM.red, -0.45, 0.53, 0.08);
      cyl(0.11, 0.05, PM.pvcG, -0.18, 0.42, 0.08, 0, Math.PI / 2, 24); A(box(0.04, 0.16, 0.04), PM.blue, -0.18, 0.56, 0.08); A(box(0.16, 0.035, 0.05), PM.blue, -0.1, 0.65, 0.08);
      cyl(0.06, 0.2, PM.pvcG, -0.83, 1.05, 0.08, 0, Math.PI / 2); A(new RoundedBoxGeometry(0.12, 0.12, 0.12, 2, 0.03), PM.red, -0.7, 1.05, 0.08);
      const cut = A(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 20, 1, true), PM.pvcG, 0.25, 1.08, 0.13); cut.rotation.z = Math.PI / 2;
    } else if (kind === 'magpump') {                // IWAKI: ปั๊มแม่เหล็กสีแดง/ขาวบนแท่น + ปั๊มลูกสูบเล็ก
      const y = plinth(-0.52, 0.62, 0.5, 0.45);
      A(box(0.4, 0.04, 0.22), PM.grey, -0.52, y + 0.02, 0.08); cyl(0.09, 0.24, PM.white, -0.6, y + 0.13, 0.08, 0, Math.PI / 2, 24);
      cyl(0.11, 0.1, C, -0.42, y + 0.13, 0.08, 0, Math.PI / 2, 24); cyl(0.035, 0.12, C, -0.36, y + 0.24, 0.08); cyl(0.035, 0.1, C, -0.32, y + 0.13, 0.08, 0, Math.PI / 2);
      A(new RoundedBoxGeometry(0.14, 0.16, 0.12, 2, 0.03), C, 0.25, 1.1, 0.13); cyl(0.04, 0.06, PM.white, 0.25, 1.21, 0.13);
    } else if (kind === 'lab') {                    // HACH: เครื่องสเปกโตรโฟโตมิเตอร์บนแท่น + เครื่องวัดคลอรีนพกพา + หลอดตัวอย่าง
      const y = plinth(-0.5, 0.66, 0.52, 0.75);
      A(new RoundedBoxGeometry(0.42, 0.16, 0.34, 3, 0.04), PM.white, -0.5, y + 0.08, 0.08); const sc = A(box(0.22, 0.14, 0.02), PM.lcd, -0.56, y + 0.19, 0.05, { cast: false }); sc.rotation.x = -0.6;
      cyl(0.03, 0.06, C, -0.36, y + 0.19, 0.14); for (let i = 0; i < 4; i++) cyl(0.012, 0.1, PM.glass, -0.7 + i * 0.04, y + 0.05, 0.3);
      A(new RoundedBoxGeometry(0.08, 0.17, 0.05, 2, 0.02), C, 0.25, 1.1, 0.15); lcd(0.06, 0.05, 0.25, 1.14, 0.177);
    } else if (kind === 'box') {                    // บริษัทที่รอยืนยัน: แท่นวางผลิตภัณฑ์ (คลุมผ้า) + แผ่นพับ
      const y = plinth(-0.5); A(new RoundedBoxGeometry(0.4, 0.36, 0.34, 3, 0.06), PM.grey, -0.5, y + 0.18, 0.08);
    } else if (kind === 'cabinet') {                // (สำรอง) ตู้ตรวจวัด
      A(box(0.62, 1.55, 0.42), P.white, -0.55, 0.8, -0.12); A(box(0.4, 0.28, 0.02), P.screenOn, -0.55, 1.15, 0.095, { cast: false });
    } else {                                        // จอบนขาตั้ง
      A(box(0.05, 1.25, 0.05), P.steel, -0.55, 0.62, -0.05); A(box(0.42, 0.03, 0.32), P.steel, -0.55, 0.015, -0.05);
      A(box(0.92, 0.54, 0.05), M.dark, -0.55, 1.45, -0.05); A(box(0.86, 0.48, 0.01), P.screenOn, -0.55, 1.45, -0.02, { cast: false });
    }
  }


  // ── ห้องรับประทานอาหาร
  {
    const z = Z(188) + 0.7, x0 = X(870), x1 = X(955);
    add('dining', new RoundedBoxGeometry(x1 - x0, 0.95, 0.7, 3, 0.05), M.white, (x0 + x1) / 2, 0.475, z);
    add('dining', box(x1 - x0 + 0.06, 0.05, 0.76), M.wood, (x0 + x1) / 2, 0.97, z);
    for (let i = 0; i < 6; i++) add('dining', new THREE.CylinderGeometry(0.18, 0.2, 0.12, 16), M.white, x0 + 0.6 + i * 1.2, 1.06, z);
    [[X(880), Z(275)], [X(940), Z(275)], [X(880), Z(320)], [X(940), Z(320)]].forEach(([x, z2]) => {
      add('dining', new THREE.CylinderGeometry(0.04, 0.04, 1.05, 10), M.alu, x, 0.525, z2);
      add('dining', new THREE.CylinderGeometry(0.36, 0.36, 0.04, 26), M.white, x, 1.07, z2);
      add('dining', new THREE.CylinderGeometry(0.25, 0.25, 0.02, 20), M.alu, x, 0.01, z2, { cast: false });
    });
  }
  // ── โต๊ะยืนในห้องแสดง
  [[X(1230), Z(302)], [X(1290), Z(302)]].forEach(([x, z]) => {
    add('hall', new THREE.CylinderGeometry(0.04, 0.04, 1.05, 10), M.alu, x, 0.525, z);
    add('hall', new THREE.CylinderGeometry(0.4, 0.4, 0.04, 26), M.white, x, 1.07, z);
    add('hall', new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), M.alu, x, 0.01, z, { cast: false });
  });
  // ── ต้นไม้กระถาง (กระถางขาวขอบทอง · ใบหลายชั้นหลายเฉดเขียว)
  {
    const potG = new THREE.LatheGeometry([[0.001, 0], [0.22, 0], [0.27, 0.48], [0.3, 0.5], [0.3, 0.55], [0.26, 0.55], [0.001, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
    const rimM = new THREE.MeshStandardMaterial({ color: '#c9a65a', metalness: 0.6, roughness: 0.35 }), stemM = new THREE.MeshStandardMaterial({ color: '#5d4a32', roughness: 0.8 });
    const leafMs = ['#3f8a4e', '#4f9b5c', '#5fae63', '#2f7a45'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
    const leafG = new THREE.SphereGeometry(1, 14, 10);
    const plantAt = (zone, x, z, tall = 1) => {
      add(zone, potG, M.pot, x, 0, z); add(zone, new THREE.TorusGeometry(0.285, 0.022, 8, 28), rimM, x, 0.53, z, { cast: false }).rotation.x = Math.PI / 2;
      add(zone, new THREE.CylinderGeometry(0.025, 0.035, 0.9 * tall, 6), stemM, x, 0.5 + 0.45 * tall, z);
      const h = (x * 7.3 + z * 3.1); for (let k = 0; k < 7; k++) { const a = h + k * 2.4, r = 0.12 + (k % 3) * 0.07, y = 0.75 + (k / 6) * 0.95 * tall;
        const lf = add(zone, leafG, leafMs[k % 4], x + Math.cos(a) * r, y, z + Math.sin(a) * r); lf.scale.set(0.26 - k * 0.012, 0.17, 0.2 - k * 0.01); lf.rotation.y = a; }
    };
    [[905, 440], [1440, 392], [1500, 392], [1112, 372], [940, 420], [770, 712], [896, 362], [775, 688], [880, 690], [1366, 427], [786, 868]].forEach(([px, py], i) => plantAt('other', X(px), Z(py), i % 3 ? 1 : 1.25));
  }
  // ── โรลอัพ Stakeholder Day ตามจุดเลี้ยว
  {
    const c = document.createElement('canvas'); c.width = 400; c.height = 1000; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 1000); gr.addColorStop(0, '#0f3f86'); gr.addColorStop(0.6, '#1d5fc0'); gr.addColorStop(1, '#3fb0e6'); g.fillStyle = gr; g.fillRect(0, 0, 400, 1000);
    g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(60 + (i * 97) % 340, 620 + (i * 53) % 330, 18 + (i % 4) * 14, 0, 7); g.fill(); }
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `700 64px ${F_HEAD}`; g.fillText('Stakeholder', 200, 380); g.fillText('Day', 200, 452);
    g.font = `500 30px ${F_BODY}`; g.fillText('การประปานครหลวง', 200, 520); g.fillStyle = '#9fe0ff'; g.fillRect(120, 548, 160, 5);
    g.font = `500 26px ${F_BODY}`; g.fillStyle = '#e8f4ff'; g.fillText('น้ำประปาสะอาด ปลอดภัย', 200, 600); g.fillText('เพื่อคุณภาพชีวิตที่ดี', 200, 640);
    const tex = withLogo(() => { const c2 = document.createElement('canvas'); c2.width = 400; c2.height = 1000; const g2 = c2.getContext('2d'); g2.drawImage(c, 0, 0); if (LOGO_IMG && LOGO_IMG.complete && LOGO_IMG.naturalWidth) { g2.fillStyle = '#fff'; g2.beginPath(); g2.arc(200, 190, 105, 0, 7); g2.fill(); g2.drawImage(LOGO_IMG, 105, 95, 190, 190); } return c2; }, 8);
    const rm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.12 }); rm.emissiveMap = tex;
    [[950, 690, -Math.PI / 2], [1337, 428, Math.PI], [785, 800, Math.PI / 2], [905, 405, Math.PI / 2]].forEach(([px, py, ry]) => {
      const gg = new THREE.Group(); gg.position.set(X(px), 0, Z(py)); gg.rotation.y = ry; zg('other').add(gg);
      add('other', box(0.86, 0.08, 0.26), M.alu, 0, 0.04, 0, { parent: gg }); add('other', box(0.8, 2.0, 0.02), rm, 0, 1.08, 0, { parent: gg });
      add('other', box(0.02, 2.0, 0.02), M.alu, 0, 1.08, -0.04, { parent: gg, cast: false });
    });
  }
  // ── ห้องประชุม: โต๊ะประชุม + เก้าอี้ · ห้องน้ำ: ผนังกั้นห้องย่อย + เคาน์เตอร์อ่างล้างมือ
  {
    const chairs = [], m4c = new THREE.Matrix4(), qc = new THREE.Quaternion(), yAx = new THREE.Vector3(0, 1, 0);
    const tableTop = new THREE.MeshStandardMaterial({ color: '#b98a5a', roughness: 0.45 }), tableLeg = M.alu;
    ROOMS.filter(r => r.meet).forEach(r => {
      const [a, b, c, d] = r.r, cx = (X(a) + X(c)) / 2, cz = (Z(b) + Z(d)) / 2 + (Z(d) - Z(b)) * 0.08, w = X(c) - X(a), dd = Z(d) - Z(b);
      const along = dd > w, TL = Math.min(Math.max(along ? dd : w, 3) * 0.5, 4.2), TW = 1.0;
      const tw = along ? TW : TL, td = along ? TL : TW;
      add('other', new RoundedBoxGeometry(tw, 0.05, td, 2, 0.02), tableTop, cx, 0.74, cz);
      add('other', box(Math.max(0.2, tw - 0.5), 0.7, 0.06), tableLeg, cx, 0.36, cz, { cast: false }).scale.set(along ? 0.2 : 1, 1, along ? 0.1 : 1);
      const n = Math.max(2, Math.floor(TL / 0.75));
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5;
        for (const sgn of [-1, 1]) { const x = along ? cx + sgn * 0.78 : cx + t * TL, z = along ? cz + t * TL : cz + sgn * 0.78, ry = along ? (sgn < 0 ? Math.PI / 2 : -Math.PI / 2) : (sgn < 0 ? 0 : Math.PI); chairs.push([x, z, ry]); } }
    });
    const chairSeat = new THREE.InstancedMesh(new RoundedBoxGeometry(0.46, 0.08, 0.44, 2, 0.03), ZM.m('other', new THREE.MeshStandardMaterial({ color: '#2d5e9a', roughness: 0.7 })), chairs.length);
    const chairBack = new THREE.InstancedMesh(new RoundedBoxGeometry(0.44, 0.48, 0.06, 2, 0.025), ZM.m('other', new THREE.MeshStandardMaterial({ color: '#25303d', roughness: 0.6 })), chairs.length);
    chairs.forEach(([x, z, ry], i) => { qc.setFromAxisAngle(yAx, ry); m4c.compose(new THREE.Vector3(x, 0.47, z), qc, new THREE.Vector3(1, 1, 1)); chairSeat.setMatrixAt(i, m4c);
      const bx = x - Math.sin(ry) * 0.21, bz = z - Math.cos(ry) * 0.21; m4c.compose(new THREE.Vector3(bx, 0.76, bz), qc, new THREE.Vector3(1, 1, 1)); chairBack.setMatrixAt(i, m4c); });
    chairSeat.castShadow = chairBack.castShadow = true; zg('other').add(chairSeat, chairBack);
    const partM = new THREE.MeshStandardMaterial({ color: '#eef3f8', roughness: 0.6 }), sinkM = new THREE.MeshStandardMaterial({ color: '#f7f8f9', roughness: 0.3 });
    ROOMS.filter(r => r.wc).forEach(r => { const [a, b, c, d] = r.r, x1 = X(c) - WT / 2, x0 = X(a) + WT / 2, z0 = Z(b), z1 = Z(d);
      for (let k = 1; k < 5; k++) add('other', box(1.4, 1.9, 0.04), partM, x1 - 0.7, 0.98, z0 + 0.6 + k * 1.3, { cast: false });
      add('other', box(0.55, 0.85, (z1 - z0) * 0.42), sinkM, x0 + 0.3, 0.43, z1 - (z1 - z0) * 0.25); });
  }
  // ── ดอกไม้บนโต๊ะลงทะเบียน
  {
    const vase = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 }), fls = ['#f5b51b', '#ffffff', '#f27aa6', '#ff8a1f'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
    const zd = Z(676) + WT / 2 + 1.55, xc = X(822);
    for (const dx of [-2.05, 2.05]) { add('lobby', new THREE.CylinderGeometry(0.09, 0.07, 0.24, 16), vase, xc + dx, 1.16, zd - 0.1);
      for (let k = 0; k < 9; k++) { const a = k * 2.4; add('lobby', new THREE.IcosahedronGeometry(0.06, 1), fls[k % 4], xc + dx + Math.cos(a) * 0.09 * (k % 3), 1.33 + (k % 3) * 0.04, zd - 0.1 + Math.sin(a) * 0.09 * (k % 3)); }
      add('lobby', new THREE.SphereGeometry(0.13, 10, 8), M.plant, xc + dx, 1.3, zd - 0.1).scale.set(1, 0.6, 1); }
  }

  // ── Auditorium (ลดระดับ): ทางเดินขวางด้านหลังที่ระดับพื้น · บันไดทางเดินซ้าย/ขวา · แถวที่นั่งขั้นบันได · เวที · จอ · แปลงดอกไม้หน้าเวที
  const seats = [];
  {
    const A = AUDm, { ax0, ax1, az1, zb, zf, pitY } = A, rows = AUD.rows, rowD = AUD.rowD, rise = AUD.rise, stageZ = az1 - 3.4;
    const unit = box(1, 1, 1), m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc3 = new THREE.Vector3();
    const inst = (mat, list, cast = false) => { const im = new THREE.InstancedMesh(unit, ZM.m('aud', mat), list.length);
      list.forEach(([x, y, z, w, h, d], i) => { m4.compose(v3.set(x, y, z), q0, sc3.set(w, h, d)); im.setMatrixAt(i, m4); });
      im.castShadow = cast; im.receiveShadow = true; zg('aud').add(im); return im; };
    // บ่อ: พื้นล่าง + ผนังรอบ (ใต้ระดับพื้นชั้น 5)
    const pitMat = new THREE.MeshStandardMaterial({ color: '#2b3846', roughness: 0.9 });
    const pf = floorCanvas('aud'); pf.repeat.set((ax1 - ax0) / 2, (az1 - zf) / 2);
    add('aud', box(ax1 - ax0, 0.3, az1 - zb), pitMat, (ax0 + ax1) / 2, pitY - 0.15, (zb + az1) / 2, { cast: false });
    add('aud', box(ax1 - ax0 - 0.2, 0.03, az1 - zf), new THREE.MeshStandardMaterial({ map: pf, roughness: 0.92 }), (ax0 + ax1) / 2, pitY + 0.015, (zf + az1) / 2, { cast: false });
    const ph = -pitY + 0.3;
    [[ax0, (zb + az1) / 2, WT, az1 - zb], [ax1, (zb + az1) / 2, WT, az1 - zb], [(ax0 + ax1) / 2, az1, ax1 - ax0, WT]].forEach(([x, z, w, d]) => add('aud', box(w, ph, d), M.wall, x, pitY - 0.3 + ph / 2, z, { cast: false }));
    add('aud', box(ax1 - ax0, -pitY - 0.3, WT), M.wall, (ax0 + ax1) / 2, (pitY - 0.6) / 2, zb, { cast: false });
    // แถวที่นั่ง (ระหว่างทางเดินซ้าย-ขวา)
    const sx0 = A.aW[1], sx1 = A.aE[0], tiers = [], pos = [];
    for (let r = 0; r < rows; r++) {
      const z = zb + r * rowD, y = -(r + 1) * rise, h = y - pitY;
      if (h > 0.01) tiers.push([(sx0 + sx1) / 2, pitY + h / 2, z + rowD / 2, sx1 - sx0, h, rowD]);
      for (let x = sx0 + 0.5; x < sx1 - 0.3; x += 0.58) pos.push([x, y, z + rowD * 0.56]);
    }
    inst(M.tier, tiers);
    // บันไดทางเดิน 2 ขั้นต่อแถว + ไฟ LED ที่จมูกบันได
    const stepM = new THREE.MeshStandardMaterial({ color: '#8796a6', roughness: 0.85 }), ledM = new THREE.MeshStandardMaterial({ color: '#dff4ff', emissive: '#8fd8ff', emissiveIntensity: 1.6 });
    const steps = [], leds = [];
    [A.aW, A.aE].forEach(([x0, x1]) => { for (let k = 0; k < rows * 2; k++) {
      const z = zb + k * rowD / 2, y = -(k + 1) * rise / 2, h = y - pitY;
      if (h > 0.01) steps.push([(x0 + x1) / 2, pitY + h / 2, z + rowD / 4, x1 - x0, h, rowD / 2]);
      leds.push([(x0 + x1) / 2, y + 0.012, z + 0.03, x1 - x0 - 0.1, 0.02, 0.05]);
    } });
    inst(stepM, steps); inst(ledM, leds);
    // ราวกันตกขอบทางเดินขวาง (เว้นช่องบันได)
    const railM = new THREE.MeshStandardMaterial({ color: '#c9d0d7', metalness: 0.75, roughness: 0.3 }), glassR = new THREE.MeshStandardMaterial({ color: '#cfe6f6', roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
    add('aud', box(sx1 - sx0, 0.9, 0.03), glassR, (sx0 + sx1) / 2, 0.45, zb - 0.05, { cast: false }).userData.noAO = true;
    add('aud', box(sx1 - sx0, 0.05, 0.07), railM, (sx0 + sx1) / 2, 0.92, zb - 0.05, { cast: false });
    const sm = ZM.m('aud', M.seat), bm = ZM.m('aud', M.seatBack);
    const seatG = new RoundedBoxGeometry(0.5, 0.42, 0.5, 2, 0.06), backG = new RoundedBoxGeometry(0.5, 0.55, 0.08, 2, 0.03);
    const im = new THREE.InstancedMesh(seatG, sm, pos.length), ib = new THREE.InstancedMesh(backG, bm, pos.length);
    pos.forEach(([x, y, z], i) => { m4.makeTranslation(x, y + 0.42, z); im.setMatrixAt(i, m4); m4.makeTranslation(x, y + 0.78, z - 0.24); ib.setMatrixAt(i, m4); seats.push([x, y, z]); });
    im.castShadow = ib.castShadow = true; im.receiveShadow = ib.receiveShadow = true; zg('aud').add(im, ib);
    // เวที + จอ + แท่นพูด
    const sTop = pitY + 0.8;
    add('aud', box(ax1 - ax0 - 0.4, 0.8, az1 - stageZ - 0.2), M.stage, (ax0 + ax1) / 2, pitY + 0.4, (stageZ + az1) / 2 - 0.1);
    const sm2 = ZM.reg('aud', new THREE.MeshStandardMaterial({ map: screenTex('Stakeholder Day', 'การประปานครหลวง · Metropolitan Waterworks Authority'), emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.4 }));
    sm2.emissiveMap = sm2.map;
    const scY = sTop + 1.25 + 1.5;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 3.0), sm2); scr.position.set((ax0 + ax1) / 2, scY, az1 - 0.12); scr.rotation.y = Math.PI; zg('aud').add(scr);
    add('aud', box(10.8, 3.3, 0.1), M.dark, (ax0 + ax1) / 2, scY, az1 - 0.06);
    add('aud', new RoundedBoxGeometry(0.7, 1.15, 0.5, 2, 0.05), M.wood, (ax0 + ax1) / 2 + 6.5, sTop + 0.57, stageZ + 1.2);   // แท่นพูด
    // ม่านข้างเวที (สีน้ำเงิน กปน.)
    const curM = new THREE.MeshStandardMaterial({ color: '#1d4f9a', roughness: 0.8 });
    for (const sgn of [-1, 1]) for (let k = 0; k < 6; k++) add('aud', new THREE.CylinderGeometry(0.16, 0.16, AUD_H - sTop, 10), curM, (ax0 + ax1) / 2 + sgn * (6.0 + k * 0.28), (AUD_H + sTop) / 2, az1 - 0.35 - (k % 2) * 0.12, { cast: false });
    // แปลงดอกไม้หน้าเวที (ดาวเรือง · ดอกไม้ขาว · ชมพู)
    const bedZ = stageZ - 0.32, bx0 = ax0 + 2.6, bx1 = ax1 - 2.6;
    add('aud', box(bx1 - bx0, 0.36, 0.5), new THREE.MeshStandardMaterial({ color: '#2f6b3a', roughness: 0.9 }), (bx0 + bx1) / 2, pitY + 0.18, bedZ, { cast: false });
    { const fl = { '#f5b51b': [], '#ff8a1f': [], '#ffffff': [], '#f27aa6': [] }, keys = Object.keys(fl); let n = 0;
      for (let x = bx0 + 0.12; x < bx1 - 0.1; x += 0.16) for (let j = 0; j < 3; j++) { const c = j === 1 ? keys[(Math.floor(x / 1.6) % 2 + 2) % 2 ? 2 : 3] : keys[(n++ % 5 === 0) ? 1 : 0]; fl[c].push([x + (j % 2) * 0.08, pitY + 0.42 + (j === 1 ? 0.05 : 0), bedZ - 0.16 + j * 0.16]); }
      const fg = new THREE.IcosahedronGeometry(0.085, 1);
      keys.forEach(c => { const mt = ZM.m('aud', new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })), list = fl[c], ii = new THREE.InstancedMesh(fg, mt, list.length);
        list.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); ii.setMatrixAt(i, m4); }); zg('aud').add(ii); }); }
    // ระแนงไม้ผนังข้าง (สูงตลอดถึงพื้นบ่อ)
    for (let k = 0; k < 18; k++) { const z = A.az0 + 1 + k * ((az1 - A.az0 - 2) / 17), hh = AUD_H - 0.4 - pitY; add('aud', box(0.06, hh, 0.12), M.wood, ax0 + 0.14, pitY + hh / 2, z, { cast: false }); add('aud', box(0.06, hh, 0.12), M.wood, ax1 - 0.14, pitY + hh / 2, z, { cast: false }); }
    // ป้ายบอกทางบนผนังหลัง: บันไดซ้าย/ขวา
    [[A.aW, '◀ ทางลง'], [A.aE, 'ทางลง ▶']].forEach(([[x0, x1], t]) => { const sg = ZM.reg('aud', new THREE.MeshBasicMaterial({ map: signCanvas([[t, 700, 120, 150]], '#1d5fc0', '#fff', 768, 300) }));
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.5), sg); pl.position.set((x0 + x1) / 2, 2.55, A.az0 + WT / 2 + 0.02); zg('aud').add(pl); });
  }

  // ── เส้นทางน้ำบนพื้น (ribbon + chevron)
  const mkPath = (px, s0) => {                               // เส้นทางโค้งมน + แบ่งจุดถี่ (ให้ริบบิ้นไล่ตามขั้นบันได)
    const rp = roundedPath(px.map(([x, y]) => new THREE.Vector2(X(x), Z(y))), 1.1), path = [rp[0]];
    for (let i = 1; i < rp.length; i++) { const a = rp[i - 1], b = rp[i], n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.12)); for (let k = 1; k <= n; k++) path.push(a.clone().lerp(b, k / n)); }
    let L = s0; const cum = [s0]; for (let i = 1; i < path.length; i++) { L += path[i].distanceTo(path[i - 1]); cum.push(L); }
    const at = s => { s = clamp(s, s0, L); let lo = 1, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
      const i = lo, u = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), a = path[i - 1], b = path[i], d = cum[i] - cum[i - 1] || 1;
      return { x: lerp(a.x, b.x, u), z: lerp(a.y, b.y, u), tx: (b.x - a.x) / d, tz: (b.y - a.y) / d }; };
    return { path, cum, L, at };
  };
  const R0 = mkPath(ROUTE_PX, 0), { path, cum, L } = R0;
  const sDoor = (() => { let best = 1e9, bs = 0; for (let s = 0; s <= L; s += 0.1) { const p = R0.at(s), d = Math.hypot(p.x - X(1310), p.z - Z(441)); if (d < best) { best = d; bs = s; } } return bs; })();
  const sAt = (px, py) => { let best = 1e9, bs = 0; for (let s = 0; s <= L; s += 0.1) { const p = R0.at(s), d = Math.hypot(p.x - X(px), p.z - Z(py)); if (d < best) { best = d; bs = s; } } return bs; };
  const sHall = sAt(1355, 345), sHallOut = sAt(1131, 360);            // เข้าห้องแสดงทางประตูตะวันออก · ออกทางประตูตะวันตก
  const RE = (() => { const r = mkPath(ROUTE_E_PX, sDoor); return { at: s => r.at(s < sDoor ? sDoor : s), L: r.L, r, base: R0 }; })();
  const routeU = { uTime: { value: 0 }, uProg: { value: 0 }, uLen: { value: Math.max(L, RE.L) }, uA: { value: new THREE.Color('#7f9a52') }, uB: { value: new THREE.Color('#14b8d6') }, uC: { value: new THREE.Color('#3f8cff') }, uOp: { value: 1 } };
  const mkRibbon = (w, y, frag, P = R0) => {
    const { path, cum } = P; const pos = [], uv = [], idx = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i], q = path[Math.min(i + 1, path.length - 1)], o = path[Math.max(i - 1, 0)];
      const t = new THREE.Vector2(q.x - o.x, q.y - o.y).normalize(), n = new THREE.Vector2(-t.y, t.x).multiplyScalar(w / 2);
      const fy = y + floorY(p.x, p.y); pos.push(p.x + n.x, fy, p.y + n.y, p.x - n.x, fy, p.y - n.y); uv.push(cum[i], 0, cum[i], 1);
      if (i < path.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ uniforms: routeU, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: frag });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 3; interior.add(m); return m;
  };
  const FR_HEAD = 'uniform float uTime,uProg,uLen,uOp; uniform vec3 uA,uB,uC; varying vec2 vUv;' +
    'vec3 grad(float u){ float t=u/uLen; return t<0.5? mix(uA,uB,t*2.0) : mix(uB,uC,(t-0.5)*2.0); }';
  const FR_GLOW = FR_HEAD + 'void main(){ if(vUv.x>uProg*uLen) discard; float e=1.0-abs(vUv.y-0.5)*2.0; gl_FragColor=vec4(grad(vUv.x), pow(e,2.2)*0.22*uOp); }';
  mkRibbon(2.1, 0.03, FR_GLOW); mkRibbon(1.5, 0.03, FR_GLOW, RE.r);
  const FR_CHEV = FR_HEAD + 'void main(){ if(vUv.x>uProg*uLen) discard; vec3 c=grad(vUv.x); float v=abs(vUv.y-0.5);' +
    'float s=fract((vUv.x-uTime*1.3)/1.4); float d=s+v*0.9-0.42; float ch=smoothstep(0.0,0.05,d)*(1.0-smoothstep(0.22,0.27,d));' +
    'float edge=1.0-smoothstep(0.42,0.5,v); vec3 col=mix(c*1.05,vec3(1.0),ch*0.85); float tip=1.0-smoothstep(uProg*uLen-1.5,uProg*uLen,vUv.x)*0.0;' +
    'gl_FragColor=vec4(col,edge*0.95*uOp*tip); }';
  mkRibbon(0.62, 0.045, FR_CHEV); mkRibbon(0.62, 0.045, FR_CHEV, RE.r);
  const routeAt = R0.at;
  // ลำดับบูธตามเส้นทาง
  booths.forEach(b => { let best = 1e9, bs = 0; for (let s = 0; s <= L; s += 0.25) { const p = routeAt(s), d = Math.hypot(p.x - b.x, p.z - b.z); if (d < best) { best = d; bs = s; } } b.along = bs; });
  booths.sort((a, b) => a.along - b.along); booths.forEach((b, i) => { b.order = i + 1; });

  let siteM = new THREE.Matrix4();
  // ── อาคารสุทธิอุทกากร 12 ชั้น (ตอนเปิดฉาก) — โมเดลเดียวกับฉากแผนที่ (stakeholder_building.js)
  //    แกนผัง: X = ทิศเหนือ, Z = ทิศตะวันออก · ฝั่งถนน/คลองประปาอยู่ทาง Z ติดลบ
  const SB = window.SUTHI.build(THREE, { W: FD, D: FW, perLevel: true, fadeable: true, shadows: true, srgb: true, env: true });
  SB.grp.rotation.y = -Math.PI / 2; SB.grp.position.set((FX0 + FX1) / 2, -F5 * FH, (FZ0 + FZ1) / 2);
  world.add(SB.grp);
  const floors = SB.levels.map(L => L.f === F5 ? null : { g: L.g, f: L.f, mats: L.mats, edgeM: L.edgeM });
  const f5shell = SB.levels[F5];                       // ผนังนอกชั้น 5 ตอนเปิดฉาก — จางหายตอนแยกชั้น
  const oldBldg = SB.extras;                           // อาคารเดิม (ปลายสะพาน)
  // ── วงสแกนแสงไซแอน (ไล่จากพื้นขึ้นถึงชั้น 5 ตอนเปิดฉาก)
  const scan = new THREE.Group(); scan.visible = false; world.add(scan);
  {
    const W2 = FW + 3.2, D2 = FD + 3.2, cx = (FX0 + FX1) / 2, cz = (FZ0 + FZ1) / 2;
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(63,208,255,0)'); gr.addColorStop(0.85, 'rgba(63,208,255,.55)'); gr.addColorStop(1, 'rgba(180,240,255,.95)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const cm = new THREE.MeshBasicMaterial({ map: canvasTex(c), color: new THREE.Color(2.2, 2.6, 3.0), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const H2 = 5.5;
    [[W2, cx, cz - D2 / 2, 0], [W2, cx, cz + D2 / 2, 0], [D2, cx - W2 / 2, cz, Math.PI / 2], [D2, cx + W2 / 2, cz, Math.PI / 2]].forEach(([len, x, z, ry]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H2), cm); m.position.set(x, H2 / 2, z); m.rotation.x = Math.PI; m.rotation.y = ry; m.userData.noAO = true; scan.add(m); });
    const lm = new THREE.LineBasicMaterial({ color: new THREE.Color(2.5, 6, 8), transparent: true, opacity: 1, toneMapped: false });
    const ln = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W2, 0.02, D2)), lm); ln.position.set(cx, 0, cz); scan.add(ln);
    scan.userData = { cm, lm };
  }

  // ── พื้นดิน + ต้นไม้
  const gy = -F5 * FH;
  const gc = document.createElement('canvas'); gc.width = gc.height = 1024; { const g = gc.getContext('2d'); const gr = g.createRadialGradient(512, 512, 60, 512, 512, 512); gr.addColorStop(0, '#c9d3c4'); gr.addColorStop(0.55, '#d3dbd2'); gr.addColorStop(1, '#dfe5eb'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(120,135,150,.10)'; g.lineWidth = 1; for (let i = 0; i <= 1024; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); } }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshStandardMaterial({ map: canvasTex(gc), roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = gy; ground.receiveShadow = true; world.add(ground);
  {
    const plaza = new THREE.Mesh(box(100, 0.12, 78), new THREE.MeshStandardMaterial({ color: '#d9d8d2', roughness: 0.9 })); plaza.position.set(0, gy + 0.06, 3); plaza.receiveShadow = true; world.add(plaza);
    // ถนนหน้าอาคาร + คลองประปา (ฝั่งตะวันตก) ตามแนวจริง
    const strip = (z0, z1, y, h, col, rough, met) => { const m = new THREE.Mesh(box(1600, h, z1 - z0), new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: met || 0 })); m.position.set(0, gy + y + h / 2, (z0 + z1) / 2); m.receiveShadow = true; world.add(m); return m; };
    strip(-116, -100, 0, 0.1, '#8d939a', 0.95);          // ถ.ประชาชื่น / ถ.เลียบคลองประปา (ฝั่งตะวันตกของคลอง)
    { const dash = new THREE.InstancedMesh(box(3, 0.02, 0.18), new THREE.MeshBasicMaterial({ color: '#f4f4ef' }), 400), m4d = new THREE.Matrix4(); let n = 0;
      for (const z of [-108]) for (let x = -700; x < 700 && n < 400; x += 6.5) { m4d.makeTranslation(x, gy + 0.11, z); dash.setMatrixAt(n++, m4d); } dash.count = n; world.add(dash); }
    // โรงงานผลิตน้ำบางเขน · สนามกีฬา · คลองประปา (โมเดลเดียวกับฉากแผนที่) — แปลงจากพิกัดรอบหมุดเป็นพิกัดผังชั้น 5
    { const wrap = new THREE.Group(); wrap.rotation.y = -Math.PI / 2; wrap.position.set((FX0 + FX1) / 2, gy, (FZ0 + FZ1) / 2);
      const inner = new THREE.Group(); inner.rotation.y = 0.2215; inner.position.set(0.015, 0, -5.898); wrap.add(inner);
      const site = window.SUTHI.buildSite(THREE, { srgb: true, env: true, shadows: true, sunken: false }); inner.add(site.grp); world.add(wrap);
      world.updateMatrixWorld(true); siteM = inner.matrixWorld.clone(); }   // พิกัดฉากแผนที่ (รอบอาคาร) → พิกัดฉากชั้น 5 ใช้ต่อภาพจากแผนที่
    const tp0 = []; for (let i = 0; i < 110; i++) { const a = rnd() * Math.PI * 2, r = 58 + rnd() * 80; tp0.push([Math.cos(a) * r, Math.sin(a) * r * 0.85]); }
    for (let x = FX0 - 10; x <= FX1 + 10; x += 7) tp0.push([x, FZ1 + 11]);
    for (let x = -150; x <= 150; x += 8.5) { tp0.push([x + rnd() * 2, -48.5]); tp0.push([x + rnd() * 2, -96.2]); }       // ต้นไม้ริมถนน/ริมคลอง
    const clear = [[-216, -68, -46, 42], [-262, -90, -64, 0], [-43, -18, 21, 40], [-76, -34, 8, 18]];        // อาคารเดิม · ลานพระรูป · อาคารโค้ง · ใต้สะพาน
    const tp = tp0.filter(([x, z]) => (z === -48.5 || z === -96.2 || !(z < -36 && z > -118)) && !clear.some(([x0, x1, z0, z1]) => x > x0 - 3 && x < x1 + 3 && z > z0 - 3 && z < z1 + 3));
    const cr = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), tp.length);
    const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 1, 8), new THREE.MeshStandardMaterial({ color: '#7a6a58', roughness: 0.9 }), tp.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    tp.forEach(([x, z], i) => { const s = 2.6 + rnd() * 2.2; m4.compose(new THREE.Vector3(x, gy + 2.6 + s * 0.9, z), q, new THREE.Vector3(s, s * 0.9, s)); cr.setMatrixAt(i, m4); col.setHSL(0.27 + rnd() * 0.06, 0.38 + rnd() * 0.14, 0.30 + rnd() * 0.08); cr.setColorAt(i, col);
      m4.compose(new THREE.Vector3(x, gy + 1.4, z), q, new THREE.Vector3(1, 2.8, 1)); tr.setMatrixAt(i, m4); });
    cr.castShadow = true; world.add(cr, tr);
  }

  // ── รวม mesh นิ่งที่ใช้วัสดุเดียวกันเป็นก้อนเดียว (ลด draw call หลายพัน → ไม่กี่ร้อย) · ส่วนที่ขยับ/ซ่อนได้แยกเป็นกลุ่มของตัวเอง
  if (!window.F5_NOBATCH) { console.info('[F5] compactGroups', compactGroups(world).join(' → ')); staticBatch([world, ...booths.map(b => b.group), ...SB.levels.map(Lv => Lv.g), SB.extras.g, scan]); }

  if (MOBILE || window.F5_DIET) textureDiet(ctx.scene);

  // ── ผู้เข้าร่วม
  const people = makePeople(interior, booths, seats, routeAt, L);
  const routes = [{ at: routeAt, L }, { at: RE.at, L: RE.L }];

  return { world, interior, ZM, zoneGroups, booths, walls, floors, f5shell, oldBldg, SB, scan, routeU, routeAt, L, routes, sDoor, sHall, sHallOut, seats, people, gy, siteM };
}

function roundedPath(pts, r) {
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d1 = b.clone().sub(a).normalize(), d2 = c.clone().sub(b).normalize();
    const rr = Math.min(r, b.distanceTo(a) / 2, b.distanceTo(c) / 2);
    const p1 = b.clone().sub(d1.clone().multiplyScalar(rr)), p2 = b.clone().add(d2.clone().multiplyScalar(rr));
    for (let k = 0; k <= 8; k++) { const t = k / 8; const q = p1.clone().multiplyScalar((1 - t) * (1 - t)).add(b.clone().multiplyScalar(2 * (1 - t) * t)).add(p2.clone().multiplyScalar(t * t)); out.push(q); }
  }
  out.push(pts[pts.length - 1].clone());
  // แบ่งเส้นตรงให้ละเอียด (ใช้คำนวณ uv)
  const dense = [out[0]];
  for (let i = 1; i < out.length; i++) { const a = out[i - 1], b = out[i], n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.8)); for (let k = 1; k <= n; k++) dense.push(a.clone().lerp(b, k / n)); }
  return dense;
}

// ── คน (โลว์โพลีแบบเรียบ)
function makePeople(parent, booths, seats, routeAt, L) {
  // คนแบบละเอียด: รองเท้า ขา สะโพก ลำตัว คอ ศีรษะ ผม แขน มือ บัตรห้อยคอ · ผู้หญิงบางคนใส่กระโปรง/ผมยาว
  // คนที่ยืนหรือนั่งนิ่ง รวมเป็น mesh เดียวต่อคน (สีตามจุดยอด) ให้เบาเครื่อง · คนเดินแยกชิ้นเพื่อแกว่งแขนขา
  // ชุดทางการแบบงานสัมมนา: สูท/กางเกงโทนเข้ม เสื้อเชิ้ตขาว/ฟ้า · ผู้หญิงสูท/เดรส/กระโปรง · เจ้าหน้าที่ กปน. เสื้อโปโลฟ้า
  const suits = ['#1c2433', '#232b3a', '#2f3644', '#1e2a44', '#3a3f48', '#14181f', '#4a4f57', '#2b3a55'];
  const shirtsW = ['#ffffff', '#f2f5f8', '#dbe8f5', '#cfe0f2', '#ffffff'];
  const blouses = ['#ffffff', '#e9dfd3', '#d9e6f2', '#f1d9de', '#c9d8e6', '#2b3a55', '#7a2f3e'];
  const casual = ['#e9eef3', '#cfdbe7', '#ffffff', '#c8b8a2', '#8fa3b8'];
  const skins = ['#d7a985', '#c8936c', '#e3bc98', '#b88563', '#cf9d78', '#dcb08c'];
  const hairs = ['#1a1714', '#231d18', '#2e241c', '#141210', '#3b2e24'];
  const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
  const cache = {}, mm = c => cache[c] || (cache[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.78 }));
  const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const taper = (r0, r1, h, seg = 12) => new THREE.CylinderGeometry(r0, r1, h, seg, 1);
  const G = {
    thigh: taper(0.074, 0.058, 0.46), shin: taper(0.056, 0.044, 0.42), knee: new THREE.SphereGeometry(0.058, 12, 8),
    thighF: taper(0.064, 0.05, 0.46), shinF: taper(0.046, 0.034, 0.42), kneeF: new THREE.SphereGeometry(0.049, 12, 8),
    shoe: lathe([[0.001, 0], [0.05, 0.005], [0.055, 0.04], [0.045, 0.07], [0.001, 0.075]], 14), heel: taper(0.012, 0.012, 0.06, 6),
    pelvis: new RoundedBoxGeometry(0.31, 0.19, 0.2, 3, 0.07),
    torso: lathe([[0.13, 0], [0.135, 0.06], [0.155, 0.18], [0.175, 0.3], [0.18, 0.38], [0.16, 0.44], [0.09, 0.48], [0.055, 0.5]], 22),
    jacketHem: lathe([[0.165, 0], [0.16, 0.1], [0.14, 0.2]], 22),
    skirt: lathe([[0.16, 0.42], [0.2, 0.25], [0.235, 0]], 22), dress: lathe([[0.15, 0.62], [0.17, 0.45], [0.21, 0.2], [0.24, 0]], 22),
    vee: new THREE.CircleGeometry(0.085, 3), tie: new THREE.BoxGeometry(0.035, 0.24, 0.01), collar: taper(0.062, 0.07, 0.05, 14),
    shoulder: new THREE.SphereGeometry(0.056, 14, 10),
    upper: taper(0.056, 0.047, 0.3), fore: taper(0.046, 0.036, 0.27), handG: new THREE.SphereGeometry(0.042, 10, 8),
    neck: taper(0.045, 0.05, 0.1), head: new THREE.SphereGeometry(0.1, 22, 18), ear: new THREE.SphereGeometry(0.022, 8, 6),
    hairS: new THREE.SphereGeometry(0.106, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hairL: lathe([[0.1, 0.24], [0.11, 0.15], [0.105, 0.05], [0.085, 0]], 18),
    bun: new THREE.SphereGeometry(0.05, 12, 10), badge: new THREE.BoxGeometry(0.07, 0.095, 0.01), strap: new THREE.TorusGeometry(0.12, 0.007, 4, 20, Math.PI),
    doc: new THREE.BoxGeometry(0.22, 0.3, 0.012),
    vest: lathe([[0.143, 0], [0.163, 0.18], [0.186, 0.3], [0.19, 0.38], [0.168, 0.44]], 22), vestBand: new THREE.CylinderGeometry(0.157, 0.157, 0.035, 22, 1, true), vestBand2: new THREE.CylinderGeometry(0.179, 0.179, 0.035, 22, 1, true),
    helmet: new THREE.SphereGeometry(0.118, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), brim: new THREE.CylinderGeometry(0.13, 0.13, 0.012, 22),
  };
  G.torso.scale(1.13, 1, 0.64); G.jacketHem.scale(1.13, 1, 0.66); G.shoe.scale(1, 1, 2.3); G.head.scale(0.86, 1.08, 0.96); G.hairS.scale(0.88, 1.06, 1.0); G.hairL.scale(0.95, 1, 0.8);
  G.vest.scale(1.13, 1, 0.68); G.vestBand.scale(1.13, 1, 0.68); G.vestBand2.scale(1.13, 1, 0.68); G.helmet.scale(0.92, 0.85, 1.02); G.brim.scale(0.92, 1, 1.05); G.skirt.scale(1.05, 1, 0.75); G.dress.scale(1.05, 1, 0.75); G.handG.scale(0.8, 1.5, 0.6); G.vee.rotateZ(-Math.PI / 2); G.vee.scale(0.75, 1.5, 1); G.shoe.rotateX(0);
  const list = [];
  const pick = (arr, k) => arr[((k % arr.length) + arr.length) % arr.length];
  // ชิ้นส่วนของคนหนึ่งคน: [กลุ่ม, geometry, สี, x, y, z, rx, ry, rz] · กลุ่ม = root/legL/legR/armL/armR
  function parts(o) {
    const f = o.female, k = o.k, sk = pick(skins, k * 3 + 1), hr = pick(hairs, k);
    let jacket, shirt, lower, tie = null, sleeve;
    if (o.snap) { jacket = '#1b1f26'; shirt = jacket; lower = '#1f2732'; sleeve = jacket; }
    else if (o.staff) { jacket = '#8cc3ea'; shirt = '#8cc3ea'; lower = '#1f2732'; sleeve = jacket; }
    else if (o.style === 'casual') { jacket = pick(casual, k); shirt = jacket; lower = pick(['#2c3440', '#3b4655', '#6b6458', '#1f2732'], k); sleeve = jacket; }
    else if (f) { jacket = o.dress ? pick(['#2b3a55', '#7a2f3e', '#3d4a5c', '#1c2433', '#5b6b7c'], k) : pick(o.jacket ? suits : blouses, k + 2); shirt = pick(blouses, k); lower = o.dress ? jacket : pick(['#1c2433', '#2b3a55', '#3a3f48', '#14181f', '#6a5a4a'], k); sleeve = jacket; }
    else { jacket = pick(suits, k); shirt = pick(shirtsW, k); lower = jacket; sleeve = jacket; tie = pick(['#1d4f9e', '#7a2f3e', '#2b3a55', '#3a5a40', '#1c2433'], k + 1); if (o.shirtOnly) { jacket = shirt; sleeve = shirt; tie = null; } }
    const legSkin = f && (o.skirt || o.dress), legC = legSkin ? sk : lower, shoe = f ? pick(['#1b1b1f', '#3a2a22', '#1b1b1f'], k) : '#121316';
    const P = [];
    for (const g of ['legL', 'legR']) {
      P.push([g, legSkin ? G.thighF : G.thigh, legC, 0, -0.23, 0], [g, legSkin ? G.kneeF : G.knee, legC, 0, -0.46, 0.004]);
      if (o.sit) {                                         // นั่ง: งอเข่า หน้าแข้งตั้งฉากพื้น
        P.push([g, legSkin ? G.shinF : G.shin, legC, 0, -0.46, -0.21, Math.PI / 2], [g, G.shoe, shoe, 0, -0.495, -0.46, Math.PI / 2]);
        if (f) P.push([g, G.heel, shoe, 0, -0.41, -0.43, Math.PI / 2]);
      } else {
        P.push([g, legSkin ? G.shinF : G.shin, legC, 0, -0.67, 0], [g, G.shoe, shoe, 0, -0.92, 0.035]);
        if (f) P.push([g, G.heel, shoe, 0, -0.89, -0.05]);
      }
    }
    P.push(['root', G.pelvis, lower, 0, 0.95, 0]);
    P.push(['root', G.torso, jacket, 0, 0.99, 0]);
    if (o.dress) P.push(['root', G.dress, jacket, 0, 0.38, 0]); else if (legSkin) P.push(['root', G.skirt, lower, 0, 0.52, 0]);
    if (!o.staff && jacket !== shirt) { P.push(['root', G.vee, shirt, 0, 1.38, 0.116, -0.12]); if (tie) P.push(['root', G.tie, tie, 0, 1.3, 0.119, -0.1]); P.push(['root', G.jacketHem, jacket, 0, 0.9, 0]); }
    if (o.staff) P.push(['root', G.collar, o.snap ? '#1b1f26' : '#8cc3ea', 0, 1.47, 0]);
    if (o.snap) {                                          // เสื้อกั๊กสะท้อนแสง + หมวกนิรภัยสีฟ้า (ทีม Snap On)
      P.push(['root', G.vest, '#d4ee2c', 0, 1.0, 0]);
      P.push(['root', G.vestBand, '#c6ced6', 0, 1.08, 0], ['root', G.vestBand2, '#c6ced6', 0, 1.24, 0]);
      P.push(['root', G.helmet, '#1f6fd6', 0, 1.69, 0.004], ['root', G.brim, '#1f6fd6', 0, 1.705, 0.03]);
    }
    P.push(['root', G.neck, sk, 0, 1.5, 0], ['root', G.head, sk, 0, 1.64, 0.006], ['root', G.ear, sk, -0.087, 1.63, 0], ['root', G.ear, sk, 0.087, 1.63, 0]);
    P.push(['root', G.hairS, hr, 0, 1.655, -0.012]);
    if (f && o.longHair) P.push(['root', G.hairL, hr, 0, 1.43, -0.04]); else if (f) P.push(['root', G.bun, hr, 0, 1.66, -0.1]);
    for (const x of [-0.198, 0.198]) P.push(['root', G.shoulder, sleeve, x, 1.41, 0]);
    if (o.badge !== false) { P.push(['root', G.badge, '#f4f6f8', 0, 1.22, 0.122]); P.push(['root', G.strap, '#1d5fc0', 0, 1.33, 0.06, Math.PI * 0.6, 0, Math.PI]); }
    for (const g of ['armL', 'armR']) P.push([g, G.upper, sleeve, 0, -0.16, 0], [g, G.fore, o.staff ? sk : sleeve, 0, -0.44, 0.012], [g, G.handG, sk, 0, -0.62, 0.02]);
    if (o.doc) P.push(['armR', G.doc, '#ffffff', 0, -0.62, 0.06, 0.2]);
    return P;
  }
  const PIV = { legL: [-0.092, 0.92, 0], legR: [0.092, 0.92, 0], armL: [-0.215, 1.42, 0], armR: [0.215, 1.42, 0] };
  const tmpM = new THREE.Matrix4(), tmpE = new THREE.Euler(), tmpQ = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  function merged(o, pose) {               // รวมเป็น geometry เดียว · pose = มุมขา/แขน (นั่ง/ยืน)
    const geos = [];
    for (const [grp, geo, col, x, y, z, rx = 0, ry = 0, rz = 0] of parts(o)) {
      const g2 = geo.index ? geo.toNonIndexed() : geo.clone(); g2.deleteAttribute('uv'); g2.applyMatrix4(tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), one));
      if (grp !== 'root') { const pv = PIV[grp], r = pose[grp] || 0; g2.applyMatrix4(tmpM.makeRotationX(r)); g2.translate(pv[0], pv[1], pv[2]); }
      const c = new THREE.Color(col), n = g2.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g2.setAttribute('color', new THREE.BufferAttribute(arr, 3)); geos.push(g2.index ? g2 : g2);
    }
    const gm = mergeGeometries(geos.map(q => q.index ? q : q), false); geos.forEach(q => q.dispose());
    const g = new THREE.Group(), m = new THREE.Mesh(gm, vmat); m.castShadow = true; g.add(m); g.scale.setScalar(o.scale || 1); parent.add(g);
    const dummy = () => new THREE.Group();
    return { g, body: g, legPivotL: dummy(), legPivotR: dummy(), aL: dummy(), aR: dummy(), ...o };
  }
  function rigged(o) {                     // แยกชิ้น (คนเดิน)
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const piv = {}; for (const k of Object.keys(PIV)) { piv[k] = new THREE.Group(); piv[k].position.set(...PIV[k]); body.add(piv[k]); }
    const byG = {};   // รวมชิ้นส่วนในข้อต่อเดียวกันเป็น mesh เดียว (สีตามจุดยอด) → ~5 draw call ต่อคน แทน ~25
    for (const [grp, geo, col, x, y, z, rx = 0, ry = 0, rz = 0] of parts(o)) {
      const g2 = geo.index ? geo.toNonIndexed() : geo.clone(); g2.deleteAttribute('uv'); g2.applyMatrix4(tmpM.compose(new THREE.Vector3(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, ry, rz)), one));
      const c = new THREE.Color(col), n = g2.attributes.position.count, arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g2.setAttribute('color', new THREE.BufferAttribute(arr, 3)); (byG[grp] = byG[grp] || []).push(g2); }
    for (const [grp, geos] of Object.entries(byG)) { const m = new THREE.Mesh(mergeGeometries(geos, false), vmat); geos.forEach(q => q.dispose()); m.castShadow = true; (grp === 'root' ? body : piv[grp]).add(m); }
    g.scale.setScalar(o.scale || 1); parent.add(g);
    return { g, body, legPivotL: piv.legL, legPivotR: piv.legR, aL: piv.armL, aR: piv.armR, ...o };
  }
  let k = 0;
  const who = extra => { const female = rnd() < 0.42, r = rnd(); return Object.assign({ k: k++, female, skirt: female && rnd() < 0.55, dress: female && rnd() < 0.2, jacket: female && rnd() < 0.45, longHair: female && rnd() < 0.6, shirtOnly: !female && rnd() < 0.18, style: r < 0.12 ? 'casual' : 'formal', scale: (female ? 0.94 : 1.0) + rnd() * 0.06 }, extra); };
  // คนเดินตามเส้นทาง (บางคนถือเอกสาร)
  for (let i = 0; i < 14; i++) list.push(Object.assign(rigged(who({ doc: rnd() < 0.25 })), { mode: 'walk', br: i % 2, s0: i * (L / 14) + rnd() * 3, v: 0.95 + rnd() * 0.3, off: (i % 2 ? 1 : -1) * (0.3 + rnd() * 0.3), ph: rnd() * 6 }));
  const routeD = (() => { const pts = []; for (let s = 0; s <= L; s += 0.4) pts.push(routeAt(s)); return (x, z) => { let d = 1e9; for (const p of pts) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); return d; }; })();
  // ผู้เยี่ยมชมหน้าบูธ 0–2 คน · เจ้าหน้าที่ประจำบูธ 1–2 คน
  booths.forEach(b => {
    const big = (b.w || 2) > 2, fv = FACEV[b.face];
    const n = b.tbc ? 0 : (rnd() < (big ? 0.6 : 0.4) ? 1 : 0);                       // ผู้เยี่ยมชม 0–1 คน + เจ้าหน้าที่ 1 คน = บูธละ 1–2 คน
    for (let j = 0; j < n; j++) {
      const side = (rnd() - 0.5) * (big ? 1.4 : 0.6), dist = (b.d || 1) / 2 + 0.55 + rnd() * 0.2;
      const px = b.x + fv[0] * dist + (fv[1] !== 0 ? side : 0), pz = b.z + fv[1] * dist + (fv[0] !== 0 ? side : 0);
      if (routeD(px, pz) < 1.25) continue;                                            // ไม่ยืนขวางเส้นทางเดิน
      const p = merged(who(), { armR: rnd() < 0.4 ? -0.5 : -0.05, armL: -0.04 }); p.g.position.set(px, 0, pz); p.g.rotation.y = Math.atan2(-fv[0], -fv[1]) + (rnd() - 0.5) * 0.5; p.mode = 'stand'; p.ph = rnd() * 6; list.push(p);
    }
    if (b.tbc) return;
    const spots = b.kind === 'cc' ? [[0.25, 0.75], [2.3, 0.6]] : b.kind === 'twq' ? [[0.1, 0.45], [-2.2, 0.5]] : b.kind === 'wari' ? [[-1.25, 0.9]] : b.kind === 'snap' ? [[-1.45, 0.45], [1.05, 1.32]] : b.kind === 'cia' ? [[-0.25, 0.85]] : b.kind ? [[0.55, 0.3]] : [[0.42, -0.15]];
    spots.slice(0, b.kind === 'snap' ? 2 : 1).forEach(([lx, lz], si) => {
      const p = merged(who({ staff: b.own === 'mwa', snap: b.kind === 'snap' }), { armL: -0.12, armR: si ? -0.12 : -0.45 }); const c = Math.cos(FACE[b.face]), s2 = Math.sin(FACE[b.face]);
      p.g.position.set(b.x + lx * c + lz * s2, 0, b.z - lx * s2 + lz * c); p.g.rotation.y = FACE[b.face] + (si ? 0.4 : 0); p.mode = 'stand'; p.ph = rnd() * 6; p.staff = true; list.push(p); });
  });
  // พักดื่มกาแฟ
  [[X(880), Z(275)], [X(940), Z(275)], [X(880), Z(320)], [X(940), Z(320)]].forEach(([x, z], ti) => {
    for (let j = 0; j < 1 + (ti % 2); j++) { const a = j * 2.6 + ti; const p = merged(who(), { armR: -1.15 }); p.g.position.set(x + Math.cos(a) * 0.72, 0, z + Math.sin(a) * 0.72); p.g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); p.mode = 'stand'; p.ph = rnd() * 6; list.push(p); }
  });
  // ผู้นั่งใน Auditorium
  for (let i = 0; i < 120; i++) { const st = seats[Math.floor(rnd() * seats.length)]; const p = merged(who({ badge: false, sit: true }), { legL: -Math.PI / 2, legR: -Math.PI / 2, armL: -0.6, armR: -0.6 }); p.g.position.set(st[0], st[1] - 0.36, st[2] + 0.04); p.g.rotation.y = 0; p.mode = 'sit'; list.push(p); }
  { // ผู้นั่งนิ่ง → รวมทั้งห้องเป็น mesh เดียว
    const sit = list.filter(p => p.mode === 'sit'), sitG = new THREE.Group(), geos = [];
    for (const p of sit) { p.g.updateMatrix(); const m = p.g.children[0]; geos.push(m.geometry.clone().applyMatrix4(p.g.matrix)); m.geometry.dispose(); parent.remove(p.g); p.g = sitG; p.body = sitG; }
    if (geos.length) { const m = new THREE.Mesh(mergeGeometries(geos, false), vmat); m.castShadow = true; geos.forEach(q => q.dispose()); sitG.add(m); parent.add(sitG); }
  }
  return list;
}

// ───────────────────────────── ทัวร์ ─────────────────────────────
function tourSteps(W) {
  const b = c => W.booths.find(q => q.code === c);
  const P = (px, py, h) => [X(px), h, Z(py)];
  const st = [
    { t: 'ภาพรวมชั้น 5', d: 'ลิฟต์ → ลงทะเบียน → ทางเดิน กปน. → นิทรรศการ กปน. → ห้องแสดงบริษัทพันธมิตร → ห้องประชุม Auditorium มีเส้นนำทางบนพื้นตลอดเส้นทาง', focus: null, cam: [-6, 61, 57], tgt: [4, 0, 4], j: -1 },
    { t: 'ออกจากลิฟต์ · ลงทะเบียน', d: 'ออกจากลิฟต์เดินมาที่ผนังต้อนรับกลางทางเดิน โต๊ะลงทะเบียนยาวด้านหน้า ป้ายแยกช่องลงทะเบียนล่วงหน้า หน้างาน และประชาสัมพันธ์ แล้วเลี้ยวขวาตามเส้นนำทาง', focus: 'lobby', cam: P(790, 880, 5.0), tgt: P(822, 700, 1.4), j: 0 },
    { t: 'ผนังต้อนรับ · Stakeholder Day', d: 'ผนังฉากกว้าง 6 ม. สูง 3 ม. ด้านหลังโต๊ะลงทะเบียน ตรา กปน. และข้อความต้อนรับ เป็นจุดถ่ายรูปแรกของงาน', focus: 'lobby', cam: P(822, 800, 2.3), tgt: P(822, 676, 1.7), j: 0 },
    { t: 'ทางเดินนวัตกรรม กปน.', d: 'ชิดผนังส่วนบริการฝั่งซ้าย: วารีกุญชร หุ่นยนต์สำรวจคลองส่งน้ำดิบ (เหรียญเงิน iENA 2022 เยอรมนี) บนแท่นจัดแสดง ตามด้วย Snap On อุปกรณ์ช่วยขยายแหวนยางยีโบลท์ (06) · C.I.A. Camera Intelligence Alert (08) · บูธ 07 ทางเดินกว้างราว 6 ม.', focus: 'mwa', cam: P(955, 740, 4.6), tgt: P(893, 575, 1.4), j: 1 },
    { t: 'นิทรรศการ กปน.', d: 'ชิดผนังทางเดินเหนือ เรียงแบบงานจริง: Chlorine Care · เส้นทางน้ำประปาดื่มได้ (WSP) · คลินิกน้ำสะอาด · TWQ Online', focus: 'north', cam: P(1190, 478, 7.0), tgt: P(1250, 352, 1.2), j: 2},
    { t: 'Chlorine Care · ระบบเติมคลอรีนอัตโนมัติ', d: 'ชุดถังจำลองพร้อมท่อ ตู้ควบคุม PLC และแท็บเล็ต โต๊ะปั๊มจ่ายสารพร้อมถังเคมี หน้าผ้าตึงไดอะแกรมระบบ', focus: 'north', booth: 'M02', cam: P(1185, 425, 2.9), tgt: P(1182, 352, 1.25), j: 2},
    { t: 'คลินิกน้ำสะอาด · TWQ Online', d: 'โพเดียมคลินิกน้ำสะอาด และเคาน์เตอร์โค้ง TWQ Online พร้อมจอแผนที่จุดตรวจวัดออนไลน์ ป้ายตั้ง “น้ำประปาดื่มได้” สแกน QR', focus: 'north', booth: 'M01', cam: P(1300, 428, 3.0), tgt: P(1295, 352, 1.25), j: 2},
    { t: 'ห้องแสดงบริษัทพันธมิตร · 12 บูธ', d: 'เปิดใช้ครึ่งห้องฝั่งตะวันออก เข้าประตูตะวันออก ชมบูธผนังเหนือ 8 บูธ ผนังใต้ 4 บูธ แต่ละบูธนำผลิตภัณฑ์มาตั้งโชว์ แล้วออกประตูตะวันตก', focus: 'hall', cam: P(1250, 440, 18), tgt: P(1250, 262, 0), j: 3},
    { t: 'แถวบูธฝั่งเหนือ', d: 'Yokogawa ชุดวิเคราะห์ · Petroinstrument หัววัด · ProMinent ปั๊มจ่ายสาร · DKD เครื่องมือภาคสนาม · UHM มาตรวัดการไหล · GF ท่อและวาล์ว · IWAKI ปั๊มเคมี · HACH เครื่องวิเคราะห์', focus: 'hall', cam: P(1385, 290, 3.6), tgt: P(1200, 205, 1.0), j: 3},
    { t: 'แถวบูธฝั่งใต้', d: 'บูธพันธมิตรอีก 4 บูธ (รอยืนยัน) ระหว่างประตูเข้า–ออก หลังชนกับนิทรรศการ กปน.', focus: 'hall', cam: P(1150, 225, 3.8), tgt: P(1290, 340, 1.0), j: 3},
    { t: 'ห้องรับประทานอาหาร · Coffee break', d: 'เข้าจากทางเดินเหนือ มีเคาน์เตอร์อาหารว่างและโต๊ะยืน', focus: 'dining', cam: P(1010, 400, 10), tgt: P(905, 255, 0.5), j: 3 },
    { t: 'หน้าห้อง Auditorium', d: 'ออกจากห้องแสดงทางประตูตะวันตก เดินทางเดินฝั่งใต้ไปประตูห้องประชุม สแกน Water Passport ก่อนเข้าห้อง', focus: 'audf', cam: P(1175, 315, 8.5), tgt: P(1305, 440, 0.9), j: 4 },
    { t: 'ห้องประชุม Auditorium', d: 'เข้าประตูด้านหลัง เลือกลงบันไดทางเดินซ้ายหรือขวา (ไม่เดินผ่านแถวที่นั่ง) ที่นั่งขั้นบันได เวที จอ และแปลงดอกไม้หน้าเวที', focus: 'aud', cam: P(1310, 452, 7.0), tgt: P(1337, 700, -1.4), j: 5 },
  ];
  return st;
}
const JOURNEY = ['ลิฟต์ · ลงทะเบียน', 'ทางเดิน กปน.', 'นิทรรศการ กปน.', 'ห้องแสดง 1', 'หน้าห้องประชุม', 'Auditorium'];

// ───────────────────────────── เล่น ─────────────────────────────
// เตรียมฉากล่วงหน้า (สร้างโมเดล + คอมไพล์ shader) ระหว่างที่ผู้ชมยังอยู่หน้าแรก/แผนที่ → ตอนเข้าชั้น 5 ไม่สะดุด
let PRE = null;
const preKey = opt => Q_AO(opt) + '|' + Q_DPR(opt);
// คอมไพล์ shader (~70 ชุด) แบบขนานด้วย compileAsync → หน้าเว็บไม่ค้างระหว่างรอ · คืน Promise ที่เสร็จเมื่อพร้อม
let PREP = null;
function prepare(opt = {}) {
  if (PREP) return PREP;
  if (S) return (PREP = Promise.resolve(true));
  const o = Object.assign({ onDone: () => {} }, opt), root = build(o), ctx = makeScene(root, o), W = buildWorld(ctx);
  PRE = { root, ctx, W, key: preKey(o) };
  PREP = (async () => {
    try { const w = innerWidth, h = innerHeight; ctx.renderer.setSize(w, h, false); ctx.camera.aspect = w / h; ctx.camera.position.set(-74, 24, -158); ctx.camera.lookAt(0, 0, 0); ctx.camera.updateProjectionMatrix();
      ctx.setupComposer(w, h);
      if (ctx.renderer.compileAsync) await ctx.renderer.compileAsync(ctx.scene, ctx.camera); else ctx.renderer.compile(ctx.scene, ctx.camera);
      if (PRE && PRE.ctx === ctx && !S) { ctx.renderer.shadowMap.needsUpdate = true; ctx.composer.render(); }   /* อัปโหลด texture/geometry + shader ของ AO/เงา */
    } catch (e) { console.warn('[F5] prepare', e); }
    return true;
  })();
  return PREP;
}
function play(opt = {}) {
  if (S) stop(true);
  let root, ctx, W;
  if (PRE && PRE.key === preKey(opt) && !!opt.onDone) ({ root, ctx, W } = PRE);
  else { if (PRE) { try { PRE.ctx.renderer.dispose(); PRE.root.remove(); } catch (e) {} } root = build(opt); ctx = makeScene(root, opt); W = buildWorld(ctx); }
  PRE = null; PREP = null;
  const st = { wallIntro: 1, root, ctx, W, opt, t0: performance.now(), intro: 0, introOn: true, step: 0, auto: false, autoT: 0, speed: 1, simT: 0, sel: null, focus: null, zoneA: {}, spin: false, tween: null, running: true };
  S = st;
  const { renderer, camera, controls, scene } = ctx;
  const STEPS = tourSteps(W);

  // ตัวเลข KPI
  root.querySelector('#f5len').innerHTML = Math.round(W.L) + '<em>ม.</em>';
  root.querySelector('#f5seat').innerHTML = (Math.round(W.seats.length / 10) * 10) + '<em>ที่</em>';

  // ขนาด
  function resize() {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!ctx.composer) ctx.setupComposer(w, h); else { ctx.composer.setSize(w, h); }
  }
  resize(); addEventListener('resize', resize); st.resize = resize;

  // ── ป้าย HTML
  const lblRoot = root.querySelector('#f5lbl');
  const zoneLbl = Object.entries(ZONES).map(([id, z], i) => { const el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = `<div class="zl"><i>${i + 1}</i>${esc(z.name)}</div>`; lblRoot.appendChild(el); return { id, el, p: new THREE.Vector3(z.c[0], id === 'aud' ? 5.2 : 3.6, z.c[1]) }; });
  const bLbl = W.booths.map(b => { const el = document.createElement('div'); el.className = 'lbl'; el.innerHTML = `<div class="bl"><em>${b.code}</em>${esc(b.name)}</div>`; el.style.opacity = 0; lblRoot.appendChild(el); const fv = FACEV[b.face]; return { b, el, p: new THREE.Vector3(b.x + fv[0] * 0.2, 2.85, b.z + fv[1] * 0.2) }; });
  const v3 = new THREE.Vector3();
  function placeLabels() {
    const w = root.clientWidth, h = root.clientHeight, introA = ss(8.0, 9.0, st.intro);
    const overview = camera.position.distanceTo(controls.target) > 34;
    for (const z of zoneLbl) {
      v3.copy(z.p).applyMatrix4(W.interior.matrixWorld).project(camera);
      const vis = v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
      const a = vis ? introA * (st.focus ? (st.focus === z.id ? 1 : 0) : (overview ? 1 : 0)) : 0;
      z.el.style.opacity = a; z.el.style.transform = `translate(${(v3.x + 1) / 2 * w}px,${(1 - v3.y) / 2 * h}px) translate(-50%,-100%)`;
      z.el.firstChild.classList.toggle('on', st.focus === z.id);
    }
    for (const q of bLbl) {
      v3.copy(q.p).applyMatrix4(W.interior.matrixWorld).project(camera);
      const d = camera.position.distanceTo(q.b.group.position);
      const near = d < 16 && (!st.focus || st.focus === q.b.zone) && !(st.walk && Math.abs(q.b.along - st.walk.s) > 9);   // เดินชม: แสดงเฉพาะบูธใกล้ตามเส้นทาง (ไม่โผล่ทะลุผนัง)
      const a = (v3.z < 1 && Math.abs(v3.x) < 1.02 && Math.abs(v3.y) < 1.02) ? ((st.sel === q.b || st.hover === q.b) ? 1 : near ? 0.92 : 0) * introA : 0;
      q.el.style.opacity = a; q.el.style.transform = `translate(${(v3.x + 1) / 2 * w}px,${(1 - v3.y) / 2 * h}px) translate(-50%,-100%)`;
    }
  }

  // ── รายการบูธ
  const items = root.querySelector('#f5items');
  let tab = 'mwa';
  function renderList() {
    const q = (root.querySelector('#f5q').value || '').trim().toLowerCase();
    let html = '';
    if (tab === 'zone') {
      html = Object.entries(ZONES).map(([id, z], i) => `<div class="it" data-zone="${id}"><div class="sw" style="background:#1d5fc0">${i + 1}</div><div class="mid"><b>${esc(z.name)}</b><small>${W.booths.filter(b => b.zone === id).length || '–'} บูธ</small></div></div>`).join('');
    } else {
      const list = W.booths.filter(b => (q ? (b.name + b.sub + b.code).toLowerCase().includes(q) : b.own === tab));
      html = list.map(b => `<div class="it${st.sel === b ? ' on' : ''}" data-b="${b.code}"><div class="sw" style="background:${b.col}">${b.code}</div><div class="mid"><b>${esc(b.name)}</b><small>${esc(ZONES[b.zone].name)} · ลำดับ ${b.order}/19</small></div>
        <span class="st ${b.tbc ? 'tbc' : 'ok'}">${b.tbc ? 'รอยืนยัน' : (b.w || 2) + ' × ' + (b.d || 1) + ' ม.'}</span><div class="bar"><i style="width:${Math.round(b.order / W.booths.length * 100)}%"></i></div></div>`).join('') || '<div style="padding:12px;color:#8a97a6;font-size:13px">ไม่พบบูธ</div>';
    }
    items.innerHTML = html;
  }
  root.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; root.querySelectorAll('.tabs [data-tab]').forEach(x => x.classList.toggle('on', x === b)); renderList(); }));
  root.querySelector('#f5q').addEventListener('input', renderList);
  items.addEventListener('click', e => { const it = e.target.closest('.it'); if (!it) return; root.querySelector('.list').classList.remove('show'); if (it.dataset.b) selectBooth(W.booths.find(b => b.code === it.dataset.b), true); else if (it.dataset.zone) { const si = STEPS.findIndex(s => s.focus === it.dataset.zone); if (si >= 0) goStep(si); } });
  renderList();

  // ── รายละเอียดบูธ
  const det = root.querySelector('#f5det');
  function selectBooth(b, fly) {
    st.sel = b; renderList();
    if (!b) { det.classList.remove('on'); return; }
    const own = b.own === 'mwa';
    det.innerHTML = `<div class="hd"><div class="sw" style="background:${b.col}">${b.code}</div><div><h3>${esc(b.name)}</h3><div class="sub">${esc(b.sub)}</div></div><button class="x" data-k="desel" aria-label="ปิด">✕</button></div>
      <div class="pill ${b.tbc ? 'tbc' : own ? 'mwa' : 'p'}"><i></i>${own ? 'บูธ กปน.' : 'บริษัทพันธมิตร'}${b.tbc ? ' · รอยืนยัน' : ''}</div>
      <div class="row"><span>โซน</span><b>${esc(ZONES[b.zone].name)}</b></div>
      <div class="row"><span>ขนาดบูธ</span><b>กว้าง ${b.w || 2} ม. × ลึก ${b.d || 1} ม.</b></div>
      <div class="row"><span>การวาง</span><b>${b.kind ? 'ผ้าตึงโค้ง + เคาน์เตอร์ ชิดผนัง' : 'ชิดผนัง'} ${{ e: 'ฝั่งตะวันตก', w: 'ฝั่งตะวันออก', n: 'ฝั่งใต้', s: 'ฝั่งเหนือ' }[b.face]}</b></div>
      <div class="row"><span>ลำดับบนเส้นทาง</span><b>${b.order} จาก ${W.booths.length} · ${Math.round(b.along)} ม. จากลิฟต์</b></div>
      <div class="nav"><button class="btn" data-k="bprev">${ui('prev')}บูธก่อนหน้า</button><button class="btn pri" data-k="bnext">บูธถัดไป${ui('next')}</button></div>`;
    det.classList.add('on');
    if (fly) { const fv = FACEV[b.face], k = (b.w || 2) > 2 ? 1.35 : 1; flyTo([b.x + fv[0] * 5.2 * k + fv[1] * 1.6, 3.4, b.z + fv[1] * 5.2 * k - fv[0] * 1.6], [b.x, 1.2, b.z], 1.5); setFocus(b.zone); }
  }

  // ── จางโซน
  const REL = { lobby: ['lobby'], mwa: ['mwa'], north: ['north', 'hall', 'audf'], hall: ['hall'], dining: ['dining'], audf: ['audf', 'aud'], aud: ['aud'] };
  const ALLZ = ['lobby', 'mwa', 'north', 'hall', 'dining', 'audf', 'aud', 'other', 'base', 'shell'];
  ALLZ.forEach(z => st.zoneA[z] = 1);
  function setFocus(z) { st.focus = z; }
  function updateZones(dt) {
    const k = st.snap ? 1 : 1 - Math.exp(-dt * 5); st.snap = false;
    for (const z of ALLZ) {
      let tgt = 1;
      if (st.focus) { const rel = REL[st.focus] || [st.focus];
        tgt = rel.includes(z) || z === 'base' ? 1 : z === 'shell' ? 0.55 : z === 'other' ? 0.55 : 0.32; }
      const a = st.zoneA[z] = st.zoneA[z] + (tgt - st.zoneA[z]) * k;
      W.ZM.set(z, a);
    }
    const rel = st.focus ? (REL[st.focus] || [st.focus]) : null;
    for (const m of W.walls) {
      const tgt = st.wallIntro * (rel && !rel.includes(m.userData.zone) ? 0.08 : 1);
      const kk = m.userData.k = m.userData.k + (tgt - m.userData.k) * (st.introOn ? 1 : k);
      const v = Math.max(0.001, kk); m.scale.y = v; m.position.y = m.userData.h * v / 2;
      if (m.userData.label) { m.userData.label.visible = v > 0.9; }
    }
  }

  // ── ทัวร์ & เส้นทาง
  const stepsEl = root.querySelector('#f5steps');
  JOURNEY.forEach((t, i) => { const b = document.createElement('button'); b.className = 'stp'; b.innerHTML = `<i>${i + 1}</i><span>${t}</span>`; b.addEventListener('click', () => { const si = STEPS.findIndex(s => s.j === i); if (si >= 0) goStep(si); }); stepsEl.appendChild(b); });
  function goStep(i, instant) {
    st.step = (i + STEPS.length) % STEPS.length; const s = STEPS[st.step];
    root.querySelector('#f5n').textContent = (st.step + 1) + ' / ' + STEPS.length;
    root.querySelector('#f5t').textContent = s.t; root.querySelector('#f5d').textContent = s.d;
    const btns = stepsEl.querySelectorAll('.stp'); btns.forEach((b, k) => { b.classList.toggle('done', k < s.j); b.classList.toggle('cur', k === s.j); });
    stepsEl.querySelector('.fill').style.width = s.j < 0 ? '0' : `calc(${s.j / (JOURNEY.length - 1) * 100}% - ${s.j / (JOURNEY.length - 1) * 28}px)`;
    setFocus(s.focus);
    if (s.booth) selectBooth(W.booths.find(b => b.code === s.booth), false); else selectBooth(null);
    flyTo(s.cam, s.tgt, instant ? 0 : 2.0);
    if (instant) st.snap = true;
    st.autoT = 0;
  }
  function flyTo(p, t, dur) {
    st.spin = false; controls.autoRotate = false;
    if (!dur) { camera.position.set(...p); controls.target.set(...t); controls.update(); st.tween = null; return; }
    const p0 = camera.position.clone(), t0 = controls.target.clone(), p1 = new THREE.Vector3(...p), t1 = new THREE.Vector3(...t);
    const lift = Math.min(18, p0.distanceTo(p1) * 0.18);
    st.tween = { p0, t0, p1, t1, dur, t: 0, lift };
  }
  function tweenStep(dt) {
    const tw = st.tween; if (!tw) return; tw.t += dt / tw.dur; const u = easeIO(clamp(tw.t));
    camera.position.lerpVectors(tw.p0, tw.p1, u); camera.position.y += Math.sin(Math.PI * u) * tw.lift; controls.target.lerpVectors(tw.t0, tw.t1, u);
    if (tw.t >= 1) st.tween = null;
  }

  // ── ปุ่ม
  // ── นำชมแบบเดินตามทาง: กล้องระดับสายตาคน เดินจากลิฟต์ตามเส้นนำทาง ชะลอและหันมองเมื่อผ่านบูธ
  const WALK = { v: 2.7, slow: 1.15, eye: 1.62 };
  const jOf = s => { const bs = W.booths; const first = z => { const q = bs.filter(b => b.zone === z); return q.length ? Math.min(...q.map(b => b.along)) : 1e9; }, last = z => { const q = bs.filter(b => b.zone === z); return q.length ? Math.max(...q.map(b => b.along)) : -1e9; };
    if (s < first('mwa') - 4) return 0; if (s < first('north') - 4) return 1; if (s < W.sHall) return 2; if (s < W.sHallOut) return 3; if (s < W.sDoor - 1) return 4; return 5; };
  function setWalkCard(j) {
    if (st.walkJ === j) return; st.walkJ = j;
    const si = STEPS.findIndex(q => q.j === j); const s = STEPS[si] || STEPS[0];
    root.querySelector('#f5n').textContent = 'เดินชม'; root.querySelector('#f5t').textContent = JOURNEY[j]; root.querySelector('#f5d').textContent = s.d;
    stepsEl.querySelectorAll('.stp').forEach((b, k) => { b.classList.toggle('done', k < j); b.classList.toggle('cur', k === j); });
    stepsEl.querySelector('.fill').style.width = `calc(${j / (JOURNEY.length - 1) * 100}% - ${j / (JOURNEY.length - 1) * 28}px)`;
  }
  function walkStep(dt) {
    const w = st.walk; let near = null, nd = 1e9;
    const p = W.routeAt(Math.min(w.s, W.L));
    for (const b of W.booths) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < nd && Math.abs(b.along - w.s) < 4.5) { nd = d; near = b; } }
    const slow = near && nd < 4.2 && !near.tbc;
    w.seen = w.seen || {};
    if (near && near.kind && /wari|snap|cia|cc|twq/.test(near.kind) && !w.seen[near.code] && w.s >= near.along - 0.4) { w.seen[near.code] = true; w.hold = /snap|cia/.test(near.kind) ? 2.6 : 2.2; }   // แวะดูบูธเด่นสักครู่
    if (w.hold > 0) { w.hold -= dt; w.v = lerp(w.v, 0, Math.min(1, dt * 5)); }
    else { const toEnd = W.L - w.s, onStair = w.s > W.sDoor + 3; w.v = lerp(w.v, toEnd < 3 ? Math.max(0.3, toEnd * 0.45) : onStair ? 1.25 : slow ? WALK.slow : WALK.v, Math.min(1, dt * 2.2)); }
    w.s = Math.min(W.L, w.s + w.v * dt);
    const q = W.routeAt(w.s), ahead = W.routeAt(Math.min(w.s + 5.5, W.L));
    const fy = floorY(q.x, q.z); w.fy = w.fy == null ? fy : lerp(w.fy, fy, Math.min(1, dt * 7));          // ลงบันไดนุ่มๆ
    const pos = new THREE.Vector3(q.x, w.fy + WALK.eye + Math.sin(w.s * 3.6) * 0.018, q.z);
    let look = new THREE.Vector3(ahead.x, floorY(ahead.x, ahead.z) + 1.45, ahead.z);
    { const k = ss(W.sDoor + 5, W.L - 1, w.s); if (k > 0) look.lerp(new THREE.Vector3((AUDm.ax0 + AUDm.ax1) / 2, AUDm.pitY + 2.6, AUDm.az1), k); }   // ลงถึงล่าง: หันมองเวที
    if (slow) { const k = w.hold > 0 ? 0.9 : Math.min(1, (4.2 - nd) / 2.2) * 0.6; look.lerp(new THREE.Vector3(near.x, 1.25, near.z), k); }
    if (!w.look) w.look = look.clone(); w.look.lerp(look, Math.min(1, dt * 2.2));
    camera.position.copy(pos); controls.target.copy(w.look); camera.lookAt(w.look);
    setWalkCard(jOf(w.s));
    for (const pp of W.people) if (pp.mode === 'stand') pp.g.visible = Math.hypot(pp.g.position.x - pos.x, pp.g.position.z - pos.z) > 1.1;
    if (w.s >= W.L - 0.02) { w.endT = (w.endT || 0) + dt; if (w.endT > 2.6) { setAuto(false); goStep(STEPS.length - 1); } }
  }
  function setAuto(on) {
    st.auto = on; st.autoT = 0; const b = root.querySelector('#f5auto'); b.classList.toggle('pri', on); b.innerHTML = on ? ui('pause') + 'หยุดเดินชม' : ui('walk') + 'เดินชม';
    if (on) { st.walk = { s: 1.3, v: 0.4, look: null }; st.walkJ = -1; st.tween = null; st.spin = false; controls.autoRotate = false; controls.enabled = false; setFocus(null); selectBooth(null); camera.fov = 66; camera.updateProjectionMatrix(); }
    else if (st.walk) { st.walk = null; W.people.forEach(pp => { if (pp.mode === 'stand') pp.g.visible = true; }); controls.enabled = true; camera.fov = 45; camera.updateProjectionMatrix(); }
  }
  function act(k) {
    if (k === 'next') { setAuto(false); goStep(st.step + 1); }
    else if (k === 'prev') { setAuto(false); goStep(st.step - 1); }
    else if (k === 'auto') setAuto(!st.auto);
    else if (k === 'home') { setAuto(false); goStep(0); }
    else if (k === 'top') { setAuto(false); setFocus(null); selectBooth(null); flyTo([4, 112, 12], [4, 0, 3], 1.6); }
    else if (k === 'spin') { st.spin = !st.spin; controls.autoRotate = st.spin; controls.autoRotateSpeed = 0.7; st.tween = null; }
    else if (k === 'zin' || k === 'zout') { const d = controls.target.clone().sub(camera.position); camera.position.addScaledVector(d, k === 'zin' ? 0.28 : -0.4); }
    else if (k === 'xgo') xRelease();
    else if (k === 'explode') { st.xDone = false; st.xE = 1; const r = xp.querySelector('input'); if (r) r.value = 43; st.intro = 0.8; st.introOn = true; root.classList.add('intro'); setFocus(null); selectBooth(null); }
    else if (k === 'skip') { xRelease(); st.intro = INTRO_END + 0.4; }
    else if (k === 'fs') { try { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); } catch (e) {} }
    else if (k === 'back') stop();
    else if (k === 'desel') { selectBooth(null); }
    else if (k === 'list') { const L = root.querySelector('.list'); L.classList.remove('min'); L.classList.toggle('show'); if (L.classList.contains('show')) selectBooth(null); }
    else if (k === 'lmin') { root.querySelector('.list').classList.toggle('min'); }
    else if (k === 'bnext' || k === 'bprev') { const i = st.sel ? st.sel.order - 1 : -1, n = W.booths[(i + (k === 'bnext' ? 1 : -1) + W.booths.length) % W.booths.length]; selectBooth(n, true); }
  }
  root.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) act(b.dataset.k); });
  const onKey = e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') act('next'); else if (e.key === 'ArrowLeft') act('prev'); else if (e.key === ' ') { e.preventDefault(); act('auto'); }
    else if (e.key === 'Escape') { if (st.sel) selectBooth(null); else if (opt.onDone) stop(); } };
  addEventListener('keydown', onKey); st.onKey = onKey;
  // เลือกบูธด้วยเมาส์
  const ray = new THREE.Raycaster(), mp = new THREE.Vector2(); let down = null;
  const hits = W.booths.map(b => b.hit);
  const pick = e => { const r = renderer.domElement.getBoundingClientRect(); mp.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(mp, camera); const h = ray.intersectObjects(hits, false)[0]; return h ? h.object.userData.booth : null; };
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; setAuto(false); st.tween = null; if (st.spin) { st.spin = false; controls.autoRotate = false; } });
  renderer.domElement.addEventListener('pointerup', e => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const b = pick(e); if (b) selectBooth(b, true); });
  renderer.domElement.addEventListener('pointermove', e => { if (e.buttons) return; const b = pick(e); st.hover = b; renderer.domElement.style.cursor = b ? 'pointer' : ''; });

  // ── อินโทร: ตึกเต็ม → แยกชั้น → ชั้น 5
  const introCam = { p0: new THREE.Vector3(-74, 24, -158), t0: new THREE.Vector3(-10, 14, -2), fov0: 45 };   // เริ่มจากฝั่งคลองประปา (มุมเดียวกับภาพถ่าย)
  if (opt.fromCam) {                                    // ต่อภาพจากกล้องแผนที่พอดี (ซูมต่อเนื่อง ไม่หยุด)
    introCam.p0.fromArray(opt.fromCam.pos).applyMatrix4(W.siteM); introCam.t0.fromArray(opt.fromCam.tgt).applyMatrix4(W.siteM); introCam.fov0 = opt.fromCam.fov || 36.87;
    introCam.t0.y = Math.max(introCam.t0.y, W.gy + 2);
  }
  const INTRO_END = 9.2;
  // ── โหมดทดลอง ?xray: แยกชั้นแบบภาพผ่าตัด (teardown) — ชั้นอื่นเป็นกระจก ชั้น 5 ทึบสีน้ำเงิน มีป้ายเลขชั้น และหยุดให้ลากแยกเองได้
  const XRAY = /[?&]xray\b/.test(location.search), X_HOLD = 3.9, X_HOLD_LEN = 2.6;
  const INK = new THREE.Color('#3b4756'), ACC = new THREE.Color('#0a6fd8');
  st.xE = 1; st.xDone = false; st.xHolding = false;
  const xl = root.querySelector('#f5xl'), xp = root.querySelector('#f5xp'), xBox = new THREE.Box3(), xV = new THREE.Vector3();
  const xLabels = [];
  if (XRAY) {
    const mk = (txt, cls, g, f) => { const e = document.createElement('div'); e.className = 'xf ' + cls; e.innerHTML = '<b>' + txt + '</b>'; xl.appendChild(e);
      g.updateMatrixWorld(true); xBox.setFromObject(g); const p0 = g.position.clone(); xLabels.push({ e, g, f, lo: xBox.min.clone().sub(p0), hi: xBox.max.clone().sub(p0) }); };
    for (const F of W.floors) if (F && F.f > F5) mk('ชั้น ' + (F.f + 1), '', F.g, F.f);
    mk('ชั้น 5 · Stakeholder Day', 'f5', W.f5shell.g, F5);
    xp.querySelector('input').addEventListener('input', e => { st.xE = 0.35 + (+e.target.value / 100) * 1.5; st.xUser = true; st.xLast = performance.now(); });
  }
  const xRelease = () => { st.xHolding = false; st.xDone = true; xp.classList.remove('on'); };
  function xrayLabels(alpha) {
    xl.style.display = alpha > 0.01 ? '' : 'none'; if (alpha <= 0.01) return;
    const w = innerWidth, h = innerHeight; let col = -1e9;   // ป้ายเรียงคอลัมน์เดียว เส้นชี้ยาวจากขอบชั้นถึงคอลัมน์
    const T = xLabels.reduce((a, L) => (L.f > a.f ? L : a), xLabels[0]);   // ใช้มุมของตัวหอ (ชั้นบนสุด) เป็นจุดยึดทุกป้าย → เส้นชี้เรียงแนวเดียวกัน
    for (const L of xLabels) { const g = L.g, ym = g.position.y + (L.lo.y + L.hi.y) / 2; let bx = -1e9, by = 0;
      for (const [x, z] of [[T.lo.x, T.lo.z], [T.lo.x, T.hi.z], [T.hi.x, T.lo.z], [T.hi.x, T.hi.z]]) { xV.set(g.position.x + x, ym, g.position.z + z).project(camera);
        const sx = (xV.x * 0.5 + 0.5) * w, sy = (-xV.y * 0.5 + 0.5) * h; if (sx > bx) { bx = sx; by = sy; } }
      L.bx = bx; L.by = by; if (g.visible) col = Math.max(col, bx); }
    col = Math.min(col + 28, w - 200);
    for (const L of xLabels) { const vis = L.g.visible ? alpha : 0; L.e.style.opacity = vis;
      L.e.style.setProperty('--ll', Math.max(12, Math.round(col - L.bx)) + 'px'); L.e.style.transform = `translate(${Math.round(L.bx + 4)}px,${Math.round(L.by - 12)}px)`; }
  }
  function xrayFloors(t) {
    const E = st.xE, u = eOut(ss(1.0, 2.6, t)), out = ss(X_HOLD + 0.05, 5.0, t), out2 = eOut(ss(X_HOLD + 0.05, 4.9, t));
    for (const F of W.floors) { if (!F) continue;
      if (F.f > F5) { const k = F.f - F5, live = 1 - out;
        F.g.position.y = F.f * FH + u * k * 3.6 * E + eOut(out) * (8 + k * 5); F.g.position.x = 0; F.g.rotation.y = 0;
        for (const m of F.mats) { m.opacity = (m.userData.glass ? lerp(1, 0.05, u) : lerp(1, 0.16, u)) * live; m.depthWrite = u < 0.05; }
        F.edgeM.color.copy(INK); F.edgeM.opacity = 0.55 * u * live; F.g.visible = live > 0.01;
      } else { const d = F5 - F.f;
        F.g.position.y = F.f * FH - d * lerp(1.4 * E * u, 1.8, out2);
        for (const m of F.mats) { m.opacity = m.userData.glass ? lerp(1, 0.04, u) : lerp(1, 0.18, u); m.depthWrite = u < 0.05; }
        F.edgeM.color.copy(INK).lerp(EDGE0, out2); F.edgeM.opacity = lerp(0.55 * u, 0.75, out2);
      } }
    { const o = ss(1.2, 2.4, t); for (const m of W.oldBldg.mats) { m.opacity = lerp(1, 0.14, o); m.depthWrite = o < 0.3; } }
    const shell = ss(X_HOLD + 0.4, 5.2, t), hl = ss(1.4, 2.2, t) * (1 - shell);
    for (const m of W.f5shell.mats) { m.opacity = 1 - shell; m.depthWrite = shell < 0.02; if (m.emissive) { m.emissive.copy(ACC); m.emissiveIntensity = hl * 0.35; } }
    W.f5shell.g.visible = shell < 0.99; W.f5shell.edgeM.color.copy(ACC).lerp(EDGE0, ss(5.0, 6.0, t)); W.f5shell.edgeM.opacity = Math.max(ss(1.0, 1.8, t) * (1 - ss(5.0, 6.0, t)), 0);
    W.scan.visible = false;
    xrayLabels(ss(2.0, 2.6, t) * (1 - ss(X_HOLD + 0.1, X_HOLD + 0.6, t)));
  }
  camera.position.copy(introCam.p0); controls.target.copy(introCam.t0); camera.fov = introCam.fov0; camera.userData.wide = opt.fromCam ? 0 : 1; camera.updateProjectionMatrix(); controls.update();
  const setOp = (F, solid, glass, dw) => { for (const m of F.mats) { m.opacity = m.userData.glass ? glass : solid; m.depthWrite = dw; } };
  function shadowBox(big) {                             // ตอนเห็นทั้งอาคาร ขยายกรอบเงา · ตอนอยู่ในชั้น 5 ใช้กรอบแคบให้เงาคม
    const sc = ctx.sun.shadow.camera;
    Object.assign(sc, big ? { left: -110, right: 110, top: 110, bottom: -110, near: 10, far: 420 } : { left: -52, right: 52, top: 44, bottom: -44, near: 10, far: 220 });
    ctx.sun.position.set(-38, 70, 30).multiplyScalar(big ? 2 : 1); sc.updateProjectionMatrix();
  }
  const eOut = x => 1 - Math.pow(1 - x, 3);
  const HOLO = new THREE.Color(0.35, 2.0, 4.2), EDGE0 = new THREE.Color('#7fd0ff');
  function applyIntro(t) {
    // 0–1.0 ภาพอาคาร · 1.0–2.6 วงสแกนแสงไล่จากยอดตึกลงมาถึงชั้น 5 (ชั้นที่ผ่านกลายเป็นโฮโลแกรมเส้นเรือง)
    // 2.6–5.0 ชั้น 6–12 ลอยแยกขึ้นทีละชั้นจากบนสุดแล้วสลาย · 3.0–4.6 ชั้นล่างกลายเป็นโครงเส้น · 3.6–4.8 ผนังกระจกชั้น 5 เรืองแล้วสลาย
    // 4.6–7.8 ผนังห้อง บูธ เส้นนำทาง ผู้คน · กล้องเครนขึ้นมุมสูงแล้วลงสู่ภาพรวมชั้น 5
    if (!st.bigShadow !== !(t < INTRO_END - 0.6)) { st.bigShadow = t < INTRO_END - 0.6; shadowBox(st.bigShadow); }
    const intro = t < INTRO_END - 0.05; if (ctx.gtao && !st.aoOff) ctx.gtao.enabled = !(t > 0.9 && t < 6.4);   // ไม่คิด AO ช่วงแยกชั้น (วัตถุโปร่งใสทำให้เกิดแผ่นดำ)
    const topY = (NF - F5) * FH + 8.5, scanY = lerp(topY, 0.05, eOut(ss(1.0, 2.6, t)));
    if (XRAY) xrayFloors(t); else {
    { const S = W.scan, on = t > 0.95 && t < 5.6; S.visible = on;
      if (on) { S.position.y = scanY; const a = Math.min(ss(0.95, 1.25, t), 1 - ss(4.6, 5.6, t)); S.userData.cm.opacity = a * (t < 2.7 ? 1 : 0.35); S.userData.lm.opacity = a; } }
    const lowF = ss(3.0, 4.6, t), shell = ss(4.2, 5.0, t);
    for (const F of W.floors) { if (!F) continue;
      F.edgeM.color.copy(intro ? HOLO : EDGE0);
      if (F.f > F5) {
        const k = F.f - F5, y0 = k * FH, holo = clamp((y0 + FH - scanY) / FH);
        const t0 = 2.6 + (NF - 1 - F.f) * 0.14, u = eOut(ss(t0, t0 + 1.7, t)), fade = 1 - ss(t0 + 1.0, t0 + 2.1, t);
        F.g.position.y = F.f * FH + u * (9 + k * 7.5); F.g.position.x = u * (k % 2 ? 1 : -1) * 1.6; F.g.rotation.y = u * (k % 2 ? 1 : -1) * 0.05;
        const so = lerp(1, 0.08, holo) * fade, go = lerp(1, 0.04, holo) * fade;
        for (const m of F.mats) { m.opacity = m.userData.glass ? go : so; m.depthWrite = holo < 0.05; }
        F.g.visible = fade > 0.01; F.edgeM.opacity = holo * fade;
      } else {
        const so = lerp(1, 0.18, lowF), go = lerp(1, 0.04, lowF);
        for (const m of F.mats) { m.opacity = m.userData.glass ? go : so; m.depthWrite = m.userData.glass ? lowF < 0.02 : lowF < 0.5; }
        F.edgeM.opacity = 0.75 * lowF; F.g.position.y = F.f * FH - eOut(lowF) * (F5 - F.f) * 1.8;
      } }
    { const o = ss(2.6, 3.8, t); for (const m of W.oldBldg.mats) { m.opacity = lerp(1, 0.14, o); m.depthWrite = o < 0.3; } }
    const flash = ss(3.4, 4.0, t) * (1 - ss(4.3, 5.0, t));
    for (const m of W.f5shell.mats) { m.opacity = 1 - shell; m.depthWrite = shell < 0.02; if (m.emissive) { m.emissive.setRGB(0.25, 0.85, 1.0); m.emissiveIntensity = intro ? flash * 0.7 : 0; } }
    W.f5shell.g.visible = shell < 0.99; W.f5shell.edgeM.color.copy(intro ? HOLO : EDGE0); W.f5shell.edgeM.opacity = Math.min(ss(2.5, 2.9, t), 1 - ss(5.0, 6.0, t));
    }
    { const k = ss(5.6, INTRO_END, t); ctx.scene.fog.near = lerp(420, 170, k); ctx.scene.fog.far = lerp(1500, 430, k); }
    st.wallIntro = Math.max(0.001, eOut(ss(4.6, 6.0, t)));
    W.booths.forEach((b, i) => { const k = Math.max(0.001, eOut(ss(5.4 + i * 0.06, 6.2 + i * 0.06, t))); b.group.scale.setScalar(k); });
    W.routeU.uProg.value = ss(6.0, 7.8, t);
    W.people.forEach(p => { p.g.visible = t > 6.6; });
    const ttl = root.querySelector('#f5ttl'); ttl.style.opacity = Math.min(ss(0.1, 0.7, t), 1 - ss(1.4, 2.0, t));
    // กล้อง: ดันเข้าเล็กน้อย → เครนขึ้นวนโค้งให้เห็นชั้นที่ลอยแยก → ลงสู่ภาพรวมชั้น 5
    const c = easeIO(ss(opt.fromCam ? 0 : 0.6, INTRO_END - 0.1, t)), s0 = STEPS[0];
    if (introCam.fov0 !== 45) { const f = lerp(introCam.fov0, 45, ss(0, 3, t)); if (Math.abs(camera.fov - f) > 1e-3) { camera.fov = f; camera.userData.wide = opt.fromCam ? ss(0, 3, t) : 1; camera.updateProjectionMatrix(); } }
    else if (opt.fromCam && camera.userData.wide < 1) { camera.userData.wide = ss(0, 3, t); camera.updateProjectionMatrix(); }
    const p1 = new THREE.Vector3(...s0.cam), t1 = new THREE.Vector3(...s0.tgt);
    const a0 = Math.atan2(introCam.p0.z, introCam.p0.x); let a1 = Math.atan2(p1.z, p1.x);
    while (a1 - a0 > Math.PI) a1 -= Math.PI * 2; while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
    const r0 = Math.hypot(introCam.p0.x, introCam.p0.z) * (1 - (opt.fromCam ? 0.25 : 0.12) * ss(0, opt.fromCam ? 2.2 : 1.2, t)), r1 = Math.hypot(p1.x, p1.z);
    const a = lerp(a0, a1, c) + (XRAY && st.xHolding ? 0.16 * Math.sin(Math.PI * Math.min(1, st.xHoldT / X_HOLD_LEN)) : 0), r = lerp(r0, r1, c), lift = Math.sin(Math.PI * Math.min(1, c * 1.15)) * 46;
    camera.position.set(Math.cos(a) * r, lerp(introCam.p0.y, p1.y, c) + lift, Math.sin(a) * r);
    const tgtUp = Math.sin(Math.PI * ss(1.6, 6.5, t)) * 18;
    controls.target.lerpVectors(introCam.t0, t1, easeIO(ss(1.6, INTRO_END - 0.1, t))); controls.target.y += tgtUp;
  }

  // ── จำลองคนเดิน
  function simPeople(dt, now) {
    st.simT += dt * st.speed;
    for (const p of W.people) {
      if (p.mode === 'walk') {
        const R = W.routes[p.br || 0], s = (p.s0 + st.simT * p.v) % (R.L + 6), atEnd = s > R.L;   // ครึ่งหนึ่งลงบันไดซ้าย อีกครึ่งลงบันไดขวา
        const r = R.at(Math.min(s, R.L)); const nx = -r.tz, nz = r.tx, px = r.x + nx * p.off, pz = r.z + nz * p.off;
        p.g.position.set(px, floorY(px, pz), pz); p.g.rotation.y = Math.atan2(r.tx, r.tz);
        p.g.visible = st.intro > 4.6 && !atEnd && s > 0.6 && !(st.walk && Math.hypot(p.g.position.x - camera.position.x, p.g.position.z - camera.position.z) < 2.0);
        const w = Math.sin((st.simT * p.v) * 7 + p.ph) * 0.45;
        p.legPivotL.rotation.x = w; p.legPivotR.rotation.x = -w; p.aL.rotation.x = -w * 0.7; p.aR.rotation.x = w * 0.7; p.body.position.y = Math.abs(Math.cos((st.simT * p.v) * 7 + p.ph)) * 0.03;
      } else if (p.mode === 'stand') { p.body.rotation.y = Math.sin(now / 1700 + p.ph) * 0.12; }
    }
  }

  // ── วนเรนเดอร์
  let last = performance.now();
  root.querySelector('#f5spd').parentElement.addEventListener('click', () => { st.speed = st.speed >= 4 ? 1 : st.speed * 2; root.querySelector('#f5spd').textContent = '×' + st.speed; });
  root.querySelector('.clock').style.cursor = 'pointer'; root.querySelector('.clock').title = 'ความเร็วจำลองคนเดิน';
  function frame(now) {
    if (!st.running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (st.introOn) {
      if (XRAY && !st.xDone) {
        if (!st.xHolding && st.intro + dt >= X_HOLD) { st.intro = X_HOLD; st.xHolding = true; st.xHoldT = 0; st.xUser = false; xp.classList.add('on'); }
        if (st.xHolding) { st.xHoldT += dt; if ((!st.xUser && st.xHoldT > X_HOLD_LEN) || (st.xUser && now - st.xLast > 9000)) xRelease(); }
        else st.intro += dt;
      } else st.intro += dt;
      applyIntro(st.intro); camera.lookAt(controls.target); if (st.intro >= INTRO_END) { st.introOn = false; applyIntro(INTRO_END + 1); if (st.bigShadow) { st.bigShadow = false; shadowBox(false); } root.classList.remove('intro'); goStep(0, true); } }
    else if (st.walk) walkStep(dt);
    else { tweenStep(dt); controls.update(); }
    updateZones(dt);
    W.routeU.uTime.value = now / 1000;
    simPeople(dt, now);
    const mins = 30 + Math.floor(st.simT / 6); root.querySelector('#f5clk').textContent = '08:' + String(Math.min(59, mins)).padStart(2, '0');
    if (!st.introOn && !st.perfDone) { st.perfN = (st.perfN || 0) + 1; st.perfT = (st.perfT || 0) + (now - (st.perfL || now)); st.perfL = now;
      if (st.perfN > 90) { st.perfDone = true; if (st.perfT / st.perfN > 40 && (ctx.gtao || renderer.getPixelRatio() > 1)) { st.aoOff = true; if (ctx.gtao) ctx.gtao.enabled = false; renderer.setPixelRatio(1); ctx.composer.setPixelRatio(1); resize(); console.info('[F5] เครื่องช้า: ปิด AO และลดความละเอียด'); } } }
    if (MOBILE) { st.shN = (st.shN || 0) + 1; if (st.shN % (st.introOn ? 2 : 5) === 1) renderer.shadowMap.needsUpdate = true; }
    if (ctx.composer) ctx.composer.render(); else renderer.render(scene, camera);
    placeLabels();
    st.raf = requestAnimationFrame(frame);
  }
  if (opt.at != null) { st.intro = INTRO_END + 0.4; }
  requestAnimationFrame(() => root.classList.add('on'));
  st.raf = requestAnimationFrame(frame);
  st.goStep = goStep; st.selectBooth = selectBooth; st.act = act;
  window.__f5 = st; st.camera = camera; st.controls = controls; st.THREE = THREE;
  return true;
}

function stop(silent) {
  const st = S; if (!st) return; S = null;
  st.running = false; cancelAnimationFrame(st.raf);
  removeEventListener('resize', st.resize); removeEventListener('keydown', st.onKey);
  const fin = () => { try { st.ctx.renderer.dispose(); st.ctx.renderer.forceContextLoss && st.ctx.renderer.forceContextLoss(); } catch (e) {} st.root.remove(); };
  if (silent) fin(); else { st.root.classList.remove('on'); setTimeout(fin, 700); }
  if (st.opt.onDone && !silent) try { st.opt.onDone({}); } catch (e) {}
}

window.MWA_FLOOR5 = { play, stop, prepare, isOn: () => !!S, mobile: MOBILE };
window.dispatchEvent(new Event('mwa-floor5-ready'));
