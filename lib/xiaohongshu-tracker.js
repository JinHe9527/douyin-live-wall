'use strict';

const { selectedRoomUrl } = require('./live-platform');

// 直播间号标识一场直播；旧场次结束后通过官方搜索找回同一主播。
// 后台查询独立排队，避免多宫格互相取消搜索，也不干扰用户主动搜索。
function createXiaohongshuTracker({ resolve, search, now = Date.now, cooldownMs = 60000 }) {
  const searches = new Map();
  const discovered = new Map();
  let queue = Promise.resolve();
  let stopped = false;
  const normalize = (name) => String(name || '').normalize('NFKC').trim().toLocaleLowerCase();
  const unknown = (message) => ({ ok: false, status: 'unknown', message });

  function find(name) {
    const key = normalize(name);
    const cached = searches.get(key);
    if (cached && (cached.pending || now() - cached.at < cooldownMs)) return cached.promise;
    const known = discovered.get(key);
    if (known && now() - known.at < cooldownMs) return Promise.resolve({ status: 'success', candidates: known.candidates });
    const entry = { pending: true, at: now() };
    entry.promise = queue.then(async () => {
      if (stopped) return { status: 'cancelled', candidates: [] };
      const known = discovered.get(key);
      if (known && now() - known.at < cooldownMs) return { status: 'success', candidates: known.candidates };
      const result = await search(name);
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
      const message = result.message || '无法确认主播当前直播，请登录小红书后重试';
      // 已确认结束的旧场次保持未开播；新场次查询失败放在悬停详情，后台继续重试。
      return original.status === 'offline' ? { ...original, message: '未开播', reason: message } : unknown(message);
    }
    const matches = (result.candidates || []).filter((item) => anchorId
      ? item.anchorId === anchorId : normalize(item.title) === normalize(name));
    if (!matches.length) return original.status === 'offline'
      ? { ...original, message: '未开播' } : unknown('暂未确认直播状态，请稍后刷新');
    if (matches.length > 1) return unknown('找到多个同名直播，请搜索并选择正确主播');
    const candidate = matches[0];
    const url = selectedRoomUrl(candidate.roomUrl, 'xiaohongshu');
    if (!url) return unknown('直播链接无效，请重新搜索');
    if (url.split('?')[0] === String(input).split('?')[0]) return original;
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
