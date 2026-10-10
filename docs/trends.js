/* Daily observation charts. No external chart or market-data requests. */
(function (root) {
  'use strict';

  const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
  const COLORS = ['#f7931a', '#8da2fb', '#3fb950', '#e3b341', '#f778ba'];
  const DAY = 86400000;
  const isNumber = value => typeof value === 'number' && Number.isFinite(value);
  const validPrice = value => isNumber(value) && value > 0;
  const escape = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const priceText = value => validPrice(value)
    ? '$' + value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '缺值';
  const percentText = value => isNumber(value) ? (value >= 0 ? '+' : '') + value.toFixed(2) + '%' : '缺值';

  function datesFor(end, days) {
    const endTime = Date.parse(end + 'T00:00:00Z');
    return Array.from({ length: days }, (_, i) => new Date(endTime - (days - 1 - i) * DAY).toISOString().slice(0, 10));
  }

  function selectRange(dataset, end, days) {
    const dates = datesFor(end, days);
    const reports = new Map(dataset.reports.filter(r => r.date >= dates[0] && r.date <= end).map(r => [r.date, r]));
    const sentiment = new Map(dataset.fear_greed
      .filter(e => e.date >= dates[0] && e.date <= end && e.available_on <= end)
      .map(e => [e.date, isNumber(e.value) && e.value >= 0 && e.value <= 100 ? e.value : null]));
    const coins = Object.fromEntries(SYMBOLS.map(symbol => [symbol, dates.map(date => {
      const report = reports.get(date);
      const coin = report && report.market.find(c => c.symbol === symbol);
      return coin && validPrice(coin.current_price) ? coin : null;
    })]));
    return { dates, reports, coins, sentiment: dates.map(date => sentiment.has(date) ? sentiment.get(date) : null) };
  }

  function relativeStrength(range) {
    const candidates = SYMBOLS.filter(symbol => range.coins[symbol].filter(Boolean).length >= 2);
    const baseline = range.dates.findIndex((_, i) => candidates.length >= 2 && candidates.every(s => range.coins[s][i]));
    const series = [];
    if (baseline >= 0) {
      candidates.forEach(symbol => {
        const values = range.coins[symbol].map((coin, i) => i >= baseline && coin
          ? (coin.current_price / range.coins[symbol][baseline].current_price - 1) * 100 : null);
        const endIndex = values.findLastIndex(isNumber);
        if (endIndex > baseline) series.push({ symbol, values, endIndex, return: values[endIndex] });
      });
    }
    return { baseline: series.length >= 2 ? baseline : -1, series: series.length >= 2 ? series : [] };
  }

  function qualityState(raw, available, reference) {
    const q = raw || {};
    const referenceTime = Date.parse(reference);
    const observedTime = Date.parse(q.observed_at);
    const labels = [available ? '可用' : '缺值'];
    if (!Number.isFinite(observedTime)) labels.push('來源時間未知');
    else if (Number.isFinite(referenceTime) && observedTime > referenceTime) labels.push('來源時間晚於報告');
    else if (Number.isFinite(referenceTime) && referenceTime - observedTime > 36 * 3600000) labels.push('陳舊（超過 36 小時）');
    return labels.join(' · ');
  }

  function timeText(value) {
    const time = Date.parse(value);
    return Number.isFinite(time)
      ? new Date(time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '未知';
  }

  function chart(title, dates, series, format, bounds) {
    const values = series.flatMap(s => s.values.filter(isNumber));
    if (!values.length) return '<p class="trend-note">資料不足，無法繪製' + escape(title) + '。</p>';
    let min = bounds ? bounds[0] : Math.min(...values);
    let max = bounds ? bounds[1] : Math.max(...values);
    if (min === max) { min -= Math.max(Math.abs(min) * 0.01, 1); max += Math.max(Math.abs(max) * 0.01, 1); }
    const x = i => 72 + i * 668 / Math.max(dates.length - 1, 1);
    const y = value => 18 + (max - value) * 160 / (max - min);
    let svg = '<svg class="trend-chart" viewBox="0 0 760 220" role="img" aria-label="' + escape(title) + '">' +
      '<title>' + escape(title) + '；詳細日期及數值見下方資料表</title>';
    for (let i = 0; i <= 4; i++) {
      const value = min + (max - min) * i / 4;
      svg += '<line x1="72" x2="740" y1="' + y(value) + '" y2="' + y(value) + '" stroke="#30363d"/>' +
        '<text x="66" y="' + (y(value) + 4) + '" text-anchor="end">' + escape(format(value)) + '</text>';
    }
    series.forEach(s => {
      let path = '';
      let connected = false;
      s.values.forEach((value, i) => {
        if (!isNumber(value)) { connected = false; return; }
        path += (connected ? 'L' : 'M') + x(i).toFixed(2) + ',' + y(value).toFixed(2) + ' ';
        connected = true;
      });
      svg += '<path d="' + path + '" fill="none" stroke="' + s.color + '" stroke-width="2"/>';
      s.values.forEach((value, i) => {
        if (isNumber(value)) svg += '<circle cx="' + x(i) + '" cy="' + y(value) + '" r="3" fill="' + s.color + '">' +
          '<title>' + escape(dates[i] + ' ' + s.label + ' ' + format(value)) + '</title></circle>';
      });
    });
    svg += '<text x="72" y="207">' + dates[0] + '</text><text x="740" y="207" text-anchor="end">' +
      dates[dates.length - 1] + '</text></svg>';
    const legend = series.map(s => '<span><span class="trend-swatch" style="background:' + s.color + '"></span>' + escape(s.label) + '</span>').join('');
    return '<div class="trend-legend">' + legend + '</div><div class="trend-chart-wrap">' + svg + '</div>';
  }

  function dataTable(dates, series) {
    return '<details class="trend-data"><summary>查看日期與數值資料表</summary><div class="trend-table-wrap"><table>' +
      '<thead><tr><th scope="col">日期</th>' + series.map(s => '<th scope="col">' + escape(s.label) + '</th>').join('') +
      '</tr></thead><tbody>' + dates.map((date, i) => '<tr><th scope="row">' + date + '</th>' +
        series.map(s => '<td>' + escape(s.format(s.values[i])) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></details>';
  }

  function renderQuality(report, selectedDate) {
    if (!report) return '<p class="trend-note">選取日期無日報，無法判定當日資料品質。</p>';
    const rows = report.market.map(coin => ({
      label: coin.symbol, q: coin.data_quality, available: validPrice(coin.current_price), source: 'CoinGecko',
    })).concat(['fear_greed', 'reddit_sentiment', 'onchain'].map((key, i) => {
      const q = report.data_quality[key] || {};
      return { label: ['恐懼貪婪', 'Reddit 情緒', '市場概況／供給'][i], q, available: q.status === 'available',
        source: key === 'fear_greed' ? 'Alternative.me' : key === 'reddit_sentiment' ? 'Reddit' : 'CoinGecko' };
    }));
    return '<div class="trend-note">報告時間（台北）：' + escape(timeText(report.generated_at)) +
      (selectedDate < new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()) ? ' · 歷史報告' : '') +
      '。陳舊狀態以來源時間相對此報告時間判斷，不以今天判斷。</div>' +
      '<div class="quality-grid">' + rows.map(row => '<div class="quality-card"><strong>' + escape(row.label) + '</strong>' +
        '<span class="quality-badge">' + escape(qualityState(row.q, row.available, report.generated_at)) + '</span>' +
        '<div>來源：' + escape(row.q && row.q.source || row.source) + '</div>' +
        '<div>來源時間：' + escape(timeText(row.q && row.q.observed_at)) + '</div>' +
        '<div>抓取時間：' + escape(timeText(row.q && row.q.fetched_at)) + '</div></div>').join('') + '</div>';
  }

  function render(dataset, end, days, symbol) {
    const range = selectRange(dataset, end, days);
    const relative = relativeStrength(range);
    const prices = [
      { label: symbol + ' 觀察價格', color: COLORS[SYMBOLS.indexOf(symbol)], values: range.coins[symbol].map(c => c ? c.current_price : null) },
      { label: 'SMA7', color: '#58a6ff', values: range.coins[symbol].map(c => c && validPrice(c.sma7) ? c.sma7 : null) },
      { label: 'SMA20', color: '#f778ba', values: range.coins[symbol].map(c => c && validPrice(c.sma20) ? c.sma20 : null) },
    ].map(s => ({ ...s, format: priceText }));
    const relativeSeries = relative.series.map(s => ({
      label: s.symbol, color: COLORS[SYMBOLS.indexOf(s.symbol)], values: s.values, format: percentText,
    }));
    const sentiment = [{ label: 'BTC 恐懼貪婪（0–100）', color: '#3fb950', values: range.sentiment,
      format: value => isNumber(value) ? value.toFixed(0) : '缺值' }];
    const btc = [{ label: 'BTC 觀察價格', color: COLORS[0], values: range.coins.BTC.map(c => c ? c.current_price : null), format: priceText }];
    const availableDates = range.dates.filter(date => range.reports.has(date));
    let html = '<div class="section-title">趨勢分析</div><div class="trend-controls">' +
      '<label>觀察區間 <select id="trend-days">' + [7, 30, 90].map(d => '<option value="' + d + '"' +
        (d === days ? ' selected' : '') + '>' + d + ' 日</option>').join('') + '</select></label>' +
      '<label>價格圖幣種 <select id="trend-symbol">' + SYMBOLS.map(s => '<option' + (s === symbol ? ' selected' : '') + '>' + s + '</option>').join('') +
      '</select></label></div><p class="trend-note">' + range.dates[0] + ' 至 ' + end + '；日報覆蓋 ' + availableDates.length + '/' + days +
      ' 日。每日觀察快照，非即時行情、正式收盤價或 K 線。缺值斷線，不補零。</p>' +
      '<div class="trend-panel"><h2>資料品質</h2>' + renderQuality(range.reports.get(end), end) + '</div>' +
      '<div class="trend-panel"><h2>價格與均線</h2><p class="trend-note">SMA 為當日日報保存的指標，不以快照重新計算。</p>' +
      chart('價格與均線', range.dates, prices, priceText) + dataTable(range.dates, prices) + '</div>' +
      '<div class="trend-panel"><h2>幣種相對強弱</h2>';
    if (relative.baseline < 0) {
      html += '<p class="trend-note">資料不足：至少兩幣需有共同起點及其後有效觀察價格。</p>';
    } else {
      html += '<p class="trend-note">共同起點：' + range.dates[relative.baseline] + '，起點報酬設為 0%。卡片標明各幣最後有效觀察日期，不假設都是截止日。</p>' +
        '<div class="return-grid">' + relative.series.map(s => '<div class="return-card ' + (s.return >= 0 ? 'positive' : 'negative') + '">' +
          '<strong>' + s.symbol + ' ' + percentText(s.return) + '</strong><div>截至 ' + range.dates[s.endIndex] + '</div>' +
          '<div>有效 ' + s.values.filter(isNumber).length + '/' + (days - relative.baseline) + ' 日</div></div>').join('') + '</div>' +
        chart('共同起點相對報酬', range.dates, relativeSeries, percentText) + dataTable(range.dates, relativeSeries);
    }
    const excluded = SYMBOLS.filter(s => !relative.series.some(entry => entry.symbol === s));
    if (excluded.length) html += '<p class="trend-note">未納入比較（缺少共同起點或起點後資料）：' + excluded.join('、') + '。</p>';
    html += '</div><div class="trend-panel"><h2>恐懼貪婪與 BTC 對照</h2><p class="trend-note">使用一致日期範圍，但非同一瞬間觀察；情緒與價格關聯不代表因果或買賣訊號。</p>' +
      '<p class="trend-note">情緒來源：<a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener noreferrer">Alternative.me Crypto Fear &amp; Greed Index</a>（主要反映 BTC）；日期為來源 UTC 日期。</p>' +
      chart('BTC 恐懼貪婪', range.dates, sentiment, sentiment[0].format, [0, 100]) +
      chart('情緒對照 BTC 價格', range.dates, btc, priceText) + dataTable(range.dates, sentiment.concat(btc)) +
      '</div><p class="trend-note">行情來源：<a href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">CoinGecko</a>。本頁僅供觀察與研究，不構成投資建議。</p>';
    return html;
  }

  function createController(container, fetchData) {
    let datasetPromise;
    let selectedDate;
    let days = 30;
    let symbol = 'BTC';
    let revision = 0;
    async function load(date) {
      selectedDate = date;
      const request = ++revision;
      container.innerHTML = '<p class="trend-note" role="status">趨勢資料載入中…</p>';
      if (!datasetPromise) {
        datasetPromise = fetchData().then(data => {
          if (data.schema_version !== 1 || !Array.isArray(data.reports) || !Array.isArray(data.fear_greed)) {
            throw new Error('趨勢資料格式不支援');
          }
          return data;
        }).catch(error => { datasetPromise = null; throw error; });
      }
      try {
        const dataset = await datasetPromise;
        if (request === revision) container.innerHTML = render(dataset, date, days, symbol);
      } catch (error) {
        console.error('Trend history failed:', error);
        if (request === revision) container.innerHTML = '<p class="trend-note" role="alert">趨勢資料載入失敗；單日日報仍可閱讀。</p>' +
          '<button type="button" id="trend-retry">重試趨勢資料</button>';
      }
    }
    container.addEventListener('change', event => {
      if (event.target.id === 'trend-days') {
        const value = Number(event.target.value);
        if ([7, 30, 90].includes(value)) days = value;
        else return;
      } else if (event.target.id === 'trend-symbol') {
        if (SYMBOLS.includes(event.target.value)) symbol = event.target.value;
        else return;
      } else return;
      load(selectedDate);
    });
    container.addEventListener('click', event => {
      if (event.target.id === 'trend-retry') load(selectedDate);
    });
    return { load };
  }

  const api = { datesFor, selectRange, relativeStrength, qualityState, chart, render, createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CryptoTrends = api;
}(typeof window !== 'undefined' ? window : globalThis));
