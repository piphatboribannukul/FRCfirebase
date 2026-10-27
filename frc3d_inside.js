/* ═══════════════════════════════════════════════════════════════════════════
   frc3d_inside.js — ภายในตู้วัดคุณภาพน้ำ (ต่อจาก frc3d.js)            [27 ต.ค. 2569]
   ─ ฉากสตูดิโอซ้อนบนภาพเมือง: ตู้ตัวเดียวกับ buildCabinet (66×165 ซม. + ภาพหน้าตู้ frc3d_cabinet.jpg)
   ─ โหมด 'auto' : ประตูเปิด → อุปกรณ์แยกออกเป็น 2 คอลัมน์ + ป้าย → ประกอบกลับ → จบ (onDone('end'))
   ─ โหมด 'tour' : นำชมทีละชิ้น 8 จุด (◀ ▶ / ลูกศร · ✕ หรือ Esc = ปิด → onDone('closed'))
   ─ ใช้ three.js r128 ตัวเดียวกับ frc3d.js (window.THREE) · ความขุ่นเฉลี่ยวันนี้จากบอท /wq-stats.json
   ใช้:  FRC3D_INSIDE.play({ st, mode, onDone, onDetail }) · FRC3D_INSIDE.stop() · FRC3D_INSIDE.isOn()
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const CFG = Object.assign({
    cabImg: 'frc3d_cabinet.jpg',
    wqApi: 'https://frc-line-bot-production.up.railway.app/wq-stats.json',
    autoSec: 16,
  }, window.FRC3D_INSIDE_CONFIG || {});
  // พิกัดสถานี (รหัสเดียวกับบอท) — ใช้จับคู่สถานีกับค่าความขุ่นจาก /wq-stats.json
  const WQ_XY = {"SP01":[13.87858,100.55298],"SW01":[13.73465,100.53785],"SM02":[13.71571,100.53942],"SW11":[13.78785,100.55427],"SP02":[13.87827,100.5544],"SW02":[13.76696,100.59763],"S008":[13.76093,100.63109],"S009":[13.80942,100.61572],"SW03":[13.71519,100.58102],"S010":[13.72008,100.58243],"SM03":[13.708,100.59941],"SW04":[13.66247,100.59082],"S011":[13.65518,100.64576],"S012":[13.56031,100.59005],"S013":[13.60461,100.55585],"SM04":[13.60456,100.59842],"S014":[13.62092,100.56164],"SP03":[13.87785,100.55593],"SW05":[13.82623,100.74055],"S015":[13.83018,100.84997],"SM05":[13.81499,100.74118],"S016":[13.80155,100.70511],"S017":[13.82835,100.72002],"SW06":[13.72475,100.74101],"S019":[13.71337,100.76257],"S018":[13.75802,100.79126],"S020":[13.6129,100.75651],"SW07":[13.599,100.71397],"S021":[13.5651,100.79149],"S022":[13.50292,100.83608],"S023":[13.54154,100.66235],"SP04":[13.87788,100.55349],"SM01":[13.87789,100.51404],"S003":[13.93261,100.58014],"S002":[13.93156,100.5322],"SP05":[13.87761,100.55496],"S005":[13.92434,100.68404],"S004":[13.90911,100.61698],"SP11":[13.87858,100.55298],"SW08":[13.67592,100.46761],"S026":[13.57489,100.43854],"S025":[13.64837,100.49335],"SW09":[13.72472,100.40649],"S027":[13.7067,100.35524],"S028":[13.64582,100.3852],"SW10":[13.73142,100.47622],"S033":[13.71011,100.48684],"S024":[13.71151,100.42657],"SP12":[13.80743,100.40977],"S029":[13.80616,100.47871],"S032":[13.78016,100.34428],"SM06":[13.91192,100.42452],"S030":[13.83991,100.34827],"S001":[13.92631,100.48093],"S031":[13.98311,100.32341],"SP06":[13.75901,100.47099],"S007":[13.7594,100.48442],"SP07":[13.77375,100.5303],"SP08":[13.77417,100.53128],"SP09":[13.77582,100.52958],"S006":[13.77254,100.52097],"SP10":[13.77449,100.52874]};

  // มือถือ/เครื่องแรงน้อย: ลดความละเอียด + เงา และคืนหน่วยความจำ GPU ทุกครั้งที่ปิด (กันแท็บเด้ง)
  const LITE = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || Math.min(screen.width, screen.height) < 820 || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const isPortrait = () => innerWidth < 760 || innerWidth < innerHeight * .9;
  let G = null;           // ฉาก (สร้างครั้งแรกที่เล่น แล้วใช้ซ้ำ)
  let P = null;           // การเล่นปัจจุบัน

  /* ── CSS + DOM ── */
  function injectCss() {
    if (document.getElementById('fi-css')) return;
    const c = document.createElement('style'); c.id = 'fi-css';
    c.textContent = `
#frc3d-inside{position:fixed;inset:0;z-index:1000003;opacity:0;transition:opacity .8s ease;font-family:Sarabun,"Noto Sans Thai",Tahoma,sans-serif;color:#1b2433;
  background:radial-gradient(90% 80% at 50% 60%,#fffdf9 0%,#f7f4ee 55%,#e9e3d8 100%)}
#frc3d-inside.on{opacity:1}
#frc3d-inside canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#frc3d-inside svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#frc3d-inside .fi-labels{position:absolute;inset:0;pointer-events:none}
#frc3d-inside .chip{position:absolute;top:0;opacity:0;will-change:transform,opacity;display:flex;flex-direction:column;min-width:190px;padding:9px 14px 10px;border-radius:12px;
  background:rgba(255,255,255,.92);box-shadow:0 6px 22px rgba(18,63,134,.12);border-top:3px solid var(--c)}
#frc3d-inside .chip.L{left:max(28px,3vw)}#frc3d-inside .chip.R{right:max(28px,3vw);text-align:right}
#frc3d-inside .chip b{font-weight:700;font-size:17px;line-height:1.25}
#frc3d-inside .chip small{font-size:13px;color:#5f6b7d}
#frc3d-inside .chip i{font-style:normal;font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:600;font-size:16px;color:var(--c);margin-top:2px}
#frc3d-inside .chip i:empty{display:none}
#frc3d-inside .fi-head{position:absolute;left:max(28px,3vw);top:max(22px,3vh);display:flex;flex-direction:column;gap:6px;max-width:60vw}
#frc3d-inside .fi-head .k{font-size:13px;letter-spacing:.03em;color:#5f6b7d}
#frc3d-inside .fi-head h1{margin:0;font-size:28px;font-weight:700;color:#123f86;line-height:1.15}
#frc3d-inside .vals{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
#frc3d-inside .v{background:rgba(255,255,255,.78);border:1px solid rgba(18,63,134,.16);border-radius:10px;padding:5px 11px;font-size:13px;color:#5f6b7d}
#frc3d-inside .v b{font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:600;font-size:16px;color:#123f86;margin:0 3px}
#frc3d-inside .fi-bar{position:absolute;left:50%;bottom:max(26px,3vh);transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:8px 10px 8px 18px;border-radius:999px;
  background:rgba(18,38,70,.88);color:#fff;font-size:14px;box-shadow:0 10px 30px rgba(18,38,70,.25);white-space:nowrap}
#frc3d-inside .fi-bar button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:7px 16px;cursor:pointer;background:#fff;color:#123f86}
#frc3d-inside .fi-bar button.g{background:rgba(255,255,255,.14);color:#fff;padding:7px 12px}
#frc3d-inside .fi-bar button:focus-visible{outline:2px solid #e8b730;outline-offset:2px}
#frc3d-inside .prog{width:120px;height:4px;border-radius:4px;background:rgba(255,255,255,.2);overflow:hidden}#frc3d-inside .prog b{display:block;height:100%;width:0;background:#7fd3ff}
#frc3d-inside .dots{display:flex;gap:5px}#frc3d-inside .dots i{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.3)}#frc3d-inside .dots i.on{background:#fff}
#frc3d-inside .fi-step{position:absolute;left:max(28px,3vw);bottom:max(90px,11vh);width:min(380px,40vw);padding:18px 20px;border-radius:16px;background:rgba(255,255,255,.94);
  box-shadow:0 12px 34px rgba(18,63,134,.14);border-left:5px solid var(--c,#1b5fb4)}
#frc3d-inside .fi-step .n{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px;color:#5f6b7d}
#frc3d-inside .fi-step h2{margin:4px 0 6px;font-size:24px;color:#123f86;line-height:1.2}
#frc3d-inside .fi-step p{margin:0;font-size:15px;line-height:1.55;color:#334155}
#frc3d-inside .fi-step .val{margin-top:10px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-weight:600;font-size:22px;color:var(--c,#1b5fb4)}
#frc3d-inside .fi-step .val small{font-family:Sarabun,sans-serif;font-weight:500;font-size:13px;color:#5f6b7d;margin-left:6px}
#frc3d-inside [hidden]{display:none!important}
#frc3d-inside.pt .fi-head{left:16px;right:16px;top:12px;max-width:none}#frc3d-inside.pt .fi-head h1{font-size:20px}#frc3d-inside.pt .fi-head .k{font-size:11px}
#frc3d-inside.pt .v{padding:3px 8px;font-size:11.5px}#frc3d-inside.pt .v b{font-size:14px}
#frc3d-inside.pt .fi-step{left:12px;right:12px;width:auto;bottom:calc(76px + env(safe-area-inset-bottom,0px));padding:14px 16px}#frc3d-inside.pt .fi-step h2{font-size:19px}#frc3d-inside.pt .fi-step p{font-size:13.5px}
#frc3d-inside.pt .fi-bar{bottom:calc(16px + env(safe-area-inset-bottom,0px));max-width:calc(100vw - 24px)}#frc3d-inside.pt .fi-auto>span:first-child{display:none}#frc3d-inside.pt .chip,#frc3d-inside.pt svg{display:none}
@media (max-width:720px){#frc3d-inside .chip{min-width:0;padding:6px 9px}#frc3d-inside .chip b{font-size:13px}#frc3d-inside .chip small{display:none}
  #frc3d-inside .fi-head h1{font-size:20px}#frc3d-inside .fi-step{width:auto;right:16px;bottom:84px}}
@media (prefers-reduced-motion:reduce){#frc3d-inside{transition:none}}`;
    document.head.appendChild(c);
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ═══ ฉาก 3 มิติ ═══ */
  function build() {
    const T = window.THREE; if (!T) throw new Error('ยังไม่ได้โหลด three.js');
    const root = document.createElement('div'); root.id = 'frc3d-inside';
    root.innerHTML = '<canvas></canvas><svg></svg><div class="fi-labels"></div>' +
      '<div class="fi-head"><span class="k">สถานีตรวจวัดคุณภาพน้ำประปาระยะไกล · ภายในตู้</span><h1></h1><div class="vals"></div></div>' +
      '<div class="fi-step" hidden><div class="n"></div><h2></h2><p></p><div class="val"></div></div>' +
      '<div class="fi-bar fi-auto"><span>ภายในตู้วัด · จบแล้วไปสถานีถัดไป</span><span class="prog"><b></b></span><button data-f="in">🔍 ดูภายในตู้</button></div>' +
      '<div class="fi-bar fi-tour" hidden><button class="g" data-f="prev" aria-label="ก่อนหน้า">◀</button><span class="dots"></span><button class="g" data-f="next" aria-label="ถัดไป">▶</button><button data-f="close">✕ ปิด</button></div>';
    const canvas = root.querySelector('canvas'), svg = root.querySelector('svg'), labEl = root.querySelector('.fi-labels');

    const R = new T.WebGLRenderer({ canvas, antialias: !LITE, alpha: true, powerPreference: LITE ? 'low-power' : 'default' });
    R.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1.5 : 2));
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (P) finish('error'); G = null; }); R.setClearColor(0x000000, 0);
    R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene(), cam = new T.PerspectiveCamera(30, 1, .03, 60);
    let env;
    { const rs = new T.Scene(), room = new T.Mesh(new T.BoxGeometry(10, 6, 10), new T.MeshBasicMaterial({ color: 0x5e5b57, side: T.BackSide })); room.position.y = 2; rs.add(room);
      const pan = (w, h, x, y, z, ry, rx, k) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k * .97) })); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); rs.add(m); };
      pan(6, 2, 0, 4.9, 0, 0, Math.PI / 2, 1.8); pan(3, 2.5, -4.9, 2.2, 1, Math.PI / 2, 0, 1.3); pan(3, 2.5, 4.9, 2.4, -1, -Math.PI / 2, 0, .9); pan(4, 2, 0, 2.5, 4.9, Math.PI, 0, .8);
      env = new T.PMREMGenerator(R).fromScene(rs, .04).texture; }
    const hemi = new T.HemisphereLight(0xfff6ea, 0xb9c6d4, .65); scene.add(hemi);
    const key = new T.DirectionalLight(0xfff1de, 1.9); key.position.set(2.5, 5, 4); key.castShadow = true; key.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
    Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3.5, bottom: -1, near: .5, far: 14 }); key.shadow.bias = -.0004; key.shadow.radius = 4; scene.add(key);
    const rim = new T.DirectionalLight(0xdfe9ff, .55); rim.position.set(-3, 3, -4); scene.add(rim);
    const floor = new T.Mesh(new T.PlaneGeometry(30, 30), new T.ShadowMaterial({ opacity: .14 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    const M = (c, o) => { const m = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: .5, metalness: .15 }, o || {})); if (m.metalness >= .4) { m.envMap = env; m.envMapIntensity = .9; } return m; };
    const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; return t; };
    const steelT = tex(256, 512, (g) => { const st = g.createLinearGradient(0, 0, 256, 0); st.addColorStop(0, '#b4b9be'); st.addColorStop(.5, '#e6e8ea'); st.addColorStop(1, '#bcc1c6'); g.fillStyle = st; g.fillRect(0, 0, 256, 512);
      g.globalAlpha = .08; for (let x = 0; x < 256; x += 2) { g.fillStyle = (x / 2) % 2 ? '#fff' : '#6f777e'; g.fillRect(x, 0, 1, 512); } g.globalAlpha = 1; });
    const solarT = tex(512, 384, (g) => { g.fillStyle = '#d9dde1'; g.fillRect(0, 0, 512, 384);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { const x = 12 + i * 82, y = 12 + j * 90, gr = g.createLinearGradient(x, y, x + 78, y + 86); gr.addColorStop(0, '#2f4f8c'); gr.addColorStop(1, '#16274d'); g.fillStyle = gr; g.fillRect(x, y, 78, 86); } });
    const lcdC = document.createElement('canvas'); lcdC.width = 640; lcdC.height = 480;
    const lcdT = new T.CanvasTexture(lcdC); lcdT.encoding = T.sRGBEncoding; lcdT.anisotropy = 8;
    function drawLcd(V) {
      const x = lcdC.getContext('2d'), f = (v, d) => v == null || !isFinite(v) ? '--' : Number(v).toFixed(d);
      x.fillStyle = '#a6c7d9'; x.fillRect(0, 0, 640, 480); x.fillStyle = '#d3e6f0'; x.fillRect(0, 0, 640, 60); x.fillStyle = '#22313f';
      x.textAlign = 'left'; x.font = '600 30px "IBM Plex Mono",monospace'; x.fillText('MEASUREMENT', 22, 42);
      [['TURB.', f(V.tub, 2), 'NTU', 20, 80], ['FRC.', f(V.frc, 2), 'mg/L', 330, 80], ['PRES.', f(V.pres, 3), 'MPa', 480, 80], ['pH', f(V.ph, 2), '', 20, 240], ['COND.', f(V.ec, 0), 'uS/cm', 175, 240], ['TEMP.', f(V.temp, 1), '°C', 330, 240]]
        .forEach(([k, v, u, cx, cy]) => { x.fillStyle = '#bcd7e6'; x.strokeStyle = '#5d7f93'; x.lineWidth = 3; x.fillRect(cx, cy, 140, 140); x.strokeRect(cx, cy, 140, 140);
          x.fillStyle = '#22313f'; x.font = '600 24px "IBM Plex Mono",monospace'; x.textAlign = 'left'; x.fillText(k, cx + 14, cy + 32);
          x.fillStyle = '#eef6ee'; x.fillRect(cx + 12, cy + 46, 116, 44); x.fillStyle = '#1a2a36'; x.font = '600 30px "IBM Plex Mono",monospace'; x.textAlign = 'right'; x.fillText(v, cx + 122, cy + 80);
          x.textAlign = 'left'; x.font = '500 20px "IBM Plex Mono",monospace'; x.fillStyle = '#22313f'; x.fillText(u, cx + 70, cy + 124); });
      x.fillStyle = '#5d7f93'; x.fillRect(0, 410, 640, 70); ['MAINTE.', 'CAL.', 'DATA'].forEach((s, i) => { x.fillStyle = '#bcd7e6'; x.fillRect(16 + i * 156, 420, 144, 50); x.fillStyle = '#22313f'; x.font = '600 24px "IBM Plex Mono",monospace'; x.fillText(s, 40 + i * 156, 454); });
      lcdT.needsUpdate = true;
    }

    const V3 = (x, y, z) => new T.Vector3(x, y, z);
    function mesh(geo, mat, x, y, z, parent) { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; }
    const B = (w, h, d) => new T.BoxGeometry(w, h, d), C = (a, b, h, s) => new T.CylinderGeometry(a, b, h, s || 24);

    /* ตู้ — ขนาด/รูปแบบเดียวกับ buildCabinet (66×45×165 ซม. บนแท่นคอนกรีต 22 ซม.) */
    const BW = .66, BD = .45, BH = 1.65, B0 = .22, Y1 = B0;
    const cab = new T.Group(); scene.add(cab);
    const steelM = new T.MeshStandardMaterial({ map: steelT, roughness: .35, metalness: .5, envMap: env, envMapIntensity: .9 }), steelD = M('#a9afb5', { metalness: .5, roughness: .35 });
    const innerM = M('#dfe3e6', { metalness: .45, roughness: .38 }), conc = M('#c9c5bd', { roughness: .95 });
    mesh(B(1.7, B0, 1.4), conc, 0, B0 / 2, -.15, cab); mesh(B(1.74, .03, 1.44), M('#bdb9b1', { roughness: .95 }), 0, B0 - .01, -.15, cab);
    mesh(B(BW, BH, .012), steelM, 0, Y1 + BH / 2, -BD / 2 + .006, cab);
    [-1, 1].forEach(s => { mesh(B(.012, BH, BD), steelM, s * (BW / 2 - .006), Y1 + BH / 2, 0, cab);
      const vm = M('#4a525b', { roughness: .8 }); for (let i = 0; i < 22; i++) [-.08, .08].forEach(z => mesh(B(.004, .012, .11), vm, s * (BW / 2 + .001), Y1 + .35 + i * .05, z, cab)); });
    mesh(B(BW + .03, .075, BD + .02), steelD, 0, Y1 + BH - .0375, 0, cab);
    mesh(B(BW - .01, .147, BD - .01), M('#55585c', { roughness: .7 }), 0, Y1 + .0735, .004, cab);
    mesh(B(BW - .03, BH - .24, .004), innerM, 0, Y1 + BH / 2 + .03, -BD / 2 + .014, cab);
    mesh(B(BW - .03, .012, BD - .05), innerM, 0, Y1 + 1.08, -.01, cab);
    [-1, 1].forEach(s => mesh(B(.02, BH - .1, .02), steelD, s * (BW / 2 - .02), Y1 + BH / 2, BD / 2 - .012, cab));
    const ledM = M('#2f8fc8', { emissive: '#2f8fc8', emissiveIntensity: .7 });
    mesh(new T.SphereGeometry(.025, 12, 8), ledM, BW / 2 - .06, Y1 + BH + .02, BD / 2 - .05, cab);
    mesh(C(.006, .006, .34, 8), M('#1f2327'), -.2, Y1 + BH + .17, -.12, cab); mesh(C(.016, .016, .04, 10), M('#1f2327'), -.2, Y1 + BH + .02, -.12, cab);
    { const pipeM = M('#2f86d6', { roughness: .45 }), ps = -1;
      mesh(C(.025, .025, .55, 10), pipeM, ps * (BW / 2 + .08), B0 + .27, .05, cab);
      const el = mesh(C(.025, .025, .1, 10), pipeM, ps * (BW / 2 + .03), B0 + .54, .05, cab); el.rotation.z = Math.PI / 2; }
    const canopy = new T.Group(); cab.add(canopy);
    { const blue = M('#1e6fd0', { roughness: .4, metalness: .25 }), blueD = M('#175bb0', { roughness: .45 });
      const PX = .66, PZf = .42, PZb = -.52, PH = 2.12;
      for (const x of [-PX, PX]) for (const z of [PZf, PZb]) mesh(B(.08, PH, .08), blue, x, B0 + PH / 2, z, canopy);
      for (const z of [PZf, PZb]) mesh(B(PX * 2 + .08, .1, .08), blue, 0, B0 + PH - .05, z, canopy);
      for (const x of [-PX, PX]) mesh(B(.08, .1, PZf - PZb + .08), blue, x, B0 + PH - .05, (PZf + PZb) / 2, canopy);
      const rg = new T.Group(); rg.position.set(0, B0 + PH + .06, -.05); rg.rotation.x = .1; canopy.add(rg);
      mesh(B(1.62, .08, .06), blueD, 0, 0, .66, rg); mesh(B(1.62, .08, .06), blueD, 0, 0, -.66, rg); mesh(B(.06, .08, 1.38), blueD, -.78, 0, 0, rg); mesh(B(.06, .08, 1.38), blueD, .78, 0, 0, rg);
      const tr = mesh(B(1.56, .02, 1.3), new T.MeshStandardMaterial({ color: '#cfe6f5', transparent: true, opacity: .45, roughness: .2 }), 0, .02, 0, rg); tr.castShadow = false;
      const sp = mesh(B(1.5, .04, 1.08), [steelD, steelD, new T.MeshStandardMaterial({ map: solarT, roughness: .3, metalness: .3 }), steelD, steelD, steelD], 0, .16, -.04, rg); sp.rotation.x = -.12;
      for (const x of [-.6, .6]) for (const z of [-.4, .35]) mesh(B(.03, .14, .03), steelD, x, .08, z, rg);
      mesh(B(.98, .05, .18), M('#2b4f86'), 0, B0 + 2.08, .32, canopy); mesh(B(.9, .035, .12), M('#ffffff', { emissive: '#fff4dc', emissiveIntensity: .6 }), 0, B0 + 2.04, .32, canopy); }
    // ประตู (ภาพหน้าตู้จริง) บานพับขวา
    const door = new T.Group(); door.position.set(BW / 2, Y1, BD / 2); cab.add(door);
    const frontMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .5, metalness: .1, map: steelT });
    { const ld = new T.TextureLoader(); ld.setCrossOrigin('anonymous');
      ld.load(CFG.cabImg, tx => { tx.encoding = T.sRGBEncoding; tx.anisotropy = 16; frontMat.map = tx; frontMat.needsUpdate = true; }, undefined, () => {});
      mesh(B(BW, BH, .014), steelD, -BW / 2, BH / 2, -.003, door);
      const f = new T.Mesh(new T.PlaneGeometry(BW, BH), frontMat); f.position.set(-BW / 2, BH / 2, .0045); door.add(f);
      const bk = new T.Mesh(new T.PlaneGeometry(BW - .04, BH - .04), innerM); bk.position.set(-BW / 2, BH / 2, -.011); bk.rotation.y = Math.PI; door.add(bk);
      const u0 = .059, u1 = .379, v0 = .345, v1 = .461, hw = (u1 - u0) * BW, hh = (v1 - v0) * BH, hg = new T.PlaneGeometry(hw, hh), uv = hg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? 1 - v0 : 1 - v1);
      const hx = -BW + (u0 + u1) / 2 * BW, hy = BH * (1 - (v0 + v1) / 2);
      mesh(B(hw, hh, .035), M('#b4b7ba', { metalness: .3, roughness: .45 }), hx, hy, .021, door);
      const hf = new T.Mesh(hg, frontMat); hf.position.set(hx, hy, .04); door.add(hf);
      mesh(B(.03, .13, .03), M('#2b2f33', { roughness: .4 }), hx - hw * .12, hy, .056, door);
      [.25, .8, 1.4].forEach(y => mesh(C(.012, .012, .08, 10), M('#d9dde1', { metalness: .9, roughness: .2 }), 0, y, 0, door)); }

    /* อุปกรณ์ภายใน */
    const parts = {};
    function part(id, home, fn) { const g = new T.Group(); g.position.copy(home); fn(g); cab.add(g); const mats = [];
      g.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!mats.includes(m)) mats.push(m); }); });
      return (parts[id] = { g, home: home.clone(), mats, e: 0 }); }
    part('logger', V3(0, Y1 + 1.36, -BD / 2 + .05), g => { const k = M('#25292e', { roughness: .55, metalness: .3 });
      mesh(B(.3, .17, .05), k, 0, 0, 0, g); for (let i = 0; i < 9; i++) mesh(B(.008, .16, .016), k, -.13 + i * .0325, 0, .033, g);
      [-.07, 0, .07].forEach((x, i) => mesh(C(.004, .004, .18, 6), M(['#1f2327', '#9aa4ae', '#9aa4ae'][i]), x, .17, 0, g));
      mesh(B(.03, .03, .02), M('#c9a227', { metalness: .6, roughness: .3 }), -.22, 0, .01, g); });
    // เกจวัดแรงดัน + วาล์วไฟฟ้า + ท่อ (ถอดไส้กรองออกแล้ว)
    part('water', V3(-.215, Y1 + .72, -.04), g => { const pvc = M('#8d969f', { roughness: .55 });
      mesh(C(.012, .012, .5, 12), pvc, 0, -.04, 0, g);
      const gz = mesh(C(.036, .036, .018, 28), M('#e8ecef', { metalness: .9, roughness: .15 }), 0, .06, .04, g); gz.rotation.x = Math.PI / 2;
      const face = new T.Mesh(new T.CircleGeometry(.03, 28), M('#ffffff')); face.position.set(0, .06, .05); g.add(face);
      const nd = mesh(B(.002, .024, .002), M('#111111'), .006, .066, .052, g); nd.rotation.z = -.7;
      mesh(B(.06, .05, .05), M('#1d7fd6', { roughness: .3 }), .04, -.2, .02, g); mesh(C(.017, .017, .03, 16), M('#1d7fd6', { roughness: .3 }), .04, -.16, .02, g);
      const hp = mesh(C(.012, .012, .1, 12), pvc, -.05, -.2, .02, g); hp.rotation.z = Math.PI / 2;
      const tp = mesh(C(.012, .012, .2, 12), pvc, .1, .2, 0, g); tp.rotation.z = Math.PI / 2; });
    const HW = .36, HH = .46, HD = .25;
    const hori = part('horiba', V3(.075, Y1 + .66, -.06), g => { const hw = M('#f3f4f2', { roughness: .45 }), hi = M('#d9dde0', { metalness: .45, roughness: .4 });
      mesh(B(HW, HH, .01), hi, 0, 0, -HD / 2 + .005, g); mesh(B(.01, HH, HD), hw, -HW / 2 + .005, 0, 0, g); mesh(B(.01, HH, HD), hw, HW / 2 - .005, 0, 0, g);
      mesh(B(HW, .01, HD), hw, 0, HH / 2 - .005, 0, g); mesh(B(HW, .01, HD), hw, 0, -HH / 2 + .005, 0, g); });
    const cover = new T.Group(); cover.position.set(-HW / 2, 0, HD / 2 + .008); hori.g.add(cover);
    { const cm = M('#f6f7f5', { roughness: .42 }); mesh(B(HW, HH, .014), cm, HW / 2, 0, 0, cover);
      const lm = new T.MeshStandardMaterial({ map: lcdT, emissive: 0xffffff, emissiveMap: lcdT, emissiveIntensity: .3, roughness: .3 });
      const lcd = new T.Mesh(new T.PlaneGeometry(.2, .15), lm); lcd.position.set(HW / 2, .07, .008); cover.add(lcd);
      mesh(B(.22, .03, .004), M('#cfd5da'), HW / 2, -.03, .008, cover); mesh(B(.07, .02, .004), M('#1b5fb4'), HW / 2 + .1, -.17, .008, cover);
      mesh(B(.016, .05, .014), M('#b9c0c6', { metalness: .6, roughness: .3 }), HW - .03, -.02, .012, cover);
      hori.mats.push(cm); }
    const probes = [];
    const cell = part('cell', V3(.145, Y1 + .64, .005), g => {
      const acr = new T.MeshStandardMaterial({ color: '#eef8ff', roughness: .03, transparent: true, opacity: .35, depthWrite: false }), wat = new T.MeshStandardMaterial({ color: '#6fc3e8', transparent: true, opacity: .55, roughness: .1, depthWrite: false });
      mesh(B(.11, .1, .055), acr, 0, 0, 0, g); mesh(B(.096, .075, .045), wat, 0, -.008, 0, g);
      mesh(B(.13, .008, .065), M('#c4cad0', { metalness: .6, roughness: .3 }), 0, -.054, 0, g);
      for (let i = 0; i < 7; i++) mesh(B(.01, .014, .004), M('#7a5a40', { roughness: .8 }), -.045 + i * .015, -.064, .03, g);
      const knob = mesh(C(.02, .02, .012, 28), M('#a7b0b8', { roughness: .5 }), .05, -.085, .03, g); knob.rotation.x = Math.PI / 2;
      const tb = new T.Group(); tb.position.set(-.115, .02, -.005); g.add(tb);
      mesh(B(.065, .07, .06), M('#22262c', { roughness: .5, metalness: .3 }), 0, 0, 0, tb); mesh(C(.017, .017, .022, 20), M('#c4cad0', { metalness: .7, roughness: .3 }), 0, .046, 0, tb);
      mesh(B(.07, .004, .045), M('#2e7d4f', { roughness: .6 }), 0, .06, 0, tb); mesh(C(.024, .024, .07, 24), M('#9aa4ae'), -.06, -.01, -.01, tb);
      parts.tub = { g: tb };
      const mk = (x, fn) => { const p = new T.Group(); p.position.set(x, 0, 0); fn(p); g.add(p); probes.push(p); };
      mk(-.032, p => { mesh(C(.011, .011, .05, 20), M('#9aa4ae'), 0, .07, 0, p); mesh(C(.016, .016, .02, 20), M('#1f2327'), 0, .105, 0, p); mesh(C(.021, .021, .012, 40), M('#bcc3ca'), 0, .05, 0, p);
        mesh(C(.0075, .0075, .045, 16), M('#6b4a36', { roughness: .85 }), 0, .012, 0, p); mesh(C(.006, .006, .02, 12), M('#9aa4ae'), 0, -.02, 0, p); });
      mk(0, p => { const dk = new T.MeshStandardMaterial({ color: '#3a3f46', roughness: .2, transparent: true, opacity: .9 });
        mesh(B(.02, .032, .02), dk, 0, .1, 0, p); mesh(C(.0075, .0075, .075, 16), dk, 0, .05, 0, p);
        mesh(new T.SphereGeometry(.008, 16, 12), new T.MeshStandardMaterial({ color: '#e6f6ff', roughness: .02, transparent: true, opacity: .6 }), 0, .01, 0, p); });
      mk(.032, p => { const bg = M('#e2c9a4', { roughness: .5 }); mesh(B(.016, .04, .016), M('#ffffff'), 0, .13, 0, p); mesh(C(.0075, .0075, .04, 16), bg, 0, .095, 0, p); mesh(C(.005, .005, .09, 16), bg, 0, .035, 0, p);
        [.06, .04, .02].forEach(y => mesh(C(.0055, .0055, .008, 16), M('#2a2a2a'), 0, y, 0, p)); });
    });
    cell.mats = []; cell.g.traverse(o => { if (o.isMesh && !cell.mats.includes(o.material)) cell.mats.push(o.material); });
    // ชิ้นที่ดูทีละอย่าง (หัววัด 3 แท่ง + ชุดวัดความขุ่น): ดึงขึ้น/ขยาย + ขอบเรืองแสง + ชิ้นอื่นจางลง + ไฟส่องเฉพาะจุด
    const FOC = [probes[0], probes[1], probes[2], parts.tub.g];
    const haloM = new T.MeshBasicMaterial({ color: 0x4aa3df, side: T.BackSide, transparent: true, opacity: .6, depthWrite: false });
    FOC.forEach(f => { const ms = []; f.traverse(o => { if (o.isMesh) ms.push(o); });
      f.userData.halos = ms.map(o => { const h = new T.Mesh(o.geometry, haloM); h.position.copy(o.position); h.rotation.copy(o.rotation); h.scale.copy(o.scale).multiplyScalar(1.28); h.visible = false; h.renderOrder = -1; o.parent.add(h); return h; });
      f.userData.mats = []; ms.forEach(o => { if (!f.userData.mats.includes(o.material)) f.userData.mats.push(o.material); }); f.userData.k = 0; });
    const dimMats = cell.mats.concat(parts.horiba.mats.filter(m => !cell.mats.includes(m)), parts.water.mats);   // ชิ้นที่จางลงตอนดูหัววัด (รวมกล่อง HORIBA)
    dimMats.forEach(m => { m.userData.o0 = m.transparent ? m.opacity : 1; m.transparent = true; });
    const focusLight = new T.PointLight(0xffffff, 0, 1.4, 2); scene.add(focusLight);
    // สีวัสดุ sRGB → linear (ครั้งเดียว)
    { const seen = new Set(); scene.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (seen.has(m) || m.isShadowMaterial) return; seen.add(m); if (m.color && !m.map) m.color.convertSRGBToLinear(); if (m.emissive && !m.emissiveMap) m.emissive.convertSRGBToLinear(); }); }); }

    const LAY = { logger: { p: V3(-1.02, 1.86, .32), s: 1.7 }, water: { p: V3(-1.02, 1.02, .32), s: 1.8 }, horiba: { p: V3(1.04, 1.78, .3), s: 1.3 }, cell: { p: V3(1.04, .92, .42), s: 3.4 } };
    const PROBE_LIFT = [.045, .065, .085];
    const fmt = (v, d, u) => v == null || !isFinite(v) ? '' : Number(v).toFixed(d) + (u ? ' ' + u : '');
    const LB = [
      { side: 'L', g: () => canopy, a: V3(-.7, B0 + 2.26, .3), c: '#1e6fd0', n: 'หลังคาเหล็ก + แผงโซลาร์', s: 'กันแดด กันฝน' },
      { side: 'L', g: () => parts.logger.g, a: V3(-.15, 0, .03), c: '#25292e', n: 'ตัวเก็บข้อมูล', s: 'ส่งค่าขึ้น TWQMS ทุก 5 นาที' },
      { side: 'L', g: () => parts.water.g, a: V3(-.036, .06, .04), c: '#5f6b7d', n: 'เกจวัดแรงดัน', s: 'แรงดันน้ำเข้าเครื่อง', v: V => fmt(V.pres, 3, 'MPa') },
      { side: 'L', g: () => parts.water.g, a: V3(.01, -.2, .03), c: '#1d7fd6', n: 'วาล์วไฟฟ้า', s: 'เปิด-ปิดน้ำเข้าเครื่อง' },
      { side: 'R', g: () => parts.horiba.g, a: V3(HW / 2, .07, HD / 2 + .02), c: '#1b5fb4', n: 'เครื่องวิเคราะห์ HORIBA TW-150', s: 'จอแสดงค่า 6 ตัว' },
      { side: 'R', g: () => probes[0], a: V3(.016, .105, 0), c: '#123f86', n: 'หัววัดคลอรีนอิสระ', s: 'FRC', v: V => fmt(V.frc, 2, 'mg/L') },
      { side: 'R', g: () => probes[1], a: V3(.01, .1, 0), c: '#4aa3df', n: 'หัววัด pH', s: 'กระเปาะแก้ว', v: V => fmt(V.ph, 2) },
      { side: 'R', g: () => probes[2], a: V3(.008, .13, 0), c: '#2b7fc0', n: 'หัววัดความนำไฟฟ้า', s: 'COND + อุณหภูมิ', v: V => fmt(V.ec, 0, 'µS/cm') },
      { side: 'R', g: () => parts.tub.g, a: V3(.033, -.02, .03), c: '#138a8a', n: 'ชุดวัดความขุ่น', s: 'TURB · แสงกระเจิง', v: V => V.tub == null ? '' : fmt(V.tub, 2, 'NTU') + ' (เฉลี่ยวันนี้)' },
    ];
    const NS = 'http://www.w3.org/2000/svg';
    LB.forEach(l => { const d = document.createElement('div'); d.className = 'chip ' + l.side; d.style.setProperty('--c', l.c);
      d.innerHTML = '<b>' + l.n + '</b><small>' + l.s + '</small><i></i>'; labEl.appendChild(d); l.el = d; l.vEl = d.querySelector('i');
      l.path = document.createElementNS(NS, 'path'); l.path.setAttribute('fill', 'none'); l.path.setAttribute('stroke', l.c); l.path.setAttribute('stroke-width', '1.5'); l.path.setAttribute('opacity', '0'); svg.appendChild(l.path);
      l.dot = document.createElementNS(NS, 'circle'); l.dot.setAttribute('r', '4'); l.dot.setAttribute('fill', '#fff'); l.dot.setAttribute('stroke', l.c); l.dot.setAttribute('stroke-width', '2'); l.dot.setAttribute('opacity', '0'); svg.appendChild(l.dot); });

    const wp = (o, local) => { const v = (local || V3(0, 0, 0)).clone(); o.updateWorldMatrix(true, false); return o.localToWorld(v); };
    const STEPS = [
      { n: 'ภาพรวมตู้', d: 'ตู้สเตนเลส 66 × 165 ซม. ตั้งบนแท่นคอนกรีต มีหลังคาเหล็กและแผงโซลาร์ ภายในแบ่ง 2 ชั้น: บนคือระบบส่งข้อมูล ล่างคือระบบวัด', c: '#1b5fb4', f: () => V3(0, Y1 + .95, 0), off: V3(.45, .35, 3.7), door: 1, cover: 0 },
      { n: 'หลังคาเหล็ก + แผงโซลาร์', d: 'กันแดดกันฝนให้ตู้ และมีไฟ LED ส่องหน้าตู้', c: '#1e6fd0', f: () => V3(0, B0 + 2.2, 0), off: V3(.9, .7, 2.0), door: 0, cover: 0 },
      { n: 'ตัวเก็บข้อมูล', d: 'คอมพิวเตอร์อุตสาหกรรมรับค่าจากเครื่องวิเคราะห์ผ่านสาย Serial แล้วส่งขึ้นระบบ TWQMS ทุก 5 นาที', c: '#25292e', f: () => wp(parts.logger.g), off: V3(.12, .05, .75), door: 1, cover: 0, hl: 'logger' },
      { n: 'เกจวัดแรงดัน · วาล์วไฟฟ้า', d: 'น้ำจากท่อจ่ายเข้าตู้ผ่านวาล์วไฟฟ้า แล้ววัดแรงดันที่เกจก่อนเข้าเครื่องวิเคราะห์', c: '#1d7fd6', f: () => wp(parts.water.g), off: V3(-.15, .05, .8), door: 1, cover: 0, hl: 'water', v: V => fmt(V.pres, 3), u: 'MPa (แรงดัน)' },
      { n: 'เครื่องวิเคราะห์ HORIBA TW-150', d: 'วัด 6 ค่าในเครื่องเดียว แสดงบนจอ LCD: ความขุ่น คลอรีน แรงดัน pH ความนำไฟฟ้า อุณหภูมิ', c: '#1b5fb4', f: () => wp(parts.horiba.g), off: V3(.15, .06, 1.15), door: 1, cover: 0, hl: 'horiba' },
      { n: 'หัววัดคลอรีนอิสระคงเหลือ', d: 'ขั้ววัดแบบกระแสไฟฟ้า จุ่มในเซลล์ที่น้ำไหลผ่านตลอด อ่านค่าเป็น mg/L', c: '#123f86', f: () => wp(probes[0], V3(0, .04, 0)), off: V3(.12, .05, .55), door: 1, cover: 1, foc: 0, lift: 1, v: V => fmt(V.frc, 2), u: 'mg/L · เกณฑ์ 0.2–2.0' },
      { n: 'หัววัด pH', d: 'ขั้วแก้ว ปลายเป็นกระเปาะบาง มีน้ำยาอิเล็กโทรไลต์ภายใน สอบเทียบด้วยบัฟเฟอร์ 4.01 / 6.86 / 9.18', c: '#4aa3df', f: () => wp(probes[1], V3(0, .05, 0)), off: V3(.1, .05, .55), door: 1, cover: 1, foc: 1, lift: 1, v: V => fmt(V.ph, 2), u: 'เกณฑ์ 6.5–8.5' },
      { n: 'หัววัดความนำไฟฟ้า + อุณหภูมิ', d: 'ขั้ววงแหวน 3 วงวัดความนำไฟฟ้า และมีเซ็นเซอร์อุณหภูมิในแท่งเดียวกัน', c: '#2b7fc0', f: () => wp(probes[2], V3(0, .06, 0)), off: V3(.14, .05, .55), door: 1, cover: 1, foc: 2, lift: 1, v: V => fmt(V.ec, 0), u: 'µS/cm · เกณฑ์ ≤ 500' },
      { n: 'ชุดวัดความขุ่น', d: 'ส่องแสงผ่านน้ำแล้ววัดแสงที่กระเจิง มีมอเตอร์ขับกลไกทำความสะอาดอัตโนมัติ', c: '#138a8a', f: () => wp(parts.tub.g), off: V3(-.12, .08, .55), door: 1, cover: 1, foc: 3, v: V => fmt(V.tub, 2), u: 'NTU เฉลี่ยวันนี้ · เกณฑ์ < 1' },
    ];
    const dots = root.querySelector('.dots'); STEPS.forEach(() => dots.appendChild(document.createElement('i')));
    return { T, root, R, scene, cam, svg, canvas, parts, probes, door, cover, canopy, LAY, PROBE_LIFT, LB, STEPS, drawLcd, V3, FOC, haloM, focusLight, cellMats: dimMats, hemi, key };
  }

  /* ═══ การเล่น ═══ */
  const sm = (cur, tgt, k, dt) => cur + (tgt - cur) * (1 - Math.exp(-k * dt));
  const MOVERS = ['logger', 'water', 'horiba', 'cell'];
  function autoTargets(t, TA) {
    const ex = i => t > 2.6 + i * .18 && t < TA - 4.4 - i * .12 ? 1 : 0;
    return { door: t > 1.4 && t < TA - 2.6 ? 1 : 0, ex: { logger: ex(0), water: ex(1), horiba: ex(2), cell: ex(3) }, lift: t > 4 && t < TA - 5 ? 1 : 0, lab: t > 4.2 && t < TA - 5.1 ? 1 : 0, cover: 0 };
  }
  function update(dt, raw) {
    const g = G, S = P, TA = CFG.autoSec;
    let tg;
    if (S.mode === 'auto') {
      S.t += raw; tg = autoTargets(S.t, TA);   // นับเวลาจริง (เครื่องช้าก็จบตรงเวลา)
      g.root.querySelector('.prog b').style.width = Math.min(100, S.t / TA * 100).toFixed(1) + '%';
      if (S.t > TA - 1.1 && !S.leaving) { S.leaving = true; g.root.classList.remove('on'); }
      if (S.t > TA) { finish('end'); return; }
    } else {
      S.stepT += raw;
      if (S.autoTour) {                                   // มือถือแนวตั้ง: เล่นอัตโนมัติแบบไล่ทีละชิ้น แล้วจบ
        g.root.querySelector('.prog b').style.width = Math.min(100, (S.step + S.stepT / 2.6) / g.STEPS.length * 100).toFixed(1) + '%';
        if (S.stepT > 2.6) { if (S.step + 1 >= g.STEPS.length) { if (!S.leaving) { S.leaving = true; g.root.classList.remove('on'); } if (S.stepT > 3.5) { finish('end'); return; } } else goStep(S.step + 1); }
      } else if (S.stepT > 6.5 && !S.hold) goStep(S.step + 1 >= g.STEPS.length ? 0 : S.step + 1);
      const st = g.STEPS[S.step]; tg = { door: st.door, ex: { logger: 0, water: 0, horiba: 0, cell: 0 }, lift: st.lift ? 1 : 0, lab: 0, cover: st.cover };
    }
    S.door = sm(S.door, tg.door, 3.2, dt); S.cover = sm(S.cover, tg.cover, 3.2, dt); S.lift = sm(S.lift, tg.lift, 3, dt); S.lab = sm(S.lab, tg.lab, 4, dt);
    g.door.rotation.y = 1.95 * S.door; g.cover.rotation.y = -1.7 * S.cover;
    let exAvg = 0;
    for (const id of MOVERS) { const p = g.parts[id], L = g.LAY[id]; p.e = sm(p.e, tg.ex[id], 3.4, dt); exAvg += p.e / 4;
      const k = p.e * p.e * (3 - 2 * p.e); p.g.position.lerpVectors(p.home, L.p, k); p.g.position.y += Math.sin(S.now * 1.6 + L.p.x * 3) * .012 * k; p.g.scale.setScalar(1 + (L.s - 1) * k); }
    const fi = S.mode === 'tour' ? g.STEPS[S.step].foc : undefined;
    S.foc = sm(S.foc || 0, fi != null ? 1 : 0, 4, dt);
    g.FOC.forEach((f, i) => { f.userData.k = sm(f.userData.k, fi === i ? 1 : 0, 4, dt); const k = f.userData.k;
      if (i < 3) { f.position.y = g.PROBE_LIFT[i] * S.lift + .075 * k; f.scale.setScalar(1 + .35 * k); } else f.scale.setScalar(1 + .12 * k);
      f.userData.halos.forEach(h => { h.visible = k > .05; }); });
    g.haloM.opacity = (.35 + .2 * Math.sin(S.now * 4)) * S.foc;
    g.cellMats.forEach(m => { const own = fi != null && g.FOC[fi].userData.mats.includes(m); m.opacity = own ? m.userData.o0 : m.userData.o0 * (1 - .85 * S.foc); m.depthWrite = m.opacity > .9; });
    if (fi != null) { const fp = new g.T.Vector3(); g.FOC[fi].getWorldPosition(fp); g.focusLight.position.set(fp.x + .18, fp.y + .2, fp.z + .3); }
    g.focusLight.intensity = 2.2 * S.foc; g.hemi.intensity = .65 * (1 - .5 * S.foc); g.key.intensity = 1.9 * (1 - .45 * S.foc);   // ฉากมืดลง ชิ้นที่ดูสว่างเด่น
    let wantPos, wantTgt;
    if (S.mode === 'auto') { const sw = Math.sin(S.t / TA * Math.PI * 2) * .35; wantTgt = g.V3(0, 1.3, 0); wantPos = g.V3(sw + .2, 1.55, 6.3 + .3 * exAvg); }
    else { const st = g.STEPS[S.step]; wantTgt = st.f(); wantPos = wantTgt.clone().addScaledVector(st.off, Math.max(1, Math.pow(1 / g.cam.aspect, .85))); }   // จอแนวตั้งถอยกล้องให้ชิ้นพอดีจอ
    const kc = S.mode === 'auto' ? 2.2 : 2.6;
    ['x', 'y', 'z'].forEach(a => { S.camPos[a] = sm(S.camPos[a], wantPos[a], kc, dt); S.camTgt[a] = sm(S.camTgt[a], wantTgt[a], kc, dt); });
    g.cam.position.copy(S.camPos); g.cam.lookAt(S.camTgt);
    const pt = isPortrait(); S.offX = sm(S.offX, S.mode === 'tour' && !pt ? -.14 : 0, 3, dt); S.offY = sm(S.offY || 0, S.mode === 'tour' && pt ? .17 : 0, 3, dt);
    g.cam.setViewOffset(innerWidth, innerHeight, innerWidth * S.offX, innerHeight * S.offY, innerWidth, innerHeight);
    const hl = S.mode === 'tour' ? g.STEPS[S.step].hl : null, pulse = .18 + .12 * Math.sin(S.now * 4);
    for (const id of MOVERS) { const on = hl === id; g.parts[id].mats.forEach(m => { if (!m.emissive || m.emissiveMap) return; m.emissive.setHex(0x4aa3df); m.emissiveIntensity = on ? pulse : 0; }); }
  }
  const tmpV = { v: null };
  function layoutLabels() {
    const g = G, W = innerWidth, H = innerHeight, vis = P.lab, tmp = tmpV.v || (tmpV.v = new g.T.Vector3());
    const rows = { L: [], R: [] };
    g.LB.forEach(l => { const o = l.g(); tmp.copy(l.a); o.updateWorldMatrix(true, false); o.localToWorld(tmp); tmp.project(g.cam);
      l.x = (tmp.x * .5 + .5) * W; l.y = (-tmp.y * .5 + .5) * H; rows[l.side].push(l); });
    const top = H * .2, bot = H * .86;
    for (const s of ['L', 'R']) {
      const r = rows[s].sort((a, b) => a.y - b.y); r.forEach(l => { l.h = l.el.offsetHeight || 52; });
      const gap = 10; let y = top; r.forEach(l => { l.ty = Math.max(l.y, y + l.h / 2); y = l.ty + l.h / 2 + gap; });
      if (y - gap > bot) for (let i = r.length - 1; i >= 0; i--) { const l = r[i]; const lim = (i < r.length - 1 ? r[i + 1].ty - r[i + 1].h / 2 - gap : bot) - l.h / 2; l.ty = Math.min(l.ty, lim); }
      r.forEach(l => { l.el.style.transform = `translateY(${(l.ty - l.h / 2).toFixed(1)}px)`; l.el.style.opacity = vis.toFixed(3);
        const ex = s === 'L' ? l.el.offsetLeft + l.el.offsetWidth : l.el.offsetLeft, mid = s === 'L' ? ex + 24 : ex - 24;
        l.path.setAttribute('d', `M${ex},${l.ty.toFixed(1)} L${mid},${l.ty.toFixed(1)} L${l.x.toFixed(1)},${l.y.toFixed(1)}`);
        l.path.setAttribute('opacity', (vis * .85).toFixed(3)); l.dot.setAttribute('cx', l.x.toFixed(1)); l.dot.setAttribute('cy', l.y.toFixed(1)); l.dot.setAttribute('opacity', vis.toFixed(3)); });
    }
  }
  function resize() { if (!G) return; G.root.classList.toggle('pt', isPortrait()); const W = innerWidth, H = innerHeight; G.R.setSize(W, H, false); G.cam.aspect = W / H; G.cam.updateProjectionMatrix(); G.svg.setAttribute('viewBox', `0 0 ${W} ${H}`); }
  function goStep(i) {
    const g = G, S = P; S.step = (i + g.STEPS.length) % g.STEPS.length; S.stepT = 0; const st = g.STEPS[S.step], el = g.root.querySelector('.fi-step');
    el.style.setProperty('--c', st.c); el.querySelector('.n').textContent = (S.step + 1) + ' / ' + g.STEPS.length;
    el.querySelector('h2').textContent = st.n; el.querySelector('p').textContent = st.d;
    const v = el.querySelector('.val'), vv = st.v ? st.v(S.V) : ''; if (vv) { v.hidden = false; v.innerHTML = esc(vv) + '<small>' + esc(st.u) + '</small>'; } else v.hidden = true;
    [...g.root.querySelectorAll('.dots i')].forEach((d, k) => d.classList.toggle('on', k === S.step));
  }
  function setMode(mode) {
    const g = G, S = P; S.mode = mode; S.hold = false;
    S.autoTour = mode === 'autotour'; if (S.autoTour) mode = S.mode = 'tour';
    g.root.querySelector('.fi-auto').hidden = !(mode === 'auto' || S.autoTour); g.root.querySelector('.fi-tour').hidden = mode !== 'tour' || S.autoTour; g.root.querySelector('.fi-step').hidden = mode !== 'tour';
    g.root.querySelector('[data-f=in]').textContent = S.autoTour ? '⏸ ดูทีละชิ้น' : '🔍 ดูภายในตู้';
    if (mode === 'tour') goStep(0);
  }
  function fillValues() {
    const g = G, V = P.V, f = (v, d) => v == null || !isFinite(v) ? '–' : Number(v).toFixed(d);
    g.root.querySelector('.vals').innerHTML =
      '<span class="v">คลอรีน<b>' + f(V.frc, 2) + '</b>mg/L</span>' +
      '<span class="v">ความขุ่น<b>' + f(V.tub, 2) + '</b>NTU' + (V.tub != null ? ' (เฉลี่ยวันนี้)' : '') + '</span>' +
      '<span class="v">ความนำไฟฟ้า<b>' + f(V.ec, 0) + '</b>µS/cm</span>';
    g.LB.forEach(l => { l.vEl.textContent = l.v ? l.v(V) : ''; });
    g.drawLcd(V);
  }
  function nearestId(lat, lon) {
    let best = null, bd = 1e9;
    for (const [id, xy] of Object.entries(WQ_XY)) { const d = Math.hypot((xy[0] - lat) * 110.5, (xy[1] - lon) * 108.3); if (d < bd) { bd = d; best = id; } }
    return bd < 0.6 ? best : null;   // ห่างไม่เกิน 600 ม.
  }
  async function loadTub(play) {
    const id = nearestId(play.st.lat0 != null ? play.st.lat0 : play.st.lat, play.st.lon0 != null ? play.st.lon0 : play.st.lon); if (!id) return;
    try { const r = await fetch(CFG.wqApi + '?p=tub&d=0&t=' + Date.now()); if (!r.ok) return; const j = await r.json(), s = j && j.stations && j.stations[id];
      if (P !== play || !s || s.avg == null) return; play.V.tub = s.avg; fillValues(); } catch (e) {}
  }
  function onKey(e) {
    if (!P) return;
    if (P.mode === 'tour') {
      if (e.key === 'ArrowRight') { P.hold = true; goStep(P.step + 1); } else if (e.key === 'ArrowLeft') { P.hold = true; goStep(P.step - 1); }
      else if (e.key === 'Escape') finish('closed'); else return;
      e.stopImmediatePropagation(); e.preventDefault();
    }
  }
  function onClick(e) {
    const b = e.target.closest('[data-f]'); if (!b || !P) return; e.stopPropagation();
    const f = b.dataset.f;
    if (f === 'in') { if (P.autoTour) { P.autoTour = false; P.hold = true; G.root.querySelector('.fi-auto').hidden = true; G.root.querySelector('.fi-tour').hidden = false; } else setMode('tour'); if (P.onDetail) try { P.onDetail(); } catch (er) {} }
    else if (f === 'close') finish('closed');
    else if (f === 'next') { P.hold = true; goStep(P.step + 1); }
    else if (f === 'prev') { P.hold = true; goStep(P.step - 1); }
  }
  function loop(now) {
    if (!P) return;
    const S = P, raw = Math.min(1, (now - (S.last || now)) / 1000), dt = Math.min(.2, raw); S.last = now; S.now += dt;
    update(dt, raw); if (P !== S) return;
    G.R.render(G.scene, G.cam); layoutLabels();
    S.raf = requestAnimationFrame(loop);
  }
  function finish(reason) {
    const S = P; if (!S) return;
    P = null; cancelAnimationFrame(S.raf);
    if (G) G.root.classList.remove('on');
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', resize);
    const g0 = G; setTimeout(() => { if (P || !g0) return; if (g0.root.parentNode) g0.root.remove();
      if (LITE && G === g0) { try { g0.R.dispose(); g0.R.forceContextLoss(); } catch (e) {} G = null; } }, 850);   // มือถือ: คืนหน่วยความจำ GPU
    if (S.onDone) try { S.onDone(reason); } catch (e) { console.error(e); }
  }

  function play(opt) {
    opt = opt || {};
    if (P) finish('replaced');
    if (!window.THREE) { if (opt.onDone) opt.onDone('error'); return false; }
    injectCss();
    if (!G) { try { G = build(); G.root.addEventListener('click', onClick); } catch (e) { console.warn('[FRC3D_INSIDE]', e); if (opt.onDone) opt.onDone('error'); return false; } }
    const st = opt.st || {};
    P = { st, mode: 'auto', onDone: opt.onDone, onDetail: opt.onDetail, t: 0, now: 0, step: 0, stepT: 0, door: 0, cover: 0, lift: 0, lab: 0, offX: 0,
      camPos: G.V3(.2, 1.55, 6.3), camTgt: G.V3(0, 1.3, 0), V: { frc: st.frc, ec: st.ec, tub: null, ph: null, temp: null, pres: null } };
    for (const id of MOVERS) { const p = G.parts[id]; p.e = 0; p.g.position.copy(p.home); p.g.scale.setScalar(1); }
    G.door.rotation.y = 0; G.cover.rotation.y = 0;
    G.root.querySelector('h1').textContent = st.name || 'สถานีตรวจวัดคุณภาพน้ำ';
    G.root.classList.toggle('pt', isPortrait());
    setMode(opt.mode === 'tour' ? 'tour' : isPortrait() ? 'autotour' : 'auto');
    fillValues(); loadTub(P);
    document.body.appendChild(G.root); resize();
    window.addEventListener('keydown', onKey, true); window.addEventListener('resize', resize);
    requestAnimationFrame(() => requestAnimationFrame(() => G.root.classList.add('on')));
    P.raf = requestAnimationFrame(loop);
    return true;
  }
  function stop() { if (!P) return; const S = P; S.onDone = null; finish('stopped'); }

  window.FRC3D_INSIDE = { play, stop, isOn: () => !!P, mode: () => P && P.mode };
})();
