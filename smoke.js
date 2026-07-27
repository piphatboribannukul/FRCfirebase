// smoke.js — jsdom harness: หา uncaught error ตัวแรกใน app.js
const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf-8')
  // ตัด external scripts/CSS (โหลดไม่ได้ใน sandbox) — จะ inject เอง
  .replace(/<script src="https:[^"]*"><\/script>/g, '')
  .replace(/<link[^>]*https:[^>]*>/g, '')
  // ตัด head inline scripts (firebase module ฯลฯ) — สนใจเฉพาะ app.js
  .replace(/<script type="module">[\s\S]*?<\/script>/g, '')
  // ตัด data+app script tags — inject เองตามลำดับ
  .replace(/<script src="(?:data\/\w+|app)\.js"><\/script>/g, '');

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  url: 'https://example.github.io/TEST/',
  pretendToBeVisual: true,
});
const w = dom.window;

// ── stubs ──
w.fetch = () => Promise.reject(new Error('offline-sim'));
w.XLSX = {}; w.THREE = {}; w.Chart = function(){ return { update(){}, destroy(){} }; };
w.Chart.register = () => {};
// canvas stub (jsdom ไม่มี canvas จริง)
w.HTMLCanvasElement.prototype.getContext = function() {
  const noop = () => {};
  return new Proxy({}, { get: (t, k) => (k === 'canvas' ? this : noop) });
};
w.URL.createObjectURL = () => 'blob:stub';
w.scrollTo = () => {};
w.localStorage.clear();
// web APIs จาก Node runtime (jsdom ไม่มี)
w.DecompressionStream = DecompressionStream;
w.CompressionStream = CompressionStream;
w.Response = Response;
w.Blob = Blob;
w.structuredClone = structuredClone;
w.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 16);

// Leaflet จริงจาก npm
const leafletSrc = fs.readFileSync('node_modules/leaflet/dist/leaflet.js', 'utf-8');
w.eval(leafletSrc);

// ── จับ error ──
const errors = [];
w.onerror = (msg, src, line, col, err) => { errors.push({ msg: String(msg), line, col, stack: err && err.stack }); return true; };
w.addEventListener('unhandledrejection', e => errors.push({ msg: 'unhandledrejection: ' + (e.reason && e.reason.message) }));

// ── รันตามลำดับจริง (รวมเป็น script เดียว — const แชร์ scope เหมือน global lexical env ใน browser) ──
const order = ['data/stations.js','data/zones.js','data/pipes.js','data/rtu.js','data/pressure.js','data/boundaries.js','data/assets.js','app.js'];
let offset_map = [];
let combined = '';
for (const f of order) {
  const src = fs.readFileSync(f, 'utf-8');
  offset_map.push({ file: f, start: combined.split('\n').length });
  combined += src + '\n';
}
combined += `
;setTimeout(() => {
  console.log('FINAL: SENSORS=' + (typeof SENSORS!=='undefined'?SENSORS.length:'?')
    + ' | apiStatus=' + (typeof apiStatus!=='undefined'?apiStatus:'?')
    + ' | clock=' + (document.getElementById('clock')||{}).textContent);
}, 4000);
`;
try {
  w.eval(combined);
  console.log('ALL SCRIPTS OK');
  setTimeout(() => {
    if (errors.length) console.log('ERRORS:', JSON.stringify(errors.slice(0, 5), null, 1));
    process.exit(0);
  }, 6000);
  process.on('unhandledRejection', r => console.log('NODE unhandledRejection:', r && r.message, (r && r.stack || '').split('\n')[1] || ''));
} catch (e) {
  console.log('DIE →', e.message);
  const m = (e.stack || '').match(/<anonymous>:(\d+):(\d+)/);
  if (m) {
    const gl = parseInt(m[1]);
    const ent = [...offset_map].reverse().find(o => gl >= o.start);
    console.log(`  ที่: ${ent.file} line ${gl - ent.start + 1} (global ${gl})`);
    const lines = combined.split('\n');
    for (let k = Math.max(0, gl-3); k < Math.min(lines.length, gl+2); k++)
      console.log(`  ${k+1}: ${lines[k].slice(0,110)}`);
  }
}
if (errors.length) console.log('window.onerror:', JSON.stringify(errors.slice(0,3), null, 1));

// สถานะหลังรัน
try {
  console.log('\nสถานะ: SENSORS =', w.eval('typeof SENSORS !== "undefined" ? SENSORS.length : "undef"'),
              '| map =', w.eval('typeof map'));
} catch(e) {}
