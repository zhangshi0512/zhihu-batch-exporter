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

  function decodeBasicEntities(text) {
    return String(text || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
  }

  function commentHtmlToMarkdownText(html) {
    const cleaned = sanitizeHtmlFragment(html);
    if (!cleaned) return '';
    return decodeBasicEntities(
      cleaned
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
        .replace(/<\/?(?:p|div|blockquote)[^>]*>/gi, '\n')
        .replace(/<a\b[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href, label) => {
          const text = String(label || '').replace(/<[^>]+>/g, '').trim() || href;
          return `[${text}](${href})`;
        })
        .replace(/<[^>]+>/g, '')
    )
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function formatUnixSeconds(ts) {
    if (!ts) return '';
    const date = new Date(Number(ts) * 1000);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function formatCommentsMarkdown(items, options = {}) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return '';

    const orderNames = { score: '按热度', reverse: '按时间倒序', ascending: '按时间正序' };
    const orderText = orderNames[options.order] || options.order || '按热度';
    const lines = [`## 评论区（${orderText}，共 ${list.length} 条根评论）`, ''];

    let hasChildren = false;
    list.forEach((entry, idx) => {
      const root = entry?.Comment || entry?.comment || entry;
      if (!root) return;
      const author = String(root.AuthorToken || '匿名用户');
      const time = formatUnixSeconds(root.CreatedAt);
      const likes = root.LikeCount != null ? `赞 ${root.LikeCount}` : '';
      const dislikes = root.DislikeCount ? `踩 ${root.DislikeCount}` : '';
      const meta = [time, likes, dislikes, root.ID != null ? `ID:${root.ID}` : ''].filter(Boolean).join(' · ');
      const body = commentHtmlToMarkdownText(root.Content || '') || '（空评论）';
      const bodyLines = body.split('\n').map((l) => l.trim()).filter(Boolean);
      lines.push(`${idx + 1}. **${author}**${meta ? ` (${meta})` : ''}`);
      bodyLines.forEach((l) => lines.push(`   ${l}`));

      const children = Array.isArray(entry?.Children) ? entry.Children : [];
      if (children.length > 0) {
        hasChildren = true;
        children.forEach((child) => {
          const cAuthor = String(child.AuthorToken || '匿名用户');
          const cTime = formatUnixSeconds(child.CreatedAt);
          const cLikes = child.LikeCount != null ? `赞 ${child.LikeCount}` : '';
          const replyRef = child.ReplyID && String(child.ReplyID) !== '0' ? `回复#${child.ReplyID}` : '';
          const cMeta = [replyRef, cTime, cLikes, child.ID != null ? `ID:${child.ID}` : ''].filter(Boolean).join(' · ');
          const cBody = commentHtmlToMarkdownText(child.Content || '') || '（空评论）';
          lines.push(`   - **${cAuthor}**${cMeta ? ` (${cMeta})` : ''}: ${cBody.replace(/\n+/g, ' ')}`);
        });
      }
      lines.push('');
    });

    if (hasChildren) {
      lines.push('> 注：子评论为接口附带返回，不保证包含全部楼中楼回复。', '');
    }
    return lines.join('\n');
  }

  function validateStatsDateRange(startDate, endDate) {
    const start = String(startDate || '').trim();
    const end = String(endDate || '').trim();
    if (!start && !end) return { ok: true, startDate: '', endDate: '' };
    if (!start || !end) return { ok: false, error: '开始日期和结束日期必须同时填写，或同时留空' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return { ok: false, error: '日期格式必须为 YYYY-MM-DD' };
    }
    if (end < start) return { ok: false, error: '结束日期不得早于开始日期' };
    return { ok: true, startDate: start, endDate: end };
  }

  function formatStatValue(value) {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  }

  function csvEscape(value) {
    const str = value == null ? '' : String(value);
    if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  const CONTENT_STAT_FRONTMATTER_KEYS = [
    ['stat_date', 'Date'],
    ['view_count', 'ViewCount'],
    ['play_count', 'PlayCount'],
    ['page_show_uv', 'PageShowUV'],
    ['click_rate', 'ClickRate'],
    ['read_finished_rate', 'ReadFinishedRate'],
    ['play_finished_rate', 'PlayFinishedRate'],
    ['new_follower_count', 'NewFollowerCount'],
    ['follower_gain', 'FollowerGain'],
    ['follower_conversion_rate', 'FollowerConversionRate'],
    ['positive_interaction_rate', 'PositiveInteractionRate'],
    ['upvote_count_7d', 'UpvoteCount7Days'],
    ['share_count', 'ShareCount'],
    ['repin_count', 'RepinCount'],
  ];

  function formatContentStatsFrontmatterLines(metrics) {
    if (!metrics || typeof metrics !== 'object') return [];
    const lines = [];
    for (const [yamlKey, apiKey] of CONTENT_STAT_FRONTMATTER_KEYS) {
      const val = metrics[apiKey];
      if (val === undefined || val === null || val === '') continue;
      if (typeof val === 'number') {
        lines.push(`${yamlKey}: ${val}`);
      } else {
        lines.push(`${yamlKey}: "${String(val).replace(/"/g, '\\"')}"`);
      }
    }
    return lines;
  }

  function buildContentStatsCsv(rows) {
    const header = [
      'id', 'type', 'title', 'url', 'Date', 'ViewCount', 'PlayCount', 'PageShowUV',
      'ClickRate', 'ReadFinishedRate', 'PlayFinishedRate', 'UpvoteCount', 'CommentCount',
      'LikeCount', 'CollectCount', 'ShareCount', 'RepinCount',
      'NewFollowerCount', 'FollowerGain', 'FollowerConversionRate', 'PositiveInteractionRate', 'UpvoteCount7Days',
    ];
    const lines = [header.join(',')];
    (rows || []).forEach((row) => {
      const m = row.metrics || {};
      const values = [
        row.id, row.type, row.title, row.url,
        m.Date, m.ViewCount, m.PlayCount, m.PageShowUV,
        m.ClickRate, m.ReadFinishedRate, m.PlayFinishedRate, m.UpvoteCount, m.CommentCount,
        m.LikeCount, m.CollectCount, m.ShareCount, m.RepinCount,
        m.NewFollowerCount, m.FollowerGain, m.FollowerConversionRate, m.PositiveInteractionRate, m.UpvoteCount7Days,
      ];
      lines.push(values.map(csvEscape).join(','));
    });
    return lines.join('\n');
  }

  function buildAccountStatsReport(data, queryMeta = {}) {
    const d = data || {};
    const cc = d.CreationCounts || {};
    const m = d.Metrics || {};
    const f = d.Followers || {};
    const daily = d.FollowerDetails?.Daily || [];
    const period = d.FollowerDetails?.Period || {};

    const md = [
      `# 知乎创作者账号数据报告`,
      '',
      `- 内容类型：\`${d.ContentType || queryMeta.ContentType || 'all'}\``,
      queryMeta.StartDate ? `- 统计范围：${queryMeta.StartDate} 至 ${queryMeta.EndDate}` : '- 统计范围：平台默认范围',
      m.Updated ? `- 数据更新时间：${m.Updated}` : '',
      '',
      '## 创作与粉丝概览',
      '',
      `- 回答：${formatStatValue(cc.Answer)} | 文章：${formatStatValue(cc.Article)} | 视频：${formatStatValue(cc.Video)} | 粉丝：${formatStatValue(cc.Follower ?? f.Total)}`,
      `- 昨日净增粉丝：${formatStatValue(f.Yesterday)}（新增 ${formatStatValue(f.NewYesterday)} / 取关 ${formatStatValue(f.CancelledYesterday)}）`,
      `- 活跃粉丝数：${formatStatValue(f.ActiveCount)} | 活跃粉丝占比：${formatStatValue(f.ActiveRatio)}`,
      '',
      '## 核心内容指标',
      '',
      '| 指标 | 数值 |',
      '| :--- | :--- |',
      ...[
        ['阅读量 (ViewCount)', m.ViewCount],
        ['播放量 (PlayCount)', m.PlayCount],
        ['赞同数 (UpvoteCount)', m.UpvoteCount],
        ['喜欢数 (LikeCount)', m.LikeCount],
        ['评论数 (CommentCount)', m.CommentCount],
        ['收藏数 (CollectCount)', m.CollectCount],
        ['分享数 (ShareCount)', m.ShareCount],
        ['转发数 (RepinCount)', m.RepinCount],
        ['发布内容数 (PublishCount)', m.PublishCount],
        ['点击率 (ClickRate)', m.ClickRate],
        ['阅读完成率 (ReadFinishedRate)', m.ReadFinishedRate],
        ['播放完成率 (PlayFinishedRate)', m.PlayFinishedRate],
      ]
        .filter(([, val]) => val !== undefined && val !== null)
        .map(([label, val]) => `| ${label} | ${val} |`),
      '',
    ].filter((line) => line !== undefined && line !== null);

    if (period.Date || period.NetIncrease7Days != null || period.NetIncrease30Days != null) {
      md.push(
        '## 周期粉丝趋势',
        '',
        '| 周期 | 净增 | 新增 | 取关 | 主页访客 | 主页转粉 | 转粉率 |',
        '| :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
        `| 7日 | ${formatStatValue(period.NetIncrease7Days)} | ${formatStatValue(period.NewCount7Days)} | ${formatStatValue(period.UnfollowCount7Days)} | ${formatStatValue(period.HomepageVisitorCount7Days)} | ${formatStatValue(period.HomepageFollowCount7Days)} | ${formatStatValue(period.HomepageConversionRate7Days)} |`,
        `| 14日 | ${formatStatValue(period.NetIncrease14Days)} | ${formatStatValue(period.NewCount14Days)} | ${formatStatValue(period.UnfollowCount14Days)} | ${formatStatValue(period.HomepageVisitorCount14Days)} | ${formatStatValue(period.HomepageFollowCount14Days)} | ${formatStatValue(period.HomepageConversionRate14Days)} |`,
        `| 30日 | ${formatStatValue(period.NetIncrease30Days)} | ${formatStatValue(period.NewCount30Days)} | ${formatStatValue(period.UnfollowCount30Days)} | ${formatStatValue(period.HomepageVisitorCount30Days)} | ${formatStatValue(period.HomepageFollowCount30Days)} | ${formatStatValue(period.HomepageConversionRate30Days)} |`,
        ''
      );
    }

    const csvHeader = ['Date', 'NetIncrease', 'NewCount', 'UnfollowCount', 'HomepageVisitorCount', 'HomepageFollowCount', 'HomepageConversionRate'];
    const csvLines = [csvHeader.join(',')];
    daily.forEach((row) => {
      csvLines.push([
        row.Date, row.NetIncrease, row.NewCount, row.UnfollowCount,
        row.HomepageVisitorCount, row.HomepageFollowCount, row.HomepageConversionRate,
      ].map(csvEscape).join(','));
    });

    return {
      markdown: md.join('\n'),
      dailyCsv: csvLines.join('\n'),
      jsonText: JSON.stringify(d, null, 2),
    };
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
    commentHtmlToMarkdownText,
    formatCommentsMarkdown,
    validateStatsDateRange,
    formatStatValue,
    csvEscape,
    formatContentStatsFrontmatterLines,
    buildContentStatsCsv,
    buildAccountStatsReport,
  };
});
