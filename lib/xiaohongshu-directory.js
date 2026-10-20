'use strict';

const { parseLiveState } = require('./xiaohongshu-stream');

// 官方直播广场允许游客翻页。只用精确主播身份命中，列表缺失不作为下播证据。
function squareCandidates(feeds) {
  const result = new Map();
  for (const item of Array.isArray(feeds) ? feeds : []) {
    const live = item?.live;
    const room = live?.tRoomInfo;
    const host = live?.tLiveHostInfo;
    if (!room || !host) continue;
    // roomId 是超出 JS 安全整数的数字，必须优先用官方 roomIdStr。
    let id = room.roomIdStr;
    if (!id && typeof room.roomId === 'string') id = room.roomId;
    if (!id && Number.isSafeInteger(room.roomId)) id = String(room.roomId);
    if (typeof id !== 'string' || !/^\d+$/.test(id)) continue;
    const anchorId = typeof host.userId === 'string' ? host.userId : '';
    const title = String(host.nickname || '').trim();
    if (!anchorId || !title) continue;
    const url = new URL(`https://www.xiaohongshu.com/livestream/${id}`);
    url.searchParams.set('source', 'live_web_square');
    if (typeof room.xsecToken === 'string' && room.xsecToken) url.searchParams.set('xsec_token', room.xsecToken);
    let streamConfig;
    try {
      const extra = typeof live.roomExtraInfo === 'string' ? JSON.parse(live.roomExtraInfo) : null;
      const raw = extra?.live_stream_info;
      const config = typeof raw === 'string' ? JSON.parse(raw) : null;
      // 嵌套 JSON 的 room_id 也超出安全整数，校验原始十进制串而不是舍入后的数字。
      const streamRoomId = raw?.match(/"room_id"\s*:\s*"?(\d+)"?(?=\s*[,}])/s)?.[1];
      if (streamRoomId === id && config?.media?.host_id === anchorId) {
        streamConfig = { streams: config.streams, EF4_streams: config.EF4_streams };
      }
    } catch {}
    result.set(id, { id, anchorId, title, roomUrl: url.href, isLive: true,
      ...(streamConfig ? { streamConfig, roomTitle: String(room.name || '') } : {}) });
  }
  return [...result.values()];
}

const SNAPSHOT = `(() => {
  const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
  const store = pinia?._s.get('liveList');
  const loggedIn = pinia?._s.get('user')?.loggedIn;
  if (!store || typeof loggedIn !== 'boolean') return {ready:false};
  if (store.isFetching) return {ready:true, loggedIn, fetching:true};
  const seen = window.__liveWallSquareSeen || (window.__liveWallSquareSeen = new Set());
  const feeds = store.liveList.filter(item => {
    const id = item?.live?.tRoomInfo?.roomIdStr;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return {ready:true, loggedIn, fetching:store.isFetching, error:store.isError,
    noMore:store.noMore, candidates:(${squareCandidates.toString()})(feeds)};
})()`;
const NEXT_PAGE = `(async () => {
  const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
  const store = pinia?._s.get('liveList');
  if (store && !store.isFetching && pinia._s.get('user')?.loggedIn === false) await store.fetchLiveList();
  return ${SNAPSHOT};
})()`;

function createXiaohongshuDirectory({ BrowserWindow, getSession, userAgent, prepareWindow = () => {},
  now = Date.now, timeoutMs = 90000, cooldownMs = 60000, cacheTtlMs = 120000, maxPages = 60, pageDelayMs = 500 }) {
  const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
  const cache = new Map();
  let active = null, stopped = false, retryAt = -Infinity;

  function candidates() {
    for (const [id, item] of cache) if (now() - item.at >= cacheTtlMs) cache.delete(id);
    return [...cache.values()].map(item => item.candidate);
  }
  function matches(items, request) {
    return items.filter(item => (request.anchorId
      ? item.anchorId === request.anchorId : normalize(item.title) === normalize(request.name))
      && item.roomUrl.split('?')[0] !== String(request.previousRoomUrl || '').split('?')[0]);
  }
  function result(status = 'success', message) {
    return { status, candidates: candidates(), source: 'guest_square', ...(message ? { message } : {}) };
  }
  function publish(run, items) {
    for (const item of items) cache.set(item.anchorId, { candidate: item, at: now() });
    const available = candidates();
    for (const request of [...run.waiters]) {
      if (matches(available, request).length) {
        run.waiters.delete(request);
        request.resolve(result());
      }
    }
  }
  function finish(run, error) {
    if (run.done) return;
    run.done = true;
    clearTimeout(run.deadline);
    if (active === run) { active = null; retryAt = now() + (error ? Math.min(cooldownMs, 10000) : cooldownMs); }
    const response = error ? result('error', '游客直播广场暂未完成查询') : result();
    for (const request of run.waiters) request.resolve(response);
    run.waiters.clear();
    try { if (run.win && !run.win.isDestroyed()) run.win.destroy(); } catch {}
  }
  async function read(run, expression) {
    if (run.done || stopped || run.win.isDestroyed()) throw new Error('directory-stopped');
    const response = await run.win.webContents.debugger.sendCommand('Runtime.evaluate', {
      expression: `(async()=>JSON.stringify(await (${expression})))()`,
      returnByValue: true, awaitPromise: true,
    });
    if (response.exceptionDetails) throw new Error('directory-page-error');
    return JSON.parse(response.result.value);
  }
  async function scan(run) {
    try {
      const win = new BrowserWindow({ show: false, width: 1100, height: 850,
        webPreferences: { session: getSession(), contextIsolation: true, nodeIntegration: false,
          sandbox: true, backgroundThrottling: false } });
      run.win = win;
      if (userAgent) win.webContents.setUserAgent(userAgent);
      win.webContents.setAudioMuted(true);
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      prepareWindow(win);
      for (const event of ['will-navigate', 'will-redirect']) {
        win.webContents.on(event, (e, target) => {
          try { if (new URL(target).origin !== 'https://www.xiaohongshu.com') e.preventDefault(); }
          catch { e.preventDefault(); }
        });
      }
      win.on('unresponsive', () => finish(run, true));
      win.webContents.once('render-process-gone', () => finish(run, true));
      win.once('closed', () => { run.win = null; finish(run, true); });
      await win.loadURL('https://www.xiaohongshu.com/livelist?channel_id=0');
      if (run.done) return;
      win.webContents.debugger.attach('1.3');
      let pages = 0, stalled = 0, shouldFetch = false;
      const seen = new Set();
      while (!run.done && pages < maxPages) {
        const page = await read(run, shouldFetch ? NEXT_PAGE : SNAPSHOT);
        if (run.done) return;
        if (!page.ready || page.fetching) {
          await new Promise(resolve => setTimeout(resolve, 250));
          continue;
        }
        if (page.loggedIn !== false) throw new Error('directory-not-guest');
        let added = 0;
        for (const item of page.candidates || []) {
          if (!seen.has(item.id)) { seen.add(item.id); added++; }
        }
        publish(run, page.candidates || []);
        if (page.error) throw new Error('directory-fetch-error');
        if (shouldFetch) { pages++; stalled = added ? 0 : stalled + 1; }
        if (page.noMore || stalled >= 3) break;
        shouldFetch = true;
        await new Promise(resolve => setTimeout(resolve, pageDelayMs));
      }
      finish(run);
    } catch { finish(run, true); }
  }
  function search(name, { anchorId, previousRoomUrl } = {}) {
    if (stopped) return Promise.resolve({ status: 'cancelled', candidates: [] });
    const request = { name, anchorId, previousRoomUrl };
    if (matches(candidates(), request).length) return Promise.resolve(result());
    if (!active && now() < retryAt) return Promise.resolve(result());
    return new Promise(resolve => {
      request.resolve = resolve;
      if (active) { active.waiters.add(request); return; }
      const run = { done: false, waiters: new Set([request]), win: null };
      active = run;
      run.deadline = setTimeout(() => finish(run, true), timeoutMs);
      void scan(run);
    });
  }
  return { search, stop() { stopped = true; if (active) finish(active, true); cache.clear(); } };
}

function resolveDirectoryCandidate(candidate, quality) {
  if (!candidate?.streamConfig) return { ok: false };
  return parseLiveState({ liveStatus: 'success', roomData: {
    hostInfo: { userId: candidate.anchorId, nickName: candidate.title },
    roomInfo: { pullConfig: candidate.streamConfig, roomTitle: candidate.roomTitle },
  } }, candidate.id, quality);
}

module.exports = { squareCandidates, resolveDirectoryCandidate, createXiaohongshuDirectory };
