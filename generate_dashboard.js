/**
 * generate_dashboard.js
 * =====================
 * Reads all exported answer .md files from output/answers/,
 * extracts creation dates from YAML front matter, and generates
 * a standalone dashboard.html with a GitHub-style contribution heatmap.
 *
 * Usage: node generate_dashboard.js
 */

const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────────────────
const ANSWERS_DIR = path.resolve(__dirname, 'output/answers');
const OUTPUT_FILE = path.resolve(__dirname, 'dashboard.html');

// ── Parse YAML front matter ────────────────────────────────────────────────
function parseFrontMatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const fields = {};
  // Simple key-value parser for our known format
  const lines = yaml.split('\n');
  for (const line of lines) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) {
      fields[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1').trim();
    }
  }
  return fields;
}

// ── Main ───────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(ANSWERS_DIR)) {
    console.error(`Directory not found: ${ANSWERS_DIR}`);
    console.error('Run the exporter first (node zhihu_export_answers/export.js)');
    process.exit(1);
  }

  const files = fs.readdirSync(ANSWERS_DIR).filter(f => f.endsWith('.md'));
  console.log(`Found ${files.length} answer files.`);

  // Extract all dates + titles + content previews
  const dateAnswers = {}; // { 'YYYY-MM-DD': [{title, id, preview, source}, ...] }
  const yearlyCounts = {}; // { 'YYYY': count }
  const allDates = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(ANSWERS_DIR, file), 'utf-8');
    const fm = parseFrontMatter(content);
    if (!fm || !fm.created) continue;

    // Extract date part (YYYY-MM-DD)
    const date = fm.created.substring(0, 10);

    // Extract content preview: first ~20 chars after YAML front matter,
    // skipping the leading "# Title" heading line
    const bodyStart = content.indexOf('---\n', content.indexOf('---\n') + 4) + 4;
    let body = content.substring(bodyStart).trim();
    // Remove leading "# Title" heading
    body = body.replace(/^#\s+.+\n+/, '').trim();
    const preview = body.replace(/\n/g, ' ').substring(0, 20);

    const answerInfo = {
      title: fm.title || 'Untitled',
      id: fm.id || '',
      preview,
      source: fm.source || '',
    };

    if (!dateAnswers[date]) dateAnswers[date] = [];
    dateAnswers[date].push(answerInfo);

    const year = date.substring(0, 4);
    yearlyCounts[year] = (yearlyCounts[year] || 0) + 1;

    allDates.push(date);
  }

  // Calculate stats
  const totalAnswers = allDates.length;
  const uniqueDays = Object.keys(dateAnswers).length;
  const years = Object.keys(yearlyCounts).sort();

  // Calculate longest streak
  const sortedDates = [...new Set(allDates)].sort();
  let longestStreak = 0;
  let currentStreak = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) {
      currentStreak = 1;
    } else {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diff = (curr - prev) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
    }
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }

  // Most active day
  let maxDay = '', maxDayCount = 0;
  for (const [date, answers] of Object.entries(dateAnswers)) {
    if (answers.length > maxDayCount) {
      maxDayCount = answers.length;
      maxDay = date;
    }
  }

  // Most active year
  let maxYear = '', maxYearCount = 0;
  for (const [year, count] of Object.entries(yearlyCounts)) {
    if (count > maxYearCount) {
      maxYearCount = count;
      maxYear = year;
    }
  }

  // Build data structure for heatmap: per year, per week, per day
  const heatmapData = {};
  for (const year of years) {
    heatmapData[year] = [];
    const startDate = new Date(`${year}-01-01`);
    // Start from the Sunday of the week containing Jan 1
    const dayOfWeek = startDate.getDay();
    const firstSunday = new Date(startDate);
    firstSunday.setDate(firstSunday.getDate() - dayOfWeek);

    for (let w = 0; w < 53; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(firstSunday);
        date.setDate(date.getDate() + w * 7 + d);
        const dateStr = date.toISOString().substring(0, 10);
        if (dateStr.substring(0, 4) !== year) {
          week.push({ date: dateStr, count: -1, answers: [] }); // outside year
        } else {
          const answers = dateAnswers[dateStr] || [];
          week.push({ date: dateStr, count: answers.length, answers });
        }
      }
      heatmapData[year].push(week);
    }
  }

  // Generate HTML
  const html = generateHTML({
    totalAnswers,
    uniqueDays,
    years,
    yearlyCounts,
    heatmapData,
    longestStreak,
    maxDay,
    maxDayCount,
    maxYear,
    maxYearCount,
  });

  fs.writeFileSync(OUTPUT_FILE, html, 'utf-8');
  console.log(`Dashboard generated: ${OUTPUT_FILE}`);
  console.log(`  ${totalAnswers} answers across ${uniqueDays} days (${years[0]}–${years[years.length - 1]})`);
}

// ── HTML Generation ────────────────────────────────────────────────────────
function generateHTML(data) {
  const { totalAnswers, uniqueDays, years, yearlyCounts, heatmapData,
          longestStreak, maxDay, maxDayCount, maxYear, maxYearCount } = data;

  // Build JavaScript data objects
  const heatmapJSON = JSON.stringify(heatmapData);
  const yearlyCountsJSON = JSON.stringify(yearlyCounts);

  // Month short names
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>知乎回答贡献热力图</title>
<style>
  :root {
    --bg: #ffffff;
    --text: #1a1a2e;
    --text-secondary: #586069;
    --border: #e1e4e8;
    --card-bg: #f6f8fa;
    --green-0: #ebedf0;
    --green-1: #9be9a8;
    --green-2: #40c463;
    --green-3: #30a14e;
    --green-4: #216e39;
    --accent: #0066ff;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    max-width: 960px;
    margin: 0 auto;
    padding: 32px 16px 64px;
  }

  /* Header */
  .header {
    margin-bottom: 24px;
  }
  .header h1 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 4px;
  }
  .header .subtitle {
    font-size: 14px;
    color: var(--text-secondary);
  }
  .header .total {
    font-size: 32px;
    font-weight: 700;
    color: var(--accent);
    margin-top: 12px;
  }

  /* Stats Cards */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-bottom: 28px;
  }
  .stat-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .stat-card .stat-value {
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
  }
  .stat-card .stat-label {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 2px;
  }

  /* Year Selector */
  .year-nav {
    display: flex;
    gap: 6px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .year-btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    position: relative;
  }
  .year-btn:hover {
    background: var(--card-bg);
  }
  .year-btn.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .year-yearly-count {
    font-size: 10px;
    margin-left: 4px;
    opacity: 0.7;
  }

  /* Heatmap Container */
  .heatmap-wrapper {
    overflow-x: auto;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .heatmap {
    display: flex;
    min-width: 760px;
  }

  /* Month labels column */
  .month-labels {
    display: flex;
    flex-direction: column;
    margin-right: 4px;
    font-size: 11px;
    color: var(--text-secondary);
    width: 32px;
    flex-shrink: 0;
  }
  .month-labels span {
    height: 15px;
    line-height: 15px;
  }

  /* Main grid */
  .grid-container {
    position: relative;
  }
  .month-row {
    display: flex;
    font-size: 11px;
    color: var(--text-secondary);
    height: 20px;
    line-height: 20px;
    margin-bottom: 2px;
  }
  .month-row span {
    position: absolute;
    transform: translateX(0);
  }
  .weeks {
    display: flex;
    gap: 3px;
  }
  .week {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .day-cell {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    outline: none;
    position: relative;
    cursor: default;
  }
  .day-cell.empty {
    background: transparent;
  }
  .day-cell[data-level="0"] { background: var(--green-0); }
  .day-cell[data-level="1"] { background: var(--green-1); }
  .day-cell[data-level="2"] { background: var(--green-2); }
  .day-cell[data-level="3"] { background: var(--green-3); }
  .day-cell[data-level="4"] { background: var(--green-4); }
  .day-cell:hover {
    outline: 2px solid rgba(0,0,0,0.3);
    outline-offset: -1px;
    z-index: 2;
  }
  .day-cell.clickable {
    cursor: pointer;
  }
  .day-cell.clickable:hover {
    outline: 2px solid rgba(0,0,0,0.5);
    outline-offset: -1px;
    z-index: 2;
  }

  /* Day-of-week labels */
  .day-labels {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-left: 6px;
    font-size: 11px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }
  .day-labels span {
    height: 12px;
    line-height: 12px;
  }

  /* Tooltip */
  .tooltip {
    display: none;
    position: fixed;
    background: #24292e;
    color: #fff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    z-index: 100;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }

  /* Legend */
  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    margin-top: 10px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .legend .swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  /* Popup overlay */
  .overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.35);
    z-index: 200;
    justify-content: center;
    align-items: center;
  }
  .overlay.active { display: flex; }

  .popup {
    background: var(--bg);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    max-width: 560px;
    width: 90%;
    max-height: 70vh;
    overflow-y: auto;
    padding: 0;
  }
  .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg);
    border-radius: 12px 12px 0 0;
  }
  .popup-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }
  .popup-close {
    border: none;
    background: none;
    font-size: 20px;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .popup-close:hover { color: var(--text); }
  .popup-body { padding: 8px 20px 20px; }
  .popup-answer {
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .popup-answer:last-child { border-bottom: none; }
  .popup-answer .answer-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 6px;
    line-height: 1.5;
    text-decoration: none;
    display: block;
  }
  .popup-answer .answer-preview {
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  /* Footer */
  .footer {
    margin-top: 32px;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: center;
  }
</style>
</head>
<body>

<div class="header">
  <h1>知乎回答贡献热力图</h1>
  <div class="subtitle">基于 ${years[0]} 至 ${years[years.length - 1]} 期间导出的回答数据</div>
  <div class="total">${totalAnswers.toLocaleString()} 条回答</div>
</div>

<div class="stats">
  <div class="stat-card">
    <div class="stat-value">${uniqueDays}</div>
    <div class="stat-label">活跃天数</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${longestStreak}</div>
    <div class="stat-label">最长连续创作（天）</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${maxYear}</div>
    <div class="stat-label">最高产年份（${maxYearCount} 条）</div>
  </div>
  <div class="stat-card">
    <div class="stat-value">${maxDayCount}</div>
    <div class="stat-label">最高单日产（${maxDay}）</div>
  </div>
</div>

<div class="year-nav" id="yearNav"></div>

<div class="heatmap-wrapper">
  <div class="heatmap">
    <div class="month-labels" id="monthLabels"></div>
    <div class="grid-container">
      <div class="month-row" id="monthRow"></div>
      <div class="weeks" id="heatmapGrid"></div>
    </div>
    <div class="day-labels" id="dayLabels"></div>
  </div>
</div>

<div class="legend">
  <span>Less</span>
  <div class="swatch" style="background:var(--green-0)"></div>
  <div class="swatch" style="background:var(--green-1)"></div>
  <div class="swatch" style="background:var(--green-2)"></div>
  <div class="swatch" style="background:var(--green-3)"></div>
  <div class="swatch" style="background:var(--green-4)"></div>
  <span>More</span>
</div>

<div class="tooltip" id="tooltip"></div>

<div class="overlay" id="overlay">
  <div class="popup">
    <div class="popup-header">
      <h3 id="popupTitle"></h3>
      <button class="popup-close" id="popupClose">&times;</button>
    </div>
    <div class="popup-body" id="popupBody"></div>
  </div>
</div>

<div class="footer">
  Generated from ${totalAnswers} exported Zhihu answers · Dashboard built with ♥
</div>

<script>
(function() {
  const heatmapData = ${heatmapJSON};
  const yearlyCounts = ${yearlyCountsJSON};
  const years = ${JSON.stringify(years)};
  const monthNames = ${JSON.stringify(monthNames)};

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // GitHub style: show Mon, Wed, Fri
  const DAY_DISPLAY = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  let currentYear = years[years.length - 1];

  // Build year nav
  const yearNav = document.getElementById('yearNav');
  years.forEach(y => {
    const btn = document.createElement('button');
    btn.className = 'year-btn' + (y === currentYear ? ' active' : '');
    btn.textContent = y;
    btn.innerHTML = y + '<span class="year-yearly-count">' + (yearlyCounts[y] || 0) + '</span>';
    btn.addEventListener('click', () => {
      currentYear = y;
      document.querySelectorAll('.year-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderYear(y);
    });
    yearNav.appendChild(btn);
  });

  // Day labels
  const dayLabels = document.getElementById('dayLabels');
  DAY_DISPLAY.forEach(d => {
    const span = document.createElement('span');
    span.textContent = d;
    dayLabels.appendChild(span);
  });

  // Tooltip
  const tooltip = document.getElementById('tooltip');

  function getLevel(count) {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 6) return 3;
    return 4;
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return monthNames[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function renderYear(year) {
    const data = heatmapData[year];
    if (!data) return;

    // Calculate month label positions
    const monthPositions = [];
    for (let w = 0; w < data.length; w++) {
      const week = data[w];
      for (let d = 0; d < 7; d++) {
        const cell = week[d];
        if (cell.count < 0) continue;
        const date = new Date(cell.date + 'T00:00:00');
        const day = date.getDate();
        const month = date.getMonth();
        if (day <= 7) {
          // Check if this month already has a position
          let found = false;
          for (const mp of monthPositions) {
            if (mp.month === month) { found = true; break; }
          }
          if (!found) {
            monthPositions.push({ month, week: w });
          }
        }
      }
    }

    // Render month row
    const monthRow = document.getElementById('monthRow');
    monthRow.innerHTML = '';
    const cellWidth = 12 + 3; // cell width + gap
    monthPositions.forEach(mp => {
      const span = document.createElement('span');
      span.textContent = monthNames[mp.month];
      span.style.left = (mp.week * cellWidth) + 'px';
      monthRow.appendChild(span);
    });

    // Render grid
    const grid = document.getElementById('heatmapGrid');
    grid.innerHTML = '';

    for (let w = 0; w < data.length; w++) {
      const weekDiv = document.createElement('div');
      weekDiv.className = 'week';

      const weekData = data[w];
      for (let d = 0; d < 7; d++) {
        const cell = weekData[d];
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-cell';

        if (cell.count < 0) {
          dayDiv.classList.add('empty');
        } else {
          dayDiv.dataset.level = getLevel(cell.count);
          dayDiv.dataset.date = cell.date;
          dayDiv.dataset.count = cell.count;

          // Click handler for cells with answers
          if (cell.count > 0 && cell.answers && cell.answers.length > 0) {
            dayDiv.classList.add('clickable');
            dayDiv.addEventListener('click', () => {
              showPopup(cell.date, cell.answers);
            });
          }

          dayDiv.addEventListener('mouseenter', (e) => {
            tooltip.style.display = 'block';
            tooltip.textContent = formatDate(cell.date) + ' · ' + cell.count + ' 条回答';
            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = (rect.left + rect.width / 2) + 'px';
            tooltip.style.top = (rect.top - 32) + 'px';
            tooltip.style.transform = 'translateX(-50%)';
          });
          dayDiv.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
          });
        }

        weekDiv.appendChild(dayDiv);
      }
      grid.appendChild(weekDiv);
    }
  }

  // ── Popup functions ────────────────────────────────────────────
  const overlay = document.getElementById('overlay');
  const popupTitle = document.getElementById('popupTitle');
  const popupBody = document.getElementById('popupBody');
  const popupClose = document.getElementById('popupClose');

  function showPopup(date, answers) {
    popupTitle.textContent = formatDate(date) + ' · ' + answers.length + ' 条回答';
    popupBody.innerHTML = answers.map(a => {
      const previewText = a.preview ? a.preview + (a.preview.length >= 20 ? '…' : '') : '';
      return '<div class="popup-answer">' +
        '<span class="answer-title">' + escapeHtml(a.title) + '</span>' +
        '<div class="answer-preview">' + escapeHtml(previewText) + '</div>' +
        '</div>';
    }).join('');
    overlay.classList.add('active');
  }

  function hidePopup() {
    overlay.classList.remove('active');
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  popupClose.addEventListener('click', hidePopup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hidePopup();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePopup();
  });

  // Initial render
  renderYear(currentYear);
})();
</script>

</body>
</html>`;
}

// ── Run ─────────────────────────────────────────────────────────────────────
main();
