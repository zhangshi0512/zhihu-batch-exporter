'use strict';

const OPEN_PLATFORM_ORIGIN = 'https://developer.zhihu.com';
const STORAGE_SECRET = 'zhihuAccessSecret';
const STORAGE_MY_SLUG = 'zhihuMySlug';

const OPEN_PLATFORM_ERROR_TEXT = {
  10001: '参数错误',
  20001: '鉴权失败，请检查 Access Secret 或系统时间',
  30001: '请求过于频繁，请稍后再试',
  30002: '开放平台额度已用尽',
  40004: '知识库不存在',
  40005: '相同文件正在处理中',
  40006: '文件解析失败',
  50002: '知识库检索失败，请稍后重试',
  90001: '开放平台内部错误',
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

function getCookies(details) {
  return new Promise((resolve) => {
    chrome.cookies.getAll(details, resolve);
  });
}

async function getZhihuCookieHeader() {
  const byUrl = await getCookies({ url: 'https://www.zhihu.com/' });
  const byDomain = await getCookies({ domain: '.zhihu.com' });
  const merged = new Map();

  [...byUrl, ...byDomain].forEach((cookie) => {
    merged.set(cookie.name, cookie);
  });

  const cookies = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
    count: cookies.length,
    hasLoginCookie: cookies.some((cookie) => cookie.name === 'z_c0'),
  };
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(values) {
  return chrome.storage.local.set(values);
}

function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

function maskSecret(secret) {
  const value = String(secret || '');
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

async function getAccessSecret() {
  const result = await storageGet([STORAGE_SECRET]);
  return String(result[STORAGE_SECRET] || '').trim();
}

async function getMySlug() {
  const result = await storageGet([STORAGE_MY_SLUG]);
  return String(result[STORAGE_MY_SLUG] || '').trim();
}

async function getOpenPlatformStatus() {
  const secret = await getAccessSecret();
  const mySlug = await getMySlug();
  return {
    configured: Boolean(secret),
    masked: maskSecret(secret),
    mySlug,
  };
}

function normalizeSecret(raw) {
  return String(raw || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function responseCode(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.Code != null) return payload.Code;
  if (payload.code != null) return payload.code;
  return null;
}

function formatOpenPlatformError(payload, fallback) {
  const code = responseCode(payload);
  if (code != null && OPEN_PLATFORM_ERROR_TEXT[code]) {
    return OPEN_PLATFORM_ERROR_TEXT[code];
  }
  const message = payload?.Message || payload?.message;
  if (message && String(message).toLowerCase() !== 'success') return String(message);
  return fallback || '开放平台请求失败';
}

function summarizeBody(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

async function openPlatformRequest({ method = 'GET', path, query, body, secret: rawSecret } = {}) {
  const secret = normalizeSecret(rawSecret) || await getAccessSecret().then(normalizeSecret);
  if (!secret) {
    return { ok: false, code: 'NO_SECRET', error: '未配置 Access Secret。请先保存，或在输入框里粘贴后再探测。' };
  }
  if (!path || !String(path).startsWith('/')) {
    return { ok: false, code: 'BAD_PATH', error: '无效的开放平台路径' };
  }

  const url = new URL(`${OPEN_PLATFORM_ORIGIN}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  const headers = {
    Authorization: `Bearer ${secret}`,
    'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  let response;
  try {
    response = await fetch(url.toString(), {
      method: method.toUpperCase(),
      headers,
      body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    return { ok: false, code: 'NETWORK', error: error.message || '开放平台网络错误' };
  }

  const rawText = await response.text();
  let payload = null;
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    const hint = summarizeBody(rawText);
    if (String(path).includes('favlist')) {
      console.log('[ZhihuExporter][open-platform] non-json', {
        path,
        query: query || {},
        http: response.status,
        bodyPreview: hint,
      });
    }
    return {
      ok: false,
      code: response.status,
      error: hint
        ? `开放平台 HTTP ${response.status}，返回的不是 JSON：${hint}`
        : `开放平台 HTTP ${response.status}，响应为空`,
    };
  }

  if (String(path).includes('favlist')) {
    const data = payload.Data ?? payload.data;
    const paging = data?.Paging || data?.paging || payload.Paging || payload.paging || null;
    const items = data?.Items || data?.items || [];
    console.log('[ZhihuExporter][open-platform]', {
      path,
      query: query || {},
      http: response.status,
      dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
      itemCount: Array.isArray(items) ? items.length : null,
      paging,
      sample: Array.isArray(items) && items[0]
        ? {
            Url: items[0].Url || items[0].url || '',
            ContentType: items[0].ContentType || items[0].content_type || '',
            Title: items[0].Title || items[0].title || '',
          }
        : null,
    });
  }

  const code = responseCode(payload);
  if (code == null && !response.ok) {
    return {
      ok: false,
      code: response.status,
      error: formatOpenPlatformError(payload, `开放平台 HTTP ${response.status}`),
    };
  }
  if (Number(code) !== 0) {
    return {
      ok: false,
      code,
      error: formatOpenPlatformError(payload, `开放平台 HTTP ${response.status}`),
    };
  }
  return {
    ok: true,
    data: payload.Data ?? payload.data,
    message: payload.Message || payload.message || 'success',
  };
}

async function probeAccessSecret(secret) {
  const result = await openPlatformRequest({
    method: 'GET',
    path: '/api/v1/content/hot_list',
    query: { Limit: 1 },
    secret,
  });
  if (!result.ok) return result;
  return { ok: true, message: 'Access Secret 可用' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  if (message.type === 'getZhihuCookie') {
    getZhihuCookieHeader()
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'downloadFile') {
    chrome.downloads.download(
      { url: message.url, filename: message.filename, saveAs: true },
      (downloadId) => {
        const error = chrome.runtime.lastError;
        if (error) {
          sendResponse({ ok: false, error: error.message });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      }
    );
    return true;
  }

  if (message.type === 'getOpenPlatformStatus') {
    getOpenPlatformStatus()
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'saveAccessSecret') {
    const secret = normalizeSecret(message.secret);
    if (!secret) {
      sendResponse({ ok: false, error: 'Access Secret 不能为空' });
      return false;
    }
    storageSet({ [STORAGE_SECRET]: secret })
      .then(() => getOpenPlatformStatus())
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'clearAccessSecret') {
    storageRemove([STORAGE_SECRET])
      .then(() => getOpenPlatformStatus())
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'saveMySlug') {
    const slug = String(message.slug || '').trim();
    storageSet({ [STORAGE_MY_SLUG]: slug })
      .then(() => getOpenPlatformStatus())
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'probeAccessSecret') {
    probeAccessSecret(message.secret)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'openPlatformRequest') {
    openPlatformRequest(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
