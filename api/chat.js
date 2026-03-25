// api/chat.js — Devix AI (Groq multi-model)

import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// timeout helper
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Model timeout")), ms)
    )
  ]);
}

// call Groq model
async function callGroq(model, system, messages, maxTokens = 1024) {

  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.7,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: system || "" },
      ...messages
    ]
  });

  return completion.choices?.[0]?.message?.content || "";
}


// QUICK MODE
// race Qwen vs Llama
async function quickMode(system, messages) {

  const race = [
    withTimeout(
      callGroq("qwen/qwen3-32b", system, messages),
      12000
    ),

    withTimeout(
      callGroq("meta-llama/llama-4-scout-17b-16e-instruct", system, messages),
      12000
    )
  ];

  const result = await Promise.any(race).catch(() => null);

  if (!result) throw new Error("Both models failed");

  return result;
}


// DEEP MODE
// run both models and combine answers
async function deepMode(system, messages) {

  const responses = await Promise.allSettled([

    callGroq("qwen/qwen3-32b", system, messages, 2048),

    callGroq("meta-llama/llama-4-scout-17b-16e-instruct", system, messages, 2048)

  ]);

  const answers = responses
    .filter(r => r.status === "fulfilled")
    .map(r => r.value)
    .filter(t => t && t.length > 40);

  if (answers.length === 0)
    throw new Error("No models responded");

  if (answers.length === 1)
    return answers[0];

  // combine answers
  const synthesisPrompt = `Combine the following AI responses into one clear best answer.

QUESTION:
${messages[messages.length-1]?.content}

RESPONSES:

${answers.join("\n\n---\n\n")}

Return the best single answer.`;


  const synth = await callGroq(
    "qwen/qwen3-32b",
    "You combine multiple AI answers into the best final answer.",
    [{ role:"user", content: synthesisPrompt }],
    2048
  );

  return synth;
}


// MAIN HANDLER

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");

  if (req.method === "OPTIONS")
    return res.status(200).end();

  if (req.method !== "POST")
    return res.status(405).json({ error:"Method not allowed" });

  try {

    const { system, messages, mode } = req.body;

    if (!messages || !Array.isArray(messages))
      return res.status(400).json({ error:"Invalid request body" });

    const text =
      mode === "deep"
        ? await deepMode(system || "", messages)
        : await quickMode(system || "", messages);

    return res.status(200).json({ text });

  }
  catch(err) {

    console.error("Devix error:", err);

    return res.status(500).json({
      error: err.message || "Server error"
    });

  }
}