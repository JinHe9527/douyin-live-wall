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
  const sequential = saved && process.env.SMOKE_SEQUENTIAL === '1';
  let selectedIndex = 0;
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
    [platform]: { library, wall: (sequential ? library.slice(0, 1) : library).map(room => room.id),
      globalQuality: 'fluent', autoRecording: { enabled: false, roomIds: [] } },
  } }));
  process.argv.push('--diagnostic-hidden');
  let main, timer, previousTimes = new Map(), last = null, refreshed = false, lastReport = 0;
  const deadline = setTimeout(() => {
    console.log(JSON.stringify({ platform, decoded: false, refreshed, last })); app.exit(2);
  }, sequential ? library.length * 90000 : saved ? 180000 : 90000);
  app.whenReady().then(async () => {
    if (process.env.SMOKE_DIRECT_MEDIA) await electron.session.fromPartition('persist:douyin').setProxy({ mode: 'direct' });
    const { PLATFORMS } = require('../lib/live-platform');
    const cookies = await electron.session.fromPartition(PLATFORMS[platform].partition).cookies.get({});
    console.log(JSON.stringify({ platform, savedRooms: library.map(room => room.name), initialAccountCookies: cookies.length }));
    if (cookies.length) app.exit(3);
  });
  app.on('browser-window-created', (_event, win) => {
    if (process.env.SMOKE_TRACE_DIRECTORY) {
      const debug = win.webContents.debugger;
      const send = debug.sendCommand.bind(debug);
      debug.sendCommand = async (...args) => {
        const response = await send(...args);
        if (win.webContents.getURL().includes('/livelist') && args[0] === 'Runtime.evaluate') {
          if (response.exceptionDetails) console.log(JSON.stringify({ directoryError: response.exceptionDetails.exception?.description }));
          else {
            try {
              const page = JSON.parse(response.result.value);
              console.log(JSON.stringify({ directory: { ready: page.ready, loggedIn: page.loggedIn,
                error: page.error, fetching: page.fetching, count: page.candidates?.length,
                matches: page.candidates?.filter(c => library.some(r => r.anchorId === c.anchorId)).map(c => ({
                  name: c.title, id: c.id, stream: !!c.streamConfig })) } }));
            } catch {}
          }
        }
        return response;
      };
    }
    win.webContents.on('did-finish-load', () => {
      if (!win.webContents.getURL().endsWith('/mini-app/grid.html') || main) return;
      main = win;
      if (process.env.SMOKE_VISIBLE) win.show();
      if (process.env.SMOKE_TRACE_MEDIA) {
        const debug = win.webContents.debugger;
        debug.attach('1.3');
        debug.sendCommand('Network.enable');
        debug.on('message', (_event, method, params) => {
          if (method === 'Network.responseReceived' && /\.flv(?:\?|$)/i.test(params.response.url)) {
            const url = new URL(params.response.url);
            console.log(JSON.stringify({ media: url.hostname + url.pathname, status: params.response.status, protocol: params.response.protocol }));
          }
        });
      }
      const poll = async () => {
        try {
          last = await win.webContents.executeJavaScript(`(() => {
            return { videos: [...document.querySelectorAll('video')].map(v => ({
              id: v.closest('.cell')?.dataset.id,
              ready: v.readyState, width: v.videoWidth, height: v.videoHeight,
              time: v.currentTime, frames: v.getVideoPlaybackQuality?.().totalVideoFrames,
              dropped: v.getVideoPlaybackQuality?.().droppedVideoFrames,
              bufferedEnd: v.buffered.length ? v.buffered.end(v.buffered.length-1) : 0,
              speed: players.get(v.closest('.cell')?.dataset.id)?.player?.statisticsInfo?.speed,
              state: v.closest('.cell')?.querySelector('.cell-status')?.dataset.state,
              restarted: globalThis.__smokePlayers ?
                players.get(v.closest('.cell')?.dataset.id)?.player !== globalThis.__smokePlayers.get(v.closest('.cell')?.dataset.id) : false,
              status: v.closest('.cell')?.querySelector('.cell-status')?.textContent,
              reason: v.closest('.cell')?.querySelector('.cell-status')?.title })),
              login: document.getElementById('login-status-text')?.textContent,
              refreshing: document.getElementById('btn-refresh-all')?.disabled };
          })()`);
          const progressing = last.videos.length === (sequential ? 1 : library.length) && !last.refreshing && last.videos.every(v =>
            v.width > 0 && v.frames > 0 && v.state === 'live' && (!refreshed || v.restarted)
              && previousTimes.has(v.id) && v.time > previousTimes.get(v.id) + 0.5);
          if (Date.now() - lastReport > 15000) {
            lastReport = Date.now();
            console.log(JSON.stringify({ phase: 'progress', decodedCount: last.videos.filter(v => v.width > 0 && v.frames > 0).length,
              total: library.length, login: last.login,
              waiting: last.videos.filter(v=>v.state !== 'live' || v.ready < 3).map(v=>({
                name: library.find(r=>r.id===v.id)?.name, ready:v.ready, time:v.time, state:v.state, reason:v.reason,
                buffer:v.bufferedEnd, speed:v.speed, dropped:v.dropped
              })) }));
            if (process.env.SMOKE_CAPTURE) fs.writeFileSync(process.env.SMOKE_CAPTURE, (await win.webContents.capturePage()).toPNG());
          }
          if (progressing) {
            console.log(JSON.stringify({ platform, decoded: true, phase: refreshed ? 'after-refresh' : 'before-refresh', ...last }));
            if (refreshed) {
              if (sequential && selectedIndex + 1 < library.length) {
                const previous = library[selectedIndex++].id;
                const next = library[selectedIndex].id;
                await win.webContents.executeJavaScript(`takeOffWall(${JSON.stringify(previous)}); putOnWall(${JSON.stringify(next)}); globalThis.__smokePlayers = null;`);
                refreshed = false;
                previousTimes.clear();
                timer = setTimeout(poll, 1500);
                return;
              }
              if (saved) {
                const current = JSON.parse(fs.readFileSync(path.join(dir, 'mini_rooms.json'), 'utf8')).profiles[platform].library;
                const changes = library.map(room => {
                  const updated = current.find(item => item.id === room.id);
                  return { name: room.name, keptId: !!updated, anchorId: updated?.anchorId,
                    oldRoom: new URL(room.url).pathname, currentRoom: updated ? new URL(updated.url).pathname : null };
                });
                console.log(JSON.stringify({ phase: 'persisted', changes }));
                if (changes.some(room => !room.keptId)) { app.exit(4); return; }
              }
              if (process.env.SMOKE_CAPTURE) fs.writeFileSync(process.env.SMOKE_CAPTURE, (await win.webContents.capturePage()).toPNG());
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
