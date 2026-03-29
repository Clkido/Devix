// api/chat.js — Devix AI
// Zenith = race fastest | Zaith = scout single | Zeno = 70b single-shot (NO synthesis = no timeout)
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_,r) => setTimeout(() => r(new Error("timeout")), ms))]);
}

async function callGroq(model, system, messages, maxTokens = 1200) {
  const c = await groq.chat.completions.create({
    model,
    temperature: 0.65,
    max_completion_tokens: maxTokens,
    messages: [{ role:"system", content:system||"" }, ...messages],
  });
  return c.choices?.[0]?.message?.content || "";
}

async function zenithMode(system, messages) {
  const r = await Promise.any([
    withTimeout(callGroq("meta-llama/llama-4-scout-17b-16e-instruct", system, messages, 1200), 14000),
    withTimeout(callGroq("llama-3.3-70b-versatile", system, messages, 1200), 14000),
  ]).catch(() => null);
  if (!r) throw new Error("All models timed out");
  return r;
}

async function zaithMode(system, messages) {
  return callGroq("meta-llama/llama-4-scout-17b-16e-instruct", system, messages, 2000);
}

async function zenoMode(system, messages) {
  // llama-3.3-70b — powerful, no chain-of-thought overhead
  return callGroq("llama-3.3-70b-versatile", system, messages, 3000);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-Devix-Key");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error:"Method not allowed" });
  try {
    const { system, messages, mode } = req.body;
    if (!messages || !Array.isArray(messages))
      return res.status(400).json({ error:"Invalid request body" });
    let text;
    if      (mode==="zeno"  || mode==="deep")  text = await zenoMode(system||"",   messages);
    else if (mode==="zaith")                   text = await zaithMode(system||"",  messages);
    else                                       text = await zenithMode(system||"", messages);
    return res.status(200).json({ text });
  } catch(err) {
    console.error("Devix:", err);
    return res.status(500).json({ error: err.message||"Server error" });
  }
}
