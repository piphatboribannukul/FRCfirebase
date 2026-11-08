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
  const NC = -5.9;                                          // กลางกรอบอาคาร ตามแนว n ของผังโรงงาน (ม.) — ตำแหน่งฐานตึกจากภาพดาวเทียม

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
  function PAINT_SOLAR() { const [c, g] = cv(128, 128); g.fillStyle = '#26406a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#9fb3cc'; for (let i = 0; i <= 128; i += 32) g.fillRect(i, 0, 2, 128); for (let j = 0; j <= 128; j += 16) g.fillRect(0, j, 128, 1); return c; }
  // ── ตรา กปน. (พระแม่ธรณี) จากไฟล์ภาพจริง · วาดวงกลมสำรองไว้ก่อนจนกว่าภาพจะโหลดเสร็จ ──
  const LOGO = { img: null, ok: false, waits: [] };
  function onLogo(f) {
    if (!LOGO.img) { LOGO.img = new Image(); LOGO.img.onload = () => { LOGO.ok = true; LOGO.waits.splice(0).forEach(fn => { try { fn(); } catch (e) {} }); }; LOGO.img.src = window.SUTHI_LOGO || 'stakeholder_logo.png'; }
    if (LOGO.ok) f(); else LOGO.waits.push(f);
  }
  function drawLogo(g, x, y, r) {
    if (LOGO.ok) { g.drawImage(LOGO.img, x - r, y - r, r * 2, r * 2); return; }
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.strokeStyle = '#1d5fc0'; g.lineWidth = r * 0.06; g.beginPath(); g.arc(x, y, r * 0.92, 0, 7); g.stroke();
    g.fillStyle = '#bfe3f7'; g.beginPath(); g.arc(x, y, r * 0.6, 0, 7); g.fill();
  }
  function logoCanvas() { const [c, g] = cv(512, 512); drawLogo(g, 256, 256, 254); return c; }
  function signCanvas() {                       // ป้ายอาคารเดิม: ตรา + ชื่อ (แนวตั้ง บนผนังขาวฝั่งถนน)
    const [c, g] = cv(640, 900);
    drawLogo(g, 320, 300, 250);
    const fit = (txt, font, px, maxW) => { let k = px; do { g.font = font.replace('#', k); k -= 2; } while (g.measureText(txt).width > maxW && k > 10); };
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#1d4f9e'; fit('การประปานครหลวง', '700 #px "Bai Jamjuree","IBM Plex Sans Thai",sans-serif', 96, 600); g.fillText('การประปานครหลวง', 320, 690);
    g.fillStyle = '#2d6ab8'; fit('METROPOLITAN WATERWORKS AUTHORITY', '600 #px "Bai Jamjuree",sans-serif', 40, 600); g.fillText('METROPOLITAN WATERWORKS AUTHORITY', 320, 760);
    g.fillStyle = '#3f86d6'; g.fillRect(150, 790, 340, 8);
    return c;
  }
  // พื้นผิวที่อัปเดตตัวเองเมื่อภาพตราโหลดเสร็จ
  function liveTex(T, make, srgb, list) { const t = new T.CanvasTexture(make()); srgb(t); t.anisotropy = 8; list.push(t); onLogo(() => { t.image = make(); t.needsUpdate = true; }); return t; }

  function build(T, o) {
    o = o || {};
    const W = o.W || W0, D = o.D || D0, sx = W / W0, sz = D / D0;
    const X = e => e * sx, Z = z => z * sz;                  // แปลงจากเมตรจริง → กรอบที่ขอ
    const SL = (e, n) => [e - 0.05, NC - n];                 // พิกัดผังโรงงาน (e, n) → พิกัดของอาคารนี้ (เมตรจริง ไม่ย่อขยายตามกรอบ)
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
        const lt = liveTex(T, logoCanvas, srgb, disposeList);
        const lm = new T.MeshBasicMaterial({ map: lt, transparent: true }); L.mats.push(lm); disposeList.push(lm); if (!per) shared.mats.push(lm);
        const disc = new T.Mesh(new T.CircleGeometry(2.7, 64), lm); disc.rotation.y = -Math.PI / 2; disc.position.set(pX0 - 0.06, top + 3.4, (slotZ1 + tZ1) / 2 + 0.6); L.g.add(disc);
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
        const bx = X(13), bw = 4.2, z0 = tZ1 + 0.3, z1 = SL(0, -79)[1], y0 = 0.35, h = 3.2;   // สะพานจากด้านใต้ไปปีกเหนือของอาคารเดิม (~38 ม. ตามภาพดาวเทียม)
        fbox(L, bx - bw / 2, bx + bw / 2, z0, z1, y0 + 0.35, h - 0.7, 'gplain', 'frame');
        fbox(L, bx - bw / 2 - 0.15, bx + bw / 2 + 0.15, z0, z1, y0, 0.4, 'frame', 'frame');
        fbox(L, bx - bw / 2 - 0.15, bx + bw / 2 + 0.15, z0, z1, y0 + h - 0.35, 0.45, 'frame', 'frame');
        sbox(L, 1.0, 3 * FH + y0, 1.0, 'col', bx, -(3 * FH) / 2 + y0 / 2, (z0 + z1) / 2);
      }
      L.g.userData.level = f;
    }

    // ── อาคารเดิม (สำนักงานใหญ่เดิม) + ลานพระบรมราชานุสาวรีย์ รัชกาลที่ 5 — รูปทรงวัดจากภาพ Google Earth ──
    {
      const E = extras;
      const pm = (key, ru, rv) => { const k = key + '|' + (ru || 0) + '|' + (rv || 0); if (E.cache[k]) return E.cache[k]; const m = PAINT[key] ? new T.MeshStandardMaterial({ map: tex(key, ru || 1, rv || 1), roughness: 0.6 }) : new T.MeshStandardMaterial(Object.assign({}, SOLID[key] || { color: key, roughness: 0.85 })); if (fade) m.transparent = true; E.cache[k] = m; E.mats.push(m); disposeList.push(m); return m; };
      const put = (geo, m, x, y, z, cast) => { const me = new T.Mesh(geo, m); me.position.set(x, y, z); if (shadows) { me.castShadow = cast !== false; me.receiveShadow = true; } E.g.add(me); disposeList.push(geo); return me; };
      // กล่องตามพิกัดผัง (e0..e1, n0..n1) สูงจาก y0 ไป h · ด้านข้างใช้ลายหน้าต่าง
      const ob = (e0, e1, n0, n1, y0, h, key, topKey, floors) => {
        const [x0, z1] = SL(e0, n0), [x1, z0] = SL(e1, n1), w = x1 - x0, d = z1 - z0;
        const rv = floors || 1, sd = PAINT[key] ? pm(key, rep(key, d), rv) : pm(key), sw = PAINT[key] ? pm(key, rep(key, w), rv) : pm(key), tp = pm(topKey || 'roofT');
        return put(new T.BoxGeometry(w, h, d), [sd, sd, tp, tp, sw, sw], (x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
      };
      const flat = (e0, e1, n0, n1, y, m) => { const [x0, z1] = SL(e0, n0), [x1, z0] = SL(e1, n1); const g = new T.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); return put(g, m, (x0 + x1) / 2, y, (z0 + z1) / 2, false); };
      const OH = 4.0;
      // ปีกเหนือ 5 ชั้น (ปลายสะพาน) + โดมหอผึ่งเย็น 3 ลูกบนหลังคา
      ob(-40, 40, -100, -79, 0, OH * 5, 'old', 'roofT', 5);
      ob(-40.6, 40.6, -100.6, -78.4, OH * 5, 1.0, 'white', 'roofT');
      const domeM = pm('#e9ecef');
      for (const e of [-11, -3.5, 4]) { const [x, z] = SL(e, -91); put(new T.CylinderGeometry(2.3, 2.3, 1.8, 28), domeM, x, OH * 5 + 1.9, z); put(new T.SphereGeometry(2.3, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeM, x, OH * 5 + 2.8, z); }
      ob(28, 37, -88, -79, 0, OH * 6 + 1, 'white', 'roofT');                                       // หอบันได (กรอบขาวสูง)
      // ผนังขาวฝั่งถนน + ตรา/ชื่อ (ตามภาพถ่ายจากคลองประปา)
      ob(-41.2, -40, -100, -79, 0, OH * 5 + 3, 'white', 'roofT');
      { const st = liveTex(T, signCanvas, srgb, disposeList); const sm = new T.MeshBasicMaterial({ map: st, transparent: true }); if (fade) sm.transparent = true; E.mats.push(sm); disposeList.push(sm);
        const [x, z] = SL(-41.3, -89.5); const sg = new T.PlaneGeometry(13, 18.3); const sign = put(sg, sm, x - 0.02, 11.8, z, false); sign.rotation.y = -Math.PI / 2; }
      // ปีกยาว 4 ปีก (4 ชั้น) มีช่องแสงคั่น — ปีกตะวันออกมีโซลาร์บนหลังคา
      for (const [e0, e1] of [[-7.5, 0], [9, 30]]) {   /* ปีกฝั่งตะวันตก 2 ปีกเอาออก (ลานพระรูปเปิดโล่ง) */ ob(e0, e1, -160, -100, 0, OH * 4, 'old', 'roofT', 4); ob(e0 - 0.3, e1 + 0.3, -160.3, -100, OH * 4, 0.8, 'white', 'roofT'); }
      ob(-7.5, 9, -160, -150, 0, OH * 4, 'old', 'roofT', 4);
      // ส่วนใต้ 3 ชั้น + โซลาร์ + หลังคาทางเข้า
      ob(0, 37.5, -215, -160, 0, OH * 3, 'old', 'roofT', 3); ob(-0.3, 37.8, -215.3, -160, OH * 3, 0.8, 'white', 'roofT');
      ob(14, 34, -127, -104, OH * 4 + 0.9, 0.22, '#26406a', '#2c4a78'); ob(6, 32, -205, -170, OH * 3 + 0.9, 0.22, '#26406a', '#2c4a78');
      { const sol = PAINT_SOLAR(); const t = new T.CanvasTexture(sol); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(8, 10); srgb(t); disposeList.push(t);
        const sm2 = new T.MeshStandardMaterial({ map: t, roughness: 0.4 }); if (fade) sm2.transparent = true; E.mats.push(sm2); disposeList.push(sm2);
        flat(14, 34, -127, -104, OH * 4 + 1.03, sm2); flat(6, 32, -205, -170, OH * 3 + 1.03, sm2); }
      ob(8, 30, -219, -215, 3.4, 0.35, 'white', 'white');
      // ── ลานพระบรมราชานุสาวรีย์ (สนามหญ้า ทางเดินเหลือง ลานแดง) ──
      const grass = pm('#78a656'), grass2 = pm('#6d9c4c'), path = pm('#e2c14f'), pave = pm('#cfccc4'), red = pm('#c25a4b');
      flat(-60, -36, -262, -100, 0.06, grass); flat(-36, -18, -200, -100, 0.06, grass2); flat(-18, -8, -200, -100, 0.06, grass); flat(-36, -3, -262, -200, 0.06, grass);
      flat(-20.5, -15.5, -199, -128, 0.09, path); flat(-58, -42, -166, -162, 0.09, path); flat(-50, -15.5, -197.5, -193, 0.09, path);
      for (let i = 0; i < 10; i++) { const a = i / 9, e = -59 + 20 * a, n = -150 + 22 * Math.sin(a * Math.PI / 2); flat(e - 1.6, e + 1.6, n - 1.6, n + 1.6, 0.085, path); }   // ทางเดินโค้ง
      flat(-42, -20, -172, -153, 0.1, pave); flat(-40, -27, -192, -172, 0.1, red);
      // พระบรมรูป: แท่นฐาน + องค์พระรูปสีสำริด หันหน้าไปทางถนน
      { const [x, z] = SL(-31, -162.5), stone = pm('#efeee9'), bronze = new T.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.45, metalness: 0.55 }); if (fade) bronze.transparent = true; E.mats.push(bronze); disposeList.push(bronze);
        put(new T.BoxGeometry(5.2, 0.5, 5.2), stone, x, 0.35, z); put(new T.BoxGeometry(3.6, 0.6, 3.6), stone, x, 0.9, z); put(new T.BoxGeometry(2.2, 2.6, 2.2), stone, x, 2.5, z); put(new T.BoxGeometry(2.6, 0.3, 2.6), stone, x, 3.95, z);
        const fig = new T.Group(); fig.position.set(x, 4.1, z); fig.rotation.y = -Math.PI / 2; E.g.add(fig);
        const P = (geo, px, py, pz) => { const me = new T.Mesh(geo, bronze); me.position.set(px, py, pz); if (shadows) me.castShadow = true; fig.add(me); disposeList.push(geo); return me; };
        P(new T.CylinderGeometry(0.26, 0.34, 1.1, 14), 0, 0.55, 0); P(new T.CylinderGeometry(0.3, 0.26, 0.85, 14), 0, 1.5, 0); P(new T.SphereGeometry(0.17, 16, 12), 0, 2.1, 0); P(new T.CylinderGeometry(0.2, 0.2, 0.12, 16), 0, 2.27, 0);
        const arm = P(new T.CylinderGeometry(0.08, 0.07, 0.75, 10), 0.33, 1.42, 0); arm.rotation.z = 0.12; const arm2 = P(new T.CylinderGeometry(0.08, 0.07, 0.75, 10), -0.33, 1.42, 0); arm2.rotation.z = -0.12;
        // ไม้ดัดทรงกรวย + ไม้พุ่มดอกรอบลาน
        const cone = pm('#3f7d3a'), bush = pm('#d4508a');
        for (let n = -131; n > -197; n -= 4.4) for (const e of [-22.2, -13.8]) { const [cx, cz] = SL(e, n); put(new T.ConeGeometry(0.85, 2.6, 14), cone, cx, 1.3, cz); }
        for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, [bx, bz] = SL(-31 + Math.cos(a) * 7.5, -162.5 + Math.sin(a) * 6.5); put(new T.SphereGeometry(0.75, 12, 8), i % 2 ? bush : cone, bx, 0.6, bz); }
        // เสาธงชาติ 3 ต้น หน้าลาน
        const pole = pm('#e8ebee'), flagT = (() => { const [c, g] = cv(96, 64); [['#a51931', 0, 11], ['#f4f5f8', 11, 11], ['#2d2a4a', 22, 20], ['#f4f5f8', 42, 11], ['#a51931', 53, 11]].forEach(([col, y, h]) => { g.fillStyle = col; g.fillRect(0, y, 96, h); }); const t = new T.CanvasTexture(c); srgb(t); disposeList.push(t); return t; })();
        const fm = new T.MeshStandardMaterial({ map: flagT, side: T.DoubleSide, roughness: 0.8 }); if (fade) fm.transparent = true; E.mats.push(fm); disposeList.push(fm);
        for (const n of [-205, -209, -213]) { const [px, pz] = SL(-56, n); put(new T.CylinderGeometry(0.07, 0.09, 12, 8), pole, px, 6, pz); const fl = put(new T.PlaneGeometry(2.4, 1.6), fm, px, 11, pz + 1.25, false); fl.rotation.y = Math.PI / 2; }
      }
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

  // ═════════════════════════════════════════════════════════════════════════
  //  บริเวณรอบอาคาร: โรงงานผลิตน้ำบางเขน + สนามกีฬา + คลองประปา
  //  พิกัดวัดจากภาพ Google Earth (ภาพตรงลงพื้น) ปรับให้ตรงกับรอยอาคาร OSM แล้ว
  //  ระบบพิกัดของผัง: e = ตามแนวขวาง (ตะวันออก), n = ตามแนวยาวของโรงงาน (เหนือ) เอียง 13.4° · หน่วยเมตร จากหมุด กปน.
  // ═════════════════════════════════════════════════════════════════════════
  const SITE_ROT = -0.2330;                                   // หมุนแกน (e, −n) → (ตอ., ใต้)
  const SITE = {
    tanks: { e: [210.5, 292.4, 375.1, 456.3], n0: 92.1, dn: 66.24, dc: 0.6, R: 30.5, empty: ['2,4', '3,4', '3,5'], channels: [251.4, 415.8], road: 333.7 },
    tankField: [172, 506, 50, 470],
    filters: { blocks: [[178, 254], [259, 336], [345, 421], [426, 503]], n: [-54, 46], rows: 8, solarBlock: 3 },
    plantYard: [168, 512, -84, 50],
    sludge: [142, 648, -330, -88],
    lagoons: { e: [552, 722], n: [[388, 505, 'dry'], [242, 378, 'dry2'], [96, 232, 'marsh'], [-62, 86, 'water']] },
    stadium: { e: 5, n: 274.5, w: 84, l: 165 },
    stand: [-51, -37, 248, 310],
    canal: [-92, -60, -700, 560],
    solar: [[-310, -176], [-170, -46], [-36, 108]], solarE: [-87, -74],
    reservoir: [[-70, 392], [92, 392], [118, 418], [118, 600], [-70, 600]],
  };
  const siteToWorld = (e, n) => [0.973 * e + 0.231 * n, 0.231 * e - 0.973 * n];          // → (x ตอ., z ใต้)

  const SP = {                                                 // พื้นผิวของโรงงาน
    tank(empty) {
      const [c, g] = cv(512, 512), C = 256;
      const gr = g.createRadialGradient(C, C, 20, C, C, 256);
      if (empty) { gr.addColorStop(0, '#d6d4cb'); gr.addColorStop(1, '#b6b3a9'); } else { gr.addColorStop(0, '#7cc0ea'); gr.addColorStop(0.7, '#4a98d6'); gr.addColorStop(1, '#3a84c4'); }
      g.fillStyle = gr; g.beginPath(); g.arc(C, C, 256, 0, 7); g.fill();
      g.strokeStyle = empty ? 'rgba(110,108,100,.55)' : 'rgba(225,240,236,.32)'; g.lineWidth = 2;
      for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; g.beginPath(); g.moveTo(C + Math.cos(a) * 46, C + Math.sin(a) * 46); g.lineTo(C + Math.cos(a) * 222, C + Math.sin(a) * 222); g.stroke(); }
      g.strokeStyle = empty ? '#a19e94' : '#a9bdb5'; g.lineWidth = 14; g.beginPath(); g.arc(C, C, 232, 0, 7); g.stroke();
      g.strokeStyle = empty ? '#8e8b82' : 'rgba(210,225,220,.55)'; g.lineWidth = 4; g.beginPath(); g.arc(C, C, 150, 0, 7); g.stroke();
      g.fillStyle = '#d4d6d0'; g.beginPath(); g.arc(C, C, 40, 0, 7); g.fill(); g.strokeStyle = '#7d8580'; g.lineWidth = 4; g.stroke();
      return c;
    },
    solar() {
      const [c, g] = cv(128, 128);
      g.fillStyle = '#26406a'; g.fillRect(0, 0, 128, 128);
      const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, 'rgba(160,190,230,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#9fb3cc'; for (let i = 0; i <= 128; i += 32) { g.fillRect(i, 0, 2, 128); } for (let j = 0; j <= 128; j += 16) g.fillRect(0, j, 128, 1);
      return c;
    },
    stadium() {                                               // 100 × 180 ม. · 5.12 px/ม.
      const k = 5.12, W = 512, H = 922, [c, g] = cv(W, H), cx = W / 2, cy = H / 2;
      g.fillStyle = '#86ab68'; g.fillRect(0, 0, W, H);
      const lane = (hw, hl, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(cx - hw * k, cy - hl * k); g.arc(cx, cy - hl * k, hw * k, Math.PI, 0); g.lineTo(cx + hw * k, cy + hl * k); g.arc(cx, cy + hl * k, hw * k, 0, Math.PI); g.closePath(); g.fill(); };
      const hl = 82.5 - 42; lane(42, hl, '#b9574a');
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2;
      for (let i = 1; i < 8; i++) { const hw = 42 - i * 1.22; g.beginPath(); g.moveTo(cx - hw * k, cy - hl * k); g.arc(cx, cy - hl * k, hw * k, Math.PI, 0); g.lineTo(cx + hw * k, cy + hl * k); g.arc(cx, cy + hl * k, hw * k, 0, Math.PI); g.closePath(); g.stroke(); }
      lane(32.2, hl, '#5e9d48');
      for (let i = -6; i < 6; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; g.fillRect(cx - 30 * k, cy + i * 9 * k, 60 * k, 9 * k); }
      g.strokeStyle = '#f5f7f2'; g.lineWidth = 2.2; const pw = 30, ph = 50;
      g.strokeRect(cx - pw * k, cy - ph * k, 2 * pw * k, 2 * ph * k); g.beginPath(); g.moveTo(cx - pw * k, cy); g.lineTo(cx + pw * k, cy); g.stroke();
      g.beginPath(); g.arc(cx, cy, 9 * k, 0, 7); g.stroke();
      for (const s of [-1, 1]) { g.strokeRect(cx - 20 * k, cy + s * ph * k - (s > 0 ? 16 : 0) * k, 40 * k, 16 * k); g.strokeRect(cx - 9 * k, cy + s * ph * k - (s > 0 ? 5.5 : 0) * k, 18 * k, 5.5 * k); }
      return c;
    },
    sludge() {                                                // ลานตากตะกอน (แปลงสี่เหลี่ยม)
      const [c, g] = cv(1024, 512), r = rnd(11), NC = 26, NR = 12, cw = 1024 / NC, ch = 512 / NR;
      g.fillStyle = '#c8bca2'; g.fillRect(0, 0, 1024, 512);
      for (let i = 0; i < NC; i++) for (let j = 0; j < NR; j++) {
        const t = r(), base = t < 0.12 ? [92, 82, 66] : t < 0.3 ? [150, 128, 98] : [168 + r() * 18, 150 + r() * 14, 120 + r() * 12];
        g.fillStyle = `rgb(${base.map(v => v | 0)})`; g.fillRect(i * cw + 2, j * ch + 2, cw - 4, ch - 4);
        g.strokeStyle = 'rgba(80,66,50,.35)'; g.lineWidth = 1;
        for (let q = 0; q < 6; q++) { g.beginPath(); const x = i * cw + 4 + r() * (cw - 8), y = j * ch + 4 + r() * (ch - 8); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 14); g.stroke(); }
      }
      return c;
    },
    lagoon(kind) {
      const [c, g] = cv(256, 256), r = rnd(kind.length * 31 + 5);
      const P = { dry: ['#c2b58f', '#9aa877'], dry2: ['#b9ab88', '#8ea06c'], marsh: ['#7f9d6c', '#a7b88e'], water: ['#8db49c', '#6f9a86'] }[kind];
      g.fillStyle = P[0]; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) { g.fillStyle = P[1]; g.globalAlpha = 0.25 + r() * 0.4; g.beginPath(); g.ellipse(r() * 256, r() * 256, 4 + r() * 22, 3 + r() * 14, r() * 3, 0, 7); g.fill(); }
      g.globalAlpha = 1; return c;
    },
    whiteRoof() { const [c, g] = cv(256, 256); g.fillStyle = '#f1f3f4'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(150,160,170,.25)'; g.fillRect(0, 0, 256, 2); g.fillRect(0, 0, 2, 256); g.fillStyle = 'rgba(160,170,180,.5)'; g.beginPath(); g.arc(128, 128, 7, 0, 7); g.fill(); return c; },
    softDisc() { const [c, g] = cv(256, 256), gr = g.createRadialGradient(128, 128, 70, 128, 128, 128); gr.addColorStop(0, 'rgba(20,30,30,.55)'); gr.addColorStop(0.75, 'rgba(20,30,30,.28)'); gr.addColorStop(1, 'rgba(20,30,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return c; },
    wallGrad() { const [c, g] = cv(8, 128), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#f2f1ec'); gr.addColorStop(0.75, '#d3d1c8'); gr.addColorStop(1, '#a9a79e'); g.fillStyle = gr; g.fillRect(0, 0, 8, 128); return c; },
    ground(col, dots) { const [c, g] = cv(128, 128), r = rnd(3); g.fillStyle = col; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 220; i++) { g.fillStyle = dots[i % dots.length]; g.globalAlpha = 0.35; g.fillRect(r() * 128, r() * 128, 2 + r() * 3, 2 + r() * 3); } g.globalAlpha = 1; return c; },
  };

  function buildSite(T, o) {
    o = o || {};
    const ver = parseInt(T.REVISION, 10) || 0;
    const srgb = t => { if (!o.srgb) return; if (ver >= 152 && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; else if (T.sRGBEncoding) t.encoding = T.sRGBEncoding; };
    const disp = [], mats = [];
    const grp = new T.Group(), root = new T.Group(); root.rotation.y = SITE_ROT; grp.add(root);   // ภายใน root: x = e, z = −n
    const ctex = (c, ru, rv) => { const t = new T.CanvasTexture(c); srgb(t); t.anisotropy = 8; if (ru || rv) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(ru || 1, rv || 1); } disp.push(t); return t; };
    const M = (p) => { const m = new T.MeshStandardMaterial(Object.assign({ roughness: 0.9 }, p)); if (o.fadeable) m.transparent = true; mats.push(m); disp.push(m); return m; };
    const add = (geo, m, x, y, z, parent) => { const me = new T.Mesh(geo, m); me.position.set(x, y, z); if (o.shadows) me.receiveShadow = true; (parent || root).add(me); disp.push(geo); return me; };
    // ระนาบบนพื้นในกรอบ [e0,e1,n0,n1]
    const flat = (r, m, y) => { const g = new T.PlaneGeometry(r[1] - r[0], r[3] - r[2]); g.rotateX(-Math.PI / 2); return add(g, m, (r[0] + r[1]) / 2, y, -(r[2] + r[3]) / 2); };
    const blk = (e0, e1, n0, n1, y0, h, m, cast) => { const me = add(new T.BoxGeometry(e1 - e0, h, n1 - n0), m, (e0 + e1) / 2, y0 + h / 2, -(n0 + n1) / 2); if (o.shadows && cast) me.castShadow = true; return me; };
    const water = c => M({ color: c, roughness: 0.25, metalness: o.env ? 0.15 : 0 });
    const concrete = M({ color: 0xd2d0c8, roughness: 0.85 });

    // ── คลองประปา: น้ำสีน้ำตาลอ่อน ผนังคอนกรีตขาว แผงโซลาร์ลอยน้ำบนทุ่นสีขาว · ริมฝั่ง กปน. มีแนวหลังคาทางเดิน ──
    const [ce0, ce1, cn0, cn1] = SITE.canal, sunk = o.sunken !== false, wy = sunk ? -1.25 : 0.05;
    flat([ce0, ce1, cn0, cn1], water(0x8f866a), wy);
    const wallW = M({ color: 0xeeeeea, roughness: 0.8 });
    for (const [a, b] of [[ce0 - 0.6, ce0], [ce1, ce1 + 0.6]]) { blk(a, b, cn0, cn1, sunk ? -1.8 : 0, sunk ? 2.75 : 0.95, wallW, true); blk(a - 0.15, b + 0.15, cn0, cn1, sunk ? 0.95 : 0.95, 0.12, concrete); }
    {
      const [se0, se1] = SITE.solarE, panels = [], rowsN = [];
      for (const [a, b] of SITE.solar) { blk(se0 - 0.4, se1 + 0.4, a, b, wy, 0.32, M({ color: 0xf2f4f5, roughness: 0.7 })); for (let n = a + 0.8; n < b - 0.6; n += 1.45) rowsN.push(n); }
      const pg = new T.BoxGeometry(1.9, 0.05, 1.05), sm = M({ map: ctex(SP.solar(), 1, 1), roughness: 0.3, metalness: o.env ? 0.35 : 0 });
      const cols = Math.floor((se1 - se0) / 2.05);
      const im = new T.InstancedMesh(pg, sm, rowsN.length * cols), m4 = new T.Matrix4(), q = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -0.22); let k = 0;
      for (const n of rowsN) for (let c = 0; c < cols; c++) { m4.compose(new T.Vector3(se0 + 1.05 + c * 2.05, wy + 0.5, -n), q, new T.Vector3(1, 1, 1)); im.setMatrixAt(k++, m4); }
      if (o.shadows) { im.castShadow = true; im.receiveShadow = true; } root.add(im); disp.push(pg);
      // ริมคลองฝั่ง กปน.: แนวรั้วโปร่งสีเขียวเข้ม + แถวต้นไม้บนสนามหญ้า (ตามภาพดาวเทียม)
      const fenceM = M({ color: 0x2f4f3a, roughness: 0.6 }), ns = []; for (let n = -255; n < 430; n += 2.5) if (n < -8 || n > 8) ns.push(n);
      const postG = new T.BoxGeometry(0.08, 1.8, 0.08), ip = new T.InstancedMesh(postG, fenceM, ns.length); ns.forEach((n, i) => { m4.compose(new T.Vector3(-58.4, 0.9, -n), new T.Quaternion(), new T.Vector3(1, 1, 1)); ip.setMatrixAt(i, m4); }); root.add(ip); disp.push(postG);
      for (const y of [0.25, 1.0, 1.75]) blk(-58.45, -58.35, -255, 430, y, 0.05, fenceM);
      const meshM = M({ color: 0x3d5f48, roughness: 0.8, transparent: true, opacity: 0.35, side: T.DoubleSide }); { const g = new T.PlaneGeometry(685, 1.5); g.rotateY(Math.PI / 2); const me = add(g, meshM, -58.4, 1.0, -(-255 + 430) / 2); me.renderOrder = 1; }
      const tr = []; for (let n = -250; n < 420; n += 8.5) if (Math.abs(n) > 12 && !(n > 300 && n < 330)) tr.push(n);
      const canG = new T.IcosahedronGeometry(1, 1), trunkG = new T.CylinderGeometry(0.18, 0.26, 1, 7);
      const ic = new T.InstancedMesh(canG, M({ color: 0x5f9a4c, roughness: 0.85 }), tr.length), it = new T.InstancedMesh(trunkG, M({ color: 0x6f5a46, roughness: 0.9 }), tr.length);
      tr.forEach((n, i) => { const k = 2.6 + ((n * 7.3) % 1.4), e = -54.5 + ((n * 3.1) % 1.6) - 0.8; m4.compose(new T.Vector3(e, 2.4 + k * 0.8, -n), new T.Quaternion(), new T.Vector3(k, k * 0.85, k)); ic.setMatrixAt(i, m4); m4.compose(new T.Vector3(e, 1.3, -n), new T.Quaternion(), new T.Vector3(1, 2.6, 1)); it.setMatrixAt(i, m4); });
      if (o.shadows) ic.castShadow = true; root.add(ic, it); disp.push(canG, trunkG);
      flat([-59.4, -50, -262, -20], M({ color: 0x76a454 }), 0.05);
    }
    // ── อ่างเก็บน้ำดิบ (เหนือสนามกีฬา) ──
    { const sh = new T.Shape(SITE.reservoir.map(([e, n]) => new T.Vector2(e, n))); const g = new T.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); add(g, water(0x86a58a), 0, 0.12, 0); }
    // ── สนามกีฬา กปน. ──
    { const s = SITE.stadium; flat([s.e - 50, s.e + 50, s.n - 90, s.n + 90], M({ map: ctex(SP.stadium()) }), 0.14);
      const [a0, a1, b0, b1] = SITE.stand, seat = M({ color: 0x5b8fc9, roughness: 0.6 }), roofM = M({ color: 0xe9edf1, roughness: 0.6 });
      for (let i = 0; i < 4; i++) blk(a0, a1 - i * 2.6, b0, b1, 0, 1.2 + i * 1.6, i ? seat : concrete, true);
      const roof = blk(a0 - 1, a1 + 1.5, b0 - 1, b1 + 1, 8.6, 0.35, roofM, true); roof.rotation.z = 0.08;
      for (let n = b0; n <= b1; n += 15.5) blk(a0 - 0.6, a0 + 0.2, n - 0.4, n + 0.4, 0, 8.8, concrete, true); }
    // ── ถังตกตะกอน 24 ถัง ──
    {
      const tk = SITE.tanks, R = tk.R, list = [];
      flat(SITE.tankField, M({ map: ctex(SP.ground('#8f8e66', ['#7c7b55', '#a29d77', '#6f7a52']), 40, 50) }), 0.08);
      tk.e.forEach((e, c) => { for (let r = 0; r < 6; r++) list.push({ e, n: tk.n0 + tk.dc * c + tk.dn * r, empty: tk.empty.includes(c + ',' + r), ch: tk.channels[c < 2 ? 0 : 1] }); });
      const m4 = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1);
      const wet = list.filter(t => !t.empty), dry = list.filter(t => t.empty);
      const inst = (geo, m, arr, fn) => { const im = new T.InstancedMesh(geo, m, arr.length); arr.forEach((t, i) => { fn(t, m4); im.setMatrixAt(i, m4); }); if (o.shadows) { im.castShadow = true; im.receiveShadow = true; } root.add(im); disp.push(geo); return im; };
      // ผนังถังสูง 3.6 ม. · รางรับน้ำรอบขอบ · ผิวน้ำ · บ่อกลาง · สะพานกวาดตะกอน · ทางเดินไปรางน้ำ
      { const sg = new T.PlaneGeometry(1, 1); sg.rotateX(-Math.PI / 2); const sm = new T.MeshBasicMaterial({ map: ctex(SP.softDisc()), transparent: true, depthWrite: false }); if (o.fadeable) sm.transparent = true; mats.push(sm); disp.push(sm);   // เงานุ่มใต้ถัง (เยื้องตามแดด)
        const isd = new T.InstancedMesh(sg, sm, list.length); list.forEach((t, i) => { m4.compose(new T.Vector3(t.e + 2.2, 0.16, -t.n + 2.0), q, new T.Vector3(2 * R + 7, 1, 2 * R + 7)); isd.setMatrixAt(i, m4); }); isd.renderOrder = 1; root.add(isd); disp.push(sg); }
      const H = 5.6, wallM = M({ map: ctex(SP.wallGrad()), roughness: 0.82, side: T.DoubleSide }), dark = M({ color: 0x9a9a92, roughness: 0.9, side: T.DoubleSide });
      const at = (y) => (t, m) => m.compose(new T.Vector3(t.e, y, -t.n), q, one);
      inst(new T.CylinderGeometry(R, R, H, 96, 1, true), wallM, list, at(H / 2));
      const ring = (r0, r1) => { const g = new T.RingGeometry(r0, r1, 96); g.rotateX(-Math.PI / 2); return g; };
      inst(ring(R - 0.55, R), concrete, list, at(H + 0.01));
      inst(new T.CylinderGeometry(R - 1.9, R - 1.9, 0.75, 96, 1, true), wallM, wet, at(H - 0.38));
      inst(ring(R - 1.9, R - 0.55), M({ color: 0x4f98d2, roughness: 0.3 }), wet, at(H - 0.45));
      inst(ring(R - 2.1, R - 1.85), concrete, wet, at(H));
      const disc = new T.CircleGeometry(R - 1.9, 96); disc.rotateX(-Math.PI / 2);
      inst(disc, M({ map: ctex(SP.tank(false)), roughness: 0.22, metalness: o.env ? 0.12 : 0 }), wet, at(H - 0.55));
      // ถังว่าง: ก้นถังลาดลงสู่หลุมกลาง (เห็นความลึก)
      const floorD = new T.CircleGeometry(R - 0.1, 96); floorD.rotateX(-Math.PI / 2);
      inst(floorD, M({ map: ctex(SP.tank(true)), roughness: 0.9 }), dry, at(0.45));
      inst(new T.CylinderGeometry(R - 0.1, R - 0.1, H, 96, 1, true), dark, dry, at(H / 2));
      inst(new T.CylinderGeometry(4.2, 4.2, 1.6, 40), concrete, list, at(H + 0.2));
      inst(new T.BoxGeometry(3.6, 0.6, 3.6), M({ color: 0x6f7f86, roughness: 0.5 }), list, at(H + 1.3));
      inst(new T.CylinderGeometry(0.7, 0.9, 1.0, 16), M({ color: 0x2f6fb0, roughness: 0.5 }), list, at(H + 2.0));
      const bridgeM = M({ color: 0xeef0ee, roughness: 0.6 }), railM = M({ color: 0x6d7a80, roughness: 0.5 }), unit = new T.BoxGeometry(1, 1, 1);
      const walk = (y, h, w, dz) => (t, m) => { const L = Math.abs(t.ch - t.e) - 3.5, cx = (t.e + t.ch) / 2 + Math.sign(t.ch - t.e) * 1.75; m.compose(new T.Vector3(cx, y, -t.n + dz), q, new T.Vector3(L, h, w)); };
      inst(unit.clone(), bridgeM, list, walk(H + 0.75, 0.45, 2.2, 0));
      inst(unit.clone(), railM, list, walk(H + 1.85, 0.08, 0.08, 1.05)); inst(unit.clone(), railM, list, walk(H + 1.85, 0.08, 0.08, -1.05));
      inst(unit.clone(), railM, list, walk(H + 1.35, 0.05, 0.05, 1.05)); inst(unit.clone(), railM, list, walk(H + 1.35, 0.05, 0.05, -1.05));
      // สะพานกวาดตะกอน (หมุนรอบกลางถัง) + รถเลื่อนที่ขอบถัง
      const ang = t => (t.e * 7.3 + t.n * 1.7) % (Math.PI * 2);
      const sweep = (y, h, w, off) => (t, m) => { const a = ang(t), L = R - 4.5, cx = t.e + Math.cos(a) * (4.3 + L / 2), cz = -t.n + Math.sin(a) * (4.3 + L / 2); m.compose(new T.Vector3(cx - Math.sin(a) * off, y, cz + Math.cos(a) * off), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -a), new T.Vector3(L, h, w)); };
      inst(unit.clone(), M({ color: 0x3e5560, roughness: 0.5 }), list, sweep(H + 0.95, 0.9, 1.6, 0));
      inst(unit.clone(), M({ color: 0xf5b528, roughness: 0.5 }), list, sweep(H + 1.75, 0.1, 0.1, 0.85)); inst(unit.clone(), M({ color: 0xf5b528, roughness: 0.5 }), list, sweep(H + 1.75, 0.1, 0.1, -0.85));
      inst(unit.clone(), M({ color: 0x3e5560, roughness: 0.5 }), list, (t, m) => { const a = ang(t); m.compose(new T.Vector3(t.e + Math.cos(a) * (R - 0.4), H + 0.9, -t.n + Math.sin(a) * (R - 0.4)), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), -a), new T.Vector3(1.6, 1.6, 2.6)); });
      for (const e of tk.channels) { blk(e - 2.2, e + 2.2, 58, 462, 0, 6.3, concrete, true); flat([e - 1.4, e + 1.4, 58, 462], M({ color: 0x4f98d2, roughness: 0.3 }), 6.32); }
      flat([tk.road - 3.5, tk.road + 3.5, 54, 466], M({ color: 0xa9aaa4 }), 0.1);
    }
    // ── ระบบกรอง (ถังกรองทราย 4 แถว) ──
    {
      const F = SITE.filters, yardM = M({ map: ctex(SP.ground('#c9c6bc', ['#b8b5aa', '#d6d3ca']), 30, 12) });
      flat(SITE.plantYard, yardM, 0.09);
      const basins = [], empties = [], solars = [], kiosks = [];
      const rowH = (F.n[1] - F.n[0]) / F.rows, rr = rnd(21);
      F.blocks.forEach(([e0, e1], bi) => {
        blk(e0, e1, F.n[0], F.n[1], 0, 1.0, concrete, true);
        const mid = (e0 + e1) / 2, gw = 8;
        blk(mid - gw / 2, mid + gw / 2, F.n[0] + 1, F.n[1] - 1, 0, 4.2, M({ color: 0xf1f2ef, roughness: 0.6 }), true);
        for (let r = 0; r < F.rows; r++) for (const side of [-1, 1]) {
          const a = side < 0 ? e0 + 1.2 : mid + gw / 2 + 0.8, b = side < 0 ? mid - gw / 2 - 0.8 : e1 - 1.2, n0 = F.n[0] + r * rowH + 0.7, n1 = n0 + rowH - 1.4;
          const cell = { e: (a + b) / 2, n: (n0 + n1) / 2, w: b - a, d: n1 - n0 };
          if (bi === F.solarBlock && side > 0) solars.push(cell); else if (rr() < 0.16) empties.push(cell); else basins.push(cell);
          if (side > 0) kiosks.push({ e: mid, n: (n0 + n1) / 2 });
        }
      });
      const pl = new T.PlaneGeometry(1, 1); pl.rotateX(-Math.PI / 2);
      const put = (arr, m, y) => { if (!arr.length) return; const im = new T.InstancedMesh(pl.clone(), m, arr.length), m4 = new T.Matrix4(), q = new T.Quaternion(); arr.forEach((c, i) => { m4.compose(new T.Vector3(c.e, y, -c.n), q, new T.Vector3(c.w, 1, c.d)); im.setMatrixAt(i, m4); }); if (o.shadows) im.receiveShadow = true; root.add(im); disp.push(im.geometry); };
      put(basins, water(0x2f6266), 1.45); put(empties, M({ color: 0x9c9d96, roughness: 0.9 }), 1.02);
      { const all = basins.concat(empties, solars), wg = new T.BoxGeometry(1, 1, 1), wm = new T.InstancedMesh(wg, concrete, all.length * 4), m4w = new T.Matrix4(), qw = new T.Quaternion(); let k = 0;   // ผนังรอบบ่อกรอง (เห็นบ่อจมลง)
        all.forEach(c => { for (const [dx, dz, sx, sz] of [[0, c.d / 2 + 0.3, c.w + 1.2, 0.6], [0, -c.d / 2 - 0.3, c.w + 1.2, 0.6], [c.w / 2 + 0.3, 0, 0.6, c.d], [-c.w / 2 - 0.3, 0, 0.6, c.d]]) { m4w.compose(new T.Vector3(c.e + dx, 1.05, -c.n - dz), qw, new T.Vector3(sx, 2.1, sz)); wm.setMatrixAt(k++, m4w); } });
        if (o.shadows) { wm.castShadow = true; wm.receiveShadow = true; } root.add(wm); disp.push(wg); }
      const st = SP.solar(); put(solars, M({ map: ctex(st, 3, 2), roughness: 0.35 }), 2.5);
      const km = new T.InstancedMesh(new T.BoxGeometry(3, 2.2, 3.2), M({ color: 0xffffff, roughness: 0.5 }), kiosks.length), m4 = new T.Matrix4(), q = new T.Quaternion(), one = new T.Vector3(1, 1, 1);
      kiosks.forEach((k, i) => { m4.compose(new T.Vector3(k.e, 5.3, -k.n), q, one); km.setMatrixAt(i, m4); }); if (o.shadows) km.castShadow = true; root.add(km); disp.push(km.geometry);
    }
    // ── ถังเก็บน้ำใส (ถังใต้ดินขนาดใหญ่ หลังคาเป็นแปลงตาราง) ──
    { const s = SITE.sludge, top = M({ map: ctex(SP.whiteRoof(), 6, 3), roughness: 0.85 }), side = M({ color: 0xdfe2e4, roughness: 0.9 });
      const me = blk(s[0], s[1], s[2], s[3], 0, 2.4, [side, side, top, side, side, side], true); me.castShadow = false; }
    // ── ลานตากตะกอน / บ่อพักตะกอน ด้านตะวันออก ──
    { const L = SITE.lagoons, dyke = M({ color: 0xb6ad94, roughness: 0.95 });
      for (const [n0, n1, kind] of L.n) { flat([L.e[0], L.e[1], n0, n1], M({ map: ctex(SP.lagoon(kind), 2, 2), roughness: kind === 'water' ? 0.3 : 0.95 }), 0.1);
        blk(L.e[0] - 3, L.e[1] + 3, n1, n1 + 3, 0, 1.4, dyke); blk(L.e[0] - 3, L.e[1] + 3, n0 - 3, n0, 0, 1.4, dyke); blk(L.e[0] - 3, L.e[0], n0, n1, 0, 1.4, dyke); } }
    return {
      grp, mats,
      dispose() { disp.forEach(d => d && d.dispose && d.dispose()); },
    };
  }
  // พื้นที่ที่โมเดลโรงงานแทนแล้ว — ใช้ซ่อนรอยอาคาร Overture / ต้นไม้สุ่ม (รูปแบบ [ตอ., เหนือ] เมตร)
  function siteHide() {
    const R = (e0, e1, n0, n1) => [[e0, n0], [e1, n0], [e1, n1], [e0, n1]].map(([e, n]) => { const [x, z] = siteToWorld(e, n); return [x, -z]; });
    const s = SITE, st = s.stadium;
    return [R(...s.tankField), R(...s.plantYard.slice(0, 2), -56, 50), R(...s.sludge), R(s.lagoons.e[0] - 4, s.lagoons.e[1] + 4, -66, 508), R(st.e - 44, st.e + 44, st.n - 84, st.n + 84), R(s.canal[0] - 1, s.canal[1] + 1, -700, 560)];
  }
  const SITE_LABELS = [
    { e: 333, n: 262, t: 'ถังตกตะกอน 24 ถัง' }, { e: 340, n: 10, t: 'ระบบกรองน้ำ' }, { e: 395, n: -205, t: 'ถังเก็บน้ำใส' }, { e: 637, n: 300, t: 'ลานตากตะกอน' },
    { e: 5, n: 274, t: 'สนามกีฬา กปน.' }, { e: -78, n: 200, t: 'คลองประปา · โซลาร์ลอยน้ำ' }, { e: 112, n: 215, t: 'โรงงานผลิตน้ำบางเขน' },
  ].map(l => { const [x, z] = siteToWorld(l.e, l.n); return { x, z, text: l.t }; });

  window.SUTHI = { build, buildSite, siteHide, SITE_LABELS, FH, NL, NC };
})();
