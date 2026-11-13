'use strict';

const Helpers = globalThis.ZhihuOpenPlatformHelpers;

function escapePinHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pinImageUrl(entry) {
  const explicitUrl = entry?.originalUrl
    || entry?.original_url
    || entry?.image?.originalUrl
    || entry?.image?.original_url
    || entry?.image?.url
    || entry?.imageInfo?.originalUrl
    || entry?.imageInfo?.original_url
    || entry?.content?.originalUrl
    || entry?.content?.original_url;
  if (explicitUrl) return explicitUrl;
  const genericUrl = entry?.url || entry?.src || '';
  const type = String(entry?.type || '').toLowerCase();
  return type.includes('image') || /(?:\.jpe?g|\.png|\.gif|\.webp|\.avif)(?:[?#]|$)|zhimg\.com/i.test(String(genericUrl))
    ? genericUrl
    : '';
}

function pinLinkCardHtml(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const url = entry.url
    || entry.href
    || entry.link
    || entry.target?.url
    || entry.content?.url
    || entry.question?.url
    || '';
  if (!url || !/^https?:\/\//i.test(String(url))) return '';
  const title = entry.title
    || entry.text
    || entry.content?.title
    || entry.target?.title
    || entry.question?.title
    || entry.target?.question?.title
    || url;
  return `<p><a href="${escapePinHtml(url)}">${escapePinHtml(title)}</a></p>`;
}

function pinContentToHtml(item) {
  const parts = [];
  const imageUrls = new Set();
  const linkUrls = new Set();
  let knownText = '';

  const addHtml = (html) => {
    const value = typeof html === 'string' ? html.trim() : '';
    if (!value) return;
    parts.push(value);
    knownText += ` ${value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}`;
  };
  const addText = (text) => {
    const value = typeof text === 'string' ? text.trim() : '';
    if (!value || knownText.includes(value)) return;
    addHtml(`<p>${escapePinHtml(value).replace(/\r?\n/g, '<br>')}</p>`);
  };
  const addImage = (entry) => {
    const url = String(pinImageUrl(entry) || '').trim();
    if (!url || imageUrls.has(url) || parts.some((part) => part.includes(url))) return;
    imageUrls.add(url);
    addHtml(`<img src="${escapePinHtml(url)}" alt="" />`);
  };
  const addLinkCard = (entry) => {
    const html = pinLinkCardHtml(entry);
    if (!html) return;
    const url = String(entry?.url || entry?.href || entry?.link || entry?.target?.url || entry?.content?.url || entry?.question?.url || '');
    if (linkUrls.has(url) || parts.some((part) => part.includes(url))) return;
    linkUrls.add(url);
    addHtml(html);
  };

  addHtml(item?.contentHtml);
  if (typeof item?.content === 'string') addHtml(item.content);

  if (Array.isArray(item?.content)) {
    item.content.forEach((entry) => {
      const type = String(entry?.type || '').toLowerCase();
      const text = typeof entry?.content === 'string' ? entry.content : (entry?.text || entry?.content?.text || '');
      if (['text', 'paragraph', 'title'].includes(type) || (!type && text)) addText(text);
      if (type.includes('image') || pinImageUrl(entry)) addImage(entry);
      if (type.includes('link') || type.includes('quote') || type.includes('reference')) addLinkCard(entry);
    });
  }

  for (const images of [item?.images, item?.imageList, item?.image_list]) {
    if (Array.isArray(images)) images.forEach(addImage);
  }
  for (const card of [item?.target, item?.quote, item?.quoted, item?.repost, item?.repin, item?.linkCard, item?.link_card, item?.attachedInfo, item?.attached_info]) {
    addLinkCard(card);
  }

  return parts.join('\n');
}

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
    urlFilter: (url) => /^https:\/\/www\.zhihu\.com\/(?:question\/\d+\/answer\/|answer\/)\d+/.test(url),
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
      return {
        contentHtml: pinContentToHtml(item),
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
    initialDataContent: (data) => pinContentToHtml(data),
    initialDataAuthor: (data, initialData) => {
      if (data?.author?.name) return data.author.name;
      if (data?.authorName) return data.authorName;
      const users = initialData?.initialState?.entities?.users || {};
      const authorId = data?.author?.id || data?.authorId || data?.author_id;
      if (authorId && users[authorId]?.name) return users[authorId].name;
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
  zvideos: {
    label: '视频',
    labelEn: 'zvideos',
    folderName: 'zvideos',
    frontmatterType: 'zhihu-zvideo',
    hasTitle: true,
    supportsTruncated: false,
    urlFilter: (url) => /zhihu\.com\/zvideo\/\d+/.test(url),
    initialDataIdFromUrl: (url) => { const m = String(url || '').match(/\/zvideo\/(\d+)/); return m ? m[1] : ''; },
    defaultName: '视频',
  },
  collections: {
    label: '收藏夹',
    labelEn: 'collections',
    folderName: 'collections',
    frontmatterType: 'zhihu-collection-item',
    hasTitle: true,
    supportsTruncated: false,
    urlFilter: (url) => Boolean(url),
    defaultName: '收藏',
  },
  stats: {
    label: '创作数据',
    labelEn: 'stats',
    folderName: 'stats',
    frontmatterType: 'zhihu-stats',
    hasTitle: true,
    supportsTruncated: false,
    urlFilter: () => false,
    defaultName: '创作数据',
  },
};

const RECENT_COLLECTIONS_TOKEN = '__recent_collections__';

// ============================
// DOM element references
// ============================
const els = {
  activeTabText: document.getElementById('activeTabText'),
  refreshButton: document.getElementById('refreshButton'),
  serviceStatus: document.getElementById('serviceStatus'),
  cookieStatus: document.getElementById('cookieStatus'),
  openPlatformStatus: document.getElementById('openPlatformStatus'),
  cacheStatus: document.getElementById('cacheStatus'),
  openPlatformToggle: document.getElementById('openPlatformToggle'),
  openPlatformBody: document.getElementById('openPlatformBody'),
  accessSecretInput: document.getElementById('accessSecretInput'),
  saveSecretButton: document.getElementById('saveSecretButton'),
  probeSecretButton: document.getElementById('probeSecretButton'),
  clearSecretButton: document.getElementById('clearSecretButton'),
  openPlatformHint: document.getElementById('openPlatformHint'),
  mySlugInput: document.getElementById('mySlugInput'),
  saveMySlugButton: document.getElementById('saveMySlugButton'),
  officialSortBar: document.getElementById('officialSortBar'),
  officialSortSelect: document.getElementById('officialSortSelect'),
  favlistPicker: document.getElementById('favlistPicker'),
  favlistSelect: document.getElementById('favlistSelect'),
  refreshFavlistsButton: document.getElementById('refreshFavlistsButton'),
  favlistSourceSelect: document.getElementById('favlistSourceSelect'),
  favlistDescHint: document.getElementById('favlistDescHint'),
  collectControlsSection: document.getElementById('collectControlsSection'),
  collectButton: document.getElementById('collectButton'),
  hydrateButton: document.getElementById('hydrateButton'),
  collectProgressText: document.getElementById('collectProgressText'),
  collectProgressFill: document.getElementById('collectProgressFill'),
  timeFilterSection: document.getElementById('timeFilterSection'),
  dateFilterFieldSelect: document.getElementById('dateFilterFieldSelect'),
  selectionBarSection: document.getElementById('selectionBarSection'),
  selectedCount: document.getElementById('selectedCount'),
  lastCollectedText: document.getElementById('lastCollectedText'),
  selectAllButton: document.getElementById('selectAllButton'),
  selectNoneButton: document.getElementById('selectNoneButton'),
  clearCacheButton: document.getElementById('clearCacheButton'),
  urlList: document.getElementById('urlList'),
  exportOptionsSection: document.getElementById('exportOptionsSection'),
  exportFooterSection: document.getElementById('exportFooterSection'),
  exportButton: document.getElementById('exportButton'),
  cancelButton: document.getElementById('cancelButton'),
  jobStatus: document.getElementById('jobStatus'),
  jobCounts: document.getElementById('jobCounts'),
  exportProgressText: document.getElementById('exportProgressText'),
  exportProgressFill: document.getElementById('exportProgressFill'),
  exportProgressBlock: document.getElementById('exportProgressBlock'),
  jobLog: document.getElementById('jobLog'),
  typeSelector: document.getElementById('typeSelector'),
  dateFilterFrom: document.getElementById('dateFilterFrom'),
  dateFilterTo: document.getElementById('dateFilterTo'),
  clearDateFilterButton: document.getElementById('clearDateFilterButton'),
  downloadImagesCheckbox: document.getElementById('downloadImagesCheckbox'),
  preferOfficialDetailCheckbox: document.getElementById('preferOfficialDetailCheckbox'),
  includeCommentsCheckbox: document.getElementById('includeCommentsCheckbox'),
  commentOptionsRow: document.getElementById('commentOptionsRow'),
  commentOrderSelect: document.getElementById('commentOrderSelect'),
  commentMaxPagesSelect: document.getElementById('commentMaxPagesSelect'),
  includeContentStatsCheckbox: document.getElementById('includeContentStatsCheckbox'),
  statsView: document.getElementById('statsView'),
  statsUpdatedText: document.getElementById('statsUpdatedText'),
  statsContentTypeSelect: document.getElementById('statsContentTypeSelect'),
  statsStartDate: document.getElementById('statsStartDate'),
  statsEndDate: document.getElementById('statsEndDate'),
  clearStatsDateButton: document.getElementById('clearStatsDateButton'),
  loadAccountStatsButton: document.getElementById('loadAccountStatsButton'),
  exportStatsReportButton: document.getElementById('exportStatsReportButton'),
  accountStatsResult: document.getElementById('accountStatsResult'),
  singleStatsUrlInput: document.getElementById('singleStatsUrlInput'),
  fillCurrentTabUrlButton: document.getElementById('fillCurrentTabUrlButton'),
  loadSingleStatsButton: document.getElementById('loadSingleStatsButton'),
  singleStatsResult: document.getElementById('singleStatsResult'),
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
  dateFilterFrom: '',
  dateFilterTo: '',
  dateFilterField: 'createdTime',
  openPlatform: { configured: false, masked: '', mySlug: '' },
  favlists: [],
  selectedFavlistToken: '',
  accountStats: null,
  accountStatsQuery: null,
};

function favlistLog(event, details) {
  if (details === undefined) {
    console.log(`[ZhihuExporter][favlist] ${event}`);
    return;
  }
  console.log(`[ZhihuExporter][favlist] ${event}`, details);
}

function favlistCountBy(items, keyFn) {
  const counts = {};
  (items || []).forEach((item) => {
    const key = String(keyFn(item) || '(empty)');
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

// ============================
// Config helper
// ============================
function configFor(type = state.currentType) {
  return CONTENT_TYPES[type] || CONTENT_TYPES.answers;
}

function currentConfig() {
  return configFor(state.currentType);
}

function isCollectionsMode() {
  return state.currentType === 'collections';
}

function isZvideosMode() {
  return state.currentType === 'zvideos';
}

function isStatsMode() {
  return state.currentType === 'stats';
}

function isOfficialMyCreationsMode() {
  if (isCollectionsMode() || isStatsMode() || !state.openPlatform.configured) return false;
  if (isZvideosMode()) return true;
  if (!state.slug) return true;
  return Boolean(state.openPlatform.mySlug && state.openPlatform.mySlug === state.slug);
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
  if (isCollectionsMode()) {
    return `zhihuFavlist:${state.selectedFavlistToken || 'none'}`;
  }
  if (isOfficialMyCreationsMode()) {
    const owner = slug || state.openPlatform.mySlug;
    return owner ? `zhihuProfile:${owner}:${state.currentType}` : `zhihuMe:contents:${state.currentType}`;
  }
  return `zhihuProfile:${slug}:${state.currentType}`;
}

function favlistsCacheKey() {
  return 'zhihuFavlists';
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

function setExportProgressVisible(visible) {
  els.exportProgressBlock.hidden = !visible;
}

function dateInputToStartSeconds(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

function dateInputToEndSeconds(value) {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

function hasDateFilter() {
  return Boolean(state.dateFilterFrom || state.dateFilterTo);
}

function itemMatchesDateFilter(item) {
  if (!hasDateFilter()) return true;
  const field = isCollectionsMode() && state.dateFilterField === 'favTime' ? 'favTime' : 'createdTime';
  const ts = item[field];
  if (!ts) return false;
  const fromTs = dateInputToStartSeconds(state.dateFilterFrom);
  const toTs = dateInputToEndSeconds(state.dateFilterTo);
  if (fromTs != null && ts < fromTs) return false;
  if (toTs != null && ts > toTs) return false;
  return true;
}

function filteredItems() {
  return state.items.filter(itemMatchesDateFilter);
}

function formatCreatedDate(ts) {
  if (!ts) return '';
  const date = new Date(ts * 1000);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function syncDateFilterInputs() {
  els.dateFilterFrom.value = state.dateFilterFrom;
  els.dateFilterTo.value = state.dateFilterTo;
}

function applyDateFilterFromInputs() {
  state.dateFilterFrom = els.dateFilterFrom.value;
  state.dateFilterTo = els.dateFilterTo.value;
  if (state.dateFilterFrom && state.dateFilterTo && state.dateFilterFrom > state.dateFilterTo) {
    [state.dateFilterFrom, state.dateFilterTo] = [state.dateFilterTo, state.dateFilterFrom];
    syncDateFilterInputs();
  }
  renderUrls();
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

function isExpectedProfilePage(url, type = state.currentType) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('zhihu.com')) return false;
    const match = parsed.pathname.replace(/\/+$/, '').match(/^\/people\/([^/]+)\/([^/]+)$/);
    if (!match) return false;
    const expectedSections = { answers: ['answers'], articles: ['posts'], pins: ['pins', 'zhi'] }[type] || [];
    return expectedSections.includes(match[2]);
  } catch {
    return false;
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
        return {
          url: item, title: '', snippet: '', contentHtml: '', author: '',
          createdTime: null, updatedTime: null, voteCount: null, likeCount: null,
          favoriteCount: null, commentCount: null, thanksCount: null,
          exportType: inferExportType(item), officialContentType: '',
          favTime: null, favlistTitle: '', favlistUrlToken: '', unsupportedReason: '',
        };
      }
      const url = String(item?.url || '').trim();
      const exportType = item?.exportType || inferExportType(url, item?.officialContentType);
      return {
        url,
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
        exportType,
        officialContentType: item?.officialContentType || '',
        favTime: item?.favTime || null,
        favlistTitle: item?.favlistTitle || '',
        favlistUrlToken: item?.favlistUrlToken || '',
        unsupportedReason: item?.unsupportedReason || unsupportedReasonFor(url, item?.officialContentType, exportType),
      };
    })
    .filter((item) => config.urlFilter(item.url));
}

function itemMergeKey(item) {
  return Helpers.itemMergeKey(item);
}

function mergeItems(existingItems, incomingItems) {
  const map = new Map();
  normalizeItems(existingItems).forEach((item) => map.set(itemMergeKey(item), item));
  normalizeItems(incomingItems).forEach((item) => {
    const key = itemMergeKey(item);
    const previous = map.get(key) || {};
    const officialContentType = item.officialContentType || previous.officialContentType || '';
    const mergedUrl = Helpers.pickPreferredUrl(item.url, previous.url, officialContentType);
    const exportType = item.exportType || previous.exportType || inferExportType(mergedUrl, officialContentType);
    map.set(key, {
      url: mergedUrl,
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
      exportType,
      officialContentType,
      favTime: item.favTime || previous.favTime || null,
      favlistTitle: item.favlistTitle || previous.favlistTitle || '',
      favlistUrlToken: item.favlistUrlToken || previous.favlistUrlToken || '',
      unsupportedReason: unsupportedReasonFor(mergedUrl, officialContentType, exportType),
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
// Open platform
// ============================
const OFFICIAL_CONTENT_TYPE = {
  answers: 'answer',
  articles: 'article',
  pins: 'pin',
  zvideos: 'zvideo',
};

function stripTrackingParams(url) {
  return Helpers.stripTrackingParams(url);
}

function inferExportType(url, officialContentType = '') {
  return Helpers.extractZhihuContentIdentity(url, officialContentType).exportType;
}

function unsupportedReasonFor(url, officialContentType, exportType) {
  const type = String(officialContentType || '').toLowerCase();
  if (type === 'zvideo') {
    return isZvideosMode() && state.openPlatform.configured
      ? ''
      : '视频仅支持在“视频(我的创作)”中通过官方全文 API 导出关联正文';
  }
  if (type === 'question') return '问题页暂不支持全文导出';
  if (exportType) return '';
  return url ? '暂不支持该类型的全文导出' : '缺少内容链接';
}

function officialItemToLocal(item, extra = {}) {
  let url = stripTrackingParams(item?.Url || item?.url || '');
  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('http://')) url = url.replace(/^http:\/\//, 'https://');
  const officialContentType = String(item?.ContentType || extra.officialContentType || '').toLowerCase();
  const exportType = inferExportType(url, officialContentType);
  return {
    url,
    title: item?.Title || extra.title || '',
    snippet: item?.Summary || extra.snippet || '',
    author: item?.Author?.Name || extra.author || '',
    createdTime: item?.CreatedAt ?? extra.createdTime ?? null,
    updatedTime: extra.updatedTime ?? null,
    voteCount: item?.LikeCount ?? extra.voteCount ?? null,
    likeCount: item?.LikeCount ?? extra.likeCount ?? null,
    favoriteCount: item?.FavoriteCount ?? extra.favoriteCount ?? null,
    commentCount: item?.CommentCount ?? extra.commentCount ?? null,
    thanksCount: extra.thanksCount ?? null,
    contentHtml: extra.contentHtml || '',
    exportType,
    officialContentType,
    favTime: item?.FavTime ?? extra.favTime ?? null,
    favlistTitle: extra.favlistTitle || '',
    favlistUrlToken: extra.favlistUrlToken || '',
    unsupportedReason: unsupportedReasonFor(url, officialContentType, exportType),
  };
}

function excerptFromV4Content(content) {
  const raw = content?.excerpt || content?.excerpt_new || content?.excerpt_title || '';
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  if (typeof content?.content === 'string') {
    return content.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  }
  return '';
}

function v4CollectionItemToLocal(entry, extra = {}) {
  const content = entry?.content || entry?.target || entry || {};
  const type = String(content.type || entry?.type || '').toLowerCase();
  let url = String(content.url || '').trim();
  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('http://')) url = url.replace(/^http:\/\//, 'https://');
  if (!url || /(?:^|\/\/)(?:api|www)\.zhihu\.com\/(?:api\/|answers\/|articles\/|pins\/)/.test(url)) {
    if (type === 'answer' && content.id) {
      const questionId = content.question?.id;
      url = questionId
        ? `https://www.zhihu.com/question/${questionId}/answer/${content.id}`
        : `https://www.zhihu.com/answer/${content.id}`;
    } else if ((type === 'article' || type === 'post') && content.id) {
      url = `https://zhuanlan.zhihu.com/p/${content.id}`;
    } else if (type === 'pin' && content.id) {
      url = `https://www.zhihu.com/pin/${content.id}`;
    } else if ((type === 'zvideo' || type === 'zvideo_answer') && content.id) {
      url = `https://www.zhihu.com/zvideo/${content.id}`;
    } else if (type === 'question' && content.id) {
      url = `https://www.zhihu.com/question/${content.id}`;
    }
  }

  const title = String(content.question?.title || content.title || extra.title || '').trim()
    || (type === 'pin' && content.id ? `想法 ${content.id}` : '');
  const exportType = inferExportType(url, type);
  if (!url) {
    url = `zhihu:unresolved/${extra.favlistUrlToken || 'fav'}/${type || 'item'}/${content.id || title || 'unknown'}`;
  }
  return {
    url: stripTrackingParams(url),
    title,
    snippet: excerptFromV4Content(content),
    contentHtml: '',
    author: String(content.author?.name || '').trim(),
    createdTime: content.created_time || content.created || null,
    updatedTime: content.updated_time || content.updated || null,
    voteCount: content.voteup_count ?? null,
    likeCount: content.liked_count ?? content.reaction_count ?? null,
    favoriteCount: content.favlists_count ?? content.favorite_count ?? null,
    commentCount: content.comment_count ?? null,
    thanksCount: content.thanks_count ?? null,
    exportType,
    officialContentType: type,
    favTime: entry?.created || entry?.collected_time || entry?.collected_at || null,
    favlistTitle: extra.favlistTitle || '',
    favlistUrlToken: extra.favlistUrlToken || '',
    unsupportedReason: unsupportedReasonFor(url, type, exportType),
  };
}

function collectionIdsToTry(folder, token) {
  const ids = [];
  const add = (value) => {
    const normalized = String(value || '').trim();
    if (normalized && !ids.includes(normalized)) ids.push(normalized);
  };
  add(token);
  add(folder?.urlToken);
  const match = String(folder?.url || '').match(/\/collection\/([^/?#]+)/i);
  if (match) {
    try {
      add(decodeURIComponent(match[1]));
    } catch {
      add(match[1]);
    }
  }
  return ids;
}

function readPaging(data) {
  return Helpers.readOfficialPaging(data);
}

function nextPageOffset(paging, currentOffset, seenOffsets = null) {
  return Helpers.nextOfficialPageOffset(paging, currentOffset, seenOffsets);
}

async function sendRuntimeMessage(message) {
  return chrome.runtime.sendMessage(message);
}

async function refreshOpenPlatformStatus() {
  try {
    const result = await sendRuntimeMessage({ type: 'getOpenPlatformStatus' });
    if (!result?.ok) {
      state.openPlatform = { configured: false, masked: '', mySlug: '' };
      setStatus(els.openPlatformStatus, '读取失败', false);
      if (els.openPlatformHint) els.openPlatformHint.textContent = result?.error || '无法读取开放平台状态。';
      return state.openPlatform;
    }
    state.openPlatform = {
      configured: Boolean(result.configured),
      masked: result.masked || '',
      mySlug: result.mySlug || '',
    };
    if (els.mySlugInput && document.activeElement !== els.mySlugInput) {
      els.mySlugInput.value = state.openPlatform.mySlug;
    }
    if (els.accessSecretInput && !els.accessSecretInput.value && result.masked) {
      els.accessSecretInput.placeholder = result.masked;
    }
    setStatus(
      els.openPlatformStatus,
      result.configured ? (result.masked || '已配置') : '未配置',
      result.configured ? true : null
    );
    if (els.openPlatformHint) {
      els.openPlatformHint.textContent = result.configured
        ? `已保存 ${result.masked}。探测会消耗少量额度。`
        : '未配置。配置后可导出收藏夹，并在自己的主页走官方目录。';
    }
    return state.openPlatform;
  } catch {
    setStatus(els.openPlatformStatus, '读取失败', false);
    return state.openPlatform;
  }
}

async function openPlatformRequestRaw(path, query, method = 'GET', options = {}) {
  const result = await sendRuntimeMessage({
    type: 'openPlatformRequest',
    method,
    path,
    query,
    body: options.body,
    preserveLargeInts: Boolean(options.preserveLargeInts),
  });
  return result || { ok: false, code: 'NO_RESPONSE', error: '开放平台无响应' };
}

async function openPlatformRequest(path, query, method = 'GET', options = {}) {
  const result = await openPlatformRequestRaw(path, query, method, options);
  if (!result?.ok) {
    const err = new Error(result?.error || '开放平台请求失败');
    err.code = result?.code;
    throw err;
  }
  return result.data || {};
}

function shouldUseOfficialContents() {
  if (isZvideosMode()) return Boolean(state.openPlatform.configured);
  const mySlug = state.openPlatform.mySlug;
  if (!state.openPlatform.configured) return false;
  if (!state.slug) return true;
  return Boolean(mySlug && mySlug === state.slug);
}

async function detectMySlugFromPage() {
  if (!state.tab?.id || !/zhihu\.com/.test(state.tab.url || '')) return '';
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: state.tab.id },
      func: async () => {
        try {
          const response = await fetch('/api/v4/me', {
            credentials: 'include',
            headers: { 'X-Requested-With': 'Fetch' },
          });
          if (!response.ok) return '';
          const data = await response.json();
          return data.url_token || data.urlToken || '';
        } catch {
          return '';
        }
      },
    });
    return result?.result || '';
  } catch {
    return '';
  }
}

async function maybeFillMySlug() {
  if (state.openPlatform.mySlug || !state.openPlatform.configured) return;
  const slug = await detectMySlugFromPage();
  if (!slug) return;
  const result = await sendRuntimeMessage({ type: 'saveMySlug', slug });
  if (result?.ok) {
    state.openPlatform.mySlug = slug;
    if (els.mySlugInput) els.mySlugInput.value = slug;
  }
}

function syncModeChrome() {
  const statsMode = isStatsMode();
  const collectionsMode = isCollectionsMode();
  if (els.favlistPicker) els.favlistPicker.hidden = !collectionsMode || statsMode;
  if (els.officialSortBar) els.officialSortBar.hidden = statsMode || !shouldUseOfficialContents();
  if (els.collectControlsSection) els.collectControlsSection.hidden = statsMode;
  if (els.timeFilterSection) els.timeFilterSection.hidden = statsMode;
  if (els.selectionBarSection) els.selectionBarSection.hidden = statsMode;
  if (els.urlList) els.urlList.hidden = statsMode;
  if (els.exportOptionsSection) els.exportOptionsSection.hidden = statsMode;
  if (els.exportFooterSection) els.exportFooterSection.hidden = statsMode;
  if (els.statsView) els.statsView.hidden = !statsMode;
  if (els.dateFilterFieldSelect) {
    els.dateFilterFieldSelect.hidden = !collectionsMode;
    if (!collectionsMode) {
      state.dateFilterField = 'createdTime';
      els.dateFilterFieldSelect.value = 'createdTime';
    }
  }
  if (els.collectButton) {
    els.collectButton.textContent = collectionsMode ? '加载收藏夹内容' : '采集 / 刷新链接';
  }
}

function updateFavlistDescHint() {
  if (!els.favlistDescHint) return;
  if (!isCollectionsMode() || !state.selectedFavlistToken) {
    els.favlistDescHint.hidden = true;
    els.favlistDescHint.textContent = '';
    return;
  }
  if (state.selectedFavlistToken === RECENT_COLLECTIONS_TOKEN) {
    els.favlistDescHint.textContent = '调用 /api/v1/user/collections 获取近期公开收藏（单次最多返回近期一批，无分页）。';
    els.favlistDescHint.hidden = false;
    return;
  }
  const folder = state.favlists.find((f) => String(f.urlToken) === String(state.selectedFavlistToken));
  if (!folder) {
    els.favlistDescHint.hidden = true;
    return;
  }
  const visibility = folder.isPublic ? '公开收藏夹' : '私密收藏夹';
  const desc = folder.description ? ` · ${folder.description}` : '';
  els.favlistDescHint.textContent = `${visibility}${desc}`;
  els.favlistDescHint.hidden = false;
}

function renderFavlistSelect() {
  if (!els.favlistSelect) return;
  const recentSelected = state.selectedFavlistToken === RECENT_COLLECTIONS_TOKEN ? ' selected' : '';
  const options = [
    '<option value="">选择一个收藏夹</option>',
    `<option value="${RECENT_COLLECTIONS_TOKEN}"${recentSelected}>★ 近期收藏（跨收藏夹最近内容）</option>`,
  ].concat(state.favlists.map((folder) => {
    const token = String(folder.urlToken || '');
    const badge = folder.isPublic ? '[公开]' : '[私密]';
    const title = `${badge} ${folder.title || `收藏夹 ${token}`}`;
    const selected = token && token === String(state.selectedFavlistToken) ? ' selected' : '';
    return `<option value="${escapeHtml(token)}"${selected}>${escapeHtml(title)}</option>`;
  }));
  els.favlistSelect.innerHTML = options.join('');
  updateFavlistDescHint();
}

async function persistCurrentItems() {
  const key = cacheKey(state.slug);
  await storageSet({
    [key]: {
      items: state.items,
      urls: state.urls,
      remoteTotal: state.remoteTotal,
      lastCollectedAt: state.lastCollectedAt,
      selectedFavlistToken: state.selectedFavlistToken,
    },
  });
}

async function applyCollectedItems(collectedItems, remoteTotal, options = {}) {
  const previousKeys = new Set(state.items.map(itemMergeKey));
  const collected = normalizeItems(collectedItems);
  const collectedKeys = new Set(collected.map(itemMergeKey));
  const existingItems = options.authoritative
    ? state.items.filter((item) => collectedKeys.has(itemMergeKey(item)))
    : state.items;
  const merged = mergeItems(existingItems, collected);
  const added = merged.filter((item) => !previousKeys.has(itemMergeKey(item))).length;
  const removed = options.authoritative ? Math.max(0, previousKeys.size + added - merged.length) : 0;

  state.items = merged;
  state.urls = itemUrls(state.items);
  state.remoteTotal = Number.isFinite(remoteTotal) ? remoteTotal : state.remoteTotal;
  state.selected = new Set(
    state.urls.filter((url) => {
      const item = state.items.find((entry) => entry.url === url);
      return !item?.unsupportedReason;
    })
  );
  state.lastCollectedAt = new Date().toISOString();
  await persistCurrentItems();
  renderUrls();
  return { added, removed };
}

function emptyListMessage() {
  if (isCollectionsMode()) {
    if (!state.openPlatform.configured) return '请先在上方配置 Access Secret，再加载收藏夹。';
    if (!state.selectedFavlistToken) return '先刷新收藏夹列表并选中一个收藏夹，再加载内容。';
    return '这个收藏夹还没有缓存内容。点击“加载收藏夹内容”。';
  }
  if (isZvideosMode() && !state.openPlatform.configured) {
    return '视频（我的创作）需要配置 Access Secret 后采集，并通过官方全文 API 导出关联正文。';
  }
  if (shouldUseOfficialContents() && !state.slug) {
    return `还没有缓存的我的${typeLabel()}。点击“采集 / 刷新链接”直接从开放平台拉取。`;
  }
  return `当前主页还没有缓存的${typeLabel()}链接。`;
}

// ============================
// Cache loading / switching
// ============================
async function loadFavlistCache() {
  const stored = await storageGet([favlistsCacheKey()]);
  const cached = stored[favlistsCacheKey()] || {};
  state.favlists = Array.isArray(cached.items) ? cached.items : [];
  if (!state.selectedFavlistToken && cached.lastToken) {
    state.selectedFavlistToken = String(cached.lastToken);
  }
  if (
    state.selectedFavlistToken
    && state.selectedFavlistToken !== RECENT_COLLECTIONS_TOKEN
    && !state.favlists.some((folder) => String(folder.urlToken) === String(state.selectedFavlistToken))
  ) {
    state.selectedFavlistToken = state.favlists[0] ? String(state.favlists[0].urlToken) : '';
  }
  renderFavlistSelect();
}

async function loadCacheForActiveTab() {
  state.tab = await getActiveTab();
  state.slug = getSlugFromUrl(state.tab?.url || '');
  syncModeChrome();

  if (isStatsMode()) {
    els.activeTabText.textContent = state.openPlatform.configured
      ? `${state.openPlatform.mySlug || '当前账号'}（创作数据）`
      : '创作数据需要 Access Secret';
    return;
  }

  if (isCollectionsMode()) {
    els.activeTabText.textContent = state.openPlatform.configured
      ? (state.openPlatform.mySlug || '收藏夹（开放平台）')
      : '收藏夹需要 Access Secret';
    await loadFavlistCache();
    if (!state.selectedFavlistToken) {
      state.items = [];
      state.urls = [];
      state.remoteTotal = null;
      state.lastCollectedAt = '';
      state.selected.clear();
      renderUrls();
      return;
    }
    const key = cacheKey(state.slug);
    const result = await storageGet([key]);
    const cached = result[key] || {};
    state.items = loadCachedItems(cached);
    state.urls = itemUrls(state.items);
    state.lastCollectedAt = cached.lastCollectedAt || '';
    state.remoteTotal = Number.isFinite(cached.remoteTotal) ? cached.remoteTotal : null;
    state.selected = new Set(state.urls.filter((url) => {
      const item = state.items.find((entry) => entry.url === url);
      return !item?.unsupportedReason;
    }));
    renderUrls();
    return;
  }

  if (!state.slug && !shouldUseOfficialContents()) {
    els.activeTabText.textContent = isZvideosMode()
      ? '视频需要配置开放平台 Access Secret'
      : '请打开知乎 /people/... 个人主页标签页（或配置 Access Secret 拉取本人创作）。';
    state.items = [];
    state.urls = [];
    state.remoteTotal = null;
    state.selected.clear();
    renderUrls();
    return;
  }

  if (isZvideosMode()) {
    els.activeTabText.textContent = `${state.openPlatform.mySlug || '当前账号'}（我的视频·官方）`;
  } else if (shouldUseOfficialContents()) {
    els.activeTabText.textContent = `${state.slug || state.openPlatform.mySlug || '当前账号'}（官方目录）`;
  } else {
    els.activeTabText.textContent = state.slug;
  }
  const result = await storageGet([cacheKey(state.slug)]);
  const cached = result[cacheKey(state.slug)] || {};
  state.items = loadCachedItems(cached);
  state.urls = itemUrls(state.items);
  state.lastCollectedAt = cached.lastCollectedAt || '';
  state.remoteTotal = Number.isFinite(cached.remoteTotal) ? cached.remoteTotal : null;
  state.selected = new Set(state.urls.filter((url) => {
    const item = state.items.find((entry) => entry.url === url);
    return !item?.unsupportedReason;
  }));
  renderUrls();
}

async function switchType(type) {
  if (type === state.currentType) return;
  state.currentType = type;
  state.dateFilterFrom = '';
  state.dateFilterTo = '';
  syncDateFilterInputs();
  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  await loadCacheForActiveTab();
  if (state.items.length === 0) {
    els.urlList.innerHTML = `<div class="empty">${emptyListMessage()}</div>`;
  }
}

// ============================
// Collection (injected into profile page)
// ============================
async function scrapeContentFromPage(type, runId) {
  // Keep these helpers self-contained because this function is serialized and
  // injected into the active Zhihu tab by chrome.scripting.executeScript.
  const escapePinValue = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const imageUrlFromPinEntry = (entry) => {
    const explicitUrl = entry?.originalUrl
      || entry?.original_url
      || entry?.image?.originalUrl
      || entry?.image?.original_url
      || entry?.image?.url
      || entry?.imageInfo?.originalUrl
      || entry?.imageInfo?.original_url
      || entry?.content?.originalUrl
      || entry?.content?.original_url;
    if (explicitUrl) return explicitUrl;
    const genericUrl = entry?.url || entry?.src || '';
    const entryType = String(entry?.type || '').toLowerCase();
    return entryType.includes('image') || /(?:\.jpe?g|\.png|\.gif|\.webp|\.avif)(?:[?#]|$)|zhimg\.com/i.test(String(genericUrl))
      ? genericUrl
      : '';
  };
  const pinHtmlFromItem = (item) => {
    const parts = [];
    let knownText = '';
    const addHtml = (html) => {
      const value = typeof html === 'string' ? html.trim() : '';
      if (!value) return;
      parts.push(value);
      knownText += ` ${value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}`;
    };
    const addText = (text) => {
      const value = typeof text === 'string' ? text.trim() : '';
      if (value && !knownText.includes(value)) addHtml(`<p>${escapePinValue(value).replace(/\r?\n/g, '<br>')}</p>`);
    };
    const addImage = (entry) => {
      const url = String(imageUrlFromPinEntry(entry) || '').trim();
      if (url && !parts.some((part) => part.includes(url))) addHtml(`<img src="${escapePinValue(url)}" alt="" />`);
    };
    const addCard = (entry) => {
      if (!entry || typeof entry !== 'object') return;
      const url = entry.url || entry.href || entry.link || entry.target?.url || entry.content?.url || entry.question?.url || '';
      if (!/^https?:\/\//i.test(String(url)) || parts.some((part) => part.includes(url))) return;
      const title = entry.title || entry.text || entry.content?.title || entry.target?.title || entry.question?.title || entry.target?.question?.title || url;
      addHtml(`<p><a href="${escapePinValue(url)}">${escapePinValue(title)}</a></p>`);
    };

    addHtml(item?.contentHtml);
    if (typeof item?.content === 'string') addHtml(item.content);
    if (Array.isArray(item?.content)) {
      item.content.forEach((entry) => {
        const entryType = String(entry?.type || '').toLowerCase();
        const text = typeof entry?.content === 'string' ? entry.content : (entry?.text || entry?.content?.text || '');
        if (['text', 'paragraph', 'title'].includes(entryType) || (!entryType && text)) addText(text);
        if (entryType.includes('image') || imageUrlFromPinEntry(entry)) addImage(entry);
        if (entryType.includes('link') || entryType.includes('quote') || entryType.includes('reference')) addCard(entry);
      });
    }
    for (const images of [item?.images, item?.imageList, item?.image_list]) {
      if (Array.isArray(images)) images.forEach(addImage);
    }
    for (const card of [item?.target, item?.quote, item?.quoted, item?.repost, item?.repin, item?.linkCard, item?.link_card, item?.attachedInfo, item?.attached_info]) {
      addCard(card);
    }
    return parts.join('\n');
  };

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
        return {
          contentHtml: pinHtmlFromItem(item),
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
  const expectedSections = { answers: ['answers'], articles: ['posts'], pins: ['pins', 'zhi'] }[type] || [];
  const normalizedPath = window.location.pathname.replace(/\/+$/, '');
  if (!expectedSections.some((section) => normalizedPath === `/people/${match[1]}/${section}`)) {
    throw new Error(`请先打开该用户的 /${expectedSections[0]} 页面再采集，不能从动态页或其他标签页采集。`);
  }
  const limit = 20;
  const delayMs = 600;
  const include = config.apiInclude ? config.apiInclude.join(',') : null;
  const itemsByUrl = new Map();
  const apiUrls = new Set();
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
    const contentScore = (html) => {
      if (!html) return 0;
      const template = document.createElement('template');
      template.innerHTML = html;
      const textLength = (template.content.textContent || '').replace(/\s+/g, ' ').trim().length;
      return textLength
        + template.content.querySelectorAll('img').length * 500
        + template.content.querySelectorAll('a.LinkCard, a[data-draft-type="link-card"]').length * 500;
    };
    const previousHtml = previous.contentHtml || '';
    const incomingHtml = item.contentHtml || '';
    const bestHtml = contentScore(incomingHtml) > contentScore(previousHtml) ? incomingHtml : previousHtml;
    itemsByUrl.set(item.url, {
      url: item.url,
      title: clean(item.title || previous.title || '', 140),
      // The visible card is the most faithful preview of pins. Keep it when the
      // API response later provides a shorter or structurally different excerpt.
      snippet: clean(previous.snippet || item.snippet || '', 260),
      contentHtml: bestHtml,
      author: item.author || previous.author || '',
      // DOM-visible publish time is collected before API pagination and is the
      // user-facing source of truth. Do not overwrite it with API timestamps.
      createdTime: previous.createdTime ?? item.createdTime ?? null,
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

  const slugFromProfileUrl = (value) => {
    try {
      const parsed = new URL(value, window.location.origin);
      return decodeURIComponent(parsed.pathname.match(/^\/people\/([^/]+)/)?.[1] || '');
    } catch {
      return '';
    }
  };

  const containerBelongsToProfile = (container) => {
    if (!container) return false;
    const authorUrls = [
      ...[...container.querySelectorAll('[itemprop="author"] a[href*="/people/"], .AuthorInfo a[href*="/people/"]')]
        .map((element) => element.getAttribute('href') || ''),
      ...[...container.querySelectorAll('[itemprop="author"] meta[itemprop="url"], .AuthorInfo meta[itemprop="url"]')]
        .map((element) => element.getAttribute('content') || ''),
    ];
    const authorSlugs = authorUrls.map(slugFromProfileUrl).filter(Boolean);
    return authorSlugs.length > 0 && authorSlugs.every((authorSlug) => authorSlug === slug);
  };

  const authorFromContainer = (container) => {
    const meta = container?.querySelector('[itemprop="author"] meta[itemprop="name"], .AuthorInfo meta[itemprop="name"]');
    const link = container?.querySelector('.AuthorInfo-name .UserLink-link, .AuthorInfo-name a');
    return clean(meta?.getAttribute('content') || link?.textContent || '', 120);
  };

  const pinContentHtmlFromContainer = (container) => {
    if (type !== 'pins' || !container) return '';
    const root = container.querySelector('.RichContent') || container.querySelector('.RichText');
    if (!root) return '';
    const clone = root.cloneNode(true);
    clone.querySelectorAll([
      '.ContentItem-time',
      '.ContentItem-actions',
      '.PinToolbar-actions',
      '#VirtualCatalogAnchorPoint',
      'button',
      'svg',
    ].join(',')).forEach((element) => element.remove());
    clone.querySelectorAll('img').forEach((image) => {
      const source = image.getAttribute('data-original') || image.getAttribute('data-actualsrc') || image.getAttribute('src');
      if (source) image.setAttribute('src', source);
    });
    return root === container.querySelector('.RichText') ? clone.outerHTML : clone.innerHTML;
  };

  const displayedPublishTimeFromContainer = (container, url) => {
    if (!container || !url) return null;
    const id = url.match(/\/(?:p|pin|answer)\/(\d+)/)?.[1];
    if (!id) return null;
    const timeLink = [...container.querySelectorAll('.ContentItem-time a')].find((link) => {
      const href = link.getAttribute('href') || '';
      return new RegExp(`/(?:p|pin|answer)/${id}/?(?:$|[?#])`).test(href);
    });
    const label = timeLink?.getAttribute('aria-label')
      || timeLink?.getAttribute('data-tooltip')
      || timeLink?.textContent
      || '';
    const match = label.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second = '0'] = match;
    const localDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(localDate.getTime()) ? null : Math.floor(localDate.getTime() / 1000);
  };

  // DOM sniffing: find visible links on the current page.
  document.querySelectorAll(config.domLinkSelector).forEach((anchor) => {
    const url = config.domLinkNormalizer(anchor.getAttribute('href') || '');
    if (!url) return;
    const container = anchor.closest(config.domItemSelector) || anchor.parentElement;
    if (!containerBelongsToProfile(container)) return;
    const snippetEl = container?.querySelector(config.domSnippetSelector);
    const id = url.match(/\/(?:p|pin|answer)\/(\d+)/)?.[1] || '';
    rememberItem({
      url,
      title: titleFromContainer(container, anchor, config.domTitleSelector ? '' : `${config.label}${id}`),
      snippet: snippetEl?.textContent || '',
      contentHtml: pinContentHtmlFromContainer(container),
      author: authorFromContainer(container),
      createdTime: displayedPublishTimeFromContainer(container, url),
    });
  });

  // Some cards expose the canonical id in data-zop while the visible link is
  // only a timestamp or is hidden behind expanded content.
  document.querySelectorAll(config.domItemSelector).forEach((container) => {
    if (!containerBelongsToProfile(container)) return;
    const data = readDataJson(container, 'data-zop');
    const url = config.domItemToUrl(data);
    if (!url) return;
    const id = url.match(/\/(?:p|pin)\/(\d+)/)?.[1] || data?.itemId || '';
    const snippetEl = container.querySelector(config.domSnippetSelector);
    rememberItem({
      url,
      title: titleFromContainer(container, null, data?.title || `${config.label}${id}`),
      snippet: snippetEl?.textContent || '',
      contentHtml: pinContentHtmlFromContainer(container),
      author: authorFromContainer(container),
      createdTime: displayedPublishTimeFromContainer(container, url),
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
          apiUrls.add(url);
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

  // A successful member API response is authoritative for ownership. DOM
  // sniffing is retained only to enrich those URLs with visible timestamps and
  // complete pin cards; nested links and activity-feed content are discarded.
  const items = [...itemsByUrl.values()].filter((item) => !apiSucceeded || apiUrls.has(item.url));
  report({
    phase: 'done',
    fetched: items.length,
    total: remoteTotal || items.length,
    isEnd: true,
    message: remoteTotal ? `已采集 ${items.length} / ${remoteTotal} 条` : `已采集 ${items.length} 条`,
  });
  return { slug, items, urls: items.map((item) => item.url), remoteTotal, authoritative: apiSucceeded };
}

async function scrapeCollectionFromPage(collectionId, runId) {
  const limit = 20;
  const delayMs = 600;
  const prefix = '[ZhihuExporter][favlist][page]';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const log = (event, details) => {
    if (details === undefined) console.log(`${prefix} ${event}`);
    else console.log(`${prefix} ${event}`, details);
  };
  const compactPaging = (paging) => {
    if (!paging || typeof paging !== 'object') return paging;
    return {
      keys: Object.keys(paging),
      is_end: paging.is_end,
      isEnd: paging.isEnd,
      totals: paging.totals,
      Totals: paging.Totals,
      next_offset: paging.next_offset,
      nextOffset: paging.nextOffset,
      next: paging.next ? String(paging.next).slice(0, 180) : paging.next,
    };
  };
  const sampleEntry = (entry) => {
    const content = entry?.content || entry?.target || {};
    return {
      entryKeys: entry && typeof entry === 'object' ? Object.keys(entry) : [],
      type: content.type || entry?.type || '',
      id: content.id ?? entry?.id ?? null,
      url: content.url || '',
      title: content.question?.title || content.title || '',
    };
  };
  const report = (payload) => {
    try {
      chrome.runtime.sendMessage({ type: 'collectionProgress', runId, ...payload });
    } catch (error) {
      log('progress-message-failed', { message: error?.message || String(error) });
    }
  };

  log('start', {
    collectionId,
    runId,
    href: location.href,
    cookieLength: document.cookie.length,
    hasZc0InDocumentCookie: /(?:^|;\s*)z_c0=/.test(document.cookie),
    note: 'z_c0 is usually HttpOnly, so document.cookie may not show it even when logged in',
  });

  const endpoints = [
    (offset) => `/api/v4/collections/${encodeURIComponent(collectionId)}/items?offset=${offset}&limit=${limit}`,
    (offset) => `/api/v4/favlists/${encodeURIComponent(collectionId)}/items?offset=${offset}&limit=${limit}`,
  ];

  let lastError = '';
  const debug = {
    href: location.href,
    collectionId,
    endpointsTried: [],
    pages: [],
    stopReason: '',
  };

  for (const buildUrl of endpoints) {
    const items = [];
    const seen = new Set();
    let remoteTotal = 0;
    let pages = 0;
    let offset = 0;
    let nextUrl = buildUrl(0);
    lastError = '';
    const endpointName = nextUrl.split('?')[0];
    debug.endpointsTried.push(endpointName);
    log('try-endpoint', { endpoint: endpointName });

    while (nextUrl && pages < 500) {
      const requestUrl = nextUrl;
      log('fetch', { page: pages + 1, offset, url: requestUrl });
      const response = await fetch(requestUrl, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'Fetch' },
      });
      const contentType = response.headers.get('content-type') || '';
      const rawText = await response.text();
      const bodyPreview = String(rawText || '').replace(/\s+/g, ' ').trim().slice(0, 240);
      if (response.status === 404 || response.status === 400) {
        lastError = `HTTP ${response.status}`;
        debug.stopReason = lastError;
        log('http-skip-endpoint', { status: response.status, contentType, url: requestUrl, bodyPreview });
        break;
      }
      if (!response.ok) {
        debug.stopReason = `HTTP ${response.status}`;
        log('http-error', { status: response.status, contentType, url: requestUrl, bodyPreview });
        throw new Error(`收藏夹站内接口 HTTP ${response.status}`);
      }

      let json = null;
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch (error) {
        debug.stopReason = 'response_not_json';
        log('json-parse-failed', { url: requestUrl, contentType, bodyPreview, message: error?.message || String(error) });
        throw new Error('收藏夹站内接口返回的不是 JSON');
      }
      if (json?.error) {
        debug.stopReason = json.error.message || json.error.code || 'json.error';
        log('json-error', json.error);
        throw new Error(json.error.message || `收藏夹站内接口错误 ${json.error.code || ''}`.trim());
      }
      const batch = Array.isArray(json.data) ? json.data : [];
      const paging = json.paging || json.Paging || {};
      pages += 1;
      remoteTotal = Number(paging.totals ?? paging.Totals) || remoteTotal;

      let added = 0;
      for (const entry of batch) {
        const content = entry?.content || entry?.target || entry || {};
        const key = String(content.id || content.url || entry?.id || `${pages}-${added}`);
        if (seen.has(key)) continue;
        seen.add(key);
        items.push(entry);
        added += 1;
      }

      const pageInfo = {
        page: pages,
        url: requestUrl,
        jsonKeys: json && typeof json === 'object' ? Object.keys(json) : [],
        dataLength: batch.length,
        added,
        uniqueTotal: items.length,
        remoteTotal,
        paging: compactPaging(paging),
        zhihuPaging: compactPaging(json.paging),
        sample: batch[0] ? sampleEntry(batch[0]) : null,
      };
      debug.pages.push(pageInfo);
      log('page', pageInfo);

      report({
        phase: 'api',
        fetched: items.length,
        total: remoteTotal || null,
        page: pages,
        message: remoteTotal ? `${items.length} / ${remoteTotal} 条收藏` : `已获取 ${items.length} 条收藏`,
      });

      const isEnd = paging.is_end === true || paging.isEnd === true;
      if (isEnd) {
        debug.stopReason = 'is_end';
        log('stop', { reason: debug.stopReason, uniqueTotal: items.length, remoteTotal });
        break;
      }
      if (!batch.length) {
        debug.stopReason = 'empty_batch';
        log('stop', { reason: debug.stopReason, uniqueTotal: items.length, remoteTotal });
        break;
      }
      if (added === 0) {
        debug.stopReason = 'no_new_items';
        log('stop', { reason: debug.stopReason, uniqueTotal: items.length, remoteTotal, hint: 'API likely returned a repeated first page' });
        break;
      }

      const rawNext = String(paging.next || paging.Next || '').trim();
      const nextOffset = Number(paging.next_offset ?? paging.nextOffset);
      const previousUrl = nextUrl;
      if (rawNext) {
        try {
          const parsed = new URL(rawNext, window.location.origin);
          parsed.protocol = 'https:';
          const upcoming = Number(parsed.searchParams.get('offset'));
          if (Number.isFinite(upcoming) && upcoming <= offset) {
            debug.stopReason = 'next_offset_not_advancing';
            log('stop', { reason: debug.stopReason, offset, upcoming, next: parsed.toString() });
            nextUrl = '';
            break;
          }
          nextUrl = parsed.toString();
          offset = Number.isFinite(upcoming) ? upcoming : offset + limit;
        } catch (error) {
          debug.stopReason = 'next_parse_failed';
          log('stop', { reason: debug.stopReason, rawNext, message: error?.message || String(error) });
          nextUrl = '';
          break;
        }
      } else if (Number.isFinite(nextOffset) && nextOffset > offset) {
        offset = nextOffset;
        nextUrl = buildUrl(offset);
      } else {
        offset += limit;
        nextUrl = buildUrl(offset);
      }
      if (!nextUrl || nextUrl === previousUrl) {
        debug.stopReason = 'no_next_url';
        log('stop', { reason: debug.stopReason, uniqueTotal: items.length });
        break;
      }
      log('next', { offset, nextUrl });
      await sleep(delayMs);
    }

    if (items.length) {
      debug.stopReason = debug.stopReason || 'completed';
      log('done', {
        endpoint: endpointName,
        pages,
        uniqueTotal: items.length,
        remoteTotal,
        stopReason: debug.stopReason,
      });
      try {
        window.__ZHIHU_EXPORTER_LAST_FAVLIST_DEBUG__ = debug;
      } catch {
        // Ignore.
      }
      return { items, remoteTotal, pages, debug };
    }
    log('endpoint-empty', { endpoint: endpointName, lastError, pages });
  }

  if (lastError) {
    log('failed', { lastError, debug });
    try {
      window.__ZHIHU_EXPORTER_LAST_FAVLIST_DEBUG__ = debug;
    } catch {
      // Ignore.
    }
    throw new Error(`收藏夹站内接口不可用：${lastError}`);
  }
  log('empty', { debug });
  try {
    window.__ZHIHU_EXPORTER_LAST_FAVLIST_DEBUG__ = debug;
  } catch {
    // Ignore.
  }
  return { items: [], remoteTotal: 0, pages: 0, debug };
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
async function collectOfficialContents() {
  const contentType = OFFICIAL_CONTENT_TYPE[state.currentType];
  if (!contentType) throw new Error('当前类型不支持官方目录。');

  const sortValue = els.officialSortSelect?.value || 'ts:desc';
  const [sortField, sortOrder] = sortValue.split(':');
  const pageSize = 50;
  let offset = '0';
  const items = [];
  const seenKeys = new Set();
  const seenOffsets = new Set([offset]);
  let remoteTotal = null;
  let page = 0;
  let pagingWarning = '';

  while (page < 500) {
    page += 1;
    const data = await openPlatformRequest('/api/v1/user/contents', {
      ContentType: contentType,
      Limit: pageSize,
      Offset: offset,
      SortField: sortField || 'ts',
      SortOrder: sortOrder || 'desc',
    });
    const paging = readPaging(data);
    paging.items.forEach((item) => {
      const local = officialItemToLocal(item);
      if (!local.url) return;
      const key = itemMergeKey(local);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      items.push(local);
    });
    remoteTotal = paging.totals ?? remoteTotal;
    setProgress(
      els.collectProgressFill,
      els.collectProgressText,
      remoteTotal ? (items.length / remoteTotal) * 100 : Math.min(95, page * 10),
      remoteTotal ? `${items.length} / ${remoteTotal} 条` : `已获取 ${items.length} 条`
    );
    const step = nextPageOffset(paging, offset, seenOffsets);
    if (step.error) {
      pagingWarning = step.error;
      break;
    }
    if (step.done || step.nextOffset == null) break;
    offset = step.nextOffset;
    seenOffsets.add(offset);
  }

  const { added, removed } = await applyCollectedItems(items, remoteTotal, { authoritative: true });
  const totalHint = remoteTotal && remoteTotal > state.urls.length ? `，接口总数 ${remoteTotal}` : '';
  const warnHint = pagingWarning ? `（${pagingWarning}）` : '';
  els.lastCollectedText.textContent = `官方目录新增 ${added} 条${removed ? `，清理 ${removed} 条旧缓存` : ''}${totalHint}${warnHint}，${formatTime(state.lastCollectedAt)}`;
  setProgress(els.collectProgressFill, els.collectProgressText, 100, `已缓存 ${state.urls.length} 条`);
}

async function collectFavlists() {
  const data = await openPlatformRequest('/api/v1/user/favlists', { Limit: 50 });
  state.favlists = (data.Items || []).map((item) => ({
    urlToken: item.UrlToken,
    url: item.Url || '',
    title: item.Title || `收藏夹 ${item.UrlToken}`,
    description: item.Description || '',
    isPublic: Boolean(item.IsPublic),
  }));
  if (!state.selectedFavlistToken && state.favlists[0]) {
    state.selectedFavlistToken = String(state.favlists[0].urlToken);
  }
  await storageSet({
    [favlistsCacheKey()]: {
      items: state.favlists,
      lastToken: state.selectedFavlistToken,
      lastCollectedAt: new Date().toISOString(),
    },
  });
  renderFavlistSelect();
  return state.favlists.length;
}

async function findZhihuContentTabId() {
  if (state.tab?.id && /^https:\/\/(?:www|zhuanlan)\.zhihu\.com\//i.test(state.tab.url || '')) {
    return state.tab.id;
  }
  const tabs = await chrome.tabs.query({
    url: ['https://www.zhihu.com/*', 'https://zhuanlan.zhihu.com/*'],
  });
  return tabs[0]?.id || null;
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.status === 'complete') {
          resolve(tab);
          return;
        }
      } catch (error) {
        reject(error);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('知乎页面加载超时'));
        return;
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

async function ensureZhihuCollectionTab(collectionId) {
  const existingId = await findZhihuContentTabId();
  if (existingId) return existingId;
  const created = await chrome.tabs.create({
    url: `https://www.zhihu.com/collection/${encodeURIComponent(collectionId)}`,
    active: false,
  });
  if (!created?.id) throw new Error('无法打开收藏夹页面。');
  await waitForTabComplete(created.id);
  return created.id;
}

async function collectOfficialFavlistContents(folder, extra) {
  const pageSize = 20;
  let offset = '0';
  const items = [];
  const seen = new Set();
  const seenOffsets = new Set([offset]);
  let remoteTotal = null;
  let page = 0;

  favlistLog('official-start', {
    favlistUrlToken: state.selectedFavlistToken,
    title: folder?.title || extra.favlistTitle || '',
  });

  while (page < 500) {
    page += 1;
    const data = await openPlatformRequest('/api/v1/user/favlist_contents', {
      FavlistUrlToken: state.selectedFavlistToken,
      Offset: offset,
      Limit: pageSize,
    });
    const paging = readPaging(data);
    let fetchedThisPage = 0;
    paging.items.forEach((item, index) => {
      const local = officialItemToLocal(item, {
        ...extra,
        favlistTitle: extra.favlistTitle || folder?.title || item.Favlists?.[0]?.Title || '',
        author: item.Author?.Name || '',
      });
      if (!local.url) {
        local.url = `zhihu:unresolved/${state.selectedFavlistToken}/${offset}-${index}`;
        local.unsupportedReason = local.unsupportedReason || '缺少内容链接';
      }
      const key = itemMergeKey(local);
      if (seen.has(key)) return;
      seen.add(key);
      items.push(local);
      fetchedThisPage += 1;
    });
    remoteTotal = paging.totals ?? remoteTotal;
    const step = nextPageOffset(paging, offset, seenOffsets);
    favlistLog('official-page', {
      page,
      offset,
      nextOffset: step.nextOffset,
      pagingError: step.error || '',
      batchSize: paging.items.length,
      added: fetchedThisPage,
      uniqueTotal: items.length,
      remoteTotal,
      isEnd: paging.isEnd,
      dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
      sample: paging.items[0]
        ? {
            Url: paging.items[0].Url || paging.items[0].url || '',
            ContentType: paging.items[0].ContentType || '',
            Title: paging.items[0].Title || '',
          }
        : null,
    });
    setProgress(
      els.collectProgressFill,
      els.collectProgressText,
      remoteTotal ? (items.length / remoteTotal) * 100 : Math.min(95, page * 10),
      remoteTotal ? `${items.length} / ${remoteTotal} 条` : `已获取 ${items.length} 条`
    );
    if (step.error) {
      favlistLog('official-paging-anomaly', { error: step.error });
      break;
    }
    if (step.done || step.nextOffset == null) break;
    offset = step.nextOffset;
    seenOffsets.add(offset);
  }

  favlistLog('official-done', {
    uniqueTotal: items.length,
    remoteTotal,
    typeCounts: favlistCountBy(items, (item) => item.officialContentType || item.exportType),
  });
  return { items, remoteTotal };
}

async function collectSiteFavlistContents(folder, extra) {
  const ids = collectionIdsToTry(folder, state.selectedFavlistToken);
  let lastError = null;
  favlistLog('site-start', {
    favlistUrlToken: state.selectedFavlistToken,
    folder,
    ids,
  });

  for (const collectionId of ids) {
    const tabId = await ensureZhihuCollectionTab(collectionId);
    const tab = await chrome.tabs.get(tabId);
    favlistLog('site-tab', {
      collectionId,
      tabId,
      tabUrl: tab?.url || '',
      tabStatus: tab?.status || '',
    });
    const inject = (world) => chrome.scripting.executeScript({
      target: { tabId },
      world,
      func: scrapeCollectionFromPage,
      args: [String(collectionId), state.collectRunId],
    });
    let world = 'ISOLATED';
    let injected = await inject(world);
    favlistLog('site-inject', {
      collectionId,
      world,
      error: injected?.[0]?.error?.message || '',
      itemCount: injected?.[0]?.result?.items?.length || 0,
      remoteTotal: injected?.[0]?.result?.remoteTotal || 0,
      pages: injected?.[0]?.result?.pages || 0,
      debug: injected?.[0]?.result?.debug || null,
    });
    if (injected?.[0]?.error || !(injected?.[0]?.result?.items || []).length) {
      world = 'MAIN';
      const mainInjected = await inject(world);
      favlistLog('site-inject', {
        collectionId,
        world,
        error: mainInjected?.[0]?.error?.message || '',
        itemCount: mainInjected?.[0]?.result?.items?.length || 0,
        remoteTotal: mainInjected?.[0]?.result?.remoteTotal || 0,
        pages: mainInjected?.[0]?.result?.pages || 0,
        debug: mainInjected?.[0]?.result?.debug || null,
      });
      if (!mainInjected?.[0]?.error || injected?.[0]?.error) {
        injected = mainInjected;
      }
    }
    if (injected?.[0]?.error) {
      lastError = new Error(injected[0].error.message || '站内采集脚本失败');
      favlistLog('site-inject-failed', { collectionId, message: lastError.message });
      continue;
    }
    const result = injected?.[0]?.result || { items: [], remoteTotal: 0 };
    const items = (result.items || []).map((entry) => v4CollectionItemToLocal(entry, extra));
    favlistLog('site-mapped', {
      collectionId,
      rawCount: result.items?.length || 0,
      mappedCount: items.length,
      remoteTotal: result.remoteTotal || 0,
      typeCounts: favlistCountBy(items, (item) => item.officialContentType || item.exportType),
      unsupportedCounts: favlistCountBy(items.filter((item) => item.unsupportedReason), (item) => item.unsupportedReason),
      sample: items.slice(0, 3).map((item) => ({
        url: item.url,
        title: item.title,
        exportType: item.exportType,
        officialContentType: item.officialContentType,
      })),
    });
    if (items.length) {
      return { items, remoteTotal: result.remoteTotal || items.length, debug: result.debug };
    }
  }

  if (lastError) throw lastError;
  favlistLog('site-empty', { ids });
  return { items: [], remoteTotal: 0 };
}

async function collectRecentCollectionsContents() {
  if (!state.openPlatform.configured) {
    throw new Error('近期收藏接口需要配置 Access Secret。');
  }
  const data = await openPlatformRequest('/api/v1/user/collections', { Limit: 20 });
  const rawItems = Array.isArray(data?.Items) ? data.Items : (Array.isArray(data?.items) ? data.items : []);
  const items = [];
  const seen = new Set();
  rawItems.forEach((item, index) => {
    const folderNames = Array.isArray(item?.Favlists)
      ? item.Favlists.map((f) => f?.Title).filter(Boolean)
      : [];
    const local = officialItemToLocal(item, {
      favlistTitle: folderNames.join(' / ') || '近期收藏',
      favlistUrlToken: item?.Favlists?.[0]?.UrlToken || RECENT_COLLECTIONS_TOKEN,
      author: item?.Author?.Name || '',
    });
    if (!local.url) {
      local.url = `zhihu:unresolved/${RECENT_COLLECTIONS_TOKEN}/${index}`;
      local.unsupportedReason = local.unsupportedReason || '缺少内容链接';
    }
    const key = itemMergeKey(local);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(local);
  });
  return { items, remoteTotal: items.length };
}

async function collectFavlistContents() {
  if (!state.selectedFavlistToken) {
    const count = await collectFavlists();
    els.lastCollectedText.textContent = count
      ? `已加载 ${count} 个收藏夹，请选择后再次加载内容。`
      : '没有公开收藏夹。';
    setProgress(els.collectProgressFill, els.collectProgressText, 100, count ? `已加载 ${count} 个收藏夹` : '没有收藏夹');
    renderUrls();
    return;
  }

  if (state.selectedFavlistToken === RECENT_COLLECTIONS_TOKEN) {
    setProgress(els.collectProgressFill, els.collectProgressText, 20, '正在获取近期收藏…');
    const collected = await collectRecentCollectionsContents();
    await storageSet({
      [favlistsCacheKey()]: {
        items: state.favlists,
        lastToken: state.selectedFavlistToken,
        lastCollectedAt: new Date().toISOString(),
      },
    });
    const { added, removed } = await applyCollectedItems(collected.items, collected.remoteTotal, { authoritative: true });
    els.lastCollectedText.textContent = `近期收藏（开放平台）新增 ${added} 条${removed ? `，清理 ${removed} 条旧缓存` : ''}，${formatTime(state.lastCollectedAt)}`;
    setProgress(els.collectProgressFill, els.collectProgressText, 100, `已缓存 ${state.urls.length} 条`);
    return;
  }

  const folder = state.favlists.find((entry) => String(entry.urlToken) === String(state.selectedFavlistToken));
  const extra = {
    favlistTitle: folder?.title || '',
    favlistUrlToken: state.selectedFavlistToken,
  };
  const previousRunId = state.collectRunId;
  state.collectRunId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const prefSource = els.favlistSourceSelect?.value || 'auto';
  favlistLog('collect-start', {
    runId: state.collectRunId,
    selectedFavlistToken: state.selectedFavlistToken,
    prefSource,
    folder,
    inspectHint: 'Filter Console with ZhihuExporter. Side panel logs appear here; page-injection logs appear in the Zhihu tab DevTools.',
  });

  try {
    let source = 'site-favlist';
    let collected = { items: [], remoteTotal: 0 };
    let siteWarning = '';

    if (prefSource === 'official') {
      if (!state.openPlatform.configured) {
        throw new Error('仅官方模式需要配置 Access Secret。');
      }
      setProgress(els.collectProgressFill, els.collectProgressText, 0, '正在用开放平台接口翻页…');
      collected = await collectOfficialFavlistContents(folder, extra);
      source = 'official-favlist';
    } else {
      setProgress(els.collectProgressFill, els.collectProgressText, 0, '正在用站内接口翻页…');
      try {
        collected = await collectSiteFavlistContents(folder, extra);
      } catch (error) {
        siteWarning = error.message;
        favlistLog('site-error', { message: error.message, stack: error.stack || '' });
      }

      if (!collected.items.length) {
        favlistLog('fallback-official', { siteWarning, siteDebug: collected.debug || null });
        setProgress(els.collectProgressFill, els.collectProgressText, 0, '站内接口无结果，改用开放平台…');
        collected = await collectOfficialFavlistContents(folder, extra);
        source = 'official-favlist';
      }
    }

    await storageSet({
      [favlistsCacheKey()]: {
        items: state.favlists,
        lastToken: state.selectedFavlistToken,
        lastCollectedAt: new Date().toISOString(),
      },
    });
    const { added, removed } = await applyCollectedItems(collected.items, collected.remoteTotal, { authoritative: true });
    const skipped = collected.items.filter((item) => item.unsupportedReason).length;
    const sourceHint = source === 'site-favlist' ? '站内接口' : '开放平台（可能不完整）';
    const totalHint = collected.remoteTotal && collected.remoteTotal > state.urls.length
      ? `，接口总数 ${collected.remoteTotal}`
      : '';
    const skipHint = skipped ? `，${skipped} 条暂不支持导出` : '';
    const warnHint = source === 'official-favlist' && siteWarning ? `；站内失败：${siteWarning}` : '';
    const summary = {
      source,
      added,
      removed,
      cached: state.urls.length,
      collected: collected.items.length,
      remoteTotal: collected.remoteTotal,
      skipped,
      siteWarning,
      typeCounts: favlistCountBy(collected.items, (item) => item.officialContentType || item.exportType),
      siteDebug: collected.debug || null,
    };
    favlistLog('SUMMARY copy this object', summary);
    globalThis.__ZHIHU_EXPORTER_LAST_FAVLIST__ = summary;
    els.lastCollectedText.textContent = `收藏夹（${sourceHint}）新增 ${added} 条${removed ? `，清理 ${removed} 条旧缓存` : ''}${totalHint}${skipHint}${warnHint}，${formatTime(state.lastCollectedAt)}`;
    setProgress(els.collectProgressFill, els.collectProgressText, 100, `已缓存 ${state.urls.length} 条`);
  } catch (error) {
    favlistLog('collect-error', { message: error.message, stack: error.stack || '' });
    throw error;
  } finally {
    state.collectRunId = previousRunId;
  }
}

async function collectUrls() {
  if (!state.tab?.id || !state.slug) {
    await loadCacheForActiveTab();
  }

  if (isCollectionsMode()) {
    if (!state.openPlatform.configured) {
      els.lastCollectedText.textContent = '请先配置 Access Secret。';
      setProgress(els.collectProgressFill, els.collectProgressText, 0, '未配置开放平台');
      return;
    }
    els.collectButton.disabled = true;
    els.collectButton.textContent = '加载中...';
    setProgress(els.collectProgressFill, els.collectProgressText, 0, '正在开始...');
    try {
      await collectFavlistContents();
    } catch (error) {
      els.lastCollectedText.textContent = error.message;
      setProgress(els.collectProgressFill, els.collectProgressText, 0, '加载失败');
    } finally {
      els.collectButton.disabled = false;
      syncModeChrome();
    }
    return;
  }

  if (isZvideosMode() && !state.openPlatform.configured) {
    els.lastCollectedText.textContent = '视频（我的创作）需要配置 Access Secret。';
    setProgress(els.collectProgressFill, els.collectProgressText, 0, '未配置开放平台');
    return;
  }

  if (shouldUseOfficialContents()) {
    els.collectButton.disabled = true;
    els.collectButton.textContent = '采集中...';
    setProgress(els.collectProgressFill, els.collectProgressText, 0, '正在请求官方目录...');
    try {
      await collectOfficialContents();
      if (state.currentType === 'pins' && state.tab?.id && isExpectedProfilePage(state.tab.url || '', 'pins')) {
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: state.tab.id },
            func: scrapeContentFromPage,
            args: [state.currentType, `${Date.now()}-pin-enrich`],
          });
          if (!result.error) {
            await applyCollectedItems(result.result?.items || [], state.remoteTotal, { authoritative: false });
          }
        } catch {
          // Official list already saved; pin cards are optional enrichment.
        }
      }
      els.collectButton.disabled = false;
      syncModeChrome();
      return;
    } catch (error) {
      if (isZvideosMode() || !state.tab?.id || !state.slug || !isExpectedProfilePage(state.tab.url || '', state.currentType)) {
        els.lastCollectedText.textContent = `官方目录失败：${error.message}`;
        setProgress(els.collectProgressFill, els.collectProgressText, 0, '采集失败');
        els.collectButton.disabled = false;
        syncModeChrome();
        return;
      }
      els.lastCollectedText.textContent = `官方目录失败，改用页面采集：${error.message}`;
    }
  }

  if (!state.tab?.id || !state.slug) return;

  if (!isExpectedProfilePage(state.tab.url || '', state.currentType)) {
    const expectedSection = { answers: 'answers', articles: 'posts', pins: 'pins' }[state.currentType];
    const message = `请先打开 /people/${state.slug}/${expectedSection} 页面再采集。`;
    els.lastCollectedText.textContent = message;
    setProgress(els.collectProgressFill, els.collectProgressText, 0, '当前页面不支持采集');
    els.collectButton.disabled = false;
    syncModeChrome();
    return;
  }

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
    state.slug = collected.slug || state.slug;
    const { added, removed } = await applyCollectedItems(
      collected.items || collected.urls || [],
      collected.remoteTotal,
      { authoritative: collected.authoritative }
    );
    els.lastCollectedText.textContent = `新增 ${added} 条${removed ? `，清理 ${removed} 条旧缓存` : ''}，${formatTime(state.lastCollectedAt)}`;
    setProgress(els.collectProgressFill, els.collectProgressText, 100, `已缓存 ${state.urls.length} 条`);
  } catch (error) {
    els.lastCollectedText.textContent = error.message;
    setProgress(els.collectProgressFill, els.collectProgressText, 0, '采集失败');
  } finally {
    els.collectButton.disabled = false;
    syncModeChrome();
    state.collectRunId = '';
  }
}

// ============================
// Hydrate missing previews (orchestrator)
// ============================
async function hydrateMissingPreviews() {
  if (!state.tab?.id) {
    await loadCacheForActiveTab();
  }
  if (!state.tab?.id || state.items.length === 0) return;
  if (!/zhihu\.com/.test(state.tab.url || '')) {
    els.lastCollectedText.textContent = '请打开任意知乎标签页再补全预览。';
    return;
  }

  const missingCount = state.items.filter((item) => !item.snippet).length;
  if (missingCount === 0) {
    setProgress(els.collectProgressFill, els.collectProgressText, 100, '预览已全部补全');
    return;
  }

  const typesToHydrate = isCollectionsMode()
    ? [...new Set(state.items.filter((item) => !item.snippet && item.exportType).map((item) => item.exportType))]
    : [state.currentType];
  if (typesToHydrate.length === 0) {
    setProgress(els.collectProgressFill, els.collectProgressText, 100, '没有可补全预览的条目');
    return;
  }

  els.hydrateButton.disabled = true;
  els.collectButton.disabled = true;
  state.collectRunId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  setProgress(els.collectProgressFill, els.collectProgressText, 0, `0 / ${missingCount} 条预览`);

  try {
    for (const type of typesToHydrate) {
      const subset = isCollectionsMode()
        ? state.items.filter((item) => item.exportType === type)
        : state.items;
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: state.tab.id },
        func: hydratePreviewsFromPage,
        args: [type, state.collectRunId, subset],
      });
      if (result.error) throw new Error(result.error.message);
      state.items = mergeItems(state.items, normalizeItems(result.result || []));
    }
    state.urls = itemUrls(state.items);
    await persistCurrentItems();
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
function parseContentUrl(url, type = state.currentType) {
  const config = configFor(type);
  const id = config.initialDataIdFromUrl ? config.initialDataIdFromUrl(url) : '';
  if (!id) return null;
  return { id };
}

// ============================
// Content extraction (dual-source)
// ============================
function extractContent(url, pageHtml, type = state.currentType) {
  const config = configFor(type);
  const ids = parseContentUrl(url, type);
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
  const targetByDataZop = [...doc.querySelectorAll('[data-zop]')].find((element) => {
    try {
      const data = JSON.parse(element.getAttribute('data-zop') || '{}');
      return String(data.itemId || data.id || '') === String(ids.id);
    } catch {
      return false;
    }
  });
  const targetLink = [...doc.querySelectorAll('a[href]')].find((link) => {
    try {
      const parsed = new URL(link.getAttribute('href') || '', url);
      return new RegExp(`/(?:answer|p|pin)/${ids.id}/?$`).test(parsed.pathname);
    } catch {
      return false;
    }
  });
  const targetContainer = targetByDataZop
    || targetLink?.closest('.AnswerItem, .ArticleItem, .PinItem, .ContentItem, .List-item')
    || null;
  const contentScope = targetContainer || doc;
  const contentEl = sel.content ? contentScope.querySelector(sel.content) : null;
  const titleEl = sel.title
    ? (contentScope.querySelector(sel.title) || doc.querySelector(sel.title) || doc.querySelector('title'))
    : null;
  const authorEl = sel.author ? contentScope.querySelector(sel.author) : null;
  const elementText = (el) => el?.getAttribute?.('content') || el?.textContent || '';
  const metaContent = (itemprop) => doc.querySelector(`meta[itemprop="${itemprop}"]`)?.getAttribute('content') || '';
  const parseDateSeconds = (value) => {
    if (!value) return null;
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? null : Math.floor(millis / 1000);
  };
  const parseDisplayedPublishTime = () => {
    const pathPrefix = type === 'answers'
      ? '/answer/'
      : type === 'articles'
        ? '/p/'
        : type === 'pins'
          ? '/pin/'
          : '';
    if (!pathPrefix) return null;
    const links = [...doc.querySelectorAll(`.ContentItem-time a[href*="${pathPrefix}"]`)];
    const timeLink = links.find((link) => {
      const href = link.getAttribute('href') || '';
      const escapedPrefix = pathPrefix.replace(/\//g, '\\/');
      return new RegExp(`${escapedPrefix}${ids.id}/?(?:$|[?#])`).test(href);
    });
    const label = timeLink?.getAttribute('aria-label')
      || timeLink?.getAttribute('data-tooltip')
      || timeLink?.textContent
      || '';
    const match = label.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second = '0'] = match;
    const localDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(localDate.getTime()) ? null : Math.floor(localDate.getTime() / 1000);
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
  const displayedPublishTime = parseDisplayedPublishTime();
  if (displayedPublishTime != null) metadata.createdTime = displayedPublishTime;

  // Synthesize title for types without one
  const finalTitle = chosen.title || `${config.defaultName}${ids.id}`;

  return {
    ...ids,
    url,
    type,
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
    if (node.classList.contains('LinkCard') || node.getAttribute('data-draft-type') === 'link-card') {
      const title = node.getAttribute('data-draft-title')
        || node.querySelector('.LinkCard-title')?.textContent?.trim()
        || href;
      return href ? block(`[${markdownEscape(title)}](${href})`) : title;
    }
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
function buildMarkdown(data, type = state.currentType) {
  const config = configFor(type);
  const escapeYaml = (value) => String(value || '').replace(/"/g, '\\"');
  const lines = [
    '---',
    `id: "${escapeYaml(data.id)}"`,
    `title: "${escapeYaml(data.title)}"`,
    `author: "${escapeYaml(data.author)}"`,
    `type: ${config.frontmatterType}`,
    `source: "${escapeYaml(data.url)}"`,
  ];
  if (data.favlistTitle) lines.push(`favlist: "${escapeYaml(data.favlistTitle)}"`);
  if (data.favTime) {
    const fav = formatTimestamp(data.favTime);
    if (fav) lines.push(`fav_time: "${fav}"`);
  }
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
  if (data.contentStats) {
    lines.push(...Helpers.formatContentStatsFrontmatterLines(data.contentStats));
  }
  lines.push(`downloaded: "${new Date().toISOString().slice(0, 10)}"`, '---', '');
  lines.push(`# ${data.title}`, '', htmlToMarkdown(data.html), '');
  if (data.commentsMarkdown) {
    lines.push(data.commentsMarkdown);
  }
  return lines.join('\n');
}

function sanitizeFilenamePart(value, type = state.currentType) {
  const defaultName = configFor(type).defaultName;
  return cleanText(value || '', 80)
    // Windows forbids ASCII "?" in filenames. Preserve the punctuation by
    // replacing it with the visually equivalent full-width character.
    .replace(/\?/g, '？')
    .replace(/[\\/:*?"<>|#^[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || `zhihu-${defaultName}`;
}

function buildFilename(data, type = state.currentType) {
  return `${sanitizeFilenamePart(data.title, type)}-${data.id}.md`;
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

function extractImageUrlsFromHtml(html) {
  if (!html) return [];
  const urls = new Set();
  const temp = document.createElement('div');
  temp.innerHTML = html;
  temp.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('data-actualsrc') || img.getAttribute('data-original') || img.getAttribute('src') || '';
    if (src && /^https?:\/\//i.test(src) && !src.includes('equation') && !src.includes('eeimg')) {
      urls.add(src);
    }
  });
  return Array.from(urls);
}

function inferImageExtension(url, contentType) {
  if (contentType) {
    const mime = contentType.split(';')[0].trim().toLowerCase();
    const map = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    if (map[mime]) return map[mime];
  }
  const match = url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i);
  return match ? `.${match[1].toLowerCase()}` : '.jpg';
}

async function fetchImageAsUint8Array(url, signal) {
  try {
    const res = await fetch(url, { signal, credentials: 'omit' });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type');
    const ext = inferImageExtension(url, contentType);
    return { bytes: new Uint8Array(arrayBuffer), ext };
  } catch {
    return null;
  }
}

function createZipBlob(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = file.data instanceof Uint8Array
      ? file.data
      : (file.data instanceof ArrayBuffer ? new Uint8Array(file.data) : encoder.encode(file.data));
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
  const visibleUrls = new Set(filteredItems().map((item) => item.url));
  return state.items.filter((item) => (
    state.selected.has(item.url)
    && visibleUrls.has(item.url)
    && !item.unsupportedReason
  ));
}

async function processItemMarkdownAndImages(content, config, files, downloadImages, signal, appendLog, type = state.currentType) {
  let markdown = buildMarkdown(content, type);
  if (downloadImages && content.html) {
    const imageUrls = extractImageUrlsFromHtml(content.html);
    if (imageUrls.length > 0) {
      appendLog(`  └─ 本地化 ${imageUrls.length} 张图片...`);
      for (let i = 0; i < imageUrls.length; i++) {
        if (signal?.aborted) break;
        const imgUrl = imageUrls[i];
        const res = await fetchImageAsUint8Array(imgUrl, signal);
        if (res) {
          const imgName = `img_${content.id}_${String(i + 1).padStart(3, '0')}${res.ext}`;
          files.push({
            name: `${config.folderName}/images/${imgName}`,
            data: res.bytes,
          });
          markdown = markdown.split(imgUrl).join(`./images/${imgName}`);
        }
      }
    }
  }
  files.push({ name: `${config.folderName}/${buildFilename(content, type)}`, data: markdown });
}

function isFatalOpenPlatformCode(code) {
  return [20001, 30001, 30002, 30003].includes(Number(code));
}

async function fetchOfficialContentDetail(item, exportType) {
  const result = await openPlatformRequestRaw('/api/v1/user/content_detail', {
    ContentUrl: item.url,
  });
  if (!result.ok) {
    const err = new Error(result.error || '开放平台全文接口请求失败');
    err.code = result.code;
    err.fatal = isFatalOpenPlatformCode(result.code);
    throw err;
  }
  const normalized = Helpers.normalizeContentDetailResponse(result.data, item.url, {
    ...item,
    exportType,
    author: item.author || state.openPlatform.mySlug || '知乎用户',
  });
  if (!normalized) {
    const err = new Error('开放平台返回内容不可用（Body 为空）');
    err.code = 10001;
    err.fatal = false;
    throw err;
  }
  return normalized;
}

async function fetchOfficialContentComments(contentUrl, order = 'score', maxPages = 2) {
  const limit = 20;
  let offset = '0';
  const items = [];
  const seenOffsets = new Set([offset]);
  let page = 0;
  let calls = 0;

  while (maxPages === 0 || page < maxPages) {
    if (page >= 500) break;
    page += 1;
    calls += 1;
    const result = await openPlatformRequestRaw('/api/v1/user/content_comments', {
      ContentUrl: contentUrl,
      Offset: offset,
      Limit: limit,
      Order: order,
    }, 'GET', { preserveLargeInts: true });
    if (!result.ok) {
      const err = new Error(result.error || '官方评论接口请求失败');
      err.code = result.code;
      err.fatal = isFatalOpenPlatformCode(result.code);
      err.calls = calls;
      throw err;
    }
    const paging = readPaging(result.data);
    items.push(...paging.items);
    const step = nextPageOffset(paging, offset, seenOffsets);
    if (step.error) {
      const err = new Error(step.error);
      err.fatal = false;
      err.calls = calls;
      throw err;
    }
    if (step.done || step.nextOffset == null) break;
    offset = step.nextOffset;
    seenOffsets.add(offset);
  }
  return { items, calls };
}

async function fetchOfficialContentStats(contentUrl, dateRange = {}) {
  const query = { ContentUrl: contentUrl };
  if (dateRange.startDate && dateRange.endDate) {
    query.StartDate = dateRange.startDate;
    query.EndDate = dateRange.endDate;
  }
  const result = await openPlatformRequestRaw('/api/v1/user/creator_content_stats', query);
  if (!result.ok) {
    const err = new Error(result.error || '官方单篇统计接口请求失败');
    err.code = result.code;
    err.fatal = isFatalOpenPlatformCode(result.code);
    throw err;
  }
  return result.data || {};
}

function buildContentFromCachedPin(item, pinId) {
  return {
    id: pinId,
    url: item.url,
    title: item.title || `想法${pinId}`,
    author: item.author || '知乎用户',
    html: item.contentHtml || `<p>${escapeHtml(item.snippet)}</p>`,
    createdTime: item.createdTime || null,
    updatedTime: item.updatedTime || null,
    voteCount: item.voteCount ?? null,
    likeCount: item.likeCount ?? null,
    favoriteCount: item.favoriteCount ?? null,
    commentCount: item.commentCount ?? null,
    thanksCount: item.thanksCount ?? null,
    favTime: item.favTime || null,
    favlistTitle: item.favlistTitle || '',
  };
}

async function fetchWebpageContent(item, exportType, config, signal) {
  const response = await fetch(item.url, { credentials: 'include', signal });
  if (!response.ok) throw new Error(`请求失败：HTTP ${response.status}`);
  const html = await response.text();
  const content = extractContent(item.url, html, exportType);
  if (!content) throw new Error(`无法提取${config.label}内容。`);
  for (const field of ['createdTime', 'updatedTime', 'voteCount', 'likeCount', 'favoriteCount', 'commentCount', 'thanksCount']) {
    content[field] = content[field] ?? item[field] ?? null;
  }
  content.favTime = item.favTime || null;
  content.favlistTitle = item.favlistTitle || '';
  return content;
}

// ============================
// Export ZIP
// ============================
async function exportSelectedZip() {
  const items = selectedItems();
  if (items.length === 0) return;

  const preferOfficialDetail = Boolean(els.preferOfficialDetailCheckbox?.checked && state.openPlatform.configured);
  const includeComments = Boolean(els.includeCommentsCheckbox?.checked && state.openPlatform.configured);
  const includeContentStats = Boolean(els.includeContentStatsCheckbox?.checked && state.openPlatform.configured);
  const commentOrder = els.commentOrderSelect?.value || 'score';
  const commentMaxPages = Number(els.commentMaxPagesSelect?.value ?? 2) || 0;
  const isMyContext = isOfficialMyCreationsMode();
  const allVideos = items.every((item) => (item.exportType || inferExportType(item.url, item.officialContentType)) === 'zvideos');
  const cookie = await checkCookie();
  if (!cookie && !(state.openPlatform.configured && isMyContext && (preferOfficialDetail || allVideos))) {
    els.jobStatus.textContent = '无法获取知乎登录凭证';
    return;
  }

  state.exportAbortController = new AbortController();
  els.exportButton.disabled = true;
  els.cancelButton.disabled = false;
  els.jobLog.textContent = '';
  els.jobStatus.textContent = '正在导出 ZIP...';
  els.jobCounts.textContent = `0 / ${items.length}`;
  setExportProgressVisible(true);
  setProgress(els.exportProgressFill, els.exportProgressText, 0, `0 / ${items.length}`);

  const files = [];
  const failures = [];
  const contentStatsRows = [];
  const downloadImages = els.downloadImagesCheckbox ? els.downloadImagesCheckbox.checked : true;
  const ownerLabel = state.slug || state.openPlatform.mySlug || 'export';
  const zipLabel = isCollectionsMode()
    ? `collections_${state.selectedFavlistToken || 'export'}`
    : `${currentConfig().labelEn}_${ownerLabel}`;

  let officialDetailHalted = false;
  let officialDetailCalls = 0;

  if (state.openPlatform.configured && isMyContext && (preferOfficialDetail || allVideos || includeComments || includeContentStats)) {
    const est = Helpers.estimateCreationQuota({
      itemCount: items.length,
      useContentDetail: preferOfficialDetail || allVideos,
      includeComments,
      maxCommentPages: commentMaxPages || 2,
      includeContentStats,
    });
    appendLog(`提示：本次预计最多消耗约 ${est} 次开放平台“创作能力”额度。`);
  }

  try {
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (state.exportAbortController.signal.aborted) {
        throw new Error('导出已取消。');
      }

      const exportType = item.exportType || inferExportType(item.url, item.officialContentType) || (isCollectionsMode() ? '' : state.currentType);
      const config = exportType ? configFor(exportType) : currentConfig();
      if (!exportType || item.unsupportedReason) {
        const error = item.unsupportedReason || '暂不支持该类型的全文导出';
        failures.push({ url: item.url, error });
        appendLog(`跳过 ${item.url}：${error}`);
      } else {
        try {
          let content = null;

          if (exportType === 'zvideos') {
            if (!state.openPlatform.configured || officialDetailHalted) {
              throw new Error(officialDetailHalted ? '开放平台额度/风控受限，已停止后续请求' : '视频正文需要配置 Access Secret');
            }
            appendLog(`正在调用官方全文 API 获取视频正文：${item.url}`);
            officialDetailCalls += 1;
            content = await fetchOfficialContentDetail(item, exportType);
          } else if (exportType === 'pins') {
            const pinId = item.url.match(/\/pin\/(\d+)/)?.[1] || item.title.replace(/^想法/, '') || '';
            if (item.contentHtml && !preferOfficialDetail) {
              appendLog(`使用缓存内容：${item.url}`);
              content = buildContentFromCachedPin(item, pinId);
            } else if (isMyContext && state.openPlatform.configured && !officialDetailHalted) {
              try {
                appendLog(`正在通过官方全文 API 补全想法正文：${item.url}`);
                officialDetailCalls += 1;
                content = await fetchOfficialContentDetail(item, exportType);
              } catch (officialErr) {
                if (officialErr.fatal) officialDetailHalted = true;
                if (item.contentHtml || item.snippet) {
                  appendLog(`  └─ 官方全文回退缓存摘要：${officialErr.message}`);
                  content = buildContentFromCachedPin(item, pinId);
                } else {
                  throw officialErr;
                }
              }
            } else if (item.contentHtml || item.snippet) {
              appendLog(`使用缓存内容：${item.url}`);
              content = buildContentFromCachedPin(item, pinId);
            } else {
              appendLog(`正在获取 ${item.url}`);
              content = await fetchWebpageContent(item, exportType, config, state.exportAbortController.signal);
            }
          } else if (preferOfficialDetail && isMyContext && state.openPlatform.configured && !officialDetailHalted) {
            try {
              appendLog(`正在调用官方全文 API：${item.url}`);
              officialDetailCalls += 1;
              content = await fetchOfficialContentDetail(item, exportType);
            } catch (officialErr) {
              if (officialErr.fatal) officialDetailHalted = true;
              if (cookie) {
                appendLog(`  └─ 官方全文失败（${officialErr.message}），回退网页抓取...`);
                content = await fetchWebpageContent(item, exportType, config, state.exportAbortController.signal);
              } else {
                throw officialErr;
              }
            }
          } else {
            appendLog(`正在获取 ${item.url}`);
            try {
              content = await fetchWebpageContent(item, exportType, config, state.exportAbortController.signal);
            } catch (webErr) {
              if (isMyContext && state.openPlatform.configured && !officialDetailHalted) {
                appendLog(`  └─ 网页抓取失败（${webErr.message}），自动回退官方全文 API...`);
                try {
                  officialDetailCalls += 1;
                  content = await fetchOfficialContentDetail(item, exportType);
                } catch (officialErr) {
                  if (officialErr.fatal) officialDetailHalted = true;
                  throw new Error(`${webErr.message}；官方回退失败：${officialErr.message}`);
                }
              } else {
                throw webErr;
              }
            }
          }

          if (isMyContext && state.openPlatform.configured && !officialDetailHalted && includeComments) {
            try {
              appendLog(`  └─ 正在拉取官方评论区（${commentOrder}）...`);
              const commentRes = await fetchOfficialContentComments(content.url || item.url, commentOrder, commentMaxPages);
              officialDetailCalls += commentRes.calls || 0;
              if (commentRes.items.length) {
                content.commentsMarkdown = Helpers.formatCommentsMarkdown(commentRes.items, { order: commentOrder });
              }
            } catch (commentErr) {
              officialDetailCalls += commentErr?.calls || 1;
              if (commentErr?.fatal) officialDetailHalted = true;
              appendLog(`  └─ 评论拉取跳过：${commentErr.message}`);
            }
          }

          if (isMyContext && state.openPlatform.configured && !officialDetailHalted && includeContentStats) {
            try {
              appendLog(`  └─ 正在拉取单篇创作统计...`);
              officialDetailCalls += 1;
              const statsData = await fetchOfficialContentStats(content.url || item.url);
              const metrics = extractSingleStatsMetrics(statsData);
              if (metrics) {
                content.contentStats = metrics;
                contentStatsRows.push({
                  id: content.id,
                  type: config.frontmatterType,
                  title: content.title,
                  url: content.url,
                  metrics,
                });
              }
            } catch (statsErr) {
              if (statsErr?.fatal) officialDetailHalted = true;
              appendLog(`  └─ 单篇统计跳过：${statsErr.message}`);
            }
          }

          await processItemMarkdownAndImages(content, config, files, downloadImages, state.exportAbortController.signal, appendLog, exportType);
          appendLog(`已加入：${content.title}`);
        } catch (error) {
          if (error?.fatal) officialDetailHalted = true;
          failures.push({ url: item.url, error: error.message });
          appendLog(`失败 ${item.url}：${error.message}`);
        }
      }

      const completed = index + 1;
      const percent = (completed / items.length) * 100;
      els.jobCounts.textContent = `${completed} / ${items.length}`;
      setProgress(els.exportProgressFill, els.exportProgressText, percent, `${completed} / ${items.length}`);
    }

    if (contentStatsRows.length) {
      files.push({
        name: 'creator_stats.csv',
        data: `\uFEFF${Helpers.buildContentStatsCsv(contentStatsRows)}`,
      });
    }
    if (failures.length) {
      files.push({
        name: 'failed_urls.txt',
        data: failures.map((entry) => `${entry.url}\t${entry.error}`).join('\n'),
      });
    }
    if (files.length === 0) throw new Error('没有生成任何 Markdown 文件。');

    appendLog(`正在打包 ZIP...${officialDetailCalls ? `（本次共调用开放平台创作能力 API ${officialDetailCalls} 次）` : ''}`);
    const zipBlob = createZipBlob(files);
    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `zhihu_${zipLabel}_${datePart}.zip`;
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
    setExportProgressVisible(false);
    renderSelection();
  }
}

// ============================
// Render functions
// ============================
function renderUrls() {
  const config = currentConfig();
  const visibleItems = filteredItems();
  els.cacheStatus.textContent = state.remoteTotal
    ? `${state.items.length} / ${state.remoteTotal}`
    : `${state.items.length} 条`;
  els.lastCollectedText.textContent = state.lastCollectedAt ? formatTime(state.lastCollectedAt) : '';

  if (state.items.length === 0) {
    els.urlList.innerHTML = `<div class="empty">${emptyListMessage()}</div>`;
    renderSelection();
    return;
  }

  if (visibleItems.length === 0) {
    els.urlList.innerHTML = `<div class="empty">没有符合时间筛选条件的${config.label}。</div>`;
    renderSelection();
    return;
  }

  els.urlList.innerHTML = visibleItems
    .map((item) => {
      const index = state.items.findIndex((entry) => entry.url === item.url);
      const checked = state.selected.has(item.url) ? 'checked' : '';
      const typeLabelText = item.exportType ? configFor(item.exportType).label : config.label;
      const title = item.title || `未命名知乎${typeLabelText}`;
      const snippet = item.unsupportedReason
        || item.snippet
        || `还没有采集到预览内容。可点击"补全预览"。`;
      const createdLabel = formatCreatedDate(item.createdTime);
      const favLabel = formatCreatedDate(item.favTime);
      const metaParts = [
        createdLabel ? `发布于 ${createdLabel}` : '',
        favLabel ? `收藏于 ${favLabel}` : '',
        item.favlistTitle || '',
        item.unsupportedReason || '',
      ].filter(Boolean);
      const metaText = metaParts.join(' · ') || '发布时间未知';
      const unsupportedClass = item.unsupportedReason ? ' is-unsupported' : '';
      return `
        <label class="url-item${unsupportedClass}">
          <input type="checkbox" data-index="${index}" ${checked} ${item.unsupportedReason ? 'disabled' : ''}>
          <span class="url-content">
            <strong class="url-title">${escapeHtml(title)}</strong>
            <span class="url-snippet">${escapeHtml(snippet)}</span>
            <span class="url-meta">${escapeHtml(metaText)}</span>
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
  const visibleItems = filteredItems();
  const selectedVisible = visibleItems.filter((item) => state.selected.has(item.url)).length;
  const filterHint = hasDateFilter() ? `（筛选后 ${visibleItems.length} 条）` : '';
  els.selectedCount.textContent = `已选择 ${selectedVisible} / ${visibleItems.length} 条${filterHint}`;
  els.exportButton.disabled = selectedVisible === 0 || exporting;
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
  if (!isCollectionsMode() && !state.slug && !shouldUseOfficialContents()) return;
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
  await refreshOpenPlatformStatus();
  await loadCacheForActiveTab();
  await checkCookie();
  await maybeFillMySlug();
});

els.collectButton.addEventListener('click', collectUrls);
els.hydrateButton.addEventListener('click', hydrateMissingPreviews);

els.selectAllButton.addEventListener('click', () => {
  filteredItems().forEach((item) => {
    if (!item.unsupportedReason) state.selected.add(item.url);
  });
  renderUrls();
});

els.selectNoneButton.addEventListener('click', () => {
  state.selected.clear();
  renderUrls();
});

els.clearCacheButton.addEventListener('click', clearCurrentCache);

els.dateFilterFrom.addEventListener('change', applyDateFilterFromInputs);
els.dateFilterTo.addEventListener('change', applyDateFilterFromInputs);
els.clearDateFilterButton.addEventListener('click', () => {
  state.dateFilterFrom = '';
  state.dateFilterTo = '';
  syncDateFilterInputs();
  renderUrls();
});

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

if (els.openPlatformToggle && els.openPlatformBody) {
  els.openPlatformToggle.addEventListener('click', () => {
    const expanded = els.openPlatformToggle.getAttribute('aria-expanded') === 'true';
    els.openPlatformToggle.setAttribute('aria-expanded', String(!expanded));
    els.openPlatformBody.hidden = expanded;
  });
}

if (els.saveSecretButton) {
  els.saveSecretButton.addEventListener('click', async () => {
    const secret = els.accessSecretInput.value.trim();
    const result = await sendRuntimeMessage({ type: 'saveAccessSecret', secret });
    if (!result?.ok) {
      els.openPlatformHint.textContent = result?.error || '保存失败';
      setStatus(els.openPlatformStatus, '保存失败', false);
      return;
    }
    els.accessSecretInput.value = '';
    await refreshOpenPlatformStatus();
    await maybeFillMySlug();
    await loadCacheForActiveTab();
    els.openPlatformHint.textContent = '已保存。建议点一次探测连接确认可用。';
  });
}

if (els.clearSecretButton) {
  els.clearSecretButton.addEventListener('click', async () => {
    await sendRuntimeMessage({ type: 'clearAccessSecret' });
    if (els.accessSecretInput) {
      els.accessSecretInput.value = '';
      els.accessSecretInput.placeholder = '粘贴个人中心的 Access Secret';
    }
    await refreshOpenPlatformStatus();
    await loadCacheForActiveTab();
  });
}

if (els.probeSecretButton) {
  els.probeSecretButton.addEventListener('click', async () => {
    els.probeSecretButton.disabled = true;
    els.openPlatformHint.textContent = '正在探测...';
    try {
      const typedSecret = els.accessSecretInput?.value?.trim() || '';
      if (typedSecret) {
        const saved = await sendRuntimeMessage({ type: 'saveAccessSecret', secret: typedSecret });
        if (!saved?.ok) {
          setStatus(els.openPlatformStatus, '探测失败', false);
          els.openPlatformHint.textContent = saved?.error || '请先保存 Access Secret 再探测。';
          return;
        }
        els.accessSecretInput.value = '';
        await refreshOpenPlatformStatus();
        await loadCacheForActiveTab();
      }
      const result = await sendRuntimeMessage({ type: 'probeAccessSecret' });
      if (!result?.ok) {
        setStatus(els.openPlatformStatus, '探测失败', false);
        els.openPlatformHint.textContent = result?.error || '探测失败。若尚未保存 Secret，请先保存再点探测。';
        return;
      }
      setStatus(els.openPlatformStatus, state.openPlatform.masked || '已连接', true);
      els.openPlatformHint.textContent = result.message || 'Access Secret 可用';
    } catch (error) {
      setStatus(els.openPlatformStatus, '探测失败', false);
      els.openPlatformHint.textContent = error.message || '探测失败';
    } finally {
      els.probeSecretButton.disabled = false;
    }
  });
}

if (els.saveMySlugButton) {
  els.saveMySlugButton.addEventListener('click', async () => {
    const slug = els.mySlugInput.value.trim();
    const result = await sendRuntimeMessage({ type: 'saveMySlug', slug });
    if (!result?.ok) {
      els.openPlatformHint.textContent = result?.error || '保存 slug 失败';
      return;
    }
    await refreshOpenPlatformStatus();
    els.openPlatformHint.textContent = slug
      ? `已记录你的 slug：${slug}。打开自己的主页采集时会优先走官方目录。`
      : '已清除我的 slug。';
    if (!isCollectionsMode()) await loadCacheForActiveTab();
  });
}

if (els.refreshFavlistsButton) {
  els.refreshFavlistsButton.addEventListener('click', async () => {
    if (!state.openPlatform.configured) {
      els.lastCollectedText.textContent = '请先配置 Access Secret。';
      return;
    }
    els.refreshFavlistsButton.disabled = true;
    try {
      const count = await collectFavlists();
      els.lastCollectedText.textContent = count ? `已加载 ${count} 个收藏夹` : '没有公开收藏夹';
      await loadCacheForActiveTab();
    } catch (error) {
      els.lastCollectedText.textContent = error.message;
    } finally {
      els.refreshFavlistsButton.disabled = false;
    }
  });
}

if (els.favlistSelect) {
  els.favlistSelect.addEventListener('change', async () => {
    state.selectedFavlistToken = els.favlistSelect.value || '';
    updateFavlistDescHint();
    await storageSet({
      [favlistsCacheKey()]: {
        items: state.favlists,
        lastToken: state.selectedFavlistToken,
      },
    });
    await loadCacheForActiveTab();
  });
}

if (els.dateFilterFieldSelect) {
  els.dateFilterFieldSelect.addEventListener('change', () => {
    state.dateFilterField = els.dateFilterFieldSelect.value || 'createdTime';
    renderUrls();
  });
}

if (els.includeCommentsCheckbox) {
  els.includeCommentsCheckbox.addEventListener('change', () => {
    if (els.commentOptionsRow) {
      els.commentOptionsRow.hidden = !els.includeCommentsCheckbox.checked;
    }
  });
}

// ============================
// Creator Stats Dashboard (P1)
// ============================
function extractSingleStatsEntry(data) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.Items)) {
    return data.Items[0] || null;
  }
  return data;
}

function extractSingleStatsMetrics(data) {
  const entry = extractSingleStatsEntry(data);
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry.Metrics && typeof entry.Metrics === 'object' ? entry.Metrics : entry;
  const hasAny = Object.values(candidate).some((v) => v !== null && v !== undefined && v !== '' && typeof v !== 'object');
  return hasAny ? candidate : null;
}

function renderAudienceHtml(audience) {
  if (!audience || typeof audience !== 'object') return '';
  const statusText = audience.Status || audience.Reason
    ? `<p class="help-text">受众画像状态：${escapeHtml(audience.Status || '')} ${escapeHtml(audience.Reason || '')}</p>`
    : '';
  const sections = [];
  for (const [key, label] of [
    ['Gender', '性别分布'],
    ['Age', '年龄分布'],
    ['City', '城市分布'],
    ['Province', '省份分布'],
    ['FansType', '粉丝属性'],
    ['Device', '设备分布'],
  ]) {
    const entries = audience[key];
    if (Array.isArray(entries) && entries.length) {
      const chips = entries.slice(0, 8).map((item) => {
        const name = item?.Name || item?.Label || item?.Key || '—';
        const val = item?.Ratio ?? item?.Percent ?? item?.Rate ?? item?.Value ?? item?.Count ?? '';
        return `<span class="audience-chip">${escapeHtml(String(name))}${val !== '' && val != null ? ` ${escapeHtml(String(val))}` : ''}</span>`;
      }).join('');
      sections.push(`<div class="audience-group"><strong>${label}</strong><div class="audience-chips">${chips}</div></div>`);
    }
  }
  if (!statusText && !sections.length) return '';
  return `<div class="audience-block">${statusText}${sections.join('')}</div>`;
}

function renderKpiCards(pairs) {
  return `<div class="stats-kpi-grid">${pairs.map(([label, value]) => (
    `<div class="stats-kpi-item"><span class="stats-kpi-label">${escapeHtml(label)}</span><strong class="stats-kpi-value">${escapeHtml(Helpers.formatStatValue(value))}</strong></div>`
  )).join('')}</div>`;
}

function renderAccountStats(data, queryMeta = {}) {
  if (!els.accountStatsResult) return;
  if (!data) {
    els.accountStatsResult.innerHTML = '<p class="help-text">暂无统计数据。</p>';
    return;
  }
  const m = data.Metrics || {};
  const cc = data.CreationCounts || {};
  const f = data.Followers || {};
  const daily = Array.isArray(data.FollowerDetails?.Daily) ? data.FollowerDetails.Daily : [];
  const period = data.FollowerDetails?.Period || {};
  if (els.statsUpdatedText) {
    els.statsUpdatedText.textContent = m.Updated ? `更新：${m.Updated}` : `类型：${data.ContentType || queryMeta.ContentType || 'all'}`;
  }

  const parts = [];
  parts.push(renderKpiCards([
    ['回答', cc.Answer],
    ['文章', cc.Article],
    ['视频', cc.Video],
    ['总粉丝', cc.Follower ?? f.Total],
    ['昨日净增粉丝', f.Yesterday],
    ['活跃粉丝', f.ActiveCount],
    ['阅读量', m.ViewCount],
    ['播放量', m.PlayCount],
    ['赞同数', m.UpvoteCount],
    ['喜欢数', m.LikeCount],
    ['评论数', m.CommentCount],
    ['收藏数', m.CollectCount],
    ['分享数', m.ShareCount],
    ['点击率 (原值)', m.ClickRate],
    ['阅读完成率', m.ReadFinishedRate],
    ['播放完成率', m.PlayFinishedRate],
  ]));

  if (period.Date || period.NetIncrease7Days != null || period.NetIncrease30Days != null) {
    parts.push(`
      <table class="stats-table">
        <thead><tr><th>周期</th><th>净增</th><th>新增</th><th>取关</th><th>访客</th><th>转粉率</th></tr></thead>
        <tbody>
          <tr><td>7日</td><td>${escapeHtml(Helpers.formatStatValue(period.NetIncrease7Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.NewCount7Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.UnfollowCount7Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.HomepageVisitorCount7Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.HomepageConversionRate7Days))}</td></tr>
          <tr><td>14日</td><td>${escapeHtml(Helpers.formatStatValue(period.NetIncrease14Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.NewCount14Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.UnfollowCount14Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.HomepageVisitorCount14Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.HomepageConversionRate14Days))}</td></tr>
          <tr><td>30日</td><td>${escapeHtml(Helpers.formatStatValue(period.NetIncrease30Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.NewCount30Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.UnfollowCount30Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.HomepageVisitorCount30Days))}</td><td>${escapeHtml(Helpers.formatStatValue(period.HomepageConversionRate30Days))}</td></tr>
        </tbody>
      </table>
    `);
  }

  if (daily.length) {
    const recent = daily.slice(-7).reverse();
    parts.push(`
      <table class="stats-table">
        <thead><tr><th>日期</th><th>净增</th><th>新增</th><th>取关</th><th>主页访客</th></tr></thead>
        <tbody>${recent.map((row) => (
          `<tr><td>${escapeHtml(Helpers.formatStatValue(row.Date))}</td><td>${escapeHtml(Helpers.formatStatValue(row.NetIncrease))}</td><td>${escapeHtml(Helpers.formatStatValue(row.NewCount))}</td><td>${escapeHtml(Helpers.formatStatValue(row.UnfollowCount))}</td><td>${escapeHtml(Helpers.formatStatValue(row.HomepageVisitorCount))}</td></tr>`
        )).join('')}</tbody>
      </table>
    `);
  }

  parts.push(renderAudienceHtml(data.Audience));
  els.accountStatsResult.innerHTML = parts.filter(Boolean).join('');
}

function renderSingleContentStats(data) {
  if (!els.singleStatsResult) return;
  const entry = extractSingleStatsEntry(data);
  const metrics = extractSingleStatsMetrics(data);
  if (!entry && !metrics) {
    els.singleStatsResult.innerHTML = '<p class="help-text">接口返回空列表：可能该内容暂无统计明细，或不代表所有指标为 0。</p>';
    return;
  }
  const m = metrics || {};
  const audienceHtml = renderAudienceHtml(entry?.Audience || data?.Audience);
  els.singleStatsResult.innerHTML = [
    entry?.Date || m.Date ? `<p class="help-text">统计日期：${escapeHtml(String(entry?.Date || m.Date))}</p>` : '',
    renderKpiCards([
      ['阅读量', m.ViewCount],
      ['播放量', m.PlayCount],
      ['曝光 UV', m.PageShowUV],
      ['点击率', m.ClickRate],
      ['阅读完成率', m.ReadFinishedRate],
      ['播放完成率', m.PlayFinishedRate],
      ['新增关注', m.NewFollowerCount],
      ['净增关注', m.FollowerGain],
      ['转粉率', m.FollowerConversionRate],
      ['正向互动率', m.PositiveInteractionRate],
      ['7日赞同', m.UpvoteCount7Days],
      ['赞同数', m.UpvoteCount],
      ['评论数', m.CommentCount],
      ['收藏数', m.CollectCount],
    ]),
    audienceHtml,
  ].filter(Boolean).join('');
}

async function loadAccountStats() {
  if (!state.openPlatform.configured) {
    els.accountStatsResult.innerHTML = '<p class="help-text">请先配置 Access Secret。</p>';
    return;
  }
  const range = Helpers.validateStatsDateRange(els.statsStartDate?.value, els.statsEndDate?.value);
  if (!range.ok) {
    els.accountStatsResult.innerHTML = `<p class="help-text">${escapeHtml(range.error)}</p>`;
    return;
  }
  const contentType = els.statsContentTypeSelect?.value || 'all';
  const query = { ContentType: contentType };
  if (range.startDate && range.endDate) {
    query.StartDate = range.startDate;
    query.EndDate = range.endDate;
  }

  els.loadAccountStatsButton.disabled = true;
  els.accountStatsResult.innerHTML = '<p class="help-text">正在请求开放平台账号统计…</p>';
  try {
    const data = await openPlatformRequest('/api/v1/user/creator_account_stats', query);
    state.accountStats = data;
    state.accountStatsQuery = query;
    renderAccountStats(data, query);
    if (els.exportStatsReportButton) els.exportStatsReportButton.disabled = false;
  } catch (error) {
    els.accountStatsResult.innerHTML = `<p class="help-text">加载失败：${escapeHtml(error.message)}</p>`;
  } finally {
    els.loadAccountStatsButton.disabled = false;
  }
}

async function exportStatsReportZip() {
  if (!state.accountStats) return;
  const report = Helpers.buildAccountStatsReport(state.accountStats, state.accountStatsQuery || {});
  const datePart = new Date().toISOString().slice(0, 10);
  const files = [
    { name: 'creator_account_stats.md', data: report.markdown },
    { name: 'follower_daily.csv', data: `\uFEFF${report.dailyCsv}` },
    { name: 'creator_account_stats.json', data: report.jsonText },
  ];
  const blob = createZipBlob(files);
  await downloadBlob(blob, `zhihu_creator_stats_${datePart}.zip`);
  els.jobStatus.textContent = '统计报表 ZIP 已下载';
}

async function loadSingleContentStats() {
  if (!state.openPlatform.configured) {
    els.singleStatsResult.innerHTML = '<p class="help-text">请先配置 Access Secret。</p>';
    return;
  }
  const rawUrl = els.singleStatsUrlInput?.value?.trim() || '';
  if (!rawUrl) {
    els.singleStatsResult.innerHTML = '<p class="help-text">请输入本人创作内容的知乎链接。</p>';
    return;
  }
  const range = Helpers.validateStatsDateRange(els.statsStartDate?.value, els.statsEndDate?.value);
  if (!range.ok) {
    els.singleStatsResult.innerHTML = `<p class="help-text">${escapeHtml(range.error)}</p>`;
    return;
  }
  els.loadSingleStatsButton.disabled = true;
  els.singleStatsResult.innerHTML = '<p class="help-text">正在查询单篇创作统计…</p>';
  try {
    const data = await fetchOfficialContentStats(Helpers.stripTrackingParams(rawUrl), range);
    renderSingleContentStats(data);
  } catch (error) {
    els.singleStatsResult.innerHTML = `<p class="help-text">查询失败：${escapeHtml(error.message)}</p>`;
  } finally {
    els.loadSingleStatsButton.disabled = false;
  }
}

if (els.clearStatsDateButton) {
  els.clearStatsDateButton.addEventListener('click', () => {
    if (els.statsStartDate) els.statsStartDate.value = '';
    if (els.statsEndDate) els.statsEndDate.value = '';
  });
}

if (els.loadAccountStatsButton) {
  els.loadAccountStatsButton.addEventListener('click', loadAccountStats);
}

if (els.exportStatsReportButton) {
  els.exportStatsReportButton.addEventListener('click', exportStatsReportZip);
}

if (els.fillCurrentTabUrlButton) {
  els.fillCurrentTabUrlButton.addEventListener('click', async () => {
    await refreshActiveTab();
    if (els.singleStatsUrlInput && state.tab?.url) {
      els.singleStatsUrlInput.value = Helpers.stripTrackingParams(state.tab.url);
    }
  });
}

if (els.loadSingleStatsButton) {
  els.loadSingleStatsButton.addEventListener('click', loadSingleContentStats);
}

// ============================
// Initialization
// ============================
(async function init() {
  setStatus(els.serviceStatus, 'ZIP 下载', true);
  els.jobStatus.textContent = '当前没有导出任务';
  els.cancelButton.disabled = true;
  setExportProgressVisible(false);
  if (els.commentOptionsRow && els.includeCommentsCheckbox) {
    els.commentOptionsRow.hidden = !els.includeCommentsCheckbox.checked;
  }
  syncDateFilterInputs();
  syncModeChrome();
  await refreshOpenPlatformStatus();
  await loadCacheForActiveTab();
  await checkCookie();
  await maybeFillMySlug();
})();
