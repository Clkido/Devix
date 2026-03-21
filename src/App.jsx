import { useState, useRef, useEffect, useCallback } from "react";

/* ================================================================
   DEVIX AI v4
   • Stripe payments  – Zeno $4.99 / Ultra Zeno $15.99
   • Script Analyzer  – paste/upload Lua, AI fixes & documents
   • User API key     – copy-able, shown in Settings + Analyzer
   • Fade-in streaming – word-by-word CSS fade per token
   • Cleaner redesign – minimal, sharp, animated
   • No Game Wizard
================================================================ */

const API_URL   = "/api/chat";
const OWNER_KEY = "sullyz";

// Stripe Payment Links – set these as Vercel env vars:
//   VITE_STRIPE_ZENO_LINK   → your Stripe link for $4.99 plan
//   VITE_STRIPE_ULTRA_LINK  → your Stripe link for $15.99 plan
// In the Stripe link's "After payment" success URL, set:
//   https://yourdomain.com/?upgraded=zeno   (for Zeno)
//   https://yourdomain.com/?upgraded=ultra  (for Ultra Zeno)
const STRIPE = {
  zeno:  import.meta.env.VITE_STRIPE_ZENO_LINK  || "#setup-stripe",
  ultra: import.meta.env.VITE_STRIPE_ULTRA_LINK || "#setup-stripe",
};

// ── PLANS ─────────────────────────────────────────────────────────
const PLANS = {
  basic: { id:"basic", name:"Basic",      price:"Free",      badge:"◆", color:"#6b7280", msgLimit:30,   zeno:false },
  zeno:  { id:"zeno",  name:"Zeno",       price:"$4.99/mo",  badge:"⚡", color:"#6366f1", msgLimit:500,  zeno:true  },
  ultra: { id:"ultra", name:"Ultra Zeno", price:"$15.99/mo", badge:"★",  color:"#e03a3e", msgLimit:9999, zeno:true  },
  owner: { id:"owner", name:"Owner",      price:"∞",         badge:"👑", color:"#f59e0b", msgLimit:9999, zeno:true  },
};

// ── THEMES ────────────────────────────────────────────────────────
const THEMES = {
  dark:   { name:"Dark",   bg:"#080808", surface:"#0f0f0f", s2:"#161616", border:"#202020", text:"#eeeeee", muted:"#505050", accent:"#e03a3e" },
  light:  { name:"Light",  bg:"#f5f5f5", surface:"#ffffff",  s2:"#ebebeb", border:"#dddddd", text:"#111111", muted:"#888888", accent:"#e03a3e" },
  slate:  { name:"Slate",  bg:"#0d1117", surface:"#161b22",  s2:"#21262d", border:"#30363d", text:"#e6edf3", muted:"#656d76", accent:"#58a6ff" },
  carbon: { name:"Carbon", bg:"#050505", surface:"#0c0c0c",  s2:"#131313", border:"#1b1b1b", text:"#d4d4d4", muted:"#404040", accent:"#22d3ee" },
};

// ── FONTS ─────────────────────────────────────────────────────────
const FONTS = {
  inter: { name:"Inter",   gUrl:"Inter:wght@300;400;500;600;700",          fam:"'Inter',sans-serif"         },
  dm:    { name:"DM Sans", gUrl:"DM+Sans:ital,opsz,wght@0,9..40,300..700", fam:"'DM Sans',sans-serif"       },
  syne:  { name:"Syne",    gUrl:"Syne:wght@400;600;700;800",               fam:"'Syne',sans-serif"          },
  arial: { name:"Arial",   gUrl:null,                                       fam:"Arial,Helvetica,sans-serif" },
  mono:  { name:"Mono",    gUrl:"JetBrains+Mono:wght@300;400;500;700",     fam:"'JetBrains Mono',monospace" },
};

// ── SYSTEM PROMPTS ────────────────────────────────────────────────
const BASE = `You are Devix — an expert AI for Roblox Studio development. You are NOT Claude or any known AI.
EXPERTISE: Luau, Roblox Studio, DataStore, TweenService, RemoteEvents, RunService, game systems.
CODE: Always Luau. task.wait() not wait(). task.spawn() not spawn(). Type annotations. Code in \`\`\`lua blocks. Complete scripts, no placeholders. Clear comments.
FORMAT: **bold** for key terms, ## headers, - for lists, \`inline\` for API names.
RULES: No NSFW, no exploit scripts, no crash tools.`;
const SYS_Q = BASE + "\nMODE: Quick. Be concise and direct.";
const SYS_D = BASE + "\nMODE: Deep. Comprehensive, full architecture, edge cases covered.";
const SYS_A = `You are Devix Script Analyzer — an expert Luau/Roblox code reviewer.
When given a script:
1. Find all bugs, deprecated APIs, and issues
2. Rewrite the COMPLETE fixed script in a \`\`\`lua block — never truncate
3. Add comments to every function
4. Replace deprecated calls: wait()→task.wait(), spawn()→task.spawn(), etc.
5. List every change you made with bullet points
Be thorough. Output the full fixed script every time.`;

// ── STORAGE ───────────────────────────────────────────────────────
const LS = {
  g: (k,d=null) => { try { return JSON.parse(localStorage.getItem(k)??"null")??d; } catch { return d; } },
  s: (k,v)      => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} },
  d: (k)        => { try { localStorage.removeItem(k); } catch {} },
};

// ── USER KEY ──────────────────────────────────────────────────────
function getUserKey(username) {
  const stored = LS.g(`dvx_key_${username}`);
  if (stored) return stored;
  let h = 5381;
  for (let i = 0; i < username.length; i++) h = ((h << 5) + h) ^ username.charCodeAt(i);
  const k = `dvx-${Math.abs(h).toString(16).padStart(8,"0")}-${Date.now().toString(16).slice(-8)}`;
  LS.s(`dvx_key_${username}`, k);
  return k;
}

// ── API ───────────────────────────────────────────────────────────
async function callAPI(mode, messages, sysOverride) {
  const sys = sysOverride || (mode === "deep" ? SYS_D : SYS_Q);
  const r   = await fetch(API_URL, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ mode: mode==="analyzer"?"quick":mode, system:sys, messages }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e?.error||`HTTP ${r.status}`); }
  return (await r.json()).text || "";
}

// ── STREAMING w/ fade ─────────────────────────────────────────────
async function streamText(text, onUpdate, signal) {
  const tokens = text.split(/(\s+)/);
  let out = "";
  for (const tok of tokens) {
    if (signal?.aborted) break;
    out += tok;
    onUpdate(out);
    await new Promise(r => setTimeout(r, 9 + Math.random() * 14));
  }
  onUpdate(text);
}

// ── MARKDOWN ─────────────────────────────────────────────────────
function inl(text, ms, seed="") {
  const re = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;
  const out=[]; let last=0,m,n=0;
  while ((m=re.exec(text))!==null) {
    if (m.index>last) out.push(text.slice(last,m.index));
    if (m[0].startsWith("**")) out.push(<strong key={seed+n++} style={{fontWeight:700}}>{m[2]}</strong>);
    else if (m[0].startsWith("*")) out.push(<em key={seed+n++}>{m[3]}</em>);
    else out.push(<code key={seed+n++} style={ms}>{m[4]}</code>);
    last = m.index+m[0].length;
  }
  if (last<text.length) out.push(text.slice(last));
  return out;
}

function MD({text,tc,ms}) {
  if (!text) return null;
  const lines=text.split("\n"); const result=[]; let i=0;
  while (i<lines.length) {
    const ln=lines[i];
    if (/^#{1,3} /.test(ln)) {
      const lvl=ln.match(/^(#{1,3}) /)[1].length;
      result.push(<div key={i} style={{fontSize:[18,15,13][lvl-1],fontWeight:[800,700,600][lvl-1],color:tc,margin:"11px 0 5px",lineHeight:1.3}}>{inl(ln.slice(lvl+1),ms,`h${i}`)}</div>);
    } else if (/^[-•*] /.test(ln)) {
      const items=[];
      while (i<lines.length&&/^[-•*] /.test(lines[i])) { items.push(<li key={i} style={{marginBottom:3,lineHeight:1.7}}>{inl(lines[i].slice(2),ms,`li${i}`)}</li>); i++; }
      result.push(<ul key={`ul${i}`} style={{paddingLeft:18,margin:"5px 0",color:tc,fontSize:14}}>{items}</ul>); continue;
    } else if (/^\d+\. /.test(ln)) {
      const items=[];
      while (i<lines.length&&/^\d+\. /.test(lines[i])) { items.push(<li key={i} style={{marginBottom:3,lineHeight:1.7}}>{inl(lines[i].replace(/^\d+\. /,""),ms,`ol${i}`)}</li>); i++; }
      result.push(<ol key={`ol${i}`} style={{paddingLeft:18,margin:"5px 0",color:tc,fontSize:14}}>{items}</ol>); continue;
    } else if (/^-{3,}$/.test(ln.trim())) {
      result.push(<hr key={i} style={{border:"none",borderTop:"1px solid rgba(128,128,128,.13)",margin:"10px 0"}}/>);
    } else if (ln.trim()==="") {
      result.push(<div key={i} style={{height:4}}/>);
    } else {
      result.push(<p key={i} style={{margin:"2px 0",lineHeight:1.78,color:tc,fontSize:14,wordBreak:"break-word"}}>{inl(ln,ms,`p${i}`)}</p>);
    }
    i++;
  }
  return <>{result}</>;
}

function parseParts(content) {
  const parts=[]; const re=/```(\w*)\n?([\s\S]*?)```/g; let last=0,m;
  while ((m=re.exec(content))!==null) {
    if (m.index>last) parts.push({type:"text",content:content.slice(last,m.index)});
    parts.push({type:"code",lang:m[1]||"lua",content:m[2].trim()});
    last=m.index+m[0].length;
  }
  if (last<content.length) parts.push({type:"text",content:content.slice(last)});
  return parts;
}

const nowTS = () => new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

// ── CSS ───────────────────────────────────────────────────────────
function makeCSS(t,ac,ff,fu) {
  const g=`${ac}26`;
  return `
${fu?`@import url('https://fonts.googleapis.com/css2?family=${fu}&family=JetBrains+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');`
    :`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');`}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;overflow:hidden}
body{font-family:${ff};background:${t.bg};color:${t.text};-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:3px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px}
textarea,input,button,select{font-family:${ff}}
textarea:focus,input:focus{outline:none}
button{cursor:pointer}

@keyframes fadeUp  {from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes fadeIn  {from{opacity:0}to{opacity:1}}
@keyframes slL     {from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}
@keyframes scaleIn {from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
@keyframes blink   {0%,100%{opacity:1}50%{opacity:0}}
@keyframes bounce  {0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
@keyframes shimmer {0%{background-position:-300% center}100%{background-position:300% center}}
@keyframes pulse   {0%,100%{opacity:1}50%{opacity:.35}}
@keyframes float   {0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes gradSh  {0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes tokFade {from{opacity:0;filter:blur(3px)}to{opacity:1;filter:blur(0)}}
@keyframes spin    {from{transform:rotate(0)}to{transform:rotate(360deg)}}

.up   {animation:fadeUp  .26s cubic-bezier(.22,1,.36,1) both}
.fade {animation:fadeIn  .2s ease both}
.scl  {animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both}
.slL  {animation:slL     .24s cubic-bezier(.22,1,.36,1) both}
.float{animation:float 4s ease infinite}

.btn{transition:filter .12s,transform .12s}
.btn:hover{filter:brightness(1.13);transform:translateY(-1px)}
.btn:active{filter:brightness(.9);transform:none}

.srow{transition:background .1s,padding-left .1s;border-radius:8px;padding-left:8px}
.srow:hover{background:${t.s2}!important;padding-left:13px!important}
.srow.ar{background:${g}!important;border-left:2px solid ${ac}}

.ibox{transition:border-color .18s,box-shadow .18s}
.ibox:focus-within{border-color:${ac}!important;box-shadow:0 0 0 3px ${g}!important}

.cursor::after{content:"▋";color:${ac};animation:blink .6s step-end infinite;margin-left:1px}

.cpb{opacity:0;transition:opacity .12s}
.cw:hover .cpb{opacity:1}

.logo{background:linear-gradient(90deg,${t.text} 0%,${ac} 40%,${t.text} 60%,${ac} 80%,${t.text} 100%);background-size:300% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 5s linear infinite}

.d1{animation:bounce 1.4s ease 0s infinite}
.d2{animation:bounce 1.4s ease .15s infinite}
.d3{animation:bounce 1.4s ease .30s infinite}

@media(max-width:768px){.dt{display:none!important}}
@media(min-width:769px){.mb{display:none!important}}
`;}

// ── QUICK ACTIONS ─────────────────────────────────────────────────
const QA = [
  {icon:"⚔️",label:"Combat",    prompt:"Build a complete combat system with hitboxes, damage, animations and effects"},
  {icon:"💾",label:"DataStore", prompt:"Create a robust DataStore save/load system with retry logic and error handling"},
  {icon:"🗺️",label:"Terrain",   prompt:"Generate procedural terrain with multiple biomes using the Roblox Terrain API"},
  {icon:"🎒",label:"Inventory", prompt:"Build a full inventory system with drag-and-drop GUI and item management"},
  {icon:"🛡️",label:"Admin",     prompt:"Create an admin system with rank-based permissions and commands"},
  {icon:"🏆",label:"Leaderboard",prompt:"Build a persistent leaderboard with DataStore and live updates"},
  {icon:"💰",label:"Shop",      prompt:"Create an in-game shop with currency, gamepasses and purchase UI"},
  {icon:"🤖",label:"AI NPC",    prompt:"Build an NPC with pathfinding, patrol/chase/attack states and combat AI"},
];

/* ================================================================
   CODE BLOCK
================================================================ */
function CodeBlock({lang,code,t,ac,onCopy,copied}) {
  return (
    <div className="cw" style={{background:t.s2,borderRadius:10,border:`1px solid ${t.border}`,overflow:"hidden",margin:"8px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",borderBottom:`1px solid ${t.border}`}}>
        <span style={{fontSize:11,color:t.muted,fontFamily:"'JetBrains Mono',monospace",fontWeight:500}}>{lang||"lua"}</span>
        <button className="cpb btn" onClick={onCopy}
          style={{background:`${ac}18`,border:`1px solid ${ac}30`,borderRadius:5,padding:"3px 9px",color:ac,fontSize:11,fontWeight:600}}>
          {copied?"✓ Copied":"Copy"}
        </button>
      </div>
      <pre style={{padding:"13px 14px",overflowX:"auto",fontSize:12.5,lineHeight:1.65,fontFamily:"'JetBrains Mono',monospace",color:t.text,margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
        {code}
      </pre>
    </div>
  );
}

/* ================================================================
   MESSAGE
================================================================ */
function Message({msg,t,ac,isStreaming,onCopy,copied}) {
  const isUser = msg.role==="user";
  const ms = {background:`${ac}15`,borderRadius:4,padding:"1px 6px",fontFamily:"'JetBrains Mono',monospace",fontSize:"0.87em"};
  return (
    <div className="up" style={{display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start",padding:"3px 0"}}>
      {!isUser && (
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
          <div style={{width:20,height:20,borderRadius:6,background:ac,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{color:"#fff",fontSize:10,fontWeight:800,fontFamily:"'Syne',sans-serif"}}>D</span>
          </div>
          <span style={{fontSize:11,color:t.muted,fontWeight:500}}>Devix {msg.mode==="deep"?"· Zeno":"· Zenith"}</span>
          <span style={{fontSize:10,color:t.muted}}>{msg.ts}</span>
        </div>
      )}
      <div style={{
        maxWidth:"84%",
        background:isUser?`${ac}15`:t.surface,
        border:`1px solid ${isUser?`${ac}25`:t.border}`,
        borderRadius:isUser?"14px 14px 4px 14px":"4px 14px 14px 14px",
        padding:"11px 14px",
      }}>
        {isUser
          ? <p style={{color:t.text,fontSize:14,lineHeight:1.72,whiteSpace:"pre-wrap"}}>{msg.content}</p>
          : <>
              {parseParts(msg.content).map((p,i) =>
                p.type==="code"
                  ? <CodeBlock key={i} lang={p.lang} code={p.content} t={t} ac={ac} onCopy={()=>onCopy(p.content,`${msg.id}-${i}`)} copied={copied[`${msg.id}-${i}`]}/>
                  : <MD key={i} text={p.content} tc={t.text} ms={ms}/>
              )}
              {isStreaming && <span className="cursor"/>}
            </>
        }
        {msg.files?.length>0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:8}}>
            {msg.files.map((f,fi)=>(
              <span key={fi} style={{background:`${ac}14`,border:`1px solid ${ac}28`,borderRadius:5,padding:"2px 8px",fontSize:11,color:ac}}>📄 {f.name}</span>
            ))}
          </div>
        )}
      </div>
      {isUser && <span style={{fontSize:10,color:t.muted,marginTop:3}}>{msg.ts}</span>}
    </div>
  );
}

/* ================================================================
   SIDEBAR
================================================================ */
function Sidebar({t,ac,convs,activeId,setActiveId,delConv,newChat,user,plan,setShowSett,setShowUp,tab,setTab}) {
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"10px 8px"}}>
      {/* Logo */}
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"4px 4px 14px"}}>
        <div style={{width:30,height:30,borderRadius:9,background:ac,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 14px ${ac}44`,flexShrink:0}}>
          <span style={{color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800}}>D</span>
        </div>
        <span className="logo" style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,letterSpacing:2}}>DEVIX</span>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:12}}>
        {[{id:"chat",icon:"💬",label:"Chat"},{id:"analyzer",icon:"🔍",label:"Analyzer"}].map(tb=>(
          <button key={tb.id} onClick={()=>setTab(tb.id)}
            style={{flex:1,background:tab===tb.id?`${ac}18`:t.s2,border:`1px solid ${tab===tb.id?`${ac}44`:"transparent"}`,borderRadius:7,padding:"7px 4px",color:tab===tb.id?ac:t.muted,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s"}}>
            {tb.icon} {tb.label}
          </button>
        ))}
      </div>

      {tab==="chat" && <>
        <button onClick={newChat} className="btn"
          style={{background:`${ac}13`,border:`1px solid ${ac}28`,borderRadius:8,padding:"8px 10px",color:ac,fontSize:13,fontWeight:600,marginBottom:10,textAlign:"left",display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:16}}>+</span> New Chat
        </button>
        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:2}}>
          {convs.slice().reverse().map(c=>(
            <div key={c.id} className={`srow${c.id===activeId?" ar":""}`}
              style={{display:"flex",alignItems:"center",padding:"8px 8px",cursor:"pointer",gap:5}}
              onClick={()=>setActiveId(c.id)}>
              <span style={{fontSize:12,color:c.id===activeId?ac:t.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.title}</span>
              <button onClick={e=>{e.stopPropagation();delConv(c.id);}} className="btn"
                style={{background:"none",border:"none",color:t.muted,fontSize:11,padding:"1px 3px",opacity:.4,flexShrink:0}}>✕</button>
            </div>
          ))}
        </div>
      </>}

      {tab==="analyzer" && (
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:"0 4px"}}>
          <div style={{fontSize:32}}>🔍</div>
          <p style={{fontSize:12,color:t.muted,textAlign:"center",lineHeight:1.65}}>Paste or upload your Lua scripts. Devix finds bugs, rewrites and documents them.</p>
        </div>
      )}

      {/* Bottom */}
      <div style={{borderTop:`1px solid ${t.border}`,paddingTop:8,marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
        {plan.id==="basic" && (
          <button onClick={()=>setShowUp(true)} className="btn"
            style={{background:`linear-gradient(135deg,${ac},${ac}99)`,border:"none",borderRadius:8,padding:"8px 10px",color:"#fff",fontSize:12,fontWeight:700,backgroundSize:"200% 200%",animation:"gradSh 4s ease infinite"}}>
            ⚡ Upgrade Plan
          </button>
        )}
        <button onClick={()=>setShowSett(true)} className="btn"
          style={{background:"none",border:`1px solid ${t.border}`,borderRadius:8,padding:"7px 10px",color:t.muted,fontSize:12,textAlign:"left",display:"flex",alignItems:"center",gap:7}}>
          <span>⚙</span>
          <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.username}</span>
          <span style={{fontSize:10,color:plan.color,fontWeight:700}}>{plan.badge}</span>
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   ANALYZER TAB
================================================================ */
function AnalyzerTab({t,ac,user,showToast}) {
  const [script,  setScript]  = useState("");
  const [desc,    setDesc]    = useState("");
  const [result,  setResult]  = useState("");
  const [loading, setLoading] = useState(false);
  const [keyCopied,setKeyCopied] = useState(false);
  const [copied,  setCopied]  = useState({});
  const [history, setHistory] = useState(()=>LS.g(`dvx_az_${user?.username}`,[]).slice(0,15));
  const fileRef = useRef(null);
  const endRef  = useRef(null);
  const abortRef= useRef(null);
  const userKey = user ? getUserKey(user.username) : "";
  const ms = {background:`${ac}15`,borderRadius:4,padding:"1px 6px",fontFamily:"'JetBrains Mono',monospace",fontSize:"0.87em"};

  const copyKey = () => {
    navigator.clipboard?.writeText(userKey);
    setKeyCopied(true); setTimeout(()=>setKeyCopied(false),2500);
    showToast("API key copied!");
  };

  const onCopy = (code,k) => {
    navigator.clipboard?.writeText(code);
    setCopied(p=>({...p,[k]:true}));
    setTimeout(()=>setCopied(p=>({...p,[k]:false})),2000);
    showToast("Copied!");
  };

  const attachFile = async fl => {
    const f=fl[0]; if(!f) return;
    try { setScript(await f.text()); showToast(`Loaded: ${f.name}`); }
    catch { showToast("Could not read file"); }
  };

  const analyze = async () => {
    if (!script.trim()) { showToast("Paste a script first"); return; }
    setLoading(true); setResult("");
    const abort = new AbortController(); abortRef.current = abort;
    const prompt = `${desc.trim()?`User describes the issue: "${desc}"\n\n`:""}Analyze and fix this Roblox Lua script:\n\n\`\`\`lua\n${script}\n\`\`\``;
    try {
      const full = await callAPI("quick",[{role:"user",content:prompt}],SYS_A);
      await streamText(full, partial=>setResult(partial), abort.signal);
      const entry = {id:Date.now(),preview:script.slice(0,80).replace(/\n/g," "),result:full,ts:nowTS()};
      const next = [entry,...history].slice(0,15);
      setHistory(next); LS.s(`dvx_az_${user?.username}`,next);
    } catch(err) { setResult(`⚠️ ${err.message}`); }
    setLoading(false);
  };

  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[result]);

  return (
    <div style={{display:"flex",height:"100%"}}>
      {/* Left – input */}
      <div style={{width:320,flexShrink:0,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",padding:16,gap:11,overflowY:"auto"}}>
        <div>
          <h2 style={{fontSize:15,fontWeight:700,color:t.text,marginBottom:3}}>Script Analyzer</h2>
          <p style={{fontSize:12,color:t.muted,lineHeight:1.6}}>Paste your Lua. Devix will fix bugs, replace deprecated APIs, and add documentation.</p>
        </div>

        {/* API Key box */}
        <div style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:10,padding:11}}>
          <div style={{fontSize:11,color:t.muted,fontWeight:500,marginBottom:5}}>Your API Key</div>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:ac,background:`${ac}10`,borderRadius:6,padding:"6px 9px",marginBottom:7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{userKey}</div>
          <button onClick={copyKey} className="btn"
            style={{background:keyCopied?`#22c55e18`:`${ac}14`,border:`1px solid ${keyCopied?"#22c55e44":`${ac}28`}`,borderRadius:7,padding:"5px 11px",color:keyCopied?"#22c55e":ac,fontSize:11,fontWeight:600,width:"100%"}}>
            {keyCopied?"✓ Copied!":"📋 Copy Key"}
          </button>
        </div>

        {/* Upload */}
        <input ref={fileRef} type="file" accept=".lua,.luau,.txt" style={{display:"none"}} onChange={e=>attachFile(e.target.files)}/>
        <button onClick={()=>fileRef.current?.click()} className="btn"
          style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 12px",color:t.muted,fontSize:12,display:"flex",alignItems:"center",gap:7}}>
          📎 Upload .lua file
        </button>

        {/* Script */}
        <textarea value={script} onChange={e=>setScript(e.target.value)} placeholder="-- Paste your Lua script here…"
          style={{minHeight:150,background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:11,color:t.text,fontSize:12,lineHeight:1.7,resize:"vertical",fontFamily:"'JetBrains Mono',monospace"}}/>

        {/* Description */}
        <input value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Describe the issue (optional)…"
          style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:8,padding:"9px 11px",color:t.text,fontSize:13}}
          onFocus={e=>e.target.style.borderColor=ac} onBlur={e=>e.target.style.borderColor=t.border}/>

        {/* Analyze button */}
        <button onClick={analyze} disabled={loading} className="btn"
          style={{background:loading?t.s2:`linear-gradient(135deg,${ac},${ac}99)`,border:"none",borderRadius:9,padding:"11px",color:loading?t.muted:"#fff",fontSize:13,fontWeight:700,backgroundSize:"200%",animation:loading?"none":"gradSh 4s ease infinite"}}>
          {loading?"Analyzing…":"→ Analyze & Fix"}
        </button>

        {/* History */}
        {history.length>0 && (
          <div style={{borderTop:`1px solid ${t.border}`,paddingTop:10}}>
            <div style={{fontSize:11,color:t.muted,fontWeight:500,marginBottom:6}}>Recent</div>
            {history.slice(0,5).map(h=>(
              <div key={h.id} onClick={()=>setResult(h.result)} className="btn"
                style={{padding:"7px 9px",borderRadius:7,background:t.s2,marginBottom:4,cursor:"pointer",border:`1px solid ${t.border}`}}>
                <div style={{fontSize:11,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.preview}</div>
                <div style={{fontSize:10,color:t.muted,marginTop:2}}>{h.ts}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right – result */}
      <div style={{flex:1,overflowY:"auto",padding:20}}>
        {!result && !loading && (
          <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,opacity:.45}}>
            <div style={{fontSize:44}}>🔍</div>
            <p style={{color:t.muted,fontSize:13,textAlign:"center",lineHeight:1.65}}>Paste a script and click Analyze.<br/>Devix will fix bugs, update deprecated APIs,<br/>and add full documentation.</p>
          </div>
        )}

        {loading && !result && (
          <div style={{display:"flex",alignItems:"center",gap:9,padding:4}}>
            <div style={{width:26,height:26,borderRadius:8,background:ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{color:"#fff",fontSize:12,fontWeight:800,fontFamily:"'Syne',sans-serif"}}>D</span>
            </div>
            <span className="d1" style={{width:5,height:5,borderRadius:"50%",background:ac,display:"inline-block"}}/>
            <span className="d2" style={{width:5,height:5,borderRadius:"50%",background:ac,display:"inline-block"}}/>
            <span className="d3" style={{width:5,height:5,borderRadius:"50%",background:ac,display:"inline-block"}}/>
            <span style={{color:t.muted,fontSize:13}}>Analyzing script…</span>
          </div>
        )}

        {result && (
          <div className="fade" style={{maxWidth:760}}>
            {parseParts(result).map((p,i)=>
              p.type==="code"
                ? <CodeBlock key={i} lang={p.lang} code={p.content} t={t} ac={ac} onCopy={()=>onCopy(p.content,`az-${i}`)} copied={copied[`az-${i}`]}/>
                : <MD key={i} text={p.content} tc={t.text} ms={ms}/>
            )}
            {loading && <span className="cursor"/>}
          </div>
        )}
        <div ref={endRef}/>
      </div>
    </div>
  );
}

/* ================================================================
   UPGRADE MODAL
================================================================ */
function UpgradeModal({t,ac,onClose,user}) {
  const plans = [
    {...PLANS.zeno,  features:["500 messages/month","Zeno deep synthesis","Script Analyzer","Priority queue"],         link:STRIPE.zeno  },
    {...PLANS.ultra, features:["Unlimited messages","Zeno deep synthesis","Script Analyzer","Fastest priority","All future features"], link:STRIPE.ultra },
  ];

  const buy = (link,id) => {
    if (!link||link==="#setup-stripe") {
      alert("Stripe not configured.\nAdd VITE_STRIPE_ZENO_LINK and VITE_STRIPE_ULTRA_LINK to your Vercel env vars.\nSee the README for setup steps.");
      return;
    }
    try {
      const u = new URL(link);
      u.searchParams.set("client_reference_id", user?.username||"guest");
      window.open(u.toString(),"_blank");
    } catch { window.open(link,"_blank"); }
  };

  return (
    <div className="fade" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="scl" style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:18,padding:26,maxWidth:520,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
          <div>
            <h2 style={{fontSize:18,fontWeight:800,color:t.text}}>Upgrade Devix</h2>
            <p style={{color:t.muted,fontSize:13,marginTop:3}}>Unlock Zeno synthesis and unlimited messages</p>
          </div>
          <button onClick={onClose} className="btn" style={{background:"none",border:`1px solid ${t.border}`,borderRadius:8,padding:"5px 9px",color:t.muted,fontSize:14}}>✕</button>
        </div>

        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          {plans.map(p=>(
            <div key={p.id} style={{flex:"1 1 200px",background:t.s2,border:`1px solid ${p.id==="ultra"?ac:t.border}`,borderRadius:13,padding:18,position:"relative"}}>
              {p.id==="ultra" && <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",background:ac,color:"#fff",fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20}}>BEST VALUE</div>}
              <div style={{fontSize:12,color:p.color,fontWeight:700,marginBottom:4}}>{p.badge} {p.name}</div>
              <div style={{fontSize:26,fontWeight:800,color:t.text,marginBottom:12}}>{p.price}</div>
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:16}}>
                {p.features.map(f=>(
                  <div key={f} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:t.muted}}>
                    <span style={{color:"#22c55e",fontSize:11}}>✓</span> {f}
                  </div>
                ))}
              </div>
              <button onClick={()=>buy(p.link,p.id)} className="btn"
                style={{background:p.id==="ultra"?`linear-gradient(135deg,${ac},${ac}99)`:t.surface,border:`1px solid ${p.id==="ultra"?ac:t.border}`,borderRadius:9,padding:"10px",color:p.id==="ultra"?"#fff":t.text,fontSize:13,fontWeight:700,width:"100%",backgroundSize:"200%",animation:p.id==="ultra"?"gradSh 4s ease infinite":"none"}}>
                Get {p.name} →
              </button>
            </div>
          ))}
        </div>

        <p style={{color:t.muted,fontSize:11,textAlign:"center",marginTop:14,lineHeight:1.6}}>
          Powered by Stripe. After checkout you're redirected back and your plan upgrades automatically.
        </p>
      </div>
    </div>
  );
}

/* ================================================================
   SETTINGS PANEL
================================================================ */
function SettingsPanel({t,ac,theme,setTheme,fontKey,setFontKey,accent,setAccent,onLogout,onClose,user,plan,applyOwnerKey,showToast}) {
  const [ownerInp,setOwnerInp] = useState("");
  const [kc,setKc] = useState(false);
  const userKey = user ? getUserKey(user.username) : "";

  const copyKey = () => {
    navigator.clipboard?.writeText(userKey);
    setKc(true); setTimeout(()=>setKc(false),2500); showToast("API key copied!");
  };

  return (
    <div className="fade" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="scl" style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:18,padding:22,maxWidth:380,width:"100%",maxHeight:"90dvh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h2 style={{fontSize:15,fontWeight:700,color:t.text}}>Settings</h2>
          <button onClick={onClose} className="btn" style={{background:"none",border:`1px solid ${t.border}`,borderRadius:7,padding:"4px 8px",color:t.muted}}>✕</button>
        </div>

        {/* User */}
        <div style={{background:t.s2,borderRadius:11,padding:13,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:600,fontSize:14,color:t.text}}>{user?.username}</div>
              <div style={{fontSize:12,color:plan.color,fontWeight:600,marginTop:2}}>{plan.badge} {plan.name} · {plan.price}</div>
            </div>
            <button onClick={onLogout} className="btn"
              style={{background:"none",border:`1px solid ${t.border}`,borderRadius:8,padding:"6px 11px",color:t.muted,fontSize:12}}>Sign Out</button>
          </div>
        </div>

        {/* API Key */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:t.muted,fontWeight:600,display:"block",marginBottom:7}}>API Key</label>
          <div style={{background:t.s2,borderRadius:8,padding:"8px 11px",fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:ac,marginBottom:7,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{userKey}</div>
          <button onClick={copyKey} className="btn"
            style={{background:kc?`#22c55e18`:`${ac}14`,border:`1px solid ${kc?"#22c55e44":`${ac}28`}`,borderRadius:8,padding:"7px 13px",color:kc?"#22c55e":ac,fontSize:12,fontWeight:600,width:"100%"}}>
            {kc?"✓ Copied!":"📋 Copy Key"}
          </button>
        </div>

        {/* Theme */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:t.muted,fontWeight:600,display:"block",marginBottom:7}}>Theme</label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {Object.entries(THEMES).map(([k,v])=>(
              <button key={k} onClick={()=>setTheme(k)} className="btn"
                style={{background:v.surface,border:`1px solid ${theme===k?ac:t.border}`,borderRadius:8,padding:"8px",color:v.text,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:11,height:11,borderRadius:"50%",background:v.accent,display:"inline-block",flexShrink:0}}/>
                {v.name}
              </button>
            ))}
          </div>
        </div>

        {/* Font */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:t.muted,fontWeight:600,display:"block",marginBottom:7}}>Font</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {Object.entries(FONTS).map(([k,v])=>(
              <button key={k} onClick={()=>setFontKey(k)} className="btn"
                style={{background:fontKey===k?`${ac}18`:t.s2,border:`1px solid ${fontKey===k?ac:t.border}`,borderRadius:7,padding:"6px 11px",color:fontKey===k?ac:t.muted,fontSize:12,fontFamily:v.fam}}>
                {v.name}
              </button>
            ))}
          </div>
        </div>

        {/* Accent */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,color:t.muted,fontWeight:600,display:"block",marginBottom:7}}>Accent</label>
          <div style={{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap"}}>
            {["#e03a3e","#6366f1","#22d3ee","#22c55e","#f59e0b","#ec4899","#a78bfa"].map(c=>(
              <button key={c} onClick={()=>setAccent(c)} className="btn"
                style={{width:24,height:24,borderRadius:"50%",background:c,border:`2px solid ${accent===c?"#fff":"transparent"}`,padding:0}}/>
            ))}
            <input type="color" value={accent||ac} onChange={e=>setAccent(e.target.value)}
              style={{width:24,height:24,borderRadius:"50%",border:`1px solid ${t.border}`,padding:0,cursor:"pointer",background:"none"}}/>
          </div>
        </div>

        {/* Owner key */}
        {plan.id!=="owner" && (
          <div style={{borderTop:`1px solid ${t.border}`,paddingTop:12}}>
            <label style={{fontSize:12,color:t.muted,fontWeight:600,display:"block",marginBottom:7}}>Owner Key</label>
            <div style={{display:"flex",gap:6}}>
              <input value={ownerInp} onChange={e=>setOwnerInp(e.target.value)} placeholder="Enter owner key"
                style={{flex:1,background:t.s2,border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 11px",color:t.text,fontSize:13}}/>
              <button onClick={()=>{ if(!applyOwnerKey(ownerInp)) showToast("Invalid key"); else onClose(); }} className="btn"
                style={{background:`${ac}18`,border:`1px solid ${ac}30`,borderRadius:8,padding:"8px 13px",color:ac,fontSize:13,fontWeight:600}}>
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   ROOT
================================================================ */
export default function DevixApp() {
  const [page,      setPage]      = useState("loading");
  const [isSignup,  setIsSignup]  = useState(false);
  const [form,      setForm]      = useState({username:"",password:""});
  const [loginErr,  setLoginErr]  = useState("");
  const [user,      setUser]      = useState(null);
  const [theme,     setTheme]     = useState("dark");
  const [fontKey,   setFontKey]   = useState("inter");
  const [accent,    setAccent]    = useState("");
  const [convs,     setConvs]     = useState([{id:1,title:"New Chat",messages:[]}]);
  const [activeId,  setActiveId]  = useState(1);
  const [input,     setInput]     = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [files,     setFiles]     = useState([]);
  const [mode,      setMode]      = useState("quick");
  const [showSett,  setShowSett]  = useState(false);
  const [showUp,    setShowUp]    = useState(false);
  const [sideOpen,  setSideOpen]  = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [copied,    setCopied]    = useState({});
  const [toast,     setToast]     = useState(null);
  const [tab,       setTab]       = useState("chat");

  const endRef  = useRef(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);
  const abortRef= useRef(null);

  const t    = THEMES[theme];
  const font = FONTS[fontKey];
  const ac   = accent || t.accent;
  const css  = makeCSS(t,ac,font.fam,font.gUrl);
  const plan = PLANS[user?.plan||"basic"];
  const conv = convs.find(c=>c.id===activeId);
  const msgs = conv?.messages||[];

  // ── Init: restore session + handle Stripe redirect ────────────
  useEffect(()=>{
    const params   = new URLSearchParams(window.location.search);
    const upgraded = params.get("upgraded");
    const s = LS.g("devix_session");
    if (s?.username) {
      let p = s.plan||"basic";
      if (upgraded==="zeno"  && p==="basic") p="zeno";
      if (upgraded==="ultra")                p="ultra";
      if (upgraded) {
        const users = LS.g("devix_users",{});
        const k = s.username.toLowerCase();
        if (users[k]) { users[k].plan=p; LS.s("devix_users",users); }
        const upd = {...s,plan:p};
        setUser(upd); LS.s("devix_session",upd);
        window.history.replaceState({},"","/");
      } else { setUser(s); }
      const pr = LS.g("devix_prefs",{});
      if (pr.theme)  setTheme(pr.theme);
      if (pr.font)   setFontKey(pr.font);
      if (pr.accent) setAccent(pr.accent);
      setPage("chat");
    } else { setPage("login"); }
  },[]);

  useEffect(()=>{ if(tab==="chat") endRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,isLoading,tab]);
  useEffect(()=>{ if(user) LS.s("devix_prefs",{theme,font:fontKey,accent}); },[theme,fontKey,accent,user]);

  const showToast = useCallback((msg,dur=3000)=>{ setToast(msg); setTimeout(()=>setToast(null),dur); },[]);

  // ── Auth ──────────────────────────────────────────────────────
  const doAuth = () => {
    const uname = form.username.trim(); const pass = form.password;
    if (!uname||!pass) { setLoginErr("Fill in all fields"); return; }
    const users = LS.g("devix_users",{}); const key = uname.toLowerCase();
    if (isSignup) {
      if (users[key]) { setLoginErr("Username taken"); return; }
      users[key] = {username:uname,password:pass,plan:"basic"};
      LS.s("devix_users",users);
      getUserKey(uname); // generate on signup
      const u = {username:uname,plan:"basic"};
      setUser(u); LS.s("devix_session",u); setPage("chat"); showToast(`Welcome, ${uname}! ⚡`);
    } else {
      const rec = users[key];
      if (!rec)             { setLoginErr("Account not found"); return; }
      if (rec.password!==pass){ setLoginErr("Wrong password");  return; }
      const u = {username:rec.username,plan:rec.plan||"basic"};
      setUser(u); LS.s("devix_session",u); setPage("chat"); showToast(`Welcome back, ${rec.username}!`);
    }
  };

  const doLogout = ()=>{ LS.d("devix_session"); setUser(null); setPage("login"); setForm({username:"",password:""}); setShowSett(false); };

  const applyOwnerKey = k => {
    if (k!==OWNER_KEY||!user) return false;
    const upd = {...user,plan:"owner"};
    const users=LS.g("devix_users",{}); const uk=user.username.toLowerCase();
    if (users[uk]) { users[uk].plan="owner"; LS.s("devix_users",users); }
    setUser(upd); LS.s("devix_session",upd); showToast("👑 Owner access unlocked!"); return true;
  };

  // ── Conversations ─────────────────────────────────────────────
  const patchConv = useCallback((id,fn)=>setConvs(prev=>prev.map(c=>c.id===id?fn(c):c)),[]);

  const newChat = ()=>{ const id=Date.now(); setConvs(p=>[...p,{id,title:"New Chat",messages:[]}]); setActiveId(id); setMobileNav(false); setTab("chat"); };

  const delConv = id => {
    const nxt = convs.filter(c=>c.id!==id); if(!nxt.length) return;
    setConvs(nxt); if(activeId===id) setActiveId(nxt[nxt.length-1].id);
  };

  // ── Send ──────────────────────────────────────────────────────
  const doSend = async () => {
    if ((!input.trim()&&!files.length)||isLoading) return;
    const uMsg = {id:Date.now(),role:"user",content:input,files:[...files],ts:nowTS()};
    const next = [...msgs,uMsg];
    patchConv(activeId,c=>({...c,messages:next}));
    if (msgs.length===0&&input.trim()) patchConv(activeId,c=>({...c,title:input.trim().slice(0,38)+(input.length>38?"…":"")}));
    setInput(""); setFiles([]); setIsLoading(true);
    if (textRef.current) textRef.current.style.height="auto";

    const apiMsgs = next.map(m=>({role:m.role,content:m.content+(m.files?.length?"\n\n[Attached]\n"+m.files.map(f=>`--- ${f.name} ---\n${f.content||"[binary]"}`).join("\n\n"):"")}));
    const aiId = Date.now()+1;
    patchConv(activeId,c=>({...c,messages:[...next,{id:aiId,role:"assistant",content:"",mode,ts:nowTS(),streaming:true}]}));

    const abort = new AbortController(); abortRef.current = abort;
    try {
      const full = await callAPI(mode,apiMsgs);
      await streamText(full,partial=>{
        patchConv(activeId,c=>({...c,messages:c.messages.map(m=>m.id===aiId?{...m,content:partial,streaming:true}:m)}));
      },abort.signal);
      patchConv(activeId,c=>({...c,messages:c.messages.map(m=>m.id===aiId?{...m,content:full,streaming:false}:m)}));
    } catch(err) {
      patchConv(activeId,c=>({...c,messages:c.messages.map(m=>m.id===aiId?{...m,content:`⚠️ ${err.message}`,streaming:false}:m)}));
    }
    setIsLoading(false); abortRef.current=null;
  };

  const attachFiles = async fl => {
    const arr=[];
    for (const f of Array.from(fl)) { try { arr.push({name:f.name,content:await f.text()}); } catch { arr.push({name:f.name,content:"[binary]"}); } }
    setFiles(p=>[...p,...arr]); showToast(`${arr.length} file${arr.length>1?"s":""} attached`);
  };

  const onCopy = (code,key) => {
    navigator.clipboard?.writeText(code);
    setCopied(p=>({...p,[key]:true}));
    setTimeout(()=>setCopied(p=>({...p,[key]:false})),2000);
    showToast("Copied!");
  };

  // ── Loading ───────────────────────────────────────────────────
  if (page==="loading") return (
    <><style>{css}</style>
    <div style={{height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:t.bg}}>
      <div style={{width:44,height:44,borderRadius:13,background:ac,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse 1.4s ease infinite"}}>
        <span style={{color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>D</span>
      </div>
    </div></>
  );

  // ── Login ─────────────────────────────────────────────────────
  if (page==="login") return (
    <><style>{css}</style>
    <div style={{minHeight:"100dvh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${t.border} 1px,transparent 1px),linear-gradient(90deg,${t.border} 1px,transparent 1px)`,backgroundSize:"48px 48px",opacity:.22,pointerEvents:"none"}}/>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 70% 50% at 50% 0%,${ac}20,transparent 70%)`,pointerEvents:"none"}}/>

      <div style={{width:"100%",maxWidth:840,zIndex:1,display:"flex",gap:22,flexWrap:"wrap",justifyContent:"center",alignItems:"flex-start",paddingTop:20}}>
        {/* Auth */}
        <div className="up" style={{flex:"0 0 310px",maxWidth:330}}>
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:7}}>
              <div style={{width:36,height:36,borderRadius:11,background:ac,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 8px 24px ${ac}44`,flexShrink:0}}>
                <span style={{color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:800}}>D</span>
              </div>
              <span className="logo" style={{fontFamily:"'Syne',sans-serif",fontSize:26,fontWeight:800,letterSpacing:3}}>DEVIX</span>
            </div>
            <p style={{color:t.muted,fontSize:13,lineHeight:1.7}}>AI-powered Roblox Studio assistant.<br/>Build faster. Ship better.</p>
          </div>

          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:20}}>
            <div style={{display:"flex",background:t.s2,borderRadius:9,padding:3,marginBottom:15}}>
              {["Sign In","Sign Up"].map((lb,i)=>(
                <button key={lb} onClick={()=>{setIsSignup(i===1);setLoginErr("");}} className="btn"
                  style={{flex:1,padding:"7px 0",borderRadius:7,border:"none",background:isSignup===(i===1)?ac:"transparent",color:isSignup===(i===1)?"#fff":t.muted,fontSize:13,fontWeight:600,transition:"all .18s"}}>
                  {lb}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {["Username","Password"].map((ph,i)=>(
                <input key={ph} type={i===1?"password":"text"} placeholder={ph}
                  value={i===0?form.username:form.password}
                  onChange={e=>setForm(p=>({...p,[i===0?"username":"password"]:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&doAuth()}
                  style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:"11px 13px",color:t.text,fontSize:14,width:"100%"}}
                  onFocus={e=>e.target.style.borderColor=ac} onBlur={e=>e.target.style.borderColor=t.border}/>
              ))}
              {loginErr && <p style={{color:"#ef4444",fontSize:12,textAlign:"center"}}>{loginErr}</p>}
              <button onClick={doAuth} className="btn"
                style={{background:`linear-gradient(135deg,${ac},${ac}99)`,border:"none",borderRadius:9,padding:12,color:"#fff",fontSize:14,fontWeight:700,marginTop:2,boxShadow:`0 4px 18px ${ac}3a`,backgroundSize:"200% 200%",animation:"gradSh 4s ease infinite"}}>
                {isSignup?"Create Account →":"Sign In →"}
              </button>
            </div>
          </div>
        </div>

        {/* Feature cards */}
        <div style={{display:"flex",flexDirection:"column",gap:8,flex:"1 1 200px",maxWidth:370}}>
          {[
            {icon:"⚡",title:"Zenith Mode",   color:"#e03a3e",desc:"Models race in real-time — fastest correct answer wins."},
            {icon:"🌟",title:"Zeno Mode",      color:"#6366f1",desc:"All models run in parallel and synthesize one perfect answer."},
            {icon:"🔍",title:"Script Analyzer",color:"#22d3ee",desc:"Paste Lua — Devix fixes bugs, updates APIs and adds docs."},
            {icon:"📎",title:"File Attach",    color:"#f59e0b",desc:"Drop .lua scripts into chat for live debugging and review."},
          ].map((c,i)=>(
            <div key={c.title} className="up" style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:11,padding:"12px 14px",display:"flex",gap:11,alignItems:"flex-start",animationDelay:`${i*.07}s`}}>
              <div style={{width:31,height:31,borderRadius:9,background:`${c.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{c.icon}</div>
              <div>
                <div style={{color:t.text,fontWeight:600,fontSize:13,marginBottom:2}}>{c.title}</div>
                <div style={{color:t.muted,fontSize:12,lineHeight:1.55}}>{c.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div></>
  );

  // ── Main ──────────────────────────────────────────────────────
  return (
    <><style>{css}</style>

    {/* Toast */}
    {toast && (
      <div className="up" style={{position:"fixed",bottom:22,left:"50%",transform:"translateX(-50%)",background:t.surface,border:`1px solid ${t.border}`,borderRadius:9,padding:"9px 16px",fontSize:13,color:t.text,zIndex:999,boxShadow:"0 8px 28px rgba(0,0,0,.3)",whiteSpace:"nowrap"}}>
        {toast}
      </div>
    )}

    {showSett && <SettingsPanel t={t} ac={ac} theme={theme} setTheme={setTheme} fontKey={fontKey} setFontKey={setFontKey} accent={accent} setAccent={setAccent} onLogout={doLogout} onClose={()=>setShowSett(false)} user={user} plan={plan} applyOwnerKey={applyOwnerKey} showToast={showToast}/>}
    {showUp   && <UpgradeModal t={t} ac={ac} onClose={()=>setShowUp(false)} user={user}/>}

    <div style={{height:"100dvh",display:"flex",background:t.bg,overflow:"hidden"}}>

      {/* Desktop sidebar */}
      {sideOpen && (
        <aside className="dt slL" style={{width:216,background:t.surface,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
          <Sidebar t={t} ac={ac} convs={convs} activeId={activeId} setActiveId={setActiveId} delConv={delConv} newChat={newChat} user={user} plan={plan} setShowSett={setShowSett} setShowUp={setShowUp} tab={tab} setTab={setTab}/>
        </aside>
      )}

      {/* Mobile nav overlay */}
      {mobileNav && (
        <div className="mb fade" onClick={()=>setMobileNav(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.76)",zIndex:200}}>
          <div className="up" onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:0,left:0,right:0,height:"78dvh",background:t.surface,borderRadius:"16px 16px 0 0",borderTop:`1px solid ${t.border}`,display:"flex",flexDirection:"column"}}>
            <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"9px auto"}}/>
            <Sidebar t={t} ac={ac} convs={convs} activeId={activeId} setActiveId={id=>{setActiveId(id);setMobileNav(false);}} delConv={delConv} newChat={newChat} user={user} plan={plan} setShowSett={setShowSett} setShowUp={setShowUp} tab={tab} setTab={setTab}/>
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

        {/* Header */}
        <header style={{height:48,padding:"0 12px",borderBottom:`1px solid ${t.border}`,background:t.surface,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <button onClick={()=>window.innerWidth<769?setMobileNav(p=>!p):setSideOpen(p=>!p)} className="btn"
            style={{background:"none",border:`1px solid ${t.border}`,borderRadius:7,padding:"5px 8px",color:t.muted,fontSize:14,flexShrink:0}}>☰</button>

          <div style={{flex:1,overflow:"hidden"}}>
            <span style={{fontSize:13,color:t.muted,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {tab==="analyzer"?"🔍 Script Analyzer":conv?.title||"New Chat"}
            </span>
          </div>

          {tab==="chat" && (
            <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
              <div style={{display:"flex",background:t.s2,borderRadius:8,padding:3,gap:3}}>
                {[
                  {id:"quick",label:"Zenith",icon:"⚡",color:"#e03a3e"},
                  {id:"deep", label:"Zeno",  icon:"🌟",color:"#6366f1",locked:!plan.zeno},
                ].map(m=>(
                  <button key={m.id} onClick={()=>{ if(m.locked){setShowUp(true);return;} setMode(m.id); }} className="btn"
                    style={{background:mode===m.id?`${m.color}1a`:t.s2,border:mode===m.id?`1px solid ${m.color}40`:`1px solid transparent`,borderRadius:6,padding:"4px 9px",color:mode===m.id?m.color:t.muted,fontSize:11,fontWeight:600,display:"flex",alignItems:"center",gap:4,opacity:m.locked?.55:1}}>
                    {m.icon} <span className="dt">{m.label}</span>{m.locked&&<span style={{fontSize:9}}>🔒</span>}
                  </button>
                ))}
              </div>
              {plan.id==="basic" && (
                <button onClick={()=>setShowUp(true)} className="btn"
                  style={{background:`${ac}14`,border:`1px solid ${ac}28`,borderRadius:7,padding:"4px 10px",color:ac,fontSize:11,fontWeight:700}}>
                  ⚡ Upgrade
                </button>
              )}
            </div>
          )}
        </header>

        {/* Body */}
        {tab==="analyzer"
          ? <div style={{flex:1,overflow:"hidden"}}><AnalyzerTab t={t} ac={ac} user={user} plan={plan} showToast={showToast}/></div>
          : <>
              {/* Messages */}
              <div style={{flex:1,overflowY:"auto",padding:"14px 0"}}>
                {msgs.length===0 ? (
                  <div className="fade" style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",padding:24,gap:18}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{width:50,height:50,borderRadius:14,background:ac,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 11px",boxShadow:`0 10px 32px ${ac}44`}} className="float">
                        <span style={{color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:23,fontWeight:800}}>D</span>
                      </div>
                      <h1 style={{fontSize:19,fontWeight:800,color:t.text,fontFamily:"'Syne',sans-serif",marginBottom:4}}>Devix AI</h1>
                      <p style={{color:t.muted,fontSize:13}}>What are we building today?</p>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:7,width:"100%",maxWidth:540}}>
                      {QA.map(q=>(
                        <button key={q.label} onClick={()=>{ setInput(q.prompt); textRef.current?.focus(); }} className="btn"
                          style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:"10px 12px",color:t.text,fontSize:12,fontWeight:500,textAlign:"left",display:"flex",alignItems:"center",gap:7}}>
                          <span style={{fontSize:16}}>{q.icon}</span>{q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{maxWidth:740,margin:"0 auto",padding:"0 14px",display:"flex",flexDirection:"column",gap:10}}>
                    {msgs.map(m=>(
                      <Message key={m.id} msg={m} t={t} ac={ac} isStreaming={m.streaming} onCopy={onCopy} copied={copied}/>
                    ))}
                    {isLoading && msgs[msgs.length-1]?.role!=="assistant" && (
                      <div className="up" style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:22,height:22,borderRadius:7,background:ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <span style={{color:"#fff",fontSize:11,fontWeight:800,fontFamily:"'Syne',sans-serif"}}>D</span>
                        </div>
                        <span className="d1" style={{width:5,height:5,borderRadius:"50%",background:ac,display:"inline-block"}}/>
                        <span className="d2" style={{width:5,height:5,borderRadius:"50%",background:ac,display:"inline-block"}}/>
                        <span className="d3" style={{width:5,height:5,borderRadius:"50%",background:ac,display:"inline-block"}}/>
                        <span style={{color:t.muted,fontSize:12}}>{mode==="deep"?"Synthesizing…":"Thinking…"}</span>
                      </div>
                    )}
                    <div ref={endRef}/>
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div style={{borderTop:`1px solid ${t.border}`,padding:"10px 14px 12px",background:t.surface,flexShrink:0}}>
                {files.length>0 && (
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                    {files.map((f,i)=>(
                      <span key={i} style={{background:`${ac}13`,border:`1px solid ${ac}28`,borderRadius:6,padding:"3px 9px",fontSize:11,color:ac,display:"flex",alignItems:"center",gap:5}}>
                        📄 {f.name}
                        <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:t.muted,fontSize:10,padding:0,cursor:"pointer"}}>✕</button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="ibox" style={{display:"flex",alignItems:"flex-end",gap:7,background:t.s2,border:`1px solid ${t.border}`,borderRadius:12,padding:"8px 10px"}}>
                  <input ref={fileRef} type="file" accept=".lua,.luau,.rbxl,.rbxlx,.txt,.json,.md,.csv" multiple style={{display:"none"}} onChange={e=>attachFiles(e.target.files)}/>
                  <button onClick={()=>fileRef.current?.click()} className="btn"
                    style={{background:"none",border:"none",color:t.muted,fontSize:20,padding:"1px 4px",flexShrink:0,lineHeight:1,marginBottom:1}}>+</button>

                  <textarea ref={textRef} value={input}
                    onChange={e=>{ setInput(e.target.value); e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,180)+"px"; }}
                    onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); doSend(); } }}
                    placeholder="Ask Devix anything…" rows={1}
                    style={{flex:1,background:"none",border:"none",color:t.text,fontSize:14,resize:"none",lineHeight:1.6,maxHeight:180,overflow:"auto",padding:"2px 0"}}/>

                  <button onClick={doSend} disabled={isLoading||(!input.trim()&&!files.length)} className="btn"
                    style={{background:(isLoading||(!input.trim()&&!files.length))?t.border:ac,border:"none",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,flexShrink:0,transition:"background .15s"}}>
                    {isLoading?<span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:12}}>⟳</span>:"↑"}
                  </button>
                </div>
                <p style={{textAlign:"center",color:t.muted,fontSize:10,marginTop:6}}>Devix can make mistakes. Verify important code.</p>
              </div>
            </>
        }
      </div>
    </div>
    </>
  );
}
