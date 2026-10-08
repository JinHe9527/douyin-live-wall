const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const { createRoomSearch, xiaohongshuCandidates } = require('../lib/room-search');

function searchHarness(page = { candidates: [{ title: '宇宙Dream', roomUrl: 'https://www.xiaohongshu.com/livestream/570487763509191279' }], status: 'success' }) {
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.loaded = []; this.destroyed = false; windows.push(this);
      const debug = new EventEmitter();
      debug.attach = () => { assert.ok(this.loaded.length, '启动 renderer 后才能读取页面'); this.attached = true; };
      debug.isAttached = () => this.attached;
      debug.detach = () => { this.attached = false; };
      debug.sendCommand = async (command, args) => command === 'Runtime.evaluate' ? { result: { value: typeof page === 'function' ? page(args.expression) : page } } : {};
      this.webContents = Object.assign(new EventEmitter(), { debugger: debug, setUserAgent() {}, setAudioMuted() {}, setWindowOpenHandler() {}, executeJavaScript: async () => page });
    }
    loadURL(url) {
      this.loaded.push(url);
      if (url !== 'about:blank') {
        const debug = this.webContents.debugger;
        debug.emit('message', {}, 'Network.responseReceived', { requestId: '1', response: { url: 'https://edith.xiaohongshu.com/api/sns/web/v1/search/notes' } });
        debug.emit('message', {}, 'Network.loadingFinished', { requestId: '1' });
      }
      return Promise.resolve();
    }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const search = createRoomSearch({ BrowserWindow: Window, session: { fromPartition: (partition) => partition }, userAgent: 'test', timeoutMs: 2500 });
  return { ...search, windows };
}

test('后台搜索先初始化页面再捕获官方结果，返回候选后释放窗口', async () => {
  const h = searchHarness();
  const result = await h.search('宇宙Dream', 'xiaohongshu');
  assert.equal(result.status, 'success');
  assert.equal(result.candidates[0].title, '宇宙Dream');
  assert.equal(h.windows[0].options.show, false);
  assert.equal(h.windows[0].options.webPreferences.session, 'persist:xiaohongshu');
  assert.equal(h.windows[0].destroyed, true);
  assert.equal(h.windows[0].attached, false);
});

test('登录或验证提示显式返回；取消旧查询不会关闭新查询', async () => {
  const h = searchHarness({ login: true });
  assert.equal((await h.search('甲', 'xiaohongshu')).status, 'login_required');
  const first = h.search('乙', 'xiaohongshu');
  const second = h.search('丙', 'xiaohongshu');
  assert.equal((await first).status, 'cancelled');
  assert.equal((await second).status, 'login_required');
  assert.equal(h.windows.every((win) => win.destroyed), true);
});

test('搜索直播卡片保留长房间号、认证参数和主播名，重复结果合并', () => {
  const data = JSON.parse('{"data":{"items":[{"live_card":{"live":{"room_id":"570487662325554285","name":"演出现场","xsec_token":"a+b"},"live_host_info":{"nickname":"宇宙-K","avatar":"https://sns-avatar.xhscdn.com/test"}}}]}}');
  const result = xiaohongshuCandidates([data, data]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '570487662325554285');
  assert.equal(result[0].title, '宇宙-K');
  assert.equal(new URL(result[0].roomUrl).searchParams.get('xsec_token'), 'a+b');
});

test('用户直播入口支持 camelCase；普通笔记和不安全数字不能伪造直播间', () => {
  const result = xiaohongshuCandidates({ users: [
    { nickname: '主播甲', live: { roomId: '570487662325554285', xsecToken: 'abc' } },
    { nickname: '未开播用户', userId: '123456' },
    { nickname: '不精确数字', live: { roomId: 570487662325554285 } },
  ], items: [{ id: '12345', noteCard: { displayTitle: '直播回顾' } }] });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, '主播甲');
  assert.equal(result[0].isLive, true);
});

function officialSearchPage(store) {
  const root = { __vue_app__: { config: { globalProperties: { $pinia: { _s: new Map([['search', store]]) } } } } };
  const context = vm.createContext({ URL, window: {}, document: {
    body: { innerText: '' }, querySelector: () => root, querySelectorAll: () => [],
  } });
  return (expression) => vm.runInContext(expression, context);
}

test('笔记页无直播时继续查询主播用户，X-RAY 用户直播可以添加', async () => {
  let calls = 0;
  const store = {
    state: 'success', feeds: [], userLists: [], oneboxInfo: {}, fetchUserListsStatus: 'auto',
    searchContext: { keyword: 'X-RAY', searchId: 'search-1' }, searchUserContext: {},
    resetSearchUserStore() { this.userLists = []; this.fetchUserListsStatus = 'loading'; },
    getUserLists(searchId) {
      calls++;
      assert.equal(searchId, this.searchUserContext.searchId);
      assert.equal(this.searchUserContext.keyword, 'X-RAY');
      setImmediate(() => {
        this.userLists = [{ name: 'X-RAY', liveInfo: { status: 2, roomId: '570487668398710259',
          xsecToken: 'profile-token', roomIdToken: { roomId: '570487668398710259', xsecToken: 'room-token' } } }];
        this.fetchUserListsStatus = 'success';
      });
    },
  };
  const h = searchHarness(officialSearchPage(store));
  const result = await h.search('X-RAY', 'xiaohongshu');
  assert.equal(result.status, 'success');
  assert.equal(result.candidates[0]?.title, 'X-RAY');
  assert.equal(new URL(result.candidates[0].roomUrl).searchParams.get('xsec_token'), 'room-token');
  assert.equal(calls, 1);
});

test('用户查询失败不能把笔记查询成功当成没有直播', async () => {
  const store = {
    state: 'success', feeds: [], userLists: [], oneboxInfo: {}, fetchUserListsStatus: 'error',
    searchContext: { keyword: 'X-RAY', searchId: 'search-2' }, searchUserContext: {},
  };
  const h = searchHarness(officialSearchPage(store));
  assert.equal((await h.search('X-RAY', 'xiaohongshu')).status, 'error');
});

test('用户直播状态必须在播，保留直播授权而不使用主页授权', () => {
  const result = xiaohongshuCandidates({ users: [
    { name: '在播', live_info: { status: 2, room_id: '123456789', room_id_token: { xsec_token: 'live-token' }, xsec_token: 'profile-token' } },
    { name: '已下播', liveInfo: { status: 3, roomId: '223456789' } },
    { name: '状态未知', liveInfo: { roomId: '323456789' } },
  ] });
  assert.equal(result.length, 1);
  assert.equal(result[0].title, '在播');
  assert.equal(new URL(result[0].roomUrl).searchParams.get('xsec_token'), 'live-token');
});
