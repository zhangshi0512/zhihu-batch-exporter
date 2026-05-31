/**
 * converter.js — HTML → Markdown
 * ================================
 * Ported from:
 *   - lib/html-to-markdown.js  (Turndown + Zhihu custom rules)
 *   - lib/zhihu-html-utils.js  (Zhihu element detectors)
 *
 * All Zhihu-specific conversion rules are implemented:
 *   - Math formulas (eeimg) → LaTeX $...$ / $$...$$
 *   - Code blocks with lang attr → fenced ```lang blocks
 *   - HTML tables → Markdown tables (via turndown-plugin-gfm)
 *   - <figure> images → ![alt](src)
 *   - Plain <img> → ![alt](src)  (remote URLs kept as-is)
 *   - Footnote <sup> → [^n] with definitions at end
 *   - Video boxes (.video-box) → [title](href)
 *   - Link cards (.LinkCard) → [title](href)
 *   - Skip: Zhihu catalog nav (.Catalog), reference lists (.ReferenceList)
 */

'use strict';

const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

// ── Zhihu HTML element detection helpers ──────────────────────────────────────
// Ported from lib/zhihu-html-utils.js

function getEeimg(node) {
  return node.getAttribute('eeimg') || node.getAttribute('data-eeimg') || null;
}

function getLatex(node) {
  return (node.getAttribute('data-tex') || node.getAttribute('alt') || '').trim();
}

function isInlineMath(node) {
  const v = getEeimg(node);
  return v !== null && v !== '2';
}

function isBlockMath(node) {
  return getEeimg(node) === '2';
}

function isMath(node) {
  return getEeimg(node) !== null;
}

function getImageUrl(node) {
  return (
    node.getAttribute('data-original') ||
    node.getAttribute('data-actualsrc') ||
    node.getAttribute('src') ||
    ''
  );
}

function isFootnote(node) {
  return node.nodeName === 'SUP' && node.dataset && typeof node.dataset.text === 'string';
}

function getFootnoteInfo(node) {
  return {
    numero: node.dataset.numero || '1',
    text: node.dataset.text || node.textContent || '',
    url: node.dataset.url || '',
  };
}

function isVideo(node) {
  return node.nodeName === 'A' && node.classList && node.classList.contains('video-box');
}

function getVideoInfo(node) {
  const href = node.getAttribute('href') || '';
  const titleEl = node.querySelector && node.querySelector('.video-box-title');
  return { title: titleEl ? titleEl.textContent.trim() : '视频', href };
}

function isLinkCard(node) {
  return node.nodeName === 'A' && node.classList && node.classList.contains('LinkCard');
}

function getLinkCardInfo(node) {
  const href = node.getAttribute('href') || '';
  const titleEl = node.querySelector && node.querySelector('.LinkCard-title');
  return { title: titleEl ? titleEl.textContent.trim() : href, href };
}

function isCatalog(node) {
  return (
    (node.classList && (
      node.classList.contains('Catalog') ||
      node.classList.contains('Catalog-content')
    )) ||
    !!(node.querySelector && node.querySelector(':scope > .Catalog-content'))
  );
}

function isReferenceList(node) {
  return node.classList && node.classList.contains('ReferenceList');
}

// ── Main converter ────────────────────────────────────────────────────────────

/**
 * Convert Zhihu answer HTML to Markdown.
 * Image URLs are kept as remote links (no local download).
 *
 * @param {string} html - The raw HTML content of the answer
 * @returns {string} Markdown text
 */
function htmlToMarkdown(html) {
  if (!html || typeof html !== 'string') return '';

  try {
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined',
    });

    // Enable GFM tables (from turndown-plugin-gfm)
    td.use(gfm);

    const footnotes = {};

    // ── Rule 0: Skip Zhihu catalog nav and reference lists ──────────────────
    td.addRule('skipZhihuCatalogAndRef', {
      filter: (node) => isCatalog(node) || isReferenceList(node),
      replacement: () => '',
    });

    // ── Rule 1: Inline math formula ──────────────────────────────────────────
    td.addRule('mathInlineToLatex', {
      filter: (node) => isInlineMath(node),
      replacement(content, node) {
        const latex = getLatex(node);
        if (!latex) return '';
        // Zhihu sometimes encodes block formulas as inline with trailing \\
        if (latex.endsWith('\\\\')) return `$$${latex.slice(0, -2)}$$`;
        return `$${latex}$`;
      },
    });

    // ── Rule 2: Block math formula ───────────────────────────────────────────
    td.addRule('mathBlockToLatex', {
      filter: (node) => isBlockMath(node),
      replacement: (content, node) => `$$${getLatex(node)}$$`,
    });

    // ── Rule 3: <pre lang="..."> → fenced code block ─────────────────────────
    td.addRule('preWithLang', {
      filter(node) {
        return node.nodeName === 'PRE' && node.getAttribute('lang') !== null;
      },
      replacement(content, node) {
        const lang = node.getAttribute('lang') || '';
        const code = node.textContent || '';
        return `\`\`\`${lang}\n${code.trim()}\n\`\`\``;
      },
    });

    // ── Rule 4: <figure> with image ──────────────────────────────────────────
    td.addRule('figureToImage', {
      filter: ['figure'],
      replacement(content, node) {
        const img = node.querySelector('img');
        const figcaption = node.querySelector('figcaption');
        if (!img) return content || '';
        const src = getImageUrl(img);
        if (!src) return content || '';
        const alt = figcaption ? figcaption.textContent.trim() : '';
        return `\n\n![${alt}](${src})\n\n`;
      },
    });

    // ── Rule 5: Standalone <img> (not inside <figure>, not math) ─────────────
    td.addRule('imgWithRemoteUrl', {
      filter(node) {
        return (
          node.nodeName === 'IMG' &&
          !isMath(node) &&
          !(node.parentElement && node.parentElement.nodeName === 'FIGURE')
        );
      },
      replacement(content, node) {
        const src = getImageUrl(node);
        if (!src) return '';
        const alt = node.getAttribute('alt') || '';
        return `![${alt}](${src})`;
      },
    });

    // ── Rule 6: Ignore <br> inside headings ──────────────────────────────────
    td.addRule('ignoreBrInHeading', {
      filter(node) {
        return (
          node.nodeName === 'BR' &&
          node.parentElement &&
          /^H[1-6]$/.test(node.parentElement.nodeName)
        );
      },
      replacement: () => '',
    });

    // ── Rule 7: Zhihu footnote <sup data-text data-url data-numero> ──────────
    td.addRule('footnote', {
      filter(node) {
        return isFootnote(node) && /^\[\d+\]$/.test(node.textContent || '');
      },
      replacement(content, node) {
        const info = getFootnoteInfo(node);
        footnotes[info.numero] = `${info.text} ${info.url}`.trim();
        return `[^${info.numero}]`;
      },
    });

    // ── Rule 8: Video box ─────────────────────────────────────────────────────
    td.addRule('zhihuVideo', {
      filter: (node) => isVideo(node),
      replacement(content, node) {
        const info = getVideoInfo(node);
        return `[${info.title}](${info.href})`;
      },
    });

    // ── Rule 9: Link card ─────────────────────────────────────────────────────
    td.addRule('zhihuLinkCard', {
      filter: (node) => isLinkCard(node),
      replacement(content, node) {
        const info = getLinkCardInfo(node);
        return `[${info.title}](${info.href})`;
      },
    });

    let markdown = td.turndown(html);

    // Append footnote definitions at end
    const footnoteLines = Object.entries(footnotes)
      .map(([num, text]) => `[^${num}]: ${text}`)
      .join('\n');

    if (footnoteLines) {
      markdown += `\n\n${footnoteLines}`;
    }

    return markdown;
  } catch (err) {
    console.error('  ✗ HTML → Markdown conversion failed:', err.message);
    return '';
  }
}

module.exports = { htmlToMarkdown };
