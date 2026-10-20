#!/usr/bin/env python3
"""สร้างข้อมูลเมือง 3 มิติรอบสถานีวัดคุณภาพน้ำ ล่วงหน้า (ใช้กับ frc3d.js)          [17 ต.ค. 2569]

ดึงข้อมูลอาคาร/ต้นไม้/สวน/ถนน/เขตวัด จาก OpenStreetMap (Overpass API) รอบทุกสถานีใน data/stations.js
แล้วเก็บเป็นไฟล์ data/city/<ไฟล์>.json + data/city/index.json
หน้าเว็บโหลดไฟล์เหล่านี้จาก GitHub Pages ตรงๆ → เปิดได้ทันทีทุกเครื่อง ไม่ต้องรอ Overpass

ใช้:  python tools/build_city.py            (สร้างเฉพาะไฟล์ที่ยังไม่มี/เก่ากว่า 25 วัน)
      python tools/build_city.py --force    (สร้างใหม่ทั้งหมด)
      python tools/build_city.py --only SP12,59
เติมอาคารที่ OSM ยังไม่มี จาก Overture Maps (รวมรูปอาคารที่ Google/Microsoft สกัดจากภาพดาวเทียม)
  ต้องติดตั้ง: pip install overturemaps   (ถ้าไม่มี จะข้ามขั้นนี้และใช้ OSM อย่างเดียว · ปิดได้ด้วย --no-overture)
ข้อมูล © OpenStreetMap contributors (ODbL) · Overture Maps Foundation (ODbL/CDLA) · Google Open Buildings (CC BY 4.0) · Microsoft (ODbL)
"""
import argparse, json, math, os, re, shutil, subprocess, sys, tempfile, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'city')
RADIUS = 670            # ม. (frc3d.js สร้างเมืองมีสี 550 ม. + เผื่อสถานีในกลุ่มเดียวกันห่างกันได้ถึง 120 ม.)
CLUSTER_M = 120         # สถานีที่ห่างกันไม่เกินนี้ใช้ไฟล์เดียวกัน (เช่น TR1–3, Dis1–2 ที่บางเขน)
MAX_AGE_DAYS = 25
OVT_VERSION = 1          # เพิ่มเลขนี้เมื่อเปลี่ยนวิธีรวมอาคาร → สร้างไฟล์ใหม่อัตโนมัติ
DATA_VERSION = 2         # 2 = เก็บชื่อถนน (name / name:th) สำหรับป้ายชื่อถนนใน frc3d · เพิ่มเลขเมื่อเปลี่ยนข้อมูลที่เก็บ → สร้างใหม่ทุกสถานี
ENDPOINTS = ['https://overpass-api.de/api/interpreter',
             'https://overpass.kumi.systems/api/interpreter',
             'https://overpass.private.coffee/api/interpreter']
UA = 'FRCContour-3D-city-builder/1.0 (MWA water quality; github.com/piphatboribannukul/FRCfirebase)'
KEEP_TAGS = {'building', 'building:levels', 'height', 'building:height', 'min_height', 'building:min_level',
             'roof:shape', 'roof:colour', 'roof:color', 'building:colour', 'building:color', 'colour',
             'amenity', 'religion', 'natural', 'leisure', 'landuse', 'highway', 'bridge', 'tunnel', 'man_made',
             'railway', 'layer', 'barrier', 'lanes'}


def load_stations():
    src = open(os.path.join(ROOT, 'data', 'stations.js'), encoding='utf-8').read()
    m = re.search(r'SENSORS_FALLBACK\s*=\s*(\[.*\])\s*;', src, re.S)
    if not m:
        sys.exit('อ่าน data/stations.js ไม่ได้')
    return [s for s in json.loads(m.group(1)) if isinstance(s.get('lat'), (int, float)) and s['lat'] > 0]


def dist_m(a, b):
    k = 111320 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot((a[1] - b[1]) * k, (a[0] - b[0]) * 110540)


def query(lat, lon, r):
    A = f'(around:{r},{lat:.6f},{lon:.6f})'
    return ('[out:json][timeout:120];('
            f'way["building"]{A};relation["building"]["type"="multipolygon"]{A};'
            f'node["natural"="tree"]{A};way["natural"="tree_row"]{A};'
            f'way["leisure"~"^(park|garden|golf_course)$"]{A};'
            f'way["landuse"~"^(grass|forest|recreation_ground|cemetery|meadow|village_green|orchard)$"]{A};'
            f'way["natural"~"^(wood|scrub|grassland)$"]{A};'
            f'way["highway"~"^(trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"]{A};'
            f'node["man_made"="stupa"]{A};way["man_made"="stupa"]{A};'
            f'way["amenity"="place_of_worship"]{A};relation["amenity"="place_of_worship"]{A};'
            f'way["railway"~"^(light_rail|subway|monorail|rail)$"]{A};way["barrier"~"^(fence|wall|retaining_wall)$"]{A};'
            f'way["amenity"~"^(hospital|school|university|college|clinic)$"]{A};relation["amenity"~"^(hospital|school|university|college|clinic)$"]{A};'
            ');out body geom qt;')


def fetch(q):
    data = urllib.parse.urlencode({'data': q}).encode()
    last = None
    for attempt in range(6):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded'})
            with urllib.request.urlopen(req, timeout=180) as r:
                j = json.loads(r.read().decode('utf-8'))
            if 'elements' in j:
                return j
            last = RuntimeError(j.get('remark', 'ไม่มี elements'))
        except Exception as e:  # 429/504/timeout → พักแล้วลองเซิร์ฟเวอร์ถัดไป
            last = e
        wait = 20 * (attempt + 1)
        print(f'    ลองใหม่ใน {wait} วิ ({last})', flush=True)
        time.sleep(wait)
    raise last


def overture_buildings(lat, lon, r, sample=None):
    """อาคารจาก Overture Maps ในกรอบรอบสถานี (GeoJSON features) — ใช้คำสั่ง overturemaps (pip install overturemaps)"""
    if sample:
        return json.load(open(sample, encoding='utf-8')).get('features', [])
    exe = shutil.which('overturemaps')
    if not exe:
        print('    (ข้าม Overture: ไม่พบคำสั่ง overturemaps)', flush=True)
        return []
    k = 111320 * math.cos(math.radians(lat))
    bbox = f'{lon - r / k:.6f},{lat - r / 110540:.6f},{lon + r / k:.6f},{lat + r / 110540:.6f}'
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, 'b.geojson')
        for attempt in range(3):
            try:
                subprocess.run([exe, 'download', f'--bbox={bbox}', '-f', 'geojson', '--type=building', '-o', out],
                               check=True, timeout=900, capture_output=True)
                return json.load(open(out, encoding='utf-8')).get('features', [])
            except Exception as e:
                print(f'    Overture ลองใหม่ ({e})', flush=True)
                time.sleep(15)
    return []


def _pip(x, z, ring):
    ins = False
    for i in range(len(ring)):
        x1, z1 = ring[i]; x2, z2 = ring[i - 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / ((z2 - z1) or 1e-12) + x1:
            ins = not ins
    return ins


def merge_overture(js, feats):
    """เพิ่มอาคาร Overture ที่ไม่ได้มาจาก OSM และไม่ทับอาคาร OSM เดิม → elements รูปแบบเดียวกัน (t.src = 'ovt')"""
    lat0, lon0 = js['c']; kx, kz = js['k']
    def xz(lon, lat):
        return (lon - lon0) * kx, (lat - lat0) * kz
    osm = []
    for e in js['e']:
        if e['y'] == 'w' and 'building' in e['t']:
            pts, x, z = [], 0, 0
            g = e['g']
            for i in range(0, len(g), 2):
                x += g[i]; z += g[i + 1]; pts.append((x / 10, z / 10))
            xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
            osm.append((min(xs), min(zs), max(xs), max(zs), pts))
    cell = {}
    for i, b in enumerate(osm):
        for gx in range(int(b[0] // 50), int(b[2] // 50) + 1):
            for gz in range(int(b[1] // 50), int(b[3] // 50) + 1):
                cell.setdefault((gx, gz), []).append(i)
    def inside_osm(x, z):
        for i in cell.get((int(x // 50), int(z // 50)), []):
            b = osm[i]
            if b[0] <= x <= b[2] and b[1] <= z <= b[3] and _pip(x, z, b[4]):
                return True
        return False
    added = 0
    for n, f in enumerate(feats):
        p = f.get('properties') or {}
        src = p.get('sources') or []
        if isinstance(src, str):
            try: src = json.loads(src)
            except Exception: src = []
        if any('openstreetmap' in str(s.get('dataset', '')).lower() for s in src if isinstance(s, dict)):
            continue
        geom = f.get('geometry') or {}
        polys = [geom['coordinates']] if geom.get('type') == 'Polygon' else geom.get('coordinates', []) if geom.get('type') == 'MultiPolygon' else []
        for poly in polys:
            if not poly or len(poly[0]) < 4:
                continue
            ring = [xz(c[0], c[1]) for c in poly[0]]
            cx = sum(q[0] for q in ring[:-1]) / (len(ring) - 1); cz = sum(q[1] for q in ring[:-1]) / (len(ring) - 1)
            if inside_osm(cx, cz):
                continue
            area = abs(sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring)))) / 2
            if area < 12:
                continue
            g, px, pz = [], 0, 0
            for i, (x, z) in enumerate(ring):
                X, Z = round(x * 10), round(z * 10)
                g += [X, Z] if i == 0 else [X - px, Z - pz]
                px, pz = X, Z
            t = {'building': 'yes', 'src': 'ovt'}
            if p.get('height'):
                t['height'] = str(round(float(p['height']), 1))
            if p.get('num_floors'):
                t['building:levels'] = str(int(p['num_floors']))
            js['e'].append({'y': 'w', 'id': -(n + 1), 't': t, 'g': g})
            added += 1
    js['ovt'] = added
    return added


def slim(j, name, lat0, lon0):
    """ตัดข้อมูลที่ไม่ใช้ + เก็บพิกัดแบบย่อ (เดซิเมตรจากจุดกลาง เข้ารหัสผลต่าง) + เรียงลำดับคงที่ (git diff เล็ก)
    รูปแบบไฟล์ (frc3d.js ถอดกลับ): {"v":2,"c":[lat0,lon0],"k":[kx,kz],"e":[{"y":"w|n|r","id":..,"t":{tags},"g":[x,z,dx,dz,...]}]}
    x = ตะวันออก, z = เหนือ (หน่วย 0.1 ม.) · relation: "m":[[role,[...]],...]"""
    kx, kz = 111320 * math.cos(math.radians(lat0)), 110540.0
    def rnd(g):
        out, px, pz = [], 0, 0
        for i, p in enumerate(g):
            x, z = round((p['lon'] - lon0) * kx * 10), round((p['lat'] - lat0) * kz * 10)
            out += [x, z] if i == 0 else [x - px, z - pz]
            px, pz = x, z
        return out
    out = []
    for el in j.get('elements', []):
        t = {k: v for k, v in (el.get('tags') or {}).items() if k in KEEP_TAGS}
        tags_all = el.get('tags') or {}
        if 'building:part' in tags_all:
            continue
        if tags_all.get('name') and (tags_all.get('building') or tags_all.get('amenity') in
                                     ('place_of_worship', 'hospital', 'school', 'university', 'college', 'clinic')):
            t['name'] = tags_all['name']                     # ใช้ทำป้ายชื่ออาคาร
        if tags_all.get('highway') and (tags_all.get('name') or tags_all.get('name:th')):
            t['name'] = tags_all.get('name:th') or tags_all['name']   # ชื่อถนน → ป้ายชื่อถนนใน frc3d
        if not t:
            continue
        e = {'y': el['type'][0], 'id': el['id'], 't': t}
        if el['type'] == 'node':
            e['g'] = rnd([el])
        elif el['type'] == 'way':
            if not el.get('geometry'):
                continue
            e['g'] = rnd(el['geometry'])
        elif el['type'] == 'relation':
            mem = [[m.get('role', ''), rnd(m['geometry'])]
                   for m in el.get('members', []) if m.get('type') == 'way' and m.get('geometry')]
            if not mem:
                continue
            e['m'] = mem
        out.append(e)
    out.sort(key=lambda e: (e['y'], e['id']))
    return {'v': 2, 'generator': 'tools/build_city.py', 'station': name, 'copyright': '© OpenStreetMap contributors (ODbL)',
            'c': [lat0, lon0], 'k': [round(kx, 3), kz], 'e': out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--sample', help='ทดสอบ: ใช้ไฟล์ Overpass JSON นี้แทนการดึงจริง')
    ap.add_argument('--overture-sample', help='ทดสอบ: ใช้ไฟล์ GeoJSON อาคาร Overture นี้แทนการดึงจริง')
    ap.add_argument('--no-overture', action='store_true', help='ไม่เติมอาคารจาก Overture')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    stations = load_stations()
    only = {x.strip() for x in a.only.split(',') if x.strip()}

    # จัดกลุ่มสถานีที่อยู่ติดกัน → ไฟล์เดียว
    groups = []
    for s in stations:
        for g in groups:
            if dist_m((s['lat'], s['lon']), (g['lat'], g['lon'])) <= CLUSTER_M:
                g['members'].append(s)
                break
        else:
            groups.append({'lat': s['lat'], 'lon': s['lon'], 'members': [s]})
    idx_path = os.path.join(OUT, 'index.json')
    old = {}
    if os.path.exists(idx_path):
        try:
            old = {e['file']: e for e in json.load(open(idx_path, encoding='utf-8'))['stations']}
        except Exception:
            pass

    now = datetime.now(timezone.utc)
    index, done, fail = [], 0, 0
    for gi, g in enumerate(groups):
        fid = re.sub(r'[^A-Za-z0-9_-]', '_', str(g['members'][0]['id']))
        fname = f'{fid}.json'
        path = os.path.join(OUT, fname)
        names = ' / '.join(m['name'] for m in g['members'])
        prev = old.get(fname, {})
        fresh = os.path.exists(path) and prev.get('updated') and \
            (now - datetime.fromisoformat(prev['updated'])).days < MAX_AGE_DAYS and \
            (a.no_overture or prev.get('ovt_v') == OVT_VERSION) and prev.get('data_v') == DATA_VERSION
        want = (not only) or any(str(m['id']) in only for m in g['members'])
        updated, n, ovt_v, ovt_n = prev.get('updated'), prev.get('n'), prev.get('ovt_v'), prev.get('ovt')
        if want and (a.force or not fresh):
            print(f'[{gi + 1}/{len(groups)}] {names}', flush=True)
            try:
                raw = json.load(open(a.sample, encoding='utf-8')) if a.sample else fetch(query(g['lat'], g['lon'], RADIUS))
                js = slim(raw, names, g['lat'], g['lon'])
                if not a.no_overture:
                    k = merge_overture(js, overture_buildings(g['lat'], g['lon'], RADIUS, a.overture_sample))
                    print(f'    + อาคารจาก Overture {k} หลัง', flush=True)
                tmp = path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(js, f, ensure_ascii=False, separators=(',', ':'))
                os.replace(tmp, path)
                updated, n = now.isoformat(timespec='seconds'), len(js['e'])
                ovt_v, ovt_n = (None, None) if a.no_overture else (OVT_VERSION, js.get('ovt', 0))
                print(f'    ✓ {n} รายการ · {os.path.getsize(path) / 1024:.0f} KB', flush=True)
                done += 1
                if not a.sample:
                    time.sleep(8)          # มารยาทต่อเซิร์ฟเวอร์ Overpass (ใช้ร่วมกันทั้งโลก)
            except Exception as e:
                print(f'    ✗ ไม่สำเร็จ: {e}', flush=True)
                fail += 1
        if os.path.exists(path):
            for m in g['members']:
                index.append({'id': str(m['id']), 'name': m['name'], 'lat': m['lat'], 'lon': m['lon'],
                              'file': fname, 'updated': updated, 'n': n, 'ovt_v': ovt_v, 'ovt': ovt_n,
                              'data_v': DATA_VERSION if updated == now.isoformat(timespec='seconds') else prev.get('data_v')})
    with open(idx_path, 'w', encoding='utf-8') as f:
        json.dump({'radius': RADIUS, 'stations': index}, f, ensure_ascii=False, indent=0)
    print(f'เสร็จ: สร้างใหม่ {done} · ไม่สำเร็จ {fail} · ในดัชนี {len(index)} สถานี', flush=True)
    if fail and not done:
        sys.exit(1)


if __name__ == '__main__':
    main()
