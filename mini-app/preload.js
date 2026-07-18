'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mini', {
  resolve: (room, quality) => ipcRenderer.invoke('mini-resolve', { room, quality }),
  loadRooms: () => ipcRenderer.invoke('mini-load-rooms'),
  saveRooms: (data) => ipcRenderer.invoke('mini-save-rooms', data),
  // 信息模式：上报开关 + 在墙已解析 webRid 列表
  setInfoMode: (on, rids) => ipcRenderer.send('mini-info-mode', { on, rids }),
  // 攒批弹幕：一包里含多个房间 { rid: items[] }，渲染层自行分发
  onDanmuBatch: (cb) => ipcRenderer.on('danmu-batch', (_e, map) => cb(map)),
  openDetail: (rid, title) => ipcRenderer.send('open-detail', { rid, title }),
  closeDetail: () => ipcRenderer.send('close-detail'),
  openLogin: () => ipcRenderer.send('open-login'),
  getLoginStatus: () => ipcRenderer.invoke('login-status'),
  onLoginStatus: (cb) => ipcRenderer.on('login-status', (_e, ok) => cb(ok)),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
});
