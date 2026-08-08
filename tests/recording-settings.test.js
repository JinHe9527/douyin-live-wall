import test from 'node:test';
import assert from 'node:assert/strict';
import recordingSettingsModule from '../lib/recording-settings.js';

const {
  normalizeAutoRecording,
  buildRecordingFilePath,
  sanitizeFilePart,
} = recordingSettingsModule;

const library = [
  { id: 'a', name: '宇宙/009' },
  { id: 'b', name: '宇宙X' },
];

test('自动录制默认关闭且默认一小时', () => {
  assert.deepEqual(normalizeAutoRecording(null, library), {
    enabled: false,
    durationHours: 1,
    roomIds: [],
  });
});

test('配置只保留一至五小时和仍存在的唯一房间', () => {
  assert.deepEqual(normalizeAutoRecording({
    enabled: true,
    durationHours: 5,
    roomIds: ['a', 'missing', 'a'],
  }, library), {
    enabled: true,
    durationHours: 5,
    roomIds: ['a'],
  });

  assert.equal(normalizeAutoRecording({ durationHours: 6 }, library).durationHours, 1);
  assert.equal(normalizeAutoRecording({ durationHours: 1.5 }, library).durationHours, 1);
});

test('录制路径按日期创建并替换非法文件名字符', () => {
  const file = buildRecordingFilePath(
    '/videos',
    library[0],
    new Date(2026, 7, 8, 9, 5, 7),
  );

  assert.match(file, /抖音多宫格直播墙[\\/]2026-08-08[\\/]宇宙_009-20260808-090507\.flv$/);
});

test('空名称使用直播间 ID 且清理尾部点和空格', () => {
  assert.equal(sanitizeFilePart('名称.  ', 'fallback'), '名称');
  assert.equal(sanitizeFilePart('', 'room-id'), 'room-id');
});
