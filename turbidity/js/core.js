// ═══════════════════════════════════════════════════════════════════════════
// Turbidity Contour v1.0 — CORE ENGINE
// geometry / color / history / time-lag / stale / contour grid
// port แนวคิดจาก FRCContour v38.2 (zone-based + time-lagged source + gray zone)
// ═══════════════════════════════════════════════════════════════════════════

// ── Geometry ────────────────────────────────────────────────────────────────
function tbPointInPoly(lat, lon, coords) {
  let inside = false;
  for (let a = 0, b = coords.length - 1; a < coords.length; b = a++) {
    const [y1, x1] = coords[a], [y2, x2] = coords[b];
    if (((y1 > lat) !== (y2 > lat)) &&
        (lon < (x2 - x1) * (lat - y1) / (y2 - y1 + 1e-12) + x1)) inside = !inside;
  }
  return inside;
}

// ── Color scale (NTU → rgba) ────────────────────────────────────────────────
function tbColorRGB(v) {
  const st = TB.COLOR_STOPS;
  if (v <= st[0][0]) return st[0][1];
  for (let k = 1; k < st.length; k++) {
    if (v <= st[k][0]) {
      const [v0, c0] = st[k-1], [v1, c1] = st[k];
      const t = (v - v0) / (v1 - v0);
      return [0,1,2].map(m => Math.round(c0[m] + (c1[m] - c0[m]) * t));
    }
  }
  return st[st.length - 1][1];
}
function tbColorCss(v, a) {
  if (v < -0.5) return 'rgba(148,152,158,' + (a == null ? 0.5 : a) + ')'; // gray zone
  const [r, g, b] = tbColorRGB(Math.max(0, v));
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (a == null ? 1 : a) + ')';
}
function tbStatus(v) {
  if (v < -0.5) return 'ไม่มีข้อมูล';
  if (v <= TB.THRESH.excellent) return '✓ ใสมาก (≤' + TB.THRESH.excellent + ')';
  if (v <= TB.THRESH.good)      return '✓ ดี (≤' + TB.THRESH.good + ')';
  if (v <= TB.THRESH.limit)     return '✓ ผ่านเกณฑ์ (≤' + TB.THRESH.limit + ')';
  return '⚠ เกินเกณฑ์ (>' + TB.THRESH.limit + ' NTU)';
}
function tbStatusColor(v) {
  if (v < -0.5) return '#9aa0a6';
  if (v <= TB.THRESH.good)  return '#1a8a5a';
  if (v <= TB.THRESH.limit) return '#b8860b';
  return '#c0392b';
}

// ── State ───────────────────────────────────────────────────────────────────
const TBS = {
  sensors: [],            // [{id,name,lat,lon,type,ntu,src,area,branch}]
  turbField: TB.TURB_FIELD_OVERRIDE, // ชื่อ field ที่ detect ได้
  apiStatus: 'loading',   // loading | live | fallback
  usingFallbackValues: false, // true = ntu มาจากค่าประมาณ ไม่ใช่ API
  maint: new Set(),
  stale: new Set(),
  timeLagged: TB.TIME_LAGGED_DEFAULT,
  kSettle: TB.K_SETTLE,
  hist: {},               // {code: [{ts, ntu}] sorted}
  histLoadedFromFb: false,
  zones: {},              // sid → {coords, color}
  grayCells: false,       // มีโซนเทาอย่างน้อยหนึ่งโซนไหม (ไว้ redraw ฉลาดๆ)
};

function tbIsDown(codeOrSensor) {
  const code = String(typeof codeOrSensor === 'object' ? codeOrSensor.id : codeOrSensor);
  return TBS.maint.has(code) || TBS.stale.has(code);
}

// ── History (localStorage + Firebase history/turb_*) ────────────────────────
function tbLoadHistLocal() {
  try { TBS.hist = JSON.parse(localStorage.getItem(TB.LS_KEYS.hist) || '{}'); }
  catch(e) { TBS.hist = {}; }
}
function tbSaveHistLocal() {
  try {
    const cutoff = Date.now() - TB.HIST_MAX_HOURS * 3600e3;
    for (const c of Object.keys(TBS.hist)) {
      TBS.hist[c] = TBS.hist[c].filter(p => p.ts >= cutoff);
      if (!TBS.hist[c].length) delete TBS.hist[c];
    }
    localStorage.setItem(TB.LS_KEYS.hist, JSON.stringify(TBS.hist));
  } catch(e) {}
}
function tbRecordHistory(now) {
  for (const s of TBS.sensors) {
    if (s.ntu == null || s.ntu < 0 || s.ntu > 1000) continue;
    if (s.src === 'fallback') continue; // ไม่บันทึกค่าประมาณ
    const code = String(s.id);
    if (!TBS.hist[code]) TBS.hist[code] = [];
    const arr = TBS.hist[code];
    if (arr.length && Math.abs(arr[arr.length-1].ts - now) < 60e3) continue;
    arr.push({ ts: now, ntu: s.ntu });
  }
  tbSaveHistLocal();
}

async function tbFbLoadHistory() {
  if (!window._fbReady) return;
  try {
    const snap = await window._fbGet(window._fbRef(window._fb, 'history'));
    if (!snap.exists()) return;
    const cutoff = Date.now() - TB.HIST_MAX_HOURS * 3600e3;
    let n = 0;
    snap.forEach(cs => {
      const key = cs.key;
      if (!key.startsWith('turb_')) return;
      const code = key.slice(5).replace(/-/g, '_');
      if (!TBS.hist[code]) TBS.hist[code] = [];
      const have = new Set(TBS.hist[code].map(p => p.ts));
      cs.forEach(ps => {
        const p = ps.val();
        if (p && p.ts >= cutoff && p.ntu != null && !have.has(p.ts)) {
          TBS.hist[code].push({ ts: p.ts, ntu: p.ntu }); n++;
        }
      });
      TBS.hist[code].sort((a,b) => a.ts - b.ts);
    });
    TBS.histLoadedFromFb = true;
    tbSaveHistLocal();
    console.log('[Turb] ✅ โหลด history จาก Firebase:', n, 'จุดใหม่');
  } catch(e) { console.warn('[Turb] FB history load:', e.message); }
}
async function tbFbSaveReadings(now) {
  if (!window._fbReady) return;
  for (const s of TBS.sensors) {
    if (s.ntu == null || s.src === 'fallback') continue;
    try {
      const code = String(s.id).replace(/\/|\./g, '-');
      await window._fbSet(
        window._fbRef(window._fb, TB.FB_TURB_PREFIX + code + '/' + now),
        { ntu: s.ntu, ts: now }
      );
    } catch(e) { /* ต้อง login — เงียบไว้ */ }
  }
}

// ── Maintenance (node ร่วมกับ FRCContour) ───────────────────────────────────
function tbLoadMaintLocal() {
  try { JSON.parse(localStorage.getItem(TB.LS_KEYS.maint) || '[]').forEach(c => TBS.maint.add(String(c))); }
  catch(e) {}
}
function tbSaveMaintLocal() {
  try { localStorage.setItem(TB.LS_KEYS.maint, JSON.stringify([...TBS.maint])); } catch(e) {}
}
async function tbFbLoadMaint() {
  if (!window._fbReady) return;
  try {
    const snap = await window._fbGet(window._fbRef(window._fb, TB.FB_MAINT_PATH));
    const val = snap && snap.val ? snap.val() : null;
    if (val) Object.keys(val).forEach(c => TBS.maint.add(String(c)));
    tbSaveMaintLocal();
  } catch(e) {}
}
async function tbToggleMaintenance(code) {
  code = String(code);
  const on = !TBS.maint.has(code);
  if (on) TBS.maint.add(code); else TBS.maint.delete(code);
  tbSaveMaintLocal();
  if (window._fbReady) {
    try {
      await window._fbSet(
        window._fbRef(window._fb, TB.FB_MAINT_PATH + '/' + code.replace(/\/|\./g,'-')),
        on ? { ts: Date.now() } : null
      );
    } catch(e) { console.warn('[Turb] maint sync ต้อง login:', e.message); }
  }
  tbRebuildAll();
}
window.tbToggleMaintenance = tbToggleMaintenance;

// ── Stale detection ─────────────────────────────────────────────────────────
function tbDetectStale() {
  const cutoff = Date.now() - TB.STALE_HOURS * 3600e3;
  let changed = false;
  for (const s of TBS.sensors) {
    const code = String(s.id);
    const pts = (TBS.hist[code] || []).filter(p => p.ts >= cutoff);
    let stale = false;
    if (pts.length >= TB.STALE_MIN_PTS) {
      const v0 = pts[0].ntu;
      stale = pts.every(p => Math.abs(p.ntu - v0) < 1e-9);
    }
    const was = TBS.stale.has(code);
    if (stale && !was) { TBS.stale.add(code); changed = true;
      console.warn('[Turb][Stale] ⚠ ' + s.name + ' ค่าค้าง ≥' + TB.STALE_HOURS + ' ชม.'); }
    else if (!stale && was) { TBS.stale.delete(code); changed = true; }
  }
  return changed;
}

// ── Time-lagged source lookup ───────────────────────────────────────────────
function tbTravelSec(dKm) {
  return (dKm * 1000) / TB.EPANET_V;
}
function tbLaggedNtu(code, tSec) {
  const pts = TBS.hist[code];
  if (!pts || pts.length < 2) return null;
  const target = Date.now() - tSec * 1000;
  if (target < pts[0].ts - TB.LAG_TOL_MS || target > pts[pts.length-1].ts + TB.LAG_TOL_MS) return null;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].ts <= target) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  const near = (Math.abs(a.ts - target) <= Math.abs(b.ts - target)) ? a : b;
  return Math.abs(near.ts - target) <= TB.LAG_TOL_MS ? near.ntu : null;
}
// ค่าที่ contour ใช้ ณ จุดห่างจากสถานี dKm:
// Turb(now−t) × exp(−K_settle·t)  |  fallback: Turb(now) × exp(−K_settle·t)
const _tbMemo = {};
function tbValAt(sensor, dKm) {
  const t = tbTravelSec(dKm);
  const decay = Math.exp(-TBS.kSettle * (t / 3600));
  let base = sensor.ntu;
  if (TBS.timeLagged && t >= TB.MIN_LAG_SEC) {
    const key = String(sensor.id) + '|' + ((t / 900) | 0);
    if (key in _tbMemo) base = _tbMemo[key];
    else {
      const lag = tbLaggedNtu(String(sensor.id), t);
      base = (lag != null) ? lag : sensor.ntu;
      _tbMemo[key] = base;
    }
  }
  return Math.max(0, base * decay);
}
function tbClearMemo() { for (const k in _tbMemo) delete _tbMemo[k]; }

// ── Contour grid (zone-based; concept เดียวกับ buildIdwCache Tier 2/4) ──────
// ต่อ pixel: 1) โซนอิทธิพล (polygon) → ค่าจากสถานีเจ้าของโซน (time-lag + settle)
//            2) นอกโซน → IDW ระยะทางถ่วงจากทุกสถานี (แต่ละสถานี apply lag+settle ก่อน)
// สถานี down → โซนเป็นสีเทา / ตัดออกจาก IDW
function tbGridValue(lat, lon) {
  // Tier 1: zone polygon
  for (const [sid, z] of Object.entries(TBS.zones)) {
    if (!z.coords || z.coords.length < 3) continue;
    if (!tbPointInPoly(lat, lon, z.coords)) continue;
    if (tbIsDown(sid)) return TB.GRAY_SENTINEL;
    const s = TBS.sensors.find(x => String(x.id) === sid);
    if (s && s.ntu != null) {
      const dKm = Math.hypot(s.lat - lat, s.lon - lon) * TB.DEG_TO_KM * TB.EUCLID_PIPE_FACTOR;
      return tbValAt(s, dKm);
    }
    break; // โซนแรกที่ครอบ
  }
  // Tier 2: IDW
  let ws = 0, vs = 0;
  for (const s of TBS.sensors) {
    if (s.ntu == null || tbIsDown(s)) continue;
    const dDeg = Math.hypot(s.lat - lat, s.lon - lon);
    if (dDeg < 1e-8) return tbValAt(s, 0);
    const w = 1 / (dDeg * dDeg);
    const dKm = dDeg * TB.DEG_TO_KM * TB.EUCLID_PIPE_FACTOR;
    ws += w; vs += w * tbValAt(s, dKm);
  }
  return ws > 0 ? vs / ws : 0;
}
