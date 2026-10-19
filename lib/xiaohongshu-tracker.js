'use strict';

const { selectedRoomUrl } = require('./live-platform');

// 直播间号标识一场直播；旧场次结束后通过官方搜索找回同一主播。
// 后台查询独立排队，避免多宫格互相取消搜索，也不干扰用户主动搜索。
function createXiaohongshuTracker({ resolve, search, now = Date.now, cooldownMs = 60000 }) {
  const searches = new Map();
  const discovered = new Map();
  let queue = Promise.resolve();
  let stopped = false;
  let deniedSearch = null;
  const normalize = (name) => String(name || '').normalize('NFKC').trim().toLocaleLowerCase();
  const unknown = (message) => ({ ok: false, status: 'unknown', message });
  const unconfirmed = (original, reason) => ({
    ...unknown(original.status === 'offline' || original.status === 'ended'
      ? '旧场次已结束，暂未找到新场次' : '暂未确认直播状态，将自动重试'),
    anchorName: original.anchorName,
    reason,
  });

  function find(name) {
    const key = normalize(name);
    const cached = searches.get(key);
    if (cached && (cached.pending || now() - cached.at < cooldownMs)) return cached.promise;
    const known = discovered.get(key);
    if (known && now() - known.at < cooldownMs) return Promise.resolve({ status: 'success', candidates: known.candidates });
    const entry = { pending: true, at: now() };
    entry.promise = queue.then(async () => {
      if (stopped) return { status: 'cancelled', candidates: [] };
      // 登录/验证是整个平台的限制，不让不同主播在同一分钟内轮流重复搜索。
      if (deniedSearch && now() - deniedSearch.at < cooldownMs) return deniedSearch.result;
      const known = discovered.get(key);
      if (known && now() - known.at < cooldownMs) return { status: 'success', candidates: known.candidates };
      const result = await search(name);
      if (result.status === 'login_required') deniedSearch = { at: now(), result };
      else if (result.status === 'success') deniedSearch = null;
      if (result.status === 'success') {
        const groups = new Map();
        for (const item of result.candidates || []) {
          const title = normalize(item.title);
          if (!groups.has(title)) groups.set(title, []);
          groups.get(title).push(item);
        }
        for (const [title, candidates] of groups) discovered.set(title, { at: now(), candidates });
      }
      return result;
    }).catch(() => ({ status: 'error', candidates: [] }))
      .finally(() => { entry.pending = false; entry.at = now(); });
    queue = entry.promise.then(() => {});
    searches.set(key, entry);
    return entry.promise;
  }

  async function resolveRoom(input, quality, { anchorName, anchorId } = {}) {
    if (stopped) return unknown('直播查询已停止');
    const original = await resolve(input, quality);
    if (original.ok) return original;
    // 优先使用旧场次官方返回的名字；自定义房间备注不作为主播身份。
    const name = original.anchorName || anchorName;
    if (!name) return original;
    const result = await find(name);
    if (stopped) return unknown('直播查询已停止');
    if (result.status !== 'success') {
      // 场次结束不代表主播当前下播；搜索受限也不能作为离线证据。
      return unconfirmed(original, result.message || '无法查询主播新场次，后台将继续重试');
    }
    const matches = (result.candidates || []).filter((item) => anchorId
      ? item.anchorId === anchorId : normalize(item.title) === normalize(name));
    if (!matches.length) {
      const offline = (result.offlineAnchors || []).filter((item) => anchorId
        ? item.anchorId === anchorId : normalize(item.title) === normalize(name));
      if (offline.length === 1) return { ...original, ok: false, status: 'offline', message: '未开播',
        anchorName: offline[0].title, anchorId: offline[0].anchorId, reason: '官方主播搜索确认未开播' };
      return unconfirmed(original, '搜索结果没有确认该主播当前场次');
    }
    if (matches.length > 1) return unknown('找到多个同名直播，请搜索并选择正确主播');
    const candidate = matches[0];
    const url = selectedRoomUrl(candidate.roomUrl, 'xiaohongshu');
    if (!url) return unknown('直播链接无效，请重新搜索');
    if (url.split('?')[0] === String(input).split('?')[0]) {
      return unconfirmed(original, '搜索仍返回已保存的旧场次，后台将继续重试');
    }
    const current = await resolve(url, quality);
    if (!current.ok) return unknown(current.message || '新场次暂不可播放，将自动重试');
    if (current.anchorName && normalize(current.anchorName) !== normalize(candidate.title)) {
      return unknown('直播间主播信息不一致，请重新搜索确认');
    }
    return { ...current, roomUrl: url, anchorName: current.anchorName || candidate.title,
      anchorId: candidate.anchorId || anchorId || '', refreshedRoom: true };
  }
  return { resolveRoom, stop: () => { stopped = true; } };
}

module.exports = { createXiaohongshuTracker };
