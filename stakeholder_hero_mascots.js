// พี่ยอดน้ำ + น้องสายน้ำ ยืนที่มุมภาพหน้าแรก (WebGL โปร่งใสซ้อนบนวิดีโอ)
// ขยับตัวน่ารัก: หายใจ กะพริบตา หันตามเมาส์ โบกมือ กระโดด ชูมือเชียร์ ผลัดกันทำ · แตะที่ตัว = กระโดดดีใจ
// เบา: ผืนผ้าใบเล็ก · หยุดวาดเมื่อเลื่อนพ้นจอ ซ่อนหน้าแรก หรือสลับแท็บ · ลดการเคลื่อนไหวตามการตั้งค่าระบบ
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeMascot, FACE } from './stakeholder_yodnam.js';

export async function mountHeroMascots(stage, opt = {}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // กรอบสูงเท่าภาพ + ตัวละครติดขอบล่างของจอ (sticky) → เห็นยืนอยู่มุมล่างเสมอ แม้ภาพยาวเลยขอบจอ
  const wrap = document.createElement('div'); wrap.className = 'heroPalsWrap';
  const box = document.createElement('div'); box.className = 'heroPals'; box.setAttribute('aria-hidden', 'true');
  const cv = document.createElement('canvas'); box.appendChild(cv); wrap.appendChild(box); stage.appendChild(wrap);
  const TL = u => new THREE.TextureLoader().loadAsync(u).then(t => { t.colorSpace = THREE.NoColorSpace; return t; });
  const [ty, ts] = await Promise.all([TL('stakeholder_yodnam_faces.webp'), TL('stakeholder_sainam_faces.webp')]);

  const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight('#ffffff', '#cfd8e3', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(-2, 4, 3); scene.add(sun);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 40);

  // เงานุ่มใต้เท้า
  const sc = document.createElement('canvas'); sc.width = sc.height = 64; { const g = sc.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(20,40,70,.42)'); gr.addColorStop(0.55, 'rgba(20,40,70,.16)'); gr.addColorStop(1, 'rgba(20,40,70,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const shM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false });
  const pals = [['yod', ty, 1.5, -0.42], ['sai', ts, 1.38, 0.4]].map(([k, tex, h, x], i) => {
    const m = makeMascot(k, tex, h); m.root.position.x = x; m.root.rotation.y = i ? -0.32 : 0.3; scene.add(m.root);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36).rotateX(-Math.PI / 2), shM); sh.position.set(x, 0.002, 0.02); scene.add(sh);
    return Object.assign(m, { act: null, actT: 0, face: null, look: 0, baseY: m.root.rotation.y, sh });
  });
  const [yod, sai] = pals;
  camera.position.set(0, 1.0, 5.3); camera.lookAt(0, 0.8, 0);

  // ผลัดกันทำท่า (คู่กัน หรือคนเดียว) แบบสุ่มแต่ไม่ซ้ำติดกัน
  const SEQ = [
    [[yod, 'wave', FACE.happy, 1.8]], [[sai, 'hop', FACE.sparkle, 0.7]], [[yod, 'present', FACE.normal, 1.6], [sai, 'cheer', FACE.happy, 1.5]],
    [[sai, 'wave', FACE.happy, 1.8]], [[yod, 'hop', FACE.wink, 0.7]], [[yod, 'cheer', FACE.happy, 1.4], [sai, 'cheer', FACE.happy, 1.4]],
    [[yod, 'point', FACE.sparkle, 1.6], [sai, 'present', FACE.normal, 1.6]], [[sai, 'talk', FACE.normal, 1.6]],
  ];
  let next = 1.2, last = -1;
  const play = steps => steps.forEach(([o, act, face, t], j) => setTimeout(() => { o.act = act; o.face = face; o.actT = t; }, j * 260));

  // หันตามเมาส์/นิ้ว
  let px = 0, py = 0;
  addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); px = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth * 0.5))); py = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight * 0.5))); }, { passive: true });
  // แตะที่ตัว = กระโดดดีใจ
  box.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(), o = (e.clientX - r.left) / r.width < 0.5 ? yod : sai; if (o.act === 'hop') return; o.act = 'hop'; o.face = FACE.sparkle; o.actT = 0.7; });

  function resize() { const w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  new ResizeObserver(resize).observe(cv); resize();

  let vis = true, raf = 0, t0 = performance.now(), T = 0;
  new IntersectionObserver(es => { vis = es[0].isIntersecting; kick(); }).observe(box);
  document.addEventListener('visibilitychange', kick);
  const on = () => vis && !document.hidden && !(opt.paused && opt.paused());
  function kick() { if (on() && !raf) { t0 = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0; if (!on()) return;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now; T += dt;
    if (!still) { next -= dt; if (next <= 0) { let k; do { k = Math.floor(Math.random() * SEQ.length); } while (k === last); last = k; play(SEQ[k]); next = 3.2 + Math.random() * 2.6; } }
    for (const o of pals) {
      if (o.actT > 0) { o.actT -= dt; if (o.actT <= 0) { o.act = null; o.face = null; } }
      // ทั้งคู่หันเข้าหากันเล็กน้อย + หันศีรษะตามเมาส์ · ตอนอีกตัวทำท่า หันไปมองเพื่อน
      const mate = o === yod ? sai : yod, watch = mate.act && !o.act ? (o === yod ? 0.55 : -0.55) : 0;
      const look = watch || px * 0.7; o.root.rotation.y += (o.baseY + look * 0.35 - o.root.rotation.y) * Math.min(1, dt * 3);
      o.update(still ? 0 : dt, { act: o.act, face: o.face, look: look * 0.6 });
      o.head.rotation.x += py * 0.1;
      const lift = Math.max(0, o.root.children[0].position.y); o.sh.scale.setScalar(1 - Math.min(0.45, lift * 1.8));
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  kick();
  box.classList.add('on');
  // มือถือ: คืนหน่วยความจำกราฟิกเมื่อเข้าฉาก 3 มิติ (กลับหน้าแรกค่อยสร้างใหม่)
  function dispose() { vis = false; cancelAnimationFrame(raf); raf = 0; try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) {} wrap.remove(); }
  return { kick, box, dispose };
}
