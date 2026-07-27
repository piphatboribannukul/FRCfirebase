# FRCContour v37 — Real-Time Chlorine Contour (MWA)

ระบบแผนที่ contour คลอรีนอิสระคงเหลือ (FRC) แบบ real-time ครอบคลุมพื้นที่จ่ายน้ำ กปน.
พัฒนาโดยกองควบคุมคุณภาพน้ำ (M sandbox)

## โครงสร้างไฟล์

```
index.html      โครง UI + CSS ทั้งหมด (ห้ามมี logic)
app.js          logic ทั้งหมด — มีสารบัญ 11 sections ที่หัวไฟล์ (ค้นหา "[N/11]")
data/           ข้อมูล static — สร้างโดย extract_data.py ห้ามแก้มือ
  stations.js     SENSORS_FALLBACK — snapshot 61 สถานี FRC
  zones.js        STA_POLYS + MWA_POLYS + DEFAULT_ZONES (โซนพื้นที่)
  pipes.js        _PIPE_GRID_B64 (trunk) + PIPE_NET_KMZ_B64 (22,636 เส้น) + PIPE_LINES_B64
  rtu.js          RTU_STATIONS_B64 (236 สถานี) + RTU_COMP_B64
  pressure.js     _PRESSURE_FACTOR_B64 (static grid fallback)
  boundaries.js   ขอบเขตเขต กทม./นนทบุรี/สมุทรปราการ
  assets.js       EPANET_OVERLAY_PNG
```

ลำดับโหลด: `data/*.js` ทั้งหมด → `app.js` (classic script — top-level const มองเห็นข้ามไฟล์)

## หลักการโมเดล

- **Decay**: EPANET first-order `C = C₀·exp(−K·t)` — Kb วิจัย 0.778/day (บางเขน), 0.400/day (มหาสวัสดิ์) จาก ม.เกษตร กนว.32/2566
- **K chain 3 ลำดับ**: `CONTOUR_K_OVERRIDE` (calibrate สนาม รายสถานี) → `STATION_K_OVERRIDE` → `K_total` fallback
- **Auto K อุณหภูมิ**: Arrhenius E/R=8971K, ref 32°C (อุณหภูมิตอน calibrate) — median `tmp_6` จาก TWQMS กรอง 28–34°C, sync ref ผ่าน Firebase
- **Routing**: Dijkstra บนโครงข่ายท่อจริง (EPANET .net → KMZ) ครอบคลุม ~92%
- **Velocity**: RTU Bernoulli `v ∝ √P` (pFactor clamp 0.5–2.0) — RTU-preferred, static grid fallback, ไม่มี double-counting

## เวอร์ชัน

แก้ที่เดียว: `const APP_VERSION` บนสุดของ `app.js` — badge/ticker ใช้ `appBadge()` อัตโนมัติ
(ข้อความ static ใน `index.html` ใช้แสดงตอน first paint เท่านั้น ค้นหา "v37" เพื่ออัปเดตพร้อมกัน)

## เครื่องมือ console (F12)

| คำสั่ง | หน้าที่ |
|---|---|
| `_frcDiag(lat, lon)` | ไล่ chain การคำนวณ ณ จุดนั้น: sensor ต้นทาง, ระยะ, K, velocity source, decay factor |
| `setTempRef(°C)` | ตั้งอุณหภูมิอ้างอิง Arrhenius (sync Firebase ทุกเครื่อง) |
| `probeHistoricalApi()` | ทดสอบ endpoint ข้อมูลย้อนหลัง |
| `clearOldHistory()` | ล้าง history เก่าใน Firebase |
| `validateModel()` | วัดความแม่น contour เทียบสถานี monitor 38 แห่ง (out-of-sample) → RMSE/MAE/MAPE/bias + ตารางรายสถานี |
| `validateModel({save:true})` | วัด + บันทึกผลลง Firebase `validation/` สะสมข้ามวัน/ฤดู |

## Data sources

- **TWQMS API** — FRC/EC/อุณหภูมิ 61 สถานี (poll 15 นาที)
- **Firebase RTDB** (Asia SE1) — live sync, history, K default, temp ref
- **RTU SmartMap** — pressure 236 สถานี (embedded B64 + refresh บน intranet)
- หมายเหตุ: DMA velocity ถูกถอดถาวร (relay เปราะ + ไม่มี diameter รายท่อ)

## การแก้ไข / build

- แก้ logic → `app.js` โดยตรง แล้วตรวจ `node --check app.js`
- ข้อมูล static เปลี่ยน (เช่น เพิ่มสถานี) → แก้ต้นทางแล้วรัน `extract_data.py` ใหม่
- **ห้าม**ประกาศ `const/let` ชื่อเดียวกับ globals ใน `data/*.js` (จะ SyntaxError ทั้งหน้า)
- ระวัง TDZ: ตัวแปร top-level ที่ถูก assign ก่อนบรรทัดประกาศ ให้ใช้ `var`

## Deploy

GitHub Pages: Settings → Pages → Deploy from branch `main` / root
อัปเดต = ทับไฟล์ที่แก้แล้ว commit (ผู้ใช้กด Ctrl+Shift+R ล้าง cache)

---
v37.0 · Jul 2026 · แยกโครงจาก v36.3 (18K บรรทัดไฟล์เดียว → 3 ชั้น) + ซ่อม TDZ / dangling call
