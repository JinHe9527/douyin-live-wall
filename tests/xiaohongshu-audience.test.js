const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { parseAudienceFrame, exactAudience, createAudienceMonitor } = require('../lib/xiaohongshu-audience');

test('从直播刷新消息读取精确在线人数，零值有效，点赞和累计观看不能替代在线人数', () => {
  const payload = '\u0000prefix' + JSON.stringify({ type: 'refresh', room_data: { member_count: 12345, praise_count: 987654, pv: 456789, viewer_info_display_type: 0 } }) + '\u0001';
  assert.deepEqual(parseAudienceFrame({ opcode: 2, payloadData: Buffer.from(payload).toString('base64') }), { userCount: '12345', countLabel: '在线', countExact: true });
  assert.equal(exactAudience('0', 0).userCount, '0');
  assert.equal(exactAudience('100+', 0), null);
  assert.equal(exactAudience('1.2万', 0), null);
  assert.equal(exactAudience('200', 1), null);
  assert.equal(exactAudience('200', null), null);
  assert.equal(parseAudienceFrame({ opcode: 1, payloadData: '{"room_data":{"praise_count":1000}}' }), null);
});

test('人数订阅复用同一房间，切换或下墙释放页面，过期消息不能回传', async () => {
  const windows = [], counts = [];
  class Window extends EventEmitter {
    constructor() {
      super(); windows.push(this); this.destroyed = false;
      const debug = new EventEmitter();
      debug.attach = () => {};
      debug.sendCommand = async () => ({ result: { value: { count: '321', type: 0 } } });
      this.webContents = Object.assign(new EventEmitter(), { debugger: debug, setUserAgent() {}, setAudioMuted() {}, setWindowOpenHandler() {} });
    }
    loadURL() { return Promise.resolve(); }
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const monitor = createAudienceMonitor({ BrowserWindow: Window, session: { fromPartition: () => ({}) }, userAgent: 'test', prepareWindow() {}, onCount: (value) => counts.push(value) });
  const room = { id: 'room', url: 'https://www.xiaohongshu.com/livestream/570487662325554285' };
  try {
    monitor.setRooms([room, { id: 'bad', url: 'https://example.com/livestream/123' }]);
    await new Promise(setImmediate);
    assert.equal(counts[0].userCount, '321');
    monitor.setRooms([room]);
    assert.equal(windows.length, 1);
    monitor.setRooms([room, { id: 'duplicate', url: room.url + '?xsec_token=another' }]);
    assert.equal(windows.length, 1, '同场直播多个格子只创建一个后台页面');
    windows[0].webContents.debugger.emit('message', {}, 'Network.webSocketFrameReceived', { response: { opcode: 1, payloadData: '{"room_data":{"member_count":456,"viewer_info_display_type":0}}' } });
    assert.deepEqual(counts.slice(-2).map(value => value.id), ['room', 'duplicate']);
    monitor.setRooms([{ id: 'duplicate', url: room.url }]);
    assert.equal(windows[0].destroyed, false, '移除一个格子时保留仍被使用的订阅');
    monitor.setRooms([]);
    assert.equal(windows[0].destroyed, true);
    const before = counts.length;
    windows[0].webContents.debugger.emit('message', {}, 'Network.webSocketFrameReceived', { response: { opcode: 1, payloadData: '{"room_data":{"member_count":999,"viewer_info_display_type":0}}' } });
    assert.equal(counts.length, before);
  } finally { monitor.stop(); }
});
