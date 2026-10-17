#!/usr/bin/env python3
"""สร้างข้อมูลเมือง 3 มิติรอบสถานีวัดคุณภาพน้ำ ล่วงหน้า (ใช้กับ frc3d.js)          [17 ต.ค. 2569]

ดึงข้อมูลอาคาร/ต้นไม้/สวน/ถนน/เขตวัด จาก OpenStreetMap (Overpass API) รอบทุกสถานีใน data/stations.js
แล้วเก็บเป็นไฟล์ data/city/<ไฟล์>.json + data/city/index.json
หน้าเว็บโหลดไฟล์เหล่านี้จาก GitHub Pages ตรงๆ → เปิดได้ทันทีทุกเครื่อง ไม่ต้องรอ Overpass

ใช้:  python tools/build_city.py            (สร้างเฉพาะไฟล์ที่ยังไม่มี/เก่ากว่า 25 วัน)
      python tools/build_city.py --force    (สร้างใหม่ทั้งหมด)
      python tools/build_city.py --only SP12,59
ไม่ต้องติดตั้งไลบรารีเพิ่ม (ใช้ไลบรารีมาตรฐานของ Python)
ข้อมูล © OpenStreetMap contributors (ODbL)
"""
import argparse, json, math, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'city')
RADIUS = 670            # ม. (frc3d.js สร้างเมืองมีสี 550 ม. + เผื่อสถานีในกลุ่มเดียวกันห่างกันได้ถึง 120 ม.)
CLUSTER_M = 120         # สถานีที่ห่างกันไม่เกินนี้ใช้ไฟล์เดียวกัน (เช่น TR1–3, Dis1–2 ที่บางเขน)
MAX_AGE_DAYS = 25
ENDPOINTS = ['https://overpass-api.de/api/interpreter',
             'https://overpass.kumi.systems/api/interpreter',
             'https://overpass.private.coffee/api/interpreter']
UA = 'FRCContour-3D-city-builder/1.0 (MWA water quality; github.com/piphatboribannukul/FRCfirebase)'
KEEP_TAGS = {'building', 'building:levels', 'height', 'building:height', 'min_height', 'building:min_level',
             'roof:shape', 'roof:colour', 'roof:color', 'building:colour', 'building:color', 'colour',
             'amenity', 'religion', 'natural', 'leisure', 'landuse', 'highway', 'bridge', 'tunnel', 'man_made',
             'railway', 'layer'}


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
            f'way["railway"~"^(light_rail|subway|monorail|rail)$"]{A};'
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
        if tags_all.get('amenity') == 'place_of_worship' and tags_all.get('name'):
            t['name'] = tags_all['name']
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
            (now - datetime.fromisoformat(prev['updated'])).days < MAX_AGE_DAYS
        want = (not only) or any(str(m['id']) in only for m in g['members'])
        updated, n = prev.get('updated'), prev.get('n')
        if want and (a.force or not fresh):
            print(f'[{gi + 1}/{len(groups)}] {names}', flush=True)
            try:
                raw = json.load(open(a.sample, encoding='utf-8')) if a.sample else fetch(query(g['lat'], g['lon'], RADIUS))
                js = slim(raw, names, g['lat'], g['lon'])
                tmp = path + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(js, f, ensure_ascii=False, separators=(',', ':'))
                os.replace(tmp, path)
                updated, n = now.isoformat(timespec='seconds'), len(js['e'])
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
                              'file': fname, 'updated': updated, 'n': n})
    with open(idx_path, 'w', encoding='utf-8') as f:
        json.dump({'radius': RADIUS, 'stations': index}, f, ensure_ascii=False, indent=0)
    print(f'เสร็จ: สร้างใหม่ {done} · ไม่สำเร็จ {fail} · ในดัชนี {len(index)} สถานี', flush=True)
    if fail and not done:
        sys.exit(1)


if __name__ == '__main__':
    main()
