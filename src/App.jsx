import { useState, useRef, useEffect, useCallback } from "react";

const API_URL   = "/api/chat";
const OWNER_KEY = "ZenoZiathSully";
const K_SECRET  = "dvx_k_2024_x9z";

/* ── KEY SYSTEM ── */
function genKey(type, idx) {
  const str = `${type}:${idx}:${K_SECRET}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  const hash = (h >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return `${type.toUpperCase()}-${idx.toString(16).toUpperCase().padStart(3,"0")}-${hash}`;
}
function validateKey(raw) {
  const key = raw.trim().toUpperCase();
  const parts = key.split("-");
  if (parts.length !== 3) return null;
  const [type, idxHex] = parts;
  if (type !== "ZAITH" && type !== "ZENO") return null;
  const idx = parseInt(idxHex, 16);
  if (isNaN(idx) || idx > 0xFFF) return null;
  if (key !== genKey(type, idx)) return null;
  return type.toLowerCase();
}

/* ── MODELS ── */
const MODELS = {
  zenith: { id:"zenith", name:"Zenith", sub:"Standard · Free", desc:"Fast, accurate Luau scripts and Roblox help for everyone.", color:"#6366f1", bg:"rgba(99,102,241,.09)", icon:"⚡", free:true,  mode:"quick" },
  zaith:  { id:"zaith",  name:"Zaith",  sub:"Advanced · Key",  desc:"Deeper architecture, better code quality. Requires a key.", color:"#a855f7", bg:"rgba(168,85,247,.09)", icon:"🔷", free:false, mode:"quick" },
  zeno:   { id:"zeno",   name:"Zeno",   sub:"Maximum · Key",   desc:"All models in parallel, synthesized into one best answer.", color:"#e03a3e", bg:"rgba(224,58,62,.09)",  icon:"🌟", free:false, mode:"deep"  },
};

/* ── STUDIO SERVICES TREE ── */
const SERVICES = [
  { id:"workspace",   name:"Workspace",             icon:"🌍",   color:"#22c55e", isScriptTarget:false },
  { id:"players",     name:"Players",               icon:"👥",   color:"#3b82f6" },
  { id:"lighting",    name:"Lighting",              icon:"💡",   color:"#eab308" },
  { id:"material",    name:"MaterialService",       icon:"🎨",   color:"#ec4899" },
  { id:"repfirst",    name:"ReplicatedFirst",       icon:"🗑️☁️", color:"#64748b" },
  { id:"replicated",  name:"ReplicatedStorage",     icon:"🗑️",   color:"#64748b" },
  { id:"runservice",  name:"RunService",            icon:"⚙️",   color:"#6b7280" },
  { id:"sss",         name:"ServerScriptService",   icon:"☁️",   color:"#3b82f6", isScriptTarget:true },
  { id:"serverstorage",name:"ServerStorage",        icon:"☁️📱", color:"#8b5cf6" },
  { id:"startergui",  name:"StarterGui",            icon:"🖥️",   color:"#f59e0b" },
  { id:"starterpack", name:"StarterPack",           icon:"🎒",   color:"#10b981" },
  { id:"starterplayer",name:"StarterPlayer",        icon:"👤",   color:"#6366f1", children:[
    { id:"charscripts",   name:"StarterCharacterScripts", icon:"📝", color:"#6366f1" },
    { id:"playerscripts", name:"StarterPlayerScripts",    icon:"📝", color:"#6366f1" },
  ]},
  { id:"teams",       name:"Teams",                 icon:"🏳️",   color:"#ef4444" },
  { id:"soundservice",name:"SoundService",          icon:"🔊",   color:"#8b5cf6" },
  { id:"chat",        name:"Chat",                  icon:"💬",   color:"#22c55e" },
  { id:"locale",      name:"LocalizationService",   icon:"🌐",   color:"#3b82f6" },
  { id:"testservice", name:"TestService",           icon:"✅",   color:"#22c55e" },
];

/* ── STORAGE ── */
const LS = {
  g:(k,d=null)=>{ try{return JSON.parse(localStorage.getItem(k)??"null")??d;}catch{return d;} },
  s:(k,v)=>{ try{localStorage.setItem(k,JSON.stringify(v));}catch{} },
  d:(k)=>{ try{localStorage.removeItem(k);}catch{} },
};

/* ── SCRIPT NAMING ── */
function extractScriptName(code, hint="") {
  const nm = code.match(/--\s*@name\s+(.+)/i);
  if (nm) return nm[1].trim().replace(/\s+/g,"");
  const mod = code.match(/local\s+(\w{3,})\s*=\s*\{\}/);
  if (mod) return mod[1];
  const fn = code.match(/function\s+([A-Z]\w+)/);
  if (fn) return fn[1];
  const words = hint.split(/\s+/).filter(w=>w.length>3).slice(0,3);
  if (words.length) return words.map(w=>w[0].toUpperCase()+w.slice(1)).join("")+"Script";
  return "DevixScript";
}

/* ── API ── */
async function callAPI(mode, messages, sysOverride) {
  const sys = sysOverride || (mode==="deep"
    ? `You are Devix — expert Roblox Studio AI. NOT Claude.\nCODE: Luau, task.wait(), task.spawn(), complete scripts in \`\`\`lua blocks. Start every script with -- @name ScriptName. Full code, no placeholders.\nFORMAT: **bold**, ## headers, - lists.\nRULES: No exploits.`
    : `You are Devix — expert Roblox Studio AI. NOT Claude.\nCODE: Luau, task.wait(), task.spawn(), complete scripts in \`\`\`lua blocks. Start every script with -- @name ScriptName. Full code.\nFORMAT: **bold**, ## headers, - lists.\nRULES: No exploits.`);
  const r = await fetch(API_URL, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ mode, system:sys, messages }),
  });
  if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e?.error||`HTTP ${r.status}`); }
  return (await r.json()).text||"";
}

/* ── STREAMING ── */
async function streamText(text, onUpdate, signal) {
  const toks = text.split(/(\s+)/); let out="";
  for (const t of toks) {
    if (signal?.aborted) break;
    out+=t; onUpdate(out);
    await new Promise(r=>setTimeout(r, 8+Math.random()*13));
  }
  onUpdate(text);
}

/* ── MARKDOWN ── */
function inl(text, ms, seed="") {
  const re=/(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`)/g;
  const out=[]; let last=0,m,n=0;
  while((m=re.exec(text))!==null) {
    if(m.index>last) out.push(text.slice(last,m.index));
    if(m[0].startsWith("**")) out.push(<strong key={seed+n++} style={{fontWeight:700}}>{m[2]}</strong>);
    else if(m[0].startsWith("*")) out.push(<em key={seed+n++}>{m[3]}</em>);
    else out.push(<code key={seed+n++} style={ms}>{m[4]}</code>);
    last=m.index+m[0].length;
  }
  if(last<text.length) out.push(text.slice(last));
  return out;
}
function MD({text,tc="#bbb",ms}) {
  if(!text) return null;
  const mss = ms||{background:"rgba(99,102,241,.15)",borderRadius:4,padding:"1px 6px",fontFamily:"'JetBrains Mono',monospace",fontSize:"0.87em"};
  const lines=text.split("\n"); const result=[]; let i=0;
  while(i<lines.length) {
    const ln=lines[i];
    if(/^#{1,3} /.test(ln)) {
      const lvl=ln.match(/^(#{1,3}) /)[1].length;
      result.push(<div key={i} style={{fontSize:[18,15,13][lvl-1],fontWeight:[800,700,600][lvl-1],color:tc,margin:"11px 0 5px"}}>{inl(ln.slice(lvl+1),mss,`h${i}`)}</div>);
    } else if(/^[-•*] /.test(ln)) {
      const items=[];
      while(i<lines.length&&/^[-•*] /.test(lines[i])) {items.push(<li key={i} style={{marginBottom:3,lineHeight:1.7}}>{inl(lines[i].slice(2),mss,`li${i}`)}</li>);i++;}
      result.push(<ul key={`ul${i}`} style={{paddingLeft:18,margin:"5px 0",color:tc,fontSize:14}}>{items}</ul>); continue;
    } else if(/^\d+\. /.test(ln)) {
      const items=[];
      while(i<lines.length&&/^\d+\. /.test(lines[i])) {items.push(<li key={i} style={{marginBottom:3,lineHeight:1.7}}>{inl(lines[i].replace(/^\d+\. /,""),mss,`ol${i}`)}</li>);i++;}
      result.push(<ol key={`ol${i}`} style={{paddingLeft:18,margin:"5px 0",color:tc,fontSize:14}}>{items}</ol>); continue;
    } else if(/^-{3,}$/.test(ln.trim())) {
      result.push(<hr key={i} style={{border:"none",borderTop:"1px solid rgba(255,255,255,.06)",margin:"9px 0"}}/>);
    } else if(ln.trim()==="") {
      result.push(<div key={i} style={{height:4}}/>);
    } else {
      result.push(<p key={i} style={{margin:"2px 0",lineHeight:1.78,color:tc,fontSize:14,wordBreak:"break-word"}}>{inl(ln,mss,`p${i}`)}</p>);
    }
    i++;
  }
  return <>{result}</>;
}
function parseParts(content) {
  const parts=[]; const re=/```(\w*)\n?([\s\S]*?)```/g; let last=0,m;
  while((m=re.exec(content))!==null) {
    if(m.index>last) parts.push({type:"text",content:content.slice(last,m.index)});
    parts.push({type:"code",lang:m[1]||"lua",content:m[2].trim()});
    last=m.index+m[0].length;
  }
  if(last<content.length) parts.push({type:"text",content:content.slice(last)});
  return parts;
}
function extractScripts(content, hint="") {
  const scripts=[]; const re=/```(?:lua|luau)\n?([\s\S]*?)```/g; let m,i=0;
  while((m=re.exec(content))!==null) {
    const code=m[1].trim();
    scripts.push({id:Date.now()+i, name:extractScriptName(code, hint), content:code});
    i++;
  }
  return scripts;
}
const nowTS=()=>new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

/* ── CSS ── */
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;overflow:hidden}
body{font-family:'Inter',sans-serif;background:#080808;color:#e0e0e0;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#1e1e1e;border-radius:4px}
textarea,input,button,select{font-family:'Inter',sans-serif}
textarea:focus,input:focus{outline:none}button{cursor:pointer;border:none;background:none}
@keyframes fadeUp  {from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes fadeIn  {from{opacity:0}to{opacity:1}}
@keyframes scaleIn {from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
@keyframes blink   {0%,100%{opacity:1}50%{opacity:0}}
@keyframes bounce  {0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
@keyframes spin    {from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes pulse   {0%,100%{opacity:1}50%{opacity:.3}}
@keyframes gradSh  {0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes keyPop  {0%{opacity:0;transform:translateY(4px) scale(.95)}20%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-4px)}}
.up  {animation:fadeUp  .24s cubic-bezier(.22,1,.36,1) both}
.fade{animation:fadeIn  .18s ease both}
.scl {animation:scaleIn .22s cubic-bezier(.22,1,.36,1) both}
.navr{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;color:#333;font-size:13px;cursor:pointer;transition:all .12s;user-select:none}
.navr:hover{background:#111;color:#888}
.navr.act{background:#111;color:#ddd}
.trow{display:flex;align-items:center;gap:5px;border-radius:6px;cursor:pointer;transition:background .1s;user-select:none;padding:3px 5px}
.trow:hover{background:#111}
.trow.sel{background:#141414}
.ibox{border:1px solid #1c1c1c;border-radius:12px;transition:border-color .18s,box-shadow .18s}
.ibox:focus-within{border-color:#6366f1 !important;box-shadow:0 0 0 3px rgba(99,102,241,.1) !important}
.cursor::after{content:"▋";color:#6366f1;animation:blink .6s step-end infinite;margin-left:1px}
.cpb{opacity:0;transition:opacity .12s}
.cw:hover .cpb{opacity:1}
.d1{animation:bounce 1.4s ease 0s infinite}
.d2{animation:bounce 1.4s ease .15s infinite}
.d3{animation:bounce 1.4s ease .30s infinite}
.inp{background:#0d0d0d;border:1px solid #1c1c1c;border-radius:8px;padding:9px 11px;color:#ccc;font-size:13px;width:100%;transition:border-color .15s}
.inp:focus{border-color:#6366f1 !important;outline:none}
.btn-pri{background:#6366f1;border:none;border-radius:9px;color:#fff;font-weight:700;cursor:pointer;transition:filter .12s,transform .12s}
.btn-pri:hover{filter:brightness(1.12);transform:translateY(-1px)}
.btn-sec{background:#141414;border:1px solid #1e1e1e;border-radius:9px;color:#666;font-weight:600;cursor:pointer;transition:filter .12s}
.btn-sec:hover{filter:brightness(1.2)}
.mcard{border:1px solid #181818;border-radius:14px;padding:22px;background:#0c0c0c;transition:border-color .2s,transform .18s,background .18s;cursor:pointer}
.mcard:hover{border-color:#2a2a2a;transform:translateY(-2px);background:#0e0e0e}
.ui-el{position:absolute;cursor:move;user-select:none;transition:outline .1s}
.ui-el:hover{outline:1px solid rgba(99,102,241,.4)}
.ui-el.sel-el{outline:2px solid #6366f1 !important}
.resize-h{position:absolute;width:8px;height:8px;background:#6366f1;border-radius:2px;z-index:10}
.kpop{animation:keyPop 2.4s ease forwards;position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap;pointer-events:none}
`;

/* ================================================================
   CODE BLOCK
================================================================ */
function CodeBlock({lang,code,onCopy,copied}) {
  return (
    <div className="cw" style={{background:"#0a0a0a",borderRadius:9,border:"1px solid #181818",overflow:"hidden",margin:"7px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 12px",borderBottom:"1px solid #161616"}}>
        <span style={{fontSize:11,color:"#333",fontFamily:"'JetBrains Mono',monospace"}}>{lang||"lua"}</span>
        <button className="cpb" onClick={onCopy}
          style={{background:"rgba(99,102,241,.14)",border:"1px solid rgba(99,102,241,.22)",borderRadius:5,padding:"3px 9px",color:"#6366f1",fontSize:11,fontWeight:600,cursor:"pointer"}}>
          {copied?"✓ Copied":"Copy"}
        </button>
      </div>
      <pre style={{padding:"12px 14px",overflowX:"auto",fontSize:12.5,lineHeight:1.68,fontFamily:"'JetBrains Mono',monospace",color:"#b8b8b8",margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{code}</pre>
    </div>
  );
}

/* ================================================================
   CHAT MESSAGE
================================================================ */
function ChatMsg({msg,model,onCopy,copied}) {
  const isUser=msg.role==="user";
  const m=MODELS[model||"zenith"];
  const ac=m?.color||"#6366f1";
  const ms={background:`${ac}18`,borderRadius:4,padding:"1px 6px",fontFamily:"'JetBrains Mono',monospace",fontSize:"0.87em"};
  return (
    <div className="up" style={{display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start",padding:"2px 0"}}>
      {!isUser && (
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
          <div style={{width:17,height:17,borderRadius:5,background:ac,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#fff",flexShrink:0}}>D</div>
          <span style={{fontSize:11,color:"#333",fontWeight:500}}>Devix {m?.name} · {msg.ts}</span>
        </div>
      )}
      <div style={{maxWidth:"86%",background:isUser?"rgba(255,255,255,.025)":"#0d0d0d",border:`1px solid ${isUser?"#1a1a1a":"#161616"}`,borderRadius:isUser?"12px 12px 3px 12px":"3px 12px 12px 12px",padding:"10px 14px"}}>
        {isUser
          ? <p style={{color:"#c0c0c0",fontSize:14,lineHeight:1.72,whiteSpace:"pre-wrap"}}>{msg.content}</p>
          : <>
              {parseParts(msg.content).map((p,i)=>
                p.type==="code"
                  ? <CodeBlock key={i} lang={p.lang} code={p.content} onCopy={()=>onCopy(p.content,`${msg.id}-${i}`)} copied={copied[`${msg.id}-${i}`]}/>
                  : <MD key={i} text={p.content} ms={ms}/>
              )}
              {msg.streaming && <span className="cursor"/>}
            </>
        }
        {msg.files?.length>0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:7}}>
            {msg.files.map((f,fi)=>(
              <span key={fi} style={{background:`${ac}12`,border:`1px solid ${ac}22`,borderRadius:5,padding:"2px 7px",fontSize:11,color:ac}}>📄 {f.name}</span>
            ))}
          </div>
        )}
      </div>
      {isUser && <span style={{fontSize:10,color:"#222",marginTop:3}}>{msg.ts}</span>}
    </div>
  );
}

/* ================================================================
   SCRIPT VIEWER MODAL (with mini AI chat)
================================================================ */
function ScriptViewerModal({script,onClose,onUpdate,model,showToast}) {
  const [content, setContent] = useState(script.content);
  const [ask, setAsk]         = useState("");
  const [loading, setLoading] = useState(false);
  const m = MODELS[model||"zenith"];

  const askAI = async () => {
    if (!ask.trim()||loading) return;
    setLoading(true);
    const prompt = `Here is an existing Roblox Luau script named "${script.name}":\n\`\`\`lua\n${content}\n\`\`\`\n\nRequest: ${ask}\n\nReturn the complete updated script in a \`\`\`lua block.`;
    try {
      const result = await callAPI(m.mode, [{role:"user",content:prompt}]);
      const codeMatch = result.match(/```(?:lua|luau)\n?([\s\S]*?)```/);
      if (codeMatch) { setContent(codeMatch[1].trim()); onUpdate({...script,content:codeMatch[1].trim()}); showToast("Script updated!"); }
      else showToast("AI response received — no code block found");
    } catch(e) { showToast(`Error: ${e.message}`); }
    setAsk(""); setLoading(false);
  };

  return (
    <div className="fade" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="scl" style={{background:"#0e0e0e",border:"1px solid #1e1e1e",borderRadius:14,width:"100%",maxWidth:720,height:"82vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 16px",borderBottom:"1px solid #181818",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:10,height:10,borderRadius:3,background:"#eab308",flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:600,color:"#ccc"}}>{script.name}.lua</span>
          </div>
          <button onClick={onClose} style={{color:"#333",fontSize:15,padding:"2px 7px",background:"#161616",borderRadius:6,border:"1px solid #1e1e1e"}}>✕</button>
        </div>

        {/* Code area */}
        <textarea value={content} onChange={e=>setContent(e.target.value)}
          style={{flex:1,background:"#080808",border:"none",resize:"none",padding:"14px 16px",fontFamily:"'JetBrains Mono',monospace",fontSize:12.5,lineHeight:1.7,color:"#b8b8b8",minHeight:0}}/>

        {/* Mini AI chat */}
        <div style={{borderTop:"1px solid #181818",padding:"10px 14px",flexShrink:0}}>
          <div style={{fontSize:11,color:"#333",marginBottom:6,fontWeight:500}}>Ask AI to modify this script</div>
          <div style={{display:"flex",gap:7}}>
            <input className="inp" value={ask} onChange={e=>setAsk(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&askAI()}
              placeholder={`e.g. "Add a cooldown system" or "Fix the damage calculation"…`}
              style={{flex:1}}/>
            <button onClick={askAI} disabled={loading} className="btn-pri"
              style={{padding:"9px 16px",fontSize:13,flexShrink:0,opacity:loading?.6:1}}>
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
function ProjectTree({project, onScriptOpen, onScriptUpdate, ac}) {
  const [expSvc, setExpSvc]   = useState({sss:true});
  const [expRoot, setExpRoot]  = useState(true);

  const toggleSvc = k => setExpSvc(p=>({...p,[k]:!p[k]}));

  return (
    <div style={{display:"flex",flexDirection:"column",gap:1}}>
      {/* Project root */}
      <div className="trow sel" style={{gap:6}} onClick={()=>setExpRoot(p=>!p)}>
        <span style={{color:"#333",fontSize:9}}>{expRoot?"▼":"▶"}</span>
        <span style={{fontSize:13}}>📁</span>
        <span style={{fontSize:12,color:"#888",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project.name}</span>
      </div>

      {expRoot && (
        <div style={{paddingLeft:10}}>
          {SERVICES.map(svc=>(
            <div key={svc.id} style={{marginBottom:1}}>
              <div className="trow" onClick={()=>toggleSvc(svc.id)} style={{paddingLeft:2}}>
                <span style={{color:"#2a2a2a",fontSize:9}}>{expSvc[svc.id]?"▼":"▶"}</span>
                <span style={{fontSize:12}}>{svc.icon}</span>
                <span style={{fontSize:11.5,color:expSvc[svc.id]?"#666":"#444"}}>{svc.name}</span>
              </div>

              {expSvc[svc.id] && (
                <div style={{paddingLeft:14}}>
                  {/* Scripts under ServerScriptService */}
                  {svc.isScriptTarget && (project.scripts||[]).map(s=>(
                    <div key={s.id} className="trow" onDoubleClick={()=>onScriptOpen(s)}
                      style={{paddingLeft:2,gap:5}}>
                      <div style={{width:9,height:9,borderRadius:2,background:"#eab308",flexShrink:0}}/>
                      <span style={{fontSize:11,color:"#555",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                    </div>
                  ))}
                  {svc.isScriptTarget && (project.scripts||[]).length===0 && (
                    <span style={{fontSize:10,color:"#222",fontStyle:"italic",paddingLeft:2}}>no scripts</span>
                  )}
                  {/* Sub-children (StarterPlayer) */}
                  {svc.children?.map(ch=>(
                    <div key={ch.id} className="trow" style={{paddingLeft:2}}>
                      <span style={{fontSize:11}}>{ch.icon}</span>
                      <span style={{fontSize:11,color:"#444"}}>{ch.name}</span>
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
   UI GENERATOR
================================================================ */
const UI_PRESETS = [
  {type:"Frame",       icon:"▭", label:"Frame",       defaults:{w:200,h:150,bg:"#1a1a2e",corner:8,  text:""}},
  {type:"TextButton",  icon:"⊡", label:"Button",      defaults:{w:140,h:44, bg:"#6366f1",corner:10, text:"Click Me",textColor:"#fff"}},
  {type:"TextLabel",   icon:"T", label:"Label",       defaults:{w:160,h:36, bg:"transparent",corner:0, text:"Hello World",textColor:"#eee"}},
  {type:"TextBox",     icon:"▱", label:"TextBox",     defaults:{w:180,h:40, bg:"#111",corner:8,  text:"Enter text…",textColor:"#888"}},
  {type:"ImageLabel",  icon:"🖼", label:"Image",       defaults:{w:80, h:80, bg:"#1a1a1a",corner:8,  text:"",image:null}},
  {type:"ScrollFrame", icon:"↕", label:"ScrollFrame", defaults:{w:200,h:200,bg:"#111",corner:8,  text:""}},
];

function UIGenerator({model,showToast}) {
  const [elements, setElements]   = useState([]);
  const [selected, setSelected]   = useState(null);
  const [aiDesc,   setAiDesc]     = useState("");
  const [aiResult, setAiResult]   = useState("");
  const [aiLoading,setAiLoading]  = useState(false);
  const [copied,   setCopied]     = useState({});
  const canvasRef   = useRef(null);
  const dragRef     = useRef(null);
  const resizeRef   = useRef(null);
  const imgRef      = useRef(null);
  const m = MODELS[model||"zenith"];

  const addElement = (preset) => {
    const canvas = canvasRef.current?.getBoundingClientRect();
    const cw = canvasRef.current?.clientWidth || 390;
    const ch = canvasRef.current?.clientHeight || 640;
    const el = {
      id: Date.now(),
      type: preset.type,
      x: Math.round((cw - preset.defaults.w) / 2),
      y: Math.round((ch - preset.defaults.h) / 3),
      w: preset.defaults.w,
      h: preset.defaults.h,
      bg: preset.defaults.bg,
      corner: preset.defaults.corner,
      text: preset.defaults.text,
      textColor: preset.defaults.textColor||"#eee",
      image: preset.defaults.image||null,
    };
    setElements(p=>[...p,el]);
    setSelected(el.id);
  };

  const updateEl = (id, patch) => {
    setElements(p=>p.map(e=>e.id===id?{...e,...patch}:e));
  };

  // Drag
  const startDrag = (e, id) => {
    e.preventDefault();
    const el = elements.find(x=>x.id===id);
    const startX=e.clientX-el.x, startY=e.clientY-el.y;
    dragRef.current={id,startX,startY};
    const onMove = ev => {
      if(!dragRef.current) return;
      updateEl(dragRef.current.id, {x:ev.clientX-dragRef.current.startX, y:ev.clientY-dragRef.current.startY});
    };
    const onUp = () => { dragRef.current=null; window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    setSelected(id);
  };

  // Resize
  const startResize = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    const el = elements.find(x=>x.id===id);
    const startX=e.clientX, startY=e.clientY, startW=el.w, startH=el.h;
    const onMove = ev => {
      updateEl(id, {w:Math.max(40,startW+(ev.clientX-startX)), h:Math.max(20,startH+(ev.clientY-startY))});
    };
    const onUp = () => { window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); };
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file||!selected) return;
    const reader = new FileReader();
    reader.onload = ev => { updateEl(selected, {image:ev.target.result}); showToast("Image set!"); };
    reader.readAsDataURL(file);
  };

  const generateCode = async () => {
    if (!aiDesc.trim()) { showToast("Describe your UI first"); return; }
    setAiLoading(true); setAiResult("");
    const sys = `You are a Roblox UI expert. Generate complete Luau LocalScript code for the UI described.
Rules: Use TweenService for all animations. Add hover effects. Use UICorner for rounding. Put everything in a single LocalScript. Use game.Players.LocalPlayer:WaitForChild("PlayerGui") as parent. Start script with -- @name UIScript. Complete code, no placeholders.`;
    try {
      const full = await callAPI(m.mode,[{role:"user",content:`Create a Roblox UI: ${aiDesc}`}],sys);
      setAiResult(full);
    } catch(e) { setAiResult(`⚠️ ${e.message}`); }
    setAiLoading(false);
  };

  const copyCode = (code,k) => {
    navigator.clipboard?.writeText(code);
    setCopied(p=>({...p,[k]:true}));
    setTimeout(()=>setCopied(p=>({...p,[k]:false})),2000);
    showToast("Code copied!");
  };

  const selEl = elements.find(e=>e.id===selected);

  return (
    <div style={{display:"flex",height:"100%",gap:0}}>

      {/* Left: Presets + Canvas */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Preset bar */}
        <div style={{padding:"10px 14px",borderBottom:"1px solid #111",display:"flex",gap:6,flexWrap:"wrap",flexShrink:0,alignItems:"center"}}>
          <span style={{fontSize:11,color:"#333",fontWeight:600,marginRight:4}}>INSERT</span>
          {UI_PRESETS.map(p=>(
            <button key={p.type} onClick={()=>addElement(p)}
              style={{background:"#111",border:"1px solid #1a1a1a",borderRadius:7,padding:"5px 10px",color:"#666",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4,transition:"all .12s"}}
              onMouseEnter={e=>{e.target.style.borderColor="#6366f1";e.target.style.color="#6366f1";}}
              onMouseLeave={e=>{e.target.style.borderColor="#1a1a1a";e.target.style.color="#666";}}>
              <span>{p.icon}</span> {p.label}
            </button>
          ))}
          {elements.length>0 && (
            <button onClick={()=>{setElements([]);setSelected(null);}}
              style={{marginLeft:"auto",background:"transparent",border:"1px solid #1a1a1a",borderRadius:7,padding:"5px 10px",color:"#333",fontSize:11,cursor:"pointer"}}>
              Clear
            </button>
          )}
        </div>

        {/* Canvas */}
        <div style={{flex:1,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:"#060606",padding:20}}>
          <div ref={canvasRef}
            style={{width:390,height:640,background:"#111",borderRadius:16,border:"1px solid #1e1e1e",position:"relative",overflow:"hidden",flexShrink:0,boxShadow:"0 20px 60px rgba(0,0,0,.6)"}}
            onClick={e=>{ if(e.target===canvasRef.current) setSelected(null); }}>

            {elements.length===0 && (
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8,opacity:.3}}>
                <span style={{fontSize:32}}>🖥️</span>
                <span style={{fontSize:12,color:"#666"}}>Click a preset to add elements</span>
              </div>
            )}

            {elements.map(el=>(
              <div key={el.id}
                className={`ui-el${el.id===selected?" sel-el":""}`}
                style={{
                  left:el.x, top:el.y, width:el.w, height:el.h,
                  background:el.image?`url(${el.image}) center/cover no-repeat`:(el.bg==="transparent"?"transparent":el.bg),
                  borderRadius:el.corner,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  overflow:"hidden",
                }}
                onMouseDown={e=>startDrag(e,el.id)}
                onClick={e=>{e.stopPropagation();setSelected(el.id);}}>
                {el.text && <span style={{color:el.textColor,fontSize:13,fontWeight:500,pointerEvents:"none",textAlign:"center",padding:"0 6px"}}>{el.text}</span>}
                {el.id===selected && (
                  <div className="resize-h" style={{right:-4,bottom:-4,cursor:"se-resize"}}
                    onMouseDown={e=>startResize(e,el.id)}/>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Properties + AI Generate */}
      <div style={{width:280,borderLeft:"1px solid #111",display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>

        {/* Properties panel */}
        {selEl && (
          <div style={{borderBottom:"1px solid #111",padding:"12px 14px",overflowY:"auto",maxHeight:"45%"}}>
            <div style={{fontSize:11,color:"#6366f1",fontWeight:600,marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>Properties — {selEl.type}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Text */}
              {["TextButton","TextLabel","TextBox"].includes(selEl.type) && (
                <>
                  <label style={{fontSize:11,color:"#444"}}>Text</label>
                  <input className="inp" value={selEl.text} onChange={e=>updateEl(selected,{text:e.target.value})} style={{padding:"7px 9px",fontSize:12}}/>
                  <label style={{fontSize:11,color:"#444"}}>Text Color</label>
                  <input type="color" value={selEl.textColor} onChange={e=>updateEl(selected,{textColor:e.target.value})}
                    style={{width:"100%",height:28,background:"none",border:"1px solid #1e1e1e",borderRadius:7,cursor:"pointer"}}/>
                </>
              )}
              {/* BG */}
              {selEl.bg!=="transparent" && (
                <>
                  <label style={{fontSize:11,color:"#444"}}>Background</label>
                  <input type="color" value={selEl.bg||"#1a1a1a"} onChange={e=>updateEl(selected,{bg:e.target.value})}
                    style={{width:"100%",height:28,background:"none",border:"1px solid #1e1e1e",borderRadius:7,cursor:"pointer"}}/>
                </>
              )}
              {/* Corner */}
              <label style={{fontSize:11,color:"#444"}}>Corner radius: {selEl.corner}px</label>
              <input type="range" min={0} max={30} value={selEl.corner} onChange={e=>updateEl(selected,{corner:+e.target.value})}
                style={{width:"100%",accentColor:"#6366f1"}}/>
              {/* Size */}
              <div style={{display:"flex",gap:6}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:"#444",display:"block",marginBottom:3}}>W</label>
                  <input className="inp" type="number" value={selEl.w} onChange={e=>updateEl(selected,{w:+e.target.value})} style={{padding:"5px 8px",fontSize:12}}/>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:11,color:"#444",display:"block",marginBottom:3}}>H</label>
                  <input className="inp" type="number" value={selEl.h} onChange={e=>updateEl(selected,{h:+e.target.value})} style={{padding:"5px 8px",fontSize:12}}/>
                </div>
              </div>
              {/* Image upload for ImageLabel */}
              {selEl.type==="ImageLabel" && (
                <>
                  <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleImageUpload}/>
                  <button onClick={()=>imgRef.current?.click()} className="btn-sec" style={{padding:"7px",fontSize:12,width:"100%"}}>
                    📎 Upload Image
                  </button>
                </>
              )}
              {/* Delete */}
              <button onClick={()=>{setElements(p=>p.filter(e=>e.id!==selected));setSelected(null);}}
                style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:8,padding:"6px",fontSize:12,color:"#ef4444",cursor:"pointer",marginTop:4}}>
                Delete Element
              </button>
            </div>
          </div>
        )}

        {/* AI Generate */}
        <div style={{flex:1,display:"flex",flexDirection:"column",padding:"12px 14px",overflow:"hidden"}}>
          <div style={{fontSize:11,color:"#a855f7",fontWeight:600,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>AI Generate</div>
          <textarea value={aiDesc} onChange={e=>setAiDesc(e.target.value)} placeholder="Describe the UI you want…&#10;e.g. 'Inventory grid with slots, drag & drop, and animated open/close'"
            style={{background:"#0d0d0d",border:"1px solid #1c1c1c",borderRadius:9,padding:"10px",color:"#ccc",fontSize:12,lineHeight:1.6,resize:"none",height:90,marginBottom:8,fontFamily:"'Inter',sans-serif"}}/>
          <button onClick={generateCode} disabled={aiLoading} className="btn-pri"
            style={{padding:"10px",fontSize:13,marginBottom:10,width:"100%",opacity:aiLoading?.6:1}}>
            {aiLoading?"Generating…":"✦ Generate UI Code"}
          </button>

          <div style={{flex:1,overflowY:"auto"}}>
            {aiResult && parseParts(aiResult).map((p,i)=>
              p.type==="code"
                ? <CodeBlock key={i} lang={p.lang} code={p.content} onCopy={()=>copyCode(p.content,`ui-${i}`)} copied={copied[`ui-${i}`]}/>
                : <MD key={i} text={p.content}/>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   SETTINGS PANEL
================================================================ */
function SettingsPanel({user,onClose,onLogout,showToast,updateUserPlan,isOwner}) {
  const [keyCounter,  setKeyCounter]  = useState(()=>LS.g("dvx_kctr",0));
  const [genKeys,     setGenKeys]     = useState(()=>LS.g("dvx_gkeys",[]));
  const [genType,     setGenType]     = useState("ZAITH");
  const [copied,      setCopied]      = useState({});

  const generateKey = () => {
    const k = genKey(genType, keyCounter);
    const next = keyCounter+1;
    const nextKeys = [k,...genKeys].slice(0,40);
    setKeyCounter(next); LS.s("dvx_kctr",next);
    setGenKeys(nextKeys); LS.s("dvx_gkeys",nextKeys);
    navigator.clipboard?.writeText(k);
    showToast(`Key generated & copied!`);
  };

  const copyKey = (k,i) => {
    navigator.clipboard?.writeText(k);
    setCopied(p=>({...p,[i]:true}));
    setTimeout(()=>setCopied(p=>({...p,[i]:false})),2000);
    showToast("Copied!");
  };

  const typeColor = t => t.startsWith("ZENO")?"#e03a3e":"#a855f7";

  return (
    <div className="fade" style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div className="scl" style={{background:"#0e0e0e",border:"1px solid #1e1e1e",borderRadius:16,padding:24,maxWidth:400,width:"100%",maxHeight:"90dvh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#ddd"}}>Settings</h2>
          <button onClick={onClose} style={{color:"#444",fontSize:15,padding:"3px 8px",background:"#161616",borderRadius:6,border:"1px solid #1e1e1e"}}>✕</button>
        </div>

        {/* User info */}
        <div style={{background:"#0a0a0a",border:"1px solid #1a1a1a",borderRadius:11,padding:13,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontWeight:600,fontSize:14,color:"#ddd"}}>{user?.username}</div>
            <div style={{fontSize:12,color:MODELS[user?.plan||"zenith"]?.color,marginTop:2,fontWeight:600}}>
              {MODELS[user?.plan||"zenith"]?.name} {isOwner?"· 👑 Owner":""}
            </div>
          </div>
          <button onClick={onLogout} className="btn-sec" style={{padding:"6px 12px",fontSize:12}}>Sign Out</button>
        </div>

        {/* Owner: key generator */}
        {isOwner && (
          <>
            <div style={{fontSize:12,color:"#6366f1",fontWeight:600,marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>Generate Keys</div>

            {/* Toggle */}
            <div style={{display:"flex",background:"#080808",borderRadius:10,padding:4,marginBottom:12,gap:4}}>
              {["ZAITH","ZENO"].map(t=>(
                <button key={t} onClick={()=>setGenType(t)}
                  style={{flex:1,padding:"8px",borderRadius:7,border:"none",background:genType===t?typeColor(t):"transparent",color:genType===t?"#fff":"#444",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s"}}>
                  {t==="ZAITH"?"🔷 Zaith":"🌟 Zeno"}
                </button>
              ))}
            </div>

            <button onClick={generateKey} className="btn-pri"
              style={{width:"100%",padding:"11px",fontSize:13,marginBottom:14,background:typeColor(genType)}}>
              Generate {genType} Key →
            </button>

            {/* Keys list */}
            {genKeys.length>0 && (
              <div style={{background:"#080808",borderRadius:11,border:"1px solid #141414",overflow:"hidden"}}>
                <div style={{padding:"8px 12px",borderBottom:"1px solid #141414",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:"#333",fontWeight:600}}>Generated Keys ({genKeys.length})</span>
                  <button onClick={()=>{setGenKeys([]);LS.s("dvx_gkeys",[]);}} style={{fontSize:10,color:"#333",background:"none",border:"none",cursor:"pointer"}}>Clear</button>
                </div>
                <div style={{maxHeight:200,overflowY:"auto"}}>
                  {genKeys.map((k,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:i<genKeys.length-1?"1px solid #0f0f0f":"none"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:typeColor(k),flexShrink:0}}/>
                      <code style={{flex:1,fontSize:10.5,color:typeColor(k),fontFamily:"'JetBrains Mono',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k}</code>
                      <button onClick={()=>copyKey(k,i)}
                        style={{background:copied[i]?"rgba(34,197,94,.12)":"#161616",border:`1px solid ${copied[i]?"rgba(34,197,94,.3)":"#222"}`,borderRadius:5,padding:"3px 8px",color:copied[i]?"#22c55e":"#555",fontSize:10,cursor:"pointer",flexShrink:0,transition:"all .15s"}}>
                        {copied[i]?"✓":"Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Non-owner: key redemption in settings too */}
        {!isOwner && (
          <div>
            <div style={{fontSize:12,color:"#444",fontWeight:600,marginBottom:12}}>Current Plan: <span style={{color:MODELS[user?.plan||"zenith"].color}}>{MODELS[user?.plan||"zenith"].name}</span></div>
            <p style={{fontSize:12,color:"#333",lineHeight:1.65}}>To upgrade to Zaith or Zeno, select that model from the <strong style={{color:"#666"}}>Agents</strong> tab and redeem a key.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   AI SELECTOR (Agents tab content)
================================================================ */
function AgentsPanel({user,model,onSelectModel,onModelUnlocked,showToast}) {
  const [keyInputs,   setKeyInputs]   = useState({zaith:"",zeno:""});
  const [expanded,    setExpanded]    = useState(null);
  const [keyStatus,   setKeyStatus]   = useState({});
  const [keyBubble,   setKeyBubble]   = useState({});
  const isOwner = user?.username?.toLowerCase() === OWNER_KEY.toLowerCase();

  const redeemKey = (modelId) => {
    const raw = keyInputs[modelId];
    const result = validateKey(raw);
    if (result === modelId) {
      setKeyStatus(p=>({...p,[modelId]:"ok"}));
      setKeyBubble(p=>({...p,[modelId]:true}));
      setTimeout(()=>{ setKeyBubble(p=>({...p,[modelId]:false})); setKeyStatus(p=>({...p,[modelId]:null})); }, 2400);
      onModelUnlocked(modelId);
      onSelectModel(modelId);
      setExpanded(null);
      showToast(`✓ ${MODELS[modelId].name} unlocked!`);
    } else {
      setKeyStatus(p=>({...p,[modelId]:"err"}));
      setKeyBubble(p=>({...p,[modelId]:true}));
      setTimeout(()=>{ setKeyBubble(p=>({...p,[modelId]:false})); setKeyStatus(p=>({...p,[modelId]:null})); }, 2400);
    }
  };

  return (
    <div style={{padding:"20px 16px",overflowY:"auto",height:"100%"}}>
      <div className="up" style={{marginBottom:20}}>
        <h2 style={{fontSize:16,fontWeight:700,color:"#ddd",marginBottom:4}}>AI Models</h2>
        <p style={{fontSize:12,color:"#333"}}>Select which AI powers your chat</p>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {Object.values(MODELS).map((m,i)=>{
          const isActive = model===m.id;
          const isUnlocked = m.free || isOwner || user?.plan===m.id || user?.plan==="zeno";
          const isExp = expanded===m.id;
          const ks = keyStatus[m.id];

          return (
            <div key={m.id} className="up" style={{animationDelay:`${i*.07}s`}}>
              <div className="mcard"
                style={{borderColor:isActive?`${m.color}50`:"#181818",background:isActive?m.bg:"#0c0c0c"}}
                onClick={()=>{
                  if(isUnlocked) { onSelectModel(m.id); return; }
                  setExpanded(isExp?null:m.id);
                }}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
                  <div style={{width:40,height:40,borderRadius:11,background:m.bg,border:`1px solid ${m.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{m.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <span style={{fontWeight:700,fontSize:14,color:"#e0e0e0"}}>{m.name}</span>
                      <span style={{fontSize:10,fontWeight:700,color:isUnlocked?"#22c55e":m.color,background:isUnlocked?"rgba(34,197,94,.1)":m.bg,border:`1px solid ${isUnlocked?"rgba(34,197,94,.25)":m.color+"30"}`,borderRadius:5,padding:"1px 6px"}}>{isUnlocked?"✓ Unlocked":m.free?"Free":"Key Required"}</span>
                      {isActive && <span style={{fontSize:10,fontWeight:700,color:m.color}}>● Active</span>}
                    </div>
                    <div style={{fontSize:11,color:"#555",marginBottom:4}}>{m.sub}</div>
                    <div style={{fontSize:12,color:"#333"}}>{m.desc}</div>
                  </div>
                </div>

                {/* Inline key input */}
                {!isUnlocked && isExp && (
                  <div className="fade" onClick={e=>e.stopPropagation()} style={{marginTop:14,paddingTop:14,borderTop:"1px solid #1a1a1a"}}>
                    <div style={{fontSize:11,color:"#444",marginBottom:7,fontWeight:500}}>Enter your {m.name} key</div>
                    <div style={{position:"relative"}}>
                      <div style={{display:"flex",gap:6,marginBottom:8}}>
                        <input className="inp"
                          value={keyInputs[m.id.slice(0,5).toUpperCase()==="ZAITH"?m.id:"zeno"]||keyInputs[m.id]||""}
                          onChange={e=>setKeyInputs(p=>({...p,[m.id]:e.target.value}))}
                          onKeyDown={e=>e.key==="Enter"&&redeemKey(m.id)}
                          placeholder={`${m.id.toUpperCase().slice(0,5)}-XXX-XXXXXXXX`}
                          style={{flex:1,background:"#080808",borderColor:ks==="ok"?"#22c55e":ks==="err"?"#ef4444":"#1c1c1c"}}/>
                        <button onClick={()=>redeemKey(m.id)}
                          style={{background:m.color,border:"none",borderRadius:8,padding:"9px 14px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                          Redeem
                        </button>
                      </div>
                      {keyBubble[m.id] && (
                        <div className="kpop"
                          style={{background:ks==="ok"?"rgba(34,197,94,.12)":"rgba(239,68,68,.12)",border:`1px solid ${ks==="ok"?"#22c55e40":"#ef444440"}`,color:ks==="ok"?"#22c55e":"#ef4444"}}>
                          {ks==="ok"?"✓ Success!":"✗ Invalid key"}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>window.open("https://discord.gg/5eSyHRTVHF","_blank")}
                      style={{background:"transparent",border:"1px solid #1e1e1e",borderRadius:8,padding:"8px",color:"#444",fontSize:12,cursor:"pointer",width:"100%"}}>
                      Get key on Discord →
                    </button>
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
   SEARCH PANEL
================================================================ */
function SearchPanel({projects, onOpen}) {
  const [query, setQuery] = useState("");
  const results = !query.trim() ? [] : projects.filter(p=>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    (p.messages||[]).some(m=>m.content?.toLowerCase().includes(query.toLowerCase())) ||
    (p.scripts||[]).some(s=>s.name.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"14px 10px"}}>
      <div style={{fontSize:12,color:"#444",fontWeight:600,marginBottom:10}}>SEARCH</div>
      <input className="inp" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search projects, scripts, messages…" autoFocus/>
      <div style={{flex:1,overflowY:"auto",marginTop:10}}>
        {query && results.length===0 && <p style={{fontSize:12,color:"#2a2a2a",padding:"10px 4px"}}>No results</p>}
        {results.map(p=>(
          <div key={p.id} onClick={()=>onOpen(p.id)}
            style={{padding:"9px 8px",borderRadius:8,background:"#0e0e0e",border:"1px solid #141414",marginBottom:6,cursor:"pointer",transition:"all .12s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#1e1e1e"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#141414"}>
            <div style={{fontSize:12,color:"#888",fontWeight:500,marginBottom:2}}>{p.name}</div>
            <div style={{fontSize:11,color:"#333"}}>{(p.messages||[]).length} messages · {(p.scripts||[]).length} scripts</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   SIDEBAR
================================================================ */
function Sidebar({user,projects,activeId,setActiveId,onNewChat,onScriptOpen,onScriptUpdate,onSettings,tab,setTab,model,ac}) {
  const proj = projects.find(p=>p.id===activeId);
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",padding:"10px 8px"}}>
      {/* Logo */}
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"4px 4px 14px"}}>
        <div style={{width:28,height:28,borderRadius:8,background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",flexShrink:0,boxShadow:"0 4px 12px rgba(99,102,241,.4)"}}>D</div>
        <span style={{fontSize:15,fontWeight:700,color:"#ddd",letterSpacing:.5}}>Devix</span>
      </div>

      {/* Nav */}
      <div className={`navr${tab==="chat"?" act":""}`} onClick={()=>setTab("chat")} style={{marginBottom:1}}>
        <span style={{fontSize:14}}>✦</span> New task
      </div>
      <div className={`navr${tab==="agents"?" act":""}`} onClick={()=>setTab("agents")} style={{marginBottom:1}}>
        <span style={{fontSize:14}}>◈</span> Agents
        <span style={{fontSize:9,background:"#191919",padding:"2px 5px",borderRadius:4,color:"#444",marginLeft:"auto"}}>AI</span>
      </div>
      <div className={`navr${tab==="search"?" act":""}`} onClick={()=>setTab("search")} style={{marginBottom:1}}>
        <span style={{fontSize:14}}>⌕</span> Search
      </div>
      <div className={`navr${tab==="uigen"?" act":""}`} onClick={()=>setTab("uigen")} style={{marginBottom:12}}>
        <span style={{fontSize:14}}>🎨</span> UI Generator
      </div>

      {tab==="chat" && (
        <>
          <div style={{fontSize:10,color:"#222",fontWeight:600,textTransform:"uppercase",letterSpacing:.5,marginBottom:7,paddingLeft:4}}>Projects</div>
          <div style={{flex:1,overflowY:"auto"}}>
            {projects.length===0
              ? <p style={{fontSize:11,color:"#222",padding:"4px 4px",fontStyle:"italic"}}>No projects yet</p>
              : projects.slice().reverse().map(p=>(
                  <div key={p.id} className={`trow${p.id===activeId?" sel":""}`}
                    style={{paddingLeft:4,gap:6,marginBottom:1}}
                    onClick={()=>setActiveId(p.id)}>
                    <span style={{fontSize:12}}>📁</span>
                    <span style={{fontSize:11.5,color:p.id===activeId?"#888":"#444",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</span>
                  </div>
                ))
            }
          </div>

          {/* Project tree */}
          {proj && (
            <div style={{borderTop:"1px solid #111",paddingTop:9,marginTop:8,flex:2,overflowY:"auto",minHeight:0}}>
              <ProjectTree project={proj} onScriptOpen={onScriptOpen} onScriptUpdate={onScriptUpdate} ac={ac}/>
            </div>
          )}
        </>
      )}

      {tab!=="chat" && <div style={{flex:1}}/>}

      {/* Bottom */}
      <div style={{borderTop:"1px solid #111",paddingTop:8,marginTop:8}}>
        <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 8px",background:"#0a0a0a",border:"1px solid #141414",borderRadius:8,marginBottom:5}}>
          <span style={{fontSize:12}}>{MODELS[model]?.icon}</span>
          <span style={{fontSize:11,color:MODELS[model]?.color,fontWeight:600,flex:1}}>{MODELS[model]?.name}</span>
        </div>
        <button className="navr" onClick={onSettings} style={{width:"100%",justifyContent:"flex-start",padding:"6px 8px"}}>
          <span>⚙</span>
          <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:12}}>{user?.username}</span>
        </button>
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
  const [form,       setForm]       = useState({username:"",password:""});
  const [loginErr,   setLoginErr]   = useState("");
  const [user,       setUser]       = useState(null);
  const [model,      setModel]      = useState("zenith");
  const [projects,   setProjects]   = useState([]);
  const [activeId,   setActiveId]   = useState(null);
  const [input,      setInput]      = useState("");
  const [isLoading,  setIsLoading]  = useState(false);
  const [files,      setFiles]      = useState([]);
  const [showSett,   setShowSett]   = useState(false);
  const [openScript, setOpenScript] = useState(null);
  const [copied,     setCopied]     = useState({});
  const [toast,      setToast]      = useState(null);
  const [tab,        setTab]        = useState("chat");
  // inline model switcher key input in header
  const [hdrKeyModel, setHdrKeyModel] = useState(null);
  const [hdrKeyInput, setHdrKeyInput] = useState("");
  const [hdrKeyStatus,setHdrKeyStatus]= useState(null);
  const [hdrKeyBubble,setHdrKeyBubble]= useState(false);

  const endRef   = useRef(null);
  const textRef  = useRef(null);
  const fileRef  = useRef(null);
  const abortRef = useRef(null);

  const isOwner = user?.username?.toLowerCase() === OWNER_KEY.toLowerCase();
  const m  = MODELS[model];
  const ac = m?.color||"#6366f1";
  const proj = projects.find(p=>p.id===activeId);
  const msgs = proj?.messages||[];

  // ── Init ────────────────────────────────────────────────────
  useEffect(()=>{
    const s = LS.g("dvx_session");
    if(s?.username) {
      let u = {...s};
      // Owner always gets full plan
      if(u.username?.toLowerCase()===OWNER_KEY.toLowerCase()) u.plan="owner";
      setUser(u);
      setProjects(LS.g(`dvx_proj_${u.username}`,[]) );
      setModel(u.lastModel||"zenith");
      setPage("chat");
    } else { setPage("login"); }
  },[]);

  useEffect(()=>{ if(proj) endRef.current?.scrollIntoView({behavior:"smooth"}); },[msgs,isLoading]);
  useEffect(()=>{ if(user) LS.s(`dvx_proj_${user.username}`,projects); },[projects,user]);

  const showToast = useCallback((msg,dur=3000)=>{setToast(msg);setTimeout(()=>setToast(null),dur);},[]);

  // ── Auth ────────────────────────────────────────────────────
  const doAuth = () => {
    const uname=form.username.trim(); const pass=form.password;
    if(!uname||!pass){setLoginErr("Fill in all fields");return;}
    const users=LS.g("dvx_users",{}); const key=uname.toLowerCase();
    if(isSignup) {
      if(users[key]){setLoginErr("Username taken");return;}
      users[key]={username:uname,password:pass,plan:"zenith"};
      LS.s("dvx_users",users);
      const plan = uname.toLowerCase()===OWNER_KEY.toLowerCase()?"owner":"zenith";
      const u={username:uname,plan};
      setUser(u); LS.s("dvx_session",u); setProjects([]); setPage("chat"); showToast(`Welcome, ${uname}! ⚡`);
    } else {
      const rec=users[key];
      if(!rec){setLoginErr("Account not found");return;}
      if(rec.password!==pass){setLoginErr("Wrong password");return;}
      const plan = rec.username.toLowerCase()===OWNER_KEY.toLowerCase()?"owner":rec.plan||"zenith";
      const u={username:rec.username,plan};
      setUser(u); LS.s("dvx_session",u);
      setProjects(LS.g(`dvx_proj_${rec.username}`,[]));
      setPage("chat"); showToast(`Welcome back, ${rec.username}!`);
    }
  };

  const doLogout=()=>{ LS.d("dvx_session"); setUser(null); setPage("login"); setForm({username:"",password:""}); setProjects([]); setActiveId(null); setShowSett(false); };

  const updateUserPlan=(plan)=>{
    const upd={...user,plan};
    setUser(upd); LS.s("dvx_session",upd);
    const users=LS.g("dvx_users",{}); const k=user.username.toLowerCase();
    if(users[k]){users[k].plan=plan;LS.s("dvx_users",users);}
  };

  // ── Model switching (header) ─────────────────────────────────
  const canUse = (mid) => {
    if(isOwner) return true;
    const ml = MODELS[mid];
    if(ml.free) return true;
    if(user?.plan===mid) return true;
    if(user?.plan==="owner") return true;
    if(mid==="zaith" && user?.plan==="zeno") return true;
    return false;
  };

  const switchModel = (mid) => {
    if(canUse(mid)) {
      setModel(mid);
      const upd={...user,lastModel:mid};
      setUser(upd); LS.s("dvx_session",upd);
      setHdrKeyModel(null);
    } else {
      setHdrKeyModel(hdrKeyModel===mid?null:mid);
      setHdrKeyInput("");
      setHdrKeyStatus(null);
    }
  };

  const redeemHdrKey = () => {
    const result = validateKey(hdrKeyInput);
    if(result===hdrKeyModel) {
      setHdrKeyStatus("ok"); setHdrKeyBubble(true);
      setTimeout(()=>{setHdrKeyBubble(false);setHdrKeyStatus(null);},2400);
      updateUserPlan(result);
      setModel(result);
      const upd={...user,plan:result,lastModel:result};
      setUser(upd); LS.s("dvx_session",upd);
      setHdrKeyModel(null); setHdrKeyInput("");
      showToast(`✓ ${MODELS[result].name} unlocked!`);
    } else {
      setHdrKeyStatus("err"); setHdrKeyBubble(true);
      setTimeout(()=>{setHdrKeyBubble(false);setHdrKeyStatus(null);},2400);
    }
  };

  // ── Projects ─────────────────────────────────────────────────
  const newProject=()=>{ const id=Date.now(); setProjects(p=>[...p,{id,name:"New Chat",messages:[],scripts:[]}]); setActiveId(id); setTab("chat"); };
  const patchProject=useCallback((id,fn)=>setProjects(prev=>prev.map(p=>p.id===id?fn(p):p)),[]);

  // ── Send ─────────────────────────────────────────────────────
  const doSend=async()=>{
    if((!input.trim()&&!files.length)||isLoading) return;
    let curId = activeId;
    if(!curId) { const id=Date.now(); setProjects(p=>[...p,{id,name:input.trim().slice(0,40),messages:[],scripts:[]}]); setActiveId(id); curId=id; }

    const uMsg={id:Date.now(),role:"user",content:input,files:[...files],ts:nowTS()};
    const prev = projects.find(p=>p.id===curId)?.messages||[];
    const next=[...prev,uMsg];

    if(prev.length===0&&input.trim()) patchProject(curId,p=>({...p,name:input.trim().slice(0,42)+(input.length>42?"…":""),messages:next}));
    else patchProject(curId,p=>({...p,messages:next}));

    const userHint=input;
    setInput(""); setFiles([]); setIsLoading(true);
    if(textRef.current) textRef.current.style.height="auto";

    const apiMsgs=next.map(m=>({role:m.role,content:m.content+(m.files?.length?"\n\n[Files]\n"+m.files.map(f=>`--- ${f.name} ---\n${f.content||"[binary]"}`).join("\n\n"):"")}));
    const aiId=Date.now()+1;
    patchProject(curId,p=>({...p,messages:[...next,{id:aiId,role:"assistant",content:"",ts:nowTS(),streaming:true}]}));

    const abort=new AbortController(); abortRef.current=abort;
    try {
      const full=await callAPI(m.mode,apiMsgs);
      await streamText(full,partial=>{
        patchProject(curId,p=>({...p,messages:p.messages.map(msg=>msg.id===aiId?{...msg,content:partial,streaming:true}:msg)}));
      },abort.signal);
      const newScripts=extractScripts(full,userHint);
      patchProject(curId,p=>({
        ...p,
        messages:p.messages.map(msg=>msg.id===aiId?{...msg,content:full,streaming:false}:msg),
        scripts:[...(p.scripts||[]),...newScripts],
      }));
    } catch(err) {
      patchProject(curId,p=>({...p,messages:p.messages.map(msg=>msg.id===aiId?{...msg,content:`⚠️ ${err.message}`,streaming:false}:msg)}));
    }
    setIsLoading(false); abortRef.current=null;
  };

  const attachFiles=async fl=>{
    const arr=[];
    for(const f of Array.from(fl)){try{arr.push({name:f.name,content:await f.text()});}catch{arr.push({name:f.name,content:"[binary]"});}}
    setFiles(p=>[...p,...arr]); showToast(`${arr.length} file${arr.length>1?"s":""} attached`);
  };

  const onCopy=(code,key)=>{ navigator.clipboard?.writeText(code); setCopied(p=>({...p,[key]:true})); setTimeout(()=>setCopied(p=>({...p,[key]:false})),2000); showToast("Copied!"); };

  const onScriptUpdate=(updated)=>{ if(!activeId) return; patchProject(activeId,p=>({...p,scripts:p.scripts.map(s=>s.id===updated.id?updated:s)})); };

  /* ── Loading ── */
  if(page==="loading") return (
    <><style>{CSS}</style>
    <div style={{height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"#080808"}}>
      <div style={{width:44,height:44,borderRadius:13,background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#fff",animation:"pulse 1.4s ease infinite"}}>D</div>
    </div></>
  );

  /* ── Login ── */
  if(page==="login") return (
    <><style>{CSS}</style>
    <div style={{minHeight:"100dvh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center",padding:20,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(#0f0f0f 1px,transparent 1px),linear-gradient(90deg,#0f0f0f 1px,transparent 1px)",backgroundSize:"52px 52px",opacity:.5,pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:500,height:260,background:"radial-gradient(ellipse,rgba(99,102,241,.07),transparent 70%)",pointerEvents:"none"}}/>

      <div style={{zIndex:1,width:"100%",maxWidth:840,display:"flex",gap:24,flexWrap:"wrap",justifyContent:"center",alignItems:"flex-start",paddingTop:16}}>
        <div className="up" style={{flex:"0 0 300px",maxWidth:320}}>
          <div style={{marginBottom:22}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <div style={{width:36,height:36,borderRadius:10,background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:"#fff",boxShadow:"0 6px 20px rgba(99,102,241,.4)",flexShrink:0}}>D</div>
              <span style={{fontSize:24,fontWeight:800,color:"#e0e0e0",letterSpacing:.5}}>Devix</span>
            </div>
            <p style={{color:"#333",fontSize:13,lineHeight:1.7}}>The AI built for Roblox Studio.<br/>Luau scripts, game systems, instant help.</p>
          </div>
          <div style={{background:"#0e0e0e",border:"1px solid #181818",borderRadius:14,padding:20}}>
            <div style={{display:"flex",background:"#080808",borderRadius:9,padding:3,marginBottom:15}}>
              {["Sign In","Sign Up"].map((lb,i)=>(
                <button key={lb} onClick={()=>{setIsSignup(i===1);setLoginErr("");}}
                  style={{flex:1,padding:"7px 0",borderRadius:7,border:"none",background:isSignup===(i===1)?"#6366f1":"transparent",color:isSignup===(i===1)?"#fff":"#444",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .18s"}}>
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
              {loginErr && <p style={{color:"#ef4444",fontSize:12,textAlign:"center"}}>{loginErr}</p>}
              <button onClick={doAuth} className="btn-pri" style={{padding:"11px",fontSize:14,width:"100%",boxShadow:"0 4px 16px rgba(99,102,241,.3)"}}>
                {isSignup?"Create Account →":"Sign In →"}
              </button>
            </div>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:8,flex:"1 1 200px",maxWidth:370}}>
          {Object.values(MODELS).map((ml,i)=>(
            <div key={ml.id} className="up" style={{background:"#0e0e0e",border:"1px solid #181818",borderRadius:11,padding:"12px 14px",display:"flex",gap:11,alignItems:"flex-start",animationDelay:`${i*.08}s`}}>
              <div style={{width:32,height:32,borderRadius:9,background:ml.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{ml.icon}</div>
              <div>
                <div style={{color:"#ddd",fontWeight:600,fontSize:13,marginBottom:2}}>{ml.name} <span style={{fontSize:10,color:ml.free?"#22c55e":ml.color,fontWeight:700}}>{ml.free?"Free":"Key"}</span></div>
                <div style={{color:"#333",fontSize:12,lineHeight:1.55}}>{ml.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div></>
  );

  /* ── Main chat ── */
  return (
    <><style>{CSS}</style>

    {toast && (
      <div className="up" style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"#111",border:"1px solid #1e1e1e",borderRadius:9,padding:"9px 16px",fontSize:13,color:"#bbb",zIndex:999,boxShadow:"0 8px 28px rgba(0,0,0,.6)",whiteSpace:"nowrap"}}>
        {toast}
      </div>
    )}

    {showSett && <SettingsPanel user={user} onClose={()=>setShowSett(false)} onLogout={doLogout} showToast={showToast} updateUserPlan={updateUserPlan} isOwner={isOwner}/>}
    {openScript && <ScriptViewerModal script={openScript} onClose={()=>setOpenScript(null)} onUpdate={onScriptUpdate} model={model} showToast={showToast}/>}

    <div style={{height:"100dvh",display:"flex",background:"#080808",overflow:"hidden"}}>

      {/* Sidebar */}
      <aside style={{width:224,background:"#0b0b0b",borderRight:"1px solid #111",display:"flex",flexDirection:"column",flexShrink:0}}>
        <Sidebar
          user={user} projects={projects} activeId={activeId}
          setActiveId={id=>{setActiveId(id);setTab("chat");}}
          onNewChat={newProject}
          onScriptOpen={setOpenScript}
          onScriptUpdate={onScriptUpdate}
          onSettings={()=>setShowSett(true)}
          tab={tab} setTab={setTab}
          model={model} ac={ac}/>
      </aside>

      {/* Main */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

        {/* Header */}
        <header style={{height:46,padding:"0 16px",borderBottom:"1px solid #0f0f0f",display:"flex",alignItems:"center",gap:8,flexShrink:0,background:"#0b0b0b"}}>
          <span style={{fontSize:13,color:"#282828",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {tab==="uigen"?"🎨 UI Generator":tab==="agents"?"◈ Agents":tab==="search"?"⌕ Search":proj?.name||"Select a project"}
          </span>

          {/* Model switcher (always visible in header) */}
          <div style={{display:"flex",gap:4,position:"relative"}}>
            {Object.values(MODELS).map(ml=>{
              const unlocked = canUse(ml.id);
              const isHdrKey = hdrKeyModel===ml.id;
              return (
                <div key={ml.id} style={{position:"relative"}}>
                  <button onClick={()=>switchModel(ml.id)}
                    style={{display:"flex",alignItems:"center",gap:4,padding:"4px 9px",borderRadius:7,border:`1px solid ${model===ml.id?`${ml.color}40`:"#171717"}`,background:model===ml.id?ml.bg:"transparent",color:model===ml.id?ml.color:"#2a2a2a",fontSize:11,fontWeight:600,cursor:"pointer",transition:"all .15s",opacity:unlocked?1:.6}}>
                    {ml.icon} {ml.name}
                    {!unlocked&&!isOwner&&<span style={{fontSize:9,marginLeft:1}}>🔒</span>}
                  </button>

                  {/* Inline key input in header */}
                  {isHdrKey && (
                    <div className="scl" onClick={e=>e.stopPropagation()}
                      style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:"#0e0e0e",border:"1px solid #1e1e1e",borderRadius:11,padding:12,width:260,zIndex:200,boxShadow:"0 8px 24px rgba(0,0,0,.6)"}}>
                      <div style={{fontSize:11,color:"#444",marginBottom:7,fontWeight:500}}>Enter {ml.name} key to unlock</div>
                      <div style={{position:"relative"}}>
                        <div style={{display:"flex",gap:6,marginBottom:7}}>
                          <input className="inp" value={hdrKeyInput} onChange={e=>setHdrKeyInput(e.target.value)}
                            onKeyDown={e=>e.key==="Enter"&&redeemHdrKey()}
                            placeholder={`${ml.id.toUpperCase()}-XXX-XXXXXXXX`}
                            style={{flex:1,fontSize:12,padding:"7px 9px",borderColor:hdrKeyStatus==="ok"?"#22c55e":hdrKeyStatus==="err"?"#ef4444":"#1c1c1c"}}
                            autoFocus/>
                          <button onClick={redeemHdrKey}
                            style={{background:ml.color,border:"none",borderRadius:7,padding:"7px 12px",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                            →
                          </button>
                        </div>
                        {hdrKeyBubble && (
                          <div className="kpop"
                            style={{background:hdrKeyStatus==="ok"?"rgba(34,197,94,.12)":"rgba(239,68,68,.12)",border:`1px solid ${hdrKeyStatus==="ok"?"#22c55e40":"#ef444440"}`,color:hdrKeyStatus==="ok"?"#22c55e":"#ef4444",bottom:"auto",top:"calc(100% + 4px)"}}>
                            {hdrKeyStatus==="ok"?"✓ Unlocked!":"✗ Invalid key"}
                          </div>
                        )}
                      </div>
                      <button onClick={()=>window.open("https://discord.gg/5eSyHRTVHF","_blank")}
                        style={{background:"transparent",border:"1px solid #1a1a1a",borderRadius:7,padding:"6px",color:"#333",fontSize:11,cursor:"pointer",width:"100%"}}>
                        Get key on Discord →
                      </button>
                      <button onClick={()=>setHdrKeyModel(null)} style={{position:"absolute",top:8,right:8,background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:12}}>✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={()=>setShowSett(true)} style={{fontSize:13,color:"#282828",padding:"4px 7px",border:"1px solid #111",borderRadius:7,background:"none",cursor:"pointer"}}>⚙</button>
        </header>

        {/* Close header dropdown on outside click */}
        {hdrKeyModel && <div style={{position:"fixed",inset:0,zIndex:199}} onClick={()=>setHdrKeyModel(null)}/>}

        {/* Tab content */}
        {tab==="agents" && (
          <div style={{flex:1,overflow:"hidden"}}>
            <AgentsPanel user={user} model={model} onSelectModel={mid=>{switchModel(mid);setTab("chat");}} onModelUnlocked={updateUserPlan} showToast={showToast}/>
          </div>
        )}
        {tab==="search" && (
          <div style={{flex:1,overflow:"hidden"}}>
            <SearchPanel projects={projects} onOpen={id=>{setActiveId(id);setTab("chat");}}/>
          </div>
        )}
        {tab==="uigen" && (
          <div style={{flex:1,overflow:"hidden"}}>
            <UIGenerator model={model} showToast={showToast}/>
          </div>
        )}

        {/* Chat */}
        {tab==="chat" && (
          <>
            <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
              {!proj||msgs.length===0 ? (
                <div className="fade" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,gap:22}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{width:54,height:54,borderRadius:15,background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:25,fontWeight:800,color:"#fff",margin:"0 auto 16px",boxShadow:"0 12px 36px rgba(99,102,241,.35)"}}>D</div>
                    <h1 style={{fontSize:28,fontWeight:300,color:"#383838",letterSpacing:-1}}>What can I do for you?</h1>
                    <p style={{color:"#222",fontSize:12,marginTop:6}}>Using <span style={{color:ac,fontWeight:600}}>{m.name}</span> · {m.sub}</p>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",maxWidth:580}}>
                    {[{icon:"⚔️",l:"Combat system"},{icon:"💾",l:"DataStore"},{icon:"🗺️",l:"Terrain gen"},{icon:"🎒",l:"Inventory"},{icon:"🛡️",l:"Admin system"},{icon:"🤖",l:"AI NPC"}].map(q=>(
                      <button key={q.l} onClick={()=>{if(!proj)newProject();setInput(`Build a complete ${q.l.toLowerCase()} for Roblox Studio`);textRef.current?.focus();}}
                        style={{display:"flex",alignItems:"center",gap:6,padding:"8px 13px",border:"1px solid #131313",borderRadius:9,background:"#0d0d0d",color:"#3a3a3a",fontSize:12,cursor:"pointer",transition:"all .12s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor="#1e1e1e";e.currentTarget.style.color="#666";}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor="#131313";e.currentTarget.style.color="#3a3a3a";}}>
                        {q.icon} {q.l}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{maxWidth:720,width:"100%",margin:"0 auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:9}}>
                  {msgs.map(msg=>(
                    <ChatMsg key={msg.id} msg={msg} model={model} onCopy={onCopy} copied={copied}/>
                  ))}
                  {isLoading&&msgs[msgs.length-1]?.role!=="assistant"&&(
                    <div className="up" style={{display:"flex",alignItems:"center",gap:7}}>
                      <div style={{width:17,height:17,borderRadius:5,background:ac,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,color:"#fff",flexShrink:0}}>D</div>
                      <span className="d1" style={{width:4,height:4,borderRadius:"50%",background:ac,display:"inline-block"}}/>
                      <span className="d2" style={{width:4,height:4,borderRadius:"50%",background:ac,display:"inline-block"}}/>
                      <span className="d3" style={{width:4,height:4,borderRadius:"50%",background:ac,display:"inline-block"}}/>
                      <span style={{color:"#222",fontSize:12}}>{m.mode==="deep"?"Synthesizing…":"Thinking…"}</span>
                    </div>
                  )}
                  <div ref={endRef}/>
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{borderTop:"1px solid #0f0f0f",padding:"10px 16px 12px",background:"#0b0b0b",flexShrink:0}}>
              {files.length>0 && (
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:7}}>
                  {files.map((f,i)=>(
                    <span key={i} style={{background:`${ac}12`,border:`1px solid ${ac}22`,borderRadius:5,padding:"3px 8px",fontSize:11,color:ac,display:"flex",alignItems:"center",gap:4}}>
                      📄 {f.name}
                      <button onClick={()=>setFiles(p=>p.filter((_,j)=>j!==i))} style={{color:"#333",fontSize:9,background:"none",border:"none",cursor:"pointer"}}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="ibox" style={{display:"flex",alignItems:"flex-end",gap:7,background:"#0d0d0d",padding:"9px 11px"}}>
                <input ref={fileRef} type="file" accept=".lua,.luau,.rbxl,.rbxlx,.txt,.json,.md" multiple style={{display:"none"}} onChange={e=>attachFiles(e.target.files)}/>
                <button onClick={()=>fileRef.current?.click()} style={{color:"#252525",fontSize:20,padding:"1px 4px",lineHeight:1,flexShrink:0,marginBottom:1}}>+</button>
                <textarea ref={textRef} value={input}
                  onChange={e=>{setInput(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,180)+"px";}}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();doSend();}}}
                  placeholder="Assign a task or ask anything…" rows={1}
                  style={{flex:1,background:"none",border:"none",color:"#ccc",fontSize:14,resize:"none",lineHeight:1.65,maxHeight:180,overflow:"auto",padding:"1px 0"}}/>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <span style={{fontSize:11,color:ac,fontWeight:600}}>{m.icon} {m.name}</span>
                  <button onClick={doSend} disabled={isLoading||(!input.trim()&&!files.length)}
                    style={{background:(isLoading||(!input.trim()&&!files.length))?"#161616":"#6366f1",border:"none",borderRadius:8,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center",color:(isLoading||(!input.trim()&&!files.length))?"#282828":"#fff",fontSize:14,cursor:isLoading||(!input.trim()&&!files.length)?"default":"pointer",transition:"background .15s",flexShrink:0}}>
                    {isLoading?<span style={{animation:"spin 1s linear infinite",display:"inline-block",fontSize:11}}>⟳</span>:"↑"}
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
