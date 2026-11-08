/* ═══════════════════════════════════════════════════════════════════════════
   stakeholder_building.js — โมเดลอาคารสุทธิอุทกากร (สำนักงานใหญ่ กปน.)
   ─ ใช้ร่วมกันทั้งฉากแผนที่ (three r128) และฉากชั้น 5 (three r160) ให้หน้าตาตรงกัน
   ─ รูปทรงจากรอยอาคาร OSM/Overture + ภาพถ่ายจริง:
       · หอสูง 12 ชั้น ผนังแถบขาว + หน้าต่างแถบสีฟ้า (ฝั่งถนนประชาชื่น/คลองประปา)
       · กล่องกระจกสีน้ำเงินด้านใต้ สูงกว่าหอ หลังคาเฉียง + ตรา กปน. วงกลม
       · อาคารฐาน 7 ชั้น ผนังโลหะสีเทา หน้าต่างแถบ ชั้นบนสุด 2 ชั้นเอียงยื่นออก + แผงบังแดด
       · อาคารโค้งด้านตะวันออก · สะพานลอยเชื่อมอาคารเดิมด้านใต้
   แกนท้องถิ่น: x = ตะวันออก, z = ใต้, y = ขึ้น · จุดกำเนิด = กลางกรอบอาคาร บนพื้นดิน
   ใช้:  SUTHI.build(THREE, { W, D, perLevel, fadeable, shadows, srgb, env })
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const FH = 4.2, NL = 12, BASE_TOP = 7, CROWN0 = 5;      // ความสูงชั้น · 12 ชั้น · ฐาน 7 ชั้น (ชั้น 6–7 เอียงยื่น)
  const W0 = 50.7, D0 = 70.8;                              // กรอบรวม ตอ.–ตต. × เหนือ–ใต้ (ม.)

  // ── พื้นผิว (วาดบน canvas) ─────────────────────────────────────────────
  const TILE = { tWin: 3.0, lobby: 3.0, prism: 6.0, pWin: 6.0, crown: 6.0, gnd: 3.0, old: 6.0 };
  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
  function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const PAINT = {
    tWin() {                                   // หน้าต่างแถบของหอ (3 ม. × 2.75 ม.)
      const [c, g] = cv(256, 236);
      const gr = g.createLinearGradient(0, 0, 0, 236); gr.addColorStop(0, '#a8d2f2'); gr.addColorStop(0.45, '#5f9ad8'); gr.addColorStop(1, '#2b64ad'); g.fillStyle = gr; g.fillRect(0, 0, 256, 236);
      const rf = g.createLinearGradient(0, 0, 256, 236); rf.addColorStop(0, 'rgba(255,255,255,0)'); rf.addColorStop(0.42, 'rgba(255,255,255,.22)'); rf.addColorStop(0.55, 'rgba(255,255,255,0)'); g.fillStyle = rf; g.fillRect(0, 0, 256, 236);
      g.fillStyle = 'rgba(16,40,80,.45)'; g.fillRect(0, 0, 256, 7);                        // เงาใต้แถบขาว
      g.fillStyle = '#eef3f7'; g.fillRect(0, 0, 12, 236); g.fillRect(124, 0, 7, 236); g.fillRect(0, 150, 256, 4);
      return c;
    },
    lobby() {                                  // กระจกโถงชั้นล่าง (3 ม. × 4.2 ม.)
      const [c, g] = cv(256, 358);
      const gr = g.createLinearGradient(0, 0, 0, 358); gr.addColorStop(0, '#8fc0ea'); gr.addColorStop(0.5, '#4f88c8'); gr.addColorStop(1, '#2d5d99'); g.fillStyle = gr; g.fillRect(0, 0, 256, 358);
      g.fillStyle = 'rgba(255,240,210,.18)'; g.fillRect(0, 210, 256, 148);
      g.fillStyle = '#e8eef4'; g.fillRect(0, 0, 8, 358); g.fillRect(126, 0, 5, 358); g.fillRect(0, 70, 256, 4); g.fillRect(0, 0, 256, 6);
      return c;
    },
    prism() {                                  // ผนังกระจกสีน้ำเงิน (6 ม. × 4.2 ม. · 4 × 3 บาน) — สะท้อนฟ้า ต่างกันเล็กน้อยทีละบาน
      const [c, g] = cv(512, 358), r = rnd(7);
      g.fillStyle = '#3f80cc'; g.fillRect(0, 0, 512, 358);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const x = i * 128, y = j * 119.3, k = (r() - 0.5) * 0.09;
        const gr = g.createLinearGradient(x, y, x + 40, y + 120);
        const col = (rr, gg, bb) => `rgb(${[rr, gg, bb].map(v => Math.max(0, Math.min(255, Math.round(v * (1 + k))))).join(',')})`;
        gr.addColorStop(0, col(104, 164, 226)); gr.addColorStop(1, col(52, 116, 196)); g.fillStyle = gr; g.fillRect(x, y, 128, 120);
      }
      const rf = g.createLinearGradient(0, 0, 512, 358); rf.addColorStop(0.15, 'rgba(255,255,255,0)'); rf.addColorStop(0.32, 'rgba(225,242,255,.30)'); rf.addColorStop(0.45, 'rgba(255,255,255,0)'); rf.addColorStop(0.7, 'rgba(255,255,255,0)'); rf.addColorStop(0.8, 'rgba(225,242,255,.16)'); rf.addColorStop(0.9, 'rgba(255,255,255,0)'); g.fillStyle = rf; g.fillRect(0, 0, 512, 358);
      g.fillStyle = '#d6e3ef'; for (let i = 0; i < 4; i++) g.fillRect(i * 128, 0, 5, 358); g.fillStyle = 'rgba(214,227,239,.85)'; for (let j = 0; j < 3; j++) g.fillRect(0, j * 119.3, 512, 3);
      return c;
    },
    pWin() {                                   // อาคารฐาน: แผงโลหะเทา + หน้าต่างแถบ (6 ม. × 4.2 ม.)
      const [c, g] = cv(512, 358);
      const gr = g.createLinearGradient(0, 0, 0, 358); gr.addColorStop(0, '#d3d8dd'); gr.addColorStop(1, '#bfc6cd'); g.fillStyle = gr; g.fillRect(0, 0, 512, 358);
      g.fillStyle = 'rgba(120,130,140,.35)'; for (let x = 0; x < 512; x += 64) g.fillRect(x, 0, 2, 358);
      const wy = 96, wh = 168, gg = g.createLinearGradient(0, wy, 0, wy + wh); gg.addColorStop(0, '#9fcaee'); gg.addColorStop(0.5, '#5590d0'); gg.addColorStop(1, '#2c5f9f');
      g.fillStyle = gg; g.fillRect(0, wy, 512, wh);
      g.fillStyle = 'rgba(15,35,70,.4)'; g.fillRect(0, wy, 512, 8);
      g.fillStyle = '#56616d'; for (let x = 0; x < 512; x += 64) g.fillRect(x, wy, 5, wh);
      g.fillStyle = '#eef2f5'; g.fillRect(0, wy + wh, 512, 6);
      return c;
    },
    crown() {                                  // ชั้นบนอาคารฐาน (แผงโลหะ + ช่องแสงแคบ)
      const [c, g] = cv(512, 358);
      const gr = g.createLinearGradient(0, 0, 0, 358); gr.addColorStop(0, '#dfe3e7'); gr.addColorStop(1, '#b9c0c7'); g.fillStyle = gr; g.fillRect(0, 0, 512, 358);
      g.fillStyle = 'rgba(110,120,132,.35)'; for (let y = 0; y < 358; y += 60) g.fillRect(0, y, 512, 2); for (let x = 0; x < 512; x += 128) g.fillRect(x, 0, 2, 358);
      for (let x = 20; x < 512; x += 128) { const gg = g.createLinearGradient(0, 196, 0, 250); gg.addColorStop(0, '#7fb1e2'); gg.addColorStop(1, '#2f629f'); g.fillStyle = gg; g.fillRect(x, 196, 88, 54); }
      return c;
    },
    gnd() {                                    // ชั้นล่างร่นเข้า (กระจกเข้ม)
      const [c, g] = cv(256, 358);
      const gr = g.createLinearGradient(0, 0, 0, 358); gr.addColorStop(0, '#3e5a78'); gr.addColorStop(1, '#22344a'); g.fillStyle = gr; g.fillRect(0, 0, 256, 358);
      g.fillStyle = 'rgba(255,236,200,.16)'; g.fillRect(0, 150, 256, 208);
      g.fillStyle = '#5e6a76'; g.fillRect(0, 0, 6, 358); g.fillRect(126, 0, 4, 358); g.fillRect(0, 0, 256, 10);
      return c;
    },
    old() {                                    // อาคารเดิม (ขาว + หน้าต่างแถบเข้ม)
      const [c, g] = cv(512, 300);
      g.fillStyle = '#f2f4f5'; g.fillRect(0, 0, 512, 300);
      const gg = g.createLinearGradient(0, 110, 0, 210); gg.addColorStop(0, '#6f8aa6'); gg.addColorStop(1, '#3b5470'); g.fillStyle = gg; g.fillRect(0, 108, 512, 104);
      g.fillStyle = '#f2f4f5'; for (let x = 0; x < 512; x += 64) g.fillRect(x, 108, 6, 104);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 108, 512, 6);
      return c;
    },
  };
  function logoCanvas() {                       // ตราวงกลม (ภาพย่อแบบเรียบ)
    const [c, g] = cv(512, 512);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(256, 256, 252, 0, 7); g.fill();
    g.strokeStyle = '#1d5fc0'; g.lineWidth = 30; g.beginPath(); g.arc(256, 256, 214, 0, 7); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 180, 0, 7); g.stroke();
    const gr = g.createLinearGradient(0, 120, 0, 400); gr.addColorStop(0, '#5fb6f0'); gr.addColorStop(1, '#1d5fc0'); g.fillStyle = gr; g.beginPath(); g.arc(256, 256, 150, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(256, 140); g.bezierCurveTo(300, 210, 330, 250, 330, 290); g.arc(256, 290, 74, 0, Math.PI); g.bezierCurveTo(182, 250, 212, 210, 256, 140); g.fill();
    g.strokeStyle = '#1d5fc0'; g.lineWidth = 10; for (const y of [300, 330]) { g.beginPath(); g.moveTo(196, y); g.bezierCurveTo(226, y - 18, 286, y + 18, 316, y); g.stroke(); }
    return c;
  }
  function signCanvas() {                       // ป้ายอาคารเดิม
    const [c, g] = cv(1024, 300);
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 1024, 300);
    g.drawImage(logoCanvas(), 30, 40, 220, 220);
    const fit = (txt, font, px, maxW) => { let k = px; do { g.font = font.replace('#', k); k -= 2; } while (g.measureText(txt).width > maxW && k > 10); };
    g.fillStyle = '#1d4f9e'; fit('การประปานครหลวง', '700 #px "Bai Jamjuree","IBM Plex Sans Thai",sans-serif', 104, 720); g.textBaseline = 'alphabetic'; g.fillText('การประปานครหลวง', 280, 160);
    g.fillStyle = '#2d6ab8'; fit('METROPOLITAN WATERWORKS AUTHORITY', '600 #px "Bai Jamjuree",sans-serif', 44, 720); g.fillText('METROPOLITAN WATERWORKS AUTHORITY', 284, 225);
    return c;
  }

  function build(T, o) {
    o = o || {};
    const W = o.W || W0, D = o.D || D0, sx = W / W0, sz = D / D0;
    const X = e => e * sx, Z = z => z * sz;                  // แปลงจากเมตรจริง → กรอบที่ขอ
    const per = !!o.perLevel, fade = !!o.fadeable, shadows = !!o.shadows, env = !!o.env;
    const ver = parseInt(T.REVISION, 10) || 0;
    const srgb = t => { if (!o.srgb) return; if (ver >= 152 && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; else if (T.sRGBEncoding) t.encoding = T.sRGBEncoding; };
    const disposeList = [];

    // พื้นผิวแบบแคช (ภาพเดียวกัน คนละอัตราซ้ำ)
    const base = {}, texCache = {};
    function tex(key, ru, rv) {
      const k = key + '|' + ru + '|' + rv; if (texCache[k]) return texCache[k];
      if (!base[key]) base[key] = PAINT[key]();
      const t = new T.CanvasTexture(base[key]); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(ru, rv); t.anisotropy = 8; srgb(t);
      texCache[k] = t; disposeList.push(t); return t;
    }
    // วัสดุ (แยกตามชั้นเมื่อ perLevel เพื่อทำให้จางทีละชั้นได้)
    const SOLID = {
      white: { color: 0xf3f5f7, roughness: 0.62 }, slab: { color: 0xe6e9ec, roughness: 0.6 },
      grey: { color: 0xc9cfd5, roughness: 0.5, metalness: env ? 0.35 : 0 }, dark: { color: 0x37414c, roughness: 0.55 },
      roof: { color: 0xb3b9bf, roughness: 0.8 }, roofT: { color: 0xdfe3e6, roughness: 0.8 }, col: { color: 0xeceff2, roughness: 0.55 },
      gplain: { color: 0x5b93d2, roughness: 0.15, metalness: env ? 0.4 : 0 }, frame: { color: 0xf6f7f8, roughness: 0.5 },
    };
    const GLASSY = { tWin: 1, lobby: 1, prism: 1, gnd: 1, gplain: 1 };
    const levels = []; for (let f = 0; f < NL; f++) levels.push({ f, mats: [], glassMats: [], cache: {}, edgeM: null, g: new T.Group() });
    const extras = { mats: [], glassMats: [], cache: {}, g: new T.Group() };
    const shared = { mats: [], glassMats: [], cache: {} };
    function bucket(L) { return per ? L : shared; }
    function mat(L, key, ru, rv) {
      const B = bucket(L), k = key + '|' + (ru || 0) + '|' + (rv || 0);
      if (B.cache[k]) return B.cache[k];
      let m;
      if (PAINT[key]) {
        const glass = !!GLASSY[key];
        m = new T.MeshStandardMaterial({ map: tex(key, ru || 1, rv || 1), color: 0xffffff, roughness: glass ? 0.18 : 0.55, metalness: glass && env ? 0.3 : (key === 'crown' || key === 'pWin') && env ? 0.2 : 0 });
        if (key === 'prism' && env) { m.roughness = 0.07; m.metalness = 0.5; m.envMapIntensity = 1.5; }
      } else m = new T.MeshStandardMaterial(Object.assign({}, SOLID[key]));
      if (fade) m.transparent = true;
      m.userData.glass = !!GLASSY[key]; m.userData.key = key;
      if (m.userData.glass) m.emissive = new T.Color(0xffe2a8), m.emissiveIntensity = 0;
      B.cache[k] = m; B.mats.push(m); if (m.userData.glass || key === 'old') B.glassMats.push(m); disposeList.push(m);
      return m;
    }
    const rep = (key, len) => Math.max(1, Math.round(len / TILE[key]));
    function mesh(L, geo, m, x, y, z, parent) {
      const o2 = new T.Mesh(geo, m); o2.position.set(x, y, z);
      if (shadows) { o2.castShadow = true; o2.receiveShadow = true; }
      (parent || L.g).add(o2); return o2;
    }
    // กล่องที่ด้านข้างใช้พื้นผิวตามความยาวด้าน · keys: [ข้าง, บน/ล่าง]
    function fbox(L, x0, x1, z0, z1, y, h, key, topKey, opt) {
      opt = opt || {};
      const w = x1 - x0, d = z1 - z0;
      const g = new T.BoxGeometry(w, h, d);
      if (opt.lean) {                                            // ยื่นด้านบนออก (ม.) ตามทิศ: [E, W, S, N] เริ่มที่ b ม. ถึง t ม.
        const p = g.attributes.position, [lb, lt] = opt.lean, s = opt.leanSides;
        for (let i = 0; i < p.count; i++) {
          const top = p.getY(i) > 0, a = top ? lt : lb;
          let vx = p.getX(i), vz = p.getZ(i);
          if (vx > 0 && s.E) vx += a; if (vx < 0 && s.W) vx -= a; if (vz > 0 && s.S) vz += a; if (vz < 0 && s.N) vz -= a;
          p.setX(i, vx); p.setZ(i, vz);
        }
        g.computeVertexNormals();
      }
      if (opt.wedge) {                                           // หลังคาเฉียง: ด้านเหนือเตี้ยกว่า
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getZ(i) < 0) p.setY(i, -h / 2 + opt.wedge);
        g.computeVertexNormals();
      }
      const rv = opt.rv || 1;
      const side = k2 => PAINT[k2] ? [mat(L, k2, rep(k2, d), rv), mat(L, k2, rep(k2, w), rv)] : [mat(L, k2), mat(L, k2)];
      const [sd, sw] = side(key), tp = mat(L, topKey || 'slab');
      const m = mesh(L, g, [sd, sd, tp, tp, sw, sw], (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
      if (opt.edge && L.edgeM) { const e = new T.LineSegments(new T.EdgesGeometry(g), L.edgeM); e.position.copy(m.position); L.g.add(e); disposeList.push(e.geometry); }
      disposeList.push(g);
      return m;
    }
    function sbox(L, w, h, d, key, x, y, z, parent) { const g = new T.BoxGeometry(w, h, d); disposeList.push(g); return mesh(L, g, mat(L, key), x, y, z, parent); }

    // ── ผัง (เมตรจริง → X/Z) ──
    const xW = X(-25.35), xE = X(25.35), zN = Z(-35.4), zS = Z(35.4);
    const tX0 = xW, tX1 = X(2.25), tZ0 = Z(6.25), tZ1 = zS;            // หอ (มุมตะวันตกเฉียงใต้)
    const bandZ1 = Z(24.4), slotZ1 = Z(25.2), pX0 = tX0 - 0.45;          // ส่วนแถบขาว / ร่อง / กล่องกระจก
    const B1 = [xW, xE, zN, tZ0], B2 = [tX1, xE, tZ0, zS];               // อาคารฐาน (รูปตัว L)
    const LEAN = 0.36;                                                   // อัตราเอียงของชั้นบนอาคารฐาน

    for (const L of levels) {
      const f = L.f; L.g.position.y = f * FH;
      if (fade) L.edgeM = new T.LineBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0, depthWrite: false });
      // อาคารฐาน
      if (f < BASE_TOP) for (const [k, b] of [['B1', B1], ['B2', B2]].map(a => [a[0], a[1]])) {
        const sides = k === 'B1' ? { E: 1, W: 1, N: 1 } : { E: 1, S: 1 };
        const [x0, x1, z0, z1] = b;
        if (f === 0) {                                                   // ชั้นล่างร่นเข้า + เสา
          const ins = 1.6, ix0 = sides.W ? x0 + ins : x0, ix1 = sides.E ? x1 - ins : x1, iz0 = sides.N ? z0 + ins : z0, iz1 = sides.S ? z1 - ins : z1;
          fbox(L, ix0, ix1, iz0, iz1, 0, FH, 'gnd', 'slab', { edge: true });
          const cols = [];
          if (sides.W) for (let z = z0 + 0.6; z <= z1 - 0.3; z += 6) cols.push([x0 + 0.4, z]);
          if (sides.E) for (let z = z0 + 0.6; z <= z1 - 0.3; z += 6) cols.push([x1 - 0.4, z]);
          if (sides.N) for (let x = x0 + 0.6; x <= x1 - 0.3; x += 6) cols.push([x, z0 + 0.4]);
          if (sides.S) for (let x = x0 + 0.6; x <= x1 - 0.3; x += 6) cols.push([x, z1 - 0.4]);
          cols.forEach(([cx, cz]) => sbox(L, 0.75, FH, 0.75, 'col', cx, FH / 2, cz));
        } else if (f < CROWN0) {                                         // ชั้น 2–5: แถบพื้น + ผนังหน้าต่าง
          fbox(L, x0 - 0.18, x1 + 0.18, z0 - (sides.N ? 0.18 : 0), z1 + (sides.S ? 0.18 : 0), 0, 0.5, 'slab', 'slab');
          fbox(L, x0, x1, z0, z1, 0.5, FH - 0.5, 'pWin', 'slab', { edge: true });
        } else {                                                          // ชั้น 6–7: เอียงยื่นออก
          const k0 = f === CROWN0 ? 0 : LEAN * (FH - 0.9), y0 = f === CROWN0 ? 0.9 : 0, k1 = k0 + LEAN * (FH - y0);
          if (f === CROWN0) fbox(L, x0 + (sides.W ? 0.5 : 0), x1 - (sides.E ? 0.5 : 0), z0 + (sides.N ? 0.5 : 0), z1 - (sides.S ? 0.5 : 0), 0, 0.9, 'dark', 'dark');
          fbox(L, x0, x1, z0, z1, y0, FH - y0, 'crown', 'roof', { lean: [k0, k1], leanSides: sides, edge: true });
          // แผงบังแดดเป็นแถว (ตามภาพถ่าย)
          const yy = y0 + (FH - y0) * 0.62, off = k0 + LEAN * (yy - y0) + 0.35;
          const fins = [];
          if (sides.W) for (let z = z0 + 3; z < z1 - 2; z += 5.2) fins.push([x0 - off, z, 0.9, 2.4]);
          if (sides.E) for (let z = z0 + 3; z < z1 - 2; z += 5.2) fins.push([x1 + off, z, 0.9, 2.4]);
          if (sides.N) for (let x = x0 + 3; x < x1 - 2; x += 5.2) fins.push([x, z0 - off, 2.4, 0.9]);
          if (sides.S) for (let x = x0 + 3; x < x1 - 2; x += 5.2) fins.push([x, z1 + off, 2.4, 0.9]);
          fins.forEach(([fx, fz, w, d]) => sbox(L, w, 0.32, d, 'dark', fx, yy, fz));
          if (f === BASE_TOP - 1) {                                      // หลังคาอาคารฐาน
            fbox(L, x0 - (sides.W ? k1 : 0), x1 + (sides.E ? k1 : 0), z0 - (sides.N ? k1 : 0), z1 + (sides.S ? k1 : 0), FH, 0.55, 'roof', 'roof');
            if (k === 'B1') [[X(-12), Z(-22), 9, 2.4, 7], [X(10), Z(-14), 7, 2.0, 5], [X(16), Z(-28), 5, 2.8, 5]].forEach(([x, z, w, h, d]) => sbox(L, w, h, d, 'roofT', x, FH + 0.55 + h / 2, z));
          }
        }
      }
      // หอสูง — ส่วนผนังแถบขาว
      if (f <= 1) fbox(L, tX0, tX1, tZ0, bandZ1, 0, FH, 'lobby', 'slab', { edge: true });
      else {
        fbox(L, tX0 - 0.22, tX1 + 0.22, tZ0 - 0.22, bandZ1, 0, 1.45, 'white', 'white');
        fbox(L, tX0, tX1, tZ0, bandZ1, 1.45, FH - 1.45, 'tWin', 'slab', { edge: true });
      }
      fbox(L, tX0 + 0.5, tX1 - 0.5, bandZ1, slotZ1, 0, FH, 'dark', 'dark');            // ร่องรอยต่อ
      // กล่องกระจกสีน้ำเงิน
      fbox(L, pX0, tX1 + 0.3, slotZ1, tZ1 + 0.3, 0, FH, 'prism', 'slab', { edge: true });
      if (f === NL - 1) {
        const top = FH;
        fbox(L, tX0 - 0.22, tX1 + 0.22, tZ0 - 0.22, bandZ1, top, 1.3, 'white', 'roofT');          // ขอบหลังคาหอ
        [[X(-16), Z(12), 7, 2.6, 6], [X(-6), Z(17), 5, 3.2, 5], [X(-19), Z(20), 3, 4.5, 3]].forEach(([x, z, w, h, d]) => sbox(L, w, h, d, 'roofT', x, top + 1.3 + h / 2, z));
        fbox(L, pX0, tX1 + 0.3, slotZ1, tZ1 + 0.3, top, 8.2, 'prism', 'roofT', { wedge: 4.0, rv: 2, edge: true });   // ยอดกระจกเฉียง
        // ตรา กปน. ฝั่งถนน
        const lt = new T.CanvasTexture(logoCanvas()); srgb(lt); lt.anisotropy = 8; disposeList.push(lt);
        const lm = new T.MeshBasicMaterial({ map: lt, transparent: true }); L.mats.push(lm); disposeList.push(lm); if (!per) shared.mats.push(lm);
        const disc = new T.Mesh(new T.CircleGeometry(2.4, 48), lm); disc.rotation.y = -Math.PI / 2; disc.position.set(pX0 - 0.06, top + 3.4, (slotZ1 + tZ1) / 2 + 0.6); L.g.add(disc);
        L.logo = disc;
      }
      // อาคารโค้งด้านตะวันออก (3 ชั้น)
      if (f < 3) {
        const ax0 = X(23.25), ax1 = X(35.75), az0 = Z(21.8), az1 = Z(40.9), r = 5;
        const sh = new T.Shape(); const w = ax1 - ax0, d = az1 - az0;
        sh.moveTo(0, 0); sh.lineTo(w - r, 0); sh.absarc(w - r, r, r, -Math.PI / 2, 0); sh.lineTo(w, d - r); sh.absarc(w - r, d - r, r, 0, Math.PI / 2); sh.lineTo(0, d); sh.lineTo(0, 0);
        const mk = (h, key, y) => { const g = new T.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 14 }); g.rotateX(Math.PI / 2); g.translate(ax0, y + h, az0); disposeList.push(g); return mesh(L, g, mat(L, key), 0, 0, 0); };
        mk(0.6, 'white', 0); mk(FH - 0.6, 'gplain', 0.6);
        if (f === 2) mk(0.5, 'white', FH);
      }
      // สะพานลอยเชื่อมอาคารเดิม (ชั้น 4)
      if (f === 3) {
        const bx = X(-15.5), bw = 4.6, z0 = tZ1 + 0.3, z1 = Z(54.4), y0 = 0.35, h = 3.2;
        fbox(L, bx - bw / 2, bx + bw / 2, z0, z1, y0 + 0.35, h - 0.7, 'gplain', 'frame');
        fbox(L, bx - bw / 2 - 0.15, bx + bw / 2 + 0.15, z0, z1, y0, 0.4, 'frame', 'frame');
        fbox(L, bx - bw / 2 - 0.15, bx + bw / 2 + 0.15, z0, z1, y0 + h - 0.35, 0.45, 'frame', 'frame');
        sbox(L, 1.0, 3 * FH + y0, 1.0, 'col', bx, -(3 * FH) / 2 + y0 / 2, (z0 + z1) / 2);
      }
      L.g.userData.level = f;
    }

    // ── อาคารเดิมด้านใต้ (ปลายสะพาน) ──
    {
      const ox0 = X(-24), ox1 = X(20), oz0 = Z(54.4), oz1 = Z(112), OH = 4.0, NO = 5;
      const E = extras;
      const pm = (key, ru) => { const B = E, k = key + '|' + ru; if (B.cache[k]) return B.cache[k]; const m = PAINT[key] ? new T.MeshStandardMaterial({ map: tex(key, ru, 1), roughness: 0.6 }) : new T.MeshStandardMaterial(Object.assign({}, SOLID[key])); if (fade) m.transparent = true; B.cache[k] = m; B.mats.push(m); disposeList.push(m); return m; };
      for (let f = 0; f < NO; f++) {
        const g = new T.BoxGeometry(ox1 - ox0, OH, oz1 - oz0); disposeList.push(g);
        const sd = pm('old', rep('old', oz1 - oz0)), sw = pm('old', rep('old', ox1 - ox0)), tp = pm('slab');
        const m = new T.Mesh(g, [sd, sd, tp, tp, sw, sw]); m.position.set((ox0 + ox1) / 2, f * OH + OH / 2, (oz0 + oz1) / 2); if (shadows) m.castShadow = m.receiveShadow = true; E.g.add(m);
      }
      const rg = new T.BoxGeometry(ox1 - ox0 + 0.6, 1.0, oz1 - oz0 + 0.6); disposeList.push(rg);
      const rf = new T.Mesh(rg, pm('white')); rf.position.set((ox0 + ox1) / 2, NO * OH + 0.5, (oz0 + oz1) / 2); E.g.add(rf);
      // ป้ายชื่อ + ตรา บนผนังฝั่งถนน
      const st = new T.CanvasTexture(signCanvas()); srgb(st); st.anisotropy = 8; disposeList.push(st);
      const sm = new T.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }); E.mats.push(sm); disposeList.push(sm);
      const sg = new T.PlaneGeometry(17, 5); disposeList.push(sg);
      const sign = new T.Mesh(sg, sm); sign.rotation.y = -Math.PI / 2; sign.position.set(ox0 - 0.08, NO * OH - 3.4, oz0 + 13); E.g.add(sign);
    }

    const grp = new T.Group(); levels.forEach(L => grp.add(L.g)); grp.add(extras.g);
    const allGlass = per ? levels.flatMap(L => L.glassMats).concat(extras.glassMats) : shared.glassMats;
    if (!per) levels.forEach(L => { L.mats = shared.mats; L.glassMats = shared.glassMats; });
    return {
      grp, levels, extras, FH, NL, H: NL * FH + 8.2,
      bbox: { x0: xW, x1: xE, z0: zN, z1: zS },
      setNight(on) { allGlass.forEach(m => { if (m.emissive) m.emissiveIntensity = on ? 0.5 : 0; }); },
      dispose() { disposeList.forEach(d => d && d.dispose && d.dispose()); },
    };
  }

  window.SUTHI = { build, FH, NL };
})();
