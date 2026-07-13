'use strict';

// 全新极简多宫格抖音直播墙。
// 设计目标：打开就看到画面、绝不撞验证码、不要登录墙。
// 技术：抖音 web/enter 接口取 flv 拉流 → 单 renderer 里每格一个 <video> + mpegts.js 直接播。
// 复用主 app 的 persist:douyin 登录态（同一 userData），解析更稳、不触发验证码。

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, shell, net } = require('electron');
const { resolveStream } = require('../lib/douyin-stream');

// 复用主 app 的 userData（含 persist:douyin 登录态）。两 app 不同时跑即可。

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// 手机 UA：详情窗口用，拿到和手机抖音一致的竖版完整直播界面（礼物/榜单/目标/评论全有）
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

const CDN_HOST_RE = /(\.douyincdn\.com|\.douyin\.com|\.amemv\.com|\.bytedance\.|\.bytecdn\.|pull-)/i;

let mainWin = null;
let resolverWin = null;
let resolverReady = null; // Promise：并发调用共享同一次建窗，避免开机 8 路并发各建一窗漏窗

function roomsStorePath() {
  return path.join(app.getPath('userData'), 'mini_rooms.json');
}
function loadRooms() {
  try {
    return JSON.parse(fs.readFileSync(roomsStorePath(), 'utf-8'));
  } catch {
    return { rooms: [], layout: 4 };
  }
}
function saveRooms(data) {
  try {
    fs.writeFileSync(roomsStorePath(), JSON.stringify(data || { rooms: [] }, null, 2), 'utf-8');
  } catch (e) {
    console.error('[mini] saveRooms failed', e);
  }
}

// CDN flv 跨域：给 CDN 的 flv 请求补 Referer + 放开 CORS，让 renderer 能 fetch 播放。
function installCdnHeaderRewrite(sess) {
  sess.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = details.requestHeaders;
    if (CDN_HOST_RE.test(details.url) && /\.flv|\.m3u8|\.ts(\?|$)/i.test(details.url)) {
      headers['Referer'] = 'https://live.douyin.com/';
      headers['Origin'] = 'https://live.douyin.com';
      headers['User-Agent'] = DESKTOP_UA;
    }
    cb({ requestHeaders: headers });
  });
  sess.webRequest.onHeadersReceived((details, cb) => {
    if (CDN_HOST_RE.test(details.url)) {
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      cb({ responseHeaders });
    } else {
      cb({});
    }
  });
}

function waitLoad(win, url, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    win.webContents.once('did-stop-loading', finish);
    win.webContents.loadURL(url).catch(finish);
    setTimeout(finish, timeoutMs);
  });
}

// 常驻隐藏解析页：停在 live.douyin.com（带 persist:douyin 登录），供 resolveStream 用。
// 并发安全：用 promise 记忆化，开机多路 resolve 同时调用只会建 1 个窗口（同 ensureDanmuHub 写法）。
function ensureResolver(douyinSession) {
  if (resolverReady && resolverWin && !resolverWin.isDestroyed()) return resolverReady;
  resolverReady = (async () => {
    resolverWin = new BrowserWindow({
      show: false,
      webPreferences: { session: douyinSession, offscreen: false },
    });
    resolverWin.webContents.setUserAgent(DESKTOP_UA);
    // 常驻停在 live.douyin.com 首页，首页会自动播推荐直播间且带声 → 必须静音，否则漏「别的直播间」的音
    resolverWin.webContents.setAudioMuted(true);
    await waitLoad(resolverWin, 'https://live.douyin.com/');
    await new Promise((r) => setTimeout(r, 1200));
  })();
  return resolverReady;
}

function resolverRunJs(code) {
  return resolverWin.webContents.executeJavaScript(code, true);
}

// 独立「导航页」：主页解析/兜底抓取会导航离开 live 首页，单独开一页，
// 不污染常驻页（常驻页保持在 live 首页，供 web/enter 接口并行 fetch）。
let navWin = null;
async function ensureNav(douyinSession) {
  if (navWin && !navWin.isDestroyed()) return;
  navWin = new BrowserWindow({
    show: false,
    webPreferences: { session: douyinSession, offscreen: false },
  });
  navWin.webContents.setUserAgent(DESKTOP_UA);
  // 兜底解析会导航到直播间页（自动播放带声）→ 同样静音，纯解析窗口不出声
  navWin.webContents.setAudioMuted(true);
  await waitLoad(navWin, 'about:blank', 3000);
}

// 导航页串行锁：导航会整页跳转，并发会互相打架，必须排队。
let navChain = Promise.resolve();
function withNav(fn) {
  const run = navChain.then(async () => {
    await ensureNav(session.fromPartition('persist:douyin'));
    const navigate = (url) => waitLoad(navWin, url);
    const navRunJs = (code) => navWin.webContents.executeJavaScript(code, true);
    return fn(navigate, navRunJs);
  });
  navChain = run.catch(() => {});
  return run;
}

// 解析上下文：API 走常驻页（并行），导航走串行导航页。
function makeCtx() {
  return { apiRunJs: resolverRunJs, withNav };
}

async function createWindow() {
  const douyinSession = session.fromPartition('persist:douyin');
  installCdnHeaderRewrite(douyinSession);
  douyinSession.setUserAgent(DESKTOP_UA);

  mainWin = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0b0d12',
    title: '抖音多宫格直播墙',
    // 隐藏系统标题栏、保留红绿灯：工具栏顶到最上一行，省出一整行给画面
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      session: douyinSession,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.loadFile(path.join(__dirname, 'grid.html'));
  // 关主窗口 = 退出整个 app（连同隐藏的解析页一起关，进程干净退出）
  // 否则隐藏页残留会挡住 window-all-closed，导致二次打开被单实例锁挡在外面
  mainWin.on('closed', () => { try { app.quit(); } catch { /* ignore */ } });

  await ensureResolver(douyinSession);
}

// —— IPC —— //

// 解析一个直播间链接/号 → flv（API 并行，导航串行）
ipcMain.handle('mini-resolve', async (_evt, { room, quality }) => {
  try {
    await ensureResolver(session.fromPartition('persist:douyin'));
    return await resolveStream(makeCtx(), room, { quality: quality || 'hd' });
  } catch (e) {
    return { ok: false, status: 'unknown', reason: `main-throw:${e && e.message}` };
  }
});

ipcMain.handle('mini-load-rooms', () => loadRooms());
ipcMain.handle('mini-save-rooms', (_evt, data) => { saveRooms(data); return { ok: true }; });

// —— 信息模式：弹幕 WS 直连（一个 danmuHub 页扛多路） —— //
// 在 live.douyin.com 首页（含 byted_acrawler 可算签名）里注入 danmu-bundle，
// 一个轻页面同时连多个房间的弹幕 WS + protobuf 解码，console 通道把消息转发给主窗口。
const DANMU_BUNDLE = fs.readFileSync(path.join(__dirname, '..', 'lib', 'vendor', 'danmu-bundle.js'), 'utf-8');

let danmuHub = null;
let danmuHubReady = null;
let infoMode = false;
let infoRids = [];
const connectedRids = new Set();

function ensureDanmuHub() {
  if (danmuHubReady) return danmuHubReady;
  danmuHubReady = (async () => {
    const ses = session.fromPartition('persist:douyin');
    danmuHub = new BrowserWindow({ show: false, webPreferences: { session: ses } });
    danmuHub.webContents.setUserAgent(DESKTOP_UA);
    danmuHub.webContents.setAudioMuted(true);
    danmuHub.webContents.on('console-message', (_e, _l, message) => {
      if (!message.startsWith('DM::')) return;
      const i1 = message.indexOf('::', 4);
      if (i1 < 0) return;
      const rid = message.slice(4, i1);
      let items;
      try { items = JSON.parse(message.slice(i1 + 2)); } catch { return; }
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('danmu', { rid, items });
    });
    await waitLoad(danmuHub, 'https://live.douyin.com/');
    // 等 byted_acrawler 就绪（签名需要）
    for (let i = 0; i < 24; i++) {
      const ok = await danmuHub.webContents
        .executeJavaScript('!!(window.byted_acrawler && window.byted_acrawler.frontierSign)')
        .catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await danmuHub.webContents.executeJavaScript(DANMU_BUNDLE).catch(() => {});
    await danmuHub.webContents.executeJavaScript(
      "window.__dyEmit=function(id,items){console.log('DM::'+id+'::'+JSON.stringify(items));};window.__dyStatus=function(){};true;"
    ).catch(() => {});
  })();
  return danmuHubReady;
}

async function dyConnect(rid) {
  if (!rid || connectedRids.has(rid)) return;
  connectedRids.add(rid);
  await ensureDanmuHub();
  if (danmuHub && !danmuHub.isDestroyed()) {
    danmuHub.webContents
      .executeJavaScript(`window.__dyConnect&&window.__dyConnect(${JSON.stringify(rid)},${JSON.stringify(rid)})`)
      .catch(() => {});
  }
}

function dyDisconnect(rid) {
  if (!connectedRids.has(rid)) return;
  connectedRids.delete(rid);
  if (danmuHub && !danmuHub.isDestroyed()) {
    danmuHub.webContents
      .executeJavaScript(`window.__dyDisconnect&&window.__dyDisconnect(${JSON.stringify(rid)})`)
      .catch(() => {});
  }
}

async function reconcileDanmu() {
  const want = new Set(infoMode ? infoRids : []);
  for (const rid of [...connectedRids]) if (!want.has(rid)) dyDisconnect(rid);
  if (infoMode) {
    await ensureDanmuHub();
    for (const rid of want) dyConnect(rid);
  }
}

// renderer 告知：信息模式开关 + 当前在墙、已解析的 webRid 列表
ipcMain.on('mini-info-mode', (_evt, { on, rids }) => {
  infoMode = !!on;
  infoRids = Array.isArray(rids) ? rids.filter(Boolean) : [];
  reconcileDanmu();
});

// —— 双击详情：独立浮窗显示手机版真实直播间（不遮挡网格，别的间照常看，限 1 个） —— //
const blockAppScheme = (url) => /^(bytedance|snssdk|aweme|sslocal|bdscheme|zhihu):/i.test(url || '');

let detailWin = null;
let detailRid = '';

ipcMain.on('open-detail', (_evt, { rid, title }) => {
  if (!rid) return;
  // 已有详情窗 → 同一个只聚焦不刷新；不同则换房（限 1 个）
  if (detailWin && !detailWin.isDestroyed()) {
    detailWin.show();
    detailWin.focus();
    if (detailRid !== String(rid)) {
      detailRid = String(rid);
      detailWin.setTitle(title || `直播间 ${rid}`);
      detailWin.webContents.loadURL(`https://live.douyin.com/${rid}`);
    }
    return;
  }
  detailRid = String(rid);
  detailWin = new BrowserWindow({
    width: 440,
    height: 900,
    title: title || `直播间 ${rid}`,
    backgroundColor: '#000',
    webPreferences: {
      session: session.fromPartition('persist:douyin'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 手机版 UA：竖版手机直播界面（礼物/榜单/目标全有）
  detailWin.webContents.setUserAgent(MOBILE_UA);
  detailWin.webContents.setWindowOpenHandler(({ url }) => {
    if (!blockAppScheme(url) && /douyin\.com/.test(url)) detailWin.webContents.loadURL(url);
    return { action: 'deny' };
  });
  detailWin.webContents.on('will-navigate', (e, url) => { if (blockAppScheme(url)) e.preventDefault(); });
  detailWin.loadURL(`https://live.douyin.com/${rid}`);
  detailWin.on('closed', () => { detailWin = null; detailRid = ''; });
});

ipcMain.on('close-detail', () => {
  if (detailWin && !detailWin.isDestroyed()) detailWin.close();
});

// —— 扫码登录抖音（登录后真实页可看原画 + 发言；登录态存 persist:douyin） —— //
async function isLoggedIn() {
  try {
    const ses = session.fromPartition('persist:douyin');
    const cookies = await ses.cookies.get({ domain: '.douyin.com' });
    return cookies.some((c) => /^(sessionid|sessionid_ss)$/i.test(c.name) && c.value);
  } catch { return false; }
}
function pushLoginStatus() {
  isLoggedIn().then((ok) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('login-status', ok);
  });
}
ipcMain.handle('login-status', () => isLoggedIn());

let loginWin = null;
ipcMain.on('open-login', () => {
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }
  loginWin = new BrowserWindow({
    width: 520,
    height: 720,
    title: '扫码登录抖音',
    backgroundColor: '#fff',
    webPreferences: {
      session: session.fromPartition('persist:douyin'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  loginWin.webContents.setUserAgent(DESKTOP_UA);
  loginWin.webContents.setWindowOpenHandler(({ url }) => {
    if (!blockAppScheme(url) && /douyin\.com/.test(url)) loginWin.webContents.loadURL(url);
    return { action: 'deny' };
  });
  loginWin.webContents.on('will-navigate', (e, url) => { if (blockAppScheme(url)) e.preventDefault(); });
  // 登录成功后页面会跳转/刷新，借此回推登录状态
  loginWin.webContents.on('did-navigate', () => pushLoginStatus());
  loginWin.webContents.on('did-frame-navigate', () => pushLoginStatus());
  loginWin.loadURL('https://www.douyin.com/');
  loginWin.on('closed', () => { loginWin = null; pushLoginStatus(); });
});

// —— 自动更新 —— //
// Windows：electron-updater 全自动（后台下载→提示重启装好，未签名也能用）。
// Mac：未签名无法走 Squirrel 静默更新，改为查 GitHub 最新版→应用内提示→一键打开下载页。
const UPDATE_OWNER = 'JinHe9527';
const UPDATE_REPO = 'douyin-live-wall'; // 公开发布仓库（安装包所在）
const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`;

function cmpVer(a, b) { // a>b → 正数
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
function infoBox(message, detail) {
  if (mainWin && !mainWin.isDestroyed()) dialog.showMessageBox(mainWin, { type: 'info', message, detail, buttons: ['好'] });
}
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, headers: { Accept: 'application/vnd.github+json', 'User-Agent': UPDATE_REPO } });
    let data = '';
    req.on('response', (res) => {
      if (res.statusCode >= 300) { reject(new Error('http ' + res.statusCode)); req.abort(); return; }
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

let winUpdWired = false;
function checkWinUpdate(manual) {
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { if (manual) infoBox('检查更新失败', '更新组件未就绪'); return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  checkWinUpdate._manual = manual;
  if (!winUpdWired) {
    winUpdWired = true;
    autoUpdater.on('update-not-available', () => { if (checkWinUpdate._manual) infoBox('已是最新版本', `当前 v${app.getVersion()}`); });
    autoUpdater.on('error', () => { if (checkWinUpdate._manual) infoBox('检查更新失败', '请稍后再试或手动到发布页下载'); });
    autoUpdater.on('update-downloaded', async (info) => {
      const r = await dialog.showMessageBox(mainWin, {
        type: 'info', defaultId: 0, cancelId: 1, buttons: ['立即重启更新', '稍后'],
        message: `新版本 v${info && info.version} 已下载完成`,
        detail: '点「立即重启」马上装好新版；选「稍后」则下次退出时自动更新。',
      });
      if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall());
    });
  }
  autoUpdater.checkForUpdates().catch(() => { if (manual) infoBox('检查更新失败', '请检查网络后重试'); });
}

async function checkMacUpdate(manual) {
  try {
    const j = await fetchJson(`https://api.github.com/repos/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest`);
    const latest = String((j && j.tag_name) || '').replace(/^v/, '');
    const cur = app.getVersion();
    if (latest && cmpVer(latest, cur) > 0) {
      const r = await dialog.showMessageBox(mainWin, {
        type: 'info', defaultId: 0, cancelId: 1, buttons: ['前往下载', '稍后'],
        message: `发现新版本 v${latest}`,
        detail: `当前 v${cur}。点「前往下载」获取最新安装包，下载后覆盖安装即可（设置会保留）。`,
      });
      if (r.response === 0) shell.openExternal((j && j.html_url) || UPDATE_RELEASES_URL);
    } else if (manual) {
      infoBox('已是最新版本', `当前 v${cur}`);
    }
  } catch { if (manual) infoBox('检查更新失败', '请检查网络后重试'); }
}

function checkForUpdate(manual) {
  if (!app.isPackaged) { if (manual) infoBox('开发环境不检查更新', '打包后的正式版才会自动更新'); return; }
  if (process.platform === 'win32') checkWinUpdate(manual);
  else checkMacUpdate(manual);
}
ipcMain.handle('check-update', () => { checkForUpdate(true); return { ok: true }; });

// 单实例锁：防止重复启动多个 app 抢资源导致卡顿
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    } else {
      // 主窗口已关但进程还在 → 兜底重建，避免"点了没反应/进不去"
      createWindow();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    // 启动稳定后自动查一次，之后每 6 小时查一次（有新版就提示，不用你手动重下）
    setTimeout(() => checkForUpdate(false), 8000);
    setInterval(() => checkForUpdate(false), 6 * 3600 * 1000);
  }).catch((e) => console.error('[mini] startup', e));
}

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
