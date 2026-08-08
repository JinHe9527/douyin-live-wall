import test from 'node:test';
import assert from 'node:assert/strict';
import livePresenceModule from '../lib/live-presence.js';

const {
  createPresence,
  reducePresence,
  isHiddenByLiveOnly,
  PRESENCE_GRACE_MS,
} = livePresenceModule;

test('初始检查态在只看在播中隐藏', () => {
  const state = createPresence();

  assert.equal(state.availability, 'checking');
  assert.equal(isHiddenByLiveOnly(true, state), true);
  assert.equal(isHiddenByLiveOnly(false, state), false);
});

test('确认在播后立即显示', () => {
  const state = reducePresence(createPresence(), { type: 'live' }, 1_000);

  assert.equal(state.availability, 'live');
  assert.equal(isHiddenByLiveOnly(true, state), false);
});

test('连续两次明确下播才切到 offline', () => {
  const live = reducePresence(createPresence(), { type: 'live' }, 1_000);
  const first = reducePresence(live, { type: 'offline' }, 2_000);
  const second = reducePresence(first, { type: 'offline' }, 3_000);

  assert.equal(first.availability, 'live');
  assert.equal(second.availability, 'offline');
  assert.equal(isHiddenByLiveOnly(true, second), true);
});

test('重新确认在播会清空下播计数', () => {
  const live = reducePresence(createPresence(), { type: 'live' }, 1_000);
  const firstOffline = reducePresence(live, { type: 'offline' }, 2_000);
  const confirmedAgain = reducePresence(firstOffline, { type: 'live' }, 3_000);
  const nextOffline = reducePresence(confirmedAgain, { type: 'offline' }, 4_000);

  assert.equal(nextOffline.availability, 'live');
  assert.equal(nextOffline.offlineConfirmations, 1);
});

test('两次明确下播之间的重连状态不清空确认次数', () => {
  const live = reducePresence(createPresence(), { type: 'live' }, 1_000);
  const firstOffline = reducePresence(live, { type: 'offline' }, 2_000);
  const reconnecting = reducePresence(firstOffline, { type: 'reconnecting' }, 3_000);
  const secondOffline = reducePresence(reconnecting, { type: 'offline' }, 4_000);

  assert.equal(secondOffline.availability, 'offline');
});

test('重连保留三十秒可见窗口，超时转检查态', () => {
  const live = reducePresence(createPresence(), { type: 'live' }, 1_000);
  const reconnecting = reducePresence(live, { type: 'reconnecting' }, 2_000);
  const repeatedReconnect = reducePresence(reconnecting, { type: 'reconnecting' }, 8_000);
  const grace = reducePresence(repeatedReconnect, { type: 'unknown' }, 2_000 + PRESENCE_GRACE_MS - 1);
  const expired = reducePresence(grace, { type: 'unknown' }, 2_000 + PRESENCE_GRACE_MS);

  assert.equal(repeatedReconnect.uncertainSince, 2_000);
  assert.equal(grace.availability, 'live');
  assert.equal(expired.availability, 'checking');
});

test('未确认过在播的未知结果保持检查态', () => {
  const state = reducePresence(createPresence(), { type: 'unknown' }, 10_000);

  assert.equal(state.availability, 'checking');
  assert.equal(state.uncertainSince, null);
});
