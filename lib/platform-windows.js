'use strict';

const { PLATFORMS, normalizePlatform, isPlatformUrl, selectedRoomUrl, searchUrl } = require('./live-platform');
const { XHS_AUTH_SCRIPT } = require('./xiaohongshu-auth');

function createPlatformWindows({ BrowserWindow, session, userAgent, mobileUserAgent = userAgent, onRoomSelected, onLoginStatus, prepareWindow = () => {} }) {
  let searchWindow = null;
  let detailWindow = null;
  let detailTarget = '';
  const loginWindows = new Map();
  let authCache = null, authAt = 0, authPending = null, authProbe = null, searchIssue = null;

  function rememberAuth(auth) {
    if (auth.status === 'logged_out') searchIssue = null;
    authCache = auth;
    authAt = Date.now();
    return searchIssue ? { ...auth, ...searchIssue, loggedIn: auth.loggedIn } : auth;
  }

  function reportSearchAuth(auth) {
    if (!auth) return;
    if (['restricted', 'verification_required'].includes(auth.status)) searchIssue = auth;
    else if (auth.status === 'logged_in') searchIssue = null;
    const result = rememberAuth({ ...auth, loggedIn: auth.loggedIn ?? authCache?.loggedIn ?? null });
    onLoginStatus({ platform: 'xiaohongshu', ...result });
  }

  async function readAuth(win) {
    try { return await win.webContents.executeJavaScript(XHS_AUTH_SCRIPT) || { status: 'unknown', loggedIn: null }; }
    catch { return { status: 'unknown', loggedIn: null }; }
  }

  function probeAuth() {
    if (authPending) return authPending;
    authPending = new Promise((resolve) => {
      const win = new BrowserWindow({ show: false, width: 900, height: 700,
        webPreferences: { session: session.fromPartition(PLATFORMS.xiaohongshu.partition),
          contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: true } });
      win.webContents.setUserAgent(userAgent);
      win.webContents.setAudioMuted(true);
      prepareWindow(win);
      guardNavigation(win, 'xiaohongshu');
      let done = false, timer;
      const finish = (auth = { status: 'unknown', loggedIn: null }) => {
        if (done) return;
        done = true; clearTimeout(timer); clearTimeout(deadline); authProbe = null;
        if (!win.isDestroyed()) win.destroy();
        resolve(rememberAuth(auth));
      };
      authProbe = finish;
      const deadline = setTimeout(() => finish(), 10000);
      win.once('closed', () => finish());
      const poll = async () => {
        if (done) return;
        const auth = await readAuth(win);
        if (done) return;
        if (auth && auth.status !== 'unknown') { finish(auth); return; }
        timer = setTimeout(poll, 500);
      };
      win.loadURL(PLATFORMS.xiaohongshu.home).then(poll).catch(() => finish());
    }).finally(() => { authPending = null; });
    return authPending;
  }

  function createWindow(platform, title, width = 1050, height = 800) {
    const win = new BrowserWindow({
      width, height, title, backgroundColor: '#12161f',
      webPreferences: {
        session: session.fromPartition(PLATFORMS[platform].partition),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    });
    win.webContents.setUserAgent(userAgent);
    return win;
  }

  function guardNavigation(win, platform, onSelect = () => false) {
    const navigate = (event, url) => {
      if (onSelect(url) || !isPlatformUrl(url, platform)) event.preventDefault();
    };
    win.webContents.on('will-navigate', navigate);
    win.webContents.on('will-redirect', navigate);
    win.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) onSelect(url);
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (!onSelect(url) && isPlatformUrl(url, platform)) win.loadURL(url).catch(() => {});
      return { action: 'deny' };
    });
  }

  function closeSearch() {
    if (searchWindow && !searchWindow.isDestroyed()) searchWindow.close();
    searchWindow = null;
  }

  function closeDetail() {
    if (detailWindow && !detailWindow.isDestroyed()) detailWindow.close();
    detailWindow = null;
    detailTarget = '';
  }

  function openSearch(keyword, requestedPlatform) {
    const platform = normalizePlatform(requestedPlatform);
    const query = String(keyword || '').trim().slice(0, 80);
    if (!query) return;
    closeSearch();
    const win = createWindow(platform, `${PLATFORMS[platform].name}搜索 · ${query} · 点击正在直播的主播即可上墙`);
    searchWindow = win;
    let selected = false;
    guardNavigation(win, platform, (url) => {
      if (win.isDestroyed() || searchWindow !== win) return true;
      const room = selectedRoomUrl(url, platform);
      if (!room) return false;
      if (!selected) {
        selected = true;
        onRoomSelected({ platform, url: room, name: '' });
        // 导航事件结束后关闭窗口，避免销毁正在处理导航的 webContents。
        setImmediate(() => { if (!win.isDestroyed()) win.close(); });
      }
      return true;
    });
    win.on('closed', () => { if (searchWindow === win) searchWindow = null; });
    win.loadURL(searchUrl(query, platform)).catch(() => {});
  }

  function openDetail(value, title, requestedPlatform) {
    const platform = normalizePlatform(requestedPlatform);
    const url = selectedRoomUrl(value, platform);
    if (!url) return;
    const target = `${platform}:${url}`;
    if (detailWindow && !detailWindow.isDestroyed() && detailTarget === target) {
      detailWindow.show();
      detailWindow.focus();
      return;
    }
    closeDetail();
    const win = createWindow(platform, title || `${PLATFORMS[platform].name}直播间`, platform === 'douyin' ? 440 : 520, 900);
    detailWindow = win;
    detailTarget = target;
    if (platform === 'douyin') win.webContents.setUserAgent(mobileUserAgent);
    guardNavigation(win, platform);
    win.on('closed', () => { if (detailWindow === win) detailWindow = null; });
    win.loadURL(url).catch(() => {});
  }

  async function loginStatus(requestedPlatform) {
    const platform = normalizePlatform(requestedPlatform);
    // 小红书 web_session 也用于游客，改读官方页面的 loggedIn 状态。
    if (platform === 'xiaohongshu') {
      const win = loginWindows.get(platform);
      if (win && !win.isDestroyed()) return rememberAuth(await readAuth(win));
      if (authCache && Date.now() - authAt < 30000) return searchIssue ? { ...authCache, ...searchIssue, loggedIn: authCache.loggedIn } : authCache;
      return probeAuth();
    }
    try {
      const cookies = await session.fromPartition(PLATFORMS[platform].partition).cookies.get({ domain: '.douyin.com' });
      return cookies.some((cookie) => /^(sessionid|sessionid_ss)$/.test(cookie.name) && cookie.value);
    } catch { return null; }
  }

  function openLogin(requestedPlatform) {
    const platform = normalizePlatform(requestedPlatform);
    const existing = loginWindows.get(platform);
    if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
    const win = createWindow(platform, `登录${PLATFORMS[platform].name}`, 900, 760);
    loginWindows.set(platform, win);
    guardNavigation(win, platform);
    let publishing = false;
    const publish = async () => {
      if (publishing || win.isDestroyed()) return;
      publishing = true;
      try {
        const value = await loginStatus(platform);
        if (!win.isDestroyed()) onLoginStatus({ platform, ...(value && typeof value === 'object' ? value : { loggedIn: value }) });
      } finally { publishing = false; }
    };
    win.webContents.on('did-finish-load', publish);
    const timer = setInterval(publish, 2000); // 扫码登录无需整页跳转。
    win.on('closed', () => { clearInterval(timer); loginWindows.delete(platform); authAt = 0; });
    win.loadURL(PLATFORMS[platform].home).catch(() => {});
  }

  function stop() {
    if (authProbe) authProbe();
    for (const win of loginWindows.values()) if (!win.isDestroyed()) win.close();
  }
  return { openSearch, closeSearch, openDetail, closeDetail, openLogin, loginStatus, reportSearchAuth, stop };
}

module.exports = { createPlatformWindows };
