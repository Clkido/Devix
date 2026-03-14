# Devix AI — Deployment Guide

## Project Structure

```
devix-project/
├── api/
│   └── chat.js          ← Multi-model serverless proxy (all AI keys inside)
├── src/
│   ├── main.jsx         ← React entry point
│   └── App.jsx          ← Full Devix UI
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── README.md
```

---

## How the AI works

**Zenith (Quick mode)**
- Sends your message to **Qwen 3** and **Gemini Flash** at the same time
- Whichever responds first wins — you get the fastest possible answer
- Falls back to GPT-4.1 if both fail

**Zeno (Deep mode)**
- Sends your message to **all 5 models simultaneously**: Qwen 3 235B, GPT-4.1, DeepSeek R1, Grok 3 Mini, Gemini Flash
- Collects every response
- GPT-4.1 then **synthesizes** all answers into one perfect combined response

---

## How to deploy to Vercel (from GitHub)

### First time — set up GitHub repo

1. Go to **https://github.com** and sign in
2. Click **"New repository"** (top right, green button)
3. Name it `devix-ai`, set to **Public**, click **Create repository**
4. On your computer, install **Node.js** (https://nodejs.org, LTS version) and **Git** (https://git-scm.com)
5. Open a terminal (Windows: PowerShell or Command Prompt):

```bash
# Go to Desktop
cd Desktop

# Clone your new empty repo
git clone https://github.com/YOUR_USERNAME/devix-ai.git
cd devix-ai

# Copy all the files from the ZIP into this folder (drag them in)

# Push to GitHub
git add .
git commit -m "Initial Devix deploy"
git push origin main
```

### Connect to Vercel

1. Go to **https://vercel.com** and sign in with GitHub
2. Click **"Add New Project"**
3. Find and click **"Import"** next to your `devix-ai` repo
4. Leave all settings as default — Vercel auto-detects Vite
5. Click **"Deploy"**
6. Wait ~60 seconds — your site is live! 🎉

Your URL will be something like: `https://devix-ai-abc123.vercel.app`

---

## How to update your site later

Every time you change a file:

```bash
# Make sure you're in the devix-ai folder
git add .
git commit -m "Update"
git push
```

Vercel auto-deploys in ~60 seconds. Done!

---

## Login system

- **Sign Up**: Creates a new account saved in the browser (localStorage)
- **Sign In**: Validates against saved accounts
- Session is remembered — you stay logged in between visits
- Owner key is in **Settings** (⚙ gear icon) → "Owner Key" section
- Owner key: `sullyz`

---

## No API keys needed in Vercel

All API keys are already inside `api/chat.js`. You do NOT need to add any environment variables in Vercel — everything is already set up and ready to go.

---

## Cost estimate

- **Vercel hosting**: FREE forever (Hobby plan)
- **OpenRouter (Qwen)**: Pay per token, very cheap. $5 credit lasts months
- **GitHub Models (GPT-4.1, DeepSeek, Grok)**: Free tier with GitHub account
- **Google Gemini**: Free tier available

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Site shows blank page | Check browser console for errors |
| AI not responding | Check the `/api/chat` function logs in Vercel dashboard |
| Can't push to GitHub | Make sure you're in the right folder and ran `git add .` |
| Vercel build fails | Make sure `vite.config.js` is in root (not `vite_config.js`) |
