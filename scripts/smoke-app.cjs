'use strict';

// 在临时空账号配置中启动实际直播墙，验证未登录播放和点击刷新后的持续解码。
// --saved xiaohongshu 宇宙FLY,宇宙-K：只读复制指定已保存房间，不复制 Cookie。
const electron = require('electron');
if (typeof electron === 'string') {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename, ...process.argv.slice(2)],
    { env, windowsHide: true, stdio: 'inherit' });
  child.on('exit', code => process.exit(code ?? 1));
} else {
  const { app } = electron;
  const fs = require('node:fs');
  const path = require('node:path');
  const saved = process.argv[2] === '--saved';
  const platform = process.argv[saved ? 3 : 2] === 'xiaohongshu' ? 'xiaohongshu' : 'douyin';
  const input = process.argv[3] || 'https://live.douyin.com/6300864795';
  let library = [{ id: 'smoke', name: '游客播放验证', url: input, kind: 'live' }];
  if (saved) {
    const source = path.join(app.getPath('appData'), 'douyin-live-wall', 'mini_rooms.json');
    const config = JSON.parse(fs.readFileSync(source, 'utf8'));
    const names = (process.argv[4] || '').split(',').filter(Boolean);
    library = config.profiles[platform].library.filter(room => !names.length || names.includes(room.name));
    if (!library.length || (names.length && names.length !== library.length)) throw new Error('保存的房间名称未全部匹配');
  }
  const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'live-wall-app-smoke-'));
  app.setPath('userData', dir);
  fs.writeFileSync(path.join(dir, 'mini_rooms.json'), JSON.stringify({ activePlatform: platform, profiles: {
    [platform]: { library, wall: library.map(room => room.id),
      globalQuality: 'fluent', autoRecording: { enabled: false, roomIds: [] } },
  } }));
  process.argv.push('--diagnostic-hidden');
  let main, timer, previousTimes = new Map(), last = null, refreshed = false;
  const deadline = setTimeout(() => {
    console.log(JSON.stringify({ platform, decoded: false, refreshed, last })); app.exit(2);
  }, 90000);
  app.whenReady().then(async () => {
    const { PLATFORMS } = require('../lib/live-platform');
    const cookies = await electron.session.fromPartition(PLATFORMS[platform].partition).cookies.get({});
    console.log(JSON.stringify({ platform, savedRooms: library.map(room => room.name), initialAccountCookies: cookies.length }));
    if (cookies.length) app.exit(3);
  });
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', () => {
      if (!win.webContents.getURL().endsWith('/mini-app/grid.html') || main) return;
      main = win;
      const poll = async () => {
        try {
          last = await win.webContents.executeJavaScript(`(() => {
            return { videos: [...document.querySelectorAll('video')].map(v => ({
              id: v.closest('.cell')?.dataset.id,
              ready: v.readyState, width: v.videoWidth, height: v.videoHeight,
              time: v.currentTime, frames: v.getVideoPlaybackQuality?.().totalVideoFrames,
              state: v.closest('.cell')?.querySelector('.cell-status')?.dataset.state,
              restarted: globalThis.__smokePlayers ?
                players.get(v.closest('.cell')?.dataset.id)?.player !== globalThis.__smokePlayers.get(v.closest('.cell')?.dataset.id) : false,
              status: v.closest('.cell')?.querySelector('.cell-status')?.textContent })),
              login: document.getElementById('login-status-text')?.textContent,
              refreshing: document.getElementById('btn-refresh-all')?.disabled };
          })()`);
          const progressing = last.videos.length === library.length && !last.refreshing && last.videos.every(v =>
            v.width > 0 && v.frames > 0 && v.state === 'live' && (!refreshed || v.restarted)
              && previousTimes.has(v.id) && v.time > previousTimes.get(v.id) + 0.5);
          if (progressing) {
            console.log(JSON.stringify({ platform, decoded: true, phase: refreshed ? 'after-refresh' : 'before-refresh', ...last }));
            if (refreshed) {
              clearTimeout(deadline); clearTimeout(timer);
              app.exit(0); return;
            }
            await win.webContents.executeJavaScript("globalThis.__smokePlayers = new Map([...players].map(([id, p]) => [id, p.player])); document.getElementById('btn-refresh-all').click()");
            refreshed = true;
            previousTimes.clear();
          } else {
            previousTimes = new Map(last.videos.map(v => [v.id, v.time || 0]));
          }
        } catch {}
        timer = setTimeout(poll, 1500);
      };
      poll();
    });
  });
  require('../mini-app/main');
}
