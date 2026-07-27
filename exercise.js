// exercise.js — เรียกใช้ฟีเจอร์หลักจริง ๆ ใน jsdom หา runtime error
const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf-8')
  .replace(/<script src="https:[^"]*"><\/script>/g, '')
  .replace(/<link[^>]*https:[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/g, '')
  .replace(/<script src="(?:data\/\w+|app)\.js"><\/script>/g, '');

const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.github.io/TEST/', pretendToBeVisual: true });
const w = dom.window;
w.fetch = () => Promise.reject(new Error('offline-sim'));
w.XLSX = {}; w.THREE = new Proxy(function(){}, { get: () => new Proxy(function(){}, { get: () => () => ({}) , construct: () => ({}) }), construct: () => ({}) });
w.Chart = function(){ return { update(){}, destroy(){}, data: { datasets: [] } }; };
w.Chart.register = () => {};
w.HTMLCanvasElement.prototype.getContext = function() {
  const self = this;
  const imgData = () => ({ data: new Uint8ClampedArray(4 * 500 * 500), width: 500, height: 500 });
  return new Proxy({}, { get: (t, k) => {
    if (k === 'canvas') return self;
    if (k === 'getImageData' || k === 'createImageData') return imgData;
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  }, set: () => true });
};
w.URL.createObjectURL = () => 'blob:stub';
w.scrollTo = () => {};
w.DecompressionStream = DecompressionStream; w.CompressionStream = CompressionStream;
w.Response = Response; w.Blob = Blob; w.structuredClone = structuredClone;
w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);
w.alert = () => {}; w.confirm = () => true; w.prompt = () => null;

const leafletSrc = fs.readFileSync('node_modules/leaflet/dist/leaflet.js', 'utf-8');
const order = ['data/stations.js','data/zones.js','data/pipes.js','data/rtu.js','data/pressure.js','data/boundaries.js','data/assets.js','app.js'];
let combined = leafletSrc + '\n';
for (const f of order) combined += fs.readFileSync(f, 'utf-8') + '\n';

// ── ชุดทดสอบ — รันหลัง async โหลดเสร็จ (5s) ──
combined += `
;setTimeout(() => {
  const tests = [
    ['SENSORS filled',        () => { if (SENSORS.length < 50) throw new Error('only ' + SENSORS.length); }],
    ['buildMarkers',          () => buildMarkers()],
    ['buildIdwCache',         () => buildIdwCache()],
    ['redrawContour',         () => redrawContour(0)],
    ['updateStats',           () => updateStats()],
    ['renderTab',             () => renderTab()],
    ['setParam(ec)',          () => setParam('ec')],
    ['redraw in EC',          () => redrawContour(0)],
    ['setParam(frc)',         () => setParam('frc')],
    ['toggleTempCorr(on)',    () => toggleTempCorr(true)],
    ['updateTempFactor',      () => updateTempFactor(SENSORS)],
    ['toggleTempCorr(off)',   () => toggleTempCorr(false)],
    ['_frcDiag(ดินแดง)',      () => window._frcDiag(13.7563, 100.5652)],
    ['toggleLayer(fill)',     () => { toggleLayer('fill'); toggleLayer('fill'); }],
    ['toggleLayer(sensors)',  () => { toggleLayer('sensors'); toggleLayer('sensors'); }],
    ['toggleLayer(mwa)',      () => { toggleLayer('mwa'); toggleLayer('mwa'); }],
    ['toggleLayer(pipes)',    () => { toggleLayer('pipes'); toggleLayer('pipes'); }],
    ['toggleLayer(thresh)',   () => { toggleLayer('thresh'); toggleLayer('thresh'); }],
    ['toggleLayer(rtu)',      () => { toggleLayer('rtu'); toggleLayer('rtu'); }],
    ['appBadge',              () => { const b = appBadge('TEMP'); if (!b.includes('37')) throw new Error(b); }],
  ];
  let pass = 0, fail = 0;
  for (const [name, fn] of tests) {
    try { fn(); console.log('PASS ' + name); pass++; }
    catch (e) { console.log('FAIL ' + name + ' → ' + e.message); fail++; }
  }
  console.log('SUMMARY: ' + pass + ' pass, ' + fail + ' fail');
}, 5000);
`;

const errors = [];
w.onerror = (msg) => { errors.push(String(msg)); return true; };
try { w.eval(combined); } catch (e) { console.log('FATAL:', e.message); process.exit(1); }
setTimeout(() => {
  if (errors.length) console.log('window errors:', errors.slice(0, 5).join(' | '));
  process.exit(0);
}, 9000);
