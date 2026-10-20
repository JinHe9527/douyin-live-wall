import test from 'node:test';
import assert from 'node:assert/strict';
import livePresenceModule from '../lib/live-presence.js';

const {
  createPresence,
  reducePresence,
  isHiddenByLiveOnly,
  PRESENCE_GRACE_MS,
} = livePresenceModule;

test('初始检查态保持可见，仅隐藏已确认未开播的房间', () => {
  const state = createPresence();

  assert.equal(state.availability, 'checking');
  assert.equal(isHiddenByLiveOnly(true, state), false);
  assert.equal(isHiddenByLiveOnly(true, undefined), false);
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
  assert.equal(state.uncertainSince, 10_000);
  assert.equal(isHiddenByLiveOnly(true, state), false);
});

test('上次确认离线后查询失败，恢复可见检查态而非持续隐藏', () => {
  const offline = reducePresence(reducePresence(createPresence(), { type: 'offline' }, 1000), { type: 'offline' }, 2000);
  const unknown = reducePresence(offline, { type: 'unknown' }, 3000);
  assert.equal(unknown.availability, 'checking');
  assert.equal(isHiddenByLiveOnly(true, unknown), false);
});

test('在播房间连续查询失败也会在宽限期后显示状态未知', () => {
  const live = reducePresence(createPresence(), { type: 'live' }, 1000);
  const first = reducePresence(live, { type: 'unknown' }, 2000);
  const next = reducePresence(first, { type: 'unknown' }, 2000 + PRESENCE_GRACE_MS);
  assert.equal(first.availability, 'live');
  assert.equal(next.availability, 'checking');
  assert.equal(isHiddenByLiveOnly(true, next), false);
});
