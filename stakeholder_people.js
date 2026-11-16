// คนสมจริงสำหรับฉากชั้น 5 — โมเดลจาก Microsoft Rocketbox Avatar Library (MIT License, © 2020 Microsoft)
// https://github.com/microsoft/Microsoft-Rocketbox · แปลงเป็นไฟล์ไบนารีขนาดเล็ก (stakeholder_people.bin) + แผนที่ผิวรวม (stakeholder_people.webp)
// รูปแบบไฟล์: 'SPPL' · uint32 ความยาว JSON · JSON ส่วนหัว · ข้อมูลจุดยอด (ตำแหน่ง int16, normal int8, uv uint16, skin uint8) + index
import * as THREE from 'three';

const ORDER = ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'L_Thigh', 'L_Calf', 'L_Foot', 'R_Thigh', 'R_Calf', 'R_Foot',
  'L_Clavicle', 'L_UpperArm', 'L_Forearm', 'L_Hand', 'R_Clavicle', 'R_UpperArm', 'R_Forearm', 'R_Hand'];
const CHILD = { L_Thigh: 'L_Calf', L_Calf: 'L_Foot', R_Thigh: 'R_Calf', R_Calf: 'R_Foot', L_UpperArm: 'L_Forearm', L_Forearm: 'L_Hand', R_UpperArm: 'R_Forearm', R_Forearm: 'R_Hand', Spine: 'Neck', Neck: 'Head' };

export async function loadPeople(binUrl, texUrl, opt = {}) {
  const [buf, img] = await Promise.all([
    fetch(binUrl).then(r => { if (!r.ok) throw new Error('people bin ' + r.status); return r.arrayBuffer(); }),
    new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = texUrl; })
  ]);
  const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x4c505053) throw new Error('bad people file');
  const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
  const base = 8 + hl + ((4 - (hl % 4)) % 4);
  // แผนที่ผิว: มือถือย่อเหลือครึ่ง (ประหยัดหน่วยความจำ ~3 เท่า)
  let src = img; const k = opt.maxTex && img.width > opt.maxTex ? opt.maxTex / img.width : 1;
  if (k < 1) { const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); src = c; }
  const tex = new THREE.Texture(src); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.userData.live = true; tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.72, metalness: 0 });
  const types = head.types.map(t => {
    const v = t.v, P16 = new Int16Array(buf, base + t.pos, v * 3), P = new Float32Array(v * 3);
    for (let i = 0; i < v * 3; i++) { const a = i % 3; P[i] = t.pmin[a] + (P16[i] + 32768) / 65535 * (t.pmax[a] - t.pmin[a]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    const N8 = new Int8Array(buf, base + t.nrm, v * 4), N = new Float32Array(v * 3); for (let i = 0; i < v; i++) for (let a = 0; a < 3; a++) N[i * 3 + a] = N8[i * 4 + a] / 127;
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(buf, base + t.uv, v * 2), 2, true));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint8Array(buf, base + t.si, v * 4), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Uint8Array(buf, base + t.sw, v * 4), 4, true));
    g.setIndex(new THREE.BufferAttribute(t.i32 ? new Uint32Array(buf, base + t.idx, t.t * 3) : new Uint16Array(buf, base + t.idx, t.t * 3), 1));
    g.computeBoundingSphere();
    return { name: t.name, female: !!t.female, geo: g, def: t };
  });
  return { types, mat, tex };
}

// โครงกระดูก + SkinnedMesh หนึ่งตัว (หน่วยเมตร หันหน้า +Z เท้าอยู่ y=0)
export function makeRig(type, mat) {
  const t = type.def, root = new THREE.Group(); root.scale.setScalar(0.01);
  // ท่าอ้างอิงเอาจาก inverse bind (บางไฟล์ FBX ตำแหน่งกระดูกที่บันทึกไว้ไม่ใช่ท่า bind → โมเดลนอนตะแคง)
  const holder = new THREE.Object3D(); root.add(holder);
  const inv = t.bones.map(b => new THREE.Matrix4().fromArray(b.ib)), W = inv.map(m => m.clone().invert());
  const bones = t.bones.map((b, i) => { const o = new THREE.Bone(); o.name = b.n; const L = b.p >= 0 ? inv[b.p].clone().multiply(W[i]) : W[i]; L.decompose(o.position, o.quaternion, o.scale); return o; });
  t.bones.forEach((b, i) => (b.p >= 0 ? bones[b.p] : holder).add(bones[i]));
  const mesh = new THREE.SkinnedMesh(type.geo, mat); mesh.frustumCulled = false; root.add(mesh);
  mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4().fromArray(t.bindM));
  const by = {}; bones.forEach(b => { by[b.name] = b; });
  const bind = bones.map(b => [b.position.clone(), b.quaternion.clone()]);
  // ทิศของกระดูกเท้าในท่าอ้างอิง (ไว้ล็อกเท้าให้ขนานพื้น)
  root.updateMatrixWorld(true); const rq = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const foot = {}; for (const f of ['L_Foot', 'R_Foot']) if (by[f]) foot[f] = rq.clone().multiply(by[f].getWorldQuaternion(new THREE.Quaternion()));
  return { root, mesh, bones, by, bind, foot, type };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qr = new THREE.Quaternion();
// จัดท่า: spec = { ชื่อกระดูก: [x,y,z] ทิศที่ต้องการในพิกัดตัวคน (+Z หน้า, +X ซ้ายของคน, +Y บน) }, flatFeet = เท้าขนานพื้น
export function poseRig(rig, spec, flatFeet = true) {
  rig.bones.forEach((b, i) => { b.position.copy(rig.bind[i][0]); b.quaternion.copy(rig.bind[i][1]); });
  rig.root.updateMatrixWorld(true);
  const rq = rig.root.getWorldQuaternion(_qr);
  for (const n of ORDER) {
    const b = rig.by[n]; if (!b) continue;
    if (spec[n] && CHILD[n] && rig.by[CHILD[n]]) {
      b.getWorldPosition(_a); rig.by[CHILD[n]].getWorldPosition(_b); _d.subVectors(_b, _a).normalize();
      _t.fromArray(spec[n]).normalize().applyQuaternion(rq);
      _q.setFromUnitVectors(_d, _t);
      b.getWorldQuaternion(_qw); _qw.premultiply(_q); b.parent.getWorldQuaternion(_qp).invert(); b.quaternion.copy(_qp.multiply(_qw));
      b.updateMatrixWorld(true);
    } else if (flatFeet && rig.foot[n]) {
      _qw.copy(rq).multiply(rig.foot[n]); b.parent.getWorldQuaternion(_qp).invert(); b.quaternion.copy(_qp.multiply(_qw)); b.updateMatrixWorld(true);
    }
  }
}

// อบท่าให้เป็นรูปทรงนิ่ง (ไม่มีโครงกระดูก) → ใช้กับ InstancedMesh ได้ · ผลลัพธ์หน่วยเมตร ท้องเท้าที่ y=0 (หรือ shiftY)
export function bakePose(rig, spec, opt = {}) {
  poseRig(rig, spec, opt.flatFeet !== false);
  rig.root.position.set(0, 0, 0); rig.root.rotation.set(0, 0, 0); rig.root.updateMatrixWorld(true);
  const g = rig.type.geo, n = g.attributes.position.count, P = g.attributes.position, Nn = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const sk = rig.mesh.skeleton, bm = rig.mesh.bindMatrix, M = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, sk.boneInverses[i]).multiply(bm));
  const out = new Float32Array(n * 3), on = new Float32Array(n * 3), v = new THREE.Vector3(), nv = new THREE.Vector3(), acc = new THREE.Vector3(), accN = new THREE.Vector3(), tmp = new THREE.Vector3();
  let minY = 1e9;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i); nv.fromBufferAttribute(Nn, i); acc.set(0, 0, 0); accN.set(0, 0, 0);
    for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (!w) continue; const m = M[SI.getComponent(i, k)]; acc.addScaledVector(tmp.copy(v).applyMatrix4(m), w); accN.addScaledVector(tmp.copy(nv).transformDirection(m), w); }
    out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z; accN.normalize(); on[i * 3] = accN.x; on[i * 3 + 1] = accN.y; on[i * 3 + 2] = accN.z; if (acc.y < minY) minY = acc.y;
  }
  let dy = -minY;
  if (opt.seat) { const h = new THREE.Vector3(); rig.by.L_Thigh.getWorldPosition(h); dy = -(h.y - 0.1); }   // นั่ง: ก้นอยู่ที่ y=0 (วางบนเบาะ)
  for (let i = 0; i < n; i++) out[i * 3 + 1] += dy;
  const b = new THREE.BufferGeometry(); b.setAttribute('position', new THREE.BufferAttribute(out, 3)); b.setAttribute('normal', new THREE.BufferAttribute(on, 3)); b.setAttribute('uv', g.attributes.uv); b.setIndex(g.index); b.computeBoundingSphere();
  return b;
}

// ท่ามาตรฐาน (ทิศในพิกัดตัวคน: +X = ซ้ายของคน, +Z = หน้า)
export const POSES = {
  stand: { L_UpperArm: [0.16, -1, 0.02], R_UpperArm: [-0.16, -1, 0.02], L_Forearm: [0.1, -1, 0.22], R_Forearm: [-0.1, -1, 0.22], L_Thigh: [0.03, -1, 0], R_Thigh: [-0.03, -1, 0], L_Calf: [0.01, -1, -0.02], R_Calf: [-0.01, -1, -0.02] },
  phone: { L_UpperArm: [0.16, -1, 0.02], R_UpperArm: [-0.14, -1, 0.18], L_Forearm: [0.1, -1, 0.22], R_Forearm: [0.25, 0.55, 1], L_Thigh: [0.06, -1, 0], R_Thigh: [-0.02, -1, 0.02], L_Calf: [0.02, -1, -0.02], R_Calf: [-0.01, -1, 0] },
  hold: { L_UpperArm: [0.12, -1, 0.15], R_UpperArm: [-0.12, -1, 0.15], L_Forearm: [-0.35, -0.25, 1], R_Forearm: [0.35, -0.25, 1], L_Thigh: [0.04, -1, 0], R_Thigh: [-0.04, -1, 0], L_Calf: [0.01, -1, -0.02], R_Calf: [-0.01, -1, -0.02] },
  sit: { L_UpperArm: [0.12, -1, 0.3], R_UpperArm: [-0.12, -1, 0.3], L_Forearm: [-0.12, -0.35, 1], R_Forearm: [0.12, -0.35, 1], L_Thigh: [0.08, -0.3, 1], R_Thigh: [-0.08, -0.3, 1], L_Calf: [0.02, -1, 0.06], R_Calf: [-0.02, -1, 0.06] },
};

// ท่าเดิน ณ เฟส ph (เรเดียน) · คืน spec
const _s = {};
export function walkSpec(ph, opt = {}) {
  const w = Math.sin(ph) * 0.32, c = Math.cos(ph), kl = 0.12 + 0.85 * Math.max(0, c) ** 1.5, kr = 0.12 + 0.85 * Math.max(0, -c) ** 1.5;
  const dir = (a, x) => [x, -Math.cos(a), Math.sin(a)];
  _s.L_Thigh = dir(w, 0.04); _s.R_Thigh = dir(-w, -0.04);
  _s.L_Calf = dir(w - kl, 0.02); _s.R_Calf = dir(-w - kr, -0.02);
  const al = -w * 0.55, ar = w * 0.55, el = 0.3 + 0.35 * Math.max(0, -Math.sin(ph)), er = 0.3 + 0.35 * Math.max(0, Math.sin(ph));
  _s.L_UpperArm = dir(al, 0.15); _s.R_UpperArm = dir(ar, -0.15);
  _s.L_Forearm = opt.bagL ? dir(al + 0.1, 0.12) : dir(al + el, 0.08); _s.R_Forearm = opt.doc ? [0.3, -0.35, 1] : dir(ar + er, -0.08);
  return _s;
}
