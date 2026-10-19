'use strict';

const { resolveStream } = require('./douyin-stream');

// 每个会话各有常驻解析页和串行导航页，游客与账号从不共用页面。
function createDouyinResolver({ BrowserWindow, getSession, userAgent, prepareWindow = () => {},
  pauseMedia = () => {}, timeoutMs = 12000, startupDelayMs = 1200 }) {
  let resolver = null, ready = null, nav = null, chain = Promise.resolve(), stopped = false;

  function close(win) {
    if (win && !win.isDestroyed()) win.destroy();
  }
  function invalidate(win) {
    if (resolver === win) { resolver = null; ready = null; }
    if (nav === win) nav = null;
    close(win);
  }
  function timeout(promise, ms) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('playback-timeout')), ms);
    })]).finally(() => clearTimeout(timer));
  }
  function createWindow() {
    if (stopped) throw new Error('playback-stopped');
    const win = new BrowserWindow({ show: false, webPreferences: { session: getSession(),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.webContents.setUserAgent(userAgent);
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    prepareWindow(win);
    win.once('closed', () => {
      // closed 回调中不再次 destroy；部分 Electron 平台此时还没置 isDestroyed。
      if (resolver === win) { resolver = null; ready = null; }
      if (nav === win) nav = null;
    });
    win.on('unresponsive', () => invalidate(win));
    win.webContents.once('render-process-gone', () => invalidate(win));
    win.webContents.on('did-finish-load', () => pauseMedia(win));
    return win;
  }
  async function navigate(win, url) {
    try { await timeout(win.loadURL(url), timeoutMs); }
    catch (error) {
      // 页面主体已加载时，附属资源失败不妨碍读取直播信息。
      if (win.isDestroyed() || !win.webContents.getURL().startsWith('https://')) throw error;
    }
  }
  function ensureResolver() {
    if (stopped) return Promise.reject(new Error('playback-stopped'));
    if (ready && resolver && !resolver.isDestroyed()) return ready;
    const win = createWindow();
    resolver = win;
    ready = (async () => {
      await navigate(win, 'https://live.douyin.com/');
      if (startupDelayMs) await new Promise(r => setTimeout(r, startupDelayMs));
      if (stopped || win.isDestroyed()) throw new Error('playback-stopped');
      pauseMedia(win);
    })().catch(error => { invalidate(win); throw error; });
    return ready;
  }
  async function run(win, code) {
    if (!win || win.isDestroyed() || stopped) throw new Error('playback-unavailable');
    try { return await timeout(win.webContents.executeJavaScript(code, true), timeoutMs); }
    catch (error) { invalidate(win); throw error; }
  }
  const context = {
    async apiRunJs(code) {
      await ensureResolver();
      return run(resolver, code);
    },
    withNav(task) {
      const next = chain.then(async () => {
        if (stopped) throw new Error('playback-stopped');
        if (!nav || nav.isDestroyed()) nav = createWindow();
        const win = nav;
        try { return await timeout(task(url => navigate(win, url), code => run(win, code)), 26000); }
        catch (error) { invalidate(win); throw error; }
      });
      chain = next.catch(() => {});
      return next;
    },
  };
  return {
    resolve: (input, quality, options = {}) => resolveStream(context, input, { ...options, quality }),
    stop() { stopped = true; invalidate(resolver); invalidate(nav); },
  };
}

module.exports = { createDouyinResolver };
