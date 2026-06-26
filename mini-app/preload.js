'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mini', {
  resolve: (room, quality) => ipcRenderer.invoke('mini-resolve', { room, quality }),
  loadRooms: () => ipcRenderer.invoke('mini-load-rooms'),
  saveRooms: (data) => ipcRenderer.invoke('mini-save-rooms', data),
});
