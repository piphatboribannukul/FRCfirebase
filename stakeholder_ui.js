// ชุดหน้าตาร่วม (หน้าแรก · แผนที่ · ชั้น 5): ไอคอนเส้นชุดเดียว + ตัวอักษรระบบ + สีเด่นน้ำเงินเดียว
// โหลดก่อน stakeholder3d.js / stakeholder_floor5.js · ใช้ SUI.i('ชื่อไอคอน') ในโค้ด
(() => {
const SYS = `-apple-system,BlinkMacSystemFont,"SF Pro Text","IBM Plex Sans Thai","Noto Sans Thai","Helvetica Neue",sans-serif`;
const I = p => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  play: '<path d="M7 4.5v15l12-7.5z"/>', orbit: '<path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.7L21 8"/><path d="M21 3v5h-5"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>', list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9v11.5h13V9"/>',
  plan: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 12h9M12.5 3.5v17"/>', spin: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  explode: '<path d="m12 2.5 8 4-8 4-8-4z"/><path d="m4 12.5 8 4 8-4"/><path d="m4 17.5 8 4 8-4"/>', full: '<path d="M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v3M20.5 8V5A1.5 1.5 0 0 0 19 3.5h-3M3.5 16v3A1.5 1.5 0 0 0 5 20.5h3M16 20.5h3a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
  prev: '<path d="m15 18-6-6 6-6"/>', pause: '<path d="M9 5v14M15 5v14"/>', next: '<path d="m9 18 6-6-6-6"/>', walk: '<circle cx="13" cy="4.5" r="1.5"/><path d="m9 21 2.5-6.5L14 17v4"/><path d="M7.5 11.5 10 8l3.5.5 2.5 3"/><path d="m11.5 14.5.5-6"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
  seat: '<path d="M6 19v-4M18 19v-4"/><path d="M5 15h14"/><path d="M7 15V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'
};
const css = `
/* ── แผนที่ */
html body #frc3d-bar{gap:8px}
html body .frc3d-title{font-family:${SYS};background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:10px 16px 11px;font-weight:600;font-size:15px;color:#1d1d1f;box-shadow:0 4px 16px rgba(0,0,0,.08)}
html body .frc3d-title .rm{font-weight:500;font-size:13px;color:#0a6fd8;margin-top:2px}
html body .frc3d-title small{font-size:12px;color:#6e6e73;margin-top:2px}
html body .frc3d-btn{font:500 14px ${SYS};height:36px;padding:0 14px;display:inline-flex;align-items:center;gap:6px;background:#fff;color:#1d1d1f;border:1px solid rgba(0,0,0,.08);border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,.08);transition:background-color .15s}
html body .frc3d-btn:hover{background:#f5f5f7}
html body .frc3d-btn svg{color:#6e6e73;flex:none}
html body .frc3d-btn.on{background:#1d1d1f;color:#fff;border-color:#1d1d1f}html body .frc3d-btn.on svg{color:#fff}
html body .frc3d-btn.frc3d-f5{background:#0a6fd8;color:#fff;border-color:#0a6fd8}html body .frc3d-btn.frc3d-f5 svg{color:#fff}
html body .frc3d-close{width:36px;padding:0;justify-content:center;background:#fff;color:#1d1d1f}html body .frc3d-close .tx{display:none}
html body .frc3d-site{font:500 12.5px ${SYS};color:#1d1d1f;background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:14px;padding:4px 10px 4px 8px;box-shadow:0 2px 6px rgba(0,0,0,.1)}
html body .frc3d-site:before{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:#0a6fd8;margin-right:6px;vertical-align:1px}
html body .frc3d-road{font:500 12px ${SYS};color:#3a3a3c;border:1px solid rgba(0,0,0,.12);border-radius:6px}html body .frc3d-road:before{content:none}
html body .frc3d-card{font-family:${SYS};background:#fff;border:1px solid rgba(0,0,0,.08);border-top:1px solid rgba(0,0,0,.08);border-radius:14px;padding:10px 14px 11px;box-shadow:0 6px 20px rgba(0,0,0,.12)}
html body .frc3d-card .n{font-weight:500;font-size:12px;color:#6e6e73}
html body .frc3d-card .v b{font:600 24px ${SYS};color:#1d1d1f;letter-spacing:-.01em}
html body .frc3d-card .v span{font-size:12px;color:#6e6e73}html body .frc3d-card .s{font-size:12px;color:#0a6fd8}
html body #frc3d-chip{font-family:${SYS};background:rgba(29,29,31,.88);border-radius:18px}
/* ── ชั้น 5 */
html body #f5{font-family:${SYS}}
html body #f5 .card{background:#fff!important;border:1px solid rgba(0,0,0,.08)!important;border-radius:16px!important;box-shadow:0 4px 16px rgba(0,0,0,.08)!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
html body #f5 .logo{background:none!important;width:28px;height:28px}html body #f5 .logo img{width:28px;height:28px;display:block}
html body #f5 .brand b{font:600 15px ${SYS};color:#1d1d1f}html body #f5 .brand small{font-size:12px;color:#6e6e73}
html body #f5 .search{background:#f5f5f7;border:0;border-radius:18px;height:36px}html body #f5 .search input{font:400 14px ${SYS}}
html body #f5 .chip{background:#f5f5f7;border:0;border-radius:12px;color:#6e6e73}html body #f5 .chip b{font:600 13px ${SYS};color:#1d1d1f}html body #f5 .chip .dot{background:#0a6fd8;border-radius:8px;font:600 11px ${SYS}}
html body #f5 .clock{background:#f5f5f7;color:#1d1d1f;border-radius:12px;font:500 13px ${SYS};font-variant-numeric:tabular-nums}html body #f5 .clock i{background:#16a34a}
html body #f5 .btn{font:500 14px ${SYS};height:34px;border-radius:17px;border:1px solid rgba(0,0,0,.1);color:#1d1d1f;align-items:center;gap:6px}html body #f5 .btn:not(.skip){display:inline-flex}html body #f5 .detail .nav .btn,html body #f5 .tour .ctl .btn{justify-content:center}
html body #f5 .btn:hover{background:#f5f5f7}html body #f5 .btn.pri,html body #f5 .btn.on{background:#0a6fd8;border-color:#0a6fd8;color:#fff}
html body #f5 .kpi .ic{background:#f5f5f7;color:#6e6e73;border-radius:10px}html body #f5 .kpi span{font-size:12px;color:#6e6e73}html body #f5 .kpi strong{font:600 20px/1.15 ${SYS};color:#1d1d1f;font-variant-numeric:tabular-nums}html body #f5 .kpi strong em{font:400 12px ${SYS};color:#6e6e73;margin-left:3px}
html body #f5 .tools button{color:#3a3a3c;border-radius:10px}html body #f5 .tools button:hover{background:#f5f5f7;color:#1d1d1f}html body #f5 .tools hr{border-top-color:rgba(0,0,0,.08)}
html body #f5 .jh{font:600 14px ${SYS};color:#1d1d1f}html body #f5 .jh svg{color:#0a6fd8}html body #f5 .jh small{font:400 12px ${SYS};color:#6e6e73}
html body #f5 .steps:before{background:#e5e5ea}html body #f5 .steps .fill{background:#0a6fd8}
html body #f5 .stp i{font:600 11px ${SYS};border-width:1.5px;border-color:#d1d1d6;color:#6e6e73}
html body #f5 .stp span{font:500 11.5px ${SYS};color:#6e6e73}
html body #f5 .tour{border-top-color:rgba(0,0,0,.06)}html body #f5 .tour .n{font:500 12px ${SYS};color:#6e6e73;font-variant-numeric:tabular-nums}
html body #f5 .tour h4{font:600 17px/1.3 ${SYS};color:#1d1d1f}html body #f5 .tour p{font-size:13.5px;color:#3a3a3c;line-height:1.6}
html body #f5 .tour .ctl .btn{padding:0 12px}
html body #f5 .detail h3{font:600 18px/1.25 ${SYS};color:#1d1d1f}html body #f5 .detail .sub{font-size:13px;color:#6e6e73}html body #f5 .detail .sw{border-radius:10px;font:600 12px ${SYS}}
html body #f5 .list .tabs button{font-family:${SYS}}html body #f5 .it b{font:500 14px ${SYS};color:#1d1d1f}html body #f5 .it small{font-size:12px;color:#6e6e73}html body #f5 .it .sw{border-radius:9px;font:600 11px ${SYS}}html body #f5 .it .st{font:500 11px ${SYS}}
html body #f5 .zl{font:500 12.5px ${SYS};color:#1d1d1f;border:1px solid rgba(0,0,0,.1);box-shadow:0 2px 6px rgba(0,0,0,.08)}html body #f5 .zl i{font:600 11px ${SYS};background:#0a6fd8}
html body #f5 .bl{background:#fff;color:#1d1d1f;border:1px solid rgba(0,0,0,.1);border-radius:8px;font:500 12px ${SYS};box-shadow:0 2px 8px rgba(0,0,0,.12)}html body #f5 .bl em{color:#0a6fd8;font-weight:600}html body #f5 .bl:after{border-top-color:#fff}
html body #f5 .ttl h1{font:600 clamp(36px,5.6vw,80px)/1.05 ${SYS};letter-spacing:-.015em;color:#1d1d1f}html body #f5 .ttl p{font:400 clamp(15px,1.6vw,24px) ${SYS};color:#1d1d1f}html body #f5 .ttl .ln{display:none}
html body #f5 .skip{border-radius:18px}html body #f5 .stp.done i{background:#0a6fd8;border-color:#0a6fd8;color:#fff}html body #f5 .stp.cur i{border-color:#0a6fd8;color:#0a6fd8;box-shadow:0 0 0 4px rgba(10,111,216,.14)}html body #f5 .stp.cur span{color:#0a6fd8}
@media (max-width:760px){html body .frc3d-btn{width:36px;padding:0;justify-content:center}html body .frc3d-title{border-radius:12px;padding:8px 12px}}
`;
const st = document.createElement('style'); st.id = 'sui-css'; st.textContent = css; document.head.appendChild(st);
window.SUI = { i: (n, s) => IC[n] ? I(IC[n]).replace(/width="16" height="16"/, s ? `width="${s}" height="${s}"` : 'width="16" height="16"') : '' };
})();
