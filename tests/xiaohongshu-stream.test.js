const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLivePage, parseLiveState, resolveStream } = require('../lib/xiaohongshu-stream');

function page(roomInfo, extra = {}) {
  return `<script>window.__INITIAL_STATE__=${JSON.stringify({ liveStream: { liveStatus: 'success', roomData: { roomInfo }, ...extra } })};</script>`;
}
const streams = { h264: ['HD', 'SD', 'LD'].map((quality_type) => ({ quality_type, master_url: `https://live-play.xhscdn.com/live/${quality_type}.flv?token=abc` })) };

test('区分在线人数、累计观看和点赞，保留零人数', () => {
  for (const count of ['100+', 0]) {
    const result = parseLivePage(page({ pullConfig: streams, viewerInfoDisplayType: 0, displayMemberCount: count, displayViewerCount: '1万+', displayPraiseCount: '10万+' }), '123');
    assert.equal(result.userCount, String(count));
    assert.equal(result.countLabel, '在线');
  }
  const total = parseLivePage(page({ pullConfig: streams, displayViewerCount: '1万+' }), '123');
  assert.equal(total.userCount, '1万+');
  assert.equal(total.countLabel, '人看过');
  assert.equal(parseLivePage(page({ pullConfig: streams, displayPraiseCount: '10万+' }), '123').userCount, '');
});

test('官方页面 liveStatus=end 表示直播已结束', () => {
  const result = parseLivePage(page({}, { liveStatus: 'end' }), '570321613446566013');
  assert.equal(result.status, 'offline');
});

test('旧场次保留原主播名字，绝不把推荐房间当作当前直播', () => {
  const result = parseLivePage(page({}, { liveStatus: 'end',
    roomData: { hostInfo: { nickName: '宇宙-K' }, roomInfo: { status: 3 } },
    nextRoomInfo: { nickName: '其他主播', pullConfig: streams },
  }), '123');
  assert.equal(result.status, 'offline');
  assert.equal(result.anchorName, '宇宙-K');
  assert.equal(result.flvUrl, undefined);
});

test('保留同画质备用 CDN；h264 空时支持 h265', () => {
  const urls = ['https://live.xhscdn.com/main.flv', 'https://backup.xhscdn.com/main.flv'];
  const entries = urls.map(master_url => ({ master_url, quality_type: 'HD' }));
  for (const config of [{ h264: entries }, { h264: [], h265: entries }]) {
    const result = parseLivePage(page({ pullConfig: config }), '123');
    assert.equal(result.ok, true);
    assert.deepEqual(result.flvCandidates.map(item => item.url), urls);
  }
});

test('优先 HTTPS 多路传输并保留 HTTP 兼容回退，不编造低画质地址', () => {
  const result = parseLivePage(page({ pullConfig: { h264: [
    { master_url: 'http://live-source-play.xhscdn.com/123.flv?token=abc', quality_type: 'HD' },
    { master_url: 'http://backup.xhscdn.com/123.flv?token=abc', quality_type: 'HD' },
  ] } }), '123', 'fluent');
  assert.equal(result.flvUrl, 'https://live-source-play.xhscdn.com/123.flv?token=abc');
  assert.deepEqual(result.flvCandidates.map(x => x.url), [
    'https://live-source-play.xhscdn.com/123.flv?token=abc', 'https://backup.xhscdn.com/123.flv?token=abc',
    'http://live-source-play.xhscdn.com/123.flv?token=abc', 'http://backup.xhscdn.com/123.flv?token=abc',
  ]);
  assert.equal(result.quality, 'HD');
});

test('解析真实字段形状的 FLV 流并尊重所选清晰度', () => {
  const html = page({ roomTitle: '宇宙k', pullConfig: JSON.stringify(streams), deeplink: 'xhsdiscover://live_audience?host_nickname=宇宙k' });
  const result = parseLivePage(html, '570321613446566013', 'sd');
  assert.equal(result.ok, true);
  assert.match(result.flvUrl, /SD\.flv\?token=abc/);
  assert.equal(result.anchorName, '宇宙k');
  assert.equal(result.webRid, '570321613446566013');
});

test('桌面官方 streams 配置按码率选择流畅档，原画仍使用原画地址', () => {
  const live = { liveStatus: 'success', roomData: { hostInfo: { nickName: '宇宙-S1', userId: 'host-s1' },
    roomInfo: { pullConfig: JSON.stringify({ streams: [
      { default_stream: 1, quality_type: 'HCV5402', max_bitrate: 6000000, master_url: 'http://live-source-play.xhscdn.com/live/123_hcv5402.flv' },
      { quality_type: 'HCV520', max_bitrate: 2000000, master_url: 'http://live-source-play.xhscdn.com/live/123_hcv520.flv',
        backup_urls: ['http://backup.xhscdn.com/live/123_hcv520.flv', 'https://evil.example/stream.flv'] },
      { quality_type: 'FLV', quality_type_name: '原画', max_bitrate: 3500000, master_url: 'http://live-source-play.xhscdn.com/live/123.flv' },
    ] }) } } };
  const fluent = parseLiveState(live, '123', 'fluent');
  assert.equal(fluent.ok, true);
  assert.equal(fluent.selectedBitrate, 2000000);
  assert.equal(fluent.anchorId, 'host-s1');
  assert.match(fluent.flvUrl, /_hcv520\.flv$/);
  assert.match(fluent.flvCandidates[1].url, /backup\.xhscdn/);
  assert.ok(fluent.flvCandidates.some(item => /\/123\.flv$/.test(item.url)), '编码不支持时保留原画回退');
  assert.ok(fluent.flvCandidates.every(item => !item.url.includes('evil.example')));
  assert.match(parseLiveState(live, '123', 'sd').flvUrl, /_hcv520\.flv$/);
  assert.match(parseLiveState(live, '123', 'hd').flvUrl, /_hcv5402\.flv$/);
  assert.match(parseLiveState(live, '123', 'origin').flvUrl, /\/123\.flv$/);
});

test('登录墙、未知状态、缺流不能误报下播，也不执行远端脚本', () => {
  for (const html of ['登录后查看', page({}, { liveStatus: 'error' }), page({}), '<script>window.__INITIAL_STATE__=(()=>{throw 1})()</script>']) {
    const result = parseLivePage(html, '123');
    assert.equal(result.ok, false);
    assert.equal(result.status, 'unknown');
  }
});

test('替换 undefined 仅处理 JSON 值，保留字符串内容', () => {
  const html = page({ roomTitle: 'undefined 乐队', pullConfig: streams }).replace('"roomData":', '"missing":undefined,"roomData":');
  assert.equal(parseLivePage(html, '123').title, 'undefined 乐队');
});

test('分享短链重定向解析房间号并保留认证参数', async () => {
  const requests = [];
  const result = await resolveStream(async (url) => {
    requests.push(url);
    return requests.length === 1
      ? { status: 302, headers: { get: () => 'https://www.xiaohongshu.com/livestream/570321613446566013?xsec_token=test' } }
      : { status: 200, text: async () => page({ pullConfig: streams }) };
  }, 'https://xhslink.com/a/test');
  assert.equal(result.ok, true);
  assert.match(requests[1], /xsec_token=test/);
});

test('分享重定向到外部域名时停止请求', async () => {
  let count = 0;
  const result = await resolveStream(async () => { count++; return { status: 302, headers: { get: () => 'https://example.com/' } }; }, 'https://xhslink.com/a/test');
  assert.equal(result.ok, false);
  assert.equal(count, 1);
});
