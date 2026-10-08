(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LivePlatform = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  const PLATFORMS = Object.freeze({
    douyin: { name: '抖音', home: 'https://www.douyin.com/', partition: 'persist:douyin' },
    xiaohongshu: { name: '小红书', home: 'https://www.xiaohongshu.com/', partition: 'persist:xiaohongshu' },
  });

  function normalizePlatform(value) {
    return value === 'xiaohongshu' ? value : 'douyin';
  }

  function isPlatformUrl(value, platform) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return false;
      const domains = platform === 'xiaohongshu'
        ? ['xiaohongshu.com', 'xhslink.com', 'redelight.cn']
        : ['douyin.com'];
      return domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
    } catch { return false; }
  }

  function roomUrl(id, platform) {
    if (!/^\d+$/.test(String(id))) return '';
    return platform === 'xiaohongshu'
      ? `https://www.xiaohongshu.com/livestream/${id}`
      : `https://live.douyin.com/${id}`;
  }

  function selectedRoomUrl(value, platform) {
    try {
      const url = new URL(value);
      if (platform === 'xiaohongshu' && url.protocol === 'xhsdiscover:' && url.hostname === 'live_audience') {
        return roomUrl(url.searchParams.get('room_id'), platform);
      }
      if (!isPlatformUrl(value, platform)) return '';
      if (platform === 'xiaohongshu') {
        return /^\/(?:hina\/)?livestream\/\d+(?:\/\d+)?\/?$/.test(url.pathname) ? url.href : '';
      }
      if (url.hostname === 'live.douyin.com' && /^\/\d+\/?$/.test(url.pathname)) return url.href;
      const match = url.pathname.match(/^\/follow\/live\/(\d+)\/?$/);
      return match ? roomUrl(match[1], platform) : '';
    } catch { return ''; }
  }

  function searchUrl(keyword, platform) {
    return platform === 'xiaohongshu'
      ? `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`
      : `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=live`;
  }

  function parseInput(input, platform) {
    const text = String(input || '').trim();
    if (!text) return { kind: 'invalid', url: '' };
    if (/^\d{6,}$/.test(text)) return { kind: 'live', url: roomUrl(text, platform) };
    const match = text.match(/https?:\/\/[^\s<>"，。！）]+/i);
    if (match) {
      const url = match[0];
      if (!isPlatformUrl(url, platform)) return { kind: 'invalid', url: '' };
      if (selectedRoomUrl(url, platform)) return { kind: 'live', url };
      const parsed = new URL(url);
      if (platform === 'xiaohongshu') {
        return parsed.hostname === 'xhslink.com' || parsed.hostname.endsWith('.xhslink.com')
          ? { kind: 'live', url } : { kind: 'invalid', url: '' };
      }
      return { kind: /^\/user\//.test(parsed.pathname) ? 'profile' : 'live', url };
    }
    if (/[:/]/.test(text) || text.length > 80) return { kind: 'invalid', url: '' };
    return { kind: 'keyword', keyword: text, url: searchUrl(text, platform) };
  }

  function restoreStore(saved) {
    if (saved && saved.profiles && typeof saved.profiles === 'object') {
      return {
        activePlatform: normalizePlatform(saved.activePlatform),
        profiles: { douyin: saved.profiles.douyin, xiaohongshu: saved.profiles.xiaohongshu },
      };
    }
    return { activePlatform: 'douyin', profiles: { douyin: saved || undefined } };
  }

  function saveProfile(store, platform, snapshot) {
    return { activePlatform: normalizePlatform(platform), profiles: { ...store.profiles, [normalizePlatform(platform)]: snapshot } };
  }

  return { PLATFORMS, normalizePlatform, isPlatformUrl, roomUrl, selectedRoomUrl, searchUrl, parseInput, restoreStore, saveProfile };
});
