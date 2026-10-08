const test = require('node:test');
const assert = require('node:assert/strict');
const platform = require('../lib/live-platform');

test('名称进入所属平台搜索，数字房间号按平台解析', () => {
  assert.equal(platform.parseInput('宇宙k', 'xiaohongshu').kind, 'keyword');
  assert.match(platform.searchUrl('宇宙k', 'xiaohongshu'), /xiaohongshu\.com\/search_result\?keyword=/);
  assert.match(platform.searchUrl('宇宙k', 'douyin'), /douyin\.com\/search\/.+type=live/);
  assert.equal(platform.parseInput('570321613446566013', 'xiaohongshu').url, 'https://www.xiaohongshu.com/livestream/570321613446566013');
});

test('接受分享文字并拒绝错误平台、伪造域名和非直播小红书链接', () => {
  assert.equal(platform.parseInput('来看直播 https://xhslink.com/a/abc 复制打开', 'xiaohongshu').url, 'https://xhslink.com/a/abc');
  for (const url of ['https://xiaohongshu.com.evil.test/livestream/123', 'https://www.xiaohongshu.com/user/profile/abc', 'https://live.douyin.com/123456']) {
    assert.equal(platform.parseInput(url, 'xiaohongshu').kind, 'invalid');
  }
});

test('官方搜索选择直播页或直播 deeplink 才上墙', () => {
  assert.equal(platform.selectedRoomUrl('xhsdiscover://live_audience?room_id=570321613446566013', 'xiaohongshu'), 'https://www.xiaohongshu.com/livestream/570321613446566013');
  assert.equal(platform.selectedRoomUrl('https://www.xiaohongshu.com/search_result?keyword=宇宙k', 'xiaohongshu'), '');
  assert.equal(platform.selectedRoomUrl('https://www.xiaohongshu.com/user/profile/abc', 'xiaohongshu'), '');
  assert.equal(platform.selectedRoomUrl('https://live.douyin.com/123456', 'douyin'), 'https://live.douyin.com/123456');
});

test('迁移旧配置并保留主动清空的平台库，切换互不覆盖', () => {
  const old = { library: [{ id: 'a', url: 'https://live.douyin.com/123456' }], wall: ['a'], cols: '3' };
  const store = platform.restoreStore(old);
  assert.equal(store.activePlatform, 'douyin');
  assert.deepEqual(store.profiles.douyin, old);
  assert.equal(store.profiles.xiaohongshu, undefined);
  const saved = platform.saveProfile(store, 'xiaohongshu', { library: [], wall: [] });
  assert.deepEqual(saved.profiles.douyin, old);
  assert.deepEqual(platform.restoreStore(saved).profiles.xiaohongshu.library, []);
  assert.equal(store.activePlatform, 'douyin');
});
