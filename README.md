# 知乎回答批量导出工具

A two-phase toolkit for scraping all answer URLs from a Zhihu user's profile and exporting each answer's full text content as individual Markdown files.

---

## Overview

| Phase | Script | What it does |
|---|---|---|
| **1 — Collect URLs** | `zhihu_scrape_answers.js` | Run in Chrome console on a user's profile page; auto-paginates the API and downloads a `.txt` file of all answer URLs |
| **2 — Export Content** | `zhihu_export_answers/export.js` | Node.js CLI that reads the URL list, fetches each answer page, converts it to Markdown, and writes one `.md` file per answer |
| **3 — Visualize** | `generate_dashboard.js` | Scans exported `.md` files and generates an interactive GitHub-style contribution heatmap (`dashboard.html`) |

---

## Requirements

- **Google Chrome** (for Phase 1)
- **Node.js** v16 or later (for Phase 2)  
  Check with: `node --version`

---

## Phase 1 — Collect Answer URLs

This step collects every answer URL from a Zhihu user's public profile using the browser console. No extensions or installs needed.

### Steps

1. **Open Chrome** and navigate to the target user's Zhihu profile answers page, e.g.:
   ```
   https://www.zhihu.com/people/simon-zhang-14/answers
   ```
   Make sure you are **logged in** to Zhihu.

2. **Open DevTools** — press `F12` (or `Ctrl+Shift+J` on Windows / `Cmd+Option+J` on Mac) and click the **Console** tab.

3. **Paste the script** — open [`zhihu_scrape_answers.js`](./zhihu_scrape_answers.js), copy its entire contents, paste into the console, and press **Enter**.

4. **Watch the progress** — the console prints each page as it fetches:
   ```
   [Zhihu Scraper] ✅ User slug detected: "simon-zhang-14"
   [Zhihu Scraper] 🚀 Starting fetch loop...
   [Zhihu Scraper] 📄 Page 1: fetched 20 answers | running total: 20 / 948
   [Zhihu Scraper] 📄 Page 2: fetched 20 answers | running total: 40 / 948
   ...
   [Zhihu Scraper] 🎉 Done! Exported 948 answer URLs → "zhihu_answers_simon-zhang-14_948.txt"
   ```

5. **A `.txt` file downloads automatically** — one URL per line, named like:
   ```
   zhihu_answers_simon-zhang-14_948.txt
   ```

6. **Rename and place the file** — rename it to `answer_urls.txt` and put it here:
   ```
   知乎页面解析/
   └── answer_urls.txt      ← place it here
   ```

### How it works

The script calls Zhihu's internal API (`/api/v4/members/{slug}/answers`) in a loop with a 600ms delay between requests, reading `paging.is_end` to know when to stop. This is faster and more reliable than scroll simulation.

---

## Phase 2 — Export Answer Content to Markdown

This step fetches each answer page and converts the content to a Markdown file.

### Step 1 — Install dependencies

Open a terminal and run:

```powershell
cd "C:\Users\Shi Zhang\Downloads\知乎页面解析\zhihu_export_answers"
npm install
```

This installs 4 packages: `turndown`, `turndown-plugin-gfm`, `node-html-parser`, `fs-extra`.

---

### Step 2 — Get your Zhihu session cookie

The script fetches answer pages as you (a logged-in user) so that Zhihu serves the full content. You need to provide your session cookie.

1. Open Chrome and go to `https://www.zhihu.com` (make sure you're logged in)
2. Press `F12` to open DevTools → click the **Network** tab
3. Press `F5` to refresh the page
4. In the request list on the left, click the **first entry** (usually `www.zhihu.com`)
5. In the right panel, click **Headers**
6. Scroll down to **Request Headers**
7. Find the line that starts with `cookie:` — it will be a very long string like:
   ```
   _zap=abc123; d_c0=xyz...; z_c0=Mi4x...; ...
   ```
8. **Copy the entire value** (everything after `cookie: `)

> ⚠️ Keep your cookie private — it's equivalent to your login credentials.  
> If you get `HTTP 403` errors after a while, the cookie has expired; repeat these steps to get a fresh one.

---

### Step 3 — Configure the cookie

1. Copy the example environment file to `.env.local` (this file is git-ignored and will never be committed):

   ```powershell
   copy .env.example .env.local
   ```

2. Open `.env.local` and replace the placeholder with your actual cookie:

   ```
   ZHIHU_COOKIE=PASTE_YOUR_ZHIHU_COOKIE_HERE
   ```

   Paste the full cookie string from Step 2 after the `=` sign (no quotes needed for simple values; if your cookie contains special shell characters, wrap it in double quotes).

3. (Optional) Review `zhihu_export_answers/config.js` — all other settings use sensible defaults but you can tweak paths, delays, or retry behavior there.

---

### Step 4 — Run the exporter

```powershell
cd "C:\Users\Shi Zhang\Downloads\知乎页面解析\zhihu_export_answers"
node export.js
```

You'll see live progress:

```
╔══════════════════════════════════════════════════════╗
║       Zhihu Answer Batch Exporter                   ║
╚══════════════════════════════════════════════════════╝

  URL list : C:\...\answer_urls.txt
  Output   : C:\...\output\answers

  Found 948 URLs to process.
  Exporting 948 answers...

  [1/948]  ✅  为什么现在大多 Code Agent 的主形态是 CLI/TUI-2039328220789609488.md
  [2/948]  ✅  有没有感觉DeepSeek V4 Flash 和 Pro 感觉很难用-2038956661876990369.md
  ...
  [948/948] ✅  ...

══════════════════════════════════════════════════════
  Done in 847.3s
  ✅  Exported : 948
  Output folder: C:\...\output\answers
══════════════════════════════════════════════════════
```

You can also pass a custom URL file path as a CLI argument:

```powershell
node export.js "C:\path\to\my_other_list.txt"
```

---

### Step 5 — Check the output

Each answer produces one `.md` file in `output/answers/`:

**Filename format:** `{question-title}-{answer-id}.md`

**Example file content:**

```markdown
---
id: "2039328220789609488"
title: "为什么现在大多 Code Agent 的主形态是 CLI/TUI？"
author: "Simon Zhang"
type: zhihu-answer
source: "https://www.zhihu.com/question/2026125412049101416/answer/2039328220789609488"
created: "2026-05-17 12:55"
updated: "2026-05-17 12:55"
downloaded: "2026-05-20"
---

# 为什么现在大多 Code Agent 的主形态是 CLI/TUI？

再好的魔法杖对于麻瓜来说，它也只是一根木棍。当然在生成式AI大行其道的时代...
```

---

## Phase 3 — Generate Contribution Dashboard

After exporting your answers, generate an interactive GitHub-style contribution heatmap to visualize your writing activity over time.

```powershell
node generate_dashboard.js
```

This scans all exported `.md` files, extracts creation dates from front matter, and produces `dashboard.html` — a standalone page you can open in any browser.

### Dashboard features

- **Contribution heatmap** — GitHub-style green grid showing answer density per day, with year navigation
- **Summary stats** — total answers, active days, longest writing streak, most productive year and day
- **Interactive tooltips** — hover any square to see the exact date and count
- **Zero dependencies** — the generated HTML is fully self-contained with inline CSS/JS

> `dashboard.html` is listed in `.gitignore` since it contains your personal writing data. Generate it locally after each export.

---

## Resuming an Interrupted Export

Progress is saved to `output/answers/progress.json` **after every single file**. If the script is interrupted for any reason:

```powershell
# Just re-run — already-exported answers are automatically skipped
node export.js
```

Output:
```
Found 948 URLs to process.
Skipping 312 already-exported answers (resuming from progress.json).
Exporting 636 answers...
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `No cookie configured` error | Forgot to create `.env.local` | Copy `.env.example` to `.env.local` and paste your cookie |
| `No cookie configured` error | `.env.local` exists but `ZHIHU_COOKIE` is empty | Edit `.env.local` and paste the full cookie string |
| `HTTP 403` errors | Cookie expired or rate-limited | Get a fresh cookie from DevTools; or increase `delayMs` |
| `HTTP 403` with long wait | Zhihu rate limit triggered | Script auto-retries with 30s/60s/120s backoff — just wait |
| Empty `.md` files | Answer content not found in page | The answer may be behind a login wall or deleted |
| Phase 1 script stops early | API returned unexpected format | Check the console for error details; re-run |

---

## File Structure

```
知乎页面解析/
│
├── README.md                          ← you are here
├── .gitignore                         ← excludes secrets & generated files
├── .env.example                       ← template: copy to .env.local
├── .env.local                         ← YOUR COOKIE HERE (git-ignored, never commit)
├── answer_urls.txt                    ← Phase 1 output / Phase 2 input
├── generate_dashboard.js              ← Phase 3: generates dashboard.html
├── dashboard.html                     ← (git-ignored: your personal data)
│
├── zhihu_scrape_answers.js            ← Phase 1: Chrome console script
│
├── zhihu_export_answers/              ← Phase 2: Node.js CLI
│   ├── package.json
│   ├── config.js                      ← reads cookie from .env.local
│   ├── export.js                      ← main entry point
│   ├── fetcher.js                     ← HTTP with throttle + 403 retry
│   ├── extractor.js                   ← HTML → structured content
│   ├── converter.js                   ← HTML → Markdown (Zhihu rules)
│   └── writer.js                      ← file output + progress tracking
│
└── output/
    └── answers/                       ← (git-ignored: user-generated content)
        ├── progress.json              ← auto-generated; tracks progress
        └── *.md                       ← exported answer files
```

---

## Technical Notes

### Content extraction strategy

Each answer page is parsed with a **dual-source** approach (ported from the [download-zhihu](https://github.com/) Chrome extension):

1. **`<script id="js-initialData">` JSON** — Zhihu's server-side rendered state; usually the most complete version of the content
2. **`.RichContent-inner` DOM element** — fallback and cross-check

The longer of the two sources wins, ensuring truncated long answers are handled correctly.

### Markdown conversion rules

The HTML-to-Markdown converter handles Zhihu-specific elements:

| Zhihu element | Markdown output |
|---|---|
| Math formula `eeimg="1"` | `$LaTeX$` (inline) |
| Math formula `eeimg="2"` | `$$LaTeX$$` (block) |
| Code block with `lang` attr | ` ```lang ``` ` fenced block |
| HTML `<table>` | GFM Markdown table |
| `<figure>` with image | `![caption](url)` |
| Footnote `<sup data-text>` | `[^n]` with definitions at end |
| Video box `.video-box` | `[title](url)` link |
| Link card `.LinkCard` | `[title](url)` link |
| Zhihu catalog / reference list | *(skipped)* |

Images are kept as **remote URLs** (the original Zhihu CDN links) — they render in any Markdown viewer with internet access.
