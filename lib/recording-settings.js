'use strict';

const path = require('node:path');

const DEFAULT_AUTO_RECORDING = Object.freeze({
  enabled: false,
  durationHours: 1,
  roomIds: [],
});

function normalizeAutoRecording(value, library = []) {
  const input = value && typeof value === 'object' ? value : {};
  const validIds = new Set(library.map((room) => room.id));
  const durationHours = Number.isInteger(input.durationHours)
    && input.durationHours >= 1
    && input.durationHours <= 5
    ? input.durationHours
    : DEFAULT_AUTO_RECORDING.durationHours;

  return {
    enabled: input.enabled === true,
    durationHours,
    roomIds: [...new Set(Array.isArray(input.roomIds) ? input.roomIds : [])]
      .filter((id) => validIds.has(id)),
  };
}

function sanitizeFilePart(value, fallback = '直播间') {
  const clean = (input) => String(input || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
  return clean(value) || clean(fallback) || '直播间';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function localDateParts(now) {
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  const minute = pad(now.getMinutes());
  const second = pad(now.getSeconds());
  return {
    date: `${year}-${month}-${day}`,
    timestamp: `${year}${month}${day}-${hour}${minute}${second}`,
  };
}

function buildRecordingFilePath(videosPath, room, now = new Date()) {
  const { date, timestamp } = localDateParts(now);
  const roomName = sanitizeFilePart(room && room.name, room && room.id);
  return path.join(
    videosPath,
    '抖音多宫格直播墙',
    date,
    `${roomName}-${timestamp}.flv`,
  );
}

module.exports = {
  DEFAULT_AUTO_RECORDING,
  normalizeAutoRecording,
  sanitizeFilePart,
  buildRecordingFilePath,
};
