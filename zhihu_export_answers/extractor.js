/**
 * extractor.js — Extract answer content from a fetched Zhihu page
 * ================================================================
 * Ported from:
 *   - lib/zhihu-api.js  › fetchFullContent()
 *   - content/detector.js › extractContent(), extractFromInitialData(), extractFromDOM()
 *
 * Strategy (mirrors the reference project exactly):
 *   1. Parse <script id="js-initialData" type="text/json"> → answer content
 *   2. Fallback / cross-check: parse .RichContent-inner innerHTML from DOM
 *   3. Use whichever source is longer (handles long answers that initialData truncates)
 */

'use strict';

const { parse: parseHtml } = require('node-html-parser');

/**
 * Parse the answer URL to extract question ID and answer ID.
 * URL format: https://www.zhihu.com/question/{questionId}/answer/{answerId}
 *
 * @param {string} url
 * @returns {{ questionId: string, answerId: string } | null}
 */
function parseAnswerUrl(url) {
  const match = url.match(/zhihu\.com\/question\/(\d+)\/answer\/(\d+)/);
  if (!match) return null;
  return { questionId: match[1], answerId: match[2] };
}

/**
 * Source 1: Extract from the embedded JSON initialData blob.
 * This is Zhihu's server-side rendered state — usually the most complete.
 *
 * @param {string} pageHtml
 * @param {string} answerId
 * @returns {{ title, author, html, createdTime, updatedTime } | null}
 */
function extractFromInitialData(pageHtml, answerId) {
  const scriptMatch = pageHtml.match(
    /<script\s+id="js-initialData"\s+type="text\/json">([^<]+)<\/script>/
  );
  if (!scriptMatch) return null;

  let initialData;
  try {
    initialData = JSON.parse(scriptMatch[1]);
  } catch {
    return null;
  }

  const answerData =
    initialData?.initialState?.entities?.answers?.[answerId];
  if (!answerData) return null;

  return {
    title: answerData?.question?.title || '',
    author: answerData?.author?.name || '知乎用户',
    html: answerData?.content || '',
    createdTime: answerData?.created_time || null,
    updatedTime: answerData?.updated_time || null,
  };
}

/**
 * Source 2: Extract from the parsed DOM.
 * Fallback when initialData is missing or truncated for very long answers.
 *
 * @param {string} pageHtml
 * @returns {{ title, author, html, createdTime, updatedTime } | null}
 */
function extractFromDOM(pageHtml) {
  const doc = parseHtml(pageHtml, {
    blockTextElements: {
      script: false, // don't parse script contents as text
      style: false,
    },
  });

  // Answer HTML content
  const richContent = doc.querySelector('.RichContent-inner');
  const html = richContent ? richContent.innerHTML : '';

  // Question title
  const titleEl =
    doc.querySelector('.QuestionHeader-title') ||
    doc.querySelector('h1.QuestionHeader-title') ||
    doc.querySelector('title');
  const rawTitle = titleEl ? titleEl.text.trim() : '';
  // Remove " - 知乎" suffix from <title> tag
  const title = rawTitle.replace(/\s*-\s*知乎$/, '').trim();

  // Author name
  const authorEl =
    doc.querySelector('.AuthorInfo-name a') ||
    doc.querySelector('[itemprop="name"]');
  const author = authorEl ? authorEl.text.trim() : '知乎用户';

  // Timestamps from meta tags
  const createdMeta = doc.querySelector('[itemprop="dateCreated"]');
  const updatedMeta = doc.querySelector('[itemprop="dateModified"]');
  const createdTime = createdMeta
    ? Math.floor(new Date(createdMeta.getAttribute('content')).getTime() / 1000)
    : null;
  const updatedTime = updatedMeta
    ? Math.floor(new Date(updatedMeta.getAttribute('content')).getTime() / 1000)
    : null;

  if (!html) return null;

  return { title, author, html, createdTime, updatedTime };
}

/**
 * Main extraction function.
 * Given a URL and its fetched HTML, returns a structured content object.
 *
 * @param {string} url - The answer URL
 * @param {string} pageHtml - The full HTML of the fetched page
 * @returns {{
 *   answerId: string,
 *   questionId: string,
 *   url: string,
 *   title: string,
 *   author: string,
 *   html: string,
 *   createdTime: number|null,
 *   updatedTime: number|null,
 * } | null}
 */
function extractAnswer(url, pageHtml) {
  const ids = parseAnswerUrl(url);
  if (!ids) {
    console.error(`  ✗ Could not parse answer URL: ${url}`);
    return null;
  }

  const { questionId, answerId } = ids;

  const fromData = extractFromInitialData(pageHtml, answerId);
  const fromDOM = extractFromDOM(pageHtml);

  // Pick the longer HTML source (same logic as reference project)
  let chosen;
  if (fromData && fromDOM) {
    chosen =
      fromDOM.html.length > fromData.html.length ? fromDOM : fromData;
    // Supplement whichever was chosen with timestamps from the other if missing
    chosen.createdTime = chosen.createdTime || (fromData?.createdTime) || (fromDOM?.createdTime);
    chosen.updatedTime = chosen.updatedTime || (fromData?.updatedTime) || (fromDOM?.updatedTime);
    chosen.title = chosen.title || fromData?.title || fromDOM?.title || '';
  } else {
    chosen = fromData || fromDOM;
  }

  if (!chosen || !chosen.html) {
    console.warn(`  ⚠️  No content found for answer ${answerId}`);
    return null;
  }

  return {
    answerId,
    questionId,
    url,
    title: chosen.title || `知乎问题${questionId}`,
    author: chosen.author || '知乎用户',
    html: chosen.html,
    createdTime: chosen.createdTime || null,
    updatedTime: chosen.updatedTime || null,
  };
}

module.exports = { extractAnswer, parseAnswerUrl };
