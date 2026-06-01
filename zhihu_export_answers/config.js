/**
 * config.js — User configuration
 * ================================
 *
 * IMPORTANT: Your Zhihu cookie is stored in `.env.local` (at project root),
 * NOT in this file. See README.md for setup instructions.
 *
 * HOW TO GET YOUR ZHIHU SESSION COOKIE FROM CHROME
 * -------------------------------------------------
 * 1. Open Chrome and go to https://www.zhihu.com
 * 2. Make sure you are logged in to your Zhihu account
 * 3. Press F12 to open DevTools
 * 4. Click the "Network" tab
 * 5. Refresh the page (press F5)
 * 6. In the Network list, click on the very first request
 *    (it will be named "www.zhihu.com" or similar)
 * 7. In the right panel, click "Headers"
 * 8. Scroll down to find the "Request Headers" section
 * 9. Find the line that starts with "cookie:"
 * 10. Copy the ENTIRE value after "cookie:" — it will be a very
 *     long string containing many key=value pairs separated by semicolons
 * 11. Paste it into `.env.local` as the value of `ZHIHU_COOKIE=`
 *
 * IMPORTANT:
 * - `.env.local` is git-ignored and will never be committed to your repo
 * - Keep your cookie private — it's your session credential
 * - If you get 403 errors after a while, your cookie may have expired;
 *   repeat the steps above to get a fresh one
 */

const fs = require('fs');
const path = require('path');

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, 'utf8');
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadLocalEnv(path.resolve(__dirname, '../.env.local'));

module.exports = {
  // ── Zhihu cookie (read from .env.local, never commit to Git) ─────────────
  cookie: process.env.ZHIHU_COOKIE,

  // ── Input: path to the .txt file with answer URLs (one per line) ──────────
  // Can be an absolute path or relative to this directory
  urlListFile: '../answer_urls.txt',

  // ── Output: directory where .md files will be written ─────────────────────
  outputDir: '../output/answers',

  // ── Request throttling ────────────────────────────────────────────────────
  // Minimum delay between HTTP requests in milliseconds.
  // 800ms is a safe default for batch requests to Zhihu.
  delayMs: 800,

  // Initial backoff in ms when a 403 is received (doubles on each retry)
  // 30s → 60s → 120s
  retryBackoffMs: 30000,

  // Maximum number of 403 retries per URL
  maxRetries: 3,

  // ── Output options ────────────────────────────────────────────────────────
  // Include YAML front matter at the top of each .md file
  includeFrontMatter: true,
};
