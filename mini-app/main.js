'use strict';

// 多平台直播墙：按平台解析 FLV 直播流，在单 renderer 中播放并独立管理录制。

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, shell, net, Menu } = require('electron');
const { resolveStream } = require('../lib/douyin-stream');
const xiaohongshuStream = require('../lib/xiaohongshu-stream');
const { PLATFORMS, normalizePlatform, roomUrl } = require('../lib/live-platform');
const { createPlatformWindows } = require('../lib/platform-windows');
const { createRoomSearch } = require('../lib/room-search');
const { createAudienceMonitor } = require('../lib/xiaohongshu-audience');
const { createAutoRecorder, createElectronStreamOpener } = require('../lib/auto-recorder');
const { buildRecordingFilePath } = require('../lib/recording-settings');

// 隐藏顶部原生菜单栏(File/Edit/View… 那两条)。Mac 保留系统菜单(否则复制粘贴/退出快捷键会失效)。
if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

// —— 多路视频解码性能开关（必须在 app ready 之前设置）——
// 目标：多个直播间同时解码不卡。强制开启 GPU 硬解、防止后台降帧、有硬件 HEVC 的机器可硬解原画。
app.commandLine.appendSwitch('ignore-gpu-blocklist');                 // 部分机器 GPU 被 Chromium 拉黑 → 强制启用硬件加速
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport'); // 有硬件 HEVC 解码的机器可硬解原画(bytevc1)
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // 防止窗口被判"被遮挡"而暂停/降帧解码

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
const autoRecorders = new Map();
let activePlatform = 'douyin';
const platformWindows = createPlatformWindows({
  BrowserWindow, session, userAgent: DESKTOP_UA, mobileUserAgent: MOBILE_UA,
  onRoomSelected: (payload) => {
    if (payload.platform !== activePlatform || !mainWin || mainWin.isDestroyed()) return;
    mainWin.webContents.send('mini-room-selected', payload);
    mainWin.show();
    mainWin.focus();
  },
  onLoginStatus: (payload) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('login-status', payload);
  },
});
const roomSearch = createRoomSearch({ BrowserWindow, session, userAgent: DESKTOP_UA, prepareWindow: blockMediaIn });
const audienceMonitor = createAudienceMonitor({ BrowserWindow, session, userAgent: DESKTOP_UA, prepareWindow: blockMediaIn,
  onCount: (payload) => {
    if (activePlatform === 'xiaohongshu' && mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('mini-audience', payload);
  },
});

function roomsStorePath() {
  return path.join(app.getPath('userData'), 'mini_rooms.json');
}
function loadRooms() {
  try {
    return JSON.parse(fs.readFileSync(roomsStorePath(), 'utf-8'));
  } catch {
    return null;
  }
}
function saveRooms(data) {
  try {
    fs.writeFileSync(roomsStorePath(), JSON.stringify(data || { rooms: [] }, null, 2), 'utf-8');
  } catch (e) {
    console.error('[mini] saveRooms failed', e);
    throw e;
  }
}

// —— 隐藏工作窗口的省资源核心 —— //
// resolver/nav/danmuHub 都常驻 live.douyin.com（首页会自动播直播）：不拦的话每个隐藏窗口
// 都在白白解码一路视频 + 持续吃带宽，弱机被这几路"看不见的直播"拖卡。
// 按 webContentsId 精准拦掉这些窗口的媒体请求（主窗口拉流/详情窗真实页完全不受影响）。
const mediaBlockedWC = new Set();
function blockMediaIn(win) {
  if (win && !win.isDestroyed()) {
    const id = win.webContents.id;
    mediaBlockedWC.add(id);
    win.once('closed', () => mediaBlockedWC.delete(id));
  }
}
// 兜底：把已缓冲的也停掉（网络拦了之后 decode 兜底停干净）
const PAUSE_MEDIA_JS =
  "if(!window.__pmOn){window.__pmOn=1;setInterval(()=>{try{document.querySelectorAll('video,audio').forEach(v=>{if(!v.paused)v.pause();});}catch(e){}},2000);}true;";
function keepMediaPaused(win) {
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript(PAUSE_MEDIA_JS).catch(() => {});
}

// CDN flv 跨域：给 CDN 的 flv 请求补 Referer + 放开 CORS，让 renderer 能 fetch 播放。
function installCdnHeaderRewrite(sess) {
  sess.webRequest.onBeforeRequest((details, cb) => {
    if (mediaBlockedWC.has(details.webContentsId)
      && (details.resourceType === 'media' || /\.(flv|m3u8|ts|mp4)(\?|$)/i.test(details.url))) {
      return cb({ cancel: true });
    }
    cb({});
  });
  sess.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = details.requestHeaders;
    const isXhs = /(^|\.)xhscdn\.com$/i.test(new URL(details.url).hostname);
    if ((isXhs || CDN_HOST_RE.test(details.url)) && /\.flv|\.m3u8|\.ts(\?|$)/i.test(details.url)) {
      headers['Referer'] = isXhs ? 'https://www.xiaohongshu.com/' : 'https://live.douyin.com/';
      headers['Origin'] = isXhs ? 'https://www.xiaohongshu.com' : 'https://live.douyin.com';
      headers['User-Agent'] = DESKTOP_UA;
    }
    cb({ requestHeaders: headers });
  });
  sess.webRequest.onHeadersReceived((details, cb) => {
    if (CDN_HOST_RE.test(details.url) || /(^|\.)xhscdn\.com$/i.test(new URL(details.url).hostname)) {
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

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}-timeout`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function invalidateResolver(win) {
  if (!win || resolverWin !== win) return;
  resolverWin = null;
  resolverReady = null;
  if (!win.isDestroyed()) {
    try { win.destroy(); } catch {}
  }
}

// 常驻隐藏解析页：停在 live.douyin.com（带 persist:douyin 登录），供 resolveStream 用。
// 并发安全：用 promise 记忆化，开机多路 resolve 同时调用只会建 1 个窗口（同 ensureDanmuHub 写法）。
function ensureResolver(douyinSession) {
  if (resolverReady && resolverWin && !resolverWin.isDestroyed()) return resolverReady;
  const win = new BrowserWindow({
      show: false,
      webPreferences: { session: douyinSession, offscreen: false },
  });
  resolverWin = win;
  win.once('closed', () => invalidateResolver(win));
  win.on('unresponsive', () => invalidateResolver(win));
  win.webContents.once('render-process-gone', () => invalidateResolver(win));
  resolverReady = (async () => {
    win.webContents.setUserAgent(DESKTOP_UA);
    // 常驻停在 live.douyin.com 首页，首页会自动播推荐直播间且带声 → 必须静音，否则漏「别的直播间」的音
    win.webContents.setAudioMuted(true);
    blockMediaIn(win); // 隐藏页不准拉视频流（省一路解码+带宽）
    await waitLoad(win, 'https://live.douyin.com/');
    await new Promise((r) => setTimeout(r, 1200));
    keepMediaPaused(win);
  })().catch((error) => {
    invalidateResolver(win);
    throw error;
  });
  return resolverReady;
}

function resolverRunJs(code) {
  const win = resolverWin;
  if (!win || win.isDestroyed()) return Promise.reject(new Error('resolver-unavailable'));
  return withTimeout(win.webContents.executeJavaScript(code, true), 12000, 'resolver-execute').catch((error) => {
    invalidateResolver(win);
    throw error;
  });
}

// 独立「导航页」：主页解析/兜底抓取会导航离开 live 首页，单独开一页，
// 不污染常驻页（常驻页保持在 live 首页，供 web/enter 接口并行 fetch）。
let navWin = null;
function invalidateNav(win) {
  if (!win || navWin !== win) return;
  navWin = null;
  if (!win.isDestroyed()) {
    try { win.destroy(); } catch {}
  }
}

async function ensureNav(douyinSession) {
  if (navWin && !navWin.isDestroyed()) return;
  const win = new BrowserWindow({
    show: false,
    webPreferences: { session: douyinSession, offscreen: false },
  });
  navWin = win;
  win.once('closed', () => invalidateNav(win));
  win.on('unresponsive', () => invalidateNav(win));
  win.webContents.once('render-process-gone', () => invalidateNav(win));
  win.webContents.setUserAgent(DESKTOP_UA);
  // 兜底解析会导航到直播间页（自动播放带声）→ 同样静音，纯解析窗口不出声
  win.webContents.setAudioMuted(true);
  blockMediaIn(win); // 导航页只要 DOM/接口，不准拉视频流
  win.webContents.on('did-finish-load', () => keepMediaPaused(win)); // 每次导航后都补一针
  await waitLoad(win, 'about:blank', 3000);
}

// 导航页串行锁：导航会整页跳转，并发会互相打架，必须排队。
let navChain = Promise.resolve();
function withNav(fn) {
  const run = navChain.then(async () => {
    await ensureNav(session.fromPartition('persist:douyin'));
    const win = navWin;
    const navigate = (url) => waitLoad(win, url);
    const navRunJs = (code) => withTimeout(win.webContents.executeJavaScript(code, true), 12000, 'nav-execute')
      .catch((error) => {
        invalidateNav(win);
        throw error;
      });
    return withTimeout(fn(navigate, navRunJs), 26000, 'nav-run').catch((error) => {
      invalidateNav(win);
      throw error;
    });
  });
  navChain = run.catch(() => {});
  return run;
}

// 解析上下文：API 走常驻页（并行），导航走串行导航页。
function makeCtx() {
  return { apiRunJs: resolverRunJs, withNav };
}

async function resolvePlatformStream(platform, input, quality, options = {}) {
  if (platform === 'xiaohongshu') {
    const ses = session.fromPartition(PLATFORMS.xiaohongshu.partition);
    return xiaohongshuStream.resolveStream((url, init) => ses.fetch(url, init), input, { quality });
  }
  await ensureResolver(session.fromPartition(PLATFORMS.douyin.partition));
  return resolveStream(makeCtx(), input, {
    quality,
    allowNavigationFallback: options.allowNavigationFallback !== false,
    forceNavigationFallback: Boolean(options.forceNavigationFallback),
  });
}

function ensureAutoRecorder(platform) {
  if (autoRecorders.has(platform)) return autoRecorders.get(platform);
  const autoRecorder = createAutoRecorder({
    resolveRoom: (url, quality) => resolvePlatformStream(platform, url, quality),
    openStream: createElectronStreamOpener({
      net,
      session: session.fromPartition(PLATFORMS[platform].partition),
      userAgent: DESKTOP_UA,
      referer: platform === 'xiaohongshu' ? PLATFORMS.xiaohongshu.home : 'https://live.douyin.com/',
    }),
    createOutput: (filePath) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      return fs.createWriteStream(filePath, { flags: 'wx' });
    },
    buildFilePath: (room, now) => buildRecordingFilePath(app.getPath('videos'), { ...room, platform }, now),
    onStatus: (payload) => {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('recording-status', { ...payload, platform });
    },
  });
  autoRecorders.set(platform, autoRecorder);
  autoRecorder.start();
  return autoRecorder;
}

async function createWindow() {
  const douyinSession = session.fromPartition('persist:douyin');
  installCdnHeaderRewrite(douyinSession);
  installCdnHeaderRewrite(session.fromPartition(PLATFORMS.xiaohongshu.partition));
  douyinSession.setUserAgent(DESKTOP_UA);
  session.fromPartition(PLATFORMS.xiaohongshu.partition).setUserAgent(DESKTOP_UA);

  mainWin = new BrowserWindow({
    show: !process.argv.includes('--diagnostic-hidden'),
    width: 1440,
    height: 900,
    backgroundColor: '#0b0d12',
    title: '多平台直播墙',
    // 隐藏系统标题栏、保留红绿灯：工具栏顶到最上一行，省出一整行给画面
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true, // Windows/Linux：隐藏菜单栏(File/Edit…)
    webPreferences: {
      session: douyinSession,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // 监控墙常在后台，禁止后台降频，保证画面持续流畅
    },
  });
  mainWin.setMenuBarVisibility(false);
  mainWin.loadFile(path.join(__dirname, 'grid.html'));
  // 关主窗口 = 退出整个 app（连同隐藏的解析页一起关，进程干净退出）
  // 否则隐藏页残留会挡住 window-all-closed，导致二次打开被单实例锁挡在外面
  mainWin.on('closed', () => { try { app.quit(); } catch { /* ignore */ } });

}

// —— IPC —— //

// 解析一个直播间链接/号 → flv（API 并行，导航串行）
ipcMain.handle('mini-resolve', async (_evt, { room, quality, options = {} }) => {
  try {
    return await resolvePlatformStream(normalizePlatform(options.platform), room, quality || 'hd', options);
  } catch (e) {
    return { ok: false, status: 'unknown', reason: `main-throw:${e && e.message}` };
  }
});

ipcMain.handle('mini-load-rooms', () => loadRooms());
ipcMain.handle('mini-save-rooms', (_evt, data) => { saveRooms(data); return { ok: true }; });
ipcMain.on('mini-auto-recording-config', (_evt, payload) => {
  const platform = normalizePlatform(payload && payload.platform);
  ensureAutoRecorder(platform).updateConfig(payload).catch((error) => {
    console.error('[mini] update recording config failed', error);
  });
});
ipcMain.on('mini-platform', (_evt, value) => {
  roomSearch.cancel();
  audienceMonitor.stop();
  activePlatform = normalizePlatform(value);
  platformWindows.closeSearch();
  platformWindows.closeDetail();
  if (mainWin && !mainWin.isDestroyed()) mainWin.setTitle(`${PLATFORMS[activePlatform].name}直播墙`);
});
ipcMain.handle('mini-search', (_evt, { keyword, platform }) => {
  if (normalizePlatform(platform) !== activePlatform) return { status: 'cancelled', candidates: [] };
  return roomSearch.search(keyword, platform);
});
ipcMain.on('mini-search-cancel', () => roomSearch.cancel());
ipcMain.on('mini-watch-audience', (_evt, { platform, rooms }) => {
  if (platform !== activePlatform) return;
  audienceMonitor.setRooms(platform === 'xiaohongshu' ? rooms : []);
});

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
    blockMediaIn(danmuHub); // 弹幕枢纽只要 WS+签名，不准拉视频流
    // 弹幕枢纽 → 主界面的桥。console-message 经 devtools 协议，高频下很重（8+房间比赛弹幕洪流会把弱机拖垮），
    // 所以页面内已攒批：每 ~300ms 把所有房间的弹幕合成 ONE 条 'DMB::{rid:items[]}' 发过来，这里一次解析、一次 IPC。
    danmuHub.webContents.on('console-message', (_e, _l, message) => {
      if (message.startsWith('DMB::')) {
        let map;
        try { map = JSON.parse(message.slice(5)); } catch { return; }
        if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('danmu-batch', map);
        return;
      }
      // 兼容旧 spike 脚本的逐条 DM:: 格式（正式管线已不用）
      if (!message.startsWith('DM::')) return;
      const i1 = message.indexOf('::', 4);
      if (i1 < 0) return;
      const rid = message.slice(4, i1);
      let items;
      try { items = JSON.parse(message.slice(i1 + 2)); } catch { return; }
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('danmu-batch', { [rid]: items });
    });
    await waitLoad(danmuHub, 'https://live.douyin.com/');
    keepMediaPaused(danmuHub);
    // 等 byted_acrawler 就绪（签名需要）
    for (let i = 0; i < 24; i++) {
      const ok = await danmuHub.webContents
        .executeJavaScript('!!(window.byted_acrawler && window.byted_acrawler.frontierSign)')
        .catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await danmuHub.webContents.executeJavaScript(DANMU_BUNDLE).catch(() => {});
    // 攒批发送：把每个房间的弹幕缓存起来，每 300ms 合成一包 console.log 一次，
    // 把跨进程事件数从"每秒几百条"降到"每秒 ~3 次"。每房间每批只留最近 40 条，防洪流堆积。
    await danmuHub.webContents.executeJavaScript(
      "(function(){var buf={},scheduled=false;function flush(){scheduled=false;var ks=Object.keys(buf);if(!ks.length)return;var p=buf;buf={};try{console.log('DMB::'+JSON.stringify(p));}catch(e){}}window.__dyEmit=function(id,items){if(!items||!items.length)return;var a=buf[id]||(buf[id]=[]);for(var i=0;i<items.length;i++)a.push(items[i]);if(a.length>40)buf[id]=a.slice(a.length-40);if(!scheduled){scheduled=true;setTimeout(flush,300);}};window.__dyStatus=function(){};})();true;"
    ).catch(() => {});
  })();
  return danmuHubReady;
}

async function dyConnect(rid) {
  if (!infoMode || !rid || !infoRids.includes(rid) || connectedRids.has(rid)) return;
  connectedRids.add(rid);
  await ensureDanmuHub();
  if (!infoMode || !infoRids.includes(rid) || !connectedRids.has(rid)) return;
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

// 搜索、登录和详情窗口按平台使用独立会话。
ipcMain.on('open-detail', (_evt, { rid, title, platform, url }) => {
  const selectedPlatform = normalizePlatform(platform);
  platformWindows.openDetail(url || roomUrl(rid, selectedPlatform), title, selectedPlatform);
});
ipcMain.on('close-detail', () => platformWindows.closeDetail());
ipcMain.handle('login-status', (_evt, platform) => platformWindows.loginStatus(platform));
ipcMain.on('open-login', (_evt, platform) => platformWindows.openLogin(platform));

// —— 自动更新（走国内 GitHub 加速镜像，免梯子）——
// GitHub 在国内被墙，api.github.com / github.com 直连必失败。改为：
//   1) 版本检测：拉发布里自带的 latest.yml(win)/latest-mac.yml(mac) 读 version，不碰被墙的 GitHub API；
//   2) 全程走国内加速镜像逐个兜底；Windows 静默下载安装，失败则退化为浏览器下载代理直链。
const UPDATE_OWNER = 'JinHe9527';
const UPDATE_REPO = 'douyin-live-wall'; // 公开发布仓库（安装包所在）
const GH_BASE = `https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}`;
// 国内可直连的 GitHub 加速镜像，逐个尝试；最后一个空串=直连 GitHub(有梯子/海外时)。
const GH_MIRRORS = ['https://gh-proxy.com/', 'https://ghfast.top/', 'https://ghproxy.net/', 'https://gh.llkk.cc/', ''];

function cmpVer(a, b) { // a>b → 正数
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}
function infoBox(message, detail) {
  if (mainWin && !mainWin.isDestroyed()) dialog.showMessageBox(mainWin, { type: 'info', message, detail, buttons: ['好'] });
}
// electron net 拉文本，手动跟随重定向 + 超时（不要用 redirect:'follow' 选项，实测会卡死）
function fetchText(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let done = false, redirects = 0;
    const req = net.request(url);
    req.setHeader('User-Agent', UPDATE_REPO);
    const to = setTimeout(() => { if (!done) { done = true; try { req.abort(); } catch { /* */ } reject(new Error('timeout')); } }, timeoutMs);
    let data = '';
    req.on('redirect', (_s, _m, redirectUrl) => {
      if (redirects++ < 5) { try { req.followRedirect(); } catch { /* */ } }
      else if (!done) { done = true; clearTimeout(to); try { req.abort(); } catch { /* */ } reject(new Error('too-many-redirects')); }
    });
    req.on('response', (res) => {
      if (res.statusCode >= 400) { if (!done) { done = true; clearTimeout(to); reject(new Error('http ' + res.statusCode)); } try { req.abort(); } catch { /* */ } return; }
      res.on('data', (c) => { data += c; });
      res.on('end', () => { if (!done) { done = true; clearTimeout(to); resolve(data); } });
    });
    req.on('error', (e) => { if (!done) { done = true; clearTimeout(to); reject(e); } });
    req.end();
  });
}
function parseYmlVersion(t) { const m = /(^|\n)version:\s*([0-9.]+)/.exec(t || ''); return m ? m[2].trim() : ''; }

// 逐个镜像拉 yml，第一个成功的返回 {mirror, version}
async function pickMirror(ymlName) {
  for (const m of GH_MIRRORS) {
    try {
      const ver = parseYmlVersion(await fetchText(`${m}${GH_BASE}/releases/latest/download/${ymlName}`));
      if (ver) return { mirror: m, version: ver };
    } catch { /* 换下一个镜像 */ }
  }
  return null;
}

let lastOfferedVersion = '';
// force=true（手动点「检查更新」）：绕过"同一版本只弹一次"——手动检查必须永远有反馈，
// 否则启动时自动弹过一次后，手动点就静默无反应，像坏了一样
async function offerProxiedDownload(pick, plat, force) {
  if (cmpVer(pick.version, app.getVersion()) <= 0) return;
  if (!force && lastOfferedVersion === pick.version) return; // 自动检查：同一版本本次运行只弹一次
  lastOfferedVersion = pick.version;
  const file = plat === 'win'
    ? `DouyinLiveWall-${pick.version}-win-x64.exe`
    : `DouyinLiveWall-${pick.version}-mac-${process.arch === 'x64' ? 'x64' : 'arm64'}.dmg`;
  const r = await dialog.showMessageBox(mainWin, {
    type: 'info', defaultId: 0, cancelId: 1, buttons: ['前往下载', '稍后'],
    message: `发现新版本 v${pick.version}`,
    detail: `当前 v${app.getVersion()}。点「前往下载」通过国内加速通道下载（免梯子），下载后覆盖安装即可（设置会保留）。`,
  });
  if (r.response === 0) shell.openExternal(`${pick.mirror}${GH_BASE}/releases/download/v${pick.version}/${file}`);
}

let winUpdWired = false;
async function checkWinUpdate(manual) {
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { if (manual) infoBox('检查更新失败', '更新组件未就绪'); return; }
  const pick = await pickMirror('latest.yml');
  if (!pick) { if (manual) infoBox('检查更新失败', '网络无法访问更新服务器，请稍后重试'); return; }
  checkWinUpdate._pick = pick;
  checkWinUpdate._manual = manual;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  try { autoUpdater.setFeedURL({ provider: 'generic', url: `${pick.mirror}${GH_BASE}/releases/latest/download` }); } catch { /* */ }
  if (!winUpdWired) {
    winUpdWired = true;
    autoUpdater.on('update-not-available', () => { if (checkWinUpdate._manual) infoBox('已是最新版本', `当前 v${app.getVersion()}`); });
    // 手动检查发现新版：立刻告知"正在后台下载"，否则静默下载几分钟像点了没反应
    autoUpdater.on('update-available', (info) => {
      if (checkWinUpdate._manual) infoBox(`发现新版本 v${(info && info.version) || ''}`, '正在通过国内加速通道后台下载，完成后会弹窗提示安装，请稍候（网络慢时可能需要几分钟）。');
    });
    autoUpdater.on('update-downloaded', async (info) => {
      const r = await dialog.showMessageBox(mainWin, {
        type: 'info', defaultId: 0, cancelId: 1, buttons: ['立即重启更新', '稍后'],
        message: `新版本 v${info && info.version} 已下载完成`,
        detail: '点「立即重启」马上装好新版；选「稍后」则下次退出时自动更新。',
      });
      if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall());
    });
    // 静默下载失败（多半是镜像不支持大文件断点续传）→ 退化为浏览器下载代理直链，仍免梯子
    autoUpdater.on('error', () => { if (checkWinUpdate._pick) offerProxiedDownload(checkWinUpdate._pick, 'win', checkWinUpdate._manual); });
  }
  autoUpdater.checkForUpdates().catch(() => { if (checkWinUpdate._pick) offerProxiedDownload(checkWinUpdate._pick, 'win', checkWinUpdate._manual); });
}

async function checkMacUpdate(manual) {
  const pick = await pickMirror('latest-mac.yml');
  if (!pick) { if (manual) infoBox('检查更新失败', '网络无法访问更新服务器，请稍后重试'); return; }
  if (cmpVer(pick.version, app.getVersion()) > 0) offerProxiedDownload(pick, 'mac', manual);
  else if (manual) infoBox('已是最新版本', `当前 v${app.getVersion()}`);
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
    if (!process.argv.includes('--diagnostic-hidden')) {
      setTimeout(() => checkForUpdate(false), 8000);
      setInterval(() => checkForUpdate(false), 6 * 3600 * 1000);
    }
  }).catch((e) => console.error('[mini] startup', e));
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  roomSearch.cancel();
  audienceMonitor.stop();
  for (const autoRecorder of autoRecorders.values()) autoRecorder.stop();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
