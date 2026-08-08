'use strict';

const {
  DEFAULT_AUTO_RECORDING,
  normalizeAutoRecording,
} = require('./recording-settings');

const DEFAULT_POLL_INTERVAL_MS = 15_000;

function createAutoRecorder({
  resolveRoom,
  openStream,
  createOutput,
  buildFilePath,
  onStatus = () => {},
  now = () => new Date(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  staggerMs = 250,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  let config = { library: [], autoRecording: DEFAULT_AUTO_RECORDING };
  let pollTimer = null;
  let refreshing = null;
  let refreshRequested = false;
  const active = new Map();
  const broadcastStates = new Map();
  const offlineConfirmations = new Map();

  function selectedRooms() {
    const selected = new Set(config.autoRecording.roomIds);
    return config.library.filter((room) => selected.has(room.id));
  }

  function isSelected(roomId) {
    return config.autoRecording.enabled
      && config.autoRecording.roomIds.includes(roomId)
      && config.library.some((room) => room.id === roomId);
  }

  function emit(room, status, fields = {}) {
    onStatus({ roomId: room.id, roomName: room.name || room.id, status, ...fields });
  }

  function finish(roomId, reason) {
    const recording = active.get(roomId);
    if (!recording || recording.finished) return false;
    recording.finished = true;
    active.delete(roomId);
    if (recording.timer) clearTimeoutFn(recording.timer);
    if (recording.input) {
      recording.input.removeListener('end', recording.onEnd);
      recording.input.removeListener('aborted', recording.onAborted);
      recording.input.removeListener('error', recording.onInputError);
      if (recording.output) recording.input.unpipe(recording.output);
      if (reason !== 'stream-ended' && typeof recording.input.destroy === 'function') {
        recording.input.destroy();
      }
    }
    if (recording.output) {
      recording.output.removeListener('error', recording.onOutputError);
      if (!recording.output.destroyed && !recording.output.writableEnded) recording.output.end();
    }
    const failed = reason === 'stream-error' || reason === 'output-error' || reason === 'start-error';
    emit(recording.room, failed ? 'failed' : 'stopped', {
      reason,
      filePath: recording.filePath,
    });
    return true;
  }

  async function begin(room, flvUrl) {
    if (active.has(room.id)) return;
    const recording = {
      room,
      filePath: buildFilePath(room, now()),
      input: null,
      output: null,
      timer: null,
      finished: false,
      onEnd: null,
      onAborted: null,
      onInputError: null,
      onOutputError: null,
    };
    active.set(room.id, recording);
    try {
      recording.input = await openStream(flvUrl);
      if (recording.finished) {
        if (typeof recording.input.destroy === 'function') recording.input.destroy();
        return;
      }
      recording.output = createOutput(recording.filePath);
      recording.onEnd = () => finish(room.id, 'stream-ended');
      recording.onAborted = () => finish(room.id, 'stream-error');
      recording.onInputError = () => finish(room.id, 'stream-error');
      recording.onOutputError = () => finish(room.id, 'output-error');
      recording.input.once('end', recording.onEnd);
      recording.input.once('aborted', recording.onAborted);
      recording.input.once('error', recording.onInputError);
      recording.output.once('error', recording.onOutputError);
      recording.input.pipe(recording.output);
      recording.timer = setTimeoutFn(
        () => finish(room.id, 'duration'),
        config.autoRecording.durationHours * 3_600_000,
      );
      emit(room, 'recording', { filePath: recording.filePath });
    } catch (error) {
      if (active.get(room.id) === recording) {
        active.delete(room.id);
        recording.finished = true;
        emit(room, 'failed', {
          reason: 'start-error',
          message: error && error.message ? error.message : String(error),
          filePath: recording.filePath,
        });
      }
    }
  }

  async function inspectRoom(room) {
    let result;
    try {
      result = await resolveRoom(room.url, 'origin');
    } catch {
      return;
    }
    if (!isSelected(room.id)) return;
    if (result && result.ok && result.flvUrl) {
      offlineConfirmations.delete(room.id);
      if (broadcastStates.get(room.id) !== 'live') {
        broadcastStates.set(room.id, 'live');
        await begin(room, result.flvUrl);
      }
      return;
    }
    if (result && (result.status === 'offline' || result.status === 'ended')) {
      const confirmations = (offlineConfirmations.get(room.id) || 0) + 1;
      offlineConfirmations.set(room.id, confirmations);
      if (confirmations >= 2) {
        broadcastStates.set(room.id, 'offline');
        finish(room.id, 'live-ended');
      }
    }
  }

  async function runRefresh() {
    if (!config.autoRecording.enabled) return;
    const rooms = selectedRooms();
    await Promise.all(rooms.map(async (room, index) => {
      if (staggerMs > 0 && index > 0) await delay(index * staggerMs);
      await inspectRoom(room);
    }));
  }

  function refresh() {
    if (refreshing) {
      refreshRequested = true;
      return refreshing;
    }
    refreshing = (async () => {
      do {
        refreshRequested = false;
        await runRefresh();
      } while (refreshRequested);
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  function updateConfig(payload = {}) {
    const library = Array.isArray(payload.library) ? payload.library : [];
    const autoRecording = normalizeAutoRecording(payload.autoRecording, library);
    const previousSelection = new Set(config.autoRecording.roomIds);
    const nextSelection = new Set(autoRecording.roomIds);

    for (const roomId of previousSelection) {
      if (!autoRecording.enabled || !nextSelection.has(roomId)) {
        finish(roomId, autoRecording.enabled ? 'deselected' : 'disabled');
        broadcastStates.delete(roomId);
        offlineConfirmations.delete(roomId);
      }
    }
    for (const roomId of nextSelection) {
      if (!config.autoRecording.enabled || !previousSelection.has(roomId)) {
        broadcastStates.delete(roomId);
        offlineConfirmations.delete(roomId);
      }
    }

    config = { library, autoRecording };
    return refresh();
  }

  function start() {
    if (pollTimer) return;
    pollTimer = setIntervalFn(() => { refresh(); }, pollIntervalMs);
  }

  function stop() {
    if (pollTimer) clearIntervalFn(pollTimer);
    pollTimer = null;
    for (const roomId of [...active.keys()]) finish(roomId, 'app-quit');
    broadcastStates.clear();
    offlineConfirmations.clear();
  }

  function activeRoomIds() {
    return [...active.keys()].sort();
  }

  return { updateConfig, refresh, start, stop, activeRoomIds };
}

function createElectronStreamOpener({ net, session, userAgent }) {
  return (url) => new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url, session });
    request.setHeader('Referer', 'https://live.douyin.com/');
    request.setHeader('Origin', 'https://live.douyin.com');
    request.setHeader('User-Agent', userAgent);
    request.on('redirect', () => request.followRedirect());
    request.on('response', (response) => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        resolve(response);
      } else {
        if (typeof response.destroy === 'function') response.destroy();
        reject(new Error(`录制流请求失败：HTTP ${response.statusCode}`));
      }
    });
    request.on('error', reject);
    request.end();
  });
}

module.exports = {
  DEFAULT_POLL_INTERVAL_MS,
  createAutoRecorder,
  createElectronStreamOpener,
};
