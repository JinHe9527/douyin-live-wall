'use strict';

const { PLATFORMS, selectedRoomUrl, isPlatformUrl } = require('./live-platform');

function exactAudience(count, type) {
  if (type == null || Number(type) !== 0 || !/^\d+$/.test(String(count ?? ''))) return null;
  return { userCount: String(count), countLabel: '在线', countExact: true };
}

function parseAudienceFrame(frame) {
  if (!frame || ![1, 2].includes(frame.opcode)) return null;
  const text = frame.opcode === 2 ? Buffer.from(frame.payloadData, 'base64').toString('utf8') : frame.payloadData;
  // 官方 refresh 消息中的 room_data 是人数统计；不读取聊天、用户列表或礼物内容。
  const match = text.match(/"room_data"\s*:\s*(\{[^{}]{0,12000}\})/);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return exactAudience(data.member_count, data.viewer_info_display_type);
  } catch { return null; }
}

const AUDIENCE_PAGE_STATE = `(() => {
  const app = document.querySelector('#app');
  const pinia = app && app.__vue_app__ && app.__vue_app__.config.globalProperties.$pinia;
  const store = pinia && pinia._s.get('liveStream');
  document.querySelectorAll('video,audio').forEach(media => { if (!media.paused) media.pause(); });
  if (!store) return null;
  if (!window.__liveAudience || window.__liveAudience.store !== store) {
    const observation = { store, updatedAt: Date.now() };
    window.__liveAudience = observation;
    store.$onAction(({ name }) => { if (name === 'updateDisplayCountInfo') observation.updatedAt = Date.now(); });
  }
  if (store.roomStatus !== 2 || store.liveStatus !== 'success' || Date.now() - window.__liveAudience.updatedAt > 60000) return null;
  return store.displayCountInfo ? { count: store.displayCountInfo.displayCount, type: store.displayCountInfo.displayType } : null;
})()`;

function createAudienceMonitor({ BrowserWindow, session, userAgent, prepareWindow, onCount }) {
  const rooms = new Map();
  function remove(id) {
    const entry = rooms.get(id);
    if (!entry) return;
    rooms.delete(id);
    clearTimeout(entry.timer);
    if (!entry.win.isDestroyed()) entry.win.destroy();
  }
  function stop() { for (const id of rooms.keys()) remove(id); }
  function watch(room, url) {
    const win = new BrowserWindow({ show: false, width: 1100, height: 850,
      webPreferences: { session: session.fromPartition(PLATFORMS.xiaohongshu.partition),
        contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    const entry = { win, url, timer: null, lastFrameAt: 0 };
    rooms.set(room.id, entry);
    const active = () => rooms.get(room.id) === entry && !win.isDestroyed();
    win.webContents.setUserAgent(userAgent);
    win.webContents.setAudioMuted(true);
    prepareWindow(win);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const event of ['will-navigate', 'will-redirect']) win.webContents.on(event, (e, value) => {
      if (!isPlatformUrl(value, 'xiaohongshu')) e.preventDefault();
    });
    const publish = (count) => {
      if (active() && count) onCount({ id: room.id, ...count, observedAt: Date.now() });
    };
    const debug = win.webContents.debugger;
    const onMessage = (_e, method, params) => {
      if (method !== 'Network.webSocketFrameReceived' || !active()) return;
      const count = parseAudienceFrame(params.response);
      if (count) { entry.lastFrameAt = Date.now(); publish(count); }
    };
    win.once('closed', () => {
      debug.removeListener('message', onMessage);
      if (rooms.get(room.id) === entry) rooms.delete(room.id);
      clearTimeout(entry.timer);
    });
    const poll = async () => {
      if (!active()) return;
      try {
        const result = await debug.sendCommand('Runtime.evaluate', { expression: AUDIENCE_PAGE_STATE, returnByValue: true });
        const data = result.result && result.result.value;
        if (data && Date.now() - entry.lastFrameAt > 10000) publish(exactAudience(data.count, data.type));
      } catch { /* 页面重载期间等待下一次读取。 */ }
      if (active()) entry.timer = setTimeout(poll, 3000);
    };
    (async () => {
      try {
        await win.loadURL('about:blank');
        if (!active()) return;
        debug.attach('1.3');
        debug.on('message', onMessage);
        await debug.sendCommand('Network.enable');
        if (!active()) return;
        win.loadURL(url).catch(() => {});
        poll();
      } catch { if (active()) remove(room.id); }
    })();
  }
  function setRooms(values) {
    const next = new Map();
    for (const room of Array.isArray(values) ? values : []) {
      if (!room || typeof room.id !== 'string') continue;
      const url = selectedRoomUrl(room.url, 'xiaohongshu');
      if (url) next.set(room.id, { room, url });
    }
    for (const [id, entry] of rooms) if (!next.has(id) || next.get(id).url !== entry.url) remove(id);
    for (const [id, { room, url }] of next) if (!rooms.has(id)) watch(room, url);
  }
  return { setRooms, stop };
}

module.exports = { exactAudience, parseAudienceFrame, createAudienceMonitor };
