/**
 * fetcher.js — HTTP fetch with throttle + 403 exponential backoff retry
 * ======================================================================
 * Ported from: lib/throttle.js + lib/zhihu-api.js (reference project)
 */

'use strict';

const https = require('https');
const http = require('http');
const config = require('./config');

let lastRequestTime = 0;

/**
 * Wait until the minimum interval since the last request has elapsed.
 */
async function waitForInterval(delayMs = config.delayMs) {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < delayMs) {
    await sleep(delayMs - elapsed);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level HTTP GET using Node's built-in http/https.
 * Returns { statusCode, body } where body is a string.
 */
function rawFetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const cookie = opts.cookie || config.cookie;
    const options = {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity', // avoid gzip so we get plain text
        'Cookie': cookie,
        'Referer': 'https://www.zhihu.com/',
      },
    };

    const req = lib.get(url, options, (res) => {
      // Follow redirects (up to 5 hops)
      if (
        res.statusCode >= 301 &&
        res.statusCode <= 308 &&
        res.headers.location
      ) {
        rawFetch(res.headers.location, opts).then(resolve).catch(reject);
        res.resume();
        return;
      }

      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error(`Request timed out: ${url}`));
    });
  });
}

/**
 * Throttled fetch with 403 exponential backoff retry.
 * Returns the response body string, or throws on unrecoverable error.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {function} [opts.onRetry] - called with (attempt, maxRetries, waitMs) on 403
 * @returns {Promise<string>} HTML body
 */
async function throttledFetch(url, opts = {}) {
  const { onRetry } = opts;
  const maxRetries = opts.maxRetries ?? config.maxRetries;
  const initialBackoff = opts.retryBackoffMs ?? config.retryBackoffMs;
  const delayMs = opts.delayMs ?? config.delayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await waitForInterval(delayMs);
    lastRequestTime = Date.now();

    const { statusCode, body } = await rawFetch(url, opts);

    if (statusCode === 200) {
      return body;
    }

    if (statusCode === 403 && attempt < maxRetries) {
      const backoff = initialBackoff * Math.pow(2, attempt);
      if (onRetry) onRetry(attempt + 1, maxRetries, backoff);
      console.warn(
        `  ⚠️  HTTP 403 — waiting ${backoff / 1000}s before retry ` +
          `(${attempt + 1}/${maxRetries})...`
      );
      await sleep(backoff);
      continue;
    }

    const err = new Error(`HTTP ${statusCode} for ${url}`);
    err.statusCode = statusCode;
    throw err;
  }

  throw new Error(
    `Max retries exceeded for ${url}. ` +
      'Your cookie may have expired — please refresh it in config.js.'
  );
}

module.exports = { throttledFetch, rawFetch };
