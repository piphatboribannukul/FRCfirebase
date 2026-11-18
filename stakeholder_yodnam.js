// น้องยอดน้ำ (มาสคอตการประปานครหลวง) แบบ 3 มิติ — ทรงหยดน้ำสร้างจากภาพต้นฉบับของ กปน. (เส้นขอบหัวทีละแถว)
// หน้าใช้ภาพจริง 4 อารมณ์ (stakeholder_yodnam_faces.webp: ปกติ, ยิ้มหลับตา, ขยิบตา, ตาประกาย) ฉายลงด้านหน้าศีรษะ
import * as THREE from 'three';

const W = 725, H = 975, Y1 = 973, C0 = 362;
const PROF = [[196,391,553],[204,373,553],[212,357,552],[220,341,548],[228,327,541],[236,313,527],[244,300,531],[252,287,534],[260,274,538],[268,262,542],[276,251,546],[284,240,550],[292,229,555],[300,218,559],[308,208,564],[316,198,569],[324,189,573],[332,180,578],[340,171,583],[348,162,588],[356,154,593],[364,146,598],[372,138,603],[380,131,608],[388,124,613],[396,117,618],[404,110,623],[412,103,627],[420,97,632],[428,91,637],[436,85,642],[444,80,646],[452,74,651],[460,69,655],[468,64,660],[476,60,664],[484,55,668],[492,51,672],[500,46,676],[508,43,680],[516,39,684],[524,35,687],[532,32,691],[540,29,694],[548,25,697],[556,23,700],[564,20,703],[572,17,706],[580,15,708],[588,13,711],[596,11,713],[604,9,715],[612,8,717],[620,6,718],[628,5,720],[636,3,721],[644,2,722],[652,2,723],[660,1,723],[668,0,724],[676,0,724],[684,0,724],[692,0,724],[700,0,723],[708,1,722],[716,1,721],[724,2,720],[732,3,719],[740,4,717],[748,6,715],[756,7,713],[764,9,711],[772,12,708],[780,14,705],[788,17,702],[796,20,698],[804,23,694],[812,27,690],[820,32,685],[828,36,680],[836,41,675],[844,47,669],[852,53,663],[860,59,656],[868,67,648],[876,74,640],[884,83,631],[892,92,622],[900,102,611],[908,114,600],[916,126,587],[924,140,573],[932,155,557],[940,173,539],[948,194,518],[956,220,492],[964,253,459],[970,291,420],[972,311,400]];
const BLUE = '#0d6fbf', LIGHT = '#8fd6f2', WHITE = '#f3f6f9';
export const FACE = { normal: 0, happy: 1, wink: 2, sparkle: 3 };

function headGeo(K, DZ = 0.9, SEG = 64) {
  const rows = PROF.map(([y, a, b]) => [y, (a + b) / 2, (b - a) / 2]);
  // ปลายบนปิดเรียว (ก๊อกครอบ) · ล่างปิดด้วยขั้ว
  const t = rows[0]; rows.unshift(...[[22, 12, 0.34], [18, 9, 0.5], [13, 6, 0.66], [7, 3, 0.83]].map(([dy, dx, k]) => [t[0] - dy, t[1] + dx, t[2] * k]));
  const pos = [], fuv = [], fr = [], idx = [];
  rows.forEach(([y, c, r]) => { for (let i = 0; i < SEG; i++) { const th = i / SEG * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), px = c + r * cs;
    pos.push((px - C0) * K, (Y1 - y) * K, r * K * DZ * sn); fuv.push(px / W, 1 - y / H); fr.push(Math.min(1, Math.max(0, (sn - 0.12) / 0.3))); } });
  const nR = rows.length;
  for (let j = 0; j < nR - 1; j++) for (let i = 0; i < SEG; i++) { const a = j * SEG + i, b = j * SEG + (i + 1) % SEG, c = a + SEG, d = b + SEG; idx.push(a, b, c, b, d, c); }
  const top = pos.length / 3; pos.push((rows[0][1] - C0) * K, (Y1 - rows[0][0] + 3) * K, 0); fuv.push(rows[0][1] / W, 0.8); fr.push(0);
  const bot = pos.length / 3, lb = rows[nR - 1]; pos.push((lb[1] - C0) * K, -0.002, 0); fuv.push(lb[1] / W, 1 - Y1 / H); fr.push(1);
  for (let i = 0; i < SEG; i++) { idx.push(top, (i + 1) % SEG, i); idx.push(bot, (nR - 1) * SEG + i, (nR - 1) * SEG + (i + 1) % SEG); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('faceUv', new THREE.Float32BufferAttribute(fuv, 2)); g.setAttribute('front', new THREE.Float32BufferAttribute(fr, 1));
  g.setIndex(idx); g.computeVertexNormals(); return { g, tip: [(rows[0][1] - C0) * K, (Y1 - rows[0][0]) * K], surf: (px, py) => { // จุดบนผิวหน้าที่ตรงกับพิกัดภาพ
    let best = rows[0]; for (const r of rows) if (Math.abs(r[0] - py) < Math.abs(best[0] - py)) best = r; const cs = (px - best[1]) / best[2]; return new THREE.Vector3((px - C0) * K, (Y1 - py) * K, best[2] * K * DZ * Math.sqrt(Math.max(0, 1 - cs * cs))); } };
}

function headMat(faceTex) {
  const m = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.28, metalness: 0, envMapIntensity: 1.1 });
  m.userData.face = { value: faceTex }; m.userData.off = { value: new THREE.Vector2(0, 0.5) };
  m.onBeforeCompile = sh => {
    sh.uniforms.faceMap = m.userData.face; sh.uniforms.faceOff = m.userData.off;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 faceUv; attribute float front; varying vec2 vFUv; varying float vFront;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFUv = faceUv; vFront = front;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D faceMap; uniform vec2 faceOff; varying vec2 vFUv; varying float vFront;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ vec4 fc = texture2D(faceMap, faceOff + vFUv * 0.5); float a = fc.a * vFront; diffuseColor.rgb = mix(diffuseColor.rgb, pow(fc.rgb, vec3(2.2)), a); }')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n{ vec4 fc2 = texture2D(faceMap, faceOff + vFUv * 0.5); roughnessFactor = mix(roughnessFactor, 0.55, fc2.a * vFront); }');
  };
  m.customProgramCacheKey = () => 'yodnam-head';
  return m;
}

const cap = (r, l, m, seg = 14) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, seg), m);
const sph = (r, m, s = [1, 1, 1], seg = 20) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), m); o.scale.set(...s); return o; };

// size = ความสูงรวม (ม.) · คืน { root, update(dt, state) }
export function makeYodnam(faceTex, size = 1.2) {
  const S = size / 1.05, K = 0.62 / (Y1 - 196);
  const bodyM = new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.3, metalness: 0 });
  const scarfM = new THREE.MeshStandardMaterial({ color: LIGHT, roughness: 0.45 });
  const whiteM = new THREE.MeshStandardMaterial({ color: WHITE, roughness: 0.3 });
  const hm = headMat(faceTex);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.scale.setScalar(S);
  // ลำตัว
  const torso = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.085, 0.008], [0.112, 0.05], [0.11, 0.12], [0.088, 0.18], [0.05, 0.215]].map(([r, y]) => new THREE.Vector2(r, y)), 28), bodyM);
  torso.scale.z = 0.9; torso.position.y = 0.13; body.add(torso);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.026, 10, 28), scarfM); scarf.rotation.x = Math.PI / 2; scarf.scale.set(1, 0.95, 0.75); scarf.position.y = 0.315; body.add(scarf);
  const knot = sph(0.034, scarfM, [1.3, 0.8, 0.6], 14); knot.position.set(0.035, 0.3, 0.075); knot.rotation.z = 0.4; body.add(knot);
  // ขา (หมุนที่สะโพก)
  const legs = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.055, 0.17, 0); const l = cap(0.052, 0.07, bodyM); l.position.y = -0.075; const f = sph(0.064, bodyM, [0.95, 0.62, 1.35]); f.position.set(sx * 0.008, -0.135, 0.03); p.add(l, f); body.add(p); return p; });
  // แขน (หมุนที่ไหล่) · มือกลมมีนิ้วโป้ง
  const arms = [-1, 1].map(sx => { const p = new THREE.Group(); p.position.set(sx * 0.1, 0.28, 0); const a = new THREE.Group(); p.add(a); a.rotation.z = sx * 0.55;
    const u = cap(0.036, 0.08, bodyM); u.position.y = -0.06; const h = sph(0.048, bodyM, [1, 1.05, 0.85]); h.position.y = -0.125; const th = sph(0.02, bodyM, [1, 1.4, 1]); th.position.set(-sx * 0.035, -0.105, 0.025); a.add(u, h, th); body.add(p); return { p, a, sx }; });
  // ศีรษะ
  const HG = headGeo(K), head = new THREE.Group(); head.position.y = 0.3; body.add(head);
  const hmesh = new THREE.Mesh(HG.g, hm); head.add(hmesh);
  const nose = sph(0.026, whiteM, [1.05, 0.9, 0.85], 16); nose.position.copy(HG.surf(255, 742)).add(new THREE.Vector3(0, 0, 0.006)); head.add(nose);
  // ก๊อกน้ำบนยอด
  const tap = new THREE.Group(); tap.position.set(HG.tip[0] + 0.004, HG.tip[1] + 0.006, 0); tap.rotation.z = -0.45; head.add(tap);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.075, 16), whiteM); stem.position.y = 0.035; tap.add(stem);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.018, 18), whiteM); collar.position.y = 0.06; tap.add(collar);
  const hub = sph(0.024, whiteM); hub.position.y = 0.085; tap.add(hub);
  for (const [rx, rz] of [[0, Math.PI / 2], [Math.PI / 2, 0]]) { const bar = cap(0.015, 0.11, whiteM); bar.rotation.set(rx, 0, rz); bar.position.y = 0.088; tap.add(bar); }
  const knob = cap(0.013, 0.02, whiteM); knob.position.y = 0.115; tap.add(knob);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  const st = { ph: 0, blink: 2 + Math.random() * 3, face: FACE.normal, faceT: 0, wave: 0, sit: 0 };
  const setFace = f => { const c = f % 2, r = Math.floor(f / 2); hm.userData.off.value.set(c * 0.5, 0.5 - r * 0.5); };
  setFace(FACE.normal);
  // state: { walk: 0..1 (ความเร็ว), wave: bool, talk: bool, sit: bool, face: FACE.x | null, look: radians (หันศีรษะ) }
  function update(dt, s = {}) {
    const w = s.walk || 0; st.ph += dt * (2.4 + 7.5 * w); st.wave += ((s.wave ? 1 : 0) - st.wave) * Math.min(1, dt * 6); st.sit += ((s.sit ? 1 : 0) - st.sit) * Math.min(1, dt * 6);
    const sw = Math.sin(st.ph) * 0.55 * Math.min(1, w * 1.6);
    legs[0].rotation.x = sw * (1 - st.sit) - 1.45 * st.sit; legs[1].rotation.x = -sw * (1 - st.sit) - 1.45 * st.sit;
    const tt = performance.now() / 1000;
    arms.forEach(({ a, sx }, i) => { const swing = (i ? sw : -sw) * 0.9; a.rotation.x = swing; a.rotation.z = sx * (0.55 + 0.05 * Math.sin(tt * 1.7));
      if (i === 1 && st.wave > 0.01) { a.rotation.z = lerpA(a.rotation.z, sx * (2.5 + Math.sin(tt * 9) * 0.32), st.wave); a.rotation.x *= 1 - st.wave; } });
    body.position.y = Math.abs(Math.sin(st.ph)) * 0.028 * Math.min(1, w * 1.6) * S + Math.sin(tt * 2.1) * 0.004 * S;
    head.rotation.z = Math.sin(st.ph) * 0.05 * Math.min(1, w * 1.6) + (s.talk ? Math.sin(tt * 5.3) * 0.035 : 0);
    head.rotation.x = s.talk ? Math.sin(tt * 3.1) * 0.03 : 0; head.rotation.y += ((s.look || 0) - head.rotation.y) * Math.min(1, dt * 4);
    // ใบหน้า: กะพริบตา (ใช้หน้ายิ้มหลับตาชั่วครู่) · ตั้งอารมณ์ชั่วคราวได้
    st.blink -= dt; let f = s.face != null ? s.face : FACE.normal; if (st.blink < 0.13 && f === FACE.normal) f = FACE.happy; if (st.blink < 0) st.blink = 2.5 + Math.random() * 3.5;
    if (f !== st.face) { st.face = f; setFace(f); }
  }
  return { root, update, setFace, head, size };
}
const lerpA = (a, b, t) => a + (b - a) * t;
