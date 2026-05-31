/**
 * Zhihu Answer URL Scraper
 * ========================
 * Run this in Chrome DevTools Console while on any Zhihu user profile page,
 * e.g. https://www.zhihu.com/people/simon-zhang-14  (or /answers)
 *
 * It will:
 *   1. Detect the user slug from the current URL
 *   2. Call Zhihu's internal API in a loop to fetch all answer pages
 *   3. Collect every answer URL
 *   4. Download a .txt file with all URLs (one per line) when done
 *
 * No extensions needed — just paste & press Enter.
 */

(async function scrapeZhihuAnswers() {

  // ── 1. Extract user slug from current URL ─────────────────────────────────
  const pathMatch = window.location.pathname.match(/\/people\/([^\/]+)/);
  if (!pathMatch) {
    console.error('[Zhihu Scraper] ❌ Not on a Zhihu /people/ page. Navigate to a user profile first.');
    return;
  }
  const userSlug = pathMatch[1];
  console.log(`[Zhihu Scraper] ✅ User slug detected: "${userSlug}"`);

  // ── 2. Configuration ───────────────────────────────────────────────────────
  const LIMIT        = 20;          // answers per request (Zhihu max is 20)
  const DELAY_MS     = 600;         // ms to wait between requests (be polite)
  const INCLUDE      = 'data[*].id,data[*].question.id';
  // ^ minimal fields — keeps response small and avoids triggering rate limits

  const allUrls  = [];
  let   offset   = 0;
  let   pageNum  = 1;
  let   isEnd    = false;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ── 3. Fetch loop ──────────────────────────────────────────────────────────
  console.log('[Zhihu Scraper] 🚀 Starting fetch loop...');

  while (!isEnd) {
    const apiUrl =
      `/api/v4/members/${encodeURIComponent(userSlug)}/answers` +
      `?include=${encodeURIComponent(INCLUDE)}` +
      `&offset=${offset}` +
      `&limit=${LIMIT}` +
      `&sort_by=created`;

    let data;
    try {
      const resp = await fetch(apiUrl, {
        credentials: 'include',   // send cookies so Zhihu treats us as logged-in
        headers: { 'X-Requested-With': 'Fetch' }
      });

      if (!resp.ok) {
        console.error(`[Zhihu Scraper] ❌ HTTP ${resp.status} on page ${pageNum}. Stopping.`);
        break;
      }

      data = await resp.json();
    } catch (err) {
      console.error(`[Zhihu Scraper] ❌ Network error on page ${pageNum}:`, err);
      break;
    }

    // ── 4. Collect URLs from this page ───────────────────────────────────────
    const answers = data.data || [];
    const pageUrls = answers.map(a => {
      if (a.question && a.question.id) {
        return `https://www.zhihu.com/question/${a.question.id}/answer/${a.id}`;
      }
      return null;
    }).filter(Boolean);
    allUrls.push(...pageUrls);

    isEnd = data.paging?.is_end ?? true;
    const totalRemote = data.paging?.totals ?? '?';

    console.log(
      `[Zhihu Scraper] 📄 Page ${pageNum}: fetched ${pageUrls.length} answers` +
      ` | running total: ${allUrls.length} / ${totalRemote}` +
      (isEnd ? ' | ✅ LAST PAGE' : '')
    );

    // ── 5. Advance to next page ───────────────────────────────────────────────
    offset  += LIMIT;
    pageNum += 1;

    if (!isEnd) {
      await sleep(DELAY_MS);
    }
  }

  // ── 6. Export as .txt file ────────────────────────────────────────────────
  if (allUrls.length === 0) {
    console.warn('[Zhihu Scraper] ⚠️ No URLs collected. Nothing to export.');
    return;
  }

  const fileContent = allUrls.join('\n');
  const blob        = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
  const blobUrl     = URL.createObjectURL(blob);

  const anchor      = document.createElement('a');
  anchor.href       = blobUrl;
  anchor.download   = `zhihu_answers_${userSlug}_${allUrls.length}.txt`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Release the object URL after a short delay
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

  console.log(
    `[Zhihu Scraper] 🎉 Done! Exported ${allUrls.length} answer URLs` +
    ` → "${anchor.download}"`
  );

})();
