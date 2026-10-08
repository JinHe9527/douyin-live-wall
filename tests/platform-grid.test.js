const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const platform = require('../lib/live-platform');
const presence = require('../lib/live-presence');

function harness(saved, search = async () => ({ status: 'success', candidates: [] })) {
  const elements = new Map();
  function element() {
    return {
      value: '', hidden: false, dataset: {}, style: { setProperty() {} },
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, querySelectorAll: () => [], querySelector: () => element(),
      insertAdjacentHTML() {}, remove() {}, clientWidth: 1280, clientHeight: 860,
    };
  }
  const calls = { saves: [], searches: [], recording: [], info: [], platforms: [] };
  const mini = {
    loadRooms: async () => saved,
    saveRooms: async (data) => { calls.saves.push(data); },
    setPlatform: (value) => calls.platforms.push(value),
    setAutoRecordingConfig: (data) => calls.recording.push(data),
    setInfoMode: (...args) => calls.info.push(args),
    getLoginStatus: async () => null,
    onLoginStatus() {}, onDanmuBatch() {}, onRecordingStatus() {},
    onRoomSelected: (callback) => { calls.select = callback; },
    search: (...args) => { calls.searches.push(args); return search(...args); },
    cancelSearch() {}, watchAudience() {}, onAudience() {},
    resolve: () => new Promise(() => {}),
  };
  const context = vm.createContext({
    window: { mini, LivePlatform: platform, LivePresence: presence, addEventListener() {} },
    document: {
      getElementById: (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelectorAll: () => [], addEventListener() {}, body: element(),
    },
    navigator: { platform: 'MacIntel' }, URL, console,
    setInterval() {}, setTimeout() {}, clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync(require.resolve('../mini-app/grid.js'), 'utf8')
    + '\nwindow.testApi = { state, players, LivePlayer, switchPlatform, addFromInput, persist, searchRooms, addSearchCandidate, closeSearch, applyAudience, audienceText };', context);
  return { api: context.window.testApi, mini, element, calls, elements, settle: () => new Promise(setImmediate) };
}

test('多平台解析保留直播地址和人数，换线沿用原平台并尝试备用流', async () => {
  const h = harness({ activePlatform: 'xiaohongshu', profiles: { xiaohongshu: { library: [], wall: [] } } });
  await h.settle();
  const room = { id: 'xhs', name: 'X-RAY', platform: 'xiaohongshu', kind: 'live',
    url: 'https://www.xiaohongshu.com/livestream/123456789', presence: presence.createPresence() };
  let options;
  h.mini.resolve = async (_room, _quality, value) => {
    options = value;
    return { ok: true, webRid: '123456789', roomUrl: room.url, userCount: '83', countLabel: '在线',
      flvUrl: 'https://live.xhscdn.com/main.flv', flvCandidates: [
        { url: 'https://live.xhscdn.com/main.flv' }, { url: 'https://live.xhscdn.com/backup.flv' },
      ] };
  };
  const player = new h.api.LivePlayer(h.element(), h.element(), room);
  const played = [];
  player.create = (url) => played.push(url);
  assert.equal(await player.reResolve({ forceNavigationFallback: true }), true);
  assert.equal(options.platform, 'xiaohongshu');
  assert.equal(options.forceNavigationFallback, true);
  assert.equal(room.liveUrl, room.url);
  assert.equal(room.count, '83');
  assert.equal(player.tryNextCandidate(), true);
  assert.deepEqual(played, ['https://live.xhscdn.com/main.flv', 'https://live.xhscdn.com/backup.flv']);
  assert.equal(player.tryNextCandidate(), false);
});

test('切换平台销毁旧播放器、保存库与设置，切回恢复各自内容', async () => {
  const h = harness({ library: [{ id: 'dy', name: '抖音主播', url: 'https://live.douyin.com/123456', kind: 'live' }], wall: [], cols: '3' });
  await h.settle();
  let destroyed = false;
  h.api.players.set('dy', { destroy() { destroyed = true; } });
  h.api.switchPlatform('xiaohongshu');
  await h.settle();
  assert.equal(destroyed, true);
  assert.equal(h.api.state.library.length, 0);
  assert.equal(h.api.state.cols, 'auto');
  h.api.state.library.push({ id: 'xhs', name: '小红书主播', url: 'https://www.xiaohongshu.com/livestream/123456', kind: 'live' });
  h.api.switchPlatform('douyin');
  await h.settle();
  assert.equal(h.api.state.library[0].id, 'dy');
  assert.equal(h.api.state.cols, '3');
  const saved = h.calls.saves.at(-1);
  assert.equal(saved.profiles.xiaohongshu.library[0].id, 'xhs');
  assert.equal(saved.profiles.douyin.library[0].id, 'dy');
  assert.ok(h.calls.info.some(([enabled, ids]) => !enabled && ids.length === 0));
});

test('名字触发所属平台搜索，其他平台的延迟选择不会污染当前库', async () => {
  const h = harness({ activePlatform: 'xiaohongshu', profiles: { xiaohongshu: { library: [], wall: [] } } });
  await h.settle();
  h.api.addFromInput('宇宙k');
  assert.deepEqual(h.calls.searches, [['宇宙k', 'xiaohongshu']]);
  assert.equal(h.api.state.library.length, 0);
  h.calls.select({ platform: 'douyin', url: 'https://live.douyin.com/123456' });
  assert.equal(h.api.state.library.length, 0);
  h.calls.select({ platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/livestream/123456' });
  assert.equal(h.api.state.library.length, 1);
  assert.equal(h.api.state.rooms[0].platform, 'xiaohongshu');
});

test('同名旧房间仍查询当前直播，结果点击添加且不重复建格子', async () => {
  const h = harness({ activePlatform: 'xiaohongshu', profiles: { xiaohongshu: {
    library: [{ id: 'xhs', name: '宇宙-K', url: 'https://www.xiaohongshu.com/livestream/123456', kind: 'live' }], wall: [],
  } } }, async () => ({ status: 'success', candidates: [{ title: '宇宙-K', roomUrl: 'https://www.xiaohongshu.com/livestream/987654', subtitle: '直播中' }] }));
  await h.settle();
  h.api.addFromInput('宇宙k');
  await h.settle();
  assert.equal(h.calls.searches.length, 1);
  assert.equal(h.api.state.rooms.length, 0);
  assert.match(h.elements.get('search-list').innerHTML, /宇宙-K/);
  h.api.addSearchCandidate(0);
  h.api.addSearchCandidate(0);
  assert.equal(h.api.state.rooms.length, 1);
  assert.equal(h.api.state.rooms[0].url, 'https://www.xiaohongshu.com/livestream/987654');
  assert.match(h.elements.get('search-list').innerHTML, /已添加/);
});

test('过期搜索结果和切换平台后返回的结果不会覆盖当前搜索', async () => {
  const pending = [];
  const h = harness({ library: [], wall: [] }, () => new Promise((resolve) => pending.push(resolve)));
  await h.settle();
  h.api.searchRooms('甲');
  h.api.searchRooms('乙');
  pending[1]({ status: 'success', candidates: [{ title: '乙', roomUrl: 'https://live.douyin.com/12345' }] });
  await h.settle();
  pending[0]({ status: 'success', candidates: [] });
  await h.settle();
  assert.match(h.elements.get('search-list').innerHTML, /乙/);
  h.api.searchRooms('丙');
  h.api.switchPlatform('xiaohongshu');
  pending[2]({ status: 'success', candidates: [{ title: '丙', roomUrl: 'https://live.douyin.com/34567' }] });
  await h.settle();
  assert.equal(h.elements.get('room-search').hidden, true);
  h.api.addSearchCandidate(0);
  assert.equal(h.api.state.rooms.length, 0);
});

test('人数更新保留零、明确看过口径，缺失时清空旧数值', () => {
  const h = harness({ library: [], wall: [] });
  const room = { status: 'live', count: '100' };
  h.api.applyAudience(room, { userCount: 0 });
  assert.equal(h.api.audienceText(room), '0 在线');
  h.api.applyAudience(room, { userCount: '1万+', countLabel: '人看过' });
  assert.equal(h.api.audienceText(room), '1万+ 人看过');
  h.api.applyAudience(room, { userCount: '' });
  assert.equal(h.api.audienceText(room), '人数暂不可用');
  h.api.applyAudience(room, { userCount: '237', countExact: true, observedAt: Date.now() });
  h.api.applyAudience(room, { userCount: '100+' });
  assert.equal(h.api.audienceText(room), '237 在线');
  room.countObservedAt -= 61000;
  h.api.applyAudience(room, { userCount: '100+' });
  assert.equal(h.api.audienceText(room), '100+ 在线');
});

test('重启保留主动清空的抖音库，同时恢复非当前平台录制设置', async () => {
  const h = harness({ activePlatform: 'douyin', profiles: {
    douyin: { library: [], wall: [] },
    xiaohongshu: { library: [{ id: 'xhs', url: 'https://www.xiaohongshu.com/livestream/123456' }], autoRecording: { enabled: true, roomIds: ['xhs'], durationHours: 2 } },
  } });
  await h.settle();
  assert.equal(h.api.state.library.length, 0);
  assert.ok(h.calls.recording.some((config) => config.platform === 'xiaohongshu' && config.autoRecording.enabled));
});
