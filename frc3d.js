/* ═══════════════════════════════════════════════════════════════════════════
   frc3d.js — มุมมอง 3 มิติ ตู้วัดคุณภาพน้ำ (FRCContour)          [ทดลอง · 17 ต.ค. 2569]
   ─ แผนที่: MapLibre GL 4.7.1 + OpenFreeMap (ข้อมูล OpenStreetMap, ฟรี ไม่ต้องมีคีย์)
   ─ เมืองมีสีรอบสถานี (รัศมี 550 ม.): สร้างจากข้อมูล OSM ผ่าน Overpass API — ผนังสีตามประเภท, หน้าต่าง,
     หลังคาจั่ว/ปั้นหยา/เรียบ, วัดหลังคาทรงไทย, ต้นไม้ (จุด/แนว/สวน/ริมถนน), ถังน้ำบนหลังคา · นอกรัศมี = กล่องของแผนที่ฐาน
   ─ ตู้วัด: โมเดลสร้างด้วยโค้ด (three.js r128) วางที่พิกัดสถานี + ลำแสงสีตามเกณฑ์ FRC
   ─ โหลดไลบรารีเฉพาะตอนเปิดครั้งแรก — หน้าหลักไม่ช้าลง · ไม่อ่าน/เขียน Firebase
   ใช้:  FRC3D.open({ name, lat, lon, frc, ec, ts })
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const CFG = Object.assign({
    styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    mlJs:  'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
    mlCss: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
    threeJs: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    overpass: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'],
    osmStatic: null,                       // ใช้ทดสอบ: ไฟล์ JSON ของ Overpass แทนการดึงจริง
  }, window.FRC3D_CONFIG || {});

  // ── เกณฑ์สี FRC (ชุดเดียวกับ contour) ─────────────────────────────────────
  function frcHex(v) {
    if (v == null || !isFinite(v)) return '#9aa0a6';
    if (v < 0.2) return '#d23c1e';
    if (v < 0.3) return '#ef9a16';
    if (v < 0.5) return '#9cc832';
    if (v < 0.8) return '#3cbe8c';
    if (v < 1.2) return '#2f8fc8';
    return '#5a3cb4';
  }
  function frcText(v) {
    if (v == null || !isFinite(v)) return 'ไม่มีข้อมูล';
    if (v < 0.2) return 'ต่ำกว่าเกณฑ์';
    if (v < 0.3) return 'เฝ้าระวัง';
    return 'ผ่านเกณฑ์';
  }

  // ── ขนาดตู้: ขนาดจริงเมื่อซูม ≥ 19.5 · ซูมออกแล้วขยาย (ไม่งั้นมองไม่เห็นในภาพเมือง) ──
  const NEAR_Z = 21.2, FAR_Z = 16.9, BEAM_H = 14;
  function exag(z) { return Math.min(40, Math.max(1, Math.pow(2, 19.5 - z))); }
  function beamAlpha(z) { return Math.max(0, Math.min(0.6, (18.3 - z) * 0.4)); }

  // ── โหลดไลบรารี (ครั้งเดียว) ──────────────────────────────────────────────
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = res; s.onerror = () => rej(new Error('โหลดไม่สำเร็จ: ' + src));
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if ([...document.styleSheets].some(x => x.href === href)) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l);
  }
  let _libs = null;
  function ensureLibs() {
    if (_libs) return _libs;
    _libs = (async () => {
      if (!window.maplibregl) { loadCss(CFG.mlCss); await loadScript(CFG.mlJs); }
      if (!window.THREE) await loadScript(CFG.threeJs);
    })();
    _libs.catch(() => { _libs = null; });
    return _libs;
  }

  // ── CSS ของหน้าต่าง 3D ─────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById('frc3d-css')) return;
    const st = document.createElement('style'); st.id = 'frc3d-css';
    st.textContent = `
#frc3d-wrap{position:fixed;inset:0;z-index:100000;background:#111;font-family:Sarabun,'Noto Sans Thai',sans-serif}
#frc3d-map{position:absolute;inset:0}
#frc3d-bar{position:absolute;top:12px;left:12px;right:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;pointer-events:none;z-index:2}
#frc3d-bar>*{pointer-events:auto}
.frc3d-title{background:rgba(255,255,255,.94);color:#1a1a1a;border-radius:12px;padding:8px 14px;font-weight:700;font-size:15px;box-shadow:0 2px 10px rgba(0,0,0,.25);max-width:min(520px,100%)}
.frc3d-title small{display:block;font-weight:400;font-size:11.5px;color:#555}
.frc3d-sp{flex:1}
.frc3d-btn{background:rgba(255,255,255,.94);color:#1a1a1a;border:0;border-radius:10px;padding:8px 12px;font:600 13px Sarabun,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.frc3d-btn:hover{background:#fff}
.frc3d-btn.on{background:#0b63c4;color:#fff}
.frc3d-close{background:#cc0055;color:#fff}
#frc3d-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#fff;font-size:15px;z-index:3;text-align:center}
.frc3d-card{background:rgba(255,255,255,.96);border-radius:12px;padding:8px 12px 9px;box-shadow:0 4px 16px rgba(0,0,0,.3);font-family:Sarabun,sans-serif;color:#1a1a1a;min-width:150px;border-top:5px solid var(--c);transform:translateY(-6px)}
.frc3d-card .n{font-weight:700;font-size:13px;line-height:1.25;max-width:220px}
.frc3d-card .v{display:flex;align-items:baseline;gap:6px;margin-top:3px}
.frc3d-card .v b{font-size:22px;color:var(--c);font-family:'JetBrains Mono',ui-monospace,monospace}
.frc3d-card .v span{font-size:11px;color:#444}
.frc3d-card .s{font-size:11px;color:#555;margin-top:1px}
.frc3d-card:after{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-8px;border:8px solid transparent;border-top-color:rgba(255,255,255,.96);border-bottom:0}
.frc3d-night .frc3d-card{background:rgba(20,24,32,.92);color:#eef2f7}
.frc3d-night .frc3d-card .v span,.frc3d-night .frc3d-card .s{color:#b9c2cf}
.frc3d-night .frc3d-card:after{border-top-color:rgba(20,24,32,.92)}
#frc3d-chip{display:none;position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:2;background:rgba(20,24,32,.85);color:#fff;padding:7px 14px;border-radius:20px;font-size:13px;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.3)}
#frc3d-attr{position:absolute;right:8px;bottom:6px;z-index:2;font-size:10.5px;color:#333;background:rgba(255,255,255,.75);padding:1px 6px;border-radius:6px}
#frc3d-attr a{color:#0b63c4}
@media (max-width:600px){.frc3d-title{font-size:13px}.frc3d-btn{padding:7px 9px;font-size:12px}}`;
    document.head.appendChild(st);
  }

  // ── โมเดลตู้วัดคุณภาพน้ำ (หน่วย = เมตร, แกน y ขึ้น) ───────────────────────
  function labelTexture(T) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#0b4f8a'; g.font = 'bold 50px Sarabun, "Noto Sans Thai", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ตู้ตรวจวัดคุณภาพน้ำ', 256, 52);
    g.font = '30px Sarabun, "Noto Sans Thai", sans-serif'; g.fillStyle = '#3b6f9c';
    g.fillText('ออนไลน์ · ประปา', 256, 102);
    const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }
  function dropShape(T, h) {
    const s = new T.Shape(), r = h * 0.32;
    s.moveTo(0, h * 0.5);
    s.bezierCurveTo(r * 0.35, h * 0.2, r * 1.0, -h * 0.02, r * 1.0, -h * 0.18);
    s.absarc(0, -h * 0.18, r, 0, Math.PI, true);
    s.bezierCurveTo(-r * 1.0, -h * 0.02, -r * 0.35, h * 0.2, 0, h * 0.5);
    return s;
  }
  function buildCabinet(T, color) {
    const grp = new T.Group();
    const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0.1 }, o || {}));
    const box = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); grp.add(m); return m; };
    const blue = M('#1d6fb8'), blueD = M('#14548e'), white = M('#f4f7fa', { roughness: 0.4 }), grey = M('#c8c5be', { roughness: 0.9 });
    // ฐานคอนกรีต + ตัวตู้ + หลังคา
    box(1.40, 0.12, 1.10, grey, 0, 0.06, 0);
    box(0.90, 1.70, 0.60, blue, 0, 0.12 + 0.85, 0);
    box(1.02, 0.07, 0.72, blueD, 0, 1.855, 0.01);
    box(0.80, 0.05, 0.50, blueD, 0, 1.915, 0.01);
    // แผงหน้าสีขาว + ป้ายชื่อ
    box(0.78, 1.02, 0.012, white, 0, 1.12, 0.306);
    const lab = new T.Mesh(new T.PlaneGeometry(0.70, 0.175), new T.MeshBasicMaterial({ map: labelTexture(T) }));
    lab.position.set(0, 1.53, 0.3135); grp.add(lab);
    // หยดน้ำ (สีตามเกณฑ์ FRC) — เก็บ ref ไว้เปลี่ยนสีได้
    const dropMat = M(color, { roughness: 0.3, emissive: color, emissiveIntensity: 0.15 });
    const drop = new T.Mesh(new T.ExtrudeGeometry(dropShape(T, 0.42), { depth: 0.025, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 }), dropMat);
    drop.position.set(-0.13, 1.08, 0.309); grp.add(drop);
    // จอแสดงผล
    const scr = M('#0d2b36', { emissive: '#1fc8c8', emissiveIntensity: 0.35, roughness: 0.2 });
    box(0.24, 0.15, 0.015, scr, 0.2, 1.22, 0.313);
    // ขอบประตู + มือจับ + ช่องระบายอากาศด้านข้าง
    const seam = M('#0f4677');
    box(0.006, 1.6, 0.004, seam, 0.0, 0.97, 0.302);
    box(0.03, 0.14, 0.03, M('#d9dde2', { metalness: 0.6, roughness: 0.3 }), 0.37, 0.95, 0.315);
    for (let i = 0; i < 6; i++) { box(0.004, 0.025, 0.36, seam, 0.452, 0.45 + i * 0.06, 0); box(0.004, 0.025, 0.36, seam, -0.452, 0.45 + i * 0.06, 0); }
    // แนวเก็บน้ำตัวอย่าง: ท่อเมนใต้ถนน → มาตร → ท่อ PB เข้าตู้
    const pipeMat = M('#8a8f96', { metalness: 0.4, roughness: 0.4 });
    const cyl = (r, len, x, y, z, rx, rz) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 12), pipeMat); m.position.set(x, y, z); m.rotation.set(rx || 0, 0, rz || 0); grp.add(m); return m; };
    cyl(0.025, 2.6, -1.75, 0.04, 0.15, 0, Math.PI / 2);          // ท่อเข้าตู้ (วิ่งบนทางเท้า)
    box(0.30, 0.16, 0.22, M('#5c636b'), -3.15, 0.08, 0.15);      // กล่องมาตรวัดน้ำ
    cyl(0.025, 0.6, -3.15, -0.22, 0.15);                         // ลงไปท่อเมน
    // เสาไฟข้างตู้ (ไฟติดตอนกลางคืน)
    const poleMat = M('#6b7077', { metalness: 0.5, roughness: 0.4 });
    const pole = new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 4.2, 10), poleMat); pole.position.set(1.25, 2.1, -0.55); grp.add(pole);
    const arm = new T.Mesh(new T.BoxGeometry(0.7, 0.05, 0.06), poleMat); arm.position.set(0.95, 4.15, -0.55); grp.add(arm);
    const lampMat = M('#fff4d6', { emissive: '#ffd27a', emissiveIntensity: 0.0, roughness: 0.3 });
    const lamp = new T.Mesh(new T.BoxGeometry(0.32, 0.08, 0.16), lampMat); lamp.position.set(0.68, 4.1, -0.55); grp.add(lamp);
    const lampLight = new T.PointLight(0xffd9a0, 0, 9, 1.6); lampLight.position.set(0.6, 3.6, 0.2); grp.add(lampLight);
    return { grp, dropMat, lampMat, lampLight };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  เมือง 3 มิติมีสี — สร้างจากข้อมูล OpenStreetMap รอบสถานี (แนวเดียวกับ Longdo: procedural จาก OSM)
  //  อาคาร: ผนังสีตามประเภท + หน้าต่าง (กลางคืนไฟติด) · หลังคาจั่ว/ปั้นหยา/เรียบ · วัด = หลังคาทรงไทย
  //  ต้นไม้: จุดต้นไม้ OSM + แนวต้นไม้ + สวน/ป่า + ต้นไม้ริมถนน · ถังน้ำบนหลังคาตึกแถว
  // ═════════════════════════════════════════════════════════════════════════
  const R_CITY = 550;                         // รัศมีที่สร้างเมืองมีสี (ม.) — นอกนี้ใช้กล่องของแผนที่ฐาน
  const _osmCache = {};
  async function fetchOSM(lat, lon, r) {
    const key = lat.toFixed(5) + ',' + lon.toFixed(5) + ',' + r;
    if (_osmCache[key]) return _osmCache[key];
    if (CFG.osmStatic) { const j = await (await fetch(CFG.osmStatic)).json(); return (_osmCache[key] = j); }
    const A = `(around:${r},${lat},${lon})`;
    const q = `[out:json][timeout:50];(` +
      `way["building"]${A};relation["building"]["type"="multipolygon"]${A};` +
      `node["natural"="tree"]${A};way["natural"="tree_row"]${A};` +
      `way["leisure"~"^(park|garden|golf_course)$"]${A};` +
      `way["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green|orchard)$"]${A};` +
      `way["natural"~"^(wood|scrub|grassland)$"]${A};` +
      `way["highway"~"^(trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"]${A};` +
      `node["man_made"="stupa"]${A};way["man_made"="stupa"]${A};` +
      `way["amenity"="place_of_worship"]${A};relation["amenity"="place_of_worship"]${A};` +
      `);out body geom qt;`;
    let lastErr;
    for (const url of CFG.overpass) {
      try {
        const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (res.ok) return (_osmCache[key] = await res.json());
        lastErr = new Error('HTTP ' + res.status);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Overpass');
  }

  // ── เครื่องมือเรขาคณิต (หน่วยเมตร: x = ตะวันออก, z = ใต้) ─────────────────
  function hash(n) { let x = (n | 0) ^ 0x9e3779b9; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  function areaXZ(r) { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  function pip(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if (((a[1] > z) !== (b[1] > z)) && (x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0])) c = !c; } return c; }
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function obb(ring) {                          // กรอบสี่เหลี่ยมเล็กที่สุดที่ครอบรูปอาคาร (ใช้วางหลังคาจั่ว)
    const h = hull(ring); let best = null;
    for (let i = 0; i < h.length; i++) {
      const a = h[i], b = h[(i + 1) % h.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      let mnU = 1e9, mxU = -1e9, mnV = 1e9, mxV = -1e9;
      for (const q of h) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; mnU = Math.min(mnU, u); mxU = Math.max(mxU, u); mnV = Math.min(mnV, v); mxV = Math.max(mxV, v); }
      const ar = (mxU - mnU) * (mxV - mnV);
      if (!best || ar < best.area) best = { area: ar, ux, uz, cu: (mnU + mxU) / 2, cv: (mnV + mxV) / 2, hl: (mxU - mnU) / 2, hw: (mxV - mnV) / 2 };
    }
    if (!best) return null;
    if (best.hw > best.hl) {                   // ให้แกน u เป็นด้านยาวเสมอ
      const { ux, uz, cu, cv } = best; best.ux = -uz; best.uz = ux; best.cu = cv; best.cv = -cu; const t = best.hl; best.hl = best.hw; best.hw = t;
    }
    best.cx = best.cu * best.ux - best.cv * best.uz; best.cz = best.cu * best.uz + best.cv * best.ux;
    return best;
  }
  function segDist(px, pz, a, b) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; let t = L2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t)); const x = a[0] + t * dx, z = a[1] + t * dz; return [Math.hypot(px - x, pz - z), x, z]; }
  function ringDist(px, pz, r) { if (pip(px, pz, r)) return 0; let d = 1e9; for (let i = 0; i < r.length; i++) d = Math.min(d, segDist(px, pz, r[i], r[(i + 1) % r.length])[0]); return d; }
  function num(v) { const m = String(v == null ? '' : v).replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; }
  function toRings(el, P) {
    const ringOf = g => { const r = g.map(p => P(p.lat, p.lon)); if (r.length > 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop(); return r; };
    if (el.type === 'way' && el.geometry && el.geometry.length > 3) return { outer: [ringOf(el.geometry)], inner: [] };
    if (el.type === 'relation' && el.members) {
      const join = list => {                     // ต่อเส้น outer/inner ที่ถูกแบ่งเป็นท่อนๆ ให้เป็นวง
        const segs = list.filter(m => m.geometry && m.geometry.length > 1).map(m => m.geometry.slice()), out = [];
        while (segs.length) {
          let cur = segs.shift();
          for (let guard = 0; guard < 200; guard++) {
            const a = cur[0], b = cur[cur.length - 1];
            if (a.lat === b.lat && a.lon === b.lon) break;
            const i = segs.findIndex(s => (s[0].lat === b.lat && s[0].lon === b.lon) || (s[s.length - 1].lat === b.lat && s[s.length - 1].lon === b.lon));
            if (i < 0) break;
            let s = segs.splice(i, 1)[0]; if (!(s[0].lat === b.lat && s[0].lon === b.lon)) s = s.reverse();
            cur = cur.concat(s.slice(1));
          }
          if (cur.length > 3) out.push(ringOf(cur));
        }
        return out;
      };
      return { outer: join(el.members.filter(m => m.role !== 'inner')), inner: join(el.members.filter(m => m.role === 'inner')) };
    }
    return null;
  }

  // ── สีและความสูงตามประเภทอาคาร ───────────────────────────────────────────
  const WALL = {
    house: ['#f1e4c8', '#efd9b4', '#f4ecd9', '#e9dcc6', '#f3e1cf'],
    shop: ['#ece6da', '#e6d8bf', '#dfe5e9', '#ecd8cf', '#e2e6d4', '#f0e0c4', '#d8d4cc', '#e9e1ef'],
    apt: ['#ebe4d6', '#e4ddd0', '#efe8dc', '#dfe3e6'],
    office: ['#c9d8e3', '#bccfdc', '#d3dee6', '#b7c8d4'],
    ind: ['#d5dade', '#cfd6dc', '#dcdfe1'],
    school: ['#f3dcb2', '#f0d3a1', '#efe0c0'],
    hosp: ['#f7f8f8', '#eef3f5'],
    civic: ['#f1e6cf', '#ecdfc3'],
    temple: ['#fbf8f0'],
  };
  const ROOF_TILE = ['#a8573a', '#9a4e36', '#b66b47', '#8a5244', '#7d6b63', '#6c7f92', '#5f7489', '#8e9aa3', '#9b5a3f', '#7a8f7c'];   // กระเบื้อง + เมทัลชีท
  const ROOF_FLAT = ['#9c978e', '#a49e93', '#918d86', '#a8a297', '#95938e', '#a09588'];
  function classify(t) {
    const b = (t.building || 'yes').toLowerCase(), am = (t.amenity || '').toLowerCase();
    if (b === 'roof' || b === 'carport') return 'roof';
    if (/^(temple|wat|monastery|shrine|church|chapel|mosque|cathedral|religious)$/.test(b) || am === 'place_of_worship' || am === 'monastery') return 'temple';
    if (/^(house|detached|semidetached_house|bungalow|hut|cabin|shed|farm|terrace|houseboat|static_caravan)$/.test(b)) return 'house';
    if (/^(apartments|residential|dormitory|hotel|condominium)$/.test(b)) return 'apt';
    if (/^(commercial|retail|supermarket|kiosk|shop|shophouse)$/.test(b)) return 'shop';
    if (/^(office)$/.test(b)) return 'office';
    if (/^(industrial|warehouse|factory|hangar|manufacture|garage|garages|parking|service|storage_tank|transformer_tower)$/.test(b)) return 'ind';
    if (/^(school|university|college|kindergarten)$/.test(b) || /school|university|college|kindergarten/.test(am)) return 'school';
    if (/^(hospital|clinic)$/.test(b) || /hospital|clinic/.test(am)) return 'hosp';
    if (/^(government|civic|public|train_station|transportation|fire_station|police)$/.test(b)) return 'civic';
    return 'yes';
  }
  function pick(arr, r) { return arr[Math.floor(r * arr.length) % arr.length]; }

  function buildCity(osm, P, opts) {
    const T = window.THREE;
    const W = { p: [], n: [], c: [], uv: [] };   // ผนัง (มีลายหน้าต่าง)
    const R = { p: [], n: [], c: [] };           // หลังคา/พื้นผิวสีล้วน
    const col = new T.Color();
    const push = (G, a, b, c, color, uvs) => {   // สามเหลี่ยม + normal ของหน้า (หันออกตามลำดับจุด)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      for (const v of [a, b, c]) { G.p.push(v[0], v[1], v[2]); G.n.push(nx, ny, nz); }
      for (let i = 0; i < 3; i++) { const cc = Array.isArray(color) ? color[i] : color; G.c.push(cc.r, cc.g, cc.b); }
      if (uvs) G.uv.push(...uvs);
    };
    const tri = (G, a, b, c, color, up) => {     // สามเหลี่ยมที่บังคับให้ normal ชี้ตามทิศ up (เช่น หลังคาชี้ขึ้น)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * up[0] + ny * up[1] + nz * up[2] < 0) push(G, a, c, b, color); else push(G, a, b, c, color);
    };
    const quad = (G, a, b, c, d, color, up) => { tri(G, a, b, c, color, up); tri(G, a, c, d, color, up); };
    const C = h => new T.Color(h);

    const bInfo = [], trees = [], tanks = [], stupas = [];
    const r0 = opts.stationXZ, hideR = opts.radius;

    // ── 1) อาคาร ──────────────────────────────────────────────────────────
    const els = osm.elements || [];
    // เขตวัด (พื้นที่ place_of_worship ที่ไม่ใช่ตัวอาคาร) — อาคารใหญ่ในเขตวัดใช้หลังคาทรงไทย
    const watAreas = [];
    for (const el of els) {
      const t = el.tags || {}; if (t.amenity !== 'place_of_worship' || t.building) continue;
      if (!(t.religion === 'buddhist' || /^วัด/.test(t.name || '') || /^wat /i.test(t['name:en'] || ''))) continue;
      const rr = toRings(el, P); if (rr) for (const o of rr.outer) if (o.length > 2) watAreas.push(o);
    }
    for (const el of els) {
      const t = el.tags || {};
      if (!t.building || t.building === 'no' || t['building:part']) continue;
      const rr = toRings(el, P); if (!rr || !rr.outer.length) continue;
      for (let outer of rr.outer) {
        if (outer.length < 3) continue;
        // ใช้เฉพาะอาคารที่มีจุดใดจุดหนึ่งอยู่ในรัศมี (ให้ตรงกับที่ซ่อนกล่องของแผนที่ฐาน)
        if (ringDist(r0[0], r0[1], outer) > hideR) continue;
        if (areaXZ(outer) < 0) outer = outer.slice().reverse();
        const inners = rr.inner.filter(h => h.length > 2 && pip(h[0][0], h[0][1], outer)).map(h => areaXZ(h) > 0 ? h.slice().reverse() : h);
        const area = Math.abs(areaXZ(outer)) - inners.reduce((s, h) => s + Math.abs(areaXZ(h)), 0);
        if (area < 6) continue;
        let kind = classify(t); const rnd = rng((el.id * 2654435761) >>> 0);
        if (kind === 'yes' && watAreas.length) {
          const a0 = Math.abs(areaXZ(outer)), cx0 = outer.reduce((s2, q) => s2 + q[0], 0) / outer.length, cz0 = outer.reduce((s2, q) => s2 + q[1], 0) / outer.length;
          if (a0 > 90 && a0 < 1800 && watAreas.some(w => pip(cx0, cz0, w))) kind = 'temple';
        }
        const ob0 = obb(outer);                  // ตึกแถว = รูปยาวแคบ หน้ากว้าง ≤ 7 ม.
        const isRow = kind === 'yes' && ob0 && ob0.hw * 2 <= 7 && ob0.hl / Math.max(ob0.hw, 0.1) >= 1.8 && area < 260;
        // ── ความสูง ──
        let lv = num(t['building:levels']), h = num(t.height) || num(t['building:height']);
        const minH = num(t.min_height) || (isFinite(num(t['building:min_level'])) ? num(t['building:min_level']) * 3.2 : 0) || 0;
        if (!isFinite(h)) {
          if (!isFinite(lv)) {
            if (kind === 'house') lv = rnd() < 0.55 ? 2 : 1;
            else if (kind === 'apt') lv = area > 1200 ? 8 + Math.floor(rnd() * 16) : 5 + Math.floor(rnd() * 4);
            else if (kind === 'office') lv = 6 + Math.floor(rnd() * 14);
            else if (kind === 'shop') lv = area > 3000 ? 4 : 3 + Math.floor(rnd() * 2);
            else if (kind === 'ind') lv = 1;
            else if (kind === 'school') lv = 3 + Math.floor(rnd() * 2);
            else if (kind === 'hosp') lv = 5 + Math.floor(rnd() * 8);
            else if (kind === 'civic') lv = 3 + Math.floor(rnd() * 2);
            else if (kind === 'temple') lv = 2;
            else if (kind === 'roof') lv = 1;
            else if (isRow) lv = 3 + (rnd() < 0.45 ? 1 : 0);                    // ตึกแถว 3–4 ชั้น
            else lv = area < 70 ? 2 : area < 260 ? 3 + Math.floor(rnd() * 2) : area < 1500 ? 4 + Math.floor(rnd() * 3) : 3;
          }
          h = kind === 'ind' ? 7 + rnd() * 4 : kind === 'temple' ? 6.5 : lv * 3.2 + 0.4;
        }
        h = Math.max(h, minH + 2.5);
        // ── หลังคา ──
        let shape = (t['roof:shape'] || '').toLowerCase();
        const ob = ob0, rect = ob ? area / (4 * ob.hl * ob.hw) : 0;
        if (kind === 'temple') shape = 'thai';
        else if (kind === 'roof') shape = 'slab';
        else if (!shape) shape = (kind === 'house' || (kind === 'yes' && !isRow && area < 160 && h <= 7.5)) ? (rnd() < 0.55 ? 'gabled' : 'hipped') : 'flat';
        if ((shape === 'gabled' || shape === 'hipped' || shape === 'pyramidal' || shape === 'half-hipped' || shape === 'mansard' || shape === 'thai') && (!ob || rect < 0.62 || ob.hw < 1.5)) shape = kind === 'temple' && ob ? 'thai' : 'flat';
        if (!/^(gabled|hipped|pyramidal|half-hipped|mansard|thai|slab|flat)$/.test(shape)) shape = 'flat';
        if (shape === 'half-hipped' || shape === 'mansard') shape = 'hipped';
        const wallHex = t['building:colour'] || t['building:color'] || pick(WALL[kind] || WALL.shop, rnd());
        let wallC; try { wallC = C(wallHex); } catch (e) { wallC = C(pick(WALL.shop, rnd())); }
        const roofHex = t['roof:colour'] || t['roof:color'] || (shape === 'flat' ? pick(ROOF_FLAT, rnd()) : kind === 'ind' ? pick(['#7d97ab', '#8aa0b0', '#6f8a9e'], rnd()) : pick(ROOF_TILE, rnd()));
        let roofC; try { roofC = C(roofHex); } catch (e) { roofC = C(pick(ROOF_FLAT, rnd())); }
        const roofPitchH = shape === 'flat' || shape === 'slab' ? 0 : 0;
        bInfo.push({ outer, inners, h, kind });

        // ── ผนัง (มืดลงใกล้พื้น = เงาแบบง่าย) ──
        const wallTop = shape === 'slab' ? h : h, wallBot = shape === 'slab' ? h - 0.35 : minH;
        const dark = wallC.clone().multiplyScalar(0.72);
        const winScale = kind === 'ind' ? 0 : 1;   // โรงงาน/โกดัง ไม่มีหน้าต่าง
        for (const ring of [outer, ...inners]) {
          let acc = 0;
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
            const A0 = [a[0], wallBot, a[1]], B0 = [b[0], wallBot, b[1]], A1 = [a[0], wallTop, a[1]], B1 = [b[0], wallTop, b[1]];
            const u0 = acc / 3.6 * winScale, u1 = (acc + L) / 3.6 * winScale, v0 = wallBot / 3.2 * winScale, v1 = wallTop / 3.2 * winScale; acc += L;
            const cB = minH > 0.5 ? wallC : dark;
            // ลำดับ A0,B1,B0 → normal ชี้ออกนอกอาคาร (วงนอกเรียงทวนเข็มในระบบ x-z)
            push(W, A0, B1, B0, [cB, wallC, cB], [u0, v0, u1, v1, u1, v0]);
            push(W, A0, A1, B1, [cB, wallC, wallC], [u0, v0, u0, v1, u1, v1]);
          }
        }
        // ── ใต้หลังคาเรียบ/พื้นหลังคา (ทุกแบบมีฝาปิดด้านบนผนัง) ──
        const capY = shape === 'slab' ? h : h;
        const v2 = outer.map(q => new T.Vector2(q[0], q[1])), holes = inners.map(hh => hh.map(q => new T.Vector2(q[0], q[1])));
        let tris = []; try { tris = T.ShapeUtils.triangulateShape(v2, holes); } catch (e) {}
        const all = outer.concat(...inners);
        const capC = shape === 'flat' || shape === 'slab' ? roofC : wallC.clone().multiplyScalar(0.9);
        for (const f of tris) tri(R, [all[f[0]][0], capY, all[f[0]][1]], [all[f[1]][0], capY, all[f[1]][1]], [all[f[2]][0], capY, all[f[2]][1]], capC, [0, 1, 0]);
        if (shape === 'slab') { for (const f of tris) tri(R, [all[f[0]][0], h - 0.35, all[f[0]][1]], [all[f[1]][0], h - 0.35, all[f[1]][1]], [all[f[2]][0], h - 0.35, all[f[2]][1]], roofC.clone().multiplyScalar(0.7), [0, -1, 0]); }

        // ── หลังคาเรียบ: ขอบกันตก + ถังน้ำ/คอมแอร์บนตึกแถว ──
        if (shape === 'flat' && area > 25) {
          const pc = roofC.clone().multiplyScalar(0.82);
          for (let i = 0; i < outer.length; i++) {
            const a = outer[i], b = outer[(i + 1) % outer.length];
            quad(R, [a[0], h, a[1]], [b[0], h, b[1]], [b[0], h + 0.5, b[1]], [a[0], h + 0.5, a[1]], pc, [b[1] - a[1], 0, -(b[0] - a[0])]);
          }
          const nTank = area < 400 ? (rnd() < 0.75 ? 1 : 2) : Math.min(5, Math.floor(area / 500) + 1);
          for (let k = 0; k < nTank; k++) for (let tries = 0; tries < 8; tries++) {
            const x = ob.cx + (rnd() * 2 - 1) * ob.hl * 0.8 * ob.ux - (rnd() * 2 - 1) * ob.hw * 0.8 * ob.uz;
            const z = ob.cz + (rnd() * 2 - 1) * ob.hl * 0.8 * ob.uz + (rnd() * 2 - 1) * ob.hw * 0.8 * ob.ux;
            if (pip(x, z, outer)) { tanks.push({ x, z, y: h, big: area > 1500, blue: rnd() < 0.55 }); break; }
          }
        }
        // ── หลังคาจั่ว / ปั้นหยา / ทรงไทย ──
        if (ob && (shape === 'gabled' || shape === 'hipped' || shape === 'pyramidal' || shape === 'thai')) {
          const ov = shape === 'thai' ? 1.4 : 0.45, hl = ob.hl + ov, hw = ob.hw + ov;
          const pitch = shape === 'thai' ? 1.35 : 0.58;                 // tan ของมุมหลังคา
          const rise = Math.min(hw * pitch, shape === 'thai' ? 14 : 5.5);
          const W2 = (u, v, y) => [ob.cx + u * ob.ux - v * ob.uz, y, ob.cz + u * ob.uz + v * ob.ux];
          const baseY = h - (shape === 'thai' ? 0.4 : 0.15), topY = baseY + rise;
          const ridge = shape === 'gabled' || shape === 'thai' ? hl : Math.max(0, hl - hw);
          const rc = roofC, rc2 = roofC.clone().multiplyScalar(0.86);
          if (shape === 'thai') {
            // หลังคาทรงไทย: ผืนบนสีส้มแดง ขอบล่างสีเขียว + กันสาดรอบ + ช่อฟ้าทอง
            const orange = C('#d2552a'), green = C('#2f7d4a'), gold = C('#e2b13c'), pedi = C('#d9a131');
            const f = 0.72;                                          // สัดส่วนผืนบน (ส้ม) ต่อผืนล่าง (เขียว)
            const mid = (s) => [W2(-ridge, s * hw * (1 - f), baseY + rise * f), W2(ridge, s * hw * (1 - f), baseY + rise * f)];
            for (const s of [-1, 1]) {
              const [m0, m1] = mid(s);
              quad(R, W2(-ridge, 0, topY), W2(ridge, 0, topY), m1, m0, orange, [0, 1, 0]);
              quad(R, m0, m1, W2(hl, s * hw, baseY), W2(-hl, s * hw, baseY), green, [0, 1, 0]);
            }
            for (const e of [-1, 1]) tri(R, W2(e * hl, -hw, baseY), W2(e * hl, hw, baseY), W2(e * ridge, 0, topY), pedi, [e * ob.ux, 0, e * ob.uz]);   // หน้าบันทอง
            // ชั้นกันสาดรอบอาคาร (ต่ำลงมา)
            const sk = 2.2, sy0 = h - 2.4, sy1 = h - 0.6;
            for (const [a, b] of [[[-ob.hl, -ob.hw], [ob.hl, -ob.hw]], [[ob.hl, -ob.hw], [ob.hl, ob.hw]], [[ob.hl, ob.hw], [-ob.hl, ob.hw]], [[-ob.hl, ob.hw], [-ob.hl, -ob.hw]]]) {
              const nu = Math.sign(a[0] + b[0]) || 0, nv = Math.sign(a[1] + b[1]) || 0;
              const a2 = [a[0] + Math.sign(a[0]) * sk, a[1] + Math.sign(a[1]) * sk], b2 = [b[0] + Math.sign(b[0]) * sk, b[1] + Math.sign(b[1]) * sk];
              quad(R, W2(a[0], a[1], sy1), W2(b[0], b[1], sy1), W2(b2[0], b2[1], sy0), W2(a2[0], a2[1], sy0), green, [0, 1, 0]);
              void nu; void nv;
            }
            // สันหลังคา + ช่อฟ้า (แท่งทองปลายสัน)
            const rg = 0.18;
            quad(R, W2(-ridge, -rg, topY + 0.05), W2(ridge, -rg, topY + 0.05), W2(ridge, rg, topY + 0.05), W2(-ridge, rg, topY + 0.05), gold, [0, 1, 0]);
            stupas.push({ chofa: true, a: W2(-ridge - 0.3, 0, topY), b: W2(ridge + 0.3, 0, topY) });
          } else {
            for (const s of [-1, 1]) quad(R, W2(-ridge, 0, topY), W2(ridge, 0, topY), W2(hl, s * hw, baseY), W2(-hl, s * hw, baseY), s > 0 ? rc : rc2, [0, 1, 0]);
            for (const e of [-1, 1]) {
              if (shape === 'gabled') tri(R, W2(e * hl, -hw, baseY), W2(e * hl, hw, baseY), W2(e * ridge, 0, topY), wallC, [e * ob.ux, 0, e * ob.uz]);
              else tri(R, W2(e * hl, -hw, baseY), W2(e * hl, hw, baseY), W2(e * ridge, 0, topY), rc.clone().multiplyScalar(0.93), [0, 1, 0]);
            }
          }
        }
      }
    }
    // ── ถ้าพิกัดสถานีตกอยู่ในอาคาร (พิกัดคลาดเล็กน้อย) → ขยับตู้ออกมาที่ขอบอาคาร +2 ม. ──
    for (const b of bInfo) {
      if (!pip(opts.cabXZ[0], opts.cabXZ[1], b.outer)) continue;
      let best = null;
      for (let i = 0; i < b.outer.length; i++) { const a = b.outer[i], c = b.outer[(i + 1) % b.outer.length], d = segDist(opts.cabXZ[0], opts.cabXZ[1], a, c); if (!best || d[0] < best[0]) best = [d[0], d[1], d[2], a, c]; }
      if (best) { const [, x, z, a, c] = best, L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1; opts.cabXZ = [x + (c[1] - a[1]) / L * 2.2, z - (c[0] - a[0]) / L * 2.2]; }
      break;
    }
    // ── หันหน้าตู้เข้าหาถนนที่ใกล้ที่สุด ──
    let bestR = null;
    for (const el of els) {
      if (el.type !== 'way' || !el.geometry || !(el.tags || {}).highway) continue;
      const line = el.geometry.map(p => P(p.lat, p.lon));
      for (let i = 0; i < line.length - 1; i++) { const d = segDist(opts.cabXZ[0], opts.cabXZ[1], line[i], line[i + 1]); if (!bestR || d[0] < bestR[0]) bestR = d; }
    }
    opts.cabYaw = bestR && bestR[0] > 0.5 && bestR[0] < 60 ? Math.atan2(bestR[1] - opts.cabXZ[0], bestR[2] - opts.cabXZ[1]) : 0;
    // ── 2) สถูป/เจดีย์ ──
    for (const el of els) {
      const t = el.tags || {}; if (t.man_made !== 'stupa') continue;
      let x, z, r = 4;
      if (el.type === 'node') [x, z] = P(el.lat, el.lon);
      else if (el.geometry) { const rr = el.geometry.map(p => P(p.lat, p.lon)); x = rr.reduce((s, q) => s + q[0], 0) / rr.length; z = rr.reduce((s, q) => s + q[1], 0) / rr.length; r = Math.max(2.5, Math.sqrt(Math.abs(areaXZ(rr)) / Math.PI)); }
      if (x == null || Math.hypot(x - r0[0], z - r0[1]) > hideR) continue;
      stupas.push({ x, z, r, h: num(t.height) || r * 4.5, gold: /gold/i.test(t['building:colour'] || t.colour || '') || hash(el.id) < 0.4 });
    }

    // ── 3) ต้นไม้ ────────────────────────────────────────────────────────
    const grid = new Map(), GS = 25;                          // ตารางค้นอาคารเร็ว (กันต้นไม้งอกในตึก)
    bInfo.forEach((b, i) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of b.outer) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } b.bb = [x0, z0, x1, z1]; for (let gx = Math.floor(x0 / GS); gx <= Math.floor(x1 / GS); gx++) for (let gz = Math.floor(z0 / GS); gz <= Math.floor(z1 / GS); gz++) { const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
    const inBuilding = (x, z, pad) => { const l = grid.get(Math.floor(x / GS) + ',' + Math.floor(z / GS)); if (!l) return false; for (const i of l) { const b = bInfo[i]; if (x < b.bb[0] - pad || x > b.bb[2] + pad || z < b.bb[1] - pad || z > b.bb[3] + pad) continue; if (pip(x, z, b.outer)) return true; if (pad > 0 && (pip(x + pad, z, b.outer) || pip(x - pad, z, b.outer) || pip(x, z + pad, b.outer) || pip(x, z - pad, b.outer))) return true; } return false; };
    const MAXT = 4500;
    const addTree = (x, z, s, seed) => {
      if (trees.length >= MAXT || Math.hypot(x - r0[0], z - r0[1]) > hideR + 20 || Math.hypot(x - opts.cabXZ[0], z - opts.cabXZ[1]) < 15) return;
      if (inBuilding(x, z, 1.2)) return;
      trees.push({ x, z, s: s * (0.8 + hash(seed) * 0.5), c: hash(seed + 7), pal: hash(seed + 3) < 0.15 });
    };
    for (const el of els) {
      const t = el.tags || {};
      if (el.type === 'node' && t.natural === 'tree') { const [x, z] = P(el.lat, el.lon); addTree(x, z, 1.1, el.id); continue; }
      if (el.type !== 'way' || !el.geometry) continue;
      const line = el.geometry.map(p => P(p.lat, p.lon));
      if (t.natural === 'tree_row') { for (let i = 0; i < line.length - 1; i++) { const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d < L; d += 7) addTree(a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L, 1, el.id + i * 31 + d); } continue; }
      const hw = { trunk: 11, primary: 10, secondary: 8, tertiary: 7, residential: 5, unclassified: 5, living_street: 4 }[t.highway];
      if (hw) {                                           // ต้นไม้ริมทาง (สองฝั่ง ทุก ~16 ม.)
        if (/^(yes|true)$/.test(t.bridge || '') || t.tunnel) continue;
        for (let i = 0; i < line.length - 1; i++) {
          const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
          const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
          for (let d = 6; d < L - 3; d += 16) for (const s of [-1, 1]) {
            const sd = el.id * 7 + i * 131 + Math.round(d) * 3 + (s > 0 ? 1 : 0);
            if (hash(sd) < 0.35) continue;
            const off = hw + 1.8 + hash(sd + 1) * 1.5;
            addTree(a[0] + (b[0] - a[0]) * d / L + nx * s * off, a[1] + (b[1] - a[1]) * d / L + nz * s * off, 0.95, sd);
          }
        }
        continue;
      }
      const green = /^(park|garden|golf_course)$/.test(t.leisure || '') || /^(grass|forest|recreation_ground|cemetery|meadow|village_green|orchard)$/.test(t.landuse || '') || /^(wood|scrub|grassland)$/.test(t.natural || '');
      if (green && line.length > 3) {
        const sp = t.landuse === 'forest' || t.natural === 'wood' ? 6 : t.landuse === 'orchard' ? 7 : /grass|meadow|grassland/.test((t.landuse || '') + (t.natural || '')) ? 22 : 10;
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of line) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
        x0 = Math.max(x0, r0[0] - hideR); x1 = Math.min(x1, r0[0] + hideR); z0 = Math.max(z0, r0[1] - hideR); z1 = Math.min(z1, r0[1] + hideR);
        const rr = rng(el.id >>> 0);
        for (let x = x0; x < x1; x += sp) for (let z = z0; z < z1; z += sp) {
          const jx = x + (rr() - 0.5) * sp * 0.9, jz = z + (rr() - 0.5) * sp * 0.9;
          if (pip(jx, jz, line)) addTree(jx, jz, sp <= 7 ? 1.15 : 1.25, Math.round(jx * 13 + jz * 7));
        }
      }
    }

    // ── 4) รวมเป็น mesh ─────────────────────────────────────────────────
    const grp = new T.Group();
    const geo = (G, uv) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(G.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(G.n, 3)); g.setAttribute('color', new T.Float32BufferAttribute(G.c, 3)); if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(G.uv, 2)); return g; };
    const tex = windowTextures(T);
    const wallMat = new T.MeshLambertMaterial({ vertexColors: true, map: tex.day, emissive: 0xffffff, emissiveMap: tex.night, emissiveIntensity: 0 });
    const roofMat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    if (W.p.length) grp.add(new T.Mesh(geo(W, true), wallMat));
    if (R.p.length) grp.add(new T.Mesh(geo(R), roofMat));
    // ต้นไม้ (instanced: ลำต้น + พุ่ม)
    if (trees.length) {
      const trunkG = new T.CylinderGeometry(0.16, 0.24, 1, 6); trunkG.translate(0, 0.5, 0);
      const crownG = new T.IcosahedronGeometry(1, 0);
      const palmG = new T.ConeGeometry(1, 0.9, 7);
      const trunk = new T.InstancedMesh(trunkG, new T.MeshLambertMaterial({ color: '#7a5a3c' }), trees.length);
      const crown = new T.InstancedMesh(crownG, new T.MeshLambertMaterial({ color: '#ffffff' }), trees.length);
      const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3(), cc = new T.Color();
      const greens = ['#4f8f3a', '#5e9c3f', '#3f7d35', '#6aa84a', '#4a8a46', '#71a63f', '#3d7543'];
      trees.forEach((tr, i) => {
        const th = 2.2 * tr.s * (tr.pal ? 2.6 : 1), cr = 2.4 * tr.s;
        ps.set(tr.x, 0, tr.z); sc.set(1, th, 1); q.identity(); m.compose(ps, q, sc); trunk.setMatrixAt(i, m);
        ps.set(tr.x, th + cr * 0.65, tr.z); sc.set(cr, cr * (tr.pal ? 0.55 : 0.95), cr);
        q.setFromAxisAngle(new T.Vector3(0, 1, 0), tr.c * 6.28); m.compose(ps, q, sc); crown.setMatrixAt(i, m);
        crown.setColorAt(i, cc.set(greens[Math.floor(tr.c * greens.length) % greens.length]));
      });
      if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
      grp.add(trunk, crown); void palmG;
    }
    // ถังน้ำบนหลังคา (สีฟ้า PE / สเตนเลส)
    if (tanks.length) {
      const tg = new T.CylinderGeometry(0.55, 0.55, 1.3, 12); tg.translate(0, 0.65 + 0.5, 0);
      const tm = new T.InstancedMesh(tg, new T.MeshLambertMaterial({ color: '#ffffff' }), tanks.length);
      const m = new T.Matrix4(), cc = new T.Color();
      tanks.forEach((k, i) => { const s = k.big ? 1.6 : 1; m.makeScale(s, s, s).setPosition(k.x, k.y, k.z); tm.setMatrixAt(i, m); tm.setColorAt(i, cc.set(k.blue ? '#2f6fb3' : '#c9ced3')); });
      if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
      grp.add(tm);
    }
    // เจดีย์ + ช่อฟ้า
    for (const s of stupas) {
      if (s.chofa) {
        for (const p of [s.a, s.b]) { const c = new T.Mesh(new T.ConeGeometry(0.25, 1.6, 6), new T.MeshLambertMaterial({ color: '#e2b13c' })); c.position.set(p[0], p[1] + 0.8, p[2]); c.rotation.z = 0.35; grp.add(c); }
        continue;
      }
      const pts = []; const H = s.h, Rr = s.r;
      [[0, 0], [1, 0], [1, 0.08], [0.85, 0.12], [0.88, 0.22], [0.92, 0.38], [0.8, 0.52], [0.45, 0.6], [0.32, 0.66], [0.25, 0.72], [0.12, 0.9], [0.03, 1]].forEach(([r, y]) => pts.push(new T.Vector2(r * Rr, y * H)));
      const m = new T.Mesh(new T.LatheGeometry(pts, 20), new T.MeshLambertMaterial({ color: s.gold ? '#e0b142' : '#f4f1ea' }));
      m.position.set(s.x, 0, s.z); grp.add(m);
    }
    return { grp, wallMat, nBuild: bInfo.length, nTree: trees.length, cabXZ: opts.cabXZ, cabYaw: opts.cabYaw || 0 };
  }

  // ลายหน้าต่าง: กลางวัน (คูณกับสีผนัง) + กลางคืน (ไฟติดบางห้อง)
  function windowTextures(T) {
    const N = 4, S = 64, mk = night => {
      const c = document.createElement('canvas'); c.width = c.height = N * S; const g = c.getContext('2d');
      g.fillStyle = night ? '#000' : '#fff'; g.fillRect(0, 0, N * S, N * S);
      const r = rng(night ? 99 : 7);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * S, y = j * S;
        if (night) { if (r() < 0.42) { g.fillStyle = r() < 0.7 ? '#ffd892' : '#cfe6ff'; g.fillRect(x + 14, y + 16, 36, 30); } }
        else { g.fillStyle = '#8193a3'; g.fillRect(x + 14, y + 16, 36, 30); g.fillStyle = '#b9c6d0'; g.fillRect(x + 14, y + 16, 36, 5); g.fillStyle = '#e7e2d9'; g.fillRect(x + 10, y + 46, 44, 4); }
      }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / N, 1 / N); t.anisotropy = 8; return t;
    };
    return { day: mk(false), night: mk(true) };
  }

  // ── custom layer: วาด three.js ร่วมกับแผนที่ (depth เดียวกับอาคาร) ────────
  function cabinetLayer(st) {
    const T = window.THREE, ml = window.maplibregl;
    const merc = ml.MercatorCoordinate.fromLngLat([st.lon, st.lat], 0);
    const mpu = merc.meterInMercatorCoordinateUnits();
    const color = frcHex(st.frc);
    let renderer, scene, camera, cab, cabRoot, beam, beamMat, ring, ringMat, city = null, night = false, lights = {};
    return {
      id: 'frc3d-cabinet', type: 'custom', renderingMode: '3d',
      onAdd(map, gl) {
        camera = new T.Camera(); scene = new T.Scene();
        lights.hemi = new T.HemisphereLight(0xffffff, 0x6b6b60, 0.78); scene.add(lights.hemi);
        lights.sun = new T.DirectionalLight(0xfff4e0, 0.62); lights.sun.position.set(-40, 70, 25); scene.add(lights.sun);
        cabRoot = new T.Group(); scene.add(cabRoot);
        cab = buildCabinet(T, color); cabRoot.add(cab.grp);
        // ลำแสงเหนือตู้ — หาตำแหน่งได้เมื่อซูมออก
        beamMat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.0, depthWrite: false, side: T.DoubleSide });
        beam = new T.Mesh(new T.CylinderGeometry(0.35, 0.9, BEAM_H, 24, 1, true), beamMat);
        beam.position.y = 2.0 + BEAM_H / 2; cabRoot.add(beam);
        // วงแสงบนพื้นรอบตู้ (กะพริบช้าๆ)
        ringMat = new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide });
        ring = new T.Mesh(new T.RingGeometry(1.6, 2.1, 48), ringMat);
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; cabRoot.add(ring);
        renderer = new T.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
        renderer.autoClear = false;
        this.map = map;
      },
      setCity(c) { if (city) scene.remove(city.grp); city = c; if (c) { scene.add(c.grp); cabRoot.position.set(c.cabXZ[0], 0, c.cabXZ[1]); cab.grp.rotation.y = c.cabYaw; c.wallMat.emissiveIntensity = night ? 0.85 : 0; } this.map && this.map.triggerRepaint(); },
      setNight(on) {
        if (!lights.hemi) return;
        if (city) city.wallMat.emissiveIntensity = on ? 0.85 : 0;
        night = on; beamMat.blending = on ? T.AdditiveBlending : T.NormalBlending; beamMat.needsUpdate = true;
        lights.hemi.intensity = on ? 0.42 : 0.78; lights.sun.intensity = on ? 0.18 : 0.62;
        cab.dropMat.emissiveIntensity = on ? 0.9 : 0.15;
        cab.lampMat.emissiveIntensity = on ? 1.2 : 0.0; cab.lampLight.intensity = on ? 2.2 : 0;
      },
      render(gl, matrix) {
        const z = this.map.getZoom();
        // ขยายขนาดตู้เมื่อซูมออก (ขนาดจริงเมื่อซูมใกล้ ≥ 18.5) — ไม่งั้นมองไม่เห็นในภาพเมือง
        const k = exag(z), a = beamAlpha(z);
        beamMat.opacity = a; beam.visible = a > 0.01;
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 450);
        ringMat.opacity = (0.35 + 0.35 * pulse) * (night ? 1 : 0.8);
        ring.scale.setScalar(1 + 0.25 * pulse);
        cabRoot.scale.setScalar(k);              // ขยายเฉพาะตู้ — เมืองคงขนาดจริง
        const s = mpu;
        const l = new T.Matrix4()
          .makeTranslation(merc.x, merc.y, merc.z)
          .scale(new T.Vector3(s, -s, s))
          .multiply(new T.Matrix4().makeRotationX(Math.PI / 2));
        camera.projectionMatrix = new T.Matrix4().fromArray(matrix).multiply(l);
        renderer.resetState();
        renderer.render(scene, camera);
        this.map.triggerRepaint();
      },
    };
  }

  // ── โหมดกลางคืน: ปรับสีชั้นแผนที่ (เก็บค่าเดิมไว้คืน) ──────────────────────
  function applyNight(map, on, saved) {
    const style = map.getStyle(); if (!style) return;
    for (const L of style.layers) {
      const id = L.id.toLowerCase(), set = (p, v) => {
        try { const k = L.id + '|' + p; if (!(k in saved)) saved[k] = map.getPaintProperty(L.id, p); map.setPaintProperty(L.id, p, on ? v : saved[k]); } catch (e) {}
      };
      if (L.type === 'background') set('background-color', '#151a22');
      else if (L.type === 'fill') set('fill-color', /water|ocean|river/.test(id) ? '#0c2742' : /park|grass|wood|forest|landcover|green/.test(id) ? '#17291f' : '#1d222b');
      else if (L.type === 'line') set('line-color', /water|river|canal/.test(id) ? '#123a60' : /rail/.test(id) ? '#4a4f5a' : /road|street|highway|motorway|trunk|primary|secondary|tertiary|minor|path|bridge|tunnel/.test(id) ? '#3a404c' : '#2c313a');
      else if (L.type === 'fill-extrusion') set('fill-extrusion-color', '#3b414b');
      else if (L.type === 'symbol') { set('text-color', '#d6dde7'); set('text-halo-color', '#0d1117'); }
    }
  }

  function ensureBuildings(map) {
    const st = map.getStyle(); if (!st) return;
    const has = st.layers.some(l => l.type === 'fill-extrusion');
    const src = Object.keys(st.sources).find(k => st.sources[k].type === 'vector');
    if (has || !src) return;
    map.addLayer({
      id: 'frc3d-buildings', type: 'fill-extrusion', source: src, 'source-layer': 'building', minzoom: 13.5,
      paint: {
        'fill-extrusion-color': '#d9d6d1',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.92,
      },
    });
  }

  // ── เปิดหน้าต่าง 3D ───────────────────────────────────────────────────────
  let _cur = null;
  async function open(st) {
    if (!st || !isFinite(st.lat) || !isFinite(st.lon)) { alert('ไม่มีพิกัดสถานี'); return; }
    close(); injectCss();
    const wrap = document.createElement('div'); wrap.id = 'frc3d-wrap';
    const tsTxt = st.ts ? new Date(st.ts).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    wrap.innerHTML =
      '<div id="frc3d-map"></div>' +
      '<div id="frc3d-bar">' +
        '<div class="frc3d-title">🏙 ' + esc(st.name || 'สถานี') + '<small>มุมมอง 3 มิติ · ' + st.lat.toFixed(5) + ', ' + st.lon.toFixed(5) + (st.sample ? ' · ค่าตัวอย่าง' : '') + '</small></div>' +
        '<div class="frc3d-sp"></div>' +
        '<button class="frc3d-btn" data-a="replay">▶ บินใหม่</button>' +
        '<button class="frc3d-btn on" data-a="orbit">🔄 หมุนรอบ</button>' +
        '<button class="frc3d-btn" data-a="night">🌙 กลางคืน</button>' +
        '<button class="frc3d-btn" data-a="near">🔍 ดูตู้ใกล้ๆ</button>' +
        '<button class="frc3d-btn frc3d-close" data-a="close">✕ ปิด</button>' +
      '</div>' +
      '<div id="frc3d-msg">กำลังโหลดแผนที่ 3 มิติ…</div><div id="frc3d-chip"></div>' +
      '<div id="frc3d-attr">© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</div>';
    document.body.appendChild(wrap);
    const msg = wrap.querySelector('#frc3d-msg');
    const state = { wrap, map: null, orbit: true, night: false, saved: {}, layer: null, st };
    _cur = state;
    wrap.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (a) act(a.dataset.a, a); });
    document.addEventListener('keydown', onKey);

    try { await ensureLibs(); } catch (e) { msg.textContent = '⚠ ' + e.message; return; }
    if (_cur !== state) return;
    const ml = window.maplibregl;
    const map = new ml.Map({
      container: wrap.querySelector('#frc3d-map'), style: CFG.styleUrl,
      center: [st.lon, st.lat], zoom: NEAR_Z, pitch: 62, bearing: -25, maxPitch: 80, maxZoom: 22,
      antialias: true, attributionControl: false,
    });
    state.map = map;
    map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'bottom-left');
    map.on('error', e => { if (!map.loaded()) msg.textContent = '⚠ โหลดแผนที่ไม่สำเร็จ (ตรวจอินเทอร์เน็ต)'; console.warn('[FRC3D]', e && e.error); });
    map.on('load', () => {
      msg.remove();
      ensureBuildings(map);
      state.layer = cabinetLayer(st); map.addLayer(state.layer);
      // ป้ายค่าเหนือตู้
      const c = frcHex(st.frc), el = document.createElement('div');
      el.className = 'frc3d-card'; el.style.setProperty('--c', c);
      el.innerHTML = '<div class="n">' + esc(st.name || '') + '</div>' +
        '<div class="v"><b>' + (st.frc != null ? Number(st.frc).toFixed(2) : '—') + '</b><span>mg/L คลอรีนอิสระ · ' + frcText(st.frc) + '</span></div>' +
        (st.ec != null ? '<div class="s">ความนำไฟฟ้า ' + Math.round(st.ec) + ' µS/cm</div>' : '') +
        (tsTxt ? '<div class="s">' + tsTxt + '</div>' : '');
      const mk = new ml.Marker({ element: el, anchor: 'bottom', offset: [0, -70] }).setLngLat([st.lon, st.lat]).addTo(map);
      // ยกป้ายให้อยู่เหนือตู้/ลำแสงตามระดับซูม
      const lift = () => {
        const z = map.getZoom(), k = exag(z);
        const mpp = 40075016.686 * Math.cos(st.lat * Math.PI / 180) / (512 * Math.pow(2, z));
        const h = (beamAlpha(z) > 0.05 ? (2 + BEAM_H) : 4.4) * k;
        const px = h / mpp * Math.sin(map.getPitch() * Math.PI / 180);
        const y = map.project(mk.getLngLat()).y, room = y - el.offsetHeight - 78;   // ไม่ให้ป้ายชนแถบเมนูด้านบน
        mk.setOffset([0, -Math.round(Math.max(30, Math.min(room, px + 14)))]);
      };
      map.on('move', lift); lift();
      setTimeout(() => fly(state), 700);
      loadCity(state, mk);
    });
    ['mousedown', 'touchstart', 'wheel'].forEach(ev => map.getCanvas().addEventListener(ev, () => setOrbit(state, false), { passive: true }));
  }

  // ── โหลดข้อมูลอาคาร OSM แล้วสร้างเมืองมีสี ─────────────────────────────────
  async function loadCity(state, mk) {
    const st = state.st, map = state.map, chip = state.wrap.querySelector('#frc3d-chip');
    const say = (t, ms) => { chip.textContent = t; chip.style.display = 'block'; if (ms) setTimeout(() => { if (chip.textContent === t) chip.style.display = 'none'; }, ms); };
    say('🏗 กำลังสร้างเมือง 3 มิติจากข้อมูล OpenStreetMap…');
    const kx = 111320 * Math.cos(st.lat * Math.PI / 180), kz = 110540;
    const P = (la, lo) => [(lo - st.lon) * kx, -(la - st.lat) * kz];
    try {
      const osm = await fetchOSM(st.lat, st.lon, R_CITY + 120);
      if (_cur !== state) return;
      const t0 = performance.now();
      const c = buildCity(osm, P, { stationXZ: [0, 0], radius: R_CITY, cabXZ: [0, 0] });
      if (_cur !== state) return;
      state.layer.setCity(c); hideBase(map, st, R_CITY);
      const [cx, cz] = c.cabXZ; if (cx || cz) mk.setLngLat([st.lon + cx / kx, st.lat - cz / kz]);
      console.log('[FRC3D] เมือง:', c.nBuild, 'อาคาร,', c.nTree, 'ต้นไม้,', Math.round(performance.now() - t0), 'ms');
      say('🏙 อาคาร ' + c.nBuild.toLocaleString() + ' หลัง · ต้นไม้ ' + c.nTree.toLocaleString() + ' ต้น · ข้อมูล OSM รัศมี ' + R_CITY + ' ม.', 6000);
    } catch (e) {
      console.warn('[FRC3D] OSM', e);
      say('⚠ ดึงข้อมูลอาคารไม่สำเร็จ (Overpass ไม่ว่าง) — แสดงแบบกล่องไปก่อน ลองกด ✕ แล้วเปิดใหม่', 9000);
    }
  }
  // ซ่อนกล่องอาคารของแผนที่ฐานในรัศมีที่เราสร้างเมืองเอง (กันซ้อนกัน)
  function hideBase(map, st, r) {
    const pt = { type: 'Point', coordinates: [st.lon, st.lat] }, cond = ['>', ['distance', pt], r];
    for (const L of map.getStyle().layers) {
      const isB = L['source-layer'] === 'building' || (/building/i.test(L.id) && (L.type === 'fill-extrusion' || L.type === 'fill'));
      if (!isB) continue;
      const f = map.getFilter(L.id);
      try { map.setFilter(L.id, f ? ['all', f, cond] : cond); } catch (e) { try { map.setFilter(L.id, cond); } catch (e2) { try { map.setLayoutProperty(L.id, 'visibility', 'none'); } catch (e3) {} } }
    }
  }

  function fly(state) {
    const m = state.map, st = state.st; if (!m) return;
    m.stop();
    m.jumpTo({ center: [st.lon, st.lat], zoom: NEAR_Z, pitch: 62, bearing: -25 });
    m.easeTo({ zoom: FAR_Z, pitch: 60, bearing: 65, duration: 10000, easing: t => t < 0.12 ? 0 : 1 - Math.pow(1 - (t - 0.12) / 0.88, 3) });
    m.once('moveend', () => { if (state.orbit) orbitStep(state); });
  }
  function orbitStep(state) {
    const m = state.map; if (!m || !state.orbit || _cur !== state) return;
    m.rotateTo(m.getBearing() + 12, { duration: 4000, easing: t => t });
    m.once('moveend', () => orbitStep(state));
  }
  function setOrbit(state, on) {
    state.orbit = on;
    const b = state.wrap.querySelector('[data-a="orbit"]'); if (b) b.classList.toggle('on', on);
    if (on) orbitStep(state); else if (state.map) state.map.stop();
  }
  function act(a, btn) {
    const s = _cur; if (!s) return;
    if (a === 'close') return close();
    if (!s.map) return;
    if (a === 'replay') { s.orbit = true; s.wrap.querySelector('[data-a="orbit"]').classList.add('on'); fly(s); }
    else if (a === 'orbit') setOrbit(s, !s.orbit);
    else if (a === 'near') { setOrbit(s, false); s.map.easeTo({ center: [s.st.lon, s.st.lat], zoom: NEAR_Z, pitch: 62, bearing: s.map.getBearing() + 30, duration: 3000 }); }
    else if (a === 'night') {
      s.night = !s.night; btn.classList.toggle('on', s.night); btn.textContent = s.night ? '☀ กลางวัน' : '🌙 กลางคืน';
      s.wrap.classList.toggle('frc3d-night', s.night);
      applyNight(s.map, s.night, s.saved); if (s.layer) s.layer.setNight(s.night);
    }
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (!_cur) return;
    try { _cur.map && _cur.map.remove(); } catch (e) {}
    _cur.wrap.remove(); _cur = null;
    document.removeEventListener('keydown', onKey);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  window.FRC3D = { open, close, frcHex, map: () => _cur && _cur.map };
})();
