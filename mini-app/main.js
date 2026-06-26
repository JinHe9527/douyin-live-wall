'use strict';

// 全新极简多宫格抖音直播墙。
// 设计目标：打开就看到画面、绝不撞验证码、不要登录墙。
// 技术：抖音 web/enter 接口取 flv 拉流 → 单 renderer 里每格一个 <video> + mpegts.js 直接播。
// 复用主 app 的 persist:douyin 登录态（同一 userData），解析更稳、不触发验证码。

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, session, ipcMain } = require('electron');
const { resolveStream } = require('../lib/douyin-stream');

// 复用主 app 的 userData（含 persist:douyin 登录态）。两 app 不同时跑即可。

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CDN_HOST_RE = /(\.douyincdn\.com|\.douyin\.com|\.amemv\.com|\.bytedance\.|\.bytecdn\.|pull-)/i;

let mainWin = null;
let resolverWin = null;
let resolverReady = false;

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
async function ensureResolver(douyinSession) {
  if (resolverWin && !resolverWin.isDestroyed() && resolverReady) return;
  resolverWin = new BrowserWindow({
    show: false,
    webPreferences: { session: douyinSession, offscreen: false },
  });
  resolverWin.webContents.setUserAgent(DESKTOP_UA);
  await waitLoad(resolverWin, 'https://live.douyin.com/');
  await new Promise((r) => setTimeout(r, 1200));
  resolverReady = true;
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
    webPreferences: {
      session: douyinSession,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.loadFile(path.join(__dirname, 'grid.html'));

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

app.whenReady().then(createWindow).catch((e) => console.error('[mini] startup', e));

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
