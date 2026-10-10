'use strict';

const { parseInput, isPlatformUrl, selectedRoomUrl } = require('./live-platform');

// 小红书直播分享页按客户端标识返回 pullConfig，桌面页面可能不包含流信息。
const PAGE_HEADERS = Object.freeze({
  'User-Agent': 'ios/7.830 (ios 17.0; ; iPhone 15 (A2846/A3089/A3090/A3092))',
  'xy-common-params': 'platform=iOS',
  Referer: 'https://www.xiaohongshu.com/',
});

function failure(message) {
  return { ok: false, status: 'unknown', message };
}

function audienceCount(info) {
  const value = (count) => count === 0 ? '0' : typeof count === 'string' || typeof count === 'number' ? String(count).trim() : '';
  // 官方 viewerInfoDisplayType 枚举：0 为在线人数，1 为看过人数，3 为累计观看人次。
  if (info.viewerInfoDisplayType === 0 && value(info.displayMemberCount)) {
    return { userCount: value(info.displayMemberCount), countLabel: '在线' };
  }
  if (info.viewerInfoDisplayType === 3 && value(info.pv)) {
    return { userCount: value(info.pv), countLabel: '观看人次' };
  }
  return { userCount: value(info.displayViewerCount), countLabel: '人看过' };
}

function parseLivePage(html, roomId, quality = 'hd') {
  const match = String(html).match(/window\.__INITIAL_STATE__\s*=\s*([\s\S]*?)<\/script>/i);
  if (!match) return failure('未获取到小红书直播数据，请打开详情检查登录或验证提示');
  let data;
  try {
    // 只替换字符串外的 undefined，不执行页面提供的 JavaScript。
    const json = match[1].trim().replace(/;\s*$/, '').replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g, (token) => token === 'undefined' ? 'null' : token);
    data = JSON.parse(json);
  } catch { return failure('小红书直播数据格式无法识别'); }
  return parseLiveState(data.liveStream, roomId, quality);
}

function parseLiveState(live, roomId, quality = 'hd') {
  if (!live) return failure('页面未提供直播信息，请确认所选主播正在直播');
  const info = live.roomData && live.roomData.roomInfo;
  const anchorName = live.roomData && live.roomData.hostInfo && live.roomData.hostInfo.nickName || '';
  // 仅依据明确结束状态；缺少数据、登录失败和风控都保留为未知。
  if (live.liveStatus === 'end') return { ok: false, status: 'offline', webRid: roomId, anchorName };
  if (live.liveStatus !== 'success' || !info) return failure('小红书暂未返回直播信息，请打开详情检查');
  let config;
  try { config = typeof info.pullConfig === 'string' ? JSON.parse(info.pullConfig) : info.pullConfig; }
  catch { return failure('小红书直播流信息无法识别'); }
  const desktop = config && Array.isArray(config.streams);
  const candidates = config && (desktop ? [...config.streams, ...(Array.isArray(config.EF4_streams) ? config.EF4_streams : [])]
    : [...(Array.isArray(config.h264) ? config.h264 : []), ...(Array.isArray(config.h265) ? config.h265 : [])]);
  const streams = (Array.isArray(candidates) ? candidates : []).filter((item) => {
    try {
      const url = new URL(item.master_url);
      return ['https:', 'http:'].includes(url.protocol)
        && (url.hostname === 'xhscdn.com' || url.hostname.endsWith('.xhscdn.com'))
        && /\.flv$/i.test(url.pathname);
    } catch { return false; }
  });
  const preferences = quality === 'fluent' ? ['LD', 'SD', 'HD'] : quality === 'sd' ? ['SD', 'LD', 'HD'] : ['HD', 'SD', 'LD'];
  const ranked = streams.slice().sort((a, b) => (Number(a.max_bitrate) || Infinity) - (Number(b.max_bitrate) || Infinity));
  const stream = desktop
    ? (['fluent', 'sd'].includes(quality) ? ranked[0]
      : quality === 'origin' ? streams.find((item) => /原画/.test(item.quality_type_name || '') || item.quality_type === 'FLV') || ranked.at(-1)
        : streams.find((item) => item.default_stream === 1) || ranked[0])
    : preferences.map((key) => streams.find((item) => item.quality_type === key)).find(Boolean) || streams[0];
  if (!stream) return failure('小红书未提供可播放的 FLV 直播流，请打开详情确认直播状态');
  let resolvedName = anchorName;
  try { resolvedName ||= new URL(info.deeplink).searchParams.get('host_nickname') || ''; } catch {}
  const ordered = desktop ? [stream, ...ranked.filter((item) => item !== stream)]
    : [stream, ...streams.filter((item) => item !== stream && item.quality_type === stream.quality_type)];
  const urls = [...new Set(ordered.flatMap((item) => [item.master_url, ...(Array.isArray(item.backup_urls) ? item.backup_urls : [])]))].filter((value) => {
    try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol)
      && (u.hostname === 'xhscdn.com' || u.hostname.endsWith('.xhscdn.com')) && /\.flv$/i.test(u.pathname); }
    catch { return false; }
  });
  // 官方仍返回 HTTP 地址；HTTPS 主线路支持 HTTP/2，避免多路长连接挤满同域连接槽。
  // 保留原地址作为兼容回退，不构造不存在的低画质流。
  const flvCandidates = [...new Set([...urls.map((url) => url.replace(/^http:/i, 'https:')), ...urls])].map((url) => ({ url }));
  return { ok: true, status: 'live', webRid: roomId, flvUrl: flvCandidates[0].url, flvCandidates, title: info.roomTitle || '', anchorName: resolvedName,
    anchorId: live.roomData.hostInfo && live.roomData.hostInfo.userId || '',
    quality: stream.quality_type, selectedBitrate: Number(stream.max_bitrate) || null, ...audienceCount(info) };
}

async function resolveStream(fetchPage, input, { quality = 'hd' } = {}) {
  const parsed = parseInput(input, 'xiaohongshu');
  if (parsed.kind !== 'live') return failure('请搜索主播名称或填写小红书直播分享链接');
  let url = parsed.url;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!isPlatformUrl(url, 'xiaohongshu')) return failure('小红书分享链接跳转到了其他网站');
      const response = await fetchPage(url, { headers: PAGE_HEADERS, redirect: 'manual', signal: AbortSignal.timeout(15000) });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return failure('小红书分享链接缺少跳转地址');
        url = new URL(location, url).href;
        continue;
      }
      if (response.status !== 200) return failure(`小红书请求失败（HTTP ${response.status}），请检查登录与网络`);
      if (!selectedRoomUrl(url, 'xiaohongshu')) return failure('该分享链接不是直播间，请从搜索结果进入正在直播的主播');
      const roomId = new URL(url).pathname.match(/livestream\/(\d+)/)[1];
      return { ...parseLivePage(await response.text(), roomId, quality), roomUrl: url };
    }
    return failure('小红书分享链接跳转次数过多');
  } catch { return failure('小红书连接失败，请检查网络或稍后刷新'); }
}

module.exports = { PAGE_HEADERS, parseLivePage, parseLiveState, resolveStream };
