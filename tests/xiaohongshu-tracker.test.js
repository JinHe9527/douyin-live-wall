const test = require('node:test');
const assert = require('node:assert/strict');
const { createXiaohongshuTracker } = require('../lib/xiaohongshu-tracker');

const old = 'https://www.xiaohongshu.com/livestream/123456';
const fresh = 'https://www.xiaohongshu.com/livestream/789012?xsec_token=room-token';
const candidate = { title: '宇宙-K', anchorId: 'host-k', roomUrl: fresh };
const ended = { ok: false, status: 'offline', anchorName: '宇宙-K' };
const live = { ok: true, status: 'live', anchorName: '宇宙-K', flvUrl: 'https://live.xhscdn.com/live.flv' };

test('游客广场找到同一主播新场次时无需账号搜索，验证主播 ID 后更新旧链接', async () => {
  let searches = 0;
  const tracker = createXiaohongshuTracker({
    resolve: async url => url === old ? ended : { ...live, anchorId: candidate.anchorId },
    discover: async (name, identity) => {
      assert.equal(identity.anchorId, candidate.anchorId);
      assert.equal(identity.previousRoomUrl, old);
      return { status: 'success', candidates: [{ ...candidate, anchorId: 'other-host' }, candidate] };
    },
    search: async () => { searches++; return { status: 'login_required' }; },
  });
  const result = await tracker.resolveRoom(old, 'fluent', { anchorId: candidate.anchorId });
  assert.equal(result.refreshedRoom, true);
  assert.equal(result.roomUrl, fresh);
  assert.equal(searches, 0);
});

test('游客广场没找到时不误报下播；新场次主播 ID 不符时拒绝播放', async () => {
  for (const discovered of [[], [candidate]]) {
    const tracker = createXiaohongshuTracker({
      resolve: async url => url === old ? ended : { ...live, anchorId: 'other-host' },
      discover: async () => ({ status: 'success', candidates: discovered }),
      search: async () => ({ status: 'login_required' }),
    });
    assert.equal((await tracker.resolveRoom(old, 'hd', { anchorId: candidate.anchorId })).status, 'unknown');
  }
});

test('游客广场提供已验证的官方流时，不再依赖新场次分享页或账号查询', async () => {
  const requests = [];
  const tracker = createXiaohongshuTracker({
    resolve: async url => { requests.push(url); return ended; },
    discover: async () => ({ status: 'success', source: 'guest_square', candidates: [candidate] }),
    resolveCandidate: async (found, quality) => {
      assert.equal(found.anchorId, candidate.anchorId); assert.equal(quality, 'fluent');
      return { ...live, anchorId: candidate.anchorId };
    },
    search: async () => { throw new Error('must-not-query-account'); },
  });
  assert.equal((await tracker.resolveRoom(old, 'fluent', { anchorId: candidate.anchorId })).refreshedRoom, true);
  assert.deepEqual(requests, [old]);
});

test('分享页连接失败后可用广场同场次重建播放器，但明确结束的同场次不得复用', async () => {
  for (const endedRoom of [false, true]) {
    let usedStream = false;
    const tracker = createXiaohongshuTracker({
      resolve: async () => ({ ...ended, status: endedRoom ? 'offline' : 'unknown' }),
      discover: async () => ({ status: 'success', source: 'guest_square', candidates: [{ ...candidate, roomUrl: old }] }),
      resolveCandidate: async () => { usedStream = true; return live; },
      search: async () => ({ status: 'login_required' }),
    });
    const result = await tracker.resolveRoom(old, 'fluent', { anchorId: candidate.anchorId });
    assert.equal(result.ok, !endedRoom);
    assert.equal(usedStream, !endedRoom);
  }
});

test('旧场次结束后精确匹配主播，保留新场次认证参数及身份', async () => {
  const requests = [];
  const tracker = createXiaohongshuTracker({
    resolve: async (url, quality) => { requests.push([url, quality]); return url === old ? ended : live; },
    search: async () => ({ status: 'success', candidates: [{ ...candidate, title: '宇宙-X', anchorId: 'host-x' }, candidate] }),
  });
  const result = await tracker.resolveRoom(old, 'sd', { anchorName: '自定义备注' });
  assert.equal(result.ok, true);
  assert.equal(result.roomUrl, fresh);
  assert.equal(result.anchorId, 'host-k');
  assert.equal(result.refreshedRoom, true);
  assert.deepEqual(requests, [[old, 'sd'], [fresh, 'sd']]);
});

test('正在播放时不搜索；同名不同用户不能替换已知主播', async () => {
  let searches = 0;
  const tracker = createXiaohongshuTracker({
    resolve: async (url) => url === fresh ? live : ended,
    search: async () => { searches++; return { status: 'success', candidates: [{ ...candidate, anchorId: 'other' }] }; },
  });
  assert.equal((await tracker.resolveRoom(fresh, 'hd')).ok, true);
  assert.equal(searches, 0);
  assert.equal((await tracker.resolveRoom(old, 'hd', { anchorId: 'host-k' })).status, 'unknown');
});

test('登录失败、同名歧义不会误报主播下播或播放其他人', async () => {
  for (const result of [
    { status: 'login_required', message: '请登录小红书' },
    { status: 'error' },
    { status: 'success', candidates: [candidate, { ...candidate, roomUrl: fresh + '2' }] },
  ]) {
    let requests = 0;
    const tracker = createXiaohongshuTracker({ resolve: async () => { requests++; return { ok: false, status: 'unknown' }; }, search: async () => result });
    const value = await tracker.resolveRoom(old, 'hd', { anchorName: '宇宙-K' });
    assert.equal(value.ok, false);
    assert.equal(value.status, 'unknown');
    assert.equal(requests, 1);
    if (result.message) assert.equal(value.reason, result.message);
  }
});

test('旧场次结束但搜索未确认当前主播状态时保持未知', async () => {
  for (const candidates of [[], [{ ...candidate, title: '其他人' }]]) {
    const tracker = createXiaohongshuTracker({ resolve: async () => ended,
      search: async () => ({ status: 'success', candidates }) });
    const result = await tracker.resolveRoom(old, 'hd');
    assert.equal(result.status, 'unknown');
    assert.equal(result.message, '旧场次已结束，暂未找到新场次');
  }
  const tracker = createXiaohongshuTracker({ resolve: async () => ({ ok: false, status: 'unknown' }),
    search: async () => ({ status: 'success', candidates: [] }) });
  assert.equal((await tracker.resolveRoom(old, 'hd', { anchorName: '宇宙-K' })).status, 'unknown');
  const endedTracker = createXiaohongshuTracker({ resolve: async () => ended,
    search: async () => ({ status: 'error', message: '搜索超时' }) });
  const endedResult = await endedTracker.resolveRoom(old, 'hd');
  assert.equal(endedResult.status, 'unknown');
  assert.equal(endedResult.message, '旧场次已结束，暂未找到新场次');
  assert.equal(endedResult.reason, '搜索超时');
});

test('新页面主播与搜索不符时不切换；拒绝外部网址', async () => {
  for (const url of [fresh, 'https://example.com/livestream/789012']) {
    const tracker = createXiaohongshuTracker({
      resolve: async (url) => url === old ? ended : { ...live, anchorName: '其他人' },
      search: async () => ({ status: 'success', candidates: [{ ...candidate, roomUrl: url }] }),
    });
    assert.equal((await tracker.resolveRoom(old, 'hd')).status, 'unknown');
  }
});

test('已结束场次遇到登录限制或搜索仍返回旧场次时不判主播离线', async () => {
  for (const result of [
    { status: 'login_required', message: '请登录小红书' },
    { status: 'success', candidates: [{ ...candidate, roomUrl: old }] },
  ]) {
    const tracker = createXiaohongshuTracker({ resolve: async () => ended, search: async () => result });
    const value = await tracker.resolveRoom(old, 'sd', { anchorId: candidate.anchorId });
    assert.equal(value.status, 'unknown');
    assert.equal(value.message, '旧场次已结束，暂未找到新场次');
  }
});

test('并发房间串行搜索，同一主播共享查询并在冷却后重试', async () => {
  let time = 0, active = 0, maximum = 0, searches = 0;
  const tracker = createXiaohongshuTracker({ now: () => time, cooldownMs: 100,
    resolve: async () => ({ ok: false, status: 'unknown' }),
    search: async () => {
      searches++; maximum = Math.max(maximum, ++active);
      await new Promise(setImmediate); active--;
      return { status: 'success', candidates: [] };
    },
  });
  await Promise.all(['甲', '甲', '乙'].map(anchorName => tracker.resolveRoom(old, 'hd', { anchorName })));
  assert.equal(searches, 2); assert.equal(maximum, 1);
  await tracker.resolveRoom(old, 'hd', { anchorName: '甲' });
  assert.equal(searches, 2);
  time = 101;
  await tracker.resolveRoom(old, 'hd', { anchorName: '甲' });
  assert.equal(searches, 3);
});

test('账号受限时多个主播共用冷却，期限后恢复检查', async () => {
  let time = 0, searches = 0;
  const tracker = createXiaohongshuTracker({ now: () => time, cooldownMs: 100,
    resolve: async () => ({ ok: false, status: 'unknown' }),
    search: async () => { searches++; return { status: 'login_required', message: '账号异常（300011）' }; },
  });
  const results = await Promise.all(['甲', '乙', '丙'].map(anchorName => tracker.resolveRoom(old, 'hd', { anchorName })));
  assert.equal(searches, 1);
  assert.ok(results.every(result => result.reason === '账号异常（300011）'));
  time = 101;
  await tracker.resolveRoom(old, 'hd', { anchorName: '甲' });
  assert.equal(searches, 2);
});

test('旧链接状态未知时可以通过同一主播的官方未开播状态确认，开播后恢复新场次', async () => {
  let time = 0;
  const tracker = createXiaohongshuTracker({ now: () => time, cooldownMs: 100,
    resolve: async url => url === old ? { ok: false, status: 'unknown' } : live,
    search: async () => time === 0
      ? { status: 'success', candidates: [], offlineAnchors: [{ title: candidate.title, anchorId: candidate.anchorId }] }
      : { status: 'success', candidates: [candidate] },
  });
  const identity = { anchorName: candidate.title, anchorId: candidate.anchorId };
  const first = await tracker.resolveRoom(old, 'sd', identity);
  assert.equal(first.status, 'offline');
  assert.equal(first.message, '未开播');
  time = 101;
  const next = await tracker.resolveRoom(old, 'sd', identity);
  assert.equal(next.ok, true);
  assert.equal(next.roomUrl, fresh);
});

test('其他账号或不完整搜索的未开播结果不能判定当前主播离线', async () => {
  for (const result of [
    { status: 'success', offlineAnchors: [{ title: candidate.title, anchorId: 'another-host' }] },
    { status: 'error', offlineAnchors: [{ title: candidate.title, anchorId: candidate.anchorId }] },
  ]) {
    const tracker = createXiaohongshuTracker({ resolve: async () => ({ ok: false, status: 'unknown' }), search: async () => result });
    assert.equal((await tracker.resolveRoom(old, 'sd', { anchorName: candidate.title, anchorId: candidate.anchorId })).status, 'unknown');
  }
});
