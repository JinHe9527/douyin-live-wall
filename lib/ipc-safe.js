'use strict';

const { logDiagnostic } = require('./diagnostic-log.js');

function safeHandle(ipcMain, channel, validate, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (typeof validate === 'function' && !validate(...args)) {
        logDiagnostic(`ipc.${channel}.invalid-args`, new Error('validation failed'));
        return { ok: false, code: 'invalid-args' };
      }
      return await handler(event, ...args);
    } catch (error) {
      logDiagnostic(`ipc.${channel}.handler-error`, error);
      return { ok: false, code: 'handler-error', message: error && error.message ? error.message : 'unknown' };
    }
  });
}

function safeOn(ipcMain, channel, validate, handler) {
  ipcMain.on(channel, (event, ...args) => {
    try {
      if (typeof validate === 'function' && !validate(...args)) {
        logDiagnostic(`ipc.${channel}.invalid-args`, new Error('validation failed'));
        return;
      }
      handler(event, ...args);
    } catch (error) {
      logDiagnostic(`ipc.${channel}.handler-error`, error);
    }
  });
}

function isRect(v) {
  return !!(v && typeof v === 'object'
    && Number.isFinite(v.x) && Number.isFinite(v.y)
    && Number.isFinite(v.width) && Number.isFinite(v.height));
}

function isRectArray(v) {
  return Array.isArray(v) && v.every(isRect);
}

function isString(v) {
  return typeof v === 'string';
}

function isSlotArray(v) {
  if (!Array.isArray(v)) return false;
  return v.every((slot) => !!(slot && typeof slot === 'object' && (typeof slot.url === 'string' || typeof slot.id === 'string')));
}

module.exports = { safeHandle, safeOn, isRect, isRectArray, isString, isSlotArray };
