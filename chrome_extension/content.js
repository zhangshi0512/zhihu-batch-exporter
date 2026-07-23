'use strict';

(function () {
  if (window.__zhihu_exporter_injected__) return;
  window.__zhihu_exporter_injected__ = true;

  // CRC32 and Zip Blob creation utilities (Pure JS binary zip builder)
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
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

  // HTML to Markdown converter
  function htmlToMarkdown(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove unwanted elements
    temp.querySelectorAll('script, style, noscript, svg, .ContentItem-actions, .Reward').forEach(el => el.remove());

    // Convert headings
    temp.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
      const level = parseInt(el.tagName.substring(1), 10);
      const prefix = '#'.repeat(level);
      el.textContent = `\n\n${prefix} ${el.textContent.trim()}\n\n`;
    });

    // Convert paragraphs & line breaks
    temp.querySelectorAll('br').forEach(el => {
      el.replaceWith('\n');
    });

    temp.querySelectorAll('p').forEach(el => {
      const text = el.innerHTML.trim();
      if (text) {
        el.innerHTML = `\n\n${text}\n\n`;
      }
    });

    // Convert bold / italic
    temp.querySelectorAll('b, strong').forEach(el => {
      el.textContent = `**${el.textContent}**`;
    });
    temp.querySelectorAll('i, em').forEach(el => {
      el.textContent = `*${el.textContent}*`;
    });

    // Convert code blocks
    temp.querySelectorAll('pre').forEach(el => {
      const code = el.textContent;
      const lang = el.querySelector('code')?.className?.match(/language-(\w+)/)?.[1] || '';
      el.textContent = `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
    });

    // Convert inline code
    temp.querySelectorAll('code').forEach(el => {
      if (el.parentElement?.tagName !== 'PRE') {
        el.textContent = `\`${el.textContent}\``;
      }
    });

    // Convert links
    temp.querySelectorAll('a').forEach(el => {
      const href = el.getAttribute('href') || '';
      const text = el.textContent.trim() || href;
      if (href && !href.startsWith('javascript:')) {
        el.textContent = `[${text}](${href})`;
      }
    });

    // Convert images
    temp.querySelectorAll('img').forEach(el => {
      const src = el.getAttribute('data-actualsrc') || el.getAttribute('data-original') || el.getAttribute('src') || '';
      if (src && !src.includes('equation') && !src.includes('eeimg')) {
        const alt = el.getAttribute('alt') || '';
        el.textContent = `![${alt}](${src})`;
      }
    });

    // Convert blockquotes
    temp.querySelectorAll('blockquote').forEach(el => {
      const lines = el.textContent.trim().split('\n');
      el.textContent = `\n\n${lines.map(line => `> ${line}`).join('\n')}\n\n`;
    });

    // Convert lists
    temp.querySelectorAll('ul > li').forEach(el => {
      el.textContent = `\n- ${el.textContent.trim()}`;
    });
    temp.querySelectorAll('ol > li').forEach((el, index) => {
      el.textContent = `\n${index + 1}. ${el.textContent.trim()}`;
    });

    let text = temp.textContent || '';
    // Clean up multiple blank lines
    text = text.replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  // Extract page metadata & main content
  function detectCurrentPageItem() {
    const url = window.location.href;

    // 1. Article Page: zhuanlan.zhihu.com/p/{id}
    if (url.includes('zhuanlan.zhihu.com/p/')) {
      const titleEl = document.querySelector('.Post-Title');
      const contentEl = document.querySelector('.Post-RichText, .RichText');
      const authorEl = document.querySelector('.UserLink-link, .AuthorInfo-name a');
      const articleId = url.match(/\/p\/(\d+)/)?.[1] || 'article';

      if (contentEl) {
        return {
          type: 'article',
          id: articleId,
          title: titleEl?.textContent?.trim() || `知乎文章_${articleId}`,
          author: authorEl?.textContent?.trim() || '知乎用户',
          html: contentEl.innerHTML,
          url,
        };
      }
    }

    // 2. Answer Page: zhihu.com/question/{qid}/answer/{aid}
    const answerMatch = url.match(/zhihu\.com\/question\/(\d+)\/answer\/(\d+)/);
    if (answerMatch) {
      const qid = answerMatch[1];
      const aid = answerMatch[2];
      const titleEl = document.querySelector('.QuestionHeader-title');
      const answerItem = document.querySelector(`[data-za-extra-module*="${aid}"]`) || document.querySelector('.AnswerItem, .RichContent');
      const contentEl = answerItem?.querySelector('.RichContent-inner, .RichText') || document.querySelector('.RichContent-inner');
      const authorEl = answerItem?.querySelector('.AuthorInfo-name .UserLink-link, .AuthorInfo-name a') || document.querySelector('.AuthorInfo-name a');

      if (contentEl) {
        const questionTitle = titleEl?.textContent?.trim() || `知乎问题_${qid}`;
        const authorName = authorEl?.textContent?.trim() || '知乎用户';
        return {
          type: 'answer',
          id: aid,
          title: `${questionTitle} - ${authorName}的回答`,
          author: authorName,
          html: contentEl.innerHTML,
          url,
        };
      }
    }

    // 3. Question Page (Top / First Answer): zhihu.com/question/{qid}
    if (url.includes('zhihu.com/question/')) {
      const qid = url.match(/\/question\/(\d+)/)?.[1] || '';
      const titleEl = document.querySelector('.QuestionHeader-title');
      const firstAnswer = document.querySelector('.AnswerItem, .List-item');
      const contentEl = firstAnswer?.querySelector('.RichContent-inner, .RichText');
      const authorEl = firstAnswer?.querySelector('.AuthorInfo-name .UserLink-link, .AuthorInfo-name a');

      if (contentEl) {
        const questionTitle = titleEl?.textContent?.trim() || `知乎问题_${qid}`;
        const authorName = authorEl?.textContent?.trim() || '知乎用户';
        return {
          type: 'answer',
          id: qid,
          title: `${questionTitle} - ${authorName}的回答`,
          author: authorName,
          html: contentEl.innerHTML,
          url,
        };
      }
    }

    // 4. Pin Page: zhihu.com/pin/{id}
    if (url.includes('zhihu.com/pin/')) {
      const pinId = url.match(/\/pin\/(\d+)/)?.[1] || 'pin';
      const contentEl = document.querySelector('.PinItem-contentWrapper, .RichText');
      const authorEl = document.querySelector('.AuthorInfo-name a, .UserLink-link');

      if (contentEl) {
        const authorName = authorEl?.textContent?.trim() || '知乎用户';
        return {
          type: 'pin',
          id: pinId,
          title: `想法_${pinId} - ${authorName}`,
          author: authorName,
          html: contentEl.innerHTML,
          url,
        };
      }
    }

    return null;
  }

  // Extract Image URLs
  function extractImageUrls(html) {
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

  // Infer Image File Extension
  function inferImageExt(url, contentType) {
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
    const m = url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i);
    return m ? `.${m[1].toLowerCase()}` : '.jpg';
  }

  // Fetch Image Blob as Uint8Array
  async function fetchImageBytes(url) {
    try {
      const res = await fetch(url, { credentials: 'omit' });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const contentType = res.headers.get('content-type');
      const ext = inferImageExt(url, contentType);
      return { bytes: new Uint8Array(buf), ext };
    } catch {
      return null;
    }
  }

  // Safe filename generator
  function sanitizeFilename(name) {
    return String(name || 'export')
      .replace(/[\\/:*?"<>|\r\n]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  }

  // Build Frontmatter + Content Markdown
  function buildMarkdownDocument(item, markdownText) {
    const dateStr = new Date().toISOString().slice(0, 10);
    return `---
title: "${item.title.replace(/"/g, '\\"')}"
author: "${item.author.replace(/"/g, '\\"')}"
url: "${item.url}"
exported_at: "${dateStr}"
---

# ${item.title}

${markdownText}
`;
  }

  // Trigger Download via Chrome Downloads or Blob Anchor
  function triggerDownload(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    chrome.runtime.sendMessage(
      { type: 'downloadFile', url: blobUrl, filename },
      (res) => {
        if (!res || !res.ok) {
          // Fallback to anchor click
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
        setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
      }
    );
  }

  // Render Floating Button in Shadow DOM
  function initFloatingButton() {
    const item = detectCurrentPageItem();
    if (!item) return;

    const host = document.createElement('div');
    host.id = 'zhihu-exporter-host';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
      .fab {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 999999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: #1769aa;
        color: #ffffff;
        border: none;
        border-radius: 24px;
        box-shadow: 0 4px 16px rgba(23, 105, 170, 0.35), 0 2px 6px rgba(0, 0, 0, 0.12);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.25s ease;
        user-select: none;
      }
      .fab:hover {
        background: #0f4f83;
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(23, 105, 170, 0.45);
      }
      .fab:active {
        transform: translateY(0);
      }
      .fab.loading {
        opacity: 0.85;
        cursor: wait;
        pointer-events: none;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        display: none;
      }
      .fab.loading .spinner { display: block; }
      .fab.loading .icon { display: none; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .toast {
        position: fixed;
        bottom: 76px;
        right: 28px;
        z-index: 999999;
        padding: 8px 14px;
        background: #18202a;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        opacity: 0;
        transform: translateY(8px);
        transition: all 0.25s ease;
        pointer-events: none;
      }
      .toast.show {
        opacity: 1;
        transform: translateY(0);
      }
    `;
    shadow.appendChild(style);

    // Button HTML
    const button = document.createElement('button');
    button.className = 'fab';
    button.innerHTML = `
      <span class="spinner"></span>
      <svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
      <span class="btn-text">导出 Markdown</span>
    `;

    const toast = document.createElement('div');
    toast.className = 'toast';
    shadow.appendChild(button);
    shadow.appendChild(toast);

    function showToast(msg, duration = 3000) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), duration);
    }

    // Click handler for single export
    button.addEventListener('click', async () => {
      const currentItem = detectCurrentPageItem();
      if (!currentItem) {
        showToast('无法解析当前页面内容');
        return;
      }

      button.classList.add('loading');
      button.querySelector('.btn-text').textContent = '正在下载图片...';

      try {
        let md = htmlToMarkdown(currentItem.html);
        const imageUrls = extractImageUrls(currentItem.html);
        const files = [];

        if (imageUrls.length > 0) {
          const imgMap = new Map();
          for (let i = 0; i < imageUrls.length; i++) {
            const imgUrl = imageUrls[i];
            button.querySelector('.btn-text').textContent = `图片 (${i + 1}/${imageUrls.length})...`;
            const result = await fetchImageBytes(imgUrl);
            if (result) {
              const imgName = `img_${String(i + 1).padStart(3, '0')}${result.ext}`;
              imgMap.set(imgUrl, `./images/${imgName}`);
              files.push({
                name: `images/${imgName}`,
                data: result.bytes,
              });
            }
          }

          // Replace image links in markdown
          imgMap.forEach((localPath, origUrl) => {
            md = md.split(origUrl).join(localPath);
          });
        }

        const finalMarkdown = buildMarkdownDocument(currentItem, md);
        const safeTitle = sanitizeFilename(currentItem.title);

        if (files.length > 0) {
          // Package as ZIP with images/
          files.push({
            name: `${safeTitle}.md`,
            data: finalMarkdown,
          });
          const zipBlob = createZipBlob(files);
          triggerDownload(zipBlob, `${safeTitle}.zip`);
          showToast(`已成功导出 ZIP (含 ${files.length - 1} 张图片)`);
        } else {
          // Download single .md file directly
          const mdBlob = new Blob([finalMarkdown], { type: 'text/markdown;charset=utf-8' });
          triggerDownload(mdBlob, `${safeTitle}.md`);
          showToast('已成功导出 Markdown 文件');
        }
      } catch (err) {
        showToast(`导出失败：${err.message}`);
      } finally {
        button.classList.remove('loading');
        button.querySelector('.btn-text').textContent = '导出 Markdown';
      }
    });
  }

  // Initialize on idle
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initFloatingButton, 1000);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(initFloatingButton, 1000));
  }
})();
