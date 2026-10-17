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
    const pp = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 1.9, 10), pipeMat); pp.position.set(-1.3, 0.05, 0.1); pp.rotation.z = Math.PI / 2; grp.add(pp);
    box(0.30, 0.12, 0.22, M('#4f565e'), -2.35, 0.06, 0.1);
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
  function buildProps(T, props) {
    const grp = new T.Group(); let raise = 0;
    const L = (c, o) => new T.MeshLambertMaterial(Object.assign({ color: c }, o || {}));
    const add = (geo, mat, x, y, z, ry) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; grp.add(m); return m; };
    const B = (w, h, d) => new T.BoxGeometry(w, h, d);
    for (const p of props || []) {
      const ry = (p.rot || 0) * Math.PI / 180;
      if (p.type === 'platform') {                 // พื้นยกสูง (สนามหญ้า/สวน) + กำแพงกันดิน + ขอบฟุตบาทแดงขาว
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
        const hb = new T.Mesh(B(p.hallW || 8, 5, p.hallD || 7), glass); hb.position.set(p.x, h + 2.5, p.z); grp.add(hb);
        const hf = new T.Mesh(B((p.hallW || 8) + 0.4, 0.6, (p.hallD || 7) + 0.4), conc); hf.position.set(p.x, h - 0.1, p.z); grp.add(hf);
        const hr = new T.Mesh(B((p.hallW || 8) + 0.6, 0.35, (p.hallD || 7) + 0.6), roof); hr.position.set(p.x, h + 5.1, p.z); grp.add(hr);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c2 = new T.Mesh(B(0.7, h, 0.7), conc); c2.position.set(p.x + sx * ((p.hallW || 8) / 2 - 0.4), h / 2, p.z + sz * ((p.hallD || 7) / 2 - 0.4)); grp.add(c2); }
        // สะพานเชื่อม (ทิศ bridgeRot ยาว len)
        const br = p.bridgeRot != null ? p.bridgeRot : 180, bl = p.len || 30, bw = p.bridgeW || 4;
        piece(p.x, p.z, br, bl, g2 => {
          const d0 = (p.hallD || 7) / 2;
          const deck = new T.Mesh(B(bw, 1.0, bl), conc); deck.position.set(0, h, d0 + bl / 2); g2.add(deck);
          for (const sx of [-1, 1]) { const w2 = new T.Mesh(B(0.25, 1.3, bl), concD); w2.position.set(sx * bw / 2, h + 1.1, d0 + bl / 2); g2.add(w2); }
          const rf = new T.Mesh(B(bw + 0.6, 0.2, bl), roof); rf.position.set(0, h + 3.3, d0 + bl / 2); g2.add(rf);
          for (const sx of [-1, 1]) for (let zz = d0 + 2; zz < d0 + bl; zz += 3) { const pst = new T.Mesh(B(0.12, 2.0, 0.12), concD); pst.position.set(sx * (bw / 2 + 0.2), h + 2.3, zz); g2.add(pst); }
          for (let zz = d0 + 8; zz < d0 + bl; zz += 11) { const c2 = new T.Mesh(B(0.9, h, 0.9), conc); c2.position.set(0, h / 2, zz); g2.add(c2); }
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
        add(B(Math.abs(p.x2 - p.x1), p.h || 1.0, p.d || 1.0), L('#3f7f35'), (p.x1 + p.x2) / 2, (p.y || 0) + (p.h || 1) / 2, p.z);
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
  const CAB_FIX = [
    { match: /ศิริราช/, lat: 13.759400, lon: 100.484400, yaw: 180,                   // ฝั่งใต้ ถ.รถไฟ หน้าอาคารเก่า (ตู้หันขึ้นเหนือออกถนน) · บันไดเลื่อนอยู่ทางตะวันออก (ซ้ายมือคนมอง)
      bld: { 1549325372: { style: 'shed', h: 5.5 } },
      props: [
        { type: 'skywalk', x: -17, z: 1.2, h: 7.5, escRot: 90, run: 11, escW: 4.4, bridgeRot: 180, len: 26, hallW: 8, hallD: 7 },
        { type: 'bus', x: 14, z: 10, rot: 90, color: '#f4f4f2' },
      ] },
    { match: /ศิครินทร์/, lat: 13.655194, lon: 100.645806, yaw: 180,                 // ฝั่งใต้ ถ.ลาซาล บนสวนยกสูงหน้า รพ. (ตู้หันขึ้นเหนือออกถนน) · ทางรถออกอยู่ทางตะวันออก (ซ้ายมือ)
      bld: { 34584267: { style: 'hospital', h: 13, noSign: true } },
      props: [
        { type: 'platform', x1: -3.6, x2: 15, z1: -15, z2: 0.7, h: 0.8, cab: true, wall: '#d7b9a6', curbOff: 3.2 },
        { type: 'hedge', x1: 11, x2: 15, z: -0.2, h: 1.1, d: 1.2, y: 0.8 },
        { type: 'shrine', x: -2.4, z: -4.5, s: 1.05, y: 0.8 }, { type: 'shrine', x: 0.6, z: -8.5, s: 0.8, y: 0.8 },
        { type: 'glass', x: -16.8, z: -22.6, w: 10.4, h: 4.2, canopy: 5 },
        { type: 'sign', x: -15, z: -22.75, y: 8.4, w: 12, h: 1.4, text: 'โรงพยาบาลศิครินทร์', fg: '#11896b', bg: '#f6f6f3' },
        { type: 'sign', x: -10, z: -22.75, y: 6.1, w: 3.2, h: 0.9, text: 'SIKARIN HOSPITAL', fg: '#ffffff', bg: '#1f9a8a' },
        { type: 'tower', x: -14, z: -62, w: 30, d: 18, h: 44, facade: 'apt', color: '#f4f2ee' },
        { type: 'sign', x: -5.6, z: 1.6, y: 1.3, w: 1.3, h: 1.0, text: 'OUT', sub: '← ทางออก', fg: '#ffffff', bg: '#165c3d', post: true },
      ] },
    { match: /จิตรลดา/, lat: 13.772638, lon: 100.520912, yaw: 153,                    // ริมรั้ว (ตะแกรง) มุมเหนืออาคารโถงโล่ง ถ.ราชวิถี (ตู้หันออกถนน)
      bld: { 1537116220: { style: 'pavilion', h: 7 } }, noBarrierR: 18,
      props: [
        { type: 'fence', x1: 0.8, z1: 0, x2: 16, z2: 0, h: 2.3 },
        { type: 'tree', x: -13, z: 3.2, s: 1.4 }, { type: 'tree', x: 14, z: 3.2, s: 1.5 }, { type: 'tree', x: 27, z: 3, s: 1.4 }, { type: 'tree', x: -26, z: 3, s: 1.3 },
      ] },
  ];
  function cabFix(st) { const f = CAB_FIX.find(x => x.match.test(st.name || '')); return f ? Object.assign({}, st, { lat: f.lat, lon: f.lon, yaw: f.yaw, canopy: f.canopy, props: f.props, hideR: f.hide || 0, bld: f.bld, noBarrierR: f.noBarrierR || 0, fixed: true }) : st; }

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
            const gr = g.createLinearGradient(x, y, x + S, y + S); gr.addColorStop(0, q < 0.5 ? '#7fa4bf' : '#6d93b0'); gr.addColorStop(1, '#4d6f8a');
            g.fillStyle = gr; g.fillRect(x, y, S, S);
            g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(x, y + S * 0.7); g.lineTo(x + S * 0.6, y); g.lineTo(x + S * 0.8, y); g.lineTo(x, y + S); g.fill();
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
    const bInfo = [], trees = [], tanks = [], stupas = [], lamps = [], pillars = [];
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
      for (let outer of rr.outer) {
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
        if (ov && ov.style === 'hospital') { kind = 'hosp'; wallC = C(ov.color || '#f6f6f3'); roofC = C('#cfcbc4'); shape = 'flat'; }
        bInfo.push({ outer, inners, h, kind, area, name: ov && ov.noSign ? null : t.name, noSign: ov && ov.noSign });
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
          if (ov.style === 'shed' && ob) pitched(ob, 'gabled', h, roofC, wallC, 0.6, 0.18, 2);
          continue;
        }
        // ผนัง
        const ftype = kind === 'office' ? 'glass' : kind === 'hosp' ? 'hosp' : kind === 'ind' ? 'ind' : kind === 'temple' ? 'temple' : kind === 'house' ? 'house' : kind === 'apt' ? 'apt' : 'win';
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
      const t = el.tags || {}; const w = ROADW[t.highway]; if (!w || el.type !== 'way' || !el.geometry) continue;
      const line = el.geometry.map(p => P(p.lat, p.lon));
      if (!line.some((q, i) => i < line.length - 1 && segDist(r0[0], r0[1], q, line[i + 1])[0] < hideR + 40)) continue;
      for (let i = 0; i < line.length - 1; i++) { roadSegs.push([line[i], line[i + 1], w >= 16 ? 3 : w >= 12 ? 2.5 : w >= 9 ? 2 : 1]); const d = segDist(opts.cabXZ[0], opts.cabXZ[1], line[i], line[i + 1]); if (!bestRoad || d[0] < bestRoad[0]) bestRoad = d; }
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
    const grid = new Map(), GS = 25;
    bInfo.forEach((b, i) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of b.outer) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); } b.bb = [x0, z0, x1, z1]; for (let gx = Math.floor(x0 / GS); gx <= Math.floor(x1 / GS); gx++) for (let gz = Math.floor(z0 / GS); gz <= Math.floor(z1 / GS); gz++) { const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
    const inBuilding = (x, z, pad) => { const l = grid.get(Math.floor(x / GS) + ',' + Math.floor(z / GS)); if (!l) return false; for (const i of l) { const b = bInfo[i]; if (x < b.bb[0] - pad || x > b.bb[2] + pad || z < b.bb[1] - pad || z > b.bb[3] + pad) continue; if (pip(x, z, b.outer)) return true; if (pad > 0 && (pip(x + pad, z, b.outer) || pip(x - pad, z, b.outer) || pip(x, z + pad, b.outer) || pip(x, z - pad, b.outer))) return true; } return false; };
    const addTree = (x, z, s, seed) => {
      if (trees.length >= 4500 || Math.hypot(x - r0[0], z - r0[1]) > hideR + 20 || Math.hypot(x - opts.cabXZ[0], z - opts.cabXZ[1]) < Math.max(15, (opts.hideR || 0) + 4)) return;
      if (inBuilding(x, z, 1.2)) return;
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
    // เสาไฟถนน (กลางคืนหัวโคมสว่าง)
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
        cab = buildCabinet(T, color, { canopy: st.canopy }); cabRoot.add(cab.grp);
        propsRoot = new T.Group(); scene.add(propsRoot);
        if (st.props) { const pr = buildProps(T, st.props); propsRoot.add(pr.grp); cab.grp.position.y = pr.raise; }
        propsRoot.rotation.y = st.yaw != null ? st.yaw * Math.PI / 180 : 0; cab.grp.rotation.y = 0; cabRoot.rotation.y = propsRoot.rotation.y;
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
      setCity(c) { if (city) scene.remove(city.grp); city = c; if (c) { scene.add(c.grp); cabRoot.position.set(c.cabXZ[0], 0, c.cabXZ[1]); propsRoot.position.copy(cabRoot.position); cabRoot.rotation.y = propsRoot.rotation.y = c.cabYaw; this.setNight(night); } this.map && this.map.triggerRepaint(); },
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
      const c = buildCity(osm, P, { stationXZ: [0, 0], radius: R_CITY, cabXZ: [0, 0], yawFix: st.yaw != null ? st.yaw * Math.PI / 180 : null, hideR: st.hideR || 0, fixed: !!st.fixed, bld: st.bld || null, noBarrierR: st.noBarrierR || 0 });
      state.cabYaw = c.cabYaw;
      if (_cur !== state) return;
      state.layer.setCity(c); hideBase(map, st, R_CITY);
      const [cx, cz] = c.cabXZ; state.cabLL = [st.lon + cx / kx, st.lat - cz / kz]; if (cx || cz) mk.setLngLat(state.cabLL);
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
  function frontBearing(state) { const y = state.cabYaw != null ? state.cabYaw : (state.st.yaw || 0) * Math.PI / 180; return Math.atan2(-Math.sin(y), Math.cos(y)) * 180 / Math.PI; }
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
