const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDesktopStreamReader } = require('../lib/xiaohongshu-desktop');

function harness({ mismatch = false, delay = false } = {}) {
  const windows = [];
  let inflight = 0, maximum = 0;
  class Window extends EventEmitter {
    constructor() {
      super(); windows.push(this); this.dead = false; maximum = Math.max(maximum, ++inflight);
      this.webContents = Object.assign(new EventEmitter(), { setUserAgent() {}, setAudioMuted() {}, setWindowOpenHandler() {},
        debugger: { attach() {}, isAttached: () => true, detach() {}, sendCommand: async () => {
          if (delay) await new Promise(setImmediate);
          return { result: { value: this.url?.startsWith('https:') ? { roomId: mismatch ? '999' : this.url.match(/livestream\/(\d+)/)[1],
            liveStatus: 'success', roomData: { roomInfo: { pullConfig: '{}' } } } : null } };
        } } });
    }
    loadURL(url) { this.url = url; return Promise.resolve(); }
    isDestroyed() { return this.dead; }
    destroy() { this.dead = true; inflight--; this.emit('closed'); }
  }
  const reader = createDesktopStreamReader({ BrowserWindow: Window, session: { fromPartition: () => ({}) },
    userAgent: 'test', timeoutMs: 30, concurrency: 2 });
  return { reader, windows, maximum: () => maximum };
}

test('读取官方桌面流配置后释放窗口；同场次共用请求与缓存', async () => {
  const h = harness({ delay: true });
  const url = 'https://www.xiaohongshu.com/livestream/123456';
  try {
    const [a, b] = await Promise.all([h.reader.read(url), h.reader.read(url + '?xsec_token=abc')]);
    assert.equal(a.roomId, '123456');
    assert.equal(b, a);
    assert.equal(h.windows.length, 1);
    assert.equal(h.windows[0].dead, true);
    assert.equal(await h.reader.read(url), a);
    assert.equal(h.windows.length, 1);
  } finally { h.reader.stop(); }
});

test('并发受限，禁止把其他房间配置用于当前主播', async () => {
  const h = harness({ mismatch: true });
  try {
    const result = await Promise.all([123456, 234567, 345678].map(id => h.reader.read(`https://www.xiaohongshu.com/livestream/${id}`)));
    assert.deepEqual(result, [null, null, null]);
    assert.equal(h.maximum(), 2);
    assert.ok(h.windows.every(win => win.dead));
    assert.equal(await h.reader.read('https://example.com/livestream/123456'), null);
  } finally { h.reader.stop(); }
});

test('退出时取消正在读取和排队请求，不再创建后台窗口', async () => {
  const h = harness({ mismatch: true });
  const requests = [123456, 234567, 345678].map(id => h.reader.read(`https://www.xiaohongshu.com/livestream/${id}`));
  h.reader.stop();
  assert.deepEqual(await Promise.all(requests), [null, null, null]);
  assert.ok(h.windows.every(win => win.dead));
  assert.equal(h.windows.length, 2);
});
