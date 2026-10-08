'use strict';

const { PLATFORMS, normalizePlatform, isPlatformUrl, selectedRoomUrl, searchUrl } = require('./live-platform');

function createPlatformWindows({ BrowserWindow, session, userAgent, mobileUserAgent = userAgent, onRoomSelected, onLoginStatus }) {
  let searchWindow = null;
  let detailWindow = null;
  let detailTarget = '';
  const loginWindows = new Map();

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
    // 小红书的 web_session 也用于游客，不把 Cookie 存在当作已登录。
    if (platform === 'xiaohongshu') return null;
    try {
      const cookies = await session.fromPartition(PLATFORMS[platform].partition).cookies.get({ domain: '.douyin.com' });
      return cookies.some((cookie) => /^(sessionid|sessionid_ss)$/.test(cookie.name) && cookie.value);
    } catch { return false; }
  }

  function openLogin(requestedPlatform) {
    const platform = normalizePlatform(requestedPlatform);
    const existing = loginWindows.get(platform);
    if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
    const win = createWindow(platform, `登录${PLATFORMS[platform].name}`, 900, 760);
    loginWindows.set(platform, win);
    guardNavigation(win, platform);
    const publish = async () => onLoginStatus({ platform, loggedIn: await loginStatus(platform) });
    win.webContents.on('did-navigate', publish);
    win.on('closed', () => { loginWindows.delete(platform); publish(); });
    win.loadURL(PLATFORMS[platform].home).catch(() => {});
  }

  return { openSearch, closeSearch, openDetail, closeDetail, openLogin, loginStatus };
}

module.exports = { createPlatformWindows };
