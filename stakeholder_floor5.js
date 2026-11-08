/* ═══════════════════════════════════════════════════════════════════════════
   stakeholder_floor5.js — Stakeholder Day · ชั้น 5 อาคารสำนักงานใหญ่ กปน.
   ─ ฉาก 3 มิติคุณภาพสูง (three.js r160 + GTAO) แยกจากแผนที่: อาคารสุทธิอุทกากร 12 ชั้น แยกชั้น → ชั้น 5
   ─ ผังตามภาพร่าง (14 px ≈ 1 ม.) · บูธ 2 × 1 ม. ชิดผนัง · ทัวร์ทีละส่วน (ส่วนอื่นจางลง)
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

// ───────────────────────────── ข้อมูลผัง ─────────────────────────────
const PXM = 14, OX = 1082, OY = 547;                       // ภาพร่าง: 14 px ≈ 1 ม. · จุดกลางชั้น
const X = px => (px - OX) / PXM, Z = py => (py - OY) / PXM;
const FX0 = X(600), FX1 = X(1565), FZ0 = Z(185), FZ1 = Z(910); // ขอบชั้น ≈ 69 × 52 ม.
const FW = FX1 - FX0, FD = FZ1 - FZ0;
const FH = 4.2, NF = 12, F5 = 4;                           // ความสูงชั้น · 12 ชั้น · ชั้น 5 (index 4)
const WALL_H = 3.0, AUD_H = 4.4, WT = 0.16;

const ROUTE_PX = [[843, 893], [800, 893], [800, 742], [912, 742], [912, 388], [1088, 388], [1088, 282], [1310, 282], [1310, 470]];

const MWA_BOOTHS = [
  { name: 'TWQ Online', sub: 'ระบบตรวจสอบคุณภาพน้ำประปาออนไลน์', prop: 'cabinet' },
  { name: 'Chlorine Care', sub: 'ระบบเติมคลอรีนอัตโนมัติ', prop: 'dosing' },
  { name: 'คลินิกน้ำสะอาด', sub: 'การประปานครหลวง', prop: 'bottles' },
  { name: 'Water Safety Plan', sub: 'แผนน้ำประปาปลอดภัย', prop: 'screen' },
  { name: 'วารีกุญชร', sub: 'การประปานครหลวง', prop: 'screen' },
  { name: 'บูธ กปน. 06', sub: 'รอกำหนดหัวข้อ', prop: 'screen', tbc: true },
  { name: 'บูธ กปน. 07', sub: 'รอกำหนดหัวข้อ', prop: 'screen', tbc: true },
];
const PARTNERS = [
  { name: 'Yokogawa', sub: 'เครื่องมือวัดและระบบควบคุม', prop: 'analyzer', col: '#2463b8' },
  { name: 'Petroinstrument', sub: 'บริษัทพันธมิตร', prop: 'analyzer', col: '#0d8a7a' },
  { name: 'ProMinent', sub: 'ปั๊มจ่ายสารเคมี', prop: 'pump', col: '#1f6f4a' },
  { name: 'DKD', sub: 'บริษัทพันธมิตร', prop: 'screen', col: '#7a4bc4' },
  { name: 'UHM', sub: 'บริษัทพันธมิตร', prop: 'screen', col: '#c4602b' },
  { name: 'GF', sub: 'ระบบท่อและวาล์ว', prop: 'pipe', col: '#2b4c7e' },
  { name: 'IWAKI', sub: 'ปั๊มเคมี', prop: 'pump', col: '#c23b3b' },
  { name: 'HACH', sub: 'เครื่องวิเคราะห์คุณภาพน้ำ', prop: 'analyzer', col: '#1b7fc4' },
  { name: 'พันธมิตร 09', sub: 'รอยืนยัน', prop: 'screen', col: '#5d6b7a', tbc: true },
  { name: 'พันธมิตร 10', sub: 'รอยืนยัน', prop: 'screen', col: '#5d6b7a', tbc: true },
  { name: 'พันธมิตร 11', sub: 'รอยืนยัน', prop: 'screen', col: '#5d6b7a', tbc: true },
  { name: 'พันธมิตร 12', sub: 'รอยืนยัน', prop: 'screen', col: '#5d6b7a', tbc: true },
];
const MWA_COL = ['#1d5fc0', '#0f8fb8', '#14a39a', '#2a6fdb', '#3653c4', '#1d5fc0', '#1d5fc0'];

// ตำแหน่งบูธ (ม.) · face = ทิศหน้าบูธ e/w/n/s
function boothSlots() {
  const S = [];
  const xW = X(885) + WT / 2 + 0.5;                       // ผนังตะวันตกของทางเดิน กปน.
  [10.9, 6.65, 2.4, -1.85, -6.1].forEach((z, i) => S.push({ own: 'mwa', i, x: xW, z, face: 'e', zone: 'mwa' }));
  const zN = Z(432) - WT / 2 - 0.5;                       // หน้าผนัง Auditorium (ทางเดิน 5 ม.)
  [11.3, 21.6].forEach((x, k) => S.push({ own: 'mwa', i: 5 + k, x, z: zN, face: 'n', zone: 'audf' }));
  const zHN = Z(188) + WT / 2 + 0.5, zHS = Z(350) - WT / 2 - 0.5;
  for (let k = 0; k < 8; k++) S.push({ own: 'p', i: k, x: -5.55 + k * 3.75, z: zHN, face: 's', zone: 'hall' });
  [3.45, 6.7, 9.95, 13.2].forEach((x, k) => S.push({ own: 'p', i: 8 + k, x, z: zHS, face: 'n', zone: 'hall' }));
  return S;
}
const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };   // หมุนให้หน้าบูธ (แกน +z ของบูธ) ชี้ไปทิศนั้น
const FACEV = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

// ห้อง (พิกเซลภาพร่าง) · gaps = ประตู [จาก, ถึง] บนผนัง n/s/e/w
const ROOMS = [
  { id: 'dining', zone: 'dining', r: [855, 188, 970, 350], floor: 'wood', gaps: { s: [[895, 935]], e: [[188, 350]] } },
  { id: 'hall', zone: 'hall', r: [972, 188, 1390, 350], floor: 'carpet', gaps: { s: [[1068, 1108], [1290, 1330]] } },
  { id: 'elec', zone: 'other', r: [1397, 188, 1565, 350], floor: 'plain', gaps: { s: [[1460, 1500]] } },
  { id: 'aud', zone: 'aud', r: [1155, 435, 1520, 755], floor: 'aud', gaps: { n: [[1290, 1330]] }, h: AUD_H },
  { id: 'mr1', zone: 'other', r: [603, 463, 675, 522], floor: 'plain', gaps: { e: [[480, 505]] } },
  { id: 'mr2', zone: 'other', r: [603, 557, 675, 615], floor: 'plain', gaps: { e: [[575, 600]] } },
  { id: 'mr3', zone: 'other', r: [603, 648, 675, 707], floor: 'plain', gaps: { e: [[665, 690]] } },
  { id: 'mr4', zone: 'other', r: [623, 768, 725, 897], floor: 'plain', gaps: { e: [[790, 820]] } },
  { id: 'wc', zone: 'other', r: [977, 823, 1078, 908], floor: 'plain', gaps: { w: [[882, 906]] } },
];
const CLOSED = [                                           // พื้นที่ไม่ใช้จัดงาน (ทึบ)
  { r: [600, 185, 853, 452], t: 'พื้นที่สำนักงาน' }, { r: [942, 432, 1153, 761], t: 'พื้นที่สำนักงาน' },
  { r: [1080, 762, 1565, 910], t: 'พื้นที่สำนักงาน' }, { r: [1522, 352, 1565, 760], t: '' },
  { r: [727, 453, 885, 720], t: 'ส่วนบริการ', core: true }, { r: [727, 765, 768, 910], t: '' },
  { r: [600, 708, 676, 766], t: '' }, { r: [832, 765, 940, 786], t: '' }, { r: [600, 523, 602, 556], t: '' },
];
const EXTRA_WALLS = [[885, 352, 885, 453], [940, 787, 940, 882], [940, 882, 977, 882], [915, 908, 977, 908], [676, 522, 676, 557], [676, 615, 676, 648]];

const ZONES = {
  lobby: { name: 'โถงลิฟต์ · ลงทะเบียน', c: [X(800), Z(830)] },
  mwa: { name: 'ทางเดินนวัตกรรม กปน.', c: [X(912), Z(580)] },
  north: { name: 'ทางเดินหน้าห้องประชุม 5 ม.', c: [X(1000), Z(392)] },
  hall: { name: 'ห้องแสดง 1 · พันธมิตร', c: [X(1181), Z(269)] },
  dining: { name: 'ห้องรับประทานอาหาร', c: [X(912), Z(269)] },
  audf: { name: 'หน้าห้อง Auditorium', c: [X(1310), Z(400)] },
  aud: { name: 'ห้องประชุม Auditorium', c: [X(1337), Z(520)] },
};

// ───────────────────────────── ตัวช่วย ─────────────────────────────
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
let _seed = 7; const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const F_HEAD = '"Bai Jamjuree","Noto Sans Thai",sans-serif', F_BODY = '"IBM Plex Sans Thai","Noto Sans Thai",sans-serif';

function shade(hex, k) { const c = new THREE.Color(hex); if (k < 0) c.multiplyScalar(1 + k); else c.lerp(new THREE.Color('#fff'), k); return '#' + c.getHexString(); }
function fitText(g, txt, weight, size, family, maxW) { let s = size; g.font = `${weight} ${s}px ${family}`; while (g.measureText(txt).width > maxW && s > 12) { s -= 2; g.font = `${weight} ${s}px ${family}`; } return s; }
function canvasTex(c, aniso) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso || 8; return t; }

// ───────────────────────────── พื้นผิว ─────────────────────────────
function floorCanvas(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const base = { stone: '#dcd8d0', carpet: '#bdc8d2', aud: '#33414f', wood: '#cfae84', plain: '#e2e5e8' }[kind];
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
const TILE = { stone: 1.6, carpet: 2.0, aud: 2.0, wood: 2.4, plain: 2.0 };

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
#f5.on{opacity:1}
#f5 canvas.gl{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}
#f5 .card{background:rgba(255,255,255,.93);border:1px solid rgba(214,222,231,.9);border-radius:12px;box-shadow:0 8px 28px rgba(16,34,56,.12);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
#f5 .ui{position:absolute;transition:opacity .5s ease}
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
#f5 .kpi{padding:10px 14px 11px;min-width:150px;display:flex;gap:10px}
#f5 .kpi .ic{width:28px;height:28px;border-radius:8px;background:#e8f3ff;color:#1d5fc0;display:grid;place-items:center;flex:none;font-size:14px}
#f5 .kpi span{display:block;font-size:11.5px;color:#6b7a8c}
#f5 .kpi strong{display:block;font:700 23px/1.15 ${F_HEAD};font-variant-numeric:tabular-nums}
#f5 .kpi strong em{font:500 12px ${F_BODY};color:#6b7a8c;font-style:normal;margin-left:3px}
#f5 .kpi small{display:block;font-size:11px;color:#8a97a6;margin-top:1px}
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
  <div class="brand"><div class="logo">M</div><div><b>MWA · Stakeholder Day</b><small>ชั้น 5 อาคารสำนักงานใหญ่ · ผังการจัดงาน (ร่าง)</small></div></div>
  <div class="search"><span style="color:#8a97a6">⌕</span><input id="f5q" placeholder="ค้นหาบูธ บริษัท หรือโซน" aria-label="ค้นหาบูธ"></div>
  <div class="sp"></div>
  <div class="chip"><div class="dot">F5</div><div><b>ชั้น 5 · 19 บูธ</b><br>ทางเดิน 4–5 ม. · บูธ 2 × 1 ม.</div></div>
  <div class="clock"><i></i><span id="f5clk">08:30</span><span id="f5spd" style="font-weight:500;opacity:.8">×1</span></div>
  ${opt.onDone ? '<button class="btn" data-k="back" title="ย้อนกลับ (Esc)">⟵ กลับ</button>' : ''}
</div>
<div class="ui kpis hide-intro">
  <div class="kpi card"><div class="ic">▦</div><div><span>บูธทั้งหมด</span><strong>19<em>บูธ</em></strong><small>กปน. 7 · เอกชน 12</small></div></div>
  <div class="kpi card"><div class="ic">↝</div><div><span>เส้นทาง ลิฟต์ → ห้องประชุม</span><strong id="f5len">–<em>ม.</em></strong><small>ทางเดินกว้าง 4–5 ม.</small></div></div>
  <div class="kpi card"><div class="ic">◫</div><div><span>ที่นั่ง Auditorium (โดยประมาณ)</span><strong id="f5seat">–<em>ที่</em></strong><small>ที่นั่งขั้นบันได</small></div></div>
  <div class="kpi card"><div class="ic">◷</div><div><span>เวลาเดินชม (ประมาณ)</span><strong>25<em>นาที</em></strong><small>แวะบูธละ ~1 นาที</small></div></div>
</div>
<div class="ui tools card hide-intro">
  <button data-k="zin" title="ซูมเข้า">＋</button><button data-k="zout" title="ซูมออก">－</button><hr>
  <button data-k="home" title="ภาพรวม">⌂</button><button data-k="top" title="มุมบน (ผัง)">▦</button><button data-k="spin" title="หมุนรอบ">⟳</button><hr>
  <button data-k="explode" title="ดูการแยกชั้นอีกครั้ง">⧉</button><button data-k="fs" title="เต็มจอ">⛶</button>
</div>
<div class="ui detail card" id="f5det"></div>
<div class="ui list card hide-intro">
  <div class="tabs"><button data-tab="mwa" class="on">บูธ กปน.<sup>7</sup></button><button data-tab="p">เอกชน<sup>12</sup></button><button data-tab="zone">โซน<sup>7</sup></button><span class="r">เรียงตามเส้นทาง</span></div>
  <div class="items" id="f5items"></div>
</div>
<div class="ui journey card hide-intro">
  <div class="jh">↝ เส้นทางผู้เข้าร่วม<small>ลิฟต์ → Auditorium</small></div>
  <div class="steps" id="f5steps"><div class="fill"></div></div>
  <div class="tour"><div class="n" id="f5n">1 / 10</div><div class="tx"><h4 id="f5t"></h4><p id="f5d"></p></div>
    <div class="ctl"><button class="btn" data-k="prev" title="ก่อนหน้า (←)">◀</button><button class="btn" data-k="next" title="ถัดไป (→)">▶</button><button class="btn" data-k="auto" id="f5auto" title="นำชมอัตโนมัติ">▶ นำชม</button></div></div>
</div>
<div class="ttl" id="f5ttl"><h1>Stakeholder Day</h1><p>การประปานครหลวง · ชั้น 5 อาคารสำนักงานใหญ่</p><div class="ln"></div></div>
<button class="ui btn skip" data-k="skip">ข้าม ▸</button>
<div id="f5lbl"></div>
<div class="credit">ภาพจำลองแนวคิด · ขนาดโดยประมาณจากผังร่าง</div>`;
  document.body.appendChild(root);
  return root;
}

function makeScene(root, opt) {
  const canvas = root.querySelector('canvas.gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opt.capture });
  const DPR = Math.min(window.devicePixelRatio || 1, opt.dpr || 2);
  renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  { const c = document.createElement('canvas'); c.width = 4; c.height = 512; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, '#b9d1e6'); gr.addColorStop(0.55, '#d6e2ec'); gr.addColorStop(1, '#e3e9ee'); g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }       // ฟ้าไล่สี
  scene.fog = new THREE.Fog('#dfe5eb', 170, 430);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.42;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 1200);

  const hemi = new THREE.HemisphereLight('#f4f8ff', '#a9a49a', 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6ea', 2.0);
  sun.position.set(-38, 70, 30); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 40, bottom: -40, near: 10, far: 220 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 4; controls.maxDistance = 260;
  controls.screenSpacePanning = false;

  // หลังประมวลผล
  let composer = null, gtao = null;
  const useAO = opt.ao !== false;
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
  return { renderer, scene, camera, controls, sun, hemi, setupComposer, get composer() { return composer; }, get gtao() { return gtao; }, DPR };
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

function buildWorld(ctx) {
  const { scene } = ctx;
  const ZM = zoneMats();
  const world = new THREE.Group(); scene.add(world);
  const interior = new THREE.Group(); world.add(interior);       // ชั้น 5 (พื้นอยู่ที่ y = 0)
  const zoneGroups = {}; const zg = z => zoneGroups[z] || (zoneGroups[z] = (() => { const g = new THREE.Group(); g.name = z; interior.add(g); return g; })());
  const M = {
    white: new THREE.MeshStandardMaterial({ color: '#f7f8f9', roughness: 0.82 }),
    wall: new THREE.MeshStandardMaterial({ color: '#f6f7f8', roughness: 0.85 }),
    cap: new THREE.MeshStandardMaterial({ color: '#c3ccd6', roughness: 0.9 }),
    closed: new THREE.MeshStandardMaterial({ color: '#d3d9df', roughness: 0.95 }),
    closedTop: new THREE.MeshStandardMaterial({ color: '#bfc8d1', roughness: 0.95 }),
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
  const add = (zone, geo, mat, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(geo, Array.isArray(mat) ? mat.map(q => ZM.m(zone, q)) : ZM.m(zone, mat));
    m.position.set(x, y, z); if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = opts.cast !== false; m.receiveShadow = true; (opts.parent || zg(zone)).add(m); return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  // ── พื้นฐานชั้น + พื้นทางเดิน (หินขัด)
  const stoneT = floorCanvas('stone'); stoneT.repeat.set(FW / TILE.stone, FD / TILE.stone);
  const slabTop = new THREE.MeshStandardMaterial({ map: stoneT, roughness: 0.38, metalness: 0.0 });
  add('base', box(FW, 0.6, FD), [M.white, M.white, slabTop, M.white, M.white, M.white], (FX0 + FX1) / 2, -0.3, (FZ0 + FZ1) / 2, { cast: false });
  // ── พื้นห้อง
  const floorMats = {};
  for (const r of ROOMS) {
    const [a, b, c, d] = r.r, w = X(c) - X(a), dd = Z(d) - Z(b);
    const t = floorCanvas(r.floor); t.repeat.set(w / TILE[r.floor], dd / TILE[r.floor]);
    const fm = new THREE.MeshStandardMaterial({ map: t, roughness: r.floor === 'wood' ? 0.55 : 0.92 });
    floorMats[r.id] = fm;
    add(r.zone, box(w, 0.04, dd), fm, (X(a) + X(c)) / 2, 0.02, (Z(b) + Z(d)) / 2, { cast: false });
  }
  // ── ผนัง
  const wallMat = [M.wall, M.wall, M.cap, M.wall, M.wall, M.wall];
  function wall(x0, y0, x1, y1, h, zone) {
    const ax = X(x0), az = Z(y0), bx = X(x1), bz = Z(y1), len = Math.hypot(bx - ax, bz - az); if (len < 0.05) return;
    const m = add(zone, box(len + WT, h, WT), wallMat, (ax + bx) / 2, h / 2, (az + bz) / 2);
    m.rotation.y = -Math.atan2(bz - az, bx - ax); markWall(m, zone, h); return m;
  }
  const walls = [];
  function markWall(m, zone, h) { m.userData.wall = true; m.userData.zone = zone; m.userData.h = h; m.userData.k = 1; [].concat(m.material).forEach(q => { q.userData.noFade = true; }); }
  function rectWalls(r, gaps, h, zone) {
    const [x0, y0, x1, y1] = r;
    const side = (a, b, fixed, horiz, gs = []) => { let cur = a; [...gs, [b, b]].sort((p, q) => p[0] - q[0]).forEach(([g0, g1]) => { if (g0 > cur) walls.push(horiz ? wall(cur, fixed, g0, fixed, h, zone) : wall(fixed, cur, fixed, g0, h, zone)); cur = Math.max(cur, g1); }); };
    side(x0, x1, y0, true, gaps.n); side(x0, x1, y1, true, gaps.s); side(y0, y1, x0, false, gaps.w); side(y0, y1, x1, false, gaps.e);
  }
  for (const r of ROOMS) rectWalls(r.r, r.gaps || {}, r.h || WALL_H, r.zone);
  EXTRA_WALLS.forEach(s => walls.push(wall(...s, WALL_H, 'other')));
  // ── พื้นที่ทึบ + ตัวอักษรบนหลังคาก้อน
  for (const cb of CLOSED) {
    const [a, b, c, d] = cb.r, w = X(c) - X(a), dd = Z(d) - Z(b), h = cb.core ? WALL_H + 0.2 : WALL_H;
    const m = add('other', box(w, h, dd), [M.closed, M.closed, M.closedTop, M.closed, M.closed, M.closed], (X(a) + X(c)) / 2, h / 2, (Z(b) + Z(d)) / 2);
    markWall(m, 'other', h); walls.push(m);
    if (cb.t && w > 6 && dd > 6) {
      const c2 = document.createElement('canvas'); c2.width = 1024; c2.height = 256; const g = c2.getContext('2d');
      g.fillStyle = 'rgba(70,86,102,.6)'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, cb.t, 600, 120, F_HEAD, 980); g.fillText(cb.t, 512, 128);
      const tw = Math.min(w * 0.8, 14), mat = ZM.reg('other', new THREE.MeshBasicMaterial({ map: canvasTex(c2), transparent: true, depthWrite: false }));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw / 4), mat); p.rotation.x = -Math.PI / 2; p.position.set((X(a) + X(c)) / 2, h + 0.02, (Z(b) + Z(d)) / 2); zg('other').add(p); m.userData.label = p;
    }
  }
  // ── กระจกรอบชั้น + เสากระจก
  const GH = 3.4;
  [[FX0, FZ0, FX1, FZ0], [FX0, FZ1, FX1, FZ1], [FX0, FZ0, FX0, FZ1], [FX1, FZ0, FX1, FZ1]].forEach(([ax, az, bx, bz]) => {
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
  // ── ลงทะเบียน (ชิดผนังตะวันตกของทางเดินลิฟต์)
  {
    const x = X(770) + WT / 2 + 0.45, z = Z(818);
    add('lobby', new RoundedBoxGeometry(0.62, 1.05, 3.6, 3, 0.06), M.white, x, 0.525, z);
    const ft = ZM.reg('lobby', new THREE.MeshStandardMaterial({ map: signCanvas([['ลงทะเบียน', 700, 150, 120], ['Registration · รับ Water Passport', 500, 70, 230, 'rgba(255,255,255,.85)', F_BODY]], '#1d5fc0', '#fff', 1200, 330), roughness: 0.5 }));
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.94), ft); p.position.set(x + 0.315, 0.53, z); p.rotation.y = Math.PI / 2; zg('lobby').add(p);
    add('lobby', box(0.7, 0.05, 3.7), M.wood, x, 1.07, z);
    // ป้ายตั้ง
    const st = ZM.reg('lobby', new THREE.MeshStandardMaterial({ map: signCanvas([['ยินดีต้อนรับ', 700, 120, 110], ['Stakeholder Day', 600, 96, 230], ['เดินตามเส้นน้ำบนพื้น ↗', 500, 64, 340, '#bfe9ff', F_BODY]], '#0a2f66', '#fff', 760, 420), roughness: 0.6 }));
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.47), st); sp.position.set(X(800) + 1.2, 1.55, Z(870)); sp.rotation.y = -Math.PI / 2 - 0.5; sp.castShadow = true; zg('lobby').add(sp);
    add('lobby', box(0.04, 1.4, 0.04), M.alu, X(800) + 1.2, 0.7, Z(870));
  }
  // ── ฉากถ่ายรูป "เส้นทางน้ำ" ที่ผนังใต้ของส่วนบริการ (หันใต้ ตรงหัวมุมทางเดิน)
  {
    const w = 4.6, x = X(780), z = Z(720) + 0.06;
    const mat = ZM.reg('lobby', new THREE.MeshStandardMaterial({ map: backdropTex(), roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0.12, emissiveMap: null }));
    mat.emissiveMap = mat.map;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.625), mat); p.position.set(x, 1.55, z); zg('lobby').add(p);
    add('lobby', box(w + 0.1, 0.06, 0.6), M.white, x, 0.03, z + 0.4, { cast: false });
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
  slots.forEach((sl, idx) => {
    const src = sl.own === 'mwa' ? MWA_BOOTHS[sl.i] : PARTNERS[sl.i];
    const b = Object.assign({}, src, sl, { code: sl.own === 'mwa' ? 'M' + String(sl.i + 1).padStart(2, '0') : 'P' + String(sl.i + 1).padStart(2, '0'), col: sl.own === 'mwa' ? MWA_COL[sl.i] : src.col });
    const zone = sl.zone;
    const g = new THREE.Group(); g.position.set(sl.x, 0, sl.z); g.rotation.y = FACE[sl.face]; zg(zone).add(g);
    const inner = new THREE.Group(); g.add(inner);
    const A = (geo, mat, x, y, z, o = {}) => add(zone, geo, mat, x, y, z, Object.assign({ parent: inner }, o));
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
    A(new RoundedBoxGeometry(1.0, 0.98, 0.42, 3, 0.04), M.white, 0.42, 0.49, 0.18);
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.9), cm); cp.position.set(0.42, 0.48, 0.392); inner.add(cp);
    const topMat = pMat[b.col] || (pMat[b.col] = new THREE.MeshStandardMaterial({ color: b.col, roughness: 0.35 }));
    A(new RoundedBoxGeometry(1.06, 0.04, 0.48, 2, 0.015), topMat, 0.42, 1.0, 0.18);
    // อุปกรณ์จัดแสดง
    prop(b.prop, A, propMat, M, b);
    const hit = new THREE.Mesh(box(2.1, 2.6, 1.3), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 1.3, 0); hit.userData.booth = b; inner.add(hit);
    b.group = g; b.inner = inner; b.hit = hit; b.zone = zone;
    booths.push(b);
  });
  function prop(kind, A, P, M) {
    if (kind === 'cabinet') {                       // ตู้ตรวจวัด + จอแสดงค่า
      A(box(0.62, 1.55, 0.42), P.white, -0.55, 0.8, -0.12); A(box(0.66, 0.06, 0.46), P.steel, -0.55, 1.6, -0.12);
      A(box(0.4, 0.28, 0.02), P.screenOn, -0.55, 1.15, 0.095, { cast: false }); A(box(0.05, 0.6, 0.05), P.blue, -0.75, 0.4, 0.12);
    } else if (kind === 'dosing') {                 // ถังเคมี + ปั๊ม
      A(new THREE.CylinderGeometry(0.26, 0.26, 0.9, 28), P.white, -0.6, 0.45, -0.05); A(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 28), P.blue, -0.6, 0.92, -0.05);
      A(new RoundedBoxGeometry(0.22, 0.2, 0.18, 2, 0.03), P.blue, -0.6, 1.05, -0.05); A(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), P.pvc, -0.36, 0.7, -0.05);
    } else if (kind === 'bottles') {                // โต๊ะน้ำดื่ม + ขวด
      A(box(0.6, 0.78, 0.4), P.white, -0.55, 0.39, 0.1);
      for (let i = 0; i < 6; i++) A(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 14), P.bottle, -0.75 + (i % 3) * 0.2, 0.9, 0.0 + Math.floor(i / 3) * 0.16, { cast: false });
      A(new THREE.CylinderGeometry(0.16, 0.16, 0.32, 20), P.bottle, -0.55, 1.24, -0.1, { cast: false });
    } else if (kind === 'analyzer') {               // แผงเครื่องวิเคราะห์ติดผนัง
      A(box(0.8, 1.0, 0.12), P.white, -0.5, 1.25, -0.33); A(box(0.26, 0.2, 0.02), P.screenOn, -0.62, 1.48, -0.26, { cast: false });
      A(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 14), P.bottle, -0.3, 1.1, -0.24, { cast: false }); A(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8), P.pvc, -0.75, 0.5, -0.3);
      A(box(0.5, 0.75, 0.35), P.white, -0.5, 0.375, 0.05);
    } else if (kind === 'pump') {                   // ปั๊มบนแท่น
      A(box(0.6, 0.62, 0.45), P.white, -0.55, 0.31, 0.05);
      A(new RoundedBoxGeometry(0.34, 0.24, 0.2, 2, 0.04), P.blue, -0.55, 0.76, 0.05); A(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 18), P.steel, -0.34, 0.76, 0.05, { ry: 0 });
      A(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 20), P.steel, -0.55, 0.96, 0.05);
    } else if (kind === 'pipe') {                   // ชุดท่อ + วาล์ว
      A(box(0.6, 0.55, 0.45), P.white, -0.55, 0.275, 0.05);
      const pg = new THREE.CylinderGeometry(0.055, 0.055, 1.0, 18);
      const p1 = A(pg, P.pvc, -0.55, 0.75, 0.05); p1.rotation.z = Math.PI / 2;
      A(new THREE.CylinderGeometry(0.055, 0.055, 0.8, 18), P.pvc, -0.95, 1.1, 0.05);
      A(new RoundedBoxGeometry(0.16, 0.16, 0.16, 2, 0.03), P.blue, -0.55, 0.75, 0.05); A(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16), P.blue, -0.55, 0.9, 0.05);
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
  [[X(1181) - 3, Z(269)], [X(1181) + 3, Z(269)]].forEach(([x, z]) => {
    add('hall', new THREE.CylinderGeometry(0.04, 0.04, 1.05, 10), M.alu, x, 0.525, z);
    add('hall', new THREE.CylinderGeometry(0.4, 0.4, 0.04, 26), M.white, x, 1.07, z);
    add('hall', new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), M.alu, x, 0.01, z, { cast: false });
  });
  // ── ต้นไม้กระถาง
  [[X(905), Z(440)], [X(1440), Z(392)], [X(1500), Z(392)], [X(780), Z(745)], [X(1150), Z(395)]].forEach(([x, z]) => {
    add('other', new THREE.CylinderGeometry(0.28, 0.22, 0.5, 20), M.pot, x, 0.25, z);
    add('other', new THREE.IcosahedronGeometry(0.5, 2), M.plant, x, 1.05, z);
  });

  // ── Auditorium: ขั้นบันได + ที่นั่ง + เวที + จอ
  const seats = [];
  {
    const ax0 = X(1155), ax1 = X(1520), az0 = Z(435), az1 = Z(755);
    const rows = 13, rowD = 1.05, z0 = az0 + 1.4, aisle = X(1310), stageZ = az1 - 3.4;
    const seatG = new RoundedBoxGeometry(0.5, 0.42, 0.5, 2, 0.06), backG = new RoundedBoxGeometry(0.5, 0.55, 0.08, 2, 0.03);
    const pos = [];
    for (let r = 0; r < rows; r++) {
      const z = z0 + r * rowD, y = (rows - 1 - r) * 0.17;
      if (y > 0) add('aud', box(ax1 - ax0 - 0.4, y, rowD), M.tier, (ax0 + ax1) / 2, y / 2, z, { cast: false });
      for (let x = ax0 + 1.3; x < ax1 - 1.1; x += 0.58) { if (Math.abs(x - aisle) < 0.85) continue; pos.push([x, y, z]); }
    }
    const sm = ZM.m('aud', M.seat), bm = ZM.m('aud', M.seatBack);
    const im = new THREE.InstancedMesh(seatG, sm, pos.length), ib = new THREE.InstancedMesh(backG, bm, pos.length);
    const m4 = new THREE.Matrix4();
    pos.forEach(([x, y, z], i) => { m4.makeTranslation(x, y + 0.42, z); im.setMatrixAt(i, m4); m4.makeTranslation(x, y + 0.78, z - 0.24); ib.setMatrixAt(i, m4); seats.push([x, y, z]); });
    im.castShadow = ib.castShadow = true; im.receiveShadow = ib.receiveShadow = true; zg('aud').add(im, ib);
    add('aud', box(ax1 - ax0 - 0.4, 0.8, az1 - stageZ - 0.2), M.stage, (ax0 + ax1) / 2, 0.4, (stageZ + az1) / 2 - 0.1);
    const sm2 = ZM.reg('aud', new THREE.MeshStandardMaterial({ map: screenTex('Stakeholder Day', 'การประปานครหลวง · เส้นทางน้ำ'), emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.4 }));
    sm2.emissiveMap = sm2.map;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 3.0), sm2); scr.position.set((ax0 + ax1) / 2, 2.55, az1 - 0.12); scr.rotation.y = Math.PI; zg('aud').add(scr);
    add('aud', box(10.8, 3.3, 0.1), M.dark, (ax0 + ax1) / 2, 2.55, az1 - 0.06);
    add('aud', new RoundedBoxGeometry(0.7, 1.15, 0.5, 2, 0.05), M.wood, (ax0 + ax1) / 2 + 6.5, 1.37, stageZ + 1.2);   // แท่นพูด
    // ระแนงไม้ผนังข้าง
    for (let k = 0; k < 18; k++) { const z = az0 + 1 + k * ((az1 - az0 - 2) / 17); add('aud', box(0.06, AUD_H - 0.4, 0.12), M.wood, ax0 + 0.14, AUD_H / 2, z, { cast: false }); add('aud', box(0.06, AUD_H - 0.4, 0.12), M.wood, ax1 - 0.14, AUD_H / 2, z, { cast: false }); }
  }

  // ── เส้นทางน้ำบนพื้น (ribbon + chevron)
  const pts = ROUTE_PX.map(([x, y]) => new THREE.Vector2(X(x), Z(y)));
  const path = roundedPath(pts, 1.1);
  let L = 0; const cum = [0]; for (let i = 1; i < path.length; i++) { L += path[i].distanceTo(path[i - 1]); cum.push(L); }
  const routeU = { uTime: { value: 0 }, uProg: { value: 0 }, uLen: { value: L }, uA: { value: new THREE.Color('#7f9a52') }, uB: { value: new THREE.Color('#14b8d6') }, uC: { value: new THREE.Color('#3f8cff') }, uOp: { value: 1 } };
  const mkRibbon = (w, y, frag) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i], q = path[Math.min(i + 1, path.length - 1)], o = path[Math.max(i - 1, 0)];
      const t = new THREE.Vector2(q.x - o.x, q.y - o.y).normalize(), n = new THREE.Vector2(-t.y, t.x).multiplyScalar(w / 2);
      pos.push(p.x + n.x, y, p.y + n.y, p.x - n.x, y, p.y - n.y); uv.push(cum[i], 0, cum[i], 1);
      if (i < path.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ uniforms: routeU, transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: frag });
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 3; interior.add(m); return m;
  };
  const FR_HEAD = 'uniform float uTime,uProg,uLen,uOp; uniform vec3 uA,uB,uC; varying vec2 vUv;' +
    'vec3 grad(float u){ float t=u/uLen; return t<0.5? mix(uA,uB,t*2.0) : mix(uB,uC,(t-0.5)*2.0); }';
  mkRibbon(2.1, 0.03, FR_HEAD + 'void main(){ if(vUv.x>uProg*uLen) discard; float e=1.0-abs(vUv.y-0.5)*2.0; gl_FragColor=vec4(grad(vUv.x), pow(e,2.2)*0.22*uOp); }');
  mkRibbon(0.62, 0.045, FR_HEAD + 'void main(){ if(vUv.x>uProg*uLen) discard; vec3 c=grad(vUv.x); float v=abs(vUv.y-0.5);' +
    'float s=fract((vUv.x-uTime*1.3)/1.4); float d=s-v*0.9; float ch=smoothstep(0.0,0.05,d)*(1.0-smoothstep(0.22,0.27,d));' +
    'float edge=smoothstep(0.5,0.42,v); vec3 col=mix(c*1.05,vec3(1.0),ch*0.85); float tip=1.0-smoothstep(uProg*uLen-1.5,uProg*uLen,vUv.x)*0.0;' +
    'gl_FragColor=vec4(col,edge*0.95*uOp*tip); }');
  const routeAt = s => { s = clamp(s, 0, L); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); const a = path[i - 1], b = path[i]; return { x: lerp(a.x, b.x, u), z: lerp(a.y, b.y, u), tx: (b.x - a.x) / (cum[i] - cum[i - 1] || 1), tz: (b.y - a.y) / (cum[i] - cum[i - 1] || 1) }; };
  // ลำดับบูธตามเส้นทาง
  booths.forEach(b => { let best = 1e9, bs = 0; for (let s = 0; s <= L; s += 0.25) { const p = routeAt(s), d = Math.hypot(p.x - b.x, p.z - b.z); if (d < best) { best = d; bs = s; } } b.along = bs; });
  booths.sort((a, b) => a.along - b.along); booths.forEach((b, i) => { b.order = i + 1; });

  // ── อาคารสุทธิอุทกากร 12 ชั้น (ตอนเปิดฉาก) — โมเดลเดียวกับฉากแผนที่ (stakeholder_building.js)
  //    แกนผัง: X = ทิศเหนือ, Z = ทิศตะวันออก · ฝั่งถนน/คลองประปาอยู่ทาง Z ติดลบ
  const SB = window.SUTHI.build(THREE, { W: FD, D: FW, perLevel: true, fadeable: true, shadows: true, srgb: true, env: true });
  SB.grp.rotation.y = -Math.PI / 2; SB.grp.position.set((FX0 + FX1) / 2, -F5 * FH, (FZ0 + FZ1) / 2);
  world.add(SB.grp);
  const floors = SB.levels.map(L => L.f === F5 ? null : { g: L.g, f: L.f, mats: L.mats, edgeM: L.edgeM });
  const f5shell = SB.levels[F5];                       // ผนังนอกชั้น 5 ตอนเปิดฉาก — จางหายตอนแยกชั้น
  const oldBldg = SB.extras;                           // อาคารเดิม (ปลายสะพาน)

  // ── พื้นดิน + ต้นไม้
  const gy = -F5 * FH;
  const gc = document.createElement('canvas'); gc.width = gc.height = 1024; { const g = gc.getContext('2d'); const gr = g.createRadialGradient(512, 512, 60, 512, 512, 512); gr.addColorStop(0, '#c9d3c4'); gr.addColorStop(0.55, '#d3dbd2'); gr.addColorStop(1, '#dfe5eb'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(120,135,150,.10)'; g.lineWidth = 1; for (let i = 0; i <= 1024; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(1024, i); g.stroke(); } }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ map: canvasTex(gc), roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = gy; ground.receiveShadow = true; world.add(ground);
  {
    const plaza = new THREE.Mesh(box(100, 0.12, 78), new THREE.MeshStandardMaterial({ color: '#d9d8d2', roughness: 0.9 })); plaza.position.set(0, gy + 0.06, 3); plaza.receiveShadow = true; world.add(plaza);
    // ถนนหน้าอาคาร + คลองประปา (ฝั่งตะวันตก) ตามแนวจริง
    const strip = (z0, z1, y, h, col, rough, met) => { const m = new THREE.Mesh(box(520, h, z1 - z0), new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: met || 0 })); m.position.set(0, gy + y + h / 2, (z0 + z1) / 2); m.receiveShadow = true; world.add(m); return m; };
    strip(-46, -38, 0, 0.1, '#8d939a', 0.95); strip(-75, -65, 0, 0.1, '#8d939a', 0.95);
    strip(-48.2, -46, 0, 0.16, '#d4d6d2', 0.9); strip(-65, -62.8, 0, 0.16, '#d4d6d2', 0.9);
    strip(-62.8, -48.2, -1.0, 0.95, '#5b93b8', 0.1, 0.15);
    { const dash = new THREE.InstancedMesh(box(3, 0.02, 0.18), new THREE.MeshBasicMaterial({ color: '#f4f4ef' }), 160), m4d = new THREE.Matrix4(); let n = 0;
      for (const z of [-42, -70]) for (let x = -250; x < 250 && n < 160; x += 6.5) { m4d.makeTranslation(x, gy + 0.11, z); dash.setMatrixAt(n++, m4d); } dash.count = n; world.add(dash); }
    const tp0 = []; for (let i = 0; i < 110; i++) { const a = rnd() * Math.PI * 2, r = 58 + rnd() * 80; tp0.push([Math.cos(a) * r, Math.sin(a) * r * 0.85]); }
    for (let x = FX0 - 10; x <= FX1 + 10; x += 7) tp0.push([x, FZ1 + 11]);
    for (let x = -150; x <= 150; x += 8.5) { tp0.push([x + rnd() * 2, -35.2]); tp0.push([x + rnd() * 2, -77.6]); }       // ต้นไม้ริมถนน/ริมคลอง
    const clear = [[-114, -50, -28, 24], [-43, -18, 21, 40], [-56, -34, -24, -8]];        // อาคารเดิม · อาคารโค้ง · ใต้สะพาน
    const tp = tp0.filter(([x, z]) => !(z < -36 && z > -76) && !clear.some(([x0, x1, z0, z1]) => x > x0 - 3 && x < x1 + 3 && z > z0 - 3 && z < z1 + 3));
    const cr = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), tp.length);
    const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 1, 8), new THREE.MeshStandardMaterial({ color: '#7a6a58', roughness: 0.9 }), tp.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    tp.forEach(([x, z], i) => { const s = 2.6 + rnd() * 2.2; m4.compose(new THREE.Vector3(x, gy + 2.6 + s * 0.9, z), q, new THREE.Vector3(s, s * 0.9, s)); cr.setMatrixAt(i, m4); col.setHSL(0.27 + rnd() * 0.06, 0.38 + rnd() * 0.14, 0.30 + rnd() * 0.08); cr.setColorAt(i, col);
      m4.compose(new THREE.Vector3(x, gy + 1.4, z), q, new THREE.Vector3(1, 2.8, 1)); tr.setMatrixAt(i, m4); });
    cr.castShadow = true; world.add(cr, tr);
  }

  // ── ผู้เข้าร่วม
  const people = makePeople(interior, booths, seats, routeAt, L);

  return { world, interior, ZM, zoneGroups, booths, walls, floors, f5shell, oldBldg, SB, routeU, routeAt, L, seats, people, gy };
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
  const shirts = ['#f3f5f7', '#2b3a4c', '#8fbfe6', '#e9e2d6', '#3c4d63', '#ffffff', '#5e86b8', '#d9dee4', '#1f2b38', '#b9c7d4'];
  const pants = ['#1f2732', '#2c3440', '#3b4655', '#d6d0c4', '#22303f'];
  const skins = ['#d9b08c', '#c48f6a', '#e6c3a2', '#b98a65'];
  const mats = {}; const mm = c => mats[c] || (mats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
  const torsoG = new RoundedBoxGeometry(0.42, 0.62, 0.24, 3, 0.1), legG = new RoundedBoxGeometry(0.15, 0.82, 0.16, 2, 0.05), headG = new THREE.SphereGeometry(0.12, 18, 14), hairG = new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), armG = new RoundedBoxGeometry(0.1, 0.58, 0.11, 2, 0.04);
  const hairM = mm('#2a221c');
  const list = [];
  function person(opts) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const sh = mm(shirts[opts.s % shirts.length]), pa = mm(pants[opts.p % pants.length]), sk = mm(skins[opts.k % skins.length]);
    const lL = new THREE.Mesh(legG, pa), lR = new THREE.Mesh(legG, pa); lL.position.set(-0.09, 0.41, 0); lR.position.set(0.09, 0.41, 0);
    const legPivotL = new THREE.Group(), legPivotR = new THREE.Group(); legPivotL.position.y = 0.82; legPivotR.position.y = 0.82; lL.position.y = -0.41; lR.position.y = -0.41; lL.position.x = 0; lR.position.x = 0;
    legPivotL.position.x = -0.09; legPivotR.position.x = 0.09; legPivotL.add(lL); legPivotR.add(lR);
    const t = new THREE.Mesh(torsoG, sh); t.position.y = 1.13;
    const aL = new THREE.Group(), aR = new THREE.Group(); aL.position.set(-0.27, 1.4, 0); aR.position.set(0.27, 1.4, 0);
    const aml = new THREE.Mesh(armG, sh), amr = new THREE.Mesh(armG, sh); aml.position.y = -0.28; amr.position.y = -0.28; aL.add(aml); aR.add(amr);
    const h = new THREE.Mesh(headG, sk); h.position.y = 1.6; const hr = new THREE.Mesh(hairG, hairM); hr.position.y = 1.615;
    body.add(legPivotL, legPivotR, t, aL, aR, h, hr);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    const sc = opts.scale || 1; g.scale.setScalar(sc);
    parent.add(g);
    return { g, body, legPivotL, legPivotR, aL, aR, ...opts };
  }
  let k = 0;
  // คนเดินตามเส้นทาง
  for (let i = 0; i < 26; i++) list.push(Object.assign(person({ s: k, p: k, k: k++, scale: 0.94 + rnd() * 0.12 }), { mode: 'walk', s0: i * (L / 26), v: 0.9 + rnd() * 0.35, off: (rnd() - 0.5) * 1.4, ph: rnd() * 6 }));
  // คนยืนหน้าบูธ
  booths.forEach((b, bi) => {
    const n = b.tbc ? (rnd() < 0.4 ? 1 : 0) : 1 + Math.floor(rnd() * 3);
    const fv = FACEV[b.face];
    for (let j = 0; j < n; j++) {
      const side = (j - (n - 1) / 2) * 0.7 + (rnd() - 0.5) * 0.2, dist = 1.15 + rnd() * 0.5;
      const px = b.x + fv[0] * dist + (fv[1] !== 0 ? side : 0), pz = b.z + fv[1] * dist + (fv[0] !== 0 ? side : 0);
      const p = person({ s: k, p: k, k: k++, scale: 0.94 + rnd() * 0.12 }); p.g.position.set(px, 0, pz); p.g.rotation.y = Math.atan2(-fv[0], -fv[1]) + (rnd() - 0.5) * 0.6; p.mode = 'stand'; p.ph = rnd() * 6; list.push(p);
    }
    // เจ้าหน้าที่ประจำบูธ (หลังเคาน์เตอร์)
    if (!b.tbc) { const p = person({ s: b.own === 'mwa' ? 1 : 5, p: 0, k: k++, scale: 0.98 }); const lx = 0.42, lz = -0.15; const c = Math.cos(FACE[b.face]), s = Math.sin(FACE[b.face]);
      p.g.position.set(b.x + lx * c + lz * s, 0, b.z - lx * s + lz * c); p.g.rotation.y = FACE[b.face]; p.mode = 'stand'; p.ph = rnd() * 6; p.g.position.x += 0; p.staff = true; list.push(p); }
  });
  // คนพักดื่มกาแฟในห้องรับประทานอาหาร
  [[X(880), Z(275)], [X(940), Z(275)], [X(880), Z(320)], [X(940), Z(320)]].forEach(([x, z], ti) => {
    for (let j = 0; j < 2 + (ti % 2); j++) { const a = j * 2.2 + ti; const p = person({ s: k, p: k, k: k++, scale: 0.96 }); p.g.position.set(x + Math.cos(a) * 0.75, 0, z + Math.sin(a) * 0.75); p.g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); p.mode = 'stand'; p.ph = rnd() * 6; list.push(p); }
  });
  // ผู้นั่งใน Auditorium
  for (let i = 0; i < 70; i++) { const st = seats[Math.floor(rnd() * seats.length)]; const p = person({ s: k, p: k, k: k++, scale: 0.95 }); p.g.position.set(st[0], st[1] + 0.05, st[2] + 0.02); p.g.rotation.y = 0; p.mode = 'sit';
    p.legPivotL.rotation.x = p.legPivotR.rotation.x = -Math.PI / 2; p.body.position.y = -0.4; list.push(p); }
  return list;
}

// ───────────────────────────── ทัวร์ ─────────────────────────────
function tourSteps(W) {
  const b = c => W.booths.find(q => q.code === c);
  const st = [
    { t: 'ภาพรวมชั้น 5', d: 'ทางเดินจากลิฟต์ถึงห้องประชุม มีเส้นน้ำบนพื้นนำทาง บูธ กปน. 7 บูธ และบูธเอกชน 12 บูธ ทุกบูธขนาด 2 × 1 ม. วางชิดผนัง', focus: null, cam: [-17, 44, 45], tgt: [3, 0, -4], j: -1 },
    { t: 'ออกจากลิฟต์ · ลงทะเบียน', d: 'ออกจากลิฟต์เลี้ยวซ้าย โต๊ะลงทะเบียนชิดผนังฝั่งซ้าย (ทางเดินกว้าง 4 ม.) รับ Water Passport แล้วเดินตามเส้นน้ำ', focus: 'lobby', cam: [-9.5, 9.5, 31], tgt: [-20.5, 0.8, 18], j: 0 },
    { t: 'ฉากถ่ายรูป “เส้นทางน้ำ”', d: 'หัวมุมทางเดินก่อนเลี้ยวขวา มีฉากถ่ายรูปหันหน้ารับคนที่เดินขึ้นมา เป็นจุดเช็กอินแรกของงาน', focus: 'lobby', cam: [-19.5, 3.6, 21.5], tgt: [-21.5, 1.6, 12.4], j: 0 },
    { t: 'ทางเดินนวัตกรรม กปน.', d: 'บูธ กปน. 5 บูธ ชิดผนังฝั่งซ้าย ลึก 1 ม. เหลือทางเดิน 3 ม. · TWQ Online · Chlorine Care · คลินิกน้ำสะอาด · Water Safety Plan · วารีกุญชร', focus: 'mwa', cam: [-8.6, 6.4, 18.5], tgt: [-13, 1.2, 3], j: 1 },
    { t: 'TWQ Online และ Chlorine Care', d: 'บูธแรกของทางเดิน มีตู้ตรวจวัดและจอแสดงข้อมูล ถัดไปเป็นชุดสาธิตการเติมคลอรีนอัตโนมัติ', focus: 'mwa', booth: 'M01', cam: [-7.6, 4.0, 15.6], tgt: [-13.2, 1.2, 8.0], j: 1 },
    { t: 'ทางเดินหน้าห้อง 5 ม. → ห้องแสดง 1', d: 'เลี้ยวขวาเข้าทางเดินกว้าง 5 ม. แล้วเลี้ยวซ้ายเข้าห้องแสดง 1 ทางประตูแรก ห้องรับประทานอาหารอยู่ฝั่งซ้าย', focus: 'north', cam: [-20, 9, -2], tgt: [-2, 0.5, -13], j: 2 },
    { t: 'ห้องแสดง 1 · บูธพันธมิตร 12 บูธ', d: 'ผนังฝั่งเหนือ 8 บูธ ผนังฝั่งใต้ 4 บูธ ทางเดินกลางกว้างประมาณ 9.5 ม. เข้าประตูแรก เดินชมเป็นทางเดียว ออกประตูที่สอง', focus: 'hall', cam: [8, 17, -2.5], tgt: [8, 0, -20.5], j: 3 },
    { t: 'แถวบูธฝั่งเหนือ', d: 'Yokogawa · Petroinstrument · ProMinent · DKD · UHM · GF · IWAKI · HACH บูธละ 2 × 1 ม. ห่างกัน 1.75 ม.', focus: 'hall', cam: [-2.5, 4.2, -16.2], tgt: [9, 1.2, -25], j: 3 },
    { t: 'แถวบูธฝั่งใต้ (ระหว่างประตู)', d: 'บูธพันธมิตรอีก 4 บูธ (รอยืนยัน) อยู่ระหว่างประตูเข้าและประตูออก หันหน้าเข้ากลางห้อง', focus: 'hall', cam: [3, 4.4, -22.5], tgt: [9, 1.1, -14.6], j: 3 },
    { t: 'ห้องรับประทานอาหาร · Coffee break', d: 'ติดกับห้องแสดง 1 เข้าจากทางเดิน 5 ม. มีเคาน์เตอร์อาหารว่างและโต๊ะยืน', focus: 'dining', cam: [-2.5, 10.5, -8.5], tgt: [-11.5, 0.5, -21.5], j: 2 },
    { t: 'หน้าห้อง Auditorium', d: 'ออกจากห้องแสดง 1 ทางประตูที่สอง บูธ กปน. อีก 2 บูธขนาบประตูห้องประชุม สแกน Water Passport ก่อนเข้าห้อง', focus: 'audf', cam: [16.3, 6.5, -20.5], tgt: [16.3, 1.2, -9], j: 4 },
    { t: 'ห้องประชุม Auditorium', d: 'ที่นั่งขั้นบันได เวทีและจอด้านหน้า แขกนั่งประจำที่พร้อมเริ่มการประชุม', focus: 'aud', cam: [16.3, 7.4, -7.2], tgt: [18.2, 1.2, 12], j: 5 },
  ];
  return st;
}
const JOURNEY = ['ลิฟต์ · ลงทะเบียน', 'ทางเดิน กปน.', 'ทางเดิน 5 ม.', 'ห้องแสดง 1', 'หน้าห้องประชุม', 'Auditorium'];

// ───────────────────────────── เล่น ─────────────────────────────
function play(opt = {}) {
  if (S) stop(true);
  const root = build(opt);
  const ctx = makeScene(root, opt);
  const W = buildWorld(ctx);
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
    const w = root.clientWidth, h = root.clientHeight, introA = ss(6.3, 7.3, st.intro);
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
      const near = d < 16 && (!st.focus || st.focus === q.b.zone);
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
        <span class="st ${b.tbc ? 'tbc' : 'ok'}">${b.tbc ? 'รอยืนยัน' : '2 × 1 ม.'}</span><div class="bar"><i style="width:${Math.round(b.order / 19 * 100)}%"></i></div></div>`).join('') || '<div style="padding:12px;color:#8a97a6;font-size:13px">ไม่พบบูธ</div>';
    }
    items.innerHTML = html;
  }
  root.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; root.querySelectorAll('.tabs [data-tab]').forEach(x => x.classList.toggle('on', x === b)); renderList(); }));
  root.querySelector('#f5q').addEventListener('input', renderList);
  items.addEventListener('click', e => { const it = e.target.closest('.it'); if (!it) return; if (it.dataset.b) selectBooth(W.booths.find(b => b.code === it.dataset.b), true); else if (it.dataset.zone) { const si = STEPS.findIndex(s => s.focus === it.dataset.zone); if (si >= 0) goStep(si); } });
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
      <div class="row"><span>ขนาดบูธ</span><b>กว้าง 2 ม. × ลึก 1 ม.</b></div>
      <div class="row"><span>การวาง</span><b>ชิดผนัง ${{ e: 'ฝั่งตะวันตก', w: 'ฝั่งตะวันออก', n: 'ฝั่งใต้', s: 'ฝั่งเหนือ' }[b.face]}</b></div>
      <div class="row"><span>ลำดับบนเส้นทาง</span><b>${b.order} จาก 19 · ${Math.round(b.along)} ม. จากลิฟต์</b></div>
      <div class="nav"><button class="btn" data-k="bprev">◀ บูธก่อนหน้า</button><button class="btn pri" data-k="bnext">บูธถัดไป ▶</button></div>`;
    det.classList.add('on');
    if (fly) { const fv = FACEV[b.face]; flyTo([b.x + fv[0] * 5.2 + fv[1] * 1.6, 3.4, b.z + fv[1] * 5.2 - fv[0] * 1.6], [b.x, 1.2, b.z], 1.5); setFocus(b.zone); }
  }

  // ── จางโซน
  const REL = { lobby: ['lobby'], mwa: ['mwa'], north: ['north', 'dining', 'audf'], hall: ['hall'], dining: ['dining'], audf: ['audf', 'aud'], aud: ['aud'] };
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
  function setAuto(on) { st.auto = on; st.autoT = 0; const b = root.querySelector('#f5auto'); b.classList.toggle('pri', on); b.textContent = on ? '❚❚ หยุดนำชม' : '▶ นำชม'; }
  function act(k) {
    if (k === 'next') { setAuto(false); goStep(st.step + 1); }
    else if (k === 'prev') { setAuto(false); goStep(st.step - 1); }
    else if (k === 'auto') setAuto(!st.auto);
    else if (k === 'home') { setAuto(false); goStep(0); }
    else if (k === 'top') { setAuto(false); setFocus(null); selectBooth(null); flyTo([2, 92, 6], [2, 0, 0], 1.6); }
    else if (k === 'spin') { st.spin = !st.spin; controls.autoRotate = st.spin; controls.autoRotateSpeed = 0.7; st.tween = null; }
    else if (k === 'zin' || k === 'zout') { const d = controls.target.clone().sub(camera.position); camera.position.addScaledVector(d, k === 'zin' ? 0.28 : -0.4); }
    else if (k === 'explode') { st.intro = 0.8; st.introOn = true; root.classList.add('intro'); setFocus(null); selectBooth(null); }
    else if (k === 'skip') { st.intro = INTRO_END + 0.4; }
    else if (k === 'fs') { try { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); } catch (e) {} }
    else if (k === 'back') stop();
    else if (k === 'desel') { selectBooth(null); }
    else if (k === 'bnext' || k === 'bprev') { const i = st.sel ? st.sel.order - 1 : -1, n = W.booths[(i + (k === 'bnext' ? 1 : -1) + 19) % 19]; selectBooth(n, true); }
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
  const introCam = { p0: new THREE.Vector3(-74, 24, -158), t0: new THREE.Vector3(-10, 14, -2) };   // เริ่มจากฝั่งคลองประปา (มุมเดียวกับภาพถ่าย)
  const INTRO_END = 7.4;
  camera.position.copy(introCam.p0); controls.target.copy(introCam.t0); controls.update();
  const setOp = (F, solid, glass, dw) => { for (const m of F.mats) { m.opacity = m.userData.glass ? glass : solid; m.depthWrite = dw; } };
  function shadowBox(big) {                             // ตอนเห็นทั้งอาคาร ขยายกรอบเงา · ตอนอยู่ในชั้น 5 ใช้กรอบแคบให้เงาคม
    const sc = ctx.sun.shadow.camera;
    Object.assign(sc, big ? { left: -95, right: 95, top: 95, bottom: -95, near: 10, far: 420 } : { left: -48, right: 48, top: 40, bottom: -40, near: 10, far: 220 });
    ctx.sun.position.set(-38, 70, 30).multiplyScalar(big ? 2 : 1); sc.updateProjectionMatrix();
  }
  function applyIntro(t) {
    const up = ss(2.0, 4.6, t), lowF = ss(2.5, 4.3, t), shell = ss(2.9, 3.9, t);
    if (!st.bigShadow !== !(t < INTRO_END - 0.5)) { st.bigShadow = t < INTRO_END - 0.5; shadowBox(st.bigShadow); }
    for (const F of W.floors) { if (!F) continue; const above = F.f > F5;
      if (above) { const k = F.f - F5; F.g.position.y = F.f * FH + up * (12 + k * 6.5); const a = 1 - ss(2.9 + k * 0.13, 4.5 + k * 0.13, t);
        setOp(F, a, a, a > 0.98); F.g.visible = a > 0.01; F.edgeM.opacity = 0.9 * Math.min(up * 4, 1) * a; }
      else { const so = lerp(1, 0.3, lowF), go = lerp(1, 0.08, lowF);
        for (const m of F.mats) { m.opacity = m.userData.glass ? go : so; m.depthWrite = m.userData.glass ? lowF < 0.02 : lowF < 0.5; }
        F.edgeM.opacity = 0.55 * lowF; F.g.position.y = F.f * FH - lowF * (F5 - F.f) * 1.2; } }
    { const o = ss(1.9, 2.9, t); for (const m of W.oldBldg.mats) { m.opacity = lerp(1, 0.16, o); m.depthWrite = o < 0.3; } }
    setOp(W.f5shell, 1 - shell, 1 - shell, shell < 0.02); W.f5shell.g.visible = shell < 0.99;
    st.wallIntro = Math.max(0.001, ss(3.4, 4.8, t));
    W.booths.forEach((b, i) => { const k = Math.max(0.001, ss(4.2 + i * 0.05, 5.0 + i * 0.05, t)); b.group.scale.setScalar(k); });
    W.routeU.uProg.value = ss(4.8, 6.4, t);
    W.people.forEach(p => { p.g.visible = t > 5.4; });
    const ttl = root.querySelector('#f5ttl'); ttl.style.opacity = Math.min(ss(0.1, 0.7, t), 1 - ss(1.9, 2.6, t));
    // กล้อง: เริ่มหน้าอาคารฝั่งคลอง → โค้งผ่านด้านใต้ (หอกระจก + สะพาน) → ภาพรวมชั้น 5
    const c = easeIO(ss(0.3, INTRO_END - 0.2, t)), s0 = STEPS[0];
    const p1 = new THREE.Vector3(...s0.cam), t1 = new THREE.Vector3(...s0.tgt);
    const a0 = Math.atan2(introCam.p0.z, introCam.p0.x); let a1 = Math.atan2(p1.z, p1.x);
    while (a1 - a0 > Math.PI) a1 -= Math.PI * 2; while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
    const r0 = Math.hypot(introCam.p0.x, introCam.p0.z), r1 = Math.hypot(p1.x, p1.z);
    const a = lerp(a0, a1, c), r = lerp(r0, r1, c), lift = Math.sin(Math.PI * c) * 22;
    camera.position.set(Math.cos(a) * r, lerp(introCam.p0.y, p1.y, c) + lift, Math.sin(a) * r); controls.target.lerpVectors(introCam.t0, t1, c);
  }

  // ── จำลองคนเดิน
  function simPeople(dt, now) {
    st.simT += dt * st.speed;
    for (const p of W.people) {
      if (p.mode === 'walk') {
        let s = (p.s0 + st.simT * p.v) % (W.L + 6); const atEnd = s > W.L;
        const r = W.routeAt(Math.min(s, W.L)); const nx = -r.tz, nz = r.tx;
        p.g.position.set(r.x + nx * p.off, 0, r.z + nz * p.off); p.g.rotation.y = Math.atan2(r.tx, r.tz);
        p.g.visible = st.intro > 4.6 && !atEnd && s > 0.6;
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
    if (st.introOn) { st.intro += dt; applyIntro(st.intro); camera.lookAt(controls.target); if (st.intro >= INTRO_END) { st.introOn = false; if (st.bigShadow) { st.bigShadow = false; shadowBox(false); } root.classList.remove('intro'); goStep(0, true); } }
    else { tweenStep(dt); controls.update(); }
    if (st.auto && !st.tween) { st.autoT += dt; if (st.autoT > 7.5) goStep(st.step + 1); }
    updateZones(dt);
    W.routeU.uTime.value = now / 1000;
    simPeople(dt, now);
    const mins = 30 + Math.floor(st.simT / 6); root.querySelector('#f5clk').textContent = '08:' + String(Math.min(59, mins)).padStart(2, '0');
    if (!st.introOn && !st.perfDone) { st.perfN = (st.perfN || 0) + 1; st.perfT = (st.perfT || 0) + (now - (st.perfL || now)); st.perfL = now;
      if (st.perfN > 90) { st.perfDone = true; if (st.perfT / st.perfN > 45 && ctx.gtao) { ctx.gtao.enabled = false; renderer.setPixelRatio(1); ctx.composer.setPixelRatio(1); resize(); console.info('[F5] เครื่องช้า: ปิด AO และลดความละเอียด'); } } }
    if (ctx.composer) ctx.composer.render(); else renderer.render(scene, camera);
    placeLabels();
    st.raf = requestAnimationFrame(frame);
  }
  if (opt.at != null) { st.intro = INTRO_END + 0.4; }
  requestAnimationFrame(() => root.classList.add('on'));
  st.raf = requestAnimationFrame(frame);
  st.goStep = goStep; st.selectBooth = selectBooth; st.act = act;
  window.__f5 = st;
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

window.MWA_FLOOR5 = { play, stop, isOn: () => !!S };
window.dispatchEvent(new Event('mwa-floor5-ready'));
