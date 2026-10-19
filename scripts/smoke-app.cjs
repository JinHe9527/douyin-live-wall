'use strict';

// 在临时空配置中启动实际直播墙，验证未登录状态下视频持续解码。
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
  const platform = process.argv[2] === 'xiaohongshu' ? 'xiaohongshu' : 'douyin';
  const input = process.argv[3] || 'https://live.douyin.com/6300864795';
  const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'live-wall-app-smoke-'));
  app.setPath('userData', dir);
  fs.writeFileSync(path.join(dir, 'mini_rooms.json'), JSON.stringify({ activePlatform: platform, profiles: {
    [platform]: { library: [{ id: 'smoke', name: '游客播放验证', url: input, kind: 'live' }],
      wall: ['smoke'], globalQuality: 'fluent', autoRecording: { enabled: false, roomIds: [] } },
  } }));
  process.argv.push('--diagnostic-hidden');
  let main, timer, previousTime = null, last = null;
  const deadline = setTimeout(() => {
    console.log(JSON.stringify({ platform, decoded: false, last })); app.exit(2);
  }, 60000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', () => {
      if (!win.webContents.getURL().endsWith('/mini-app/grid.html') || main) return;
      main = win;
      const poll = async () => {
        try {
          last = await win.webContents.executeJavaScript(`(() => {
            const v = document.querySelector('video');
            return { ready: v?.readyState, width: v?.videoWidth, height: v?.videoHeight,
              time: v?.currentTime, frames: v?.getVideoPlaybackQuality?.().totalVideoFrames,
              login: document.getElementById('login-status-text')?.textContent,
              status: document.querySelector('.cell-status')?.textContent };
          })()`);
          if (last.width > 0 && last.frames > 0 && previousTime !== null && last.time > previousTime + 0.5) {
            clearTimeout(deadline); clearTimeout(timer);
            console.log(JSON.stringify({ platform, decoded: true, ...last }));
            app.exit(0); return;
          }
          previousTime = last.time || 0;
        } catch {}
        timer = setTimeout(poll, 1500);
      };
      poll();
    });
  });
  require('../mini-app/main');
}
