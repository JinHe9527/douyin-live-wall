import test from 'node:test';
import assert from 'node:assert/strict';
import roomRefreshModule from '../lib/room-refresh.js';

const { runRoomRefresh } = roomRefreshModule;

test('房间刷新遵守并发上限并保留结果顺序', async () => {
  const rooms = ['a', 'b', 'c', 'd', 'e'];
  let active = 0;
  let peak = 0;

  const results = await runRoomRefresh(rooms, async (room) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return `${room}-done`;
  }, { concurrency: 2 });

  assert.equal(peak, 2);
  assert.deepEqual(results.map((result) => result.value), rooms.map((room) => `${room}-done`));
  assert.equal(results.every((result) => result.ok), true);
});

test('单个房间刷新失败不阻断后续房间', async () => {
  const visited = [];
  const results = await runRoomRefresh(['a', 'b', 'c'], async (room) => {
    visited.push(room);
    if (room === 'b') throw new Error('failed');
    return room;
  }, { concurrency: 1 });

  assert.deepEqual(visited, ['a', 'b', 'c']);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[2].ok, true);
});
