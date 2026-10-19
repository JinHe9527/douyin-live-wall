'use strict';

// node scripts/smoke-guest.cjs [--saved | <platform> <直播链接>]
// 独立 Electron 进程、全新内存会话；只输出结果摘要，不输出 Cookie 或签名流地址。
const electron = require('electron');
if (typeof electron === 'string') {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename, ...process.argv.slice(2)],
    { env, windowsHide: true, stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 1));
} else {
  const { app, BrowserWindow, session } = electron;
  const fs = require('node:fs');
  const path = require('node:path');
  // 避免并行验证或用户正在运行的软件占用同一个 Chromium 数据目录。
  app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'live-wall-guest-smoke-')));
  const { createDouyinResolver } = require('../lib/douyin-resolver');
  const { resolveWithDesktop, readGuestDesktopState } = require('../lib/xiaohongshu-stream');
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  app.on('window-all-closed', () => {});
  console.log('Starting isolated guest check');
  const deadline = setTimeout(() => { console.error('Guest smoke timeout'); app.exit(1); }, 180000);
  app.whenReady().then(async () => {
    console.log('Guest runtime ready');
    const keeper = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
    await keeper.loadURL('about:blank');
    let rooms;
    if (process.argv.includes('--saved')) {
      const store = JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), 'douyin-live-wall', 'mini_rooms.json'), 'utf8'));
      rooms = Object.entries(store.profiles).flatMap(([platform, profile]) =>
        (profile.library || []).slice(0, 3).map(room => ({ platform, input: room.url, name: room.name })));
    } else {
      rooms = [{ platform: process.argv[2] || 'douyin', input: process.argv[3] || '6300864795' }];
    }
    const blocked = new Set();
    const prepareWindow = win => {
      blocked.add(win.webContents.id);
      win.once('closed', () => blocked.delete(win.webContents.id));
    };
    const sessions = Object.fromEntries(['douyin', 'xiaohongshu'].map(platform => {
      const sess = session.fromPartition(`smoke-guest:${platform}:${Date.now()}`);
      sess.setUserAgent(userAgent);
      sess.webRequest.onBeforeRequest((details, cb) => cb({ cancel: blocked.has(details.webContentsId)
        && (details.resourceType === 'media' || /\.(flv|m3u8|mp4)(\?|$)/i.test(details.url)) }));
      return [platform, sess];
    }));
    const resolver = createDouyinResolver({ BrowserWindow, getSession: () => sessions.douyin, userAgent, prepareWindow });
    let live = 0;
    try {
      for (const room of rooms) {
        console.log(`Resolving ${room.platform}`);
        const sess = sessions[room.platform];
        const before = await sess.cookies.get({});
        const fetchPage = (url, init) => sess.fetch(url, init);
        const result = room.platform === 'douyin' ? await resolver.resolve(room.input, 'fluent')
          : await resolveWithDesktop(fetchPage, url => readGuestDesktopState(fetchPage, url, userAgent), room.input,
            { quality: process.argv.includes('--origin') ? 'origin' : 'fluent', preferShare: true });
        let flv = false, http = null;
        console.log(`Stream resolution: ${result.status}`);
        if (result.ok) {
          for (const candidate of (result.flvCandidates || [{ url: result.flvUrl }]).slice(0, 3)) {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 10000);
            try {
              const res = await sess.fetch(candidate.url, { signal: ctrl.signal, headers: {
                Referer: room.platform === 'douyin' ? 'https://live.douyin.com/' : 'https://www.xiaohongshu.com/',
                'User-Agent': userAgent,
              } });
              http = res.status;
              console.log(`Stream HTTP: ${http}`);
              const stream = res.body.getReader();
              const bytes = [];
              while (bytes.length < 3) {
                const next = await stream.read();
                if (next.done) break;
                bytes.push(...next.value.subarray(0, 3 - bytes.length));
              }
              flv = res.ok && Buffer.from(bytes).toString() === 'FLV';
              ctrl.abort();
              stream.cancel().catch(() => {});
              if (flv) break;
            } catch {} finally { clearTimeout(timeout); ctrl.abort(); }
          }
        }
        if (flv) live++;
        console.log(JSON.stringify({ platform: room.platform, name: room.name || result.anchorName,
          initialCookieCount: before.length, ok: result.ok, status: result.status, via: result.via,
          http, flv, message: result.message || result.reason }));
      }
    } finally {
      console.log('Stopping guest readers');
      resolver.stop(); clearTimeout(deadline);
      console.log('Guest readers stopped');
    }
    app.exit(live ? 0 : 2);
  }).catch(error => { console.error(error.message); app.exit(1); });
}
