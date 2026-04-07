import { useState, useRef, useEffect, useCallback } from "react";

/* ================================================================
   DEVIX AI — Puter.js (Claude Sonnet 4.5 FREE) + SVG icons
   • Atom icon for Zeno
   • Outline SVG service icons
   • Puter.js primary AI (free, streaming)
   • Groq fallback via /api/chat
   • Plugin game builder
================================================================ */

const OWNER_KEY = "ZenoZiathSully";
const K_SECRET  = "dvx_k_2024_x9z";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/* ── KEY SYSTEM ── */
function genKey(type,idx){
  const str=`${type}:${idx}:${K_SECRET}`;
  let h=0x811c9dc5;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193);}
  const hash=(h>>>0).toString(16).toUpperCase().padStart(8,"0");
  return `${type.toUpperCase()}-${idx.toString(16).toUpperCase().padStart(3,"0")}-${hash}`;
}
function validateKey(raw){
  const key=raw.trim().toUpperCase(); const parts=key.split("-");
  if(parts.length!==3) return null;
  const[type,idxHex]=parts;
  if(type!=="ZAITH"&&type!=="ZENO") return null;
  const idx=parseInt(idxHex,16);
  if(isNaN(idx)||idx>0xFFF) return null;
  if(key!==genKey(type,idx)) return null;
  return type.toLowerCase();
}

/* ── STORAGE ── */
const LS={
  g:(k,d=null)=>{try{return JSON.parse(localStorage.getItem(k)??"null")??d;}catch{return d;}},
  s:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
  d:(k)=>{try{localStorage.removeItem(k);}catch{}},
};

/* ── JWT PARSE ── */
function parseJwt(t){try{return JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));}catch{return {};}}

/* ── MODELS ── */
const MODELS={
  zenith:{id:"zenith",name:"Zenith",sub:"Standard · Free",  desc:"Fast, accurate Luau scripts.",     color:"#a855f7",bg:"rgba(168,85,247,.09)",free:true, mode:"quick"},
  zaith: {id:"zaith", name:"Zaith", sub:"Advanced · Key",   desc:"Deeper architecture, better code. Requires a key.",  color:"#8b5cf6",bg:"rgba(139,92,246,.09)",free:false,mode:"zaith"},
  zeno:  {id:"zeno",  name:"Zeno",  sub:"Maximum · Key",    desc:"Full power, best possible answers.",           color:"#7c3aed",bg:"rgba(124,58,237,.09)",free:false,mode:"zeno"},
};

/* ── SYSTEM PROMPTS ── */
const BASE=`You are Devix — expert Roblox Studio AI. NOT Claude or any AI brand.
CODE: Luau only. task.wait() not wait(). task.spawn() not spawn(). Complete scripts in \`\`\`lua blocks. Start every script with -- @name ScriptName. No placeholders. Add comments.
FORMAT: **bold** key terms, ## headers, - lists, \`inline\` for API names.
RULES: No exploits, no NSFW.`;
const SYS={
  zenith:BASE+"\nBe concise and direct.",
  zaith: BASE+"\nBe thorough. Full working systems.",
  zeno:  BASE+"\nBe comprehensive. Best architecture. Complete optimised code covering every edge case.",
};

/* ── PUTER.JS AI (PRIMARY — FREE Claude Sonnet 4.5) ── */
async function callPuter(modelId, messages, sysOverride, onChunk) {
  const sys = sysOverride || SYS[modelId] || SYS.zenith;
  // Puter uses claude-sonnet-4-5 for all tiers (free)
  // Zeno gets extra tokens via longer system prompt
  const fullMessages = [
    { role:"system", content: sys },
    ...messages,
  ];
  // puter.ai.chat accepts standard messages array
  const resp = await window.puter.ai.chat(
    fullMessages[fullMessages.length - 1].content,
    {
      model: "claude-opus-4-6",
      stream: true,
      // include prior context as system prefix
      system: fullMessages.slice(0,-1).map(m=>m.role+": "+m.content).join("\n\n"),
    }
  );
  let full = "";
  for await (const part of resp) {
    const chunk = part?.text || "";
    full += chunk;
    if (onChunk) onChunk(full);
  }
  return full;
}

/* ── GROQ FALLBACK ── */
async function callGroqFallback(modelId, messages) {
  const sys = SYS[modelId] || SYS.zenith;
  const r = await fetch("/api/chat", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ mode: MODELS[modelId]?.mode || "quick", system: sys, messages }),
  });
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e?.error||`HTTP ${r.status}`);}
  return (await r.json()).text||"";
}

/* ── UNIFIED AI CALL ── */
async function callAI(modelId, messages, sysOverride, onChunk) {
  // Try Puter first (free Claude), fall back to Groq
  try {
    if (window.puter?.ai?.chat) {
      return await callPuter(modelId, messages, sysOverride, onChunk);
    }
  } catch(e) {
    console.warn("Puter.js failed, falling back to Groq:", e.message);
  }
  // Groq fallback (no streaming)
  const result = await callGroqFallback(modelId, messages);
  if(onChunk) onChunk(result);
  return result;
}

/* ── STREAMING ── */
async function streamText(text, onUpdate, signal) {
  const toks=text.split(/(\s+)/); let out="";
  for(const t of toks){
    if(signal?.aborted) break;
    out+=t; onUpdate(out);
    await new Promise(r=>setTimeout(r,7+Math.random()*11));
  }
  onUpdate(text);
}

/* ── SCRIPT HELPERS ── */
function extractScriptName(code,hint=""){
  const nm=code.match(/--\s*@name\s+(.+)/i);
  if(nm) return nm[1].trim().replace(/\s+/g,"");
  const words=hint.split(/\s+/).filter(w=>w.length>3).slice(0,2);
  return words.length?words.map(w=>w[0].toUpperCase()+w.slice(1)).join("")+"Script":"DevixScript";
}
function extractScripts(content,hint=""){
  const scripts=[]; const re=/```(?:lua|luau)\n?([\s\S]*?)```/g; let m,i=0;
  while((m=re.exec(content))!==null){
    const code=m[1].trim();
    scripts.push({id:Date.now()+i++,name:extractScriptName(code,hint),content:code});
  }
  return scripts;
}

/* ── MARKDOWN ── */
function inl(text,ms,seed=""){
  const re=/(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;
  const out=[]; let last=0,m2,n=0;
  while((m2=re.exec(text))!==null){
    if(m2.index>last) out.push(text.slice(last,m2.index));
    if(m2[0].startsWith("**")) out.push(<strong key={seed+n++} style={{fontWeight:700}}>{m2[2]}</strong>);
    else if(m2[0].startsWith("*")) out.push(<em key={seed+n++}>{m2[3]}</em>);
    else out.push(<code key={seed+n++} style={ms}>{m2[4]}</code>);
    last=m2.index+m2[0].length;
  }
  if(last<text.length) out.push(text.slice(last));
  return out;
}
function MD({text,tc="#bbb"}){
  if(!text) return null;
  const ms={background:"rgba(168,85,247,.15)",borderRadius:4,padding:"1px 6px",fontFamily:"'JetBrains Mono',monospace",fontSize:"0.87em"};
  const lines=text.split("\n"); const result=[]; let i=0;
  while(i<lines.length){
    const ln=lines[i];
    if(/^#{1,3} /.test(ln)){
      const lvl=ln.match(/^(#{1,3}) /)[1].length;
      result.push(<div key={i} style={{fontSize:[18,15,13][lvl-1],fontWeight:[800,700,600][lvl-1],color:tc,margin:"11px 0 5px"}}>{inl(ln.slice(lvl+1),ms,`h${i}`)}</div>);
    }else if(/^[-•*] /.test(ln)){
      const items=[];
      while(i<lines.length&&/^[-•*] /.test(lines[i])){items.push(<li key={i} style={{marginBottom:3,lineHeight:1.7}}>{inl(lines[i].slice(2),ms,`li${i}`)}</li>);i++;}
      result.push(<ul key={`ul${i}`} style={{paddingLeft:18,margin:"5px 0",color:tc,fontSize:14}}>{items}</ul>);continue;
    }else if(/^\d+\. /.test(ln)){
      const items=[];
      while(i<lines.length&&/^\d+\. /.test(lines[i])){items.push(<li key={i} style={{marginBottom:3,lineHeight:1.7}}>{inl(lines[i].replace(/^\d+\. /,""),ms,`ol${i}`)}</li>);i++;}
      result.push(<ol key={`ol${i}`} style={{paddingLeft:18,margin:"5px 0",color:tc,fontSize:14}}>{items}</ol>);continue;
    }else if(/^-{3,}$/.test(ln.trim())){
      result.push(<hr key={i} style={{border:"none",borderTop:"1px solid rgba(255,255,255,.05)",margin:"9px 0"}}/>);
    }else if(ln.trim()===""){
      result.push(<div key={i} style={{height:4}}/>);
    }else{
      result.push(<p key={i} style={{margin:"2px 0",lineHeight:1.78,color:tc,fontSize:14,wordBreak:"break-word"}}>{inl(ln,ms,`p${i}`)}</p>);
    }
    i++;
  }
  return <>{result}</>;
}
function parseParts(content){
  const parts=[]; const re=/```(\w*)\n?([\s\S]*?)```/g; let last=0,m2;
  while((m2=re.exec(content))!==null){
    if(m2.index>last) parts.push({type:"text",content:content.slice(last,m2.index)});
    parts.push({type:"code",lang:m2[1]||"lua",content:m2[2].trim()});
    last=m2.index+m2[0].length;
  }
  if(last<content.length) parts.push({type:"text",content:content.slice(last)});
  return parts;
}
const nowTS=()=>new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

/* ================================================================
   SVG ICONS — all outline / hand-drawn style
================================================================ */
function Icon({d,size=18,color="currentColor",strokeWidth=1.6,fill="none"}){
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {typeof d==="string"?<path d={d}/>:d}
    </svg>
  );
}

/* Atom icon for Zeno */
function AtomIcon({size=22,color="#7c3aed"}){
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {/* Nucleus */}
      <circle cx="12" cy="12" r="2"/>
      {/* Orbit 1 — horizontal */}
      <ellipse cx="12" cy="12" rx="10" ry="4"/>
      {/* Orbit 2 — 60deg */}
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/>
      {/* Orbit 3 — 120deg */}
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>
    </svg>
  );
}

/* Lightning for Zenith */
function BoltIcon({size=22,color="#a855f7"}){
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

/* Geometric Z for Zaith */
function ZaithIcon({size=22,color="#8b5cf6"}){
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 5 19 5 7 19 19 19"/>
      <line x1="5" y1="5" x2="5" y2="9"/>
      <line x1="19" y1="15" x2="19" y2="19"/>
    </svg>
  );
}

/* DVX logo */
function LogoDVX({size=32}){
  return(
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="10" fill="#0a0a0a" stroke="#1e1e1e" strokeWidth="1"/>
      <ellipse cx="20" cy="20" rx="17" ry="10" fill="none" stroke="white" strokeWidth="1.5"/>
      <ellipse cx="20" cy="20" rx="10" ry="17" fill="none" stroke="white" strokeWidth="1.5"/>
      <text x="20" y="24" textAnchor="middle" fill="white" fontSize="9" fontWeight="900" fontFamily="Arial">DVX</text>
    </svg>
  );
}

function ModelIcon({modelId,size=18}){
  if(modelId==="zenith") return <BoltIcon size={size} color={MODELS.zenith.color}/>;
  if(modelId==="zaith")  return <ZaithIcon size={size} color={MODELS.zaith.color}/>;
  if(modelId==="zeno")   return <AtomIcon size={size} color={MODELS.zeno.color}/>;
  return <BoltIcon size={size} color="#a855f7"/>;
}

/* ── SERVICE OUTLINE ICONS ── */
function SvcIcon({svcId,size=13,color}){
  const c=color||"#444";
  const sw=1.4;
  const props={size,color:c,strokeWidth:sw};
  const icons={
    workspace:  <Icon {...props} d="M3 12l9-9 9 9M5 10v10h14V10"/>,
    players:    <Icon {...props} d={<><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="17" cy="7" r="2"/><path d="M21 21v-2a3 3 0 00-2-2.83"/></>}/>,
    lighting:   <Icon {...props} d="M15 14a7 7 0 10-14 0 7 7 0 0014 0zM12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>,
    repfirst:   <Icon {...props} d={<><polyline points="3 6 5 8 7 6"/><path d="M5 8V4"/><polyline points="3 16 5 14 7 16"/><path d="M5 14v4"/><path d="M10 5h11M10 12h11M10 19h11"/></>}/>,
    replicated: <Icon {...props} d="M22 3H2l8 9.46V19l4 2v-8.54L22 3"/>,
    sss:        <Icon {...props} d="M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242M12 12v9M8 17l4 4 4-4"/>,
    serverstorage:<Icon {...props} d={<><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>}/>,
    startergui: <Icon {...props} d={<><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/></>}/>,
    starterpack: <Icon {...props} d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M8.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 8v6M23 11h-6"/>,
    starterplayer:<Icon {...props} d={<><circle cx="12" cy="8" r="4"/><path d="M6 20v-1a6 6 0 0112 0v1"/></>}/>,
    charscripts: <Icon {...props} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>,
    playerscripts:<Icon {...props} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>,
    soundservice:<Icon {...props} d="M9 18V5l12-2v13M9 9l12-2M21 16c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM6 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>,
    chat:        <Icon {...props} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>,
    script:      <Icon {...props} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>,
  };
  return icons[svcId]||icons.script;
}

/* ── ROBLOX SERVICES ── */
const SERVICES=[
  {id:"workspace",    name:"Workspace",             color:"#22c55e",isScriptTarget:false},
  {id:"players",      name:"Players",               color:"#3b82f6"},
  {id:"lighting",     name:"Lighting",              color:"#eab308"},
  {id:"repfirst",     name:"ReplicatedFirst",       color:"#64748b"},
  {id:"replicated",   name:"ReplicatedStorage",     color:"#64748b"},
  {id:"sss",          name:"ServerScriptService",   color:"#3b82f6",isScriptTarget:true},
  {id:"serverstorage",name:"ServerStorage",         color:"#8b5cf6"},
  {id:"startergui",   name:"StarterGui",            color:"#f59e0b"},
  {id:"starterpack",  name:"StarterPack",           color:"#10b981"},
  {id:"starterplayer",name:"StarterPlayer",         color:"#6366f1",children:[
    {id:"charscripts",   name:"StarterCharacterScripts",color:"#6366f1"},
    {id:"playerscripts", name:"StarterPlayerScripts",   color:"#6366f1"},
  ]},
  {id:"soundservice", name:"SoundService",          color:"#8b5cf6"},
  {id:"chat",         name:"TextChatService",       color:"#22c55e"},
];

/* ── UI PRESET ICONS ── */
const UI_TYPES=[
  {type:"Frame",       label:"Frame",       hint:"a clean dark container frame"},
  {type:"TextButton",  label:"Button",      hint:"a rounded purple action button"},
  {type:"TextLabel",   label:"Label",       hint:"a bold title text label"},
  {type:"TextBox",     label:"TextBox",     hint:"a sleek input text box"},
  {type:"ImageLabel",  label:"Image",       hint:"an icon placeholder square"},
  {type:"ScrollFrame", label:"ScrollFrame", hint:"a scrollable list panel"},
];

const SYS_UI=`You are a Roblox UI designer. Return ONLY valid JSON — no markdown, no explanation.
Format: {"elements":[{"id":1,"type":"Frame","x":20,"y":20,"w":350,"h":500,"bg":"#1a1a2e","corner":16,"text":"","textColor":"#fff","fontSize":14},...]}
Types: Frame TextButton TextLabel TextBox ImageLabel ScrollingFrame
Canvas=390x640. Make it look modern, use good colors, readable contrast. Position elements logically inside parent frames.`;

const nowId=()=>Date.now()+Math.random();

/* ── CSS ── */
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;overflow:hidden}
body{font-family:'Inter',sans-serif;background:#070707;color:#e0e0e0;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1c1c1c;border-radius:4px}
textarea,input,button,select{font-family:'Inter',sans-serif}textarea:focus,input:focus{outline:none}button{cursor:pointer;border:none;background:none}
@keyframes fadeUp  {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes fadeIn  {from{opacity:0}to{opacity:1}}
@keyframes scaleIn {from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
@keyframes blink   {0%,100%{opacity:1}50%{opacity:0}}
@keyframes bounce  {0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
@keyframes spin    {from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes pulse   {0%,100%{opacity:1}50%{opacity:.3}}
@keyframes kpop    {0%{opacity:0;transform:translateY(4px) scale(.95)}20%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
@keyframes orbit   {from{transform:rotate(0)}to{transform:rotate(360deg)}}
.up  {animation:fadeUp  .24s cubic-bezier(.22,1,.36,1) both}
.fade{animation:fadeIn  .18s ease both}
.scl {animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both}
.navr{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;color:#2e2e2e;font-size:13px;cursor:pointer;transition:all .12s;user-select:none}
.navr:hover{background:#0f0f0f;color:#666}
.navr.act{background:#0f0f0f;color:#ccc}
.trow{display:flex;align-items:center;gap:5px;border-radius:6px;cursor:pointer;transition:background .1s;user-select:none;padding:3px 5px}
.trow:hover{background:#0f0f0f}
.trow.sel{background:#111}
.ibox{border:1px solid #181818;border-radius:12px;transition:border-color .18s,box-shadow .18s}
.ibox:focus-within{border-color:#a855f7!important;box-shadow:0 0 0 3px rgba(168,85,247,.09)!important}
.cursor::after{content:"▋";color:#a855f7;animation:blink .6s step-end infinite;margin-left:1px}
.cpb{opacity:0;transition:opacity .12s}
.cw:hover .cpb{opacity:1}
.d1{animation:bounce 1.4s ease 0s infinite}
.d2{animation:bounce 1.4s ease .15s infinite}
.d3{animation:bounce 1.4s ease .30s infinite}
.inp{background:#0c0c0c;border:1px solid #181818;border-radius:8px;padding:8px 11px;color:#ccc;font-size:13px;width:100%;transition:border-color .15s}
.inp:focus{border-color:#a855f7!important}
.btn-pri{background:linear-gradient(135deg,#7c3aed,#a855f7);border:none;border-radius:9px;color:#fff;font-weight:700;cursor:pointer;transition:filter .12s,transform .12s}
.btn-pri:hover{filter:brightness(1.1);transform:translateY(-1px)}
.btn-sec{background:#131313;border:1px solid #181818;border-radius:9px;color:#555;font-weight:600;cursor:pointer;transition:filter .12s}
.btn-sec:hover{filter:brightness(1.2)}
.mcard{border:1px solid #161616;border-radius:14px;padding:20px;background:#0b0b0b;transition:border-color .2s,transform .18s;cursor:pointer}
.mcard:hover{border-color:#222;transform:translateY(-2px)}
.ui-el{position:absolute;cursor:move;user-select:none;display:flex;align-items:center;justify-content:center;transition:outline .1s}
.ui-el:hover{outline:1px dashed rgba(168,85,247,.3)}
.ui-el.sel-el{outline:2px solid #a855f7!important}
.kpop{animation:kpop 2.4s ease forwards;position:absolute;bottom:calc(100%+5px);left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none}
.puter-badge{display:inline-flex;align-items:center;gap:4px;background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.2);border-radius:5px;padding:2px 7px;font-size:10px;color:#a855f7;font-weight:600}
`;

/* ================================================================
   CODE BLOCK
================================================================ */
function CodeBlock({lang,code,onCopy,copied}){
  return(
    <div className="cw" style={{background:"#090909",borderRadius:9,border:"1px solid #151515",overflow:"hidden",margin:"7px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",borderBottom:"1px solid #131313"}}>
        <span style={{fontSize:11,color:"#2a2a2a",fontFamily:"'JetBrains Mono',monospace"}}>{lang||"lua"}</span>
        <button className="cpb" onClick={onCopy}
          style={{background:"rgba(168,85,247,.1)",border:"1px solid rgba(168,85,247,.2)",borderRadius:5,padding:"3px 9px",color:"#a855f7",fontSize:11,fontWeight:600,cursor:"pointer"}}>
          {copied?"✓ Copied":"Copy"}
        </button>
      </div>
      <pre style={{padding:"12px 14px",overflowX:"auto",fontSize:12.5,lineHeight:1.68,fontFamily:"'JetBrains Mono',monospace",color:"#aaa",margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{code}</pre>
    </div>
  );
}

/* ================================================================
   CHAT MESSAGE
================================================================ */
function ChatMsg({msg,modelId,onCopy,copied}){
  const isUser=msg.role==="user";
  const ac=MODELS[modelId]?.color||"#a855f7";
  const ms={background:`${ac}18`,borderRadius:4,padding:"1px 6px",fontFamily:"'JetBrains Mono',monospace",fontSize:"0.87em"};
  return(
    <div className="up" style={{display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start",padding:"2px 0"}}>
      {!isUser&&(
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
          <ModelIcon modelId={modelId} size={14}/>
          <span style={{fontSize:11,color:"#2a2a2a",fontWeight:500}}>Devix {MODELS[modelId]?.name} · {msg.ts}</span>
          {msg.source==="puter"&&<span className="puter-badge">✦ Claude</span>}
        </div>
      )}
      <div style={{maxWidth:"86%",background:isUser?"rgba(168,85,247,.04)":"#0c0c0c",border:`1px solid ${isUser?"rgba(168,85,247,.1)":"#141414"}`,borderRadius:isUser?"12px 12px 3px 12px":"3px 12px 12px 12px",padding:"10px 14px"}}>
        {isUser
          ?<p style={{color:"#bbb",fontSize:14,lineHeight:1.72,whiteSpace:"pre-wrap"}}>{msg.content}</p>
          :<>
            {parseParts(msg.content).map((p,i)=>
              p.type==="code"
                ?<CodeBlock key={i} lang={p.lang} code={p.content} onCopy={()=>onCopy(p.content,`${msg.id}-${i}`)} copied={copied[`${msg.id}-${i}`]}/>
                :<MD key={i} text={p.content}/>
            )}
            {msg.streaming&&<span className="cursor"/>}
          </>
        }
      </div>
      {isUser&&<span style={{fontSize:10,color:"#1e1e1e",marginTop:3}}>{msg.ts}</span>}
    </div>
  );
}

/* ================================================================
   SCRIPT VIEWER MODAL
================================================================ */
function ScriptViewerModal({script,onClose,onUpdate,modelId,showToast}){
  const[content,setContent]=useState(script.content);
  const[ask,setAsk]=useState("");
  const[loading,setLoading]=useState(false);
  const askAI=async()=>{
    if(!ask.trim()||loading) return;
    setLoading(true);
    try{
      const result=await callAI(modelId,[{role:"user",content:`Script "${script.name}":\n\`\`\`lua\n${content}\n\`\`\`\n\nRequest: ${ask}\n\nReturn the complete updated script in a \`\`\`lua block.`}]);
      const cm=result.match(/```(?:lua|luau)\n?([\s\S]*?)```/);
      if(cm){setContent(cm[1].trim());onUpdate({...script,content:cm[1].trim()});showToast("Script updated!");}
    }catch(e){showToast(`Error: ${e.message}`);}
    setAsk("");setLoading(false);
  };
  return(
    <div className="fade" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.9)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="scl" style={{background:"#0d0d0d",border:"1px solid #1a1a1a",borderRadius:14,width:"100%",maxWidth:720,height:"82vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",borderBottom:"1px solid #141414",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <SvcIcon svcId="script" size={14} color="#555"/>
            <span style={{fontSize:13,fontWeight:600,color:"#ccc"}}>{script.name}.lua</span>
          </div>
          <button onClick={onClose} style={{color:"#333",fontSize:14,padding:"3px 8px",background:"#131313",borderRadius:6,border:"1px solid #1a1a1a"}}>✕</button>
        </div>
        <textarea value={content} onChange={e=>setContent(e.target.value)}
          style={{flex:1,background:"#080808",border:"none",resize:"none",padding:"14px 16px",fontFamily:"'JetBrains Mono',monospace",fontSize:12.5,lineHeight:1.7,color:"#aaa",minHeight:0}}/>
        <div style={{borderTop:"1px solid #141414",padding:"10px 14px",flexShrink:0}}>
          <div style={{fontSize:11,color:"#2a2a2a",marginBottom:6,fontWeight:500}}>Ask AI to modify</div>
          <div style={{display:"flex",gap:7}}>
            <input className="inp" value={ask} onChange={e=>setAsk(e.target.value)} onKeyDown={e=>e.key==="Enter"&&askAI()} placeholder={`"Add cooldown" or "Fix the damage calculation"…`} style={{flex:1}}/>
            <button onClick={askAI} disabled={loading} className="btn-pri" style={{padding:"9px 16px",fontSize:13,flexShrink:0,opacity:loading?.6:1}}>
              {loading?<span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:12}}>⟳</span>:"→"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   PROJECT TREE
================================================================ */
function ProjectTree({project,onScriptOpen}){
  const[expSvc,setExpSvc]=useState({sss:true,workspace:true});
  const[expRoot,setExpRoot]=useState(true);
  const toggle=k=>setExpSvc(p=>({...p,[k]:!p[k]}));
  return(
    <div style={{display:"flex",flexDirection:"column",gap:1}}>
      <div className="trow sel" onClick={()=>setExpRoot(p=>!p)} style={{gap:5,paddingLeft:3}}>
        <span style={{color:"#222",fontSize:8}}>{expRoot?"▼":"▶"}</span>
        <SvcIcon svcId="workspace" size={12} color="#444"/>
        <span style={{fontSize:11.5,color:"#666",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project.name}</span>
      </div>
      {expRoot&&(
        <div style={{paddingLeft:10}}>
          {SERVICES.map(svc=>(
            <div key={svc.id} style={{marginBottom:1}}>
              <div className="trow" onClick={()=>toggle(svc.id)} style={{paddingLeft:2,gap:5}}>
                <span style={{color:"#1e1e1e",fontSize:8}}>{expSvc[svc.id]?"▼":"▶"}</span>
                <SvcIcon svcId={svc.id} size={12} color={expSvc[svc.id]?"#444":"#2a2a2a"}/>
                <span style={{fontSize:11,color:expSvc[svc.id]?"#555":"#333"}}>{svc.name}</span>
              </div>
              {expSvc[svc.id]&&(
                <div style={{paddingLeft:14}}>
                  {svc.isScriptTarget&&(project.scripts||[]).map(s=>(
                    <div key={s.id} className="trow" onDoubleClick={()=>onScriptOpen(s)} style={{paddingLeft:2,gap:5}}>
                      <SvcIcon svcId="script" size={11} color="#555"/>
                      <span style={{fontSize:11,color:"#555",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                    </div>
                  ))}
                  {svc.isScriptTarget&&!(project.scripts||[]).length&&(
                    <span style={{fontSize:10,color:"#1e1e1e",fontStyle:"italic",paddingLeft:4}}>no scripts</span>
                  )}
                  {svc.children?.map(ch=>(
                    <div key={ch.id} className="trow" style={{paddingLeft:2,gap:5}}>
                      <SvcIcon svcId={ch.id} size={11} color="#333"/>
                      <span style={{fontSize:11,color:"#2a2a2a"}}>{ch.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   UI GENERATOR — AI builds canvas elements
================================================================ */
function UIGenerator({modelId,showToast}){
  const[elements,setElements]=useState([]);
  const[selected,setSelected]=useState(null);
  const[promptModal,setPromptModal]=useState(null);
  const[promptText,setPromptText]=useState("");
  const[generating,setGenerating]=useState(false);
  const canvasRef=useRef(null);
  const dragRef=useRef(null);

  const generate=async()=>{
    if(!promptText.trim()||generating) return;
    setGenerating(true); setPromptModal(null);
    try{
      const result=await callAI(modelId,[{role:"user",content:`Design: ${promptModal.type}: ${promptText}`}],SYS_UI);
      const clean=result.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
      let parsed;
      try{parsed=JSON.parse(clean);}
      catch{const m=clean.match(/\{[\s\S]*\}/);if(m)parsed=JSON.parse(m[0]);else throw new Error("No valid JSON");}
      const els=(parsed.elements||[]).map((el,i)=>({
        id:Date.now()+i,type:el.type||promptModal.type,
        x:Math.max(0,el.x||20),y:Math.max(0,el.y||20),
        w:Math.min(380,el.w||200),h:Math.min(620,el.h||100),
        bg:el.bg||"#1a1a2e",corner:el.corner??10,
        text:el.text||"",textColor:el.textColor||"#fff",fontSize:el.fontSize||14,
      }));
      setElements(p=>[...p,...els]);
      showToast(`Generated ${els.length} element${els.length>1?"s":""}!`);
    }catch(e){showToast(`Error: ${e.message}`);}
    setGenerating(false);
  };

  const startDrag=(e,id)=>{
    e.preventDefault();
    const el=elements.find(x=>x.id===id);
    const sx=e.clientX-el.x,sy=e.clientY-el.y;
    dragRef.current={id,sx,sy};
    const onMove=ev=>{if(!dragRef.current)return;setElements(p=>p.map(e2=>e2.id===dragRef.current.id?{...e2,x:ev.clientX-dragRef.current.sx,y:ev.clientY-dragRef.current.sy}:e2));};
    const onUp=()=>{dragRef.current=null;window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
    setSelected(id);
  };

  const selEl=elements.find(e=>e.id===selected);
  const upd=(patch)=>setElements(p=>p.map(e=>e.id===selected?{...e,...patch}:e));

  return(
    <div style={{display:"flex",height:"100%"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Type bar */}
        <div style={{padding:"9px 14px",borderBottom:"1px solid #0d0d0d",display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",flexShrink:0}}>
          <span style={{fontSize:10,color:"#222",fontWeight:600,marginRight:2}}>ADD</span>
          {UI_TYPES.map(tp=>(
            <button key={tp.type} onClick={()=>{setPromptModal(tp);setPromptText("");}}
              style={{background:"#0f0f0f",border:"1px solid #181818",borderRadius:7,padding:"5px 10px",color:"#444",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .12s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#a855f7";e.currentTarget.style.color="#a855f7";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#181818";e.currentTarget.style.color="#444";}}>
              {tp.label}
            </button>
          ))}
          {generating&&<span style={{fontSize:11,color:"#a855f7",display:"flex",alignItems:"center",gap:4}}><span style={{animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</span>AI generating…</span>}
          {elements.length>0&&<button onClick={()=>{setElements([]);setSelected(null);}} style={{marginLeft:"auto",background:"transparent",border:"1px solid #181818",borderRadius:7,padding:"5px 10px",color:"#2a2a2a",fontSize:11,cursor:"pointer"}}>Clear</button>}
        </div>
        {/* Canvas */}
        <div style={{flex:1,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"#040404",padding:20}}>
          <div ref={canvasRef} style={{width:390,height:640,background:"#111",borderRadius:20,border:"1px solid #1a1a1a",position:"relative",overflow:"hidden",flexShrink:0,boxShadow:"0 28px 80px rgba(0,0,0,.8)"}}
            onClick={e=>{if(e.target===canvasRef.current)setSelected(null);}}>
            {elements.length===0&&!generating&&(
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8,opacity:.2}}>
                <SvcIcon svcId="startergui" size={40} color="#666"/>
                <span style={{fontSize:12,color:"#666"}}>Click a type above to generate</span>
              </div>
            )}
            {elements.map(el=>(
              <div key={el.id} className={`ui-el${el.id===selected?" sel-el":""}`}
                style={{left:el.x,top:el.y,width:el.w,height:el.h,background:el.bg==="transparent"?"transparent":el.bg,borderRadius:el.corner,overflow:"hidden"}}
                onMouseDown={e=>startDrag(e,el.id)} onClick={e=>{e.stopPropagation();setSelected(el.id);}}>
                {el.text&&<span style={{color:el.textColor,fontSize:el.fontSize,fontWeight:500,pointerEvents:"none",textAlign:"center",padding:"0 8px"}}>{el.text}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Properties */}
      <div style={{width:210,borderLeft:"1px solid #0d0d0d",padding:"12px 10px",overflowY:"auto",flexShrink:0}}>
        <div style={{fontSize:10,color:"#a855f7",fontWeight:600,marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>Properties</div>
        {!selEl&&<p style={{fontSize:11,color:"#1e1e1e",fontStyle:"italic"}}>Click an element</p>}
        {selEl&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{fontSize:11,color:"#444",fontWeight:500}}>{selEl.type}</div>
            {["TextButton","TextLabel","TextBox"].includes(selEl.type)&&(
              <>
                <label style={{fontSize:10,color:"#333"}}>Text</label>
                <input className="inp" value={selEl.text} onChange={e=>upd({text:e.target.value})} style={{padding:"5px 8px",fontSize:12}}/>
                <label style={{fontSize:10,color:"#333"}}>Text Color</label>
                <input type="color" value={selEl.textColor} onChange={e=>upd({textColor:e.target.value})} style={{width:"100%",height:24,background:"none",border:"1px solid #181818",borderRadius:6,cursor:"pointer"}}/>
              </>
            )}
            <label style={{fontSize:10,color:"#333"}}>Background</label>
            <input type="color" value={selEl.bg||"#1a1a2e"} onChange={e=>upd({bg:e.target.value})} style={{width:"100%",height:24,background:"none",border:"1px solid #181818",borderRadius:6,cursor:"pointer"}}/>
            <label style={{fontSize:10,color:"#333"}}>Corner: {selEl.corner}px</label>
            <input type="range" min={0} max={40} value={selEl.corner} onChange={e=>upd({corner:+e.target.value})} style={{accentColor:"#a855f7"}}/>
            <div style={{display:"flex",gap:5}}>
              {["w","h"].map(k=>(
                <div key={k} style={{flex:1}}>
                  <label style={{fontSize:10,color:"#333",display:"block",marginBottom:2}}>{k.toUpperCase()}</label>
                  <input className="inp" type="number" value={selEl[k]} onChange={e=>upd({[k]:+e.target.value})} style={{padding:"4px 7px",fontSize:12}}/>
                </div>
              ))}
            </div>
            <button onClick={()=>{setElements(p=>p.filter(e=>e.id!==selected));setSelected(null);}}
              style={{background:"rgba(239,68,68,.07)",border:"1px solid rgba(239,68,68,.15)",borderRadius:8,padding:"6px",fontSize:11,color:"#ef4444",cursor:"pointer",marginTop:2}}>Delete</button>
          </div>
        )}
      </div>
      {/* Prompt modal */}
      {promptModal&&(
        <div className="fade" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.84)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setPromptModal(null)}>
          <div className="scl" onClick={e=>e.stopPropagation()} style={{background:"#0e0e0e",border:"1px solid #1a1a1a",borderRadius:14,padding:22,maxWidth:370,width:"100%"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#ddd",marginBottom:4}}>{promptModal.label}</div>
            <div style={{fontSize:12,color:"#333",marginBottom:14}}>Describe how you want this element to look</div>
            <input className="inp" value={promptText} onChange={e=>setPromptText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generate()} placeholder={`e.g. "${promptModal.hint}"`} autoFocus style={{marginBottom:12}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setPromptModal(null)} className="btn-sec" style={{flex:1,padding:"10px",fontSize:13}}>Cancel</button>
              <button onClick={generate} className="btn-pri" style={{flex:2,padding:"10px",fontSize:13}}>✦ Generate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================
   AGENTS PANEL
================================================================ */
function AgentsPanel({user,modelId,onSelectModel,onUnlock,showToast}){
  const[keyInputs,setKeyInputs]=useState({zaith:"",zeno:""});
  const[expanded,setExpanded]=useState(null);
  const[ks,setKs]=useState({});const[kb,setKb]=useState({});
  const isOwner=user?.username?.toLowerCase()===OWNER_KEY.toLowerCase();
  const redeem=mid=>{
    const result=validateKey(keyInputs[mid]);
    if(result===mid){
      setKs(p=>({...p,[mid]:"ok"}));setKb(p=>({...p,[mid]:true}));
      setTimeout(()=>{setKb(p=>({...p,[mid]:false}));setKs(p=>({...p,[mid]:null}));},2400);
      onUnlock(mid);onSelectModel(mid);setExpanded(null);showToast(`✓ ${MODELS[mid].name} unlocked!`);
    }else{
      setKs(p=>({...p,[mid]:"err"}));setKb(p=>({...p,[mid]:true}));
      setTimeout(()=>{setKb(p=>({...p,[mid]:false}));setKs(p=>({...p,[mid]:null}));},2400);
    }
  };
  return(
    <div style={{padding:"20px 16px",overflowY:"auto",height:"100%"}}>
      <div className="up" style={{marginBottom:6}}>
        <h2 style={{fontSize:16,fontWeight:700,color:"#ddd",marginBottom:4}}>AI Models</h2>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16}}>
          <span style={{fontSize:12,color:"#333"}}>Powered by</span>
          <span className="puter-badge">✦ Claude Opus 4.6</span>
          <span style={{fontSize:11,color:"#222"}}> intelligent, efficient</span>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {Object.values(MODELS).map((m,i)=>{
          const unlocked=m.free||isOwner||user?.plan===m.id||user?.plan==="zeno"||user?.plan==="owner";
          const isActive=modelId===m.id;
          const isExp=expanded===m.id;
          const kst=ks[m.id];
          return(
            <div key={m.id} className="up" style={{animationDelay:`${i*.07}s`}}>
              <div className="mcard" style={{borderColor:isActive?`${m.color}50`:"#161616",background:isActive?m.bg:"#0b0b0b"}}
                onClick={()=>{ if(unlocked){onSelectModel(m.id);}else{setExpanded(isExp?null:m.id);} }}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div style={{width:44,height:44,borderRadius:12,background:m.bg,border:`1px solid ${m.color}20`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <ModelIcon modelId={m.id} size={26}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                      <span style={{fontWeight:700,fontSize:14,color:"#ddd"}}>{m.name}</span>
                      <span style={{fontSize:10,fontWeight:700,color:unlocked?"#22c55e":m.color,background:unlocked?"rgba(34,197,94,.1)":m.bg,border:`1px solid ${unlocked?"rgba(34,197,94,.25)":m.color+"30"}`,borderRadius:5,padding:"1px 6px"}}>
                        {unlocked?"✓ Unlocked":m.free?"Free":"Key Required"}
                      </span>
                      {isActive&&<span style={{fontSize:10,fontWeight:700,color:m.color}}>● Active</span>}
                    </div>
                    <div style={{fontSize:11,color:"#333",marginBottom:3}}>{m.sub}</div>
                    <div style={{fontSize:12,color:"#222"}}>{m.desc}</div>
                  </div>
                </div>
                {!unlocked&&isExp&&(
                  <div className="fade" onClick={e=>e.stopPropagation()} style={{marginTop:14,paddingTop:14,borderTop:"1px solid #181818"}}>
                    <div style={{fontSize:11,color:"#333",marginBottom:7}}>Enter your {m.name} key</div>
                    <div style={{position:"relative"}}>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        <input className="inp" value={keyInputs[m.id]||""} onChange={e=>setKeyInputs(p=>({...p,[m.id]:e.target.value}))}
                          onKeyDown={e=>e.key==="Enter"&&redeem(m.id)}
                          placeholder={`${m.id.toUpperCase()}-XXX-XXXXXXXX`}
                          style={{flex:1,background:"#080808",borderColor:kst==="ok"?"#22c55e":kst==="err"?"#ef4444":"#181818"}}/>
                        <button onClick={()=>redeem(m.id)} style={{background:m.color,border:"none",borderRadius:8,padding:"9px 14px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>Redeem</button>
                      </div>
                      {kb[m.id]&&(
                        <div className="kpop" style={{background:kst==="ok"?"rgba(34,197,94,.12)":"rgba(239,68,68,.12)",border:`1px solid ${kst==="ok"?"#22c55e40":"#ef444440"}`,color:kst==="ok"?"#22c55e":"#ef4444"}}>
                          {kst==="ok"?"✓ Success!":"✗ Invalid key"}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>window.open("https://discord.gg/5eSyHRTVHF","_blank")} style={{background:"transparent",border:"1px solid #181818",borderRadius:8,padding:"8px",color:"#333",fontSize:12,cursor:"pointer",width:"100%"}}>Get key on Discord →</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   SETTINGS PANEL
================================================================ */
function SettingsPanel({user,onClose,onLogout,showToast,updateUserPlan,isOwner}){
  const[kc,setKc]=useState({});
  const[keyCounter,setKeyCounter]=useState(()=>LS.g("dvx_kctr",0));
  const[genKeys,setGenKeys]=useState(()=>LS.g("dvx_gkeys",[]));
  const[genType,setGenType]=useState("ZAITH");
  const tc=t=>t==="ZENO"?"#7c3aed":"#8b5cf6";
  const doGenerate=()=>{
    const k=genKey(genType,keyCounter); const next=keyCounter+1;
    const nextKeys=[k,...genKeys].slice(0,40);
    setKeyCounter(next);LS.s("dvx_kctr",next);setGenKeys(nextKeys);LS.s("dvx_gkeys",nextKeys);
    navigator.clipboard?.writeText(k);showToast("Key generated & copied!");
  };
  const copyKey=(k,i)=>{navigator.clipboard?.writeText(k);setKc(p=>({...p,[i]:true}));setTimeout(()=>setKc(p=>({...p,[i]:false})),2000);showToast("Copied!");};
  return(
    <div className="fade" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.86)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="scl" style={{background:"#0d0d0d",border:"1px solid #1a1a1a",borderRadius:16,padding:22,maxWidth:380,width:"100%",maxHeight:"90dvh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#ccc"}}>Settings</h2>
          <button onClick={onClose} style={{color:"#333",fontSize:14,padding:"3px 8px",background:"#131313",borderRadius:6,border:"1px solid #1a1a1a"}}>✕</button>
        </div>
        <div style={{background:"#090909",border:"1px solid #141414",borderRadius:11,padding:13,marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:600,fontSize:14,color:"#ccc"}}>{user?.username}</div>
            <div style={{fontSize:12,color:MODELS[user?.plan||"zenith"]?.color,marginTop:2,fontWeight:600}}>
              {MODELS[user?.plan||"zenith"]?.name} {isOwner?"· 👑 Owner":""}
            </div>
          </div>
          <button onClick={onLogout} className="btn-sec" style={{padding:"6px 12px",fontSize:12}}>Sign Out</button>
        </div>
        {isOwner&&(
          <>
            <div style={{fontSize:11,color:"#a855f7",fontWeight:600,marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>Generate Keys</div>
            <div style={{display:"flex",background:"#080808",borderRadius:10,padding:3,marginBottom:12,gap:3}}>
              {["ZAITH","ZENO"].map(t=>(
                <button key={t} onClick={()=>setGenType(t)}
                  style={{flex:1,padding:"8px",borderRadius:7,border:"none",background:genType===t?tc(t):"transparent",color:genType===t?"#fff":"#333",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s"}}>
                  {t}
                </button>
              ))}
            </div>
            <button onClick={doGenerate} className="btn-pri" style={{width:"100%",padding:"11px",fontSize:13,marginBottom:14}}>Generate {genType} Key →</button>
            {genKeys.length>0&&(
              <div style={{background:"#080808",borderRadius:11,border:"1px solid #111",overflow:"hidden"}}>
                <div style={{padding:"8px 12px",borderBottom:"1px solid #0f0f0f",display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:"#2a2a2a",fontWeight:600}}>Keys ({genKeys.length})</span>
                  <button onClick={()=>{setGenKeys([]);LS.s("dvx_gkeys",[]);}} style={{fontSize:10,color:"#2a2a2a",background:"none",border:"none",cursor:"pointer"}}>Clear</button>
                </div>
                <div style={{maxHeight:200,overflowY:"auto"}}>
                  {genKeys.map((k,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 12px",borderBottom:i<genKeys.length-1?"1px solid #0c0c0c":"none"}}>
                      <div style={{width:5,height:5,borderRadius:"50%",background:tc(k),flexShrink:0}}/>
                      <code style={{flex:1,fontSize:10,color:tc(k),fontFamily:"'JetBrains Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k}</code>
                      <button onClick={()=>copyKey(k,i)} style={{background:kc[i]?"rgba(34,197,94,.1)":"#141414",border:`1px solid ${kc[i]?"rgba(34,197,94,.3)":"#1a1a1a"}`,borderRadius:5,padding:"3px 7px",color:kc[i]?"#22c55e":"#444",fontSize:10,cursor:"pointer",flexShrink:0,transition:"all .15s"}}>
                        {kc[i]?"✓":"Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {!isOwner&&<p style={{fontSize:12,color:"#2a2a2a",lineHeight:1.65}}>To unlock Zaith or Zeno, go to <strong style={{color:"#555"}}>Agents</strong> and redeem a key.</p>}
      </div>
    </div>
  );
}

/* ================================================================
   SEARCH PANEL
================================================================ */
function SearchPanel({projects,onOpen}){
  const[q,setQ]=useState("");
  const results=!q.trim()?[]:projects.filter(p=>
    p.name.toLowerCase().includes(q.toLowerCase())||
    (p.messages||[]).some(m=>m.content?.toLowerCase().includes(q.toLowerCase()))||
    (p.scripts||[]).some(s=>s.name.toLowerCase().includes(q.toLowerCase()))
  );
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"14px 10px"}}>
      <div style={{fontSize:10,color:"#333",fontWeight:600,marginBottom:9,textTransform:"uppercase",letterSpacing:.5}}>Search</div>
      <input className="inp" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects, scripts, messages…" autoFocus/>
      <div style={{flex:1,overflowY:"auto",marginTop:10}}>
        {q&&results.length===0&&<p style={{fontSize:12,color:"#222",padding:"10px 4px"}}>No results</p>}
        {results.map(p=>(
          <div key={p.id} onClick={()=>onOpen(p.id)}
            style={{padding:"9px 8px",borderRadius:8,background:"#0d0d0d",border:"1px solid #141414",marginBottom:6,cursor:"pointer",transition:"border-color .12s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#1e1e1e"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#141414"}>
            <div style={{fontSize:12,color:"#666",fontWeight:500,marginBottom:2}}>{p.name}</div>
            <div style={{fontSize:11,color:"#2a2a2a"}}>{(p.messages||[]).length} messages · {(p.scripts||[]).length} scripts</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   SIDEBAR
================================================================ */
function Sidebar({user,projects,activeId,setActiveId,onNewChat,onScriptOpen,onSettings,tab,setTab,modelId}){
  const proj=projects.find(p=>p.id===activeId);
  const m=MODELS[modelId];
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"10px 8px"}}>
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"4px 4px 14px"}}>
        <LogoDVX size={28}/>
        <span style={{fontSize:15,fontWeight:700,color:"#ccc",letterSpacing:.5}}>Devix</span>
      </div>
      {[
        {id:"chat",  icon:<Icon d="M12 5v14M5 12l7-7 7 7" size={14} color="currentColor"/>, label:"New task"},
        {id:"agents",icon:<AtomIcon size={14} color="currentColor"/>, label:"Agents"},
        {id:"search",icon:<Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" size={14} color="currentColor"/>, label:"Search"},
        {id:"uigen", icon:<Icon d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" size={14} color="currentColor"/>, label:"UI Generator"},
      ].map(nav=>(
        <div key={nav.id} className={`navr${tab===nav.id?" act":""}`} onClick={()=>setTab(nav.id)} style={{marginBottom:1,gap:7}}>
          {nav.icon} {nav.label}
        </div>
      ))}
      <div style={{height:8}}/>
      {tab==="chat"&&(
        <>
          <div style={{fontSize:9,color:"#1e1e1e",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,marginBottom:6,paddingLeft:4}}>Projects</div>
          <div style={{flex:1,overflowY:"auto"}}>
            {projects.length===0
              ?<p style={{fontSize:11,color:"#1a1a1a",padding:"4px",fontStyle:"italic"}}>No projects yet</p>
              :projects.slice().reverse().map(p=>(
                  <div key={p.id} className={`trow${p.id===activeId?" sel":""}`} style={{paddingLeft:4,gap:5,marginBottom:1}} onClick={()=>setActiveId(p.id)}>
                    <SvcIcon svcId="workspace" size={11} color={p.id===activeId?"#555":"#2a2a2a"}/>
                    <span style={{fontSize:11,color:p.id===activeId?"#666":"#2a2a2a",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                  </div>
                ))
            }
          </div>
          {proj&&(
            <div style={{borderTop:"1px solid #0d0d0d",paddingTop:8,marginTop:8,flex:2,overflowY:"auto",minHeight:0}}>
              <ProjectTree project={proj} onScriptOpen={onScriptOpen}/>
            </div>
          )}
        </>
      )}
      {tab!=="chat"&&<div style={{flex:1}}/>}
      <div style={{borderTop:"1px solid #0d0d0d",paddingTop:8,marginTop:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",background:"#090909",border:"1px solid #111",borderRadius:8,marginBottom:5}}>
          <ModelIcon modelId={modelId} size={14}/>
          <span style={{fontSize:11,color:m?.color,fontWeight:600,flex:1}}>{m?.name}</span>
        </div>
        <button className="navr" onClick={onSettings} style={{width:"100%",justifyContent:"flex-start",padding:"5px 8px",gap:7}}>
          <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" size={13} color="currentColor"/>
          <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{user?.username}</span>
        </button>
      </div>
    </div>
  );
}

/* ================================================================
   ROOT
================================================================ */
export default function DevixApp(){
  const[page,       setPage]       =useState("loading");
  const[isSignup,   setIsSignup]   =useState(false);
  const[form,       setForm]       =useState({username:"",password:""});
  const[loginErr,   setLoginErr]   =useState("");
  const[user,       setUser]       =useState(null);
  const[modelId,    setModelId]    =useState("zenith");
  const[projects,   setProjects]   =useState([]);
  const[activeId,   setActiveId]   =useState(null);
  const[input,      setInput]      =useState("");
  const[isLoading,  setIsLoading]  =useState(false);
  const[files,      setFiles]      =useState([]);
  const[showSett,   setShowSett]   =useState(false);
  const[openScript, setOpenScript] =useState(null);
  const[copied,     setCopied]     =useState({});
  const[toast,      setToast]      =useState(null);
  const[tab,        setTab]        =useState("chat");

  const endRef  =useRef(null);
  const textRef =useRef(null);
  const fileRef =useRef(null);
  const abortRef=useRef(null);

  const isOwner=user?.username?.toLowerCase()===OWNER_KEY.toLowerCase();
  const m=MODELS[modelId]||MODELS.zenith;
  const proj=projects.find(p=>p.id===activeId);
  const msgs=proj?.messages||[];

  /* Init */
  useEffect(()=>{
    const s=LS.g("dvx_session");
    if(s?.username){
      let u={...s};
      if(u.username?.toLowerCase()===OWNER_KEY.toLowerCase()) u.plan="owner";
      setUser(u);setProjects(LS.g(`dvx_proj_${u.username}`,[]) );setModelId(u.lastModel||"zenith");setPage("chat");
    }else setPage("login");
  },[]);

  /* Google OAuth */
  useEffect(()=>{
    if(page!=="login"||!GOOGLE_CLIENT_ID) return;
    const t=setInterval(()=>{
      if(window.google?.accounts?.id){
        clearInterval(t);
        window.google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:handleGoogleCredential});
        window.google.accounts.id.renderButton(document.getElementById("google-btn"),{theme:"filled_black",size:"large",width:270});
      }
    },200);
    return()=>clearInterval(t);
  },[page]);

  const handleGoogleCredential=resp=>{
    const p=parseJwt(resp.credential);
    if(!p.sub) return;
    const uname=p.name||p.email?.split("@")[0]||"User";
    const users=LS.g("dvx_users",{});const key=`google_${p.sub}`;
    if(!users[key]) users[key]={username:uname,password:p.sub,plan:"zenith",googleId:p.sub};
    LS.s("dvx_users",users);
    const plan=users[key].username?.toLowerCase()===OWNER_KEY.toLowerCase()?"owner":users[key].plan||"zenith";
    const u={username:users[key].username,plan,googleId:p.sub};
    setUser(u);LS.s("dvx_session",u);setProjects(LS.g(`dvx_proj_${users[key].username}`,[]) );setPage("chat");showToast(`Welcome, ${u.username}!`);
  };

  useEffect(()=>{if(proj) endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs,isLoading]);
  useEffect(()=>{if(user) LS.s(`dvx_proj_${user.username}`,projects);},[projects,user]);

  const showToast=useCallback((msg,dur=3000)=>{setToast(msg);setTimeout(()=>setToast(null),dur);},[]);

  /* Auth */
  const doAuth=()=>{
    const uname=form.username.trim();const pass=form.password;
    if(!uname||!pass){setLoginErr("Fill in all fields");return;}
    const users=LS.g("dvx_users",{});const key=uname.toLowerCase();
    if(isSignup){
      if(users[key]){setLoginErr("Username taken");return;}
      users[key]={username:uname,password:pass,plan:"zenith"};LS.s("dvx_users",users);
      const plan=uname.toLowerCase()===OWNER_KEY.toLowerCase()?"owner":"zenith";
      const u={username:uname,plan};setUser(u);LS.s("dvx_session",u);setProjects([]);setPage("chat");showToast(`Welcome, ${uname}!`);
    }else{
      const rec=users[key];
      if(!rec){setLoginErr("Account not found");return;}
      if(rec.password!==pass){setLoginErr("Wrong password");return;}
      const plan=rec.username.toLowerCase()===OWNER_KEY.toLowerCase()?"owner":rec.plan||"zenith";
      const u={username:rec.username,plan};setUser(u);LS.s("dvx_session",u);setProjects(LS.g(`dvx_proj_${rec.username}`,[]) );setPage("chat");showToast(`Welcome back, ${rec.username}!`);
    }
  };

  const doLogout=()=>{LS.d("dvx_session");setUser(null);setPage("login");setForm({username:"",password:""});setProjects([]);setActiveId(null);setShowSett(false);};
  const updateUserPlan=plan=>{
    const upd={...user,plan};setUser(upd);LS.s("dvx_session",upd);
    const users=LS.g("dvx_users",{});const k=user.username.toLowerCase();
    if(users[k]){users[k].plan=plan;LS.s("dvx_users",users);}
  };

  /* Projects */
  const newProject=()=>{const id=Date.now();setProjects(p=>[...p,{id,name:"New Chat",messages:[],scripts:[]}]);setActiveId(id);setTab("chat");};
  const patchProject=useCallback((id,fn)=>setProjects(prev=>prev.map(p=>p.id===id?fn(p):p)),[]);

  /* Send */
  const doSend=async()=>{
    if((!input.trim()&&!files.length)||isLoading) return;
    let curId=activeId;
    if(!curId){const id=Date.now();setProjects(p=>[...p,{id,name:input.trim().slice(0,40),messages:[],scripts:[]}]);setActiveId(id);curId=id;}

    const uMsg={id:Date.now(),role:"user",content:input,files:[...files],ts:nowTS()};
    const prev=projects.find(p=>p.id===curId)?.messages||[];
    const next=[...prev,uMsg];
    const userHint=input;

    if(prev.length===0&&input.trim()) patchProject(curId,p=>({...p,name:input.trim().slice(0,42)+(input.length>42?"…":""),messages:next}));
    else patchProject(curId,p=>({...p,messages:next}));

    setInput("");setFiles([]);setIsLoading(true);
    if(textRef.current) textRef.current.style.height="auto";

    const apiMsgs=next.map(msg=>({role:msg.role,content:msg.content+(msg.files?.length?"\n\n[Files]\n"+msg.files.map(f=>`--- ${f.name} ---\n${f.content||"[binary]"}`).join("\n\n"):"")}));
    const aiId=Date.now()+1;
    patchProject(curId,p=>({...p,messages:[...next,{id:aiId,role:"assistant",content:"",ts:nowTS(),streaming:true}]}));

    const abort=new AbortController();abortRef.current=abort;
    try{
      let source="puter";
      let full="";
      try{
        if(window.puter?.ai?.chat){
          full=await callAI(modelId,apiMsgs,null,partial=>{
            patchProject(curId,p=>({...p,messages:p.messages.map(msg=>msg.id===aiId?{...msg,content:partial,streaming:true,source:"puter"}:msg)}));
          });
        }else throw new Error("Puter unavailable");
      }catch{
        source="groq";
        full=await callGroqFallback(modelId,apiMsgs);
        patchProject(curId,p=>({...p,messages:p.messages.map(msg=>msg.id===aiId?{...msg,content:full,streaming:true,source:"groq"}:msg)}));
      }
      const newScripts=extractScripts(full,userHint);
      patchProject(curId,p=>({
        ...p,
        messages:p.messages.map(msg=>msg.id===aiId?{...msg,content:full,streaming:false,source}:msg),
        scripts:[...(p.scripts||[]),...newScripts],
      }));
    }catch(err){
      patchProject(curId,p=>({...p,messages:p.messages.map(msg=>msg.id===aiId?{...msg,content:`⚠️ ${err.message}`,streaming:false}:msg)}));
    }
    setIsLoading(false);abortRef.current=null;
  };

  const attachFiles=async fl=>{
    const arr=[];for(const f of Array.from(fl)){try{arr.push({name:f.name,content:await f.text()});}catch{arr.push({name:f.name,content:"[binary]"});}}
    setFiles(p=>[...p,...arr]);showToast(`${arr.length} file${arr.length>1?"s":""} attached`);
  };
  const onCopy=(code,key)=>{navigator.clipboard?.writeText(code);setCopied(p=>({...p,[key]:true}));setTimeout(()=>setCopied(p=>({...p,[key]:false})),2000);showToast("Copied!");};
  const onScriptUpdate=updated=>{if(!activeId) return;patchProject(activeId,p=>({...p,scripts:p.scripts.map(s=>s.id===updated.id?updated:s)}));};

  /* Loading */
  if(page==="loading") return(
    <><style>{CSS}</style>
    <div style={{height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"#070707"}}>
      <div style={{animation:"pulse 1.4s ease infinite"}}><LogoDVX size={52}/></div>
    </div></>
  );

  /* Login */
  if(page==="login") return(
    <><style>{CSS}</style>
    <div style={{minHeight:"100dvh",background:"#070707",display:"flex",alignItems:"center",justifyContent:"center",padding:20,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(#0d0d0d 1px,transparent 1px),linear-gradient(90deg,#0d0d0d 1px,transparent 1px)",backgroundSize:"52px 52px",opacity:.5,pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:500,height:260,background:"radial-gradient(ellipse,rgba(168,85,247,.05),transparent 70%)",pointerEvents:"none"}}/>
      <div style={{zIndex:1,width:"100%",maxWidth:840,display:"flex",gap:24,flexWrap:"wrap",justifyContent:"center",alignItems:"flex-start",paddingTop:16}}>
        <div className="up" style={{flex:"0 0 300px",maxWidth:320}}>
          <div style={{marginBottom:22,textAlign:"center"}}>
            <div style={{display:"flex",justifyContent:"center",marginBottom:10}}><LogoDVX size={52}/></div>
            <span style={{fontSize:26,fontWeight:800,color:"#ddd",letterSpacing:.5}}>Devix</span>
            <p style={{color:"#222",fontSize:13,lineHeight:1.7,marginTop:4}}>The AI built for Roblox Studio.</p>
          </div>
          <div style={{background:"#0d0d0d",border:"1px solid #161616",borderRadius:14,padding:20}}>
            <div style={{display:"flex",background:"#080808",borderRadius:9,padding:3,marginBottom:15}}>
              {["Sign In","Sign Up"].map((lb,i)=>(
                <button key={lb} onClick={()=>{setIsSignup(i===1);setLoginErr("");}}
                  style={{flex:1,padding:"7px 0",borderRadius:7,border:"none",background:isSignup===(i===1)?"#a855f7":"transparent",color:isSignup===(i===1)?"#fff":"#333",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .18s"}}>
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
                  className="inp"/>
              ))}
              {loginErr&&<p style={{color:"#ef4444",fontSize:12,textAlign:"center"}}>{loginErr}</p>}
              <button onClick={doAuth} className="btn-pri" style={{padding:"11px",fontSize:14,width:"100%"}}>{isSignup?"Create Account →":"Sign In →"}</button>
              {GOOGLE_CLIENT_ID&&(
                <>
                  <div style={{display:"flex",alignItems:"center",gap:8,margin:"2px 0"}}>
                    <div style={{flex:1,height:1,background:"#141414"}}/>
                    <span style={{fontSize:11,color:"#222"}}>or</span>
                    <div style={{flex:1,height:1,background:"#141414"}}/>
                  </div>
                  <div id="google-btn" style={{display:"flex",justifyContent:"center"}}/>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,flex:"1 1 200px",maxWidth:370}}>
          {Object.values(MODELS).map((ml,i)=>(
            <div key={ml.id} className="up" style={{background:"#0d0d0d",border:"1px solid #141414",borderRadius:11,padding:"12px 14px",display:"flex",gap:11,alignItems:"flex-start",animationDelay:`${i*.08}s`}}>
              <div style={{width:34,height:34,borderRadius:10,background:ml.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <ModelIcon modelId={ml.id} size={22}/>
              </div>
              <div>
                <div style={{color:"#ccc",fontWeight:600,fontSize:13,marginBottom:2}}>{ml.name} <span style={{fontSize:10,color:ml.free?"#22c55e":ml.color,fontWeight:700}}>{ml.free?"Free":"Key"}</span></div>
                <div style={{color:"#222",fontSize:12,lineHeight:1.55}}>{ml.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div></>
  );

  /* Main */
  return(
    <><style>{CSS}</style>
    {toast&&(
      <div className="up" style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#0f0f0f",border:"1px solid #1a1a1a",borderRadius:9,padding:"9px 16px",fontSize:13,color:"#aaa",zIndex:999,boxShadow:"0 8px 28px rgba(0,0,0,.6)",whiteSpace:"nowrap"}}>
        {toast}
      </div>
    )}
    {showSett&&<SettingsPanel user={user} onClose={()=>setShowSett(false)} onLogout={doLogout} showToast={showToast} updateUserPlan={updateUserPlan} isOwner={isOwner}/>}
    {openScript&&<ScriptViewerModal script={openScript} onClose={()=>setOpenScript(null)} onUpdate={onScriptUpdate} modelId={modelId} showToast={showToast}/>}

    <div style={{height:"100dvh",display:"flex",background:"#070707",overflow:"hidden"}}>
      <aside style={{width:220,background:"#0a0a0a",borderRight:"1px solid #0e0e0e",display:"flex",flexDirection:"column",flexShrink:0}}>
        <Sidebar user={user} projects={projects} activeId={activeId}
          setActiveId={id=>{setActiveId(id);setTab("chat");}}
          onNewChat={newProject} onScriptOpen={setOpenScript}
          onSettings={()=>setShowSett(true)}
          tab={tab} setTab={setTab} modelId={modelId}/>
      </aside>

      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        <header style={{height:44,padding:"0 14px",borderBottom:"1px solid #0c0c0c",display:"flex",alignItems:"center",gap:8,flexShrink:0,background:"#0a0a0a"}}>
          <span style={{fontSize:13,color:"#242424",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {tab==="uigen"?"UI Generator":tab==="agents"?"Agents":tab==="search"?"Search":proj?.name||"Select a project"}
          </span>
          <button onClick={()=>setShowSett(true)} style={{color:"#242424",padding:"4px 7px",border:"1px solid #111",borderRadius:7,background:"none",cursor:"pointer"}}>
            <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" size={15} color="currentColor"/>
          </button>
        </header>

        {tab==="agents"&&<div style={{flex:1,overflow:"hidden"}}><AgentsPanel user={user} modelId={modelId} onSelectModel={id=>{setModelId(id);const u={...user,lastModel:id};setUser(u);LS.s("dvx_session",u);setTab("chat");}} onUnlock={updateUserPlan} showToast={showToast}/></div>}
        {tab==="search"&&<div style={{flex:1,overflow:"hidden"}}><SearchPanel projects={projects} onOpen={id=>{setActiveId(id);setTab("chat");}}/></div>}
        {tab==="uigen"&&<div style={{flex:1,overflow:"hidden"}}><UIGenerator modelId={modelId} showToast={showToast}/></div>}

        {tab==="chat"&&(
          <>
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
              {!proj||msgs.length===0?(
                <div className="fade" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:20}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{display:"flex",justifyContent:"center",marginBottom:14}}><ModelIcon modelId={modelId} size={48}/></div>
                    <h1 style={{fontSize:26,fontWeight:300,color:"#2e2e2e",letterSpacing:-1}}>What can I help you build?</h1>
                    <p style={{color:"#1e1e1e",fontSize:12,marginTop:6}}>Using <span style={{color:m.color,fontWeight:600}}>{m.name}</span> · Claude Sonnet 4.5</p>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",maxWidth:560}}>
                    {[{l:"Combat system"},{l:"DataStore"},{l:"Terrain gen"},{l:"Inventory UI"},{l:"Admin system"},{l:"AI NPC"},{l:"Leaderboard"},{l:"Shop system"}].map(q=>(
                      <button key={q.l} onClick={()=>{if(!proj)newProject();setInput(`Build a complete ${q.l.toLowerCase()} for Roblox Studio`);textRef.current?.focus();}}
                        style={{display:"flex",alignItems:"center",gap:6,padding:"8px 13px",border:"1px solid #111",borderRadius:9,background:"#0c0c0c",color:"#2e2e2e",fontSize:12,cursor:"pointer",transition:"all .12s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#181818";e.currentTarget.style.color="#555";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor="#111";e.currentTarget.style.color="#2e2e2e";}}>
                        {q.l}
                      </button>
                    ))}
                  </div>
                </div>
              ):(
                <div style={{maxWidth:720,width:"100%",margin:"0 auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:8}}>
                  {msgs.map(msg=>(
                    <ChatMsg key={msg.id} msg={msg} modelId={modelId} onCopy={onCopy} copied={copied}/>
                  ))}
                  {isLoading&&msgs[msgs.length-1]?.role!=="assistant"&&(
                    <div className="up" style={{display:"flex",alignItems:"center",gap:7}}>
                      <ModelIcon modelId={modelId} size={14}/>
                      <span className="d1" style={{width:4,height:4,borderRadius:"50%",background:m.color,display:"inline-block"}}/>
                      <span className="d2" style={{width:4,height:4,borderRadius:"50%",background:m.color,display:"inline-block"}}/>
                      <span className="d3" style={{width:4,height:4,borderRadius:"50%",background:m.color,display:"inline-block"}}/>
                      <span style={{color:"#1e1e1e",fontSize:12}}>Thinking…</span>
                    </div>
                  )}
                  <div ref={endRef}/>
                </div>
              )}
            </div>
            <div style={{borderTop:"1px solid #0c0c0c",padding:"9px 14px 11px",background:"#0a0a0a",flexShrink:0}}>
              {files.length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:7}}>
                  {files.map((f,i)=>(
                    <span key={i} style={{background:`${m.color}10`,border:`1px solid ${m.color}1e`,borderRadius:5,padding:"2px 7px",fontSize:11,color:m.color,display:"flex",alignItems:"center",gap:4}}>
                      <SvcIcon svcId="script" size={10} color={m.color}/> {f.name}
                      <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{color:"#333",fontSize:9,background:"none",border:"none",cursor:"pointer"}}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="ibox" style={{display:"flex",alignItems:"flex-end",gap:7,background:"#0c0c0c",padding:"8px 10px"}}>
                <input ref={fileRef} type="file" accept=".lua,.luau,.rbxl,.rbxlx,.txt,.json,.md" multiple style={{display:"none"}} onChange={e=>attachFiles(e.target.files)}/>
                <button onClick={()=>fileRef.current?.click()} style={{color:"#222",fontSize:20,padding:"1px 4px",lineHeight:1,flexShrink:0,marginBottom:1}}>+</button>
                <textarea ref={textRef} value={input}
                  onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,180)+"px";}}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}}}
                  placeholder="Assign a task or ask anything…" rows={1}
                  style={{flex:1,background:"none",border:"none",color:"#ccc",fontSize:14,resize:"none",lineHeight:1.65,maxHeight:180,overflow:"auto",padding:"1px 0"}}/>
                <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:3}}>
                    <ModelIcon modelId={modelId} size={13}/>
                    <span style={{fontSize:10,color:m.color,fontWeight:600}}>{m.name}</span>
                  </div>
                  <button onClick={doSend} disabled={isLoading||(!input.trim()&&!files.length)}
                    style={{background:(isLoading||(!input.trim()&&!files.length))?"#141414":"#a855f7",border:"none",borderRadius:8,width:29,height:29,display:"flex",alignItems:"center",justifyContent:"center",color:(isLoading||(!input.trim()&&!files.length))?"#252525":"#fff",fontSize:14,cursor:isLoading||(!input.trim()&&!files.length)?"default":"pointer",transition:"background .15s",flexShrink:0}}>
                    {isLoading?<span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:11}}>⟳</span>:<Icon d="M12 19V5M5 12l7-7 7 7" size={14} color="currentColor"/>}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
