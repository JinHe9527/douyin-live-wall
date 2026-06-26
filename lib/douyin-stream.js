'use strict';

// 抖音直播取流器。
// 设计：主进程持有一个常驻隐藏 webContents 停在 https://live.douyin.com/ ，
// 借它的真实 origin + ttwid cookie，在页面内 fetch web/enter 接口拿 stream_url.flv_pull_url。
// 双路径：① in-page fetch（主） ② 页面已渲染 stream_url 抓取（兜底，规避 a_bogus 签名）。
//
// 对外只暴露 resolveStream(runJs, navigate, roomUrlOrRid, opts)：
//   - runJs(codeString) => Promise<any>   通常是 webContents.executeJavaScript(code, true)
//   - navigate(url) => Promise<void>       通常是 webContents.loadURL(url) + did-finish-load 等待
// 解耦 electron，便于单测。

// 我方画质档 → 抖音 flv_pull_url 的 key 优先级。抖音常见 key：
// FULL_HD1(原画/蓝光) > HD1(高清) > SD1(标清) > SD2(流畅)
const QUALITY_KEY_PREFERENCE = {
  origin: ['FULL_HD1', 'HD1', 'SD1', 'SD2'],
  hd: ['HD1', 'FULL_HD1', 'SD1', 'SD2'],
  sd: ['SD1', 'SD2', 'HD1', 'FULL_HD1'],
  fluent: ['SD2', 'SD1', 'HD1', 'FULL_HD1'],
};

const ENTER_API_PARAMS = {
  aid: '6383',
  app_name: 'douyin_web',
  live_id: '1',
  device_platform: 'web',
  language: 'zh-CN',
  browser_language: 'zh-CN',
  browser_platform: 'Win32',
  browser_name: 'Chrome',
  browser_version: '120.0.0.0',
  msToken: '',
};

// 从直播间链接或裸 id 提取 web_rid（即 live.douyin.com/{这个}）。
// 覆盖：live.douyin.com/{rid}、www.douyin.com/follow/live/{rid}、?room_id=/web_rid=、裸号。
function extractWebRid(input) {
  if (input == null) return '';
  const str = String(input).trim();
  if (!str) return '';
  // 纯数字 id
  if (/^\d+$/.test(str)) return str;
  try {
    const url = new URL(str.startsWith('http') ? str : `https://live.douyin.com/${str}`);
    if (/(^|\.)douyin\.com$/i.test(url.hostname)) {
      const segs = url.pathname.split('/').filter(Boolean);
      // 1) 路径里第一个 ≥6 位数字段（兼容 /{rid}、/follow/live/{rid}）
      const numericSeg = segs.find((s) => /^\d{6,}$/.test(s));
      if (numericSeg) return numericSeg;
      // 2) query 里的房间号
      const fromQuery = url.searchParams.get('room_id') || url.searchParams.get('web_rid');
      if (fromQuery) return fromQuery;
      // 3) 兜底：首段（可能是字母 id），但排除已知的路由词
      if (segs[0] && !/^(user|follow|live|video|share)$/i.test(segs[0])) return segs[0];
    }
  } catch {
    /* not a url */
  }
  return str;
}

function buildEnterApiUrl(webRid) {
  const params = new URLSearchParams({ ...ENTER_API_PARAMS, web_rid: webRid });
  return `https://live.douyin.com/webcast/room/web/enter/?${params.toString()}`;
}

// 是否主播主页链接（douyin.com/user/{secUid}）——需先解析出他正在播的直播间。
function isProfileUrl(input) {
  return /douyin\.com\/user\//i.test(String(input || ''));
}

// 在主播主页里找他正在直播的直播间链接（live.douyin.com/{rid}），优先「直播中」。
// 来源：复用老软件 USER_PAGE_LIVE_ROOM_DOM_SCRIPT 思路。
const PROFILE_LIVE_ROOM_SCRIPT = `(() => {
  const norm = (href) => {
    try {
      const u = new URL(href);
      if (!/live\\.douyin\\.com$/i.test(u.hostname)) return '';
      if (/\\/\\d+/.test(u.pathname)) return u.origin + u.pathname;
      const rid = u.searchParams.get('room_id');
      return rid ? 'https://live.douyin.com/' + rid : '';
    } catch { return ''; }
  };
  const collect = () => {
    const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 300).map((n) => ({
      href: n.href || n.getAttribute('href') || '',
      text: String(n.innerText || n.textContent || '').trim(),
    }));
    const live = links.map((it) => ({ ...it, roomUrl: norm(it.href) })).filter((it) => it.roomUrl);
    const pick = live.find((it) => it.text.includes('直播中'))
      || live.find((it) => it.href.includes('enter_method=web_homepage_head') || it.href.includes('room_id='))
      || live[0];
    return pick && pick.roomUrl ? { roomUrl: pick.roomUrl } : { roomUrl: '' };
  };
  const now = collect();
  if (now.roomUrl) return { __ok: true, roomUrl: now.roomUrl };
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => { if (settled) return; settled = true; try { obs.disconnect(); } catch {} clearTimeout(t); resolve(r); };
    const root = document.documentElement || document.body;
    if (!root) return finish({ __ok: false, roomUrl: '' });
    const tick = () => { const r = collect(); if (r.roomUrl) finish({ __ok: true, roomUrl: r.roomUrl }); };
    const obs = new MutationObserver(tick);
    obs.observe(root, { childList: true, subtree: true, attributes: true });
    const t = setTimeout(() => finish({ __ok: false, roomUrl: '' }), 7000);
    tick();
  });
})()`;

// 从 room_data.stream_url 里挑出我方各档 flv/hls 地址映射。
function normalizeStreamUrls(streamUrl) {
  const flvMap = (streamUrl && streamUrl.flv_pull_url) || {};
  const hlsMap = (streamUrl && streamUrl.hls_pull_url_map) || {};
  return { flv: { ...flvMap }, hls: { ...hlsMap } };
}

// 在给定 flvMap 里按画质偏好选一个可用地址。
function pickFlv(flvMap, quality) {
  const pref = QUALITY_KEY_PREFERENCE[quality] || QUALITY_KEY_PREFERENCE.hd;
  for (const key of pref) {
    if (flvMap && flvMap[key]) return { key, url: flvMap[key] };
  }
  // 偏好都没命中，取 map 里第一个
  const keys = Object.keys(flvMap || {});
  if (keys.length) return { key: keys[0], url: flvMap[keys[0]] };
  return { key: '', url: '' };
}

// 解析 web/enter 接口返回的 JSON（已是 JS 对象）成统一结构。
function parseEnterPayload(payload) {
  const data = payload && payload.data;
  if (!data || !data.data || !data.data.length) {
    return { ok: false, status: 'unknown', reason: 'empty-room-data' };
  }
  const room = data.data[0];
  const user = data.user || {};
  const status = room.status === 2 ? 'live' : 'ended';
  if (status !== 'live' || !room.stream_url) {
    return {
      ok: status === 'live',
      status: status === 'live' ? 'live' : 'ended',
      anchorName: user.nickname || '',
      title: room.title || '',
      flv: {},
      hls: {},
      userCount: '',
      reason: room.stream_url ? '' : 'no-stream-url',
    };
  }
  const { flv, hls } = normalizeStreamUrls(room.stream_url);
  const userCount =
    (room.room_view_stats && room.room_view_stats.display_value) ||
    room.user_count_str ||
    (typeof room.user_count === 'number' ? String(room.user_count) : '') ||
    '';
  return {
    ok: Object.keys(flv).length > 0,
    status: 'live',
    anchorName: user.nickname || '',
    title: room.title || '',
    flv,
    hls,
    userCount: String(userCount),
  };
}

// —— 路径①：页面内 fetch web/enter —— //
function buildInPageFetchScript(webRid) {
  const api = buildEnterApiUrl(webRid);
  // 在 live.douyin.com 页面上下文执行：带 cookie 同源请求。
  return `(async () => {
    try {
      const res = await fetch(${JSON.stringify(api)}, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json, text/plain, */*' },
      });
      const text = await res.text();
      if (!text) return { __ok: false, __reason: 'empty-response' };
      let json;
      try { json = JSON.parse(text); }
      catch (e) { return { __ok: false, __reason: 'risk-control-or-html' }; }
      return { __ok: true, __json: json };
    } catch (e) {
      return { __ok: false, __reason: String(e && e.message || e) };
    }
  })()`;
}

// —— 路径②：从已渲染页面抓 stream_url —— //
// 抖音直播页把房间数据塞在若干全局/脚本里，结构跨版本会变，这里做宽松搜索：
// 扫所有 script 文本，找含 flv_pull_url 的 JSON 片段并尝试解析出 stream_url。
const PAGE_SCRAPE_SCRIPT = `(() => {
  try {
    const found = { flv: {}, hls: {}, status: 'unknown', title: '', anchorName: '', userCount: '' };
    const html = document.documentElement ? document.documentElement.innerHTML : '';
    // 直接正则抓 flv_pull_url 块
    const grab = (text) => {
      if (!text || text.indexOf('flv_pull_url') === -1) return;
      // 抓 "flv_pull_url":{...} 这一段（到第一个右花括号配平）
      const idx = text.indexOf('"flv_pull_url"');
      if (idx === -1) return;
      let i = text.indexOf('{', idx);
      if (i === -1) return;
      let depth = 0, end = -1;
      for (let j = i; j < text.length; j++) {
        const c = text[j];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end === -1) return;
      let frag = text.slice(i, end + 1);
      try {
        // 可能含转义，逐步反转义尝试
        let obj;
        try { obj = JSON.parse(frag); }
        catch (_) { obj = JSON.parse(frag.replace(/\\\\u002F/g, '/').replace(/\\\\\\//g, '/').replace(/\\\\"/g, '"')); }
        if (obj && typeof obj === 'object') {
          for (const k of Object.keys(obj)) {
            if (typeof obj[k] === 'string' && obj[k].indexOf('http') === 0) found.flv[k] = obj[k];
          }
        }
      } catch (_) {}
    };
    grab(html);
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) { if (Object.keys(found.flv).length) break; grab(s.textContent || ''); }
    found.status = Object.keys(found.flv).length ? 'live' : 'unknown';
    const titleEl = document.querySelector('[data-e2e="live-room-title"], .title, h1');
    if (titleEl) found.title = (titleEl.textContent || '').trim();
    const nickEl = document.querySelector('[data-e2e="live-room-nickname"]');
    if (nickEl) found.anchorName = (nickEl.textContent || '').trim();
    return { __ok: Object.keys(found.flv).length > 0, __scrape: found };
  } catch (e) {
    return { __ok: false, __reason: String(e && e.message || e) };
  }
})()`;

/**
 * 解析一个直播间，返回统一结构。
 * @param {object} ctx
 *   - apiRunJs(code): 在「常驻不导航」页执行 JS（用于 web/enter 接口 fetch，可并行）
 *   - withNav(fn): 拿到「导航页」的串行锁，回调签名 (navigate, navRunJs) => Promise，用于主页解析/兜底抓取
 * @param {string} roomUrlOrRid
 * @param {{quality?:string}} [opts]
 */
async function resolveStream(ctx, roomUrlOrRid, opts = {}) {
  const quality = opts.quality || 'hd';
  let target = roomUrlOrRid;
  const fromProfile = isProfileUrl(roomUrlOrRid);

  // 主播主页链接 → 先在主页里找到他正在播的直播间（导航类，走串行导航页）
  if (fromProfile) {
    try {
      const roomUrl = await ctx.withNav(async (navigate, navRunJs) => {
        await navigate(String(roomUrlOrRid));
        const pr = await navRunJs(PROFILE_LIVE_ROOM_SCRIPT);
        return pr && pr.__ok ? pr.roomUrl : '';
      });
      if (roomUrl) {
        target = roomUrl;
      } else {
        return { ok: false, status: 'offline', reason: 'not-live', webRid: '', isProfile: true };
      }
    } catch (err) {
      return { ok: false, status: 'unknown', reason: `profile-throw:${err && err.message}`, webRid: '', isProfile: true };
    }
  }

  const webRid = extractWebRid(target);
  if (!webRid) {
    return { ok: false, status: 'unknown', reason: 'no-web-rid', webRid: '' };
  }

  // 路径①：常驻页 fetch web/enter（并行，快）
  let result = null;
  try {
    const res = await ctx.apiRunJs(buildInPageFetchScript(webRid));
    if (res && res.__ok && res.__json) {
      result = parseEnterPayload(res.__json);
      result.via = 'api';
    } else {
      result = { ok: false, status: 'unknown', reason: (res && res.__reason) || 'api-failed' };
    }
  } catch (err) {
    result = { ok: false, status: 'unknown', reason: `api-throw:${err && err.message}` };
  }

  // 路径②兜底：导航到房间页抓取（导航类，走串行导航页）
  if ((!result || !result.ok) && typeof ctx.withNav === 'function') {
    try {
      const scraped = await ctx.withNav(async (navigate, navRunJs) => {
        await navigate(`https://live.douyin.com/${webRid}`);
        return await navRunJs(PAGE_SCRAPE_SCRIPT);
      });
      if (scraped && scraped.__ok && scraped.__scrape) {
        const s = scraped.__scrape;
        result = {
          ok: true,
          status: 'live',
          anchorName: s.anchorName || '',
          title: s.title || '',
          flv: s.flv || {},
          hls: s.hls || {},
          userCount: s.userCount || '',
          via: 'scrape',
        };
      }
    } catch (err) {
      if (result) result.scrapeReason = `scrape-throw:${err && err.message}`;
    }
  }

  if (!result) result = { ok: false, status: 'unknown', reason: 'all-paths-failed' };
  result.webRid = webRid;

  if (result.ok && result.flv) {
    const picked = pickFlv(result.flv, quality);
    result.flvUrl = picked.url;
    result.flvKey = picked.key;
    result.quality = quality;
  }
  return result;
}

module.exports = {
  extractWebRid,
  buildEnterApiUrl,
  parseEnterPayload,
  normalizeStreamUrls,
  pickFlv,
  resolveStream,
  isProfileUrl,
  QUALITY_KEY_PREFERENCE,
};
