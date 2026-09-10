# 🟤 Turbidity Contour v1.0 — แผนที่ความขุ่นแบบเรียลไทม์

แยกโปรเจกต์จาก FRCContour แต่ใช้ทรัพยากรร่วมกันทั้งหมด: TWQMS API, Firebase (โปรเจกต์ `frc-contour`), data/*.js (สถานี/โซน/ขอบเขต), และ concept ที่พัฒนากันมาใน v38 (โซนอิทธิพล + time-lagged source + stale detection + gray zone)

## วิธี Deploy (2 นาที)

1. คัดลอกโฟลเดอร์ `turbidity/` ทั้งก้อนไปวางที่ **root ของ repo FRCfirebase** (ระดับเดียวกับ index.html และโฟลเดอร์ data/)
2. commit + push
3. เปิด `https://piphatboribannukul.github.io/FRCfirebase/turbidity/`

โครงสร้างหลังวาง:
```
FRCfirebase/
├── index.html        (FRCContour เดิม — ไม่แตะ)
├── app.js            (เดิม)
├── data/             (ใช้ร่วมกัน — ไม่แตะ)
└── turbidity/        ← ใหม่
    ├── index.html
    ├── css/style.css
    └── js/config.js, core.js, app.js
```

**ไม่ต้องแก้ Firebase rules** — history ความขุ่นเก็บที่ `history/turb_{code}/{ts}` ใช้ wildcard rule เดิม (แบบเดียวกับ raw_/rawmk_) และ maintenance ใช้ node `history/_maintenance` **ร่วมกับ FRCContour** → กดปิดสถานีที่แผนที่ไหน มีผลทั้งสองแผนที่

## สิ่งแรกที่ต้องเช็คหลังเปิด: field ความขุ่นใน API

TWQMS getStations ส่ง `value` object (เช่น frc_2, ecm_5, tmp_6) — **ชื่อ field ความขุ่นยังไม่ยืนยัน** แอปจะ auto-detect (pattern tur/tub/tbd/ntu) และ log ใน console:

- เจอ → `[Turb] ✅ พบ field ความขุ่นใน API: "xxx"` → ใช้งานได้เต็มรูปแบบทันที
- ไม่เจอ → log รายชื่อ keys ทั้งหมดที่ API ส่งมาให้ดู ถ้ามีชื่อแปลกที่คือความขุ่น (เช่น `tby_3`) ใส่ใน `js/config.js` → `TURB_FIELD_OVERRIDE: 'tby_3'`
- ถ้า API ไม่ส่งความขุ่นเลย → แอปยังทำงาน โดยใช้ค่าล่าสุดจาก Firebase history (ถ้ามี) หรือค่าประมาณ 0.5 NTU พร้อมแบนเนอร์เตือนชัดเจนว่าไม่ใช่ realtime — ทางเลือกระยะยาวคือเขียน history/turb_* จากแหล่งอื่น (เช่น script ดึง TWQMS admin แบบที่ทำกับ EC)

## ฟีเจอร์

- **Contour โซนอิทธิพล** — pixel ในโซน สจ. ใช้ค่าจากสถานีเจ้าของโซน, นอกโซนใช้ IDW (ตัด sensor เสียออก)
- **Time-lagged source (เปิด default)** — Turb(จุด, now) = Turb(สถานี, now−t) × e^(−K_settle·t) — ความขุ่นเป็น event-driven (คลื่นขุ่นจากการล้างท่อ/งานซ่อม/น้ำดิบ) lag จึงสำคัญกว่ากรณี FRC ด้วยซ้ำ
- **K_settle ปรับได้** — default 0.005/h (ตกตะกอน/เกาะผนังช้ามาก), ตั้ง 0 = conservative ล้วน
- **Stale detection** — ค่าเป๊ะเดิม ≥12 ชม. → ตัดออก + โซนเทา (เคสบางชัน/คลองเตยจะโดนจับเหมือนฝั่ง FRC)
- **Maintenance ร่วมกับ FRCContour** — ปุ่มใน popup marker, sync ผ่าน Firebase (ต้อง login admin ตัวเดียวกับ FRC)
- **โซนเทา + ขอบประ + ป้าย "⚠ ไม่มีข้อมูล"** — ไม่มีเลข −9 โผล่ที่ไหน
- **เกณฑ์สี** — ฟ้า(ใส) → เขียว → เหลือง → ส้ม → น้ำตาล(ขุ่น), เส้นเกณฑ์ 1.0 (ดี) และ 4.0 NTU (มาตรฐานน้ำบริโภค)

## ข้อจำกัด v1.0 (ตั้งใจตัดเพื่อความเสถียร — เพิ่มได้ภายหลัง)

1. ระยะทางใช้ Euclidean × 1.35 (ยังไม่ port Dijkstra pipe network — โหลด pipes.js 20k เส้นถือว่าหนักสำหรับ v1)
2. ยังไม่มี RTU pressure ปรับความเร็ว (ใช้ v คงที่ 0.5 m/s)
3. ยังไม่มีโหมด forecast/animation
4. ประวัติความขุ่นเริ่มสะสมจากศูนย์ — time-lag จะเริ่มมีผลจริงหลังรัน ≥1–2 วัน (ก่อนหน้านั้น fallback เป็นค่าปัจจุบันอัตโนมัติ)

## เช็คลิสต์หลัง deploy

- [ ] Console มี `[Turb] 🟤 Turbidity Contour v1.0 พร้อม`
- [ ] ดูว่า detect field ความขุ่นเจอไหม (log บรรทัด ✅/⚠)
- [ ] โซน/ขอบเขตขึ้น (ถ้าไม่ขึ้น = path ../data/ ผิด — เช็คว่าวางโฟลเดอร์ถูกระดับ)
- [ ] login admin หนึ่งครั้งเพื่อเริ่มเขียน history/turb_* ขึ้น Firebase
- [ ] ผ่านไป 1 วัน ลองเปิด/ปิด toggle time-lag ดูโซนขยับ
