import { useState, useEffect, useCallback, useRef, Component } from "react";

// ============================================================
// OutreachAI v2 — Premium Cold Email Automation Dashboard
// Backend API Connected (http://localhost:4000)
// ============================================================

const API = import.meta.env.VITE_API_URL || (typeof window !== "undefined" && (window.location.hostname.includes("vercel.app") || window.location.hostname.includes("onrender.com"))) 
  ? "https://outreachai-backend.onrender.com/api" 
  : "http://localhost:4000/api";
const API_KEY = import.meta.env.VITE_API_KEY || "outreachai-dev-key-2026";

const api = {
  headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
  async get(path) {
    try {
      const r = await fetch(`${API}${path}`, { headers: this.headers });
      if (!r.ok) {
        const error = await r.json();
        console.error("API ERROR", path, error);
        return { error: error.error || "Request failed" };
      }
      return await r.json();
    } catch (e) { console.error("GET", path, e); return { error: e.message }; }
  },
  async post(path, body) {
    try {
      const r = await fetch(`${API}${path}`, { method: "POST", headers: this.headers, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      return await r.json();
    } catch (e) { console.error("POST", path, e); return null; }
  },
  async put(path, body) {
    try {
      const r = await fetch(`${API}${path}`, { method: "PUT", headers: this.headers, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(await r.text());
      return await r.json();
    } catch (e) { console.error("PUT", path, e); return null; }
  },
  async del(path, body) {
    try {
      const opts = { method: "DELETE", headers: this.headers };
      if (body) opts.body = JSON.stringify(body);
      const r = await fetch(`${API}${path}`, opts);
      if (!r.ok) throw new Error(await r.text());
      return await r.json();
    } catch (e) { console.error("DEL", path, e); return null; }
  },
  // Auto-retry wrapper
  async retry(fn, retries = 3) {
    for (let i = 0; i < retries; i++) {
      const result = await fn();
      if (result && !result.error) return result;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
    return { error: "Request failed after retries" };
  }
};

// --- ICONS ---
const Ic = {
  Dashboard: (p) => <svg {...p} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>,
  Users: (p) => <svg {...p} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  Send: (p) => <svg {...p} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>,
  Mail: (p) => <svg {...p} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>,
  Chat: (p) => <svg {...p} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  Gear: (p) => <svg {...p} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.73 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  Plus: (p) => <svg {...p} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Upload: (p) => <svg {...p} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  Search: (p) => <svg {...p} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Edit: (p) => <svg {...p} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Trash: (p) => <svg {...p} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
  X: (p) => <svg {...p} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Up: (p) => <svg {...p} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
  Play: (p) => <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  Pause: (p) => <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  Zap: (p) => <svg {...p} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  Rocket: (p) => <svg {...p} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
  Loader: (p) => <svg {...p} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin .8s linear infinite"}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
  Menu: (p) => <svg {...p} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  Check: (p) => <svg {...p} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>,
  LogOut: (p) => <svg {...p} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Lock: (p) => <svg {...p} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Eye: (p) => <svg {...p} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff: (p) => <svg {...p} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
};

// --- CSS ---
const css = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#07070e;--bg1:#0c0c16;--bg2:#111120;--bg3:#17172a;--bg4:#1e1e34;
  --bd:#1f1f38;--bd2:#2d2d4f;
  --t1:#eeeef5;--t2:#9494b0;--t3:#5c5c7a;
  --ac:#845ef7;--ac2:#a78bfa;--acs:rgba(132,94,247,.1);--acg:rgba(132,94,247,.3);
  --ok:#34d399;--oks:rgba(52,211,153,.1);
  --wr:#fbbf24;--wrs:rgba(251,191,36,.1);
  --er:#f87171;--ers:rgba(248,113,113,.1);
  --in:#60a5fa;--ins:rgba(96,165,250,.1);
  --glass:rgba(17,17,32,.65);--glassBd:rgba(255,255,255,.06);
  --f1:'Outfit',sans-serif;--f2:'Playfair Display',serif;
}
body{font-family:var(--f1);background:var(--bg);color:var(--t1);overflow-x:hidden}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes glow{0%,100%{box-shadow:0 0 20px var(--acg)}50%{box-shadow:0 0 40px var(--acg)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes shake{0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-5px)}20%,40%,60%,80%{transform:translateX(5px)}}
@keyframes floatOrb{0%,100%{transform:translate(0,0) scale(1)}25%{transform:translate(30px,-40px) scale(1.1)}50%{transform:translate(-20px,-60px) scale(0.95)}75%{transform:translate(-40px,-20px) scale(1.05)}}
@keyframes loginFadeIn{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes gradientMove{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
.anim{animation:fadeUp .4s ease both}
.anim-d1{animation-delay:.05s}.anim-d2{animation-delay:.1s}.anim-d3{animation-delay:.15s}.anim-d4{animation-delay:.2s}

/* ===== LOGIN PAGE ===== */
.login-wrap{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg);overflow:hidden;z-index:9999}
.login-bg{position:absolute;inset:0;overflow:hidden}
.login-orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.25;animation:floatOrb 15s ease-in-out infinite}
.login-orb-1{width:400px;height:400px;background:var(--ac);top:-100px;left:-100px;animation-delay:0s}
.login-orb-2{width:350px;height:350px;background:#60a5fa;bottom:-80px;right:-80px;animation-delay:5s}
.login-orb-3{width:200px;height:200px;background:#34d399;top:50%;left:60%;animation-delay:10s}
.login-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(132,94,247,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(132,94,247,.03) 1px,transparent 1px);background-size:60px 60px}
.login-card{position:relative;z-index:1;width:100%;max-width:420px;padding:40px 36px;background:rgba(17,17,32,.75);border:1px solid var(--glassBd);border-radius:20px;backdrop-filter:blur(24px);box-shadow:0 8px 32px rgba(0,0,0,.4),0 0 0 1px rgba(132,94,247,.08);animation:loginFadeIn .7s ease both}
.login-card.shake{animation:shake .5s ease}
.login-logo-wrap{display:flex;flex-direction:column;align-items:center;margin-bottom:32px}
.login-logo{width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,var(--ac),#6c3ce9);display:flex;align-items:center;justify-content:center;margin-bottom:14px;box-shadow:0 4px 20px rgba(132,94,247,.35)}
.login-logo svg{color:#fff}
.login-brand{font-family:var(--f1);font-size:22px;font-weight:700;color:var(--t1);letter-spacing:-.3px}
.login-welcome{font-family:var(--f2);font-style:italic;font-size:28px;color:var(--t1);text-align:center;margin-bottom:6px}
.login-sub{font-size:13px;color:var(--t3);text-align:center;margin-bottom:28px}
.login-fg{margin-bottom:18px}
.login-label{display:block;font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
.login-input-wrap{position:relative}
.login-input{width:100%;padding:12px 14px 12px 40px;background:var(--bg1);border:1px solid var(--bd);border-radius:10px;color:var(--t1);font-size:14px;font-family:var(--f1);transition:all .2s}
.login-input:focus{outline:none;border-color:var(--ac);box-shadow:0 0 0 3px var(--acs)}
.login-input::placeholder{color:var(--t3)}
.login-input-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--t3)}
.login-pw-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--t3);cursor:pointer;padding:2px}
.login-pw-toggle:hover{color:var(--t2)}
.login-error{background:var(--ers);border:1px solid rgba(248,113,113,.2);color:var(--er);padding:10px 14px;border-radius:10px;font-size:12.5px;margin-bottom:18px;display:flex;align-items:center;gap:8px;animation:fadeUp .3s ease}
.login-btn{width:100%;padding:13px;border:none;border-radius:10px;background:linear-gradient(135deg,var(--ac),#6c3ce9);color:#fff;font-size:15px;font-weight:600;font-family:var(--f1);cursor:pointer;transition:all .25s;margin-top:6px;position:relative;overflow:hidden}
.login-btn:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(132,94,247,.4)}
.login-btn:active{transform:translateY(0)}
.login-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
.login-btn .login-btn-shine{position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);transition:left .5s}
.login-btn:hover .login-btn-shine{left:100%}
.login-footer{text-align:center;margin-top:28px;font-size:11px;color:var(--t3)}
.login-footer a{color:var(--ac2);text-decoration:none}

/* Logout button */
.logout-btn{background:none;border:1px solid var(--bd);border-radius:8px;color:var(--t3);cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;transition:all .2s;margin-left:auto}
.logout-btn:hover{color:var(--er);border-color:rgba(248,113,113,.3);background:var(--ers)}

/* Layout */
.app{display:flex;min-height:100vh;position:relative}
.app::before{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle at 30% 20%,rgba(132,94,247,.04) 0%,transparent 50%),radial-gradient(circle at 70% 80%,rgba(52,211,153,.03) 0%,transparent 50%);pointer-events:none;z-index:0}

/* Sidebar */
.side{width:240px;background:var(--bg1);border-right:1px solid var(--bd);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:100;transition:transform .25s ease}
.side-hd{padding:20px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--bd)}
.side-logo{width:34px;height:34px;background:linear-gradient(135deg,var(--ac),#c084fc);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff}
.side-name{font-size:17px;font-weight:700;letter-spacing:-.3px;background:linear-gradient(135deg,var(--t1),var(--ac2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.side-nav{flex:1;padding:12px 8px;display:flex;flex-direction:column;gap:2px}
.nav{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:var(--t2);cursor:pointer;transition:all .15s;font-size:13px;font-weight:500;border:1px solid transparent;position:relative;overflow:hidden}
.nav:hover{background:var(--bg4);color:var(--t1)}
.nav.on{background:var(--acs);color:var(--ac2);border-color:rgba(132,94,247,.15)}
.nav.on::before{content:'';position:absolute;left:0;top:25%;bottom:25%;width:2.5px;background:var(--ac);border-radius:2px}
.nav.on svg{stroke:var(--ac2)}
.side-ft{padding:12px;border-top:1px solid var(--bd)}
.av{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--ac),#c084fc);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;flex-shrink:0}

/* Main */
.mn{flex:1;margin-left:240px;min-height:100vh;position:relative;z-index:1}
.top{padding:12px 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bd);background:rgba(7,7,14,.85);backdrop-filter:blur(16px);position:sticky;top:0;z-index:50}
.top-t{font-family:var(--f2);font-size:22px;font-weight:400;font-style:italic;color:var(--t1)}
.top-acts{display:flex;gap:6px;align-items:center}
.cnt{padding:20px 24px}
.mob{display:none;background:none;border:none;color:var(--t1);cursor:pointer}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;border:1px solid transparent;font-family:var(--f1);white-space:nowrap}
.btn-p{background:linear-gradient(135deg,var(--ac),#c084fc);color:#fff;border:none;box-shadow:0 2px 16px var(--acg)}
.btn-p:hover{transform:translateY(-1px);box-shadow:0 4px 24px var(--acg)}
.btn-s{background:var(--bg3);color:var(--t1);border-color:var(--bd)}
.btn-s:hover{background:var(--bg4);border-color:var(--bd2)}
.btn-g{background:transparent;color:var(--t2);padding:6px 8px}
.btn-g:hover{color:var(--t1);background:var(--bg3)}
.btn-d{background:var(--ers);color:var(--er)}
.btn-ok{background:var(--oks);color:var(--ok)}
.btn-sm{padding:5px 8px;font-size:11px}
.btn-start{background:linear-gradient(135deg,var(--ok),#2dd4bf);color:#fff;border:none;box-shadow:0 2px 12px rgba(52,211,153,.3)}
.btn-start:hover{box-shadow:0 4px 20px rgba(52,211,153,.4);transform:translateY(-1px)}

/* Glass Card */
.card{background:var(--glass);backdrop-filter:blur(12px);border:1px solid var(--glassBd);border-radius:14px;overflow:hidden;transition:all .2s}
.card:hover{border-color:var(--bd2)}

/* Stats */
.sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:20px}
.sc{background:var(--glass);backdrop-filter:blur(12px);border:1px solid var(--glassBd);border-radius:14px;padding:18px;position:relative;overflow:hidden;transition:all .2s}
.sc:hover{border-color:var(--bd2);transform:translateY(-2px)}
.sc::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;border-radius:2px 2px 0 0}
.sc:nth-child(1)::after{background:linear-gradient(90deg,var(--ac),#c084fc)}.sc:nth-child(2)::after{background:linear-gradient(90deg,var(--ok),#2dd4bf)}.sc:nth-child(3)::after{background:linear-gradient(90deg,var(--wr),#fb923c)}.sc:nth-child(4)::after{background:linear-gradient(90deg,var(--in),var(--ac2))}
.sc-l{font-size:10.5px;color:var(--t3);text-transform:uppercase;letter-spacing:1.2px;font-weight:600}
.sc-v{font-size:28px;font-weight:800;margin:5px 0 2px;letter-spacing:-1px;background:linear-gradient(135deg,var(--t1),var(--t2));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sc-c{font-size:10.5px;display:flex;align-items:center;gap:3px;font-weight:600;color:var(--ok)}

/* Table */
table{width:100%;border-collapse:collapse}
thead{background:rgba(255,255,255,.02)}
th{padding:10px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3);font-weight:700;border-bottom:1px solid var(--bd)}
td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-size:12.5px;color:var(--t2)}
tr:hover td{background:rgba(255,255,255,.02)}
.td-p{color:var(--t1);font-weight:600}

/* Badge */
.bdg{display:inline-flex;align-items:center;padding:3px 8px;border-radius:20px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.bdg-ok{background:var(--oks);color:var(--ok)}.bdg-wr{background:var(--wrs);color:var(--wr)}.bdg-er{background:var(--ers);color:var(--er)}.bdg-in{background:var(--ins);color:var(--in)}.bdg-ac{background:var(--acs);color:var(--ac2)}

/* Form */
.fg{margin-bottom:14px}
.fl{display:block;font-size:10.5px;font-weight:700;color:var(--t3);margin-bottom:4px;text-transform:uppercase;letter-spacing:.8px}
.fi{width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--bd);border-radius:8px;color:var(--t1);font-size:13px;font-family:var(--f1);transition:all .15s;outline:none}
.fi:focus{border-color:var(--ac);box-shadow:0 0 0 3px var(--acs)}
.fi::placeholder{color:var(--t3)}
.ft{min-height:80px;resize:vertical;width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--bd);border-radius:8px;color:var(--t1);font-size:13px;font-family:var(--f1);transition:all .15s;outline:none}
.ft:focus{border-color:var(--ac);box-shadow:0 0 0 3px var(--acs)}
.fs{width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--bd);border-radius:8px;color:var(--t1);font-size:13px;font-family:var(--f1);outline:none;appearance:none;cursor:pointer}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:10px}

/* Modal */
.mo{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;z-index:1000;animation:fadeIn .15s}
.mdl{background:var(--bg2);border:1px solid var(--bd);border-radius:16px;width:92%;max-width:480px;max-height:88vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,.5)}
.mdl-h{padding:18px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bd)}
.mdl-t{font-size:16px;font-weight:700}
.mdl-x{background:none;border:none;color:var(--t3);cursor:pointer;padding:4px;border-radius:6px;transition:all .15s}
.mdl-x:hover{color:var(--t1);background:var(--bg4)}
.mdl-b{padding:20px}
.mdl-f{padding:12px 20px;border-top:1px solid var(--bd);display:flex;justify-content:flex-end;gap:6px}

/* Search */
.srch{display:flex;align-items:center;gap:8px;padding:0 12px;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;margin-bottom:14px}
.srch:focus-within{border-color:var(--ac);box-shadow:0 0 0 3px var(--acs)}
.srch input{flex:1;padding:10px 0;background:transparent;border:none;color:var(--t1);font-size:13px;outline:none;font-family:var(--f1)}
.srch input::placeholder{color:var(--t3)}

/* Empty */
.emp{text-align:center;padding:44px 16px;color:var(--t3)}
.emp-ic{width:48px;height:48px;margin:0 auto 12px;background:var(--bg3);border-radius:50%;display:flex;align-items:center;justify-content:center}
.emp-t{font-size:13.5px;font-weight:600;color:var(--t2);margin-bottom:3px}
.emp-d{font-size:11.5px}

/* Progress Bar */
.pbar{height:5px;background:var(--bg);border-radius:3px;overflow:hidden}
.pbar-fill{height:100%;border-radius:3px;transition:width .5s ease}

/* Toast */
.toast{position:fixed;bottom:20px;right:20px;padding:10px 18px;border-radius:10px;font-size:12.5px;font-weight:600;z-index:9999;animation:fadeUp .3s;display:flex;align-items:center;gap:7px;box-shadow:0 8px 30px rgba(0,0,0,.3)}
.toast-ok{background:var(--ok);color:#fff}.toast-er{background:var(--er);color:#fff}

/* Queue Status */
.qs{display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:20px;font-size:11px;font-weight:600;background:var(--glass);border:1px solid var(--glassBd)}
.qs-dot{width:7px;height:7px;border-radius:50%;animation:glow 2s infinite}
.qs-ok{background:var(--ok)}.qs-idle{background:var(--t3)}

/* Chart */
.chart{height:180px;display:flex;align-items:flex-end;gap:5px;padding:12px 8px 28px}
.bar{flex:1;border-radius:4px 4px 0 0;transition:all .5s cubic-bezier(.34,1.56,.64,1);cursor:pointer;position:relative;min-width:10px}
.bar:hover{filter:brightness(1.15);transform:scaleY(1.04);transform-origin:bottom}
.bar-l{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--t3);white-space:nowrap}
.bar-v{position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:9.5px;color:var(--t2);font-weight:700}

/* Wizard */
.wiz{display:flex;margin-bottom:20px}
.wiz-s{flex:1;text-align:center;padding:8px;font-size:10px;font-weight:700;color:var(--t3);border-bottom:2px solid var(--bd);text-transform:uppercase;letter-spacing:.5px;transition:all .15s}
.wiz-s.on{color:var(--ac2);border-color:var(--ac)}.wiz-s.done{color:var(--ok);border-color:var(--ok)}

/* Reply Card */
.rpc{background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:8px;cursor:pointer;border:1px solid transparent;transition:all .15s}
.rpc:hover{border-color:var(--bd2)}.rpc.sel{border-color:var(--ac);box-shadow:0 0 24px var(--acg)}

/* Toggle */
.tg{width:40px;height:21px;background:var(--bd);border-radius:11px;position:relative;cursor:pointer;transition:all .15s}
.tg.on{background:var(--ac)}
.tg-k{width:15px;height:15px;background:#fff;border-radius:50%;position:absolute;top:3px;left:3px;transition:all .15s}
.tg.on .tg-k{left:22px}

/* Responsive */
@media(max-width:768px){.side{transform:translateX(-100%)}.side.open{transform:translateX(0)}.mn{margin-left:0}.top{padding:10px 12px}.cnt{padding:14px 12px}.sg{grid-template-columns:1fr 1fr;gap:8px}.fr{grid-template-columns:1fr}.mob{display:block}}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}
`;

// --- Toast ---
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, []);
  return <div className={`toast toast-${type}`}>{type === "ok" ? <Ic.Check /> : <Ic.X />} {msg}</div>;
}

// --- Modal ---
function Modal({ show, onClose, title, children, footer }) {
  if (!show) return null;
  return <div className="mo" onClick={onClose}><div className="mdl" onClick={e => e.stopPropagation()}>
    <div className="mdl-h"><div className="mdl-t">{title}</div><button className="mdl-x" onClick={onClose}><Ic.X /></button></div>
    <div className="mdl-b">{children}</div>
    {footer && <div className="mdl-f">{footer}</div>}
  </div></div>;
}

// --- Bulk Actions Bar ---
function BulkActions({ sel, setSel, onDel }) {
  if (!sel || sel.length === 0) return null;
  return <div style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',background:'var(--glass)',backdropFilter:'blur(16px)',padding:'12px 20px',borderRadius:12,border:'1px solid var(--ac)',boxShadow:'0 8px 32px var(--acg)',display:'flex',alignItems:'center',gap:16,zIndex:1000,animation:'fadeUp .2s'}}>
    <span style={{fontWeight:600,fontSize:13,color:'var(--t1)'}}>{sel.length} selected</span>
    <button className="btn btn-d" onClick={onDel}><Ic.Trash /> Delete Selected</button>
    <button className="btn btn-s" onClick={()=>setSel([])}>Deselect</button>
  </div>;
}

// ====== PAGES ======

// --- DASHBOARD ---
function Dashboard({ toast }) {
  const [stats, setStats] = useState({ totalLeads:0, activeAccounts:0, activeCampaigns:0, totalSent:0, totalReplies:0, replyRate:"0", queueLength:0, pendingDeletion:0, dailyPerformance:[] });
  const [loading, setLoading] = useState(true);
  useEffect(()=>{(async()=>{ const d=await api.get("/analytics/overview"); if(d&&!d.error){setStats({...d,queueLength:d.queueStatus?.queueLength||0})} setLoading(false) })()},[]);
  const chartData = (stats.dailyPerformance||[]).map(d=>({l:d.day?.slice(5),v:d.count||0}));
  const mx = Math.max(...chartData.map(d=>d.v),1);

  const downloadReport = async () => {
    const now=new Date(); const month=now.toISOString().slice(0,7);
    const d=await api.get(`/reports/monthly?month=${month}`);
    if(!d||d.error){toast("Report failed","er");return}

    // Doctor-specific CSV report
    let csv="Doctor Name,Email,Specialty,NPI Number,State,City,Email Status,Follow-ups Sent,Replied,Reply Date\n";
    (d.leadReport||[]).forEach(r=>{csv+=`"${r.doctor_name}","${r.email}","${r.specialty}","${r.npi_number}","${r.state}","${r.city}",${r.email_status},${r.followups_sent},${r.replied},${r.reply_date}\n`});
    csv+="\nDate,Sent,Follow-ups,Replies,Rate\n";
    (d.dailyBreakdown||[]).forEach(r=>{csv+=`${r.date},${r.sent},${r.followups},${r.replies},${r.rate}\n`});
    csv+="\nCampaign,Leads,Sent,Follow-ups,Replies,Rate,Status\n";
    (d.campaignBreakdown||[]).forEach(c=>{csv+=`${c.name},${c.total_leads},${c.emails_sent},${c.followups_sent},${c.replies},${c.reply_rate},${c.status}\n`});
    const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`curebridge-rcm-report-${month}.csv`; a.click();
    toast("Report downloaded!","ok");
  };

  return <div>
    <div className="sg">
      {[{l:"Emails Sent",v:stats.totalSent},{l:"Replies",v:stats.totalReplies},{l:"Reply Rate",v:stats.replyRate+"%"},{l:"Active Campaigns",v:stats.activeCampaigns}].map((s,i)=>
        <div key={i} className={`sc anim anim-d${i+1}`}><div className="sc-l">{s.l}</div><div className="sc-v">{loading?"—":s.v}</div><div className="sc-c"><Ic.Up/> this month</div></div>)}
    </div>
    {stats.pendingDeletion>0&&<div className="card anim" style={{padding:14,marginBottom:14,borderColor:"var(--er)",background:"var(--ers)"}}>
      <span style={{fontSize:12,fontWeight:700,color:"var(--er)"}}>⚠️ {stats.pendingDeletion} lead{stats.pendingDeletion>1?"s":""} scheduled for auto-deletion</span>
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:14}}>
      <div className="card anim anim-d2" style={{padding:18}}>
        <div style={{fontWeight:700,fontSize:13.5,marginBottom:14}}>Weekly Activity</div>
        <div className="chart">{chartData.length>0?chartData.map((d,i)=><div key={i} className="bar" style={{height:`${(d.v/mx)*140}px`,background:"linear-gradient(180deg,var(--ac),#c084fc)",opacity:.8}}>
          <div className="bar-v">{d.v}</div><div className="bar-l">{d.l}</div>
        </div>):<div className="emp" style={{padding:20}}>No data yet</div>}</div>
      </div>
      <div className="card anim anim-d3" style={{padding:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13.5}}>System Status</div>
          <button className="btn btn-s btn-sm" onClick={downloadReport}>📊 Report</button>
        </div>
        {[{l:"Total Leads",v:stats.totalLeads,c:"var(--ac2)"},{l:"Email Accounts",v:stats.activeAccounts,c:"var(--ok)"},{l:"Queue",v:(stats.queueLength||0)+" pending",c:"var(--wr)"},{l:"Campaigns",v:stats.activeCampaigns,c:"var(--in)"}].map((s,i)=>
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<3?"1px solid var(--bd)":"none"}}>
            <span style={{fontSize:12.5,color:"var(--t2)"}}>{s.l}</span>
            <span style={{fontSize:14,fontWeight:700,color:s.c}}>{loading?"—":s.v}</span>
          </div>)}
      </div>
    </div>
  </div>;
}

// --- LEADS ---
function Leads({ toast }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"",email:"",company:"",industry:"",notes:"",npi_number:"",phone:"",state:"",city:"",website:"",social_platform:"",specialty:"" });

  const [sel, setSel] = useState([]);

  const load = useCallback(async()=>{ 
    setLoading(true); 
    const d=await api.get("/leads?limit=5000"); 
    setLeads(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []); 
    setLoading(false); 
  },[]);
  useEffect(()=>{load()},[load]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filteredAll = leads.filter(l=>(l.name||"").toLowerCase().includes(debouncedSearch.toLowerCase())||(l.email||"").toLowerCase().includes(debouncedSearch.toLowerCase())||(l.company||"").toLowerCase().includes(debouncedSearch.toLowerCase())||(l.specialty||"").toLowerCase().includes(debouncedSearch.toLowerCase())||(l.city||"").toLowerCase().includes(debouncedSearch.toLowerCase())||(l.state||"").toLowerCase().includes(debouncedSearch.toLowerCase()));
  const filtered = filteredAll.slice(0, page * 50);
  
  const onSelAll = (e) => setSel(e.target.checked ? filtered.map(x=>x.id) : []);
  const onSel = (id) => setSel(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const onBulkDel = async () => {
    if(!confirm(`Are you sure you want to delete ${sel.length} leads?`)) return;
    await api.del('/leads/bulk', { ids: sel });
    toast(`Deleted ${sel.length} leads`,"ok");
    setSel([]);
    await load();
  };
  const openAdd=()=>{setEdit(null);setForm({name:"",email:"",company:"",industry:"",notes:"",npi_number:"",phone:"",state:"",city:"",website:"",social_platform:"",specialty:""});setModal(true)};
  const openEdit=(l)=>{setEdit(l);setForm({name:l.name,email:l.email,company:l.company||"",industry:l.industry||"",notes:l.notes||"",npi_number:l.npi_number||"",phone:l.phone||"",state:l.state||"",city:l.city||"",website:l.website||"",social_platform:l.social_platform||"",specialty:l.specialty||""});setModal(true)};

  const save=async()=>{
    if(!form.name||!form.email) {
      toast("Name and Email are required", "er");
      return;
    }
    setSaving(true);
    let r;
    if(edit){ r = await api.put(`/leads/${edit.id}`,form); }
    else { r = await api.post("/leads",form); }
    
    if (r && r.error) {
      toast(r.error, "er");
    } else {
      toast(edit ? "Lead updated" : "Lead added","ok");
      setModal(false);
      await load();
    }
    setSaving(false);
  };
  const del=async(id)=>{if(!confirm("Delete this lead?"))return;await api.del(`/leads/${id}`);toast("Lead deleted","ok");await load()};

  const handleCSV=()=>{
    const inp=document.createElement("input");inp.type="file";inp.accept=".csv";
    inp.onchange=async(e)=>{
      const file=e.target.files[0];if(!file)return;
      const text=await file.text();
      const result=await api.post("/leads/bulk",{csvContent:text});
      if(result&&result.imported){toast(`${result.imported} leads imported!`,"ok");await load()}
      else{toast("Import failed","er")}
    };inp.click();
  };

  const stBdg=(s)=>s==="replied"||s==="responded"?"bdg-ok":s==="contacted"?"bdg-ac":s==="bounced"?"bdg-er":"bdg-in";
  
  const getFu = (l) => {
    if (l.status==="replied") return <span className="bdg bdg-ok">✨ Replied</span>;
    if (l.status==="cold") return <span className="bdg bdg-er">🥶 Cold</span>;
    const fu = l.followup_max || l.followup_count || 0;
    return fu + "/2";
  };
  const getStatusBdg = (l) => {
    if (l.status==="replied") return <span className="bdg bdg-ok">💬 REPLIED</span>;
    if (l.status==="contacted" && l.has_been_emailed) return <span className="bdg bdg-ok">✅ SENT</span>;
    if (l.status==="failed") return <span className="bdg bdg-er">❌ FAILED</span>;
    if (l.status==="cold") return <span className="bdg bdg-er">🥶 COLD</span>;
    return <span className="bdg bdg-in">⬜ NEW</span>;
  };
  const getDeleteTimer = (l) => {
    if (!l.auto_delete_at) return null;
    const diff = new Date(l.auto_delete_at) - new Date();
    if (diff <= 0) return <span style={{fontSize:10,color:"var(--er)"}}>Deleting...</span>;
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    return <span style={{fontSize:10,color:"var(--er)"}}>🗑️ {days}d {hrs}h</span>;
  };
  const keepLead = async (id) => { await api.post(`/leads/${id}/keep`); toast("Timer cancelled","ok"); await load(); };

  const [sendingId, setSendingId] = useState(null);
  const sendToLead = async (l) => {
    setSendingId(l.id);
    const r = await api.post(`/leads/${l.id}/send-email`);
    if (r && r.success) { toast(`📧 Email sent to ${l.name}!`, "ok"); await load(); }
    else { toast(r?.error || "Send failed", "er"); }
    setSendingId(null);
  };

  return <div className="anim">
    <BulkActions sel={sel} setSel={setSel} onDel={onBulkDel} />
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      <button className="btn btn-s" onClick={handleCSV}><Ic.Upload /> Upload CSV</button>
      <button className="btn btn-p" onClick={openAdd}><Ic.Plus /> Add Lead</button>
    </div>
    <div className="srch"><Ic.Search /><input placeholder="Search leads..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="card">{loading?<div className="emp"><Ic.Loader /> Loading...</div>:
      <div style={{overflowX:"auto"}}><table><thead><tr><th style={{width:40}}><input type="checkbox" checked={filtered.length>0 && sel.length===filtered.length} onChange={onSelAll}/></th><th>Doctor Name & Email</th><th>Specialty</th><th>Location</th><th>NPI</th><th>Status</th><th>Follow-ups</th><th>Actions</th></tr></thead>
      <tbody>{filtered.length===0?<tr><td colSpan={8}><div className="emp"><div className="emp-ic"><Ic.Users /></div><div className="emp-t">No leads</div><div className="emp-d">Upload CSV or add manually</div></div></td></tr>
      :filtered.map(l=><tr key={l.id}><td><input type="checkbox" checked={sel.includes(l.id)} onChange={()=>onSel(l.id)}/></td><td><div className="td-p">{l.name}</div><div style={{fontSize:11,color:"var(--t3)"}}>{l.email}</div></td>
        <td><span className="bdg bdg-ac" style={{fontSize:9}}>{l.specialty||l.industry||"—"}</span></td>
        <td style={{fontSize:11.5}}>{[l.city,l.state].filter(Boolean).join(", ")||"—"}</td>
        <td style={{fontSize:11,fontFamily:"monospace",color:"var(--t3)"}}>{l.npi_number||"—"}</td>
        <td>{getStatusBdg(l)}</td>
        <td>{getFu(l)}{getDeleteTimer(l)}</td>
        <td><div style={{display:"flex",gap:3}}>
          {l.status==="new"&&<button className="btn btn-start btn-sm" onClick={()=>sendToLead(l)} disabled={sendingId===l.id}>
            {sendingId===l.id?<Ic.Loader />:"📧"} Send
          </button>}
          <button className="btn btn-g btn-sm" onClick={()=>openEdit(l)}><Ic.Edit /></button>
          <button className="btn btn-g btn-sm" style={{color:"var(--er)"}} onClick={()=>del(l.id)}><Ic.Trash /></button>
          {l.auto_delete_at&&<button className="btn btn-g btn-sm" style={{color:"var(--ok)",fontSize:9}} onClick={()=>keepLead(l.id)}>Keep</button>}
        </div></td></tr>)}</tbody></table>
        {filteredAll.length > filtered.length && <div style={{padding:16,textAlign:"center"}}>
          <button className="btn btn-s" onClick={() => setPage(p => p + 1)}>Load More ({filteredAll.length - filtered.length} remaining)</button>
        </div>}
      </div>
    }</div>
    <Modal show={modal} onClose={()=>setModal(false)} title={edit?"Edit Lead":"Add Lead"} footer={<>
      <button className="btn btn-s" onClick={()=>setModal(false)}>Cancel</button>
      <button className="btn btn-p" onClick={save} disabled={saving}>{saving&&<Ic.Loader />}{edit?"Update":"Add"}</button></>}>
      <div className="fg"><label className="fl">Name *</label><input className="fi" placeholder="e.g. Dr. James Wilson" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
      <div className="fg"><label className="fl">Email *</label><input className="fi" placeholder="doctor@practice.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
      <div className="fr">
        <div className="fg"><label className="fl">NPI Number</label><input className="fi" placeholder="1234567890" value={form.npi_number} onChange={e=>setForm({...form,npi_number:e.target.value})}/></div>
        <div className="fg"><label className="fl">Phone Number</label><input className="fi" placeholder="(555) 123-4567" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
      </div>
      <div className="fg"><label className="fl">Specialty</label><select className="fs" value={form.specialty} onChange={e=>setForm({...form,specialty:e.target.value})}>
        <option value="">Select Specialty...</option>
        {["Family Medicine","Internal Medicine","Primary Care","Pediatrics","Cardiology","Orthopedics","Dermatology","OB/GYN","Psychiatry","Neurology","Gastroenterology","Pulmonology","Endocrinology","Rheumatology","Oncology","Urology","Other"].map(s=><option key={s} value={s}>{s}</option>)}
      </select></div>
      <div className="fr">
        <div className="fg"><label className="fl">City</label><input className="fi" placeholder="Los Angeles" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></div>
        <div className="fg"><label className="fl">State</label><input className="fi" placeholder="California" value={form.state} onChange={e=>setForm({...form,state:e.target.value})}/></div>
      </div>
      <div className="fg"><label className="fl">Website</label><input className="fi" placeholder="www.practice.com" value={form.website} onChange={e=>setForm({...form,website:e.target.value})}/></div>
      <div className="fr">
        <div className="fg"><label className="fl">Social Platform</label><select className="fs" value={form.social_platform} onChange={e=>setForm({...form,social_platform:e.target.value})}>
          <option value="">Select Platform...</option>
          {["LinkedIn","Facebook","Instagram","Twitter","None"].map(s=><option key={s} value={s}>{s}</option>)}
        </select></div>
        <div className="fg"><label className="fl">Company / Practice</label><input className="fi" placeholder="Wilson Medical Group" value={form.company} onChange={e=>setForm({...form,company:e.target.value})}/></div>
      </div>
      <div className="fg"><label className="fl">Notes</label><textarea className="ft" placeholder="Additional notes about this provider..." value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
    </Modal>
  </div>;
}

// --- EMAIL ACCOUNTS ---
function Accounts({ toast }) {
  const [accs, setAccs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ email:"",app_password:"",provider:"Gmail",daily_limit:50 });
  const [sel, setSel] = useState([]);

  const load=useCallback(async()=>{
    setLoading(true);
    const d=await api.get("/accounts");
    setAccs(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);
    setLoading(false)
  },[]);
  useEffect(()=>{load()},[load]);
  
  const onSelAll = (e) => setSel(e.target.checked ? accs.map(x=>x.id) : []);
  const onSel = (id) => setSel(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const onBulkDel = async () => {
    if(!confirm(`Are you sure you want to delete ${sel.length} accounts?`)) return;
    await api.del('/accounts/bulk', { ids: sel });
    toast(`Deleted ${sel.length} accounts`,"ok");
    setSel([]);
    await load();
  };

  const openAdd=()=>{setEdit(null);setForm({email:"",app_password:"",provider:"Gmail",daily_limit:50});setModal(true)};
  const openEdit=(a)=>{setEdit(a);setForm({email:a.email,app_password:"",provider:a.provider,daily_limit:a.daily_limit});setModal(true)};
  const save=async()=>{
    if(!form.email)return;setSaving(true);
    if(edit){const d={email:form.email,provider:form.provider,daily_limit:form.daily_limit};if(form.app_password)d.app_password=form.app_password;await api.put(`/accounts/${edit.id}`,d);toast("Updated","ok")}
    else{await api.post("/accounts",form);toast("Account added","ok")}
    setSaving(false);setModal(false);await load();
  };
  const del=async(id)=>{if(!confirm("Remove this account?"))return;await api.del(`/accounts/${id}`);toast("Removed","ok");await load()};
  const toggle=async(a)=>{await api.post(`/accounts/${a.id}/toggle`);await load()};
  const pct=(a)=>Math.round(((a.sent_today||0)/(a.daily_limit||50))*100);

  return <div className="anim">
    <BulkActions sel={sel} setSel={setSel} onDel={onBulkDel} />
    <div style={{marginBottom:12}}><button className="btn btn-p" onClick={openAdd}><Ic.Plus /> Add Account</button></div>
    <div className="card">{loading?<div className="emp"><Ic.Loader /> Loading...</div>:
      <div style={{overflowX:"auto"}}><table><thead><tr><th style={{width:40}}><input type="checkbox" checked={accs.length>0 && sel.length===accs.length} onChange={onSelAll}/></th><th>Email</th><th>Provider</th><th>Limit</th><th>Sent Today</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>{accs.length===0?<tr><td colSpan={7}><div className="emp"><div className="emp-ic"><Ic.Mail /></div><div className="emp-t">No accounts</div><div className="emp-d">Add your sending email accounts</div></div></td></tr>
      :accs.map(a=><tr key={a.id}><td><input type="checkbox" checked={sel.includes(a.id)} onChange={()=>onSel(a.id)}/></td><td className="td-p">{a.email}</td><td><span className="bdg bdg-in">{a.provider}</span></td><td>{a.daily_limit}/day</td>
        <td><div style={{display:"flex",alignItems:"center",gap:6}}>
          <div className="pbar" style={{flex:1,maxWidth:80}}><div className="pbar-fill" style={{width:`${Math.min(pct(a),100)}%`,background:pct(a)>90?"var(--er)":pct(a)>70?"var(--wr)":"var(--ok)"}}/></div>
          <span style={{fontSize:11.5,color:pct(a)>90?"var(--er)":"var(--t2)"}}>{a.sent_today||0}/{a.daily_limit}</span>
        </div></td>
        <td><span className={`bdg ${a.status==="active"?"bdg-ok":"bdg-er"}`}>{a.status}</span></td>
        <td><div style={{display:"flex",gap:3}}>
          <button className="btn btn-g btn-sm" onClick={()=>toggle(a)}>{a.status==="active"?<Ic.Pause />:<Ic.Play />}</button>
          <button className="btn btn-g btn-sm" onClick={()=>openEdit(a)}><Ic.Edit /></button>
          <button className="btn btn-g btn-sm" style={{color:"var(--er)"}} onClick={()=>del(a.id)}><Ic.Trash /></button>
        </div></td></tr>)}</tbody></table></div>
    }</div>
    <Modal show={modal} onClose={()=>setModal(false)} title={edit?"Edit Account":"Add Account"} footer={<>
      <button className="btn btn-s" onClick={()=>setModal(false)}>Cancel</button>
      <button className="btn btn-p" onClick={save} disabled={saving}>{saving&&<Ic.Loader />}{edit?"Update":"Add"}</button></>}>
      <div className="fg"><label className="fl">Email</label><input className="fi" placeholder="outreach@company.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
      <div className="fg"><label className="fl">App Password</label><input className="fi" type="password" placeholder="16-char Gmail app password" value={form.app_password} onChange={e=>setForm({...form,app_password:e.target.value})}/></div>
      <div className="fr">
        <div className="fg"><label className="fl">Provider</label><select className="fs" value={form.provider} onChange={e=>setForm({...form,provider:e.target.value})}><option>Gmail</option><option>Outlook</option><option>SMTP</option></select></div>
        <div className="fg"><label className="fl">Daily Limit</label><input className="fi" type="number" value={form.daily_limit} onChange={e=>setForm({...form,daily_limit:parseInt(e.target.value)||50})}/></div>
      </div>
    </Modal>
  </div>;
}

// --- CAMPAIGNS ---
function Campaigns({ toast }) {
  const [camps, setCamps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(null);
  const [form, setForm] = useState({name:"",total_leads:"",accounts_count:""});
  const [sel, setSel] = useState([]);

  const load=useCallback(async()=>{
    setLoading(true);
    const d=await api.get("/campaigns");
    setCamps(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);
    setLoading(false)
  },[]);
  useEffect(()=>{load()},[load]);
  // Auto-refresh every 30s when campaigns are active
  useEffect(()=>{
    const hasActive = camps.some(c=>c.status==="active");
    if(!hasActive) return;
    const iv = setInterval(load, 30000);
    return ()=>clearInterval(iv);
  },[camps,load]);

  const create=async()=>{
    setSaving(true);
    await api.post("/campaigns",{name:form.name||"Untitled",total_leads:parseInt(form.total_leads)||0,accounts_count:parseInt(form.accounts_count)||1});
    toast("Campaign created","ok");setSaving(false);setModal(false);setStep(0);setForm({name:"",total_leads:"",accounts_count:""});await load();
  };

  const startCamp=async(c)=>{
    setStarting(c.id);
    const result=await api.post(`/campaigns/${c.id}/start`);
    if(result&&result.started){toast(`Campaign started! ${result.totalLeads} leads, ${result.accounts} accounts, ~${result.estimatedRounds} rounds`,"ok")}
    else{toast(result?.error||"Failed to start","er")}
    setStarting(null);await load();
  };

  const pauseCamp=async(c)=>{await api.post(`/campaigns/${c.id}/pause`);toast("Campaign paused","ok");await load()};
  const delCamp=async(id)=>{if(!confirm("Delete this campaign?"))return;await api.del(`/campaigns/${id}`);toast("Deleted","ok");await load()};

  const onSelAll = (e) => setSel(e.target.checked ? camps.map(x=>x.id) : []);
  const onSel = (id) => setSel(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const onBulkDel = async () => {
    if(!confirm(`Are you sure you want to delete ${sel.length} campaigns?`)) return;
    await api.del('/campaigns/bulk', { ids: sel });
    toast(`Deleted ${sel.length} campaigns`,"ok");
    setSel([]);
    await load();
  };

  const steps=["Info","Leads","Accounts","Launch"];

  return <div className="anim">
    <BulkActions sel={sel} setSel={setSel} onDel={onBulkDel} />
    <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:16}}>
      <button className="btn btn-p" onClick={()=>setModal(true)}><Ic.Plus /> New Campaign</button>
      {camps.length>0 && <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={sel.length===camps.length} onChange={onSelAll}/> Select All</label>}
    </div>
    {loading?<div className="card"><div className="emp"><Ic.Loader /> Loading...</div></div>
    :camps.length===0?<div className="card"><div className="emp"><div className="emp-ic"><Ic.Send /></div><div className="emp-t">No campaigns</div><div className="emp-d">Create your first campaign</div></div></div>
    :camps.map(c=><div key={c.id} className="card anim" style={{padding:18,marginBottom:10,border:sel.includes(c.id)?"1px solid var(--ac)":""}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <input type="checkbox" checked={sel.includes(c.id)} onChange={()=>onSel(c.id)} style={{marginTop:4}}/>
          <div><div style={{fontWeight:700,fontSize:14.5,marginBottom:3}}>{c.name}</div>
            <div style={{fontSize:11,color:"var(--t3)"}}>{c.accounts_count||1} account{(c.accounts_count||1)>1?"s":""} · {c.created_at?.split("T")[0]}</div></div>
        </div>
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          <span className={`bdg ${c.status==="active"?"bdg-ok":c.status==="completed"?"bdg-ok":c.status==="paused"?"bdg-wr":"bdg-in"}`}>{c.status==="completed"?"✅ Completed":c.status}</span>
          {c.status==="draft"&&<button className="btn btn-start btn-sm" onClick={()=>startCamp(c)} disabled={starting===c.id}>{starting===c.id?<Ic.Loader />:<Ic.Rocket />} Start</button>}
          {c.status==="active"&&(c.emails_sent||0)===0&&<button className="btn btn-start" style={{padding:"10px 20px",fontSize:14}} onClick={()=>startCamp(c)} disabled={starting===c.id}>{starting===c.id?<Ic.Loader />:"🚀"} Send Now</button>}
          {c.status==="active"&&<button className="btn btn-sm btn-s" onClick={()=>pauseCamp(c)}><Ic.Pause /> Pause</button>}
          {c.status==="paused"&&<button className="btn btn-start btn-sm" onClick={()=>startCamp(c)} disabled={starting===c.id}><Ic.Play /> Resume</button>}
          <button className="btn btn-g btn-sm" style={{color:"var(--er)"}} onClick={()=>delCamp(c.id)}><Ic.Trash /></button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:12}}>
        {[{l:"Leads",v:c.total_leads||0},{l:"Sent",v:c.emails_sent||0},{l:"Follow-ups",v:c.followups_sent||0},{l:"Replies",v:c.replies||0},{l:"Rate",v:(c.emails_sent||0)>0?(((c.replies||0)/c.emails_sent)*100).toFixed(1)+"%":"0%"}].map((s,i)=>
          <div key={i} style={{padding:"8px 12px",background:"var(--bg3)",borderRadius:8}}>
            <div style={{fontSize:9.5,color:"var(--t3)",textTransform:"uppercase",letterSpacing:".5px",fontWeight:700,whiteSpace:"nowrap",textOverflow:"ellipsis",overflow:"hidden"}}>{s.l}</div>
            <div style={{fontSize:18,fontWeight:800,marginTop:2}}>{s.v}</div>
          </div>
        )}
      </div>
      {(c.total_leads||0)>0&&<div style={{marginTop:10}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10.5,color:"var(--t3)",marginBottom:3}}>
          <span>{c.status==="active"?`📡 Sending... ${c.emails_sent||0}/${c.total_leads}`:"Progress"}</span>
          <span>{Math.round(((c.emails_sent||0)/(c.total_leads||1))*100)}%</span>
        </div>
        <div className="pbar"><div className="pbar-fill" style={{width:`${Math.min(((c.emails_sent||0)/(c.total_leads||1))*100,100)}%`,background:c.status==="active"?"linear-gradient(90deg,var(--ok),#2dd4bf)":"linear-gradient(90deg,var(--ac),#c084fc)"}}/></div>
        {c.status==="active"&&<div style={{display:"flex",gap:16,marginTop:8,fontSize:10,color:"var(--t3)"}}>
          <span>🔄 Round {c.current_round||0}</span>
          {c.next_round_at&&<span>⏳ Next: {new Date(c.next_round_at).toLocaleTimeString()}</span>}
          <span>📊 {c.accounts_count||1} accounts</span>
        </div>}
      </div>}
    </div>)}

    <Modal show={modal} onClose={()=>{setModal(false);setStep(0)}} title="New Campaign" footer={<>
      {step>0&&<button className="btn btn-s" onClick={()=>setStep(step-1)}>Back</button>}
      {step<3?<button className="btn btn-p" onClick={()=>setStep(step+1)}>Next</button>
      :<button className="btn btn-p" onClick={create} disabled={saving}>{saving?<Ic.Loader />:<Ic.Zap />} Create</button>}</>}>
      <div className="wiz">{steps.map((s,i)=><div key={i} className={`wiz-s ${i===step?"on":i<step?"done":""}`}>{s}</div>)}</div>
      {step===0&&<div className="fg"><label className="fl">Campaign Name</label><input className="fi" placeholder="e.g. Q2 SaaS Outreach" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>}
      {step===1&&<div className="fg"><label className="fl">Number of Leads</label><input className="fi" type="number" placeholder="100" value={form.total_leads} onChange={e=>setForm({...form,total_leads:e.target.value})}/><div style={{fontSize:11,color:"var(--t3)",marginTop:4}}>System will pick this many "new" leads</div></div>}
      {step===2&&<div className="fg"><label className="fl">Email Accounts</label><input className="fi" type="number" placeholder="3" value={form.accounts_count} onChange={e=>setForm({...form,accounts_count:e.target.value})}/><div style={{fontSize:11,color:"var(--t3)",marginTop:4}}>Rotates across accounts, 3-min delay, 50/day each</div></div>}
      {step===3&&<div style={{padding:12,background:"var(--bg3)",borderRadius:8,fontSize:12.5,lineHeight:2,color:"var(--t2)"}}>
        <strong style={{color:"var(--t1)"}}>Name:</strong> {form.name||"Untitled"}<br/>
        <strong style={{color:"var(--t1)"}}>Leads:</strong> {form.total_leads||"0"}<br/>
        <strong style={{color:"var(--t1)"}}>Accounts:</strong> {form.accounts_count||"1"}<br/>
        <strong style={{color:"var(--t1)"}}>Speed:</strong> 3-min delay, 50/day per account
      </div>}
    </Modal>
  </div>;
}

function Replies({ toast }) {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [sel, setSel] = useState(null);

  const load = useCallback(async()=>{
    setLoading(true);
    const d=await api.get("/replies");
    setReplies(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);
    setLoading(false);
  },[]);
  useEffect(()=>{load()},[load]);

  const checkNow = async () => {
    setChecking(true);
    if(toast) toast("Checking inboxes...", "ok");
    const r = await api.post("/replies/check");
    if (r && !r.error) {
      if(toast) toast(r.newReplies > 0 ? `Found ${r.newReplies} new reply(s)!` : "No new replies", "ok");
      await load();
    } else {
      if(toast) toast(r?.error || "Check failed", "er");
    }
    setChecking(false);
  };

  const selectReply = async (r) => {
    setSel(r);
    if (!r.is_read) {
      await api.post(`/replies/${r.id}/read`);
      setReplies(prev => prev.map(x => x.id === r.id ? {...x, is_read: true} : x));
    }
  };

  return <div className="anim">
    <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
      <button className="btn btn-p" onClick={checkNow} disabled={checking}>
        {checking ? <Ic.Loader /> : <Ic.Search />} Check Inboxes Now
      </button>
      <span style={{fontSize:11,color:"var(--t3)"}}>
        {replies.filter(r=>!r.is_read).length} unread | {replies.length} total
      </span>
    </div>
    {loading?<div className="card"><div className="emp"><Ic.Loader /> Loading...</div></div>
    :replies.length===0?<div className="card"><div className="emp"><div className="emp-ic"><Ic.Chat /></div><div className="emp-t">No replies yet</div><div className="emp-d">Click Check Inboxes Now to scan for replies</div></div></div>
    :<div style={{display:"grid",gridTemplateColumns:sel?"1fr 1.2fr":"1fr",gap:12}}>
      <div>{replies.map(r=><div key={r.id} className={`rpc ${sel?.id===r.id?"sel":""}`} onClick={()=>selectReply(r)} style={{borderLeft:!r.is_read?"3px solid var(--ac)":"3px solid transparent"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
          <div style={{fontWeight:600,fontSize:13}}>{!r.is_read&&<span style={{color:"var(--ac)",marginRight:4}}>*</span>}{r.from_name||r.from_email}</div>
          <div style={{fontSize:10.5,color:"var(--t3)"}}>{r.created_at?.split("T")[0]}</div>
        </div><div style={{fontSize:12,color:"var(--t2)"}}>{r.subject}</div>
        <div style={{fontSize:11,color:"var(--t3)",marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(r.body||"").slice(0,80)}</div>
      </div>)}</div>
      {sel&&<div className="card" style={{padding:18,position:"sticky",top:70,alignSelf:"flex-start"}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:3}}>{sel.from_name||sel.from_email}</div>
        <div style={{fontSize:11.5,color:"var(--t3)",marginBottom:12}}>{sel.from_email}</div>
        <div style={{fontSize:13,fontWeight:600,color:"var(--t2)",marginBottom:10}}>{sel.subject}</div>
        <div style={{background:"var(--bg3)",borderRadius:8,padding:12,fontSize:12.5,color:"var(--t2)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{sel.body}</div>
        <div style={{marginTop:14}}>
          <label className="fl">Reply</label>
          <textarea className="ft" placeholder="Type your reply..." style={{minHeight:60}}/>
          <div style={{display:"flex",gap:6,marginTop:8}}>
            <button className="btn btn-p">Send</button><button className="btn btn-s">AI Generate</button>
          </div>
        </div>
      </div>}
    </div>}</div>;
}

// --- SETTINGS ---
function Settings({ toast }) {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async()=>{
    setLoading(true);
    const data = await api.get("/settings");
    if (data) {
       setS({
         max_followups: parseInt(data.max_followups||3),
         enable_followup: data.enable_followup!=="false",
         interval: parseInt(data.interval||7),
         delay_minutes: parseInt(data.delay_minutes||3)
       });
    }
    setLoading(false);
  }, []);
  useEffect(() => { load() }, [load]);

  const save = async () => {
    await api.put("/settings", {
      max_followups: s.max_followups,
      enable_followup: s.enable_followup,
      interval: s.interval,
      delay_minutes: s.delay_minutes
    });
    toast("Settings saved", "ok");
  };

  const Tg=({on,click})=><div className={`tg ${on?"on":""}`} onClick={click}><div className="tg-k"/></div>;
  if (!s) return <div className="card"><div className="emp"><Ic.Loader/> Loading...</div></div>;

  return <div className="anim" style={{maxWidth:620}}>
    {[{title:"Email Sending",items:[
      {l:"Delay (minutes)",d:"Gap between sends",v:<input className="fi" type="number" style={{width:65}} value={s.delay_minutes} onChange={e=>setS({...s,delay_minutes:parseInt(e.target.value)})}/>},
      {l:"Max Follow-ups per lead",d:"Stop after this many",v:<input className="fi" type="number" style={{width:65}} value={s.max_followups} onChange={e=>setS({...s,max_followups:parseInt(e.target.value)})}/>},
      {l:"Follow-up Interval (days)",d:"Wait before following up",v:<input className="fi" type="number" style={{width:65}} value={s.interval} onChange={e=>setS({...s,interval:parseInt(e.target.value)})}/>},
    ]},{title:"Automation",items:[
      {l:"Enable Auto Follow-ups",d:"Send followups if no reply",v:<Tg on={s.enable_followup} click={()=>setS({...s,enable_followup:!s.enable_followup})}/>},
    ]}].map((sec,si)=><div key={si} style={{marginBottom:24}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:10,paddingBottom:6,borderBottom:"1px solid var(--bd)"}}>{sec.title}</div>
      {sec.items.map((r,i)=><div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:"1px solid var(--bd)"}}>
        <div><div style={{fontSize:13,fontWeight:500}}>{r.l}</div><div style={{fontSize:11,color:"var(--t3)",marginTop:1}}>{r.d}</div></div>{r.v}
      </div>)}
    </div>)}
    <button className="btn btn-p" onClick={save}>Save Settings</button>
  </div>;
}

// ====== LOGIN PAGE (with brute force protection) ======
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lockUntil, setLockUntil] = useState(() => {
    const stored = localStorage.getItem('outreachai_lockuntil');
    return stored ? parseInt(stored) : 0;
  });
  const [attempts, setAttempts] = useState(() => {
    return parseInt(localStorage.getItem('outreachai_attempts') || '0');
  });
  const [countdown, setCountdown] = useState("");
  const timerRef = useRef(null);

  // Countdown timer effect
  useEffect(() => {
    if (lockUntil <= Date.now()) { setCountdown(""); return; }
    const tick = () => {
      const remaining = lockUntil - Date.now();
      if (remaining <= 0) {
        setCountdown("");
        setLockUntil(0);
        localStorage.removeItem('outreachai_lockuntil');
        localStorage.setItem('outreachai_attempts', '0');
        setAttempts(0);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [lockUntil]);

  const isLocked = lockUntil > Date.now();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isLocked) return;
    setError("");
    setLoading(true);

    setTimeout(() => {
      if (email === "outreachai@gmail.com" && password === "OutreachAI") {
        localStorage.setItem('outreachai_attempts', '0');
        localStorage.removeItem('outreachai_lockuntil');
        onLogin();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        localStorage.setItem('outreachai_attempts', String(newAttempts));

        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_MS;
          setLockUntil(until);
          localStorage.setItem('outreachai_lockuntil', String(until));
          setError(`Too many failed attempts. Account locked.`);
        } else {
          setError(`Invalid email or password (${MAX_ATTEMPTS - newAttempts} attempts remaining)`);
        }
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
      }
      setLoading(false);
    }, 600);
  };

  return <>
    <style>{css}</style>
    <div className="login-wrap">
      <div className="login-bg">
        <div className="login-orb login-orb-1"/>
        <div className="login-orb login-orb-2"/>
        <div className="login-orb login-orb-3"/>
        <div className="login-grid"/>
      </div>
      <div className={`login-card ${shaking ? "shake" : ""}`}>
        <div className="login-logo-wrap">
          <div className="login-logo"><Ic.Zap style={{width:28,height:28}} /></div>
          <div className="login-brand">OutreachAI</div>
        </div>
        <div className="login-welcome">Welcome Back</div>
        <div className="login-sub">Sign in to your dashboard</div>
        
        {error && <div className="login-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          {error}
        </div>}

        {isLocked && countdown && <div style={{textAlign:"center",color:"var(--wr)",fontSize:13,marginBottom:16,padding:"10px 14px",background:"var(--wrs)",borderRadius:10,border:"1px solid rgba(251,191,36,.2)"}}>
          🔒 Try again in <strong>{countdown}</strong>
        </div>}
        
        <form onSubmit={handleSubmit}>
          <div className="login-fg">
            <label className="login-label">Email Address</label>
            <div className="login-input-wrap">
              <Ic.Mail className="login-input-icon" style={{width:16,height:16}} />
              <input className="login-input" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus required disabled={isLocked} />
            </div>
          </div>
          <div className="login-fg">
            <label className="login-label">Password</label>
            <div className="login-input-wrap">
              <Ic.Lock className="login-input-icon" style={{width:16,height:16}} />
              <input className="login-input" type={showPw ? "text" : "password"} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required style={{paddingRight:42}} disabled={isLocked} />
              <button type="button" className="login-pw-toggle" onClick={() => setShowPw(!showPw)}>
                {showPw ? <Ic.EyeOff /> : <Ic.Eye />}
              </button>
            </div>
          </div>
          <button className="login-btn" type="submit" disabled={loading || isLocked}>
            {loading ? <Ic.Loader style={{display:"inline"}} /> : isLocked ? "🔒 Locked" : "Sign In"}
            <span className="login-btn-shine"/>
          </button>
        </form>
        
        <div className="login-footer">Powered by <a href="https://curebridgercm.com" target="_blank" rel="noreferrer">CureBridge RCM</a></div>
      </div>
    </div>
  </>;
}

// ====== ERROR BOUNDARY ======
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("React Error:", error, info); }
  render() {
    if (this.state.hasError) {
      return <>
        <style>{css}</style>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:"var(--bg)",color:"var(--t1)",fontFamily:"var(--f1)",padding:20,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
          <h2 style={{marginBottom:8}}>Something went wrong</h2>
          <p style={{color:"var(--t3)",marginBottom:20,maxWidth:400}}>{this.state.error?.message || "An unexpected error occurred"}</p>
          <button className="btn btn-p" onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>Reload Application</button>
        </div>
      </>;
    }
    return this.props.children;
  }
}

// ====== MAIN APP ======
const NAV=[
  {id:"dash",l:"Dashboard",ic:Ic.Dashboard},
  {id:"leads",l:"Leads",ic:Ic.Users},
  {id:"camps",l:"Campaigns",ic:Ic.Send},
  {id:"accs",l:"Email Accounts",ic:Ic.Mail},
  {id:"replies",l:"Replies",ic:Ic.Chat},
  {id:"settings",l:"Settings",ic:Ic.Gear},
];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('outreachai_auth') === 'true');
  const [pg, setPg] = useState("dash");
  const [sb, setSb] = useState(false);
  const [toastData, setToast] = useState(null);
  const [health, setHealth] = useState(null);
  const [unreadReplies, setUnreadReplies] = useState(0);

  const handleLogin = () => {
    localStorage.setItem('outreachai_auth', 'true');
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('outreachai_auth');
    setIsLoggedIn(false);
  };

  const toast=(m,t="ok")=>setToast({m,t});

  useEffect(()=>{(async()=>{const h=await api.get("/health");setHealth(h)})()},[]);
  // Poll unread replies every 30s
  useEffect(()=>{
    const check=async()=>{const r=await api.get("/replies/count");if(r&&!r.error)setUnreadReplies(r.unread||0)};
    check(); const iv=setInterval(check,30000); return()=>clearInterval(iv);
  },[]);

  if (!isLoggedIn) return <LoginPage onLogin={handleLogin} />;

  const page=()=>{
    switch(pg){
      case "dash": return <Dashboard toast={toast} />;
      case "leads": return <Leads toast={toast} />;
      case "camps": return <Campaigns toast={toast} />;
      case "accs": return <Accounts toast={toast} />;
      case "replies": return <Replies toast={toast} />;
      case "settings": return <Settings toast={toast} />;
      default: return <Dashboard toast={toast} />;
    }
  };

  return <ErrorBoundary>
    <style>{css}</style>
    <div className="app">
      <aside className={`side ${sb?"open":""}`}>
        <div className="side-hd"><div className="side-logo"><Ic.Zap /></div><div className="side-name">OutreachAI</div></div>
        <nav className="side-nav">{NAV.map(n=><div key={n.id} className={`nav ${pg===n.id?"on":""}`} onClick={()=>{setPg(n.id);setSb(false)}} style={{position:"relative"}}>
          <n.ic />{n.l}
          {n.id==="replies"&&unreadReplies>0&&<span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"var(--er)",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:9,fontWeight:800,minWidth:16,textAlign:"center"}}>{unreadReplies}</span>}
        </div>)}</nav>
        <div className="side-ft" style={{display:"flex",alignItems:"center",gap:8}}>
          <div className="av">CB</div>
          <div><div style={{fontSize:12,fontWeight:600}}>CureBridge RCM</div><div style={{fontSize:10,color:"var(--t3)"}}>info@curebridgercm.com</div></div>
          <button className="logout-btn" onClick={handleLogout} title="Logout"><Ic.LogOut /></button>
        </div>
      </aside>

      {sb&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:99}} onClick={()=>setSb(false)}/>}

      <main className="mn">
        <header className="top">
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button className="mob" onClick={()=>setSb(!sb)}><Ic.Menu /></button>
            <div className="top-t">{NAV.find(n=>n.id===pg)?.l}</div>
          </div>
          <div className="top-acts">
            <div className="qs">
              <div className={`qs-dot ${health?.server==="ok"?"qs-ok":"qs-idle"}`}/>
              {health?.server==="ok"?"Connected":"Connecting..."}
            </div>
          </div>
        </header>
        <div className="cnt">{page()}</div>
      </main>

      {toastData&&<Toast msg={toastData.m} type={toastData.t} onDone={()=>setToast(null)}/>}
    </div>
  </ErrorBoundary>;
}
