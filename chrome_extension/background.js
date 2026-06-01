'use strict';

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return false;

  if (message.type === 'getZhihuCookie') {
    getZhihuCookieHeader()
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
