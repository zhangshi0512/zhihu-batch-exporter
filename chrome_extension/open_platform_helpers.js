'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.ZhihuOpenPlatformHelpers = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_SAFE_INT_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

  /**
   * Quote unquoted integer tokens in JSON whose magnitude exceeds Number.MAX_SAFE_INTEGER
   * so 64-bit Zhihu IDs (e.g. comment ID/ReplyID/RootID) do not lose precision in JSON.parse.
   */
  function quoteLargeJsonIntegers(rawText) {
    const text = String(rawText || '');
    if (!text) return text;

    let result = '';
    let i = 0;
    const len = text.length;
    let inString = false;
    let escaped = false;

    while (i < len) {
      const ch = text[i];
      if (inString) {
        result += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        i += 1;
        continue;
      }

      if (ch === '"') {
        inString = true;
        result += ch;
        i += 1;
        continue;
      }

      if ((ch === '-' || (ch >= '0' && ch <= '9'))) {
        const prev = i > 0 ? text[i - 1] : '';
        if (!/[A-Za-z0-9_.]/.test(prev)) {
          let j = i;
          if (text[j] === '-') j += 1;
          const digitStart = j;
          while (j < len && text[j] >= '0' && text[j] <= '9') j += 1;
          const next = j < len ? text[j] : '';
          const isPlainInteger = j > digitStart && next !== '.' && next !== 'e' && next !== 'E';
          if (isPlainInteger) {
            const token = text.slice(i, j);
            const digitsCount = j - digitStart;
            let unsafe = false;
            if (digitsCount >= 16) {
              try {
                const absVal = BigInt(token[0] === '-' ? token.slice(1) : token);
                unsafe = absVal > MAX_SAFE_INT_BIGINT;
              } catch {
                unsafe = true;
              }
            }
            if (unsafe) {
              result += `"${token}"`;
              i = j;
              continue;
            }
          }
        }
      }

      result += ch;
      i += 1;
    }

    return result;
  }

  function parseJsonSafe(rawText, options = {}) {
    if (!rawText) return null;
    const source = options.preserveLargeInts ? quoteLargeJsonIntegers(rawText) : String(rawText);
    return JSON.parse(source);
  }

  function stripTrackingParams(url) {
    try {
      const parsed = new URL(url);
      ['utm_medium', 'utm_source', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => {
        parsed.searchParams.delete(key);
      });
      parsed.hash = '';
      return parsed.toString().replace(/[?&]$/, '');
    } catch {
      return String(url || '');
    }
  }

  function normalizeZhihuUrl(url) {
    let normalized = stripTrackingParams(String(url || '').trim());
    if (normalized.startsWith('//')) normalized = `https:${normalized}`;
    if (normalized.startsWith('http://')) normalized = normalized.replace(/^http:\/\//, 'https://');
    return normalized;
  }

  function extractZhihuContentIdentity(url, officialContentType = '') {
    const cleanUrl = normalizeZhihuUrl(url);
    const typeHint = String(officialContentType || '').toLowerCase();

    const answerWithQuestion = cleanUrl.match(/zhihu\.com\/question\/(\d+)\/answer\/(\d+)/i);
    if (answerWithQuestion) {
      return {
        exportType: 'answers',
        officialType: 'answer',
        id: answerWithQuestion[2],
        questionId: answerWithQuestion[1],
        mergeKey: `answer:${answerWithQuestion[2]}`,
        canonicalRank: 2,
      };
    }

    const answerDirect = cleanUrl.match(/zhihu\.com\/answer\/(\d+)/i);
    if (answerDirect) {
      return {
        exportType: 'answers',
        officialType: 'answer',
        id: answerDirect[1],
        questionId: '',
        mergeKey: `answer:${answerDirect[1]}`,
        canonicalRank: 1,
      };
    }

    const articleMatch = cleanUrl.match(/zhihu\.com\/p\/(\d+)/i);
    if (articleMatch) {
      return {
        exportType: 'articles',
        officialType: 'article',
        id: articleMatch[1],
        questionId: '',
        mergeKey: `article:${articleMatch[1]}`,
        canonicalRank: cleanUrl.includes('zhuanlan.zhihu.com') ? 2 : 1,
      };
    }

    const pinMatch = cleanUrl.match(/zhihu\.com\/pin\/(\d+)/i);
    if (pinMatch) {
      return {
        exportType: 'pins',
        officialType: 'pin',
        id: pinMatch[1],
        questionId: '',
        mergeKey: `pin:${pinMatch[1]}`,
        canonicalRank: 2,
      };
    }

    const zvideoMatch = cleanUrl.match(/zhihu\.com\/zvideo\/(\d+)/i);
    if (zvideoMatch) {
      return {
        exportType: 'zvideos',
        officialType: 'zvideo',
        id: zvideoMatch[1],
        questionId: '',
        mergeKey: `zvideo:${zvideoMatch[1]}`,
        canonicalRank: 2,
      };
    }

    const questionMatch = cleanUrl.match(/zhihu\.com\/question\/(\d+)(?:$|[/?#])/i);
    if (questionMatch) {
      return {
        exportType: 'questions',
        officialType: 'question',
        id: questionMatch[1],
        questionId: questionMatch[1],
        mergeKey: `question:${questionMatch[1]}`,
        canonicalRank: 2,
      };
    }

    const typeMap = {
      answer: 'answers',
      article: 'articles',
      pin: 'pins',
      zvideo: 'zvideos',
      question: 'questions',
    };
    const exportType = typeMap[typeHint] || '';
    return {
      exportType,
      officialType: typeHint,
      id: '',
      questionId: '',
      mergeKey: cleanUrl || '',
      canonicalRank: 0,
    };
  }

  function itemMergeKey(item) {
    if (typeof item === 'string') {
      const id = extractZhihuContentIdentity(item);
      return id.mergeKey || item;
    }
    if (item?.url) {
      const id = extractZhihuContentIdentity(item.url, item.officialContentType || item.exportType);
      return id.mergeKey || item.url;
    }
    return `${item?.officialContentType || item?.exportType || 'item'}:${item?.title || ''}`;
  }

  function pickPreferredUrl(urlA, urlB, typeHint = '') {
    if (!urlA) return urlB || '';
    if (!urlB) return urlA || '';
    const rankA = extractZhihuContentIdentity(urlA, typeHint).canonicalRank;
    const rankB = extractZhihuContentIdentity(urlB, typeHint).canonicalRank;
    return rankA >= rankB ? urlA : urlB;
  }

  function readOfficialPaging(data) {
    const paging = data?.Paging || data?.paging || {};
    const totalsRaw = paging.Totals ?? paging.totals;
    const totals = totalsRaw == null || totalsRaw === '' ? null : Number(totalsRaw);
    return {
      isEnd: paging.IsEnd ?? paging.is_end ?? paging.isEnd,
      nextOffset: paging.NextOffset ?? paging.next_offset ?? paging.nextOffset,
      totals: Number.isFinite(totals) ? totals : null,
      items: data?.Items || data?.items || [],
    };
  }

  /**
   * Strict pagination helper complying with Zhihu Open Platform docs:
   * - When IsEnd=false, strictly use NextOffset as the next Offset.
   * - Do NOT stop on short or empty pages when IsEnd=false.
   * - Do NOT synthesize offsets by adding pageSize or Items.length.
   * - If IsEnd=false but NextOffset is missing or does not advance, report anomaly and stop.
   */
  function nextOfficialPageOffset(paging, currentOffset, seenOffsets = null) {
    if (paging?.isEnd === true) {
      return { done: true, nextOffset: null, error: null };
    }

    const rawNext = paging?.nextOffset;
    const nextStr = rawNext == null ? '' : String(rawNext).trim();

    if (paging?.isEnd === false) {
      if (!nextStr) {
        return {
          done: true,
          nextOffset: null,
          error: '分页异常：IsEnd=false 但未返回 NextOffset，已停止翻页',
        };
      }
      const curStr = String(currentOffset ?? '').trim();
      const curInt = /^-?\d+$/.test(curStr) ? BigInt(curStr) : null;
      const nextInt = /^-?\d+$/.test(nextStr) ? BigInt(nextStr) : null;

      if (curInt !== null && nextInt !== null) {
        if (nextInt <= curInt) {
          return {
            done: true,
            nextOffset: null,
            error: `分页异常：NextOffset (${nextStr}) 未大于当前 Offset (${curStr})，已停止翻页`,
          };
        }
      } else if (nextStr === curStr || (seenOffsets && seenOffsets.has(nextStr))) {
        return {
          done: true,
          nextOffset: null,
          error: `分页异常：NextOffset (${nextStr}) 重复或未递增，已停止翻页`,
        };
      }

      return { done: false, nextOffset: nextStr, error: null };
    }

    // Fallback if IsEnd is unexpectedly omitted
    if (!nextStr || nextStr === String(currentOffset ?? '').trim() || (seenOffsets && seenOffsets.has(nextStr))) {
      return { done: true, nextOffset: null, error: null };
    }
    return { done: false, nextOffset: nextStr, error: null };
  }

  function sanitizeHtmlFragment(html) {
    const raw = String(html || '');
    if (!raw) return '';

    if (typeof DOMParser !== 'undefined') {
      try {
        const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html');
        const body = doc.body;
        if (body) {
          body
            .querySelectorAll('script, style, noscript, iframe, object, embed, link, meta, base, form')
            .forEach((el) => el.remove());
          body.querySelectorAll('*').forEach((el) => {
            [...el.attributes].forEach((attr) => {
              const name = attr.name.toLowerCase();
              const value = String(attr.value || '').trim();
              if (name.startsWith('on')) {
                el.removeAttribute(attr.name);
                return;
              }
              if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^javascript:/i.test(value)) {
                el.removeAttribute(attr.name);
              }
            });
          });
          return body.innerHTML.trim();
        }
      } catch {
        // Fallback to regex sanitization below.
      }
    }

    return raw
      .replace(/<\s*(script|style|noscript|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*(link|meta|base)\b[^>]*\/?>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2')
      .trim();
  }

  function normalizeContentDetailResponse(data, fallbackUrl = '', fallbackMeta = {}) {
    if (!data || typeof data !== 'object') return null;
    const rawBody = String(data.Body ?? data.body ?? '').trim();
    if (!rawBody) return null;

    const cleanHtml = sanitizeHtmlFragment(rawBody);
    if (!cleanHtml) return null;

    const url = normalizeZhihuUrl(data.Url || data.url || fallbackUrl);
    const identity = extractZhihuContentIdentity(url, data.ContentType || data.content_type || fallbackMeta.officialContentType);
    const token = String(data.ContentToken ?? data.content_token ?? identity.id ?? '').trim();
    const rawTitle = String(data.Title ?? data.title ?? '').trim();

    let title = rawTitle || String(fallbackMeta.title || '').trim();
    if (!title) {
      if (identity.exportType === 'pins') title = `想法${token || ''}`;
      else if (identity.exportType === 'zvideos') title = `视频${token || ''}`;
      else title = `知乎内容${token || ''}`;
    }

    return {
      id: token || identity.id,
      url,
      type: identity.exportType || fallbackMeta.exportType || '',
      officialContentType: String(data.ContentType ?? data.content_type ?? identity.officialType ?? '').toLowerCase(),
      title,
      author: fallbackMeta.author || '知乎用户',
      html: cleanHtml,
      createdTime: fallbackMeta.createdTime ?? null,
      updatedTime: fallbackMeta.updatedTime ?? null,
      voteCount: fallbackMeta.voteCount ?? null,
      likeCount: fallbackMeta.likeCount ?? null,
      favoriteCount: fallbackMeta.favoriteCount ?? null,
      commentCount: fallbackMeta.commentCount ?? null,
      thanksCount: fallbackMeta.thanksCount ?? null,
      favTime: fallbackMeta.favTime ?? null,
      favlistTitle: fallbackMeta.favlistTitle || '',
      fromOfficialDetail: true,
    };
  }

  function estimateCreationQuota(options = {}) {
    const count = Math.max(0, Number(options.itemCount) || 0);
    let calls = 0;
    if (options.useContentDetail) calls += count;
    if (options.includeComments) {
      const pagesPerItem = Math.max(1, Number(options.maxCommentPages) || 1);
      calls += count * pagesPerItem;
    }
    if (options.includeContentStats) calls += count;
    return calls;
  }

  return {
    quoteLargeJsonIntegers,
    parseJsonSafe,
    stripTrackingParams,
    normalizeZhihuUrl,
    extractZhihuContentIdentity,
    itemMergeKey,
    pickPreferredUrl,
    readOfficialPaging,
    nextOfficialPageOffset,
    sanitizeHtmlFragment,
    normalizeContentDetailResponse,
    estimateCreationQuota,
  };
});
