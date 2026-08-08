import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../mini-app/grid.html', import.meta.url), 'utf8');
const grid = await readFile(new URL('../mini-app/grid.js', import.meta.url), 'utf8');
const preload = await readFile(new URL('../mini-app/preload.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../mini-app/main.js', import.meta.url), 'utf8');

test('宫格页加载直播可用性模块并提供全部刷新', () => {
  assert.match(html, /\.\.\/lib\/live-presence\.js/);
  assert.match(html, /id="btn-refresh-all"/);
  assert.match(grid, /LivePresence\.createPresence/);
  assert.match(grid, /refreshAllRooms/);
  assert.match(grid, /ROOM_POLL_INTERVAL_MS\s*=\s*15_000/);
});

test('preload 与主进程接通自动录制配置和状态', () => {
  assert.match(preload, /setAutoRecordingConfig/);
  assert.match(preload, /onRecordingStatus/);
  assert.match(preload, /mini-auto-recording-config/);
  assert.match(preload, /recording-status/);
  assert.match(main, /createAutoRecorder/);
  assert.match(main, /app\.getPath\('videos'\)/);
  assert.match(main, /mini-auto-recording-config/);
  assert.match(main, /recording-status/);
  assert.match(main, /autoRecorder\.stop\(\)/);
});

test('设置抽屉提供总开关、录制时长和逐房间选择', () => {
  assert.match(html, /id="auto-recording-enabled"/);
  assert.match(html, /id="auto-recording-duration"/);
  for (let hour = 1; hour <= 5; hour += 1) {
    assert.match(html, new RegExp(`<option value="${hour}">${hour} 小时<\\/option>`));
  }
  assert.match(grid, /autoRecording/);
  assert.match(grid, /recordingRooms/);
  assert.match(grid, /lib-record-check/);
  assert.match(grid, /setAutoRecordingConfig/);
  assert.match(grid, /onRecordingStatus/);
  assert.match(grid, /recording-status/);
});
