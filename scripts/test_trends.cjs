const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const trends = require('../docs/trends.js');

const symbols = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'];
function fixture() {
  return {
    schema_version: 1,
    reports: [1, 2, 3, 4].map(day => ({
      date: '2026-10-0' + day,
      generated_at: '2026-10-0' + day + 'T06:00:00+08:00',
      market: symbols.map((symbol, i) => ({
        symbol, current_price: i < 2 ? (100 + i * 100) * day : null, sma7: 100, sma20: 90,
        data_quality: { source: 'CoinGecko', status: i < 2 ? 'available' : 'missing' },
      })),
      data_quality: {},
    })),
    fear_greed: [{ date: '2026-10-01', value: 0, available_on: '2026-10-01' },
      { date: '2026-10-02', value: 30, available_on: '2026-10-03' },
      { date: '2026-10-04', value: 50, available_on: '2026-10-04' }],
  };
}
function container() {
  return { innerHTML: '', handlers: {}, addEventListener(name, callback) { this.handlers[name] = callback; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('7/30/90 calendar-day windows are inclusive and end at selected date', () => {
  for (const days of [7, 30, 90]) {
    const dates = trends.datesFor('2026-10-02', days);
    assert.equal(dates.length, days);
    assert.equal(dates.at(-1), '2026-10-02');
    assert.equal(Date.parse(dates.at(-1)) - Date.parse(dates[0]), (days - 1) * 86400000);
  }
  assert.deepEqual(trends.datesFor('2024-03-01', 3), ['2024-02-28', '2024-02-29', '2024-03-01']);
});

test('range excludes future reports and sentiment learned after selected report', () => {
  const range = trends.selectRange(fixture(), '2026-10-02', 7);
  assert.equal(range.reports.size, 2);
  assert.equal(range.coins.BTC.at(-1).current_price, 200);
  assert.equal(range.sentiment.at(-2), 0);
  assert.equal(range.sentiment.at(-1), null);
});

test('relative returns share one baseline, preserve gaps and identify actual end dates', () => {
  const data = fixture();
  data.reports[1].market[0].current_price = null;
  data.reports[3].market[1].current_price = null;
  const range = trends.selectRange(data, '2026-10-04', 7);
  const relative = trends.relativeStrength(range);
  assert.equal(range.dates[relative.baseline], '2026-10-01');
  assert.equal(relative.series.length, 2);
  assert.deepEqual(relative.series[0].values.slice(-4), [0, null, 200, 300]);
  assert.equal(relative.series[0].return, 300);
  assert.equal(range.dates[relative.series[1].endIndex], '2026-10-03');
  assert.equal(relative.series[1].return, 200);
});

test('relative strength reports insufficiency without common dates or a second observation', () => {
  const data = fixture();
  data.reports.forEach((r, i) => { r.market[i % 2].current_price = null; });
  assert.equal(trends.relativeStrength(trends.selectRange(data, '2026-10-04', 7)).baseline, -1);
  assert.equal(trends.relativeStrength(trends.selectRange(fixture(), '2026-10-01', 7)).series.length, 0);
});

test('quality is relative to report time, not wall-clock historical viewing', () => {
  assert.equal(trends.qualityState({}, true, '2026-10-02T00:00:00Z'), '可用 · 來源時間未知');
  assert.match(trends.qualityState({}, false, null), /缺值/);
  assert.doesNotMatch(trends.qualityState({ observed_at: '2020-01-01T00:00:00Z' }, true, '2020-01-01T06:00:00Z'), /陳舊/);
  assert.match(trends.qualityState({ observed_at: '2020-01-01T00:00:00Z' }, true, '2020-01-03T00:00:00Z'), /陳舊/);
  assert.match(trends.qualityState({ observed_at: '2026-10-03T00:00:00Z' }, true, '2026-10-02T00:00:00Z'), /晚於報告/);
});

test('SVG breaks missing values instead of connecting gaps; labels are escaped', () => {
  const html = trends.chart('<price>', ['2026-10-01', '2026-10-02', '2026-10-03'],
    [{ label: '<unsafe>', color: '#f7931a', values: [1, null, 3] }], String);
  const line = html.match(/<path d="([^"]+)"/)[1];
  assert.equal((line.match(/M/g) || []).length, 2);
  assert.equal((line.match(/L/g) || []).length, 0);
  assert.ok(html.includes('&lt;unsafe&gt;'));
  assert.equal((html.match(/<circle /g) || []).length, 2);
});

test('render provides attribution, controls, actual coverage and accessible tables', () => {
  const html = trends.render(fixture(), '2026-10-04', 7, 'ETH');
  for (const text of ['7 日', '30 日', '90 日', '4/7', '每日觀察快照', 'SMA7', '相對強弱',
    'Alternative.me', 'CoinGecko', '來源時間未知', '<table>', 'role="img"', '截至 2026-10-04']) assert.ok(html.includes(text), text);
  assert.equal((html.match(/<svg /g) || []).length, 4);
});

test('trend controller caches history and refuses outdated date renders', async () => {
  const host = container();
  let resolve;
  let calls = 0;
  const controller = trends.createController(host, () => {
    calls++;
    return new Promise(done => { resolve = done; });
  });
  const first = controller.load('2026-10-01');
  const last = controller.load('2026-10-04');
  resolve(fixture());
  await Promise.all([first, last]);
  assert.equal(calls, 1);
  assert.match(host.innerHTML, /至 2026-10-04/);
  host.handlers.change({ target: { id: 'trend-days', value: '90' } });
  await flush();
  assert.match(host.innerHTML, /4\/90/);
  host.handlers.change({ target: { id: 'trend-symbol', value: 'ETH' } });
  await flush();
  assert.match(host.innerHTML, /ETH 觀察價格/);
  assert.equal(calls, 1);
});

test('trend failures are visible, retryable and independent', async () => {
  const host = container();
  let calls = 0;
  const controller = trends.createController(host, async () => {
    if (++calls === 1) throw new Error('offline');
    return fixture();
  });
  await controller.load('2026-10-04');
  assert.match(host.innerHTML, /role="alert"/);
  assert.match(host.innerHTML, /單日日報仍可閱讀/);
  host.handlers.click({ target: { id: 'trend-retry' } });
  await flush();
  assert.match(host.innerHTML, /價格與均線/);
  assert.equal(calls, 2);
});

test('invalid trend schema does not masquerade as empty successful data', async () => {
  const host = container();
  const controller = trends.createController(host, async () => ({ reports: [] }));
  await controller.load('2026-10-04');
  assert.match(host.innerHTML, /載入失敗/);
});

test('daily report date races cannot overwrite newest report; errors distinguish 404', async () => {
  const ids = ['date-picker', 'btn-prev', 'btn-next', 'date-display', 'app-content', 'trend-content'];
  const elements = Object.fromEntries(ids.map(id => [id, { ...container(), value: '', textContent: '' }]));
  const requests = new Map();
  const context = {
    document: { getElementById: id => elements[id] },
    window: { CryptoTrends: { createController: () => ({ load() {} }) } },
    fetch: url => new Promise(resolve => requests.set(url, resolve)),
    Intl, Date, console,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8'), context);
  elements['date-picker'].value = '2026-10-01';
  elements['date-picker'].handlers.change();
  elements['date-picker'].value = '2026-10-04';
  elements['date-picker'].handlers.change();
  requests.get('data/2026-10-04.json')({ ok: true, json: async () => ({ summary: 'newest report' }) });
  await flush();
  requests.get('data/2026-10-01.json')({ ok: true, json: async () => ({ summary: 'older report' }) });
  await flush();
  assert.match(elements['app-content'].innerHTML, /newest report/);
  assert.doesNotMatch(elements['app-content'].innerHTML, /older report/);
  elements['date-picker'].value = '2026-10-05';
  elements['date-picker'].handlers.change();
  requests.get('data/2026-10-05.json')({ ok: false, status: 500 });
  await flush();
  assert.match(elements['app-content'].innerHTML, /日報載入失敗/);
  elements['date-picker'].value = '2026-10-06';
  elements['date-picker'].handlers.change();
  requests.get('data/2026-10-06.json')({ ok: false, status: 404 });
  await flush();
  assert.match(elements['app-content'].innerHTML, /尚無報告/);
});

test('retained real dataset renders all five symbols for every supported interval', () => {
  const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/data/trends.json'), 'utf8'));
  const end = dataset.reports.at(-1).date;
  for (const days of [7, 30, 90]) {
    for (const symbol of symbols) {
      const html = trends.render(dataset, end, days, symbol);
      assert.ok(html.includes(symbol + ' 觀察價格'));
      assert.equal((html.match(/<svg /g) || []).length, 4);
      assert.equal((html.match(/<table>/g) || []).length, 3);
      assert.ok(!html.includes('NaN'));
      assert.ok(!html.includes('Infinity'));
      const range = trends.selectRange(dataset, end, days);
      const relative = trends.relativeStrength(range);
      assert.ok(relative.baseline >= 0);
      for (const series of relative.series) assert.equal(series.values[relative.baseline], 0);
    }
  }
});
