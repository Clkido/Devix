import { useState, useRef, useEffect, useCallback } from "react";

/* ================================================================
   DEVIX AI — NexoLabs-style redesign
   Models:   Zenith (free) · Zaith (key) · Zeno (key)
   Owner key: ZenoZiathSully → generates keys in Settings
   Purchase:  Agreement popup → Discord redirect
   Projects:  folder tree with Workspace / ServerScriptService / scripts
   Plugin:    separate DevixPlugin.lua file
================================================================ */

const API_URL    = "/api/chat";
const OWNER_KEY  = "ZenoZiathSully";
const K_SECRET   = "dvx_k_2024_x9z";

// ── KEY SYSTEM ────────────────────────────────────────────────────
// Format: TYPE-IDX-HASH  (e.g. ZAITH-001-A3B9C8D1)
// O(1) validation, 4096 keys per type
function genKey(type, idx) {
  const str = `${type}:${idx}:${K_SECRET}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  const hash   = (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  const idxHex = idx.toString(16).toUpperCase().padStart(3, "0");
  return `${type.toUpperCase()}-${idxHex}-${hash}`;
}
function validateKey(raw) {
  const key   = raw.trim().toUpperCase();
  const parts = key.split("-");
  if (parts.length !== 3) return null;
  const [type, idxHex, hash] = parts;
  if (type !== "ZAITH" && type !== "ZENO") return null;
  const idx = parseInt(idxHex, 16);
  if (isNaN(idx) || idx > 0xFFF) return null;
  if (key !== genKey(type, idx)) return null;
  return type.toLowerCase(); // "zaith" | "zeno"
}

// ── MODELS ────────────────────────────────────────────────────────
const MODELS = {
  zenith: { id:"zenith", name:"Zenith",  sub:"Standard Roblox AI",       desc:"Fast answers, complete Luau scripts, free for everyone.",       color:"#6366f1", glow:"rgba(99,102,241,.25)",  bg:"rgba(99,102,241,.08)",  icon:"⚡", free:true,  mode:"quick" },
  zaith:  { id:"zaith",  name:"Zaith",   sub:"Advanced Roblox Developer", desc:"Deeper analysis and better architecture. Requires a key.",       color:"#a855f7", glow:"rgba(168,85,247,.25)",  bg:"rgba(168,85,247,.08)",  icon:"🔷", free:false, mode:"quick" },
  zeno:   { id:"zeno",   name:"Zeno",    sub:"Fastest · All Models",      desc:"All models in parallel, synthesized. Best possible answer.",    color:"#e03a3e", glow:"rgba(224,58,62,.25)",   bg:"rgba(224,58,62,.08)",   icon:"🌟", free:false, mode:"deep"  },
};

// ── STORAGE ───────────────────────────────────────────────────────
const LS = {
  g: (k,d=null) => { try { return JSON.parse(localStorage.getItem(k)??"null")??d; } catch { return d; } },
  s: (k,v)      => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} },
  d: (k)        => { try { localStorage.removeItem(k); } catch {} },
};

// ── SYSTEM PROMPTS ────────────────────────────────────────────────
const BASE = `You are Devix — expert AI for Roblox Studio. NOT Claude or any other AI.
CODE: Luau only. task.wait() not wait(). task.spawn() not spawn(). Complete scripts in \`\`\`lua blocks. No placeholders. Add comments.
FORMAT: **bold** key terms, ## section headers, - bullet lists, \`inline code\` for API names.
RULES: No exploits, no NSFW, no crash tools.`;
const SYS_Q = BASE + "\nMode: Quick. Be concise and direct.";
const SYS_D = BASE + "\nMode: Deep. Full architecture, edge cases, complete optimized code.";

// ── API ───────────────────────────────────────────────────────────
async function callAPI(mode, messages) {
  const sys = mode === "deep" ? SYS_D : SYS_Q;
  const r   = await fetch(API_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ mode, system: sys, messages }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e?.error || `HTTP ${r.status}`); }
  return (await r.json()).text || "";
}

// ── STREAMING ─────────────────────────────────────────────────────
async function streamText(text, onUpdate, signal) {
  const toks = text.split(/(\s+)/); let out = "";
  for (const t of toks) {
    if (signal?.aborted) break;
    out += t; onUpdate(out);
    await new Promise(r => setTimeout(r, 9 + Math.random() * 13));
  }
  onUpdate(text);
}

// ── SCRIPT EXTRACTION ─────────────────────────────────────────────
function extractScripts(content) {
  const scripts = []; const re = /```(?:lua|luau)\n?([\s\S]*?)```/g; let m, i = 0;
  while ((m = re.exec(content)) !== null) {
    scripts.push({ id: Date.now() + i, name: `Script_${++i}`, content: m[1].trim() });
  }
  return scripts;
}

// ── MARKDOWN ─────────────────────────────────────────────────────
function inl(text, ms, seed = "") {
  const re = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;
  const out = []; let last = 0, m, n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[0].startsWith("**"))      out.push(<strong key={seed+n++} style={{fontWeight:700}}>{m[2]}</strong>);
    else if (m[0].startsWith("*")) out.push(<em key={seed+n++}>{m[3]}</em>);
    else out.push(<code key={seed+n++} style={ms}>{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
function MD({ text, tc, ms }) {
  if (!text) return null;
  const lines = text.split("\n"); const result = []; let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^#{1,3} /.test(ln)) {
      const lvl = ln.match(/^(#{1,3}) /)[1].length;
      result.push(<div key={i} style={{fontSize:[18,15,13][lvl-1],fontWeight:[800,700,600][lvl-1],color:tc,margin:"11px 0 5px",lineHeight:1.3}}>{inl(ln.slice(lvl+1),ms,`h${i}`)}</div>);
    } else if (/^[-•*] /.test(ln)) {
      const items = [];
      while (i < lines.length && /^[-•*] /.test(lines[i])) { items.push(<li key={i} style={{marginBottom:3,lineHeight:1.7}}>{inl(lines[i].slice(2),ms,`li${i}`)}</li>); i++; }
      result.push(<ul key={`ul${i}`} style={{paddingLeft:18,margin:"5px 0",color:tc,fontSize:14}}>{items}</ul>); continue;
    } else if (/^\d+\. /.test(ln)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(<li key={i} style={{marginBottom:3,lineHeight:1.7}}>{inl(lines[i].replace(/^\d+\. /,""),ms,`ol${i}`)}</li>); i++; }
      result.push(<ol key={`ol${i}`} style={{paddingLeft:18,margin:"5px 0",color:tc,fontSize:14}}>{items}</ol>); continue;
    } else if (/^-{3,}$/.test(ln.trim())) {
      result.push(<hr key={i} style={{border:"none",borderTop:"1px solid rgba(255,255,255,.06)",margin:"10px 0"}}/>);
    } else if (ln.trim() === "") {
      result.push(<div key={i} style={{height:4}}/>);
    } else {
      result.push(<p key={i} style={{margin:"2px 0",lineHeight:1.78,color:tc,fontSize:14,wordBreak:"break-word"}}>{inl(ln,ms,`p${i}`)}</p>);
    }
    i++;
  }
  return <>{result}</>;
}
function parseParts(content) {
  const parts = []; const re = /```(\w*)\n?([\s\S]*?)```/g; let last = 0, m;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type:"text", content:content.slice(last,m.index) });
    parts.push({ type:"code", lang:m[1]||"lua", content:m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type:"text", content:content.slice(last) });
  return parts;
}
const nowTS = () => new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

// ── CSS ───────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;overflow:hidden}
body{font-family:'Inter',sans-serif;background:#080808;color:#e8e8e8;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1e1e1e;border-radius:4px}
textarea,input,button,select{font-family:'Inter',sans-serif}
textarea:focus,input:focus,select:focus{outline:none}button{cursor:pointer;border:none;background:none}
@keyframes fadeUp  {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes fadeIn  {from{opacity:0}to{opacity:1}}
@keyframes scaleIn {from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
@keyframes blink   {0%,100%{opacity:1}50%{opacity:0}}
@keyframes bounce  {0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
@keyframes spin    {from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes pulse   {0%,100%{opacity:1}50%{opacity:.3}}
@keyframes shimmer {0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes greenPop{0%{opacity:0;transform:translateY(4px) scale(.95)}20%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
.up  {animation:fadeUp  .26s cubic-bezier(.22,1,.36,1) both}
.fade{animation:fadeIn  .2s ease both}
.scl {animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both}
.nav-item{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:8px;cursor:pointer;color:#444;font-size:13px;transition:all .12s;user-select:none}
.nav-item:hover{background:#111;color:#999}
.nav-item.act{background:#141414;color:#ddd}
.tree-row{display:flex;align-items:center;gap:6px;border-radius:6px;cursor:pointer;transition:background .1s;user-select:none;padding:4px 6px}
.tree-row:hover{background:#131313}
.tree-row.sel{background:#161616}
.ibox{border:1px solid #1e1e1e;border-radius:12px;transition:border-color .18s,box-shadow .18s}
.ibox:focus-within{border-color:#6366f1!important;box-shadow:0 0 0 3px rgba(99,102,241,.12)!important}
.cursor::after{content:"▋";color:#6366f1;animation:blink .6s step-end infinite;margin-left:1px}
.cpb{opacity:0;transition:opacity .12s}
.cw:hover .cpb{opacity:1}
.d1{animation:bounce 1.4s ease 0s infinite}
.d2{animation:bounce 1.4s ease .15s infinite}
.d3{animation:bounce 1.4s ease .30s infinite}
.mcard{border:1px solid #1a1a1a;border-radius:14px;padding:24px;cursor:pointer;background:#0e0e0e;transition:all .2s ease}
.mcard:hover{border-color:#2a2a2a;background:#111;transform:translateY(-2px)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .18s ease}
.key-bubble{animation:greenPop 2.5s ease forwards;position:absolute;bottom:calc(100% + 6px);left:0;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none}
.inp{background:#111;border:1px solid #1e1e1e;border-radius:9px;padding:9px 12px;color:#ddd;font-size:13px;width:100%;transition:border-color .15s}
.inp:focus{border-color:#6366f1}
`;

/* ================================================================
   SMALL COMPONENTS
================================================================ */

function CodeBlock({ lang, code, onCopy, copied }) {
  return (
    <div className="cw" style={{background:"#0c0c0c",borderRadius:9,border:"1px solid #1a1a1a",overflow:"hidden",margin:"7px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",borderBottom:"1px solid #181818"}}>
        <span style={{fontSize:11,color:"#3a3a3a",fontFamily:"'JetBrains Mono',monospace"}}>{lang||"lua"}</span>
        <button className="cpb" onClick={onCopy}
          style={{background:"rgba(99,102,241,.15)",border:"1px solid rgba(99,102,241,.25)",borderRadius:5,padding:"3px 9px",color:"#6366f1",fontSize:11,fontWeight:600,cursor:"pointer"}}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre style={{padding:"12px 14px",overflowX:"auto",fontSize:12.5,lineHeight:1.68,fontFamily:"'JetBrains Mono',monospace",color:"#c0c0c0",margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
        {code}
      </pre>
    </div>
  );
}

function ChatMsg({ msg, streaming, model, onCopy, copied }) {
  const isUser = msg.role === "user";
  const m  = MODELS[model || "zenith"];
  const ac = m?.color || "#6366f1";
  const ms = { background:`${ac}18`, borderRadius:4, padding:"1px 6px", fontFamily:"'JetBrains Mono',monospace", fontSize:"0.87em" };
  return (
    <div className="up" style={{display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start",padding:"3px 0"}}>
      {!isUser && (
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
          <div style={{width:18,height:18,borderRadius:5,background:ac,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0}}>D</div>
          <span style={{fontSize:11,color:"#3a3a3a",fontWeight:500}}>Devix {m?.name} · {msg.ts}</span>
        </div>
      )}
      <div style={{maxWidth:"86%",background:isUser?"rgba(255,255,255,.03)":"#0f0f0f",border:`1px solid ${isUser?"#1e1e1e":"#181818"}`,borderRadius:isUser?"12px 12px 4px 12px":"4px 12px 12px 12px",padding:"11px 14px"}}>
        {isUser
          ? <p style={{color:"#ccc",fontSize:14,lineHeight:1.72,whiteSpace:"pre-wrap"}}>{msg.content}</p>
          : <>
              {parseParts(msg.content).map((p, i) =>
                p.type === "code"
                  ? <CodeBlock key={i} lang={p.lang} code={p.content} onCopy={() => onCopy(p.content, `${msg.id}-${i}`)} copied={copied[`${msg.id}-${i}`]} />
                  : <MD key={i} text={p.content} tc="#bbb" ms={ms} />
              )}
              {streaming && <span className="cursor" />}
            </>
        }
      </div>
      {isUser && <span style={{fontSize:10,color:"#2a2a2a",marginTop:3}}>{msg.ts}</span>}
    </div>
  );
}

/* ================================================================
   SCRIPT VIEWER MODAL
================================================================ */
function ScriptViewer({ script, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="scl" onClick={e => e.stopPropagation()}
        style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:14,width:"100%",maxWidth:720,maxHeight:"88vh",overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #181818"}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:11,height:11,borderRadius:3,background:"#eab308",flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:600,color:"#ccc"}}>{script.name}.lua</span>
          </div>
          <button onClick={onClose} style={{color:"#444",fontSize:15,padding:"2px 7px"}}>✕</button>
        </div>
        <div style={{overflowY:"auto",padding:"14px 16px"}}>
          <pre style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12.5,lineHeight:1.72,color:"#c0c0c0",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
            {script.content}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   AGREEMENT MODAL
================================================================ */
function AgreementModal({ model, onClose }) {
  const m = MODELS[model];
  return (
    <div className="overlay">
      <div className="scl" style={{background:"#0f0f0f",border:"1px solid #222",borderRadius:16,padding:28,maxWidth:400,width:"100%"}}>
        <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:18}}>
          <div style={{width:40,height:40,borderRadius:11,background:m?.bg,border:`1px solid ${m?.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{m?.icon}</div>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"#e8e8e8"}}>{m?.name}</div>
            <div style={{fontSize:12,color:"#444",marginTop:1}}>{m?.sub}</div>
          </div>
        </div>

        <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:10,padding:14,marginBottom:20,fontSize:13,color:"#555",lineHeight:1.75}}>
          By clicking <strong style={{color:"#888"}}>Agree</strong>, you confirm you have read and accept the{" "}
          <strong style={{color:"#888"}}>Devix Terms of Service</strong>. Access to <strong style={{color:m?.color}}>{m?.name}</strong> requires a valid license key.
          <br /><br />
          You will be taken to the <strong style={{color:"#888"}}>Devix Discord</strong> to obtain your key and join the community.
        </div>

        <div style={{display:"flex",gap:9}}>
          <button onClick={onClose}
            style={{flex:1,padding:"11px",borderRadius:9,background:"#1a1a1a",color:"#666",fontSize:13,fontWeight:600,cursor:"pointer",border:"1px solid #252525"}}>
            No, cancel
          </button>
          <button onClick={() => { window.open("https://discord.gg/5eSyHRTVHF", "_blank"); onClose(); }}
            style={{flex:1,padding:"11px",borderRadius:9,background:"linear-gradient(135deg,#7c3aed,#6d28d9)",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",border:"none",boxShadow:"0 4px 16px rgba(124,58,237,.4)"}}>
            ✓ Yes, Agree
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SETTINGS PANEL
================================================================ */
function SettingsPanel({ user, onClose, onLogout, showToast, updateUserPlan, isOwner }) {
  const [zaithInput, setZaithInput] = useState("");
  const [zenoInput,  setZenoInput]  = useState("");
  const [zaithStatus, setZaithStatus] = useState(null); // null | "ok" | "err"
  const [zenoStatus,  setZenoStatus]  = useState(null);
  const [zaithBubble, setZaithBubble] = useState(false);
  const [zenoBubble,  setZenoBubble]  = useState(false);

  // Owner-only
  const [genType,     setGenType]     = useState("ZAITH");
  const [keyCounter,  setKeyCounter]  = useState(() => LS.g("dvx_kctr", 0));
  const [genKeys,     setGenKeys]     = useState(() => LS.g("dvx_gkeys", []));

  const redeemKey = (type) => {
    const raw = type === "zaith" ? zaithInput : zenoInput;
    const result = validateKey(raw);
    if (result === type) {
      if (type === "zaith") { setZaithStatus("ok"); setZaithBubble(true); setTimeout(() => setZaithBubble(false), 2500); }
      else                  { setZenoStatus("ok");  setZenoBubble(true);  setTimeout(() => setZenoBubble(false),  2500); }
      updateUserPlan(type);
      showToast(`✓ ${type === "zaith" ? "Zaith" : "Zeno"} unlocked!`);
      setTimeout(() => type === "zaith" ? setZaithStatus(null) : setZenoStatus(null), 2600);
    } else {
      if (type === "zaith") { setZaithStatus("err"); setZaithBubble(true); setTimeout(() => { setZaithBubble(false); setZaithStatus(null); }, 2500); }
      else                  { setZenoStatus("err");  setZenoBubble(true);  setTimeout(() => { setZenoBubble(false);  setZenoStatus(null);  }, 2500); }
    }
  };

  const generateKey = () => {
    const k    = genKey(genType, keyCounter);
    const next = keyCounter + 1;
    const nextKeys = [k, ...genKeys].slice(0, 30);
    setKeyCounter(next); LS.s("dvx_kctr", next);
    setGenKeys(nextKeys); LS.s("dvx_gkeys", nextKeys);
  };

  const copyKey = (k) => { navigator.clipboard?.writeText(k); showToast("Key copied!"); };

  const KeyInput = ({ type, value, onChange, status, bubble }) => {
    const color = status === "ok" ? "#22c55e" : status === "err" ? "#ef4444" : "#1e1e1e";
    const label = type === "zaith" ? "Zaith" : "Zeno";
    return (
      <div style={{marginBottom:14,position:"relative"}}>
        <label style={{fontSize:12,color:"#444",fontWeight:500,display:"block",marginBottom:6}}>{label} Key</label>
        <div style={{display:"flex",gap:6}}>
          <input className="inp" value={value} onChange={e => onChange(e.target.value)} placeholder={`${type.toUpperCase()}-XXX-XXXXXXXX`}
            style={{flex:1,background:"#0a0a0a",border:`1px solid ${status?color:"#1e1e1e"}`,borderRadius:9,padding:"9px 12px",color:"#ccc",fontSize:13,transition:"border-color .2s"}}/>
          <button onClick={() => redeemKey(type)}
            style={{background:"#161616",border:"1px solid #1e1e1e",borderRadius:9,padding:"9px 14px",color:"#888",fontSize:13,fontWeight:600,cursor:"pointer",flexShrink:0,transition:"all .15s"}}>
            Redeem
          </button>
        </div>
        {bubble && (
          <div className="key-bubble" style={{background:status==="ok"?"rgba(34,197,94,.15)":"rgba(239,68,68,.15)",border:`1px solid ${status==="ok"?"#22c55e40":"#ef444440"}`,color:status==="ok"?"#22c55e":"#ef4444"}}>
            {status==="ok" ? "✓ Success" : "✗ Invalid"}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="scl" onClick={e => e.stopPropagation()}
        style={{background:"#0f0f0f",border:"1px solid #1e1e1e",borderRadius:16,padding:24,maxWidth:380,width:"100%",maxHeight:"90dvh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#ddd"}}>Settings</h2>
          <button onClick={onClose} style={{color:"#444",fontSize:15,padding:"3px 8px"}}>✕</button>
        </div>

        {/* User info */}
        <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:11,padding:13,marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:600,fontSize:14,color:"#ddd"}}>{user?.username}</div>
            <div style={{fontSize:12,color:MODELS[user?.plan||"zenith"]?.color||"#6366f1",marginTop:2,fontWeight:600}}>
              {MODELS[user?.plan||"zenith"]?.name} · {MODELS[user?.plan||"zenith"]?.sub}
            </div>
          </div>
          <button onClick={onLogout}
            style={{background:"#161616",border:"1px solid #222",borderRadius:8,padding:"6px 12px",color:"#666",fontSize:12,cursor:"pointer"}}>
            Sign Out
          </button>
        </div>

        {/* Key redemption (non-owners) */}
        {!isOwner && (
          <div style={{marginBottom:18}}>
            <div style={{fontSize:12,color:"#333",fontWeight:600,marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>Redeem Key</div>
            <KeyInput type="zaith" value={zaithInput} onChange={setZaithInput} status={zaithStatus} bubble={zaithBubble}/>
            <KeyInput type="zeno"  value={zenoInput}  onChange={setZenoInput}  status={zenoStatus}  bubble={zenoBubble}/>
          </div>
        )}

        {/* Owner: key generator */}
        {isOwner && (
          <div style={{marginBottom:18}}>
            <div style={{fontSize:12,color:"#6366f1",fontWeight:600,marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>Generate Keys</div>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              <select value={genType} onChange={e => setGenType(e.target.value)}
                style={{flex:1,background:"#0a0a0a",border:"1px solid #1e1e1e",borderRadius:8,padding:"8px 11px",color:"#ccc",fontSize:13}}>
                <option value="ZAITH">Zaith Key</option>
                <option value="ZENO">Zeno Key</option>
              </select>
              <button onClick={generateKey}
                style={{background:"#6366f1",border:"none",borderRadius:8,padding:"8px 16px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                Generate
              </button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:200,overflowY:"auto"}}>
              {genKeys.map((k, i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:7,background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:7,padding:"7px 10px"}}>
                  <code style={{flex:1,fontSize:11,color:k.startsWith("ZENO")?"#e03a3e":"#a855f7",fontFamily:"'JetBrains Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k}</code>
                  <button onClick={() => copyKey(k)} style={{color:"#444",fontSize:11,cursor:"pointer",flexShrink:0,padding:"2px 6px",background:"#161616",borderRadius:5,border:"1px solid #222"}}>Copy</button>
                </div>
              ))}
              {genKeys.length === 0 && <p style={{fontSize:12,color:"#333",textAlign:"center",padding:10}}>No keys generated yet</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   PROJECT TREE (sidebar)
================================================================ */
function ProjectTree({ projects, activeId, setActiveId, onScriptOpen }) {
  const [expanded, setExpanded] = useState({});
  const [expandedSvc, setExpandedSvc] = useState({});

  const toggle   = id => setExpanded(p   => ({ ...p, [id]: !p[id] }));
  const toggleSvc = k  => setExpandedSvc(p => ({ ...p, [k]:  !p[k]  }));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:2}}>
      {projects.map(proj => {
        const isActive = proj.id === activeId;
        const isExp    = expanded[proj.id];
        const wKey     = `${proj.id}-ws`;
        const sKey     = `${proj.id}-ss`;
        return (
          <div key={proj.id}>
            {/* Project folder row */}
            <div className={`tree-row${isActive?" sel":""}`} style={{paddingLeft:4}}
              onClick={() => { setActiveId(proj.id); toggle(proj.id); }}>
              <span style={{color:"#333",fontSize:10}}>{isExp ? "▼" : "▶"}</span>
              <span style={{fontSize:14}}>📁</span>
              <span style={{fontSize:12,color:isActive?"#ddd":"#666",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{proj.name}</span>
            </div>

            {isExp && (
              <div style={{paddingLeft:14,marginTop:2,display:"flex",flexDirection:"column",gap:1}}>
                {/* Workspace */}
                <div className="tree-row" onClick={() => toggleSvc(wKey)} style={{paddingLeft:4}}>
                  <span style={{color:"#333",fontSize:10}}>{expandedSvc[wKey]?"▼":"▶"}</span>
                  <div style={{width:12,height:12,borderRadius:3,background:"#22c55e",flexShrink:0}}/>
                  <span style={{fontSize:12,color:"#555"}}>Workspace</span>
                </div>
                {expandedSvc[wKey] && (
                  <div style={{paddingLeft:22,padding:"2px 2px 2px 22px"}}>
                    <span style={{fontSize:11,color:"#2a2a2a",fontStyle:"italic"}}>empty</span>
                  </div>
                )}

                {/* ServerScriptService */}
                <div className="tree-row" onClick={() => toggleSvc(sKey)} style={{paddingLeft:4}}>
                  <span style={{color:"#333",fontSize:10}}>{expandedSvc[sKey]?"▼":"▶"}</span>
                  <div style={{width:12,height:12,borderRadius:3,background:"#3b82f6",flexShrink:0}}/>
                  <span style={{fontSize:12,color:"#555"}}>ServerScriptService</span>
                </div>
                {expandedSvc[sKey] && (
                  <div style={{paddingLeft:22,display:"flex",flexDirection:"column",gap:1,marginTop:1}}>
                    {(proj.scripts||[]).length === 0 && (
                      <span style={{fontSize:11,color:"#2a2a2a",fontStyle:"italic",padding:"2px 0"}}>no scripts yet</span>
                    )}
                    {(proj.scripts||[]).map(s => (
                      <div key={s.id} className="tree-row" onDoubleClick={() => onScriptOpen(s)}
                        style={{paddingLeft:4,gap:7}}>
                        <div style={{width:10,height:10,borderRadius:2,background:"#eab308",flexShrink:0}}/>
                        <span style={{fontSize:11.5,color:"#666"}}>{s.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================
   SIDEBAR
================================================================ */
function Sidebar({ user, projects, activeId, setActiveId, onNewChat, onScriptOpen, onSettings, onLogout, model, setModel, showAgreement }) {
  const m = MODELS[model];
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"10px 8px"}}>
      {/* Logo */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 6px 16px"}}>
        <div style={{width:28,height:28,borderRadius:8,background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:"0 4px 12px rgba(99,102,241,.4)"}}>D</div>
        <span style={{fontSize:15,fontWeight:700,color:"#ddd",letterSpacing:.5}}>Devix</span>
      </div>

      {/* Nav */}
      <div className="nav-item" onClick={onNewChat} style={{marginBottom:2}}>
        <span style={{fontSize:15}}>✦</span> New task
      </div>
      <div className="nav-item" style={{marginBottom:2,opacity:.35,cursor:"default"}}>
        <span style={{fontSize:15}}>◈</span> Agents <span style={{fontSize:10,background:"#1e1e1e",padding:"1px 5px",borderRadius:4,color:"#444",marginLeft:"auto"}}>soon</span>
      </div>
      <div className="nav-item" style={{marginBottom:12,opacity:.35,cursor:"default"}}>
        <span style={{fontSize:15}}>⌕</span> Search
      </div>

      {/* Projects */}
      <div style={{fontSize:11,color:"#2a2a2a",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,marginBottom:7,paddingLeft:10}}>Projects</div>
      <div style={{flex:1,overflowY:"auto"}}>
        {projects.length === 0
          ? <p style={{fontSize:12,color:"#2a2a2a",padding:"4px 10px",fontStyle:"italic"}}>No projects yet</p>
          : <ProjectTree projects={projects} activeId={activeId} setActiveId={setActiveId} onScriptOpen={onScriptOpen}/>
        }
      </div>

      {/* Bottom */}
      <div style={{borderTop:"1px solid #111",paddingTop:10,marginTop:8,display:"flex",flexDirection:"column",gap:3}}>
        {/* Current model indicator */}
        <div style={{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:9,marginBottom:4}}>
          <span style={{fontSize:13}}>{m?.icon}</span>
          <span style={{fontSize:12,color:m?.color,fontWeight:600,flex:1}}>{m?.name}</span>
          <div style={{display:"flex",gap:3}}>
            {Object.values(MODELS).map(ml => (
              <button key={ml.id} onClick={() => { if(!ml.free) { showAgreement(ml.id); return; } setModel(ml.id); }}
                style={{width:7,height:7,borderRadius:"50%",background:model===ml.id?ml.color:"#222",padding:0,cursor:"pointer",border:"none",transition:"all .15s"}}/>
            ))}
          </div>
        </div>

        <button onClick={onSettings} className="nav-item" style={{width:"100%",justifyContent:"flex-start"}}>
          <span style={{fontSize:14}}>⚙</span>
          <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{user?.username}</span>
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   AI SELECTOR PAGE
================================================================ */
function AISelector({ username, onSelect }) {
  return (
    <div style={{minHeight:"100dvh",background:"#080808",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,position:"relative",overflow:"hidden"}}>
      {/* Subtle grid */}
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(#111 1px,transparent 1px),linear-gradient(90deg,#111 1px,transparent 1px)",backgroundSize:"56px 56px",opacity:.4,pointerEvents:"none"}}/>
      {/* Glow */}
      <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:600,height:300,background:"radial-gradient(ellipse,rgba(99,102,241,.08),transparent 70%)",pointerEvents:"none"}}/>

      <div style={{zIndex:1,width:"100%",maxWidth:820}}>
        <div className="up" style={{textAlign:"center",marginBottom:40}}>
          <h1 style={{fontSize:28,fontWeight:700,color:"#e8e8e8",marginBottom:8}}>
            Welcome back, <span style={{color:"#6366f1"}}>{username}</span>
          </h1>
          <p style={{color:"#444",fontSize:14}}>Choose your AI assistant</p>
        </div>

        <div style={{display:"flex",gap:16,flexWrap:"wrap",justifyContent:"center"}}>
          {Object.values(MODELS).map((m, i) => (
            <div key={m.id} className="mcard up" style={{flex:"1 1 220px",maxWidth:260,animationDelay:`${i*.08}s`,position:"relative"}}
              onClick={() => onSelect(m.id)}>
              {!m.free && <div style={{position:"absolute",top:12,right:12,fontSize:10,fontWeight:700,color:m.color,background:m.bg,border:`1px solid ${m.color}30`,borderRadius:5,padding:"2px 7px"}}>KEY</div>}
              <div style={{width:44,height:44,borderRadius:12,background:m.bg,border:`1px solid ${m.color}25`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:14}}>
                {m.icon}
              </div>
              <div style={{fontWeight:700,fontSize:16,color:"#e8e8e8",marginBottom:4}}>{m.name}</div>
              <div style={{fontSize:12,color:"#444",marginBottom:12,fontWeight:500}}>{m.sub}</div>
              <p style={{fontSize:13,color:"#333",lineHeight:1.65}}>{m.desc}</p>
              <div style={{marginTop:18,display:"flex",alignItems:"center",gap:6,color:m.color,fontSize:13,fontWeight:600}}>
                {m.free ? "Start building" : "Get access"} <span>→</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   ROOT
================================================================ */
export default function DevixApp() {
  const [page,       setPage]       = useState("loading");
  const [isSignup,   setIsSignup]   = useState(false);
  const [form,       setForm]       = useState({ username:"", password:"" });
  const [loginErr,   setLoginErr]   = useState("");
  const [user,       setUser]       = useState(null);
  const [model,      setModel]      = useState("zenith");
  const [projects,   setProjects]   = useState([]);
  const [activeId,   setActiveId]   = useState(null);
  const [input,      setInput]      = useState("");
  const [isLoading,  setIsLoading]  = useState(false);
  const [files,      setFiles]      = useState([]);
  const [showSett,   setShowSett]   = useState(false);
  const [agreement,  setAgreement]  = useState(null); // model id | null
  const [openScript, setOpenScript] = useState(null);
  const [copied,     setCopied]     = useState({});
  const [toast,      setToast]      = useState(null);

  const endRef   = useRef(null);
  const textRef  = useRef(null);
  const fileRef  = useRef(null);
  const abortRef = useRef(null);

  const proj   = projects.find(p => p.id === activeId);
  const msgs   = proj?.messages || [];
  const m      = MODELS[model];
  const isOwner = user?.username?.toLowerCase() === OWNER_KEY.toLowerCase() || user?.ownerKey;

  const showToast = useCallback((msg, dur = 3000) => {
    setToast(msg); setTimeout(() => setToast(null), dur);
  }, []);

  // ── Init ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = LS.g("dvx_session");
    if (s?.username) {
      setUser(s);
      setProjects(LS.g(`dvx_projects_${s.username}`, []));
      setModel(s.lastModel || "zenith");
      setPage("chat");
    } else {
      setPage("login");
    }
  }, []);

  useEffect(() => {
    if (proj) endRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [msgs, isLoading]);

  useEffect(() => {
    if (user) LS.s(`dvx_projects_${user.username}`, projects);
  }, [projects, user]);

  // ── Auth ──────────────────────────────────────────────────────
  const doAuth = () => {
    const uname = form.username.trim(); const pass = form.password;
    if (!uname || !pass) { setLoginErr("Fill in all fields"); return; }
    const users = LS.g("dvx_users", {}); const key = uname.toLowerCase();
    if (isSignup) {
      if (users[key]) { setLoginErr("Username taken"); return; }
      users[key] = { username:uname, password:pass, plan:"zenith" };
      LS.s("dvx_users", users);
      const u = { username:uname, plan:"zenith" };
      setUser(u); LS.s("dvx_session", u);
      setProjects([]); setPage("select");
    } else {
      const rec = users[key];
      if (!rec)              { setLoginErr("Account not found");  return; }
      if (rec.password!==pass){ setLoginErr("Wrong password");     return; }
      const u = { username:rec.username, plan:rec.plan||"zenith" };
      setUser(u); LS.s("dvx_session", u);
      setProjects(LS.g(`dvx_projects_${rec.username}`, []));
      setPage("select");
    }
  };

  const doLogout = () => {
    LS.d("dvx_session"); setUser(null); setPage("login");
    setForm({username:"",password:""}); setProjects([]); setActiveId(null); setShowSett(false);
  };

  const updateUserPlan = (plan) => {
    const upd = { ...user, plan };
    setUser(upd); LS.s("dvx_session", upd);
    const users = LS.g("dvx_users", {}); const k = user.username.toLowerCase();
    if (users[k]) { users[k].plan = plan; LS.s("dvx_users", users); }
  };

  // ── Model select ──────────────────────────────────────────────
  const handleSelectModel = (id) => {
    const ml = MODELS[id];
    if (!ml.free && user?.plan !== id && user?.plan !== "zeno") {
      setAgreement(id); return;
    }
    setModel(id);
    const upd = { ...user, lastModel:id };
    setUser(upd); LS.s("dvx_session", upd);
    setPage("chat");
  };

  // ── Projects ──────────────────────────────────────────────────
  const newProject = () => {
    const id = Date.now();
    const np = { id, name:"New Chat", messages:[], scripts:[] };
    setProjects(p => [...p, np]); setActiveId(id);
  };

  const patchProject = useCallback((id, fn) => setProjects(prev => prev.map(p => p.id === id ? fn(p) : p)), []);

  // ── Send ──────────────────────────────────────────────────────
  const doSend = async () => {
    if ((!input.trim() && !files.length) || isLoading) return;
    if (!activeId) { newProject(); return; }

    const uMsg = { id:Date.now(), role:"user", content:input, files:[...files], ts:nowTS() };
    const next = [...msgs, uMsg];

    if (msgs.length === 0 && input.trim()) {
      patchProject(activeId, p => ({ ...p, name:input.trim().slice(0,42)+(input.length>42?"…":""), messages:next }));
    } else {
      patchProject(activeId, p => ({ ...p, messages:next }));
    }

    setInput(""); setFiles([]); setIsLoading(true);
    if (textRef.current) textRef.current.style.height = "auto";

    const apiMsgs = next.map(m => ({
      role: m.role,
      content: m.content + (m.files?.length ? "\n\n[Files]\n" + m.files.map(f=>`--- ${f.name} ---\n${f.content||"[binary]"}`).join("\n\n") : ""),
    }));

    const aiId = Date.now() + 1;
    patchProject(activeId, p => ({ ...p, messages:[...next, {id:aiId,role:"assistant",content:"",ts:nowTS(),streaming:true}] }));

    const abort = new AbortController(); abortRef.current = abort;
    try {
      const full = await callAPI(m.mode, apiMsgs);
      await streamText(full, partial => {
        patchProject(activeId, p => ({ ...p, messages:p.messages.map(m => m.id===aiId?{...m,content:partial,streaming:true}:m) }));
      }, abort.signal);

      // extract scripts and add to project
      const newScripts = extractScripts(full);
      patchProject(activeId, p => ({
        ...p,
        messages: p.messages.map(m => m.id===aiId ? {...m,content:full,streaming:false} : m),
        scripts:  [...(p.scripts||[]), ...newScripts],
      }));
    } catch (err) {
      patchProject(activeId, p => ({ ...p, messages:p.messages.map(m => m.id===aiId?{...m,content:`⚠️ ${err.message}`,streaming:false}:m) }));
    }
    setIsLoading(false); abortRef.current = null;
  };

  const attachFiles = async fl => {
    const arr = [];
    for (const f of Array.from(fl)) { try { arr.push({name:f.name,content:await f.text()}); } catch { arr.push({name:f.name,content:"[binary]"}); } }
    setFiles(p => [...p,...arr]); showToast(`${arr.length} file${arr.length>1?"s":""} attached`);
  };

  const onCopy = (code, key) => {
    navigator.clipboard?.writeText(code);
    setCopied(p => ({...p,[key]:true})); setTimeout(() => setCopied(p => ({...p,[key]:false})), 2000); showToast("Copied!");
  };

  // ── LOADING ───────────────────────────────────────────────────
  if (page === "loading") return (
    <><style>{CSS}</style>
    <div style={{height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"#080808"}}>
      <div style={{width:44,height:44,borderRadius:13,background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#fff",animation:"pulse 1.4s ease infinite"}}>D</div>
    </div></>
  );

  // ── LOGIN ─────────────────────────────────────────────────────
  if (page === "login") return (
    <><style>{CSS}</style>
    <div style={{minHeight:"100dvh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center",padding:20,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(#0f0f0f 1px,transparent 1px),linear-gradient(90deg,#0f0f0f 1px,transparent 1px)",backgroundSize:"52px 52px",opacity:.6,pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:500,height:260,background:"radial-gradient(ellipse,rgba(99,102,241,.07),transparent 70%)",pointerEvents:"none"}}/>

      <div style={{zIndex:1,width:"100%",maxWidth:840,display:"flex",gap:24,flexWrap:"wrap",justifyContent:"center",alignItems:"flex-start",paddingTop:16}}>
        {/* Auth card */}
        <div className="up" style={{flex:"0 0 300px",maxWidth:320}}>
          <div style={{marginBottom:22}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{width:36,height:36,borderRadius:10,background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:"#fff",boxShadow:"0 6px 20px rgba(99,102,241,.4)",flexShrink:0}}>D</div>
              <span style={{fontSize:24,fontWeight:800,color:"#e8e8e8",letterSpacing:.5}}>Devix</span>
            </div>
            <p style={{color:"#333",fontSize:13,lineHeight:1.7}}>The AI built for Roblox Studio.<br/>Luau scripts, game systems, instant help.</p>
          </div>

          <div style={{background:"#0e0e0e",border:"1px solid #1a1a1a",borderRadius:14,padding:20}}>
            <div style={{display:"flex",background:"#080808",borderRadius:9,padding:3,marginBottom:15}}>
              {["Sign In","Sign Up"].map((lb,i) => (
                <button key={lb} onClick={() => { setIsSignup(i===1); setLoginErr(""); }}
                  style={{flex:1,padding:"7px 0",borderRadius:7,border:"none",background:isSignup===(i===1)?"#6366f1":"transparent",color:isSignup===(i===1)?"#fff":"#444",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .18s"}}>
                  {lb}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {["Username","Password"].map((ph,i) => (
                <input key={ph} type={i===1?"password":"text"} placeholder={ph}
                  value={i===0?form.username:form.password}
                  onChange={e => setForm(p => ({...p,[i===0?"username":"password"]:e.target.value}))}
                  onKeyDown={e => e.key==="Enter" && doAuth()}
                  className="inp" style={{width:"100%"}}
                  onFocus={e => e.target.style.borderColor="#6366f1"} onBlur={e => e.target.style.borderColor="#1e1e1e"}/>
              ))}
              {loginErr && <p style={{color:"#ef4444",fontSize:12,textAlign:"center"}}>{loginErr}</p>}
              <button onClick={doAuth}
                style={{background:"#6366f1",border:"none",borderRadius:9,padding:"11px",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(99,102,241,.35)"}}>
                {isSignup ? "Create Account →" : "Sign In →"}
              </button>
            </div>
          </div>
        </div>

        {/* Feature cards */}
        <div style={{display:"flex",flexDirection:"column",gap:8,flex:"1 1 200px",maxWidth:370}}>
          {Object.values(MODELS).map((ml,i) => (
            <div key={ml.id} className="up" style={{background:"#0e0e0e",border:"1px solid #1a1a1a",borderRadius:11,padding:"12px 14px",display:"flex",gap:11,alignItems:"flex-start",animationDelay:`${i*.08}s`}}>
              <div style={{width:32,height:32,borderRadius:9,background:ml.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{ml.icon}</div>
              <div>
                <div style={{color:"#ddd",fontWeight:600,fontSize:13,marginBottom:2}}>{ml.name} <span style={{fontSize:11,color:ml.free?"#22c55e":"#a855f7",fontWeight:700}}>{ml.free?"Free":"Key"}</span></div>
                <div style={{color:"#333",fontSize:12,lineHeight:1.55}}>{ml.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div></>
  );

  // ── AI SELECTOR ───────────────────────────────────────────────
  if (page === "select") return (
    <><style>{CSS}</style>
    <AISelector username={user?.username} onSelect={handleSelectModel}/>
    {agreement && <AgreementModal model={agreement} onClose={() => setAgreement(null)}/>}
    </>
  );

  // ── MAIN CHAT ─────────────────────────────────────────────────
  return (
    <><style>{CSS}</style>

    {/* Toast */}
    {toast && (
      <div className="up" style={{position:"fixed",bottom:22,left:"50%",transform:"translateX(-50%)",background:"#111",border:"1px solid #1e1e1e",borderRadius:9,padding:"9px 16px",fontSize:13,color:"#ccc",zIndex:999,boxShadow:"0 8px 28px rgba(0,0,0,.5)",whiteSpace:"nowrap"}}>
        {toast}
      </div>
    )}

    {/* Modals */}
    {showSett && <SettingsPanel user={user} onClose={() => setShowSett(false)} onLogout={doLogout} showToast={showToast} updateUserPlan={updateUserPlan} isOwner={isOwner}/>}
    {agreement && <AgreementModal model={agreement} onClose={() => setAgreement(null)}/>}
    {openScript && <ScriptViewer script={openScript} onClose={() => setOpenScript(null)}/>}

    <div style={{height:"100dvh",display:"flex",background:"#080808",overflow:"hidden"}}>

      {/* Sidebar */}
      <aside style={{width:228,background:"#0c0c0c",borderRight:"1px solid #111",display:"flex",flexDirection:"column",flexShrink:0}}>
        <Sidebar
          user={user} projects={projects} activeId={activeId}
          setActiveId={id => { setActiveId(id); }}
          onNewChat={() => { newProject(); }}
          onScriptOpen={setOpenScript}
          onSettings={() => setShowSett(true)}
          onLogout={doLogout}
          model={model} setModel={id => { setModel(id); const u={...user,lastModel:id}; setUser(u); LS.s("dvx_session",u); }}
          showAgreement={id => setAgreement(id)}
        />
      </aside>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

        {/* Top bar */}
        <header style={{height:46,padding:"0 20px",borderBottom:"1px solid #0f0f0f",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:13,color:"#2a2a2a",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {proj?.name || "Select a project"}
          </span>
          {/* Model dots in header */}
          <div style={{display:"flex",gap:5,alignItems:"center"}}>
            {Object.values(MODELS).map(ml => (
              <button key={ml.id} onClick={() => ml.free ? setModel(ml.id) : setAgreement(ml.id)}
                style={{display:"flex",alignItems:"center",gap:5,padding:"4px 9px",borderRadius:7,border:`1px solid ${model===ml.id?`${ml.color}40`:"#1a1a1a"}`,background:model===ml.id?ml.bg:"transparent",color:model===ml.id?ml.color:"#333",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .15s"}}>
                {ml.icon} <span style={{fontSize:11}}>{ml.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setPage("select")} style={{fontSize:12,color:"#2a2a2a",padding:"4px 9px",border:"1px solid #111",borderRadius:7,background:"none",cursor:"pointer"}}>Switch AI</button>
          <button onClick={() => setShowSett(true)} style={{fontSize:13,color:"#333",padding:"4px 8px",border:"1px solid #111",borderRadius:7,background:"none",cursor:"pointer"}}>⚙</button>
        </header>

        {/* Messages / empty */}
        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
          {!proj || msgs.length === 0 ? (
            <div className="fade" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:24}}>
              <div style={{textAlign:"center"}}>
                <div style={{width:56,height:56,borderRadius:16,background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:800,color:"#fff",margin:"0 auto 18px",boxShadow:"0 12px 36px rgba(99,102,241,.35)"}}>D</div>
                <h1 style={{fontSize:32,fontWeight:300,color:"#555",letterSpacing:-1,lineHeight:1.2}}>What can I do for you?</h1>
                <p style={{color:"#2a2a2a",fontSize:13,marginTop:8}}>Using <span style={{color:m.color,fontWeight:600}}>{m.name}</span> · {m.sub}</p>
              </div>
              {/* Quick actions */}
              <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",maxWidth:600}}>
                {[
                  {icon:"⚔️",label:"Combat system"},
                  {icon:"💾",label:"DataStore save"},
                  {icon:"🗺️",label:"Terrain gen"},
                  {icon:"🎒",label:"Inventory UI"},
                  {icon:"🛡️",label:"Admin commands"},
                  {icon:"🤖",label:"AI NPC"},
                ].map(q => (
                  <button key={q.label} onClick={() => { if(!proj) newProject(); setInput(`Build a complete ${q.label.toLowerCase()} system for Roblox Studio`); textRef.current?.focus(); }}
                    style={{display:"flex",alignItems:"center",gap:7,padding:"9px 14px",border:"1px solid #141414",borderRadius:9,background:"#0e0e0e",color:"#444",fontSize:13,cursor:"pointer",transition:"all .15s"}}>
                    <span>{q.icon}</span>{q.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{maxWidth:720,width:"100%",margin:"0 auto",padding:"18px 20px",display:"flex",flexDirection:"column",gap:10}}>
              {msgs.map(msg => (
                <ChatMsg key={msg.id} msg={msg} streaming={msg.streaming} model={model} onCopy={onCopy} copied={copied}/>
              ))}
              {isLoading && msgs[msgs.length-1]?.role !== "assistant" && (
                <div className="up" style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:18,height:18,borderRadius:5,background:m.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:"#fff",flexShrink:0}}>D</div>
                  <span className="d1" style={{width:4,height:4,borderRadius:"50%",background:m.color,display:"inline-block"}}/>
                  <span className="d2" style={{width:4,height:4,borderRadius:"50%",background:m.color,display:"inline-block"}}/>
                  <span className="d3" style={{width:4,height:4,borderRadius:"50%",background:m.color,display:"inline-block"}}/>
                  <span style={{color:"#2a2a2a",fontSize:12}}>{m.mode==="deep"?"Synthesizing…":"Thinking…"}</span>
                </div>
              )}
              <div ref={endRef}/>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{borderTop:"1px solid #0f0f0f",padding:"12px 20px 14px",flexShrink:0}}>
          {files.length > 0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
              {files.map((f,i) => (
                <span key={i} style={{background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.2)",borderRadius:6,padding:"3px 9px",fontSize:11,color:"#6366f1",display:"flex",alignItems:"center",gap:5}}>
                  📄 {f.name}
                  <button onClick={() => setFiles(p=>p.filter((_,j)=>j!==i))} style={{color:"#444",fontSize:10,padding:0,cursor:"pointer"}}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="ibox" style={{display:"flex",alignItems:"flex-end",gap:8,background:"#0c0c0c",padding:"10px 12px"}}>
            <input ref={fileRef} type="file" accept=".lua,.luau,.rbxl,.rbxlx,.txt,.json,.md" multiple style={{display:"none"}} onChange={e=>attachFiles(e.target.files)}/>
            <button onClick={() => fileRef.current?.click()} style={{color:"#2a2a2a",fontSize:20,padding:"1px 4px",lineHeight:1,flexShrink:0,marginBottom:1}}>+</button>
            <textarea ref={textRef} value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,180)+"px"; }}
              onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();} }}
              placeholder="Assign a task or ask anything…" rows={1}
              style={{flex:1,background:"none",border:"none",color:"#ccc",fontSize:14,resize:"none",lineHeight:1.65,maxHeight:180,overflow:"auto",padding:"1px 0"}}/>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <span style={{fontSize:11,color:m.color,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>{m.icon} {m.name}</span>
              <button onClick={doSend} disabled={isLoading||(!input.trim()&&!files.length)}
                style={{background:(isLoading||(!input.trim()&&!files.length))?"#161616":"#6366f1",border:"none",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:(isLoading||(!input.trim()&&!files.length))?"#333":"#fff",fontSize:14,cursor:isLoading||(!input.trim()&&!files.length)?"not-allowed":"pointer",transition:"all .15s",flexShrink:0}}>
                {isLoading ? <span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:11}}>⟳</span> : "↑"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
