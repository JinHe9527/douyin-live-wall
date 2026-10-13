const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPlatformWindows } = require('../lib/platform-windows');
const vm = require('node:vm');
const { XHS_AUTH_SCRIPT } = require('../lib/xiaohongshu-auth');

function harness() {
  const windows = [];
  const selected = [];
  const statuses = [];
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.setUserAgent = (ua) => { this.ua = ua; };
      this.webContents.setAudioMuted = () => {};
      this.webContents.executeJavaScript = async () => this.auth || { status: 'logged_in', loggedIn: true };
      this.webContents.setWindowOpenHandler = (fn) => { this.openHandler = fn; };
      windows.push(this);
    }
    isDestroyed() { return !!this.closed; }
    close() { this.closed = true; this.emit('closed'); }
    destroy() { this.close(); }
    show() {}
    focus() {}
    setTitle(title) { this.title = title; }
    async loadURL(url) { this.url = url; }
  }
  const api = createPlatformWindows({
    BrowserWindow: Window,
    session: { fromPartition: (partition) => ({ partition, cookies: { get: async () => [] } }) },
    userAgent: 'desktop', mobileUserAgent: 'mobile',
    onRoomSelected: (room) => selected.push(room), onLoginStatus: (value) => statuses.push(value),
  });
  return { api, windows, selected, statuses };
}

test('名称搜索使用对应官方页面及独立登录态，直播导航只回传一次', async () => {
  const h = harness();
  h.api.openSearch('宇宙k', 'xiaohongshu');
  const win = h.windows[0];
  assert.equal(win.options.webPreferences.session.partition, 'persist:xiaohongshu');
  assert.equal(new URL(win.url).pathname, '/search_result_ai');
  assert.equal(decodeURIComponent(new URL(win.url).searchParams.get('keyword')), '宇宙k');
  let prevented = false;
  win.webContents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, 'https://www.xiaohongshu.com/livestream/570321613446566013');
  win.openHandler({ url: 'xhsdiscover://live_audience?room_id=570321613446566013' });
  assert.equal(prevented, true);
  assert.equal(h.selected.length, 1);
  assert.equal(h.selected[0].platform, 'xiaohongshu');
  await new Promise(setImmediate);
  assert.equal(win.closed, true);
});

test('切换或关闭搜索后旧窗口不能再添加房间', () => {
  const h = harness();
  h.api.openSearch('宇宙k', 'xiaohongshu');
  const old = h.windows[0];
  h.api.closeSearch();
  old.openHandler({ url: 'https://www.xiaohongshu.com/livestream/123456' });
  assert.equal(h.selected.length, 0);
});

test('官方搜索结果打开外链时拒绝，主页导航不冒充直播间', () => {
  const h = harness();
  h.api.openSearch('宇宙k', 'xiaohongshu');
  const win = h.windows[0];
  const initial = win.url;
  assert.deepEqual(win.openHandler({ url: 'https://xiaohongshu.com.evil.test/' }), { action: 'deny' });
  assert.equal(win.url, initial);
  win.openHandler({ url: 'https://www.xiaohongshu.com/user/profile/abc' });
  assert.match(win.url, /user\/profile/);
  assert.equal(h.selected.length, 0);
});

test('同一详情只聚焦不重建，抖音详情保留手机 UA', () => {
  const h = harness();
  h.api.openDetail('https://live.douyin.com/123456', '宇宙', 'douyin');
  h.api.openDetail('https://live.douyin.com/123456', '宇宙', 'douyin');
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].ua, 'mobile');
});

test('小红书识别官方登录状态，缺失状态不根据游客凭据猜测登录', () => {
  for (const loggedIn of [true, false, undefined]) {
    const root = { __vue_app__: { config: { globalProperties: { $pinia: { _s: new Map([['user', { loggedIn }]]) } } } } };
    const result = vm.runInNewContext(XHS_AUTH_SCRIPT, { URL, location: { href: 'https://www.xiaohongshu.com/explore' },
      document: { readyState: 'complete', querySelector: () => root } });
    assert.equal(result.loggedIn, loggedIn ?? null);
    assert.equal(result.status, loggedIn === true ? 'logged_in' : loggedIn === false ? 'logged_out' : 'unknown');
  }
});

test('小红书登录探测复用请求、释放隐藏窗口，搜索受限不冒充退出登录', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.api.loginStatus('xiaohongshu'), h.api.loginStatus('xiaohongshu')]);
  assert.equal(a.loggedIn, true);
  assert.equal(b.loggedIn, true);
  assert.equal(h.windows.length, 1);
  assert.equal(h.windows[0].closed, true);
  assert.equal(h.windows[0].options.show, false);
  h.api.reportSearchAuth({ status: 'restricted', loggedIn: null, code: '300011', message: '账号异常' });
  assert.equal(h.statuses.at(-1).loggedIn, true);
  assert.equal((await h.api.loginStatus('xiaohongshu')).status, 'restricted');
  h.api.reportSearchAuth({ status: 'logged_in', loggedIn: true });
  assert.equal((await h.api.loginStatus('xiaohongshu')).status, 'logged_in');
  h.api.stop();
});

test('登录窗口内状态变化可以推送，关闭后释放检查定时器', async () => {
  const h = harness();
  h.api.openLogin('xiaohongshu');
  const win = h.windows[0];
  win.auth = { status: 'logged_out', loggedIn: false };
  win.webContents.emit('did-finish-load');
  await new Promise(setImmediate);
  assert.equal(h.statuses.at(-1).loggedIn, false);
  win.auth = { status: 'logged_in', loggedIn: true };
  win.webContents.emit('did-finish-load');
  await new Promise(setImmediate);
  assert.equal(h.statuses.at(-1).loggedIn, true);
  h.api.stop();
  assert.equal(win.closed, true);
});
