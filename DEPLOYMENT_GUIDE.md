# AutomAIO Free Cloud Deployment Guide

This guide explains how to deploy AutomAIO for **₹0 / completely free** with long-running server-side execution, WebSockets, and shareable random session URLs.

---

## 1. Why Serverless (Vercel / Netlify / AWS Lambda) Does NOT Work

You mentioned Vercel. Here is the technical reason browser automation platforms cannot run on Vercel:

| Requirement | Vercel / Netlify Serverless | AutomAIO Needs |
|---|---|---|
| **Execution Duration** | 10–60 second hard timeout | Flows can take 2–10 minutes |
| **Persistent WebSockets** | ❌ Disconnected after request | ✅ Persistent CDP screencast stream |
| **Headless Chromium** | ❌ 50MB function limit (Chromium is 200MB+) | ✅ Full Playwright Chromium browser |
| **Persistent Background Process** | ❌ Ephemeral (dies immediately) | ✅ Long-running browser instance |

---

## 2. Best Free Platforms for AutomAIO (100% Free with Docker & WebSockets)

Here are the top platforms that give you a **free persistent container** with Playwright and WebSockets:

### Option 1: Hugging Face Spaces (Docker) — 🌟 RECOMMENDED
- **Cost**: **100% Free Forever**
- **Resources**: **2 vCPUs, 16 GB RAM, 50 GB Storage** (Most generous free tier in the industry).
- **WebSockets & CDP**: Fully supported.
- **Public URL**: Free `https://<your-username>-automaio.hf.space` with automatic SSL.
- **How to Deploy**:
  1. Go to [huggingface.co/new-space](https://huggingface.co/new-space).
  2. Name your space (e.g. `automaio`).
  3. Select **Docker** as SDK (Blank).
  4. Push this repository or upload the files (`Dockerfile`, `package.json`, `src/`).
  5. It builds automatically in 2 minutes and gives you a live public URL!

### Option 2: Render.com (Free Web Service)
- **Cost**: Free (750 hours/month).
- **Resources**: 512 MB RAM.
- **How to Deploy**:
  1. Connect your GitHub repository on [render.com](https://render.com).
  2. Select **Web Service** $\to$ Environment: **Docker**.
  3. Set Port to `3000`.

### Option 3: Koyeb
- **Cost**: Free tier (512MB RAM micro container, always on).
- **How to Deploy**: Connect GitHub $\to$ select Dockerfile $\to$ Deploy.

### Option 4: Oracle Cloud Infrastructure (OCI) Always-Free VM
- **Cost**: **100% Free Forever**
- **Resources**: 4 Ampere ARM cores, **24 GB RAM**, 200 GB disk.
- **How to Deploy**: Run `docker compose up -d` on your free Ubuntu VM.

---

## 3. How the Random Shareable Session URL Works

Every time an automation task or handoff is triggered, AutomAIO generates a **unique, cryptographically random shareable URL**:

```
https://your-domain.com/session/sess_c3f910a27e8d?token=tok_8a14b09c21ef
```

### Key Features:
1. **Isolated Stream**: Only the browser instance belonging to that specific user/session is streamed to this URL.
2. **One-Click Mobile Access**: When a CAPTCHA or OTP occurs, the user receives this link (via WhatsApp, Telegram, or push). Opening it on mobile lets them view the screen, solve the challenge, and tap **"✓ Done — Resume Automation"**.
3. **Automatic TTL Expiration**: Session links automatically expire after completion or after a configurable timeout (default 30 minutes).
