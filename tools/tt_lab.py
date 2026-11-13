#!/usr/bin/env python3
"""Travel-Time Lab — คำนวณเวลาเดินทางน้ำจากประวัติ EC ที่ archive ไว้ใน repo

อ่าน history_archive/*.json.gz (เขียนโดย archive-history.yml ทุกวัน) แล้วหา
เวลาเดินทางของแต่ละช่วง (ต้นทาง → ปลายทาง) ด้วย cross-correlation ของ EC
เขียนผลลง data/tt_auto.json ให้หน้า ttlab.html แสดงผล

ใช้แค่ standard library เพื่อให้รันบน GitHub Actions ได้โดยไม่ต้องติดตั้งอะไร
"""
import glob
import gzip
import json
import math
import os
import statistics
import sys
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=7))
H = 3600_000
DAYS = int(os.environ.get('TT_DAYS', '21'))

# ช่วงที่ตรวจ: (id, ต้นทาง, ปลายทาง, ค่าที่ใช้ในแอปตอนนี้ (ชม.), ช่วง lag ที่ค้นหา, กลุ่ม)
LINKS = [
    ('S13-S12',  'rawmk_S13', 'rawmk_S12', 13, (0, 30),  'ตะวันตก'),
    ('S12-SP11', 'rawmk_S12', 'SP11',      51, (25, 80), 'ตะวันตก'),
    ('S13-SP11', 'rawmk_S13', 'SP11',      64, (35, 95), 'ตะวันตก'),
    ('S12-SP12', 'rawmk_S12', 'SP12',      51, (25, 80), 'ตะวันตก'),
    ('S1-SP01',  'raw_S1',    'SP01',      17, (5, 40),  'ตะวันออก'),
    ('S1-SP02',  'raw_S1',    'SP02',      17, (5, 40),  'ตะวันออก'),
    ('S1-SP03',  'raw_S1',    'SP03',      17, (5, 40),  'ตะวันออก'),
    ('S1-SP04',  'raw_S1',    'SP04',      17, (5, 40),  'ตะวันออก'),
    ('S1-SP05',  'raw_S1',    'SP05',      17, (5, 40),  'ตะวันออก'),
    ('S1-SP09',  'raw_S1',    'SP09',      48, (25, 75), 'ตะวันออก'),
]
NAMES = {
    'rawmk_S13': 'คลองตะวันตก กม.54', 'rawmk_S12': 'บางเลน กม.35', 'raw_S1': 'สำแล',
    'SP11': 'สูบส่งมหาสวัสดิ์ (MTR)', 'SP12': 'สูบจ่ายมหาสวัสดิ์ (MDIS)',
    'SP01': 'สูบส่งบางเขน 1 (TR1)', 'SP02': 'สูบส่งบางเขน 2 (TR2)', 'SP03': 'สูบส่งบางเขน 3 (TR3)',
    'SP04': 'สูบจ่ายบางเขน 1 (Dis1)', 'SP05': 'สูบจ่ายบางเขน 2 (Dis2)', 'SP09': 'โรงงานผลิตน้ำสามเสน 3',
}
RAW_MIN = 150      # ค่าน้ำดิบต่ำกว่านี้ = เซ็นเซอร์ผิดปกติ
FLAT_N = 12        # ค่าเท่าเดิมติดกัน ≥ 12 ชม. = ค่าค้าง


def load(archive_dir):
    files = sorted(glob.glob(os.path.join(archive_dir, '*.json.gz')))[-DAYS:]
    series = {}
    for f in files:
        with gzip.open(f) as fh:
            for k, pts in json.load(fh).get('stations', {}).items():
                series.setdefault(k, []).extend(pts)
    return series, files


def hourly(pts, raw):
    """ค่าเฉลี่ยรายชั่วโมง + ตัดค่าผิดปกติ/ค่าค้าง (เฉพาะน้ำดิบ)"""
    by = {}
    for p in pts or []:
        ec = p.get('ec')
        if ec is None or ec <= (RAW_MIN if raw else 1):
            continue
        by.setdefault(int(p['ts'] // H), []).append(ec)
    d = {h: sum(v) / len(v) for h, v in by.items()}
    if raw:
        hs = sorted(d)
        run = []
        drop = set()
        for h in hs:
            if run and d[h] == d[run[0]] and h - run[-1] == 1:
                run.append(h)
            else:
                if len(run) >= FLAT_N:
                    drop.update(run)
                run = [h]
        if len(run) >= FLAT_N:
            drop.update(run)
        d = {h: v for h, v in d.items() if h not in drop}
    return d


def smooth(d, w=5):
    half = w // 2
    out = {}
    for h in d:
        v = [d[x] for x in range(h - half, h + half + 1) if x in d]
        out[h] = sum(v) / len(v)
    return out


def detrend(xs):
    n = len(xs)
    t = list(range(n))
    mt, mx = (n - 1) / 2, sum(xs) / n
    den = sum((a - mt) ** 2 for a in t) or 1
    b = sum((a - mt) * (x - mx) for a, x in zip(t, xs)) / den
    return [x - (mx + b * (a - mt)) for a, x in zip(t, xs)]


def corr(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    sx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    sy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if sx == 0 or sy == 0:
        return None
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)


def curve(a, b, lags, min_n=48, diff=False):
    if diff:
        a = {h: a[h] - a[h - 3] for h in a if h - 3 in a}
        b = {h: b[h] - b[h - 3] for h in b if h - 3 in b}
    out = []
    for L in range(lags[0], lags[1] + 1):
        pairs = [(a[h], b[h + L]) for h in sorted(a) if h + L in b]
        if len(pairs) < min_n:
            out.append([L, None, len(pairs)])
            continue
        xs, ys = zip(*pairs)
        if not diff:
            xs, ys = detrend(list(xs)), detrend(list(ys))
        r = corr(xs, ys)
        out.append([L, None if r is None else round(r, 3), len(pairs)])
    return out


def peak(c):
    ok = [x for x in c if x[1] is not None]
    if not ok:
        return None
    best = max(ok, key=lambda x: x[1])
    # จุดสูงสุดที่ขอบช่วงค้นหา = ไม่น่าเชื่อ (อาจอยู่นอกช่วง)
    edge = best[0] in (c[0][0], c[-1][0])
    return {'lag': best[0], 'r': best[1], 'n': best[2], 'edge': edge}


def analyse(series):
    links = []
    for lid, src, dst, used, lags, grp in LINKS:
        a = smooth(hourly(series.get(src), raw=src.startswith('raw')))
        b = smooth(hourly(series.get(dst), raw=dst.startswith('raw')))
        item = {'id': lid, 'group': grp, 'from': src, 'to': dst,
                'fromName': NAMES.get(src, src), 'toName': NAMES.get(dst, dst), 'used': used,
                'hours': {'from': len(a), 'to': len(b)}}
        if len(a) < 48 or len(b) < 48:
            item.update(status='nodata', note='ข้อมูลไม่พอ')
            links.append(item)
            continue
        c_lvl = curve(a, b, lags)
        c_dif = curve(a, b, lags, diff=True)
        p1, p2 = peak(c_lvl), peak(c_dif)
        item['curve'] = c_lvl
        item['curveDiff'] = c_dif
        item['peak'] = p1
        item['peakDiff'] = p2
        if not p1:
            item.update(status='nodata', note='ข้อมูลซ้อนกันไม่พอ')
            links.append(item)
            continue
        agree = p2 is not None and abs(p1['lag'] - p2['lag']) <= 4
        if p1['edge']:
            conf = 'low'
        elif p1['r'] >= 0.6 and p1['n'] >= 72 and agree:
            conf = 'high'
        elif p1['r'] >= 0.45 and p1['n'] >= 48:
            conf = 'mid'
        else:
            conf = 'low'
        item['_a'], item['_b'] = a, b
        item['best'] = p1['lag']
        item['conf'] = conf
        item['agree'] = agree
        item['delta'] = p1['lag'] - used
        item['rUsed'] = next((x[1] for x in c_lvl if x[0] == used), None)
        item['status'] = 'ok'
        links.append(item)
    _chain(links)
    return links


# ช่วงที่ตรวจซ้ำได้ด้วยผลรวมของช่วงอื่น: A→C ≈ A→B + B→C  ⇒  B→C ≈ (A→C) − (A→B)
CHAINS = {'S12-SP11': ('S13-SP11', 'S13-S12'), 'S12-SP12': ('S13-SP11', 'S13-S12')}


def _chain(links):
    by = {x['id']: x for x in links}
    for lid, (whole, part) in CHAINS.items():
        x, w, p = by.get(lid), by.get(whole), by.get(part)
        if not x or x.get('status') != 'ok' or not w or not p or 'best' not in w or 'best' not in p:
            continue
        est = w['best'] - p['best']
        x['chain'] = {'estimate': est, 'from': f"{w['id']} ({w['best']}) − {p['id']} ({p['best']})"}
        if x.get('agree'):
            continue
        cands = [c for c in (x.get('peak'), x.get('peakDiff')) if c and not c.get('edge')]
        if not cands:
            continue
        pick = min(cands, key=lambda c: abs(c['lag'] - est))
        if abs(pick['lag'] - est) <= 5:
            x['best'] = pick['lag']
            x['delta'] = pick['lag'] - x['used']
            x['conf'] = 'mid'
            x['pickNote'] = 'สองวิธีให้ผลต่างกัน จึงเลือกค่าที่สอดคล้องกับผลรวมของช่วงอื่น'
            # คำนวณกราฟทับเส้นและส่วนต่างใหม่ตาม lag ที่เลือก
            x['_repick'] = True


def _finish(x):
    """ส่วนต่างระดับ + ข้อมูลกราฟทับเส้น 7 วันล่าสุด ตาม lag ที่เลือก"""
    a, b = x.pop('_a', None), x.pop('_b', None)
    x.pop('_repick', None)
    if a is None or 'best' not in x:
        return
    L = x['best']
    diffs = [b[h + L] - a[h] for h in a if h + L in b]
    x['offset'] = round(statistics.median(diffs), 1) if diffs else None
    x['rBest'] = next((c[1] for c in x['curve'] if c[0] == L), None)
    last = max(b)
    hs = list(range(last - 7 * 24, last + 1))
    off = x['offset'] or 0
    x['overlay'] = {
        'h0': hs[0] * H,
        'src': [round(a[h - L] + off, 1) if (h - L) in a else None for h in hs],
        'dst': [round(b[h], 1) if h in b else None for h in hs],
    }


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    series, files = load(os.path.join(root, 'history_archive'))
    links = analyse(series)
    for x in links:
        _finish(x)
    out = {
        'generated': datetime.now(TZ).isoformat(timespec='minutes'),
        'archive': {'from': os.path.basename(files[0])[:10] if files else None,
                    'to': os.path.basename(files[-1])[:10] if files else None, 'days': len(files)},
        'method': 'cross-correlation ของ EC รายชั่วโมง (เฉลี่ยเคลื่อนที่ 5 ชม., ตัดแนวโน้มเส้นตรง) '
                  'ยืนยันด้วยวิธีผลต่าง 3 ชม.; ตัดค่าน้ำดิบ < 150 และค่าค้าง ≥ 12 ชม.',
        'links': links,
    }
    path = os.path.join(root, 'data', 'tt_auto.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    for x in links:
        if x.get('status') == 'ok':
            print(f"{x['id']:9s} ใช้ {x['used']:>3} ชม. | เลือก {x['best']:>3} ชม. (ระดับ {x['peak']['lag']} r={x['peak']['r']:.2f}) n={x['peak']['n']} "
                  f"diff={x['peakDiff']['lag'] if x['peakDiff'] else '-'} conf={x['conf']} offset={x['offset']} rUsed={x['rUsed']}")
        else:
            print(f"{x['id']:9s} {x.get('note')}")
    print('→', path)


if __name__ == '__main__':
    main()
