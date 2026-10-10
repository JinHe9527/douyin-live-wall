'use strict';

const { PLATFORMS, selectedRoomUrl, isPlatformUrl } = require('./live-platform');

// 只读取官方播放器使用的流配置，不读取聊天、用户列表或登录凭据。
const LIVE_CONFIG_SCRIPT = `(() => {
  const store = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('liveStream');
  const info = store?.roomData?.roomInfo;
  if (!info?.pullConfig) return null;
  const host = store.roomData.hostInfo || {};
  return { roomId: store.roomId, liveStatus: store.liveStatus,
    roomData: { hostInfo: { nickName: host.nickName, userId: host.userId },
      roomInfo: { pullConfig: info.pullConfig, roomTitle: info.roomTitle, status: info.status,
        viewerInfoDisplayType: info.viewerInfoDisplayType, displayMemberCount: info.displayMemberCount,
        displayViewerCount: info.displayViewerCount, pv: info.pv } } };
})()`;

function createDesktopStreamReader({ BrowserWindow, session, userAgent, prepareWindow = () => {},
  now = Date.now, timeoutMs = 10000, cacheMs = 60000, concurrency = 2 }) {
  const pending = new Map(), cache = new Map(), jobs = [], active = new Set();
  let running = 0, stopped = false;

  function readPage(url, roomId) {
    return new Promise((resolve) => {
      const win = new BrowserWindow({ show: false, width: 900, height: 700,
        webPreferences: { session: session.fromPartition(PLATFORMS.xiaohongshu.partition),
          contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true } });
      let done = false, timer, deadline;
      const debug = win.webContents.debugger;
      const finish = (data = null) => {
        if (done) return;
        done = true; clearTimeout(timer); clearTimeout(deadline); active.delete(finish);
        try { if (debug.isAttached()) debug.detach(); } catch {}
        if (!win.isDestroyed()) win.destroy();
        resolve(data);
      };
      active.add(finish);
      win.webContents.setUserAgent(userAgent);
      win.webContents.setAudioMuted(true);
      prepareWindow(win);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      for (const event of ['will-navigate', 'will-redirect']) win.webContents.on(event, (e, value) => {
        if (!isPlatformUrl(value, 'xiaohongshu')) e.preventDefault();
      });
      win.once('closed', () => finish());
      deadline = setTimeout(() => finish(), timeoutMs);
      const poll = async () => {
        if (done) return;
        try {
          const response = await debug.sendCommand('Runtime.evaluate', { expression: LIVE_CONFIG_SCRIPT, returnByValue: true });
          if (done) return;
          const data = response.result?.value;
          if (data && String(data.roomId) === roomId) { finish(data); return; }
        } catch { /* 页面导航过程中继续等待。 */ }
        if (!done) timer = setTimeout(poll, 300);
      };
      (async () => {
        try {
          await win.loadURL('about:blank');
          if (done) return;
          debug.attach('1.3');
          win.loadURL(url).catch(() => finish());
          poll();
        } catch { finish(); }
      })();
    });
  }

  function pump() {
    while (!stopped && running < concurrency && jobs.length) {
      const job = jobs.shift(); running++;
      readPage(job.url, job.id).catch(() => null).then((data) => {
        // 失败也短暂缓存，避免网络异常时持续创建后台页面。
        cache.set(job.id, { data, expires: now() + (data ? cacheMs : 15000) });
        job.resolve(data);
      }).finally(() => { running--; pending.delete(job.id); pump(); });
    }
  }

  function read(value) {
    const url = selectedRoomUrl(value, 'xiaohongshu');
    if (!url || stopped) return Promise.resolve(null);
    const id = new URL(url).pathname.match(/livestream\/(\d+)/)[1];
    const hit = cache.get(id);
    if (hit && hit.expires > now()) return Promise.resolve(hit.data);
    if (pending.has(id)) return pending.get(id);
    const promise = new Promise((resolve) => jobs.push({ id, url, resolve }));
    pending.set(id, promise); pump();
    return promise;
  }

  function stop() {
    stopped = true;
    for (const finish of [...active]) finish();
    for (const job of jobs.splice(0)) { pending.delete(job.id); job.resolve(null); }
    cache.clear();
  }
  return { read, stop };
}

module.exports = { LIVE_CONFIG_SCRIPT, createDesktopStreamReader };
