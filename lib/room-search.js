'use strict';

const { PLATFORMS, normalizePlatform, searchUrl, isPlatformUrl } = require('./live-platform');
const { CANDIDATE_SCRAPE_SCRIPT, normalizeCandidates } = require('./douyin-candidate');
const { XHS_AUTH_SCRIPT } = require('./xiaohongshu-auth');

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
    results.set(id, { id, title, anchorId: String(get(host, 'userId', 'user_id') || host.id || ''), roomUrl: url.href, avatar: String(host.avatar || host.image || ''),
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

// 只接收官方主播用户列表中明确的未开播状态；缺失字段不代表未开播。
function xiaohongshuOfflineAnchors(users) {
  return (Array.isArray(users) ? users : []).flatMap((user) => {
    const live = user?.liveInfo ?? user?.live_info;
    if (!live || ![0, 3, '0', '3'].includes(live.status)) return [];
    const title = String(user.nickname || user.nickName || user.nick_name || user.name || '').trim();
    const anchorId = String(user.userId || user.user_id || user.id || '');
    return title && anchorId ? [{ title, anchorId }] : [];
  });
}

const SEARCH_PAGE_STATE = `(() => {
  const text = document.body ? document.body.innerText : '';
  const visible = (el) => el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const challenge = /请完成.*验证|安全验证|拖动滑块|访问频繁|设备登录超限/.test(text);
  const login = [...document.querySelectorAll('.login-container, .login-modal, .login-mask, [class*="login-modal"], [class*="login-panel"]')].some(visible);
  // 页眉的「扫码登录」入口不等于登录墙，游客已有搜索结果时不能误拦截。
  return { challenge, login: login || /登录后.*搜索/.test(text), empty: /暂无.*结果|没有找到|未找到相关|无搜索结果/.test(text) };
})()`;

const XHS_SEARCH_PAGE_STATE = `(keyword => {
  const auth = ${XHS_AUTH_SCRIPT};
  if (['restricted', 'verification_required'].includes(auth.status)) return { auth, candidates: [] };
  const page = ${SEARCH_PAGE_STATE};
  if (page.login || page.challenge) return { ...page, auth, candidates: [] };
  const root = document.querySelector('#app');
  const pinia = root && root.__vue_app__ && root.__vue_app__.config.globalProperties.$pinia;
  const store = pinia && pinia._s.get('search');
  // 服务端 HTML 已有输入框时，Vue 事件可能还未绑定，必须等待页面初始化完成。
  if (!store || document.readyState !== 'complete') return { auth, candidates: [] };
  // 新版搜索依赖首页初始化的页面上下文；直接加载搜索深链可能被重定向到错误页。
  // 使用官方搜索框正常提交，让页面自身完成路由和请求初始化。
  if (!window.__liveWallSearchSubmitted) {
    const input = document.querySelector('#search-input');
    const button = input?.parentElement?.querySelector('.search-icon');
    if (!input || !button) return { auth, candidates: [] };
    window.__liveWallSearchSubmitted = true;
    input.value = keyword;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    button.click();
    return { auth, candidates: [] };
  }
  if (store.searchContext?.keyword !== keyword) return { auth, candidates: [] };
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
  const offlineAnchors = status === 'success' ? (${xiaohongshuOfflineAnchors.toString()})(store.userLists) : [];
  return { ...page, auth, candidates, offlineAnchors, status, empty: status === 'success' && !candidates.length };
})`;

function createRoomSearch({ BrowserWindow, session, userAgent, prepareWindow = () => {}, onAuthStatus = () => {}, timeoutMs = 30000 }) {
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
            ? (await debug.sendCommand('Runtime.evaluate', { expression: `${XHS_SEARCH_PAGE_STATE}(${JSON.stringify(query)})`, returnByValue: true })).result.value
            : await win.webContents.executeJavaScript(SEARCH_PAGE_STATE);
          if (done) return;
          if (page.auth && ['restricted', 'verification_required'].includes(page.auth.status)) {
            onAuthStatus(page.auth);
            finish({ status: 'login_required', candidates: [], auth: page.auth,
              message: `${page.auth.message}${page.auth.code ? `（错误码 ${page.auth.code}）` : ''}` });
            return;
          }
          if (page.challenge || page.login) {
            if (platform === 'xiaohongshu') onAuthStatus(page.auth?.loggedIn === true
              ? { ...page.auth, status: 'verification_required', message: '请在官方窗口完成验证后重试' }
              : { status: 'logged_out', loggedIn: false });
            finish({ status: 'login_required', candidates: [], message: page.challenge
              ? `${PLATFORMS[platform].name}搜索需要页面验证；也可以粘贴直播分享链接，直接尝试游客观看`
              : `${PLATFORMS[platform].name}名称搜索需要登录；粘贴直播分享链接可直接尝试游客观看` });
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
            if (page.auth) onAuthStatus(page.auth);
            finish({ status: 'success', candidates: [...candidates.values()], offlineAnchors: page.offlineAnchors || [] });
            return;
          }
          if (page.status === 'success' || page.empty) {
            if (page.auth) onAuthStatus(page.auth);
            finish({ status: 'success', candidates: [], offlineAnchors: page.offlineAnchors || [] });
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
          win.loadURL(platform === 'xiaohongshu' ? PLATFORMS.xiaohongshu.home : searchUrl(query, platform)).catch(() => {
            finish({ status: 'error', candidates: [], message: '搜索页面加载失败，请检查网络后重试' });
          });
          poll();
        } catch { finish({ status: 'error', candidates: [], message: '无法启动直播间搜索，请重试' }); }
      })();
    });
  }
  return { search, cancel };
}

module.exports = { createRoomSearch, xiaohongshuCandidates, xiaohongshuOfflineAnchors };
