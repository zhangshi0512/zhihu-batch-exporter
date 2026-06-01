# Zhihu Answer Batch Exporter / 知乎回答批量导出工具

A two-phase toolkit for scraping all answer URLs from a Zhihu user's profile and exporting each answer's full text content as individual Markdown files. After export, generate an interactive GitHub-style contribution heatmap to visualize writing activity.

一套两阶段工具：从知乎用户主页采集所有回答链接，再将每篇回答全文导出为独立的 Markdown 文件。导出后可生成交互式 GitHub 风格贡献热力图，可视化写作活跃度。

---

## Overview / 概述

| Phase / 阶段                      | Script / 脚本                    | What it does / 功能                                                                                                                                                                                                          |
| --------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Collect URLs / 采集链接**   | `zhihu_scrape_answers.js`        | Run in Chrome console on a user's profile page; auto-paginates the API and downloads a `.txt` file of all answer URLs / 在 Chrome 控制台运行，自动翻页采集 API 数据，下载全部回答链接的 `.txt` 文件                          |
| **2 — Export Content / 导出内容** | `zhihu_export_answers/export.js` | Node.js CLI that reads the URL list, fetches each answer page, converts it to Markdown, and writes one `.md` file per answer / Node.js 命令行工具，读取链接列表，抓取每篇回答页面，转换为 Markdown 格式，逐篇写入 `.md` 文件 |
| **3 — Visualize / 可视化**        | `generate_dashboard.js`          | Scans exported `.md` files and generates an interactive GitHub-style contribution heatmap (`dashboard.html`) / 扫描导出的 `.md` 文件，生成交互式 GitHub 风格贡献热力图                                                       |

---

## Requirements / 环境要求

- **Google Chrome** (for Phase 1 / 用于第一步)
- **Node.js** v16 or later (for Phase 2 / 用于第二步)  
  Check with / 检查命令: `node --version`

---

## Chrome Extension Side Panel / Chrome 扩展侧边栏

This project now includes an optional Chrome MV3 extension in `chrome_extension/`.
It replaces the manual console-copy workflow with Chrome's built-in side panel:

- Collect answer URLs from the active Zhihu `/people/...` profile tab.
- Display each collected answer with a question title and short answer preview.
- Fill missing answer previews on demand when Zhihu's profile API omits snippets.
- Cache collected URLs per user slug and merge newly collected URLs on later refreshes.
- Read the current Zhihu cookie through Chrome's `cookies` permission.
- Select all, select none, or uncheck individual answer URLs before export.
- Clear the cached URL list when you want to start over.
- Show progress bars while collecting URLs and exporting selected answers.
- Export selected answers as one Markdown `.zip` file through Chrome's download flow.

No localhost service, Native Messaging host, installer, or PowerShell setup command is required for the extension ZIP workflow.

### Load the extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `chrome_extension/` folder.
5. Open a Zhihu profile answers page, for example `https://www.zhihu.com/people/YOUR_USERNAME/answers`.
6. Click the extension icon to open the side panel.

### Extension workflow

1. Click **Collect / Refresh URLs**. Cached URLs are kept and newly discovered URLs are added with question titles and answer snippets when Zhihu returns them.
2. If many rows still lack snippets, click **Fill previews**. This fetches missing previews by answer ID and updates the cache.
3. Use **Select all**, **Select none**, or individual checkboxes to choose the export set. Use **Clear cache** when you want to start over.
4. Click **Download ZIP**. The side panel fetches selected answers, converts them to Markdown, packages them into one ZIP, and asks Chrome to download it. Chrome may show a save dialog depending on browser settings.

Note: Zhihu's profile answer count can be higher than the number returned by `/api/v4/members/{slug}/answers`. Deleted, hidden, anonymous, private, or otherwise unavailable answers may be included in the account-level count but not returned as exportable profile answer URLs.

---

## Phase 1 — Collect Answer URLs / 第一步 — 采集回答链接

This step collects every answer URL from a Zhihu user's public profile using the browser console. No extensions or installs needed.

此步骤通过浏览器控制台采集知乎用户公开主页的所有回答链接，无需安装任何扩展。

### Steps / 操作步骤

1. **Open Chrome** and navigate to the target user's Zhihu profile answers page, e.g. / **打开 Chrome**，进入目标用户的知乎个人主页回答页面，例如：

   ```
   https://www.zhihu.com/people/YOUR_USERNAME/answers
   ```

   Make sure you are **logged in** to Zhihu. / 确保已**登录**知乎。

2. **Open DevTools** — press `F12` (or `Ctrl+Shift+J` on Windows / `Cmd+Option+J` on Mac) and click the **Console** tab. / **打开开发者工具** — 按 `F12`（Windows 下 `Ctrl+Shift+J`，Mac 下 `Cmd+Option+J`），点击 **Console** 标签。

3. **Paste the script** — open [`zhihu_scrape_answers.js`](./zhihu_scrape_answers.js), copy its entire contents, paste into the console, and press **Enter**. / **粘贴脚本** — 打开 [`zhihu_scrape_answers.js`](./zhihu_scrape_answers.js)，复制全部内容，粘贴到控制台中，按 **回车**。

4. **Watch the progress** — the console prints each page as it fetches / **观察进度** — 控制台会逐页打印进度：

   ```
   [Zhihu Scraper] ✅ User slug detected: "YOUR_USERNAME"
   [Zhihu Scraper] 🚀 Starting fetch loop...
   [Zhihu Scraper] 📄 Page 1: fetched 20 answers | running total: 20 / 948
   [Zhihu Scraper] 📄 Page 2: fetched 20 answers | running total: 40 / 948
   ...
   [Zhihu Scraper] 🎉 Done! Exported 948 answer URLs → "zhihu_answers_YOUR_USERNAME_948.txt"
   ```

5. **A `.txt` file downloads automatically** — one URL per line, named like / **自动下载 `.txt` 文件** — 每行一个链接，文件名为：

   ```
   zhihu_answers_YOUR_USERNAME_948.txt
   ```

6. **Rename and place the file** — rename it to `answer_urls.txt` and put it in the project root / **重命名并放置文件** — 重命名为 `answer_urls.txt`，放入项目根目录：
   ```
   zhihu-batch-exporter/
   └── answer_urls.txt      ← place it here / 放在这里
   ```

### How it works / 工作原理

The script calls Zhihu's internal API (`/api/v4/members/{slug}/answers`) in a loop with a 600ms delay between requests, reading `paging.is_end` to know when to stop. This is faster and more reliable than scroll simulation.

脚本循环调用知乎内部 API（`/api/v4/members/{slug}/answers`），每次请求间隔 600ms，通过读取 `paging.is_end` 判断何时停止。相比模拟滚动，这种方式更快、更可靠。

---

## Phase 2 — Export Answer Content to Markdown / 第二步 — 导出回答内容为 Markdown

This step fetches each answer page and converts the content to a Markdown file.

此步骤抓取每篇回答页面，将内容转换为 Markdown 文件。

### Step 1 — Install dependencies / 安装依赖

Open a terminal and run / 打开终端运行：

```powershell
cd zhihu_export_answers
npm install
```

This installs 4 packages: `turndown`, `turndown-plugin-gfm`, `node-html-parser`, `fs-extra`. / 安装 4 个依赖包。

---

### Step 2 — Get your Zhihu session cookie / 获取知乎会话 Cookie

The script fetches answer pages as you (a logged-in user) so that Zhihu serves the full content. You need to provide your session cookie.

脚本以登录用户身份抓取回答页面，知乎才会返回完整内容。你需要提供会话 Cookie。

1. Open Chrome and go to `https://www.zhihu.com` (make sure you're logged in) / 打开 Chrome，进入 `https://www.zhihu.com`（确保已登录）
2. Press `F12` to open DevTools → click the **Network** tab / 按 `F12` 打开开发者工具 → 点击 **Network** 标签
3. Press `F5` to refresh the page / 按 `F5` 刷新页面
4. In the request list on the left, click the **first entry** (usually `www.zhihu.com`) / 在左侧请求列表中，点击**第一条**（通常是 `www.zhihu.com`）
5. In the right panel, click **Headers** / 在右侧面板中点击 **Headers**
6. Scroll down to **Request Headers** / 向下滚动找到 **Request Headers**
7. Find the line that starts with `cookie:` — it will be a very long string like / 找到以 `cookie:` 开头的行 — 这是一串很长的文本：
   ```
   _zap=abc123; d_c0=xyz...; z_c0=Mi4x...; ...
   ```
8. **Copy the entire value** (everything after `cookie: `) / **复制全部内容**

> **⚠️ Keep your cookie private** — it's equivalent to your login credentials. If you get `HTTP 403` errors after a while, the cookie has expired; repeat these steps to get a fresh one.
>
> **⚠️ 请妥善保管 Cookie** — 它等同于登录凭证。如果一段时间后出现 `HTTP 403` 错误，说明 Cookie 已过期，重复以上步骤获取新的即可。

---

### Step 3 — Configure the cookie / 配置 Cookie

1. Copy the example environment file to `.env.local` (this file is git-ignored and will never be committed) / 复制示例环境文件为 `.env.local`（此文件已加入 `.gitignore`，不会被提交到 Git）：

   ```powershell
   copy .env.example .env.local
   ```

2. Open `.env.local` and replace the placeholder with your actual cookie / 打开 `.env.local`，将占位符替换为真实 Cookie：

   ```
   ZHIHU_COOKIE=PASTE_YOUR_ZHIHU_COOKIE_HERE
   ```

3. (Optional) Review `zhihu_export_answers/config.js` — all other settings use sensible defaults but you can tweak paths, delays, or retry behavior there. / （可选）查看 `zhihu_export_answers/config.js` — 其他设置均已配置合理默认值，可按需调整路径、延迟或重试策略。

---

### Step 4 — Run the exporter / 运行导出

```powershell
cd zhihu_export_answers
node export.js
```

You'll see live progress / 将看到实时进度：

```
╔══════════════════════════════════════════════════════╗
║       Zhihu Answer Batch Exporter                   ║
╚══════════════════════════════════════════════════════╝

  URL list : ...\answer_urls.txt
  Output   : ...\output\answers

  Found 948 URLs to process.
  Exporting 948 answers...

  [1/948]  ✅  示例问题标题-1234567890123456789.md
  [2/948]  ✅  另一个示例问题-9876543210987654321.md
  ...
  [948/948] ✅  ...

══════════════════════════════════════════════════════
  Done in 847.3s
  ✅  Exported : 948
  Output folder: ...\output\answers
══════════════════════════════════════════════════════
```

You can also pass a custom URL file path as a CLI argument / 也可通过命令行参数传入自定义链接文件：

```powershell
node export.js "C:\path\to\my_other_list.txt"
```

---

### Step 5 — Check the output / 查看输出

Each answer produces one `.md` file in `output/answers/` / 每篇回答在 `output/answers/` 目录下生成一个 `.md` 文件：

**Filename format / 文件命名:** `{question-title}-{answer-id}.md`

**Example file content / 文件内容示例:**

```markdown
---
id: "1234567890123456789"
title: "如何系统学习机器学习？"
author: "Your Name"
type: zhihu-answer
source: "https://www.zhihu.com/question/1234567890123456789/answer/1234567890123456789"
created: "2026-05-17 12:55"
updated: "2026-05-17 12:55"
downloaded: "2026-05-20"
---

# 如何系统学习机器学习？

这是我的回答正文内容，包含了个人对机器学习学习路径的理解和建议...
```

---

## Phase 3 — Generate Contribution Dashboard / 第三步 — 生成贡献热力图

After exporting your answers, generate an interactive GitHub-style contribution heatmap to visualize your writing activity over time.

导出回答后，可生成交互式 GitHub 风格贡献热力图，可视化你的写作活跃度。

```powershell
node generate_dashboard.js
```

This scans all exported `.md` files, extracts creation dates from front matter, and produces `dashboard.html` — a standalone page you can open in any browser.

此脚本扫描所有导出的 `.md` 文件，从 YAML front matter 中提取创建日期，生成 `dashboard.html` — 一个可在任何浏览器中打开的独立页面。

### Dashboard features / 仪表盘功能

- **Contribution heatmap / 贡献热力图** — GitHub-style green grid showing answer density per day, with year navigation / GitHub 风格绿色网格展示每日回答密度，支持年份切换
- **Summary stats / 统计概览** — total answers, active days, longest writing streak, most productive year and day / 总回答数、活跃天数、最长连续写作天数、最高产年份和日期
- **Interactive tooltips / 交互提示** — hover any square to see the exact date and count / 悬停任意方块查看具体日期和回答数
- **Click-to-expand popup / 点击展开弹窗** — click any day cell to see a list of answers with question titles and content previews / 点击日期方块弹出回答列表，显示问题标题和内容预览
- **Zero dependencies / 零依赖** — the generated HTML is fully self-contained with inline CSS/JS / 生成的 HTML 完全自包含，内联 CSS 和 JS

> `dashboard.html` is listed in `.gitignore` since it contains your personal writing data. Generate it locally after each export.
>
> `dashboard.html` 已加入 `.gitignore`，因为它包含个人写作数据。每次导出后在本地生成即可。

---

## Resuming an Interrupted Export / 恢复中断的导出

Progress is saved to `output/answers/progress.json` **after every single file**. If the script is interrupted for any reason:

进度在**每完成一个文件后**保存至 `output/answers/progress.json`。如果脚本因任何原因中断：

```powershell
# Just re-run — already-exported answers are automatically skipped
# 重新运行即可 — 已导出的回答会自动跳过
node export.js
```

Output / 输出：

```
Found 948 URLs to process.
Skipping 312 already-exported answers (resuming from progress.json).
Exporting 636 answers...
```

---

## Troubleshooting / 故障排除

| Problem / 问题                                      | Likely cause / 可能原因                                                                   | Fix / 解决方法                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `No cookie configured` error / 提示未配置 Cookie    | Forgot to create `.env.local` / 忘记创建 `.env.local`                                     | Copy `.env.example` to `.env.local` and paste your cookie / 复制 `.env.example` 为 `.env.local` 并填入 Cookie |
| `No cookie configured` error / 提示未配置 Cookie    | `.env.local` exists but `ZHIHU_COOKIE` is empty / `.env.local` 存在但 `ZHIHU_COOKIE` 为空 | Edit `.env.local` and paste the full cookie string / 编辑 `.env.local` 填入完整 Cookie                        |
| `HTTP 403` errors / HTTP 403 错误                   | Cookie expired or rate-limited / Cookie 过期或触发限流                                    | Get a fresh cookie from DevTools; or increase `delayMs` / 获取新 Cookie，或增大 `delayMs` 延迟                |
| `HTTP 403` with long wait / HTTP 403 伴随长时间等待 | Zhihu rate limit triggered / 触发知乎限流                                                 | Script auto-retries with 30s/60s/120s backoff — just wait / 脚本自动以 30s/60s/120s 退避重试，耐心等待        |
| Empty `.md` files / `.md` 文件为空                  | Answer content not found in page / 页面中未找到回答内容                                   | The answer may be behind a login wall or deleted / 该回答可能需登录查看或已被删除                             |
| Phase 1 script stops early / 第一步脚本提前停止     | API returned unexpected format / API 返回了非预期格式                                     | Check the console for error details; re-run / 检查控制台错误详情，重新运行                                    |

---

## File Structure / 文件结构

```
zhihu-batch-exporter/
│
├── README.md                          ← original README / 原始 README
├── README-bilingual.md                ← bilingual version / 双语版本
├── .gitignore                         ← excludes secrets & generated files / 排除敏感信息和生成文件
├── .env.example                       ← template: copy to .env.local / 模板文件
├── .env.local                         ← YOUR COOKIE HERE (git-ignored, never commit) / 在此填入 Cookie
├── answer_urls.txt                    ← Phase 1 output / Phase 2 input / 第一步输出，第二步输入
├── generate_dashboard.js              ← Phase 3: generates dashboard.html / 第三步：生成热力图
├── dashboard.html                     ← (git-ignored: your personal data) / 个人数据，不上传
│
├── chrome_extension/                  ← Chrome MV3 side panel extension / Chrome 侧边栏扩展
│   ├── manifest.json
│   ├── background.js                  ← side panel behavior + cookie access / 侧边栏与 Cookie 访问
│   ├── side_panel.html
│   ├── side_panel.css
│   └── side_panel.js                  ← URL cache, selection, ZIP export / 链接缓存、选择、ZIP 导出
│
├── zhihu_scrape_answers.js            ← Phase 1: Chrome console script / 第一步：浏览器控制台脚本
│
├── zhihu_export_answers/              ← Phase 2: Node.js CLI / 第二步：Node.js 命令行工具
│   ├── package.json
│   ├── config.js                      ← reads cookie from .env.local / 从 .env.local 读取 Cookie
│   ├── export.js                      ← main entry point / 主入口
│   ├── fetcher.js                     ← HTTP with throttle + 403 retry / HTTP 请求与限流重试
│   ├── extractor.js                   ← HTML → structured content / HTML 转结构化内容
│   ├── converter.js                   ← HTML → Markdown (Zhihu rules) / HTML 转 Markdown
│   └── writer.js                      ← file output + progress tracking / 文件写入与进度跟踪
│
└── output/
    └── answers/                       ← (git-ignored: user-generated content) / 用户生成内容，不上传
        ├── progress.json              ← auto-generated; tracks progress / 自动生成，记录进度
        └── *.md                       ← exported answer files / 导出的回答文件
```

---

## Technical Notes / 技术说明

### Content extraction strategy / 内容提取策略

Each answer page is parsed with a **dual-source** approach (ported from the [download-zhihu](https://github.com/) Chrome extension):

每篇回答页面采用**双源**解析策略（移植自 [download-zhihu](https://github.com/) Chrome 扩展）：

1. **`<script id="js-initialData">` JSON** — Zhihu's server-side rendered state; usually the most complete version of the content / 服务端渲染的数据；通常是最完整的内容版本
2. **`.RichContent-inner` DOM element** — fallback and cross-check / 兜底与交叉校验

The longer of the two sources wins, ensuring truncated long answers are handled correctly. / 取两者中较长者，确保正确处理被截断的长回答。

### Markdown conversion rules / Markdown 转换规则

The HTML-to-Markdown converter handles Zhihu-specific elements / HTML 转 Markdown 转换器处理知乎特有元素：

| Zhihu element / 知乎元素                           | Markdown output / Markdown 输出             |
| -------------------------------------------------- | ------------------------------------------- |
| Math formula `eeimg="1"` / 行内公式                | `$LaTeX$` (inline / 行内)                   |
| Math formula `eeimg="2"` / 块级公式                | `$$LaTeX$$` (block / 块级)                  |
| Code block with `lang` attr / 带语言标注的代码块   | ` ```lang ``` ` fenced block / 围栏代码块   |
| HTML `<table>` / HTML 表格                         | GFM Markdown table / GFM Markdown 表格      |
| `<figure>` with image / 带图片的 `<figure>`        | `![caption](url)`                           |
| Footnote `<sup data-text>` / 脚注                  | `[^n]` with definitions at end / 末尾附定义 |
| Video box `.video-box` / 视频框                    | `[title](url)` link / 链接                  |
| Link card `.LinkCard` / 链接卡片                   | `[title](url)` link / 链接                  |
| Zhihu catalog / reference list / 知乎目录/参考文献 | _(skipped / 跳过)_                          |

Images are kept as **remote URLs** (the original Zhihu CDN links) — they render in any Markdown viewer with internet access. / 图片保留为**远程链接**（原始知乎 CDN 地址），在任何有网络的 Markdown 阅读器中均可渲染。

---

## License / 许可

MIT
_（内容由AI生成，仅供参考）_
