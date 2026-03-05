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

  function fgColor(value) {
    if (value < 25) return '#f85149';
    if (value < 50) return '#e3b341';
    if (value < 75) return '#3fb950';
    return '#58a6ff';
  }

  function fgLabel(classification) {
    var map = {
      'Extreme Fear': '極度恐懼',
      'Fear': '恐懼',
      'Neutral': '中立',
      'Greed': '貪婪',
      'Extreme Greed': '極度貪婪',
    };
    return map[classification] || esc(classification);
  }

  function formatMarketCap(usd) {
    if (usd == null) return 'N/A';
    if (usd >= 1e12) return '$' + (usd / 1e12).toFixed(2) + 'T';
    if (usd >= 1e9) return '$' + (usd / 1e9).toFixed(2) + 'B';
    return '$' + Number(usd).toLocaleString('en-US');
  }

  function renderSignals(signals) {
    if (!signals || Object.keys(signals).length === 0) return '';

    var cards = '';

    // 恐懼貪婪指數
    var fg = signals.fear_greed;
    if (fg && fg.value != null) {
      var color = fgColor(fg.value);
      var label = fgLabel(fg.classification);
      var history = (fg.history || []).slice(0, 7).reverse();
      var histDots = history.map(function (h) {
        var c = fgColor(h.value);
        return '<div class="fg-dot" style="background:' + c + '" title="' + esc(h.date) + ': ' + h.value + '">' + h.value + '</div>';
      }).join('');
      cards += '<div class="signal-card">' +
        '<div class="signal-card-title">😱 恐懼貪婪指數</div>' +
        '<div class="fg-value" style="color:' + color + '">' + fg.value + '</div>' +
        '<div class="fg-label" style="color:' + color + '">' + label + '</div>' +
        '<div class="fg-bar"><div class="fg-bar-fill" style="width:' + fg.value + '%;background:' + color + '"></div></div>' +
        '<div class="fg-history">' + histDots + '</div>' +
        '</div>';
    }

    // Reddit 情緒
    var reddit = signals.reddit_sentiment;
    if (reddit && reddit.sentiment_score != null) {
      var score = reddit.sentiment_score;
      var total = (reddit.positive_count || 0) + (reddit.negative_count || 0) + (reddit.neutral_count || 0);
      var negPct = total > 0 ? (reddit.negative_count / total * 50) : 0;
      var posPct = total > 0 ? (reddit.positive_count / total * 50) : 0;
      var topPosts = (reddit.top_posts || []).slice(0, 3).map(function (p) {
        return '<div class="reddit-post">' +
          '<span class="reddit-post-title">' + esc(p.title) + '</span>' +
          '<span class="reddit-post-score">▲ ' + Number(p.score).toLocaleString('en-US') + '</span>' +
          '</div>';
      }).join('');
      cards += '<div class="signal-card">' +
        '<div class="signal-card-title">💬 Reddit 社群情緒</div>' +
        '<div style="font-size:1.4rem;font-weight:800;color:#e6edf3">' + score.toFixed(2) + ' <span style="font-size:0.9rem;color:#8b949e">' + esc(reddit.label || '') + '</span></div>' +
        '<div class="sentiment-bar-wrap">' +
          '<div class="sentiment-bar-neg" style="width:' + negPct.toFixed(1) + '%"></div>' +
          '<div class="sentiment-bar-pos" style="width:' + posPct.toFixed(1) + '%"></div>' +
          '<div class="sentiment-center-line"></div>' +
        '</div>' +
        '<div class="sentiment-counts">' +
          '<span>🟢 正面 ' + (reddit.positive_count || 0) + '</span>' +
          '<span>🔴 負面 ' + (reddit.negative_count || 0) + '</span>' +
          '<span>⚪ 中立 ' + (reddit.neutral_count || 0) + '</span>' +
        '</div>' +
        (topPosts ? '<div style="margin-top:0.75rem">' + topPosts + '</div>' : '') +
        '</div>';
    }

    // 鏈上資料
    var onchain = signals.onchain;
    if (onchain && Object.keys(onchain).length > 0) {
      var btcDom = onchain.btc_dominance != null ? onchain.btc_dominance.toFixed(1) + '%' : 'N/A';
      var totalMC = formatMarketCap(onchain.total_market_cap_usd);
      var supplyRatio = onchain.btc_supply_ratio != null ? onchain.btc_supply_ratio.toFixed(1) + '%' : 'N/A';
      var activeCrypto = onchain.active_cryptocurrencies != null ? Number(onchain.active_cryptocurrencies).toLocaleString('en-US') : 'N/A';
      var domPct = onchain.btc_dominance != null ? onchain.btc_dominance : 0;
      cards += '<div class="signal-card">' +
        '<div class="signal-card-title">⛓️ 鏈上資料（BTC）</div>' +
        '<div class="onchain-row"><span class="onchain-key">BTC 市佔率</span>' +
          '<span class="onchain-val">' + btcDom + '</span></div>' +
        '<div style="height:6px;border-radius:3px;background:#21262d;margin:0.25rem 0 0.5rem">' +
          '<div style="height:100%;border-radius:3px;background:#f7931a;width:' + Math.min(domPct, 100).toFixed(1) + '%"></div>' +
        '</div>' +
        '<div class="onchain-row"><span class="onchain-key">全市場總市值</span>' +
          '<span class="onchain-val">' + totalMC + '</span></div>' +
        '<div class="onchain-row"><span class="onchain-key">BTC 供給比例</span>' +
          '<span class="onchain-val">' + supplyRatio + '</span></div>' +
        '<div class="onchain-row"><span class="onchain-key">活躍幣種數量</span>' +
          '<span class="onchain-val">' + activeCrypto + '</span></div>' +
        '</div>';
    }

    if (!cards) return '';
    return '<div class="section">' +
      '<div class="section-title">📡 市場情緒指標</div>' +
      '<div class="signals-grid">' + cards + '</div>' +
      '</div>';
  }

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
        var html = renderSignals(data.signals) +
                   renderMarket(data.market) +
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
