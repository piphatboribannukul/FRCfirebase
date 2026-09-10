// ═══════════════════════════════════════════════════════════════════════════
// Turbidity Contour v1.0 — CONFIG
// แผนที่ความขุ่นแบบเรียลไทม์ MWA — สถาปัตยกรรมเดียวกับ FRCContour v38
// วางโฟลเดอร์นี้ไว้ใน repo FRCfirebase (เช่น /turbidity/) เพื่อใช้ ../data/*.js ร่วมกัน
// ═══════════════════════════════════════════════════════════════════════════

const TB = {
  VERSION: '1.0',

  // ── API (ตัวเดียวกับ FRCContour) ──────────────────────────────────────────
  API_URL: 'https://twqonline.mwa.co.th/TWQMSServicepublic/api/mwaonmobile/getStations',
  POLL_INTERVAL: 15 * 60 * 1000, // 15 นาที

  // ── ชื่อ field ความขุ่นใน API `value` object ─────────────────────────────
  // TWQMS ตั้งชื่อแบบ <ชื่อ>_<เลขพารามิเตอร์> (เช่น frc_2, ecm_5, tmp_6)
  // ความขุ่นยังไม่ยืนยันชื่อ field — auto-detect จาก key ที่ match รายการนี้
  // รอบ poll แรกจะ log ชื่อ field ที่เจอใน console: [Turb] ✅ พบ field ความขุ่น: "xxx"
  TURB_FIELD_CANDIDATES: [/^tur/i, /^tub/i, /^tbd/i, /^ntu/i, /turbid/i],
  TURB_FIELD_OVERRIDE: null, // ถ้ารู้ชื่อจริงแล้ว ใส่ string ตรงนี้ เช่น 'tub_3'

  // ── เกณฑ์ความขุ่น (NTU) ──────────────────────────────────────────────────
  // อ้างอิง: เกณฑ์คุณภาพน้ำประปา กปน. / มาตรฐานน้ำบริโภคกรมอนามัย (≤ 4 NTU)
  // และ WHO aesthetic (< 5 NTU, ideally < 1 NTU ก่อนฆ่าเชื้อ)
  THRESH: {
    excellent: 0.3,  // ใสมาก
    good:      1.0,  // ดี
    limit:     4.0,  // เกณฑ์มาตรฐานน้ำบริโภค
    max:       10.0, // เพดาน scale สี
  },
  UNIT: 'NTU',

  // ── ฟิสิกส์การเดินทางในเส้นท่อ (concept เดียวกับ FRCContour) ─────────────
  // ความขุ่น ≈ อนุภาคแขวนลอย: เดินทางตามน้ำ (advection) + ตกตะกอน/เกาะผนังเล็กน้อย
  // Turb(จุด, now) = Turb(สถานี, now − t) × exp(−K_settle·t)
  // K_settle เล็กมากเทียบกับ K คลอรีน (ความขุ่นไม่ "สลาย" แบบเคมี) — ปรับได้ใน UI
  K_SETTLE: 0.005,         // ต่อชั่วโมง (default; 0 = conservative ล้วน)
  EPANET_V: 0.5,           // m/s ความเร็วน้ำ default (ค่าเดียวกับ FRCContour)
  EUCLID_PIPE_FACTOR: 1.35,// ระยะ Euclidean × factor ≈ ระยะตามท่อ (ค่าเดียวกับ FRCContour)
  DEG_TO_KM: 111,

  // ── Time-lagged source (พัฒนาต่อจาก FRCContour v38.1) ────────────────────
  TIME_LAGGED_DEFAULT: true,   // ความขุ่นเป็น event-driven — lag สำคัญ เปิด default
  LAG_TOL_MS: 45 * 60 * 1000,  // tolerance lookup ±45 นาที
  MIN_LAG_SEC: 1800,           // t < 30 นาที ใช้ค่าปัจจุบัน

  // ── Stale detection (concept v38.1) ──────────────────────────────────────
  STALE_HOURS: 12,
  STALE_MIN_PTS: 8,

  // ── Firebase (โปรเจกต์เดียวกับ FRCContour — ใช้ database ร่วม) ────────────
  FIREBASE: {
    apiKey:            "AIzaSyC0iyNwGCOIh-kbp6xDfijWBWKiE4iI_Lk",
    authDomain:        "frc-contour.firebaseapp.com",
    databaseURL:       "https://frc-contour-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "frc-contour",
    storageBucket:     "frc-contour.firebasestorage.app",
    messagingSenderId: "772799472029",
    appId:             "1:772799472029:web:8e6862082d8252a6d04f74"
  },
  // history ความขุ่น: history/turb_{code}/{ts} = {ntu, ts}
  // — ใช้ wildcard rule เดิมของ node history (แบบเดียวกับ raw_/rawmk_) ไม่ต้องแก้ rules
  FB_TURB_PREFIX: 'history/turb_',
  // maintenance ใช้ node เดียวกับ FRCContour → ปิดสถานีที่เดียว มีผลทั้งสองแผนที่
  FB_MAINT_PATH: 'history/_maintenance',
  HIST_MAX_HOURS: 168,

  // ── สี contour ความขุ่น: ฟ้าใส → เขียว → เหลือง → ส้ม → น้ำตาล ────────────
  // (โทน "น้ำใส→น้ำขุ่น" ตรงสัญชาตญาณ ต่างจาก FRC ที่แดง=ต่ำ)
  COLOR_STOPS: [
    [0.0,  [120, 200, 255]],  // ใสมาก - ฟ้า
    [0.3,  [ 80, 200, 170]],  // ใส - เขียวอมฟ้า
    [1.0,  [150, 210,  90]],  // ดี - เขียว
    [2.0,  [235, 200,  60]],  // เริ่มขุ่น - เหลือง
    [4.0,  [240, 140,  50]],  // ใกล้เกณฑ์ - ส้ม
    [7.0,  [190,  90,  40]],  // เกินเกณฑ์ - น้ำตาลส้ม
    [10.0, [120,  60,  30]],  // ขุ่นมาก - น้ำตาลเข้ม
  ],
  CONTOUR_ALPHA: 0.60,
  GRAY_SENTINEL: -9,

  // ── ค่า fallback (ใช้เมื่อ API ไม่ส่งความขุ่น และไม่มี history) ───────────
  // ระบุชัดบน UI ว่าเป็นค่าประมาณ ไม่ใช่ค่าวัดจริง — น้ำประปาปกติ ~0.2–0.8 NTU
  TURB_FALLBACK_DEFAULT: 0.5,

  LS_KEYS: {
    tlag:  'mwa_turb_tlag_v1',
    maint: 'mwa_maint_v1',       // ร่วมกับ FRCContour
    hist:  'mwa_turb_hist_v1',
    ksettle: 'mwa_turb_ksettle_v1',
  },
};
