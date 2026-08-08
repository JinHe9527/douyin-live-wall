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
const btnRefreshAll = document.getElementById('btn-refresh-all');
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
const autoRecordingEnabledEl = document.getElementById('auto-recording-enabled');
const autoRecordingDurationEl = document.getElementById('auto-recording-duration');

const state = {
  library: [],   // [{ id, name, brand, url, kind }]
  rooms: [],     // 上墙(播放中) [{ id, name, brand, url, kind, webRid, title, anchor, count, flvUrl, status, quality }]
  cols: 'auto',
  soloId: null,
  showDanmu: false,      // 实时弹幕叠在画面右侧（默认关，开了才连弹幕 WS）
  showGifts: false,      // 实时礼物叠在画面左侧（默认关）
  showBattle: false,     // 比赛战况（血条/成员分数）叠在画面上部（默认关）
  globalQuality: 'auto', // auto | origin | hd | sd | fluent
  hudAlways: false,      // 名字/分辨率/帧率/码率 是否常驻显示
  liveOnly: false,       // 只显示当前在播（已下播/未开播的自动隐藏，其余格子铺满整墙）
  autoRecording: { enabled: false, durationHours: 1, roomIds: [] },
  recordingRooms: new Set(),
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
  // 宫格里每格很小，没必要原画/高清；多路时用轻量 H.264 档，解码压力小很多（原画是 HEVC 高码率，只在单格手动选时才用）
  const n = state.rooms.length;
  if (n <= 2) return 'hd';
  if (n <= 4) return 'sd';
  return 'fluent';
}
// 优先级：单格 override > 全局 override > 按路数自动
function desiredQuality(room) {
  if (room && room.quality && room.quality !== 'auto') return room.quality;
  if (state.globalQuality && state.globalQuality !== 'auto') return state.globalQuality;
  return autoQuality();
}

// —— 只看在播 —— //
function isHiddenByLiveOnly(room) {
  return window.LivePresence.isHiddenByLiveOnly(state.liveOnly, room.presence);
}
function visibleRoomCount() {
  return state.rooms.reduce((n, r) => n + (isHiddenByLiveOnly(r) ? 0 : 1), 0);
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
    this.resolvePromise = null;
    this.lastTime = 0;
    this.destroyed = false;
    this.STALL_MS = 12000;     // 卡顿判定放宽到 12s（原画高码率短卡顿是常态）

    videoEl.muted = true;
    videoEl.addEventListener('playing', () => {
      this.updatePresence('live');
      this.setState('live');
      this.attempts = 0;
      this.lastTime = videoEl.currentTime;
      this.armStall();
    });
    // 直播流不该真结束：video 触发 ended 多半是网络抖动/流过期 → 自愈重连，让接口去确认是否真下播
    videoEl.addEventListener('ended', () => { if (!this.destroyed) this.recover('video-ended'); });
  }

  updatePresence(type) {
    this.room.presence = window.LivePresence.reducePresence(this.room.presence, { type });
    if (state.liveOnly) applyLiveOnly();
  }

  setState(stateName, text) {
    if (this.destroyed) return;
    this.room.status = stateName;
    this.statusEl.dataset.state = stateName;
    const t = this.statusEl.querySelector('.cell-status-text');
    if (t && text != null) t.textContent = text;
    // 非直播状态：清掉在线/分辨率/帧率/码率 + 红点（下播了就不显示这些）
    const live = stateName === 'live';
    if (!live) { this.room.stats = {}; this.room.src = null; this.room.count = ''; }
    this.updateStats();
    const cell = gridEl.querySelector(`.cell[data-id="${this.room.id}"]`);
    if (cell) {
      const dot = cell.querySelector('.cell-live-dot');
      if (dot) dot.style.display = live ? '' : 'none';
    }
  }

  // 悬停浮层：在线人数 · 分辨率 · 帧率 · 码率
  // 分辨率/帧率/码率一律优先用「源流标称值」(room.src，来自房间接口 sdk_params，主播推什么就是什么)，
  // 不受本地拉流档位/带宽/解码性能影响；标称缺失时才退回所拉流自带的元数据(st.*，仍是流声明值，非本地实测)。
  // ↓ 后面的数字才是本地实际拉流速度 —— 远低于标称码率 = 本地网络/机器扛不住的健康信号。
  updateStats() {
    if (this.destroyed) return;
    const cell = gridEl.querySelector(`.cell[data-id="${this.room.id}"]`);
    if (!cell) return;
    const el = cell.querySelector('.cell-stats');
    if (!el) return;
    const st = this.room.stats || {};
    const src = this.room.src || {};
    const fmtRate = (kbps) => (kbps >= 1000 ? `${(kbps / 1000).toFixed(1)}Mbps` : `${kbps}kbps`);
    const parts = [];
    if (this.room.count) parts.push(`${this.room.count} 在线`);
    const w = src.w || st.w, h = src.h || st.h;
    if (w && h) parts.push(`${w}×${h}`);
    const fps = src.fps || st.fps;
    if (fps) parts.push(`${fps}fps`);
    const kbps = src.kbps || st.metaKbps;
    if (kbps) parts.push(fmtRate(kbps));
    if (st.downKbps) parts.push(`↓${fmtRate(st.downKbps)}`);
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
        liveBufferLatencyMaxLatency: 5.0,  // 3→5s：减少追帧跳变，弱机上更平滑(监控墙可容忍几秒延迟)
        liveBufferLatencyMinRemain: 1.0,
        lazyLoad: false,
        autoCleanupSourceBuffer: true,
      }
    );
    player.on(window.mpegts.Events.ERROR, (type, detail) => this.recover(`mpegts:${type}:${detail}`));
    // 兜底元数据：所拉那档流自带的声明值（分辨率/标称帧率/编码码率）。
    // 只在房间接口没给源流标称值(room.src)时才展示 —— 它反映的是本地拉的档位，不是源流。
    player.on(window.mpegts.Events.MEDIA_INFO, (mi) => {
      if (!this.room.stats) this.room.stats = {};
      this.room.stats.w = mi.width || this.room.stats.w || 0;
      this.room.stats.h = mi.height || this.room.stats.h || 0;
      if (mi.fps) this.room.stats.fps = Math.round(mi.fps);
      const rate = (Number(mi.videoDataRate) || 0) + (Number(mi.audioDataRate) || 0);
      if (rate > 0) this.room.stats.metaKbps = Math.round(rate);
      this.updateStats();
    });
    // 本地拉流速度(↓)：s.speed = 上一秒下载 KB/s(突发)，积分成累计字节后在 5s 滚动窗口取均值。
    // 这是"送达本机"的速率，受本地带宽/多路抢带宽影响 —— 只作健康信号展示，不当直播间码率。
    this._statWin = [];       // [{t, kb}]
    this._cumKB = 0;          // 累计已接收 KB
    this._lastSpeedTs = 0;
    const STAT_WINDOW_MS = 5000;
    player.on(window.mpegts.Events.STATISTICS_INFO, (s) => {
      if (this.destroyed) return;
      if (!this.room.stats) this.room.stats = {};
      const now = (window.performance && performance.now()) || Date.now();
      // 把"上一秒速率"积分成累计字节(速率×时间=字节)，与采样频率无关，恒等于真实已下载量
      if (typeof s.speed === 'number') {
        if (this._lastSpeedTs) {
          const dt = (now - this._lastSpeedTs) / 1000;
          if (dt > 0 && dt < 5) this._cumKB += s.speed * dt; // KB
        }
        this._lastSpeedTs = now;
      }
      this._statWin.push({ t: now, kb: this._cumKB });
      while (this._statWin.length > 2 && now - this._statWin[0].t > STAT_WINDOW_MS) this._statWin.shift();
      const first = this._statWin[0];
      const span = (now - first.t) / 1000;
      if (span >= 1.5) { // 窗口够长才输出，保证平滑
        const dKB = this._cumKB - first.kb;
        this.room.stats.downKbps = Math.max(0, Math.round((dKB * 8) / span)); // KB×8/s = kbps(本地实际拉流速度)
      }
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
    if (this.room.presence.availability === 'live') this.updatePresence('reconnecting');
    if (flvUrl) {
      this.setState('loading', '连接直播流…');
      this.create(flvUrl);
    } else {
      this.setState('loading', '连接直播流…');
      const ok = await this.reResolve();
      if (!ok && !this.destroyed) this.recover('initial'); // 首次没定 → 转入自愈重连（真下播会在重连中2次确认后显示未开播）
    }
  }

  async reResolve(options = {}) {
    if (this.resolvePromise) return this.resolvePromise;
    this.resolvePromise = this.resolveOnce(options).finally(() => {
      this.resolvePromise = null;
    });
    return this.resolvePromise;
  }

  async resolveOnce({ preservePlaying = false } = {}) {
    try {
      const res = await window.mini.resolve(this.room.url, desiredQuality(this.room));
      if (this.destroyed) return false;
      if (res && res.ok && res.flvUrl) {
        this.updatePresence('live');
        this.room.webRid = res.webRid;
        this.room.flvUrl = res.flvUrl;
        if (res.title) this.room.title = res.title;
        if (res.anchorName) this.room.anchor = res.anchorName;
        if (res.userCount) this.room.count = res.userCount;
        if (res.srcMeta && Object.keys(res.srcMeta).length) this.room.src = res.srcMeta; // 源流标称参数（与本地无关）
        updateCellMeta(this.room);
        this.updateStats();
        syncInfoMode();
        if (!(preservePlaying && this.room.status === 'live')) this.create(res.flvUrl);
        return true;
      }
      if (res && (res.status === 'offline' || res.status === 'ended')) {
        this.updatePresence('offline');
        if (this.room.presence.availability === 'offline') {
          this.destroyPlayer();
          this.setState(res.status, '未开播');
          return true;
        }
        return false;
      }
      if (!(preservePlaying && this.room.status === 'live')) this.updatePresence('unknown');
    } catch {
      if (!(preservePlaying && this.room.status === 'live')) this.updatePresence('unknown');
    }
    return false;
  }

  // 自动追踪：未开播/已结束的格子定时重查，开播即起播
  recheck() {
    if (this.destroyed) return;
    if (this.room.presence.availability !== 'live' || this.room.status === 'loading') {
      this.attempts = 0;
      this.reResolve({ preservePlaying: true });
    }
  }

  recover(reason) {
    if (this.destroyed || this.recovering) return;
    this.recovering = true;
    this.clearTimers();
    this.attempts += 1;
    this.updatePresence('reconnecting');
    this.setState('loading', '重连中…');
    const delay = Math.min(this.attempts * 800, 10000); // 递增退避，封顶 10s，持续重连不放弃
    this.recoverTimer = setTimeout(async () => {
      this.recovering = false;
      if (this.destroyed) return;
      const ok = await this.reResolve();
      // ok=true：已明确(在播已重播 / 连续2次确认未开播)；false：还没定 → 继续重连
      if (!ok) this.recover('retry');
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
  const n = visibleRoomCount(); // 只按「可见(在播/连接中)」的格子数布局，让在播的铺满整墙
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
      <div class="cell-battle"><div class="battle-members"></div></div>
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

  // 错峰起播：逐个间隔启动，避免开机瞬间 N 路同时解码 + 同时取流把 CPU/GPU 打爆（"卡到加载不出来"的主因）
  let startIdx = 0;
  for (const room of state.rooms) {
    const cell = gridEl.querySelector(`.cell[data-id="${room.id}"]`);
    if (!cell) continue;
    const videoEl = cell.querySelector('video');
    const statusEl = cell.querySelector('.cell-status');
    const lp = new LivePlayer(videoEl, statusEl, room);
    players.set(room.id, lp);
    const delay = startIdx * 450; // 每路间隔 450ms 起播
    if (delay === 0) {
      lp.start(room.flvUrl || '');
    } else {
      lp.setState('loading', '排队加载…');
      setTimeout(() => { if (!lp.destroyed) lp.start(room.flvUrl || ''); }, delay);
    }
    startIdx += 1;
  }
  applyAudioSolo();
  syncInfoMode();
  applyLiveOnly();
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
  state.autoRecording.roomIds = state.autoRecording.roomIds.filter((roomId) => roomId !== id);
  persist();
  renderLibList();
}

function isOnWall(libId) { return state.rooms.some((r) => r.id === libId); }

// 增量加一个格子：只建这一格的 DOM+播放器，其它在播的格子完全不动。
// （以前是整墙销毁重建 → 加/减一个间导致所有间同时断流重连，CPU 瞬间打爆，正在看的画面全黑一轮）
function addCellForRoom(room, delayMs = 0) {
  emptyHint.hidden = true;
  gridEl.insertAdjacentHTML('beforeend', cellTemplate(room));
  const cell = gridEl.querySelector(`.cell[data-id="${room.id}"]`);
  if (!cell) return;
  const lp = new LivePlayer(cell.querySelector('video'), cell.querySelector('.cell-status'), room);
  players.set(room.id, lp);
  applyLayout();
  applyAudioSolo();
  if (delayMs > 0) {
    lp.setState('loading', '排队加载…');
    setTimeout(() => { if (!lp.destroyed) lp.start(room.flvUrl || ''); }, delayMs);
  } else {
    lp.start(room.flvUrl || '');
  }
  if (state.liveOnly) applyLiveOnly();
}

function makeRoom(lib) {
  return {
    id: lib.id, name: lib.name, brand: lib.brand, url: lib.url, kind: lib.kind,
    webRid: '', title: '', anchor: '', count: '', flvUrl: '', status: 'loading',
    presence: window.LivePresence.createPresence(),
    quality: savedQuality[lib.id] || '',
  };
}

function putOnWall(libId, opts = {}) {
  if (isOnWall(libId)) return;
  const lib = findLib(libId);
  if (!lib) return;
  const room = makeRoom(lib);
  state.rooms.push(room);
  if (!opts.noRender) {
    persist();
    addCellForRoom(room);
    renderLibList();
    syncInfoMode();
  }
}

// 增量删一个格子：销毁这格播放器 + 移除 DOM，其它格子照常播。
function takeOffWall(libId) {
  const lp = players.get(libId);
  if (lp) { lp.destroy(); players.delete(libId); }
  state.rooms = state.rooms.filter((r) => r.id !== libId);
  if (state.soloId === libId) state.soloId = null;
  const cell = gridEl.querySelector(`.cell[data-id="${libId}"]`);
  if (cell) cell.remove();
  emptyHint.hidden = state.rooms.length > 0;
  persist();
  applyLayout();
  renderLibList();
  syncInfoMode();
  if (state.liveOnly) applyLiveOnly();
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
      const recordChecked = state.autoRecording.roomIds.includes(it.id) ? 'checked' : '';
      const isRecording = state.recordingRooms.has(it.id);
      const kindLabel = it.kind === 'profile' ? '主页' : '直播间';
      html += `
      <div class="lib-row${isRecording ? ' is-recording' : ''}" data-id="${it.id}">
        <input type="checkbox" class="lib-check" data-id="${it.id}" ${checked} />
        <div class="lib-info">
          <input class="lib-name-edit" data-id="${it.id}" value="${escapeHtml(it.name || '')}" placeholder="${escapeHtml(it.url)}" title="改名字（回车或点别处生效）" />
          <div class="lib-meta"><span class="lib-kind ${it.kind}">${kindLabel}</span>${escapeHtml(it.url)}</div>
          <label class="lib-record-option">
            <input type="checkbox" class="lib-record-check" data-id="${it.id}" ${recordChecked} />
            <span>自动录制</span>
            <span class="recording-status">录制中</span>
          </label>
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

// 改名字：库和墙上格子同步更新（清空则回落显示直播间标题/主播名）
function setName(id, name) {
  const lib = findLib(id);
  if (!lib) return;
  lib.name = String(name || '').trim();
  const room = state.rooms.find((r) => r.id === id);
  if (room) { room.name = lib.name; updateCellMeta(room); }
  persist();
}

function setRoomAutoRecording(id, enabled) {
  const selected = new Set(state.autoRecording.roomIds);
  if (enabled) selected.add(id);
  else selected.delete(id);
  state.autoRecording.roomIds = state.library
    .map((room) => room.id)
    .filter((roomId) => selected.has(roomId));
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
// 弹幕/礼物/战况任一开着才连弹幕 WS；全关 = 一条连接都不建，零开销
function syncInfoMode() {
  const on = !!(state.showDanmu || state.showGifts || state.showBattle);
  window.mini.setInfoMode(on, on ? wallRids() : []);
}

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

// 弹幕/礼物渲染。一批消息（{rid, items:[...]}）：评论→右侧面板，礼物→左侧面板，在线→顶部数字。
// 对应开关关着的类型直接丢弃（不建 DOM），默认全关时这条路径零开销。
const DANMU_MAX = 40;   // 每格评论 DOM 上限（多路同开时控制节点总量）
const GIFT_MAX = 30;    // 每格礼物行上限
function handleDanmu(payload) {
  if (!payload || !payload.rid || !Array.isArray(payload.items)) return;
  const cell = gridEl.querySelector(`.cell[data-rid="${payload.rid}"]`);
  if (!cell) return;
  let commentFrag = null;
  for (const it of payload.items) {
    if (it.type === 'online') { updateOnlineCell(cell, payload.rid, it.online); continue; }
    if (it.type === 'gift') { if (state.showGifts) appendGift(cell, it); continue; }
    if (it.type === 'members') { if (state.showBattle) renderBattleMembers(cell, it.list); continue; }
    if (it.type === 'rank') continue; // 左侧留给实时礼物，贡献榜不再叠加
    if (!state.showDanmu) continue;
    if (!commentFrag) commentFrag = document.createDocumentFragment();
    commentFrag.appendChild(buildCommentLine(it));
  }
  // 一批评论一次性插入 + 只滚动一次，比逐条 append 省一大截布局开销
  if (commentFrag) {
    const panel = cell.querySelector('.cell-comments');
    if (panel) {
      panel.appendChild(commentFrag);
      while (panel.children.length > DANMU_MAX) panel.removeChild(panel.firstChild);
      panel.scrollTop = panel.scrollHeight;
    }
  }
}

function buildCommentLine(it) {
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
  return line;
}

// 比赛战况：团播成员实时分数 + 状态（表演中/冲刺中等，有状态就高亮）
function fmtScore(n) {
  n = Number(n) || 0;
  return n >= 10000 ? (n / 10000).toFixed(1).replace(/\.0$/, '') + 'w' : String(n);
}
function renderBattleMembers(cell, list) {
  const panel = cell.querySelector('.battle-members');
  if (!panel || !Array.isArray(list)) return;
  panel.innerHTML = list.map((m) =>
    `<div class="bm-line${m.status ? ' bm-on' : ''}">`
    + `<span class="bm-name">${escapeHtml(m.name || '')}</span>`
    + `<span class="bm-status">${escapeHtml(m.status || '')}</span>`
    + `<span class="bm-score">${fmtScore(m.score)}</span></div>`
  ).join('');
}

// 实时礼物（左侧）。连击/重复送同款：合并到最后一行只更新数量，不刷屏。
// 连击消息带的是累计数量，所以同键取 max 而不是相加。
function appendGift(cell, it) {
  const panel = cell.querySelector('.cell-gifts');
  if (!panel) return;
  const count = Math.max(1, Number(it.giftCount) || 1);
  const key = `${it.user || ''}|${it.giftName || ''}`;
  const last = panel.lastElementChild;
  if (last && last.dataset.key === key) {
    const n = Math.max(Number(last.dataset.count) || 1, count);
    last.dataset.count = String(n);
    last.querySelector('.gift-count').textContent = n > 1 ? `×${n}` : '';
    return;
  }
  const line = document.createElement('div');
  line.className = 'gift-line';
  line.dataset.key = key;
  line.dataset.count = String(count);
  const u = document.createElement('span');
  u.className = 'gift-user';
  u.textContent = it.user || '';
  const g = document.createElement('span');
  g.className = 'gift-name';
  g.textContent = ` 送 ${it.giftName || '礼物'} `;
  const c = document.createElement('span');
  c.className = 'gift-count';
  c.textContent = count > 1 ? `×${count}` : '';
  line.appendChild(u); line.appendChild(g); line.appendChild(c);
  panel.appendChild(line);
  while (panel.children.length > GIFT_MAX) panel.removeChild(panel.firstChild);
  panel.scrollTop = panel.scrollHeight;
}

function updateOnlineCell(cell, rid, online) {
  if (!online) return;
  const room = state.rooms.find((r) => r.webRid === rid);
  if (room) room.count = online;
  const onlineEl = cell.querySelector('.cell-online');
  if (onlineEl) onlineEl.textContent = `${online} 在线`;
}

// —— 持久化 —— //
function normalizeAutoRecording(value) {
  const input = value && typeof value === 'object' ? value : {};
  const durationHours = Number(input.durationHours);
  const validIds = new Set(state.library.map((room) => room.id));
  return {
    enabled: input.enabled === true,
    durationHours: Number.isInteger(durationHours) && durationHours >= 1 && durationHours <= 5
      ? durationHours
      : 1,
    roomIds: [...new Set(Array.isArray(input.roomIds) ? input.roomIds : [])]
      .filter((id) => validIds.has(id)),
  };
}

function applyAutoRecordingControls() {
  if (autoRecordingEnabledEl) autoRecordingEnabledEl.checked = state.autoRecording.enabled;
  if (autoRecordingDurationEl) autoRecordingDurationEl.value = String(state.autoRecording.durationHours);
}

function syncAutoRecordingConfig() {
  window.mini.setAutoRecordingConfig({
    library: state.library,
    autoRecording: state.autoRecording,
  });
}

function persist() {
  const quality = {};
  for (const r of state.rooms) if (r.quality) quality[r.id] = r.quality;
  const snapshot = {
    cols: state.cols,
    library: state.library,
    wall: state.rooms.map((r) => r.id),
    showDanmu: state.showDanmu,
    showGifts: state.showGifts,
    showBattle: state.showBattle,
    globalQuality: state.globalQuality,
    hudAlways: state.hudAlways,
    liveOnly: state.liveOnly,
    autoRecording: state.autoRecording,
    quality,
  };
  window.mini.saveRooms(snapshot);
  syncAutoRecordingConfig();
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

if (autoRecordingEnabledEl) autoRecordingEnabledEl.addEventListener('change', () => {
  state.autoRecording.enabled = autoRecordingEnabledEl.checked;
  persist();
  toast(state.autoRecording.enabled ? '自动录制已开启' : '自动录制已关闭');
});
if (autoRecordingDurationEl) autoRecordingDurationEl.addEventListener('change', () => {
  state.autoRecording.durationHours = Number(autoRecordingDurationEl.value);
  state.autoRecording = normalizeAutoRecording(state.autoRecording);
  applyAutoRecordingControls();
  persist();
  toast(`自动录制时长：${state.autoRecording.durationHours} 小时`);
});

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

// 弹幕/礼物/战况开关（默认关；任一开着才连弹幕 WS，关掉清空面板释放 DOM）
const btnDanmu = document.getElementById('btn-danmu');
const btnGifts = document.getElementById('btn-gifts');
const btnBattle = document.getElementById('btn-battle');
function applyOverlayToggles() {
  gridEl.classList.toggle('show-danmu', !!state.showDanmu);
  gridEl.classList.toggle('show-gifts', !!state.showGifts);
  gridEl.classList.toggle('show-battle', !!state.showBattle);
  if (btnDanmu) btnDanmu.classList.toggle('active', !!state.showDanmu);
  if (btnGifts) btnGifts.classList.toggle('active', !!state.showGifts);
  if (btnBattle) btnBattle.classList.toggle('active', !!state.showBattle);
  if (!state.showDanmu) gridEl.querySelectorAll('.cell-comments').forEach((p) => { p.textContent = ''; });
  if (!state.showGifts) gridEl.querySelectorAll('.cell-gifts').forEach((p) => { p.textContent = ''; });
  if (!state.showBattle) gridEl.querySelectorAll('.battle-members').forEach((p) => { p.textContent = ''; });
}
function wireOverlayToggle(btn, key, onMsg, offMsg, onEnable) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    state[key] = !state[key];
    applyOverlayToggles();
    syncInfoMode();
    persist();
    toast(state[key] ? onMsg : offMsg);
    if (state[key] && onEnable) onEnable();
  });
}
wireOverlayToggle(btnDanmu, 'showDanmu', '实时弹幕已开（画面右侧）', '实时弹幕已关');
wireOverlayToggle(btnGifts, 'showGifts', '实时礼物已开（画面左侧）', '实时礼物已关', () => {
  // 抖音只对登录用户的弹幕连接推送礼物消息（弹幕/点赞/进场不受影响）→ 没登录明确告知，不让人以为坏了
  window.mini.getLoginStatus().then((ok) => {
    if (!ok) toast('抖音只给登录用户推送礼物消息：请点右上 ⚙ →「扫码登录抖音」，登录后礼物才会显示', 6000);
  }).catch(() => {});
});
wireOverlayToggle(btnBattle, 'showBattle', '比赛战况已开（画面上部，等比赛数据推送）', '比赛战况已关');
// 攒批弹幕：一包多房间，一个 rAF 内全部渲染完，8+ 房间同时刷也只触发一次布局
window.mini.onDanmuBatch((map) => {
  if (!map) return;
  for (const rid in map) handleDanmu({ rid, items: map[rid] });
});

window.mini.onRecordingStatus((payload) => {
  if (!payload || !payload.roomId) return;
  if (payload.status === 'recording') state.recordingRooms.add(payload.roomId);
  else state.recordingRooms.delete(payload.roomId);
  const row = libListEl.querySelector(`.lib-row[data-id="${payload.roomId}"]`);
  if (row) row.classList.toggle('is-recording', payload.status === 'recording');
  if (payload.status === 'recording') {
    toast(`${payload.roomName} 开始自动录制`);
  } else if (payload.status === 'failed') {
    toast(`${payload.roomName} 自动录制失败`, 5000);
  } else if (payload.status === 'stopped' && payload.reason !== 'app-quit') {
    toast(`${payload.roomName} 自动录制已结束`);
  }
});

// 只看在播开关
const btnLiveOnly = document.getElementById('btn-live-only');
const liveOnlyEmpty = document.getElementById('liveonly-empty');
function applyLiveOnly() {
  if (btnLiveOnly) btnLiveOnly.classList.toggle('active', !!state.liveOnly);
  gridEl.classList.toggle('live-only', !!state.liveOnly);
  for (const room of state.rooms) {
    const cell = gridEl.querySelector(`.cell[data-id="${room.id}"]`);
    if (cell) cell.classList.toggle('cell-hidden', isHiddenByLiveOnly(room));
  }
  // 开了只看在播、但一个在播的都没有 → 给个提示，别让整墙空着让人以为坏了
  if (liveOnlyEmpty) {
    liveOnlyEmpty.hidden = !(state.liveOnly && state.rooms.length > 0 && visibleRoomCount() === 0);
  }
  applyLayout();
}
if (btnLiveOnly) btnLiveOnly.addEventListener('click', () => {
  state.liveOnly = !state.liveOnly;
  applyLiveOnly();
  persist();
  toast(state.liveOnly ? '只显示当前在播' : '显示全部直播间');
});

async function refreshAllRooms() {
  if (refreshAllRooms.running) return;
  refreshAllRooms.running = true;
  if (btnRefreshAll) btnRefreshAll.disabled = true;
  const jobs = [...players.values()].map((player, index) => new Promise((resolve) => {
    setTimeout(() => resolve(player.reResolve({ preservePlaying: true })), index * 250);
  }));
  try {
    await Promise.all(jobs);
    const liveCount = state.rooms.filter((room) => room.presence.availability === 'live').length;
    toast(`刷新完成，当前 ${liveCount} 个直播间在播`);
  } finally {
    refreshAllRooms.running = false;
    if (btnRefreshAll) btnRefreshAll.disabled = false;
  }
}
refreshAllRooms.running = false;
if (btnRefreshAll) btnRefreshAll.addEventListener('click', refreshAllRooms);

// 手动检查更新
const btnCheckUpdate = document.getElementById('btn-check-update');
if (btnCheckUpdate) btnCheckUpdate.addEventListener('click', async () => {
  toast('正在检查更新…');
  try { await window.mini.checkUpdate(); } catch { /* 主进程会弹窗提示 */ }
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
  // 增量补上缺的格子（已在播的不动不重连），新格子错峰起播防 CPU 尖峰
  const newRooms = [];
  for (const it of state.library) {
    if (isOnWall(it.id)) continue;
    const room = makeRoom(it);
    state.rooms.push(room);
    newRooms.push(room);
  }
  newRooms.forEach((room, i) => addCellForRoom(room, i * 450));
  persist(); renderLibList(); syncInfoMode();
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
  const record = e.target.closest('.lib-record-check');
  if (record) { setRoomAutoRecording(record.dataset.id, record.checked); return; }
  const chk = e.target.closest('.lib-check');
  if (chk) { toggleWall(chk.dataset.id); return; }
  const grp = e.target.closest('.lib-group-edit');
  if (grp) { setBrand(grp.dataset.id, grp.value); return; }
  const nm = e.target.closest('.lib-name-edit');
  if (nm) { setName(nm.dataset.id, nm.value); return; }
});
// 名字输入框回车 = 立即生效并收起键盘焦点
libListEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest('.lib-name-edit')) e.target.blur();
});
libListEl.addEventListener('click', (e) => {
  const del = e.target.closest('.lib-del');
  if (!del) return;
  removeFromLibrary(del.dataset.id);
});

const ROOM_POLL_INTERVAL_MS = 15_000;

// 自动追踪：错峰重查未开播、状态未知和重连中的格子，开播即上画面
setInterval(() => {
  let index = 0;
  for (const lp of players.values()) {
    setTimeout(() => lp.recheck(), index * 250);
    index += 1;
  }
}, ROOM_POLL_INTERVAL_MS);

// 每 90s 刷新在播房间的在线人数（只更新数字，不改播放状态；错峰避免接口密集触发风控）
setInterval(async () => {
  for (const lp of players.values()) {
    if (lp.destroyed || lp.room.status !== 'live' || !lp.room.webRid) continue;
    try {
      const res = await window.mini.resolve(lp.room.webRid, 'fluent');
      // 只取在线人数+源流标称参数，绝不因此改播放状态（接口这次抽风也不影响画面）
      if (res && res.userCount) lp.room.count = res.userCount;
      if (res && res.srcMeta && Object.keys(res.srcMeta).length) lp.room.src = res.srcMeta; // 主播中途改推流设置也能跟上
      if (res && (res.userCount || res.srcMeta)) lp.updateStats();
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 400)); // 逐个错峰，别一次性打爆接口
  }
}, 90000);

// mac 隐藏标题栏时红绿灯悬在窗口左上 → 给 topbar 留出让位间距（Windows 无此问题不留）
if (/Mac/i.test(navigator.platform)) document.body.classList.add('platform-mac');

// —— 启动 —— //
async function init() {
  let saved;
  try { saved = await window.mini.loadRooms(); } catch { saved = null; }
  const savedAutoRecording = saved && saved.autoRecording;
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
  state.liveOnly = !!(saved && saved.liveOnly);
  state.showDanmu = !!(saved && saved.showDanmu);
  state.showGifts = !!(saved && saved.showGifts);
  state.showBattle = !!(saved && saved.showBattle);
  applyOverlayToggles();
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

  state.autoRecording = normalizeAutoRecording(savedAutoRecording);
  applyAutoRecordingControls();
  syncAutoRecordingConfig();

  for (const libId of wall) putOnWall(libId, { noRender: true });
  renderGrid();
  renderLibList();
  // 上墙完成后再持久化，确保默认上墙状态被正确保存
  if (firstRun) persist();
}

init();
