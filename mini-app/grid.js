'use strict';

/* 抖音多宫格直播墙 —— 渲染层。
   模型：直播间库(library) + 上墙(wall)。库里可放直播间链接或主播主页(secUid)。
   主页类型会自动找他正在播的直播间；未开播则显示「未开播」并定时轮询，开播即出画面。
   每个上墙的格子 = 一个 <video> + mpegts.js 直接播 flv，卡顿/过期自愈。 */

const gridEl = document.getElementById('grid');
const emptyHint = document.getElementById('empty-hint');
const inputEl = document.getElementById('room-input');
const btnAdd = document.getElementById('btn-add');
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
  rooms: [],     // 上墙(播放中) [{ id, name, brand, url, kind, webRid, title, anchor, count, flvUrl, status }]
  cols: 'auto',
  soloId: null,
};
const players = new Map(); // id -> LivePlayer

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

function desiredQuality() {
  const n = state.rooms.length;
  if (n <= 4) return 'hd';
  if (n <= 6) return 'sd';
  return 'fluent';
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
      const res = await window.mini.resolve(this.room.url, desiredQuality());
      if (res && res.ok && res.flvUrl) {
        this.room.webRid = res.webRid;
        this.room.flvUrl = res.flvUrl;
        if (res.title) this.room.title = res.title;
        if (res.anchorName) this.room.anchor = res.anchorName;
        if (res.userCount) this.room.count = res.userCount;
        updateCellMeta(this.room);
        this.create(res.flvUrl);
        return true;
      }
      if (res && res.status === 'offline') { this.setState('offline', '未开播'); return true; }
      if (res && res.status === 'ended') { this.setState('ended', '直播已结束'); return true; }
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
function colsForCount(n) {
  if (state.cols !== 'auto') return Number(state.cols);
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

function icon(name) {
  const I = {
    mute: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>',
    sound: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>',
    reload: '<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[name]}</svg>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function cellTemplate(room) {
  const isSolo = state.soloId === room.id;
  const label = room.name || room.title || room.anchor || room.url;
  return `
  <article class="cell${isSolo ? ' solo-audio' : ''}" data-id="${room.id}">
    <video playsinline muted></video>
    <div class="cell-status" data-state="loading">
      <div class="cell-spinner"></div>
      <div class="cell-status-text">连接直播流…</div>
    </div>
    <div class="cell-hud">
      <div class="cell-hud-left">
        <span class="cell-live-dot"></span>
        <span class="cell-title">${escapeHtml(label)}</span>
      </div>
      <span class="cell-count">${room.count ? escapeHtml(room.count) + ' 人' : ''}</span>
    </div>
    <div class="cell-ctrl">
      <button class="icon-btn act-audio${isSolo ? ' on' : ''}" title="独占音频" data-act="audio">${icon(isSolo ? 'sound' : 'mute')}</button>
      <button class="icon-btn act-reload" title="刷新" data-act="reload">${icon('reload')}</button>
      <button class="icon-btn act-full" title="全屏" data-act="full">${icon('full')}</button>
      <button class="icon-btn act-close" title="下墙" data-act="close">${icon('close')}</button>
    </div>
  </article>`;
}

function updateCellMeta(room) {
  const cell = gridEl.querySelector(`.cell[data-id="${room.id}"]`);
  if (!cell) return;
  const titleEl = cell.querySelector('.cell-title');
  const countEl = cell.querySelector('.cell-count');
  if (titleEl) titleEl.textContent = room.name || room.title || room.anchor || room.url;
  if (countEl) countEl.textContent = room.count ? `${room.count} 人` : '';
}

function applyColumns() {
  const cols = colsForCount(state.rooms.length);
  gridEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
}

function renderGrid() {
  emptyHint.hidden = state.rooms.length > 0;
  applyColumns();

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

// —— 持久化 —— //
function persist() {
  window.mini.saveRooms({
    cols: state.cols,
    library: state.library,
    wall: state.rooms.map((r) => r.id),
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
    applyColumns();
  });
});

gridEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const id = cell.dataset.id;
  const act = btn.dataset.act;
  if (act === 'audio') soloAudio(id);
  else if (act === 'reload') reloadRoom(id);
  else if (act === 'full') fullscreenCell(id);
  else if (act === 'close') takeOffWall(id);
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
