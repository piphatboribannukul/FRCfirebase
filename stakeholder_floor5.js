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
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
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

// ลิฟต์ → ลงทะเบียน (ผนังฉากหลัง) → ทางเดิน กปน. → นิทรรศการ กปน. (ทางเดินเหนือ) → เข้าห้องแสดง 1 ประตูตะวันออก → ออกประตูตะวันตก → หน้าห้องประชุม → Auditorium
const ROUTE_PX = [[843, 893], [806, 893], [806, 778], [932, 778], [932, 385], [1310, 385], [1310, 290], [1088, 290], [1088, 410], [1300, 410], [1300, 470]];

const MWA_BOOTHS = [
  { name: 'TWQ Online', sub: 'ระบบตรวจสอบคุณภาพน้ำประปาออนไลน์', prop: 'cabinet' },
  { name: 'Chlorine Care', sub: 'ระบบเติมคลอรีนอัตโนมัติ', prop: 'dosing' },
  { name: 'คลินิกน้ำสะอาด', sub: 'การประปานครหลวง', prop: 'bottles' },
  { name: 'Water Safety Plan', sub: 'แผนน้ำประปาปลอดภัย', prop: 'screen' },
  { name: 'วารีกุญชร', sub: 'หุ่นยนต์สำรวจคลองส่งน้ำดิบ · Wari Kunchorn', prop: 'screen' },
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

// ตำแหน่งบูธ (ม.) · face = ทิศหน้าบูธ e/w/n/s · kind = แบบบูธ กปน. ตามภาพงานจริง (กว้าง 3 ม.)
function boothSlots() {
  const S = [];
  const xW = X(885) + WT / 2;                              // ผนังตะวันตกของทางเดิน กปน.
  [680, 587, 494].forEach((py, k) => S.push({ own: 'mwa', i: 4 + k, x: xW + (k ? 0.65 : 0.95), z: Z(py), face: 'e', zone: 'mwa', kind: k ? 'generic' : 'wari', w: 3, d: k ? 1.3 : 1.9 }));
  // นิทรรศการ กปน. ชิดผนังทางเดินเหนือ (ระหว่างประตูห้องแสดง 1) เรียงแบบภาพงานจริง: Chlorine Care · WSP · คลินิกน้ำสะอาด · TWQ Online
  const zc = Z(350) + WT / 2 + 0.65, xa = X(1108) + 0.12;
  S.push({ own: 'mwa', i: 1, x: xa + 2.5, z: zc, face: 's', zone: 'north', kind: 'cc', w: 5.0, d: 1.3 });
  S.push({ own: 'mwa', i: 3, x: xa + 6.7, z: zc, face: 's', zone: 'north', kind: 'wsp', w: 3, d: 1.3 });
  S.push({ own: 'mwa', i: 2, x: xa + 9.9, z: zc, face: 's', zone: 'north', kind: 'clinic', w: 3, d: 1.3 });
  S.push({ own: 'mwa', i: 0, x: xa + 13.6, z: zc, face: 's', zone: 'north', kind: 'twq', w: 3.9, d: 1.3 });
  // บริษัทพันธมิตรในห้องแสดง 1 (บูธ 2 × 1 ม.)
  const zHN = Z(188) + WT / 2 + 0.5, zHS = Z(350) - WT / 2 - 0.5, x0 = X(980) + 2.2, sp = (X(1385) - X(980) - 4.4) / 7;
  for (let k = 0; k < 8; k++) S.push({ own: 'p', i: k, x: x0 + k * sp, z: zHN, face: 's', zone: 'hall', w: 2, d: 1 });
  for (let k = 0; k < 4; k++) S.push({ own: 'p', i: 8 + k, x: xa + 1.9 + k * 3.8, z: zHS, face: 'n', zone: 'hall', w: 2, d: 1 });
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
  { r: [600, 185, 853, 452], t: 'พื้นที่สำนักงาน' }, { r: [958, 432, 1153, 761], t: 'พื้นที่สำนักงาน' },
  { r: [1080, 762, 1565, 910], t: 'พื้นที่สำนักงาน' }, { r: [1522, 352, 1565, 760], t: '' },
  { r: [727, 453, 885, 676], t: 'ส่วนบริการ', core: true }, { r: [727, 765, 768, 910], t: '' },
  { r: [600, 708, 676, 766], t: '' }, { r: [832, 765, 940, 786], t: '' }, { r: [600, 523, 602, 556], t: '' },
];
const EXTRA_WALLS = [[885, 352, 885, 453], [940, 787, 940, 882], [940, 882, 977, 882], [915, 908, 977, 908], [676, 522, 676, 557], [676, 615, 676, 648]];

const ZONES = {
  lobby: { name: 'โถงลิฟต์ · ลงทะเบียน', c: [X(806), Z(830)] },
  mwa: { name: 'ทางเดินนวัตกรรม กปน.', c: [X(932), Z(580)] },
  north: { name: 'นิทรรศการ กปน. · ทางเดินหน้าห้องประชุม', c: [X(1200), Z(392)] },
  hall: { name: 'ห้องแสดง 1 · พันธมิตร', c: [X(1181), Z(269)] },
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
  <div class="chip"><div class="dot">F5</div><div><b>ชั้น 5 · 19 บูธ</b><br>กปน. ผ้าตึง 3 ม. · เอกชน 2 × 1 ม.</div></div>
  <div class="clock"><i></i><span id="f5clk">08:30</span><span id="f5spd" style="font-weight:500;opacity:.8">×1</span></div>
  ${opt.onDone ? '<button class="btn" data-k="back" title="ย้อนกลับ (Esc)">⟵ กลับ</button>' : ''}
</div>
<div class="ui kpis hide-intro">
  <div class="kpi card"><div class="ic">▦</div><div><span>บูธทั้งหมด</span><strong>19<em>บูธ</em></strong><small>กปน. 7 · เอกชน 12</small></div></div>
  <div class="kpi card"><div class="ic">↝</div><div><span>เส้นทาง ลิฟต์ → ห้องประชุม</span><strong id="f5len">–<em>ม.</em></strong><small>ทางเดินกว้าง 5–7 ม.</small></div></div>
  <div class="kpi card"><div class="ic">◫</div><div><span>ที่นั่ง Auditorium (โดยประมาณ)</span><strong id="f5seat">–<em>ที่</em></strong><small>ที่นั่งขั้นบันได</small></div></div>
  <div class="kpi card"><div class="ic">◷</div><div><span>เวลาเดินชม (ประมาณ)</span><strong>25<em>นาที</em></strong><small>แวะบูธละ ~1 นาที</small></div></div>
</div>
<div class="ui tools card hide-intro">
  <button data-k="zin" title="ซูมเข้า">＋</button><button data-k="zout" title="ซูมออก">－</button><hr>
  <button data-k="home" title="ภาพรวม">⌂</button><button data-k="top" title="มุมบน (ผัง)">▦</button><button data-k="spin" title="หมุนรอบ">⟳</button><hr>
  <button data-k="explode" title="ดูการแยกชั้นอีกครั้ง">⧉</button><button data-k="fs" title="เต็มจอ">⛶</button>
</div>
<div class="ui detail card" id="f5det"></div>
<div class="ui list card hide-intro min">
  <div class="tabs"><button data-tab="mwa" class="on">บูธ กปน.<sup>7</sup></button><button data-tab="p">เอกชน<sup>12</sup></button><button data-tab="zone">โซน<sup>7</sup></button><span class="r">เรียงตามเส้นทาง</span><button class="mn" data-k="lmin" title="ย่อ/ขยายรายการ">▾</button></div>
  <div class="items" id="f5items"></div>
</div>
<div class="ui journey card hide-intro">
  <div class="jh">↝ เส้นทางผู้เข้าร่วม<small>ลิฟต์ → Auditorium</small></div>
  <div class="steps" id="f5steps"><div class="fill"></div></div>
  <div class="tour"><div class="n" id="f5n">1 / 10</div><div class="tx"><h4 id="f5t"></h4><p id="f5d"></p></div>
    <div class="ctl"><button class="btn" data-k="prev" title="ก่อนหน้า (←)">◀</button><button class="btn" data-k="next" title="ถัดไป (→)">▶</button><button class="btn" data-k="auto" id="f5auto" title="เดินชมตามเส้นทาง จากลิฟต์ถึงห้องประชุม (Space)">▶ เดินชม</button></div></div>
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
  const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 1400);

  const hemi = new THREE.HemisphereLight('#f4f8ff', '#a9a49a', 0.55); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6ea', 2.0);
  sun.position.set(-38, 70, 30); sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 44, bottom: -44, near: 10, far: 220 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 4; controls.maxDistance = 260;
  controls.screenSpacePanning = false;

  // หลังประมวลผล
  let composer = null, gtao = null, bloom = null;
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
    bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.45, 2.8); bloom.enabled = false; composer.addPass(bloom);   // แสงเรืองตอนแยกชั้น
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

function buildWorld(ctx) {
  const { scene } = ctx;
  const ZM = zoneMats();
  const world = new THREE.Group(); scene.add(world);
  const interior = new THREE.Group(); world.add(interior);       // ชั้น 5 (พื้นอยู่ที่ y = 0)
  const zoneGroups = {}; const zg = z => zoneGroups[z] || (zoneGroups[z] = (() => { const g = new THREE.Group(); g.name = z; interior.add(g); return g; })());
  const M = {
    white: new THREE.MeshStandardMaterial({ color: '#f7f8f9', roughness: 0.82 }),
    wall: new THREE.MeshStandardMaterial({ color: '#eceff3', roughness: 0.85 }),
    cap: new THREE.MeshStandardMaterial({ color: '#40566e', roughness: 0.8 }),
    closed: new THREE.MeshStandardMaterial({ color: '#cdd4dc', roughness: 0.95 }),
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
  // ── ทางเข้า: ผนังฉากต้อนรับกลางทางเดิน ชิดผนังส่วนบริการ + โต๊ะลงทะเบียนยาวด้านหน้า (แบบงาน IWA) + ป้ายตั้ง + เสากั้นแถว
  {
    const zw = Z(676) + WT / 2, xc = X(842), WW = 6.2, WH = 3.0;
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
    A(new RoundedBoxGeometry(1.0, 0.98, 0.42, 3, 0.04), M.white, 0.42, 0.49, 0.18);
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.9), cm); cp.position.set(0.42, 0.48, 0.392); inner.add(cp);
    const topMat = pMat[b.col] || (pMat[b.col] = new THREE.MeshStandardMaterial({ color: b.col, roughness: 0.35 }));
    A(new RoundedBoxGeometry(1.06, 0.04, 0.48, 2, 0.015), topMat, 0.42, 1.0, 0.18);
    // อุปกรณ์จัดแสดง
    prop(b.prop, A, propMat, M, b);
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
    const W3 = 3.0, BZ = kind === 'wari' ? -1.05 : -0.55, BX = kind === 'cc' ? 1.0 : kind === 'twq' ? 0.45 : 0, BH = kind === 'cc' ? 2.3 : 2.4;
    A(box(kind === 'cc' ? 5.0 : kind === 'twq' ? 3.9 : 3.2, 0.02, kind === 'wari' ? 2.3 : 1.3), carpetMWA, 0, 0.01, 0, { cast: false });
    // ผ้าตึง: โครง + ผืนพิมพ์ + ฐานขาตั้ง
    A(new RoundedBoxGeometry(W3, BH, 0.07, 3, 0.03), fabricFrame, BX, BH / 2 + 0.05, BZ);
    const gm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: mwaBoothGraphic(kind, b), roughness: 0.62, emissive: '#ffffff', emissiveIntensity: 0.1 })); gm.emissiveMap = gm.map;
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
    } else if (kind === 'generic') {
      const cm = ZM.reg(zone, new THREE.MeshStandardMaterial({ map: counterPrint('g'), roughness: 0.5 }));
      A(new RoundedBoxGeometry(1.3, 0.98, 0.5, 3, 0.05), M.white, 0.55, 0.49, 0.2); const cp = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 0.9), cm); cp.position.set(0.55, 0.49, 0.452); inner.add(cp);
      A(new RoundedBoxGeometry(1.36, 0.04, 0.56, 2, 0.015), top, 0.55, 1.0, 0.2);
      A(box(0.05, 1.3, 0.05), M.alu, -0.7, 0.65, -0.2); A(box(0.9, 0.53, 0.05), M.dark, -0.7, 1.5, -0.2); A(box(0.84, 0.47, 0.01), propMat.screenOn, -0.7, 1.5, -0.17, { cast: false });
    }
  }
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
  [[X(905), Z(440)], [X(1440), Z(392)], [X(1500), Z(392)], [X(985), Z(372)], [X(1060), Z(372)], [X(770), Z(700)]].forEach(([x, z]) => {
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
    'float s=fract((vUv.x-uTime*1.3)/1.4); float d=s+v*0.9-0.42; float ch=smoothstep(0.0,0.05,d)*(1.0-smoothstep(0.22,0.27,d));' +
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
      const site = window.SUTHI.buildSite(THREE, { srgb: true, env: true, shadows: true, sunken: false }); inner.add(site.grp); world.add(wrap); }
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

  // ── ผู้เข้าร่วม
  const people = makePeople(interior, booths, seats, routeAt, L);

  return { world, interior, ZM, zoneGroups, booths, walls, floors, f5shell, oldBldg, SB, scan, routeU, routeAt, L, seats, people, gy };
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
  };
  G.torso.scale(1.13, 1, 0.64); G.jacketHem.scale(1.13, 1, 0.66); G.shoe.scale(1, 1, 2.3); G.head.scale(0.86, 1.08, 0.96); G.hairS.scale(0.88, 1.06, 1.0); G.hairL.scale(0.95, 1, 0.8);
  G.skirt.scale(1.05, 1, 0.75); G.dress.scale(1.05, 1, 0.75); G.handG.scale(0.8, 1.5, 0.6); G.vee.rotateZ(-Math.PI / 2); G.vee.scale(0.75, 1.5, 1); G.shoe.rotateX(0);
  const list = [];
  const pick = (arr, k) => arr[((k % arr.length) + arr.length) % arr.length];
  // ชิ้นส่วนของคนหนึ่งคน: [กลุ่ม, geometry, สี, x, y, z, rx, ry, rz] · กลุ่ม = root/legL/legR/armL/armR
  function parts(o) {
    const f = o.female, k = o.k, sk = pick(skins, k * 3 + 1), hr = pick(hairs, k);
    let jacket, shirt, lower, tie = null, sleeve;
    if (o.staff) { jacket = '#8cc3ea'; shirt = '#8cc3ea'; lower = '#1f2732'; sleeve = jacket; }
    else if (o.style === 'casual') { jacket = pick(casual, k); shirt = jacket; lower = pick(['#2c3440', '#3b4655', '#6b6458', '#1f2732'], k); sleeve = jacket; }
    else if (f) { jacket = o.dress ? pick(['#2b3a55', '#7a2f3e', '#3d4a5c', '#1c2433', '#5b6b7c'], k) : pick(o.jacket ? suits : blouses, k + 2); shirt = pick(blouses, k); lower = o.dress ? jacket : pick(['#1c2433', '#2b3a55', '#3a3f48', '#14181f', '#6a5a4a'], k); sleeve = jacket; }
    else { jacket = pick(suits, k); shirt = pick(shirtsW, k); lower = jacket; sleeve = jacket; tie = pick(['#1d4f9e', '#7a2f3e', '#2b3a55', '#3a5a40', '#1c2433'], k + 1); if (o.shirtOnly) { jacket = shirt; sleeve = shirt; tie = null; } }
    const legSkin = f && (o.skirt || o.dress), legC = legSkin ? sk : lower, shoe = f ? pick(['#1b1b1f', '#3a2a22', '#1b1b1f'], k) : '#121316';
    const P = [];
    for (const g of ['legL', 'legR']) {
      P.push([g, legSkin ? G.thighF : G.thigh, legC, 0, -0.23, 0], [g, legSkin ? G.kneeF : G.knee, legC, 0, -0.46, 0.004], [g, legSkin ? G.shinF : G.shin, legC, 0, -0.67, 0], [g, G.shoe, shoe, 0, -0.92, 0.035]);
      if (f) P.push([g, G.heel, shoe, 0, -0.89, -0.05]);
    }
    P.push(['root', G.pelvis, lower, 0, 0.95, 0]);
    P.push(['root', G.torso, jacket, 0, 0.99, 0]);
    if (o.dress) P.push(['root', G.dress, jacket, 0, 0.38, 0]); else if (legSkin) P.push(['root', G.skirt, lower, 0, 0.52, 0]);
    if (!o.staff && jacket !== shirt) { P.push(['root', G.vee, shirt, 0, 1.38, 0.116, -0.12]); if (tie) P.push(['root', G.tie, tie, 0, 1.3, 0.119, -0.1]); P.push(['root', G.jacketHem, jacket, 0, 0.9, 0]); }
    if (o.staff) P.push(['root', G.collar, '#8cc3ea', 0, 1.47, 0]);
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
    for (const [grp, geo, col, x, y, z, rx = 0, ry = 0, rz = 0] of parts(o)) { const m = new THREE.Mesh(geo, mm(col)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; (grp === 'root' ? body : piv[grp]).add(m); }
    g.scale.setScalar(o.scale || 1); parent.add(g);
    return { g, body, legPivotL: piv.legL, legPivotR: piv.legR, aL: piv.armL, aR: piv.armR, ...o };
  }
  let k = 0;
  const who = extra => { const female = rnd() < 0.42, r = rnd(); return Object.assign({ k: k++, female, skirt: female && rnd() < 0.55, dress: female && rnd() < 0.2, jacket: female && rnd() < 0.45, longHair: female && rnd() < 0.6, shirtOnly: !female && rnd() < 0.18, style: r < 0.12 ? 'casual' : 'formal', scale: (female ? 0.94 : 1.0) + rnd() * 0.06 }, extra); };
  // คนเดินตามเส้นทาง (บางคนถือเอกสาร)
  for (let i = 0; i < 16; i++) list.push(Object.assign(rigged(who({ doc: rnd() < 0.25 })), { mode: 'walk', s0: i * (L / 16) + rnd() * 3, v: 0.95 + rnd() * 0.3, off: (rnd() - 0.5) * 1.4, ph: rnd() * 6 }));
  // ผู้เยี่ยมชมหน้าบูธ 0–2 คน · เจ้าหน้าที่ประจำบูธ 1–2 คน
  booths.forEach(b => {
    const big = (b.w || 2) > 2, fv = FACEV[b.face];
    const n = b.tbc ? 0 : big ? 1 + (rnd() < 0.5 ? 1 : 0) : (rnd() < 0.55 ? 1 : 0);
    for (let j = 0; j < n; j++) {
      const side = (j - (n - 1) / 2) * (big ? 1.2 : 0.8) + (rnd() - 0.5) * 0.3, dist = (big ? 1.6 : 1.25) + rnd() * 0.4;
      const px = b.x + fv[0] * dist + (fv[1] !== 0 ? side : 0), pz = b.z + fv[1] * dist + (fv[0] !== 0 ? side : 0);
      const p = merged(who(), { armR: rnd() < 0.4 ? -0.5 : -0.05, armL: -0.04 }); p.g.position.set(px, 0, pz); p.g.rotation.y = Math.atan2(-fv[0], -fv[1]) + (rnd() - 0.5) * 0.5; p.mode = 'stand'; p.ph = rnd() * 6; list.push(p);
    }
    if (b.tbc) return;
    const spots = b.kind === 'cc' ? [[0.25, 0.85], [2.3, 0.6]] : b.kind === 'twq' ? [[0.1, 0.45], [-2.2, 0.5]] : b.kind === 'wari' ? [[-1.25, 0.9]] : b.kind ? [[0.55, 0.3]] : [[0.42, -0.15]];
    spots.forEach(([lx, lz], si) => { if (si && rnd() < 0.35) return;
      const p = merged(who({ staff: b.own === 'mwa' }), { armL: -0.12, armR: si ? -0.12 : -0.45 }); const c = Math.cos(FACE[b.face]), s2 = Math.sin(FACE[b.face]);
      p.g.position.set(b.x + lx * c + lz * s2, 0, b.z - lx * s2 + lz * c); p.g.rotation.y = FACE[b.face] + (si ? 0.4 : 0); p.mode = 'stand'; p.ph = rnd() * 6; p.staff = true; list.push(p); });
  });
  // พักดื่มกาแฟ
  [[X(880), Z(275)], [X(940), Z(275)], [X(880), Z(320)], [X(940), Z(320)]].forEach(([x, z], ti) => {
    for (let j = 0; j < 2; j++) { const a = j * 2.6 + ti; const p = merged(who(), { armR: -1.15 }); p.g.position.set(x + Math.cos(a) * 0.72, 0, z + Math.sin(a) * 0.72); p.g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); p.mode = 'stand'; p.ph = rnd() * 6; list.push(p); }
  });
  // ผู้นั่งใน Auditorium
  for (let i = 0; i < 90; i++) { const st = seats[Math.floor(rnd() * seats.length)]; const p = merged(who({ badge: false }), { legL: -Math.PI / 2, legR: -Math.PI / 2, armL: -0.6, armR: -0.6 }); p.g.position.set(st[0], st[1] - 0.4, st[2] + 0.04); p.g.rotation.y = 0; p.mode = 'sit'; list.push(p); }
  return list;
}

// ───────────────────────────── ทัวร์ ─────────────────────────────
function tourSteps(W) {
  const b = c => W.booths.find(q => q.code === c);
  const P = (px, py, h) => [X(px), h, Z(py)];
  const st = [
    { t: 'ภาพรวมชั้น 5', d: 'ลิฟต์ → ลงทะเบียน → ทางเดิน กปน. → นิทรรศการ กปน. → ห้องแสดงบริษัทพันธมิตร → ห้องประชุม Auditorium มีเส้นนำทางบนพื้นตลอดเส้นทาง', focus: null, cam: [-6, 61, 57], tgt: [4, 0, 4], j: -1 },
    { t: 'ออกจากลิฟต์ · ลงทะเบียน', d: 'ออกจากลิฟต์เดินมาที่ผนังต้อนรับกลางทางเดิน โต๊ะลงทะเบียนยาวด้านหน้า ป้ายแยกช่องลงทะเบียนล่วงหน้า หน้างาน และประชาสัมพันธ์ แล้วเลี้ยวขวาตามเส้นนำทาง', focus: 'lobby', cam: P(790, 880, 5.0), tgt: P(842, 700, 1.4), j: 0 },
    { t: 'ผนังต้อนรับ · Stakeholder Day', d: 'ผนังฉากกว้าง 6 ม. สูง 3 ม. ด้านหลังโต๊ะลงทะเบียน ตรา กปน. และข้อความต้อนรับ เป็นจุดถ่ายรูปแรกของงาน', focus: 'lobby', cam: P(842, 800, 2.3), tgt: P(842, 676, 1.7), j: 0 },
    { t: 'ทางเดินนวัตกรรม กปน.', d: 'วารีกุญชร หุ่นยนต์สำรวจคลองส่งน้ำดิบ (เหรียญเงิน iENA 2022 เยอรมนี) บนแท่นจัดแสดง ตามด้วยบูธ กปน. 06 · 07 ทางเดินเหลือกว้างราว 5 ม.', focus: 'mwa', cam: P(955, 740, 4.6), tgt: P(893, 575, 1.4), j: 1 },
    { t: 'นิทรรศการ กปน.', d: 'ชิดผนังทางเดินเหนือ เรียงแบบงานจริง: Chlorine Care · เส้นทางน้ำประปาดื่มได้ (WSP) · คลินิกน้ำสะอาด · TWQ Online', focus: 'north', cam: P(1150, 470, 7.0), tgt: P(1210, 352, 1.2), j: 2 },
    { t: 'Chlorine Care · ระบบเติมคลอรีนอัตโนมัติ', d: 'ชุดถังจำลองพร้อมท่อ ตู้ควบคุม PLC และแท็บเล็ต โต๊ะปั๊มจ่ายสารพร้อมถังเคมี หน้าผ้าตึงไดอะแกรมระบบ', focus: 'north', booth: 'M02', cam: P(1145, 418, 2.9), tgt: P(1140, 352, 1.25), j: 2 },
    { t: 'คลินิกน้ำสะอาด · TWQ Online', d: 'โพเดียมคลินิกน้ำสะอาด และเคาน์เตอร์โค้ง TWQ Online พร้อมจอแผนที่จุดตรวจวัดออนไลน์ ป้ายตั้ง “น้ำประปาดื่มได้” สแกน QR', focus: 'north', booth: 'M01', cam: P(1262, 420, 3.0), tgt: P(1255, 352, 1.25), j: 2 },
    { t: 'ห้องแสดง 1 · บริษัทพันธมิตร 12 บูธ', d: 'เข้าทางประตูตะวันออก เดินชมบูธผนังเหนือ 8 บูธ และผนังใต้ 4 บูธ แล้วออกประตูตะวันตก', focus: 'hall', cam: P(1185, 425, 17), tgt: P(1185, 262, 0), j: 3 },
    { t: 'แถวบูธฝั่งเหนือ', d: 'Yokogawa · Petroinstrument · ProMinent · DKD · UHM · GF · IWAKI · HACH บูธละ 2 × 1 ม.', focus: 'hall', cam: P(1360, 300, 4.0), tgt: P(1150, 200, 1.2), j: 3 },
    { t: 'แถวบูธฝั่งใต้', d: 'บูธพันธมิตรอีก 4 บูธ (รอยืนยัน) ระหว่างประตูทั้งสอง หลังชนกับนิทรรศการ กปน.', focus: 'hall', cam: P(1060, 240, 4.2), tgt: P(1200, 340, 1.1), j: 3 },
    { t: 'ห้องรับประทานอาหาร · Coffee break', d: 'ติดกับห้องแสดง 1 เข้าจากทางเดินเหนือ มีเคาน์เตอร์อาหารว่างและโต๊ะยืน', focus: 'dining', cam: P(1010, 400, 10), tgt: P(905, 255, 0.5), j: 3 },
    { t: 'หน้าห้อง Auditorium', d: 'ออกจากห้องแสดง 1 เดินทางเดินฝั่งใต้ไปประตูห้องประชุม สแกน Water Passport ก่อนเข้าห้อง', focus: 'audf', cam: P(1175, 315, 8.5), tgt: P(1305, 440, 0.9), j: 4 },
    { t: 'ห้องประชุม Auditorium', d: 'ที่นั่งขั้นบันได เวทีและจอด้านหน้า แขกนั่งประจำที่พร้อมเริ่มการประชุม', focus: 'aud', cam: P(1310, 448, 8.0), tgt: P(1337, 715, 1.2), j: 5 },
  ];
  return st;
}
const JOURNEY = ['ลิฟต์ · ลงทะเบียน', 'ทางเดิน กปน.', 'นิทรรศการ กปน.', 'ห้องแสดง 1', 'หน้าห้องประชุม', 'Auditorium'];

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
        <span class="st ${b.tbc ? 'tbc' : 'ok'}">${b.tbc ? 'รอยืนยัน' : (b.w || 2) + ' × ' + (b.d || 1) + ' ม.'}</span><div class="bar"><i style="width:${Math.round(b.order / 19 * 100)}%"></i></div></div>`).join('') || '<div style="padding:12px;color:#8a97a6;font-size:13px">ไม่พบบูธ</div>';
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
      <div class="row"><span>ขนาดบูธ</span><b>กว้าง ${b.w || 2} ม. × ลึก ${b.d || 1} ม.</b></div>
      <div class="row"><span>การวาง</span><b>${b.kind ? 'ผ้าตึงโค้ง + เคาน์เตอร์ ชิดผนัง' : 'ชิดผนัง'} ${{ e: 'ฝั่งตะวันตก', w: 'ฝั่งตะวันออก', n: 'ฝั่งใต้', s: 'ฝั่งเหนือ' }[b.face]}</b></div>
      <div class="row"><span>ลำดับบนเส้นทาง</span><b>${b.order} จาก 19 · ${Math.round(b.along)} ม. จากลิฟต์</b></div>
      <div class="nav"><button class="btn" data-k="bprev">◀ บูธก่อนหน้า</button><button class="btn pri" data-k="bnext">บูธถัดไป ▶</button></div>`;
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
  const WALK = { v: 1.55, slow: 0.6, eye: 1.62 };
  const jOf = s => { const bs = W.booths; const first = z => { const q = bs.filter(b => b.zone === z); return q.length ? Math.min(...q.map(b => b.along)) : 1e9; }, last = z => { const q = bs.filter(b => b.zone === z); return q.length ? Math.max(...q.map(b => b.along)) : -1e9; };
    if (s < first('mwa') - 4) return 0; if (s < first('north') - 4) return 1; if (s < first('hall') - 3) return 2; if (s < last('hall') + 3) return 3; if (s < W.L - 4) return 4; return 5; };
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
    const slow = near && nd < 4.6 && !near.tbc;
    w.v = lerp(w.v, slow ? WALK.slow : WALK.v, Math.min(1, dt * 1.6));
    w.s += w.v * dt;
    const q = W.routeAt(Math.min(w.s, W.L)), ahead = W.routeAt(Math.min(w.s + 5.5, W.L)), tail = Math.max(0, w.s - W.L);
    const pos = new THREE.Vector3(q.x + q.tx * tail, WALK.eye + Math.sin(w.s * 3.6) * 0.018, q.z + q.tz * tail);
    let look = new THREE.Vector3(ahead.x + q.tx * tail * 2, 1.45, ahead.z + q.tz * tail * 2);
    if (tail > 0) look.y = 1.8;
    if (slow) { const k = Math.min(1, (4.6 - nd) / 2.4) * 0.65; look.lerp(new THREE.Vector3(near.x, 1.35, near.z), k); }
    if (!w.look) w.look = look.clone(); w.look.lerp(look, Math.min(1, dt * 2.2));
    camera.position.copy(pos); controls.target.copy(w.look); camera.lookAt(w.look);
    setWalkCard(jOf(w.s));
    if (w.s > W.L + 7) { setAuto(false); goStep(STEPS.length - 1); }
  }
  function setAuto(on) {
    st.auto = on; st.autoT = 0; const b = root.querySelector('#f5auto'); b.classList.toggle('pri', on); b.textContent = on ? '❚❚ หยุดเดินชม' : '▶ เดินชม';
    if (on) { st.walk = { s: 1.3, v: 0.4, look: null }; st.walkJ = -1; st.tween = null; st.spin = false; controls.autoRotate = false; controls.enabled = false; setFocus(null); selectBooth(null); camera.fov = 66; camera.updateProjectionMatrix(); }
    else if (st.walk) { st.walk = null; controls.enabled = true; camera.fov = 45; camera.updateProjectionMatrix(); }
  }
  function act(k) {
    if (k === 'next') { setAuto(false); goStep(st.step + 1); }
    else if (k === 'prev') { setAuto(false); goStep(st.step - 1); }
    else if (k === 'auto') setAuto(!st.auto);
    else if (k === 'home') { setAuto(false); goStep(0); }
    else if (k === 'top') { setAuto(false); setFocus(null); selectBooth(null); flyTo([4, 112, 12], [4, 0, 3], 1.6); }
    else if (k === 'spin') { st.spin = !st.spin; controls.autoRotate = st.spin; controls.autoRotateSpeed = 0.7; st.tween = null; }
    else if (k === 'zin' || k === 'zout') { const d = controls.target.clone().sub(camera.position); camera.position.addScaledVector(d, k === 'zin' ? 0.28 : -0.4); }
    else if (k === 'explode') { st.intro = 0.8; st.introOn = true; root.classList.add('intro'); setFocus(null); selectBooth(null); }
    else if (k === 'skip') { st.intro = INTRO_END + 0.4; }
    else if (k === 'fs') { try { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen(); } catch (e) {} }
    else if (k === 'back') stop();
    else if (k === 'desel') { selectBooth(null); }
    else if (k === 'lmin') { root.querySelector('.list').classList.toggle('min'); }
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
  const INTRO_END = 9.2;
  camera.position.copy(introCam.p0); controls.target.copy(introCam.t0); controls.update();
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
    const intro = t < INTRO_END - 0.05; if (ctx.bloom) ctx.bloom.enabled = intro && t > 0.9 && t < 6.2;
    const topY = (NF - F5) * FH + 8.5, scanY = lerp(topY, 0.05, eOut(ss(1.0, 2.6, t)));
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
    { const k = ss(5.6, INTRO_END, t); ctx.scene.fog.near = lerp(420, 170, k); ctx.scene.fog.far = lerp(1500, 430, k); }
    st.wallIntro = Math.max(0.001, eOut(ss(4.6, 6.0, t)));
    W.booths.forEach((b, i) => { const k = Math.max(0.001, eOut(ss(5.4 + i * 0.06, 6.2 + i * 0.06, t))); b.group.scale.setScalar(k); });
    W.routeU.uProg.value = ss(6.0, 7.8, t);
    W.people.forEach(p => { p.g.visible = t > 6.6; });
    const ttl = root.querySelector('#f5ttl'); ttl.style.opacity = Math.min(ss(0.1, 0.7, t), 1 - ss(1.4, 2.0, t));
    // กล้อง: ดันเข้าเล็กน้อย → เครนขึ้นวนโค้งให้เห็นชั้นที่ลอยแยก → ลงสู่ภาพรวมชั้น 5
    const c = easeIO(ss(0.6, INTRO_END - 0.1, t)), s0 = STEPS[0];
    const p1 = new THREE.Vector3(...s0.cam), t1 = new THREE.Vector3(...s0.tgt);
    const a0 = Math.atan2(introCam.p0.z, introCam.p0.x); let a1 = Math.atan2(p1.z, p1.x);
    while (a1 - a0 > Math.PI) a1 -= Math.PI * 2; while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
    const r0 = Math.hypot(introCam.p0.x, introCam.p0.z) * (1 - 0.12 * ss(0, 1.2, t)), r1 = Math.hypot(p1.x, p1.z);
    const a = lerp(a0, a1, c), r = lerp(r0, r1, c), lift = Math.sin(Math.PI * Math.min(1, c * 1.15)) * 46;
    camera.position.set(Math.cos(a) * r, lerp(introCam.p0.y, p1.y, c) + lift, Math.sin(a) * r);
    const tgtUp = Math.sin(Math.PI * ss(1.6, 6.5, t)) * 18;
    controls.target.lerpVectors(introCam.t0, t1, easeIO(ss(1.6, INTRO_END - 0.1, t))); controls.target.y += tgtUp;
  }

  // ── จำลองคนเดิน
  function simPeople(dt, now) {
    st.simT += dt * st.speed;
    for (const p of W.people) {
      if (p.mode === 'walk') {
        let s = (p.s0 + st.simT * p.v) % (W.L + 6); const atEnd = s > W.L;
        const r = W.routeAt(Math.min(s, W.L)); const nx = -r.tz, nz = r.tx;
        p.g.position.set(r.x + nx * p.off, 0, r.z + nz * p.off); p.g.rotation.y = Math.atan2(r.tx, r.tz);
        p.g.visible = st.intro > 4.6 && !atEnd && s > 0.6 && !(st.walk && Math.hypot(p.g.position.x - camera.position.x, p.g.position.z - camera.position.z) < 1.8);
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
    if (st.introOn) { st.intro += dt; applyIntro(st.intro); camera.lookAt(controls.target); if (st.intro >= INTRO_END) { st.introOn = false; applyIntro(INTRO_END + 1); if (st.bigShadow) { st.bigShadow = false; shadowBox(false); } root.classList.remove('intro'); goStep(0, true); } }
    else if (st.walk) walkStep(dt);
    else { tweenStep(dt); controls.update(); }
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

window.MWA_FLOOR5 = { play, stop, isOn: () => !!S };
window.dispatchEvent(new Event('mwa-floor5-ready'));
