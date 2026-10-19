const test = require('node:test');
const assert = require('node:assert/strict');
const { playbackSession, resolveGuestFirst } = require('../lib/playback-access');

test('游客会话不持久化且与各平台账号会话分离', () => {
  const session = { fromPartition: value => value };
  const partitions = ['douyin', 'xiaohongshu'].flatMap(platform => [
    playbackSession(session, platform), playbackSession(session, platform, false),
  ]);
  assert.equal(new Set(partitions).size, 4);
  assert.ok(!partitions[0].startsWith('persist:'));
  assert.ok(!partitions[2].startsWith('persist:'));
  assert.equal(partitions[1], 'persist:douyin');
  assert.equal(partitions[3], 'persist:xiaohongshu');
});

test('游客已开播或明确结束，不访问账号会话和登录检测', async () => {
  for (const result of [{ ok: true, status: 'live' }, { ok: false, status: 'offline' }, { ok: false, status: 'ended' }]) {
    assert.equal(await resolveGuestFirst({ guest: async () => result,
      account: () => assert.fail('不能读取账号会话'), loginStatus: () => assert.fail('不能要求登录') }), result);
  }
});

test('游客失败时未登录、未知或受限账号不尝试账号播放', async () => {
  const result = { ok: false, status: 'unknown' };
  for (const auth of [false, null, { loggedIn: false }, { loggedIn: true, status: 'restricted' }]) {
    assert.equal(await resolveGuestFirst({ guest: async () => result,
      loginStatus: async () => auth, account: () => assert.fail('账号不可用') }), result);
  }
});

test('正常已登录账号作为游客失败后的备用，备用失败仍保留游客原因', async () => {
  const guest = { ok: false, status: 'unknown', message: '游客未返回数据' };
  const live = { ok: true, status: 'live' };
  const order = [];
  const args = { guest: async () => { order.push('guest'); return guest; },
    loginStatus: async () => { order.push('status'); return { loggedIn: true }; },
    account: async () => { order.push('account'); return live; } };
  assert.equal(await resolveGuestFirst(args), live);
  assert.deepEqual(order, ['guest', 'status', 'account']);
  assert.equal(await resolveGuestFirst({ ...args, account: async () => { throw new Error('network'); } }), guest);
});
