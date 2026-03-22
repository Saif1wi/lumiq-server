const ADMIN_PANEL_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>LUMIQ — لوحة التحكم</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0b1120;--card:#111c2e;--card2:#1a2840;--border:#1e3050;
  --blue:#3b82f6;--blue2:#6366f1;--green:#22c55e;--red:#ef4444;
  --yellow:#f59e0b;--purple:#8b5cf6;--pink:#ec4899;--teal:#14b8a6;
  --text:#e2e8f0;--sub:#64748b;--r:10px
}
body{font-family:Tahoma,Arial,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;font-size:14px}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
input,textarea,button,select{font-family:inherit;font-size:14px}

/* LOGIN */
#login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(ellipse at 50% -10%,#1e3050,#0b1120 70%)}
.lbox{background:var(--card);border-radius:20px;padding:40px;width:100%;max-width:380px;border:1px solid var(--border);box-shadow:0 32px 80px rgba(0,0,0,.6)}
.llogo{text-align:center;margin-bottom:28px}
.lico{width:72px;height:72px;background:linear-gradient(135deg,var(--blue),var(--blue2));border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;box-shadow:0 8px 32px rgba(59,130,246,.35)}
.lico svg{width:36px;height:36px;color:#fff}
.llogo h1{font-size:24px;font-weight:900;color:var(--text)}
.llogo p{font-size:13px;color:var(--sub);margin-top:4px}
.lerr{color:var(--red);font-size:13px;margin-bottom:12px;background:rgba(239,68,68,.08);padding:10px 12px;border-radius:8px;border:1px solid rgba(239,68,68,.2);display:none}
.lerr.on{display:block}
.lf label{font-size:11px;font-weight:700;color:var(--sub);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}
.lf input{width:100%;padding:12px 14px;background:var(--bg);border:1.5px solid var(--border);border-radius:var(--r);color:var(--text);margin-bottom:14px;transition:border-color .2s}
.lf input:focus{border-color:var(--blue);outline:none}
.lbtn{width:100%;padding:13px;background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;border-radius:var(--r);font-size:15px;font-weight:700;border:none;cursor:pointer;transition:opacity .2s}
.lbtn:hover{opacity:.9}.lbtn:disabled{opacity:.5;cursor:not-allowed}

/* LAYOUT */
#dash{display:none}
.layout{display:flex;min-height:100vh}
.sidebar{width:228px;background:var(--card);border-left:1px solid var(--border);position:fixed;top:0;right:0;bottom:0;display:flex;flex-direction:column;z-index:50;overflow-y:auto}
.slogo{padding:18px 16px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;flex-shrink:0}
.slogo-ico{width:36px;height:36px;background:linear-gradient(135deg,var(--blue),var(--blue2));border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.slogo-ico svg{width:18px;height:18px;color:#fff}
.slogo h2{font-size:16px;font-weight:800}
.slogo p{font-size:10px;color:var(--sub);margin-top:1px}
.snav{flex:1;padding:8px 0}
.sg{padding:8px 16px 3px;font-size:10px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.8px}
.ni{display:flex;align-items:center;gap:9px;padding:9px 16px;cursor:pointer;color:var(--sub);font-size:13px;font-weight:500;border-right:3px solid transparent;transition:all .18s;position:relative;user-select:none}
.ni:hover{background:rgba(255,255,255,.03);color:var(--text)}
.ni.on{color:var(--blue);background:rgba(59,130,246,.08);border-right-color:var(--blue);font-weight:600}
.ni svg{width:16px;height:16px;flex-shrink:0}
.ni .nb{position:absolute;left:14px;top:50%;transform:translateY(-50%);min-width:18px;height:18px;background:var(--red);color:#fff;font-size:10px;font-weight:700;border-radius:999px;display:flex;align-items:center;justify-content:center;padding:0 4px}
.sfooter{padding:12px 16px;border-top:1px solid var(--border);flex-shrink:0}
.sfooter-row{display:flex;align-items:center;gap:8px}
.online-dot{width:8px;height:8px;border-radius:50%;background:var(--green);flex-shrink:0;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.sfooter p{font-size:12px;color:var(--sub);flex:1}
.main{margin-right:228px;padding:22px;min-height:100vh;max-width:calc(100vw - 228px)}

/* PAGE HEADER */
.ph{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap}
.ph-t h1{font-size:20px;font-weight:800;display:flex;align-items:center;gap:8px}
.ph-t p{font-size:12px;color:var(--sub);margin-top:3px}
.ph-a{display:flex;gap:8px}

/* STATS GRID */
.sgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:12px;margin-bottom:20px}
.sc{background:var(--card);border-radius:var(--r);padding:16px;border:1px solid var(--border);display:flex;align-items:center;gap:12px;transition:all .2s;cursor:default}
.sc:hover{border-color:var(--blue);transform:translateY(-1px)}
.sc-i{width:44px;height:44px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sc-i svg{width:22px;height:22px}
.sc-v{font-size:26px;font-weight:800;line-height:1}
.sc-l{font-size:11px;color:var(--sub);margin-top:3px}

/* BUTTONS */
.btn{padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;border:none;transition:all .18s;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-size:13px}
.btn:hover{opacity:.85}.btn:disabled{opacity:.45;cursor:not-allowed}
.btn svg{width:14px;height:14px}
.b-blue{background:var(--blue);color:#fff}
.b-red{background:var(--red);color:#fff}
.b-green{background:var(--green);color:#fff}
.b-yellow{background:var(--yellow);color:#000}
.b-purple{background:var(--purple);color:#fff}
.b-gray{background:var(--card2);color:var(--text);border:1px solid var(--border)}
.b-teal{background:var(--teal);color:#fff}
.b-sm{padding:5px 11px;font-size:12px;border-radius:7px}
.b-xs{padding:3px 9px;font-size:11px;border-radius:6px}

/* BOX */
.box{background:var(--card);border-radius:var(--r);border:1px solid var(--border);overflow:hidden;margin-bottom:16px}
.bh{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.bh h3{font-size:14px;font-weight:700;display:flex;align-items:center;gap:7px}
.bh h3 svg{width:15px;height:15px;opacity:.75}
.si-box{display:flex;align-items:center;gap:8px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;padding:6px 12px;transition:border-color .2s}
.si-box:focus-within{border-color:var(--blue)}
.si-box svg{width:14px;height:14px;color:var(--sub);flex-shrink:0}
.si-box input{background:none;border:none;color:var(--text);width:170px;outline:none}
.si-box input::placeholder{color:var(--sub);opacity:.55}

/* TABLE */
.tw{overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:580px}
th{padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:var(--sub);border-bottom:1px solid var(--border);background:rgba(255,255,255,.015);white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle;font-size:13px}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,.025)}
.acts{display:flex;gap:4px;flex-wrap:wrap;align-items:center}

/* BADGES */
.bdg{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600}
.bdg svg{width:10px;height:10px}
.bgreen{background:rgba(34,197,94,.15);color:var(--green)}
.bred{background:rgba(239,68,68,.15);color:var(--red)}
.bblue{background:rgba(59,130,246,.15);color:var(--blue)}
.bgray{background:rgba(100,116,139,.12);color:var(--sub)}
.byellow{background:rgba(245,158,11,.15);color:var(--yellow)}
.bpurple{background:rgba(139,92,246,.15);color:var(--purple)}
.bteal{background:rgba(20,184,166,.15);color:var(--teal)}

/* USER CELL */
.uc{display:flex;align-items:center;gap:9px}
.ua{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--purple));display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;overflow:hidden}
.ua img{width:100%;height:100%;object-fit:cover}
.un{font-weight:600;font-size:13px}
.us{font-size:11px;color:var(--sub);margin-top:1px}
.idb{font-size:11px;color:var(--sub);font-family:monospace;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:4px}

/* PAGER */
.pager{display:flex;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--border)}
.pinfo{font-size:12px;color:var(--sub);flex:1}

/* IMAGES */
.igrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;padding:12px}
.ic{background:var(--card2);border-radius:8px;overflow:hidden;border:1px solid var(--border);transition:border-color .2s}
.ic:hover{border-color:var(--blue)}
.ic img{width:100%;height:100px;object-fit:cover;cursor:pointer;display:block}
.ic img:hover{opacity:.85}
.ic-info{padding:7px 9px}
.ic-name{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ic-time{font-size:10px;color:var(--sub);margin-top:1px}
.ic-del{width:100%;padding:4px;background:rgba(239,68,68,.1);color:var(--red);border:none;cursor:pointer;border-radius:5px;margin-top:5px;font-size:11px;display:flex;align-items:center;justify-content:center;gap:4px}
.ic-del:hover{background:rgba(239,68,68,.2)}
.ic-sel{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.6);background:rgba(0,0,0,.3);cursor:pointer;display:flex;align-items:center;justify-content:center}
.ic-sel.on{background:var(--blue);border-color:var(--blue)}
.ic-sel svg{width:11px;height:11px;color:#fff;opacity:0}
.ic-sel.on svg{opacity:1}
.ic-wrap{position:relative}

/* CHAT VIEWER */
.chat-msgs{max-height:420px;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;background:var(--bg);border-radius:8px;border:1px solid var(--border);margin-bottom:12px}
.cm{display:flex;flex-direction:column;max-width:75%}
.cm.me{align-self:flex-end}
.cm.them{align-self:flex-start}
.cm-bubble{padding:8px 12px;border-radius:16px;font-size:13px;line-height:1.5;word-break:break-word}
.cm.me .cm-bubble{background:var(--blue);color:#fff;border-bottom-left-radius:4px}
.cm.them .cm-bubble{background:var(--card2);color:var(--text);border-bottom-right-radius:4px}
.cm-meta{font-size:10px;color:var(--sub);margin-top:3px;display:flex;align-items:center;gap:6px}
.cm.me .cm-meta{justify-content:flex-end}
.cm-img{max-width:200px;border-radius:10px;cursor:pointer}
.cm-voice{font-size:12px;color:var(--sub);padding:6px 10px;background:var(--card2);border-radius:8px;display:flex;align-items:center;gap:6px}

/* FORM FIELDS */
.field{margin-bottom:14px}
.field label{font-size:11px;font-weight:700;color:var(--sub);display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}
.field input,.field textarea,.field select{width:100%;padding:10px 12px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;color:var(--text);line-height:1.5;transition:border-color .2s}
.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--blue);outline:none}
.field textarea{resize:vertical;min-height:90px}
.field select option{background:var(--card)}

/* MODAL */
.mbg{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);z-index:600;display:none;align-items:center;justify-content:center;padding:16px}
.mbg.on{display:flex}
.mbox{background:var(--card);border-radius:16px;width:100%;max-width:520px;border:1px solid var(--border);overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.6);max-height:90vh;display:flex;flex-direction:column}
.mhdr{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.mhdr h3{font-size:16px;font-weight:700}
.mx{width:28px;height:28px;border-radius:50%;background:var(--card2);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--sub)}
.mx svg{width:13px;height:13px}
.mbody{padding:20px;overflow-y:auto;flex:1}
.mfoot{padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:9px;flex-shrink:0}

/* VIEWER */
.viewer{position:fixed;inset:0;background:rgba(0,0,0,.97);z-index:900;display:none;align-items:center;justify-content:center;flex-direction:column;gap:12px}
.viewer.on{display:flex}
.viewer img{max-width:90%;max-height:85vh;border-radius:8px;object-fit:contain}
.vx{width:44px;height:44px;background:rgba(255,255,255,.1);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;border:none;font-size:20px;position:absolute;top:20px;right:20px}
.vx:hover{background:rgba(255,255,255,.2)}

/* TOAST */
.toast{position:fixed;bottom:20px;left:20px;background:var(--card2);color:var(--text);padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:999;opacity:0;transition:all .3s;pointer-events:none;border:1px solid var(--border);box-shadow:0 8px 28px rgba(0,0,0,.35);max-width:320px}
.toast.on{opacity:1;transform:translateY(-4px)}
.toast.ok{border-color:var(--green)}
.toast.err{border-color:var(--red)}

/* MISC */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:52px;color:var(--sub);text-align:center;gap:10px}
.empty svg{width:48px;height:48px;opacity:.2}
.empty h3{font-size:15px;font-weight:700;color:var(--text)}
.lw{display:flex;align-items:center;justify-content:center;padding:52px;color:var(--sub);gap:10px}
.spin{width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.di{background:var(--bg);border-radius:8px;padding:10px 12px;border:1px solid var(--border)}
.di-l{font-size:10px;font-weight:700;color:var(--sub);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px}
.di-v{font-size:13px;font-weight:600}
.chart-wrap{padding:16px}
.chart-bars{display:flex;align-items:flex-end;gap:8px;height:120px;padding-bottom:4px}
.cb-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:28px}
.cb{width:100%;background:linear-gradient(to top,var(--blue),var(--blue2));border-radius:4px 4px 0 0;transition:height .5s;min-height:4px}
.cb-l{font-size:9px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center}
.cb-v{font-size:9px;color:var(--sub);font-weight:700}
.maint-banner{background:linear-gradient(135deg,rgba(239,68,68,.15),rgba(239,68,68,.05));border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px}
.maint-banner svg{width:22px;height:22px;color:var(--red);flex-shrink:0}
.bulk-bar{position:sticky;bottom:0;background:var(--card);border-top:1px solid var(--border);padding:12px 16px;display:none;align-items:center;justify-content:space-between;gap:12px}
.bulk-bar.on{display:flex}
</style>
</head>
<body>

<div class="toast" id="toast"></div>
<div class="viewer" id="viewer"><img id="vimg" src="" alt=""/><button class="vx" onclick="closeViewer()">✕</button></div>

<!-- MODAL -->
<div class="mbg" id="modal">
  <div class="mbox">
    <div class="mhdr"><h3 id="m-ttl">...</h3><button class="mx" onclick="closeModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
    <div class="mbody" id="m-body"></div>
    <div class="mfoot" id="m-foot"></div>
  </div>
</div>

<!-- LOGIN -->
<div id="login">
  <div class="lbox">
    <div class="llogo">
      <div class="lico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/></svg></div>
      <h1>LUMIQ Admin</h1>
      <p>لوحة التحكم الكاملة</p>
    </div>
    <div class="lerr" id="lerr"></div>
    <div class="lf">
      <label>رمز الدخول</label>
      <input type="password" id="akey" placeholder="أدخل رمز الدخول..." autocomplete="off"/>
    </div>
    <button class="lbtn" id="lbtn" onclick="doLogin()">دخول ←</button>
  </div>
</div>

<!-- DASH -->
<div id="dash">
  <div class="layout">
    <div class="sidebar">
      <div class="slogo">
        <div class="slogo-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <div><h2>LUMIQ</h2><p>لوحة التحكم</p></div>
      </div>
      <div class="snav">
        <div class="sg">الرئيسية</div>
        <div class="ni on" data-p="stats" onclick="go('stats')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span>الإحصائيات</span></div>
        <div class="ni" data-p="online" onclick="go('online')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg><span>المتصلون الآن</span><span class="nb" id="nb-on" style="display:none">0</span></div>

        <div class="sg">إدارة المستخدمين</div>
        <div class="ni" data-p="users" onclick="go('users')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><span>كل المستخدمين</span></div>
        <div class="ni" data-p="friends" onclick="go('friends')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg><span>الأصدقاء</span></div>
        <div class="ni" data-p="blocks" onclick="go('blocks')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><span>الحظر</span></div>

        <div class="sg">المحتوى</div>
        <div class="ni" data-p="chats" onclick="go('chats')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>المحادثات</span></div>
        <div class="ni" data-p="messages" onclick="go('messages')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/></svg><span>بحث الرسائل</span></div>
        <div class="ni" data-p="images" onclick="go('images')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg><span>الصور</span></div>

        <div class="sg">الإشعارات</div>
        <div class="ni" data-p="broadcast" onclick="go('broadcast')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><span>إرسال إشعار</span></div>
        <div class="ni" data-p="notifs" onclick="go('notifs')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span>سجل الإشعارات</span></div>

        <div class="sg">النظام</div>
        <div class="ni" data-p="maintenance" onclick="go('maintenance')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg><span>الصيانة</span></div>
      </div>
      <div class="sfooter">
        <div class="sfooter-row">
          <div class="online-dot"></div>
          <p>مسجّل دخول</p>
          <button class="btn b-gray b-xs" onclick="doLogout()">خروج</button>
        </div>
      </div>
    </div>
    <div class="main" id="main"></div>
  </div>
</div>

<script>
var API = 'https://lumiq-server-production.up.railway.app/api';
var KEY = '', mcb = null;
var selectedImgs = [];

function G(id){return document.getElementById(id);}
function esc(s){return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):'—';}
function ini(n){return n?n.trim()[0].toUpperCase():'?';}
function fd(ts){if(!ts)return'—';var d=new Date(ts);return d.toLocaleDateString('ar',{year:'numeric',month:'short',day:'numeric'})+' '+d.toLocaleTimeString('ar',{hour:'2-digit',minute:'2-digit'});}
function fds(ts){if(!ts)return'—';var d=new Date(ts);return d.toLocaleDateString('ar',{month:'short',day:'numeric'});}

function toast(msg,type){
  var el=G('toast');el.textContent=msg;el.className='toast on'+(type?' '+type:'');
  clearTimeout(toast._t);toast._t=setTimeout(function(){el.classList.remove('on');},3400);
}
function load(html){G('main').innerHTML=html||'<div class="lw"><div class="spin"></div></div>';}
function openViewer(src){G('vimg').src=src;G('viewer').classList.add('on');}
function closeViewer(){G('viewer').classList.remove('on');}
G('viewer').onclick=function(e){if(e.target===this||e.target===G('vimg'))closeViewer();};

// MODAL
function showModal(ttl,body,foot){
  G('m-ttl').textContent=ttl;
  G('m-body').innerHTML=body;
  G('m-foot').innerHTML=foot||'<button class="btn b-gray b-sm" onclick="closeModal()">إغلاق</button>';
  G('modal').classList.add('on');
}
function closeModal(){G('modal').classList.remove('on');mcb=null;}
G('modal').onclick=function(e){if(e.target===this)closeModal();};
function confirm2(ttl,txt,okTxt,okCol,cb){
  mcb=cb;
  showModal(ttl,'<p style="color:var(--sub);line-height:1.75;font-size:14px">'+esc(txt)+'</p>',
    '<button class="btn b-gray b-sm" onclick="closeModal()">إلغاء</button>'+
    '<button class="btn b-sm" style="background:'+okCol+';color:#fff" onclick="if(mcb)mcb();closeModal()">'+esc(okTxt)+'</button>');
}

// API
function req(method,path,body){
  var opts={method:method,headers:{'x-admin-key':KEY,'Content-Type':'application/json'}};
  if(body)opts.body=JSON.stringify(body);
  return fetch(API+path,opts).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||r.status);return d;});});
}

// LOGIN
G('akey').onkeydown=function(e){if(e.key==='Enter')doLogin();};
function doLogin(){
  var k=G('akey').value.trim();if(!k)return;
  KEY=k;var btn=G('lbtn');btn.disabled=true;btn.textContent='جارٍ...';
  req('GET','/admin/stats').then(function(){
    sessionStorage.setItem('lak',k);
    G('login').style.display='none';G('dash').style.display='block';
    go('stats');loadOnlineCount();
  }).catch(function(e){
    KEY='';btn.disabled=false;btn.textContent='دخول ←';
    G('lerr').textContent=e.message.includes('401')||e.message.includes('مصرح')?'❌ رمز الدخول خاطئ':'❌ فشل الاتصال';
    G('lerr').classList.add('on');
  });
}
function doLogout(){KEY='';sessionStorage.removeItem('lak');G('login').style.display='flex';G('dash').style.display='none';}

function loadOnlineCount(){
  req('GET','/admin/online').then(function(r){
    var nb=G('nb-on');if(!nb)return;
    nb.textContent=r.length;nb.style.display=r.length>0?'flex':'none';
  }).catch(function(){});
}

// NAV
function go(page){
  document.querySelectorAll('.ni').forEach(function(el){el.classList.toggle('on',el.getAttribute('data-p')===page);});
  selectedImgs=[];load();
  var pages={stats:loadStats,online:loadOnline,users:loadUsers,friends:loadFriends,blocks:loadBlocks,chats:loadChats,messages:loadMessages,images:loadImages,broadcast:loadBroadcast,notifs:loadNotifs,maintenance:loadMaintenance};
  if(pages[page])pages[page]();
}

// ── STATS ──
function loadStats(){
  Promise.all([req('GET','/admin/stats'),req('GET','/admin/stats/detailed')]).then(function(results){
    var r=results[0],d=results[1];
    var cards=[
      {ico:uSvg(),l:'المستخدمون',v:r.users,bg:'#3b82f615',c:'#3b82f6'},
      {ico:dotSvg('#22c55e'),l:'متصل الآن',v:r.online,bg:'#22c55e15',c:'#22c55e'},
      {ico:mSvg(),l:'الرسائل',v:r.messages,bg:'#8b5cf615',c:'#8b5cf6'},
      {ico:iSvg(),l:'الصور',v:r.images,bg:'#f59e0b15',c:'#f59e0b'},
      {ico:vSvg(),l:'رسائل صوتية',v:r.voice,bg:'#ec489915',c:'#ec4899'},
      {ico:chatIco(),l:'المحادثات',v:r.chats,bg:'#14b8a615',c:'#14b8a6'},
      {ico:uSvg(),l:'مستخدمو اليوم',v:r.new_users_today,bg:'#22c55e15',c:'#22c55e'},
      {ico:mSvg(),l:'رسائل اليوم',v:r.messages_today,bg:'#f59e0b15',c:'#f59e0b'}
    ];
    var h='<div class="ph"><div class="ph-t"><h1>'+gridSvg()+' الإحصائيات</h1><p>نظرة عامة شاملة</p></div><div class="ph-a"><button class="btn b-gray b-sm" onclick="loadStats()">'+rfrSvg()+' تحديث</button></div></div>';
    h+='<div class="sgrid">';
    cards.forEach(function(c){h+='<div class="sc"><div class="sc-i" style="background:'+c.bg+';color:'+c.c+'">'+c.ico+'</div><div><div class="sc-v">'+(c.v||0).toLocaleString()+'</div><div class="sc-l">'+c.l+'</div></div></div>';});
    h+='</div>';
    // رسم بياني - رسائل آخر 7 أيام
    if(d.messages_by_day&&d.messages_by_day.length){
      var maxV=Math.max.apply(null,d.messages_by_day.map(function(x){return parseInt(x.count)||0;}));
      h+='<div class="box"><div class="bh"><h3>'+mSvg()+' الرسائل آخر 7 أيام</h3></div><div class="chart-wrap"><div class="chart-bars">';
      d.messages_by_day.forEach(function(day){
        var v=parseInt(day.count)||0;
        var pct=maxV>0?Math.max((v/maxV)*100,4):4;
        h+='<div class="cb-wrap"><div class="cb-v">'+v+'</div><div class="cb" style="height:'+pct+'%"></div><div class="cb-l">'+fds(day.day)+'</div></div>';
      });
      h+='</div></div></div>';
    }
    // أكثر المستخدمين إرسالاً
    if(d.top_users&&d.top_users.length){
      h+='<div class="box"><div class="bh"><h3>'+uSvg()+' أكثر المستخدمين نشاطاً</h3></div><div class="tw"><table><thead><tr><th>#</th><th>المستخدم</th><th>عدد الرسائل</th><th>إجراء</th></tr></thead><tbody>';
      d.top_users.forEach(function(u,i){
        h+='<tr><td><span class="idb">'+(i+1)+'</span></td>';
        h+='<td><div class="uc"><div class="ua">'+(u.photo_url?'<img src="'+esc(u.photo_url)+'" alt=""/>':ini(u.name))+'</div><div><div class="un">'+esc(u.name)+'</div><div class="us">@'+esc(u.username)+'</div></div></div></td>';
        h+='<td><span class="bdg bblue">'+esc(String(u.msg_count||0))+' رسالة</span></td>';
        h+='<td><button class="btn b-blue b-xs" onclick="viewUser('+u.id+')">'+eyeSvg()+' عرض</button></td></tr>';
      });
      h+='</tbody></table></div></div>';
    }
    G('main').innerHTML=h;
  }).catch(function(e){load('<div class="empty"><h3>❌ '+esc(e.message)+'</h3></div>');});
}

// ── ONLINE ──
function loadOnline(){
  req('GET','/admin/online').then(function(r){
    var h='<div class="ph"><div class="ph-t"><h1>'+dotSvg('#22c55e')+' المتصلون الآن</h1><p>'+r.length+' مستخدم متصل</p></div><div class="ph-a"><button class="btn b-gray b-sm" onclick="loadOnline()">'+rfrSvg()+' تحديث</button></div></div>';
    if(!r||!r.length){h+='<div class="box"><div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg><h3>لا يوجد متصلون حالياً</h3></div></div>';}
    else{
      h+='<div class="box"><div class="bh"><h3>'+dotSvg('#22c55e')+' المتصلون</h3></div><div class="tw"><table><thead><tr><th>المستخدم</th><th>آخر ظهور</th><th>إجراء</th></tr></thead><tbody>';
      r.forEach(function(u){
        h+='<tr><td><div class="uc"><div class="ua">'+(u.photo_url?'<img src="'+esc(u.photo_url)+'" alt=""/>':ini(u.name))+'</div><div><div class="un">'+esc(u.name)+'</div><div class="us">@'+esc(u.username)+'</div></div></div></td>';
        h+='<td style="font-size:12px;color:var(--sub)">'+fd(u.last_seen)+'</td>';
        h+='<td><div class="acts"><button class="btn b-blue b-xs" onclick="viewUser('+u.id+')">'+eyeSvg()+' عرض</button><button class="btn b-gray b-xs" onclick="sendDMQuick('+u.id+',\\''+esc(u.name)+'\\')">✉️ رسالة</button></div></td></tr>';
      });
      h+='</tbody></table></div></div>';
    }
    G('main').innerHTML=h;
    var nb=G('nb-on');if(nb){nb.textContent=r.length;nb.style.display=r.length>0?'flex':'none';}
  }).catch(function(e){load('<div class="empty"><h3>❌ '+esc(e.message)+'</h3></div>');});
}

function sendDMQuick(id,name){
  showModal('إرسال رسالة لـ '+name,
    '<div class="field"><label>الرسالة</label><textarea id="dm-txt" placeholder="اكتب الرسالة..."></textarea></div>',
    '<button class="btn b-gray b-sm" onclick="closeModal()">إلغاء</button>'+
    '<button class="btn b-blue b-sm" onclick="doDM('+id+')">'+mSvg()+' إرسال</button>');
}
function doDM(id){
  var txt=G('dm-txt');if(!txt||!txt.value.trim())return;
  req('POST','/admin/users/'+id+'/message',{message:txt.value.trim()}).then(function(){toast('✅ تم الإرسال','ok');closeModal();}).catch(function(e){toast('❌ '+e.message,'err');});
}

// ── USERS ──
var upage=1,usearch='';
function loadUsers(page,search){
  upage=page||1;if(search!==undefined)usearch=search;
  req('GET','/admin/users?page='+upage+'&search='+encodeURIComponent(usearch)).then(function(r){
    var pages=Math.ceil((r.total||0)/20);
    var h='<div class="ph"><div class="ph-t"><h1>'+uSvg()+' المستخدمون</h1><p>'+(r.total||0)+' مستخدم مسجّل</p></div></div>';
    h+='<div class="box"><div class="bh"><h3>'+uSvg()+' القائمة الكاملة</h3><div class="si-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="si" type="text" placeholder="ابحث بالاسم أو المستخدم أو البريد..." value="'+esc(usearch)+'"/></div></div>';
    if(!r.users||!r.users.length){h+='<div class="empty"><h3>لا توجد نتائج</h3></div>';}
    else{
      h+='<div class="tw"><table><thead><tr><th>ID</th><th>المستخدم</th><th>البريد</th><th>الحالة</th><th>التوثيق</th><th>التسجيل</th><th>إجراءات</th></tr></thead><tbody>';
      r.users.forEach(function(u){
        h+='<tr>';
        h+='<td><span class="idb">#'+u.id+'</span></td>';
        h+='<td><div class="uc"><div class="ua">'+(u.photo_url?'<img src="'+esc(u.photo_url)+'" alt=""/>':ini(u.name))+'</div><div><div class="un">'+esc(u.name)+'</div><div class="us">@'+esc(u.username)+'</div></div></div></td>';
        h+='<td style="font-size:12px;color:var(--sub)">'+esc(u.email)+'</td>';
        h+='<td>'+(u.is_banned?'<span class="bdg bred">🚫 محظور</span>':u.is_online?'<span class="bdg bgreen">🟢 متصل</span>':'<span class="bdg bgray">⚫ غير متصل</span>')+'</td>';
        h+='<td>'+(u.is_verified?'<span class="bdg bblue">✓ موثق</span>':'<span class="bdg bgray">—</span>')+'</td>';
        h+='<td style="font-size:12px;color:var(--sub);white-space:nowrap">'+fd(u.created_at)+'</td>';
        h+='<td><div class="acts">';
        h+='<button class="btn b-blue b-xs" onclick="viewUser('+u.id+')">'+eyeSvg()+' عرض</button>';
        h+=(u.is_verified?'<button class="btn b-gray b-xs" onclick="unverify('+u.id+')">إلغاء التوثيق</button>':'<button class="btn b-xs" style="background:rgba(29,155,240,.15);color:#1d9bf0" onclick="verify('+u.id+',\\''+esc(u.name)+'\\')">'+chkSvg()+' توثيق</button>');
        h+=(u.is_banned?'<button class="btn b-green b-xs" onclick="ban('+u.id+',false)">رفع الحظر</button>':'<button class="btn b-yellow b-xs" onclick="ban('+u.id+',true)">🚫 حظر</button>');
        h+='<button class="btn b-red b-xs" onclick="delUser('+u.id+',\\''+esc(u.name)+'\\')">'+trSvg()+'</button>';
        h+='</div></td></tr>';
      });
      h+='</tbody></table></div>';
    }
    h+='<div class="pager"><span class="pinfo">صفحة '+upage+' من '+pages+' — '+( r.total||0)+' مستخدم</span><div style="display:flex;gap:6px">';
    if(upage>1)h+='<button class="btn b-gray b-sm" onclick="loadUsers('+(upage-1)+')">←</button>';
    if(upage<pages)h+='<button class="btn b-gray b-sm" onclick="loadUsers('+(upage+1)+')">→</button>';
    h+='</div></div></div>';
    G('main').innerHTML=h;
    var si=G('si');
    if(si){si.focus();si.oninput=function(){clearTimeout(window._st);window._st=setTimeout(function(){loadUsers(1,si.value);},380);};}
  }).catch(function(e){load('<div class="empty"><h3>❌ '+esc(e.message)+'</h3></div>');});
}

function viewUser(id){
  req('GET','/admin/users?page=1&search=').then(function(r){
    // نبحث في كل الصفحات - نستخدم search بالـ id
    return req('GET','/admin/users?page=1&search=');
  }).then(function(){
    // نجلب مباشرة بطريقة بديلة - نبحث بكل المستخدمين
    return req('GET','/admin/users?page=1&search=');
  });
  // أفضل: نفتح modal مباشرة ونجلب تفاصيل المحادثات
  req('GET','/admin/users/:id/chats'.replace(':id',id)).catch(function(){return [];}).then(function(chats){
    // نبحث عن المستخدم في الـ cache
    var uc = window._usersCache || {};
    var u = uc[String(id)];
    var body='';
    if(!u){body='<p style="color:var(--sub)">جارٍ التحميل...</p>';}
    else{
      body='<div class="uc" style="margin-bottom:16px"><div class="ua" style="width:52px;height:52px;font-size:20px">'+(u.photo_url?'<img src="'+esc(u.photo_url)+'" alt=""/>':ini(u.name))+'</div><div><div style="font-size:17px;font-weight:700">'+esc(u.name)+(u.is_verified?' <span style="color:#1d9bf0">✓</span>':'')+'</div><div style="color:var(--sub);font-size:13px">@'+esc(u.username)+'</div></div></div>';
      body+='<div class="detail-grid"><div class="di"><div class="di-l">البريد</div><div class="di-v" style="font-size:12px">'+esc(u.email)+'</div></div><div class="di"><div class="di-l">ID</div><div class="di-v">#'+u.id+'</div></div><div class="di"><div class="di-l">الحالة</div><div class="di-v">'+(u.is_banned?'🚫 محظور':u.is_online?'🟢 متصل':'⚫ غير متصل')+'</div></div><div class="di"><div class="di-l">التوثيق</div><div class="di-v">'+(u.is_verified?'✅ موثق':'—')+'</div></div><div class="di"><div class="di-l">تاريخ التسجيل</div><div class="di-v" style="font-size:12px">'+fd(u.created_at)+'</div></div><div class="di"><div class="di-l">آخر ظهور</div><div class="di-v" style="font-size:12px">'+fd(u.last_seen)+'</div></div></div>';
      if(u.bio)body+='<div style="background:var(--bg);border-radius:8px;padding:10px 12px;border:1px solid var(--border);font-size:13px;color:var(--sub);margin-bottom:14px;font-style:italic">'+esc(u.bio)+'</div>';
    }
    // قسم تعديل البيانات
    body+='<details style="margin-bottom:14px"><summary style="cursor:pointer;font-size:13px;font-weight:700;color:var(--blue);margin-bottom:10px">✏️ تعديل البيانات</summary><div style="margin-top:12px"><div class="field"><label>الاسم</label><input id="e-name" type="text" value="'+(u?esc(u.name):'')+'"/></div><div class="field"><label>اسم المستخدم</label><input id="e-uname" type="text" value="'+(u?esc(u.username):'')+'"/></div><div class="field"><label>البريد</label><input id="e-email" type="email" value="'+(u?esc(u.email):'')+'"/></div><div class="field"><label>كلمة مرور جديدة (اتركها فارغة للإبقاء)</label><input id="e-pass" type="password" placeholder="كلمة مرور جديدة..."/></div><button class="btn b-blue b-sm" onclick="saveUserEdit('+id+')">💾 حفظ التعديلات</button></div></details>';
    // قسم الرسالة المباشرة
    body+='<div class="field"><label>إرسال رسالة مباشرة</label><div style="display:flex;gap:8px"><input id="dm-i" type="text" placeholder="اكتب الرسالة..." style="flex:1;padding:9px 12px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;color:var(--text)"/><button class="btn b-blue b-sm" onclick="doDMInline('+id+')">إرسال</button></div></div>';
    showModal('تفاصيل المستخدم',body,
      '<button class="btn b-gray b-sm" onclick="closeModal()">إغلاق</button>'+
      (u&&u.is_verified?'<button class="btn b-gray b-sm" onclick="unverify('+id+');closeModal()">إلغاء التوثيق</button>':'<button class="btn b-sm" style="background:rgba(29,155,240,.15);color:#1d9bf0" onclick="verify('+id+','+(u?'\\''+esc(u.name)+'\\'':'\\'\\'')+');closeModal()">✓ توثيق</button>')+
      (u&&u.is_banned?'<button class="btn b-green b-sm" onclick="ban('+id+',false);closeModal()">رفع الحظر</button>':'<button class="btn b-yellow b-sm" onclick="ban('+id+',true);closeModal()">🚫 حظر</button>')+
      '<button class="btn b-red b-sm" onclick="delUser('+id+','+(u?'\\''+esc(u.name)+'\\'':'\\'\\'')+');closeModal()">🗑️ حذف</button>'
    );
  });
}

function saveUserEdit(id){
  var name=G('e-name')&&G('e-name').value.trim();
  var uname=G('e-uname')&&G('e-uname').value.trim();
  var email=G('e-email')&&G('e-email').value.trim();
  var pass=G('e-pass')&&G('e-pass').value.trim();
  req('PUT','/admin/users/'+id+'/edit',{name:name||undefined,username:uname||undefined,email:email||undefined,password:pass||undefined}).then(function(){toast('✅ تم الحفظ','ok');closeModal();loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});
}

function doDMInline(id){
  var inp=G('dm-i');if(!inp||!inp.value.trim())return;
  req('POST','/admin/users/'+id+'/message',{message:inp.value.trim()}).then(function(){toast('✅ تم إرسال الرسالة','ok');inp.value='';}).catch(function(e){toast('❌ '+e.message,'err');});
}

function verify(id,name){req('POST','/admin/users/'+id+'/verify',{verified:true}).then(function(){toast('✅ تم توثيق '+name,'ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});}
function unverify(id){req('POST','/admin/users/'+id+'/verify',{verified:false}).then(function(){toast('✅ إلغاء التوثيق','ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});}
function ban(id,b){req('POST','/admin/users/'+id+'/ban',{banned:b}).then(function(){toast(b?'🚫 تم الحظر':'✅ رُفع الحظر','ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});}
function delUser(id,name){
  confirm2('حذف '+name,'سيُحذف الحساب وكل رسائله نهائياً ولا يمكن التراجع.','حذف نهائي','var(--red)',function(){
    req('DELETE','/admin/users/'+id).then(function(){toast('✅ تم الحذف','ok');loadUsers(upage,usearch);}).catch(function(e){toast('❌ '+e.message,'err');});
  });
}

// ── MESSAGES SEARCH ──
var msearch='';
function loadMessages(){
  var h='<div class="ph"><div class="ph-t"><h1>'+mSvg()+' بحث الرسائل</h1><p>ابحث في محتوى الرسائل</p></div></div>';
  h+='<div class="box"><div class="bh"><h3>'+mSvg()+' بحث متقدم</h3></div><div style="padding:16px"><div style="display:flex;gap:10px"><div class="si-box" style="flex:1;max-width:100%"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input id="msg-si" type="text" placeholder="ابحث في نصوص الرسائل..." style="width:100%"/></div><button class="btn b-blue" onclick="doMsgSearch()">بحث</button></div></div></div>';
  h+='<div id="msg-results"></div>';
  G('main').innerHTML=h;
  G('msg-si').onkeydown=function(e){if(e.key==='Enter')doMsgSearch();};
  // عرض أحدث الرسائل
  loadLatestMsgs();
}

function loadLatestMsgs(){
  req('GET','/admin/messages?page=1').then(function(r){
    renderMsgResults(r.messages,r.total,'أحدث الرسائل');
  }).catch(function(){});
}

function doMsgSearch(){
  var q=G('msg-si')&&G('msg-si').value.trim();
  if(!q){loadLatestMsgs();return;}
  req('GET','/admin/messages/search?q='+encodeURIComponent(q)).then(function(r){
    renderMsgResults(r.messages,r.total,'نتائج البحث عن "'+q+'"');
  }).catch(function(e){toast('❌ '+e.message,'err');});
}

function renderMsgResults(msgs,total,title){
  var el=G('msg-results');if(!el)return;
  var h='<div class="box"><div class="bh"><h3>'+mSvg()+' '+esc(title)+'</h3><span style="font-size:12px;color:var(--sub)">'+(total||0)+' نتيجة</span></div>';
  if(!msgs||!msgs.length){h+='<div class="empty"><h3>لا توجد نتائج</h3></div>';}
  else{
    h+='<div class="tw"><table><thead><tr><th>المرسل</th><th>الرسالة</th><th>النوع</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>';
    msgs.forEach(function(m){
      var typBdg=m.type==='image'?'<span class="bdg byellow">'+iSvg()+' صورة</span>':m.type==='voice'?'<span class="bdg bpurple">'+vSvg()+' صوت</span>':'<span class="bdg bgray">'+mSvg()+' نص</span>';
      h+='<tr><td><div class="uc"><div class="ua">'+ini(m.sender_name)+'</div><div><div class="un">'+esc(m.sender_name)+'</div><div class="us">@'+esc(m.username)+'</div></div></div></td>';
      h+='<td style="max-width:260px;font-size:12px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(m.text||'—')+'</td>';
      h+='<td>'+typBdg+'</td>';
      h+='<td style="font-size:12px;color:var(--sub);white-space:nowrap">'+fd(m.created_at)+'</td>';
      h+='<td><button class="btn b-red b-xs" onclick="delMsg(\\''+m.id+'\\')">'+trSvg()+'</button></td></tr>';
    });
    h+='</tbody></table></div>';
  }
  h+='</div>';
  el.innerHTML=h;
}

var mpage2=1;
function delMsg(id){
  confirm2('حذف الرسالة','لا يمكن التراجع.','حذف','var(--red)',function(){
    req('DELETE','/admin/messages/'+id).then(function(){toast('✅ تم','ok');loadLatestMsgs();}).catch(function(e){toast('❌ '+e.message,'err');});
  });
}

// ── CHATS ──
var cpage=1;
function loadChats(page){
  cpage=page||1;
  req('GET','/admin/chats?page='+cpage).then(function(r){
    var pages=Math.ceil((r.total||0)/20);
    var h='<div class="ph"><div class="ph-t"><h1>'+chatIco()+' المحادثات</h1><p>'+(r.total||0)+' محادثة</p></div></div>';
    h+='<div class="box"><div class="bh"><h3>'+chatIco()+' جميع المحادثات</h3></div>';
    if(!r.chats||!r.chats.length){h+='<div class="empty"><h3>لا توجد محادثات</h3></div>';}
    else{
      h+='<div class="tw"><table><thead><tr><th>ID</th><th>آخر رسالة</th><th>عدد الرسائل</th><th>التاريخ</th><th>إجراءات</th></tr></thead><tbody>';
      r.chats.forEach(function(c){
        h+='<tr>';
        h+='<td><span class="idb" style="font-size:10px">'+esc(String(c.id).substring(0,16))+'...</span></td>';
        h+='<td style="max-width:200px;font-size:12px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.last_message||'—')+'</td>';
        h+='<td><span class="bdg bblue">'+esc(String(c.msg_count||0))+'</span></td>';
        h+='<td style="font-size:12px;color:var(--sub);white-space:nowrap">'+fd(c.last_message_at)+'</td>';
        h+='<td><div class="acts"><button class="btn b-teal b-xs" onclick="viewChat(\\''+esc(c.id)+'\\')">'+eyeSvg()+' عرض</button><button class="btn b-red b-xs" onclick="delChat(\\''+esc(c.id)+'\\')">'+trSvg()+' حذف</button></div></td></tr>';
      });
      h+='</tbody></table></div>';
    }
    h+='<div class="pager"><span class="pinfo">صفحة '+cpage+' من '+pages+'</span><div style="display:flex;gap:6px">';
    if(cpage>1)h+='<button class="btn b-gray b-sm" onclick="loadChats('+(cpage-1)+')">←</button>';
    if(cpage<pages)h+='<button class="btn b-gray b-sm" onclick="loadChats('+(cpage+1)+')">→</button>';
    h+='</div></div></div>';
    G('main').innerHTML=h;
  }).catch(function(e){load('<div class="empty"><h3>❌ '+esc(e.message)+'</h3></div>');});
}

function viewChat(id){
  req('GET','/admin/chats/'+id+'/messages').then(function(r){
    var msgs=r.messages||[];
    var parts=r.participants||[];
    var body='';
    // معلومات المشاركين
    if(parts.length){
      body+='<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">';
      parts.forEach(function(p){body+='<div class="bdg bblue">'+esc(p.name)+' @'+esc(p.username)+'</div>';});
      body+='</div>';
    }
    body+='<div class="chat-msgs" id="chat-view-msgs">';
    msgs.forEach(function(m){
      var isFirst=parts.length>0&&String(m.sender_id)===String(parts[0]&&parts[0].id);
      var cls=isFirst?'me':'them';
      if(m.type==='image'&&m.image_url){
        body+='<div class="cm '+cls+'"><div class="cm-bubble" style="padding:4px"><img class="cm-img" src="'+esc(m.image_url)+'" onclick="openViewer(\\''+esc(m.image_url)+'\\')" loading="lazy"/></div><div class="cm-meta">'+esc(m.sender_name)+' · '+fd(m.created_at)+'<button onclick="delChatMsg(\\''+id+'\\','+m.id+')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px">🗑️</button></div></div>';
      } else if(m.type==='voice'){
        body+='<div class="cm '+cls+'"><div class="cm-bubble"><div class="cm-voice">🎤 رسالة صوتية</div></div><div class="cm-meta">'+esc(m.sender_name)+' · '+fd(m.created_at)+'<button onclick="delChatMsg(\\''+id+'\\','+m.id+')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px">🗑️</button></div></div>';
      } else {
        body+='<div class="cm '+cls+'"><div class="cm-bubble">'+esc(m.text||'')+'</div><div class="cm-meta">'+esc(m.sender_name)+' · '+fd(m.created_at)+'<button onclick="delChatMsg(\\''+id+'\\','+m.id+')" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:11px">🗑️</button></div></div>';
      }
    });
    body+='</div>';
    if(!msgs.length)body+='<div style="text-align:center;color:var(--sub);padding:20px">لا توجد رسائل</div>';
    showModal('عرض المحادثة ('+esc(String(r.total||0))+' رسالة)',body,
      '<button class="btn b-gray b-sm" onclick="closeModal()">إغلاق</button>'+
      '<button class="btn b-red b-sm" onclick="delChat(\\''+esc(id)+'\\');closeModal()">'+trSvg()+' حذف المحادثة</button>');
    // scroll to bottom
    setTimeout(function(){var el=G('chat-view-msgs');if(el)el.scrollTop=el.scrollHeight;},100);
  }).catch(function(e){toast('❌ '+e.message,'err');});
}

function delChatMsg(chatId,msgId){
  req('DELETE','/admin/chats/'+chatId+'/messages/'+msgId).then(function(){
    toast('✅ تم حذف الرسالة','ok');
    var el=document.querySelector('.cm [onclick*="'+msgId+'"]');
    if(el)el.closest('.cm').remove();
  }).catch(function(e){toast('❌ '+e.message,'err');});
}

function delChat(id){
  confirm2('حذف المحادثة','ستُحذف جميع الرسائل نهائياً.','حذف','var(--red)',function(){
    req('DELETE','/admin/chats/'+id).then(function(){toast('✅ تم','ok');loadChats(cpage);}).catch(function(e){toast('❌ '+e.message,'err');});
  });
}

// ── IMAGES ──
var ipage2=1;
function loadImages(page){
  ipage2=page||1;selectedImgs=[];
  req('GET','/admin/images?page='+ipage2).then(function(r){
    var pages=Math.ceil((r.total||0)/20);
    var h='<div class="ph"><div class="ph-t"><h1>'+iSvg()+' الصور</h1><p>'+(r.total||0)+' صورة</p></div><div class="ph-a"><button class="btn b-red b-sm" id="bulk-del-btn" style="display:none" onclick="bulkDeleteImgs()">'+trSvg()+' حذف المحدّد</button></div></div>';
    h+='<div class="box"><div class="bh"><h3>'+iSvg()+' معرض الصور</h3><span style="font-size:12px;color:var(--sub)">اضغط الصور لتحديدها للحذف الجماعي</span></div>';
    if(!r.images||!r.images.length){h+='<div class="empty"><h3>لا توجد صور</h3></div>';}
    else{
      h+='<div class="igrid">';
      r.images.forEach(function(img){
        h+='<div class="ic"><div class="ic-wrap"><img src="'+esc(img.image_url)+'" onclick="toggleImgSelect(\\''+img.id+'\\',this)" loading="lazy"/><div class="ic-sel" id="ic-sel-'+img.id+'"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></div></div><div class="ic-info"><div class="ic-name">'+esc(img.sender_name)+'</div><div class="ic-time">'+fd(img.created_at)+'</div><button class="ic-del" onclick="delMsg(\\''+img.id+'\\')">'+trSvg()+' حذف</button></div></div>';
      });
      h+='</div>';
    }
    h+='<div class="pager"><span class="pinfo">صفحة '+ipage2+' من '+pages+'</span><div style="display:flex;gap:6px">';
    if(ipage2>1)h+='<button class="btn b-gray b-sm" onclick="loadImages('+(ipage2-1)+')">←</button>';
    if(ipage2<pages)h+='<button class="btn b-gray b-sm" onclick="loadImages('+(ipage2+1)+')">→</button>';
    h+='</div></div></div>';
    G('main').innerHTML=h;
  }).catch(function(e){load('<div class="empty"><h3>❌ '+esc(e.message)+'</h3></div>');});
}

function toggleImgSelect(id,imgEl){
  var sel=G('ic-sel-'+id);if(!sel)return;
  var idx=selectedImgs.indexOf(id);
  if(idx>-1){selectedImgs.splice(idx,1);sel.classList.remove('on');}
  else{selectedImgs.push(id);sel.classList.add('on');}
  var btn=G('bulk-del-btn');
  if(btn)btn.style.display=selectedImgs.length>0?'flex':'none';
  if(btn&&selectedImgs.length>0)btn.textContent='🗑️ حذف '+selectedImgs.length+' صورة';
}

function bulkDeleteImgs(){
  if(!selectedImgs.length)return;
  confirm2('حذف '+selectedImgs.length+' صورة','سيتم حذف الصور المحددة نهائياً.','حذف الكل','var(--red)',function(){
    req('DELETE','/admin/images/bulk',{ids:selectedImgs.map(function(id){return parseInt(id);})}).then(function(r){
      toast('✅ تم حذف '+r.deleted+' صورة','ok');loadImages(ipage2);
    }).catch(function(e){toast('❌ '+e.message,'err');});
  });
}

// ── FRIENDS ──
var fpage=1;
function loadFriends(page){
  fpage=page||1;
  req('GET','/admin/friends?page='+fpage).then(function(r){
    var pages=Math.ceil((r.total||0)/20);
    var h='<div class="ph"><div class="ph-t"><h1>👫 الأصدقاء</h1><p>'+(r.total||0)+' علاقة صداقة</p></div></div>';
    h+='<div class="box"><div class="bh"><h3>👫 قائمة الصداقات والطلبات</h3></div>';
    if(!r.friends||!r.friends.length){h+='<div class="empty"><h3>لا توجد صداقات</h3></div>';}
    else{
      h+='<div class="tw"><table><thead><tr><th>مرسل الطلب</th><th>المستقبل</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>';
      r.friends.forEach(function(f){
        var st=f.status==='accepted'?'<span class="bdg bgreen">'+chkSvg()+' مقبول</span>':'<span class="bdg byellow">⏳ انتظار</span>';
        h+='<tr><td><div class="uc"><div class="ua">'+ini(f.requester_name)+'</div><div><div class="un">'+esc(f.requester_name)+'</div><div class="us">@'+esc(f.requester_username)+'</div></div></div></td>';
        h+='<td><div class="uc"><div class="ua">'+ini(f.addressee_name)+'</div><div><div class="un">'+esc(f.addressee_name)+'</div><div class="us">@'+esc(f.addressee_username)+'</div></div></div></td>';
        h+='<td>'+st+'</td><td style="font-size:12px;color:var(--sub);white-space:nowrap">'+fd(f.created_at)+'</td>';
        h+='<td><button class="btn b-red b-xs" onclick="delFriend('+f.id+')">'+trSvg()+' حذف</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
    h+='<div class="pager"><span class="pinfo">صفحة '+fpage+' من '+pages+'</span><div style="display:flex;gap:6px">';
    if(fpage>1)h+='<button class="btn b-gray b-sm" onclick="loadFriends('+(fpage-1)+')">←</button>';
    if(fpage<pages)h+='<button class="btn b-gray b-sm" onclick="loadFriends('+(fpage+1)+')">→</button>';
    h+='</div></div></div>';
    G('main').innerHTML=h;
  }).catch(function(e){load('<div class="empty"><h3>❌ '+esc(e.message)+'</h3></div>');});
}
function delFriend(id){
  confirm2('حذف علاقة الصداقة','لا يمكن التراجع.','حذف','var(--red)',function(){
    req('DELETE','/admin/friends/'+id).then(function(){toast('✅ تم','ok');loadFriends(fpage);}).catch(function(e){toast('❌ '+e.message,'err');});
  });
}

// ── BLOCKS ──
function loadBlocks(){
  req('GET','/admin/blocks').then(function(r){
    var h='<div class="ph"><div class="ph-t"><h1>🚫 الحظر</h1><p>'+(r.length||0)+' حالة حظر</p></div></div>';
    h+='<div class="box"><div class="bh"><h3>🚫 قائمة الحظر</h3></div>';
    if(!r||!r.length){h+='<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg><h3>لا توجد حالات حظر</h3></div>';}
    else{
      h+='<div class="tw"><table><thead><tr><th>الحاظر</th><th>المحظور</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>';
      r.forEach(function(b){
        h+='<tr><td><div class="uc"><div class="ua">'+ini(b.blocker_name)+'</div><div><div class="un">'+esc(b.blocker_name)+'</div><div class="us">@'+esc(b.blocker_username)+'</div></div></div></td>';
        h+='<td><div class="uc"><div class="ua">'+ini(b.blocked_name)+'</div><div><div class="un">'+esc(b.blocked_name)+'</div><div class="us">@'+esc(b.blocked_username)+'</div></div></div></td>';
        h+='<td style="font-size:12px;color:var(--sub);white-space:nowrap">'+fd(b.created_at)+'</td>';
        h+='<td><button class="btn b-green b-xs" onclick="delBlock('+b.id+')">🔓 رفع الحظر</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
    h+='</div>';
    G('main').innerHTML=h;
  }).catch(function(e){load('<div class="empty"><h3>❌ '+esc(e.message)+'</h3></div>');});
}
function delBlock(id){
  req('DELETE','/admin/blocks/'+id).then(function(){toast('✅ رُفع الحظر','ok');loadBlocks();}).catch(function(e){toast('❌ '+e.message,'err');});
}

// ── BROADCAST ──
function loadBroadcast(){
  G('main').innerHTML='<div class="ph"><div class="ph-t"><h1>📢 إرسال إشعار</h1><p>يصل للمتصلين فوراً ويُحفظ للباقين</p></div></div>'+
    '<div class="box"><div class="bh"><h3>📢 إشعار جديد</h3></div><div style="padding:20px">'+
    '<div class="field"><label>العنوان</label><input id="b-title" type="text" value="LUMIQ" placeholder="عنوان الإشعار..."/></div>'+
    '<div class="field"><label>الرسالة</label><textarea id="b-msg" placeholder="اكتب الرسالة التي ستصل لجميع المستخدمين..."></textarea></div>'+
    '<button class="btn b-blue" onclick="sendBroadcast()">📢 إرسال للجميع</button>'+
    '</div></div>';
}
function sendBroadcast(){
  var t=G('b-title').value.trim(),m=G('b-msg').value.trim();
  if(!m){toast('⚠️ اكتب الرسالة','err');return;}
  req('POST','/admin/broadcast',{title:t||'LUMIQ',message:m}).then(function(){toast('✅ تم الإرسال','ok');G('b-msg').value='';}).catch(function(e){toast('❌ '+e.message,'err');});
}

// ── NOTIFS ──
function loadNotifs(){
  req('GET','/admin/notifications').then(function(r){
    var h='<div class="ph"><div class="ph-t"><h1>🔔 سجل الإشعارات</h1><p>'+(r.length||0)+' إشعار</p></div></div>';
    h+='<div class="box"><div class="bh"><h3>🔔 الإشعارات المرسلة</h3></div>';
    if(!r||!r.length){h+='<div class="empty"><h3>لا توجد إشعارات</h3></div>';}
    else{
      h+='<div class="tw"><table><thead><tr><th>العنوان</th><th>الرسالة</th><th>القراءات</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>';
      r.forEach(function(n){
        h+='<tr><td style="font-weight:600">'+esc(n.title)+'</td>';
        h+='<td style="max-width:280px;font-size:12px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(n.message)+'</td>';
        h+='<td><span class="bdg bblue">'+esc(String(n.read_count||0))+' قراءة</span></td>';
        h+='<td style="font-size:12px;color:var(--sub);white-space:nowrap">'+fd(n.created_at)+'</td>';
        h+='<td><button class="btn b-red b-xs" onclick="delNotif('+n.id+')">'+trSvg()+'</button></td></tr>';
      });
      h+='</tbody></table></div>';
    }
    h+='</div>';
    G('main').innerHTML=h;
  }).catch(function(e){load('<div class="empty"><h3>❌ '+esc(e.message)+'</h3></div>');});
}
function delNotif(id){
  confirm2('حذف الإشعار','سيُحذف من سجل الجميع.','حذف','var(--red)',function(){
    req('DELETE','/admin/notifications/'+id).then(function(){toast('✅ تم','ok');loadNotifs();}).catch(function(e){toast('❌ '+e.message,'err');});
  });
}

// ── MAINTENANCE ──
function loadMaintenance(){
  G('main').innerHTML='<div class="ph"><div class="ph-t"><h1>⚙️ الصيانة</h1><p>التحكم في حالة التطبيق</p></div></div>'+
    '<div class="maint-banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div><div style="font-weight:700;color:var(--red)">تحذير</div><div style="font-size:12px;color:var(--sub);margin-top:2px">إيقاف التطبيق سيطرد جميع المستخدمين المتصلين</div></div></div>'+
    '<div class="box"><div class="bh"><h3>⚙️ وضع الصيانة</h3></div><div style="padding:20px">'+
    '<div class="field"><label>رسالة الصيانة</label><input id="maint-msg" type="text" value="التطبيق في وضع الصيانة. نعود قريباً 🔧" placeholder="رسالة تظهر للمستخدمين..."/></div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
    '<button class="btn b-red" onclick="sendMaintenance(true)">⏸️ إيقاف التطبيق وطرد الجميع</button>'+
    '<button class="btn b-green" onclick="sendMaintenance(false)">▶️ إعادة تشغيل التطبيق</button>'+
    '</div></div></div>'+
    '<div class="box"><div class="bh"><h3>📊 إحصائيات النظام</h3></div><div id="sys-stats" style="padding:16px"><div class="lw"><div class="spin"></div></div></div></div>';
  loadSysStats();
}

function sendMaintenance(enable){
  var msg=G('maint-msg')&&G('maint-msg').value.trim();
  confirm2(enable?'⏸️ إيقاف التطبيق':'▶️ تشغيل التطبيق',enable?'سيتم طرد كل المستخدمين المتصلين وإرسال رسالة الصيانة.':'سيتم إرسال إشعار بعودة التطبيق.',enable?'إيقاف':'تشغيل',enable?'var(--red)':'var(--green)',function(){
    req('POST','/admin/maintenance',{enable:enable,message:msg}).then(function(r){
      toast(enable?'⏸️ تم إيقاف التطبيق ('+r.online+' مستخدم طُرد)':'▶️ تم تشغيل التطبيق',enable?'err':'ok');
    }).catch(function(e){toast('❌ '+e.message,'err');});
  });
}

function loadSysStats(){
  req('GET','/admin/stats').then(function(r){
    var el=G('sys-stats');if(!el)return;
    el.innerHTML='<div class="detail-grid">'+
      '<div class="di"><div class="di-l">إجمالي المستخدمين</div><div class="di-v">'+( r.users||0).toLocaleString()+'</div></div>'+
      '<div class="di"><div class="di-l">المتصلون الآن</div><div class="di-v" style="color:var(--green)">🟢 '+(r.online||0)+'</div></div>'+
      '<div class="di"><div class="di-l">إجمالي الرسائل</div><div class="di-v">'+(r.messages||0).toLocaleString()+'</div></div>'+
      '<div class="di"><div class="di-l">إجمالي المحادثات</div><div class="di-v">'+(r.chats||0).toLocaleString()+'</div></div>'+
      '</div>';
  }).catch(function(){});
}

// ── SVG ICONS ──
function sv(d){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">'+d+'</svg>';}
function uSvg(){return sv('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');}
function mSvg(){return sv('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');}
function iSvg(){return sv('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>');}
function vSvg(){return sv('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>');}
function chatIco(){return sv('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="13" y2="14"/>');}
function gridSvg(){return sv('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>');}
function trSvg(){return sv('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>');}
function chkSvg(){return sv('<polyline points="20 6 9 17 4 12"/>');}
function eyeSvg(){return sv('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>');}
function rfrSvg(){return sv('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>');}
function dotSvg(c){return '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="8" fill="'+(c||'#22c55e')+'"/></svg>';}

// ── INIT ──
(function(){
  var k=sessionStorage.getItem('lak');
  if(k){
    KEY=k;G('akey').value=k;
    req('GET','/admin/stats').then(function(){
      G('login').style.display='none';G('dash').style.display='block';
      go('stats');loadOnlineCount();
    }).catch(function(){KEY='';sessionStorage.removeItem('lak');});
  }
})();
</script>
</body>
</html>
`;

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const JWT_SECRET = process.env.JWT_SECRET || 'lumiq_secret_2024';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:egNpBttTyFpglzpNqAGOiATDXpCHAMLO@centerbeam.proxy.rlwy.net:43941/railway';
const PORT = process.env.PORT || 3000;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD || 'dxahljm5o',
  api_key: process.env.CLOUDINARY_KEY || '536977242836915',
  api_secret: process.env.CLOUDINARY_SECRET || 'kqIUC7aXQJF_s8r6kA5e_z367yA'
});

const db = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function initDB() {
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    bio TEXT DEFAULT '',
    photo_url TEXT DEFAULT '',
    is_online BOOLEAN DEFAULT false,
    is_banned BOOLEAN DEFAULT false,
    last_seen TIMESTAMP DEFAULT NOW(),
    show_last_seen BOOLEAN DEFAULT true,
    show_online BOOLEAN DEFAULT true,
    show_join_date BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    participants TEXT[],
    last_message TEXT DEFAULT '',
    last_message_at TIMESTAMP DEFAULT NOW(),
    unread_count JSONB DEFAULT '{}'
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
    sender_id INT REFERENCES users(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'text',
    text TEXT,
    audio_url TEXT,
    image_url TEXT,
    duration INT,
    seen BOOLEAN DEFAULT false,
    reactions JSONB DEFAULT '{}',
    reply_to JSONB,
    forwarded BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  )`);

  var alters = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS show_join_date BOOLEAN DEFAULT true",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false",
    "ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded BOOLEAN DEFAULT false"
  ];
  for (var i = 0; i < alters.length; i++) {
    await db.query(alters[i]).catch(function(){});
  }

  await db.query(`CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    blocker_id INT REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INT REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    requester_id INT REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INT REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS notification_reads (
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    notification_id INT REFERENCES notifications(id) ON DELETE CASCADE,
    PRIMARY KEY(user_id, notification_id)
  )`);
  console.log('DB ready');
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization','x-admin-key'] }));
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));

app.get('/sw.js', function(req, res) {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'sw.js'));
});
app.get('/manifest.json', function(req, res) {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});
app.get('/icon-:size.png', function(req, res) {
  res.sendFile(path.join(__dirname, 'icon-' + req.params.size + '.png'), function(err) { if (err) res.status(404).end(); });
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
var onlineUsers = {}; // declared early for use in routes

app.get('/api/ping', function(req, res) { res.json({ ok: true }); });

function auth(req, res, next) {
  var token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { res.status(401).json({ error: 'Invalid token' }); }
}

// AUTH
app.post('/api/register', async function(req, res) {
  try {
    var name = req.body.name, username = req.body.username, email = req.body.email, password = req.body.password;
    if (!name || !username || !email || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور 6 أحرف على الأقل' });
    var exists = await db.query('SELECT id FROM users WHERE username=$1 OR email=$2', [username.toLowerCase(), email.toLowerCase()]);
    if (exists.rows.length) return res.status(400).json({ error: 'اسم المستخدم أو البريد مستخدم' });
    var hash = await bcrypt.hash(password, 10);
    var result = await db.query(
      'INSERT INTO users (name,username,email,password) VALUES ($1,$2,$3,$4) RETURNING id,name,username,email,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at',
      [name, username.toLowerCase(), email.toLowerCase(), hash]
    );
    var user = result.rows[0];
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: token, user: user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

app.post('/api/login', async function(req, res) {
  try {
    var email = req.body.email, password = req.body.password;
    var result = await db.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
    var user = result.rows[0];
    if (!user) return res.status(400).json({ error: 'البريد غير موجود' });
    if (user.is_banned) return res.status(403).json({ error: 'تم حظر حسابك' });
    var ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'كلمة المرور خاطئة' });
    await db.query('UPDATE users SET is_online=true,last_seen=NOW() WHERE id=$1', [user.id]);
    delete user.password;
    var token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: token, user: user });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// USERS
app.get('/api/me', auth, async function(req, res) {
  var r = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE id=$1', [req.user.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
  res.json(r.rows[0]);
});

app.put('/api/me', auth, async function(req, res) {
  try {
    var name = req.body.name, username = req.body.username, bio = req.body.bio;
    var show_last_seen = req.body.show_last_seen, show_online = req.body.show_online, show_join_date = req.body.show_join_date;
    if (username) {
      username = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (username.length < 3) return res.status(400).json({ error: 'اسم المستخدم قصير جداً' });
      var ex = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2', [username, req.user.id]);
      if (ex.rows.length) return res.status(400).json({ error: 'اسم المستخدم مستخدم' });
    }
    await db.query(
      'UPDATE users SET name=COALESCE($1,name), username=COALESCE($2,username), bio=COALESCE($3,bio), show_last_seen=COALESCE($4,show_last_seen), show_online=COALESCE($5,show_online), show_join_date=COALESCE($6,show_join_date) WHERE id=$7',
      [name||null, username||null, bio!==undefined?bio:null, show_last_seen!==undefined?show_last_seen:null, show_online!==undefined?show_online:null, show_join_date!==undefined?show_join_date:null, req.user.id]
    );
    var r = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE id=$1', [req.user.id]);
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/me/avatar', auth, upload.single('avatar'), async function(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:' + req.file.mimetype + ';base64,' + b64, { folder:'lumiq/avatars', transformation:[{width:300,height:300,crop:'fill'}] });
    await db.query('UPDATE users SET photo_url=$1 WHERE id=$2', [up.secure_url, req.user.id]);
    res.json({ photo_url: up.secure_url });
  } catch(e) { console.error(e); res.status(500).json({ error: 'فشل رفع الصورة' }); }
});

app.get('/api/users/search', auth, async function(req, res) {
  try {
    var q = req.query.q ? req.query.q.toLowerCase().trim() : '';
    if (!q || q.length < 2) return res.json([]);
    var r = await db.query(
      'SELECT id,name,username,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE (username ILIKE $1 OR name ILIKE $1) AND id!=$2 AND is_banned=false LIMIT 20',
      ['%' + q + '%', req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/users/:id', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT id,name,username,bio,photo_url,is_online,is_verified,last_seen,show_last_seen,show_online,show_join_date,created_at FROM users WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'غير موجود' });
    var user = Object.assign({}, r.rows[0]);
    var theyBlockedMe = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.params.id, req.user.id]);
    if (theyBlockedMe.rows.length) { user.photo_url=''; user.is_online=false; user.last_seen=null; user.show_online=false; user.show_last_seen=false; }
    res.json(user);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/me', auth, async function(req, res) {
  try {
    var uid = req.user.id;
    await db.query('DELETE FROM messages WHERE sender_id=$1', [uid]);
    await db.query("DELETE FROM chats WHERE $1=ANY(participants)", [String(uid)]);
    await db.query('DELETE FROM users WHERE id=$1', [uid]);
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

// BLOCK
app.post('/api/block', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.body.user_id);
    if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'غير صالح' });
    await db.query('INSERT INTO blocks (blocker_id,blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, targetId]);
    if (onlineUsers[String(targetId)]) io.to(onlineUsers[String(targetId)]).emit('you_are_blocked', { by_user_id: req.user.id });
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/unblock', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.body.user_id);
    await db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, targetId]);
    if (onlineUsers[String(targetId)]) io.to(onlineUsers[String(targetId)]).emit('you_are_unblocked', { by_user_id: req.user.id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/block/status/:userId', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.params.userId);
    var iBlocked = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, targetId]);
    var theyBlocked = await db.query('SELECT id FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [targetId, req.user.id]);
    res.json({ i_blocked: iBlocked.rows.length > 0, they_blocked: theyBlocked.rows.length > 0 });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// FRIENDS
app.post('/api/friends/request', auth, async function(req, res) {
  try {
    var targetId = parseInt(req.body.user_id);
    if (!targetId || targetId === req.user.id) return res.status(400).json({ error: 'غير صالح' });
    var blocked = await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [req.user.id, targetId]);
    if (blocked.rows.length) return res.status(403).json({ error: 'لا يمكن إرسال طلب' });
    var exists = await db.query('SELECT * FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)', [req.user.id, targetId]);
    if (exists.rows.length) return res.status(400).json({ error: 'طلب موجود مسبقاً', status: exists.rows[0].status });
    await db.query('INSERT INTO friendships (requester_id,addressee_id,status) VALUES ($1,$2,$3)', [req.user.id, targetId, 'pending']);
    var sender = await db.query('SELECT id,name,username,photo_url,is_verified FROM users WHERE id=$1', [req.user.id]);
    if (onlineUsers[String(targetId)]) io.to(onlineUsers[String(targetId)]).emit('friend_request', { from: sender.rows[0] });
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/friends/accept', auth, async function(req, res) {
  try {
    var requesterId = parseInt(req.body.user_id);
    var r = await db.query('UPDATE friendships SET status=$1 WHERE requester_id=$2 AND addressee_id=$3 AND status=$4 RETURNING *', ['accepted', requesterId, req.user.id, 'pending']);
    if (!r.rows.length) return res.status(404).json({ error: 'الطلب غير موجود' });
    var accepter = await db.query('SELECT id,name,username,photo_url,is_verified FROM users WHERE id=$1', [req.user.id]);
    if (onlineUsers[String(requesterId)]) io.to(onlineUsers[String(requesterId)]).emit('friend_accepted', { by: accepter.rows[0] });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/friends/reject', auth, async function(req, res) {
  try {
    var otherId = parseInt(req.body.user_id);
    await db.query('DELETE FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)', [req.user.id, otherId]);
    if (onlineUsers[String(otherId)]) io.to(onlineUsers[String(otherId)]).emit('friend_rejected', { by_user_id: req.user.id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/friends', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT u.id,u.name,u.username,u.photo_url,u.is_online,u.is_verified,u.last_seen,u.show_online,u.show_last_seen,f.status,f.requester_id FROM friendships f JOIN users u ON (CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END)=u.id WHERE (f.requester_id=$1 OR f.addressee_id=$1) ORDER BY f.created_at DESC',
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/friends/requests', auth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT u.id,u.name,u.username,u.photo_url,u.is_verified,f.created_at FROM friendships f JOIN users u ON f.requester_id=u.id WHERE f.addressee_id=$1 AND f.status=$2 ORDER BY f.created_at DESC',
      [req.user.id, 'pending']
    );
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/friends/status/:userId', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT * FROM friendships WHERE (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)', [req.user.id, req.params.userId]);
    if (!r.rows.length) return res.json({ status: 'none' });
    var f = r.rows[0];
    res.json({ status: f.status, i_requested: String(f.requester_id) === String(req.user.id) });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// CHATS
app.post('/api/chats', auth, async function(req, res) {
  try {
    var other = String(req.body.other_user_id);
    var ids = [String(req.user.id), other].sort();
    var cid = ids.join('_');
    var ex = await db.query('SELECT * FROM chats WHERE id=$1', [cid]);
    if (ex.rows.length) return res.json(ex.rows[0]);
    var uc = {}; uc[req.user.id] = 0; uc[other] = 0;
    var r = await db.query('INSERT INTO chats (id,participants,unread_count) VALUES ($1,$2,$3) RETURNING *', [cid, ids, JSON.stringify(uc)]);
    res.json(r.rows[0]);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.get('/api/chats', auth, async function(req, res) {
  try {
    var r = await db.query("SELECT * FROM chats WHERE $1=ANY(participants) ORDER BY last_message_at DESC", [String(req.user.id)]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.delete('/api/chats/:chatId/delete', auth, async function(req, res) {
  try {
    var chatId = req.params.chatId;
    var chat = await db.query('SELECT participants FROM chats WHERE id=$1', [chatId]);
    if (!chat.rows.length) return res.status(404).json({ error: 'غير موجود' });
    if (!chat.rows[0].participants.includes(String(req.user.id))) return res.status(403).json({ error: 'غير مسموح' });
    await db.query('DELETE FROM messages WHERE chat_id=$1', [chatId]);
    await db.query('DELETE FROM chats WHERE id=$1', [chatId]);
    io.to(chatId).emit('chat_deleted', { chat_id: chatId });
    res.json({ ok: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

// MESSAGES
app.get('/api/chats/:chatId/messages', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT * FROM messages WHERE chat_id=$1 ORDER BY created_at ASC LIMIT 200', [req.params.chatId]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages', auth, async function(req, res) {
  try {
    var chatId = req.params.chatId, text = req.body.text, reply_to = req.body.reply_to;
    if (!text || !text.trim()) return res.status(400).json({ error: 'الرسالة فارغة' });
    var chat = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (chat.rows.length) {
      var otherPid = chat.rows[0].participants.find(function(p) { return String(p) !== String(req.user.id); });
      if (otherPid) {
        var bc = await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [req.user.id, otherPid]);
        if (bc.rows.length) return res.status(403).json({ error: 'blocked' });
      }
    }
    var forwarded = req.body.forwarded === true;
    var r = await db.query(
      'INSERT INTO messages (chat_id,sender_id,type,text,reply_to,forwarded) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [chatId, req.user.id, 'text', text.trim(), reply_to?JSON.stringify(reply_to):null, forwarded]
    );
    var msg = r.rows[0];
    if (chat.rows.length) {
      var uc = chat.rows[0].unread_count || {};
      chat.rows[0].participants.forEach(function(pid) { if (String(pid)!==String(req.user.id)) uc[pid]=(parseInt(uc[pid])||0)+1; });
      await db.query('UPDATE chats SET last_message=$1,last_message_at=NOW(),unread_count=$2 WHERE id=$3', [text.trim(),JSON.stringify(uc),chatId]);
    }
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/image', auth, upload.single('image'), async function(req, res) {
  try {
    var chatId = req.params.chatId;
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    var chatImg = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (chatImg.rows.length) {
      var op = chatImg.rows[0].participants.find(function(p) { return String(p)!==String(req.user.id); });
      if (op) { var bc2 = await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[req.user.id,op]); if (bc2.rows.length) return res.status(403).json({error:'blocked'}); }
    }
    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:'+req.file.mimetype+';base64,'+b64,{folder:'lumiq/images',transformation:[{quality:'auto',fetch_format:'auto'}]});
    var r = await db.query('INSERT INTO messages (chat_id,sender_id,type,image_url,text) VALUES ($1,$2,$3,$4,$5) RETURNING *',[chatId,req.user.id,'image',up.secure_url,'صورة']);
    var msg = r.rows[0];
    if (chatImg.rows.length) {
      var uc2=chatImg.rows[0].unread_count||{};
      chatImg.rows[0].participants.forEach(function(pid){if(String(pid)!==String(req.user.id))uc2[pid]=(parseInt(uc2[pid])||0)+1;});
      await db.query('UPDATE chats SET last_message=$1,last_message_at=NOW(),unread_count=$2 WHERE id=$3',['صورة 🖼️',JSON.stringify(uc2),chatId]);
    }
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.post('/api/chats/:chatId/messages/audio', auth, upload.single('audio'), async function(req, res) {
  try {
    var chatId = req.params.chatId, duration = parseInt(req.body.duration)||0;
    if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
    var chatAud = await db.query('SELECT participants,unread_count FROM chats WHERE id=$1', [chatId]);
    if (chatAud.rows.length) {
      var op3 = chatAud.rows[0].participants.find(function(p){return String(p)!==String(req.user.id);});
      if (op3) { var bc3=await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[req.user.id,op3]); if(bc3.rows.length) return res.status(403).json({error:'blocked'}); }
    }
    var b64 = req.file.buffer.toString('base64');
    var up = await cloudinary.uploader.upload('data:'+req.file.mimetype+';base64,'+b64,{folder:'lumiq/audio',resource_type:'video'});
    var r = await db.query('INSERT INTO messages (chat_id,sender_id,type,audio_url,duration,text) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[chatId,req.user.id,'voice',up.secure_url,duration,'رسالة صوتية']);
    var msg = r.rows[0];
    if (chatAud.rows.length) {
      var uc3=chatAud.rows[0].unread_count||{};
      chatAud.rows[0].participants.forEach(function(pid){if(String(pid)!==String(req.user.id))uc3[pid]=(parseInt(uc3[pid])||0)+1;});
      await db.query('UPDATE chats SET last_message=$1,last_message_at=NOW(),unread_count=$2 WHERE id=$3',['🎤 رسالة صوتية',JSON.stringify(uc3),chatId]);
    }
    io.to(chatId).emit('new_message', msg);
    res.json(msg);
  } catch(e) { console.error(e); res.status(500).json({ error: 'خطأ' }); }
});

app.put('/api/messages/:id', auth, async function(req, res) {
  try {
    var text = req.body.text;
    if (!text||!text.trim()) return res.status(400).json({error:'النص فارغ'});
    var check = await db.query('SELECT sender_id,chat_id FROM messages WHERE id=$1',[req.params.id]);
    if (!check.rows.length) return res.status(404).json({error:'غير موجود'});
    if (String(check.rows[0].sender_id)!==String(req.user.id)) return res.status(403).json({error:'غير مسموح'});
    await db.query('UPDATE messages SET text=$1 WHERE id=$2',[text.trim(),req.params.id]);
    io.to(check.rows[0].chat_id).emit('edit_message',{id:parseInt(req.params.id),text:text.trim()});
    res.json({ok:true});
  } catch(e){console.error(e);res.status(500).json({error:'خطأ'});}
});

app.delete('/api/messages/:id', auth, async function(req, res) {
  try {
    var check = await db.query('SELECT sender_id,chat_id FROM messages WHERE id=$1',[req.params.id]);
    if (!check.rows.length) return res.status(404).json({error:'غير موجود'});
    if (String(check.rows[0].sender_id)!==String(req.user.id)) return res.status(403).json({error:'غير مسموح'});
    await db.query('DELETE FROM messages WHERE id=$1',[req.params.id]);
    io.to(check.rows[0].chat_id).emit('delete_message',{id:parseInt(req.params.id)});
    res.json({ok:true});
  } catch(e){res.status(500).json({error:'خطأ'});}
});

app.post('/api/messages/:id/react', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT reactions,chat_id FROM messages WHERE id=$1',[req.params.id]);
    if (!r.rows.length) return res.status(404).json({error:'غير موجود'});
    var reactions = r.rows[0].reactions||{}, chatId2 = r.rows[0].chat_id;
    if (reactions[req.user.id]===req.body.emoji) delete reactions[req.user.id];
    else reactions[req.user.id]=req.body.emoji;
    await db.query('UPDATE messages SET reactions=$1 WHERE id=$2',[JSON.stringify(reactions),req.params.id]);
    io.to(chatId2).emit('reaction',{msg_id:parseInt(req.params.id),reactions:reactions});
    res.json({reactions:reactions});
  } catch(e){res.status(500).json({error:'خطأ'});}
});

app.post('/api/chats/:chatId/read', auth, async function(req, res) {
  try {
    await db.query('UPDATE messages SET seen=true WHERE chat_id=$1 AND sender_id!=$2 AND seen=false',[req.params.chatId,req.user.id]);
    var chat = await db.query('SELECT unread_count FROM chats WHERE id=$1',[req.params.chatId]);
    if (chat.rows.length) {
      var uc=chat.rows[0].unread_count||{};
      uc[String(req.user.id)]=0;
      await db.query('UPDATE chats SET unread_count=$1 WHERE id=$2',[JSON.stringify(uc),req.params.chatId]);
    }
    res.json({ok:true});
  } catch(e){res.status(500).json({error:'خطأ'});}
});

// تحقق أن المستخدم عضو في المحادثة
app.get('/api/chats/:chatId/check', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT id FROM chats WHERE id=$1 AND $2=ANY(participants)', [req.params.chatId, String(req.user.id)]);
    res.json({ member: r.rows.length > 0 });
  } catch(e) { res.status(500).json({ error: 'خطأ' }); }
});

// NOTIFICATIONS
app.get('/api/notifications', auth, async function(req, res) {
  try {
    var r = await db.query('SELECT n.*,(SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id=n.id AND nr.user_id=$1) as is_read FROM notifications n ORDER BY n.created_at DESC LIMIT 50',[req.user.id]);
    res.json(r.rows);
  } catch(e){res.status(500).json({error:'خطأ'});}
});

app.post('/api/notifications/read', auth, async function(req, res) {
  try {
    var ids = req.body.ids||[];
    if (!ids.length) { var all=await db.query('SELECT id FROM notifications'); ids=all.rows.map(function(r){return r.id;}); }
    for (var i=0;i<ids.length;i++) { await db.query('INSERT INTO notification_reads (user_id,notification_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[req.user.id,ids[i]]).catch(function(){}); }
    res.json({ok:true});
  } catch(e){res.status(500).json({error:'خطأ'});}
});

// ADMIN
const ADMIN_KEY = process.env.ADMIN_KEY || 'saif1201';
function adminAuth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'غير مصرح' });
  next();
}

// ══ ADMIN EXTRA ENDPOINTS ══
app.put('/api/admin/users/:id', adminAuth, async function(req, res) {
  try {
    var name=req.body.name,username=req.body.username,email=req.body.email,bio=req.body.bio;
    await db.query('UPDATE users SET name=COALESCE($1,name),username=COALESCE($2,username),email=COALESCE($3,email),bio=COALESCE($4,bio) WHERE id=$5',[name||null,username||null,email||null,bio||null,req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/chats', adminAuth, async function(req, res) {
  try {
    var page=parseInt(req.query.page)||1;
    var r=await db.query('SELECT c.id,c.participants,c.last_message,c.last_message_at,(SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id) as msg_count FROM chats c ORDER BY c.last_message_at DESC LIMIT 20 OFFSET $1',[(page-1)*20]);
    var total=await db.query('SELECT COUNT(*) as c FROM chats');
    res.json({chats:r.rows,total:parseInt(total.rows[0].c)});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/admin/chats/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM messages WHERE chat_id=$1',[req.params.id]);
    await db.query('DELETE FROM chats WHERE id=$1',[req.params.id]);
    io.to(req.params.id).emit('chat_deleted',{chat_id:req.params.id});
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/friends', adminAuth, async function(req, res) {
  try {
    var page=parseInt(req.query.page)||1;
    var r=await db.query('SELECT f.*,u1.name as requester_name,u1.username as requester_username,u2.name as addressee_name,u2.username as addressee_username FROM friendships f JOIN users u1 ON f.requester_id=u1.id JOIN users u2 ON f.addressee_id=u2.id ORDER BY f.created_at DESC LIMIT 20 OFFSET $1',[(page-1)*20]);
    var total=await db.query('SELECT COUNT(*) as c FROM friendships');
    res.json({friends:r.rows,total:parseInt(total.rows[0].c)});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/admin/friends/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM friendships WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/blocks', adminAuth, async function(req, res) {
  try {
    var r=await db.query('SELECT b.*,u1.name as blocker_name,u1.username as blocker_username,u2.name as blocked_name,u2.username as blocked_username FROM blocks b JOIN users u1 ON b.blocker_id=u1.id JOIN users u2 ON b.blocked_id=u2.id ORDER BY b.created_at DESC LIMIT 50');
    res.json(r.rows);
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/admin/blocks/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM blocks WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/notifications', adminAuth, async function(req, res) {
  try {
    var r=await db.query('SELECT n.*,(SELECT COUNT(*) FROM notification_reads nr WHERE nr.notification_id=n.id) as read_count FROM notifications n ORDER BY n.created_at DESC LIMIT 50');
    res.json(r.rows);
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/admin/notifications/:id', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM notification_reads WHERE notification_id=$1',[req.params.id]);
    await db.query('DELETE FROM notifications WHERE id=$1',[req.params.id]);
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/admin/users/:id/message', adminAuth, async function(req, res) {
  try {
    if(onlineUsers[String(req.params.id)]){
      io.to(onlineUsers[String(req.params.id)]).emit('broadcast',{title:'رسالة من الإدارة',message:req.body.message});
    }
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/users/:id/chats', adminAuth, async function(req, res) {
  try {
    var r=await db.query('SELECT c.id,c.last_message,c.last_message_at,(SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id) as msg_count FROM chats c WHERE $1=ANY(c.participants) ORDER BY c.last_message_at DESC',[String(req.params.id)]);
    res.json(r.rows);
  } catch(e){res.status(500).json({error:e.message});}
});




// ── ADMIN FULL CONTROL ──
// تعديل بيانات مستخدم
app.put('/api/admin/users/:id/edit', adminAuth, async function(req, res) {
  try {
    var {name,username,email,bio,password} = req.body;
    if (password) {
      var hash = await require('bcryptjs').hash(password, 10);
      await db.query('UPDATE users SET password=$1 WHERE id=$2',[hash,req.params.id]);
    }
    if (name||username||email||bio!==undefined) {
      if (username) {
        var ex = await db.query('SELECT id FROM users WHERE username=$1 AND id!=$2',[username.toLowerCase(),req.params.id]);
        if (ex.rows.length) return res.status(400).json({error:'اسم المستخدم مستخدم'});
      }
      await db.query('UPDATE users SET name=COALESCE($1,name),username=COALESCE($2,username),email=COALESCE($3,email),bio=COALESCE($4,bio) WHERE id=$5',
        [name||null,username?username.toLowerCase():null,email?email.toLowerCase():null,bio!==undefined?bio:null,req.params.id]);
    }
    var r = await db.query('SELECT id,name,username,email,bio,photo_url,is_online,is_verified,is_banned,created_at FROM users WHERE id=$1',[req.params.id]);
    if (onlineUsers[String(req.params.id)]) {
      io.to(onlineUsers[String(req.params.id)]).emit('user_updated',{user:r.rows[0]});
    }
    res.json({ok:true, user: r.rows[0]});
  } catch(e){console.error(e);res.status(500).json({error:e.message});}
});

// عرض رسائل محادثة معينة
app.get('/api/admin/chats/:id/messages', adminAuth, async function(req, res) {
  try {
    var page = parseInt(req.query.page)||1;
    var r = await db.query('SELECT m.*,u.name as sender_name,u.username FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.chat_id=$1 ORDER BY m.created_at ASC LIMIT 50 OFFSET $2',[req.params.id,(page-1)*50]);
    var total = await db.query('SELECT COUNT(*) as c FROM messages WHERE chat_id=$1',[req.params.id]);
    // جلب معلومات المشاركين
    var chat = await db.query('SELECT participants FROM chats WHERE id=$1',[req.params.id]);
    var participants = [];
    if (chat.rows.length && chat.rows[0].participants) {
      var pids = chat.rows[0].participants;
      var pu = await db.query('SELECT id,name,username,photo_url FROM users WHERE id=ANY($1::int[])',
        [pids.map(function(p){return parseInt(p);}).filter(function(p){return !isNaN(p);})]);
      participants = pu.rows;
    }
    res.json({messages:r.rows, total:parseInt(total.rows[0].c), participants:participants, page:page});
  } catch(e){res.status(500).json({error:e.message});}
});

// حذف رسالة من لوحة التحكم
app.delete('/api/admin/chats/:chatId/messages/:msgId', adminAuth, async function(req, res) {
  try {
    await db.query('DELETE FROM messages WHERE id=$1 AND chat_id=$2',[req.params.msgId,req.params.chatId]);
    io.to(req.params.chatId).emit('delete_message',{id:parseInt(req.params.msgId)});
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

// بحث في الرسائل
app.get('/api/admin/messages/search', adminAuth, async function(req, res) {
  try {
    var q = req.query.q ? '%'+req.query.q+'%' : '%';
    var r = await db.query('SELECT m.*,u.name as sender_name,u.username FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.text ILIKE $1 AND m.type=$2 ORDER BY m.created_at DESC LIMIT 50',
      [q,'text']);
    var total = await db.query('SELECT COUNT(*) as c FROM messages WHERE text ILIKE $1 AND type=$2',[q,'text']);
    res.json({messages:r.rows,total:parseInt(total.rows[0].c)});
  } catch(e){res.status(500).json({error:e.message});}
});

// وضع صيانة - إرسال force_logout للجميع
app.post('/api/admin/maintenance', adminAuth, async function(req, res) {
  try {
    var {enable, message} = req.body;
    if (enable) {
      io.emit('maintenance',{message: message || 'التطبيق في وضع الصيانة. نعود قريباً.'});
    }
    res.json({ok:true, online: Object.keys(onlineUsers).length});
  } catch(e){res.status(500).json({error:e.message});}
});

// جلب المستخدمين المتصلين الآن
app.get('/api/admin/online', adminAuth, async function(req, res) {
  try {
    var ids = Object.keys(onlineUsers).filter(function(id){return id;});
    if (!ids.length) return res.json([]);
    var r = await db.query('SELECT id,name,username,photo_url,last_seen FROM users WHERE id=ANY($1::int[])',
      [ids.map(function(id){return parseInt(id);}).filter(function(id){return !isNaN(id);})]);
    res.json(r.rows);
  } catch(e){res.status(500).json({error:e.message});}
});

// حذف جماعي للصور
app.delete('/api/admin/images/bulk', adminAuth, async function(req, res) {
  try {
    var ids = req.body.ids || [];
    if (!ids.length) return res.status(400).json({error:'لا توجد IDs'});
    var chats = await db.query('SELECT DISTINCT chat_id FROM messages WHERE id=ANY($1::int[])',[ids]);
    await db.query('DELETE FROM messages WHERE id=ANY($1::int[])',[ids]);
    chats.rows.forEach(function(c){
      ids.forEach(function(id){ io.to(c.chat_id).emit('delete_message',{id:parseInt(id)}); });
    });
    res.json({ok:true,deleted:ids.length});
  } catch(e){res.status(500).json({error:e.message});}
});

// إحصائيات مفصلة
app.get('/api/admin/stats/detailed', adminAuth, async function(req, res) {
  try {
    var days7 = await db.query("SELECT DATE(created_at) as day, COUNT(*) as count FROM messages WHERE created_at > NOW()-INTERVAL '7 days' GROUP BY day ORDER BY day ASC");
    var users7 = await db.query("SELECT DATE(created_at) as day, COUNT(*) as count FROM users WHERE created_at > NOW()-INTERVAL '7 days' GROUP BY day ORDER BY day ASC");
    var top_users = await db.query('SELECT u.id,u.name,u.username,u.photo_url,COUNT(m.id) as msg_count FROM users u LEFT JOIN messages m ON m.sender_id=u.id GROUP BY u.id ORDER BY msg_count DESC LIMIT 5');
    var msg_types = await db.query("SELECT type, COUNT(*) as count FROM messages GROUP BY type");
    res.json({messages_by_day:days7.rows, users_by_day:users7.rows, top_users:top_users.rows, msg_types:msg_types.rows});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/admin', function(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(ADMIN_PANEL_HTML);
});

app.get('/api/admin/stats', adminAuth, async function(req, res) {
  try {
    var users=await db.query('SELECT COUNT(*) as c FROM users');
    var messages=await db.query('SELECT COUNT(*) as c FROM messages');
    var images=await db.query("SELECT COUNT(*) as c FROM messages WHERE type='image'");
    var voice=await db.query("SELECT COUNT(*) as c FROM messages WHERE type='voice'");
    var chats=await db.query('SELECT COUNT(*) as c FROM chats');
    var online=await db.query('SELECT COUNT(*) as c FROM users WHERE is_online=true');
    var today_u=await db.query("SELECT COUNT(*) as c FROM users WHERE created_at > NOW() - INTERVAL '24 hours'");
    var today_m=await db.query("SELECT COUNT(*) as c FROM messages WHERE created_at > NOW() - INTERVAL '24 hours'");
    res.json({users:parseInt(users.rows[0].c),messages:parseInt(messages.rows[0].c),images:parseInt(images.rows[0].c),voice:parseInt(voice.rows[0].c),chats:parseInt(chats.rows[0].c),online:parseInt(online.rows[0].c),new_users_today:parseInt(today_u.rows[0].c),messages_today:parseInt(today_m.rows[0].c)});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/users', adminAuth, async function(req, res) {
  try {
    var page=parseInt(req.query.page)||1;
    var search=req.query.search?'%'+req.query.search+'%':'%';
    var r=await db.query('SELECT id,name,username,email,photo_url,is_online,is_banned,is_verified,last_seen,created_at FROM users WHERE username ILIKE $1 OR name ILIKE $1 ORDER BY created_at DESC LIMIT 20 OFFSET $2',[search,(page-1)*20]);
    var total=await db.query('SELECT COUNT(*) as c FROM users WHERE username ILIKE $1 OR name ILIKE $1',[search]);
    res.json({users:r.rows,total:parseInt(total.rows[0].c),page:page});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/admin/users/:id', adminAuth, async function(req, res) {
  try {
    var uid=req.params.id;
    await db.query('DELETE FROM messages WHERE sender_id=$1',[uid]);
    await db.query("DELETE FROM chats WHERE $1=ANY(participants)",[String(uid)]);
    await db.query('DELETE FROM users WHERE id=$1',[uid]);
    if(onlineUsers[String(uid)])io.to(onlineUsers[String(uid)]).emit('force_logout',{reason:'تم حذف حسابك'});
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/admin/users/:id/ban', adminAuth, async function(req, res) {
  try {
    await db.query('UPDATE users SET is_banned=$1 WHERE id=$2',[req.body.banned,req.params.id]);
    if(req.body.banned&&onlineUsers[String(req.params.id)])io.to(onlineUsers[String(req.params.id)]).emit('force_logout',{reason:'تم حظر حسابك'});
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/admin/users/:id/verify', adminAuth, async function(req, res) {
  try {
    await db.query('UPDATE users SET is_verified=$1 WHERE id=$2',[req.body.verified,req.params.id]);
    if(onlineUsers[String(req.params.id)])io.to(onlineUsers[String(req.params.id)]).emit('verified',{is_verified:req.body.verified});
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/messages', adminAuth, async function(req, res) {
  try {
    var page=parseInt(req.query.page)||1;
    var r=await db.query('SELECT m.id,m.text,m.type,m.created_at,u.name as sender_name,u.username FROM messages m JOIN users u ON m.sender_id=u.id ORDER BY m.created_at DESC LIMIT 30 OFFSET $1',[(page-1)*30]);
    var total=await db.query('SELECT COUNT(*) as c FROM messages');
    res.json({messages:r.rows,total:parseInt(total.rows[0].c)});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/admin/messages/:id', adminAuth, async function(req, res) {
  try {
    var r=await db.query('SELECT chat_id FROM messages WHERE id=$1',[req.params.id]);
    await db.query('DELETE FROM messages WHERE id=$1',[req.params.id]);
    if(r.rows.length)io.to(r.rows[0].chat_id).emit('delete_message',{id:parseInt(req.params.id)});
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/admin/images', adminAuth, async function(req, res) {
  try {
    var page=parseInt(req.query.page)||1;
    var r=await db.query("SELECT m.id,m.image_url,m.created_at,u.name as sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.type='image' ORDER BY m.created_at DESC LIMIT 20 OFFSET $1",[(page-1)*20]);
    var total=await db.query("SELECT COUNT(*) as c FROM messages WHERE type='image'");
    res.json({images:r.rows,total:parseInt(total.rows[0].c)});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/admin/broadcast', adminAuth, async function(req, res) {
  try {
    var title=req.body.title||'LUMIQ', message=req.body.message||'';
    var r=await db.query('INSERT INTO notifications (title,message) VALUES ($1,$2) RETURNING *',[title,message]);
    var notif=r.rows[0];
    io.emit('broadcast',{id:notif.id,title:title,message:message,created_at:notif.created_at});
    res.json({ok:true});
  } catch(e){console.error(e);res.status(500).json({error:'خطأ'});}
});

// SOCKET

io.on('connection', function(socket) {
  socket.on('join', async function(data) {
    try {
      var user = jwt.verify(data.token, JWT_SECRET);
      socket.userId = user.id;
      onlineUsers[String(user.id)] = socket.id;
      await db.query('UPDATE users SET is_online=true,last_seen=NOW() WHERE id=$1', [user.id]);
      io.emit('user_online', { user_id: user.id, is_online: true });
      var chats = await db.query('SELECT id FROM chats WHERE $1=ANY(participants)', [String(user.id)]);
      chats.rows.forEach(function(c) { socket.join(c.id); });
      // إرسال الإشعارات غير المقروءة
      var pending = await db.query(
        'SELECT n.* FROM notifications n WHERE n.id NOT IN (SELECT notification_id FROM notification_reads WHERE user_id=$1) ORDER BY n.created_at ASC',
        [user.id]
      );
      if (pending.rows.length > 0) socket.emit('pending_notifications', { notifications: pending.rows });
      // إرسال طلبات الصداقة المعلقة
      var pendingFriends = await db.query(
        'SELECT u.id,u.name,u.username,u.photo_url,u.is_verified FROM friendships f JOIN users u ON f.requester_id=u.id WHERE f.addressee_id=$1 AND f.status=$2',
        [user.id, 'pending']
      );
      if (pendingFriends.rows.length > 0) socket.emit('pending_friend_requests', { requests: pendingFriends.rows });
    } catch(e) { console.error('join error:', e.message); }
  });

  socket.on('join_chat', function(data) { if (data && data.chat_id) socket.join(data.chat_id); });
  socket.on('typing', function(data) { if (data && data.chat_id) socket.to(data.chat_id).emit('typing', { user_id: data.user_id, is_typing: data.is_typing }); });
  socket.on('messages_seen', function(data) {
    if (data.partner_id && onlineUsers[String(data.partner_id)]) {
      io.to(onlineUsers[String(data.partner_id)]).emit('messages_seen', { chat_id: data.chat_id, reader_id: data.reader_id });
    }
  });

  socket.on('call_request', async function(data) {
    try {
      var bc = await db.query('SELECT id FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [socket.userId, data.to_user_id]);
      if (bc.rows.length) { socket.emit('call_failed', { reason: 'لا يمكن الاتصال' }); return; }
      var to = onlineUsers[String(data.to_user_id)];
      if (to) io.to(to).emit('call_incoming', { from_user: data.from_user, chat_id: data.chat_id, socket_id: socket.id });
      else socket.emit('call_failed', { reason: 'المستخدم غير متصل' });
    } catch(e) {
      var to2 = onlineUsers[String(data.to_user_id)];
      if (to2) io.to(to2).emit('call_incoming', { from_user: data.from_user, chat_id: data.chat_id, socket_id: socket.id });
    }
  });

  socket.on('call_accept',   function(d) { if(d.to_socket_id) io.to(d.to_socket_id).emit('call_accepted',  {from_user:d.from_user,socket_id:socket.id}); });
  socket.on('call_reject',   function(d) { if(d.to_socket_id) io.to(d.to_socket_id).emit('call_rejected'); });
  socket.on('call_end',      function(d) { if(d.to_socket_id) io.to(d.to_socket_id).emit('call_ended'); });
  socket.on('webrtc_offer',  function(d) { if(d.to_socket_id) io.to(d.to_socket_id).emit('webrtc_offer',  {offer:d.offer,from_socket_id:socket.id}); });
  socket.on('webrtc_answer', function(d) { if(d.to_socket_id) io.to(d.to_socket_id).emit('webrtc_answer', {answer:d.answer}); });
  socket.on('webrtc_ice',    function(d) { if(d.to_socket_id) io.to(d.to_socket_id).emit('webrtc_ice',    {candidate:d.candidate}); });

  socket.on('disconnect', async function() {
    if (socket.userId) {
      delete onlineUsers[String(socket.userId)];
      try {
        await db.query('UPDATE users SET is_online=false,last_seen=NOW() WHERE id=$1', [socket.userId]);
        io.emit('user_online', { user_id: socket.userId, is_online: false, last_seen: new Date() });
      } catch(e) { console.error('disconnect error:', e.message); }
    }
  });
});

initDB().then(function() {
  server.listen(PORT, function() { console.log('LUMIQ Server running on port ' + PORT); });
}).catch(function(e) { console.error('DB Error:', e); process.exit(1); });

