'use strict';

(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LivePresence = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const PRESENCE_GRACE_MS = 30_000;

  function createPresence() {
    return {
      availability: 'checking',
      offlineConfirmations: 0,
      uncertainSince: null,
    };
  }

  function reducePresence(current, event, now = Date.now()) {
    const state = current || createPresence();

    if (event.type === 'live') {
      return {
        availability: 'live',
        offlineConfirmations: 0,
        uncertainSince: null,
      };
    }

    if (event.type === 'offline') {
      const offlineConfirmations = state.offlineConfirmations + 1;
      return {
        availability: offlineConfirmations >= 2 ? 'offline' : state.availability,
        offlineConfirmations,
        uncertainSince: offlineConfirmations >= 2 ? null : state.uncertainSince,
      };
    }

    if (event.type === 'reconnecting') {
      return {
        ...state,
        uncertainSince: state.uncertainSince == null ? now : state.uncertainSince,
      };
    }

    if (event.type === 'unknown') {
      const uncertainSince = state.uncertainSince ?? now;
      return {
        availability: state.availability === 'live' && now - uncertainSince < PRESENCE_GRACE_MS
          ? 'live' : 'checking',
        offlineConfirmations: 0,
        uncertainSince,
      };
    }

    return state;
  }

  function isHiddenByLiveOnly(liveOnly, presence) {
    // 仅过滤显示，不把未知状态改成离线；隐藏的房间仍在后台查询。
    return Boolean(liveOnly && presence?.availability !== 'live');
  }

  return {
    PRESENCE_GRACE_MS,
    createPresence,
    reducePresence,
    isHiddenByLiveOnly,
  };
});
