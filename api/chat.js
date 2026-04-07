// api/chat.js — Devix AI Groq fallback
// Primary AI is Puter.js (Claude Sonnet 4.5, free, runs client-side)
// This is only used if Puter.js is unavailable
import Groq from "groq-sdk";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function timeout(p, ms) {
  return Promise.race([p, new Promise((_,r)=>setTimeout(()=>r(new Error("timeout")),ms))]);
}
async function callGroq(model, system, messages, maxTokens=2000) {
  const c = await groq.chat.completions.create({
    model, temperature:0.65, max_completion_tokens:maxTokens,
    messages:[{role:"system",content:system||""},...messages],
  });
  return c.choices?.[0]?.message?.content||"";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type,X-Devix-Key");
  if(req.method==="OPTIONS") return res.status(200).end();
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  try {
    const {system,messages,mode} = req.body;
    if(!messages||!Array.isArray(messages)) return res.status(400).json({error:"Invalid body"});
    let text;
    if(mode==="zeno") text=await callGroq("llama-3.3-70b-versatile",system||"",messages,3000);
    else if(mode==="zaith") text=await callGroq("meta-llama/llama-4-scout-17b-16e-instruct",system||"",messages,2000);
    else text=await Promise.any([
      timeout(callGroq("meta-llama/llama-4-scout-17b-16e-instruct",system||"",messages,1500),13000),
      timeout(callGroq("llama-3.3-70b-versatile",system||"",messages,1500),13000),
    ]).catch(()=>{throw new Error("All models timed out");});
    return res.status(200).json({text});
  } catch(err) {
    return res.status(500).json({error:err.message||"Server error"});
  }
}
