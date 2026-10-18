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
    cityBase: 'data/city/',                // ข้อมูลเมืองที่สร้างไว้ล่วงหน้า (GitHub Action: tools/build_city.py)
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
  const NEAR_Z = 21.3, FAR_Z = 16.9, INTRO_Z = 15.6, BEAM_H = 14;
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
#frc3d-wrap{position:fixed;inset:0;z-index:100000;background:linear-gradient(#8ec5ef 0%,#cfe6f7 45%,#f3efe7 100%);font-family:Sarabun,'Noto Sans Thai',sans-serif}
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
.frc3d-night{background:linear-gradient(#05070d 0%,#141b2b 60%,#1b2233 100%)!important}
.frc3d-night .frc3d-card{background:rgba(20,24,32,.92);color:#eef2f7}
.frc3d-night .frc3d-card .v span,.frc3d-night .frc3d-card .s{color:#b9c2cf}
.frc3d-night .frc3d-card:after{border-top-color:rgba(20,24,32,.92)}
#frc3d-chip{display:none;position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:2;background:rgba(20,24,32,.85);color:#fff;padding:7px 14px;border-radius:20px;font-size:13px;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.3)}
#frc3d-attr{position:absolute;right:8px;bottom:6px;z-index:2;font-size:10.5px;color:#333;background:rgba(255,255,255,.75);padding:1px 6px;border-radius:6px}
#frc3d-attr a{color:#0b63c4}
@media (max-width:600px){.frc3d-title{font-size:13px}.frc3d-btn{padding:7px 9px;font-size:12px}}`;
    document.head.appendChild(st);
  }

  // ── ตู้ตรวจวัดคุณภาพน้ำ (ตู้สเตนเลส + สติกเกอร์ฟ้า + หลังคาเหล็กสีน้ำเงิน ตามตู้จริง) — หน่วยเมตร แกน y ขึ้น ──
  function wrapTexture(T, side) {
    const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const st = g.createLinearGradient(0, 0, W, 0); st.addColorStop(0, '#c4c9ce'); st.addColorStop(0.5, '#eceef0'); st.addColorStop(1, '#bfc4c9');
    g.fillStyle = st; g.fillRect(0, 0, W, H);                                         // สเตนเลส
    if (!side) { g.fillStyle = '#99a0a7'; for (let y = 20; y < 92; y += 10) g.fillRect(40, y, W - 80, 4); }   // ช่องระบายอากาศ
    const top = side ? 70 : 108, bg = g.createLinearGradient(0, top, 0, H);
    bg.addColorStop(0, '#2b8be0'); bg.addColorStop(0.5, '#1660b6'); bg.addColorStop(1, '#0a3d84');
    g.fillStyle = bg; g.fillRect(10, top, W - 20, H - top - 14);                       // สติกเกอร์ฟ้า
    if (!side) {                                                                       // แผงขาวด้านบนสติกเกอร์: ตราหยดน้ำ + ชื่อตู้
      g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect ? g.roundRect(26, top + 16, W - 52, 112, 14) : g.rect(26, top + 16, W - 52, 112); g.fill();
      g.fillStyle = '#1660b6'; g.beginPath(); g.arc(70, top + 72, 30, 0, 6.283); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(70, top + 50); g.bezierCurveTo(86, top + 70, 84, top + 90, 70, top + 90); g.bezierCurveTo(56, top + 90, 54, top + 70, 70, top + 50); g.fill();
      g.fillStyle = '#0b4f9a'; g.textAlign = 'left'; g.font = 'bold 21px Sarabun, "Noto Sans Thai", sans-serif';
      g.fillText('ตู้ตรวจวัด', 108, top + 62); g.fillText('คุณภาพน้ำ', 108, top + 88); g.font = '15px Sarabun, sans-serif'; g.fillStyle = '#3d6ea8'; g.fillText('ออนไลน์ 24 ชม.', 108, top + 112);
    }
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 5;                          // คลื่นน้ำ
    for (let k = 0; k < 3; k++) { const y = H - 64 - k * 24; g.beginPath(); g.moveTo(10, y); for (let x = 10; x <= W - 10; x += 14) g.lineTo(x, y + Math.sin(x / 24 + k) * 6); g.stroke(); }
    const drop = (x, y, s, a) => { g.fillStyle = 'rgba(255,255,255,' + a + ')'; g.beginPath(); g.moveTo(x, y - s); g.bezierCurveTo(x + s * 0.7, y - s * 0.2, x + s * 0.6, y + s * 0.6, x, y + s * 0.6); g.bezierCurveTo(x - s * 0.6, y + s * 0.6, x - s * 0.7, y - s * 0.2, x, y - s); g.fill(); };
    if (side) { drop(W * 0.5, top + 150, 58, 0.95); drop(W * 0.25, top + 80, 18, 0.6); drop(W * 0.76, top + 110, 24, 0.7); g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 26px Sarabun, sans-serif'; g.fillText('น้ำประปา', W / 2, top + 250); g.fillText('ดื่มได้', W / 2, top + 284); }
    else { drop(W * 0.5, top + 230, 44, 0.95); drop(W * 0.22, top + 190, 16, 0.6); drop(W * 0.8, top + 205, 20, 0.7); }
    const t = new T.CanvasTexture(c); t.anisotropy = 8; return t;
  }
  function buildCabinet(T, color, opt) {
    opt = opt || {};
    const grp = new T.Group();
    const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.5, metalness: 0.15 }, o || {}));
    const box = (w, h, d, mat, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); grp.add(m); return m; };
    const steel = M('#d3d7db', { metalness: 0.35, roughness: 0.32 }), steelD = M('#b4bac0', { metalness: 0.35, roughness: 0.4 }), conc = M('#cfcbc3', { roughness: 0.95 });
    const BW = 0.72, BD = 0.5, BH = 1.62, B0 = 0.22;
    box(1.6, B0, 1.3, conc, 0, B0 / 2, -0.15);                                   // ฐานคอนกรีตยกสูง
    box(BW, BH, BD, steel, 0, B0 + BH / 2, 0);
    box(BW + 0.06, 0.035, BD + 0.06, steelD, 0, B0 + BH + 0.018, 0);
    const front = new T.Mesh(new T.PlaneGeometry(BW - 0.04, BH - 0.06), new T.MeshLambertMaterial({ map: wrapTexture(T, false) }));
    front.position.set(0, B0 + BH / 2, BD / 2 + 0.003); grp.add(front);
    for (const s of [-1, 1]) {
      const side = new T.Mesh(new T.PlaneGeometry(BD - 0.04, BH - 0.06), new T.MeshLambertMaterial({ map: wrapTexture(T, true) }));
      side.position.set(s * (BW / 2 + 0.003), B0 + BH / 2, 0); side.rotation.y = s * Math.PI / 2; grp.add(side);
    }
    const ledMat = M(color, { emissive: color, emissiveIntensity: 0.6, roughness: 0.2 });
    const led = new T.Mesh(new T.SphereGeometry(0.035, 12, 8), ledMat); led.position.set(BW / 2 - 0.09, B0 + BH - 0.1, BD / 2 + 0.02); grp.add(led);
    box(0.025, 0.16, 0.035, M('#8d949b', { metalness: 0.6, roughness: 0.25 }), BW / 2 - 0.07, B0 + BH * 0.55, BD / 2 + 0.02);
    // ท่อเก็บน้ำตัวอย่าง → มาตรวัดน้ำ
    const pipeMat = M('#7b8189', { metalness: 0.3, roughness: 0.45 });
    const pp = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 1.9, 10), pipeMat); const ps = opt.pipeSide || -1; pp.position.set(ps * 1.3, 0.05, 0.1); pp.rotation.z = Math.PI / 2; grp.add(pp);   // pipeSide 1 = ท่อออกขวามือคนมอง
    box(0.30, 0.12, 0.22, M('#4f565e'), ps * 2.35, 0.06, 0.1);
    // หลังคาเหล็กสีน้ำเงิน (โครงเสาสี่เหลี่ยม 2 ต้นด้านหลัง)
    if (opt.canopy !== false) {
      const blue = M('#1d5bb0', { roughness: 0.45, metalness: 0.2 }), blueD = M('#164a91', { roughness: 0.5 });
      for (const x of [-0.6, 0.6]) box(0.08, 2.55, 0.08, blue, x, B0 + 1.27, -0.5);
      box(1.28, 0.08, 0.08, blue, 0, B0 + 2.5, -0.5);
      const cr = new T.Mesh(new T.BoxGeometry(1.5, 0.04, 1.35), blue); cr.position.set(0, B0 + 2.58, 0.02); cr.rotation.x = 0.13; grp.add(cr);
      box(1.5, 0.16, 0.03, blueD, 0, B0 + 2.43, 0.7);
      for (const x of [-0.75, 0.75]) box(0.03, 0.16, 1.35, blueD, x, B0 + 2.5, 0.02);
    }
    const lampLight = new T.PointLight(0xffe2b0, 0, 6, 1.6); lampLight.position.set(0, B0 + 2.3, 0.6); grp.add(lampLight);
    const lampMat = M('#ffffff', { emissive: '#fff1c9', emissiveIntensity: 0 });
    const lamp = new T.Mesh(new T.BoxGeometry(0.5, 0.03, 0.1), lampMat); lamp.position.set(0, B0 + 2.38, 0.35); grp.add(lamp);
    return { grp, dropMat: ledMat, lampMat, lampLight };
  }

  // ── ฉากรอบตู้ที่จัดเองตามภาพ Street View (ส่วนที่ OSM ไม่มีรายละเอียด) ──────
  //   พิกัดในกรอบ "มองหน้าตู้": x = ขวามือของคนที่ยืนมองหน้าตู้ (เหมือนภาพ Street View), z = ไปทางถนน (+) / ข้างหลังตู้ (−), หน่วยเมตร
  function signTexture(T, text, sub, fg, bg) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = bg || '#ffffff'; g.fillRect(0, 0, 1024, 256);
    g.fillStyle = fg || '#0f8a6c'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold ' + (sub ? 104 : 124) + 'px Sarabun, "Noto Sans Thai", sans-serif'; g.fillText(text, 512, sub ? 100 : 128, 980);
    if (sub) { g.font = 'bold 60px Sarabun, sans-serif'; g.fillText(sub, 512, 200, 960); }
    const t = new T.CanvasTexture(c); t.anisotropy = 8; return t;
  }
  function buildProps(T, props, yawDeg) {
    const grp = new T.Group(); let raise = 0;
    const th = (yawDeg || 0) * Math.PI / 180, toF = (e, n) => { const X = e, Z = -n; return [X * Math.cos(th) - Z * Math.sin(th), X * Math.sin(th) + Z * Math.cos(th)]; };   // พิกัดจริง (ตอ., เหนือ) → กรอบฉาก
    const L = (c, o) => new T.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
    const add = (geo, mat, x, y, z, ry) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; grp.add(m); return m; };
    const B = (w, h, d) => new T.BoxGeometry(w, h, d);
    for (let p of props || []) {
      if (p.world) {                               // world: true → x = ตอ., z = เหนือ (ม. จากตู้) · rot = ทิศที่ด้านหน้าวัตถุหัน (0 = เหนือ, 90 = ตอ.)
        const [fx, fz] = toF(p.x || 0, p.z || 0); p = Object.assign({}, p, { x: fx, z: fz, rot: 180 - (p.rot || 0) - (yawDeg || 0) });
        if (p.x1 != null) { const [a1, b1] = toF(p.x1, p.z1), [a2, b2] = toF(p.x2, p.z2); p.x1 = a1; p.z1 = b1; p.x2 = a2; p.z2 = b2; }
      }
      const ry = (p.rot || 0) * Math.PI / 180;
      if (p.type === 'road') {                     // ถนนเสริม (ถนนในพื้นที่ที่ OSM ไม่ได้ดึงมา) · pts = [[ตอ., เหนือ], ...] พิกัดจริงจากตู้
        const w = p.w || 6, pts = p.pts.map(q => toF(q[0], q[1])), asphM = L('#686c71'), edgeM = L('#c9c3b8'), lineM = L('#f2f2ee');
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
          add(B(w + 1.0, 0.12, len + 0.4), edgeM, mx, 0.16, mz, ang); add(B(w, 0.14, len + 1.0), asphM, mx, 0.2, mz, ang);
          if (!p.edgeY) for (let d = 1; d < len - 1; d += 4) add(B(0.12, 0.02, 2), lineM, a[0] + (b[0] - a[0]) * d / len, 0.28, a[1] + (b[1] - a[1]) * d / len, ang);
          else for (const sd of [-1, 1]) { const ox = Math.cos(ang) * sd * (w / 2 - 0.35), oz = -Math.sin(ang) * sd * (w / 2 - 0.35); add(B(0.15, 0.02, len), L('#e3b53c'), mx + ox, 0.28, mz + oz, ang); }
        }
      } else if (p.type === 'platform') {                 // พื้นยกสูง (สนามหญ้า/สวน) + กำแพงกันดิน + ขอบฟุตบาทแดงขาว
        const cx = (p.x1 + p.x2) / 2, cz = (p.z1 + p.z2) / 2, w = p.x2 - p.x1, d = p.z2 - p.z1;
        add(B(w, p.h, d), L('#cfc8bc'), cx, p.h / 2, cz);
        add(B(w - 0.3, 0.06, d - 0.3), L('#7fae5a'), cx, p.h + 0.03, cz - 0.1);
        add(B(w, p.h + 0.05, 0.25), L(p.wall || '#d8d2c6'), cx, (p.h + 0.05) / 2, p.z2 - 0.12);
        if (p.curb !== false) for (let x = p.x1; x < p.x2; x += 1.0) add(B(0.98, 0.18, 0.3), L(Math.round((x - p.x1)) % 2 ? '#c23b2e' : '#f2f2f2'), x + 0.5, 0.09, p.z2 + (p.curbOff || 2.6));
        add(B(w, 0.12, (p.curbOff || 2.6) - 0.1), L('#cfc9bf'), cx, 0.06, p.z2 + (p.curbOff || 2.6) / 2);   // ทางเท้าหน้าแนวกำแพง
        if (p.cab) raise = p.h;
      } else if (p.type === 'shrine') {            // ศาลพระภูมิ/ศาลพระพรหม (ฐาน + เรือนทรงไทยทอง)
        const s = p.s || 1, gold = L('#e1ad3a'), red = L('#b4351f'), white = L('#f5f1e8');
        add(B(2.2 * s, 0.5 * s, 2.2 * s), white, p.x, 0.25 * s + (p.y || 0), p.z);
        add(new T.CylinderGeometry(0.22 * s, 0.28 * s, 1.6 * s, 12), white, p.x, 1.3 * s + (p.y || 0), p.z);
        add(B(1.3 * s, 0.12 * s, 1.3 * s), gold, p.x, 2.15 * s + (p.y || 0), p.z);
        add(B(0.9 * s, 0.8 * s, 0.9 * s), red, p.x, 2.6 * s + (p.y || 0), p.z);
        for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) add(new T.CylinderGeometry(0.05 * s, 0.05 * s, 0.9 * s, 6), gold, p.x + dx * s, 2.65 * s + (p.y || 0), p.z + dz * s);
        add(new T.ConeGeometry(0.85 * s, 0.9 * s, 4), gold, p.x, 3.5 * s + (p.y || 0), p.z, Math.PI / 4);
        add(new T.ConeGeometry(0.12 * s, 0.9 * s, 8), gold, p.x, 4.3 * s + (p.y || 0), p.z);
      } else if (p.type === 'sign') {              // ป้ายชื่อ (บนอาคาร/กันสาด หรือป้ายตั้ง)
        const w = p.w || 8, h = p.h || w / 4;
        const m = add(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: signTexture(T, p.text, p.sub, p.fg, p.bg), side: T.DoubleSide }), p.x, p.y || 4, p.z, ry);
        if (p.post) { add(B(0.15, (p.y || 4) - h / 2, 0.15), L('#8a9096'), p.x - w * 0.35 * Math.cos(ry), ((p.y || 4) - h / 2) / 2, p.z + w * 0.35 * Math.sin(ry)); add(B(0.15, (p.y || 4) - h / 2, 0.15), L('#8a9096'), p.x + w * 0.35 * Math.cos(ry), ((p.y || 4) - h / 2) / 2, p.z - w * 0.35 * Math.sin(ry)); }
        if (p.box) add(B(w + 0.3, h + 0.3, 0.3), L(p.box), p.x - Math.sin(ry) * 0.17, p.y || 4, p.z - Math.cos(ry) * 0.17, ry);
        void m;
      } else if (p.type === 'canopyBuilding') {    // ทางเข้าอาคาร: กันสาดใหญ่ + เสา (ป้ายชื่อติดขอบกันสาด)
        const w = p.w, d = p.d, y = p.y || 4.5;
        add(B(w, 0.6, d), L(p.color || '#f4f4f2'), p.x, y, p.z, ry);
        for (const sx of [-0.45, 0.45]) add(new T.CylinderGeometry(0.3, 0.3, y, 12), L('#e9e9e6'), p.x + sx * w * Math.cos(ry) + Math.sin(ry) * d * 0.4, y / 2, p.z - sx * w * Math.sin(ry) + Math.cos(ry) * d * 0.4);
      } else if (p.type === 'pavilion' || p.type === 'shed') {   // อาคารเปิดโล่ง (เสา + หลังคา) / เพิงหลังคาเมทัลชีท
        const g2 = new T.Group(), w = p.w, d = p.d, h = p.h;
        const colM = L(p.type === 'pavilion' ? '#f2f0ea' : '#9aa0a6'), roofM = L(p.type === 'pavilion' ? '#e9e6df' : '#a9b0b5', { side: T.DoubleSide });
        const nx = Math.max(2, Math.round(w / (p.type === 'pavilion' ? 5 : 4))), nz = Math.max(2, Math.round(d / 5));
        for (let i = 0; i <= nx; i++) for (const j of [0, nz]) { const m = new T.Mesh(B(p.type === 'pavilion' ? 0.5 : 0.15, h, p.type === 'pavilion' ? 0.5 : 0.15), colM); m.position.set(-w / 2 + i * w / nx, h / 2, -d / 2 + j * d / nz); g2.add(m); }
        if (p.type === 'pavilion') {
          const r = new T.Mesh(B(w + 1.2, 0.5, d + 1.2), roofM); r.position.y = h + 0.25; g2.add(r);
          const band = new T.Mesh(B(w + 0.2, 1.4, d + 0.2), L('#f6f5f1')); band.position.y = h - 0.7; g2.add(band);
          for (let x = -w / 2 + 0.3; x < w / 2; x += 0.35) { const s2 = new T.Mesh(B(0.08, 1.0, 0.06), L('#d4d1ca')); s2.position.set(x, h - 0.75, d / 2 + 0.14); g2.add(s2); }   // บานเกล็ด
          const inner = new T.Mesh(B(w * 0.6, h - 1.4, d * 0.5), L('#e7e2d8')); inner.position.set(-w * 0.15, (h - 1.4) / 2, -d * 0.15); g2.add(inner);   // ห้องด้านใน
          const floor = new T.Mesh(B(w, 0.15, d), L('#d9d4ca')); floor.position.y = 0.08; g2.add(floor);
        } else {
          const rise = Math.min(1.2, d * 0.12);
          for (const s of [-1, 1]) { const sl = new T.Mesh(B(w + 0.6, 0.05, d / 2 / Math.cos(Math.atan(rise / (d / 2))) + 0.4), roofM); sl.position.set(0, h + rise / 2, s * d / 4); sl.rotation.x = s * Math.atan(rise / (d / 2)); g2.add(sl); }
          const back = new T.Mesh(B(w, h * 0.6, 0.1), L('#c9c3b6')); back.position.set(0, h * 0.3, -d / 2); g2.add(back);
        }
        g2.position.set(p.x, 0, p.z); g2.rotation.y = ry; grp.add(g2);
      } else if (p.type === 'fence') {             // รั้วโปร่งสีขาว
        const len = Math.hypot(p.x2 - p.x1, p.z2 - p.z1), a = Math.atan2(p.x2 - p.x1, p.z2 - p.z1), h = p.h || 2.2, m = L(p.color || '#f3f3f0');
        for (let s = 0; s <= len; s += 0.25) add(B(0.06, h, 0.06), m, p.x1 + (p.x2 - p.x1) * s / len, h / 2, p.z1 + (p.z2 - p.z1) * s / len);
        add(B(0.08, 0.1, len), m, (p.x1 + p.x2) / 2, h, (p.z1 + p.z2) / 2, a); add(B(0.08, 0.1, len), m, (p.x1 + p.x2) / 2, 0.3, (p.z1 + p.z2) / 2, a);
        add(B(0.2, 0.35, len), L('#d8d2c6'), (p.x1 + p.x2) / 2, 0.17, (p.z1 + p.z2) / 2, a);
      } else if (p.type === 'palaceFence') {       // รั้ววัง: ฐานปูนขาว + เสาเหลี่ยมมีหัวเสา + ซี่เหล็กโปร่ง
        const len = Math.hypot(p.x2 - p.x1, p.z2 - p.z1), a = Math.atan2(p.x2 - p.x1, p.z2 - p.z1), h = p.h || 2.4, ux = (p.x2 - p.x1) / len, uz = (p.z2 - p.z1) / len;
        const wM = L(p.color || '#f5f3ee'), barM = L(p.bar || '#f0eee8'), ph = p.plinth || 0.6, sp = p.span || 3.2;
        add(B(0.45, ph, len), wM, (p.x1 + p.x2) / 2, ph / 2, (p.z1 + p.z2) / 2, a);
        add(B(0.55, 0.08, len), L('#e2ded4'), (p.x1 + p.x2) / 2, ph + 0.04, (p.z1 + p.z2) / 2, a);
        for (const yy of [ph + 0.25, h - 0.15]) add(B(0.07, 0.07, len), barM, (p.x1 + p.x2) / 2, yy, (p.z1 + p.z2) / 2, a);
        const nb = Math.floor(len / 0.16), bg = new T.BoxGeometry(0.035, h - ph - 0.05, 0.035), bi = new T.InstancedMesh(bg, barM, nb), m4b = new T.Matrix4();
        for (let i = 0; i < nb; i++) { const d = (i + 0.5) * len / nb; m4b.makeTranslation(p.x1 + ux * d, ph + (h - ph) / 2, p.z1 + uz * d); bi.setMatrixAt(i, m4b); }
        grp.add(bi);
        for (let d = 0; d <= len + 0.01; d += sp) {
          const x = p.x1 + ux * d, z = p.z1 + uz * d;
          add(B(0.5, h + 0.15, 0.5), wM, x, (h + 0.15) / 2, z, a); add(B(0.68, 0.16, 0.68), L('#ebe8e0'), x, h + 0.23, z, a);
          add(new T.ConeGeometry(0.26, 0.35, 4), wM, x, h + 0.48, z, a + Math.PI / 4);
        }
      } else if (p.type === 'skywalk') {           // ทางเชื่อมลอยฟ้า: โถงกระจกด้านบน + บันไดเลื่อนลงมาที่ทางเท้า + สะพานต่อเข้าอาคาร
        const h = p.h || 7, conc = L('#d9d7d2'), concD = L('#bdbab3'), glass = new T.MeshLambertMaterial({ color: '#86b9cc', transparent: true, opacity: 0.5, side: T.DoubleSide }), roof = L('#cfd3d6');
        const dir = deg => { const r = deg * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; };   // 0 = ไปทางถนน (+z), 90 = ขวา (+x), 180 = หลังตู้
        const piece = (x, z, rotDeg, len, mk) => { const g2 = new T.Group(); mk(g2); g2.position.set(x, 0, z); g2.rotation.y = rotDeg * Math.PI / 180; grp.add(g2); };
        // บันไดเลื่อน (ลาดลงตามทิศ esc.rot ยาว run)
        const run = p.run || 12, er = p.escRot != null ? p.escRot : 0, ang = Math.atan2(h, run), slope = Math.hypot(h, run);
        piece(p.x, p.z, er, run, g2 => {
          const e1 = new T.Mesh(B(p.escW || 4.2, 0.6, slope), concD); e1.position.set(0, h / 2, run / 2); e1.rotation.x = ang; g2.add(e1);
          for (const sx of [-1, 1]) { const gl = new T.Mesh(B(0.06, 1.2, slope), glass); gl.position.set(sx * (p.escW || 4.2) / 2, h / 2 + 0.9, run / 2); gl.rotation.x = ang; g2.add(gl); }
          const rf = new T.Mesh(B((p.escW || 4.2) + 0.8, 0.2, slope), roof); rf.position.set(0, h / 2 + 3.2, run / 2); rf.rotation.x = ang; g2.add(rf);
          for (const sx of [-1, 1]) { const c2 = new T.Mesh(B(0.4, h * 0.55 + 3, 0.4), conc); c2.position.set(sx * ((p.escW || 4.2) / 2 + 0.3), (h * 0.55 + 3) / 2, run * 0.45); g2.add(c2); }
          const land = new T.Mesh(B((p.escW || 4.2) + 1, 0.2, 2.5), concD); land.position.set(0, 0.1, run + 1.1); g2.add(land);
        });
        // โถงกระจกด้านบน (หัวบันได)
        const hH = p.hallH || 5;
        const hb = new T.Mesh(B(p.hallW || 8, hH, p.hallD || 7), glass); hb.position.set(p.x, h + hH / 2, p.z); grp.add(hb);
        const hf = new T.Mesh(B((p.hallW || 8) + 0.4, 0.6, (p.hallD || 7) + 0.4), conc); hf.position.set(p.x, h - 0.1, p.z); grp.add(hf);
        const hr = new T.Mesh(B((p.hallW || 8) + 0.6, 0.35, (p.hallD || 7) + 0.6), roof); hr.position.set(p.x, h + hH + 0.1, p.z); grp.add(hr);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c2 = new T.Mesh(B(0.7, h, 0.7), conc); c2.position.set(p.x + sx * ((p.hallW || 8) / 2 - 0.4), h / 2, p.z + sz * ((p.hallD || 7) / 2 - 0.4)); grp.add(c2); }
        // สะพานเชื่อม (ทิศ bridgeRot ยาว len)
        const br = p.bridgeRot != null ? p.bridgeRot : 180, bl = p.len || 30, bw = p.bridgeW || 4;
        piece(p.x, p.z, br, bl, g2 => {
          const d0 = (p.hallD || 7) / 2;
          const deck = new T.Mesh(B(bw, 1.0, bl), conc); deck.position.set(0, h, d0 + bl / 2); g2.add(deck);
          for (const sx of [-1, 1]) { const w2 = new T.Mesh(B(0.25, 1.3, bl), concD); w2.position.set(sx * bw / 2, h + 1.1, d0 + bl / 2); g2.add(w2); }
          const rf = new T.Mesh(B(bw + 0.6, 0.2, bl), roof); rf.position.set(0, h + 3.3, d0 + bl / 2); g2.add(rf);
          for (const sx of [-1, 1]) for (let zz = d0 + 2; zz < d0 + bl; zz += 3) { const pst = new T.Mesh(B(0.12, 2.0, 0.12), concD); pst.position.set(sx * (bw / 2 + 0.2), h + 2.3, zz); g2.add(pst); }
          for (let zz = d0 + 8; zz < d0 + bl - 1; zz += 11) { const c2 = new T.Mesh(B(0.9, h, 0.9), conc); c2.position.set(0, h / 2, zz); g2.add(c2); }
        });
        void dir;
      } else if (p.type === 'tower') {             // อาคารสูง (ใช้ลายผนังเดียวกับเมือง)
        const tx = facade(T, p.facade || 'hosp'), mats = [];
        for (const [fw] of [[p.d], [p.d], [p.w], [p.w], [p.w], [p.w]]) { const m2 = tx.day.clone(); m2.needsUpdate = true; m2.repeat.set(fw / 3.6 / 4, p.h / 3.2 / 4); mats.push(new T.MeshLambertMaterial({ color: p.color || '#f5f5f2', map: m2 })); }
        mats[2] = mats[3] = new T.MeshLambertMaterial({ color: p.roof || '#cfcac2' });
        const m3 = new T.Mesh(B(p.w, p.h, p.d), mats); m3.position.set(p.x, p.h / 2, p.z); m3.rotation.y = ry; grp.add(m3);
      } else if (p.type === 'glass') {             // ผนังกระจก/กันสาดกระจกสีเขียวน้ำทะเล (ชั้นล่างอาคาร)
        const gm = new T.MeshLambertMaterial({ color: p.color || '#1f9a8a', transparent: true, opacity: 0.85 });
        add(B(p.w, p.h, 0.15), gm, p.x, (p.y || 0) + p.h / 2, p.z, ry);
        for (let k = -p.w / 2; k <= p.w / 2 + 0.01; k += 2.4) add(B(0.1, p.h, 0.2), L('#e9eceb'), p.x + k * Math.cos(ry), (p.y || 0) + p.h / 2, p.z - k * Math.sin(ry), ry);
        if (p.canopy) add(B(p.w + 1, 0.4, p.canopy), L('#f2f2ef'), p.x + Math.sin(ry) * p.canopy / 2, (p.y || 0) + p.h + 0.2, p.z + Math.cos(ry) * p.canopy / 2, ry);
      } else if (p.type === 'hedge') {
        if (p.z1 != null) add(B(p.d || 1.0, p.h || 1.0, Math.abs(p.z2 - p.z1)), L('#3f7f35'), p.x, (p.y || 0) + (p.h || 1) / 2, (p.z1 + p.z2) / 2);
        else add(B(Math.abs(p.x2 - p.x1), p.h || 1.0, p.d || 1.0), L('#3f7f35'), (p.x1 + p.x2) / 2, (p.y || 0) + (p.h || 1) / 2, p.z);
      } else if (p.type === 'gatePost') {          // เสาประตูรั้ว (เสาขาวเหลี่ยม + บัวหัวเสา + โคมไฟ)
        const h = p.h || 3.2, wM = L('#f1ede4');
        add(B(0.9, h, 0.9), wM, p.x, h / 2, p.z, ry); add(B(1.15, 0.25, 1.15), L('#e2dccf'), p.x, h + 0.12, p.z, ry); add(B(1.1, 0.4, 1.1), L('#d9d2c4'), p.x, 0.2, p.z, ry);
        add(new T.SphereGeometry(0.28, 12, 8), new T.MeshLambertMaterial({ color: '#fff6d8', emissive: '#ffe9a8', emissiveIntensity: 0.3 }), p.x, h + 0.55, p.z);
      } else if (p.type === 'lawn') {              // สนามหญ้ายกพื้นรูปหลายเหลี่ยม · pts = [[ตอ., เหนือ], ...] พิกัดจริงจากตู้
        const sh = new T.Shape(p.pts.map(q => { const [fx, fz] = toF(q[0], q[1]); return new T.Vector2(fx, -fz); }));
        const geo = new T.ExtrudeGeometry(sh, { depth: p.h, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
        const m = new T.Mesh(geo, [L('#7fae5a'), L(p.wall || '#d7b9a6')]); grp.add(m);
        if (p.cab) raise = p.h;
      } else if (p.type === 'hedgeLine') {         // แนวพุ่มไม้ตามเส้น · pts พิกัดจริง
        const pts = p.pts.map(q => toF(q[0], q[1])), hh = p.h || 1.0, dd = p.d || 0.9;
        for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); add(B(dd, hh, len), L('#3f7f35'), (a[0] + b[0]) / 2, (p.y || 0) + hh / 2, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1])); }
      } else if (p.type === 'bridge') {            // สะพานทางเดินลอยฟ้ามีหลังคา · pts พิกัดจริง [[ตอ., เหนือ], ...]
        const pts = p.pts.map(q => toF(q[0], q[1])), h = p.h || 5, bw = p.w || 3.5, conc = L('#d9d7d2'), concD = L('#bdbab3'), roofM = L('#cfd3d6'), glass = new T.MeshLambertMaterial({ color: '#86b9cc', transparent: true, opacity: 0.45, side: T.DoubleSide });
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]), mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, ux = Math.cos(ang), uz = -Math.sin(ang);
          add(B(bw, 0.9, len), conc, mx, h, mz, ang);
          for (const sd of [-1, 1]) { add(B(0.2, 1.1, len), concD, mx + ux * sd * bw / 2, h + 1.0, mz + uz * sd * bw / 2, ang); add(B(0.05, 1.6, len), glass, mx + ux * sd * bw / 2, h + 2.35, mz + uz * sd * bw / 2, ang); }
          add(B(bw + 0.6, 0.25, len), roofM, mx, h + 3.3, mz, ang);
          for (let d = 6; d < len - 2; d += 10) add(B(0.8, h, 0.8), conc, a[0] + (b[0] - a[0]) * d / len, h / 2, a[1] + (b[1] - a[1]) * d / len, ang);
        }
      } else if (p.type === 'archGate') {          // ซุ้มประตูหลังคาโค้ง (เมทัลชีทโค้งคร่อมแต่ละช่องทาง) + เสาเหล็ก + เสาประตูคอนกรีต · พิกัดจริง
        // o = จุดอ้างอิงบนแนวกึ่งกลางช่องทางแรก [ตอ., เหนือ], u = ทิศตามถนน (องศา, ชี้เข้าด้านใน), lanes = [v กึ่งกลางช่อง], w = กว้างหลังคา, s0/s1 = ช่วงหลังคาตามถนน, posts = [v เสาคอนกรีต]
        const ub = p.u * Math.PI / 180, U = [Math.sin(ub), Math.cos(ub)], V = [Math.cos(ub), -Math.sin(ub)];
        const W = (sv, vv) => toF(p.o[0] + U[0] * sv + V[0] * vv, p.o[1] + U[1] * sv + V[1] * vv);
        const f0 = W(0, 0), f1 = W(1, 0), angU = Math.atan2(f1[0] - f0[0], f1[1] - f0[1]);
        const steel = L('#5d6670'), roofM = L('#d9dcdf', { side: T.DoubleSide }), roofU = L('#aeb4ba', { side: T.DoubleSide }), conc = L('#c7c6c1'), concD = L('#8e8f8c');
        const hC = p.h || 4.6, rise = p.rise || 2.0, len = p.s1 - p.s0, w = p.w || 8.4;
        for (const lv of p.lanes) {
          const R = (w * w / 4 + rise * rise) / (2 * rise), a0 = Math.asin(w / 2 / R), sh = new T.Shape(), N = 18;
          for (let i = 0; i <= N; i++) { const a = -a0 + 2 * a0 * i / N; sh[i ? 'lineTo' : 'moveTo'](R * Math.sin(a), R * Math.cos(a) - R * Math.cos(a0)); }
          for (let i = N; i >= 0; i--) { const a = -a0 + 2 * a0 * i / N; sh.lineTo((R - 0.12) * Math.sin(a), (R - 0.12) * Math.cos(a) - R * Math.cos(a0) - 0.04); }
          const geo = new T.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
          const g2 = new T.Group(), roof = new T.Mesh(geo, [roofM, roofU]); roof.position.set(0, hC, 0); g2.add(roof);
          for (const sx of [-1, 1]) for (const sz of [0.4, len - 0.4]) { const c2 = new T.Mesh(B(0.3, hC, 0.3), steel); c2.position.set(sx * (w / 2 - 0.4), hC / 2, sz); g2.add(c2); }
          for (const sz of [0.25, len - 0.25]) { const bm = new T.Mesh(B(w - 0.4, 0.45, 0.25), steel); bm.position.set(0, hC - 0.1, sz); g2.add(bm); }
          for (const sx of [-1, 1]) { const bm = new T.Mesh(B(0.25, 0.45, len), steel); bm.position.set(sx * (w / 2 - 0.4), hC - 0.1, len / 2); g2.add(bm); }
          const fb = new T.Mesh(new T.PlaneGeometry(w - 1.2, 0.7), p.sign ? new T.MeshBasicMaterial({ map: signTexture(T, p.sign, null, '#ffffff', '#2c3e66'), side: T.DoubleSide }) : L('#2c3e66')); fb.position.set(0, hC + 0.5, -0.06); fb.rotation.y = Math.PI; g2.add(fb);   // ป้ายชื่อหน้าซุ้ม
          const q = W(p.s0, lv); g2.position.set(q[0], 0, q[1]); g2.rotation.y = angU; grp.add(g2);
        }
        for (const pv of p.posts || []) {                                             // เสาประตูคอนกรีตเทา มีร่องแนวตั้ง
          const q = Array.isArray(pv) ? W(pv[0], pv[1]) : W(p.postS != null ? p.postS : p.s0 - 0.3, pv), g3 = new T.Group();
          const b1 = new T.Mesh(B(1.1, 3.2, 1.3), conc); b1.position.y = 1.6; g3.add(b1);
          for (const gx of [-0.25, 0.25]) { const gr = new T.Mesh(B(0.08, 2.6, 1.32), concD); gr.position.set(gx, 1.5, 0); g3.add(gr); }
          const cp = new T.Mesh(B(1.3, 0.2, 1.5), L('#b9b8b2')); cp.position.y = 3.3; g3.add(cp);
          g3.position.set(q[0], 0, q[1]); g3.rotation.y = angU; grp.add(g3);
        }
      } else if (p.type === 'curbLine') {          // ขอบทางเท้าทาสีแดง-ขาว ตามเส้น · pts พิกัดจริง
        const pts = p.pts.map(q => toF(q[0], q[1])), red = L('#c23b2e'), wh = L('#f2f2f2'); let k = 0;
        for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
          for (let d = 0; d < len - 0.05; d += 1.0, k++) { const dd = Math.min(1.0, len - d) - 0.02; add(B(0.3, 0.2, dd), k % 2 ? red : wh, a[0] + (b[0] - a[0]) * (d + dd / 2) / len, 0.1, a[1] + (b[1] - a[1]) * (d + dd / 2) / len, ang); } }
      } else if (p.type === 'powerline') {         // เสาไฟฟ้าคอนกรีต + คอน + สายไฟ (หย่อน) ตามเส้น · pts พิกัดจริง
        const pts = p.pts.map(q => toF(q[0], q[1])), h = p.h || 10, conc = L('#b8b6b0'), wireM = new T.LineBasicMaterial({ color: '#2a2a2a' }), tops = [];
        for (const q of pts) { add(new T.CylinderGeometry(0.13, 0.2, h, 8), conc, q[0], h / 2, q[1]); tops.push(q); }
        for (let i = 0; i < tops.length; i++) { const a = tops[i], b = tops[Math.min(i + 1, tops.length - 1)], ang = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2;
          for (const yy of [h - 0.4, h - 1.6]) add(B(0.1, 0.12, 2.2), L('#6b6b66'), a[0], yy, a[1], ang); }
        for (let i = 0; i < tops.length - 1; i++) { const a = tops[i], b = tops[i + 1], ang = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2, ox = Math.sin(ang), oz = Math.cos(ang);
          for (const [yy, off] of [[h - 0.35, -0.9], [h - 0.35, 0], [h - 0.35, 0.9], [h - 1.55, -0.8], [h - 1.55, 0.8], [h - 2.6, 0], [h - 3.0, 0.3]]) {
            const pv = []; for (let k = 0; k <= 12; k++) { const t = k / 12, sag = 4 * t * (1 - t) * (0.5 + Math.abs(off) * 0.1); pv.push(new T.Vector3(a[0] + (b[0] - a[0]) * t + ox * off, yy - sag, a[1] + (b[1] - a[1]) * t + oz * off)); }
            grp.add(new T.Line(new T.BufferGeometry().setFromPoints(pv), wireM)); } }
      } else if (p.type === 'barrierArm') {        // ไม้กั้นรถ (ตู้มอเตอร์ + แขนลายแดงขาว) · พิกัดวัตถุ: แขนยื่นไปทาง +x ยาว len
        const g2 = new T.Group(), len = p.len || 5;
        const bx = new T.Mesh(B(0.45, 1.0, 0.45), L('#e6b422')); bx.position.y = 0.5; g2.add(bx);
        for (let i = 0; i < Math.round(len / 0.5); i++) { const sgm = new T.Mesh(B(0.5, 0.09, 0.09), L(i % 2 ? '#c8202a' : '#f5f5f5')); sgm.position.set(0.25 + i * 0.5, 0.9, 0); g2.add(sgm); }
        g2.position.set(p.x, 0, p.z); g2.rotation.y = ry; grp.add(g2);
      } else if (p.type === 'cones') {             // กรวยจราจร · pts พิกัดจริง
        for (const q of p.pts) { const [fx, fz] = toF(q[0], q[1]); add(new T.ConeGeometry(0.18, 0.7, 10), L('#f26a1b'), fx, 0.42, fz); add(new T.CylinderGeometry(0.135, 0.15, 0.1, 10), L('#f4f4f4'), fx, 0.45, fz); add(B(0.4, 0.06, 0.4), L('#2a2a2a'), fx, 0.03, fz); }
      } else if (p.type === 'lamp2') {             // เสาไฟถนนสูง โคมคู่ · พิกัดวัตถุ
        const h = p.h || 9; add(new T.CylinderGeometry(0.09, 0.14, h, 8), L('#a7adb2'), p.x, h / 2, p.z);
        for (const sx of [-1, 1]) { add(B(1.6, 0.08, 0.08), L('#a7adb2'), p.x + sx * 0.8 * Math.cos(ry), h - 0.2, p.z - sx * 0.8 * Math.sin(ry), ry); add(B(0.6, 0.15, 0.3), new T.MeshLambertMaterial({ color: '#f1f1ec', emissive: '#fff1c4', emissiveIntensity: 0.2 }), p.x + sx * 1.6 * Math.cos(ry), h - 0.3, p.z - sx * 1.6 * Math.sin(ry), ry); }
      } else if (p.type === 'shrubs') {            // พุ่มไม้กลมเตี้ยเรียงตามเส้น · pts พิกัดจริง
        const pts = p.pts.map(q => toF(q[0], q[1])), gap = p.gap || 2.2; let k = 0;
        for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let d = gap / 2; d < len; d += gap, k++) { const r = 0.55 + hash(k * 17 + 3) * 0.3; add(new T.IcosahedronGeometry(r, 0), L(hash(k * 5) < 0.5 ? '#3f8a3a' : '#4f9a40'), a[0] + (b[0] - a[0]) * d / len, (p.y || 0) + r * 0.8, a[1] + (b[1] - a[1]) * d / len);
            if (p.flowers && hash(k * 11) < 0.6) add(new T.IcosahedronGeometry(0.16, 0), L(['#e8457c', '#f2c230', '#f07c2b'][k % 3]), a[0] + (b[0] - a[0]) * d / len + 0.25, (p.y || 0) + r * 1.45, a[1] + (b[1] - a[1]) * d / len); } }
      } else if (p.type === 'flag') {              // เสาธง (ธงชาติไทย / ธงเหลือง)
        const h = p.h || 6; add(new T.CylinderGeometry(0.05, 0.07, h, 8), L('#d9d9d6'), p.x, h / 2, p.z);
        const fc = document.createElement('canvas'); fc.width = 60; fc.height = 40; const g = fc.getContext('2d');
        if (p.kind === 'yellow') { g.fillStyle = '#f2c230'; g.fillRect(0, 0, 60, 40); }
        else { const st = ['#a51931', '#f4f5f8', '#2d2a4a', '#2d2a4a', '#f4f5f8', '#a51931']; [0, 1, 2, 2, 3, 4].forEach((c, i) => { g.fillStyle = ['#a51931', '#f4f5f8', '#2d2a4a', '#f4f5f8', '#a51931'][c]; g.fillRect(0, i * 40 / 6, 60, 40 / 6 + 0.5); }); void st; }
        const fm = new T.MeshBasicMaterial({ map: new T.CanvasTexture(fc), side: T.DoubleSide });
        const fl = add(new T.PlaneGeometry(1.5, 1.0), fm, p.x + 0.78 * Math.cos(ry), h - 0.6, p.z - 0.78 * Math.sin(ry), ry); void fl;
      } else if (p.type === 'pylon') {             // เสาป้ายร้านสะดวกซื้อ (เสาสูง + กล่องป้าย)
        const h = p.h || 7.5, g2 = new T.Group();
        const pole = new T.Mesh(B(0.35, h, 0.35), L('#9aa0a5')); pole.position.y = h / 2; g2.add(pole);
        const bx = new T.Mesh(B(2.0, 2.0, 0.4), L('#f4f4f2')); bx.position.y = h + 0.6; g2.add(bx);
        for (const sz of [-0.21, 0.21]) { const fc = new T.Mesh(new T.PlaneGeometry(1.9, 1.9), new T.MeshBasicMaterial({ map: signTexture(T, p.text || '7-ELEVEN', null, '#1c7a45', '#ffffff'), side: T.DoubleSide })); fc.position.set(0, h + 0.6, sz); if (sz < 0) fc.rotation.y = Math.PI; g2.add(fc); }
        g2.position.set(p.x, 0, p.z); g2.rotation.y = ry; grp.add(g2);
      } else if (p.type === 'shop') {              // ร้านค้าชั้นเดียว (หน้ากระจก + ป้ายบนชายคา) ด้านหน้า = +z ของวัตถุ
        const g2 = new T.Group(), w = p.w || 8, d = p.d || 8, h = p.h || 4;
        const bd = new T.Mesh(B(w, h, d), L(p.color || '#f2f1ec')); bd.position.y = h / 2; g2.add(bd);
        const gl = new T.Mesh(B(w - 1.2, h - 1.4, 0.1), new T.MeshLambertMaterial({ color: '#7fa6b3', transparent: true, opacity: 0.85 })); gl.position.set(0, (h - 1.4) / 2 + 0.1, d / 2 + 0.03); g2.add(gl);
        const sg = new T.Mesh(new T.PlaneGeometry(w - 0.6, 0.8), new T.MeshBasicMaterial({ map: signTexture(T, p.text || 'SHOP', null, p.fg || '#1c7a45', p.bg || '#ffffff'), side: T.DoubleSide })); sg.position.set(0, h - 0.5, d / 2 + 0.06); g2.add(sg);
        const rf = new T.Mesh(B(w + 0.6, 0.25, d + 0.6), L('#cfccc4')); rf.position.y = h + 0.1; g2.add(rf);
        const cn = new T.Mesh(B(w + 0.4, 0.15, 1.8), L('#e9e7e1')); cn.position.set(0, h - 1.05, d / 2 + 0.9); g2.add(cn);           // กันสาดหน้าร้าน
        for (const [cx, cc] of [[-0.3, '#f07c2b'], [0, '#1c7a45'], [0.3, '#d6312b']]) { const st = new T.Mesh(B(w + 0.42, 0.12, 0.05), L(cc)); st.position.set(0, h - 1.0 + cx * 0.4, d / 2 + 1.82); g2.add(st); }   // แถบสีขอบกันสาด
        const dr = new T.Mesh(B(1.8, 2.3, 0.08), new T.MeshLambertMaterial({ color: '#cfe0e6', transparent: true, opacity: 0.9 })); dr.position.set(w * 0.25, 1.15, d / 2 + 0.06); g2.add(dr);
        const step = new T.Mesh(B(w, 0.15, 2.2), L('#d8d4cb')); step.position.set(0, 0.075, d / 2 + 1.1); g2.add(step);
        g2.position.set(p.x, 0, p.z); g2.rotation.y = ry; grp.add(g2);
      } else if (p.type === 'stairs') {            // บันไดคอนกรีตภายนอก (ราวเหล็ก) ขึ้นไปสูง h ตามทิศ rot ยาว run
        const g2 = new T.Group(), h = p.h || 5, run = p.run || 7, w = p.w || 2, ang = Math.atan2(h, run), sl = Math.hypot(h, run);
        const st2 = new T.Mesh(B(w, 0.35, sl), L('#cfcbc3')); st2.position.set(0, h / 2, run / 2); st2.rotation.x = ang; g2.add(st2);
        for (const sx of [-1, 1]) { const r = new T.Mesh(B(0.05, 0.05, sl), L('#e6e6e2')); r.position.set(sx * w / 2, h / 2 + 1.0, run / 2); r.rotation.x = ang; g2.add(r); }
        const land = new T.Mesh(B(w + 0.4, 0.3, 2), L('#cfcbc3')); land.position.set(0, h, -1); g2.add(land);
        g2.position.set(p.x, 0, p.z); g2.rotation.y = ry; grp.add(g2);
      } else if (p.type === 'lift') {              // หอลิฟต์กระจก (สะพานลอย/ทางเชื่อม)
        const w = p.w || 3.6, h = p.h || 10;
        add(B(w, h, w), new T.MeshLambertMaterial({ color: '#5fa3a0', transparent: true, opacity: 0.72 }), p.x, h / 2, p.z, ry);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(B(0.25, h, 0.25), L('#9aa3a8'), p.x + sx * w / 2, h / 2, p.z + sz * w / 2, ry);
        for (let y = 3.3; y < h; y += 3.3) add(B(w + 0.1, 0.2, w + 0.1), L('#9aa3a8'), p.x, y, p.z, ry);
        add(B(w + 0.6, 0.4, w + 0.6), L('#c9cdd0'), p.x, h + 0.2, p.z, ry);
      } else if (p.type === 'gate') {              // ประตูวัง: เสาครีม 2 ต้น + บานเหล็กดัดสีดำ (เปิดเข้าด้านใน) · กว้าง w ตามแกน x ของวัตถุ
        const g2 = new T.Group(), w = p.w || 8, h = p.h || 4, cream = L('#dccaa4'), dark = new T.MeshLambertMaterial({ color: '#1c2023', transparent: true, opacity: 0.6, side: T.DoubleSide });
        for (const sx of [-1, 1]) {
          const pl = new T.Mesh(B(1.0, h, 1.0), cream); pl.position.set(sx * (w / 2 + 0.5), h / 2, 0); g2.add(pl);
          const cp = new T.Mesh(B(1.3, 0.35, 1.3), L('#6b5a45')); cp.position.set(sx * (w / 2 + 0.5), h + 0.17, 0); g2.add(cp);
          const lp = new T.Mesh(new T.SphereGeometry(0.3, 12, 8), new T.MeshLambertMaterial({ color: '#fff3cf', emissive: '#ffe39a', emissiveIntensity: 0.3 })); lp.position.set(sx * (w / 2 + 0.5), h + 0.65, 0); g2.add(lp);
          const leaf = new T.Group(), pan = new T.Mesh(B(w / 2, h - 1.0, 0.06), dark); pan.position.set(-sx * w / 4, (h - 1.0) / 2 + 0.1, 0); leaf.add(pan);
          leaf.position.set(sx * w / 2, 0, 0); leaf.rotation.y = sx * 1.25; g2.add(leaf);
        }
        g2.position.set(p.x, 0, p.z); g2.rotation.y = ry; grp.add(g2);
      } else if (p.type === 'guardhouse') {        // ป้อมรักษาการณ์ (ผนังขาว หน้าต่างรอบ หลังคาทรงปั้นหยาเล็ก)
        const w = p.w || 2.6, d = p.d || 2.6, h = p.h || 2.7;
        add(B(w, h, d), L('#f3efe6'), p.x, h / 2, p.z, ry);
        add(B(w + 0.04, 1.0, d + 0.04), L('#3c4a52'), p.x, h - 1.15, p.z, ry);
        add(B(w + 0.8, 0.2, d + 0.8), L('#e8e2d6'), p.x, h + 0.1, p.z, ry);
        const rf = add(new T.ConeGeometry(Math.max(w, d) * 0.85, 1.0, 4), L('#b9532c'), p.x, h + 0.7, p.z, ry + Math.PI / 4); void rf;
      } else if (p.type === 'cars') {              // แถวรถจอด · จากจุด (x,z) เรียงตามทิศ rot ทุก gap ม. จำนวน n คัน (ข้ามบางช่อง)
        const cols = ['#f2f2f0', '#c9ccd0', '#1f2328', '#8f969c', '#f2f2f0', '#9a2f2a', '#dcdcd8', '#2c4a7a', '#bfc3c7', '#e8e6e0'], n = p.n || 6, gap = p.gap || 2.7;
        const ux = Math.sin(ry), uz = Math.cos(ry);
        for (let i = 0; i < n; i++) {
          if (hash(i * 7 + (p.seed || 1) * 131) < (p.empty || 0.25)) continue;
          const c = cols[Math.floor(hash(i * 13 + (p.seed || 1) * 977 + 5) * cols.length)], g2 = new T.Group();
          const body = new T.Mesh(B(1.8, 0.75, 4.4), L(c)); body.position.y = 0.55; g2.add(body);
          const cab = new T.Mesh(B(1.6, 0.6, 2.3), L(c)); cab.position.set(0, 1.2, -0.2); g2.add(cab);
          const gl = new T.Mesh(B(1.62, 0.42, 2.0), L('#2b3740')); gl.position.set(0, 1.22, -0.2); g2.add(gl);
          for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) { const wh = new T.Mesh(new T.CylinderGeometry(0.33, 0.33, 0.22, 10), L('#1a1a1a')); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.33, wz); g2.add(wh); }
          g2.position.set(p.x + ux * gap * i, 0, p.z + uz * gap * i); g2.rotation.y = ry + Math.PI / 2 + (hash(i * 29 + (p.seed || 1) * 57) < 0.5 ? Math.PI : 0); grp.add(g2);
        }
      } else if (p.type === 'starbucks') {         // ร้านกาแฟชั้นเดียว: หน้ากระจก + หลังคาคลุมระเบียง + ร่ม + ป้ายบนชายคา (ด้านหน้า = +z ของวัตถุ)
        const g2 = new T.Group(), Lg = p.len || 22, D = p.d || 11, H = p.h || 4.2, ov = p.over || 3.2, A = (geo, m, x, y, z) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); g2.add(o); return o; };
        A(B(Lg, H, D), L('#5c5852'), 0, H / 2, -D / 2);
        A(B(Lg - 0.8, H - 1.0, 0.12), new T.MeshLambertMaterial({ color: '#2f4d47', transparent: true, opacity: 0.8 }), 0, (H - 1.0) / 2 + 0.1, 0.05);
        for (let x = -Lg / 2 + 0.4; x <= Lg / 2 - 0.3; x += 2.4) A(B(0.1, H - 0.9, 0.18), L('#3b3936'), x, (H - 0.9) / 2, 0.1);
        A(B(Lg + 1, 0.35, D + ov + 0.4), L('#4a4642'), 0, H + 0.15, (ov + 0.4 - D) / 2);
        A(B(Lg + 1, 1.0, 0.25), L('#38342f'), 0, H - 0.1, ov + 0.3);
        const sg = A(new T.PlaneGeometry(13, 0.85), new T.MeshBasicMaterial({ map: signTexture(T, p.text || 'STARBUCKS COFFEE', null, '#ffffff', '#38342f'), side: T.DoubleSide }), 1.5, H - 0.1, ov + 0.44); void sg;
        for (let x = -Lg / 2 + 0.6; x <= Lg / 2; x += 4.4) A(new T.CylinderGeometry(0.11, 0.11, H, 8), L('#cfcfcc'), x, H / 2, ov);
        for (let x = -Lg / 2 + 3; x < Lg / 2 - 2; x += 5.2) {
          A(new T.CylinderGeometry(0.04, 0.04, 2.5, 6), L('#e8e8e4'), x, 1.25, ov * 0.55);
          A(new T.ConeGeometry(1.45, 0.55, 8), L('#1f6b46'), x, 2.55, ov * 0.55);
          A(new T.CylinderGeometry(0.45, 0.45, 0.06, 12), L('#e8e8e4'), x, 0.75, ov * 0.55);
        }
        A(B(Lg, 0.45, 0.3), L('#e6e2da'), 0, 0.22, ov + 0.35);
        const logo = A(new T.CircleGeometry(0.75, 24), new T.MeshBasicMaterial({ color: '#1f6b46', side: T.DoubleSide }), Lg / 2 + 0.02, H - 1.6, -D / 2); logo.rotation.y = Math.PI / 2;
        g2.position.set(p.x, 0, p.z); g2.rotation.y = ry; grp.add(g2);
      } else if (p.type === 'tree') {
        const s = p.s || 1.6, tr = new T.Mesh(new T.CylinderGeometry(0.25 * s, 0.4 * s, 4 * s, 7), L('#6f5236')); tr.position.set(p.x, 2 * s, p.z); grp.add(tr);
        for (const [dx, dy, dz, r] of [[0, 4.8, 0, 2.6], [1.5, 4.2, 0.6, 1.9], [-1.4, 4.4, -0.5, 2.0], [0.3, 5.9, -0.3, 1.8]]) add(new T.IcosahedronGeometry(r * s, 0), L('#4f8d3c'), p.x + dx * s, dy * s, p.z + dz * s);
      } else if (p.type === 'bus') {
        const g2 = new T.Group(); const body = new T.Mesh(B(2.5, 3.1, 11.5), L(p.color || '#f2f2f2')); body.position.y = 1.85; g2.add(body);
        const win = new T.Mesh(B(2.52, 1.0, 10.5), L('#3b4a56')); win.position.set(0, 2.5, 0); g2.add(win);
        const stripe = new T.Mesh(B(2.53, 0.35, 11.4), L('#1f7a4a')); stripe.position.y = 1.35; g2.add(stripe);
        g2.position.set(p.x, 0, p.z); g2.rotation.y = ry; grp.add(g2);
      }
    }
    return { grp, raise };
  }

  // ── ตำแหน่ง/มุมหัน/ฉากของตู้ที่ยืนยันจากหน้างาน (Street View) ───────────────
  //   yaw = ทิศหน้าตู้ (องศา, 0 = หันลงใต้, 90 = ตะวันออก, -90 = ตะวันตก, 180 = เหนือ) · hide = ลบอาคาร OSM ในรัศมี (ม.) แล้วใช้ฉากที่จัดเองแทน
  //   จัดตาม OSM จริง (ถนน/ทางเท้า/อาคาร) + ภาพ Street View · bld = ปรับรูปแบบอาคาร OSM รายหลัง (id): style shed/pavilion/hospital, h ความสูง, noSign
  //   propYaw = หมุนกรอบของฉากประกอบแยกจากตู้ (เช่น propYaw 180: x = ไปทางตะวันตก, z = ไปทางเหนือ) · camOff = เลื่อนมุมกล้องตอนจบ (องศา)
  //   roadW = ความกว้างถนนจริงราย way id (ม.) · palace = เส้นแบ่งเขตวัง a→b [ตอ., เหนือ] (ม. จากตู้) อาคารฝั่งขวาของเส้นเป็นอาคารเตี้ยสีขาว
  const CAB_FIX = [
    { match: /ศิริราช/, lat: 13.7594000, lon: 100.4842724, yaw: 180, propYaw: 180, camOff: -25,  // หน้าปลายหลังคาศูนย์อาหารวัดอมรินทร์ ชิดตึก รพ. · ตู้หันหน้าออก ถ.รถไฟ
      bld: { 1549325372: { style: 'hospital', h: 15, noSign: true },                            // ตึก รพ.
             1549325363: { style: 'shed', h: 2.8, rise: 0.5 },                                   // ศูนย์อาหาร: หลังคาเตี้ยระดับหลังคาตู้ ยาวเกือบถึงตึก รพ.
             320273873: { style: 'glass' } },                                                    // อาคารฝั่งตรงข้าม (ทิศตะวันออกเฉียงเหนือ): ผนังกระจก
      props: [   // กรอบ propYaw 180: x+ = ตะวันตก, z+ = เหนือ · จุดอ้างอิง = ตู้ · ทางเชื่อมลอยฟ้าตาม Street View: บันไดเลื่อน 2 ฝั่ง + หอลิฟต์กระจก + สะพานชั้น 2
        { type: 'skywalk', x: -28.3, z: -1.0, h: 5, hallH: 3.2, escRot: 90, run: 9, escW: 3.2, bridgeRot: -90, len: 12.5, bridgeW: 4, hallW: 5, hallD: 4 },   // ฝั่งตะวันตก: ขึ้นไปทางตะวันออก → สะพานชั้น 2 ข้ามไปฝั่งตะวันออก
        { type: 'skywalk', x: -44.3, z: -1.0, h: 5, hallH: 3.2, escRot: -90, run: 9, escW: 3.2, bridgeRot: 180, len: 1.5, hallW: 5, hallD: 4 },   // ฝั่งตะวันออก: บันไดเลื่อนลงไปทางตะวันออก
        { type: 'lift', x: -35.3, z: -3.6, w: 3.6, h: 10 },                                                                                   // หอลิฟต์กระจกกลางสะพาน
        { type: 'bridge', h: 5, w: 3.5, pts: [[35.3, -5.4], [40.3, -45]] },
        { type: 'tower', world: true, x: 59, z: -21, rot: 0, w: 24, d: 28, h: 21, facade: 'ind', color: '#c3bfb6', roof: '#a9a59d' },   // สถานีไฟฟ้าย่อย รพ.ศิริราช (อาคารคอนกรีต) — หัวบันไดเลื่อนฝั่งตะวันออกต่อเข้าผนังด้านตะวันตก
        { type: 'stairs', world: true, x: 50.2, z: -11, rot: 90, h: 5, run: 7, w: 2.2 },                                                  // บันไดคอนกรีตภายนอกขึ้นทางเชื่อม                                                                   // ทางเดินชั้น 2 จากหอลิฟต์ไปทางใต้ เข้าตึกอดุลยเดชวิกรม
      ] },
    { match: /ศิครินทร์/, lat: 13.6552076, lon: 100.6457107, yaw: 165, propYaw: 165, cabShift: [1.35, -0.36], pipeSide: 1,   // ตู้เลื่อนเข้าในสนาม 1.4 ม. · ท่อออกขวา (ฝั่งซอย)
                 // ในเขต รพ. มุมหน้า-ขวาของสนามหญ้ายกสูง ติดซอยข้าง Starbucks · ตู้หันออกถนนลาซาลตรงๆ
      roadW: { 1408375209: 14 },                                                                  // ถ.ลาซาล 4 ช่องจราจร
      bld: { 34584267: { style: 'hospital', h: 13, noSign: true } },
      props: [   // ทุกชิ้นเป็นพิกัดจริง (ตอ., เหนือ) ม. จากตู้ — สนามหญ้าเป็นสี่เหลี่ยมคางหมู: ขอบหน้าขนานถนนลาซาล ขอบขวาขนานซอย
        { type: 'lawn', h: 0.8, cab: true, wall: '#d7b9a6', pts: [[-1.2, 3.9],[11.8, 0.5],[11.8, -15.5],[-1.2, -15.5]] },
        { type: 'hedgeLine', y: 0.8, h: 1.0, d: 0.9, pts: [[-0.8, 3.7],[-0.8, -15.1]] },                      // แนวพุ่มไม้ริมซอย
        { type: 'hedgeLine', y: 0.8, h: 1.1, d: 1.1, pts: [[6.8, 1.5],[11.4, 0.4]] },                           // พุ่มไม้หน้าสนามฝั่งซ้าย
        { type: 'shrine', world: true, x: 2.3, z: -7.5, s: 1.05, y: 0.8 }, { type: 'shrine', world: true, x: 5.8, z: -10.5, s: 0.8, y: 0.8 },
        { type: 'glass', world: true, x: 27.1, z: -24.1, rot: 0, w: 10.4, h: 4.2, canopy: 5 },
        { type: 'sign', world: true, x: 25.3, z: -23.95, rot: 0, y: 8.4, w: 12, h: 1.4, text: 'โรงพยาบาลศิครินทร์', fg: '#11896b', bg: '#f6f6f3' },
        { type: 'sign', world: true, x: 20.3, z: -23.95, rot: 0, y: 6.1, w: 3.2, h: 0.9, text: 'SIKARIN HOSPITAL', fg: '#ffffff', bg: '#1f9a8a' },
        { type: 'tower', world: true, x: 24.3, z: -63.5, rot: 0, w: 30, d: 18, h: 44, facade: 'apt', color: '#f4f2ee' },
        { type: 'sign', world: true, x: 10.8, z: 1.5, rot: 0, y: 1.3, w: 1.3, h: 1.0, text: 'OUT', sub: '← ทางออก', fg: '#ffffff', bg: '#165c3d', post: true },
        { type: 'road', w: 7.5, edgeY: true, pts: [[-5.55, 7.5], [-5.55, -29.5]] },                                    // ซอยคั่นระหว่าง รพ. กับร้านสตาร์บัคส์
        { type: 'starbucks', world: true, x: -11.7, z: -7.5, rot: 90, len: 22, d: 11, over: 2.6 },                      // Starbucks (หน้ากระจกหันเข้าซอย)
        { type: 'cars', world: true, x: -39.7, z: -35.5, rot: 90, n: 12, gap: 2.7, seed: 1 },                           // ลานจอดรถหลังร้าน (ตรงป้าย P)
        { type: 'cars', world: true, x: -39.7, z: -42.5, rot: 90, n: 12, gap: 2.7, seed: 2 },
        { type: 'cars', world: true, x: -39.7, z: -49.5, rot: 90, n: 12, gap: 2.7, seed: 3 },
      ] },
    { match: /ทหารขนส่ง/, lat: 13.9319263, lon: 100.5325784, yaw: -43, camOff: -22, cabShift: [-1.07, 0.90],   // ขสทบ: หลังแนวรั้ว ข้างเสาป้าย 7-Eleven ทางขวาของซุ้มประตู · ตู้หันไปทางตะวันตกเฉียงใต้ (เข้าหาทางเข้า)
      props: [   // พิกัดจริง (ตอ., เหนือ) ม. จากจุดอ้างอิง — รั้ว/สนาม/ขอบทางวางขนาน ถ.ติวานนท์ (ห่างเส้นกึ่งกลางถนน 11.4 ม.)
        { type: 'lawn', h: 0.12, cab: true, wall: '#c9c4b8', pts: [[2.5, -3.4],[22.1, 13.7],[16.2, 18.7],[-3.5, 1.6]] },                       // สนามหญ้าฝั่งขวา
        { type: 'lawn', h: 0.12, wall: '#c9c4b8', pts: [[-10.8, -15.0],[-15.3, -11.2],[-34.9, -28.3],[-30.4, -32.1]] },                                 // สนามหญ้าฝั่งซ้าย
        { type: 'curbLine', pts: [[2.4, -3.8], [22.0, 13.3]] }, { type: 'curbLine', pts: [[-10.8, -15.2], [-30.4, -32.3]] },   // ขอบทางเท้าแดง-ขาว
        { type: 'archGate', o: [7.8, -13.1], u: 310, lanes: [0, -10.3], w: 8.6, s0: 17.6, s1: 25.6, h: 4.8, rise: 2.0, sign: 'โรงเรียนทหารขนส่ง', posts: [[10.82, 4.6], [12.23, -4.4], [12.47, -5.9], [13.88, -14.9]] },
        { type: 'palaceFence', world: true, x1: 3.0, z1: -2.1, x2: 21.1, z2: 13.7, h: 2.2, plinth: 0.55, span: 3.2, color: '#f1f0ec', bar: '#1f2326' },   // รั้วเหล็กดำฐานปูนขาว (ขวา) ขนานถนน
        { type: 'palaceFence', world: true, x1: -12.9, z1: -16.0, x2: -31.0, z2: -31.8, h: 2.2, plinth: 0.55, span: 3.2, color: '#f1f0ec', bar: '#1f2326' },   // รั้ว (ซ้าย) ขนานถนน
        { type: 'hedgeLine', y: 0.12, h: 1.1, d: 1.2, pts: [[-13.8, -15.2], [-31.9, -31.0]] },                                   // แนวพุ่มไม้หลังรั้วซ้าย
        { type: 'shrubs', y: 0.12, gap: 2.4, flowers: true, pts: [[3.3, -0.9], [19.9, 13.6]] },                               // ไม้พุ่มหลังรั้วขวา
        { type: 'pylon', world: true, x: 6.3, z: -0.6, rot: 139, h: 7.5 },                                        // เสาป้าย 7-Eleven (หน้ารั้ว)
        { type: 'shop', world: true, x: -9.6, z: 23.8, rot: 220, w: 7.7, d: 8.5, h: 4.2, text: '7-ELEVEN' },   // ร้าน 7-Eleven (ถอยห่างถนนขาเข้า) หน้าร้านหันเข้าหาถนน
        { type: 'tower', world: true, x: -38.7, z: -8.0, rot: 130, w: 8.5, d: 45, h: 4.2, facade: 'win', color: '#f3f1ea' },   // อาคารป้อมรักษาการณ์ (ยาวชั้นเดียว)
        { type: 'flag', world: true, x: -18.5, z: -12.5, rot: 130, kind: 'thai' }, { type: 'flag', world: true, x: -20.1, z: -14.4, rot: 130, kind: 'yellow' }, { type: 'flag', world: true, x: -21.7, z: -16.3, rot: 130, kind: 'thai' }, { type: 'flag', world: true, x: -23.3, z: -18.3, rot: 130, kind: 'yellow' },
        { type: 'powerline', h: 10, pts: [[23.0, 13.4], [0.4, -6.3], [-22.3, -26.0], [-44.9, -45.7]] },                                                     // เสาไฟฟ้า + สายไฟ ริม ถ.ติวานนท์
        { type: 'lamp2', world: true, x: -18.4, z: 2.3, rot: 40, h: 9 },                             // เสาไฟโคมคู่ เกาะกลางหลังซุ้ม
        { type: 'barrierArm', world: true, x: -13.8, z: 0.4, rot: 310, len: 6.4 }, { type: 'barrierArm', world: true, x: -20.4, z: -7.5, rot: 310, len: 6.4 },   // ไม้กั้นรถ
        { type: 'cones', pts: [[-5.0, -4.2], [-3.1, -1.9], [-11.2, -12.5], [-9.3, -10.2], [-2.1, -4.7]] },                                                             // กรวยจราจร
      ] },
    { match: /จิตรลดา/, lat: 13.772515, lon: 100.520836, yaw: 153, camOff: -27, cabShift: [-0.4, -2.0],   // ตู้ลึกเข้าไปในซอก 2 ม.                 // ในซอกระหว่างปลายอาคารเสาเรียง กับประตู/ป้อมรักษาการณ์ทางเข้าวัง · ตู้หันออกถนน
      bld: { 1537116220: { style: 'colonnade', h: 4.6, noSign: true }, 1537135506: { hide: true } }, noBarrierR: 45,   // 1537135506 = จุดประตู/ป้อม ไม่ใช่ตึก
      palace: { a: [-183.5, 74.8], b: [39.8, -6.8], r: 450 },
      props: [   // กรอบตามตู้: x+ = ขวามือคนยืนหน้าตู้ (ตอ.เฉียงเหนือ), z+ = ไปทางถนน · world: true = พิกัดจริง (ตอ., เหนือ)
        { type: 'road', w: 7, pts: [[-14.7, 33.6],[-14.5, 28.0],[-14.3, 23.2],[-14.0, 14.8],[-13.6, 5.8],[-13.3, -0.6],[-9.7, -83.4]] },                                     // ถ.พระกุเวชมรรคา ทางเข้าพระราชวังจาก ถ.ราชวิถี
        { type: 'road', w: 13, pts: [[-14.7, 33.6], [-14.4, 25.1]] },                 // ปากทางเข้า (กว้าง)
        { type: 'gate', world: true, x: -13.9, z: 8.6, rot: 0, w: 7.6, h: 4 },                                       // ประตูวัง (เสาครีม + บานเหล็กดัด)
        { type: 'guardhouse', world: true, x: -7.7, z: 6.1, rot: 0 },                                    // ป้อมรักษาการณ์ข้างประตู
        { type: 'palaceFence', world: true, x1: -2.0, z1: -3.6, x2: -2.0, z2: 2.3, h: 1.9, plinth: 0.7, span: 2.4 },                          // รั้วขาว: จากข้างตู้ ตรงออกมาด้านหน้า
        { type: 'palaceFence', world: true, x1: -2.0, z1: 2.3, x2: -6.8, z2: 8.65, h: 1.9, plinth: 0.7, span: 2.6 },                          // … เฉียงออกไปทางประตู
        { type: 'palaceFence', world: true, x1: -6.8, z1: 8.65, x2: -9.1, z2: 9.0, h: 1.9, plinth: 0.7, span: 2.4 },                          // … แล้วชนเสาประตู
        { type: 'tree', x: -10.7, z: 19.3, s: 1.4 }, { type: 'tree', x: -23.7, z: 19.1, s: 1.3 }, { type: 'tree', x: -33.7, z: 9.8, s: 1.6 },
      ] },
  ];

  function cabFix(st) {
    const f = CAB_FIX.find(x => x.match.test(st.name || ''));
    return f ? Object.assign({}, st, { lat: f.lat, lon: f.lon, yaw: f.yaw, propYaw: f.propYaw, camOff: f.camOff || 0, cabShift: f.cabShift || null, pipeSide: f.pipeSide || null, canopy: f.canopy, props: f.props, hideR: f.hide || 0,
      bld: f.bld, noBarrierR: f.noBarrierR || 0, roadW: f.roadW || null, palace: f.palace || null, fixed: true }) : st;
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
      `way["railway"~"^(light_rail|subway|monorail|rail)$"]${A};way["barrier"~"^(fence|wall|retaining_wall)$"]${A};` +
      `way["amenity"~"^(hospital|school|university|college|clinic)$"]${A};relation["amenity"~"^(hospital|school|university|college|clinic)$"]${A};` +
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

  // ── ข้อมูลเมืองที่สร้างไว้ล่วงหน้า (เร็ว เปิดได้ทุกเครื่อง) → ถ้าไม่มีค่อยดึงสดจาก Overpass ──
  let _cityIdx = null;
  function cityIndex() {
    if (!_cityIdx) _cityIdx = fetch(CFG.cityBase + 'index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null);
    return _cityIdx;
  }
  function decodeCity(j) {                    // รูปแบบย่อ v2 → รูปแบบเดียวกับ Overpass
    const lat0 = j.c[0], lon0 = j.c[1], kx = j.k[0], kz = j.k[1];
    const dec = g => { const out = []; let x = 0, z = 0; for (let i = 0; i < g.length; i += 2) { x += g[i]; z += g[i + 1]; out.push({ lat: lat0 + z / 10 / kz, lon: lon0 + x / 10 / kx }); } return out; };
    return { elements: j.e.map(e => {
      const o = { type: e.y === 'w' ? 'way' : e.y === 'n' ? 'node' : 'relation', id: e.id, tags: e.t };
      if (e.y === 'n') { const q = dec(e.g)[0]; o.lat = q.lat; o.lon = q.lon; }
      else if (e.y === 'w') o.geometry = dec(e.g);
      else o.members = (e.m || []).map(m => ({ type: 'way', role: m[0], geometry: dec(m[1]) }));
      return o;
    }) };
  }
  async function getOSM(st) {
    if (CFG.osmStatic) return { osm: await fetchOSM(st.lat, st.lon, R_CITY + 120), src: 'test' };
    try {
      const idx = await cityIndex();
      if (idx && idx.stations) {
        const kx = 111320 * Math.cos(st.lat * Math.PI / 180); let best = null;
        for (const s of idx.stations) { const d = Math.hypot((s.lat - st.lat) * 110540, (s.lon - st.lon) * kx); if (!best || d < best.d) best = { d, s }; }
        if (best && best.d < 150 && best.s.file) {
          const r = await fetch(CFG.cityBase + best.s.file);
          if (r.ok) return { osm: decodeCity(await r.json()), src: 'prebuilt', updated: best.s.updated };
        }
      }
    } catch (e) { console.warn('[FRC3D] ข้อมูลล่วงหน้า', e); }
    return { osm: await fetchOSM(st.lat, st.lon, R_CITY + 120), src: 'overpass' };
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

  // ── สีและความสูงตามประเภทอาคาร ─────────────────────────────────────────────
  const WALL = {
    house: ['#f1e4c8', '#efd9b4', '#f4ecd9', '#e9dcc6', '#f3e1cf', '#e6eef0'],
    shop: ['#ece6da', '#e6d8bf', '#dfe5e9', '#ecd8cf', '#e2e6d4', '#f0e0c4', '#d8d4cc', '#e9e1ef', '#f2e9d0'],
    apt: ['#ebe4d6', '#e4ddd0', '#efe8dc', '#dfe3e6', '#f1ece2'],
    office: ['#dfe6ec', '#d5dde4', '#e6eaee'],
    ind: ['#d5dade', '#cfd6dc', '#dcdfe1', '#c9d3db'],
    school: ['#f3dcb2', '#f0d3a1', '#efe0c0', '#f2e6c9'],
    hosp: ['#f7f8f8', '#f1f4f6'],
    civic: ['#f1e6cf', '#ecdfc3', '#f3ecdc'],
    temple: ['#fbf8f0'],
  };
  const ROOF_TILE = ['#a8573a', '#9a4e36', '#b66b47', '#8a5244', '#7d6b63', '#6c7f92', '#5f7489', '#8e9aa3', '#9b5a3f', '#7a8f7c'];
  const ROOF_FLAT = ['#9c978e', '#a49e93', '#918d86', '#a8a297', '#95938e', '#a09588'];
  const AWNING = ['#c0392b', '#2e6fbd', '#1e8449', '#d4ac0d', '#8e44ad', '#d35400', '#16a085', '#7f8c8d'];
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

  // ── ลายผนัง (ช่อง 3.6 ม. × ชั้น 3.2 ม.) — กลางวัน + กลางคืน (ไฟติดบางห้อง) ──
  //    แต่ละแบบเป็นภาพ 4×4 ช่อง สุ่มรายละเอียดต่างกัน เพื่อไม่ให้ซ้ำจนดูเป็นลาย
  const _texCache = {};
  function facade(T, type) {
    if (_texCache[type]) return _texCache[type];
    const N = 4, S = 128;
    const make = night => {
      const c = document.createElement('canvas'); c.width = c.height = N * S; const g = c.getContext('2d');
      g.fillStyle = night ? '#000' : '#fff'; g.fillRect(0, 0, N * S, N * S);
      const r = rng(type.length * 977 + (night ? 5 : 1)), rr = rng(type.length * 977 + 1);   // rr: ตำแหน่งเหมือนกันทั้งกลางวัน/คืน
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = i * S, y = j * S, lit = r() < 0.45, warm = r() < 0.7, q = rr(), q2 = rr(), q3 = rr();
        const L = (cx, cy, w, h) => { if (night && lit) { g.fillStyle = warm ? '#ffd58a' : '#d4e8ff'; g.fillRect(cx, cy, w, h); } };
        if (type === 'win' || type === 'apt' || type === 'house') {
          const ww = type === 'house' ? 46 : 62, wh = type === 'house' ? 50 : 56, wx = x + (S - ww) / 2, wy = y + 30;
          if (!night) {
            g.fillStyle = '#dad6cf'; g.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);          // กรอบปูน
            g.fillStyle = q < 0.25 ? '#7f95a8' : '#5f7486'; g.fillRect(wx, wy, ww, wh);   // กระจก
            g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(wx, wy, ww, 9);
            g.fillStyle = '#c9c4ba'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
            if (q2 < 0.35) { g.fillStyle = '#e8e5df'; g.fillRect(wx + ww - 6, wy + wh + 10, 30, 20); g.fillStyle = '#aab0b5'; for (let k = 0; k < 4; k++) g.fillRect(wx + ww - 2, wy + wh + 13 + k * 4, 22, 1.5); }   // คอมแอร์
            if (type === 'apt') { g.fillStyle = '#d9d4cb'; g.fillRect(x + 6, y + 96, S - 12, 8); g.fillStyle = '#9aa0a6'; for (let k = 10; k < S - 10; k += 9) g.fillRect(x + k, y + 98, 2, -22); g.fillRect(x + 6, y + 74, S - 12, 3); }   // ระเบียง
            if (q3 < 0.2 && type !== 'house') { g.fillStyle = '#b07a52'; g.fillRect(wx, wy, ww, wh); }      // ม่าน
            g.fillStyle = '#e3dfd8'; g.fillRect(x, y + S - 6, S, 6);                                          // แนวพื้นชั้น
          } else L(wx, wy, ww, wh);
        } else if (type === 'glass') {
          if (!night) {
            const gr = g.createLinearGradient(x, y, x + S * 0.3, y + S); gr.addColorStop(0, q < 0.5 ? '#c9dbe3' : '#bcd1da'); gr.addColorStop(0.55, q < 0.5 ? '#9fbccb' : '#a9c4d0'); gr.addColorStop(1, '#86a6b6');
            g.fillStyle = gr; g.fillRect(x, y, S, S);                                   // กระจกใส สะท้อนฟ้า (ฟ้าอมเทาอ่อน)
            g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(x, y + S * 0.7); g.lineTo(x + S * 0.6, y); g.lineTo(x + S * 0.8, y); g.lineTo(x, y + S); g.fill();
            g.fillStyle = '#c8d0d6'; g.fillRect(x, y, 4, S); g.fillRect(x + S / 2 - 1, y, 2, S); g.fillRect(x, y + S - 10, S, 10);
          } else { if (lit) { g.fillStyle = warm ? '#ffe3a8' : '#dcecff'; g.fillRect(x + 4, y, S - 4, S - 10); } }
        } else if (type === 'hosp') {
          if (!night) { g.fillStyle = '#6e8fa8'; g.fillRect(x, y + 34, S, 50); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, y + 34, S, 8); g.fillStyle = '#e9edf0'; g.fillRect(x + S - 6, y + 34, 6, 50); }
          else L(x, y + 34, S - 6, 50);
        } else if (type === 'shopG') {                       // ชั้นล่างตึกแถว: ประตูเหล็กม้วน / หน้าร้านกระจก + กันสาดสี + ป้าย
          if (!night) {
            const aw = AWNING[Math.floor(q * AWNING.length)];
            g.fillStyle = aw; g.fillRect(x, y + 6, S, 22);                                               // ป้ายร้าน
            g.fillStyle = 'rgba(255,255,255,.85)'; for (let k = 0; k < 3; k++) g.fillRect(x + 18 + k * 30, y + 13, 20, 7);
            if (q2 < 0.45) { g.fillStyle = '#a7adb3'; g.fillRect(x + 6, y + 34, S - 12, S - 34); g.fillStyle = '#8c9298'; for (let k = y + 38; k < y + S; k += 6) g.fillRect(x + 6, k, S - 12, 2); }   // ประตูม้วน
            else { g.fillStyle = '#41505c'; g.fillRect(x + 6, y + 34, S - 12, S - 34); g.fillStyle = 'rgba(255,240,200,.35)'; g.fillRect(x + 12, y + 44, S - 24, S - 54); g.fillStyle = '#d7d2c9'; g.fillRect(x + S / 2 - 2, y + 34, 4, S - 34); }
          } else if (q2 >= 0.45 || lit) { g.fillStyle = '#ffd48a'; g.fillRect(x + 8, y + 36, S - 16, S - 36); g.fillStyle = '#fff2c4'; g.fillRect(x, y + 6, S, 22); }
        } else if (type === 'ind') {                          // โกดัง: ลอนเมทัลชีท
          if (!night) { g.fillStyle = '#c3cad0'; for (let k = 0; k < S; k += 10) g.fillRect(x + k, y, 4, S); if (j === 0 && q < 0.3) { g.fillStyle = '#7d868e'; g.fillRect(x + 20, y + 40, 88, 88); } }
        } else if (type === 'palace') {                       // อาคารในวัง: ผนังขาว ประตู-หน้าต่างบานเกล็ดสูงสีเขียวเข้ม กรอบขาวนูน
          if (!night) {
            g.fillStyle = '#e4e0d6'; g.fillRect(x + 38, y + 14, 52, 104); g.fillStyle = '#2f4f3e'; g.fillRect(x + 44, y + 22, 40, 92);
            g.fillStyle = '#3d6450'; for (let k = 26; k < 110; k += 6) g.fillRect(x + 46, y + k, 36, 3);
            g.fillStyle = '#f2efe8'; g.fillRect(x + 63, y + 22, 2, 92); g.fillRect(x + 32, y + 8, 64, 6);
          } else { g.fillStyle = '#ffd68a'; g.fillRect(x + 44, y + 22, 40, 92); }
        } else if (type === 'temple') {                       // วัด: ผนังขาว หน้าต่างสูงกรอบแดง-ทอง ฐานแดง
          if (!night) {
            g.fillStyle = '#b8321f'; g.fillRect(x + 36, y + 22, 56, 92); g.fillStyle = '#e1b043'; g.fillRect(x + 42, y + 28, 44, 80);
            g.fillStyle = '#9b2a1a'; g.fillRect(x + 46, y + 32, 36, 72); g.fillStyle = '#e1b043'; g.beginPath(); g.moveTo(x + 32, y + 24); g.lineTo(x + 64, y + 4); g.lineTo(x + 96, y + 24); g.fill();
          } else { g.fillStyle = '#ffcf80'; g.fillRect(x + 46, y + 32, 36, 72); }
        }
      }
      const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / N, 1 / N); t.anisotropy = 8; return t;
    };
    return (_texCache[type] = { day: make(false), night: make(true) });
  }
  function tileTexture(T) {
    if (_texCache._tile) return _texCache._tile;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 64, 5); g.fillStyle = '#e4e4e4'; g.fillRect(0, 5, 64, 3);
    g.fillStyle = '#d6d6d6'; for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 2, 64);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return (_texCache._tile = t);
  }

  function buildCity(osm, P, opts) {
    const T = window.THREE;
    const B = {};                                       // ถังเรขาคณิตแยกตามวัสดุ
    const bucket = k => B[k] || (B[k] = { p: [], n: [], c: [], uv: [] });
    const push = (G, a, b, c, color, uvs) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      G.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); G.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      for (let i = 0; i < 3; i++) { const cc = Array.isArray(color) ? color[i] : color; G.c.push(cc.r, cc.g, cc.b); }
      if (uvs) G.uv.push(...uvs); else G.uv.push(0, 0, 0, 0, 0, 0);
    };
    const tri = (G, a, b, c, color, up, uvs) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * up[0] + ny * up[1] + nz * up[2] < 0) push(G, a, c, b, color, uvs && [uvs[0], uvs[1], uvs[4], uvs[5], uvs[2], uvs[3]]); else push(G, a, b, c, color, uvs);
    };
    const quad = (G, a, b, c, d, color, up, uv) => { tri(G, a, b, c, color, up, uv && [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]]); tri(G, a, c, d, color, up, uv && [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]]); };
    const C = h => new T.Color(h);
    const bInfo = [], trees = [], tanks = [], stupas = [], lamps = [], pillars = [], wcols = [];
    // แถบผนังเรียบรอบรูปหลายเหลี่ยม (คิ้ว/ฐาน) — ยื่นออก off ม.
    const band = (ring, y0, y1, col, off) => {
      const cx0 = ring.reduce((s2, q) => s2 + q[0], 0) / ring.length, cz0 = ring.reduce((s2, q) => s2 + q[1], 0) / ring.length;
      const r2 = off ? ring.map(q => { const dx = q[0] - cx0, dz = q[1] - cz0, L = Math.hypot(dx, dz) || 1; return [q[0] + dx / L * off, q[1] + dz / L * off]; }) : ring;
      for (let i = 0; i < r2.length; i++) {
        const a = r2[i], b = r2[(i + 1) % r2.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05) continue;
        let n = [b[1] - a[1], 0, -(b[0] - a[0])]; if (((a[0] + b[0]) / 2 - cx0) * n[0] + ((a[1] + b[1]) / 2 - cz0) * n[2] < 0) n = [-n[0], 0, -n[2]];
        quad(bucket('plain'), [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], col, n);
      }
      if (off) { const v2s = r2.map(q => new T.Vector2(q[0], q[1])); let tr2 = []; try { tr2 = T.ShapeUtils.triangulateShape(v2s, []); } catch (e) {}
        for (const f of tr2) { tri(bucket('plain'), [r2[f[0]][0], y1, r2[f[0]][1]], [r2[f[1]][0], y1, r2[f[1]][1]], [r2[f[2]][0], y1, r2[f[2]][1]], col, [0, 1, 0]);
          tri(bucket('plain'), [r2[f[0]][0], y0, r2[f[0]][1]], [r2[f[1]][0], y0, r2[f[1]][1]], [r2[f[2]][0], y0, r2[f[2]][1]], col.clone().multiplyScalar(0.8), [0, -1, 0]); } }
    };
    const PAL = opts.palace ? (() => { const pa = opts.palace; return { a: [pa.a[0], -pa.a[1]], b: [pa.b[0], -pa.b[1]], r: pa.r || 400 }; })() : null;   // เขตวัง: ฝั่งขวาของเส้น a→b (พิกัด ตอ./เหนือ)
    const r0 = opts.stationXZ, hideR = opts.radius, els = osm.elements || [];

    // ── ผนัง: ชั้นล่าง (ร้านค้า) แยกจากชั้นบน ──
    const walls = (ring, y0, y1, colTop, type, groundType) => {
      const dark = colTop.clone().multiplyScalar(0.74); let acc = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.05) continue;
        const u0 = acc / 3.6, u1 = (acc + L) / 3.6; acc += L;
        const seg = (ya, yb, ty, ca, cb) => {
          const G = bucket('w_' + ty), A0 = [a[0], ya, a[1]], B0 = [b[0], ya, b[1]], A1 = [a[0], yb, a[1]], B1 = [b[0], yb, b[1]];
          const v0 = ya / 3.2, v1 = yb / 3.2;
          push(G, A0, B1, B0, [ca, cb, ca], [u0, v0, u1, v1, u1, v0]);
          push(G, A0, A1, B1, [ca, cb, cb], [u0, v0, u0, v1, u1, v1]);
        };
        const gH = Math.min(y1, y0 + 3.6);
        if (groundType && y1 - y0 > 4.5) { seg(y0, gH, groundType, dark, colTop); seg(gH, y1, type, colTop, colTop); }
        else seg(y0, y1, type, y0 > 0.5 ? colTop : dark, colTop);
      }
    };
    // ── หลังคาจั่ว/ปั้นหยา ตามกรอบ OBB ──
    const pitched = (ob, shape, h, roofC, wallC, ov, pitch, maxRise) => {
      const hl = ob.hl + ov, hw = ob.hw + ov, rise = Math.min(hw * pitch, maxRise);
      const W2 = (u, v, y) => [ob.cx + u * ob.ux - v * ob.uz, y, ob.cz + u * ob.uz + v * ob.ux];
      const baseY = h - 0.15, topY = baseY + rise, ridge = shape === 'gabled' ? hl : Math.max(0, hl - hw);
      const G = bucket('tile'), sl = Math.hypot(hw, rise);
      for (const s of [-1, 1]) {
        const cc = s > 0 ? roofC : roofC.clone().multiplyScalar(0.86);
        quad(G, W2(-ridge, 0, topY), W2(ridge, 0, topY), W2(hl, s * hw, baseY), W2(-hl, s * hw, baseY), cc, [0, 1, 0],
          [-ridge / 1.2, 0, ridge / 1.2, 0, hl / 1.2, sl / 0.45, -hl / 1.2, sl / 0.45]);
      }
      for (const e of [-1, 1]) {
        if (shape === 'gabled') tri(bucket('plain'), W2(e * hl, -hw, baseY), W2(e * hl, hw, baseY), W2(e * ridge, 0, topY), wallC, [e * ob.ux, 0, e * ob.uz]);
        else tri(G, W2(e * hl, -hw, baseY), W2(e * hl, hw, baseY), W2(e * ridge, 0, topY), roofC.clone().multiplyScalar(0.93), [0, 1, 0], [0, 0, hw / 0.6, 0, hw / 1.2, sl / 0.45]);
      }
      // ชายคา (แผ่นใต้ชายคาสีเข้ม ทำให้หลังคาดูมีความหนา)
      const fas = roofC.clone().multiplyScalar(0.6), P4 = [W2(-hl, -hw, baseY), W2(hl, -hw, baseY), W2(hl, hw, baseY), W2(-hl, hw, baseY)];
      for (let i = 0; i < 4; i++) { const a = P4[i], b = P4[(i + 1) % 4]; quad(bucket('plain'), a, b, [b[0], b[1] - 0.18, b[2]], [a[0], a[1] - 0.18, a[2]], fas, [ (a[0] + b[0]) / 2 - ob.cx, 0, (a[2] + b[2]) / 2 - ob.cz ]); }
    };
    // ── หลังคาทรงไทยซ้อนชั้น (วัด) ──
    const thaiRoof = (ob, h) => {
      const orange = C('#cf4b22'), orange2 = C('#b8401c'), green = C('#2f7d4a'), gold = C('#e3b23c'), pedi = C('#c9931f'), red = C('#a52a1a');
      const W2 = (u, v, y) => [ob.cx + u * ob.ux - v * ob.uz, y, ob.cz + u * ob.uz + v * ob.ux];
      const tier = (hl, hw, baseY, rise, ridgeL, endCap) => {
        const topY = baseY + rise, f = 0.7, G = bucket('tile'), sl = Math.hypot(hw, rise);
        for (const s of [-1, 1]) {
          const m0 = W2(-ridgeL, s * hw * (1 - f), baseY + rise * f), m1 = W2(ridgeL, s * hw * (1 - f), baseY + rise * f);
          quad(G, W2(-ridgeL, 0, topY), W2(ridgeL, 0, topY), m1, m0, s > 0 ? orange : orange2, [0, 1, 0], [-ridgeL, 0, ridgeL, 0, ridgeL, sl * f / 0.4, -ridgeL, sl * f / 0.4]);
          quad(G, m0, m1, W2(hl, s * hw, baseY), W2(-hl, s * hw, baseY), green, [0, 1, 0], [-ridgeL, 0, ridgeL, 0, hl, sl * (1 - f) / 0.4, -hl, sl * (1 - f) / 0.4]);
        }
        const rg = 0.16; quad(bucket('plain'), W2(-ridgeL, -rg, topY + 0.04), W2(ridgeL, -rg, topY + 0.04), W2(ridgeL, rg, topY + 0.04), W2(-ridgeL, rg, topY + 0.04), gold, [0, 1, 0]);
        for (const e of endCap) {
          tri(bucket('plain'), W2(e * hl, -hw, baseY), W2(e * hl, hw, baseY), W2(e * ridgeL, 0, topY), pedi, [e * ob.ux, 0, e * ob.uz]);     // หน้าบัน
          for (const s of [-1, 1]) {                                                                                                   // ใบระกาสีทอง
            const a = W2(e * hl, s * hw, baseY), b = W2(e * ridgeL, 0, topY), off = 0.18 * e;
            quad(bucket('plain'), a, b, [b[0] + off * ob.ux, b[1] + 0.25, b[2] + off * ob.uz], [a[0] + off * ob.ux, a[1] + 0.25, a[2] + off * ob.uz], gold, [e * ob.ux, 0.2, e * ob.uz]);
          }
          stupas.push({ chofa: true, p: W2(e * (ridgeL + 0.25), 0, topY), dir: e, ux: ob.ux, uz: ob.uz });
        }
      };
      const hw0 = ob.hw + 1.0, rise0 = Math.min(hw0 * 1.25, 13);
      tier(ob.hl + 1.0, hw0, h - 0.3, rise0, ob.hl + 1.0, [-1, 1]);                                     // ผืนหลัก
      const hw1 = hw0 * 0.82, ext = Math.min(3.2, ob.hl * 0.25);
      for (const e of [-1, 1]) {                                                                         // ชั้นลดหน้า-หลัง (ต่ำลง ยื่นออก)
        const hl1 = ext / 2, cu = e * (ob.hl + 1.0 + hl1 - 0.3);
        const ob1 = Object.assign({}, ob, { cx: ob.cx + cu * ob.ux, cz: ob.cz + cu * ob.uz });
        const W3 = (u, v, y) => [ob1.cx + u * ob.ux - v * ob.uz, y, ob1.cz + u * ob.uz + v * ob.ux];
        const save = W2; void save; void W3;
        const by = h - 1.4, rs = Math.min(hw1 * 1.25, 11), topY = by + rs, G = bucket('tile');
        for (const s of [-1, 1]) quad(G, W3(-hl1, 0, topY), W3(hl1, 0, topY), W3(hl1, s * hw1, by), W3(-hl1, s * hw1, by), s > 0 ? orange : orange2, [0, 1, 0], [0, 0, 2, 0, 2, 20, 0, 20]);
        tri(bucket('plain'), W3(e * hl1, -hw1, by), W3(e * hl1, hw1, by), W3(e * hl1, 0, topY), pedi, [e * ob.ux, 0, e * ob.uz]);
        stupas.push({ chofa: true, p: W3(e * (hl1 + 0.2), 0, topY), dir: e, ux: ob.ux, uz: ob.uz });
      }
      // กันสาดรอบอาคาร (ปีกนก) สีเขียว
      const sk = 2.0, sy0 = h - 2.6, sy1 = h - 0.8;
      for (const [a, b] of [[[-ob.hl, -ob.hw], [ob.hl, -ob.hw]], [[ob.hl, -ob.hw], [ob.hl, ob.hw]], [[ob.hl, ob.hw], [-ob.hl, ob.hw]], [[-ob.hl, ob.hw], [-ob.hl, -ob.hw]]]) {
        const a2 = [a[0] + Math.sign(a[0]) * sk, a[1] + Math.sign(a[1]) * sk], b2 = [b[0] + Math.sign(b[0]) * sk, b[1] + Math.sign(b[1]) * sk];
        quad(bucket('tile'), W2(a[0], a[1], sy1), W2(b[0], b[1], sy1), W2(b2[0], b2[1], sy0), W2(a2[0], a2[1], sy0), green, [0, 1, 0], [0, 0, 8, 0, 8, 6, 0, 6]);
      }
      // ฐานสีแดงรอบอาคาร
      return red;
    };

    // ── เขตวัด ──
    const watAreas = [];
    for (const el of els) {
      const t = el.tags || {}; if (t.amenity !== 'place_of_worship' || t.building) continue;
      if (!(t.religion === 'buddhist' || /^วัด/.test(t.name || ''))) continue;
      const rr = toRings(el, P); if (rr) for (const o of rr.outer) if (o.length > 2) watAreas.push(o);
    }

    // ── 1) อาคาร ──
    for (const el of els) {
      const t = el.tags || {};
      if (!t.building || t.building === 'no' || t['building:part']) continue;
      const rr = toRings(el, P); if (!rr || !rr.outer.length) continue;
      const ovC = opts.bld && opts.bld[el.id];
      if (ovC && ovC.hide) continue;                                                 // ซ่อนอาคาร OSM ที่ไม่ใช่อาคารจริง (ใช้ฉากจัดเองแทน)
      for (let outer of rr.outer) {
        if (ovC && ovC.maxX != null) {                                              // ตัดอาคารส่วนที่เกินแนว x (ม. ทางตะวันออกของตู้) ออก
          const m = ovC.maxX, o2 = [];
          for (let i = 0; i < outer.length; i++) { const a = outer[i], b = outer[(i + 1) % outer.length], ia = a[0] <= m, ib = b[0] <= m;
            if (ia) o2.push(a); if (ia !== ib) { const t = (m - a[0]) / (b[0] - a[0]); o2.push([m, a[1] + (b[1] - a[1]) * t]); } }
          outer = o2;
        }
        if (outer.length < 3 || ringDist(r0[0], r0[1], outer) > hideR) continue;
        if (opts.hideR > 0 && ringDist(opts.cabXZ[0], opts.cabXZ[1], outer) < opts.hideR) continue;   // พื้นที่ฉากจัดเองรอบตู้
        if (areaXZ(outer) < 0) outer = outer.slice().reverse();
        const inners = rr.inner.filter(hh => hh.length > 2 && pip(hh[0][0], hh[0][1], outer)).map(hh => areaXZ(hh) > 0 ? hh.slice().reverse() : hh);
        const area = Math.abs(areaXZ(outer)) - inners.reduce((s, hh) => s + Math.abs(areaXZ(hh)), 0);
        if (area < 6) continue;
        let kind = classify(t); const rnd = rng((el.id * 2654435761) >>> 0);
        if (kind === 'yes' && watAreas.length) {
          const cx0 = outer.reduce((s2, q) => s2 + q[0], 0) / outer.length, cz0 = outer.reduce((s2, q) => s2 + q[1], 0) / outer.length;
          if (area > 90 && area < 1800 && watAreas.some(w => pip(cx0, cz0, w))) kind = 'temple';
        }
        const ob = obb(outer), rect = ob ? area / (4 * ob.hl * ob.hw) : 0;
        const isRow = kind === 'yes' && ob && ob.hw * 2 <= 7 && ob.hl / Math.max(ob.hw, 0.1) >= 1.8 && area < 260;
        let lv = num(t['building:levels']), h = num(t.height) || num(t['building:height']);
        const minH = num(t.min_height) || (isFinite(num(t['building:min_level'])) ? num(t['building:min_level']) * 3.2 : 0) || 0;
        if (!isFinite(h)) {
          if (!isFinite(lv)) {
            if (kind === 'house') lv = rnd() < 0.55 ? 2 : 1;
            else if (kind === 'apt') lv = area > 1200 ? 6 + Math.floor(rnd() * 10) : 4 + Math.floor(rnd() * 4);
            else if (kind === 'office') lv = 6 + Math.floor(rnd() * 14);
            else if (kind === 'shop') lv = area > 3000 ? 4 : 3 + Math.floor(rnd() * 2);
            else if (kind === 'ind' || kind === 'roof') lv = 1;
            else if (kind === 'school' || kind === 'civic') lv = 3 + Math.floor(rnd() * 2);
            else if (kind === 'hosp') lv = 5 + Math.floor(rnd() * 8);
            else if (kind === 'temple') lv = 2;
            else if (isRow) lv = 3 + (rnd() < 0.45 ? 1 : 0);
            else lv = area < 70 ? 2 : area < 260 ? 2 + Math.floor(rnd() * 2) : area < 1500 ? 2 + Math.floor(rnd() * 3) : 2;   // ไม่มีข้อมูล → อาคารเตี้ย (กทม. ส่วนใหญ่)
          }
          h = kind === 'ind' ? 7 + rnd() * 4 : kind === 'temple' ? 7 : kind === 'roof' ? 4.5 : lv * 3.2 + 0.4;
        }
        h = Math.max(h, minH + 2.5);
        let palB = false;
        if (PAL) {                                                                   // ในเขตพระราชวัง: อาคารเตี้ย 1–2 ชั้น ผนังขาว หลังคาปั้นหยา
          const cx0 = outer.reduce((s2, q) => s2 + q[0], 0) / outer.length, cz0 = outer.reduce((s2, q) => s2 + q[1], 0) / outer.length;
          const dx = PAL.b[0] - PAL.a[0], dz = PAL.b[1] - PAL.a[1];
          if ((dx * (cz0 - PAL.a[1]) - dz * (cx0 - PAL.a[0])) > 0 && Math.hypot(cx0, cz0) < PAL.r) { palB = true; h = area > 500 ? 7.2 : 4.4 + rnd() * 2.6; kind = 'house'; }
        }
        const ov = opts.bld && opts.bld[el.id];
        if (ov && ov.h) h = ov.h;
        let shape = (t['roof:shape'] || '').toLowerCase();
        if (kind === 'temple') shape = 'thai';
        else if (kind === 'roof') shape = 'slab';
        else if (!shape) shape = (kind === 'house' || (kind === 'yes' && !isRow && area < 160 && h <= 7.5)) ? (rnd() < 0.55 ? 'gabled' : 'hipped') : 'flat';
        if (shape === 'half-hipped' || shape === 'mansard' || shape === 'pyramidal') shape = 'hipped';
        if ((shape === 'gabled' || shape === 'hipped' || shape === 'thai') && (!ob || rect < 0.62 || ob.hw < 1.5)) shape = 'flat';
        if (!/^(gabled|hipped|thai|slab|flat)$/.test(shape)) shape = 'flat';
        let wallC, roofC;
        try { wallC = C(t['building:colour'] || t['building:color'] || pick(WALL[kind] || WALL.shop, rnd())); } catch (e) { wallC = C(pick(WALL.shop, rnd())); }
        try { roofC = C(t['roof:colour'] || t['roof:color'] || (shape === 'flat' ? pick(ROOF_FLAT, rnd()) : kind === 'ind' ? pick(['#7d97ab', '#8aa0b0', '#6f8a9e'], rnd()) : pick(ROOF_TILE, rnd()))); } catch (e) { roofC = C(pick(ROOF_FLAT, rnd())); }
        if (palB) { wallC = C(pick(['#f6f3ec', '#f1ece1', '#f8f6f0'], rnd())); roofC = C(pick(['#b9532c', '#a3482a', '#7f6a58', '#5d7c68'], rnd())); shape = ob && rect >= 0.62 && ob.hw >= 1.5 ? 'hipped' : 'flat'; }
        if (ov && ov.style === 'glass') { kind = 'office'; wallC = C(ov.color || '#f4f7f8'); roofC = C('#b9c0c4'); shape = 'flat'; }
        if (ov && ov.style === 'hospital') { kind = 'hosp'; wallC = C(ov.color || '#f6f6f3'); roofC = C('#cfcbc4'); shape = 'flat'; }
        bInfo.push({ outer, inners, h, kind, area, name: ov && ov.noSign ? null : t.name, noSign: ov && ov.noSign });
        if (ov && ov.style === 'colonnade') {                               // อาคารชั้นเดียวสีขาว มีระเบียงเสาเรียงด้านหน้า (หันหาถนน/ทิศหน้าตู้)
          const wc = C(ov.color || '#f7f5ef'), fd = opts.yawFix != null ? [Math.sin(opts.yawFix), Math.cos(opts.yawFix)] : [0, 1];
          const cx0 = outer.reduce((s2, q) => s2 + q[0], 0) / outer.length, cz0 = outer.reduce((s2, q) => s2 + q[1], 0) / outer.length, nO = outer.length;
          let fi = 0, fbest = -9, fn = [0, 1];
          for (let i = 0; i < nO; i++) {
            const a = outer[i], b = outer[(i + 1) % nO], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
            let n = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; if (((a[0] + b[0]) / 2 - cx0) * n[0] + ((a[1] + b[1]) / 2 - cz0) * n[1] < 0) n = [-n[0], -n[1]];
            const sc = (n[0] * fd[0] + n[1] * fd[1]) * Math.min(1, L / 6); if (sc > fbest) { fbest = sc; fi = i; fn = n; }
          }
          const dep = ov.depth || 2.8, i2 = (fi + 1) % nO, eH = h - 0.95, a = outer[fi], b = outer[i2], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const core = outer.map((q, i) => (i === fi || i === i2) ? [q[0] - fn[0] * dep, q[1] - fn[1] * dep] : q);
          band(outer, 0, 0.45, C('#e4dfd4'), 0.35);                                    // ฐานยก + บันได
          walls(core, 0.45, eH, wc, 'palace', null);                                   // ผนังด้านใน (ประตูบานเกล็ดสูง)
          band(outer, eH, h, wc, 0.05); band(outer, h, h + 0.22, C('#ece8de'), 0.4);    // คิ้วบน + ชายคาแบน
          band(outer, h + 0.22, h + 0.75, wc, 0.1);                                    // ผนังกันตก
          const nc = Math.max(3, Math.round(L / 3.0));
          for (let k = 0; k <= nc; k++) { const u = 0.5 + (L - 1) * k / nc; wcols.push({ x: a[0] + (b[0] - a[0]) * u / L - fn[0] * 0.35, z: a[1] + (b[1] - a[1]) * u / L - fn[1] * 0.35, y: 0.45, h: eH - 0.45, r: 0.24 }); }
          continue;
        }
        if (ov && (ov.style === 'shed' || ov.style === 'pavilion')) {     // อาคารเปิดโล่ง: เสารอบอาคาร + ผนังเฉพาะบางส่วน
          const pil = ov.style === 'pavilion' ? 0.3 : 0.12, step = ov.style === 'pavilion' ? 4.5 : 3.5;
          for (let i = 0; i < outer.length; i++) { const a = outer[i], b = outer[(i + 1) % outer.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d < L; d += step) pillars.push({ x: a[0] + (b[0] - a[0]) * d / L, z: a[1] + (b[1] - a[1]) * d / L, h: ov.style === 'pavilion' ? 3.8 : h, r: pil }); }
          const cx0 = outer.reduce((s2, q) => s2 + q[0], 0) / outer.length, cz0 = outer.reduce((s2, q) => s2 + q[1], 0) / outer.length;
          if (ov.style === 'pavilion') {
            const wc = C('#f6f5f1'), core = outer.map(q => [cx0 + (q[0] - cx0) * 0.55, cz0 + (q[1] - cz0) * 0.55]);
            walls(core, 0, 3.8, C('#ece7dd'), 'win', null); walls(outer, 3.8, h, wc, 'ind', null);
            roofC = C('#e4e0d8'); wallC = wc;
          } else {
            const back = outer.map(q => [cx0 + (q[0] - cx0) * 0.7, cz0 + (q[1] - cz0) * 0.7]);
            walls(back, 0, h * 0.7, C('#cfc6b6'), 'ind', null); walls(outer, h - 0.8, h, C('#c8c2b6'), 'ind', null);
            roofC = C('#9eaab2'); wallC = C('#c8c2b6');
          }
          const v2s = outer.map(q => new T.Vector2(q[0], q[1])); let tr2 = []; try { tr2 = T.ShapeUtils.triangulateShape(v2s, []); } catch (e) {}
          for (const f of tr2) tri(bucket('plain'), [outer[f[0]][0], h, outer[f[0]][1]], [outer[f[1]][0], h, outer[f[1]][1]], [outer[f[2]][0], h, outer[f[2]][1]], roofC, [0, 1, 0]);
          if (ov.style === 'shed' && ob) pitched(ob, 'gabled', h, roofC, wallC, 0.6, 0.18, ov.rise != null ? ov.rise : 2);
          continue;
        }
        // ผนัง
        const ftype = palB ? 'palace' : kind === 'office' ? 'glass' : kind === 'hosp' ? 'hosp' : kind === 'ind' ? 'ind' : kind === 'temple' ? 'temple' : kind === 'house' ? 'house' : kind === 'apt' ? 'apt' : 'win';
        const gtype = (isRow || kind === 'shop' || (kind === 'apt' && rnd() < 0.4) || (kind === 'yes' && area < 600 && rnd() < 0.5)) ? 'shopG' : null;
        if (shape === 'slab') {
          for (const q of [outer[0], outer[Math.floor(outer.length / 2)]]) pillars.push({ x: q[0], z: q[1], h: h - 0.35, r: 0.15 });
        } else for (const ring of [outer, ...inners]) walls(ring, minH, h, wallC, ftype, gtype);
        // ฝาหลังคา
        const v2 = outer.map(q => new T.Vector2(q[0], q[1])), holes = inners.map(hh => hh.map(q => new T.Vector2(q[0], q[1])));
        let tris = []; try { tris = T.ShapeUtils.triangulateShape(v2, holes); } catch (e) {}
        const all = outer.concat(...inners), capC = shape === 'flat' || shape === 'slab' ? roofC : wallC.clone().multiplyScalar(0.9);
        for (const f of tris) tri(bucket('plain'), [all[f[0]][0], h, all[f[0]][1]], [all[f[1]][0], h, all[f[1]][1]], [all[f[2]][0], h, all[f[2]][1]], capC, [0, 1, 0]);
        if (shape === 'slab') for (const f of tris) tri(bucket('plain'), [all[f[0]][0], h - 0.35, all[f[0]][1]], [all[f[1]][0], h - 0.35, all[f[1]][1]], [all[f[2]][0], h - 0.35, all[f[2]][1]], roofC.clone().multiplyScalar(0.7), [0, -1, 0]);
        if (shape === 'flat' && area > 25) {
          const pc = wallC.clone().multiplyScalar(0.9), pt = wallC.clone().multiplyScalar(0.8);
          for (let i = 0; i < outer.length; i++) {                                     // ขอบกันตก (สีผนัง)
            const a = outer[i], b = outer[(i + 1) % outer.length], n = [b[1] - a[1], 0, -(b[0] - a[0])];
            quad(bucket('plain'), [a[0], h, a[1]], [b[0], h, b[1]], [b[0], h + 0.7, b[1]], [a[0], h + 0.7, a[1]], pc, n);
            const L = Math.hypot(n[0], n[2]) || 1, ix = -n[0] / L * 0.2, iz = -n[2] / L * 0.2;
            quad(bucket('plain'), [a[0], h + 0.7, a[1]], [b[0], h + 0.7, b[1]], [b[0] + ix, h + 0.7, b[1] + iz], [a[0] + ix, h + 0.7, a[1] + iz], pt, [0, 1, 0]);
          }
          if (ob) {
            const nTank = area < 400 ? (rnd() < 0.75 ? 1 : 2) : Math.min(6, Math.floor(area / 450) + 1);
            for (let k = 0; k < nTank; k++) for (let tries = 0; tries < 8; tries++) {
              const x = ob.cx + (rnd() * 2 - 1) * ob.hl * 0.8 * ob.ux - (rnd() * 2 - 1) * ob.hw * 0.8 * ob.uz;
              const z = ob.cz + (rnd() * 2 - 1) * ob.hl * 0.8 * ob.uz + (rnd() * 2 - 1) * ob.hw * 0.8 * ob.ux;
              if (pip(x, z, outer)) { tanks.push({ x, z, y: h, big: area > 1500, kind: rnd() < 0.5 ? 'blue' : rnd() < 0.6 ? 'steel' : 'ac' }); break; }
            }
            if (area > 600 && h > 15 && rnd() < 0.6) {                                    // ห้องเครื่องลิฟต์บนดาดฟ้า
              const w = Math.min(ob.hl, 5), d = Math.min(ob.hw, 4), W2 = (u, v, y) => [ob.cx + u * ob.ux - v * ob.uz, y, ob.cz + u * ob.uz + v * ob.ux];
              const hc = wallC.clone().multiplyScalar(0.95), P4 = [W2(-w / 2, -d / 2, 0), W2(w / 2, -d / 2, 0), W2(w / 2, d / 2, 0), W2(-w / 2, d / 2, 0)];
              let r4 = P4.map(p => [p[0], p[2]]); if (areaXZ(r4) < 0) r4 = r4.reverse(); walls(r4, h, h + 3, hc, 'ind', null);
              quad(bucket('plain'), [P4[0][0], h + 3, P4[0][2]], [P4[1][0], h + 3, P4[1][2]], [P4[2][0], h + 3, P4[2][2]], [P4[3][0], h + 3, P4[3][2]], roofC, [0, 1, 0]);
            }
          }
        }
        if (ob && (shape === 'gabled' || shape === 'hipped')) pitched(ob, shape, h, roofC, wallC, 0.5, 0.58, 5.5);
        if (ob && shape === 'thai') thaiRoof(ob, h);
      }
    }
    // ── ตู้อยู่ในตัวอาคาร (พิกัดคลาด) → ขยับออกมาที่ขอบอาคาร +2 ม. ──
    for (const b of bInfo) {
      if (opts.fixed || !pip(opts.cabXZ[0], opts.cabXZ[1], b.outer)) continue;
      let best = null;
      for (let i = 0; i < b.outer.length; i++) { const a = b.outer[i], c = b.outer[(i + 1) % b.outer.length], d = segDist(opts.cabXZ[0], opts.cabXZ[1], a, c); if (!best || d[0] < best[0]) best = [d[0], d[1], d[2], a, c]; }
      if (best) { const [, x, z, a, c] = best, L = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1; opts.cabXZ = [x + (c[1] - a[1]) / L * 2.2, z - (c[0] - a[0]) / L * 2.2]; }
      break;
    }

    // ── 2) ถนน: ผิวยางมะตอย + ทางเท้า + เส้นจราจร + เสาไฟ ──
    const ROADW = { trunk: 20, primary: 16, secondary: 12, tertiary: 9, residential: 6, unclassified: 6, living_street: 5 };
    const asph = C('#62666b'), asph2 = C('#6b6f74'), walk = C('#d9d3c7'), curb = C('#bdb6aa'), lineW = C('#f4f4f2'), lineY = C('#e8c547');
    let bestRoad = null; const roadSegs = [];
    const ribbon = (G, a, b, w, y, col) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) return;
      const nx = -(b[1] - a[1]) / L * w / 2, nz = (b[0] - a[0]) / L * w / 2;
      quad(G, [a[0] + nx, y, a[1] + nz], [b[0] + nx, y, b[1] + nz], [b[0] - nx, y, b[1] - nz], [a[0] - nx, y, a[1] - nz], col, [0, 1, 0]);
    };
    const disc = (G, p, r, y, col) => { const n = 10; for (let i = 0; i < n; i++) { const a1 = i / n * 6.283, a2 = (i + 1) / n * 6.283; tri(G, [p[0], y, p[1]], [p[0] + Math.cos(a1) * r, y, p[1] + Math.sin(a1) * r], [p[0] + Math.cos(a2) * r, y, p[1] + Math.sin(a2) * r], col, [0, 1, 0]); } };
    for (const el of els) {
      const t = el.tags || {}; let w = ROADW[t.highway]; if (!w || el.type !== 'way' || !el.geometry) continue;
      if (opts.roadW && opts.roadW[el.id]) w = opts.roadW[el.id]; else if (+t.lanes > 0) w = Math.max(w, +t.lanes * 3.3);
      const line = el.geometry.map(p => P(p.lat, p.lon));
      if (!line.some((q, i) => i < line.length - 1 && segDist(r0[0], r0[1], q, line[i + 1])[0] < hideR + 40)) continue;
      for (let i = 0; i < line.length - 1; i++) { roadSegs.push([line[i], line[i + 1], w >= 16 ? 3 : w >= 12 ? 2.5 : w >= 9 ? 2 : 1, w]); const d = segDist(opts.cabXZ[0], opts.cabXZ[1], line[i], line[i + 1]); if (!bestRoad || d[0] < bestRoad[0]) bestRoad = d; }
      const elev = /^(yes|viaduct)$/.test(t.bridge || '') ? 7 : 0, G = bucket('road'), yA = elev + 0.2, yW = elev + 0.05;
      if (t.tunnel) continue;
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        if (!elev) { ribbon(G, a, b, w + 5.0, yW, walk); }
        ribbon(G, a, b, w + 0.5, yA - 0.07, curb); ribbon(G, a, b, w, yA, w >= 12 ? asph : asph2);
        if (elev) {                                                                   // สะพาน: พื้น + เสา
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          for (let d = 0; d < L; d += 25) pillars.push({ x: a[0] + (b[0] - a[0]) * d / L, z: a[1] + (b[1] - a[1]) * d / L, h: elev, r: 0.7 });
        }
        // เส้นจราจร: ถนนใหญ่เส้นคู่เหลือง / ถนนรองเส้นประขาว
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (w >= 12) { const ox = -(b[1] - a[1]) / L * 0.18, oz = (b[0] - a[0]) / L * 0.18; for (const s of [-1, 1]) ribbon(G, [a[0] + ox * s, a[1] + oz * s], [b[0] + ox * s, b[1] + oz * s], 0.15, yA + 0.08, lineY); }
        else if (w >= 6) for (let d = 1; d < L - 2; d += 6) ribbon(G, [a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L], [a[0] + (b[0] - a[0]) * (d + 3) / L, a[1] + (b[1] - a[1]) * (d + 3) / L], 0.15, yA + 0.08, lineW);
        if (w >= 9 && !elev) {                                                         // เส้นขอบทาง + เสาไฟ
          const ox = -(b[1] - a[1]) / L * (w / 2 - 0.5), oz = (b[0] - a[0]) / L * (w / 2 - 0.5);
          for (const s of [-1, 1]) ribbon(G, [a[0] + ox * s, a[1] + oz * s], [b[0] + ox * s, b[1] + oz * s], 0.12, yA + 0.08, lineW);
          for (let d = 10; d < L; d += 38) { const s = (Math.floor(d / 38) % 2) ? 1 : -1, f = (w / 2 + 1.2) / (w / 2 - 0.5); lamps.push({ x: a[0] + (b[0] - a[0]) * d / L + ox * s * f, z: a[1] + (b[1] - a[1]) * d / L + oz * s * f, yaw: Math.atan2(-ox * s, -oz * s) }); }
        }
      }
      for (let i = 1; i < line.length - 1; i++) { if (!elev) disc(G, line[i], (w + 5) / 2, yW, walk); disc(G, line[i], w / 2, yA, w >= 12 ? asph : asph2); }   // รอยต่อโค้ง
    }
    opts.cabYaw = opts.yawFix != null ? opts.yawFix : bestRoad && bestRoad[0] > 0.5 && bestRoad[0] < 60 ? Math.atan2(bestRoad[1] - opts.cabXZ[0], bestRoad[2] - opts.cabXZ[1]) : 0;

    // ── ป้ายชื่ออาคาร (โรงพยาบาล/โรงเรียน/วัด/ห้าง…) หันหาถนน ──
    const signs = [];
    {
      const named = [];
      for (const el of els) {                                              // พื้นที่ รพ./โรงเรียน ที่มีชื่อ → อาคารใหญ่สุดในพื้นที่
        const t = el.tags || {}; if (t.building || !t.name || !/^(hospital|school|university|college|clinic|place_of_worship)$/.test(t.amenity || '')) continue;
        const rr = toRings(el, P); if (!rr) continue;
        for (const o of rr.outer) { let best = null; for (const b of bInfo) { if (b.name || b.noSign) continue; const cx = b.outer.reduce((s2, q) => s2 + q[0], 0) / b.outer.length, cz = b.outer.reduce((s2, q) => s2 + q[1], 0) / b.outer.length; if (pip(cx, cz, o) && (!best || b.area > best.area)) best = b; } if (best) best.areaName = t.name; }
      }
      for (const b of bInfo) { const nm = b.name || b.areaName; if (nm && b.area > 120 && b.h > 3) named.push([b, nm]); }
      named.sort((a, b) => b[0].area - a[0].area);
      for (const [b, nm] of named.slice(0, 24)) {
        let best = null;
        for (let i = 0; i < b.outer.length; i++) {
          const a = b.outer[i], c = b.outer[(i + 1) % b.outer.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 6) continue;
          const nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L, mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
          let best2 = -1, rx = 0, rz = 0, dmin = 1e9;
          for (const sg of roadSegs) { const d = segDist(mx, mz, sg[0], sg[1]); const v = sg[2] / (1 + d[0] / 40); if (v > best2) { best2 = v; dmin = d[0]; rx = d[1] - mx; rz = d[2] - mz; } }
          const rl = Math.hypot(rx, rz) || 1, face = (nx * rx + nz * rz) / rl, sc2 = L * Math.max(0.05, face) * best2;
          if (!best || sc2 > best.sc) best = { sc: sc2, a, c, L, nx, nz, mx, mz };
        }
        if (best) signs.push({ b, nm, ...best });
      }
    }

    // ── รั้ว/กำแพง (barrier) ──
    const fences = [];
    for (const el of els) {
      const t = el.tags || {}; if (!/^(fence|wall|retaining_wall)$/.test(t.barrier || '') || el.type !== 'way' || !el.geometry) continue;
      const line = el.geometry.map(p => P(p.lat, p.lon));
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1];
        if (segDist(r0[0], r0[1], a, b)[0] > hideR) continue;
        if (opts.noBarrierR && segDist(opts.cabXZ[0], opts.cabXZ[1], a, b)[0] < opts.noBarrierR) continue;
        if (t.barrier === 'fence') fences.push([a, b]);
        else { const hh = t.barrier === 'retaining_wall' ? 1.0 : 2.2, wc = C('#d9d3c9'), n = [b[1] - a[1], 0, -(b[0] - a[0])];
          quad(bucket('plain'), [a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], hh, b[1]], [a[0], hh, a[1]], wc, n); quad(bucket('plain'), [a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], hh, b[1]], [a[0], hh, a[1]], wc, [-n[0], 0, -n[2]]); }
      }
    }

    // ── 3) รถไฟฟ้า (BTS/MRT/ARL/รถไฟ) — ยกระดับ = ทางวิ่งคอนกรีต + เสา ──
    for (const el of els) {
      const t = el.tags || {}; if (!/^(light_rail|subway|monorail|rail)$/.test(t.railway || '') || el.type !== 'way' || !el.geometry || t.tunnel) continue;
      if (t.railway === 'subway' && !(t.bridge || +t.layer > 0)) continue;           // MRT ใต้ดิน
      const line = el.geometry.map(p => P(p.lat, p.lon));
      if (!line.some((q, i) => i < line.length - 1 && segDist(r0[0], r0[1], q, line[i + 1])[0] < hideR + 40)) continue;
      const elev = (t.bridge || +t.layer > 0 || t.railway !== 'rail') ? 12 : 0;
      const G = bucket('plain'), deck = C('#cfcbc3'), deckS = C('#a9a59e'), rail = C('#5a5550'), ballast = C('#8e877c');
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.2) continue;
        const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        if (elev) {
          ribbon(G, a, b, 4.6, elev, deck);
          for (const s of [-1, 1]) {                                                    // ขอบ/ผนังข้างทางวิ่ง
            const A = [a[0] + nx * 2.3 * s, a[1] + nz * 2.3 * s], Bp = [b[0] + nx * 2.3 * s, b[1] + nz * 2.3 * s];
            quad(G, [A[0], elev - 1.4, A[1]], [Bp[0], elev - 1.4, Bp[1]], [Bp[0], elev + 0.6, Bp[1]], [A[0], elev + 0.6, A[1]], deckS, [nx * s, 0, nz * s]);
          }
          for (let d = 0; d < L; d += 30) pillars.push({ x: a[0] + (b[0] - a[0]) * d / L, z: a[1] + (b[1] - a[1]) * d / L, h: elev - 1.4, r: 0.9 });
        } else ribbon(G, a, b, 3.2, 0.08, ballast);
        for (const s of [-0.75, 0.75]) ribbon(G, [a[0] + nx * s, a[1] + nz * s], [b[0] + nx * s, b[1] + nz * s], 0.12, elev + 0.12, rail);
      }
    }

    // ── 4) เจดีย์ ──
    for (const el of els) {
      const t = el.tags || {}; if (t.man_made !== 'stupa') continue;
      let x, z, r = 4;
      if (el.type === 'node') [x, z] = P(el.lat, el.lon);
      else if (el.geometry) { const rr = el.geometry.map(p => P(p.lat, p.lon)); x = rr.reduce((s, q) => s + q[0], 0) / rr.length; z = rr.reduce((s, q) => s + q[1], 0) / rr.length; r = Math.max(2.5, Math.sqrt(Math.abs(areaXZ(rr)) / Math.PI)); }
      if (x == null || Math.hypot(x - r0[0], z - r0[1]) > hideR) continue;
      stupas.push({ x, z, r, h: num(t.height) || r * 4.5, gold: /gold/i.test(t['building:colour'] || t.colour || '') || hash(el.id) < 0.4 });
    }

    // ── 5) ต้นไม้ ──
    const RG = new Map(), RGS = 20;                                                    // ดัชนีตารางของช่วงถนน (ค้นหาเร็ว)
    roadSegs.forEach((sg, i) => { const pad = sg[3] / 2 + 4, x0 = Math.floor((Math.min(sg[0][0], sg[1][0]) - pad) / RGS), x1 = Math.floor((Math.max(sg[0][0], sg[1][0]) + pad) / RGS), z0 = Math.floor((Math.min(sg[0][1], sg[1][1]) - pad) / RGS), z1 = Math.floor((Math.max(sg[0][1], sg[1][1]) + pad) / RGS);
      if ((x1 - x0) * (z1 - z0) > 400) return; for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx + ',' + gz; if (!RG.has(k)) RG.set(k, []); RG.get(k).push(i); } });
    const nearRoad = (x, z, extra) => { const l = RG.get(Math.floor(x / RGS) + ',' + Math.floor(z / RGS)); if (!l) return false; for (const i of l) { const sg = roadSegs[i]; if (segDist(x, z, sg[0], sg[1])[0] < sg[3] / 2 + extra) return true; } return false; };
    const grid = new Map(), GS = 25;
    bInfo.forEach((b, i) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of b.outer) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } b.bb = [x0, z0, x1, z1]; for (let gx = Math.floor(x0 / GS); gx <= Math.floor(x1 / GS); gx++) for (let gz = Math.floor(z0 / GS); gz <= Math.floor(z1 / GS); gz++) { const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
    const inBuilding = (x, z, pad) => { const l = grid.get(Math.floor(x / GS) + ',' + Math.floor(z / GS)); if (!l) return false; for (const i of l) { const b = bInfo[i]; if (x < b.bb[0] - pad || x > b.bb[2] + pad || z < b.bb[1] - pad || z > b.bb[3] + pad) continue; if (pip(x, z, b.outer)) return true; if (pad > 0 && (pip(x + pad, z, b.outer) || pip(x - pad, z, b.outer) || pip(x, z + pad, b.outer) || pip(x, z - pad, b.outer))) return true; } return false; };
    const addTree = (x, z, s, seed) => {
      if (trees.length >= 7500 || Math.hypot(x - r0[0], z - r0[1]) > hideR + 20 || Math.hypot(x - opts.cabXZ[0], z - opts.cabXZ[1]) < Math.max(15, (opts.hideR || 0) + 4)) return;
      if (inBuilding(x, z, 1.2)) return;
      if (nearRoad(x, z, 1.0)) return;                                                 // ไม่ให้ต้นไม้ขึ้นบนผิวถนน (ทุกเส้น ตามความกว้างจริง)
      { const fx = Math.sin(opts.cabYaw || 0), fz = Math.cos(opts.cabYaw || 0), dx = x - opts.cabXZ[0], dz = z - opts.cabXZ[1], fwd = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
        if (fwd > 0 && fwd < 45 && lat < 7 + fwd * 0.25) return; }                 // ไม่ให้ต้นไม้บังมุมกล้องหน้าตู้
      trees.push({ x, z, s: s * (0.8 + hash(seed) * 0.5), c: hash(seed + 7), type: hash(seed + 3) < 0.12 ? 'palm' : hash(seed + 5) < 0.35 ? 'round' : 'tall' });
    };
    for (const el of els) {
      const t = el.tags || {};
      if (el.type === 'node' && t.natural === 'tree') { const [x, z] = P(el.lat, el.lon); addTree(x, z, 1.1, el.id); continue; }
      if (el.type !== 'way' || !el.geometry) continue;
      const line = el.geometry.map(p => P(p.lat, p.lon));
      if (t.natural === 'tree_row') { for (let i = 0; i < line.length - 1; i++) { const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d < L; d += 7) addTree(a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L, 1, el.id + i * 31 + d); } continue; }
      const hw = ROADW[t.highway];
      if (hw) {
        if (/^(yes|viaduct)$/.test(t.bridge || '') || t.tunnel) continue;
        for (let i = 0; i < line.length - 1; i++) {
          const a = line[i], b = line[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue;
          const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
          for (let d = 6; d < L - 3; d += 15) for (const s of [-1, 1]) {
            const sd = el.id * 7 + i * 131 + Math.round(d) * 3 + (s > 0 ? 1 : 0);
            if (hash(sd) < 0.4) continue;
            const off = hw / 2 + 1.6 + hash(sd + 1) * 0.8;
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
        for (let x = x0; x < x1; x += sp) for (let z = z0; z < z1; z += sp) { const jx = x + (rr() - 0.5) * sp * 0.9, jz = z + (rr() - 0.5) * sp * 0.9; if (pip(jx, jz, line)) addTree(jx, jz, sp <= 7 ? 1.15 : 1.25, Math.round(jx * 13 + jz * 7)); }
      }
    }

    // ── 5b) รถบนถนน (ของประกอบฉาก) ──
    const nz2 = (x, z) => (Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.7) + Math.sin((x + z) * 0.011 + 2.1) * 0.7 + Math.sin(x * 0.053 - z * 0.041) * 0.35) / 2.05;
    const cars = [];
    {
      // (ไม่สุ่มต้นไม้/พุ่มไม้บนที่ว่าง — ที่ว่างในข้อมูลอาจเป็นอาคารที่ OSM ยังไม่มี ใช้ข้อมูลจริงเท่านั้น)
      // รถบนถนน (ถนนตั้งแต่ 9 ม.) — จอด/วิ่งตามช่องจราจร ไม่ใส่ใกล้ตู้
      const CC = ['#f4f4f2', '#f4f4f2', '#c9ccd0', '#1f2328', '#8f969c', '#b8302a', '#2c4a7a', '#d9d4c8', '#e8e6e0', '#3b5d3a'];
      for (const sg of roadSegs) {
        const w = sg[3]; if (w < 9 || cars.length > 700) continue;
        const a = sg[0], b = sg[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 8) continue;
        const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, nx = -uz, nzz = ux, lanes = Math.max(2, Math.floor(w / 3.3)), lw = w / lanes;
        for (let ln = 0; ln < lanes; ln++) {
          const off = -w / 2 + lw * (ln + 0.5), dir = off < 0 ? 1 : -1;
          for (let d = 4 + hash(Math.round(a[0] * 3 + ln)) * 20; d < L - 3; d += 14 + hash(Math.round(d * 7 + a[1] + ln)) * 34) {
            const x = a[0] + ux * d + nx * off, z = a[1] + uz * d + nzz * off;
            if (Math.hypot(x - opts.cabXZ[0], z - opts.cabXZ[1]) < 26 || Math.hypot(x - r0[0], z - r0[1]) > hideR - 5) continue;
            const hs = hash(Math.round(x * 31 + z * 17));
            cars.push([x, z, Math.atan2(ux * dir, uz * dir), CC[Math.floor(hs * CC.length)], hs < 0.12 ? 'truck' : hs < 0.2 ? 'van' : 'car']);
          }
        }
      }
    }

    // ── 6) รวมเป็น mesh ──
    const grp = new T.Group(), wallMats = [], nightMats = [];
    const geo = G => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(G.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(G.n, 3)); g.setAttribute('color', new T.Float32BufferAttribute(G.c, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(G.uv, 2)); return g; };
    for (const [k, G] of Object.entries(B)) {
      if (!G.p.length) continue;
      let mat;
      if (k.startsWith('w_')) { const tx = facade(T, k.slice(2)); mat = new T.MeshLambertMaterial({ vertexColors: true, map: tx.day, emissive: 0xffffff, emissiveMap: tx.night, emissiveIntensity: 0 }); wallMats.push(mat); }
      else if (k === 'tile') mat = new T.MeshLambertMaterial({ vertexColors: true, map: tileTexture(T), side: T.DoubleSide });
      else if (k === 'road') { mat = new T.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); }
      else mat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
      grp.add(new T.Mesh(geo(G), mat));
    }
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3(), cc = new T.Color(), Y = new T.Vector3(0, 1, 0);
    // ต้นไม้ 3 แบบ: ทรงพุ่มสูง / ทรงกลม / ปาล์ม
    if (trees.length) {
      const trunkG = new T.CylinderGeometry(0.14, 0.24, 1, 6); trunkG.translate(0, 0.5, 0);
      const crownA = new T.IcosahedronGeometry(1, 0), crownB = new T.DodecahedronGeometry(1, 0), palmG = new T.ConeGeometry(1, 0.6, 8, 1, true); palmG.translate(0, -0.3, 0);
      const trunk = new T.InstancedMesh(trunkG, new T.MeshLambertMaterial({ color: '#7a5a3c' }), trees.length);
      const sets = { tall: [], round: [], palm: [] }; trees.forEach(tr => sets[tr.type].push(tr));
      const greens = ['#4f8f3a', '#5e9c3f', '#3f7d35', '#6aa84a', '#4a8a46', '#71a63f', '#3d7543', '#5a8f2f'];
      trees.forEach((tr, i) => { const th = (tr.type === 'palm' ? 6.5 : 2.3) * tr.s; ps.set(tr.x, 0, tr.z); sc.set(tr.type === 'palm' ? 0.8 : 1, th, tr.type === 'palm' ? 0.8 : 1); q.identity(); m4.compose(ps, q, sc); trunk.setMatrixAt(i, m4); });
      grp.add(trunk);
      for (const [type, list] of Object.entries(sets)) {
        if (!list.length) continue;
        const parts = type === 'round' ? 1 : type === 'tall' ? 2 : 1;
        const im = new T.InstancedMesh(type === 'palm' ? palmG : type === 'round' ? crownB : crownA, new T.MeshLambertMaterial({ color: '#ffffff', side: type === 'palm' ? T.DoubleSide : T.FrontSide }), list.length * parts);
        let n = 0;
        for (const tr of list) {
          const th = (type === 'palm' ? 6.5 : 2.3) * tr.s, cr = (type === 'palm' ? 2.6 : 2.5) * tr.s;
          for (let p = 0; p < parts; p++) {
            const yy = type === 'palm' ? th + 0.2 : th + cr * (p === 0 ? 0.6 : 1.25), rs = p === 0 ? 1 : 0.68;
            ps.set(tr.x + (p ? (tr.c - 0.5) * 0.8 : 0), yy, tr.z + (p ? (0.5 - tr.c) * 0.8 : 0)); sc.set(cr * rs, cr * rs * (type === 'palm' ? 1 : 0.92), cr * rs);
            q.setFromAxisAngle(Y, tr.c * 6.28 + p); m4.compose(ps, q, sc); im.setMatrixAt(n, m4);
            im.setColorAt(n, cc.set(greens[Math.floor((tr.c + p * 0.37) * greens.length) % greens.length])); n++;
          }
        }
        if (im.instanceColor) im.instanceColor.needsUpdate = true; grp.add(im);
      }
    }
    // ถังน้ำ / คอมแอร์บนดาดฟ้า
    if (tanks.length) {
      const tg = new T.CylinderGeometry(0.55, 0.55, 1.3, 12); tg.translate(0, 1.15, 0);
      const ag = new T.BoxGeometry(0.9, 0.7, 0.4); ag.translate(0, 0.85, 0);
      const tk = tanks.filter(k => k.kind !== 'ac'), ac = tanks.filter(k => k.kind === 'ac');
      if (tk.length) { const im = new T.InstancedMesh(tg, new T.MeshLambertMaterial({ color: '#ffffff' }), tk.length); tk.forEach((k, i) => { const s = k.big ? 1.6 : 1; m4.makeScale(s, s, s).setPosition(k.x, k.y, k.z); im.setMatrixAt(i, m4); im.setColorAt(i, cc.set(k.kind === 'blue' ? '#2f6fb3' : '#c9ced3')); }); if (im.instanceColor) im.instanceColor.needsUpdate = true; grp.add(im); }
      if (ac.length) { const im = new T.InstancedMesh(ag, new T.MeshLambertMaterial({ color: '#e6e6e2' }), ac.length); ac.forEach((k, i) => { m4.makeRotationY(hash(i) * 3).setPosition(k.x, k.y, k.z); im.setMatrixAt(i, m4); }); grp.add(im); }
    }
    // เสา (สะพาน/รางรถไฟฟ้า/โรงจอดรถ)
    if (pillars.length) { const pg = new T.CylinderGeometry(1, 1, 1, 10); pg.translate(0, 0.5, 0); const im = new T.InstancedMesh(pg, new T.MeshLambertMaterial({ color: '#c4c0b8' }), pillars.length); pillars.forEach((p, i) => { m4.makeScale(p.r, p.h, p.r).setPosition(p.x, 0, p.z); im.setMatrixAt(i, m4); }); grp.add(im); }
    // เสากลมสีขาว (ระเบียงอาคาร) + บัวหัวเสา/ฐานเสา
    if (wcols.length) {
      const cg = new T.CylinderGeometry(1, 1.08, 1, 14); cg.translate(0, 0.5, 0); const capG = new T.BoxGeometry(1, 1, 1); capG.translate(0, 0.5, 0);
      const wm = new T.MeshLambertMaterial({ color: '#f6f4ee' }), im = new T.InstancedMesh(cg, wm, wcols.length), ic = new T.InstancedMesh(capG, wm, wcols.length * 2);
      wcols.forEach((p, i) => { m4.makeScale(p.r, p.h, p.r).setPosition(p.x, p.y || 0, p.z); im.setMatrixAt(i, m4);
        m4.makeScale(p.r * 2.6, 0.22, p.r * 2.6).setPosition(p.x, (p.y || 0) + p.h - 0.22, p.z); ic.setMatrixAt(i * 2, m4);
        m4.makeScale(p.r * 2.6, 0.25, p.r * 2.6).setPosition(p.x, p.y || 0, p.z); ic.setMatrixAt(i * 2 + 1, m4); });
      grp.add(im); grp.add(ic);
    }
    // เสาไฟถนน (กลางคืนหัวโคมสว่าง)
    {                                                                                // เอาเสาไฟที่บังแนวกล้องหน้าตู้ออก
      const fx = Math.sin(opts.cabYaw || 0), fz = Math.cos(opts.cabYaw || 0);
      for (let i = lamps.length - 1; i >= 0; i--) { const dx = lamps[i].x - opts.cabXZ[0], dz = lamps[i].z - opts.cabXZ[1], fwd = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx); if (fwd > 0 && fwd < 45 && lat < 3.5 + fwd * 0.2) lamps.splice(i, 1); }
    }
    // พื้น: ระบายสีเขียวเฉพาะพื้นที่ที่ OSM ระบุว่าเป็นสนาม/สวน/กอล์ฟ/ป่า + ลานปูนรอบอาคาร · ส่วนอื่นโปร่งใส (เห็นแผนที่ฐาน รวมแม่น้ำ/คลองจริง)
    {
      const S = 2048, R = hideR, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
      const X = x => (x - r0[0] + R) / (2 * R) * S, Zc = z => (z - r0[1] + R) / (2 * R) * S, k = S / (2 * R);
      const path = ring => { g.beginPath(); ring.forEach((q, i) => g[i ? 'lineTo' : 'moveTo'](X(q[0]), Zc(q[1]))); g.closePath(); };
      const rr = rng(((r0[0] * 1000) | 0) ^ 0x5bd1e995);
      for (const el of els) {
        const t = el.tags || {};
        const kind = /^(golf_course)$/.test(t.leisure || '') ? 'golf' : (/^(forest)$/.test(t.landuse || '') || /^(wood)$/.test(t.natural || '')) ? 'wood'
          : (/^(park|garden|pitch|recreation_ground)$/.test(t.leisure || '') || /^(grass|recreation_ground|cemetery|meadow|village_green|orchard)$/.test(t.landuse || '') || /^(scrub|grassland)$/.test(t.natural || '')) ? 'grass' : null;
        if (!kind) continue;
        const rings = toRings(el, P); if (!rings) continue;
        for (const o of rings.outer) {
          if (o.length < 3) continue;
          g.save(); path(o); g.clip();
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of o) { x0 = Math.min(x0, X(q[0])); x1 = Math.max(x1, X(q[0])); y0 = Math.min(y0, Zc(q[1])); y1 = Math.max(y1, Zc(q[1])); }
          g.fillStyle = kind === 'golf' ? '#9cc07a' : kind === 'wood' ? '#7fa463' : '#a9c98a'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
          const n = Math.min(400, ((x1 - x0) * (y1 - y0)) / 900 | 0);
          for (let i = 0; i < n; i++) { const x = x0 + rr() * (x1 - x0), y = y0 + rr() * (y1 - y0), r = (3 + rr() * 9) * k * 2, c = rr() < 0.5 ? 'rgba(120,160,90,' : 'rgba(190,210,150,';
            const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c + '0.35)'); gr.addColorStop(1, c + '0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
          if (kind === 'golf') { g.strokeStyle = 'rgba(80,120,60,.25)'; g.lineWidth = 3 * k; for (let yy = y0; yy < y1; yy += 12 * k) { g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke(); } }
          g.restore(); g.strokeStyle = 'rgba(110,140,85,.55)'; g.lineWidth = 1.2 * k; path(o); g.stroke();
        }
      }
      g.lineJoin = 'round'; g.fillStyle = g.strokeStyle = 'rgba(226,222,212,0.92)'; g.lineWidth = 6 * k;     // ลานปูนรอบอาคาร ~3 ม.
      for (const b of bInfo) { path(b.outer); g.fill(); g.stroke(); }
      const tx = new T.CanvasTexture(cv); tx.anisotropy = 8;
      const gg = new T.CircleGeometry(R, 72); gg.rotateX(-Math.PI / 2);
      const gm = new T.Mesh(gg, new T.MeshLambertMaterial({ map: tx, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })); gm.position.set(r0[0], 0.015, r0[1]); gm.renderOrder = -1; grp.add(gm);
    }
    // รถบนถนน (ตัวถัง + ห้องโดยสาร/ตู้ทึบ + กระจก)
    if (cars.length) {
      const bodyG = new T.BoxGeometry(1.8, 0.75, 4.4); bodyG.translate(0, 0.62, 0);
      const cabG = new T.BoxGeometry(1.62, 0.62, 2.3); cabG.translate(0, 1.3, -0.2);
      const boxG = new T.BoxGeometry(2.0, 2.0, 3.6); boxG.translate(0, 1.6, -0.7);
      const winG = new T.BoxGeometry(1.64, 0.4, 2.1); winG.translate(0, 1.3, -0.2);
      const mk = (geo, list, colFn) => { if (!list.length) return; const im = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ color: '#ffffff' }), list.length);
        list.forEach((c, i) => { m4.makeRotationY(c[2]).setPosition(c[0], 0.2, c[1]); im.setMatrixAt(i, m4); im.setColorAt(i, cc.set(colFn(c))); }); if (im.instanceColor) im.instanceColor.needsUpdate = true; grp.add(im); };
      mk(bodyG, cars, c => c[3]); mk(cabG, cars.filter(c => c[4] !== 'truck'), c => c[3]); mk(winG, cars.filter(c => c[4] !== 'truck'), () => '#34424c');
      mk(boxG, cars.filter(c => c[4] === 'truck'), () => '#eeeeea');
    }
    // เส้นขอบอาคาร (ขอบดาดฟ้า + มุมตึก) ให้ภาพคมขึ้น
    {
      const pv = [];
      for (const b of bInfo) {
        const o = b.outer, n = o.length; if (n < 3 || b.h < 2.5) continue;
        for (let i = 0; i < n; i++) {
          const a = o[i], c = o[(i + 1) % n], pr = o[(i - 1 + n) % n];
          pv.push(a[0], b.h + 0.02, a[1], c[0], b.h + 0.02, c[1]);
          const d1 = Math.atan2(a[1] - pr[1], a[0] - pr[0]), d2 = Math.atan2(c[1] - a[1], c[0] - a[0]); let dd = Math.abs(d2 - d1); if (dd > Math.PI) dd = 2 * Math.PI - dd;
          if (dd > 0.35) pv.push(a[0], 0.05, a[1], a[0], b.h, a[1]);
        }
      }
      if (pv.length) { const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(pv, 3)); grp.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: '#5f5b55', transparent: true, opacity: 0.45 }))); }
    }
    if (lamps.length) {
      const pg = new T.CylinderGeometry(0.06, 0.09, 8, 6); pg.translate(0, 4, 0);
      const hg = new T.BoxGeometry(0.5, 0.12, 1.4); hg.translate(0, 7.9, 0.6);
      const pm = new T.InstancedMesh(pg, new T.MeshLambertMaterial({ color: '#80868c' }), lamps.length);
      const hm = new T.MeshLambertMaterial({ color: '#f2f2ee', emissive: '#ffd27a', emissiveIntensity: 0 });
      const hh = new T.InstancedMesh(hg, hm, lamps.length); nightMats.push([hm, 1.3]);
      lamps.forEach((l, i) => { m4.makeRotationY(l.yaw).setPosition(l.x, 0, l.z); pm.setMatrixAt(i, m4); hh.setMatrixAt(i, m4); });
      grp.add(pm, hh);
    }
    // เจดีย์ + ช่อฟ้า
    const goldM = new T.MeshLambertMaterial({ color: '#e2b13c' });
    for (const s of stupas) {
      if (s.chofa) { const c = new T.Mesh(new T.ConeGeometry(0.22, 1.7, 6), goldM); c.position.set(s.p[0], s.p[1] + 0.75, s.p[2]); c.rotation.set(s.dir * 0.4 * s.uz, 0, -s.dir * 0.4 * s.ux); grp.add(c); continue; }
      const pts = [], H = s.h, Rr = s.r;
      [[0, 0], [1.05, 0], [1.05, 0.06], [0.9, 0.1], [0.92, 0.2], [0.95, 0.34], [0.82, 0.5], [0.46, 0.58], [0.34, 0.64], [0.36, 0.67], [0.24, 0.72], [0.14, 0.86], [0.04, 0.97], [0.01, 1]].forEach(([r, y]) => pts.push(new T.Vector2(r * Rr, y * H)));
      const m = new T.Mesh(new T.LatheGeometry(pts, 24), new T.MeshLambertMaterial({ color: s.gold ? '#e0b142' : '#f4f1ea' })); m.position.set(s.x, 0, s.z); grp.add(m);
      if (!s.gold) { const sp = new T.Mesh(new T.ConeGeometry(Rr * 0.16, H * 0.3, 12), goldM); sp.position.set(s.x, H * 0.85, s.z); grp.add(sp); }
    }
    if (fences.length) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
      g.clearRect(0, 0, 64, 64); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 6); g.fillRect(0, 50, 64, 5); for (let x = 2; x < 64; x += 16) g.fillRect(x, 0, 6, 64);
      const tx = new T.CanvasTexture(c); tx.wrapS = tx.wrapT = T.RepeatWrapping;
      const G = { p: [], n: [], c: [], uv: [] }, wc = C('#f1f1ee');
      for (const [a, b] of fences) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = L / 0.8; push(G, [a[0], 0.3, a[1]], [b[0], 2.2, b[1]], [b[0], 0.3, b[1]], wc, [0, 0, u, 1, u, 0]); push(G, [a[0], 0.3, a[1]], [a[0], 2.2, a[1]], [b[0], 2.2, b[1]], wc, [0, 0, 0, 1, u, 1]); }
      grp.add(new T.Mesh(geo(G), new T.MeshLambertMaterial({ vertexColors: true, map: tx, alphaTest: 0.5, side: T.DoubleSide })));
    }
    for (const sg of signs) {
      const kind = sg.b.kind, w = Math.min(sg.L * 0.85, Math.max(6, sg.nm.length * 0.95), 34), hgt = Math.max(1.1, Math.min(3.2, w / 6.5));
      const col = kind === 'hosp' ? ['#0f8a6c', '#ffffff'] : kind === 'temple' ? ['#f2c14e', '#8e1f12'] : kind === 'school' ? ['#16407a', '#ffffff'] : ['#ffffff', '#1f4f8f'];
      const m = new T.Mesh(new T.PlaneGeometry(w, hgt), new T.MeshBasicMaterial({ map: signTexture(T, sg.nm, null, col[0], col[1]) }));
      const y = sg.b.h > 7 ? sg.b.h - hgt / 2 - 0.7 : sg.b.h + hgt / 2 + 0.3;
      m.position.set(sg.mx + sg.nx * 0.18, y, sg.mz + sg.nz * 0.18); m.rotation.y = Math.atan2(sg.nx, sg.nz); grp.add(m);
    }
    return { grp, wallMats, nightMats, nBuild: bInfo.length, nTree: trees.length, cabXZ: opts.cabXZ, cabYaw: opts.cabYaw || 0 };
  }

  // ── custom layer: วาด three.js ร่วมกับแผนที่ (depth เดียวกับอาคาร) ────────
  function cabinetLayer(st) {
    const T = window.THREE, ml = window.maplibregl;
    const merc = ml.MercatorCoordinate.fromLngLat([st.lon, st.lat], 0);
    const mpu = merc.meterInMercatorCoordinateUnits();
    const color = frcHex(st.frc);
    let renderer, scene, camera, cab, cabRoot, propsRoot, beam, beamMat, ring, ringMat, city = null, night = false, lights = {};
    return {
      id: 'frc3d-cabinet', type: 'custom', renderingMode: '3d',
      onAdd(map, gl) {
        camera = new T.Camera(); scene = new T.Scene();
        lights.hemi = new T.HemisphereLight(0xffffff, 0x6b6b60, 0.78); scene.add(lights.hemi);
        lights.sun = new T.DirectionalLight(0xfff4e0, 0.62); lights.sun.position.set(-40, 70, 25); scene.add(lights.sun);
        cabRoot = new T.Group(); scene.add(cabRoot);
        cab = buildCabinet(T, color, { canopy: st.canopy, pipeSide: st.pipeSide }); cabRoot.add(cab.grp);
        propsRoot = new T.Group(); scene.add(propsRoot);
        if (st.props) { const pr = buildProps(T, st.props, st.propYaw != null ? st.propYaw : st.yaw); propsRoot.add(pr.grp); cab.grp.position.y = pr.raise; }
        cabRoot.rotation.y = st.yaw != null ? st.yaw * Math.PI / 180 : 0; cab.grp.rotation.y = 0;
        propsRoot.rotation.y = st.propYaw != null ? st.propYaw * Math.PI / 180 : cabRoot.rotation.y;     // ฉากประกอบวางตามกรอบของตัวเอง (หมุนตู้ได้โดยฉากไม่หมุนตาม)
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
      setCity(c) { if (city) scene.remove(city.grp); city = c; if (c) { scene.add(c.grp); propsRoot.position.set(c.cabXZ[0], 0, c.cabXZ[1]); const sh = st.cabShift || [0, 0]; cabRoot.position.set(c.cabXZ[0] + sh[0], 0, c.cabXZ[1] - sh[1]); /* cabShift = เลื่อนตู้ [ตอ., เหนือ] ม. โดยฉากไม่เลื่อนตาม */ cabRoot.rotation.y = c.cabYaw; propsRoot.rotation.y = st.propYaw != null ? st.propYaw * Math.PI / 180 : c.cabYaw; this.setNight(night); } this.map && this.map.triggerRepaint(); },
      setNight(on) {
        if (!lights.hemi) return;
        if (city) { city.wallMats.forEach(m => { m.emissiveIntensity = on ? 0.85 : 0; }); city.nightMats.forEach(([m, v]) => { m.emissiveIntensity = on ? v : 0; }); }
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
    st = cabFix(st);
    close(); injectCss();
    const wrap = document.createElement('div'); wrap.id = 'frc3d-wrap';
    const tsTxt = st.ts ? new Date(st.ts).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
    wrap.innerHTML =
      '<div id="frc3d-map"></div>' +
      '<div id="frc3d-bar">' +
        '<div class="frc3d-title">🏙 ' + esc(st.name || 'สถานี') + '<small>มุมมอง 3 มิติ · ' + st.lat.toFixed(5) + ', ' + st.lon.toFixed(5) + (st.sample ? ' · ค่าตัวอย่าง' : '') + '</small></div>' +
        '<div class="frc3d-sp"></div>' +
        '<button class="frc3d-btn" data-a="replay">▶ บินใหม่</button>' +
        '<button class="frc3d-btn" data-a="orbit">🔄 หมุนรอบ</button>' +
        '<button class="frc3d-btn" data-a="night">🌙 กลางคืน</button>' +
        '<button class="frc3d-btn" data-a="near">🔍 ดูตู้ใกล้ๆ</button>' +
        '<button class="frc3d-btn frc3d-close" data-a="close">✕ ปิด</button>' +
      '</div>' +
      '<div id="frc3d-msg">กำลังโหลดแผนที่ 3 มิติ…</div><div id="frc3d-chip"></div>' +
      '<div id="frc3d-attr">© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</div>';
    document.body.appendChild(wrap);
    const msg = wrap.querySelector('#frc3d-msg');
    const state = { wrap, map: null, orbit: true, spin: false, night: false, saved: {}, layer: null, st };
    _cur = state;
    state.t0 = performance.now();
    state.osmP = getOSM(st); state.osmP.catch(() => {});      // เริ่มโหลดข้อมูลเมืองพร้อมกับแผนที่
    wrap.addEventListener('click', e => { const a = e.target.closest('[data-a]'); if (a) act(a.dataset.a, a); });
    document.addEventListener('keydown', onKey);

    try { await ensureLibs(); } catch (e) { msg.textContent = '⚠ ' + e.message; return; }
    if (_cur !== state) return;
    const ml = window.maplibregl;
    const map = new ml.Map({
      container: wrap.querySelector('#frc3d-map'), style: CFG.styleUrl,
      center: [st.lon, st.lat], zoom: INTRO_Z, pitch: 48, bearing: -30, maxPitch: 80, maxZoom: 22,
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
      neutralLanduse(map);
      intro(state);                                   // ภาพมุมสูงหมุนช้าๆ ระหว่างโหลดเมือง แล้วบินเข้าหน้าตู้
      loadCity(state, mk);
    });
    ['mousedown', 'touchstart', 'wheel'].forEach(ev => map.getCanvas().addEventListener(ev, () => { state.userTook = true; state.phase = 'user'; setOrbit(state, false); }, { passive: true }));
  }

  // ── โหลดข้อมูลอาคาร OSM แล้วสร้างเมืองมีสี ─────────────────────────────────
  async function loadCity(state, mk) {
    const st = state.st, map = state.map, chip = state.wrap.querySelector('#frc3d-chip');
    const say = (t, ms) => { chip.textContent = t; chip.style.display = 'block'; if (ms) setTimeout(() => { if (chip.textContent === t) chip.style.display = 'none'; }, ms); };
    say('🏗 กำลังโหลดข้อมูลเมือง 3 มิติ…');
    const kx = 111320 * Math.cos(st.lat * Math.PI / 180), kz = 110540;
    const P = (la, lo) => [(lo - st.lon) * kx, -(la - st.lat) * kz];
    try {
      const got = await state.osmP, osm = got.osm;
      if (_cur !== state) return;
      const tLoad = performance.now() - state.t0;
      const t0 = performance.now();
      const c = buildCity(osm, P, { stationXZ: [0, 0], radius: R_CITY, cabXZ: [0, 0], yawFix: st.yaw != null ? st.yaw * Math.PI / 180 : null, hideR: st.hideR || 0, fixed: !!st.fixed, bld: st.bld || null, noBarrierR: st.noBarrierR || 0, roadW: st.roadW, palace: st.palace });
      state.cabYaw = c.cabYaw;
      if (_cur !== state) return;
      state.layer.setCity(c); hideBase(map, st, R_CITY);
      const sh = st.cabShift || [0, 0], cx = c.cabXZ[0] + sh[0], cz = c.cabXZ[1] - sh[1]; state.cabLL = [st.lon + cx / kx, st.lat - cz / kz]; if (cx || cz) mk.setLngLat(state.cabLL);
      state.cityReady = true; flyIn(state);
      console.log('[FRC3D] เมือง:', c.nBuild, 'อาคาร,', c.nTree, 'ต้นไม้ · ข้อมูล', got.src, Math.round(tLoad), 'ms · สร้าง', Math.round(performance.now() - t0), 'ms');
      const srcTxt = got.src === 'prebuilt' ? 'ข้อมูล OSM เตรียมไว้' + (got.updated ? ' (อัปเดต ' + new Date(got.updated).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) + ')' : '') : 'ข้อมูล OSM สด';
      say('🏙 อาคาร ' + c.nBuild.toLocaleString() + ' หลัง · ต้นไม้ ' + c.nTree.toLocaleString() + ' ต้น · ' + srcTxt + ' · ' + (tLoad / 1000).toFixed(1) + ' วิ', 6000);
    } catch (e) {
      console.warn('[FRC3D] OSM', e);
      say('⚠ ดึงข้อมูลอาคารไม่สำเร็จ (Overpass ไม่ว่าง) — แสดงแบบกล่องไปก่อน ลองกด ✕ แล้วเปิดใหม่', 9000);
      state.cityReady = true; flyIn(state);
    }
  }
  // สีพื้นที่ รพ./โรงเรียน (ชมพู/เหลือง) ในแผนที่ฐาน → สีลานปูน ให้เข้ากับฉาก 3 มิติ
  function neutralLanduse(map) {
    const cv = document.createElement('canvas').getContext('2d');
    for (const L of map.getStyle().layers) if (L.type === 'background') { try { map.setPaintProperty(L.id, 'background-color', '#e7e3da'); } catch (e) {} }   // พื้นเมืองโทนปูน/ดิน แทนสีขาว
    for (const L of map.getStyle().layers) {
      if (L.type !== 'fill' || /water|park|grass|wood|forest|green|ocean/i.test(L.id)) continue;
      let v; try { v = map.getPaintProperty(L.id, 'fill-color'); } catch (e) { continue; }
      if (typeof v !== 'string') continue;
      cv.fillStyle = '#000'; cv.fillStyle = v; const hx = cv.fillStyle; if (!/^#[0-9a-f]{6}$/i.test(hx)) continue;
      const r = parseInt(hx.slice(1, 3), 16), g = parseInt(hx.slice(3, 5), 16), b = parseInt(hx.slice(5, 7), 16);
      if ((r - g > 12 && b - g > 4) || /hospital|school|university|college|education/i.test(L.id)) { try { map.setPaintProperty(L.id, 'fill-color', '#ece7de'); } catch (e) {} }
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

  // ── การเคลื่อนกล้อง: ภาพมุมสูง → บินโค้งเข้าหาหน้าตู้ → แกว่งช้าๆ ──────────────
  const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function frontBearing(state) { const y = state.cabYaw != null ? state.cabYaw : (state.st.yaw || 0) * Math.PI / 180; return Math.atan2(-Math.sin(y), Math.cos(y)) * 180 / Math.PI + (state.st.camOff || 0); }   // camOff = เลื่อนมุมกล้องออกจากแนวหน้าตู้ (กันฉากบัง)
  function intro(state) {
    const m = state.map; if (!m) return;
    state.phase = 'intro';
    const spin = () => { if (_cur !== state || state.phase !== 'intro') return; m.rotateTo(m.getBearing() + 18, { duration: 6000, easing: t => t }); m.once('moveend', spin); };
    spin();
    setTimeout(() => { if (_cur === state && state.phase === 'intro' && !state.cityReady) { state.cityReady = true; flyIn(state); } }, 25000);   // กันรอนานเกิน
  }
  function flyIn(state) {
    const m = state.map; if (!m || _cur !== state || state.userTook) return;
    state.phase = 'fly'; m.stop();
    const c = state.cabLL || [state.st.lon, state.st.lat], fb = frontBearing(state);
    m.flyTo({ center: c, zoom: 18.2, pitch: 60, bearing: fb - 75, duration: 6000, curve: 1.25, essential: true, easing: easeIO });
    m.once('moveend', () => {
      if (_cur !== state || state.phase !== 'fly') return;
      m.easeTo({ center: c, zoom: NEAR_Z, pitch: 73, bearing: fb, duration: 4500, easing: easeIO });
      m.once('moveend', () => { if (_cur !== state || state.phase !== 'fly') return; state.phase = 'idle'; if (state.orbit) sway(state, fb, 1); });
    });
  }
  function sway(state, fb, dir) {                    // แกว่งซ้าย-ขวาเล็กน้อยหน้าตู้ (ไม่หมุนรอบ)
    const m = state.map; if (!m || _cur !== state || state.phase !== 'idle' || !state.orbit || state.spin) return;
    m.rotateTo(fb + dir * 14, { duration: 7000, easing: easeIO }); m.once('moveend', () => sway(state, fb, -dir));
  }
  function fly(state) {                              // ▶ บินใหม่: กลับไปมุมสูงแล้วบินเข้าอีกรอบ
    const m = state.map; if (!m) return;
    state.userTook = false; state.spin = false; m.stop();
    const c = state.cabLL || [state.st.lon, state.st.lat];
    m.jumpTo({ center: c, zoom: INTRO_Z, pitch: 48, bearing: frontBearing(state) - 160 });
    state.phase = 'intro'; setTimeout(() => flyIn(state), 900);
  }
  function orbitStep(state) {
    const m = state.map; if (!m || !state.orbit || !state.spin || _cur !== state) return;
    m.rotateTo(m.getBearing() + 12, { duration: 4000, easing: t => t });
    m.once('moveend', () => orbitStep(state));
  }
  function setOrbit(state, on) {                    // 🔄 หมุนรอบตู้ 360°
    state.orbit = on; state.spin = on;
    const b = state.wrap.querySelector('[data-a="orbit"]'); if (b) b.classList.toggle('on', on);
    if (on) { state.phase = 'idle'; orbitStep(state); } else if (state.map) state.map.stop();
  }
  function act(a, btn) {
    const s = _cur; if (!s) return;
    if (a === 'close') return close();
    if (!s.map) return;
    if (a === 'replay') { s.orbit = true; s.spin = false; s.wrap.querySelector('[data-a="orbit"]').classList.remove('on'); fly(s); }
    else if (a === 'orbit') setOrbit(s, !s.orbit);
    else if (a === 'near') { s.spin = false; s.phase = 'idle'; s.map.stop(); s.map.easeTo({ center: s.cabLL || [s.st.lon, s.st.lat], zoom: NEAR_Z, pitch: 73, bearing: frontBearing(s), duration: 3000, easing: easeIO }); }
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
