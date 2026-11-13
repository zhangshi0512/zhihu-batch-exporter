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
