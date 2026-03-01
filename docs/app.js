/* app.js – Crypto Daily Digest frontend */
(function () {
  'use strict';

  const datePicker = document.getElementById('date-picker');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const dateDisplay = document.getElementById('date-display');
  const appContent = document.getElementById('app-content');

  // ── Utilities ──────────────────────────────────────────────────────────────

  function toDateStr(date) {
    return date.toISOString().slice(0, 10);
  }

  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return toDateStr(d);
  }

  function todayStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  }

  function formatPrice(val) {
    if (val == null) return 'N/A';
    return '$' + Number(val).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  function formatChange(val) {
    if (val == null) return { text: 'N/A', cls: 'neutral' };
    const num = parseFloat(val);
    const sign = num >= 0 ? '+' : '';
    const cls = num > 0 ? 'positive' : num < 0 ? 'negative' : 'neutral';
    return { text: sign + num.toFixed(2) + '%', cls };
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    } catch {
      return isoStr;
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function renderMarket(coins) {
    if (!coins || coins.length === 0) return '';
    const cards = coins.map(function (c) {
      if (c.error) {
        return '<div class="coin-card"><div class="coin-symbol">' + esc(c.symbol) + '</div>' +
          '<div class="neutral">' + esc(c.error) + '</div></div>';
      }
      const change = formatChange(c.price_change_24h);
      return '<div class="coin-card">' +
        '<div class="coin-symbol">' + esc(c.symbol) + '</div>' +
        '<div class="coin-price">' + formatPrice(c.current_price) + '</div>' +
        '<div class="coin-change ' + change.cls + '">' + change.text + '</div>' +
        '<div class="coin-meta">' +
          'RSI: ' + (c.rsi != null ? c.rsi : 'N/A') + '<br>' +
          'SMA7: ' + (c.sma7 != null ? formatPrice(c.sma7) : 'N/A') + '<br>' +
          'SMA20: ' + (c.sma20 != null ? formatPrice(c.sma20) : 'N/A') +
        '</div>' +
        '<span class="coin-signal">' + esc(c.signal || '中性') + '</span>' +
        '</div>';
    });
    return '<div class="section">' +
      '<div class="section-title">📈 市場概況</div>' +
      '<div class="market-grid">' + cards.join('') + '</div>' +
      '</div>';
  }

  function renderSummary(summary) {
    if (!summary) return '';
    return '<div class="section">' +
      '<div class="section-title">🤖 AI 每日摘要</div>' +
      '<div class="summary-block">' + esc(summary) + '</div>' +
      '</div>';
  }

  function renderNews(articles) {
    if (!articles || articles.length === 0) return '';
    const items = articles.map(function (a) {
      const title = a.title_zh || a.title;
      const summaryZh = a.summary_zh
        ? '<div class="news-summary-zh">' + esc(a.summary_zh) + '</div>'
        : '';
      return '<div class="news-item">' +
        '<span class="news-source-tag">' + esc(a.source) + '</span>' +
        '<div class="news-content">' +
          '<div class="news-title"><a href="' + esc(a.link) + '" target="_blank" rel="noopener noreferrer">' +
            esc(title) + '</a></div>' +
          summaryZh +
          '<div class="news-time">' + formatTime(a.published) + '</div>' +
        '</div>' +
        '</div>';
    });
    return '<div class="section">' +
      '<div class="section-title">📰 今日新聞（' + articles.length + ' 篇）</div>' +
      '<div class="news-list">' + items.join('') + '</div>' +
      '</div>';
  }

  function renderEmpty(dateStr) {
    return '<div class="empty-state">' +
      '<div class="icon">📭</div>' +
      '<p>' + esc(dateStr) + ' 尚無報告資料。</p>' +
      '<p>請等待每日自動排程執行，或手動觸發 GitHub Actions Workflow。</p>' +
      '</div>';
  }

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  function loadReport(dateStr) {
    dateDisplay.textContent = dateStr;
    appContent.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>載入中...</p></div>';

    var url = 'data/' + dateStr + '.json';
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(function (data) {
        var html = renderMarket(data.market) +
                   renderSummary(data.summary) +
                   renderNews(data.news);
        appContent.innerHTML = html || renderEmpty(dateStr);
      })
      .catch(function () {
        appContent.innerHTML = renderEmpty(dateStr);
      });
  }

  // ── Event listeners ────────────────────────────────────────────────────────

  datePicker.addEventListener('change', function () {
    if (datePicker.value) loadReport(datePicker.value);
  });

  btnPrev.addEventListener('click', function () {
    var current = datePicker.value || todayStr();
    var prev = shiftDate(current, -1);
    datePicker.value = prev;
    loadReport(prev);
  });

  btnNext.addEventListener('click', function () {
    var current = datePicker.value || todayStr();
    var next = shiftDate(current, 1);
    datePicker.value = next;
    loadReport(next);
  });

  // ── Ads (Auto Ads) ──────────────────────────────────────────────────────
  function initAds() {
    var cfg = window.ADS_CONFIG;
    if (!cfg || !cfg.enabled || !cfg.client) return;

    var script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + cfg.client;
    document.head.appendChild(script);
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  var initial = todayStr();
  datePicker.value = initial;
  initAds();
  loadReport(initial);
}());
