import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import autoRecorderModule from '../lib/auto-recorder.js';

const { createAutoRecorder } = autoRecorderModule;

const room = { id: 'room-a', name: '宇宙009', url: 'https://live.douyin.com/123456' };
const liveResult = {
  ok: true,
  status: 'live',
  flvUrl: 'https://stream.example/live.flv',
};

function createHarness(results = []) {
  const inputs = [];
  const outputs = [];
  const events = [];
  const durationCallbacks = [];
  let resolveCalls = 0;
  let intervalCallback = null;

  const recorder = createAutoRecorder({
    resolveRoom: async () => {
      const result = results[resolveCalls] || liveResult;
      resolveCalls += 1;
      return result;
    },
    openStream: async () => {
      const input = new PassThrough();
      inputs.push(input);
      return input;
    },
    createOutput: () => {
      const output = new PassThrough();
      output.resume();
      outputs.push(output);
      return output;
    },
    buildFilePath: () => `/videos/room-${outputs.length + 1}.flv`,
    onStatus: (event) => events.push(event),
    setTimeoutFn: (fn) => {
      durationCallbacks.push(fn);
      return fn;
    },
    clearTimeoutFn: () => {},
    setIntervalFn: (fn) => {
      intervalCallback = fn;
      return fn;
    },
    clearIntervalFn: () => {},
    staggerMs: 0,
  });

  return {
    recorder,
    inputs,
    outputs,
    events,
    durationCallbacks,
    get resolveCalls() { return resolveCalls; },
    get intervalCallback() { return intervalCallback; },
  };
}

test('默认关闭时不检查也不录制', async () => {
  const harness = createHarness();

  await harness.recorder.updateConfig({ library: [room], autoRecording: null });

  assert.equal(harness.resolveCalls, 0);
  assert.deepEqual(harness.recorder.activeRoomIds(), []);
});

test('开启并选择房间后只为同一场直播启动一次', async () => {
  const harness = createHarness();

  await harness.recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: true, durationHours: 1, roomIds: [room.id] },
  });
  await harness.recorder.refresh();

  assert.equal(harness.inputs.length, 1);
  assert.deepEqual(harness.recorder.activeRoomIds(), [room.id]);
  assert.equal(harness.events.filter((event) => event.status === 'recording').length, 1);
});

test('达到配置时长后停止且本场直播不重复开始', async () => {
  const harness = createHarness();

  await harness.recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: true, durationHours: 1, roomIds: [room.id] },
  });
  harness.durationCallbacks[0]();
  await harness.recorder.refresh();

  assert.deepEqual(harness.recorder.activeRoomIds(), []);
  assert.equal(harness.inputs.length, 1);
  assert.equal(harness.events.at(-1).reason, 'duration');
});

test('关闭总开关或取消选择会立即停止活动录制', async () => {
  const harness = createHarness();

  await harness.recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: true, durationHours: 2, roomIds: [room.id] },
  });
  await harness.recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: false, durationHours: 2, roomIds: [room.id] },
  });

  assert.deepEqual(harness.recorder.activeRoomIds(), []);
  assert.equal(harness.events.at(-1).reason, 'disabled');

  await harness.recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: true, durationHours: 2, roomIds: [room.id] },
  });
  await harness.recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: true, durationHours: 2, roomIds: [] },
  });

  assert.deepEqual(harness.recorder.activeRoomIds(), []);
  assert.equal(harness.events.at(-1).reason, 'deselected');
});

test('连续两次确认下播后允许下一场直播重新录制', async () => {
  const harness = createHarness([
    liveResult,
    { ok: false, status: 'ended' },
    { ok: false, status: 'ended' },
    liveResult,
  ]);

  await harness.recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: true, durationHours: 1, roomIds: [room.id] },
  });
  harness.durationCallbacks[0]();
  await harness.recorder.refresh();
  await harness.recorder.refresh();
  await harness.recorder.refresh();

  assert.equal(harness.inputs.length, 2);
  assert.deepEqual(harness.recorder.activeRoomIds(), [room.id]);
});

test('start 建立轮询且 stop 关闭所有活动会话', async () => {
  const harness = createHarness();

  harness.recorder.start();
  assert.equal(typeof harness.intervalCallback, 'function');
  await harness.recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: true, durationHours: 1, roomIds: [room.id] },
  });
  harness.recorder.stop();

  assert.deepEqual(harness.recorder.activeRoomIds(), []);
  assert.equal(harness.events.at(-1).reason, 'app-quit');
});

test('检测未完成时关闭总开关不会启动过期录制', async () => {
  let releaseResolve;
  const resolvePending = new Promise((resolve) => { releaseResolve = resolve; });
  const inputs = [];
  const recorder = createAutoRecorder({
    resolveRoom: () => resolvePending,
    openStream: async () => {
      const input = new PassThrough();
      inputs.push(input);
      return input;
    },
    createOutput: () => new PassThrough(),
    buildFilePath: () => '/videos/room.flv',
    staggerMs: 0,
  });

  const detecting = recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: true, durationHours: 1, roomIds: [room.id] },
  });
  const disabling = recorder.updateConfig({
    library: [room],
    autoRecording: { enabled: false, durationHours: 1, roomIds: [room.id] },
  });
  releaseResolve(liveResult);
  await Promise.all([detecting, disabling]);
  recorder.stop();

  assert.equal(inputs.length, 0);
  assert.deepEqual(recorder.activeRoomIds(), []);
});

test('检测进行中新选的直播间会在本轮结束后立即检查', async () => {
  const roomB = { id: 'room-b', name: '宇宙X', url: 'https://live.douyin.com/654321' };
  let releaseFirstResolve;
  let firstResolve = true;
  const opened = [];
  const recorder = createAutoRecorder({
    resolveRoom: (url) => {
      if (firstResolve) {
        firstResolve = false;
        return new Promise((resolve) => { releaseFirstResolve = resolve; });
      }
      return Promise.resolve({ ...liveResult, flvUrl: `${url}.flv` });
    },
    openStream: async (url) => {
      opened.push(url);
      return new PassThrough();
    },
    createOutput: () => {
      const output = new PassThrough();
      output.resume();
      return output;
    },
    buildFilePath: (selectedRoom) => `/videos/${selectedRoom.id}.flv`,
    setTimeoutFn: () => null,
    clearTimeoutFn: () => {},
    staggerMs: 0,
  });

  const firstUpdate = recorder.updateConfig({
    library: [room, roomB],
    autoRecording: { enabled: true, durationHours: 1, roomIds: [room.id] },
  });
  const secondUpdate = recorder.updateConfig({
    library: [room, roomB],
    autoRecording: { enabled: true, durationHours: 1, roomIds: [room.id, roomB.id] },
  });
  releaseFirstResolve(liveResult);
  await Promise.all([firstUpdate, secondUpdate]);
  recorder.stop();

  assert.equal(opened.length, 2);
  assert.ok(opened.some((url) => url.includes('654321')));
});
