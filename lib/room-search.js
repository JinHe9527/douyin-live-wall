'use strict';

const { PLATFORMS, normalizePlatform, searchUrl, isPlatformUrl } = require('./live-platform');
const { CANDIDATE_SCRAPE_SCRIPT, normalizeCandidates } = require('./douyin-candidate');

function xiaohongshuCandidates(data) {
  const results = new Map();
  const get = (object, camel, snake) => object && (object[camel] ?? object[snake]);
  function add(live, host) {
    if (!live || !host) return;
    const roomToken = get(live, 'roomIdToken', 'room_id_token');
    const rawId = get(roomToken, 'roomId', 'room_id') || get(live, 'roomId', 'room_id');
    if (typeof rawId === 'number' && !Number.isSafeInteger(rawId)) return;
    const id = String(rawId || '');
    const title = String(host.nickname || host.nickName || host.nick_name || host.name || '').trim();
    if (!/^\d+$/.test(id) || !title || results.has(id)) return;
    const url = new URL(`https://www.xiaohongshu.com/livestream/${id}`);
    url.searchParams.set('source', 'pc_search');
    const token = get(roomToken, 'xsecToken', 'xsec_token') || get(live, 'xsecToken', 'xsec_token');
    if (token) url.searchParams.set('xsec_token', String(token));
    results.set(id, { id, title, roomUrl: url.href, avatar: String(host.avatar || host.image || ''),
      subtitle: live.name || '直播中', isLive: true });
  }
  function visit(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 16) return;
    const card = get(node, 'liveCard', 'live_card');
    if (card) add(card.live, get(card, 'liveHostInfo', 'live_host_info'));
    if (node.live) add(node.live, node);
    const liveInfo = get(node, 'liveInfo', 'live_info');
    if (liveInfo && Number(liveInfo.status) === 2) add(liveInfo, node);
    for (const value of Object.values(node)) visit(value, depth + 1);
  }
  visit(data);
  return [...results.values()];
}

const SEARCH_PAGE_STATE = `(() => {
  const text = document.body ? document.body.innerText : '';
  const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const challenge = /请完成.*验证|安全验证|拖动滑块|访问频繁|设备登录超限/.test(text);
  const login = [...document.querySelectorAll('.login-container, .login-modal, .login-mask, [class*="login-modal"], [class*="login-panel"]')].some(visible);
  return { challenge, login: login || /扫码登录|手机号登录|登录后.*搜索/.test(text), empty: /暂无.*结果|没有找到|未找到相关|无搜索结果/.test(text) };
})()`;

const XHS_SEARCH_PAGE_STATE = `(() => {
  const page = ${SEARCH_PAGE_STATE};
  const root = document.querySelector('#app');
  const pinia = root && root.__vue_app__ && root.__vue_app__.config.globalProperties.$pinia;
  const store = pinia && pinia._s.get('search');
  if (store && !page.login && !page.challenge && ['success', 'error'].includes(store.state)
      && store.fetchUserListsStatus === 'auto' && !window.__liveUserSearch) {
    window.__liveUserSearch = true;
    if (typeof store.getUserLists !== 'function' || !store.searchUserContext || !store.searchContext) {
      return { ...page, candidates: [], status: 'error' };
    }
    store.resetSearchUserStore();
    Object.assign(store.searchUserContext, { keyword: store.searchContext.keyword,
      searchId: store.searchContext.searchId, page: 1 });
    Promise.resolve(store.getUserLists(store.searchUserContext.searchId)).catch(() => { window.__liveUserSearchError = true; });
  }
  const candidates = store ? (${xiaohongshuCandidates.toString()})({ feeds: store.feeds, users: store.userLists, onebox: store.oneboxInfo }) : [];
  // 笔记和主播是独立查询；必须等主播查询完成，才能判断是否没有直播。
  const status = window.__liveUserSearchError ? 'error' : store && store.fetchUserListsStatus;
  return { ...page, candidates, status, empty: status === 'success' && !candidates.length };
})()`;

function createRoomSearch({ BrowserWindow, session, userAgent, prepareWindow = () => {}, timeoutMs = 30000 }) {
  let current = null;

  function cancel() {
    if (current) current.finish({ status: 'cancelled', candidates: [] });
  }

  async function search(keyword, requestedPlatform) {
    cancel();
    const platform = normalizePlatform(requestedPlatform);
    const query = String(keyword || '').trim().slice(0, 80);
    if (!query) return { status: 'success', candidates: [] };
    const win = new BrowserWindow({ show: false, width: 1100, height: 850,
      webPreferences: { session: session.fromPartition(PLATFORMS[platform].partition),
        contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.webContents.setUserAgent(userAgent);
    win.webContents.setAudioMuted(true);
    prepareWindow(win);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    for (const event of ['will-navigate', 'will-redirect']) {
      win.webContents.on(event, (e, url) => { if (!isPlatformUrl(url, platform)) e.preventDefault(); });
    }
    return new Promise((resolve) => {
      const candidates = new Map();
      let timer, deadline, done = false;
      const debug = win.webContents.debugger;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(deadline);
        if (current && current.win === win) current = null;
        if (debug) { try { if (debug.isAttached()) debug.detach(); } catch {} }
        if (!win.isDestroyed()) win.destroy();
        resolve({ platform, keyword: query, ...result });
      };
      current = { win, finish };
      const poll = async () => {
        if (done) return;
        try {
          const page = platform === 'xiaohongshu'
            ? (await debug.sendCommand('Runtime.evaluate', { expression: XHS_SEARCH_PAGE_STATE, returnByValue: true })).result.value
            : await win.webContents.executeJavaScript(SEARCH_PAGE_STATE);
          if (done) return;
          if (page.challenge || page.login) {
            finish({ status: 'login_required', candidates: [], message: page.challenge ? '请打开小红书登录窗口，完成登录或页面验证后重试' : `请先登录${PLATFORMS[platform].name}，再重试搜索` });
            return;
          }
          if (platform === 'xiaohongshu') {
            for (const item of page.candidates || []) candidates.set(item.id, item);
          } else {
            const raw = await win.webContents.executeJavaScript(CANDIDATE_SCRAPE_SCRIPT);
            if (done) return;
            for (const item of normalizeCandidates(raw || [])) {
              if (item.roomUrl && item.isLive) candidates.set(item.id, item);
            }
          }
          if (page.status === 'error') {
            finish({ status: 'error', candidates: [], message: '主播搜索未完成，请重试或打开登录窗口检查页面状态' });
            return;
          }
          if (candidates.size && (platform !== 'xiaohongshu' || page.status === 'success')) {
            finish({ status: 'success', candidates: [...candidates.values()] });
            return;
          }
          if (page.status === 'success' || page.empty) {
            finish({ status: 'success', candidates: [] });
            return;
          }
        } catch { /* 页面导航期间等待下一次读取。 */ }
        if (!done) timer = setTimeout(poll, 350);
      };
      win.once('closed', () => finish({ status: 'cancelled', candidates: [] }));
      deadline = setTimeout(() => finish({ status: 'error', candidates: [], message: '搜索超时，请检查网络或登录后重试' }), timeoutMs);
      (async () => {
        try {
          if (platform === 'xiaohongshu') {
            // 先启动 renderer，再启用页面读取。
            await win.loadURL('about:blank');
            if (done) return;
            debug.attach('1.3');
          }
          if (done) return;
          // 官方页面负责正常搜索请求，从页面渲染使用的 store 读取直播候选。
          win.loadURL(searchUrl(query, platform)).catch(() => {
            finish({ status: 'error', candidates: [], message: '搜索页面加载失败，请检查网络后重试' });
          });
          poll();
        } catch { finish({ status: 'error', candidates: [], message: '无法启动直播间搜索，请重试' }); }
      })();
    });
  }
  return { search, cancel };
}

module.exports = { createRoomSearch, xiaohongshuCandidates };
