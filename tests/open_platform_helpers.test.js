'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Helpers = require('../chrome_extension/open_platform_helpers.js');

test('quoteLargeJsonIntegers preserves 64-bit integer precision without touching strings or normal numbers', () => {
  const raw = JSON.stringify({
    Code: 0,
    Data: {
      Items: [
        {
          Comment: {
            ID: 123456,
            LikeCount: 42,
            Content: 'hello 98765432109876543210 world',
          },
        },
      ],
    },
  }).replace('123456', '9876543210987654321');

  const parsed = Helpers.parseJsonSafe(raw, { preserveLargeInts: true });
  assert.equal(parsed.Data.Items[0].Comment.ID, '9876543210987654321');
  assert.equal(parsed.Data.Items[0].Comment.LikeCount, 42);
  assert.equal(parsed.Data.Items[0].Comment.Content, 'hello 98765432109876543210 world');
});

test('extractZhihuContentIdentity and pickPreferredUrl deduplicate official vs question-scoped answer URLs', () => {
  const officialUrl = 'https://www.zhihu.com/answer/22222?utm_medium=openapi_platform';
  const webUrl = 'https://www.zhihu.com/question/11111/answer/22222';

  const idA = Helpers.extractZhihuContentIdentity(officialUrl);
  const idB = Helpers.extractZhihuContentIdentity(webUrl);
  assert.equal(idA.mergeKey, 'answer:22222');
  assert.equal(idB.mergeKey, 'answer:22222');
  assert.equal(idA.exportType, 'answers');
  assert.equal(Helpers.pickPreferredUrl(Helpers.normalizeZhihuUrl(officialUrl), webUrl), webUrl);

  const zvideoId = Helpers.extractZhihuContentIdentity('https://www.zhihu.com/zvideo/999888');
  assert.equal(zvideoId.exportType, 'zvideos');
  assert.equal(zvideoId.mergeKey, 'zvideo:999888');
});

test('nextOfficialPageOffset handles IsEnd, short/empty pages, and detects non-advancing offsets', () => {
  // Short or empty page with IsEnd=false and advancing NextOffset must continue
  const step1 = Helpers.nextOfficialPageOffset({ isEnd: false, nextOffset: '20' }, '0', new Set(['0']));
  assert.deepEqual(step1, { done: false, nextOffset: '20', error: null });

  // IsEnd=true stops cleanly
  const stepDone = Helpers.nextOfficialPageOffset({ isEnd: true, nextOffset: '40' }, '20', new Set(['0', '20']));
  assert.deepEqual(stepDone, { done: true, nextOffset: null, error: null });

  // Missing NextOffset when IsEnd=false reports anomaly
  const stepMissing = Helpers.nextOfficialPageOffset({ isEnd: false, nextOffset: '' }, '20', new Set(['0', '20']));
  assert.equal(stepMissing.done, true);
  assert.ok(stepMissing.error);

  // Non-advancing numeric NextOffset when IsEnd=false reports anomaly
  const stepStuck = Helpers.nextOfficialPageOffset({ isEnd: false, nextOffset: '20' }, '20', new Set(['0', '20']));
  assert.equal(stepStuck.done, true);
  assert.ok(stepStuck.error);
});

test('normalizeContentDetailResponse sanitizes HTML and rejects empty Body', () => {
  assert.equal(
    Helpers.normalizeContentDetailResponse({ ContentType: 'answer', ContentToken: '2', Body: '   ' }, 'https://www.zhihu.com/answer/2'),
    null
  );

  const normalized = Helpers.normalizeContentDetailResponse(
    {
      ContentType: 'zvideo',
      ContentToken: '999',
      Url: 'https://www.zhihu.com/zvideo/999',
      Title: '',
      Body: '<p onclick="alert(1)">视频正文</p><script>evil()</script><a href="javascript:alert(2)">bad</a>',
    },
    'https://www.zhihu.com/zvideo/999'
  );

  assert.equal(normalized.id, '999');
  assert.equal(normalized.type, 'zvideos');
  assert.equal(normalized.title, '视频999');
  assert.ok(normalized.html.includes('视频正文'));
  assert.ok(!normalized.html.includes('<script>'));
  assert.ok(!normalized.html.includes('onclick='));
  assert.ok(!normalized.html.includes('javascript:alert'));
});

test('estimateCreationQuota calculates expected calls accurately', () => {
  assert.equal(
    Helpers.estimateCreationQuota({ itemCount: 10, useContentDetail: true, includeComments: true, maxCommentPages: 2, includeContentStats: true }),
    40
  );
});

test('formatCommentsMarkdown sanitizes HTML, preserves large IDs, and formats child replies', () => {
  const md = Helpers.formatCommentsMarkdown([
    {
      Comment: {
        ID: '90071992547409931',
        Type: 'answer',
        CreatedAt: 1742822400,
        Content: '<p>根评论 <script>bad()</script><a href="https://www.zhihu.com/p/1">链接</a></p>',
        LikeCount: 5,
        DislikeCount: 1,
        AuthorToken: 'alice',
      },
      Children: [
        {
          ID: '90071992547409932',
          ReplyID: '90071992547409931',
          RootID: '90071992547409931',
          CreatedAt: 1742822500,
          Content: '<p>子回复</p>',
          LikeCount: 2,
          AuthorToken: 'bob',
        },
      ],
    },
  ], { order: 'reverse' });

  assert.ok(md.includes('## 评论区（按时间倒序，共 1 条根评论）'));
  assert.ok(md.includes('ID:90071992547409931'));
  assert.ok(md.includes('ID:90071992547409932'));
  assert.ok(md.includes('回复#90071992547409931'));
  assert.ok(md.includes('[链接](https://www.zhihu.com/p/1)'));
  assert.ok(!md.includes('<script>'));
  assert.ok(md.includes('子评论为接口附带返回，不保证包含全部楼中楼回复'));
});

test('validateStatsDateRange enforces paired valid YYYY-MM-DD dates', () => {
  assert.deepEqual(Helpers.validateStatsDateRange('', ''), { ok: true, startDate: '', endDate: '' });
  assert.equal(Helpers.validateStatsDateRange('2026-01-01', '').ok, false);
  assert.equal(Helpers.validateStatsDateRange('2026/01/01', '2026-01-05').ok, false);
  assert.equal(Helpers.validateStatsDateRange('2026-01-10', '2026-01-05').ok, false);
  assert.deepEqual(Helpers.validateStatsDateRange('2026-01-01', '2026-01-07'), {
    ok: true,
    startDate: '2026-01-01',
    endDate: '2026-01-07',
  });
});

test('stats formatting does not zero-fill missing fields or alter raw rate values', () => {
  assert.equal(Helpers.formatStatValue(null), '—');
  assert.equal(Helpers.formatStatValue(undefined), '—');
  assert.equal(Helpers.formatStatValue(0), '0');

  const yamlLines = Helpers.formatContentStatsFrontmatterLines({
    Date: '2026-01-07',
    ViewCount: 0,
    PageShowUV: 1200,
    ClickRate: 0.085,
    PositiveInteractionRate: '3.2%',
    NewFollowerCount: null,
  });
  assert.deepEqual(yamlLines, [
    'stat_date: "2026-01-07"',
    'view_count: 0',
    'page_show_uv: 1200',
    'click_rate: 0.085',
    'positive_interaction_rate: "3.2%"',
  ]);

  const csv = Helpers.buildContentStatsCsv([
    {
      id: '123',
      type: 'zhihu-answer',
      title: '测试, "标题"',
      url: 'https://www.zhihu.com/answer/123',
      metrics: { Date: '2026-01-07', ViewCount: 0, ClickRate: 0.085 },
    },
  ]);
  assert.ok(csv.includes('"测试, ""标题"""'));
  assert.ok(csv.includes(',0.085,'));

  const report = Helpers.buildAccountStatsReport(
    {
      ContentType: 'all',
      CreationCounts: { Answer: 10, Article: 2, Video: 0 },
      Metrics: { ViewCount: 5000, ClickRate: 0.12 },
      Followers: { Total: 300, Yesterday: 0 },
      FollowerDetails: {
        Daily: [{ Date: '2026-01-06', NetIncrease: 1, NewCount: 2, UnfollowCount: 1 }],
      },
    },
    { ContentType: 'all', StartDate: '2026-01-01', EndDate: '2026-01-07' }
  );
  assert.ok(report.markdown.includes('视频：0'));
  assert.ok(report.markdown.includes('| 点击率 (ClickRate) | 0.12 |'));
  assert.ok(!report.markdown.includes('12%'));
  assert.ok(report.dailyCsv.includes('2026-01-06,1,2,1,,,'));
});

test('followees normalization and MD/CSV export sanitize URLs and preserve fields', () => {
  const safe = Helpers.normalizeFolloweeItem({
    Fullname: '测试|答主',
    UrlToken: 'test-user',
    Url: 'https://www.zhihu.com/people/test-user',
    AvatarUrl: 'javascript:alert(1)',
    Headline: '一线\n工程师',
    Gender: 1,
    FollowerCount: 2560,
  });
  assert.equal(safe.avatarUrl, '');
  assert.equal(safe.url, 'https://www.zhihu.com/people/test-user');
  assert.equal(safe.followerCount, 2560);

  const exported = Helpers.formatFolloweesExport([safe]);
  assert.ok(exported.markdown.includes('| 测试\\|答主 | `test-user` | 2560 | 一线 工程师 | [主页](https://www.zhihu.com/people/test-user) |'));
  assert.ok(exported.csv.includes('Fullname,UrlToken,Url,Headline,Gender,FollowerCount,AvatarUrl'));
  assert.ok(exported.csv.includes('test-user,https://www.zhihu.com/people/test-user,"一线\n工程师",1,2560,'));
});
