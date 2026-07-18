'use strict';

// 全新极简多宫格抖音直播墙。
// 设计目标：打开就看到画面、绝不撞验证码、不要登录墙。
// 技术：抖音 web/enter 接口取 flv 拉流 → 单 renderer 里每格一个 <video> + mpegts.js 直接播。
// 复用主 app 的 persist:douyin 登录态（同一 userData），解析更稳、不触发验证码。

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, WebContentsView, session, ipcMain, dialog, shell, net, Menu } = require('electron');
const { resolveStream } = require('../lib/douyin-stream');

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

// —— 隐藏工作窗口的省资源核心 —— //
// resolver/nav/danmuHub 都常驻 live.douyin.com（首页会自动播直播）：不拦的话每个隐藏窗口
// 都在白白解码一路视频 + 持续吃带宽，弱机被这几路"看不见的直播"拖卡。
// 按 webContentsId 精准拦掉这些窗口的媒体请求（主窗口拉流/详情窗真实页完全不受影响）。
const mediaBlockedWC = new Set();
function blockMediaIn(win) {
  if (win && !win.isDestroyed()) mediaBlockedWC.add(win.webContents.id);
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
    blockMediaIn(resolverWin); // 隐藏页不准拉视频流（省一路解码+带宽）
    await waitLoad(resolverWin, 'https://live.douyin.com/');
    await new Promise((r) => setTimeout(r, 1200));
    keepMediaPaused(resolverWin);
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
  blockMediaIn(navWin); // 导航页只要 DOM/接口，不准拉视频流
  navWin.webContents.on('did-finish-load', () => keepMediaPaused(navWin)); // 每次导航后都补一针
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
    setTimeout(() => checkForUpdate(false), 8000);
    setInterval(() => checkForUpdate(false), 6 * 3600 * 1000);
  }).catch((e) => console.error('[mini] startup', e));
}

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
