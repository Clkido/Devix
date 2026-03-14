// api/chat.js — Devix AI Multi-Model Collaborative Backend
//
// ZENITH (quick) — races Qwen vs Gemini Flash, fastest wins
// ZENO   (deep)  — runs all 4 models in parallel, synthesizes the best answer
//
// Models:
//   Qwen 3 235B          → OpenRouter
//   GPT-4.1              → GitHub Models
//   DeepSeek R1          → GitHub Models
//   Grok 3 Mini          → GitHub Models
//   Gemini 2.0 Flash     → Google AI

// ── API KEYS ─────────────────────────────────────────────────────────────────
const OPENROUTER_KEY    = "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";
const GITHUB_GROK_KEY   = "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";
const GITHUB_GPT_KEY    = "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";
const GITHUB_DEEPSEEK_KEY = "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";
const GEMINI_KEY        = "AIzaSyBK13mV4HCXS4ypDS9HzhtLE8GOowIbAI4";

const GITHUB_URL        = "https://models.inference.ai.azure.com/chat/completions";
const OPENROUTER_URL    = "https://openrouter.ai/api/v1/chat/completions";

// ── TIMEOUT HELPER ───────────────────────────────────────────────────────────
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── MODEL CALLERS ─────────────────────────────────────────────────────────────

// OpenRouter (Qwen)
async function callOpenRouter(model, system, messages, maxTokens) {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://devix.ai",
      "X-Title": "Devix AI",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`OpenRouter ${res.status}: ${e?.error?.message || "error"}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// GitHub Models (OpenAI-compatible — GPT-4.1, DeepSeek R1, Grok 3 Mini)
async function callGitHub(model, apiKey, system, messages, maxTokens) {
  const res = await fetch(GITHUB_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`GitHub/${model} ${res.status}: ${e?.error?.message || "error"}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// Google Gemini
async function callGemini(model, system, messages, maxTokens) {
  const geminiMessages = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: geminiMessages,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(`Gemini ${res.status}: ${e?.error?.message || "error"}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ── QUICK MODE: race Qwen vs Gemini Flash ─────────────────────────────────────
async function quickMode(system, messages) {
  const race = [
    withTimeout(
      callOpenRouter("qwen/qwen3-8b", system, messages, 1024),
      12000, "Qwen-quick"
    ),
    withTimeout(
      callGemini("gemini-2.0-flash", system, messages, 1024),
      12000, "Gemini-quick"
    ),
  ];

  // Return first successful response
  const result = await Promise.any(race).catch(() => null);
  if (result && result.trim()) return result;

  // If Promise.any fails (both errored), try GPT-4.1 as last resort
  return await withTimeout(
    callGitHub("gpt-4.1", GITHUB_GPT_KEY, system, messages, 1024),
    15000, "GPT-4.1-fallback"
  );
}

// ── DEEP MODE: all models in parallel → GPT-4.1 synthesizes ──────────────────
async function deepMode(system, messages) {
  const TIMEOUT = 22000;

  const runners = [
    { name: "Qwen 3 235B",    call: withTimeout(callOpenRouter("qwen/qwen3-235b-a22b", system, messages, 2048), TIMEOUT, "Qwen-deep") },
    { name: "GPT-4.1",        call: withTimeout(callGitHub("gpt-4.1", GITHUB_GPT_KEY, system, messages, 2048), TIMEOUT, "GPT4.1-deep") },
    { name: "DeepSeek R1",    call: withTimeout(callGitHub("DeepSeek-R1", GITHUB_DEEPSEEK_KEY, system, messages, 2048), TIMEOUT, "DeepSeek-deep") },
    { name: "Grok 3 Mini",    call: withTimeout(callGitHub("grok-3-mini", GITHUB_GROK_KEY, system, messages, 2048), TIMEOUT, "Grok-deep") },
    { name: "Gemini 2.0 Flash", call: withTimeout(callGemini("gemini-2.0-flash", system, messages, 2048), TIMEOUT, "Gemini-deep") },
  ];

  // Run all in parallel, collect results
  const settled = await Promise.allSettled(runners.map(r => r.call));
  const successes = settled
    .map((r, i) => ({ name: runners[i].name, text: r.status === "fulfilled" ? r.value : null }))
    .filter(r => r.text && r.text.trim().length > 40);

  if (successes.length === 0) {
    throw new Error("All models failed to respond. Check API keys and try again.");
  }

  // Only one succeeded — just return it
  if (successes.length === 1) return successes[0].text;

  // Multiple responses — synthesize into best answer using GPT-4.1
  const synthesisPrompt = `You are a synthesis engine. Multiple AI models answered the same coding question. Your job is to produce the SINGLE BEST COMPLETE answer by combining their strongest contributions. Do NOT mention the models by name or that you are synthesizing. Just deliver the ultimate answer.

ORIGINAL QUESTION:
${messages[messages.length - 1]?.content || ""}

MODEL RESPONSES:
${successes.map(r => `=== ${r.name} ===\n${r.text}`).join("\n\n")}

Produce the best single response now:`;

  try {
    const synthesized = await withTimeout(
      callGitHub("gpt-4.1", GITHUB_GPT_KEY,
        "You produce the single best answer by synthesizing multiple model responses. Output only the final answer, nothing else.",
        [{ role: "user", content: synthesisPrompt }],
        2048
      ),
      15000, "synthesis"
    );
    if (synthesized && synthesized.trim().length > 40) return synthesized;
  } catch (_) {
    // Synthesis failed — fall through to longest response
  }

  // Return longest successful response as final fallback
  return successes.sort((a, b) => b.text.length - a.text.length)[0].text;
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { system, messages, mode } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  try {
    const text = mode === "deep"
      ? await deepMode(system || "", messages)
      : await quickMode(system || "", messages);

    return res.status(200).json({ text });
  } catch (err) {
    console.error("Devix API error:", err);
    return res.status(500).json({ error: err.message || "Server error — try again" });
  }
}
