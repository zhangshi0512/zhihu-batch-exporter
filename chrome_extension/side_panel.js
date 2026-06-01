'use strict';

const els = {
  activeTabText: document.getElementById('activeTabText'),
  refreshButton: document.getElementById('refreshButton'),
  serviceStatus: document.getElementById('serviceStatus'),
  cookieStatus: document.getElementById('cookieStatus'),
  cacheStatus: document.getElementById('cacheStatus'),
  collectButton: document.getElementById('collectButton'),
  hydrateButton: document.getElementById('hydrateButton'),
  collectProgressText: document.getElementById('collectProgressText'),
  collectProgressFill: document.getElementById('collectProgressFill'),
  selectedCount: document.getElementById('selectedCount'),
  lastCollectedText: document.getElementById('lastCollectedText'),
  selectAllButton: document.getElementById('selectAllButton'),
  selectNoneButton: document.getElementById('selectNoneButton'),
  clearCacheButton: document.getElementById('clearCacheButton'),
  urlList: document.getElementById('urlList'),
  exportButton: document.getElementById('exportButton'),
  cancelButton: document.getElementById('cancelButton'),
  jobStatus: document.getElementById('jobStatus'),
  jobCounts: document.getElementById('jobCounts'),
  exportProgressText: document.getElementById('exportProgressText'),
  exportProgressFill: document.getElementById('exportProgressFill'),
  jobLog: document.getElementById('jobLog'),
};

const state = {
  tab: null,
  slug: '',
  items: [],
  urls: [],
  selected: new Set(),
  lastCollectedAt: '',
  remoteTotal: null,
  collectRunId: '',
  exportAbortController: null,
};

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(values) {
  return chrome.storage.local.set(values);
}

function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

function cacheKey(slug) {
  return `zhihuProfile:${slug}`;
}

function setStatus(el, text, ok) {
  el.textContent = text;
  el.classList.toggle('ok', ok === true);
  el.classList.toggle('bad', ok === false);
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

function cleanText(value, maxLength = 220) {
  const text = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemUrls(items) {
  return items.map((item) => item.url).filter(Boolean);
}

function normalizeAnswerItems(rawItems) {
  return (rawItems || [])
    .map((item) => {
      if (typeof item === 'string') {
        return { url: item, title: '', snippet: '' };
      }
      return {
        url: String(item?.url || '').trim(),
        title: cleanText(item?.title || '', 140),
        snippet: cleanText(item?.snippet || item?.excerpt || '', 260),
      };
    })
    .filter((item) => item.url.startsWith('https://www.zhihu.com/question/'));
}

function mergeAnswerItems(existingItems, incomingItems) {
  const map = new Map();
  normalizeAnswerItems(existingItems).forEach((item) => map.set(item.url, item));
  normalizeAnswerItems(incomingItems).forEach((item) => {
    const previous = map.get(item.url) || {};
    map.set(item.url, {
      url: item.url,
      title: item.title || previous.title || '',
      snippet: item.snippet || previous.snippet || '',
    });
  });
  return [...map.values()];
}

function loadCachedItems(cached) {
  if (Array.isArray(cached.items)) {
    return normalizeAnswerItems(cached.items);
  }
  return normalizeAnswerItems(cached.urls || []);
}

function setProgress(fillEl, textEl, value, text) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  fillEl.style.width = `${percent}%`;
  fillEl.parentElement?.setAttribute('aria-valuenow', String(percent));
  textEl.textContent = text || `${percent}%`;
}

function appendLog(message) {
  const now = new Date().toLocaleTimeString();
  els.jobLog.textContent = `${els.jobLog.textContent}${now}  ${message}\n`;
  els.jobLog.scrollTop = els.jobLog.scrollHeight;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

function getSlugFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('zhihu.com')) return '';
    const match = parsed.pathname.match(/\/people\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch {
    return '';
  }
}

async function loadCacheForActiveTab() {
  state.tab = await getActiveTab();
  state.slug = getSlugFromUrl(state.tab?.url || '');

  if (!state.slug) {
    els.activeTabText.textContent = '请打开知乎 /people/... 个人主页标签页。';
    state.items = [];
    state.urls = [];
    state.remoteTotal = null;
    state.selected.clear();
    renderUrls();
    return;
  }

  els.activeTabText.textContent = state.slug;
  const result = await storageGet([cacheKey(state.slug)]);
  const cached = result[cacheKey(state.slug)] || {};
  state.items = loadCachedItems(cached);
  state.urls = itemUrls(state.items);
  state.lastCollectedAt = cached.lastCollectedAt || '';
  state.remoteTotal = Number.isFinite(cached.remoteTotal) ? cached.remoteTotal : null;
  state.selected = new Set(state.urls);
  renderUrls();
}

async function checkCookie() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'getZhihuCookie' });
    if (!result?.ok || !result.cookie) {
      setStatus(els.cookieStatus, '未获取', false);
      return null;
    }
    setStatus(
      els.cookieStatus,
      result.hasLoginCookie ? `${result.count} 个登录凭证` : '登录状态未知',
      result.hasLoginCookie
    );
    return result.cookie;
  } catch {
    setStatus(els.cookieStatus, '读取失败', false);
    return null;
  }
}

async function scrapeAnswersFromPage(runId) {
  const match = window.location.pathname.match(/\/people\/([^/]+)/);
  if (!match) {
    throw new Error('当前标签页不是知乎个人主页。');
  }

  const slug = decodeURIComponent(match[1]);
  const limit = 20;
  const delayMs = 600;
  const include = [
    'data[*].id',
    'data[*].url',
    'data[*].question.id',
    'data[*].question.title',
    'data[*].question.url',
    'data[*].excerpt',
    'data[*].excerpt_new',
    'data[*].summary',
    'data[*].content',
  ].join(',');
  const itemsByUrl = new Map();
  let remoteTotal = null;
  let offset = 0;
  let isEnd = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value, maxLength = 220) => {
    const div = document.createElement('div');
    div.innerHTML = String(value || '');
    const text = (div.textContent || div.innerText || String(value || ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trim()}...`;
  };
  const report = (payload) => {
    try {
      chrome.runtime.sendMessage({ type: 'collectionProgress', runId, ...payload });
    } catch {
      // Progress reporting is best-effort.
    }
  };
  const normalizeAnswerUrl = (href) => {
    try {
      const parsed = new URL(href, window.location.origin);
      const match = parsed.pathname.match(/\/question\/(\d+)\/answer\/(\d+)/);
      if (!match) return '';
      return `https://www.zhihu.com/question/${match[1]}/answer/${match[2]}`;
    } catch {
      return '';
    }
  };
  const apiUrlToWebUrl = (answer) => {
    const questionId =
      answer?.question?.id ||
      String(answer?.question?.url || '').match(/questions\/(\d+)/)?.[1] ||
      String(answer?.url || '').match(/questions\/(\d+)/)?.[1];
    const answerId = answer?.id || String(answer?.url || '').match(/answers\/(\d+)/)?.[1];
    if (!questionId || !answerId) return '';
    return `https://www.zhihu.com/question/${questionId}/answer/${answerId}`;
  };
  const rememberItem = (item) => {
    if (!item.url) return;
    const previous = itemsByUrl.get(item.url) || {};
    itemsByUrl.set(item.url, {
      url: item.url,
      title: clean(item.title || previous.title || '', 140),
      snippet: clean(item.snippet || previous.snippet || '', 260),
    });
  };

  document
    .querySelectorAll('a[href*="/question/"][href*="/answer/"]')
    .forEach((anchor) => {
      const url = normalizeAnswerUrl(anchor.getAttribute('href') || '');
      if (!url) return;
      const container = anchor.closest('.List-item, .ContentItem, .AnswerItem') || anchor.parentElement;
      const snippetEl = container?.querySelector('.RichContent-inner, .RichText, .ContentItem-excerpt');
      rememberItem({ url, title: anchor.textContent, snippet: snippetEl?.textContent || '' });
    });

  report({
    phase: 'html',
    fetched: itemsByUrl.size,
    total: null,
    page: 0,
    message: `当前页面发现 ${itemsByUrl.size} 条链接`,
  });

  while (!isEnd) {
    const apiUrl =
      `/api/v4/members/${encodeURIComponent(slug)}/answers` +
      `?include=${encodeURIComponent(include)}` +
      `&offset=${offset}` +
      `&limit=${limit}` +
      `&sort_by=created`;

    const response = await fetch(apiUrl, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'Fetch' },
    });
    if (!response.ok) {
      throw new Error(`知乎接口返回 HTTP ${response.status}。`);
    }

    const data = await response.json();
    (data.data || []).forEach((answer) => {
      const url = apiUrlToWebUrl(answer);
      if (!url) return;
      rememberItem({
        url,
        title: answer.question?.title || '',
        snippet: answer.excerpt || answer.excerpt_new || answer.summary || answer.content || '',
      });
    });

    isEnd = data.paging?.is_end ?? true;
    const totalRemote = Number(data.paging?.totals || 0);
    if (totalRemote) remoteTotal = totalRemote;
    const uniqueCount = itemsByUrl.size;
    report({
      phase: 'api',
      fetched: uniqueCount,
      total: totalRemote || null,
      page: Math.floor(offset / limit) + 1,
      isEnd,
      message: totalRemote ? `${uniqueCount} / ${totalRemote} 条链接` : `已获取 ${uniqueCount} 条链接`,
    });
    offset += limit;
    if (!isEnd) await sleep(delayMs);
  }

  const items = [...itemsByUrl.values()];
  report({
    phase: 'done',
    fetched: items.length,
    total: remoteTotal || items.length,
    isEnd: true,
    message: remoteTotal ? `已采集 ${items.length} / ${remoteTotal} 条` : `已采集 ${items.length} 条`,
  });
  return { slug, items, urls: items.map((item) => item.url), remoteTotal };
}

async function hydratePreviewsFromPage(runId, rawItems) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value, maxLength = 260) => {
    const div = document.createElement('div');
    div.innerHTML = String(value || '');
    const text = (div.textContent || div.innerText || String(value || ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1).trim()}...`;
  };
  const report = (payload) => {
    try {
      chrome.runtime.sendMessage({ type: 'collectionProgress', runId, ...payload });
    } catch {
      // Progress reporting is best-effort.
    }
  };
  const parseAnswerId = (url) => String(url || '').match(/\/answer\/(\d+)/)?.[1] || '';
  const items = (rawItems || []).map((item) => ({ ...item }));
  const targets = items.filter((item) => !item.snippet && parseAnswerId(item.url));

  for (let index = 0; index < targets.length; index++) {
    const item = targets[index];
    const answerId = parseAnswerId(item.url);
    report({
      phase: 'hydrate',
      fetched: index,
      total: targets.length,
      message: `${index} / ${targets.length} 条预览`,
    });

    try {
      const apiUrl =
        `/api/v4/answers/${answerId}?include=` +
        encodeURIComponent(['content', 'excerpt', 'excerpt_new', 'summary', 'question.title'].join(','));
      const response = await fetch(apiUrl, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'Fetch' },
      });
      if (response.ok) {
        const data = await response.json();
        item.title = clean(data.question?.title || item.title || '', 140);
        item.snippet = clean(data.excerpt || data.excerpt_new || data.summary || data.content || '', 260);
      }
      if (!item.snippet) {
        const pageResponse = await fetch(item.url, { credentials: 'include' });
        if (pageResponse.ok) {
          const pageHtml = await pageResponse.text();
          const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
          const title =
            doc.querySelector('.QuestionHeader-title')?.textContent ||
            doc.querySelector('title')?.textContent ||
            item.title ||
            '';
          const content =
            doc.querySelector('.RichContent-inner')?.textContent ||
            doc.querySelector('.RichText')?.textContent ||
            '';
          item.title = clean(title.replace(/\s*-\s*知乎$/, ''), 140);
          item.snippet = clean(content, 260);
        }
      }
    } catch {
      // Keep the existing item if an individual preview fetch fails.
    }
    await sleep(250);
  }

  report({
    phase: 'hydrate-done',
    fetched: targets.length,
    total: targets.length,
    message: `已检查 ${targets.length} 条预览`,
  });
  return items;
}

async function collectUrls() {
  if (!state.tab?.id || !state.slug) {
    await loadCacheForActiveTab();
  }
  if (!state.tab?.id || !state.slug) return;

  els.collectButton.disabled = true;
  els.collectButton.textContent = '采集中...';
  state.collectRunId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  setProgress(els.collectProgressFill, els.collectProgressText, 0, '正在开始...');

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      func: scrapeAnswersFromPage,
      args: [state.collectRunId],
    });
    if (result.error) throw new Error(result.error.message);

    const collected = result.result || {};
    const previousUrlCount = state.urls.length;
    const collectedItems = normalizeAnswerItems(collected.items || collected.urls || []);
    const merged = mergeAnswerItems(state.items, collectedItems);
    const added = merged.length - previousUrlCount;

    state.slug = collected.slug || state.slug;
    state.items = merged;
    state.urls = itemUrls(state.items);
    state.remoteTotal = Number.isFinite(collected.remoteTotal) ? collected.remoteTotal : state.remoteTotal;
    state.selected = new Set(state.urls);
    state.lastCollectedAt = new Date().toISOString();

    await storageSet({
      [cacheKey(state.slug)]: {
        items: state.items,
        urls: state.urls,
        remoteTotal: state.remoteTotal,
        lastCollectedAt: state.lastCollectedAt,
      },
    });

    renderUrls();
    els.lastCollectedText.textContent = `新增 ${added} 条，${formatTime(state.lastCollectedAt)}`;
    setProgress(els.collectProgressFill, els.collectProgressText, 100, `已缓存 ${state.urls.length} 条`);
  } catch (error) {
    els.lastCollectedText.textContent = error.message;
    setProgress(els.collectProgressFill, els.collectProgressText, 0, '采集失败');
  } finally {
    els.collectButton.disabled = false;
    els.collectButton.textContent = '采集 / 刷新链接';
    state.collectRunId = '';
  }
}

async function hydrateMissingPreviews() {
  if (!state.tab?.id || !state.slug) {
    await loadCacheForActiveTab();
  }
  if (!state.tab?.id || !state.slug || state.items.length === 0) return;

  const missingCount = state.items.filter((item) => !item.snippet).length;
  if (missingCount === 0) {
    setProgress(els.collectProgressFill, els.collectProgressText, 100, '预览已全部补全');
    return;
  }

  els.hydrateButton.disabled = true;
  els.collectButton.disabled = true;
  state.collectRunId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  setProgress(els.collectProgressFill, els.collectProgressText, 0, `0 / ${missingCount} 条预览`);

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      func: hydratePreviewsFromPage,
      args: [state.collectRunId, state.items],
    });
    if (result.error) throw new Error(result.error.message);

    state.items = mergeAnswerItems(state.items, normalizeAnswerItems(result.result || []));
    state.urls = itemUrls(state.items);
    await storageSet({
      [cacheKey(state.slug)]: {
        items: state.items,
        urls: state.urls,
        remoteTotal: state.remoteTotal,
        lastCollectedAt: state.lastCollectedAt,
      },
    });
    renderUrls();
    setProgress(els.collectProgressFill, els.collectProgressText, 100, '预览已更新');
  } catch (error) {
    setProgress(els.collectProgressFill, els.collectProgressText, 0, '预览补全失败');
    els.lastCollectedText.textContent = error.message;
  } finally {
    els.hydrateButton.disabled = false;
    els.collectButton.disabled = false;
    state.collectRunId = '';
  }
}

function parseAnswerUrl(url) {
  const match = String(url || '').match(/zhihu\.com\/question\/(\d+)\/answer\/(\d+)/);
  if (!match) return null;
  return { questionId: match[1], answerId: match[2] };
}

function extractAnswer(url, pageHtml) {
  const ids = parseAnswerUrl(url);
  if (!ids) return null;

  const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
  const script = doc.querySelector('#js-initialData');
  let fromData = null;
  if (script?.textContent) {
    try {
      const initialData = JSON.parse(script.textContent);
      const answerData = initialData?.initialState?.entities?.answers?.[ids.answerId];
      if (answerData) {
        fromData = {
          title: answerData?.question?.title || '',
          author: answerData?.author?.name || '知乎用户',
          html: answerData?.content || '',
          createdTime: answerData?.created_time || null,
          updatedTime: answerData?.updated_time || null,
        };
      }
    } catch {
      // Fall through to DOM extraction.
    }
  }

  const richContent = doc.querySelector('.RichContent-inner');
  const titleEl =
    doc.querySelector('.QuestionHeader-title') ||
    doc.querySelector('h1.QuestionHeader-title') ||
    doc.querySelector('title');
  const authorEl = doc.querySelector('.AuthorInfo-name a') || doc.querySelector('[itemprop="name"]');
  const fromDOM = richContent
    ? {
        title: cleanText((titleEl?.textContent || '').replace(/\s*-\s*知乎$/, ''), 200),
        author: cleanText(authorEl?.textContent || '知乎用户', 120),
        html: richContent.innerHTML,
        createdTime: null,
        updatedTime: null,
      }
    : null;

  const chosen =
    fromData && fromDOM
      ? fromDOM.html.length > fromData.html.length
        ? fromDOM
        : fromData
      : fromData || fromDOM;

  if (!chosen?.html) return null;
  return {
    ...ids,
    url,
    title: chosen.title || `知乎问题 ${ids.questionId}`,
    author: chosen.author || '知乎用户',
    html: chosen.html,
    createdTime: chosen.createdTime || null,
    updatedTime: chosen.updatedTime || null,
  };
}

function markdownEscape(text) {
  return String(text || '').replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function nodeToMarkdown(node, depth = 0) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent.replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const tag = node.tagName.toLowerCase();
  if (['script', 'style', 'noscript'].includes(tag)) return '';
  if (node.classList.contains('Catalog') || node.classList.contains('ReferenceList')) return '';

  const children = () => [...node.childNodes].map((child) => nodeToMarkdown(child, depth)).join('').trim();
  const block = (content) => (content ? `\n\n${content}\n\n` : '');

  if (tag === 'br') return '\n';
  if (/^h[1-6]$/.test(tag)) return block(`${'#'.repeat(Number(tag[1]))} ${children()}`);
  if (tag === 'p') return block(children());
  if (tag === 'strong' || tag === 'b') return `**${children()}**`;
  if (tag === 'em' || tag === 'i') return `*${children()}*`;
  if (tag === 'blockquote') return block(children().split('\n').map((line) => `> ${line}`).join('\n'));
  if (tag === 'code' && node.parentElement?.tagName?.toLowerCase() !== 'pre') return `\`${node.textContent}\``;
  if (tag === 'pre') {
    const lang = node.getAttribute('lang') || '';
    return block(`\`\`\`${lang}\n${node.textContent.trim()}\n\`\`\``);
  }
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    const text = children() || href;
    return href ? `[${text}](${href})` : text;
  }
  if (tag === 'img') {
    const latex = node.getAttribute('data-tex') || '';
    if (latex) return node.getAttribute('eeimg') === '2' ? `\n\n$$${latex}$$\n\n` : `$${latex}$`;
    const src = node.getAttribute('data-original') || node.getAttribute('data-actualsrc') || node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    return src ? `![${alt}](${src})` : '';
  }
  if (tag === 'figure') {
    const img = node.querySelector('img');
    if (img) return block(nodeToMarkdown(img, depth));
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = [...node.children]
      .filter((child) => child.tagName?.toLowerCase() === 'li')
      .map((li, index) => {
        const marker = tag === 'ol' ? `${index + 1}.` : '-';
        return `${'  '.repeat(depth)}${marker} ${nodeToMarkdown(li, depth + 1).trim()}`;
      })
      .join('\n');
    return block(items);
  }
  if (tag === 'li') return children();
  if (tag === 'table') return block(cleanText(node.textContent, 2000));

  return [...node.childNodes].map((child) => nodeToMarkdown(child, depth)).join('');
}

function htmlToMarkdown(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  const markdown = [...template.content.childNodes].map((node) => nodeToMarkdown(node)).join('');
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildMarkdown(data) {
  const escapeYaml = (value) => String(value || '').replace(/"/g, '\\"');
  const lines = [
    '---',
    `id: "${escapeYaml(data.answerId)}"`,
    `title: "${escapeYaml(data.title)}"`,
    `author: "${escapeYaml(data.author)}"`,
    'type: zhihu-answer',
    `source: "${escapeYaml(data.url)}"`,
  ];
  const created = formatTimestamp(data.createdTime);
  const updated = formatTimestamp(data.updatedTime);
  if (created) lines.push(`created: "${created}"`);
  if (updated) lines.push(`updated: "${updated}"`);
  lines.push(`downloaded: "${new Date().toISOString().slice(0, 10)}"`, '---', '');
  lines.push(`# ${data.title}`, '', htmlToMarkdown(data.html), '');
  return lines.join('\n');
}

function sanitizeFilenamePart(value) {
  return cleanText(value || '', 80)
    .replace(/[\\/:*?"<>|#^[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'zhihu-answer';
}

function buildFilename(data) {
  return `${sanitizeFilenamePart(data.title)}-${data.answerId}.md`;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, date: dosDate };
}

function u16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.data);
    const crc = crc32(dataBytes);
    const localHeader = [
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ];
    parts.push(...localHeader, dataBytes);

    centralParts.push(
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes
    );

    offset += localHeader.reduce((sum, part) => sum + part.length, 0) + dataBytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const endRecord = [
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralSize),
    u32(centralOffset),
    u16(0),
  ];
  return new Blob([...parts, ...centralParts, ...endRecord], { type: 'application/zip' });
}

function downloadBlob(blob, filename) {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(blob);
    chrome.downloads.download(
      {
        url: blobUrl,
        filename,
        saveAs: true,
      },
      (downloadId) => {
        const error = chrome.runtime.lastError;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

function selectedItems() {
  return state.items.filter((item) => state.selected.has(item.url));
}

async function exportSelectedZip() {
  const cookie = await checkCookie();
  if (!cookie) {
    els.jobStatus.textContent = '无法获取知乎登录凭证';
    return;
  }

  const items = selectedItems();
  if (items.length === 0) return;

  state.exportAbortController = new AbortController();
  els.exportButton.disabled = true;
  els.cancelButton.disabled = false;
  els.jobLog.textContent = '';
  els.jobStatus.textContent = '正在导出 ZIP...';
  els.jobCounts.textContent = `0 / ${items.length}`;
  setProgress(els.exportProgressFill, els.exportProgressText, 0, `0 / ${items.length}`);

  const files = [];
  const failures = [];

  try {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (state.exportAbortController.signal.aborted) {
        throw new Error('导出已取消。');
      }

      appendLog(`正在获取 ${item.url}`);
      try {
        const response = await fetch(item.url, {
          credentials: 'include',
          signal: state.exportAbortController.signal,
        });
        if (!response.ok) throw new Error(`请求失败：HTTP ${response.status}`);
        const html = await response.text();
        const answer = extractAnswer(item.url, html);
        if (!answer) throw new Error('无法提取回答内容。');
        const markdown = buildMarkdown(answer);
        files.push({ name: `answers/${buildFilename(answer)}`, data: markdown });
        appendLog(`已加入：${answer.title}`);
      } catch (error) {
        failures.push({ url: item.url, error: error.message });
        appendLog(`失败 ${item.url}：${error.message}`);
      }

      const completed = index + 1;
      const percent = (completed / items.length) * 100;
      els.jobCounts.textContent = `${completed} / ${items.length}`;
      setProgress(els.exportProgressFill, els.exportProgressText, percent, `${completed} / ${items.length}`);
    }

    if (failures.length) {
      files.push({
        name: 'failed_urls.txt',
        data: failures.map((entry) => `${entry.url}\t${entry.error}`).join('\n'),
      });
    }
    if (files.length === 0) throw new Error('没有生成任何 Markdown 文件。');

    appendLog('正在打包 ZIP...');
    const zipBlob = createZipBlob(files);
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `zhihu_answers_${state.slug || 'export'}_${datePart}.zip`;
    await downloadBlob(zipBlob, filename);

    els.jobStatus.textContent = failures.length ? 'ZIP 已下载，但有失败项' : 'ZIP 已下载';
    els.jobCounts.textContent = `${files.length - (failures.length ? 1 : 0)} 个文件`;
    setProgress(els.exportProgressFill, els.exportProgressText, 100, '完成');
  } catch (error) {
    els.jobStatus.textContent = error.message;
    appendLog(error.message);
  } finally {
    state.exportAbortController = null;
    els.cancelButton.disabled = true;
    renderSelection();
  }
}

function renderUrls() {
  els.cacheStatus.textContent = state.remoteTotal
    ? `${state.items.length} / ${state.remoteTotal}`
    : `${state.items.length} 条`;
  els.lastCollectedText.textContent = state.lastCollectedAt ? formatTime(state.lastCollectedAt) : '';

  if (state.items.length === 0) {
    els.urlList.innerHTML = '<div class="empty">当前主页还没有缓存的回答链接。</div>';
    renderSelection();
    return;
  }

  els.urlList.innerHTML = state.items
    .map((item, index) => {
      const checked = state.selected.has(item.url) ? 'checked' : '';
      const title = item.title || '未命名知乎回答';
      const snippet = item.snippet || '还没有采集到预览内容。可点击“补全预览”。';
      return `
        <label class="url-item">
          <input type="checkbox" data-index="${index}" ${checked}>
          <span class="url-content">
            <strong class="url-title">${escapeHtml(title)}</strong>
            <span class="url-snippet">${escapeHtml(snippet)}</span>
            <span class="url-text">${escapeHtml(item.url)}</span>
          </span>
        </label>
      `;
    })
    .join('');
  renderSelection();
}

function renderSelection() {
  const exporting = Boolean(state.exportAbortController);
  els.selectedCount.textContent = `已选择 ${state.selected.size} 条`;
  els.exportButton.disabled = state.selected.size === 0 || exporting;
  els.hydrateButton.disabled = state.items.length === 0 || exporting;
  els.clearCacheButton.disabled = state.items.length === 0 || exporting;
  els.cancelButton.disabled = !exporting;
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'collectionProgress') return;
  if (message.runId !== state.collectRunId) return;

  const fetched = message.fetched || 0;
  const total = message.total || 0;
  if (total > 0) {
    setProgress(
      els.collectProgressFill,
      els.collectProgressText,
      (fetched / total) * 100,
      message.message || `${fetched} / ${total} 条`
    );
    return;
  }

  const rollingPercent = message.phase === 'html' ? 5 : Math.min(95, 10 + fetched);
  setProgress(
    els.collectProgressFill,
    els.collectProgressText,
    rollingPercent,
    message.message || `已获取 ${fetched} 条链接`
  );
});

async function clearCurrentCache() {
  if (!state.slug) return;
  await storageRemove([cacheKey(state.slug)]);
  state.items = [];
  state.urls = [];
  state.remoteTotal = null;
  state.lastCollectedAt = '';
  state.selected.clear();
  renderUrls();
  setProgress(els.collectProgressFill, els.collectProgressText, 0, '缓存已清空');
}

els.refreshButton.addEventListener('click', async () => {
  await loadCacheForActiveTab();
  await checkCookie();
});

els.collectButton.addEventListener('click', collectUrls);
els.hydrateButton.addEventListener('click', hydrateMissingPreviews);

els.selectAllButton.addEventListener('click', () => {
  state.selected = new Set(itemUrls(state.items));
  renderUrls();
});

els.selectNoneButton.addEventListener('click', () => {
  state.selected.clear();
  renderUrls();
});

els.clearCacheButton.addEventListener('click', clearCurrentCache);

els.urlList.addEventListener('change', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const url = state.items[Number(input.dataset.index)]?.url;
  if (!url) return;
  if (input.checked) state.selected.add(url);
  else state.selected.delete(url);
  renderSelection();
});

els.exportButton.addEventListener('click', exportSelectedZip);
els.cancelButton.addEventListener('click', () => {
  state.exportAbortController?.abort();
});

(async function init() {
  setStatus(els.serviceStatus, 'ZIP 下载', true);
  els.jobStatus.textContent = '当前没有导出任务';
  els.cancelButton.disabled = true;
  await loadCacheForActiveTab();
  await checkCookie();
})();
