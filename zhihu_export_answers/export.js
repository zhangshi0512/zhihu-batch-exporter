/**
 * export.js — Main CLI entry point
 * ==================================
 * Usage:
 *   node export.js [path/to/answer_urls.txt]
 *
 * If no argument is given, uses `urlListFile` from config.js.
 *
 * Reads URLs from the text file (one per line), fetches each answer page,
 * extracts content, converts to Markdown, and writes individual .md files.
 *
 * Progress is saved to output/answers/progress.json after each successful
 * export — interrupt and re-run at any time to resume.
 */

'use strict';

const path = require('path');
const fse = require('fs-extra');
const config = require('./config');
const { throttledFetch } = require('./fetcher');
const { extractAnswer } = require('./extractor');
const { htmlToMarkdown } = require('./converter');
const { loadProgress, saveProgress, writeAnswer, OUTPUT_DIR } = require('./writer');

// ── Validate config ───────────────────────────────────────────────────────────

function validateConfig() {
  if (!config.cookie || config.cookie === 'PASTE_YOUR_ZHIHU_COOKIE_HERE') {
    console.error('');
    console.error('❌  ERROR: No cookie configured.');
    console.error('');
    console.error('   Please open zhihu_export_answers/config.js');
    console.error('   and follow the instructions to paste your Zhihu session cookie.');
    console.error('');
    process.exit(1);
  }
}

// ── Load URL list ─────────────────────────────────────────────────────────────

async function loadUrlList(filePath) {
  const absPath = path.resolve(__dirname, filePath);
  if (!(await fse.pathExists(absPath))) {
    console.error(`❌  URL list file not found: ${absPath}`);
    console.error('   Make sure the file exists, or pass the correct path as a CLI argument.');
    process.exit(1);
  }

  const text = await fse.readFile(absPath, 'utf8');
  const urls = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.startsWith('http'));

  if (urls.length === 0) {
    console.error(`❌  No valid URLs found in ${absPath}`);
    process.exit(1);
  }

  return urls;
}

// ── Process one URL ───────────────────────────────────────────────────────────

async function processUrl(url, index, total) {
  const label = `[${index}/${total}]`;

  let pageHtml;
  try {
    pageHtml = await throttledFetch(url, {
      onRetry: (attempt, max, waitMs) => {
        console.log(`  ${label} 🔄 Retry ${attempt}/${max} after ${waitMs / 1000}s...`);
      },
    });
  } catch (err) {
    console.error(`  ${label} ✗ Fetch failed: ${err.message}`);
    return { success: false, url, error: err.message };
  }

  const data = extractAnswer(url, pageHtml);
  if (!data) {
    console.warn(`  ${label} ⚠️  Could not extract content from: ${url}`);
    return { success: false, url, error: 'extraction failed' };
  }

  const markdown = htmlToMarkdown(data.html);
  if (!markdown) {
    console.warn(`  ${label} ⚠️  Markdown conversion produced empty output for: ${url}`);
    return { success: false, url, error: 'empty markdown' };
  }

  let filename;
  try {
    filename = await writeAnswer(data, markdown);
  } catch (err) {
    console.error(`  ${label} ✗ Write failed: ${err.message}`);
    return { success: false, url, error: err.message };
  }

  console.log(`  ${label} ✅  ${filename}`);
  return { success: true, url, filename };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  validateConfig();

  // Determine URL list file path
  const urlListArg = process.argv[2];
  const urlListPath = urlListArg
    ? path.resolve(process.cwd(), urlListArg)
    : path.resolve(__dirname, config.urlListFile);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       Zhihu Answer Batch Exporter                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  URL list : ${urlListPath}`);
  console.log(`  Output   : ${OUTPUT_DIR}`);
  console.log('');

  // Load URL list
  const urls = await loadUrlList(urlListPath);
  console.log(`  Found ${urls.length} URLs to process.`);

  // Load progress (for resumability)
  const progress = await loadProgress();
  const exportedSet = new Set(progress.exported);
  const failedSet = new Set(progress.failed.map((f) => f.url));

  const skipped = urls.filter((u) => exportedSet.has(u)).length;
  const todo = urls.filter((u) => !exportedSet.has(u));

  if (skipped > 0) {
    console.log(`  Skipping ${skipped} already-exported answers (resuming from progress.json).`);
  }
  console.log(`  Exporting ${todo.length} answers...`);
  console.log('');

  const startTime = Date.now();
  let successCount = 0;
  let failCount = 0;
  const newFailed = [];

  for (let i = 0; i < todo.length; i++) {
    const url = todo[i];
    const globalIndex = skipped + i + 1;
    const result = await processUrl(url, globalIndex, urls.length);

    if (result.success) {
      successCount++;
      exportedSet.add(url);
      progress.exported.push(url);
      // Remove from failed list if it was there before
      progress.failed = progress.failed.filter((f) => f.url !== url);
    } else {
      failCount++;
      newFailed.push({ url, error: result.error });
      if (!failedSet.has(url)) {
        progress.failed.push({ url, error: result.error });
      }
    }

    // Save progress after every item (so we can always resume)
    await saveProgress(progress);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Done in ${elapsed}s`);
  console.log(`  ✅  Exported : ${successCount}`);
  if (skipped > 0) {
    console.log(`  ⏭️  Skipped  : ${skipped} (already done)`);
  }
  if (failCount > 0) {
    console.log(`  ❌  Failed   : ${failCount}`);
    console.log('');
    console.log('  Failed URLs:');
    newFailed.forEach((f) => console.log(`    - ${f.url}  (${f.error})`));
    console.log('');
    console.log(
      '  Tip: Failed URLs are saved in progress.json.\n' +
        '  Fix the issue (e.g. refresh your cookie) and re-run to retry them.'
    );
  }
  console.log(`  Output folder: ${OUTPUT_DIR}`);
  console.log('══════════════════════════════════════════════════════');
  console.log('');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
