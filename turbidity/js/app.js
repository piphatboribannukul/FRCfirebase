// ═══════════════════════════════════════════════════════════════════════════
// Turbidity Contour v1.0 — APP
// map / canvas contour / markers / hover / poll loop / UI
// ═══════════════════════════════════════════════════════════════════════════

// ── Map ─────────────────────────────────────────────────────────────────────
const tbMap = L.map('map', { zoomControl: true, preferCanvas: true })
  .setView([13.765, 100.53], 11);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap © CARTO', maxZoom: 19,
}).addTo(tbMap);

// boundaries จาก ../data/boundaries.js (ถ้ามี)
const _tbHasBounds = (typeof STA_POLYS !== 'undefined' && typeof MWA_POLYS !== 'undefined');
if (_tbHasBounds) {
  for (const p of STA_POLYS)
    L.polygon(p.coords, { color:'#8a6d3b', weight:1, fill:false, opacity:0.4, interactive:false }).addTo(tbMap);
  for (const p of MWA_POLYS) {
    L.polygon(p.coords, { color:'#5a4020', weight:2.2, fill:false, opacity:0.75, interactive:false }).addTo(tbMap);
    if (p.name) {
      const lats = p.coords.map(c=>c[0]), lons = p.coords.map(c=>c[1]);
      L.marker([lats.reduce((a,b)=>a+b,0)/lats.length, lons.reduce((a,b)=>a+b,0)/lons.length],
        { icon: L.divIcon({ html:'<div style="color:#5a4020;font-size:11px;font-weight:700;text-shadow:0 0 3px #fff,0 0 6px #fff;white-space:nowrap;font-family:Sarabun,sans-serif;">'+p.name+'</div>', className:'', iconAnchor:[30,8] }), interactive:false }).addTo(tbMap);
    }
  }
} else {
  console.warn('[Turb] ⚠ ไม่พบ ../data/boundaries.js — contour จะไม่ถูก clip ตามขอบเขต');
}

// zones จาก ../data/zones.js (DEFAULT_ZONES)
if (typeof DEFAULT_ZONES !== 'undefined') {
  Object.entries(DEFAULT_ZONES).forEach(([sid, z]) => {
    if (z && z.coords && z.coords.length >= 3) TBS.zones[sid] = { coords: z.coords, color: z.color || '#8a6d3b' };
  });
  console.log('[Turb] โหลดโซนอิทธิพล', Object.keys(TBS.zones).length, 'โซน จาก data/zones.js');
} else {
  console.warn('[Turb] ⚠ ไม่พบ ../data/zones.js — ใช้ IDW ล้วน (ไม่มีโซนอิทธิพล)');
}

const tbSensorGroup = L.layerGroup().addTo(tbMap);

// ── Canvas contour overlay ──────────────────────────────────────────────────
const tbCanvas = document.createElement('canvas');
tbCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
tbMap.getPanes().overlayPane.appendChild(tbCanvas);
let _tbRedrawTimer = null;
const TB_OVER = 0.15, TB_RES = 100;

function tbRedraw(delay) {
  clearTimeout(_tbRedrawTimer);
  _tbRedrawTimer = setTimeout(tbDrawContour, delay == null ? 100 : delay);
}
tbMap.on('zoomend moveend', () => tbRedraw(50));
tbMap.on('move', () => { /* canvas ติด overlayPane — Leaflet transform ให้เอง */ });

function tbDrawContour() {
  const vb = tbMap.getBounds();
  const dlat = (vb.getNorth() - vb.getSouth()) * TB_OVER;
  const dlon = (vb.getEast() - vb.getWest()) * TB_OVER;
  const b = L.latLngBounds([vb.getSouth()-dlat, vb.getWest()-dlon], [vb.getNorth()+dlat, vb.getEast()+dlon]);
  const sw = tbMap.latLngToContainerPoint(b.getSouthWest());
  const ne = tbMap.latLngToContainerPoint(b.getNorthEast());
  const W = Math.abs(ne.x - sw.x), H = Math.abs(sw.y - ne.y);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let PW = Math.round(W * dpr), PH = Math.round(H * dpr);
  if (PW * PH > 4e6) { const sc = Math.sqrt(4e6 / (PW * PH)); PW = Math.round(PW*sc); PH = Math.round(PH*sc); }
  tbCanvas.width = PW; tbCanvas.height = PH;
  tbCanvas.style.width = W + 'px'; tbCanvas.style.height = H + 'px';
  const origin = tbMap.latLngToLayerPoint(b.getNorthWest());
  tbCanvas.style.transform = 'translate(' + origin.x + 'px,' + origin.y + 'px)';
  const ctx = tbCanvas.getContext('2d');
  ctx.clearRect(0, 0, PW, PH);
  if (!TBS.sensors.length) return;

  tbClearMemo();

  // 1) value grid
  const latN = b.getNorth(), latS = b.getSouth(), lonW = b.getWest(), lonE = b.getEast();
  const gv = new Float32Array((TB_RES+1)*(TB_RES+1));
  for (let j = 0; j <= TB_RES; j++) {
    const lat = latN - j/TB_RES * (latN - latS);
    for (let i = 0; i <= TB_RES; i++) {
      gv[j*(TB_RES+1)+i] = tbGridValue(lat, lonW + i/TB_RES * (lonE - lonW));
    }
  }

  // 2) mask (clip ตามขอบเขต MWA/STA ถ้ามี)
  const toXY = (lat, lon) => {
    const pt = tbMap.latLngToLayerPoint([lat, lon]);
    return [(pt.x - origin.x) * (PW / W), (pt.y - origin.y) * (PH / H)];
  };
  let maskData = null;
  if (_tbHasBounds) {
    const mc = document.createElement('canvas'); mc.width = PW; mc.height = PH;
    const mctx = mc.getContext('2d');
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, PW, PH);
    mctx.fillStyle = '#fff'; mctx.beginPath();
    for (const poly of [...STA_POLYS, ...MWA_POLYS]) {
      let first = true;
      for (const [la, lo] of poly.coords) {
        const [x, y] = toXY(la, lo);
        if (first) { mctx.moveTo(x, y); first = false; } else mctx.lineTo(x, y);
      }
      mctx.closePath();
    }
    mctx.fill('nonzero');
    maskData = mctx.getImageData(0, 0, PW, PH).data;
  }

  // 3) pixel fill (bilinear + LUT)
  const LUT = 256, lutMax = TB.THRESH.max;
  const lutR = new Uint8Array(LUT), lutG = new Uint8Array(LUT), lutB = new Uint8Array(LUT);
  for (let li = 0; li < LUT; li++) {
    const [r, g, bb] = tbColorRGB(li / (LUT-1) * lutMax);
    lutR[li] = r; lutG[li] = g; lutB[li] = bb;
  }
  const alpha = Math.round(TB.CONTOUR_ALPHA * 255);
  const img = ctx.createImageData(PW, PH);
  const px = img.data;
  const invLat = TB_RES / (latN - latS), invLon = TB_RES / (lonE - lonW);
  for (let py = 0; py < PH; py++) {
    const lat = latN - (py / PH) * (latN - latS);
    const fj = (latN - lat) * invLat;
    const j0 = Math.min(TB_RES - 1, Math.max(0, fj | 0));
    const ty = fj - j0, oty = 1 - ty;
    const r0 = j0 * (TB_RES+1), r1 = r0 + (TB_RES+1);
    for (let pxx = 0; pxx < PW; pxx++) {
      const idx4 = ((py * PW) + pxx) << 2;
      if (maskData && maskData[idx4] < 128) continue;
      const fi = (pxx / PW) * TB_RES;
      const i0 = Math.min(TB_RES - 1, Math.max(0, fi | 0));
      const tx = fi - i0;
      const v = gv[r0+i0]*(1-tx)*oty + gv[r0+i0+1]*tx*oty + gv[r1+i0]*(1-tx)*ty + gv[r1+i0+1]*tx*ty;
      if (v < -0.5) { px[idx4]=148; px[idx4+1]=152; px[idx4+2]=158; px[idx4+3]=128; continue; }
      const li = v <= 0 ? 0 : v >= lutMax ? LUT-1 : ((v / lutMax) * (LUT-1) + 0.5) | 0;
      px[idx4] = lutR[li]; px[idx4+1] = lutG[li]; px[idx4+2] = lutB[li]; px[idx4+3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);

  // 4) เส้นเกณฑ์ 1.0 / 4.0 NTU (marching squares อย่างย่อ) + ขอบโซนเทา
  for (const [level, style] of [[TB.THRESH.good, 'rgba(120,120,40,0.7)'], [TB.THRESH.limit, 'rgba(160,60,20,0.9)']]) {
    ctx.strokeStyle = style; ctx.lineWidth = level === TB.THRESH.limit ? 1.6 : 1.0;
    ctx.setLineDash(level === TB.THRESH.limit ? [7,4] : [3,3]);
    ctx.beginPath();
    for (let j = 0; j < TB_RES; j++) for (let i = 0; i < TB_RES; i++) {
      const v00 = gv[j*(TB_RES+1)+i],   v10 = gv[j*(TB_RES+1)+i+1];
      const v01 = gv[(j+1)*(TB_RES+1)+i], v11 = gv[(j+1)*(TB_RES+1)+i+1];
      if (v00 < -0.5 || v10 < -0.5 || v01 < -0.5 || v11 < -0.5) continue;
      const cb = [v00, v10, v11, v01].map(x => x >= level ? 1 : 0);
      const sum = cb[0]+cb[1]+cb[2]+cb[3];
      if (sum === 0 || sum === 4) continue;
      const y0 = (j / TB_RES) * PH, y1 = ((j+1) / TB_RES) * PH;
      const x0 = (i / TB_RES) * PW, x1 = ((i+1) / TB_RES) * PW;
      const ip = (a, c) => a / (a - c + 1e-9);
      const pts = [];
      if (cb[0] !== cb[1]) pts.push([x0 + ip(v00-level, v10-level)*(x1-x0), y0]);
      if (cb[1] !== cb[2]) pts.push([x1, y0 + ip(v10-level, v11-level)*(y1-y0)]);
      if (cb[3] !== cb[2]) pts.push([x0 + ip(v01-level, v11-level)*(x1-x0), y1]);
      if (cb[0] !== cb[3]) pts.push([x0, y0 + ip(v00-level, v01-level)*(y1-y0)]);
      if (pts.length >= 2) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); }
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // ขอบเส้นประ + ป้ายโซน down
  for (const [sid, z] of Object.entries(TBS.zones)) {
    if (!tbIsDown(sid)) continue;
    ctx.beginPath();
    let first = true, cx = 0, cy = 0;
    for (const [la, lo] of z.coords) {
      const [x, y] = toXY(la, lo); cx += x; cy += y;
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(70,74,80,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([7,5]);
    ctx.stroke(); ctx.setLineDash([]);
    cx /= z.coords.length; cy /= z.coords.length;
    ctx.font = '700 13px Sarabun,sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    const l2 = TBS.maint.has(String(sid)) ? 'ปิดซ่อมบำรุง' : 'ค่าเซนเซอร์ค้าง';
    ctx.strokeText('⚠ ไม่มีข้อมูล', cx, cy - 4); ctx.strokeText(l2, cx, cy + 13);
    ctx.fillStyle = '#464a50';
    ctx.fillText('⚠ ไม่มีข้อมูล', cx, cy - 4);
    ctx.font = '600 11px Sarabun,sans-serif'; ctx.fillText(l2, cx, cy + 13);
  }
}

// ── Markers + popup ─────────────────────────────────────────────────────────
function tbBuildMarkers() {
  tbSensorGroup.clearLayers();
  for (const s of TBS.sensors) {
    const down = tbIsDown(s);
    const c = down ? '#9aa0a6' : tbStatusColor(s.ntu == null ? -9 : s.ntu);
    const isSrc = s.type === 'pump' || s.type === 'plant';
    const sz = isSrc ? 15 : 10;
    const html = isSrc
      ? '<div style="position:relative;width:'+sz+'px;height:'+sz+'px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4));cursor:pointer;">'
        + '<svg viewBox="0 0 24 24" width="'+sz+'" height="'+sz+'"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="'+(down?'#9aa0a6':'#6b4c2a')+'" stroke="#fff" stroke-width="1.8"/><path d="M12 6.3c2.3 2.8 3.6 4.6 3.6 6.2a3.6 3.6 0 1 1-7.2 0c0-1.6 1.3-3.4 3.6-6.2z" fill="#fff"/></svg>'
        + '<div style="position:absolute;right:-3px;bottom:-3px;width:8px;height:8px;border-radius:50%;background:'+c+';border:1.6px solid #fff;"></div></div>'
      : '<div style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:'+c+';border:2.5px solid rgba(255,255,255,.95);box-shadow:0 2px 8px '+c+'88;cursor:pointer;"></div>';
    const badge = down
      ? (TBS.maint.has(String(s.id))
        ? '<div class="tb-badge tb-badge-maint">🔧 ปิดซ่อมบำรุง — ไม่ใช้ใน contour</div>'
        : '<div class="tb-badge tb-badge-stale">⚠ ค่าค้าง ≥'+TB.STALE_HOURS+' ชม. — ตัดออกอัตโนมัติ</div>')
      : '';
    const valTxt = s.ntu == null ? '—' : s.ntu.toFixed(2);
    const srcTxt = s.src === 'api' ? 'ค่าวัดจริง (API' + (TBS.turbField ? ': ' + TBS.turbField : '') + ')'
                 : s.src === 'firebase' ? 'ค่าล่าสุดจาก Firebase'
                 : '⚠ ค่าประมาณ (API ไม่ส่งความขุ่น)';
    const maintBtn = '<button class="tb-maint-btn '+(TBS.maint.has(String(s.id))?'on':'off')+'" onclick="tbToggleMaintenance(\''+String(s.id).replace(/'/g,"\\'")+'\')">'
      + (TBS.maint.has(String(s.id)) ? '✅ เปิดใช้งานสถานีนี้' : '🔧 ปิดซ่อมบำรุงสถานีนี้') + '</button>';
    L.marker([s.lat, s.lon], { icon: L.divIcon({ html, className:'', iconSize:[sz,sz], iconAnchor:[sz/2,sz/2] }) })
      .addTo(tbSensorGroup)
      .bindPopup('<div class="tb-pop"><h4>'+s.name+'</h4>'+badge+maintBtn
        + '<div class="tb-bigval" style="color:'+c+'">'+valTxt+' <span>NTU</span></div>'
        + '<div class="tb-row"><span>สถานะ</span><b style="color:'+c+'">'+(s.ntu==null?'ไม่มีข้อมูล':tbStatus(s.ntu))+'</b></div>'
        + '<div class="tb-row"><span>ที่มา</span><b>'+srcTxt+'</b></div>'
        + (s.area ? '<div class="tb-row"><span>พื้นที่</span><b>'+s.area+'</b></div>' : '')
        + '<div class="tb-row"><span>พิกัด</span><b>'+s.lat.toFixed(5)+', '+s.lon.toFixed(5)+'</b></div>'
        + '</div>', { maxWidth: 320 });
  }
}

// ── Hover tooltip ───────────────────────────────────────────────────────────
const tbTip = document.getElementById('tb-tip');
let _tipThrottle = false;
tbMap.on('mousemove', e => {
  if (_tipThrottle) return;
  _tipThrottle = true; setTimeout(() => _tipThrottle = false, 60);
  const { lat, lng } = e.latlng;
  if (_tbHasBounds) {
    let inside = false;
    for (const p of [...STA_POLYS, ...MWA_POLYS]) if (tbPointInPoly(lat, lng, p.coords)) { inside = true; break; }
    if (!inside) { tbTip.style.display = 'none'; return; }
  }
  if (!TBS.sensors.length) { tbTip.style.display = 'none'; return; }
  // snap
  let snap = null, sd = Infinity;
  for (const s of TBS.sensors) {
    const d = (s.lat-lat)**2 + (s.lon-lng)**2;
    if (d < sd) { sd = d; snap = s; }
  }
  const snapped = sd < 0.002*0.002;
  let label, val, status;
  if (snapped) {
    val = snap.ntu; label = tbIsDown(snap) ? (TBS.maint.has(String(snap.id)) ? '🔧 ปิดซ่อมบำรุง' : '⚠ ค่าค้าง — ไม่ใช้ใน contour') : snap.name;
    status = val == null ? 'ไม่มีข้อมูล' : tbStatus(val);
  } else {
    tbClearMemo();
    val = tbGridValue(lat, lng);
    label = TBS.timeLagged ? 'ค่าประมาณ (time-lagged)' : 'ค่าประมาณ (interpolated)';
    status = tbStatus(val);
  }
  document.getElementById('tb-tip-val').textContent = (val == null || val < -0.5) ? '— ไม่มีข้อมูล —' : val.toFixed(2) + ' NTU';
  document.getElementById('tb-tip-val').style.color = (val == null || val < -0.5) ? '#8a8f98' : tbStatusColor(val);
  document.getElementById('tb-tip-status').textContent = status;
  document.getElementById('tb-tip-label').textContent = label;
  document.getElementById('tb-tip-ll').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
  const pt = tbMap.latLngToContainerPoint(e.latlng);
  tbTip.style.left = (pt.x + 16) + 'px'; tbTip.style.top = (pt.y - 20) + 'px';
  tbTip.style.display = 'block';
});
tbMap.on('mouseout', () => tbTip.style.display = 'none');

// ── API poll ────────────────────────────────────────────────────────────────
function tbDetectField(valueObj) {
  if (TB.TURB_FIELD_OVERRIDE) return TB.TURB_FIELD_OVERRIDE;
  if (!valueObj) return null;
  for (const key of Object.keys(valueObj)) {
    for (const re of TB.TURB_FIELD_CANDIDATES) if (re.test(key)) return key;
  }
  return null;
}

function tbMapApi(raw) {
  const arr = Array.isArray(raw) ? raw : (raw.data || raw.stations || raw.result || []);
  if (arr.length && !TBS.turbField) {
    for (const st of arr) {
      const f = tbDetectField(st.value);
      if (f) { TBS.turbField = f; console.log('[Turb] ✅ พบ field ความขุ่นใน API: "' + f + '"'); break; }
    }
    if (!TBS.turbField && arr[0] && arr[0].value)
      console.warn('[Turb] ⚠ ไม่พบ field ความขุ่นใน API — keys ที่มี:', Object.keys(arr[0].value).join(', '),
        '\n→ ถ้ารู้ชื่อ field ใส่ใน TB.TURB_FIELD_OVERRIDE (js/config.js)');
  }
  return arr
    .filter(s => s.latitude != null && (s.longtitude != null || s.longitude != null))
    .map(s => {
      const code = (s.stationCode || '').toUpperCase();
      let type = 'monitor';
      if (['SP06','SP07','SP08','SP09','SP10'].includes(code)) type = 'plant';
      else if (code.startsWith('SP') || code.startsWith('SW')) type = 'pump';
      let ntu = null, src = 'none';
      if (TBS.turbField && s.value && s.value[TBS.turbField] != null) {
        const x = parseFloat(s.value[TBS.turbField]);
        if (isFinite(x) && x >= 0 && x < 1000) { ntu = x; src = 'api'; }
      }
      return {
        id: s.stationCode || s.id || 0,
        name: (s.stationName || 'สถานี').trim(),
        area: s.area || '', branch: s.branch || '',
        lat: parseFloat(s.latitude), lon: parseFloat(s.longtitude || s.longitude),
        ntu, src, type,
      };
    })
    .filter(s => s.lat && s.lon);
}

function tbFillFromHistoryOrFallback() {
  // สถานีที่ API ไม่ให้ค่า: ใช้ค่าล่าสุดจาก history (≤ 3 ชม.) → ไม่มีก็ fallback
  let nHist = 0, nFb = 0;
  const cutoff = Date.now() - 3 * 3600e3;
  for (const s of TBS.sensors) {
    if (s.ntu != null) continue;
    const pts = TBS.hist[String(s.id)];
    if (pts && pts.length && pts[pts.length-1].ts >= cutoff) {
      s.ntu = pts[pts.length-1].ntu; s.src = 'firebase'; nHist++;
    } else {
      s.ntu = TB.TURB_FALLBACK_DEFAULT; s.src = 'fallback'; nFb++;
    }
  }
  TBS.usingFallbackValues = nFb > 0 && nFb >= TBS.sensors.length * 0.5;
  if (nHist || nFb) console.log('[Turb] เติมค่า: history=' + nHist + ' fallback=' + nFb);
}

async function tbPoll() {
  const badge = document.getElementById('tb-live-badge');
  try {
    const res = await fetch(TB.API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const mapped = tbMapApi(await res.json());
    if (!mapped.length) throw new Error('ไม่มีข้อมูลสถานี');
    TBS.sensors = mapped;
    // เสริมพิกัด/รายชื่อจาก SENSORS_FALLBACK (data/stations.js) สำหรับสถานีที่ API ไม่มี
    if (typeof SENSORS_FALLBACK !== 'undefined') {
      const have = new Set(TBS.sensors.map(s => s.lat.toFixed(3)+','+s.lon.toFixed(3)));
      for (const fb of SENSORS_FALLBACK) {
        const k = fb.lat.toFixed(3)+','+fb.lon.toFixed(3);
        if (!have.has(k)) TBS.sensors.push({ id: fb.id, name: fb.name, area: fb.area||'', branch: fb.branch||'',
          lat: fb.lat, lon: fb.lon, ntu: null, src: 'none', type: fb.type || 'monitor' });
      }
    }
    TBS.apiStatus = 'live';
    const now = Date.now();
    tbFillFromHistoryOrFallback();
    tbRecordHistory(now);
    tbFbSaveReadings(now);
    tbDetectStale();
    badge.textContent = TBS.turbField
      ? '● Live — ' + new Date().toLocaleTimeString('th-TH')
      : '◐ Live (ไม่มีค่าความขุ่นใน API — ใช้ history/ประมาณ)';
    badge.className = 'tb-badge-live ' + (TBS.turbField ? 'ok' : 'warn');
  } catch (err) {
    console.warn('[Turb] API error:', err.message);
    TBS.apiStatus = 'fallback';
    if (!TBS.sensors.length && typeof SENSORS_FALLBACK !== 'undefined') {
      TBS.sensors = SENSORS_FALLBACK.map(fb => ({ id: fb.id, name: fb.name, area: fb.area||'', branch: fb.branch||'',
        lat: fb.lat, lon: fb.lon, ntu: null, src: 'none', type: fb.type || 'monitor' }));
      tbFillFromHistoryOrFallback();
    }
    badge.textContent = '⚠ Offline — ' + (TBS.sensors.length ? 'ข้อมูลสำรอง' : 'ไม่มีข้อมูล');
    badge.className = 'tb-badge-live err';
  }
  tbRebuildAll();
}

function tbRebuildAll() {
  tbClearMemo();
  tbBuildMarkers();
  tbRedraw(50);
  tbRenderPanel();
  const fbBanner = document.getElementById('tb-sim-banner');
  fbBanner.style.display = TBS.usingFallbackValues ? 'block' : 'none';
}

// ── Sidebar panel ───────────────────────────────────────────────────────────
function tbRenderPanel() {
  const tl = document.getElementById('tb-tlag-toggle');
  if (tl) tl.checked = TBS.timeLagged;
  const ks = document.getElementById('tb-ksettle');
  if (ks && document.activeElement !== ks) ks.value = TBS.kSettle;
  const list = document.getElementById('tb-maint-list');
  if (!list) return;
  const rows = [];
  TBS.maint.forEach(code => {
    const s = TBS.sensors.find(x => String(x.id) === code);
    const nm = s ? s.name.replace('สถานีสูบจ่ายน้ำ','สจ.').replace('โรงงานผลิตน้ำ','รง.') : code;
    rows.push('<div class="tb-mrow"><span>🔧 ' + nm + '</span><button onclick="tbToggleMaintenance(\'' + code + '\')">เปิด</button></div>');
  });
  TBS.stale.forEach(code => {
    if (TBS.maint.has(code)) return;
    const s = TBS.sensors.find(x => String(x.id) === code);
    const nm = s ? s.name.replace('สถานีสูบจ่ายน้ำ','สจ.').replace('โรงงานผลิตน้ำ','รง.') : code;
    rows.push('<div class="tb-mrow stale"><span>⚠ ' + nm + ' (ค่าค้าง)</span></div>');
  });
  list.innerHTML = rows.length ? rows.join('') : '<div class="tb-none">— ไม่มีสถานีปิด/ค่าค้าง —</div>';
}
window.tbSetTimeLagged = function(on) {
  TBS.timeLagged = !!on;
  try { localStorage.setItem(TB.LS_KEYS.tlag, on ? '1' : '0'); } catch(e) {}
  tbRebuildAll();
};
window.tbSetKSettle = function(v) {
  const x = parseFloat(v);
  if (isFinite(x) && x >= 0 && x <= 1) {
    TBS.kSettle = x;
    try { localStorage.setItem(TB.LS_KEYS.ksettle, String(x)); } catch(e) {}
    tbRebuildAll();
  }
};

// ── Auth (Firebase login สำหรับ sync) ───────────────────────────────────────
window.tbLogin = async function() {
  const em = document.getElementById('tb-email').value, pw = document.getElementById('tb-pass').value;
  if (!window._fbSignIn) { alert('Firebase ยังไม่พร้อม'); return; }
  try {
    await window._fbSignIn(window._fbAuth, em, pw);
    document.getElementById('tb-auth-status').textContent = '✅ ' + em;
    console.log('[Turb] login สำเร็จ — เขียน history/maintenance ขึ้น Firebase ได้แล้ว');
  } catch(e) { alert('เข้าสู่ระบบไม่สำเร็จ: ' + e.code); }
};

// ── Boot ────────────────────────────────────────────────────────────────────
(async function tbBoot() {
  try { TBS.timeLagged = localStorage.getItem(TB.LS_KEYS.tlag) !== '0' && TB.TIME_LAGGED_DEFAULT || localStorage.getItem(TB.LS_KEYS.tlag) === '1'; } catch(e) {}
  try { const k = parseFloat(localStorage.getItem(TB.LS_KEYS.ksettle)); if (isFinite(k)) TBS.kSettle = k; } catch(e) {}
  tbLoadHistLocal();
  tbLoadMaintLocal();
  // รอ firebase (สูงสุด 8 วิ) แล้วโหลด history + maintenance
  const t0 = Date.now();
  await new Promise(res => {
    const iv = setInterval(() => {
      if (window._fbReady || Date.now() - t0 > 8000) { clearInterval(iv); res(); }
    }, 250);
  });
  await Promise.all([tbFbLoadHistory(), tbFbLoadMaint()]);
  await tbPoll();
  setInterval(tbPoll, TB.POLL_INTERVAL);
  console.log('[Turb] 🟤 Turbidity Contour v' + TB.VERSION + ' พร้อม — สถานี:', TBS.sensors.length,
    '| time-lag:', TBS.timeLagged ? 'ON' : 'OFF', '| K_settle:', TBS.kSettle + '/h');
})();
