const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createPlatformWindows } = require('../lib/platform-windows');

function harness() {
  const windows = [];
  const selected = [];
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.setUserAgent = (ua) => { this.ua = ua; };
      this.webContents.setWindowOpenHandler = (fn) => { this.openHandler = fn; };
      windows.push(this);
    }
    isDestroyed() { return !!this.closed; }
    close() { this.closed = true; this.emit('closed'); }
    show() {}
    focus() {}
    setTitle(title) { this.title = title; }
    async loadURL(url) { this.url = url; }
  }
  const api = createPlatformWindows({
    BrowserWindow: Window,
    session: { fromPartition: (partition) => ({ partition, cookies: { get: async () => [] } }) },
    userAgent: 'desktop', mobileUserAgent: 'mobile',
    onRoomSelected: (room) => selected.push(room), onLoginStatus: () => {},
  });
  return { api, windows, selected };
}

test('名称搜索使用对应官方页面及独立登录态，直播导航只回传一次', async () => {
  const h = harness();
  h.api.openSearch('宇宙k', 'xiaohongshu');
  const win = h.windows[0];
  assert.equal(win.options.webPreferences.session.partition, 'persist:xiaohongshu');
  assert.match(win.url, /keyword=%E5%AE%87%E5%AE%99k/);
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
