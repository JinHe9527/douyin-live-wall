'use strict';

/* 抖音多宫格直播墙 —— 渲染层。
   模型：直播间库(library) + 上墙(wall)。库里可放直播间链接或主播主页(secUid)。
   主页类型会自动找他正在播的直播间；未开播则显示「未开播」并定时轮询，开播即出画面。
   每个上墙的格子 = 一个 <video> + mpegts.js 直接播 flv，卡顿/过期自愈。 */

const gridEl = document.getElementById('grid');
const emptyHint = document.getElementById('empty-hint');
const inputEl = document.getElementById('room-input');
const btnAdd = document.getElementById('btn-add');
const btnBack = document.getElementById('btn-back');
const globalQualityEl = document.getElementById('global-quality');
const toastEl = document.getElementById('toast');

// 默认直播间（首次打开自动带上，老板开箱即看）。可在「直播间管理」里增删。
const DEFAULT_LIBRARY = [
  { id: 'def-009',   name: '宇宙009',   brand: '宇宙', url: 'https://live.douyin.com/6300864795', kind: 'live' },
  { id: 'def-red',   name: '宇宙red',   brand: '宇宙', url: 'https://www.douyin.com/follow/live/980416023981', kind: 'live' },
  { id: 'def-x',     name: '宇宙x',     brand: '宇宙', url: 'https://live.douyin.com/301132947062', kind: 'live' },
  { id: 'def-v05',   name: '宇宙v05',   brand: '宇宙', url: 'https://www.douyin.com/follow/live/497407856508', kind: 'live' },
  { id: 'def-super', name: '宇宙super', brand: '宇宙', url: 'https://www.douyin.com/follow/live/687121658218', kind: 'live' },
  { id: 'def-max',   name: '宇宙max',   brand: '宇宙', url: 'https://www.douyin.com/follow/live/905471478558', kind: 'live' },
  { id: 'def-vii',   name: '宇宙vii',   brand: '宇宙', url: 'https://www.douyin.com/follow/live/78545710145', kind: 'live' },
  { id: 'def-fly',   name: '宇宙fly',   brand: '宇宙', url: 'https://live.douyin.com/727358524976', kind: 'live' },
];
const DEFAULT_WALL = DEFAULT_LIBRARY.map((x) => x.id);

// 设置抽屉
const btnSettings = document.getElementById('btn-settings');
const btnOpenSettingsEmpty = document.getElementById('btn-open-settings-empty');
const drawer = document.getElementById('drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
const drawerClose = document.getElementById('drawer-close');
const btnWallAll = document.getElementById('btn-wall-all');
const btnWallNone = document.getElementById('btn-wall-none');
const libNameEl = document.getElementById('lib-name');
const libGroupEl = document.getElementById('lib-group');
const libUrlEl = document.getElementById('lib-url');
const groupListEl = document.getElementById('group-list');
const btnLibAdd = document.getElementById('btn-lib-add');
const libListEl = document.getElementById('lib-list');
const drawerStat = document.getElementById('drawer-stat');

const state = {
  library: [],   // [{ id, name, brand, url, kind }]
  rooms: [],     // 上墙(播放中) [{ id, name, brand, url, kind, webRid, title, anchor, count, flvUrl, status, quality }]
  cols: 'auto',
  soloId: null,
  infoMode: false,
  globalQuality: 'auto', // auto | origin | hd | sd | fluent
  hudAlways: false,      // 名字/分辨率/帧率/码率 是否常驻显示
};
const players = new Map(); // id -> LivePlayer
let savedQuality = {};     // libId -> quality（从持久化恢复）

let toastTimer = null;
function toast(msg, ms = 2200) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function uid() {
  return 'r' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function isProfileUrl(u) { return /douyin\.com\/user\//i.test(String(u || '')); }
function classifyInput(u) {
  const s = String(u || '').trim();
  if (!s) return 'invalid';
  if (isProfileUrl(s)) return 'profile';
  if (/live\.douyin\.com\/\d+/i.test(s) || /^\d{6,}$/.test(s)) return 'live';
  if (/douyin\.com/i.test(s)) return 'live'; // 其它抖音链接交给后端兜底解析
  return 'invalid';
}

function autoQuality() {
  const n = state.rooms.length;
  if (n <= 4) return 'hd';
  if (n <= 6) return 'sd';
  return 'fluent';
}
// 优先级：单格 override > 全局 override > 按路数自动
function desiredQuality(room) {
  if (room && room.quality && room.quality !== 'auto') return room.quality;
  if (state.globalQuality && state.globalQuality !== 'auto') return state.globalQuality;
  return autoQuality();
}

// —— LivePlayer：单格播放 + 自愈 —— //
class LivePlayer {
  constructor(videoEl, statusEl, room) {
    this.videoEl = videoEl;
    this.statusEl = statusEl;
    this.room = room;
    this.player = null;
    this.recovering = false;
    this.attempts = 0;
    this.recoverTimer = null;
    this.stallTimer = null;
    this.lastTime = 0;
    this.destroyed = false;
    this.MAX_ATTEMPTS = 8;
    this.STALL_MS = 7000;

    videoEl.muted = true;
    videoEl.addEventListener('playing', () => {
      this.setState('live');
      this.attempts = 0;
      this.lastTime = videoEl.currentTime;
      this.armStall();
    });
    videoEl.addEventListener('ended', () => this.setState('ended', '直播已结束'));
  }

  setState(stateName, text) {
    if (this.destroyed) return;
    this.room.status = stateName;
    this.statusEl.dataset.state = stateName;
    const t = this.statusEl.querySelector('.cell-status-text');
    if (t && text != null) t.textContent = text;
    // 非直播状态：清掉在线/分辨率/帧率/码率 + 红点（下播了就不显示这些）
    const live = stateName === 'live';
    if (!live) { this.room.stats = {}; this.room.count = ''; }
    this.updateStats();
    const cell = gridEl.querySelector(`.cell[data-id="${this.room.id}"]`);
    if (cell) {
      const dot = cell.querySelector('.cell-live-dot');
      if (dot) dot.style.display = live ? '' : 'none';
    }
  }

  // 悬停浮层：在线人数 · 分辨率 · 帧率 · 码率
  updateStats() {
    if (this.destroyed) return;
    const cell = gridEl.querySelector(`.cell[data-id="${this.room.id}"]`);
    if (!cell) return;
    const el = cell.querySelector('.cell-stats');
    if (!el) return;
    const st = this.room.stats || {};
    const parts = [];
    if (this.room.count) parts.push(`${this.room.count} 在线`);
    if (st.w && st.h) parts.push(`${st.w}×${st.h}`);
    if (st.fps) parts.push(`${st.fps}fps`);
    if (st.kbps) parts.push(st.kbps >= 1000 ? `${(st.kbps / 1000).toFixed(1)}Mbps` : `${st.kbps}kbps`);
    el.textContent = parts.join(' · ');
  }

  armStall() {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      if (this.destroyed) return;
      if (this.videoEl.currentTime === this.lastTime && !this.videoEl.paused) {
        this.recover('stall');
      } else {
        this.lastTime = this.videoEl.currentTime;
        this.armStall();
      }
    }, this.STALL_MS);
  }

  create(flvUrl) {
    if (this.destroyed) return;
    if (!window.mpegts || !window.mpegts.isSupported()) {
      this.setState('error', '环境不支持 flv');
      return;
    }
    this.destroyPlayer();
    const player = window.mpegts.createPlayer(
      { type: 'flv', isLive: true, url: flvUrl },
      {
        enableWorker: true,
        enableStashBuffer: false,
        stashInitialSize: 128,
        liveBufferLatencyChasing: true,
        liveBufferLatencyMaxLatency: 3.0,
        liveBufferLatencyMinRemain: 0.5,
        lazyLoad: false,
        autoCleanupSourceBuffer: true,
      }
    );
    player.on(window.mpegts.Events.ERROR, (type, detail) => this.recover(`mpegts:${type}:${detail}`));
    // 分辨率 / 标称帧率
    player.on(window.mpegts.Events.MEDIA_INFO, (mi) => {
      if (!this.room.stats) this.room.stats = {};
      this.room.stats.w = mi.width || this.room.stats.w || 0;
      this.room.stats.h = mi.height || this.room.stats.h || 0;
      if (mi.fps) this.room.stats.fps = Math.round(mi.fps);
      this.updateStats();
    });
    // 实时下载速度(换算实时码率) + 解码帧数(算实时帧率)
    this._lastFrames = 0;
    this._lastStatTs = 0;
    player.on(window.mpegts.Events.STATISTICS_INFO, (s) => {
      if (!this.room.stats) this.room.stats = {};
      if (typeof s.speed === 'number') this.room.stats.kbps = Math.round(s.speed * 8); // speed KB/s → kbps
      const now = (window.performance && performance.now()) || Date.now();
      if (typeof s.decodedFrames === 'number' && this._lastStatTs) {
        const dt = (now - this._lastStatTs) / 1000;
        const df = s.decodedFrames - this._lastFrames;
        if (dt >= 0.5 && df >= 0) this.room.stats.fps = Math.round(df / dt);
      }
      if (typeof s.decodedFrames === 'number') { this._lastFrames = s.decodedFrames; this._lastStatTs = now; }
      this.updateStats();
    });
    player.attachMediaElement(this.videoEl);
    player.load();
    const p = this.videoEl.play();
    if (p && p.catch) p.catch(() => {});
    this.player = player;
  }

  async start(flvUrl) {
    this.clearTimers();
    this.recovering = false;
    if (flvUrl) {
      this.setState('loading', '连接直播流…');
      this.create(flvUrl);
    } else {
      const ok = await this.reResolve();
      if (!ok) this.setState('error', '无法获取直播流');
    }
  }

  async reResolve() {
    try {
      const res = await window.mini.resolve(this.room.url, desiredQuality(this.room));
      if (res && res.ok && res.flvUrl) {
        this.room.webRid = res.webRid;
        this.room.flvUrl = res.flvUrl;
        if (res.title) this.room.title = res.title;
        if (res.anchorName) this.room.anchor = res.anchorName;
        if (res.userCount) this.room.count = res.userCount;
        updateCellMeta(this.room);
        this.updateStats();
        syncInfoMode();
        this.create(res.flvUrl);
        return true;
      }
      if (res && res.status === 'offline') { this.setState('offline', '未开播'); return true; }
      if (res && res.status === 'ended') { this.setState('ended', '未开播'); return true; }
    } catch { /* ignore */ }
    return false;
  }

  // 自动追踪：未开播/已结束的格子定时重查，开播即起播
  recheck() {
    if (this.destroyed) return;
    if (this.room.status === 'offline' || this.room.status === 'ended' || this.room.status === 'error') {
      this.attempts = 0;
      this.reResolve();
    }
  }

  recover(reason) {
    if (this.destroyed || this.recovering) return;
    this.recovering = true;
    this.clearTimers();
    this.attempts += 1;
    if (this.attempts > this.MAX_ATTEMPTS) { this.setState('error', '直播流中断'); return; }
    this.setState('loading', `重连中…(${this.attempts})`);
    const delay = Math.min(this.attempts * 1000, 6000);
    this.recoverTimer = setTimeout(async () => {
      this.recovering = false;
      const ok = await this.reResolve();
      if (!ok && this.room.flvUrl) this.create(this.room.flvUrl);
      else if (!ok) this.recover('retry');
    }, delay);
  }

  clearTimers() {
    if (this.recoverTimer) { clearTimeout(this.recoverTimer); this.recoverTimer = null; }
    if (this.stallTimer) { clearTimeout(this.stallTimer); this.stallTimer = null; }
  }

  destroyPlayer() {
    if (this.player) {
      try { this.player.pause(); } catch {}
      try { this.player.unload(); } catch {}
      try { this.player.detachMediaElement(); } catch {}
      try { this.player.destroy(); } catch {}
      this.player = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.clearTimers();
    this.destroyPlayer();
  }
}

// —— 渲染宫格 —— //
// 计算 9:16 格子的最大尺寸：保持竖屏真实比例、尽量放大、整体居中
const LAYOUT_GAP = 8;
const LAYOUT_PAD = 8;
function applyLayout() {
  const n = state.rooms.length;
  if (!n) return;
  const W = gridEl.clientWidth - LAYOUT_PAD * 2;
  const H = gridEl.clientHeight - LAYOUT_PAD * 2;
  if (W <= 0 || H <= 0) return;
  // 手动指定列数时按它（但不超过路数）；自动时试所有列数取最大面积
  const forced = state.cols !== 'auto' ? Math.min(Number(state.cols), n) : null;
  let best = { area: 0, cellW: 0, cols: 1 };
  const tryCols = (cols) => {
    if (cols < 1) return;
    const rows = Math.ceil(n / cols);
    let cellW = (W - LAYOUT_GAP * (cols - 1)) / cols;
    let cellH = (cellW * 16) / 9;
    if (cellH * rows + LAYOUT_GAP * (rows - 1) > H) {
      cellH = (H - LAYOUT_GAP * (rows - 1)) / rows;
      cellW = (cellH * 9) / 16;
    }
    if (cellW > 0 && cellW * cellH > best.area) best = { area: cellW * cellH, cellW, cols };
  };
  if (forced) tryCols(forced);
  else for (let c = 1; c <= n; c++) tryCols(c);
  if (best.cellW > 0) {
    const w = Math.floor(best.cellW);
    gridEl.style.setProperty('--cell-w', w + 'px');
    // 用 CSS Grid 显式列数，保证每行正好 cols 个、正确换行
    gridEl.style.gridTemplateColumns = `repeat(${best.cols}, ${w}px)`;
  }
}

function icon(name) {
  const I = {
    mute: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    sound: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>',
    reload: '<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    detail: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const QUALITY_LABEL = { auto: '自动', origin: '原画', hd: '高清', sd: '标清', fluent: '流畅' };

function cellTemplate(room) {
  const isSolo = state.soloId === room.id;
  const label = room.name || room.title || room.anchor || room.url;
  const qLabel = QUALITY_LABEL[room.quality || 'auto'] || '自动';
  return `
  <article class="cell${isSolo ? ' solo-audio' : ''}" data-id="${room.id}" data-rid="${room.webRid || ''}">
    <div class="cell-infobar">
      <span class="cell-name">${escapeHtml(label)}</span>
      <span class="cell-online">${room.count ? escapeHtml(room.count) + ' 在线' : ''}</span>
    </div>
    <div class="cell-stage">
      <div class="cell-gifts"></div>
      <div class="cell-video"><video playsinline muted></video></div>
      <div class="cell-comments"></div>
    </div>
    <div class="cell-status" data-state="loading">
      <div class="cell-spinner"></div>
      <div class="cell-status-text">连接直播流…</div>
    </div>
    <div class="cell-hud">
      <div class="cell-hud-left">
        <span class="cell-live-dot"></span>
        <span class="cell-title">${escapeHtml(label)}</span>
      </div>
      <span class="cell-stats"></span>
    </div>
    <div class="cell-ctrl">
      <div class="cell-quality">
        <button class="icon-btn act-quality" title="清晰度" data-act="quality">${qLabel}</button>
        <div class="quality-menu" hidden>
          ${['auto', 'origin', 'hd', 'sd', 'fluent'].map((q) => `<button data-q="${q}">${QUALITY_LABEL[q]}</button>`).join('')}
        </div>
      </div>
      <button class="icon-btn act-audio${isSolo ? ' on' : ''}" title="独占音频" data-act="audio">${icon(isSolo ? 'sound' : 'mute')}</button>
      <button class="icon-btn act-detail" title="信息：评论/在线/贡献榜叠在画面上（双击格子同效）" data-act="detail">${icon('detail')}</button>
      <button class="icon-btn act-reload" title="刷新" data-act="reload">${icon('reload')}</button>
      <button class="icon-btn act-full" title="全屏" data-act="full">${icon('full')}</button>
      <button class="icon-btn act-close" title="下墙" data-act="close">${icon('close')}</button>
    </div>
  </article>`;
}

function updateCellMeta(room) {
  const cell = gridEl.querySelector(`.cell[data-id="${room.id}"]`);
  if (!cell) return;
  if (room.webRid) cell.dataset.rid = room.webRid;
  const label = room.name || room.title || room.anchor || room.url;
  const titleEl = cell.querySelector('.cell-title');
  const countEl = cell.querySelector('.cell-count');
  const nameEl = cell.querySelector('.cell-name');
  const onlineEl = cell.querySelector('.cell-online');
  if (titleEl) titleEl.textContent = label;
  if (countEl) countEl.textContent = room.count ? `${room.count} 人` : '';
  if (nameEl) nameEl.textContent = label;
  if (onlineEl) onlineEl.textContent = room.count ? `${room.count} 在线` : '';
}


function renderGrid() {
  emptyHint.hidden = state.rooms.length > 0;
  applyLayout();

  for (const p of players.values()) p.destroy();
  players.clear();

  gridEl.innerHTML = state.rooms.map(cellTemplate).join('');

  for (const room of state.rooms) {
    const cell = gridEl.querySelector(`.cell[data-id="${room.id}"]`);
    if (!cell) continue;
    const videoEl = cell.querySelector('video');
    const statusEl = cell.querySelector('.cell-status');
    const lp = new LivePlayer(videoEl, statusEl, room);
    players.set(room.id, lp);
    lp.start(room.flvUrl || '');
  }
  applyAudioSolo();
  syncInfoMode();
}

function applyAudioSolo() {
  for (const room of state.rooms) {
    const lp = players.get(room.id);
    if (!lp) continue;
    lp.videoEl.muted = state.soloId !== room.id;
  }
}

// —— 库 / 上墙 —— //
function findLib(id) { return state.library.find((x) => x.id === id); }
function normUrl(u) { return String(u || '').trim().replace(/[?#].*$/, ''); }

function addToLibrary(name, url, brand) {
  const u = String(url || '').trim();
  if (classifyInput(u) === 'invalid') { toast('链接无法识别（要主播主页或直播间链接/房间号）'); return null; }
  const exists = state.library.find((x) => normUrl(x.url) === normUrl(u));
  if (exists) return exists;
  const item = { id: uid(), name: (name || '').trim(), brand: (brand || '').trim(), url: u, kind: classifyInput(u) };
  state.library.push(item);
  persist();
  return item;
}

function removeFromLibrary(id) {
  takeOffWall(id);
  state.library = state.library.filter((x) => x.id !== id);
  persist();
  renderLibList();
}

function isOnWall(libId) { return state.rooms.some((r) => r.id === libId); }

function putOnWall(libId, opts = {}) {
  if (isOnWall(libId)) return;
  const lib = findLib(libId);
  if (!lib) return;
  const room = {
    id: lib.id, name: lib.name, brand: lib.brand, url: lib.url, kind: lib.kind,
    webRid: '', title: '', anchor: '', count: '', flvUrl: '', status: 'loading',
    quality: savedQuality[lib.id] || '',
  };
  state.rooms.push(room);
  if (!opts.noRender) { persist(); renderGrid(); renderLibList(); }
}

function takeOffWall(libId) {
  const lp = players.get(libId);
  if (lp) { lp.destroy(); players.delete(libId); }
  state.rooms = state.rooms.filter((r) => r.id !== libId);
  if (state.soloId === libId) state.soloId = null;
  persist();
  renderGrid();
  renderLibList();
}

function toggleWall(libId) {
  if (isOnWall(libId)) takeOffWall(libId);
  else putOnWall(libId);
}

// 顶栏直接添加：进库并上墙
function addFromInput(rawUrl, name) {
  const kind = classifyInput(rawUrl);
  if (kind === 'invalid') { toast('链接无法识别'); return false; }
  const item = addToLibrary(name || '', rawUrl, '');
  if (!item) return false;
  if (!isOnWall(item.id)) putOnWall(item.id);
  return true;
}

// —— 设置抽屉渲染 —— //
function openDrawer() {
  drawer.hidden = false;
  drawerBackdrop.hidden = false;
  renderLibList();
  refreshLoginStatus();
}
function closeDrawer() {
  drawer.hidden = true;
  drawerBackdrop.hidden = true;
}

function renderLibList() {
  const total = state.library.length;
  const onWall = state.rooms.length;
  drawerStat.textContent = total ? `库内 ${total} 个 · 已上墙 ${onWall} 个` : '';

  // 分组下拉建议
  refreshGroupDatalist();

  if (!total) {
    libListEl.innerHTML = '<div class="lib-empty">库是空的。上面填链接（可带分组）「加入库」即可。</div>';
    return;
  }
  // 按分组归类
  const groups = new Map();
  for (const it of state.library) {
    const g = it.brand || '未分组';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  let html = '';
  for (const [g, items] of groups) {
    html += `<div class="lib-group-title">${escapeHtml(g)}（${items.length}）</div>`;
    for (const it of items) {
      const checked = isOnWall(it.id) ? 'checked' : '';
      const kindLabel = it.kind === 'profile' ? '主页' : '直播间';
      html += `
      <div class="lib-row" data-id="${it.id}">
        <input type="checkbox" class="lib-check" data-id="${it.id}" ${checked} />
        <div class="lib-info">
          <div class="lib-name">${escapeHtml(it.name || it.url)}</div>
          <div class="lib-meta"><span class="lib-kind ${it.kind}">${kindLabel}</span>${escapeHtml(it.url)}</div>
        </div>
        <input class="lib-group-edit" data-id="${it.id}" list="group-list" value="${escapeHtml(it.brand || '')}" placeholder="分组" title="改分组" />
        <button class="lib-del" data-id="${it.id}" title="从库删除">${icon('close')}</button>
      </div>`;
    }
  }
  libListEl.innerHTML = html;
}

// 收集已有分组，填充 datalist 供输入时建议
function refreshGroupDatalist() {
  if (!groupListEl) return;
  const set = new Set();
  for (const it of state.library) if (it.brand) set.add(it.brand);
  groupListEl.innerHTML = Array.from(set).map((g) => `<option value="${escapeHtml(g)}"></option>`).join('');
}

// 改某个房间的分组
function setBrand(id, brand) {
  const lib = findLib(id);
  if (!lib) return;
  lib.brand = String(brand || '').trim();
  const room = state.rooms.find((r) => r.id === id);
  if (room) room.brand = lib.brand;
  persist();
  renderLibList();
}

// —— 操作：宫格控件 —— //
function soloAudio(id) {
  state.soloId = state.soloId === id ? null : id;
  gridEl.querySelectorAll('.cell').forEach((cell) => {
    const cid = cell.dataset.id;
    cell.classList.toggle('solo-audio', state.soloId === cid);
    const btn = cell.querySelector('.act-audio');
    if (btn) {
      const on = state.soloId === cid;
      btn.classList.toggle('on', on);
      btn.innerHTML = icon(on ? 'sound' : 'mute');
    }
  });
  applyAudioSolo();
}
function reloadRoom(id) {
  const lp = players.get(id);
  if (!lp) return;
  lp.attempts = 0;
  lp.start('');
}
function fullscreenCell(id) {
  const cell = gridEl.querySelector(`.cell[data-id="${id}"]`);
  if (!cell) return;
  if (document.fullscreenElement) document.exitFullscreen();
  else cell.requestFullscreen().catch(() => {});
}


// —— 信息模式 + 清晰度 + 弹幕 —— //
function wallRids() {
  return state.rooms.map((r) => r.webRid).filter(Boolean);
}
// 弹幕/信息叠层已停用：网格保持纯净画面
function syncInfoMode() { /* no-op：纯净画面，不叠任何东西 */ }

// 双击 / ⓘ：在 app 内打开该直播间的真实抖音页（完整功能，限 1 个）
// 双击 / ⓘ：独立浮窗打开手机版真实直播间（网格照常播，不受影响）
function openDetail(id) {
  const room = state.rooms.find((r) => r.id === id);
  if (!room) return;
  if (!room.webRid) { toast('该直播间还没连上，稍等一下再双击'); return; }
  window.mini.openDetail(room.webRid, room.name || room.title || '');
}

function setGlobalQuality(q) {
  state.globalQuality = q;
  persist();
  for (const room of state.rooms) {
    if (room.quality && room.quality !== 'auto') continue; // 有单格 override，不动
    const lp = players.get(room.id);
    if (lp) { lp.attempts = 0; lp.start(''); }
  }
}

function setRoomQuality(id, q) {
  const room = state.rooms.find((r) => r.id === id);
  if (!room) return;
  room.quality = q === 'auto' ? '' : q;
  const cell = gridEl.querySelector(`.cell[data-id="${id}"]`);
  if (cell) {
    const btn = cell.querySelector('.act-quality');
    if (btn) btn.textContent = QUALITY_LABEL[q] || '自动';
    const menu = cell.querySelector('.quality-menu');
    if (menu) menu.hidden = true;
  }
  persist();
  const lp = players.get(id);
  if (lp) { lp.attempts = 0; lp.start(''); }
}

// 弹幕渲染
const DANMU_MAX = 60;
// 一批弹幕（{rid, items:[...]}）：评论→右，贡献榜→左，在线→顶部
function handleDanmu(payload) {
  if (!payload || !payload.rid || !Array.isArray(payload.items)) return;
  const cell = gridEl.querySelector(`.cell[data-rid="${payload.rid}"]`);
  if (!cell) return;
  const comments = cell.querySelector('.cell-comments');
  for (const it of payload.items) {
    if (it.type === 'online') updateOnlineCell(cell, payload.rid, it.online);
    else if (it.type === 'rank') renderRank(cell, it.list);
    else appendComment(comments, it);
  }
}

function appendComment(panel, it) {
  if (!panel) return;
  const line = document.createElement('div');
  line.className = 'dm-line'
    + (it.type === 'join' ? ' dm-join' : '')
    + (it.type === 'like' ? ' dm-like' : '')
    + (it.type === 'social' ? ' dm-social' : '');
  if (it.user) {
    const u = document.createElement('span');
    u.className = 'dm-user';
    u.textContent = it.user + (it.type === 'chat' ? '：' : ' ');
    line.appendChild(u);
  }
  const c = document.createElement('span');
  c.className = 'dm-text';
  c.textContent = it.content || (it.type === 'join' ? '来了' : '');
  line.appendChild(c);
  panel.appendChild(line);
  while (panel.children.length > DANMU_MAX) panel.removeChild(panel.firstChild);
  panel.scrollTop = panel.scrollHeight;
}

// 贡献榜（真实 top 送礼人）整块替换渲染到左面板
function renderRank(cell, list) {
  const panel = cell.querySelector('.cell-gifts');
  if (!panel || !Array.isArray(list)) return;
  panel.innerHTML = '<div class="rank-title">贡献榜</div>'
    + list.map((r) =>
      `<div class="rank-line"><span class="rank-no">${escapeHtml(String(r.rank))}</span><span class="rank-name">${escapeHtml(r.nickname || '')}</span></div>`
    ).join('');
}

function updateOnlineCell(cell, rid, online) {
  if (!online) return;
  const room = state.rooms.find((r) => r.webRid === rid);
  if (room) room.count = online;
  const onlineEl = cell.querySelector('.cell-online');
  if (onlineEl) onlineEl.textContent = `${online} 在线`;
}

// —— 持久化 —— //
function persist() {
  const quality = {};
  for (const r of state.rooms) if (r.quality) quality[r.id] = r.quality;
  window.mini.saveRooms({
    cols: state.cols,
    library: state.library,
    wall: state.rooms.map((r) => r.id),
    infoMode: state.infoMode,
    globalQuality: state.globalQuality,
    hudAlways: state.hudAlways,
    quality,
  });
}

// —— 事件 —— //
btnAdd.addEventListener('click', () => { if (addFromInput(inputEl.value)) inputEl.value = ''; });
inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && addFromInput(inputEl.value)) inputEl.value = ''; });

document.querySelectorAll('.col-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.col-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.cols = btn.dataset.cols;
    persist();
    applyLayout();
  });
});

// 窗口尺寸变化 → 重新计算 9:16 格子大小
window.addEventListener('resize', applyLayout);

gridEl.addEventListener('click', (e) => {
  // 单格清晰度菜单项
  const qOpt = e.target.closest('.quality-menu button[data-q]');
  if (qOpt) {
    const c = e.target.closest('.cell');
    if (c) setRoomQuality(c.dataset.id, qOpt.dataset.q);
    return;
  }
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const id = cell.dataset.id;
  const act = btn.dataset.act;
  if (act === 'quality') {
    const menu = cell.querySelector('.quality-menu');
    // 先关其它已开的
    gridEl.querySelectorAll('.quality-menu').forEach((m) => { if (m !== menu) m.hidden = true; });
    if (menu) menu.hidden = !menu.hidden;
  } else if (act === 'audio') soloAudio(id);
  else if (act === 'reload') reloadRoom(id);
  else if (act === 'detail') openDetail(id);
  else if (act === 'full') fullscreenCell(id);
  else if (act === 'close') takeOffWall(id);
});

// 双击格子 → 打开该直播间的真实抖音页（完整功能）
gridEl.addEventListener('dblclick', (e) => {
  if (e.target.closest('.icon-btn') || e.target.closest('.quality-menu')) return;
  const cell = e.target.closest('.cell');
  if (cell) openDetail(cell.dataset.id);
});

// 点别处关闭清晰度菜单
document.addEventListener('click', (e) => {
  if (!e.target.closest('.cell-quality')) {
    gridEl.querySelectorAll('.quality-menu').forEach((m) => { m.hidden = true; });
  }
});

// 返回宫格（关闭真实页详情）
// 扫码登录抖音 + 登录状态
const btnLogin = document.getElementById('btn-login');
const loginDot = document.getElementById('login-dot');
function updateLoginUI(ok) {
  if (btnLogin) {
    btnLogin.textContent = ok ? '✓ 已登录抖音（点此切换账号）' : '扫码登录抖音';
    btnLogin.classList.toggle('btn-primary', !ok);
  }
  if (loginDot) {
    loginDot.classList.toggle('on', !!ok);
    loginDot.title = ok ? '抖音登录状态：已登录' : '抖音登录状态：未登录';
  }
}
async function refreshLoginStatus() {
  try { updateLoginUI(await window.mini.getLoginStatus()); } catch {}
}
if (btnLogin) btnLogin.addEventListener('click', () => { window.mini.openLogin(); toast('请在弹出的窗口里扫码登录'); });
if (window.mini.onLoginStatus) window.mini.onLoginStatus(updateLoginUI);
refreshLoginStatus();
// 全局清晰度
if (globalQualityEl) globalQualityEl.addEventListener('change', () => setGlobalQuality(globalQualityEl.value));

// 常显信息开关（名字/分辨率/帧率/码率 常驻显示，否则悬停显示）
const btnHud = document.getElementById('btn-hud');
function applyHudAlways() {
  gridEl.classList.toggle('hud-always', !!state.hudAlways);
  if (btnHud) btnHud.classList.toggle('active', !!state.hudAlways);
}
if (btnHud) btnHud.addEventListener('click', () => {
  state.hudAlways = !state.hudAlways;
  applyHudAlways();
  persist();
});

// 抽屉
btnSettings.addEventListener('click', openDrawer);
if (btnOpenSettingsEmpty) btnOpenSettingsEmpty.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);

btnLibAdd.addEventListener('click', () => {
  const item = addToLibrary(libNameEl.value, libUrlEl.value, libGroupEl.value);
  if (item) { libNameEl.value = ''; libGroupEl.value = ''; libUrlEl.value = ''; renderLibList(); toast('已加入库'); }
});
libUrlEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') btnLibAdd.click(); });

btnWallAll.addEventListener('click', () => {
  for (const it of state.library) putOnWall(it.id, { noRender: true });
  persist(); renderGrid(); renderLibList();
  toast(`已全部上墙（${state.rooms.length} 路）`);
});
btnWallNone.addEventListener('click', () => {
  for (const p of players.values()) p.destroy();
  players.clear();
  state.rooms = [];
  state.soloId = null;
  persist(); renderGrid(); renderLibList();
});

libListEl.addEventListener('change', (e) => {
  const chk = e.target.closest('.lib-check');
  if (chk) { toggleWall(chk.dataset.id); return; }
  const grp = e.target.closest('.lib-group-edit');
  if (grp) { setBrand(grp.dataset.id, grp.value); return; }
});
libListEl.addEventListener('click', (e) => {
  const del = e.target.closest('.lib-del');
  if (!del) return;
  removeFromLibrary(del.dataset.id);
});

// 自动追踪：每 150s 重查未开播/已结束的格子，开播即上画面
setInterval(() => {
  for (const lp of players.values()) lp.recheck();
}, 150000);

// 每 45s 刷新在播房间的在线人数（只更新数字，不重建播放）
setInterval(async () => {
  for (const lp of players.values()) {
    if (lp.destroyed || lp.room.status !== 'live' || !lp.room.webRid) continue;
    try {
      const res = await window.mini.resolve(lp.room.webRid, 'fluent');
      if (res && res.userCount) { lp.room.count = res.userCount; lp.updateStats(); }
    } catch { /* ignore */ }
  }
}, 45000);

// —— 启动 —— //
async function init() {
  let saved;
  try { saved = await window.mini.loadRooms(); } catch { saved = null; }
  if (saved && saved.cols) {
    state.cols = saved.cols;
    document.querySelectorAll('.col-btn').forEach((b) => b.classList.toggle('active', b.dataset.cols === String(saved.cols)));
  }
  state.library = (saved && Array.isArray(saved.library)) ? saved.library : [];
  let wall = (saved && Array.isArray(saved.wall)) ? saved.wall : [];
  savedQuality = (saved && saved.quality && typeof saved.quality === 'object') ? saved.quality : {};
  state.globalQuality = (saved && saved.globalQuality) || 'auto';
  state.hudAlways = !!(saved && saved.hudAlways);
  applyHudAlways();
  if (globalQualityEl) globalQualityEl.value = state.globalQuality;

  // 首次打开（没有任何保存）→ 载入默认直播间，开箱即看
  const firstRun = !saved || (!state.library.length && !(saved.rooms && saved.rooms.length));
  if (firstRun) {
    state.library = DEFAULT_LIBRARY.map((x) => ({ ...x }));
    wall = [...DEFAULT_WALL];
  } else if (!state.library.length && saved && Array.isArray(saved.rooms)) {
    // 兼容旧格式（saved.rooms 是直接的 url 列表）
    for (const it of saved.rooms) addToLibrary(it.title || '', it.room || it.url, '');
  }

  for (const libId of wall) putOnWall(libId, { noRender: true });
  renderGrid();
  renderLibList();
  // 上墙完成后再持久化，确保默认上墙状态被正确保存
  if (firstRun) persist();
}

init();
