'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { squareCandidates, resolveDirectoryCandidate, createXiaohongshuDirectory } = require('../lib/xiaohongshu-directory');

const a = { id: '570504894334506273', title: '宇宙-K', anchorId: 'host-k',
  roomUrl: 'https://www.xiaohongshu.com/livestream/570504894334506273', isLive: true };
const b = { id: '570505087339337034', title: '宇宙-V', anchorId: 'host-v',
  roomUrl: 'https://www.xiaohongshu.com/livestream/570505087339337034', isLive: true };
const page = (candidates, extra = {}) => ({ ready: true, loggedIn: false, candidates, ...extra });

function harness(pages, options = {}) {
  const windows = [], guest = {}, expressions = [];
  let calls = 0;
  class Window extends EventEmitter {
    constructor(settings) {
      super(); this.settings = settings; windows.push(this);
      this.webContents = Object.assign(new EventEmitter(), {
        setUserAgent() {}, setAudioMuted() {}, setWindowOpenHandler() {},
        debugger: { attach() {}, sendCommand: async (_method, args) => {
          expressions.push(args.expression);
          const data = pages[Math.min(calls++, pages.length - 1)];
          return { result: { value: JSON.stringify(data) } };
        } },
      });
    }
    async loadURL(url) { this.url = url; }
    isDestroyed() { return !!this.dead; }
    destroy() {
      assert.ok(!this.closing, '不得在 closed 回调中重入 destroy');
      this.closing = true; this.emit('closed'); this.dead = true;
    }
  }
  const directory = createXiaohongshuDirectory({ BrowserWindow: Window, getSession: () => guest,
    pageDelayMs: 0, maxPages: 5, timeoutMs: 1000, ...options });
  return { directory, windows, guest, expressions, calls: () => calls };
}

test('官方列表重新排列或替换时仍读取新房间，不按数组偏移漏过主播', async () => {
  const h = harness([page([a], { noMore: true })]);
  await h.directory.search(a.title);
  h.directory.stop();
  const feed = item => ({ live: { tRoomInfo: { roomIdStr: item.id },
    tLiveHostInfo: { userId: item.anchorId, nickname: item.title } } });
  const store = { liveList: [feed(a)], isFetching: false };
  const pinia = { _s: new Map([['liveList', store], ['user', { loggedIn: false }]]) };
  const context = require('node:vm').createContext({ window: {},
    document: { querySelector: () => ({ __vue_app__: { config: { globalProperties: { $pinia: pinia } } } }) }, URL });
  const read = async () => JSON.parse(await require('node:vm').runInContext(h.expressions[0], context));
  assert.equal((await read()).candidates[0].id, a.id);
  store.liveList = [feed(b), feed(a)];
  assert.deepEqual((await read()).candidates.map(item => item.id), [b.id]);
  assert.equal((await read()).candidates.length, 0);
});

test('广场读取精确的字符串房间号并保留分享参数，拒绝舍入房间号和无主播卡片', () => {
  const live = { tRoomInfo: { roomId: 570504894334506273, roomIdStr: a.id, xsecToken: 'token+/=' },
    tLiveHostInfo: { userId: a.anchorId, nickname: a.title } };
  const [item] = squareCandidates([{ live }, { live },
    { live: { ...live, tRoomInfo: { roomId: 570504894334506273 } } },
    { live: { tRoomInfo: live.tRoomInfo } }]);
  assert.equal(item.id, a.id);
  assert.equal(item.anchorId, a.anchorId);
  assert.equal(new URL(item.roomUrl).searchParams.get('xsec_token'), 'token+/=');
  assert.equal(squareCandidates([{ live: { ...live, tRoomInfo: { roomId: 570504894334506273 } } }]).length, 0);
});

test('仅使用与主播和精确场次一致的官方广场流，跨主播或舍入场次不能拉流', () => {
  for (const [host, id, valid] of [[a.anchorId, a.id, true], ['other-host', a.id, false],
    [a.anchorId, '570504894334506300', false]]) {
    const raw = `{"media":{"room_id":${id},"host_id":"${host}"},"streams":[{"master_url":"https://live.xhscdn.com/live/${a.id}.flv","quality_type":"FLV","max_bitrate":3000000}]}`;
    const [candidate] = squareCandidates([{ live: { tRoomInfo: { roomIdStr: a.id },
      tLiveHostInfo: { userId: a.anchorId, nickname: a.title },
      roomExtraInfo: JSON.stringify({ live_stream_info: raw }) } }]);
    const resolved = resolveDirectoryCandidate(candidate, 'fluent');
    assert.equal(resolved.ok, valid);
    if (valid) { assert.equal(resolved.webRid, a.id); assert.equal(resolved.anchorId, a.anchorId); }
  }
});

test('多主播共用游客分页；命中即返回，已发现主播可从缓存直接刷新', async () => {
  const h = harness([page([]), page([a]), page([a, b], { noMore: true })]);
  try {
    const [first, second] = await Promise.all([
      h.directory.search(a.title, { anchorId: a.anchorId }),
      h.directory.search(b.title, { anchorId: b.anchorId }),
    ]);
    assert.ok(first.candidates.some(item => item.id === a.id));
    assert.ok(second.candidates.some(item => item.id === b.id));
    assert.equal(h.windows.length, 1);
    assert.equal(h.windows[0].settings.webPreferences.session, h.guest);
    const calls = h.calls();
    await h.directory.search(a.title, { anchorId: a.anchorId });
    assert.equal(h.calls(), calls);
  } finally { h.directory.stop(); }
  assert.ok(h.windows.every(win => win.dead));
});

test('同名不同主播不匹配；列表遗漏不会产生未开播结论，冷却后可发现新开播', async () => {
  let now = 0;
  const h = harness([page([a], { noMore: true })], { now: () => now, cooldownMs: 100 });
  try {
    const missing = await h.directory.search(a.title, { anchorId: 'other-host' });
    assert.equal(missing.status, 'success');
    assert.equal(missing.offlineAnchors, undefined);
    await h.directory.search('未出现');
    assert.equal(h.windows.length, 1);
    now = 101;
    await h.directory.search('未出现');
    assert.equal(h.windows.length, 2);
  } finally { h.directory.stop(); }
});

test('旧场次缓存不能提前结束查找，新场次命中后替换缓存', async () => {
  const next = { ...a, id: '570504894334506274', roomUrl: a.roomUrl.replace(/273$/, '274') };
  const h = harness([page([a]), page([next], { noMore: true })]);
  try {
    const result = await h.directory.search(a.title, { anchorId: a.anchorId, previousRoomUrl: a.roomUrl });
    assert.equal(result.candidates[0].id, next.id);
    assert.equal(h.calls(), 2);
  } finally { h.directory.stop(); }
});

test('停止、超时和非游客页面会结束等待并关闭窗口', async () => {
  for (const mode of ['stop', 'timeout', 'account']) {
    const h = harness([mode === 'account' ? page([a], { loggedIn: true }) : { ready: false }],
      { timeoutMs: 20 });
    const pending = h.directory.search(a.title);
    if (mode === 'stop') h.directory.stop();
    const result = await pending;
    assert.equal(result.status, 'error');
    assert.equal(result.candidates.length, 0);
    h.directory.stop();
    assert.ok(h.windows.every(win => win.dead));
    assert.equal((await h.directory.search(a.title)).status, 'cancelled');
  }
});
