import { useState, useRef, useEffect, useCallback } from "react";

/* ─────────────────────────────────────────────────────────────
   DEVIX AI — Multi-Model Roblox Studio AI
   Zenith = Qwen 3 vs Gemini Flash (fastest wins)
   Zeno   = All models in parallel, GPT-4.1 synthesizes
   All calls go through /api/chat → serverless proxy
───────────────────────────────────────────────────────────── */

const API_URL = "/api/chat";

const MODELS = {
  zenith: {
    id:"zenith", name:"Devix Zenith", sub:"Multi-Model · Race Mode",
    model:"zenith",
    color:"#e03a3e", glow:"rgba(224,58,62,0.3)", icon:"⚡", badge:"ZENITH",
  },
  zeno: {
    id:"zeno", name:"Devix Zeno", sub:"All Models · Synthesized",
    model:"zeno",
    color:"#a855f7", glow:"rgba(168,85,247,0.3)", icon:"🌟", badge:"ZENO",
  },
};

const THEMES = {
  dark:     { name:"Dark",     bg:"#08080f", surface:"#0f0f1a", surface2:"#14141f", border:"#1e1e30", text:"#e2e2f0", textMuted:"#5c5c8a", accent:"#e03a3e", glow:"rgba(224,58,62,0.3)"  },
  light:    { name:"Light",    bg:"#f0f0f8", surface:"#ffffff",  surface2:"#e8e8f5", border:"#d0d0e8", text:"#111124", textMuted:"#7777aa", accent:"#c42a2e", glow:"rgba(196,42,46,0.2)"  },
  midnight: { name:"Midnight", bg:"#03030b", surface:"#07071a",  surface2:"#0b0b28", border:"#111130", text:"#b8b8ff", textMuted:"#4040aa", accent:"#6644ff", glow:"rgba(102,68,255,0.3)" },
  neon:     { name:"Neon",     bg:"#020510", surface:"#070e20",  surface2:"#0c1430", border:"#121e40", text:"#c8e0ff", textMuted:"#445588", accent:"#00d9a0", glow:"rgba(0,217,160,0.3)"  },
};

const PLAN_INFO = {
  basic: { label:"Devix Basic", badge:"◆", color:"#6366f1" },
  ultra: { label:"Devix Ultra", badge:"⚡", color:"#e03a3e" },
  owner: { label:"Owner",       badge:"👑", color:"#ff9900" },
};

// Owner key — stored in settings, never shown on login screen
const OWNER_KEY = "sullyz";

/* ── STORAGE HELPERS ── */
function getUsers() {
  try { return JSON.parse(localStorage.getItem("devix_users") || "{}"); } catch { return {}; }
}
function saveUsers(users) {
  localStorage.setItem("devix_users", JSON.stringify(users));
}
function getSession() {
  try { return JSON.parse(localStorage.getItem("devix_session") || "null"); } catch { return null; }
}
function saveSession(user) {
  localStorage.setItem("devix_session", JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem("devix_session");
}

/* ── SYSTEM PROMPTS ── */
const BASE = `You are Devix — an AI built specifically for Roblox Studio development.
You are NOT Claude, GPT, or any other known AI. You are Devix, created for Roblox developers.
You have two tiers: Devix Zenith (fast) and Devix Zeno (deep/powerful).

## Expertise
- Luau scripting (Roblox's language — always use Luau, NOT generic Lua)
- Roblox Studio: game architecture, services, workflows
- Game systems: combat, inventory, DataStore, GUIs, economy, leaderboards, pets, trading, admin, anti-cheat
- Roblox APIs: DataStoreService, TweenService, RemoteEvents, RemoteFunctions, RunService, UserInputService, MessagingService, CollectionService, PhysicsService, Players, Workspace, etc.
- Server/Client architecture: security patterns, input validation, remote event design
- Terrain & maps: procedural generation with Workspace.Terrain, biomes, noise functions

## Language Rules
- ALWAYS write Luau (not Python, not JavaScript, not generic Lua)
- Use task.wait() not wait(), task.spawn() not spawn(), task.delay() not delay()
- Use type annotations where helpful: local x: number = 5
- Use :: for type casting when needed
- Format ALL code in \`\`\`lua code blocks

## Conversation Style
- Be friendly and conversational — you're like a knowledgeable teammate
- Answer questions naturally — don't always dump code if a simple explanation works
- When code IS needed: write COMPLETE, working scripts — zero placeholders, zero TODOs
- Add clear comments to all scripts
- For full game requests: give folder structure + every required script

## Hard Rules
- Never write NSFW content
- Never write grief/crash exploit scripts
- No real-world harm instructions`;

const SYSTEM_QUICK = BASE + `

## Mode: Quick Answer (Devix Zenith)
Be concise and direct. Give the answer fast. Keep explanations brief.
For code: clean and complete, minimal commentary. Get to the point.`;

const SYSTEM_DEEP = BASE + `

## Mode: Deep Think (Devix Zeno)
Be thorough and comprehensive. Think through the problem fully.
For code: write the most complete, optimized, well-commented version possible.
Explain your approach, cover edge cases, suggest improvements.
For full games: provide complete architecture with every file needed.
Go above and beyond — give the user more than they expected.`;

const QUICK_ACTIONS = [
  { icon:"🎮", label:"Full Game",    prompt:"Create a complete Roblox game — full folder structure and all scripts" },
  { icon:"⚔️", label:"Combat",      prompt:"Build a complete combat system with hitboxes, damage, animations and effects" },
  { icon:"🗺️", label:"Terrain",     prompt:"Generate a procedural map with multiple biomes using the Roblox Terrain API" },
  { icon:"💾", label:"DataStore",   prompt:"Create a robust DataStore save/load system with retry logic and error handling" },
  { icon:"🎒", label:"Inventory",   prompt:"Build a full inventory system with drag-and-drop GUI and item management" },
  { icon:"🛡️", label:"Admin",       prompt:"Create a complete admin system with rank-based permissions and GUI panel" },
  { icon:"🏆", label:"Leaderboard", prompt:"Build a persistent leaderboard with DataStore and live updates" },
  { icon:"💰", label:"Shop",        prompt:"Create an in-game shop with currency, gamepasses and purchase UI" },
];

function parseMessage(content) {
  const parts = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ type:"text", content:content.slice(last, m.index) });
    parts.push({ type:"code", lang:m[1]||"lua", content:m[2].trim() });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type:"text", content:content.slice(last) });
  return parts;
}

async function callDevix(mode, messages) {
  const sys = mode === "deep" ? SYSTEM_DEEP : SYSTEM_QUICK;
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      mode,
      max_tokens: mode === "deep" ? 2048 : 1024,
      system: sys,
      messages,
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error || `Error ${res.status}`);
  }
  const d = await res.json();
  return d.text || "";
}

/* ══ CSS ══════════════════════════════════════════════════ */
const makeCSS = (t, accent) => {
  const a = accent || t.accent;
  const g = accent ? accent + "44" : t.glow;
  return `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;overflow:hidden;}
body{font-family:'Inter',sans-serif;background:${t.bg};color:${t.text};}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:rgba(128,128,200,.2);border-radius:4px;}
textarea,input,button{font-family:'Inter',sans-serif;}
textarea:focus,input:focus{outline:none;}
button{cursor:pointer;}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideInLeft{from{opacity:0;transform:translateX(-100%)}to{opacity:1;transform:translateX(0)}}
@keyframes slideInRight{from{opacity:0;transform:translateX(26px)}to{opacity:1;transform:translateX(0)}}
@keyframes slideInUp{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:translateY(0)}}
@keyframes scaleIn{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
@keyframes msgIn{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes codeIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
@keyframes dot{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-6px);opacity:1}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes shimmer{0%{background-position:-400% center}100%{background-position:400% center}}
@keyframes orb1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,-50px) scale(1.12)}}
@keyframes orb2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-50px,70px) scale(.9)}}
@keyframes orb3{0%,100%{transform:translate(0,0)}50%{transform:translate(40px,40px)}}
@keyframes gradShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes cardFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes notif{0%{opacity:0;transform:translateX(-50%) translateY(-14px) scale(.94)}15%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}80%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-10px) scale(.97)}}
@keyframes zenoBorder{0%,100%{border-color:#a855f744}50%{border-color:#a855f7aa}}
@keyframes wave{0%{transform:scaleY(.3)}20%{transform:scaleY(1)}40%{transform:scaleY(.3)}100%{transform:scaleY(.3)}}
.fade-up{animation:fadeUp .4s cubic-bezier(.22,1,.36,1) both}
.fade-in{animation:fadeIn .3s ease both}
.scale-in{animation:scaleIn .28s cubic-bezier(.22,1,.36,1) both}
.msg-in{animation:msgIn .36s cubic-bezier(.22,1,.36,1) both}
.code-in{animation:codeIn .28s ease both}
.slide-r{animation:slideInRight .28s cubic-bezier(.22,1,.36,1) both}
.slide-up{animation:slideInUp .3s cubic-bezier(.22,1,.36,1) both}
.d1{animation:dot 1.3s ease-in-out 0s infinite}
.d2{animation:dot 1.3s ease-in-out .16s infinite}
.d3{animation:dot 1.3s ease-in-out .32s infinite}
.w1{animation:wave 1.4s ease-in-out 0s infinite}
.w2{animation:wave 1.4s ease-in-out .1s infinite}
.w3{animation:wave 1.4s ease-in-out .2s infinite}
.w4{animation:wave 1.4s ease-in-out .3s infinite}
.w5{animation:wave 1.4s ease-in-out .4s infinite}
.logo-text{background:linear-gradient(90deg,#fff 0%,${a} 40%,#fff 60%,${a} 80%,#fff 100%);background-size:400% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 5s linear infinite}
.btn{transition:all .16s ease;}
.btn:hover{filter:brightness(1.12);transform:translateY(-1px)}
.btn:active{filter:brightness(.94);transform:translateY(1px)}
.sidebar-li{transition:all .14s ease;}
.sidebar-li:hover{padding-left:17px!important;background:${t.surface2}!important}
.copy-btn{opacity:0;transition:opacity .18s}
.code-wrap:hover .copy-btn{opacity:1}
.input-wrap{transition:box-shadow .2s,border-color .2s;}
.input-wrap:focus-within{box-shadow:0 0 0 2px ${g},0 6px 28px rgba(0,0,0,.3)!important;border-color:${a}!important}
.quick-btn{transition:all .18s ease;}
.quick-btn:hover{transform:translateY(-2px);background:${t.surface2}!important;border-color:${a}!important;color:${t.text}!important}
.notif-pop{animation:notif 3s ease forwards}
.spin{animation:spin 1s linear infinite;display:inline-block}
.glow-pulse{animation:pulse 3s ease infinite}
.zeno-input{animation:zenoBorder 2s ease infinite}
@media(max-width:768px){.dt-only{display:none!important}}
@media(min-width:769px){.mb-only{display:none!important}}
`; };

/* ══ ROOT ══════════════════════════════════════════════════ */
export default function DevixApp() {
  const [page,         setPage]         = useState("loading");
  const [isSignup,     setIsSignup]     = useState(false);
  const [form,         setForm]         = useState({ username:"", password:"" });
  const [loginErr,     setLoginErr]     = useState("");
  const [user,         setUser]         = useState(null);
  const [themeName,    setThemeName]    = useState("dark");
  const [customAccent, setCustomAccent] = useState("");
  const [convs,        setConvs]        = useState([{ id:1, title:"New Chat", messages:[] }]);
  const [activeId,     setActiveId]     = useState(1);
  const [input,        setInput]        = useState("");
  const [isLoading,    setIsLoading]    = useState(false);
  const [files,        setFiles]        = useState([]);
  const [mode,         setMode]         = useState("quick");
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [mobileNav,    setMobileNav]    = useState(false);
  const [copied,       setCopied]       = useState({});
  const [notif,        setNotif]        = useState(null);

  const endRef  = useRef(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  const t   = THEMES[themeName];
  const css = makeCSS(t, customAccent);
  const a   = customAccent || t.accent;
  const g   = customAccent ? customAccent+"44" : t.glow;

  const isDeep     = mode === "deep";
  const curModel   = isDeep ? MODELS.zeno : MODELS.zenith;
  const activeConv = convs.find(c => c.id === activeId);
  const msgs       = activeConv?.messages || [];
  const plan       = PLAN_INFO[user?.plan || "ultra"];

  // Restore session on load
  useEffect(() => {
    const session = getSession();
    if (session && session.username) {
      setUser(session);
      setPage("chat");
    } else {
      setPage("login");
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, isLoading]);

  const toast = useCallback((msg) => {
    setNotif(msg); setTimeout(() => setNotif(null), 3000);
  }, []);

  const login = () => {
    const username = form.username.trim();
    const password = form.password;
    if (!username || !password) { setLoginErr("Fill in all fields"); return; }

    const users = getUsers();

    if (isSignup) {
      // Sign up
      if (users[username.toLowerCase()]) {
        setLoginErr("Username already taken — try another or sign in");
        return;
      }
      users[username.toLowerCase()] = { username, password, plan:"ultra" };
      saveUsers(users);
      const newUser = { username, plan:"ultra" };
      setUser(newUser);
      saveSession(newUser);
      setPage("chat");
      toast(`Welcome to Devix, ${username}! ⚡`);
    } else {
      // Sign in
      const record = users[username.toLowerCase()];
      if (!record) {
        setLoginErr("Account not found — sign up first");
        return;
      }
      if (record.password !== password) {
        setLoginErr("Wrong password");
        return;
      }
      const loggedIn = { username: record.username, plan: record.plan || "ultra" };
      setUser(loggedIn);
      saveSession(loggedIn);
      setPage("chat");
      toast(`Welcome back, ${record.username}! ⚡`);
    }
  };

  const applyOwnerKey = (key) => {
    if (key === OWNER_KEY && user) {
      const updated = { ...user, plan:"owner" };
      const users = getUsers();
      if (users[user.username.toLowerCase()]) {
        users[user.username.toLowerCase()].plan = "owner";
        saveUsers(users);
      }
      setUser(updated);
      saveSession(updated);
      toast("👑 Owner access granted!");
    }
  };

  const updateConv = useCallback((newMsgs) => {
    setConvs(prev => prev.map(c => c.id===activeId ? {...c, messages:newMsgs} : c));
  }, [activeId]);

  const sendMsg = async () => {
    if ((!input.trim() && !files.length) || isLoading) return;
    const ts  = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
    const userMsg = { id:Date.now(), role:"user", content:input, files:[...files], ts };
    const next = [...msgs, userMsg];
    updateConv(next);
    if (msgs.length===0 && input.trim()) {
      const title = input.trim().slice(0,38)+(input.length>38?"…":"");
      setConvs(prev => prev.map(c => c.id===activeId ? {...c,title} : c));
    }
    setInput(""); setFiles([]); setIsLoading(true);
    if (textRef.current) textRef.current.style.height="auto";

    const apiMsgs = next.map(m => ({
      role: m.role,
      content: m.content + (m.files?.length
        ? "\n\n[Attached Files]\n" + m.files.map(f=>`--- ${f.name} ---\n${f.content}`).join("\n\n")
        : ""),
    }));

    try {
      const text = await callDevix(mode, apiMsgs);
      updateConv([...next, {
        id:Date.now()+1, role:"assistant",
        content: text || "No response.",
        modelId: curModel.id,
        mode,
        ts: new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
      }]);
    } catch (err) {
      updateConv([...next, {
        id:Date.now()+1, role:"assistant",
        content:`⚠️ ${err.message}`,
        modelId: curModel.id, mode,
        ts: new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
      }]);
    }
    setIsLoading(false);
  };

  const uploadFiles = async (fl) => {
    const arr = [];
    for (const f of Array.from(fl)) {
      try { arr.push({ name:f.name, content:await f.text() }); }
      catch { arr.push({ name:f.name, content:"[Binary]" }); }
    }
    setFiles(p=>[...p,...arr]); toast(`${arr.length} file(s) attached`);
  };

  const newChat = () => {
    const id = Date.now();
    setConvs(p=>[...p,{id,title:"New Chat",messages:[]}]);
    setActiveId(id); setMobileNav(false);
  };

  const delConv = (id) => {
    if (convs.length===1) return;
    const nxt = convs.filter(c=>c.id!==id);
    setConvs(nxt);
    if (activeId===id) setActiveId(nxt[nxt.length-1].id);
  };

  const copyCode = (code, key) => {
    navigator.clipboard?.writeText(code);
    setCopied(p=>({...p,[key]:true}));
    setTimeout(()=>setCopied(p=>({...p,[key]:false})),2000);
    toast("Copied!");
  };

  // Loading screen while checking session
  if (page === "loading") return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100dvh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div className="glow-pulse" style={{width:56,height:56,borderRadius:16,background:`linear-gradient(135deg,${a},${a}88)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 12px 40px ${g}`}}>
          <span style={{color:"#fff",fontFamily:"Orbitron",fontSize:26,fontWeight:900}}>D</span>
        </div>
      </div>
    </>
  );

  /* ── LOGIN ── */
  if (page==="login") return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100dvh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 16px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
          <div style={{position:"absolute",width:"55vw",height:"55vw",maxWidth:560,maxHeight:560,borderRadius:"50%",background:`radial-gradient(circle,${a}14,transparent 65%)`,top:"-18%",left:"-14%",animation:"orb1 22s ease infinite"}}/>
          <div style={{position:"absolute",width:"45vw",height:"45vw",maxWidth:460,maxHeight:460,borderRadius:"50%",background:"radial-gradient(circle,#a855f70d,transparent 60%)",bottom:"-14%",right:"-10%",animation:"orb2 28s ease infinite"}}/>
          <div style={{position:"absolute",width:"35vw",height:"35vw",maxWidth:360,maxHeight:360,borderRadius:"50%",background:`radial-gradient(circle,${a}08,transparent 55%)`,top:"38%",right:"22%",animation:"orb3 19s ease infinite"}}/>
          <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${t.border}12 1px,transparent 1px),linear-gradient(90deg,${t.border}12 1px,transparent 1px)`,backgroundSize:"52px 52px"}}/>
        </div>

        <div style={{width:"100%",maxWidth:960,zIndex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:28}}>
          <div className="fade-up" style={{textAlign:"center"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:14,marginBottom:10}}>
              <div className="glow-pulse" style={{width:56,height:56,borderRadius:16,background:`linear-gradient(135deg,${a},${a}88)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 12px 40px ${g}`}}>
                <span style={{color:"#fff",fontFamily:"Orbitron",fontSize:26,fontWeight:900}}>D</span>
              </div>
              <span className="logo-text" style={{fontFamily:"Orbitron",fontSize:"clamp(28px,5.5vw,48px)",fontWeight:900,letterSpacing:5}}>DEVIX</span>
            </div>
            <p style={{color:t.textMuted,fontSize:"clamp(12px,1.8vw,14px)",marginBottom:16}}>Roblox Studio AI — Scripts, Systems, Full Games</p>
            <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
              {Object.values(MODELS).map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:7,background:`${m.color}14`,border:`1px solid ${m.color}33`,borderRadius:22,padding:"6px 16px"}}>
                  <span style={{color:m.color,fontSize:14}}>{m.icon}</span>
                  <div>
                    <div style={{color:m.color,fontFamily:"Orbitron",fontSize:11,fontWeight:800}}>{m.name}</div>
                    <div style={{color:t.textMuted,fontSize:10}}>{m.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{display:"flex",gap:22,width:"100%",alignItems:"flex-start",flexWrap:"wrap",justifyContent:"center"}}>
            {/* Auth */}
            <div className="scale-in" style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:22,padding:"clamp(22px,4vw,36px) clamp(20px,4vw,38px)",width:"100%",maxWidth:400,boxShadow:"0 30px 80px rgba(0,0,0,.5)",flexShrink:0}}>
              <div style={{display:"flex",background:t.surface2,borderRadius:12,padding:4,marginBottom:22}}>
                {["Sign In","Sign Up"].map((tab,i)=>(
                  <button key={tab} onClick={()=>{setIsSignup(i===1);setLoginErr("");}} className="btn"
                    style={{flex:1,padding:"8px 0",borderRadius:9,border:"none",background:isSignup===(i===1)?a:"transparent",color:isSignup===(i===1)?"#fff":t.textMuted,fontSize:14,fontWeight:700,transition:"all .2s"}}>
                    {tab}
                  </button>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:11}}>
                <LField placeholder="Username" value={form.username} onChange={v=>setForm(p=>({...p,username:v}))} t={t} accent={a}/>
                <LField placeholder="Password" type="password" value={form.password} onChange={v=>setForm(p=>({...p,password:v}))} t={t} accent={a} onEnter={login}/>
                {loginErr&&<p className="fade-in" style={{color:a,fontSize:13,textAlign:"center"}}>{loginErr}</p>}
                <button onClick={login} className="btn"
                  style={{background:`linear-gradient(135deg,${a},${a}aa)`,border:"none",borderRadius:12,padding:14,color:"#fff",fontFamily:"Orbitron",fontSize:14,fontWeight:700,letterSpacing:2,marginTop:4,boxShadow:`0 8px 28px ${g}`,backgroundSize:"200% 200%",animation:"gradShift 4s ease infinite"}}>
                  {isSignup?"GET STARTED →":"LAUNCH DEVIX →"}
                </button>
              </div>
            </div>

            {/* Feature cards */}
            <div style={{display:"flex",flexDirection:"column",gap:11,flex:"1 1 260px",maxWidth:500}}>
              {[
                {icon:"⚡",title:"Race Mode",       sub:"Devix Zenith", color:MODELS.zenith.color, desc:"Multiple fast models race each other — you get the fastest correct answer instantly."},
                {icon:"🌟",title:"Synthesis Mode",  sub:"Devix Zeno",   color:MODELS.zeno.color,   desc:"All AI models run in parallel and their answers are synthesized into the single best response."},
                {icon:"🎮",title:"Roblox Focused",  sub:"Always Luau",  color:"#22c55e",            desc:"Always knows Roblox Studio, Luau syntax, Roblox services and APIs. Built for devs."},
              ].map((c,i)=>(
                <div key={c.title} className="fade-up" style={{background:t.surface,border:`1px solid ${c.color}28`,borderRadius:16,padding:"15px 18px",animationDelay:`${i*.08}s`}}>
                  <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:7}}>
                    <div style={{width:38,height:38,borderRadius:10,background:`${c.color}18`,border:`1px solid ${c.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{c.icon}</div>
                    <div>
                      <div style={{color:t.text,fontWeight:700,fontSize:14}}>{c.title}</div>
                      <div style={{color:c.color,fontSize:11,fontWeight:600}}>{c.sub}</div>
                    </div>
                  </div>
                  <p style={{color:t.textMuted,fontSize:12,lineHeight:1.65}}>{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  /* ── CHAT ── */
  return (
    <>
      <style>{css}</style>
      <div style={{height:"100dvh",display:"flex",background:t.bg,color:t.text,overflow:"hidden"}}>

        {/* Desktop sidebar */}
        {sidebarOpen&&(
          <div className="dt-only" style={{width:252,background:t.surface,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",flexShrink:0,animation:"slideInLeft .28s cubic-bezier(.22,1,.36,1)"}}>
            <Sidebar t={t} convs={convs} activeId={activeId} setActiveId={setActiveId} delConv={delConv} newChat={newChat} user={user} setShowSettings={setShowSettings} accent={a}/>
          </div>
        )}

        {/* Mobile bottom sheet */}
        {mobileNav&&(
          <div className="mb-only fade-in" onClick={()=>setMobileNav(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",zIndex:199}}>
            <div className="slide-up" onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:0,left:0,right:0,height:"82dvh",background:t.surface,borderRadius:"20px 20px 0 0",borderTop:`1px solid ${t.border}`,display:"flex",flexDirection:"column"}}>
              <div style={{width:40,height:4,borderRadius:2,background:t.border,margin:"12px auto 0"}}/>
              <Sidebar t={t} convs={convs} activeId={activeId} setActiveId={id=>{setActiveId(id);setMobileNav(false)}} delConv={delConv} newChat={newChat} user={user} setShowSettings={setShowSettings} accent={a}/>
            </div>
          </div>
        )}

        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
          {/* Header */}
          <div style={{padding:"10px 14px",borderBottom:`1px solid ${t.border}`,background:t.surface,display:"flex",alignItems:"center",gap:9,flexShrink:0}}>
            <button onClick={()=>window.innerWidth<769?setMobileNav(p=>!p):setSidebarOpen(p=>!p)} className="btn"
              style={{background:"none",border:`1px solid ${t.border}`,borderRadius:8,padding:"7px 10px",color:t.textMuted,fontSize:16,lineHeight:1}}>☰</button>

            <div style={{display:"flex",alignItems:"center",gap:7,background:isDeep?"linear-gradient(135deg,#a855f714,#6644ff0a)":`${curModel.color}10`,border:`1px solid ${isDeep?"#a855f733":`${curModel.color}33`}`,borderRadius:10,padding:"6px 12px",flexShrink:0}}>
              <span style={{fontSize:14}}>{curModel.icon}</span>
              <span className="dt-only" style={{color:isDeep?"#c084fc":curModel.color,fontFamily:"Orbitron",fontSize:11,fontWeight:800}}>{curModel.name}</span>
              <span style={{color:isDeep?"#c084fc":curModel.color,background:isDeep?"#a855f722":`${curModel.color}22`,fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:3,fontFamily:"Orbitron"}}>{curModel.badge}</span>
            </div>

            <div style={{flex:1,minWidth:0}}>
              <p style={{color:t.textMuted,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeConv?.title||"New Chat"}</p>
            </div>

            <button onClick={()=>setShowSettings(true)} className="btn" style={{background:t.surface2,border:`1px solid ${t.border}`,borderRadius:9,padding:"7px 11px",color:t.textMuted,fontSize:13}}>⚙</button>
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:"auto",padding:"16px 0"}}>
            {msgs.length===0
              ? <EmptyState t={t} setInput={v=>{setInput(v);textRef.current?.focus();}} accent={a} glow={g}/>
              : (
                <div style={{maxWidth:800,margin:"0 auto",padding:"0 14px"}}>
                  {msgs.map(msg=>(
                    <MsgBubble key={msg.id} msg={msg} t={t} copyCode={copyCode} copied={copied} accent={a} glow={g}/>
                  ))}
                  {isLoading&&<ThinkingBubble t={t} model={curModel} mode={mode}/>}
                  <div ref={endRef} style={{height:8}}/>
                </div>
              )
            }
          </div>

          {/* Input */}
          <div style={{padding:"8px 12px 12px",background:t.surface,borderTop:`1px solid ${t.border}`,flexShrink:0}}>
            <div style={{maxWidth:800,margin:"0 auto"}}>
              {files.length>0&&(
                <div style={{display:"flex",gap:6,marginBottom:7,flexWrap:"wrap"}}>
                  {files.map((f,i)=>(
                    <div key={i} className="fade-in" style={{background:t.surface2,border:`1px solid ${t.border}`,borderRadius:8,padding:"3px 9px",display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:11}}>📄</span>
                      <span style={{color:t.textMuted,fontSize:11,maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                      <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:t.textMuted,fontSize:14,lineHeight:1,padding:0}}>×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className={`input-wrap${isDeep?" zeno-input":""}`} style={{background:t.surface2,border:`1px solid ${isDeep?"#a855f744":t.border}`,borderRadius:16,overflow:"hidden"}}>
                <textarea ref={textRef} value={input}
                  onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,180)+"px";}}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg();}}}
                  placeholder={isDeep?"Ask Devix Zeno — all models think, one synthesized answer…":"Ask Devix Zenith — fastest model wins…"}
                  rows={1}
                  style={{width:"100%",background:"transparent",border:"none",padding:"12px 14px 5px",color:t.text,fontSize:14,resize:"none",lineHeight:1.65,maxHeight:180,overflowY:"auto",minHeight:48}}/>

                <div style={{display:"flex",alignItems:"center",padding:"5px 10px 10px",gap:7}}>
                  <input type="file" ref={fileRef} onChange={e=>uploadFiles(e.target.files)} multiple accept=".lua,.rbxl,.rbxlx,.txt,.json,.md" style={{display:"none"}}/>
                  <button onClick={()=>fileRef.current?.click()} className="btn"
                    style={{background:"none",border:`1px solid ${t.border}`,borderRadius:8,padding:"6px 11px",color:t.textMuted,fontSize:12,display:"flex",alignItems:"center",gap:5,fontWeight:600}}>
                    📎 <span className="dt-only">Upload</span>
                  </button>

                  <div style={{display:"flex",background:t.surface,border:`1px solid ${t.border}`,borderRadius:22,padding:3,gap:2}}>
                    <button onClick={()=>setMode("quick")} className="btn"
                      style={{background:!isDeep?`${MODELS.zenith.color}22`:"transparent",border:`1px solid ${!isDeep?`${MODELS.zenith.color}55`:"transparent"}`,borderRadius:18,padding:"5px 12px",color:!isDeep?MODELS.zenith.color:t.textMuted,fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,transition:"all .2s",fontFamily:"Orbitron",letterSpacing:.3}}>
                      ⚡ <span className="dt-only">Quick</span>
                    </button>
                    <button onClick={()=>setMode("deep")} className="btn"
                      style={{background:isDeep?"linear-gradient(135deg,#a855f722,#6644ff18)":"transparent",border:`1px solid ${isDeep?"#a855f755":"transparent"}`,borderRadius:18,padding:"5px 12px",color:isDeep?"#c084fc":t.textMuted,fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,transition:"all .2s",fontFamily:"Orbitron",letterSpacing:.3}}>
                      🌟 <span className="dt-only">Deep</span>
                    </button>
                  </div>

                  <div style={{flex:1}}/>
                  <button onClick={sendMsg} disabled={isLoading} className="btn"
                    style={{background:isDeep?"linear-gradient(135deg,#a855f7,#6644ff)":`linear-gradient(135deg,${a},${a}cc)`,border:"none",borderRadius:11,padding:"9px 18px",color:"#fff",fontFamily:"Orbitron",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:7,letterSpacing:.5,boxShadow:isDeep?"0 4px 18px #a855f744":`0 4px 18px ${g}`,opacity:isLoading?.6:1,backgroundSize:"200% 200%",animation:"gradShift 4s ease infinite"}}>
                    {isLoading?<span className="spin">⟳</span>:"↑"}
                    <span className="dt-only">{isLoading?"Thinking…":"Send"}</span>
                  </button>
                </div>
              </div>

              <div style={{marginTop:7,display:"flex",gap:6,overflowX:"auto",paddingBottom:2}}>
                {QUICK_ACTIONS.map(qa=>(
                  <button key={qa.label} onClick={()=>{setInput(qa.prompt);textRef.current?.focus();}} className="quick-btn"
                    style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:20,padding:"5px 12px",color:t.textMuted,fontSize:12,display:"flex",alignItems:"center",gap:5,whiteSpace:"nowrap",fontWeight:500,flexShrink:0}}>
                    <span>{qa.icon}</span><span>{qa.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Settings */}
        {showSettings&&(
          <div className="fade-in" onClick={()=>setShowSettings(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:200}}>
            <div className="slide-r" onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:0,width:"min(420px,100vw)",height:"100%",background:t.surface,borderLeft:`1px solid ${t.border}`,display:"flex",flexDirection:"column"}}>
              <SettingsPanel t={t} user={user} plan={plan} themeName={themeName} setThemeName={setThemeName} customAccent={customAccent} setCustomAccent={setCustomAccent}
                onClose={()=>setShowSettings(false)}
                onLogout={()=>{setUser(null);clearSession();setPage("login");setShowSettings(false);}}
                onOwnerKey={applyOwnerKey}
                accent={a}/>
            </div>
          </div>
        )}

        {notif&&(
          <div className="notif-pop" style={{position:"fixed",top:18,left:"50%",background:t.surface,border:`1px solid ${a}44`,borderRadius:22,padding:"9px 20px",color:t.text,fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 8px 32px rgba(0,0,0,.4)",display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:a,animation:"pulse 1s infinite"}}/>
            {notif}
          </div>
        )}
      </div>
    </>
  );
}

/* ══ SUB-COMPONENTS ══════════════════════════════════════ */
function Sidebar({t,convs,activeId,setActiveId,delConv,newChat,user,setShowSettings,accent}){
  return(
    <>
      <div style={{padding:"15px 15px 12px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div className="glow-pulse" style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${accent},${accent}88)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{color:"#fff",fontFamily:"Orbitron",fontSize:14,fontWeight:900}}>D</span>
        </div>
        <span style={{fontFamily:"Orbitron",fontSize:16,fontWeight:900,color:t.text,letterSpacing:3}}>DEVIX</span>
      </div>
      <div style={{padding:"10px 10px 4px"}}>
        <button onClick={newChat} className="btn"
          style={{width:"100%",background:`${accent}18`,border:`1px solid ${accent}33`,borderRadius:10,padding:"9px 14px",color:accent,fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:17}}>＋</span> New Chat
        </button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"4px 8px"}}>
        <p style={{color:t.textMuted,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",padding:"10px 6px 6px",fontFamily:"Orbitron"}}>Chats</p>
        {[...convs].reverse().map(conv=>(
          <div key={conv.id} className="sidebar-li" onClick={()=>setActiveId(conv.id)}
            style={{padding:"9px 10px",borderRadius:9,cursor:"pointer",marginBottom:2,background:conv.id===activeId?`${accent}16`:"transparent",borderLeft:`2px solid ${conv.id===activeId?accent:"transparent"}`,display:"flex",alignItems:"center",gap:7}}>
            <span style={{fontSize:13,flexShrink:0}}>💬</span>
            <span style={{color:conv.id===activeId?t.text:t.textMuted,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{conv.title}</span>
            {convs.length>1&&(
              <button onClick={e=>{e.stopPropagation();delConv(conv.id);}}
                style={{background:"none",border:"none",color:t.textMuted,cursor:"pointer",fontSize:15,padding:0,lineHeight:1,opacity:0,transition:"opacity .15s"}}
                onMouseOver={e=>e.currentTarget.style.opacity=1}
                onMouseOut={e=>e.currentTarget.style.opacity=0}>×</button>
            )}
          </div>
        ))}
      </div>
      <div style={{borderTop:`1px solid ${t.border}`,padding:"12px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${accent},${accent}66)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15,color:"#fff",fontWeight:700,fontFamily:"Orbitron"}}>
            {user?.username?.[0]?.toUpperCase()||"?"}
          </div>
          <div style={{minWidth:0,flex:1}}>
            <div style={{color:t.text,fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.username}</div>
          </div>
          <button onClick={()=>setShowSettings(true)} className="btn" style={{background:"none",border:"none",color:t.textMuted,fontSize:17,padding:4}}>⚙</button>
        </div>
      </div>
    </>
  );
}

function EmptyState({t,setInput,accent,glow}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%",padding:"24px 16px",animation:"fadeIn .5s ease"}}>
      <div style={{width:68,height:68,borderRadius:18,background:`linear-gradient(135deg,${accent},${accent}88)`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,boxShadow:`0 16px 54px ${glow}`,animation:"cardFloat 4s ease infinite"}}>
        <span style={{color:"#fff",fontFamily:"Orbitron",fontSize:32,fontWeight:900}}>D</span>
      </div>
      <h2 className="fade-up" style={{fontFamily:"Orbitron",fontSize:"clamp(17px,4vw,24px)",fontWeight:900,color:t.text,marginBottom:8,letterSpacing:2,textAlign:"center"}}>What shall we build?</h2>
      <p className="fade-up" style={{color:t.textMuted,fontSize:14,marginBottom:10,textAlign:"center",maxWidth:400,lineHeight:1.8,animationDelay:".06s"}}>Your Roblox Studio co-pilot. Scripts, systems, full games — just ask.</p>
      <div className="fade-up" style={{display:"flex",gap:8,marginBottom:26,animationDelay:".1s"}}>
        <span style={{background:`${MODELS.zenith.color}14`,border:`1px solid ${MODELS.zenith.color}33`,borderRadius:20,padding:"4px 12px",color:MODELS.zenith.color,fontSize:12,fontWeight:700}}>⚡ Race Mode</span>
        <span style={{background:"#a855f714",border:"1px solid #a855f733",borderRadius:20,padding:"4px 12px",color:"#c084fc",fontSize:12,fontWeight:700}}>🌟 Synthesis Mode</span>
      </div>
      <div className="fade-up" style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",maxWidth:540,animationDelay:".14s"}}>
        {QUICK_ACTIONS.map(qa=>(
          <button key={qa.label} onClick={()=>setInput(qa.prompt)} className="quick-btn"
            style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:22,padding:"9px 16px",color:t.textMuted,fontSize:13,display:"flex",alignItems:"center",gap:7,fontWeight:600}}>
            <span style={{fontSize:15}}>{qa.icon}</span><span>{qa.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingBubble({t,model,mode}){
  const isDeep=mode==="deep";
  const color=isDeep?"#a855f7":model.color;
  return(
    <div className="msg-in" style={{display:"flex",gap:10,marginBottom:20}}>
      <div style={{width:32,height:32,borderRadius:9,background:isDeep?"linear-gradient(135deg,#a855f7,#6644ff)":`linear-gradient(135deg,${color},${color}77)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,animation:"pulse 2s ease infinite",boxShadow:`0 4px 16px ${color}44`,fontSize:14}}>
        {model.icon}
      </div>
      <div style={{background:t.surface,border:`1px solid ${isDeep?"#a855f733":t.border}`,borderRadius:"4px 16px 16px 16px",padding:"12px 18px",display:"flex",alignItems:"center",gap:12}}>
        {isDeep?(
          <>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <span style={{color:"#c084fc",fontSize:13,fontWeight:700}}>{model.name} — Synthesis Mode</span>
              <span style={{color:t.textMuted,fontSize:11}}>All models thinking in parallel…</span>
            </div>
            <div style={{display:"flex",gap:3,alignItems:"center",height:20}}>
              {["w1","w2","w3","w4","w5"].map(c=>(
                <div key={c} className={c} style={{width:3,height:16,borderRadius:2,background:"#a855f7",transformOrigin:"bottom"}}/>
              ))}
            </div>
          </>
        ):(
          <>
            <span style={{color:t.textMuted,fontSize:13,fontWeight:500}}>{model.name} is racing…</span>
            <div style={{display:"flex",gap:5,alignItems:"flex-end",height:14}}>
              <div className="d1" style={{width:7,height:7,borderRadius:"50%",background:color}}/>
              <div className="d2" style={{width:7,height:7,borderRadius:"50%",background:color}}/>
              <div className="d3" style={{width:7,height:7,borderRadius:"50%",background:color}}/>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MsgBubble({msg,t,copyCode,copied,accent,glow}){
  const isUser=msg.role==="user";
  const parts=isUser?null:parseMessage(msg.content);
  const isDeep=msg.mode==="deep";
  const mdl=MODELS[msg.modelId]||MODELS.zenith;
  const bc=isDeep?"#a855f7":mdl.color;
  return(
    <div className="msg-in" style={{display:"flex",gap:10,marginBottom:22,flexDirection:isUser?"row-reverse":"row"}}>
      {!isUser&&(
        <div style={{width:32,height:32,borderRadius:9,background:isDeep?"linear-gradient(135deg,#a855f7,#6644ff)":`linear-gradient(135deg,${bc},${bc}77)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:18,boxShadow:`0 4px 14px ${bc}33`,fontSize:14}}>
          {mdl.icon}
        </div>
      )}
      <div style={{maxWidth:"88%",display:"flex",flexDirection:"column",gap:4,alignItems:isUser?"flex-end":"flex-start",minWidth:0}}>
        {!isUser&&(
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{color:bc,fontSize:11,fontWeight:700,fontFamily:"Orbitron"}}>{mdl.name}</span>
            <span style={{background:isDeep?"#a855f722":`${bc}18`,border:`1px solid ${isDeep?"#a855f733":`${bc}28`}`,color:bc,fontSize:9,fontWeight:800,padding:"1px 6px",borderRadius:3,fontFamily:"Orbitron"}}>
              {isDeep?"SYNTHESIZED":"RACE"}
            </span>
          </div>
        )}
        <div style={{background:isUser?`linear-gradient(135deg,${accent},${accent}cc)`:isDeep?"linear-gradient(135deg,#a855f708,#6644ff06)":t.surface,border:isUser?"none":isDeep?"1px solid #a855f720":`1px solid ${t.border}`,borderRadius:isUser?"16px 4px 16px 16px":"4px 16px 16px 16px",padding:"11px 15px",boxShadow:isUser?`0 6px 24px ${glow}`:isDeep?"0 4px 18px #a855f715":"none",maxWidth:"100%",minWidth:0}}>
          {isUser?(
            <div>
              <p style={{color:"#fff",fontSize:14,lineHeight:1.7,margin:0,wordBreak:"break-word"}}>{msg.content}</p>
              {msg.files?.length>0&&(
                <div style={{marginTop:7,display:"flex",flexWrap:"wrap",gap:5}}>
                  {msg.files.map((f,i)=><span key={i} style={{background:"rgba(255,255,255,.18)",borderRadius:6,padding:"2px 8px",fontSize:11,color:"#fff"}}>📄 {f.name}</span>)}
                </div>
              )}
            </div>
          ):(
            <div style={{maxWidth:"100%",minWidth:0}}>
              {(parts||[]).map((part,i)=>{
                if(part.type==="text") return(
                  <p key={i} style={{color:t.text,fontSize:14,lineHeight:1.8,margin:0,marginBottom:i<parts.length-1?8:0,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{part.content}</p>
                );
                const ck=`${msg.id}-${i}`;
                return(
                  <div key={i} className="code-wrap code-in" style={{margin:"10px 0",background:t.surface2,borderRadius:12,border:`1px solid ${t.border}`,overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 13px",borderBottom:`1px solid ${t.border}`,background:t.bg}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{display:"flex",gap:5}}>
                          <div style={{width:10,height:10,borderRadius:"50%",background:"#ff5f56"}}/>
                          <div style={{width:10,height:10,borderRadius:"50%",background:"#ffbd2e"}}/>
                          <div style={{width:10,height:10,borderRadius:"50%",background:"#27c93f"}}/>
                        </div>
                        <span style={{color:isDeep?"#c084fc":accent,fontSize:11,fontFamily:"JetBrains Mono",fontWeight:700,letterSpacing:1}}>{(part.lang||"lua").toUpperCase()}</span>
                      </div>
                      <button className="copy-btn btn" onClick={()=>copyCode(part.content,ck)}
                        style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,padding:"3px 10px",color:t.textMuted,fontSize:11,fontWeight:600}}>
                        {copied[ck]?"✓ Copied!":"Copy"}
                      </button>
                    </div>
                    <pre style={{margin:0,padding:"13px 15px",overflowX:"auto",fontFamily:"JetBrains Mono",fontSize:12.5,color:t.text,lineHeight:1.75,tabSize:2}}>
                      <code>{part.content}</code>
                    </pre>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <span style={{color:t.textMuted,fontSize:10,margin:"0 2px"}}>{msg.ts}</span>
      </div>
    </div>
  );
}

function SettingsPanel({t,user,plan,themeName,setThemeName,customAccent,setCustomAccent,onClose,onLogout,onOwnerKey,accent}){
  const [ownerKeyInput, setOwnerKeyInput] = useState("");
  const [ownerMsg, setOwnerMsg]           = useState("");

  const tryOwnerKey = () => {
    if (ownerKeyInput === "sullyz") {
      onOwnerKey(ownerKeyInput);
      setOwnerMsg("👑 Owner access granted!");
    } else {
      setOwnerMsg("❌ Invalid key");
    }
    setTimeout(()=>setOwnerMsg(""),2500);
  };

  return(
    <>
      <div style={{padding:"18px 20px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <span style={{fontFamily:"Orbitron",fontSize:16,fontWeight:900,color:t.text,letterSpacing:2}}>SETTINGS</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:t.textMuted,fontSize:22,lineHeight:1,cursor:"pointer"}}>×</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"18px 20px",display:"flex",flexDirection:"column",gap:26}}>
        <Sec title="Profile" t={t}>
          <div style={{display:"flex",alignItems:"center",gap:12,background:t.surface2,border:`1px solid ${t.border}`,borderRadius:13,padding:"13px 15px"}}>
            <div style={{width:42,height:42,borderRadius:"50%",background:`linear-gradient(135deg,${plan.color},${plan.color}77)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:19}}>{plan.badge}</div>
            <div>
              <div style={{color:t.text,fontWeight:700,fontSize:14}}>{user?.username}</div>
              <div style={{color:plan.color,fontSize:12,fontWeight:600,marginTop:1}}>{plan.label}</div>
            </div>
          </div>
        </Sec>

        <Sec title="Theme" t={t}>
          <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:14}}>
            {Object.entries(THEMES).map(([key,th])=>(
              <button key={key} onClick={()=>setThemeName(key)} className="btn"
                style={{background:th.bg,border:`2px solid ${key===themeName?th.accent:th.border}`,borderRadius:10,padding:"7px 13px",color:th.text,cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",flex:"1 1 85px",alignItems:"center",justifyContent:"center",gap:6}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:th.accent}}/>{th.name}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <input type="color" value={customAccent||t.accent} onChange={e=>setCustomAccent(e.target.value)}
              style={{width:42,height:36,borderRadius:8,border:`1px solid ${t.border}`,background:"transparent",padding:2}}/>
            <span style={{color:t.textMuted,fontSize:12,fontFamily:"JetBrains Mono"}}>{customAccent||t.accent}</span>
            {customAccent&&<button onClick={()=>setCustomAccent("")} className="btn" style={{background:"none",border:`1px solid ${t.border}`,borderRadius:6,padding:"4px 9px",color:t.textMuted,fontSize:12}}>Reset</button>}
          </div>
        </Sec>

        {plan.label !== "Owner" && (
          <Sec title="Owner Key" t={t}>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:8}}>
                <input
                  type="password"
                  placeholder="Enter owner key…"
                  value={ownerKeyInput}
                  onChange={e=>setOwnerKeyInput(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&tryOwnerKey()}
                  style={{flex:1,background:t.surface2,border:`1px solid ${t.border}`,borderRadius:9,padding:"10px 13px",color:t.text,fontSize:13}}
                />
                <button onClick={tryOwnerKey} className="btn"
                  style={{background:`${accent}22`,border:`1px solid ${accent}44`,borderRadius:9,padding:"10px 16px",color:accent,fontSize:13,fontWeight:700}}>
                  Apply
                </button>
              </div>
              {ownerMsg&&<p style={{color:ownerMsg.startsWith("👑")?"#22c55e":"#ef4444",fontSize:12}}>{ownerMsg}</p>}
            </div>
          </Sec>
        )}

        <Sec title="Models" t={t}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {label:"⚡ Zenith — Race Mode", desc:"Qwen 3 vs Gemini Flash · Fastest wins", color:MODELS.zenith.color},
              {label:"🌟 Zeno — Synthesis", desc:"Qwen · GPT-4.1 · DeepSeek R1 · Grok · Gemini", color:MODELS.zeno.color},
            ].map(m=>(
              <div key={m.label} style={{background:t.surface2,border:`1px solid ${t.border}`,borderRadius:11,padding:"11px 14px"}}>
                <div style={{color:m.color,fontSize:12,fontWeight:700,fontFamily:"Orbitron",marginBottom:3}}>{m.label}</div>
                <div style={{color:t.textMuted,fontSize:11}}>{m.desc}</div>
              </div>
            ))}
          </div>
        </Sec>

        <button onClick={onLogout} className="btn" style={{background:"none",border:`1px solid ${t.border}`,borderRadius:11,padding:11,color:t.textMuted,fontSize:13,fontWeight:600}}>Sign Out</button>
      </div>
    </>
  );
}

function Sec({title,children,t}){
  return(
    <div>
      <p style={{color:t.textMuted,fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:12,fontFamily:"Orbitron"}}>{title}</p>
      {children}
    </div>
  );
}

function LField({placeholder,type="text",value,onChange,t,onEnter,valid,accent}){
  return(
    <input placeholder={placeholder} type={type} value={value}
      onChange={e=>onChange(e.target.value)}
      onKeyDown={e=>e.key==="Enter"&&onEnter?.()}
      style={{background:t.surface2,border:`1px solid ${valid?"#22c55e":t.border}`,borderRadius:11,padding:"12px 15px",color:valid?"#22c55e":t.text,fontSize:14,width:"100%",transition:"border-color .2s"}}
      onFocus={e=>e.target.style.borderColor=accent||t.accent}
      onBlur={e=>e.target.style.borderColor=valid?"#22c55e":t.border}/>
  );
}
