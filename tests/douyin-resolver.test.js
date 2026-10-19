const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDouyinResolver } = require('../lib/douyin-resolver');

function harness({ apiFailure = false } = {}) {
  const windows = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.dead = false; windows.push(this);
      this.webContents = Object.assign(new EventEmitter(), {
        setUserAgent() {}, setAudioMuted() {}, setWindowOpenHandler() {}, getURL: () => this.url,
        executeJavaScript: async code => {
          if (code.includes('webcast/room/web/enter')) return apiFailure ? { __ok: false } : {
            __ok: true, __json: { data: { data: [{ status: 2, stream_url: { flv_pull_url: { SD2: 'https://live.test/guest.flv' } } }] } },
          };
          return { __ok: true, __scrape: { status: 'live', flv: { SD2: 'https://live.test/fallback.flv' } } };
        },
      });
    }
    async loadURL(url) { this.url = url; this.emit('loaded'); }
    isDestroyed() { return this.dead; }
    destroy() {
      assert.equal(this.closing, undefined, 'closed 事件中不能重入 destroy');
      this.closing = true;
      this.emit('closed');
      this.dead = true;
    }
  }
  return { windows, create: session => createDouyinResolver({ BrowserWindow: Window,
    getSession: () => session, userAgent: 'test', startupDelayMs: 0, timeoutMs: 100 }) };
}

test('并发游客解析共用一次初始化，账号解析创建不同会话页面', async () => {
  const h = harness(), guestSession = {}, accountSession = {};
  const guest = h.create(guestSession), account = h.create(accountSession);
  try {
    const results = await Promise.all([guest.resolve('123456', 'fluent'), guest.resolve('234567', 'fluent')]);
    assert.ok(results.every(result => result.ok));
    assert.equal(h.windows.length, 1);
    assert.equal(h.windows[0].options.webPreferences.session, guestSession);
    assert.equal((await account.resolve('123456', 'fluent')).ok, true);
    assert.equal(h.windows[1].options.webPreferences.session, accountSession);
  } finally { guest.stop(); account.stop(); }
  assert.ok(h.windows.every(win => win.dead));
});

test('接口失败时导航继续使用游客会话，退出后不再创建窗口', async () => {
  const h = harness({ apiFailure: true }), session = {};
  const resolver = h.create(session);
  const result = await resolver.resolve('123456', 'fluent');
  assert.equal(result.ok, true);
  assert.equal(result.via, 'scrape');
  assert.equal(h.windows.length, 2);
  assert.ok(h.windows.every(win => win.options.webPreferences.session === session));
  resolver.stop();
  assert.equal((await resolver.resolve('123456', 'fluent')).ok, false);
  assert.equal(h.windows.length, 2);
  assert.ok(h.windows.every(win => win.dead));
});
