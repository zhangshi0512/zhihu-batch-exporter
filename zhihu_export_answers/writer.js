/**
 * writer.js — File system output + progress tracking
 * ====================================================
 * Ported from:
 *   - content/export-utils.js › buildFrontmatter(), sanitizeFilename()
 *
 * Responsibilities:
 *   - Build YAML front matter
 *   - Sanitize filenames:  {question-title}-{answer-id}.md
 *   - Write .md files to the output directory
 *   - Maintain progress.json (for resumability after interruption)
 */

'use strict';

const path = require('path');
const fse = require('fs-extra');
const config = require('./config');

// Resolve output directory relative to this file
const OUTPUT_DIR = path.resolve(__dirname, config.outputDir);
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'progress.json');

// ── Front matter ──────────────────────────────────────────────────────────────

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildFrontMatter(data) {
  const escape = (s) => String(s || '').replace(/"/g, '\\"');
  const lines = [
    '---',
    `id: "${escape(data.answerId)}"`,
    `title: "${escape(data.title)}"`,
    `author: "${escape(data.author)}"`,
    `type: zhihu-answer`,
    `source: "${escape(data.url)}"`,
  ];

  const created = formatTimestamp(data.createdTime);
  const updated = formatTimestamp(data.updatedTime);
  if (created) lines.push(`created: "${created}"`);
  if (updated) lines.push(`updated: "${updated}"`);

  const today = new Date().toISOString().split('T')[0];
  lines.push(`downloaded: "${today}"`);
  lines.push('---', '');

  return lines.join('\n');
}

// ── Filename sanitizer ────────────────────────────────────────────────────────

/**
 * Sanitize a string for use as a filename component.
 * Ported from export-utils.js › sanitizeFilename()
 */
function sanitizePart(name) {
  return name
    .replace(/<[^>]*>/g, '')                             // strip HTML tags
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD\u0000-\u001F\u007F]/g, '') // invisible chars
    .replace(/[\\/:*?"<>|#^\[\]()（）【】]/g, '')          // forbidden filename chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);                                        // cap title portion at 80 chars
}

/**
 * Build the output filename for an answer.
 * Format: {sanitized-question-title}-{answerId}.md
 */
function buildFilename(data) {
  const titlePart = sanitizePart(data.title) || `question_${data.questionId}`;
  return `${titlePart}-${data.answerId}.md`;
}

// ── Progress tracking ─────────────────────────────────────────────────────────

async function loadProgress() {
  try {
    await fse.ensureDir(OUTPUT_DIR);
    if (await fse.pathExists(PROGRESS_FILE)) {
      return await fse.readJson(PROGRESS_FILE);
    }
  } catch {
    // ignore
  }
  return { exported: [], failed: [] };
}

async function saveProgress(progress) {
  await fse.writeJson(PROGRESS_FILE, progress, { spaces: 2 });
}

// ── Main write function ───────────────────────────────────────────────────────

/**
 * Write one answer to disk as a .md file.
 *
 * @param {object} data - Result from extractor.js › extractAnswer()
 * @param {string} markdownBody - Converted markdown from converter.js
 * @returns {string} The filename that was written
 */
async function writeAnswer(data, markdownBody) {
  await fse.ensureDir(OUTPUT_DIR);

  const filename = buildFilename(data);
  const filePath = path.join(OUTPUT_DIR, filename);

  let content = '';
  if (config.includeFrontMatter) {
    content += buildFrontMatter(data);
  }

  // Add the question title as an H1 heading
  content += `# ${data.title}\n\n`;
  content += markdownBody;

  await fse.writeFile(filePath, content, 'utf8');
  return filename;
}

module.exports = {
  loadProgress,
  saveProgress,
  writeAnswer,
  buildFilename,
  OUTPUT_DIR,
};
