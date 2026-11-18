// มาสคอตการประปานครหลวง 3 มิติ: พี่ยอดน้ำ + น้องสายน้ำ
// ทรงหยดน้ำสร้างจากเส้นขอบศีรษะในภาพต้นฉบับ (ทีละแถว) · หน้าใช้ภาพจริง 4 อารมณ์ฉายลงด้านหน้าศีรษะ
// stakeholder_yodnam_faces.webp / stakeholder_sainam_faces.webp: [ปกติ, ยิ้มหลับตา, ขยิบตา/ทำปาก, ตาประกาย]
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FACE = { normal: 0, happy: 1, wink: 2, sparkle: 3 };
const DEFS = {
  yod: { W: 725, H: 975, C0: 362, Y1: 973, PROF: [[196,391,553],[204,373,553],[212,357,552],[220,341,548],[228,327,541],[236,313,527],[244,300,531],[252,287,534],[260,274,538],[268,262,542],[276,251,546],[284,240,550],[292,229,555],[300,218,559],[308,208,564],[316,198,569],[324,189,573],[332,180,578],[340,171,583],[348,162,588],[356,154,593],[364,146,598],[372,138,603],[380,131,608],[388,124,613],[396,117,618],[404,110,623],[412,103,627],[420,97,632],[428,91,637],[436,85,642],[444,80,646],[452,74,651],[460,69,655],[468,64,660],[476,60,664],[484,55,668],[492,51,672],[500,46,676],[508,43,680],[516,39,684],[524,35,687],[532,32,691],[540,29,694],[548,25,697],[556,23,700],[564,20,703],[572,17,706],[580,15,708],[588,13,711],[596,11,713],[604,9,715],[612,8,717],[620,6,718],[628,5,720],[636,3,721],[644,2,722],[652,2,723],[660,1,723],[668,0,724],[676,0,724],[684,0,724],[692,0,724],[700,0,723],[708,1,722],[716,1,721],[724,2,720],[732,3,719],[740,4,717],[748,6,715],[756,7,713],[764,9,711],[772,12,708],[780,14,705],[788,17,702],[796,20,698],[804,23,694],[812,27,690],[820,32,685],[828,36,680],[836,41,675],[844,47,669],[852,53,663],[860,59,656],[868,67,648],[876,74,640],[884,83,631],[892,92,622],[900,102,611],[908,114,600],[916,126,587],[924,140,573],[932,155,557],[940,173,539],[948,194,518],[956,220,492],[964,253,459],[970,291,420],[972,311,400]], blue: '#0e6fc0', line: '#06335f', scarf: '#8ad3f1', nose: [255, 742], tap: -0.45, girl: false },
  sai: { W: 748, H: 1000, C0: 373.5, Y1: 988, PROF: [[200,413,571],[208,395,572],[216,378,572],[224,362,571],[232,347,568],[240,332,562],[248,319,550],[256,305,549],[264,292,552],[272,280,556],[280,268,560],[288,257,565],[296,245,569],[304,235,574],[312,224,578],[320,214,583],[328,204,587],[336,195,592],[344,186,597],[352,177,602],[360,168,607],[368,160,611],[376,152,616],[384,144,621],[392,137,626],[400,129,631],[408,122,636],[416,115,641],[424,109,646],[432,103,651],[440,96,655],[448,90,660],[456,85,665],[464,79,669],[472,74,674],[480,69,678],[488,64,683],[496,59,687],[504,55,691],[512,51,695],[520,47,699],[528,43,703],[536,39,707],[544,35,710],[552,32,714],[560,29,717],[568,26,720],[576,23,723],[584,20,726],[592,18,729],[600,15,731],[608,13,733],[616,11,736],[624,10,738],[632,8,739],[640,6,741],[648,5,743],[656,4,744],[664,3,745],[672,2,746],[680,1,746],[688,1,747],[696,0,747],[704,0,747],[712,0,747],[720,0,746],[728,1,746],[736,1,745],[744,2,744],[752,3,742],[760,4,741],[768,5,739],[776,7,737],[784,8,735],[792,11,732],[800,13,729],[808,16,726],[816,19,723],[824,22,719],[832,26,715],[840,30,711],[848,34,706],[856,39,701],[864,44,696],[872,50,690],[880,56,683],[888,63,676],[896,70,669],[904,78,661],[912,87,652],[920,96,642],[928,107,632],[936,118,620],[944,131,608],[952,145,594],[960,161,579],[968,179,561],[976,200,542],[984,225,518],[986,232,511]], blue: '#3aa6e6', line: '#155f98', scarf: '#bfe8fa', nose: [257, 784], tap: -0.5, girl: true },
};

function headGeo(D, K, DZ = 0.9, SEG = 64) {
  let rows = D.PROF.map(([y, a, b]) => [y, (a + b) / 2, (b - a) / 2]);
  // ลบรอยหยักจากพิกเซล (เฉลี่ย 5 แถว) แล้วแทรกแถวให้ถี่ขึ้น 3 เท่า → ผิวเงาเรียบไม่เป็นริ้ว
  rows = rows.map((r, i) => { if (i < 2 || i > rows.length - 3) return r; let c = 0, rr = 0; for (let k = -2; k <= 2; k++) { c += rows[i + k][1]; rr += rows[i + k][2]; } return [r[0], c / 5, rr / 5]; });
  { const o = []; for (let i = 0; i < rows.length - 1; i++) { const A = rows[i], B2 = rows[i + 1]; for (let k = 0; k < 3; k++) { const u = k / 3; o.push([A[0] + (B2[0] - A[0]) * u, A[1] + (B2[1] - A[1]) * u, A[2] + (B2[2] - A[2]) * u]); } } o.push(rows[rows.length - 1]); rows = o; }
  const t = rows[0]; rows.unshift(...[[22, 12, 0.34], [18, 9, 0.5], [13, 6, 0.66], [7, 3, 0.83]].map(([dy, dx, k]) => [t[0] - dy, t[1] + dx, t[2] * k]));
  const pos = [], fuv = [], fr = [], idx = [];
  rows.forEach(([y, c, r]) => { for (let i = 0; i < SEG; i++) { const th = i / SEG * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), px = c + r * cs;
    pos.push((px - D.C0) * K, (D.Y1 - y) * K, r * K * DZ * sn); fuv.push(px / D.W, 1 - y / D.H); fr.push(Math.min(1, Math.max(0, (sn - 0.12) / 0.3))); } });
  const nR = rows.length;
  for (let j = 0; j < nR - 1; j++) for (let i = 0; i < SEG; i++) { const a = j * SEG + i, b = j * SEG + (i + 1) % SEG, c = a + SEG, d = b + SEG; idx.push(a, b, c, b, d, c); }
  const top = pos.length / 3; pos.push((rows[0][1] - D.C0) * K, (D.Y1 - rows[0][0] + 3) * K, 0); fuv.push(rows[0][1] / D.W, 0.8); fr.push(0);
  const bot = pos.length / 3, lb = rows[nR - 1]; pos.push((lb[1] - D.C0) * K, -0.002, 0); fuv.push(lb[1] / D.W, 1 - D.Y1 / D.H); fr.push(1);
  for (let i = 0; i < SEG; i++) { idx.push(top, (i + 1) % SEG, i); idx.push(bot, (nR - 1) * SEG + i, (nR - 1) * SEG + (i + 1) % SEG); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('faceUv', new THREE.Float32BufferAttribute(fuv, 2)); g.setAttribute('front', new THREE.Float32BufferAttribute(fr, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const surf = (px, py) => { let best = rows[0]; for (const r of rows) if (Math.abs(r[0] - py) < Math.abs(best[0] - py)) best = r; const cs = (px - best[1]) / best[2]; return new THREE.Vector3((px - D.C0) * K, (D.Y1 - py) * K, best[2] * K * DZ * Math.sqrt(Math.max(0, 1 - cs * cs))); };
  return { g, tip: [(rows[0][1] - D.C0) * K, (D.Y1 - rows[0][0]) * K], surf, h: (D.Y1 - rows[0][0]) * K };
}

const MATS = {};
function mats(kind, faceTex) {
  const key = kind; if (MATS[key]) return MATS[key]; const D = DEFS[kind];
  const head = new THREE.MeshPhysicalMaterial({ color: D.blue, roughness: 0.3, clearcoat: 0.75, clearcoatRoughness: 0.16, metalness: 0 });
  head.userData.off = { value: new THREE.Vector2(0, 0.5) };
  head.onBeforeCompile = sh => {
    sh.uniforms.faceMap = { value: faceTex }; sh.uniforms.faceOff = head.userData.off;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 faceUv; attribute float front; varying vec2 vFUv; varying float vFront;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFUv = faceUv; vFront = front;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D faceMap; uniform vec2 faceOff; varying vec2 vFUv; varying float vFront;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 fcF = texture2D(faceMap, faceOff + vFUv * 0.5); float faA = fcF.a * vFront; diffuseColor.rgb = mix(diffuseColor.rgb, pow(fcF.rgb, vec3(2.2)), faA);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.5, faA);');
  };
  head.customProgramCacheKey = () => 'mascot-head';
  const body = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  // เส้นขอบแบบการ์ตูน (ขยายตามแนว normal แล้ววาดด้านหลัง) → ตัวละครเด่นจากฉาก เหมือนลายเส้นในภาพต้นฉบับ
  const line = new THREE.MeshBasicMaterial({ color: D.line, side: THREE.BackSide });
  line.onBeforeCompile = sh => { sh.uniforms.th = { value: 0.0095 }; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float th;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * th;'); };
  line.customProgramCacheKey = () => 'mascot-line';
  return MATS[key] = { head, body, line };
}

const tint = (g, col) => { const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const place = (g, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
const strip = g => { const o = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(k)) o.deleteAttribute(k); return o; };
const SPH = (r, s = 18) => new THREE.SphereGeometry(r, s, Math.round(s * 0.7)), CAP = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
const M = (parts) => mergeGeometries(parts.map(([g, col]) => strip(tint(g, col))), false);

// kind: 'yod' | 'sai' · size = ความสูงรวมโดยประมาณ (ม.) · outline: เส้นขอบ
export function makeMascot(kind, faceTex, size = 1.4, opt = {}) {
  const D = DEFS[kind], S = size / 1.05, K = 0.62 / 777, MT = mats(kind, faceTex), B = D.blue;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(S);
  const meshes = [];
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); parent.add(m); meshes.push(m); if (opt.outline !== false) { const o = new THREE.Mesh(geo, MT.line); o.userData.outline = true; o.castShadow = false; parent.add(o); } return m; };
  // ลำตัว (+ผ้าพันคอ / ชุดกระโปรงของสายน้ำ)
  const torsoParts = [[new THREE.LatheGeometry([[0.001, 0], [0.085, 0.008], [0.112, 0.05], [0.11, 0.12], [0.088, 0.18], [0.05, 0.215]].map(([r, y]) => new THREE.Vector2(r, y)), 28), B]];
  place(torsoParts[0][0], 0, 0.13, 0, 1, 1, 0.9);
  if (D.girl) { const sk = new THREE.LatheGeometry([[0.05, 0.27], [0.1, 0.22], [0.15, 0.13], [0.165, 0.1], [0.12, 0.095]].map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 32); place(sk, 0, 0.0, 0, 1, 1, 0.92); torsoParts.push([sk, B]); }
  const sc = new THREE.TorusGeometry(0.082, 0.026, 10, 28); place(sc, 0, 0.315, 0, 1, 0.95, 0.75, Math.PI / 2); torsoParts.push([sc, D.scarf]);
  const kn = SPH(0.034, 14); place(kn, 0.035, 0.3, 0.075, 1.3, 0.8, 0.6, 0, 0, 0.4); torsoParts.push([kn, D.scarf]);
  add(body, M(torsoParts), MT.body);
  const legs = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.055, 0.17, 0); body.add(p);
    const l = CAP(D.girl ? 0.045 : 0.052, 0.07); place(l, 0, -0.075, 0); const f = SPH(0.064); place(f, sx * 0.008, -0.135, 0.03, 0.95, 0.62, 1.35);
    add(p, M([[l, B], [f, B]]), MT.body); return p; });
  const arms = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.1, 0.28, 0); body.add(p); const a = new THREE.Group(); p.add(a);
    const u = CAP(0.036, 0.08); place(u, 0, -0.06, 0); const h = SPH(0.048); place(h, 0, -0.125, 0, 1, 1.05, 0.85); const th = SPH(0.02, 10); place(th, -sx * 0.035, -0.105, 0.025, 1, 1.4, 1);
    add(a, M([[u, B], [h, B], [th, B]]), MT.body); return { p, a, sx }; });
  const HG = headGeo(D, K), head = new THREE.Group(); head.position.y = 0.3; body.add(head);
  const hs = new THREE.Group(); head.add(hs);                      // ชั้นย่อยไว้ยืด/หด (squash & stretch)
  add(hs, HG.g, MT.head);
  const nose = SPH(0.026, 16); { const p = HG.surf(...D.nose); place(nose, p.x, p.y, p.z + 0.006, 1.05, 0.9, 0.85); }
  const tp = [], tpos = new THREE.Matrix4().compose(new THREE.Vector3(HG.tip[0] + 0.004, HG.tip[1] + 0.006, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, D.tap)), new THREE.Vector3(1, 1, 1));
  const st0 = new THREE.CylinderGeometry(0.024, 0.03, 0.075, 16); place(st0, 0, 0.035, 0); tp.push(st0);
  const co = new THREE.CylinderGeometry(0.036, 0.036, 0.018, 18); place(co, 0, 0.06, 0); tp.push(co);
  const hb = SPH(0.024); place(hb, 0, 0.085, 0); tp.push(hb);
  for (const [rx, rz] of [[0, Math.PI / 2], [Math.PI / 2, 0]]) { const bar = CAP(0.015, 0.11); place(bar, 0, 0.088, 0, 1, 1, 1, rx, 0, rz); tp.push(bar); }
  const kb = CAP(0.013, 0.02); place(kb, 0, 0.115, 0); tp.push(kb);
  tp.forEach(g => g.applyMatrix4(tpos));
  add(hs, M([[nose, '#f4f7fa'], ...tp.map(g => [g, '#f4f7fa'])]), MT.body);
  meshes.forEach(m => { m.castShadow = true; });
  const top = 0.3 + HG.h + 0.13;                                   // ความสูงศีรษะ+ก๊อก (หน่วยก่อนสเกล)
  const st = { ph: 0, blink: 2 + Math.random() * 3, face: -1, w: {}, hop: 0, t: Math.random() * 10 };
  const setFace = f => { const c = f % 2, r = Math.floor(f / 2); MT.head.userData.off.value.set(c * 0.5, 0.5 - r * 0.5); };
  // หมายเหตุ: วัสดุศีรษะใช้ร่วมกันทั้งชนิด → อารมณ์หน้าจึงต่อชนิด (ตัวหลัก) · ตัวอื่นของชนิดเดียวกันใช้สำเนา
  const myHead = MT.head.clone(); myHead.userData.off = { value: new THREE.Vector2(0, 0.5) }; myHead.onBeforeCompile = sh => { MT.head.onBeforeCompile(sh); sh.uniforms.faceOff = myHead.userData.off; }; myHead.customProgramCacheKey = MT.head.customProgramCacheKey;
  hs.children[0].material = myHead;
  const setF = f => { const c = f % 2, r = Math.floor(f / 2); myHead.userData.off.value.set(c * 0.5, 0.5 - r * 0.5); };
  const W8 = (k, on, dt, sp = 6) => { st.w[k] = (st.w[k] || 0) + ((on ? 1 : 0) - (st.w[k] || 0)) * Math.min(1, dt * sp); return st.w[k]; };
  // s = { walk 0..1, act: 'wave'|'cheer'|'present'|'point'|'hop'|'talk'|null, sit, look (หันศีรษะ เรเดียน), face }
  function update(dt, s = {}) {
    st.t += dt; const t = st.t, w = Math.min(1, (s.walk || 0) * 1.6);
    st.ph += dt * (2.4 + 7.5 * (s.walk || 0));
    const wv = W8('wave', s.act === 'wave', dt), ch = W8('cheer', s.act === 'cheer', dt), pr = W8('present', s.act === 'present', dt), pt = W8('point', s.act === 'point', dt), tk = W8('talk', s.act === 'talk' || s.talk, dt, 4), si = W8('sit', s.sit, dt);
    if (s.act === 'hop' && st.hop <= 0) st.hop = 0.75;
    const sw = Math.sin(st.ph) * 0.55 * w;
    legs[0].rotation.x = sw * (1 - si) - 1.45 * si; legs[1].rotation.x = -sw * (1 - si) - 1.45 * si;
    let by = Math.abs(Math.sin(st.ph)) * 0.03 * w + Math.sin(t * 2.1) * 0.004, sq = 1;
    if (st.hop > 0) { const u = 1 - st.hop / 0.75; st.hop -= dt;            // ย่อ → กระโดด → ลงยุบ
      if (u < 0.18) sq = 1 - 0.12 * Math.sin(u / 0.18 * Math.PI); else if (u < 0.78) { const v = (u - 0.18) / 0.6; by += Math.sin(v * Math.PI) * 0.2; sq = 1 + 0.07 * Math.sin(v * Math.PI); } else sq = 1 - 0.1 * Math.sin((u - 0.78) / 0.22 * Math.PI); }
    by += ch * Math.abs(Math.sin(t * 8)) * 0.035;
    body.position.y = by * S; hs.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
    arms.forEach(({ a, sx }, i) => {
      let rx = (i ? sw : -sw) * 0.9, rz = sx * (0.55 + 0.05 * Math.sin(t * 1.7 + i));
      rx += tk * Math.sin(t * 3.2 + i * 2) * 0.35 * (1 - wv); rz += tk * sx * 0.25;
      if (i === 1) { rz += (sx * (2.5 + Math.sin(t * 9) * 0.32) - rz) * wv; rx *= 1 - wv; rx += (-1.35 - rx) * pt; rz += (sx * 0.28 - rz) * pt; }
      rx += (-2.2 - rx) * ch; rz += (sx * (0.25 + Math.sin(t * 8) * 0.08) - rz) * ch;
      rx += (-0.45 - rx) * pr; rz += (sx * 1.35 - rz) * pr;
      if (st.hop > 0) rz += sx * 1.4 * Math.sin((1 - st.hop / 0.75) * Math.PI);
      a.rotation.x = rx; a.rotation.z = rz; });
    head.rotation.z = Math.sin(st.ph) * 0.05 * w + tk * Math.sin(t * 5.3) * 0.04 + ch * Math.sin(t * 8) * 0.07 + pr * 0.1;
    head.rotation.x = tk * Math.sin(t * 3.1) * 0.03 - ch * 0.08; head.rotation.y += ((s.look || 0) - head.rotation.y) * Math.min(1, dt * 4);
    body.rotation.x = pt * 0.06 + w * 0.05;
    st.blink -= dt; let f = s.face != null ? s.face : FACE.normal; if (st.blink < 0.13 && f === FACE.normal) f = FACE.happy; if (st.blink < 0) st.blink = 2.5 + Math.random() * 3.5;
    if (f !== st.face) { st.face = f; setF(f); }
  }
  return { root, update, head, size, kind, top: top * S };
}
export const makeYodnam = (tex, size) => makeMascot('yod', tex, size);
