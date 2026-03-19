import { useState, useRef, useEffect, useCallback } from "react";

/* ================================================================
   DEVIX AI v3
   • Streaming simulation (word-by-word reveal + blinking cursor)
   • Full markdown: **bold** *italic* `code` ## headers - lists
   • Game Wizard → generates .rbxlx you can open in Roblox Studio
   • File attachment via + button
   • Subscription plans (Basic / Pro / Ultra / Owner)
   • Font picker, theme picker, accent color
================================================================ */

const API_URL   = "/api/chat";
const OWNER_KEY = "sullyz";

// ── PLANS ───────────────────────────────────────────────────────
const PLANS = {
  basic: { id:"basic", name:"Basic",  badge:"◆", color:"#6b7280", price:"Free",      msgLimit:30,   wizard:false, zeno:false  },
  pro:   { id:"pro",   name:"Pro",    badge:"⚡", color:"#3b82f6", price:"$4.99/mo",  msgLimit:500,  wizard:true,  zeno:true   },
  ultra: { id:"ultra", name:"Ultra",  badge:"★",  color:"#e03a3e", price:"$14.99/mo", msgLimit:9999, wizard:true,  zeno:true   },
  owner: { id:"owner", name:"Owner",  badge:"👑", color:"#f59e0b", price:"∞",         msgLimit:9999, wizard:true,  zeno:true   },
};

// ── THEMES ──────────────────────────────────────────────────────
const THEMES = {
  dark:   { name:"Dark",   bg:"#0a0a0a", surface:"#111111", s2:"#1a1a1a", border:"#252525", text:"#f0f0f0", muted:"#555555", accent:"#e03a3e", glow:"rgba(224,58,62,.2)"   },
  light:  { name:"Light",  bg:"#f8f8f8", surface:"#ffffff",  s2:"#f0f0f0", border:"#e0e0e0", text:"#0a0a0a", muted:"#909090", accent:"#e03a3e", glow:"rgba(224,58,62,.15)"  },
  slate:  { name:"Slate",  bg:"#0d1117", surface:"#161b22",  s2:"#21262d", border:"#30363d", text:"#e6edf3", muted:"#656d76", accent:"#58a6ff", glow:"rgba(88,166,255,.2)"  },
  carbon: { name:"Carbon", bg:"#070707", surface:"#0f0f0f",  s2:"#161616", border:"#1e1e1e", text:"#d4d4d4", muted:"#444444", accent:"#22d3ee", glow:"rgba(34,211,238,.2)"  },
};

// ── FONTS ────────────────────────────────────────────────────────
const FONTS = {
  dm:    { name:"DM Sans",    gUrl:"DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,400",  fam:"'DM Sans',sans-serif"           },
  syne:  { name:"Syne",       gUrl:"Syne:wght@400;600;700;800",                             fam:"'Syne',sans-serif"              },
  inter: { name:"Inter",      gUrl:"Inter:wght@300;400;500;600;700",                        fam:"'Inter',sans-serif"             },
  arial: { name:"Arial",      gUrl:null,                                                    fam:"Arial,Helvetica,sans-serif"     },
  mono:  { name:"Mono",       gUrl:"JetBrains+Mono:wght@300;400;500;700",                   fam:"'JetBrains Mono',monospace"     },
};

// ── MODELS ──────────────────────────────────────────────────────
const AI_MODELS = {
  zenith: { id:"zenith", name:"Devix Zenith", sub:"Race · Fastest wins",        color:"#e03a3e", icon:"⚡", badge:"ZENITH" },
  zeno:   { id:"zeno",   name:"Devix Zeno",   sub:"Synthesis · All models",     color:"#a78bfa", icon:"🌟", badge:"ZENO"   },
};

// ── QUICK ACTIONS ────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon:"⚔️",  label:"Combat",      prompt:"Build a complete combat system with hitboxes, damage, animations and effects" },
  { icon:"💾",  label:"DataStore",   prompt:"Create a robust DataStore save/load system with retry logic and error handling" },
  { icon:"🗺️",  label:"Terrain",     prompt:"Generate procedural terrain with multiple biomes using the Roblox Terrain API" },
  { icon:"🎒",  label:"Inventory",   prompt:"Build a full inventory system with drag-and-drop GUI and item management" },
  { icon:"🛡️",  label:"Admin",       prompt:"Create an admin system with rank-based permissions and commands" },
  { icon:"🏆",  label:"Leaderboard", prompt:"Build a persistent leaderboard with DataStore and live updates" },
  { icon:"💰",  label:"Shop",        prompt:"Create an in-game shop with currency, gamepasses and purchase UI" },
  { icon:"🤖",  label:"AI NPC",      prompt:"Build an NPC with pathfinding, states (patrol/chase/attack) and combat AI" },
];

// ── SYSTEM PROMPTS ───────────────────────────────────────────────
const BASE = `You are Devix — an expert AI for Roblox Studio development. You are NOT Claude or any known AI.
EXPERTISE: Luau, Roblox Studio architecture, DataStore, TweenService, RemoteEvents, RunService, game systems.
CODE RULES: Always Luau. task.wait() not wait(). task.spawn() not spawn(). Type annotations. All code in \`\`\`lua blocks. Complete scripts, zero placeholders. Clear comments.
FORMAT: Use **bold** for key terms, ## for section headers, - for lists, \`inline code\` for API names.
HARD RULES: No NSFW, no exploit scripts, no crash tools.`;
const SYS_Q = BASE + "\nMODE: Quick. Be concise and direct. Fast answers.";
const SYS_D = BASE + "\nMODE: Deep. Be comprehensive. Full architecture. Complete optimized code. Cover edge cases.";

// ── STORAGE ──────────────────────────────────────────────────────
const LS = {
  g: (k, d=null) => { try { return JSON.parse(localStorage.getItem(k) ?? "null") ?? d; } catch { return d; } },
  s: (k, v)      => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  d: (k)         => { try { localStorage.removeItem(k); } catch {} },
};

// ── STREAMING ────────────────────────────────────────────────────
async function streamText(text, onUpdate, signal) {
  // Split by words + whitespace, preserving tokens
  const tokens = text.split(/(\s+)/);
  let out = "";
  for (const tok of tokens) {
    if (signal?.aborted) break;
    out += tok;
    onUpdate(out);
    await new Promise(r => setTimeout(r, 10 + Math.random() * 16));
  }
  onUpdate(text); // guarantee full text
}

// ── MARKDOWN INLINE RENDERER ─────────────────────────────────────
function inlineRender(text, monoStyle, seed="") {
  const re = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;
  const out = [];
  let last = 0, m, n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[0].startsWith("**"))
      out.push(<strong key={seed+n++} style={{fontWeight:700}}>{m[2]}</strong>);
    else if (m[0].startsWith("*"))
      out.push(<em key={seed+n++} style={{fontStyle:"italic"}}>{m[3]}</em>);
    else
      out.push(<code key={seed+n++} style={monoStyle}>{m[4]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function MarkdownBlock({ text, textColor, monoStyle }) {
  if (!text) return null;
  const lines  = text.split("\n");
  const result = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    // Headers
    if (/^#{1,3} /.test(ln)) {
      const lvl = ln.match(/^(#{1,3}) /)[1].length;
      const sizes = [18, 15, 13];
      const weights = [800, 700, 700];
      result.push(
        <div key={i} style={{fontSize:sizes[lvl-1], fontWeight:weights[lvl-1], color:textColor, margin:"12px 0 5px", lineHeight:1.3}}>
          {inlineRender(ln.slice(lvl+1), monoStyle, `h${i}`)}
        </div>
      );
    }
    // Bullet list — collect run
    else if (/^[-•*] /.test(ln)) {
      const items = [];
      while (i < lines.length && /^[-•*] /.test(lines[i])) {
        items.push(
          <li key={i} style={{marginBottom:3, lineHeight:1.65}}>
            {inlineRender(lines[i].slice(2), monoStyle, `li${i}`)}
          </li>
        );
        i++;
      }
      result.push(<ul key={`ul${i}`} style={{paddingLeft:18, margin:"6px 0", color:textColor, fontSize:14}}>{items}</ul>);
      continue;
    }
    // Numbered list
    else if (/^\d+\. /.test(ln)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(
          <li key={i} style={{marginBottom:3, lineHeight:1.65}}>
            {inlineRender(lines[i].replace(/^\d+\. /, ""), monoStyle, `ol${i}`)}
          </li>
        );
        i++;
      }
      result.push(<ol key={`ol${i}`} style={{paddingLeft:18, margin:"6px 0", color:textColor, fontSize:14}}>{items}</ol>);
      continue;
    }
    // Divider
    else if (/^-{3,}$/.test(ln.trim())) {
      result.push(<hr key={i} style={{border:"none", borderTop:"1px solid rgba(128,128,128,.2)", margin:"10px 0"}}/>);
    }
    // Blank
    else if (ln.trim() === "") {
      result.push(<div key={i} style={{height:5}}/>);
    }
    // Normal paragraph
    else {
      result.push(
        <p key={i} style={{margin:"2px 0", lineHeight:1.75, color:textColor, fontSize:14, wordBreak:"break-word"}}>
          {inlineRender(ln, monoStyle, `p${i}`)}
        </p>
      );
    }
    i++;
  }
  return <>{result}</>;
}

// ── CODE BLOCK PARSER ────────────────────────────────────────────
function parseParts(content) {
  const parts = [];
  const re    = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type:"text", content:content.slice(last, m.index) });
    parts.push({ type:"code", lang:m[1]||"lua", content:m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type:"text", content:content.slice(last) });
  return parts;
}

// ── API ──────────────────────────────────────────────────────────
async function callAPI(mode, messages) {
  const sys = mode === "deep" ? SYS_D : SYS_Q;
  const r   = await fetch(API_URL, {
    method:  "POST",
    headers: { "Content-Type":"application/json" },
    body:    JSON.stringify({ mode, system:sys, messages, max_tokens: mode==="deep"?2048:1024 }),
  });
  if (!r.ok) {
    const e = await r.json().catch(()=>({}));
    throw new Error(e?.error || `HTTP ${r.status}`);
  }
  const d = await r.json();
  return d.text || "";
}

// ── RBXLX BUILDER ────────────────────────────────────────────────
function xmlEsc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function buildRBXLX(gameName, scripts, models) {
  let rid = 10;
  const scriptXML = scripts.map(s => {
    const r = rid++;
    const cls = s.type === "LocalScript" ? "LocalScript" : "Script";
    return `      <Item class="${cls}" referent="RBX${r}">
        <Properties>
          <string name="Name">${xmlEsc(s.name)}</string>
          <ProtectedString name="Source"><![CDATA[${s.source}]]></ProtectedString>
          <bool name="Disabled">false</bool>
        </Properties>
      </Item>`;
  }).join("\n");

  const modelXML = (models||[]).map(m => {
    const r = rid++;
    return `      <Item class="Model" referent="RBX${r}">
        <Properties>
          <string name="Name">${xmlEsc(m.name||"Model")}</string>
        </Properties>
      </Item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
  <Meta name="ExplicitAutoJoints">true</Meta>
  <External>null</External>
  <External>nil</External>
  <Item class="DataModel" referent="RBX0">
    <Properties>
      <string name="Name">${xmlEsc(gameName)}</string>
    </Properties>
    <Item class="Workspace" referent="RBX1">
      <Properties>
        <string name="Name">Workspace</string>
        <bool name="StreamingEnabled">false</bool>
      </Properties>
${modelXML}
    </Item>
    <Item class="ServerScriptService" referent="RBX2">
      <Properties><string name="Name">ServerScriptService</string></Properties>
${scriptXML}
    </Item>
    <Item class="ReplicatedStorage" referent="RBX3">
      <Properties><string name="Name">ReplicatedStorage</string></Properties>
    </Item>
    <Item class="StarterGui" referent="RBX4">
      <Properties><string name="Name">StarterGui</string></Properties>
    </Item>
    <Item class="StarterPlayer" referent="RBX5">
      <Properties><string name="Name">StarterPlayer</string></Properties>
    </Item>
    <Item class="Lighting" referent="RBX6">
      <Properties>
        <string name="Name">Lighting</string>
        <float name="Brightness">2</float>
      </Properties>
    </Item>
  </Item>
</roblox>`;
}

function extractScripts(aiText) {
  const scripts = [];
  const re = /```(?:lua|luau)?\n([\s\S]*?)```/g;
  let m;
  const types = [
    { name:"MainGameScript",   type:"Script"      },
    { name:"ClientController", type:"LocalScript"  },
    { name:"UIHandler",        type:"LocalScript"  },
    { name:"DataManager",      type:"Script"       },
    { name:"RemoteSetup",      type:"Script"       },
  ];
  let idx = 0;
  while ((m = re.exec(aiText)) !== null) {
    const t = types[idx] || { name:`Script_${idx+1}`, type:"Script" };
    scripts.push({ ...t, source:m[1].trim() });
    idx++;
  }
  return scripts;
}

// ── CSS ───────────────────────────────────────────────────────────
function makeCSS(t, accent, fontFam, fontUrl) {
  const a = accent || t.accent;
  const g = `${a}33`;
  return `
${fontUrl ? `@import url('https://fonts.googleapis.com/css2?family=${fontUrl}&family=JetBrains+Mono:wght@400;500;600&family=Syne:wght@700;800&display=swap');`
          : `@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Syne:wght@700;800&display=swap');`}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; overflow: hidden; }
body { font-family: ${fontFam}; background: ${t.bg}; color: ${t.text}; -webkit-font-smoothing: antialiased; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 4px; }
textarea, input, button, select { font-family: ${fontFam}; }
textarea:focus, input:focus { outline: none; }
button { cursor: pointer; }

@keyframes fadeIn   { from { opacity: 0 } to { opacity: 1 } }
@keyframes slideUp  { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
@keyframes slideR   { from { opacity: 0; transform: translateX(100%) } to { opacity: 1; transform: translateX(0) } }
@keyframes slideL   { from { opacity: 0; transform: translateX(-100%) } to { opacity: 1; transform: translateX(0) } }
@keyframes scaleIn  { from { opacity: 0; transform: scale(.96) } to { opacity: 1; transform: scale(1) } }
@keyframes spin     { from { transform: rotate(0) } to { transform: rotate(360deg) } }
@keyframes pulse    { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
@keyframes blink    { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
@keyframes bounce   { 0%,60%,100% { transform: translateY(0) } 30% { transform: translateY(-5px) } }
@keyframes shimmer  { 0% { background-position: -300% center } 100% { background-position: 300% center } }
@keyframes gradShift{ 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }
@keyframes float    { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-7px) } }

.fade     { animation: fadeIn .25s ease both }
.up       { animation: slideUp .3s cubic-bezier(.22,1,.36,1) both }
.scale    { animation: scaleIn .25s cubic-bezier(.22,1,.36,1) both }
.panel-r  { animation: slideR .3s cubic-bezier(.22,1,.36,1) both }
.panel-l  { animation: slideL .3s cubic-bezier(.22,1,.36,1) both }
.msg-in   { animation: slideUp .25s cubic-bezier(.22,1,.36,1) both }
.spin     { animation: spin 1s linear infinite; display: inline-block }
.float    { animation: float 4s ease infinite }

.btn { transition: all .15s ease; }
.btn:hover  { filter: brightness(1.15); transform: translateY(-1px); }
.btn:active { filter: brightness(.9);  transform: translateY(0); }

.sidebar-row { transition: all .12s ease; padding-left: 10px; }
.sidebar-row:hover { background: ${t.s2} !important; padding-left: 16px !important; }

.input-box { transition: border-color .2s, box-shadow .2s; }
.input-box:focus-within { border-color: ${a} !important; box-shadow: 0 0 0 3px ${g} !important; }

.copy-btn { opacity: 0; transition: opacity .15s; }
.code-wrap:hover .copy-btn { opacity: 1; }

.cursor::after { content: "▋"; color: ${a}; animation: blink .65s step-end infinite; margin-left: 1px; }

.chip { transition: all .15s ease; }
.chip:hover { background: ${t.s2} !important; border-color: ${a} !important; transform: translateY(-1px); }

.logo { background: linear-gradient(90deg, ${t.text} 0%, ${a} 40%, ${t.text} 60%, ${a} 80%, ${t.text} 100%);
        background-size: 300% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text; animation: shimmer 4s linear infinite; }

.d1 { animation: bounce 1.3s ease .0s infinite }
.d2 { animation: bounce 1.3s ease .15s infinite }
.d3 { animation: bounce 1.3s ease .30s infinite }

@media (max-width: 768px) { .dt { display: none !important } }
@media (min-width: 769px) { .mb { display: none !important } }
`;
}

const nowTS = () => new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

/* ================================================================
   ROOT
================================================================ */
export default function DevixApp() {
  const [page,        setPage]        = useState("loading");
  const [isSignup,    setIsSignup]    = useState(false);
  const [form,        setForm]        = useState({ username:"", password:"" });
  const [loginErr,    setLoginErr]    = useState("");
  const [user,        setUser]        = useState(null);
  const [theme,       setTheme]       = useState("dark");
  const [fontKey,     setFontKey]     = useState("dm");
  const [accent,      setAccent]      = useState("");
  const [convs,       setConvs]       = useState([{ id:1, title:"New Chat", messages:[] }]);
  const [activeId,    setActiveId]    = useState(1);
  const [input,       setInput]       = useState("");
  const [isLoading,   setIsLoading]   = useState(false);
  const [files,       setFiles]       = useState([]);
  const [mode,        setMode]        = useState("quick");
  const [showSett,    setShowSett]    = useState(false);
  const [showWiz,     setShowWiz]     = useState(false);
  const [showUp,      setShowUp]      = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNav,   setMobileNav]   = useState(false);
  const [copied,      setCopied]      = useState({});
  const [toast,       setToast]       = useState(null);

  const endRef   = useRef(null);
  const fileRef  = useRef(null);
  const textRef  = useRef(null);
  const abortRef = useRef(null);

  const t    = THEMES[theme];
  const font = FONTS[fontKey];
  const ac   = accent || t.accent;
  const css  = makeCSS(t, ac, font.fam, font.gUrl);

  const isDeep   = mode === "deep";
  const curModel = isDeep ? AI_MODELS.zeno : AI_MODELS.zenith;
  const plan     = PLANS[user?.plan || "basic"];
  const conv     = convs.find(c => c.id === activeId);
  const msgs     = conv?.messages || [];

  // Mono style used in markdown inline code
  const monoStyle = {
    background: "rgba(128,128,128,.12)",
    borderRadius: 4,
    padding: "1px 6px",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "0.88em",
  };

  // Session restore
  useEffect(() => {
    const s = LS.g("devix_session");
    if (s?.username) {
      setUser(s);
      const p = LS.g("devix_prefs", {});
      if (p.theme)  setTheme(p.theme);
      if (p.font)   setFontKey(p.font);
      if (p.accent) setAccent(p.accent);
      setPage("chat");
    } else {
      setPage("login");
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, isLoading]);

  useEffect(() => {
    if (user) LS.s("devix_prefs", { theme, font:fontKey, accent });
  }, [theme, fontKey, accent, user]);

  const showToast = useCallback((msg, dur=3000) => {
    setToast(msg);
    setTimeout(() => setToast(null), dur);
  }, []);

  // ── AUTH ──────────────────────────────────────────────────────
  const doAuth = () => {
    const uname = form.username.trim();
    const pass  = form.password;
    if (!uname || !pass) { setLoginErr("Fill in all fields"); return; }
    const users = LS.g("devix_users", {});
    const key   = uname.toLowerCase();

    if (isSignup) {
      if (users[key]) { setLoginErr("Username taken — sign in instead"); return; }
      users[key] = { username:uname, password:pass, plan:"basic" };
      LS.s("devix_users", users);
      const u = { username:uname, plan:"basic" };
      setUser(u); LS.s("devix_session", u);
      setPage("chat");
      showToast(`Welcome, ${uname}! ⚡`);
    } else {
      const rec = users[key];
      if (!rec)              { setLoginErr("Account not found — sign up first"); return; }
      if (rec.password !== pass) { setLoginErr("Wrong password"); return; }
      const u = { username:rec.username, plan:rec.plan||"basic" };
      setUser(u); LS.s("devix_session", u);
      setPage("chat");
      showToast(`Welcome back, ${rec.username}!`);
    }
  };

  const doLogout = () => {
    LS.d("devix_session");
    setUser(null);
    setPage("login");
    setForm({ username:"", password:"" });
    setShowSett(false);
  };

  const applyOwnerKey = (key) => {
    if (key !== OWNER_KEY || !user) return false;
    const upd   = { ...user, plan:"owner" };
    const users = LS.g("devix_users", {});
    const k     = user.username.toLowerCase();
    if (users[k]) { users[k].plan = "owner"; LS.s("devix_users", users); }
    setUser(upd); LS.s("devix_session", upd);
    showToast("👑 Owner access unlocked!");
    return true;
  };

  // ── CONVS ─────────────────────────────────────────────────────
  const patchConv = useCallback((id, patcher) => {
    setConvs(prev => prev.map(c => c.id === id ? patcher(c) : c));
  }, []);

  const newChat = () => {
    const id = Date.now();
    setConvs(p => [...p, { id, title:"New Chat", messages:[] }]);
    setActiveId(id); setMobileNav(false);
  };

  const delConv = (id) => {
    const nxt = convs.filter(c => c.id !== id);
    if (nxt.length === 0) return;
    setConvs(nxt);
    if (activeId === id) setActiveId(nxt[nxt.length-1].id);
  };

  // ── SEND ─────────────────────────────────────────────────────
  const doSend = async () => {
    if ((!input.trim() && !files.length) || isLoading) return;

    const uMsg = { id:Date.now(), role:"user", content:input, files:[...files], ts:nowTS() };
    const next = [...msgs, uMsg];
    patchConv(activeId, c => ({ ...c, messages:next }));

    if (msgs.length === 0 && input.trim()) {
      const title = input.trim().slice(0,38) + (input.length>38?"…":"");
      patchConv(activeId, c => ({ ...c, title }));
    }

    setInput(""); setFiles([]); setIsLoading(true);
    if (textRef.current) textRef.current.style.height = "auto";

    const apiMsgs = next.map(m => ({
      role:    m.role,
      content: m.content + (m.files?.length
        ? "\n\n[Files]\n" + m.files.map(f => `--- ${f.name} ---\n${f.content||"[binary]"}`).join("\n\n")
        : ""),
    }));

    // Add empty streaming message
    const aiId = Date.now() + 1;
    const aiMs = { id:aiId, role:"assistant", content:"", modelId:curModel.id, mode, ts:nowTS(), streaming:true };
    patchConv(activeId, c => ({ ...c, messages:[...next, aiMs] }));

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const fullText = await callAPI(mode, apiMsgs);

      await streamText(fullText, (partial) => {
        patchConv(activeId, c => ({
          ...c,
          messages: c.messages.map(m => m.id === aiId ? { ...m, content:partial, streaming:true } : m),
        }));
      }, abort.signal);

      patchConv(activeId, c => ({
        ...c,
        messages: c.messages.map(m => m.id === aiId ? { ...m, content:fullText, streaming:false } : m),
      }));

    } catch (err) {
      patchConv(activeId, c => ({
        ...c,
        messages: c.messages.map(m => m.id === aiId ? { ...m, content:`⚠️ ${err.message}`, streaming:false } : m),
      }));
    }

    setIsLoading(false);
    abortRef.current = null;
  };

  const attachFiles = async (fl) => {
    const arr = [];
    for (const f of Array.from(fl)) {
      try { arr.push({ name:f.name, content:await f.text() }); }
      catch { arr.push({ name:f.name, content:"[binary]" }); }
    }
    setFiles(p => [...p, ...arr]);
    showToast(`${arr.length} file${arr.length>1?"s":""} attached`);
  };

  const copyCode = (code, key) => {
    navigator.clipboard?.writeText(code);
    setCopied(p => ({ ...p, [key]:true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]:false })), 2000);
    showToast("Copied to clipboard");
  };

  // ── LOADING ───────────────────────────────────────────────────
  if (page === "loading") return (
    <>
      <style>{css}</style>
      <div style={{height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:t.bg}}>
        <div style={{width:44,height:44,borderRadius:13,background:ac,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse 1.4s ease infinite"}}>
          <span style={{color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800}}>D</span>
        </div>
      </div>
    </>
  );

  // ── LOGIN ─────────────────────────────────────────────────────
  if (page === "login") return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100dvh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${t.border} 1px,transparent 1px),linear-gradient(90deg,${t.border} 1px,transparent 1px)`,backgroundSize:"44px 44px",opacity:.3,pointerEvents:"none"}}/>
        <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 70% 50% at 50% 0%, ${ac}20, transparent 70%)`,pointerEvents:"none"}}/>

        <div style={{width:"100%",maxWidth:920,zIndex:1,display:"flex",gap:28,flexWrap:"wrap",justifyContent:"center",alignItems:"flex-start",paddingTop:20}}>
          {/* Auth card */}
          <div className="up" style={{flex:"0 0 340px",maxWidth:360}}>
            <div style={{marginBottom:24}}>
              <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:8}}>
                <div style={{width:40,height:40,borderRadius:12,background:ac,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 8px 28px ${ac}55`}}>
                  <span style={{color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:19,fontWeight:800}}>D</span>
                </div>
                <span className="logo" style={{fontFamily:"'Syne',sans-serif",fontSize:30,fontWeight:800,letterSpacing:3}}>DEVIX</span>
              </div>
              <p style={{color:t.muted,fontSize:13,lineHeight:1.65}}>The AI built for Roblox developers.<br/>Scripts, full games, deep help.</p>
            </div>

            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:24}}>
              <div style={{display:"flex",background:t.s2,borderRadius:9,padding:3,marginBottom:18}}>
                {["Sign In","Sign Up"].map((tab,i) => (
                  <button key={tab} onClick={()=>{setIsSignup(i===1);setLoginErr("");}} className="btn"
                    style={{flex:1,padding:"7px 0",borderRadius:7,border:"none",background:isSignup===(i===1)?ac:"transparent",color:isSignup===(i===1)?"#fff":t.muted,fontSize:13,fontWeight:600,transition:"all .2s"}}>
                    {tab}
                  </button>
                ))}
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {[
                  { ph:"Username", val:form.username, onChange:v=>setForm(p=>({...p,username:v})), type:"text" },
                  { ph:"Password", val:form.password, onChange:v=>setForm(p=>({...p,password:v})), type:"password" },
                ].map(f => (
                  <input key={f.ph} type={f.type} placeholder={f.ph} value={f.val}
                    onChange={e=>f.onChange(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&doAuth()}
                    style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:"11px 13px",color:t.text,fontSize:14,width:"100%"}}
                    onFocus={e=>e.target.style.borderColor=ac}
                    onBlur={e=>e.target.style.borderColor=t.border}/>
                ))}
                {loginErr && <p style={{color:"#ef4444",fontSize:12,textAlign:"center"}}>{loginErr}</p>}
                <button onClick={doAuth} className="btn"
                  style={{background:`linear-gradient(135deg,${ac},${ac}bb)`,border:"none",borderRadius:9,padding:12,color:"#fff",fontSize:14,fontWeight:700,marginTop:2,boxShadow:`0 4px 18px ${ac}44`,backgroundSize:"200% 200%",animation:"gradShift 4s ease infinite"}}>
                  {isSignup ? "Create Account →" : "Sign In →"}
                </button>
              </div>
            </div>
          </div>

          {/* Feature cards */}
          <div style={{display:"flex",flexDirection:"column",gap:9,flex:"1 1 240px",maxWidth:420}}>
            {[
              { icon:"⚡", title:"Race Mode",     color:AI_MODELS.zenith.color, desc:"Multiple models race — fastest correct answer wins instantly."       },
              { icon:"🌟", title:"Synthesis",     color:AI_MODELS.zeno.color,   desc:"All models run in parallel. GPT synthesizes the single best answer." },
              { icon:"🎮", title:"Game Wizard",   color:"#22c55e",              desc:"Describe your game → get a real .rbxlx file you open in Studio."     },
              { icon:"📄", title:"File Attach",   color:"#f59e0b",              desc:"Drop .lua scripts right into the chat for review and debugging."     },
            ].map((c,i) => (
              <div key={c.title} className="up" style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:11,padding:"12px 14px",display:"flex",gap:11,alignItems:"flex-start",animationDelay:`${i*.06}s`}}>
                <div style={{width:32,height:32,borderRadius:9,background:`${c.color}16`,border:`1px solid ${c.color}26`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{c.icon}</div>
                <div>
                  <div style={{color:t.text,fontWeight:600,fontSize:13,marginBottom:2}}>{c.title}</div>
                  <div style={{color:t.muted,fontSize:12,lineHeight:1.5}}>{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );

  // ── CHAT ──────────────────────────────────────────────────────
  return (
    <>
      <style>{css}</style>
      <div style={{height:"100dvh",display:"flex",background:t.bg,overflow:"hidden"}}>

        {/* Desktop sidebar */}
        {sidebarOpen && (
          <aside className="dt panel-l" style={{width:228,background:t.surface,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
            <SidebarInner t={t} ac={ac} convs={convs} activeId={activeId}
              setActiveId={setActiveId} delConv={delConv} newChat={newChat}
              user={user} plan={plan} setShowSett={setShowSett}
              setShowWiz={setShowWiz} setShowUp={setShowUp}/>
          </aside>
        )}

        {/* Mobile overlay */}
        {mobileNav && (
          <div className="mb fade" onClick={()=>setMobileNav(false)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:200}}>
            <div className="up" onClick={e=>e.stopPropagation()}
              style={{position:"absolute",bottom:0,left:0,right:0,height:"76dvh",background:t.surface,borderRadius:"16px 16px 0 0",borderTop:`1px solid ${t.border}`,display:"flex",flexDirection:"column"}}>
              <div style={{width:32,height:3,borderRadius:2,background:t.border,margin:"9px auto"}}/>
              <SidebarInner t={t} ac={ac} convs={convs} activeId={activeId}
                setActiveId={id=>{setActiveId(id);setMobileNav(false);}} delConv={delConv} newChat={newChat}
                user={user} plan={plan} setShowSett={setShowSett}
                setShowWiz={setShowWiz} setShowUp={setShowUp}/>
            </div>
          </div>
        )}

        {/* Main column */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

          {/* Header */}
          <header style={{height:50,padding:"0 13px",borderBottom:`1px solid ${t.border}`,background:t.surface,display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
            <button onClick={()=>window.innerWidth<769?setMobileNav(p=>!p):setSidebarOpen(p=>!p)} className="btn"
              style={{background:"none",border:`1px solid ${t.border}`,borderRadius:7,padding:"5px 8px",color:t.muted,fontSize:15}}>☰</button>

            <div style={{display:"flex",alignItems:"center",gap:6,background:`${curModel.color}12`,border:`1px solid ${curModel.color}26`,borderRadius:8,padding:"3px 9px"}}>
              <span style={{fontSize:12}}>{curModel.icon}</span>
              <span className="dt" style={{color:curModel.color,fontSize:10,fontWeight:700,letterSpacing:.5}}>{curModel.name}</span>
            </div>

            <p style={{flex:1,color:t.muted,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {conv?.title || "New Chat"}
            </p>

            {!plan.wizard && (
              <button onClick={()=>setShowUp(true)} className="btn"
                style={{background:`${ac}14`,border:`1px solid ${ac}28`,borderRadius:7,padding:"4px 9px",color:ac,fontSize:11,fontWeight:700}}>
                Upgrade
              </button>
            )}
            <button onClick={()=>setShowSett(true)} className="btn"
              style={{background:"none",border:`1px solid ${t.border}`,borderRadius:7,padding:"5px 8px",color:t.muted,fontSize:13}}>⚙</button>
          </header>

          {/* Messages area */}
          <div style={{flex:1,overflowY:"auto",padding:"14px 0"}}>
            {msgs.length === 0
              ? <EmptyState t={t} ac={ac} setInput={v=>{setInput(v);textRef.current?.focus();}} plan={plan} setShowWiz={setShowWiz} setShowUp={setShowUp}/>
              : (
                <div style={{maxWidth:760,margin:"0 auto",padding:"0 13px"}}>
                  {msgs.map(msg => (
                    <MsgBubble key={msg.id} msg={msg} t={t} ac={ac}
                      copyCode={copyCode} copied={copied} monoStyle={monoStyle}/>
                  ))}
                  {isLoading && msgs[msgs.length-1]?.role === "user" && (
                    <ThinkDots t={t} model={curModel} mode={mode}/>
                  )}
                  <div ref={endRef} style={{height:6}}/>
                </div>
              )
            }
          </div>

          {/* Input */}
          <div style={{padding:"7px 11px 13px",background:t.surface,borderTop:`1px solid ${t.border}`,flexShrink:0}}>
            <div style={{maxWidth:760,margin:"0 auto"}}>

              {files.length > 0 && (
                <div style={{display:"flex",gap:5,marginBottom:7,flexWrap:"wrap"}}>
                  {files.map((f,i) => (
                    <div key={i} className="fade" style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:7,padding:"3px 8px",display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:11}}>📄</span>
                      <span style={{color:t.muted,fontSize:11,maxWidth:90,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                      <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))}
                        style={{background:"none",border:"none",color:t.muted,fontSize:13,lineHeight:1,padding:0}}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className={`input-box${isDeep?" deep-border":""}`}
                style={{background:t.s2,border:`1px solid ${isDeep?"#a78bfa44":t.border}`,borderRadius:13,overflow:"hidden"}}>
                <textarea ref={textRef} value={input}
                  onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,154)+"px";}}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}}}
                  placeholder={isDeep?"Ask Devix Zeno — synthesis mode…":"Ask Devix Zenith — race mode…"}
                  rows={1}
                  style={{width:"100%",background:"transparent",border:"none",padding:"12px 13px 5px",color:t.text,fontSize:14,resize:"none",lineHeight:1.65,maxHeight:154,overflowY:"auto",minHeight:44}}/>

                <div style={{display:"flex",alignItems:"center",padding:"4px 9px 9px",gap:5}}>
                  <input type="file" ref={fileRef} onChange={e=>attachFiles(e.target.files)}
                    multiple accept=".lua,.rbxl,.rbxlx,.txt,.json,.md,.csv" style={{display:"none"}}/>
                  <button onClick={()=>fileRef.current?.click()} className="btn"
                    style={{background:"none",border:`1px solid ${t.border}`,borderRadius:7,padding:"5px 9px",color:t.muted,fontSize:13,display:"flex",alignItems:"center",gap:4,fontWeight:500}}>
                    <span style={{fontSize:15,lineHeight:1}}>+</span>
                    <span className="dt" style={{fontSize:12}}>Attach</span>
                  </button>

                  {plan.wizard && (
                    <button onClick={()=>setShowWiz(true)} className="btn"
                      style={{background:"none",border:`1px solid ${t.border}`,borderRadius:7,padding:"5px 9px",color:t.muted,fontSize:12,fontWeight:500}}>
                      🎮 Wizard
                    </button>
                  )}

                  <div style={{display:"flex",background:t.bg,border:`1px solid ${t.border}`,borderRadius:18,padding:2,gap:1}}>
                    <button onClick={()=>setMode("quick")} className="btn"
                      style={{background:!isDeep?`${AI_MODELS.zenith.color}20`:"transparent",border:`1px solid ${!isDeep?`${AI_MODELS.zenith.color}44`:"transparent"}`,borderRadius:16,padding:"4px 10px",color:!isDeep?AI_MODELS.zenith.color:t.muted,fontSize:11,fontWeight:700,transition:"all .2s"}}>
                      ⚡ Quick
                    </button>
                    <button onClick={()=>plan.zeno?setMode("deep"):setShowUp(true)} className="btn"
                      style={{background:isDeep?"linear-gradient(135deg,#a78bfa22,#7c3aed18)":"transparent",border:`1px solid ${isDeep?"#a78bfa44":"transparent"}`,borderRadius:16,padding:"4px 10px",color:isDeep?"#a78bfa":t.muted,fontSize:11,fontWeight:700,transition:"all .2s",opacity:plan.zeno?1:.5}}>
                      🌟 Deep
                    </button>
                  </div>

                  <div style={{flex:1}}/>
                  <button onClick={doSend} disabled={isLoading} className="btn"
                    style={{background:isDeep?"linear-gradient(135deg,#a78bfa,#7c3aed)":`linear-gradient(135deg,${ac},${ac}cc)`,border:"none",borderRadius:9,padding:"8px 15px",color:"#fff",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,boxShadow:isDeep?"0 4px 16px #a78bfa33":`0 4px 16px ${ac}33`,opacity:isLoading?.55:1,backgroundSize:"200% 200%",animation:"gradShift 4s ease infinite"}}>
                    {isLoading ? <span className="spin">⟳</span> : "↑"}
                    <span className="dt">{isLoading?"Thinking…":"Send"}</span>
                  </button>
                </div>
              </div>

              <div style={{display:"flex",gap:4,marginTop:5,overflowX:"auto",paddingBottom:2}}>
                {QUICK_ACTIONS.map(qa => (
                  <button key={qa.label} onClick={()=>{setInput(qa.prompt);textRef.current?.focus();}} className="chip"
                    style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:14,padding:"4px 10px",color:t.muted,fontSize:11,display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap",fontWeight:500,flexShrink:0}}>
                    {qa.icon} {qa.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Overlays ── */}
        {showSett && (
          <div className="fade" onClick={()=>setShowSett(false)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:300}}>
            <div className="panel-r" onClick={e=>e.stopPropagation()}
              style={{position:"absolute",right:0,top:0,width:"min(390px,100vw)",height:"100%",background:t.surface,borderLeft:`1px solid ${t.border}`,display:"flex",flexDirection:"column"}}>
              <SettingsPanel t={t} ac={ac} user={user} plan={plan}
                theme={theme} setTheme={setTheme}
                fontKey={fontKey} setFontKey={setFontKey}
                accent={accent} setAccent={setAccent}
                onClose={()=>setShowSett(false)} onLogout={doLogout}
                onOwnerKey={applyOwnerKey} onUpgrade={()=>{setShowSett(false);setShowUp(true);}}/>
            </div>
          </div>
        )}

        {showWiz && (
          <div className="fade" onClick={()=>setShowWiz(false)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:14}}>
            <div onClick={e=>e.stopPropagation()}>
              <GameWizard t={t} ac={ac} toast={showToast} onClose={()=>setShowWiz(false)}/>
            </div>
          </div>
        )}

        {showUp && (
          <div className="fade" onClick={()=>setShowUp(false)}
            style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:14}}>
            <div className="scale" onClick={e=>e.stopPropagation()}>
              <UpgradeModal t={t} ac={ac} plan={plan} onClose={()=>setShowUp(false)}/>
            </div>
          </div>
        )}

        {toast && (
          <div className="up" style={{position:"fixed",bottom:18,left:"50%",transform:"translateX(-50%)",background:t.surface,border:`1px solid ${ac}33`,borderRadius:18,padding:"7px 16px",color:t.text,fontSize:13,fontWeight:500,zIndex:999,boxShadow:"0 8px 28px rgba(0,0,0,.4)",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap",pointerEvents:"none"}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:ac,animation:"pulse 1s infinite"}}/>
            {toast}
          </div>
        )}
      </div>
    </>
  );
}

/* ================================================================
   COMPONENTS
================================================================ */

function SidebarInner({ t, ac, convs, activeId, setActiveId, delConv, newChat, user, plan, setShowSett, setShowWiz, setShowUp }) {
  return (
    <>
      <div style={{padding:"12px 13px 9px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",gap:8}}>
        <div style={{width:26,height:26,borderRadius:8,background:ac,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:12,fontWeight:800}}>D</span>
        </div>
        <span style={{fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:800,color:t.text,letterSpacing:2}}>DEVIX</span>
      </div>

      <div style={{padding:"8px 9px 3px"}}>
        <button onClick={newChat} className="btn"
          style={{width:"100%",background:`${ac}14`,border:`1px solid ${ac}26`,borderRadius:9,padding:"7px 11px",color:ac,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:15}}>＋</span> New Chat
        </button>
      </div>

      {plan.wizard && (
        <div style={{padding:"4px 9px"}}>
          <button onClick={()=>setShowWiz(true)} className="btn"
            style={{width:"100%",background:"rgba(34,197,94,.08)",border:"1px solid rgba(34,197,94,.22)",borderRadius:9,padding:"6px 11px",color:"#22c55e",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            🎮 Game Wizard
          </button>
        </div>
      )}

      <div style={{flex:1,overflowY:"auto",padding:"3px 7px"}}>
        <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",padding:"9px 6px 4px"}}>Chats</p>
        {[...convs].reverse().map(c => (
          <div key={c.id} className="sidebar-row" onClick={()=>setActiveId(c.id)}
            style={{borderRadius:8,cursor:"pointer",marginBottom:1,background:c.id===activeId?`${ac}14`:"transparent",borderLeft:`2px solid ${c.id===activeId?ac:"transparent"}`,display:"flex",alignItems:"center",gap:6,padding:"7px 9px"}}>
            <span style={{fontSize:11,opacity:.5}}>💬</span>
            <span style={{color:c.id===activeId?t.text:t.muted,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{c.title}</span>
            {convs.length > 1 && (
              <button onClick={e=>{e.stopPropagation();delConv(c.id);}}
                style={{background:"none",border:"none",color:t.muted,fontSize:13,padding:0,opacity:0,transition:"opacity .12s",lineHeight:1}}
                onMouseOver={e=>e.currentTarget.style.opacity=1}
                onMouseOut={e=>e.currentTarget.style.opacity=0}>×</button>
            )}
          </div>
        ))}
      </div>

      <div style={{borderTop:`1px solid ${t.border}`,padding:"9px 11px"}}>
        {!plan.wizard && (
          <button onClick={()=>setShowUp(true)} className="btn"
            style={{width:"100%",background:`${ac}10`,border:`1px solid ${ac}24`,borderRadius:8,padding:"6px",color:ac,fontSize:11,fontWeight:600,marginBottom:8}}>
            ⚡ Upgrade Plan
          </button>
        )}
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,borderRadius:"50%",background:`${plan.color}20`,border:`1px solid ${plan.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{plan.badge}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:t.text,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.username}</div>
            <div style={{color:plan.color,fontSize:10}}>{plan.name}</div>
          </div>
          <button onClick={()=>setShowSett(true)} className="btn" style={{background:"none",border:"none",color:t.muted,fontSize:14,padding:3}}>⚙</button>
        </div>
      </div>
    </>
  );
}

function EmptyState({ t, ac, setInput, plan, setShowWiz, setShowUp }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%",padding:"28px 14px",animation:"fadeIn .4s ease"}}>
      <div className="float" style={{width:52,height:52,borderRadius:15,background:ac,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:14,boxShadow:`0 10px 36px ${ac}44`}}>
        <span style={{color:"#fff",fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:800}}>D</span>
      </div>
      <h2 className="up" style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(17px,3vw,24px)",fontWeight:800,color:t.text,marginBottom:5,textAlign:"center"}}>What are we building?</h2>
      <p className="up" style={{color:t.muted,fontSize:13,marginBottom:18,textAlign:"center",maxWidth:360,lineHeight:1.7,animationDelay:".05s"}}>Your Roblox Studio AI. Scripts, systems, full games.</p>

      <button className="up btn" onClick={plan.wizard?()=>setShowWiz(true):()=>setShowUp(true)}
        style={{background:plan.wizard?"rgba(34,197,94,.1)":`${ac}10`,border:plan.wizard?"1px solid rgba(34,197,94,.28)":`1px solid ${ac}26`,borderRadius:10,padding:"8px 16px",color:plan.wizard?"#22c55e":ac,fontSize:13,fontWeight:600,marginBottom:18,display:"flex",alignItems:"center",gap:7,animationDelay:".08s"}}>
        🎮 {plan.wizard?"Open Game Wizard":"Unlock Game Wizard →"}
      </button>

      <div className="up" style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",maxWidth:500,animationDelay:".11s"}}>
        {QUICK_ACTIONS.map(qa => (
          <button key={qa.label} onClick={()=>setInput(qa.prompt)} className="chip"
            style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:18,padding:"7px 13px",color:t.muted,fontSize:12,display:"flex",alignItems:"center",gap:5,fontWeight:500}}>
            {qa.icon} {qa.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkDots({ t, model, mode }) {
  const isDeep = mode === "deep";
  const col    = isDeep ? "#a78bfa" : model.color;
  return (
    <div className="msg-in" style={{display:"flex",gap:9,marginBottom:18}}>
      <div style={{width:28,height:28,borderRadius:8,background:isDeep?"linear-gradient(135deg,#a78bfa,#7c3aed)":`linear-gradient(135deg,${col},${col}77)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,animation:"pulse 1.4s ease infinite",fontSize:12}}>{model.icon}</div>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:"4px 12px 12px 12px",padding:"10px 14px",display:"flex",alignItems:"center",gap:9}}>
        <span style={{color:t.muted,fontSize:13}}>{isDeep?"Synthesizing…":"Thinking…"}</span>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <div className="d1" style={{width:5,height:5,borderRadius:"50%",background:col}}/>
          <div className="d2" style={{width:5,height:5,borderRadius:"50%",background:col}}/>
          <div className="d3" style={{width:5,height:5,borderRadius:"50%",background:col}}/>
        </div>
      </div>
    </div>
  );
}

function MsgBubble({ msg, t, ac, copyCode, copied, monoStyle }) {
  const isUser    = msg.role === "user";
  const isDeep    = msg.mode === "deep";
  const mdl       = AI_MODELS[msg.modelId] || AI_MODELS.zenith;
  const bc        = isDeep ? "#a78bfa" : mdl.color;
  const streaming = msg.streaming;
  const parts     = isUser ? null : parseParts(msg.content);

  return (
    <div className="msg-in" style={{display:"flex",gap:8,marginBottom:18,flexDirection:isUser?"row-reverse":"row"}}>
      {!isUser && (
        <div style={{width:28,height:28,borderRadius:8,background:isDeep?"linear-gradient(135deg,#a78bfa,#7c3aed)":`linear-gradient(135deg,${bc},${bc}77)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:14,fontSize:12}}>{mdl.icon}</div>
      )}
      <div style={{maxWidth:"85%",display:"flex",flexDirection:"column",gap:3,alignItems:isUser?"flex-end":"flex-start",minWidth:0}}>
        {!isUser && (
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{color:bc,fontSize:10,fontWeight:700}}>{mdl.name}</span>
            <span style={{background:`${bc}16`,color:bc,fontSize:8,fontWeight:800,padding:"1px 5px",borderRadius:3,letterSpacing:.5}}>{isDeep?"DEEP":"QUICK"}</span>
          </div>
        )}
        <div style={{background:isUser?`linear-gradient(135deg,${ac},${ac}dd)`:t.surface,border:isUser?"none":`1px solid ${isDeep?"#a78bfa22":t.border}`,borderRadius:isUser?"13px 3px 13px 13px":"3px 13px 13px 13px",padding:"9px 13px",boxShadow:isUser?`0 4px 18px ${ac}2a`:"none",maxWidth:"100%",minWidth:0}}>
          {isUser ? (
            <div>
              <p style={{color:"#fff",fontSize:14,lineHeight:1.7,margin:0,wordBreak:"break-word"}}>{msg.content}</p>
              {msg.files?.length > 0 && (
                <div style={{marginTop:5,display:"flex",flexWrap:"wrap",gap:4}}>
                  {msg.files.map((f,i) => (
                    <span key={i} style={{background:"rgba(255,255,255,.14)",borderRadius:5,padding:"1px 7px",fontSize:11,color:"rgba(255,255,255,.88)"}}>📄 {f.name}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{maxWidth:"100%",minWidth:0}}>
              {(!parts || parts.length === 0) && streaming && <span className="cursor"/>}
              {(parts||[]).map((part,i) => {
                const isLast = i === parts.length - 1;
                if (part.type === "text") return (
                  <div key={i} style={{marginBottom:isLast?0:7}}>
                    <MarkdownBlock text={part.content} textColor={t.text} monoStyle={monoStyle}/>
                    {streaming && isLast && <span className="cursor"/>}
                  </div>
                );
                const ck = `${msg.id}-${i}`;
                return (
                  <div key={i} className="code-wrap" style={{margin:"9px 0",background:t.s2,borderRadius:10,border:`1px solid ${t.border}`,overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"5px 11px",borderBottom:`1px solid ${t.border}`,background:t.bg}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{display:"flex",gap:4}}>
                          {["#ff5f56","#ffbd2e","#27c93f"].map(c => <div key={c} style={{width:8,height:8,borderRadius:"50%",background:c}}/>)}
                        </div>
                        <span style={{color:ac,fontSize:10,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,letterSpacing:.8}}>{(part.lang||"lua").toUpperCase()}</span>
                      </div>
                      <button className="copy-btn btn" onClick={()=>copyCode(part.content,ck)}
                        style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:5,padding:"2px 8px",color:t.muted,fontSize:10,fontWeight:500}}>
                        {copied[ck]?"✓ Copied":"Copy"}
                      </button>
                    </div>
                    <pre style={{margin:0,padding:"11px 13px",overflowX:"auto",fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:t.text,lineHeight:1.8,tabSize:2}}>
                      <code>{part.content}</code>
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <span style={{color:t.muted,fontSize:10,margin:"0 2px"}}>{msg.ts}</span>
      </div>
    </div>
  );
}

/* ── GAME WIZARD ─────────────────────────────────────────────── */
function GameWizard({ t, ac, toast, onClose }) {
  const [step,  setStep]  = useState(1);
  const [name,  setName]  = useState("");
  const [genre, setGenre] = useState("RPG");
  const [desc,  setDesc]  = useState("");
  const [npcs,  setNpcs]  = useState([]);
  const [gen,   setGen]   = useState(false);
  const [prog,  setProg]  = useState("");
  const [done,  setDone]  = useState(false);

  const GENRES = ["RPG","Battle Royale","Obby","Simulator","Tower Defense","Racing","Tycoon","Horror","FPS","Puzzle"];

  const addNpc    = () => setNpcs(p => [...p, { name:"", look:"", behav:"" }]);
  const updNpc    = (i,k,v) => setNpcs(p => p.map((n,j)=>j===i?{...n,[k]:v}:n));
  const remNpc    = (i) => setNpcs(p => p.filter((_,j)=>j!==i));

  const generate = async () => {
    if (!name.trim()) { toast("Enter a game name!"); return; }
    setGen(true);
    setProg("Sending to AI models…");

    const npcSection = npcs.length > 0
      ? `\nCustom Models/NPCs:\n${npcs.map(n=>`- ${n.name||"NPC"}: ${n.look}${n.behav?" | Behavior: "+n.behav:""}`).join("\n")}`
      : "";

    const prompt = `Create a complete Roblox ${genre} game called "${name}".
Game description: ${desc || "A fun polished game with core genre mechanics."}${npcSection}

Write ALL required Luau scripts. Output exactly 5 scripts in this format:

SCRIPT 1 (MainGameScript - Script in ServerScriptService):
\`\`\`lua
-- complete code
\`\`\`

SCRIPT 2 (ClientController - LocalScript in StarterPlayer):
\`\`\`lua
-- complete code
\`\`\`

SCRIPT 3 (UIHandler - LocalScript in StarterGui):
\`\`\`lua
-- complete code
\`\`\`

SCRIPT 4 (DataManager - Script in ServerScriptService):
\`\`\`lua
-- complete code
\`\`\`

SCRIPT 5 (RemoteSetup - Script in ReplicatedStorage):
\`\`\`lua
-- complete code
\`\`\`

Every script must be COMPLETE with no placeholders. Include Roblox services, RemoteEvents, player handling.`;

    try {
      const res  = await fetch("/api/chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ mode:"deep", system:SYS_D, messages:[{role:"user",content:prompt}], max_tokens:2048 }),
      });
      const data = await res.json();
      if (!data.text) throw new Error("No response from AI");

      setProg("Packaging .rbxlx file…");

      const scripts = extractScripts(data.text);
      if (scripts.length === 0) throw new Error("Could not parse scripts — try again");

      const rbxlx = buildRBXLX(name, scripts, npcs.filter(n=>n.name.trim()));
      const blob  = new Blob([rbxlx], { type:"application/octet-stream" });
      const url   = URL.createObjectURL(blob);
      const link  = document.createElement("a");
      link.href     = url;
      link.download = `${name.replace(/[^a-z0-9]/gi,"_")}.rbxlx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProg("Done!");
      setDone(true);
      toast("🎮 .rbxlx downloaded!");
    } catch (err) {
      setProg("Error: " + err.message);
      setGen(false);
    }
  };

  const iStyle = {background:t.s2,border:`1px solid ${t.border}`,borderRadius:8,padding:"9px 11px",color:t.text,fontSize:13,width:"100%"};
  const inp = (val, set, ph, multi=false) => multi
    ? <textarea value={val} onChange={e=>set(e.target.value)} placeholder={ph} rows={3} style={{...iStyle,resize:"vertical",fontFamily:"inherit"}}/>
    : <input value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={iStyle} onFocus={e=>e.target.style.borderColor=ac} onBlur={e=>e.target.style.borderColor=t.border}/>;

  return (
    <div className="scale" style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,width:"min(570px,96vw)",maxHeight:"88dvh",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 72px rgba(0,0,0,.6)"}}>
      {/* Header */}
      <div style={{padding:"16px 18px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>🎮</span>
            <span style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800,color:t.text}}>Game Wizard</span>
          </div>
          <p style={{color:t.muted,fontSize:11,marginTop:2}}>Describe your game → download a ready .rbxlx file</p>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:t.muted,fontSize:21,cursor:"pointer",lineHeight:1}}>×</button>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"18px"}}>
        {done ? (
          <div style={{textAlign:"center",padding:"24px 0"}}>
            <div style={{fontSize:44,marginBottom:10}}>🎉</div>
            <h3 style={{color:t.text,fontFamily:"'Syne',sans-serif",fontWeight:800,marginBottom:7,fontSize:16}}>{name}.rbxlx downloaded!</h3>
            <p style={{color:t.muted,fontSize:13,lineHeight:1.65,marginBottom:16}}>Open in Roblox Studio to start building.</p>
            <div style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:10,padding:"11px 14px",textAlign:"left",marginBottom:16}}>
              {["Open Roblox Studio","File → Open from File","Select your .rbxlx","Explore the scripts in the Explorer panel"].map((s,i)=>(
                <p key={i} style={{color:t.text,fontSize:12,marginBottom:3}}>
                  <span style={{color:ac,marginRight:6}}>{i+1}.</span>{s}
                </p>
              ))}
            </div>
            <button onClick={onClose} className="btn"
              style={{background:ac,border:"none",borderRadius:9,padding:"9px 22px",color:"#fff",fontSize:13,fontWeight:700}}>
              Close
            </button>
          </div>
        ) : gen ? (
          <div style={{textAlign:"center",padding:"38px 0"}}>
            <div style={{width:44,height:44,borderRadius:12,background:`${ac}18`,border:`1px solid ${ac}36`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",animation:"pulse 1.4s ease infinite"}}>
              <span className="spin" style={{fontSize:20}}>⟳</span>
            </div>
            <p style={{color:t.text,fontSize:14,fontWeight:600,marginBottom:5}}>{prog}</p>
            <p style={{color:t.muted,fontSize:12}}>Takes about 20–40 seconds…</p>
          </div>
        ) : (
          <>
            {/* Step tabs */}
            <div style={{display:"flex",gap:3,marginBottom:18,background:t.s2,borderRadius:9,padding:3}}>
              {[["1","Info"],["2","Models"],["3","Generate"]].map(([n,lab])=>(
                <button key={n} onClick={()=>setStep(Number(n))} className="btn"
                  style={{flex:1,padding:"6px 4px",borderRadius:7,border:"none",background:step===Number(n)?ac:"transparent",color:step===Number(n)?"#fff":t.muted,fontSize:12,fontWeight:600}}>
                  {n}. {lab}
                </button>
              ))}
            </div>

            {step===1 && (
              <div style={{display:"flex",flexDirection:"column",gap:11}}>
                <div>
                  <label style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:1,display:"block",marginBottom:5,textTransform:"uppercase"}}>Game Name *</label>
                  {inp(name, setName, "e.g. Blade Clash, Dragon Tycoon…")}
                </div>
                <div>
                  <label style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:1,display:"block",marginBottom:6,textTransform:"uppercase"}}>Genre</label>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                    {GENRES.map(g => (
                      <button key={g} onClick={()=>setGenre(g)} className="btn"
                        style={{background:genre===g?ac:t.s2,border:`1px solid ${genre===g?ac:t.border}`,borderRadius:7,padding:"5px 10px",color:genre===g?"#fff":t.muted,fontSize:12,fontWeight:500}}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:1,display:"block",marginBottom:5,textTransform:"uppercase"}}>Description</label>
                  {inp(desc, setDesc, "Core gameplay, special features, vibe…", true)}
                </div>
                <button onClick={()=>setStep(2)} className="btn"
                  style={{background:ac,border:"none",borderRadius:9,padding:"10px",color:"#fff",fontSize:13,fontWeight:700,marginTop:3}}>
                  Next: Add Models →
                </button>
              </div>
            )}

            {step===2 && (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <p style={{color:t.muted,fontSize:12,lineHeight:1.6}}>Add custom NPCs, bosses, or objects. They'll appear as named Models in the Workspace.</p>
                {npcs.map((n,i) => (
                  <div key={i} style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:10,padding:"11px 13px",display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Model {i+1}</span>
                      <button onClick={()=>remNpc(i)} style={{background:"none",border:"none",color:t.muted,cursor:"pointer",fontSize:13,lineHeight:1}}>×</button>
                    </div>
                    {[["Name","name","e.g. BossGuard"],["Appearance","look","e.g. large red robot, glowing eyes"],["Behavior","behav","e.g. patrols, attacks on sight, 300 HP"]].map(([lab,field,ph])=>(
                      <input key={field} value={n[field]} onChange={e=>updNpc(i,field,e.target.value)} placeholder={ph}
                        style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:7,padding:"7px 9px",color:t.text,fontSize:12,width:"100%"}}
                        onFocus={e=>e.target.style.borderColor=ac} onBlur={e=>e.target.style.borderColor=t.border}/>
                    ))}
                  </div>
                ))}
                <button onClick={addNpc} className="btn"
                  style={{background:`${ac}12`,border:`1px solid ${ac}26`,borderRadius:9,padding:"7px",color:ac,fontSize:12,fontWeight:600}}>
                  + Add Model
                </button>
                <div style={{display:"flex",gap:7,marginTop:3}}>
                  <button onClick={()=>setStep(1)} className="btn" style={{flex:1,background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:"9px",color:t.muted,fontSize:12,fontWeight:600}}>← Back</button>
                  <button onClick={()=>setStep(3)} className="btn" style={{flex:2,background:ac,border:"none",borderRadius:9,padding:"9px",color:"#fff",fontSize:13,fontWeight:700}}>Next: Review →</button>
                </div>
              </div>
            )}

            {step===3 && (
              <div style={{display:"flex",flexDirection:"column",gap:11}}>
                <div style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:10,padding:"13px 15px"}}>
                  <p style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:9}}>Summary</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px 10px"}}>
                    {[["Name",name||"(not set)"],["Genre",genre],["Custom Models",`${npcs.length}`],["Scripts","5 complete"]].map(([k,v])=>(
                      <div key={k} style={{display:"flex",gap:5}}>
                        <span style={{color:t.muted,fontSize:12}}>{k}:</span>
                        <span style={{color:t.text,fontSize:12,fontWeight:600}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{background:"rgba(34,197,94,.05)",border:"1px solid rgba(34,197,94,.18)",borderRadius:10,padding:"11px 13px"}}>
                  {["5 complete Luau scripts generated","Packaged as a real .rbxlx file","Custom models as named Workspace instances","Open directly in Roblox Studio"].map((s,i)=>(
                    <p key={i} style={{color:"#22c55e",fontSize:12,marginBottom:3}}>✓ {s}</p>
                  ))}
                </div>
                <div style={{display:"flex",gap:7}}>
                  <button onClick={()=>setStep(2)} className="btn" style={{flex:1,background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:"9px",color:t.muted,fontSize:12,fontWeight:600}}>← Back</button>
                  <button onClick={generate} className="btn"
                    style={{flex:2,background:`linear-gradient(135deg,${ac},${ac}cc)`,border:"none",borderRadius:9,padding:"9px",color:"#fff",fontSize:13,fontWeight:700,boxShadow:`0 4px 18px ${ac}33`}}>
                    🎮 Generate & Download
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── UPGRADE MODAL ─────────────────────────────────────────────── */
function UpgradeModal({ t, ac, plan, onClose }) {
  const tiers = [
    { key:"basic",  features:["30 msgs/day","Quick mode only","Basic scripts"] },
    { key:"pro",    features:["500 msgs/day","Deep synthesis mode","Game Wizard","File attachments"] },
    { key:"ultra",  features:["Unlimited","Everything in Pro","Priority queue","Early features"] },
  ];
  return (
    <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,width:"min(660px,96vw)",boxShadow:"0 24px 70px rgba(0,0,0,.6)",overflow:"hidden"}}>
      <div style={{padding:"18px 20px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <span style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:800,color:t.text}}>Upgrade Devix</span>
          <p style={{color:t.muted,fontSize:12,marginTop:2}}>Unlock more for your Roblox projects</p>
        </div>
        <button onClick={onClose} style={{background:"none",border:"none",color:t.muted,fontSize:21,cursor:"pointer"}}>×</button>
      </div>
      <div style={{padding:"18px 20px",display:"flex",gap:10,flexWrap:"wrap"}}>
        {tiers.map(({key,features}) => {
          const p        = PLANS[key];
          const isCur    = plan.id === key;
          return (
            <div key={key} style={{flex:"1 1 170px",background:isCur?`${p.color}0e`:t.s2,border:`1px solid ${isCur?p.color:t.border}`,borderRadius:11,padding:"14px 14px 12px"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:9}}>
                <span style={{fontSize:14}}>{p.badge}</span>
                <span style={{color:p.color,fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13}}>{p.name}</span>
              </div>
              <div style={{color:t.text,fontSize:19,fontWeight:700,marginBottom:10}}>{p.price}</div>
              {features.map(f=><p key={f} style={{color:t.muted,fontSize:12,marginBottom:3}}>✓ {f}</p>)}
              <button className="btn"
                style={{width:"100%",background:isCur?"transparent":p.color,border:`1px solid ${isCur?t.border:p.color}`,borderRadius:8,padding:"7px",color:isCur?t.muted:"#fff",fontSize:12,fontWeight:700,marginTop:10,cursor:isCur?"default":"pointer",opacity:isCur?.5:1}}>
                {isCur?"Current Plan":"Coming Soon"}
              </button>
            </div>
          );
        })}
      </div>
      <p style={{color:t.muted,fontSize:12,textAlign:"center",padding:"0 20px 18px",lineHeight:1.6}}>
        Payments coming soon. Use the owner key in Settings to unlock full access now.
      </p>
    </div>
  );
}

/* ── SETTINGS ──────────────────────────────────────────────────── */
function SettingsPanel({ t, ac, user, plan, theme, setTheme, fontKey, setFontKey, accent, setAccent, onClose, onLogout, onOwnerKey, onUpgrade }) {
  const [ownerIn,  setOwnerIn]  = useState("");
  const [ownerMsg, setOwnerMsg] = useState("");

  const tryKey = () => {
    const ok = onOwnerKey(ownerIn);
    setOwnerMsg(ok ? "👑 Owner access granted!" : "❌ Invalid key");
    setTimeout(()=>setOwnerMsg(""), 2500);
  };

  const Label = ({children}) => (
    <p style={{color:t.muted,fontSize:9,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>{children}</p>
  );

  return (
    <>
      <div style={{padding:"15px 17px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <span style={{fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:800,color:t.text,letterSpacing:1}}>Settings</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:t.muted,fontSize:21,cursor:"pointer"}}>×</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"15px 17px",display:"flex",flexDirection:"column",gap:20}}>

        {/* Profile */}
        <div>
          <Label>Profile</Label>
          <div style={{display:"flex",alignItems:"center",gap:9,background:t.s2,border:`1px solid ${t.border}`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:`${plan.color}1e`,border:`1px solid ${plan.color}3a`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{plan.badge}</div>
            <div style={{flex:1}}>
              <div style={{color:t.text,fontWeight:600,fontSize:13}}>{user?.username}</div>
              <div style={{color:plan.color,fontSize:11,marginTop:1}}>{plan.name} Plan</div>
            </div>
            {plan.id!=="owner" && (
              <button onClick={onUpgrade} className="btn"
                style={{background:`${ac}12`,border:`1px solid ${ac}26`,borderRadius:7,padding:"4px 9px",color:ac,fontSize:11,fontWeight:700}}>
                Upgrade
              </button>
            )}
          </div>
        </div>

        {/* Theme */}
        <div>
          <Label>Theme</Label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {Object.entries(THEMES).map(([k,th])=>(
              <button key={k} onClick={()=>setTheme(k)} className="btn"
                style={{background:th.bg,border:`2px solid ${k===theme?th.accent:th.border}`,borderRadius:8,padding:"6px 11px",color:th.text,fontSize:12,fontWeight:600,flex:"1 1 72px",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:th.accent}}/>{th.name}
              </button>
            ))}
          </div>
        </div>

        {/* Accent */}
        <div>
          <Label>Accent Color</Label>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input type="color" value={accent||t.accent} onChange={e=>setAccent(e.target.value)}
              style={{width:36,height:30,borderRadius:7,border:`1px solid ${t.border}`,background:"transparent",padding:2,cursor:"pointer"}}/>
            <span style={{color:t.muted,fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>{accent||t.accent}</span>
            {accent && <button onClick={()=>setAccent("")} className="btn" style={{background:"none",border:`1px solid ${t.border}`,borderRadius:6,padding:"3px 8px",color:t.muted,fontSize:11}}>Reset</button>}
          </div>
        </div>

        {/* Font */}
        <div>
          <Label>Font</Label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
            {Object.entries(FONTS).map(([k,f])=>(
              <button key={k} onClick={()=>setFontKey(k)} className="btn"
                style={{background:fontKey===k?`${ac}16`:t.s2,border:`1px solid ${fontKey===k?ac:t.border}`,borderRadius:8,padding:"5px 10px",color:fontKey===k?ac:t.muted,fontSize:12,fontWeight:500,fontFamily:f.fam}}>
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* AI Models info */}
        <div>
          <Label>AI Models</Label>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {Object.values(AI_MODELS).map(m=>(
              <div key={m.id} style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:"9px 11px",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:14}}>{m.icon}</span>
                <div>
                  <div style={{color:m.color,fontSize:12,fontWeight:700}}>{m.name}</div>
                  <div style={{color:t.muted,fontSize:11}}>{m.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Owner key */}
        {plan.id !== "owner" && (
          <div>
            <Label>Owner Key</Label>
            <div style={{display:"flex",gap:6}}>
              <input type="password" placeholder="Enter key…" value={ownerIn}
                onChange={e=>setOwnerIn(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&tryKey()}
                style={{flex:1,background:t.s2,border:`1px solid ${t.border}`,borderRadius:8,padding:"9px 11px",color:t.text,fontSize:13}}
                onFocus={e=>e.target.style.borderColor=ac} onBlur={e=>e.target.style.borderColor=t.border}/>
              <button onClick={tryKey} className="btn"
                style={{background:`${ac}16`,border:`1px solid ${ac}2e`,borderRadius:8,padding:"9px 13px",color:ac,fontSize:13,fontWeight:700}}>
                Apply
              </button>
            </div>
            {ownerMsg && <p style={{color:ownerMsg.startsWith("👑")?"#22c55e":"#ef4444",fontSize:12,marginTop:5}}>{ownerMsg}</p>}
          </div>
        )}

        <button onClick={onLogout} className="btn"
          style={{background:"none",border:`1px solid ${t.border}`,borderRadius:10,padding:"9px",color:t.muted,fontSize:13,fontWeight:500,marginTop:4}}>
          Sign Out
        </button>
      </div>
    </>
  );
}
