import { useState, useRef, useEffect, useCallback } from "react";

/* ================================================================
   DEVIX AI  —  NexoLabs-inspired layout
   Left sidebar: logo, projects (finished games), nav
   Top bar: model selector (Devix Zeno v1.2 free / Devix Ultra v1.23 credits)
   Center: "What can I do for you?" empty state with action chips
   Bottom: input with + attachment, mode, send
================================================================ */

const API_URL   = "/api/chat";
const OWNER_KEY = "sullyz";

/* ── MODELS ─────────────────────────────────────────────────── */
const MODELS = [
  {
    id:      "zeno",
    name:    "Devix Zeno",
    version: "v1.2",
    label:   "Devix Zeno v1.2",
    sub:     "Free · Fast · Luau expert",
    free:    true,
    credits: 0,
    color:   "#e03a3e",
    icon:    "⚡",
  },
  {
    id:      "ultra",
    name:    "Devix Ultra",
    version: "v1.23",
    label:   "Devix Ultra v1.23",
    sub:     "Credits · Deep · Most powerful",
    free:    false,
    credits: 10, // cost per message
    color:   "#a855f7",
    icon:    "🌟",
  },
];

/* ── PLANS ──────────────────────────────────────────────────── */
const PLANS = {
  free:  { id:"free",  name:"Free",  badge:"◆", color:"#6b7280", credits:0    },
  plus:  { id:"plus",  name:"Plus",  badge:"⚡", color:"#3b82f6", credits:500  },
  ultra: { id:"ultra", name:"Ultra", badge:"★",  color:"#a855f7", credits:2000 },
  owner: { id:"owner", name:"Owner", badge:"👑", color:"#f59e0b", credits:9999 },
};

/* ── THEMES ─────────────────────────────────────────────────── */
const THEMES = {
  dark:   { n:"Dark",   bg:"#0a0a0a", side:"#111111", surface:"#161616", s2:"#1e1e1e", border:"#262626", text:"#f0f0f0", muted:"#525252", accent:"#e03a3e" },
  light:  { n:"Light",  bg:"#f5f5f5", side:"#ffffff",  surface:"#ffffff",  s2:"#f0f0f0", border:"#e5e5e5", text:"#0a0a0a", muted:"#737373", accent:"#e03a3e" },
  slate:  { n:"Slate",  bg:"#0d1117", side:"#161b22",  surface:"#1c2128",  s2:"#21262d", border:"#30363d", text:"#e6edf3", muted:"#656d76", accent:"#58a6ff" },
  carbon: { n:"Carbon", bg:"#050505", side:"#0a0a0a",  surface:"#111111",  s2:"#161616", border:"#1c1c1c", text:"#d4d4d4", muted:"#404040", accent:"#22d3ee" },
};

/* ── SYSTEM PROMPTS ─────────────────────────────────────────── */
const BASE_SYS = `You are Devix — an expert AI assistant for Roblox Studio development. You are NOT Claude or any other known AI. You are Devix, made for Roblox developers.

EXPERTISE: Luau scripting, Roblox Studio architecture, DataStoreService, TweenService, RemoteEvents/RemoteFunctions, RunService, UserInputService, game systems, GUIs, terrain generation, combat, inventory, admin systems, anti-cheat.

LUAU RULES (always follow):
- Use task.wait() NOT wait()
- Use task.spawn() NOT spawn()  
- Use task.delay() NOT delay()
- Always add type annotations where helpful
- Format ALL code in \`\`\`lua blocks
- Write COMPLETE scripts — zero placeholders, zero TODOs
- Add clear comments throughout

FORMAT RULES:
- Use **bold** for key terms
- Use ## for section headers
- Use - for bullet lists
- Use \`inline code\` for API names and properties

CONVERSATION: Be friendly and natural. Don't always dump code — if someone asks a question, answer it conversationally first. When code IS needed, make it production-ready.

HARD RULES: No NSFW. No exploit/crash/grief scripts. No real-world harm.`;

const SYS_QUICK = BASE_SYS + "\n\nMODE: Quick Answer. Be concise and direct. Get to the point fast.";
const SYS_DEEP  = BASE_SYS + "\n\nMODE: Deep Think. Be thorough and comprehensive. Full architecture, complete optimized code, edge cases, explanations. Give more than expected.";

/* ── QUICK ACTION CHIPS ─────────────────────────────────────── */
const CHIPS = [
  { icon:"📄", label:"Create slides",   prompt:"Help me plan and outline a Roblox game presentation with key systems" },
  { icon:"🌐", label:"Build website",   prompt:"Help me create a game page or portfolio site for my Roblox game" },
  { icon:"💻", label:"Develop apps",    prompt:"Build a complete Roblox game system — give me the full architecture and all scripts" },
  { icon:"🎨", label:"Design",          prompt:"Help me design the UI and visual style for my Roblox game" },
];

const MORE_CHIPS = [
  { icon:"⚔️",  label:"Combat System",  prompt:"Build a complete combat system with hitboxes, damage, animations and visual effects" },
  { icon:"💾",  label:"DataStore",      prompt:"Create a robust DataStore save/load system with retry logic and error handling" },
  { icon:"🗺️",  label:"Terrain Gen",   prompt:"Generate procedural terrain with multiple biomes using the Roblox Terrain API" },
  { icon:"🎒",  label:"Inventory",      prompt:"Build a full inventory system with drag-and-drop GUI and item management" },
  { icon:"🛡️",  label:"Admin Panel",   prompt:"Create an admin system with rank-based permissions and a GUI panel" },
  { icon:"🏆",  label:"Leaderboard",   prompt:"Build a persistent leaderboard with DataStore and live updates" },
  { icon:"💰",  label:"Shop System",   prompt:"Create an in-game shop with currency, gamepasses and purchase UI" },
  { icon:"🤖",  label:"AI NPC",        prompt:"Build an NPC with pathfinding, patrol/chase/attack states and combat AI" },
];

/* ── SAMPLE PROJECTS (sidebar) ──────────────────────────────── */
const SAMPLE_PROJECTS = [
  { id:"p1", name:"Roblox Studio",   icon:"📁", chats:[] },
  { id:"p2", name:"PlayStore AI Games", icon:"📁", chats:[] },
  { id:"p3", name:"Modded Games",    icon:"📁", chats:[] },
];

/* ── HELPERS ────────────────────────────────────────────────── */
const nowTS = () => new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });

function parseParts(content) {
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

function inlineRender(text, ac, seed="") {
  const re = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;
  const out = []; let last=0, m, n=0;
  while ((m=re.exec(text))!==null) {
    if (m.index>last) out.push(text.slice(last,m.index));
    if (m[0].startsWith("**")) out.push(<strong key={seed+n++} style={{fontWeight:700}}>{m[2]}</strong>);
    else if (m[0].startsWith("*")) out.push(<em key={seed+n++}>{m[3]}</em>);
    else out.push(<code key={seed+n++} style={{background:"rgba(128,128,128,.15)",borderRadius:3,padding:"1px 5px",fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{m[4]}</code>);
    last=m.index+m[0].length;
  }
  if (last<text.length) out.push(text.slice(last));
  return out;
}

function MarkdownBlock({ text, color, ac }) {
  if (!text) return null;
  const lines=text.split("\n"), result=[]; let i=0;
  while (i<lines.length) {
    const ln=lines[i];
    if (/^#{1,3} /.test(ln)) {
      const lvl=ln.match(/^(#{1,3}) /)[1].length;
      result.push(<div key={i} style={{fontSize:[17,15,13][lvl-1],fontWeight:[800,700,600][lvl-1],color,margin:"10px 0 4px",lineHeight:1.3}}>{inlineRender(ln.slice(lvl+1),ac,`h${i}`)}</div>);
    } else if (/^[-•*] /.test(ln)) {
      const items=[];
      while (i<lines.length && /^[-•*] /.test(lines[i])) {
        items.push(<li key={i} style={{marginBottom:3,lineHeight:1.65}}>{inlineRender(lines[i].slice(2),ac,`li${i}`)}</li>);
        i++;
      }
      result.push(<ul key={`ul${i}`} style={{paddingLeft:18,margin:"5px 0",color,fontSize:14}}>{items}</ul>);
      continue;
    } else if (/^\d+\. /.test(ln)) {
      const items=[];
      while (i<lines.length && /^\d+\. /.test(lines[i])) {
        items.push(<li key={i} style={{marginBottom:3,lineHeight:1.65}}>{inlineRender(lines[i].replace(/^\d+\. /,""),ac,`ol${i}`)}</li>);
        i++;
      }
      result.push(<ol key={`ol${i}`} style={{paddingLeft:18,margin:"5px 0",color,fontSize:14}}>{items}</ol>);
      continue;
    } else if (/^-{3,}$/.test(ln.trim())) {
      result.push(<hr key={i} style={{border:"none",borderTop:"1px solid rgba(128,128,128,.2)",margin:"8px 0"}}/>);
    } else if (ln.trim()==="") {
      result.push(<div key={i} style={{height:4}}/>);
    } else {
      result.push(<p key={i} style={{margin:"2px 0",lineHeight:1.75,color,fontSize:14,wordBreak:"break-word"}}>{inlineRender(ln,ac,`p${i}`)}</p>);
    }
    i++;
  }
  return <>{result}</>;
}

async function callAPI(mode, messages) {
  const sys = mode==="deep" ? SYS_DEEP : SYS_QUICK;
  const r = await fetch(API_URL, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ mode, system:sys, messages, max_tokens:mode==="deep"?2048:1024 }),
  });
  if (!r.ok) { const e=await r.json().catch(()=>({})); throw new Error(e?.error||`HTTP ${r.status}`); }
  const d = await r.json();
  return d.text||"";
}

async function streamText(text, onUpdate, signal) {
  const tokens=text.split(/(\s+)/); let out="";
  for (const tok of tokens) {
    if (signal?.aborted) break;
    out+=tok; onUpdate(out);
    await new Promise(r=>setTimeout(r, 8+Math.random()*14));
  }
  onUpdate(text);
}

/* ── CSS ────────────────────────────────────────────────────── */
function makeCSS(t, ac) {
  const g = ac+"28";
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{height:100%;overflow:hidden;}
body{font-family:'Inter',sans-serif;background:${t.bg};color:${t.text};-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}
textarea,input,button{font-family:'Inter',sans-serif;}
textarea:focus,input:focus{outline:none;}
button{cursor:pointer;}

@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideR{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}
@keyframes slideL{from{opacity:0;transform:translateX(-100%)}to{opacity:1;transform:translateX(0)}}
@keyframes slideUpm{from{opacity:0;transform:translateY(50px)}to{opacity:1;transform:translateY(0)}}
@keyframes scaleIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
@keyframes shimmer{0%{background-position:-300% center}100%{background-position:300% center}}
@keyframes dropIn{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

.fade{animation:fadeIn .2s ease both}
.up{animation:slideUp .28s cubic-bezier(.22,1,.36,1) both}
.scale{animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both}
.panel-r{animation:slideR .28s cubic-bezier(.22,1,.36,1) both}
.panel-l{animation:slideL .28s cubic-bezier(.22,1,.36,1) both}
.slide-up-mob{animation:slideUpm .3s cubic-bezier(.22,1,.36,1) both}
.msg-in{animation:slideUp .22s cubic-bezier(.22,1,.36,1) both}
.drop-in{animation:dropIn .22s cubic-bezier(.22,1,.36,1) both}
.spin{animation:spin 1s linear infinite;display:inline-block}

.btn{transition:all .14s ease;}
.btn:hover{filter:brightness(1.15);transform:translateY(-1px);}
.btn:active{filter:brightness(.9);transform:translateY(0);}

.nav-item{transition:all .12s ease;border-radius:6px;cursor:pointer;}
.nav-item:hover{background:${t.s2}!important;}
.nav-item.active{background:${t.s2}!important;}

.proj-item{transition:all .12s ease;border-radius:6px;cursor:pointer;}
.proj-item:hover{background:${t.s2}!important;}
.proj-item.active-proj{background:${ac}18!important;border-left:2px solid ${ac}!important;}

.chip-btn{transition:all .14s ease;cursor:pointer;}
.chip-btn:hover{background:${t.s2}!important;border-color:${t.border}!important;transform:translateY(-1px);}

.input-box{transition:border-color .18s,box-shadow .18s;}
.input-box:focus-within{border-color:${ac}!important;box-shadow:0 0 0 3px ${g}!important;}

.copy-btn{opacity:0;transition:opacity .14s;}
.code-wrap:hover .copy-btn{opacity:1;}

.cursor::after{content:"▋";color:${ac};animation:blink .65s step-end infinite;margin-left:1px;}

.model-btn{transition:all .14s ease;}
.model-btn:hover{background:${t.s2}!important;}

.sidebar-toggle{transition:all .14s ease;}
.sidebar-toggle:hover{background:${t.s2}!important;}

.d1{animation:bounce 1.3s ease .0s infinite}
.d2{animation:bounce 1.3s ease .15s infinite}
.d3{animation:bounce 1.3s ease .3s infinite}

@media(max-width:768px){.dt{display:none!important}}
@media(min-width:769px){.mb{display:none!important}}
`;
}

/* ================================================================
   ROOT
================================================================ */
export default function DevixApp() {
  const [page,        setPage]        = useState("login");
  const [isSignup,    setIsSignup]    = useState(false);
  const [form,        setForm]        = useState({ username:"", password:"" });
  const [ownerKey,    setOwnerKey]    = useState("");
  const [loginErr,    setLoginErr]    = useState("");
  const [user,        setUser]        = useState(null);
  const [credits,     setCredits]     = useState(500);
  const [themeKey,    setThemeKey]    = useState("dark");
  const [accent,      setAccent]      = useState("");
  const [modelId,     setModelId]     = useState("zeno");
  const [showModelDrop, setShowModelDrop] = useState(false);
  const [convs,       setConvs]       = useState([{ id:1, title:"New Chat", messages:[], projectId:null }]);
  const [activeId,    setActiveId]    = useState(1);
  const [projects,    setProjects]    = useState(SAMPLE_PROJECTS);
  const [activeProj,  setActiveProj]  = useState(null);
  const [expandedProj,setExpandedProj]= useState(null);
  const [newProjName, setNewProjName] = useState("");
  const [showNewProj, setShowNewProj] = useState(false);
  const [input,       setInput]       = useState("");
  const [isLoading,   setIsLoading]   = useState(false);
  const [streamingId, setStreamingId] = useState(null);
  const [files,       setFiles]       = useState([]);
  const [mode,        setMode]        = useState("quick");
  const [showSett,    setShowSett]    = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNav,   setMobileNav]   = useState(false);
  const [copied,      setCopied]      = useState({});
  const [toast,       setToast]       = useState(null);
  const [showMoreChips,setShowMoreChips]=useState(false);

  const endRef   = useRef(null);
  const fileRef  = useRef(null);
  const textRef  = useRef(null);
  const abortRef = useRef(null);

  const t   = THEMES[themeKey];
  const ac  = accent || t.accent;
  const css = makeCSS(t, ac);

  const model      = MODELS.find(m=>m.id===modelId)||MODELS[0];
  const isDeep     = mode==="deep";
  const plan       = PLANS[user?.plan||"free"];
  const activeConv = convs.find(c=>c.id===activeId);
  const msgs       = activeConv?.messages||[];

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,isLoading]);

  const showToast = useCallback((msg, dur=2500)=>{
    setToast(msg); setTimeout(()=>setToast(null), dur);
  },[]);

  const login = ()=>{
    if (!form.username||!form.password){setLoginErr("Fill in all fields");return;}
    const p = ownerKey===OWNER_KEY?"owner":"free";
    const c = p==="owner"?9999:0;
    setUser({username:form.username,plan:p});
    setCredits(c);
    setPage("chat");
    showToast(`Welcome, ${form.username}! ⚡`);
  };

  const updateConv = useCallback((newMsgs)=>{
    setConvs(prev=>prev.map(c=>c.id===activeId?{...c,messages:newMsgs}:c));
  },[activeId]);

  const sendMsg = async (overrideInput)=>{
    const txt = overrideInput!==undefined ? overrideInput : input;
    if ((!txt.trim()&&!files.length)||isLoading) return;

    // Credit check for Ultra
    if (modelId==="ultra"&&credits<model.credits){
      showToast("Not enough credits for Devix Ultra!"); return;
    }

    const ts = nowTS();
    const userMsg = {id:Date.now(),role:"user",content:txt,files:[...files],ts};
    const next = [...msgs,userMsg];
    updateConv(next);

    if (msgs.length===0&&txt.trim()) {
      const title=txt.trim().slice(0,36)+(txt.length>36?"…":"");
      setConvs(prev=>prev.map(c=>c.id===activeId?{...c,title}:c));
    }

    setInput(""); setFiles([]); setIsLoading(true);
    if (textRef.current) textRef.current.style.height="auto";
    if (modelId==="ultra") setCredits(p=>Math.max(0,p-model.credits));

    const apiMsgs = next.map(m=>({
      role:m.role,
      content:m.content+(m.files?.length?"\n\n[Files]\n"+m.files.map(f=>`--- ${f.name} ---\n${f.content}`).join("\n\n"):""),
    }));

    const placeholderId = Date.now()+1;
    updateConv([...next,{id:placeholderId,role:"assistant",content:"",streaming:true,modelId,mode,ts:nowTS()}]);
    setStreamingId(placeholderId);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const text = await callAPI(mode, apiMsgs);
      let streamed="";
      await streamText(text, (partial)=>{
        streamed=partial;
        setConvs(prev=>prev.map(c=>c.id===activeId?{
          ...c,
          messages:c.messages.map(m=>m.id===placeholderId?{...m,content:partial,streaming:true}:m)
        }:c));
      }, ctrl.signal);
      setConvs(prev=>prev.map(c=>c.id===activeId?{
        ...c,
        messages:c.messages.map(m=>m.id===placeholderId?{...m,content:streamed,streaming:false}:m)
      }:c));
    } catch(err){
      setConvs(prev=>prev.map(c=>c.id===activeId?{
        ...c,
        messages:c.messages.map(m=>m.id===placeholderId?{...m,content:`⚠️ ${err.message}`,streaming:false}:m)
      }:c));
    }
    setIsLoading(false); setStreamingId(null);
  };

  const uploadFiles = async(fl)=>{
    const arr=[];
    for (const f of Array.from(fl)){
      try{arr.push({name:f.name,content:await f.text()});}
      catch{arr.push({name:f.name,content:"[Binary]"});}
    }
    setFiles(p=>[...p,...arr]); showToast(`${arr.length} file(s) attached`);
  };

  const newChat = (projId=null)=>{
    const id=Date.now();
    setConvs(p=>[...p,{id,title:"New Chat",messages:[],projectId:projId}]);
    setActiveId(id); setMobileNav(false);
  };

  const delConv=(id)=>{
    if(convs.length===1)return;
    const nxt=convs.filter(c=>c.id!==id);
    setConvs(nxt);
    if(activeId===id)setActiveId(nxt[nxt.length-1].id);
  };

  const copyCode=(code,key)=>{
    navigator.clipboard?.writeText(code);
    setCopied(p=>({...p,[key]:true}));
    setTimeout(()=>setCopied(p=>({...p,[key]:false})),2000);
    showToast("Copied!");
  };

  const addProject=()=>{
    if(!newProjName.trim())return;
    const id="p"+Date.now();
    setProjects(p=>[...p,{id,name:newProjName.trim(),icon:"📁",chats:[]}]);
    setNewProjName(""); setShowNewProj(false);
    showToast("Project created!");
  };

  /* ── LOGIN ── */
  if (page==="login") return (
    <>
      <style>{css}</style>
      <div style={{minHeight:"100dvh",background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px 16px",position:"relative",overflow:"hidden"}}>
        {/* subtle grid */}
        <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${t.border}20 1px,transparent 1px),linear-gradient(90deg,${t.border}20 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none"}}/>
        <div style={{position:"absolute",width:"50vw",height:"50vw",maxWidth:500,borderRadius:"50%",background:`radial-gradient(circle,${ac}12,transparent 65%)`,top:"-15%",left:"-10%",animation:"spin 40s linear infinite",pointerEvents:"none"}}/>

        <div style={{width:"100%",maxWidth:900,zIndex:1,display:"flex",gap:28,flexWrap:"wrap",justifyContent:"center",alignItems:"flex-start"}}>

          {/* Left — branding */}
          <div className="up" style={{flex:"1 1 300px",maxWidth:420,paddingTop:20}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${ac},${ac}88)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{color:"#fff",fontFamily:"monospace",fontSize:22,fontWeight:900}}>D</span>
              </div>
              <div>
                <div style={{color:t.text,fontSize:22,fontWeight:800,letterSpacing:-0.5}}>Devix AI</div>
                <div style={{color:t.muted,fontSize:12}}>Roblox Studio Development AI</div>
              </div>
            </div>
            <div style={{color:t.text,fontSize:28,fontWeight:800,lineHeight:1.25,marginBottom:12}}>
              What can I do for you?
            </div>
            <p style={{color:t.muted,fontSize:14,lineHeight:1.7,marginBottom:24}}>
              Scripts, full games, combat systems, DataStores, admin panels — all powered by Devix Zeno and Devix Ultra.
            </p>
            {/* Model cards */}
            {MODELS.map(m=>(
              <div key={m.id} style={{background:t.side,border:`1px solid ${t.border}`,borderRadius:12,padding:"12px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:9,background:`${m.color}18`,border:`1px solid ${m.color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{m.icon}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{color:t.text,fontWeight:700,fontSize:14}}>{m.label}</span>
                    <span style={{background:m.free?"#22c55e18":"#a855f718",border:`1px solid ${m.free?"#22c55e33":"#a855f733"}`,color:m.free?"#22c55e":"#c084fc",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:4}}>
                      {m.free?"FREE":"CREDITS"}
                    </span>
                  </div>
                  <div style={{color:t.muted,fontSize:12,marginTop:2}}>{m.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Right — auth */}
          <div className="scale" style={{background:t.side,border:`1px solid ${t.border}`,borderRadius:18,padding:"32px 30px",width:"100%",maxWidth:380,flexShrink:0,boxShadow:`0 24px 64px rgba(0,0,0,.4)`}}>
            <div style={{display:"flex",background:t.s2,borderRadius:10,padding:3,marginBottom:22,gap:3}}>
              {["Sign In","Sign Up"].map((tab,i)=>(
                <button key={tab} onClick={()=>{setIsSignup(i===1);setLoginErr("");}} className="btn"
                  style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",background:isSignup===(i===1)?ac:"transparent",color:isSignup===(i===1)?"#fff":t.muted,fontSize:13,fontWeight:600,transition:"all .18s"}}>
                  {tab}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input placeholder="Username" value={form.username} onChange={e=>setForm(p=>({...p,username:e.target.value}))}
                style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:"11px 14px",color:t.text,fontSize:14,width:"100%",transition:"border-color .18s"}}
                onFocus={e=>e.target.style.borderColor=ac} onBlur={e=>e.target.style.borderColor=t.border}/>
              <input placeholder="Password" type="password" value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&login()}
                style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:"11px 14px",color:t.text,fontSize:14,width:"100%",transition:"border-color .18s"}}
                onFocus={e=>e.target.style.borderColor=ac} onBlur={e=>e.target.style.borderColor=t.border}/>
              <div>
                <input placeholder="🔑 Owner Key (optional)" type="password" value={ownerKey} onChange={e=>setOwnerKey(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&login()}
                  style={{background:t.s2,border:`1px solid ${ownerKey===OWNER_KEY?"#22c55e":t.border}`,borderRadius:9,padding:"11px 14px",color:ownerKey===OWNER_KEY?"#22c55e":t.text,fontSize:14,width:"100%",transition:"all .18s"}}
                  onFocus={e=>e.target.style.borderColor=ownerKey===OWNER_KEY?"#22c55e":ac}
                  onBlur={e=>e.target.style.borderColor=ownerKey===OWNER_KEY?"#22c55e":t.border}/>
                {ownerKey===OWNER_KEY&&<p style={{color:"#22c55e",fontSize:12,marginTop:5}}>👑 Owner access granted</p>}
              </div>
              {loginErr&&<p style={{color:ac,fontSize:12,textAlign:"center"}}>{loginErr}</p>}
              <button onClick={login} className="btn"
                style={{background:`linear-gradient(135deg,${ac},${ac}cc)`,border:"none",borderRadius:10,padding:"12px",color:"#fff",fontSize:14,fontWeight:700,marginTop:4,boxShadow:`0 6px 20px ${ac}30`}}>
                {isSignup?"Create Account":"Sign In"}
              </button>
              <p style={{color:t.muted,fontSize:11,textAlign:"center"}}>100% free · No credit card · Powered by Groq</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  /* ── CHAT ── */
  const sidebarConvs = activeProj
    ? convs.filter(c=>c.projectId===activeProj)
    : convs.filter(c=>!c.projectId);

  return (
    <>
      <style>{css}</style>
      <div style={{height:"100dvh",display:"flex",background:t.bg,color:t.text,overflow:"hidden"}}>

        {/* ═══ SIDEBAR ═══ */}
        {sidebarOpen&&(
          <div className="dt panel-l" style={{width:240,background:t.side,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",flexShrink:0,userSelect:"none"}}>

            {/* Logo row */}
            <div style={{padding:"14px 14px 10px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${t.border}`}}>
              <div style={{width:28,height:28,borderRadius:7,background:`linear-gradient(135deg,${ac},${ac}88)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{color:"#fff",fontFamily:"monospace",fontSize:13,fontWeight:900}}>D</span>
              </div>
              <span style={{fontSize:15,fontWeight:700,color:t.text,letterSpacing:-0.3}}>Devix</span>
              <button onClick={()=>setSidebarOpen(false)} className="btn sidebar-toggle"
                style={{marginLeft:"auto",background:"none",border:"none",color:t.muted,fontSize:17,padding:"2px 4px",borderRadius:5,lineHeight:1}}>
                ‹
              </button>
            </div>

            {/* New task button */}
            <div style={{padding:"10px 10px 6px"}}>
              <button onClick={()=>newChat()} className="btn"
                style={{width:"100%",background:"none",border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 12px",color:t.muted,fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:8,transition:"all .15s"}}
                onMouseOver={e=>{e.currentTarget.style.background=t.s2;e.currentTarget.style.color=t.text;}}
                onMouseOut={e=>{e.currentTarget.style.background="none";e.currentTarget.style.color=t.muted;}}>
                <span style={{fontSize:16,fontWeight:300}}>+</span> New task
              </button>
            </div>

            {/* Nav items */}
            <div style={{padding:"4px 8px"}}>
              {[
                {icon:"✏️", label:"New task",   action:()=>newChat()},
                {icon:"🤖", label:"Agents",     action:()=>{}, badge:"New"},
                {icon:"🔍", label:"Search",     action:()=>{}},
                {icon:"📚", label:"Library",    action:()=>{}},
              ].map(nav=>(
                <div key={nav.label} className="nav-item" onClick={nav.action}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",color:t.muted,fontSize:13}}>
                  <span style={{fontSize:14,width:18,textAlign:"center"}}>{nav.icon}</span>
                  <span>{nav.label}</span>
                  {nav.badge&&<span style={{marginLeft:"auto",background:ac,color:"#fff",fontSize:9,fontWeight:800,padding:"1px 6px",borderRadius:10}}>{nav.badge}</span>}
                </div>
              ))}
            </div>

            {/* Projects */}
            <div style={{padding:"6px 8px 2px",flex:1,overflowY:"auto"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 8px 6px"}}>
                <span style={{color:t.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>Projects</span>
                <button onClick={()=>setShowNewProj(p=>!p)} className="btn"
                  style={{background:"none",border:"none",color:t.muted,fontSize:17,lineHeight:1,padding:"0 2px"}}>+</button>
              </div>

              {showNewProj&&(
                <div className="drop-in" style={{padding:"0 4px 8px"}}>
                  <div style={{display:"flex",gap:5}}>
                    <input value={newProjName} onChange={e=>setNewProjName(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addProject()}
                      placeholder="Project name…" autoFocus
                      style={{flex:1,background:t.s2,border:`1px solid ${t.border}`,borderRadius:7,padding:"6px 9px",color:t.text,fontSize:12}}/>
                    <button onClick={addProject} className="btn"
                      style={{background:ac,border:"none",borderRadius:7,padding:"6px 10px",color:"#fff",fontSize:12,fontWeight:700}}>+</button>
                  </div>
                </div>
              )}

              {projects.map(proj=>(
                <div key={proj.id}>
                  {/* Project row */}
                  <div className={`proj-item${activeProj===proj.id?" active-proj":""}`}
                    onClick={()=>{setExpandedProj(p=>p===proj.id?null:proj.id);setActiveProj(p=>p===proj.id?null:proj.id);}}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",color:activeProj===proj.id?ac:t.muted,fontSize:13,borderLeft:"2px solid transparent"}}>
                    <span style={{fontSize:13}}>{expandedProj===proj.id?"▾":"›"}</span>
                    <span style={{fontSize:13}}>{proj.icon}</span>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{proj.name}</span>
                  </div>
                  {/* Project chats */}
                  {expandedProj===proj.id&&(
                    <div style={{paddingLeft:14}}>
                      {convs.filter(c=>c.projectId===proj.id).map(conv=>(
                        <div key={conv.id} className="nav-item" onClick={()=>setActiveId(conv.id)}
                          style={{display:"flex",alignItems:"center",gap:7,padding:"5px 10px",color:conv.id===activeId?t.text:t.muted,fontSize:12,background:conv.id===activeId?t.s2:"transparent"}}>
                          <span style={{fontSize:11}}>💬</span>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{conv.title}</span>
                        </div>
                      ))}
                      <div className="nav-item" onClick={()=>newChat(proj.id)}
                        style={{display:"flex",alignItems:"center",gap:7,padding:"5px 10px",color:t.muted,fontSize:12}}>
                        <span>+</span><span>New chat</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* All tasks label */}
              <div style={{padding:"10px 8px 4px"}}>
                <span style={{color:t.muted,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:1}}>All tasks</span>
              </div>
              {convs.filter(c=>!c.projectId).reverse().map(conv=>(
                <div key={conv.id} className={`nav-item${conv.id===activeId?" active":""}`}
                  onClick={()=>{setActiveId(conv.id);setActiveProj(null);}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",color:conv.id===activeId?t.text:t.muted,fontSize:12,background:conv.id===activeId?t.s2:"transparent"}}>
                  <span style={{fontSize:11,flexShrink:0}}>💬</span>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{conv.title}</span>
                  {convs.length>1&&(
                    <button onClick={e=>{e.stopPropagation();delConv(conv.id);}}
                      style={{background:"none",border:"none",color:t.muted,fontSize:14,padding:0,lineHeight:1,opacity:0,transition:"opacity .12s"}}
                      onMouseOver={e=>e.currentTarget.style.opacity=1}
                      onMouseOut={e=>e.currentTarget.style.opacity=0}>×</button>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom user row */}
            <div style={{borderTop:`1px solid ${t.border}`,padding:"10px 12px",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${plan.color},${plan.color}77)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>{plan.badge}</div>
              <div style={{minWidth:0,flex:1}}>
                <div style={{color:t.text,fontSize:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user?.username}</div>
                <div style={{color:plan.color,fontSize:10,fontWeight:600}}>{plan.name}</div>
              </div>
              <button onClick={()=>setShowSett(true)} className="btn sidebar-toggle"
                style={{background:"none",border:"none",color:t.muted,fontSize:15,padding:"3px 5px",borderRadius:5}}>⚙</button>
            </div>
          </div>
        )}

        {/* Mobile sidebar */}
        {mobileNav&&(
          <div className="mb fade" onClick={()=>setMobileNav(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:199}}>
            <div className="slide-up-mob" onClick={e=>e.stopPropagation()} style={{position:"absolute",bottom:0,left:0,right:0,height:"80dvh",background:t.side,borderRadius:"18px 18px 0 0",borderTop:`1px solid ${t.border}`,display:"flex",flexDirection:"column",padding:"16px"}}>
              <div style={{width:36,height:4,borderRadius:2,background:t.border,margin:"0 auto 14px"}}/>
              <button onClick={()=>{newChat();setMobileNav(false);}} className="btn"
                style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:9,padding:"10px",color:t.text,fontSize:14,fontWeight:600,marginBottom:12}}>
                + New Chat
              </button>
              <div style={{flex:1,overflowY:"auto"}}>
                {convs.slice().reverse().map(conv=>(
                  <div key={conv.id} onClick={()=>{setActiveId(conv.id);setMobileNav(false);}}
                    style={{padding:"10px 12px",borderRadius:8,marginBottom:3,background:conv.id===activeId?t.s2:"transparent",color:conv.id===activeId?t.text:t.muted,fontSize:14,cursor:"pointer"}}>
                    {conv.title}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ MAIN ═══ */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

          {/* ── Top bar ── */}
          <div style={{height:52,borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",paddingLeft:14,paddingRight:14,gap:10,flexShrink:0,background:t.side}}>

            {/* Sidebar toggle */}
            {!sidebarOpen&&(
              <button onClick={()=>setSidebarOpen(true)} className="btn sidebar-toggle"
                style={{background:"none",border:"none",color:t.muted,fontSize:17,padding:"4px 6px",borderRadius:6,marginRight:2}}>
                ›
              </button>
            )}
            <button onClick={()=>setMobileNav(p=>!p)} className="btn mb sidebar-toggle"
              style={{background:"none",border:"none",color:t.muted,fontSize:19,padding:"4px 6px",borderRadius:6}}>
              ☰
            </button>

            {/* ── Model selector ── (the main top element like NexoLabs) */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowModelDrop(p=>!p)} className="btn model-btn"
                style={{background:"none",border:"none",borderRadius:8,padding:"5px 10px",display:"flex",alignItems:"center",gap:7,color:t.text}}>
                <span style={{color:model.color,fontSize:15}}>{model.icon}</span>
                <span style={{fontSize:14,fontWeight:600}}>{model.label}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{opacity:.5}}>
                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {/* Credits badge for ultra */}
                {modelId==="ultra"&&(
                  <span style={{background:`${t.s2}`,border:`1px solid ${t.border}`,borderRadius:12,padding:"2px 8px",fontSize:11,color:t.muted,fontWeight:600}}>
                    {credits.toLocaleString()} credits
                  </span>
                )}
              </button>

              {showModelDrop&&(
                <>
                  <div className="fade" onClick={()=>setShowModelDrop(false)} style={{position:"fixed",inset:0,zIndex:98}}/>
                  <div className="drop-in" style={{position:"absolute",top:"calc(100% + 6px)",left:0,background:t.side,border:`1px solid ${t.border}`,borderRadius:12,padding:8,minWidth:290,boxShadow:`0 16px 48px rgba(0,0,0,.4)`,zIndex:99}}>
                    {MODELS.map(m=>(
                      <button key={m.id} onClick={()=>{setModelId(m.id);setShowModelDrop(false);}} className="btn"
                        style={{width:"100%",background:modelId===m.id?t.s2:"transparent",border:`1px solid ${modelId===m.id?t.border:"transparent"}`,borderRadius:9,padding:"10px 12px",display:"flex",alignItems:"center",gap:10,textAlign:"left",marginBottom:3}}>
                        <div style={{width:32,height:32,borderRadius:8,background:`${m.color}18`,border:`1px solid ${m.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{m.icon}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <span style={{color:t.text,fontWeight:600,fontSize:13}}>{m.label}</span>
                            <span style={{background:m.free?"#22c55e18":"#a855f718",color:m.free?"#22c55e":"#c084fc",fontSize:9,fontWeight:800,padding:"1px 6px",borderRadius:4}}>
                              {m.free?"FREE":"CREDITS"}
                            </span>
                          </div>
                          <div style={{color:t.muted,fontSize:11,marginTop:1}}>{m.sub}</div>
                        </div>
                        {modelId===m.id&&<span style={{color:m.color,fontSize:16}}>✓</span>}
                      </button>
                    ))}
                    <div style={{borderTop:`1px solid ${t.border}`,marginTop:6,paddingTop:8,padding:"8px 10px 4px"}}>
                      <div style={{color:t.muted,fontSize:11,lineHeight:1.6}}>
                        <strong style={{color:t.text}}>Devix Zeno v1.2</strong> — Free forever, fast, Luau expert<br/>
                        <strong style={{color:t.text}}>Devix Ultra v1.23</strong> — Uses credits, deepest reasoning, best for full games
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{flex:1}}/>

            {/* Right side top bar */}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {/* Credits display */}
              <div style={{display:"flex",alignItems:"center",gap:6,background:t.s2,border:`1px solid ${t.border}`,borderRadius:20,padding:"4px 12px"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#22c55e"}}/>
                <span style={{color:t.muted,fontSize:12,fontWeight:500}} className="dt">
                  {credits.toLocaleString()} credits
                </span>
              </div>
              <div style={{width:30,height:30,borderRadius:"50%",background:`linear-gradient(135deg,${plan.color},${plan.color}77)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,cursor:"pointer",flexShrink:0}}
                onClick={()=>setShowSett(true)}>
                {plan.badge}
              </div>
            </div>
          </div>

          {/* ── Messages / Empty ── */}
          <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
            {msgs.length===0 ? (
              /* Empty state — NexoLabs style */
              <div className="fade" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px",textAlign:"center"}}>
                <h1 style={{fontSize:"clamp(22px,4vw,38px)",fontWeight:800,color:t.text,marginBottom:28,letterSpacing:-0.5,lineHeight:1.2}}>
                  What can I do for you?
                </h1>

                {/* Primary action chips — like NexoLabs */}
                <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",marginBottom:16,maxWidth:600}}>
                  {CHIPS.map(chip=>(
                    <button key={chip.label} onClick={()=>sendMsg(chip.prompt)} className="chip-btn"
                      style={{background:t.side,border:`1px solid ${t.border}`,borderRadius:22,padding:"9px 18px",color:t.text,fontSize:13,display:"flex",alignItems:"center",gap:7,fontWeight:500}}>
                      <span style={{fontSize:15}}>{chip.icon}</span>
                      <span>{chip.label}</span>
                    </button>
                  ))}
                  <button onClick={()=>setShowMoreChips(p=>!p)} className="chip-btn"
                    style={{background:t.side,border:`1px solid ${t.border}`,borderRadius:22,padding:"9px 18px",color:t.muted,fontSize:13,display:"flex",alignItems:"center",gap:7,fontWeight:500}}>
                    <span>···</span><span>More</span>
                  </button>
                </div>

                {/* More chips */}
                {showMoreChips&&(
                  <div className="fade" style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center",maxWidth:580,marginBottom:16}}>
                    {MORE_CHIPS.map(chip=>(
                      <button key={chip.label} onClick={()=>{sendMsg(chip.prompt);setShowMoreChips(false);}} className="chip-btn"
                        style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:20,padding:"7px 14px",color:t.muted,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                        <span>{chip.icon}</span><span>{chip.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Recent */}
                {convs.some(c=>c.messages.length>0)&&(
                  <div style={{width:"100%",maxWidth:480,marginTop:8}}>
                    <div style={{color:t.muted,fontSize:12,fontWeight:600,textAlign:"left",marginBottom:8,textTransform:"uppercase",letterSpacing:.8}}>Recent</div>
                    {convs.filter(c=>c.messages.length>0).slice(-3).reverse().map(conv=>(
                      <div key={conv.id} onClick={()=>setActiveId(conv.id)}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:9,cursor:"pointer",color:t.muted,fontSize:14,transition:"background .12s"}}
                        onMouseOver={e=>e.currentTarget.style.background=t.side}
                        onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                        <span style={{fontSize:13}}>💬</span>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{conv.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{maxWidth:760,margin:"0 auto",width:"100%",padding:"24px 16px"}}>
                {msgs.map(msg=>(
                  <MsgBubble key={msg.id} msg={msg} t={t} ac={ac} copyCode={copyCode} copied={copied}/>
                ))}
                {isLoading&&!streamingId&&<TypingBubble t={t} model={model}/>}
                <div ref={endRef} style={{height:8}}/>
              </div>
            )}
          </div>

          {/* ── Input area ── */}
          <div style={{padding:"10px 16px 14px",flexShrink:0}}>
            <div style={{maxWidth:760,margin:"0 auto"}}>

              {/* Attached files */}
              {files.length>0&&(
                <div style={{display:"flex",gap:6,marginBottom:7,flexWrap:"wrap"}}>
                  {files.map((f,i)=>(
                    <div key={i} style={{background:t.side,border:`1px solid ${t.border}`,borderRadius:7,padding:"3px 9px",display:"flex",alignItems:"center",gap:5}}>
                      <span style={{fontSize:11}}>📄</span>
                      <span style={{color:t.muted,fontSize:11,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                      <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:t.muted,fontSize:13,lineHeight:1,padding:0}}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Main input box */}
              <div className="input-box" style={{background:t.side,border:`1px solid ${t.border}`,borderRadius:14,overflow:"hidden"}}>

                {/* Textarea */}
                <textarea ref={textRef} value={input}
                  onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,180)+"px";}}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg();}}}
                  placeholder="Assign a task or ask anything"
                  rows={1}
                  style={{width:"100%",background:"transparent",border:"none",padding:"14px 16px 6px",color:t.text,fontSize:14,resize:"none",lineHeight:1.65,maxHeight:180,overflowY:"auto",minHeight:52}}/>

                {/* Bottom bar */}
                <div style={{display:"flex",alignItems:"center",padding:"6px 10px 10px",gap:8}}>
                  {/* + button */}
                  <input type="file" ref={fileRef} onChange={e=>uploadFiles(e.target.files)} multiple accept=".lua,.rbxl,.rbxlx,.txt,.json,.md" style={{display:"none"}}/>
                  <button onClick={()=>fileRef.current?.click()} className="btn"
                    style={{width:30,height:30,borderRadius:8,background:"none",border:`1px solid ${t.border}`,color:t.muted,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    +
                  </button>

                  {/* Web / file / icon buttons (decorative, like NexoLabs) */}
                  <button className="btn" style={{background:"none",border:"none",color:t.muted,fontSize:16,padding:"4px 5px",borderRadius:6}} title="Add context">
                    🌐
                  </button>
                  <button className="btn" style={{background:"none",border:"none",color:t.muted,fontSize:16,padding:"4px 5px",borderRadius:6}} title="Game files">
                    🎮
                  </button>

                  {/* Mode toggle */}
                  <div style={{display:"flex",background:t.s2,border:`1px solid ${t.border}`,borderRadius:18,padding:2,gap:1,marginLeft:2}}>
                    <button onClick={()=>setMode("quick")} className="btn"
                      style={{background:!isDeep?`${MODELS[0].color}22`:"transparent",border:`1px solid ${!isDeep?`${MODELS[0].color}44`:"transparent"}`,borderRadius:15,padding:"4px 11px",color:!isDeep?MODELS[0].color:t.muted,fontSize:11,fontWeight:700,transition:"all .15s",display:"flex",alignItems:"center",gap:4}}>
                      ⚡ <span className="dt">Quick</span>
                    </button>
                    <button onClick={()=>setMode("deep")} className="btn"
                      style={{background:isDeep?"#a855f720":"transparent",border:`1px solid ${isDeep?"#a855f740":"transparent"}`,borderRadius:15,padding:"4px 11px",color:isDeep?"#c084fc":t.muted,fontSize:11,fontWeight:700,transition:"all .15s",display:"flex",alignItems:"center",gap:4}}>
                      🌟 <span className="dt">Deep</span>
                    </button>
                  </div>

                  <div style={{flex:1}}/>

                  {/* Model pill */}
                  <div style={{display:"flex",alignItems:"center",gap:5,background:`${model.color}14`,border:`1px solid ${model.color}28`,borderRadius:14,padding:"3px 10px"}} className="dt">
                    <span style={{fontSize:11}}>{model.icon}</span>
                    <span style={{color:model.color,fontSize:10,fontWeight:700}}>{model.version}</span>
                  </div>

                  {/* Send */}
                  <button onClick={()=>sendMsg()} disabled={isLoading} className="btn"
                    style={{width:32,height:32,borderRadius:8,background:isLoading?t.s2:`linear-gradient(135deg,${ac},${ac}cc)`,border:"none",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,boxShadow:isLoading?"none":`0 4px 14px ${ac}30`,opacity:isLoading?.6:1,flexShrink:0}}>
                    {isLoading?<span className="spin" style={{fontSize:13}}>⟳</span>:<span style={{marginTop:-1}}>↑</span>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SETTINGS PANEL ═══ */}
        {showSett&&(
          <div className="fade" onClick={()=>setShowSett(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:200}}>
            <div className="panel-r" onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:0,width:"min(400px,100vw)",height:"100%",background:t.side,borderLeft:`1px solid ${t.border}`,display:"flex",flexDirection:"column"}}>
              <div style={{padding:"18px 20px",borderBottom:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                <span style={{fontWeight:700,fontSize:16,color:t.text}}>Settings</span>
                <button onClick={()=>setShowSett(false)} style={{background:"none",border:"none",color:t.muted,fontSize:22,lineHeight:1,cursor:"pointer"}}>×</button>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"18px 20px",display:"flex",flexDirection:"column",gap:24}}>
                {/* Profile */}
                <div>
                  <div style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Profile</div>
                  <div style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:12,padding:"12px 14px",display:"flex",alignItems:"center",gap:11}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:`linear-gradient(135deg,${plan.color},${plan.color}77)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>{plan.badge}</div>
                    <div>
                      <div style={{color:t.text,fontWeight:700,fontSize:14}}>{user?.username}</div>
                      <div style={{color:plan.color,fontSize:11,fontWeight:600,marginTop:1}}>{plan.name} · {credits.toLocaleString()} credits</div>
                    </div>
                  </div>
                </div>

                {/* Theme */}
                <div>
                  <div style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>Theme</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                    {Object.entries(THEMES).map(([key,th])=>(
                      <button key={key} onClick={()=>setThemeKey(key)} className="btn"
                        style={{background:th.bg,border:`2px solid ${key===themeKey?th.accent:th.border}`,borderRadius:9,padding:"7px 13px",color:th.text,fontSize:12,fontWeight:600,display:"flex",flex:"1 1 80px",alignItems:"center",justifyContent:"center",gap:6}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:th.accent}}/>{th.n}
                      </button>
                    ))}
                  </div>
                  <div style={{marginTop:12,display:"flex",alignItems:"center",gap:10}}>
                    <input type="color" value={accent||t.accent} onChange={e=>setAccent(e.target.value)}
                      style={{width:40,height:34,borderRadius:7,border:`1px solid ${t.border}`,background:"transparent",padding:2}}/>
                    <span style={{color:t.muted,fontSize:12,fontFamily:"monospace"}}>{accent||t.accent}</span>
                    {accent&&<button onClick={()=>setAccent("")} className="btn" style={{background:"none",border:`1px solid ${t.border}`,borderRadius:6,padding:"3px 9px",color:t.muted,fontSize:11}}>Reset</button>}
                  </div>
                </div>

                {/* Models info */}
                <div>
                  <div style={{color:t.muted,fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:10}}>AI Models</div>
                  {MODELS.map(m=>(
                    <div key={m.id} style={{background:t.s2,border:`1px solid ${t.border}`,borderRadius:11,padding:"11px 13px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:8,background:`${m.color}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{m.icon}</div>
                      <div>
                        <div style={{color:t.text,fontWeight:600,fontSize:13}}>{m.label}</div>
                        <div style={{color:t.muted,fontSize:11,marginTop:1}}>{m.free?"Free forever":m.credits+" credits per message"}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={()=>{setUser(null);setPage("login");setShowSett(false);}} className="btn"
                  style={{background:"none",border:`1px solid ${t.border}`,borderRadius:10,padding:11,color:t.muted,fontSize:13,fontWeight:600}}>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast&&(
          <div style={{position:"fixed",bottom:24,left:"50%",background:t.side,border:`1px solid ${t.border}`,borderRadius:20,padding:"8px 18px",color:t.text,fontSize:13,fontWeight:500,zIndex:999,boxShadow:"0 6px 24px rgba(0,0,0,.3)",display:"flex",alignItems:"center",gap:7,whiteSpace:"nowrap",animation:"toastIn .2s ease",transform:"translateX(-50%)"}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:ac}}/>
            {toast}
          </div>
        )}
      </div>
    </>
  );
}

/* ══ MESSAGE BUBBLE ══════════════════════════════════════════ */
function MsgBubble({ msg, t, ac, copyCode, copied }) {
  const isUser  = msg.role==="user";
  const isStream= msg.streaming;
  const parts   = isUser ? null : parseParts(msg.content);
  const mdl     = MODELS.find(m=>m.id===msg.modelId)||MODELS[0];
  const isDeep  = msg.mode==="deep";
  const mc      = isDeep?"#a855f7":mdl.color;

  return (
    <div className="msg-in" style={{marginBottom:isUser?12:20,display:"flex",flexDirection:isUser?"row-reverse":"row",gap:10,alignItems:"flex-start"}}>
      {!isUser&&(
        <div style={{width:28,height:28,borderRadius:8,background:isDeep?"linear-gradient(135deg,#a855f7,#6644ff)":`linear-gradient(135deg,${mc},${mc}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,marginTop:2,boxShadow:`0 3px 10px ${mc}30`}}>
          {mdl.icon}
        </div>
      )}
      <div style={{maxWidth:"86%",display:"flex",flexDirection:"column",gap:3,alignItems:isUser?"flex-end":"flex-start",minWidth:0}}>
        {!isUser&&(
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
            <span style={{color:mc,fontSize:11,fontWeight:700}}>{mdl.label}</span>
            <span style={{background:`${mc}18`,border:`1px solid ${mc}28`,color:mc,fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:3}}>
              {isDeep?"DEEP":"QUICK"}
            </span>
          </div>
        )}
        <div style={{background:isUser?`linear-gradient(135deg,${ac},${ac}cc)`:t.surface,border:isUser?"none":`1px solid ${t.border}`,borderRadius:isUser?"14px 3px 14px 14px":"3px 14px 14px 14px",padding:"10px 14px",boxShadow:isUser?`0 4px 18px ${ac}28`:"none",maxWidth:"100%",minWidth:0}}>
          {isUser?(
            <p style={{color:"#fff",fontSize:14,lineHeight:1.7,margin:0,wordBreak:"break-word"}}>{msg.content}</p>
          ):(
            <div style={{maxWidth:"100%",minWidth:0}} className={isStream?"cursor":""}>
              {(parts||[]).map((part,i)=>{
                if(part.type==="text") return(
                  <MarkdownBlock key={i} text={part.content} color={t.text} ac={ac}/>
                );
                const ck=`${msg.id}-${i}`;
                return(
                  <div key={i} className="code-wrap" style={{margin:"10px 0",background:t.s2,borderRadius:10,border:`1px solid ${t.border}`,overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 12px",borderBottom:`1px solid ${t.border}`,background:t.bg}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{display:"flex",gap:4}}>
                          <div style={{width:9,height:9,borderRadius:"50%",background:"#ff5f56"}}/>
                          <div style={{width:9,height:9,borderRadius:"50%",background:"#ffbd2e"}}/>
                          <div style={{width:9,height:9,borderRadius:"50%",background:"#27c93f"}}/>
                        </div>
                        <span style={{color:isDeep?"#c084fc":ac,fontSize:10,fontFamily:"'JetBrains Mono',monospace",fontWeight:700,letterSpacing:.8}}>{(part.lang||"lua").toUpperCase()}</span>
                      </div>
                      <button className="copy-btn btn" onClick={()=>copyCode(part.content,ck)}
                        style={{background:t.side,border:`1px solid ${t.border}`,borderRadius:5,padding:"2px 9px",color:t.muted,fontSize:10,fontWeight:600}}>
                        {copied[ck]?"✓":"Copy"}
                      </button>
                    </div>
                    <pre style={{margin:0,padding:"12px 14px",overflowX:"auto",fontFamily:"'JetBrains Mono',monospace",fontSize:12.5,color:t.text,lineHeight:1.75,tabSize:2}}>
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

function TypingBubble({ t, model }) {
  return (
    <div className="msg-in" style={{display:"flex",gap:10,marginBottom:16,alignItems:"flex-start"}}>
      <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${model.color},${model.color}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0,boxShadow:`0 3px 10px ${model.color}30`}}>
        {model.icon}
      </div>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:"3px 14px 14px 14px",padding:"12px 18px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{color:t.muted,fontSize:13}}>{model.name} is thinking</span>
        <div style={{display:"flex",gap:4,alignItems:"flex-end",height:14}}>
          <div className="d1" style={{width:6,height:6,borderRadius:"50%",background:model.color}}/>
          <div className="d2" style={{width:6,height:6,borderRadius:"50%",background:model.color}}/>
          <div className="d3" style={{width:6,height:6,borderRadius:"50%",background:model.color}}/>
        </div>
      </div>
    </div>
  );
}
