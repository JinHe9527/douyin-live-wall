function buildDirectRoomUrl(roomId) {
  return `https://live.douyin.com/${roomId}`;
}

function buildKeywordSearchUrl(keyword) {
  return `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=live`;
}

function buildDefaultMonitorUrl() {
  return 'https://www.douyin.com/?_antigravity_history=1';
}

function isLegacyDefaultSearchUrl(url) {
  const hostname = String(url.hostname || '').toLowerCase();
  const keyword = url.searchParams.get('keyword');
  const pathname = decodeURIComponent(url.pathname || '');

  if (hostname === 'so.douyin.com' && keyword === '直播') {
    return true;
  }

  return hostname === 'www.douyin.com'
    && pathname === '/search/直播'
    && url.searchParams.get('type') === 'live';
}

function extractRoomId(value) {
  const text = String(value || '').trim();
  const match = text.match(/live\.douyin\.com\/(\d{6,})/);
  return match ? match[1] : '';
}

function normalizeRoomUrl(value) {
  const roomId = extractRoomId(value);
  return roomId ? buildDirectRoomUrl(roomId) : '';
}

function pickLiveRoomUrlFromLinks(links) {
  const items = Array.isArray(links) ? links : [];

  return items
    .map((item) => {
      const href = String(item?.href || '').trim();
      const text = String(item?.text || '').trim();
      const roomUrl = normalizeRoomUrl(href);

      if (!roomUrl) {
        return null;
      }

      let score = 0;
      if (text.includes('直播中') || text.includes('进入直播间')) {
        score += 3;
      }
      if (href.includes('room_id=')) {
        score += 2;
      }
      if (text === '直播') {
        score -= 2;
      }

      return { roomUrl, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)[0]?.roomUrl || '';
}

function normalizePersistedSlotUrl(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\//.test(text)) {
    return null;
  }

  try {
    const url = new URL(text);
    if (!url.hostname.includes('douyin.com')) {
      return null;
    }

    if (isLegacyDefaultSearchUrl(url)) {
      return buildDefaultMonitorUrl();
    }

    return normalizeRoomUrl(text) || url.toString();
  } catch {
    return null;
  }
}

function sanitizePersistedSlotUrls(values) {
  return (values || []).map((value) => normalizePersistedSlotUrl(value));
}

function extractRoomTitle(value) {
  const title = String(value || '').trim();
  const match = title.match(/^(.*?)的抖音直播间(?:\s*-\s*抖音直播)?$/);
  return match ? match[1].trim() : '';
}

function parseMonitorInput(input) {
  const value = String(input || '').trim();

  if (!value) {
    return { kind: 'empty', url: '' };
  }

  if (/^https?:\/\//.test(value)) {
    return { kind: 'url', url: value };
  }

  if (/^\d+$/.test(value)) {
    return {
      kind: 'room-id',
      roomId: value,
      url: buildDirectRoomUrl(value)
    };
  }

  return {
    kind: 'keyword',
    keyword: value,
    url: buildKeywordSearchUrl(value)
  };
}

module.exports = {
  buildDirectRoomUrl,
  buildKeywordSearchUrl,
  buildDefaultMonitorUrl,
  parseMonitorInput,
  normalizeRoomUrl,
  pickLiveRoomUrlFromLinks,
  normalizePersistedSlotUrl,
  sanitizePersistedSlotUrls,
  extractRoomTitle
};
