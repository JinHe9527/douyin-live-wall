'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mini', {
  resolve: (room, quality, options = {}) => ipcRenderer.invoke('mini-resolve', { room, quality, options }),
  loadRooms: () => ipcRenderer.invoke('mini-load-rooms'),
  saveRooms: (data) => ipcRenderer.invoke('mini-save-rooms', data),
  setPlatform: (platform) => ipcRenderer.send('mini-platform', platform),
  search: (keyword, platform) => ipcRenderer.invoke('mini-search', { keyword, platform }),
  cancelSearch: () => ipcRenderer.send('mini-search-cancel'),
  watchAudience: (platform, rooms) => ipcRenderer.send('mini-watch-audience', { platform, rooms }),
  onAudience: (cb) => ipcRenderer.on('mini-audience', (_e, payload) => cb(payload)),
  onRoomSelected: (cb) => ipcRenderer.on('mini-room-selected', (_e, payload) => cb(payload)),
  setAutoRecordingConfig: (payload) => ipcRenderer.send('mini-auto-recording-config', payload),
  onRecordingStatus: (cb) => ipcRenderer.on('recording-status', (_e, payload) => cb(payload)),
  // 信息模式：上报开关 + 在墙已解析 webRid 列表
  setInfoMode: (on, rids) => ipcRenderer.send('mini-info-mode', { on, rids }),
  // 攒批弹幕：一包里含多个房间 { rid: items[] }，渲染层自行分发
  onDanmuBatch: (cb) => ipcRenderer.on('danmu-batch', (_e, map) => cb(map)),
  openDetail: (rid, title, platform, url) => ipcRenderer.send('open-detail', { rid, title, platform, url }),
  closeDetail: () => ipcRenderer.send('close-detail'),
  openLogin: (platform) => ipcRenderer.send('open-login', platform),
  getLoginStatus: (platform) => ipcRenderer.invoke('login-status', platform),
  onLoginStatus: (cb) => ipcRenderer.on('login-status', (_e, ok) => cb(ok)),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
});
