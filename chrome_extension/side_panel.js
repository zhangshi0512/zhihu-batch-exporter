'use strict';

// ============================
// Content type configuration
// ============================
const CONTENT_TYPES = {
  answers: {
    label: '回答',
    labelEn: 'answers',
    folderName: 'answers',
    frontmatterType: 'zhihu-answer',
    domSelectors: { content: '.RichContent-inner', title: '.QuestionHeader-title', author: '.AuthorInfo-name .UserLink-link, .AuthorInfo-name a, [itemprop="author"] [itemprop="name"]' },
    hasTitle: true,
    supportsTruncated: true,
    // API
    apiEndpoint: (slug) => `/api/v4/members/${encodeURIComponent(slug)}/answers`,
    apiInclude: ['data[*].id', 'data[*].url', 'data[*].question.id', 'data[*].question.title', 'data[*].question.url', 'data[*].excerpt', 'data[*].excerpt_new', 'data[*].summary', 'data[*].content', 'data[*].created_time', 'data[*].updated_time', 'data[*].voteup_count', 'data[*].comment_count', 'data[*].thanks_count', 'data[*].favorite_count'],
    apiSortBy: 'created',
    // DOM sniffing on profile page
    domLinkSelector: 'a[href*="/question/"][href*="/answer/"]',
    domLinkNormalizer: (href) => {
      try {
        const parsed = new URL(href, window.location.origin);
        const m = parsed.pathname.match(/\/question\/(\d+)\/answer\/(\d+)/);
        return m ? `https://www.zhihu.com/question/${m[1]}/answer/${m[2]}` : '';
      } catch { return ''; }
    },
    domSnippetSelector: '.RichContent-inner, .RichText, .ContentItem-excerpt',
    // API item → normalized item
    apiItemToUrl: (item) => {
      const qid = item?.question?.id || String(item?.question?.url || '').match(/questions\/(\d+)/)?.[1] || String(item?.url || '').match(/questions\/(\d+)/)?.[1];
      const aid = item?.id || String(item?.url || '').match(/answers\/(\d+)/)?.[1];
      return (qid && aid) ? `https://www.zhihu.com/question/${qid}/answer/${aid}` : '';
    },
    apiItemToTitle: (item) => item?.question?.title || '',
    apiItemToSnippet: (item) => item?.excerpt || item?.excerpt_new || item?.summary || item?.content || '',
    apiItemToExtraFields: (item) => ({
      createdTime: item?.created_time ?? null,
      updatedTime: item?.updated_time ?? null,
      voteCount: item?.voteup_count ?? item?.upvote_count ?? null,
      commentCount: item?.comment_count ?? null,
      favoriteCount: item?.favorite_count ?? item?.favlists_count ?? null,
      thanksCount: item?.thanks_count ?? null,
    }),
    // URL filter for cached items
    urlFilter: (url) => url.startsWith('https://www.zhihu.com/question/'),
    // Content extraction
    initialDataEntity: 'answers',
    initialDataIdFromUrl: (url) => { const m = url.match(/\/answer\/(\d+)/); return m ? m[1] : ''; },
    initialDataTitle: (data) => data?.question?.title || '',
    initialDataContent: (data) => data?.content || '',
    initialDataAuthor: (data) => data?.author?.name || '知乎用户',
    initialDataCreated: (data) => data?.created_time || null,
    initialDataUpdated: (data) => data?.updated_time || null,
    initialDataMetadata: (data) => ({
      voteCount: data?.voteup_count ?? data?.upvoteCount ?? null,
      likeCount: data?.liked_count ?? data?.likeCount ?? null,
      favoriteCount: data?.favorite_count ?? data?.favlistsCount ?? null,
      commentCount: data?.comment_count ?? data?.commentCount ?? null,
      thanksCount: data?.thanks_count ?? data?.thanksCount ?? null,
    }),
    initialDataSupplementHtml: () => '',
    // Hydrate API
    hydrateApiUrl: (id) => `/api/v4/answers/${id}?include=` + encodeURIComponent(['content', 'excerpt', 'excerpt_new', 'summary', 'question.title'].join(',')),
    hydrateParseResponse: (data) => ({ title: data.question?.title || '', snippet: data.excerpt || data.excerpt_new || data.summary || data.content || '' }),
    hydrateDomSelectors: { title: '.QuestionHeader-title', content: '.RichContent-inner, .RichText' },
    // Profile path
    profilePath: (slug) => `/people/${slug}/answers`,
    // Default fallback filename part
    defaultName: '回答',
  },
  articles: {
    label: '文章',
    labelEn: 'articles',
    folderName: 'articles',
    frontmatterType: 'zhihu-article',
    domSelectors: { content: '.Post-RichText', title: '.Post-Title', author: '.AuthorInfo-name .UserLink-link, .AuthorInfo-name a, [itemprop="author"] [itemprop="name"]' },
    hasTitle: true,
    supportsTruncated: true,
    apiEndpoint: (slug) => `/api/v4/members/${encodeURIComponent(slug)}/posts`,
    // Omit include for posts — the include param may not be supported on this endpoint
    apiInclude: null,
    apiSortBy: 'created',
    domLinkSelector: 'a[href*="zhuanlan.zhihu.com/p/"], a[href*="/p/"]',
    domLinkNormalizer: (href) => {
      try {
        const parsed = new URL(href, window.location.origin);
        const m = parsed.pathname.match(/\/p\/(\d+)/);
        return m ? `https://zhuanlan.zhihu.com/p/${m[1]}` : '';
      } catch { return ''; }
    },
    domSnippetSelector: '.Post-RichText, .RichText, .PostIndex-content, .Post-Main .RichText',
    // Use item.url if available; fall back to constructing from item.id
    apiItemToUrl: (item) => {
      if (item?.url && String(item.url).startsWith('http')) return String(item.url).replace(/^http:\/\//, 'https://');
      if (item?.url && String(item.url).startsWith('//')) return `https:${item.url}`;
      const id = item?.id;
      return id ? `https://zhuanlan.zhihu.com/p/${id}` : '';
    },
    apiItemToTitle: (item) => item?.title || '',
    apiItemToSnippet: (item) => item?.excerpt || item?.content || '',
    apiItemToExtraFields: (item) => ({
      createdTime: item?.created ?? null,
      updatedTime: item?.updated ?? null,
      voteCount: item?.voteupCount ?? item?.voteup_count ?? null,
      likeCount: item?.likedCount ?? item?.liked_count ?? item?.emojiReaction?.likeCount ?? null,
      favoriteCount: item?.favlistsCount ?? item?.favorite_count ?? null,
      commentCount: item?.commentCount ?? item?.comment_count ?? null,
    }),
    urlFilter: (url) => url.startsWith('https://zhuanlan.zhihu.com/p/'),
    initialDataEntity: 'articles',
    initialDataIdFromUrl: (url) => { const m = url.match(/zhuanlan\.zhihu\.com\/p\/(\d+)/); return m ? m[1] : ''; },
    initialDataTitle: (data) => data?.title || '',
    initialDataContent: (data) => data?.content || '',
    initialDataAuthor: (data) => data?.author?.name || '知乎用户',
    initialDataCreated: (data) => data?.created || null,
    initialDataUpdated: (data) => data?.updated || null,
    initialDataMetadata: (data) => ({
      voteCount: data?.voteupCount ?? data?.voteup_count ?? null,
      likeCount: data?.likedCount ?? data?.liked_count ?? data?.emojiReaction?.likeCount ?? null,
      favoriteCount: data?.favlistsCount ?? data?.favorite_count ?? null,
      commentCount: data?.commentCount ?? data?.comment_count ?? null,
      thanksCount: null,
    }),
    initialDataSupplementHtml: () => '',
    hydrateApiUrl: () => null,
    hydrateParseResponse: () => null,
    hydrateDomSelectors: { title: '.Post-Title', content: '.Post-RichText, .RichText' },
    profilePath: (slug) => `/people/${slug}/posts`,
    defaultName: '文章',
  },
  pins: {
    label: '想法',
    labelEn: 'pins',
    folderName: 'pins',
    frontmatterType: 'zhihu-pin',
    domSelectors: { content: '.PinItem-contentWrapper', title: null, author: null },
    hasTitle: false,
    supportsTruncated: false,
    apiEndpoint: (slug) => `/api/v4/members/${encodeURIComponent(slug)}/pins`,
    // Omit include for pins — the include param may not be supported on this endpoint
    apiInclude: null,
    apiSortBy: 'created',
    domLinkSelector: 'a[href*="/pin/"]',
    domLinkNormalizer: (href) => {
      try {
        const parsed = new URL(href, window.location.origin);
        const m = parsed.pathname.match(/\/pin\/(\d+)/);
        return m ? `https://www.zhihu.com/pin/${m[1]}` : '';
      } catch { return ''; }
    },
    domSnippetSelector: '.PinItem-contentWrapper, .PinItem-content, .RichText',
    apiItemToUrl: (item) => {
      if (item?.url && String(item.url).startsWith('http')) return String(item.url).replace(/^http:\/\//, 'https://');
      if (item?.url && String(item.url).startsWith('//')) return `https:${item.url}`;
      const id = item?.id;
      return id ? `https://www.zhihu.com/pin/${id}` : '';
    },
    apiItemToTitle: (item) => `想法${item?.id || ''}`,
    apiItemToSnippet: (item) => {
      const textContent = typeof item?.contentHtml === 'string' ? item.contentHtml.replace(/<[^>]*>/g, '').trim()
        : (typeof item?.content === 'string' ? item.content.replace(/<[^>]*>/g, '').trim()
        : (item?.excerpt || ''));
      return textContent.slice(0, 260);
    },
    // Pins: store full contentHtml + author during collection since there is no standalone pin page
    apiItemToExtraFields: (item) => {
      let fullHtml = typeof item?.contentHtml === 'string' ? item.contentHtml : '';
      if (!fullHtml && typeof item?.content === 'string') fullHtml = item.content;
      if (Array.isArray(item?.content)) {
        const textHtml = item.content
          .filter(e => e?.type === 'text' && e?.content)
          .map(e => `<p>${String(e.content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
          .join('\n');
        const imgsHtml = item.content
          .filter(e => e?.type === 'image' && e?.originalUrl)
          .map(e => `<img src="${e.originalUrl}" />`)
          .join('\n');
        const blocksHtml = [textHtml, imgsHtml].filter(Boolean).join('\n');
        if (blocksHtml) fullHtml += (fullHtml ? '\n' : '') + blocksHtml;
      }
      return {
        contentHtml: fullHtml,
        author: item?.author?.name || '知乎用户',
        createdTime: item?.created || null,
        updatedTime: item?.updated || null,
        voteCount: item?.voteupCount ?? item?.voteup_count ?? null,
        likeCount: item?.likedCount ?? item?.liked_count ?? item?.likeCount ?? null,
        favoriteCount: item?.favlistsCount ?? item?.favorite_count ?? null,
        commentCount: item?.commentCount ?? item?.comment_count ?? null,
        thanksCount: item?.thanksCount ?? item?.thanks_count ?? null,
      };
    },
    urlFilter: (url) => url.startsWith('https://www.zhihu.com/pin/'),
    initialDataEntity: 'pins',
    initialDataIdFromUrl: (url) => { const m = url.match(/\/pin\/(\d+)/); return m ? m[1] : ''; },
    initialDataTitle: () => null,
    initialDataContent: (data) => {
      let html = typeof data?.contentHtml === 'string' ? data.contentHtml : '';
      if (Array.isArray(data?.content)) {
        const textHtml = data.content
          .filter(e => e?.type === 'text' && e?.content)
          .map(e => `<p>${String(e.content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
          .join('\n');
        const imgsHtml = data.content
          .filter(e => e?.type === 'image' && e?.originalUrl)
          .map(e => `<img src="${e.originalUrl}" />`)
          .join('\n');
        const blocksHtml = [textHtml, imgsHtml].filter(Boolean).join('\n');
        if (blocksHtml) html += (html ? '\n' : '') + blocksHtml;
      }
      return html;
    },
    initialDataAuthor: (data, initialData) => {
      const users = initialData?.initialState?.entities?.users || {};
      for (const key in users) { if (users[key]?.name) return users[key].name; }
      return '知乎用户';
    },
    initialDataCreated: (data) => data?.created || null,
    initialDataUpdated: (data) => data?.updated || null,
    initialDataMetadata: (data) => ({
      voteCount: data?.voteupCount ?? data?.voteup_count ?? null,
      likeCount: data?.likedCount ?? data?.liked_count ?? data?.likeCount ?? null,
      favoriteCount: data?.favlistsCount ?? data?.favorite_count ?? null,
      commentCount: data?.commentCount ?? data?.comment_count ?? null,
      thanksCount: data?.thanksCount ?? data?.thanks_count ?? null,
    }),
    initialDataSupplementHtml: (data) => '',
    hydrateApiUrl: () => null,
    hydrateParseResponse: () => null,
    hydrateDomSelectors: { title: null, content: '.PinItem-contentWrapper, .RichText' },
    profilePath: (slug) => `/people/${slug}/pins`,
    defaultName: '想法',
  },
};

// ============================
// DOM element references
// ============================
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
  typeSelector: document.getElementById('typeSelector'),
};

// ============================
// Application state
// ============================
const state = {
  tab: null,
  slug: '',
  currentType: 'answers',
  items: [],
  urls: [],
  selected: new Set(),
  lastCollectedAt: '',
  remoteTotal: null,
  collectRunId: '',
  exportAbortController: null,
};

// ============================
// Config helper
// ============================
function currentConfig() {
  return CONTENT_TYPES[state.currentType] || CONTENT_TYPES.answers;
}

function typeLabel() {
  return currentConfig().label;
}

// ============================
// Storage helpers
// ============================
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
  return `zhihuProfile:${slug}:${state.currentType}`;
}

// ============================
// UI helpers
// ============================
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

// ============================
// Tab detection
// ============================
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

// ============================
// Item normalization (type-aware)
// ============================
function normalizeItems(rawItems) {
  const config = currentConfig();
  return (rawItems || [])
    .map((item) => {
      if (typeof item === 'string') {
        return { url: item, title: '', snippet: '', contentHtml: '', author: '', createdTime: null, updatedTime: null, voteCount: null, likeCount: null, favoriteCount: null, commentCount: null, thanksCount: null };
      }
      return {
        url: String(item?.url || '').trim(),
        title: cleanText(item?.title || '', 140),
        snippet: cleanText(item?.snippet || item?.excerpt || '', 260),
        contentHtml: item?.contentHtml || '',
        author: item?.author || '',
        createdTime: item?.createdTime || null,
        updatedTime: item?.updatedTime || null,
        voteCount: item?.voteCount ?? null,
        likeCount: item?.likeCount ?? null,
        favoriteCount: item?.favoriteCount ?? null,
        commentCount: item?.commentCount ?? null,
        thanksCount: item?.thanksCount ?? null,
      };
    })
    .filter((item) => config.urlFilter(item.url));
}

function mergeItems(existingItems, incomingItems) {
  const map = new Map();
  normalizeItems(existingItems).forEach((item) => map.set(item.url, item));
  normalizeItems(incomingItems).forEach((item) => {
    const previous = map.get(item.url) || {};
    map.set(item.url, {
      url: item.url,
      title: item.title || previous.title || '',
      snippet: item.snippet || previous.snippet || '',
      contentHtml: item.contentHtml || previous.contentHtml || '',
      author: item.author || previous.author || '',
      createdTime: item.createdTime || previous.createdTime || null,
      updatedTime: item.updatedTime || previous.updatedTime || null,
      voteCount: item.voteCount ?? previous.voteCount ?? null,
      likeCount: item.likeCount ?? previous.likeCount ?? null,
      favoriteCount: item.favoriteCount ?? previous.favoriteCount ?? null,
      commentCount: item.commentCount ?? previous.commentCount ?? null,
      thanksCount: item.thanksCount ?? previous.thanksCount ?? null,
    });
  });
  return [...map.values()];
}

function loadCachedItems(cached) {
  if (Array.isArray(cached.items)) {
    return normalizeItems(cached.items);
  }
  return normalizeItems(cached.urls || []);
}

// ============================
// Cookie
// ============================
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

// ============================
// Cache loading / switching
// ============================
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

async function switchType(type) {
  if (type === state.currentType) return;
  state.currentType = type;
  // Update button states
  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  // Reload cache for new type
  await loadCacheForActiveTab();
  // Update empty message
  if (state.items.length === 0) {
    const config = currentConfig();
    els.urlList.innerHTML = `<div class="empty">当前主页还没有缓存的${config.label}链接。</div>`;
  }
}

// ============================
// Collection (injected into profile page)
// ============================
async function scrapeContentFromPage(type, runId) {
  const injectedConfigs = {
    answers: {
      label: '回答',
      apiEndpoints: [(slug) => `/api/v4/members/${encodeURIComponent(slug)}/answers`],
      apiInclude: ['data[*].id', 'data[*].url', 'data[*].question.id', 'data[*].question.title', 'data[*].question.url', 'data[*].excerpt', 'data[*].excerpt_new', 'data[*].summary', 'data[*].content', 'data[*].created_time', 'data[*].updated_time', 'data[*].voteup_count', 'data[*].comment_count', 'data[*].thanks_count', 'data[*].favorite_count'],
      apiSortBy: 'created',
      domLinkSelector: 'a[href*="/question/"][href*="/answer/"]',
      domItemSelector: '.List-item, .ContentItem, .AnswerItem',
      domTitleSelector: '.ContentItem-title a, .QuestionHeader-title',
      domSnippetSelector: '.RichContent-inner, .RichText, .ContentItem-excerpt',
      domLinkNormalizer: (href) => {
        try {
          const parsed = new URL(href, window.location.origin);
          const m = parsed.pathname.match(/\/question\/(\d+)\/answer\/(\d+)/);
          return m ? `https://www.zhihu.com/question/${m[1]}/answer/${m[2]}` : '';
        } catch { return ''; }
      },
      apiItemToUrl: (item) => {
        const qid = item?.question?.id || String(item?.question?.url || '').match(/questions\/(\d+)/)?.[1] || String(item?.url || '').match(/questions\/(\d+)/)?.[1];
        const aid = item?.id || String(item?.url || '').match(/answers\/(\d+)/)?.[1];
        return (qid && aid) ? `https://www.zhihu.com/question/${qid}/answer/${aid}` : '';
      },
      apiItemToTitle: (item) => item?.question?.title || '',
      apiItemToSnippet: (item) => item?.excerpt || item?.excerpt_new || item?.summary || item?.content || '',
      apiItemToExtraFields: (item) => ({
        createdTime: item?.created_time ?? null,
        updatedTime: item?.updated_time ?? null,
        voteCount: item?.voteup_count ?? item?.upvote_count ?? null,
        commentCount: item?.comment_count ?? null,
        favoriteCount: item?.favorite_count ?? item?.favlists_count ?? null,
        thanksCount: item?.thanks_count ?? null,
      }),
      domItemToUrl: () => '',
    },
    articles: {
      label: '文章',
      apiEndpoints: [
        (slug) => `/api/v4/members/${encodeURIComponent(slug)}/posts`,
        (slug) => `/api/v4/members/${encodeURIComponent(slug)}/articles`,
      ],
      apiInclude: null,
      apiSortBy: 'created',
      domLinkSelector: 'a[href*="zhuanlan.zhihu.com/p/"], a[href^="//zhuanlan.zhihu.com/p/"], a[href^="/p/"]',
      domItemSelector: '.ContentItem.ArticleItem, .ArticleItem, .List-item',
      domTitleSelector: '.ContentItem-title a',
      domSnippetSelector: '.RichContent-inner, .RichText, .ContentItem-excerpt, .PostIndex-content',
      domLinkNormalizer: (href) => {
        try {
          const parsed = new URL(href, window.location.origin);
          const m = parsed.pathname.match(/\/p\/(\d+)/);
          return m ? `https://zhuanlan.zhihu.com/p/${m[1]}` : '';
        } catch { return ''; }
      },
      apiItemToUrl: (item) => {
        const rawUrl = String(item?.url || '');
        if (rawUrl.startsWith('http')) return rawUrl.replace(/^http:\/\//, 'https://');
        if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
        const id = item?.id || item?.article_id;
        return id ? `https://zhuanlan.zhihu.com/p/${id}` : '';
      },
      apiItemToTitle: (item) => item?.title || '',
      apiItemToSnippet: (item) => item?.excerpt || item?.summary || item?.content || '',
      apiItemToExtraFields: (item) => ({
        createdTime: item?.created ?? null,
        updatedTime: item?.updated ?? null,
        voteCount: item?.voteupCount ?? item?.voteup_count ?? null,
        likeCount: item?.likedCount ?? item?.liked_count ?? item?.emojiReaction?.likeCount ?? null,
        favoriteCount: item?.favlistsCount ?? item?.favorite_count ?? null,
        commentCount: item?.commentCount ?? item?.comment_count ?? null,
      }),
      domItemToUrl: (data) => data?.type === 'article' && data?.itemId ? `https://zhuanlan.zhihu.com/p/${data.itemId}` : '',
    },
    pins: {
      label: '想法',
      apiEndpoints: [(slug) => `/api/v4/members/${encodeURIComponent(slug)}/pins`],
      apiInclude: null,
      apiSortBy: 'created',
      domLinkSelector: 'a[href*="/pin/"]',
      domItemSelector: '.ContentItem.PinItem, .PinItem, .List-item',
      domTitleSelector: null,
      domSnippetSelector: '.PinItem-contentWrapper, .PinItem-content, .RichText',
      domLinkNormalizer: (href) => {
        try {
          const parsed = new URL(href, window.location.origin);
          const m = parsed.pathname.match(/\/pin\/(\d+)/);
          return m ? `https://www.zhihu.com/pin/${m[1]}` : '';
        } catch { return ''; }
      },
      apiItemToUrl: (item) => {
        const rawUrl = String(item?.url || '');
        if (rawUrl.startsWith('http')) return rawUrl.replace(/^http:\/\//, 'https://');
        if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
        const id = item?.id || item?.pin_id;
        return id ? `https://www.zhihu.com/pin/${id}` : '';
      },
      apiItemToTitle: (item) => `想法${item?.id || item?.pin_id || ''}`,
      apiItemToSnippet: (item) => {
        const html = typeof item?.contentHtml === 'string' ? item.contentHtml : '';
        const content = typeof item?.content === 'string' ? item.content : '';
        return (html || content || item?.excerpt || '').replace(/<[^>]*>/g, '').trim().slice(0, 260);
      },
      apiItemToExtraFields: (item) => {
        let fullHtml = typeof item?.contentHtml === 'string' ? item.contentHtml : '';
        if (!fullHtml && typeof item?.content === 'string') fullHtml = item.content;
        if (Array.isArray(item?.content)) {
          const textHtml = item.content
            .filter((entry) => entry?.type === 'text' && entry?.content)
            .map((entry) => `<p>${String(entry.content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
            .join('\n');
          const imgsHtml = item.content
            .filter((entry) => entry?.type === 'image' && entry?.originalUrl)
            .map((entry) => `<img src="${entry.originalUrl}" />`)
            .join('\n');
          const blocksHtml = [textHtml, imgsHtml].filter(Boolean).join('\n');
          if (blocksHtml) fullHtml += (fullHtml ? '\n' : '') + blocksHtml;
        }
        return {
          contentHtml: fullHtml,
          author: item?.author?.name || '知乎用户',
          createdTime: item?.created || null,
          updatedTime: item?.updated || null,
          voteCount: item?.voteupCount ?? item?.voteup_count ?? null,
          likeCount: item?.likedCount ?? item?.liked_count ?? item?.likeCount ?? null,
          favoriteCount: item?.favlistsCount ?? item?.favorite_count ?? null,
          commentCount: item?.commentCount ?? item?.comment_count ?? null,
          thanksCount: item?.thanksCount ?? item?.thanks_count ?? null,
        };
      },
      domItemToUrl: (data) => data?.type === 'pin' && data?.itemId ? `https://www.zhihu.com/pin/${data.itemId}` : '',
    },
  };
  const config = injectedConfigs[type];
  if (!config) throw new Error('未知的内容类型。');

  const match = window.location.pathname.match(/\/people\/([^/]+)/);
  if (!match) {
    throw new Error('当前标签页不是知乎个人主页。');
  }

  const slug = decodeURIComponent(match[1]);
  const limit = 20;
  const delayMs = 600;
  const include = config.apiInclude ? config.apiInclude.join(',') : null;
  const itemsByUrl = new Map();
  let remoteTotal = null;

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
      // Best-effort progress reporting.
    }
  };

  const rememberItem = (item) => {
    if (!item.url) return;
    const previous = itemsByUrl.get(item.url) || {};
    itemsByUrl.set(item.url, {
      url: item.url,
      title: clean(item.title || previous.title || '', 140),
      snippet: clean(item.snippet || previous.snippet || '', 260),
      contentHtml: item.contentHtml || previous.contentHtml || '',
      author: item.author || previous.author || '',
      createdTime: item.createdTime || previous.createdTime || null,
      updatedTime: item.updatedTime || previous.updatedTime || null,
      voteCount: item.voteCount ?? previous.voteCount ?? null,
      likeCount: item.likeCount ?? previous.likeCount ?? null,
      favoriteCount: item.favoriteCount ?? previous.favoriteCount ?? null,
      commentCount: item.commentCount ?? previous.commentCount ?? null,
      thanksCount: item.thanksCount ?? previous.thanksCount ?? null,
    });
  };

  const readDataJson = (element, attrName) => {
    const raw = element?.getAttribute(attrName);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const titleFromContainer = (container, anchor, fallback = '') => {
    if (!config.domTitleSelector) return fallback;
    return container?.querySelector(config.domTitleSelector)?.textContent || anchor?.textContent || fallback;
  };

  // DOM sniffing: find visible links on the current page.
  document.querySelectorAll(config.domLinkSelector).forEach((anchor) => {
    const url = config.domLinkNormalizer(anchor.getAttribute('href') || '');
    if (!url) return;
    const container = anchor.closest(config.domItemSelector) || anchor.parentElement;
    const snippetEl = container?.querySelector(config.domSnippetSelector);
    const id = url.match(/\/(?:p|pin|answer)\/(\d+)/)?.[1] || '';
    rememberItem({
      url,
      title: titleFromContainer(container, anchor, config.domTitleSelector ? '' : `${config.label}${id}`),
      snippet: snippetEl?.textContent || '',
    });
  });

  // Some cards expose the canonical id in data-zop while the visible link is
  // only a timestamp or is hidden behind expanded content.
  document.querySelectorAll(config.domItemSelector).forEach((container) => {
    const data = readDataJson(container, 'data-zop');
    const url = config.domItemToUrl(data);
    if (!url) return;
    const id = url.match(/\/(?:p|pin)\/(\d+)/)?.[1] || data?.itemId || '';
    const snippetEl = container.querySelector(config.domSnippetSelector);
    rememberItem({
      url,
      title: titleFromContainer(container, null, data?.title || `${config.label}${id}`),
      snippet: snippetEl?.textContent || '',
    });
  });

  report({
    phase: 'html',
    fetched: itemsByUrl.size,
    total: null,
    page: 0,
    message: `当前页面发现 ${itemsByUrl.size} 条${config.label}链接`,
  });

  const apiErrors = [];
  let apiSucceeded = false;

  for (const endpoint of config.apiEndpoints) {
    let offset = 0;
    let isEnd = false;
    try {
      while (!isEnd) {
        let apiUrl = endpoint(slug) + `?offset=${offset}&limit=${limit}`;
        if (config.apiSortBy) apiUrl += `&sort_by=${config.apiSortBy}`;
        if (include) apiUrl += `&include=${encodeURIComponent(include)}`;

        const response = await fetch(apiUrl, {
          credentials: 'include',
          headers: { 'X-Requested-With': 'Fetch' },
        });
        if (!response.ok) {
          throw new Error(`${apiUrl} HTTP ${response.status}`);
        }

        const data = await response.json();
        (data.data || []).forEach((item) => {
          const url = config.apiItemToUrl(item);
          if (!url) return;
          const extra = config.apiItemToExtraFields ? config.apiItemToExtraFields(item) : {};
          rememberItem({
            url,
            title: config.apiItemToTitle(item),
            snippet: config.apiItemToSnippet(item),
            ...extra,
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
          message: totalRemote ? `${uniqueCount} / ${totalRemote} 条${config.label}` : `已获取 ${uniqueCount} 条${config.label}`,
        });
        offset += limit;
        if (!isEnd) await sleep(delayMs);
      }
      apiSucceeded = true;
      break;
    } catch (error) {
      apiErrors.push(error.message);
    }
  }

  if (!apiSucceeded && itemsByUrl.size === 0 && apiErrors.length) {
    throw new Error(`知乎接口不可用：${apiErrors.join('；')}`);
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

// ============================
// Hydrate missing previews (injected into profile page)
// ============================
async function hydratePreviewsFromPage(type, runId, rawItems) {
  const injectedConfigs = {
    answers: {
      label: '回答',
      initialDataIdFromUrl: (url) => { const m = String(url || '').match(/\/answer\/(\d+)/); return m ? m[1] : ''; },
      hydrateApiUrl: (id) => `/api/v4/answers/${id}?include=` + encodeURIComponent(['content', 'excerpt', 'excerpt_new', 'summary', 'question.title'].join(',')),
      hydrateParseResponse: (data) => ({ title: data.question?.title || '', snippet: data.excerpt || data.excerpt_new || data.summary || data.content || '' }),
      hydrateDomSelectors: { title: '.QuestionHeader-title', content: '.RichContent-inner, .RichText' },
    },
    articles: {
      label: '文章',
      initialDataIdFromUrl: (url) => { const m = String(url || '').match(/\/p\/(\d+)/); return m ? m[1] : ''; },
      hydrateApiUrl: () => null,
      hydrateParseResponse: () => null,
      hydrateDomSelectors: { title: '.Post-Title', content: '.Post-RichText, .RichText' },
    },
    pins: {
      label: '想法',
      initialDataIdFromUrl: (url) => { const m = String(url || '').match(/\/pin\/(\d+)/); return m ? m[1] : ''; },
      hydrateApiUrl: () => null,
      hydrateParseResponse: () => null,
      hydrateDomSelectors: { title: null, content: '.PinItem-contentWrapper, .RichText' },
    },
  };
  const config = injectedConfigs[type];
  if (!config) throw new Error('未知的内容类型。');

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
      // Best-effort.
    }
  };

  const items = (rawItems || []).map((item) => ({ ...item }));
  // Only items with a URL that can be used for hydration
  const targets = items.filter((item) => !item.snippet && item.url);

  const domSel = config.hydrateDomSelectors;

  for (let index = 0; index < targets.length; index++) {
    const item = targets[index];
    report({
      phase: 'hydrate',
      fetched: index,
      total: targets.length,
      message: `${index} / ${targets.length} 条预览`,
    });

    try {
      // Try dedicated API if available
      const id = config.initialDataIdFromUrl(item.url);
      const apiUrl = id ? config.hydrateApiUrl(id) : null;
      let hydrated = false;

      if (apiUrl) {
        const response = await fetch(apiUrl, {
          credentials: 'include',
          headers: { 'X-Requested-With': 'Fetch' },
        });
        if (response.ok) {
          const data = await response.json();
          const parsed = config.hydrateParseResponse(data);
          if (parsed) {
            if (parsed.title) item.title = clean(parsed.title, 140);
            if (parsed.snippet) { item.snippet = clean(parsed.snippet, 260); hydrated = true; }
          }
        }
      }

      // Fallback: fetch the page directly
      if (!hydrated) {
        const pageResponse = await fetch(item.url, { credentials: 'include' });
        if (pageResponse.ok) {
          const pageHtml = await pageResponse.text();
          const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
          if (domSel.title) {
            const titleEl = doc.querySelector(domSel.title) || doc.querySelector('title');
            if (titleEl) {
              item.title = clean(titleEl.textContent?.replace(/\s*-\s*知乎$/, '') || item.title || '', 140);
            }
          }
          if (domSel.content) {
            const contentEl = doc.querySelector(domSel.content.split(',')[0]);
            if (contentEl) {
              item.snippet = clean(contentEl.textContent || '', 260);
            } else {
              const anyRich = doc.querySelector(domSel.content);
              if (anyRich) item.snippet = clean(anyRich.textContent || '', 260);
            }
          }
        }
      }
    } catch {
      // Keep existing item on failure.
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

// ============================
// Collect URLs (orchestrator)
// ============================
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
      func: scrapeContentFromPage,
      args: [state.currentType, state.collectRunId],
    });
    if (result.error) throw new Error(result.error.message);

    const collected = result.result || {};
    const previousUrlCount = state.urls.length;
    const collectedItems = normalizeItems(collected.items || collected.urls || []);
    const merged = mergeItems(state.items, collectedItems);
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

// ============================
// Hydrate missing previews (orchestrator)
// ============================
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
      args: [state.currentType, state.collectRunId, state.items],
    });
    if (result.error) throw new Error(result.error.message);

    state.items = mergeItems(state.items, normalizeItems(result.result || []));
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

// ============================
// Content URL parsing
// ============================
function parseContentUrl(url) {
  const config = currentConfig();
  const id = config.initialDataIdFromUrl(url);
  if (!id) return null;
  return { id };
}

// ============================
// Content extraction (dual-source)
// ============================
function extractContent(url, pageHtml) {
  const config = currentConfig();
  const ids = parseContentUrl(url);
  if (!ids) return null;

  const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
  const script = doc.querySelector('#js-initialData');
  let fromData = null;

  // Source 1: js-initialData JSON
  if (script?.textContent) {
    try {
      const initialData = JSON.parse(script.textContent);
      const entityData = initialData?.initialState?.entities?.[config.initialDataEntity]?.[ids.id];
      if (entityData) {
        const base = {
          title: config.initialDataTitle(entityData, initialData),
          author: config.initialDataAuthor(entityData, initialData),
          html: config.initialDataContent(entityData, initialData),
        };
        const supp = config.initialDataSupplementHtml(entityData, initialData);
        if (supp) base.html += supp;
        fromData = {
          ...base,
          title: base.title || '',
          author: base.author || '知乎用户',
          createdTime: config.initialDataCreated(entityData),
          updatedTime: config.initialDataUpdated(entityData),
          ...(config.initialDataMetadata ? config.initialDataMetadata(entityData) : {}),
        };
      }
    } catch {
      // Fall through to DOM.
    }
  }

  // Source 2: DOM extraction
  const sel = config.domSelectors;
  let fromDOM = null;
  const contentEl = sel.content ? doc.querySelector(sel.content) : null;
  const titleEl = sel.title ? (doc.querySelector(sel.title) || doc.querySelector('title')) : null;
  const authorEl = sel.author ? doc.querySelector(sel.author) : null;
  const elementText = (el) => el?.getAttribute?.('content') || el?.textContent || '';
  const metaContent = (itemprop) => doc.querySelector(`meta[itemprop="${itemprop}"]`)?.getAttribute('content') || '';
  const parseDateSeconds = (value) => {
    if (!value) return null;
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? null : Math.floor(millis / 1000);
  };
  const parseCount = (value) => {
    if (value === '' || value == null) return null;
    const number = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(number) ? number : null;
  };

  if (contentEl) {
    let title = '';
    if (sel.title && titleEl) {
      title = cleanText(elementText(titleEl).replace(/\s*-\s*知乎$/, ''), 200);
    } else if (!config.hasTitle) {
      title = `${config.defaultName}${ids.id}`;
    }
    fromDOM = {
      title,
      author: authorEl ? cleanText(elementText(authorEl) || '知乎用户', 120) : '知乎用户',
      html: contentEl.innerHTML,
      createdTime: parseDateSeconds(metaContent('dateCreated') || metaContent('datePublished')),
      updatedTime: parseDateSeconds(metaContent('dateModified')),
      voteCount: parseCount(metaContent('upvoteCount') || metaContent('voteupCount')),
      likeCount: parseCount(metaContent('likeCount')),
      favoriteCount: parseCount(metaContent('favoriteCount') || metaContent('favlistsCount')),
      commentCount: parseCount(metaContent('commentCount')),
      thanksCount: parseCount(metaContent('thanksCount') || metaContent('thankedCount')),
    };
  }

  // Choose the longer HTML source
  const chosen =
    fromData && fromDOM
      ? fromDOM.html.length > fromData.html.length
        ? fromDOM
        : fromData
      : fromData || fromDOM;

  if (!chosen?.html) return null;

  const metadata = {};
  for (const field of ['createdTime', 'updatedTime', 'voteCount', 'likeCount', 'favoriteCount', 'commentCount', 'thanksCount']) {
    metadata[field] = fromData?.[field] ?? fromDOM?.[field] ?? null;
  }

  // Synthesize title for types without one
  const finalTitle = chosen.title || `${config.defaultName}${ids.id}`;

  return {
    ...ids,
    url,
    type: state.currentType,
    title: finalTitle,
    author: chosen.author || '知乎用户',
    html: chosen.html,
    ...metadata,
  };
}

// ============================
// Markdown conversion
// ============================
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
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`;
}

function formatUtcTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts * 1000);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

// ============================
// Build Markdown from extracted content
// ============================
function buildMarkdown(data) {
  const config = currentConfig();
  const escapeYaml = (value) => String(value || '').replace(/"/g, '\\"');
  const idField = state.currentType === 'answers' ? 'id' : 'id';
  const lines = [
    '---',
    `id: "${escapeYaml(data.id)}"`,
    `title: "${escapeYaml(data.title)}"`,
    `author: "${escapeYaml(data.author)}"`,
    `type: ${config.frontmatterType}`,
    `source: "${escapeYaml(data.url)}"`,
  ];
  const created = formatTimestamp(data.createdTime);
  const updated = formatTimestamp(data.updatedTime);
  if (created) lines.push(`created: "${created}"`);
  const createdUtc = formatUtcTimestamp(data.createdTime);
  if (createdUtc) lines.push(`created_utc: "${createdUtc}"`);
  if (updated) lines.push(`updated: "${updated}"`);
  const updatedUtc = formatUtcTimestamp(data.updatedTime);
  if (updatedUtc) lines.push(`updated_utc: "${updatedUtc}"`);
  for (const [key, field] of [
    ['vote_count', 'voteCount'],
    ['like_count', 'likeCount'],
    ['favorite_count', 'favoriteCount'],
    ['comment_count', 'commentCount'],
    ['thanks_count', 'thanksCount'],
  ]) {
    lines.push(`${key}: ${data[field] == null ? 'null' : Number(data[field])}`);
  }
  lines.push(`downloaded: "${new Date().toISOString().slice(0, 10)}"`, '---', '');
  lines.push(`# ${data.title}`, '', htmlToMarkdown(data.html), '');
  return lines.join('\n');
}

function sanitizeFilenamePart(value) {
  const defaultName = currentConfig().defaultName;
  return cleanText(value || '', 80)
    .replace(/[\\/:*?"<>|#^[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || `zhihu-${defaultName}`;
}

function buildFilename(data) {
  const config = currentConfig();
  return `${sanitizeFilenamePart(data.title)}-${data.id}.md`;
}

// ============================
// ZIP utilities (unchanged logic)
// ============================
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
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
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
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
      u32(crc), u32(dataBytes.length), u32(dataBytes.length), u16(nameBytes.length), u16(0),
      nameBytes,
    ];
    parts.push(...localHeader, dataBytes);

    centralParts.push(
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date),
      u32(crc), u32(dataBytes.length), u32(dataBytes.length), u16(nameBytes.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
    );
    offset += localHeader.reduce((sum, part) => sum + part.length, 0) + dataBytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const endRecord = [u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(centralOffset), u16(0)];
  return new Blob([...parts, ...centralParts, ...endRecord], { type: 'application/zip' });
}

function downloadBlob(blob, filename) {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(blob);
    chrome.downloads.download(
      { url: blobUrl, filename, saveAs: true },
      (downloadId) => {
        const error = chrome.runtime.lastError;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        if (error) { reject(new Error(error.message)); return; }
        resolve(downloadId);
      }
    );
  });
}

function selectedItems() {
  return state.items.filter((item) => state.selected.has(item.url));
}

// ============================
// Export ZIP
// ============================
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

  const config = currentConfig();
  const files = [];
  const failures = [];

  try {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (state.exportAbortController.signal.aborted) {
        throw new Error('导出已取消。');
      }

      // For pins: use cached contentHtml directly (no standalone pin pages)
      if (state.currentType === 'pins' && item.contentHtml) {
        appendLog(`使用缓存内容：${item.url}`);
        try {
          const pinId = item.url.match(/\/pin\/(\d+)/)?.[1] || item.title.replace(/^想法/, '') || '';
          const content = {
            id: pinId,
            url: item.url,
            title: item.title || `想法${pinId}`,
            author: item.author || '知乎用户',
            html: item.contentHtml,
            createdTime: item.createdTime || null,
            updatedTime: item.updatedTime || null,
            voteCount: item.voteCount ?? null,
            likeCount: item.likeCount ?? null,
            favoriteCount: item.favoriteCount ?? null,
            commentCount: item.commentCount ?? null,
            thanksCount: item.thanksCount ?? null,
          };
          const markdown = buildMarkdown(content);
          files.push({ name: `${config.folderName}/${buildFilename(content)}`, data: markdown });
          appendLog(`已加入：${content.title}`);
        } catch (error) {
          failures.push({ url: item.url, error: error.message });
          appendLog(`失败 ${item.url}：${error.message}`);
        }
      } else {
        appendLog(`正在获取 ${item.url}`);
        try {
          const response = await fetch(item.url, {
            credentials: 'include',
            signal: state.exportAbortController.signal,
          });
          if (!response.ok) throw new Error(`请求失败：HTTP ${response.status}`);
          const html = await response.text();
          const content = extractContent(item.url, html);
          if (content) {
            for (const field of ['createdTime', 'updatedTime', 'voteCount', 'likeCount', 'favoriteCount', 'commentCount', 'thanksCount']) {
              content[field] = content[field] ?? item[field] ?? null;
            }
          }
          if (!content) throw new Error(`无法提取${config.label}内容。`);
          const markdown = buildMarkdown(content);
          files.push({ name: `${config.folderName}/${buildFilename(content)}`, data: markdown });
          appendLog(`已加入：${content.title}`);
        } catch (error) {
          failures.push({ url: item.url, error: error.message });
          appendLog(`失败 ${item.url}：${error.message}`);
        }
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
    const filename = `zhihu_${config.labelEn}_${state.slug || 'export'}_${datePart}.zip`;
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

// ============================
// Render functions
// ============================
function renderUrls() {
  const config = currentConfig();
  els.cacheStatus.textContent = state.remoteTotal
    ? `${state.items.length} / ${state.remoteTotal}`
    : `${state.items.length} 条`;
  els.lastCollectedText.textContent = state.lastCollectedAt ? formatTime(state.lastCollectedAt) : '';

  if (state.items.length === 0) {
    els.urlList.innerHTML = `<div class="empty">当前主页还没有缓存的${config.label}链接。</div>`;
    renderSelection();
    return;
  }

  els.urlList.innerHTML = state.items
    .map((item, index) => {
      const checked = state.selected.has(item.url) ? 'checked' : '';
      const title = item.title || `未命名知乎${config.label}`;
      const snippet = item.snippet || `还没有采集到预览内容。可点击"补全预览"。`;
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

// ============================
// Message listener (collection progress)
// ============================
chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'collectionProgress') return;
  if (message.runId !== state.collectRunId) return;

  const fetched = message.fetched || 0;
  const total = message.total || 0;
  if (total > 0) {
    setProgress(
      els.collectProgressFill, els.collectProgressText,
      (fetched / total) * 100,
      message.message || `${fetched} / ${total} 条`
    );
    return;
  }

  const rollingPercent = message.phase === 'html' ? 5 : Math.min(95, 10 + fetched);
  setProgress(
    els.collectProgressFill, els.collectProgressText,
    rollingPercent,
    message.message || `已获取 ${fetched} 条链接`
  );
});

// ============================
// Clear cache
// ============================
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

// ============================
// Event wiring
// ============================
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

// Type selector event delegation
els.typeSelector.addEventListener('click', (event) => {
  const btn = event.target.closest('.type-btn');
  if (!btn) return;
  const type = btn.dataset.type;
  if (type) switchType(type);
});

// ============================
// Initialization
// ============================
(async function init() {
  setStatus(els.serviceStatus, 'ZIP 下载', true);
  els.jobStatus.textContent = '当前没有导出任务';
  els.cancelButton.disabled = true;
  await loadCacheForActiveTab();
  await checkCookie();
})();
