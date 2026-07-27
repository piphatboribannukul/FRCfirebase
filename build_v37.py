#!/usr/bin/env python3
# build_v37.py — เฟส 1: แยก index.html (HTML+CSS pixel-perfect) + app.js (logic) + data/*.js
import re, os

APP_VER = '37.0'
SRC = 'index.html'
lines = open(SRC, encoding='utf-8').read().split('\n')  # 0-indexed

# ── boundaries จากการ map โครงสร้าง (1-indexed → 0-indexed) ──
HEAD_END = 2263          # </head> ที่บรรทัด 2263
BODY_OPEN = 2264         # <body>
# body classic script blocks (1-indexed inclusive: <script> .. </script>)
BODY_SCRIPTS = [(3251,9864),(9906,13178),(13200,13224),(13226,13248),(13352,14333),
                (14336,14956),(14959,15041),(15045,15258),(15261,15343),(15454,16129),(16136,18173)]

def seg(a, b):  # 1-indexed inclusive
    return lines[a-1:b]

# ── 1. index.html ใหม่ ──
out = []
out += seg(1, HEAD_END - 1)            # ถึงก่อน </head> (รวม CSS + head scripts เดิม verbatim)
out.append('</head>')
out.append('<body>')
cursor = BODY_OPEN + 1                  # หลัง <body>
for (a, b) in BODY_SCRIPTS:
    if a > cursor:
        out += seg(cursor, a - 1)       # HTML chunk ก่อน script
    cursor = b + 1                      # ข้าม script block
# ท้ายไฟล์หลัง script สุดท้าย (</body></html>)
tail = seg(cursor, len(lines))
tail = [t for t in tail if t.strip() not in ('</body></html>',)]
out += tail
# script includes ท้าย body
out.append('<!-- ── data layer (extracted, DO NOT EDIT) ── -->')
for f in ['stations','zones','pipes','rtu','pressure','boundaries','assets']:
    out.append(f'<script src="data/{f}.js"></script>')
out.append('<!-- ── application ── -->')
out.append('<script src="app.js"></script>')
out.append('</body></html>')
html = '\n'.join(out)

# version strings ใน HTML static (first paint)
html = html.replace('Real-Time Chlorine Contour v36.3 tempK', f'Real-Time Chlorine Contour v{APP_VER}')
html = html.replace('⬡ V36.3+TEMP', f'⬡ V{APP_VER}+TEMP')
html = re.sub(r'⚠ v36\.3', f'⚠ v{APP_VER}', html)

open('build/index.html', 'w', encoding='utf-8').write(html)

# ── 2. app.js ──
js = [f"// FRCContour v{APP_VER} — MWA Water Quality Division",
      "// สร้างใหม่จาก v36.3: แยก data → data/*.js, ระบบ version จุดเดียว, ตัด dead code",
      "'use strict';" if False else "",  # คงพฤติกรรม non-strict เดิม
      f"const APP_VERSION = '{APP_VER}';",
      "function appBadge(suffix){ return '⬡ V' + APP_VERSION + (suffix ? '+' + suffix : ''); }",
      ""]
for i, (a, b) in enumerate(BODY_SCRIPTS):
    js.append(f"// ═══════════ [block {i+1}/{len(BODY_SCRIPTS)} — original lines {a+1}-{b-1}] ═══════════")
    js += seg(a + 1, b - 1)             # เนื้อใน script ไม่รวม tag
code = '\n'.join(js)

# ── 2a. แทน blob ด้วย reference จาก data/*.js ──
def drop_line(pat, must=True):
    global code
    n = len(re.findall(pat, code))
    assert n == 1 or not must, f'{pat}: found {n}'
    code = re.sub(pat, '// (moved to data/)', code)

# top-level const ที่ย้ายไป data/ — ลบทิ้ง (global จาก data file มองเห็นได้)
drop_line(r'(?m)^const SENSORS_FALLBACK = .*$')
drop_line(r'(?m)^const STA_POLYS = .*$')
drop_line(r'(?m)^const MWA_POLYS = .*$')
drop_line(r'(?m)^const _PIPE_GRID_B64 = .*$')
drop_line(r'(?m)^const _PRESSURE_FACTOR_B64 = .*$')
# function-local → alias
code = re.sub(r"(?m)^(\s*)const b64 = 'H4sIAHrV12k.*$", r'\1const b64 = PIPE_NET_KMZ_B64; // data/pipes.js', code)
code = re.sub(r"(?m)^(\s*)const _plB64 = '.*$", r'\1const _plB64 = PIPE_LINES_B64; // data/pipes.js', code)
code = re.sub(r"(?m)^(\s*)const b64 = 'H4sIAP2m3Gk.*$", r'\1const b64 = RTU_STATIONS_B64; // data/rtu.js', code)
code = re.sub(r"(?m)^(\s*)const _rtuCompB64 = '.*$", r'\1const _rtuCompB64 = RTU_COMP_B64; // data/rtu.js', code)
code = re.sub(r"(?m)^(\s*)'data:image/png;base64,iVBOR.*$", r'\1EPANET_OVERLAY_PNG, // data/assets.js', code)
code = re.sub(r"(?m)^(\s*)const _V30_DIST_DATA = \{.*$", r'\1// _V30_DIST_DATA → data/boundaries.js', code)
code = re.sub(r"(?m)^(\s*)const _V30_NONT_SP_SUB = \{.*$", r'\1// _V30_NONT_SP_SUB → data/boundaries.js', code)

# DEFAULT_ZONES หลายบรรทัด — ลบแบบ balanced
cl = code.split('\n')
start = next(i for i, ln in enumerate(cl) if ln.startswith('const DEFAULT_ZONES = {'))
depth = 0; end = start
for j in range(start, len(cl)):
    for ch in cl[j]:
        if ch in '{[': depth += 1
        elif ch in '}]': depth -= 1
    if depth == 0:
        end = j; break
cl[start:end+1] = ['// DEFAULT_ZONES → data/zones.js']
code = '\n'.join(cl)

# ── 2b. version single-source: แทน hardcoded runtime strings ──
code = code.replace("_v2b.textContent = '⬡ V36.3+TEMP·RTU';", "_v2b.textContent = appBadge('TEMP·RTU');")
code = code.replace("_v2b.textContent = '⬡ V36.3+TEMP';", "_v2b.textContent = appBadge('TEMP');")
code = re.sub(r"⚠ v36\.3", f"⚠ v{APP_VER}", code)
code = code.replace('v36.3 tempK · Jul 2026', f'v{APP_VER} · Jul 2026')
html = html.replace('v36.3 tempK · Jul 2026', f'v{APP_VER} · Jul 2026').replace('v36.3 — Jul 2026', f'v{APP_VER} — Jul 2026').replace('FRCContour v36.3', f'FRCContour v{APP_VER}')

open('build/app.js', 'w', encoding='utf-8').write(code + '\n')

print(f"index.html: {os.path.getsize('build/index.html')/1024:.0f} KB, {html.count(chr(10))+1} lines")
print(f"app.js    : {os.path.getsize('build/app.js')/1024:.0f} KB, {code.count(chr(10))+1} lines")
