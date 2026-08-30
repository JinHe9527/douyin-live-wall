function buildDirectRoomUrl(roomId) {
  return `https://live.douyin.com/${roomId}`;
}

function buildUserPageUrl(secUid) {
  return `https://www.douyin.com/user/${secUid}`;
}

const NOISE_LINES = new Set([
  '点击或按',
  '进入直播间',
  '直播中',
  '展开',
  '收起',
  '...',
  '关注',
  '已关注',
  '相互关注'
]);

function sanitizeLine(line) {
  return String(line || '').trim().replace(/^[·\s]+/, '').trim();
}

function pickTitle(item) {
  const directTitle = sanitizeLine(item.title);
  if (directTitle && !NOISE_LINES.has(directTitle)) {
    return directTitle;
  }

  const lines = Array.isArray(item.lines) ? item.lines : [];
  return lines
    .map(sanitizeLine)
    .find((line) => line && !NOISE_LINES.has(line) && !line.includes('直播'));
}

function pickStatusText(item) {
  const directStatus = sanitizeLine(item.statusText);
  if (directStatus) {
    return directStatus;
  }

  const lines = Array.isArray(item.lines) ? item.lines : [];
  return lines
    .map(sanitizeLine)
    .find((line) => line && line.includes('直播') && !NOISE_LINES.has(line));
}

function pickMetricsText(item, title, statusText) {
  const directMetrics = sanitizeLine(item.metricsText);
  if (directMetrics) {
    return directMetrics;
  }

  const lines = Array.isArray(item.lines) ? item.lines : [];
  return lines
    .map(sanitizeLine)
    .find((line) => line && !NOISE_LINES.has(line) && line !== title && line !== statusText);
}

function normalizeCandidates(rawItems) {
  const seen = new Set();

  return rawItems
    .map((item) => {
      const uniqueId = String(item.uniqueId || '').trim();
      const roomId = String(item.roomId || '').trim();
      const secUid = String(item.secUid || '').trim();
      const title = pickTitle(item);
      const statusText = pickStatusText(item);
      const metricsText = pickMetricsText(item, title, statusText);

      // 需要至少有标题和某种标识
      const dedupeKey = roomId || secUid || uniqueId;
      if (!title || !dedupeKey || seen.has(dedupeKey)) {
        return null;
      }

      seen.add(dedupeKey);

      // 优先用直播间 URL，其次用用户主页
      let roomUrl = '';
      if (roomId) {
        roomUrl = buildDirectRoomUrl(roomId);
      } else if (secUid) {
        roomUrl = buildUserPageUrl(secUid);
      }

      const isLive = Boolean(item.isLive);
      const liveStatus = isLive ? '直播中' : '未开播';
      const subtitle = [liveStatus, statusText, metricsText].filter(Boolean).join(' · ');

      return {
        id: roomId || secUid || uniqueId,
        roomUrl,
        title,
        avatar: String(item.avatar || '').trim(),
        subtitle,
        isLive,
        secUid
      };
    })
    .filter(Boolean);
}

// 综合搜索抓取脚本：同时处理直播间卡片和用户卡片
const CANDIDATE_SCRAPE_SCRIPT = `
(() => {
  const results = [];

  // 策略 1: 从 scroll-list 中提取（抖音搜索结果通用容器）
  const listItems = document.querySelectorAll('ul[data-e2e="scroll-list"] > li');
  listItems.forEach((li) => {
    // 提取所有链接
    const links = Array.from(li.querySelectorAll('a[href]'));

    // 查找直播间链接
    let roomId = '';
    let secUid = '';

    for (const link of links) {
      const href = link.href || link.getAttribute('href') || '';
      const roomMatch = href.match(/live\\.douyin\\.com\\/(\\d{6,})/);
      if (roomMatch) {
        roomId = roomMatch[1];
      }
      const userMatch = href.match(/\\/user\\/([A-Za-z0-9_-]+)/);
      if (userMatch && userMatch[1] !== 'self') {
        secUid = userMatch[1];
      }
    }

    // 提取文本内容
    const text = (li.innerText || '').trim();
    const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);

    // 提取头像
    const img = li.querySelector('img');
    const avatar = img ? (img.src || '') : '';

    // 检查是否正在直播（具有直播标签或直播间链接）
    const isLive = !!roomId ||
      text.includes('直播中') ||
      !!li.querySelector('[class*="live"], [class*="Live"], [data-e2e*="live"]');

    // 提取抖音号
    const douyinIdMatch = text.match(/抖音号[:：]\\s*([^\\s\\n]+)/);
    const uniqueId = douyinIdMatch ? douyinIdMatch[1] : '';

    // 提取粉丝/获赞信息
    const metricsMatch = text.match(/(\\d+\\.?\\d*[万亿]?获赞|\\d+\\.?\\d*[万亿]?粉丝)/g);
    const metricsText = metricsMatch ? metricsMatch.join(' | ') : '';

    if (lines.length > 0 && (secUid || roomId || uniqueId)) {
      results.push({
        roomId,
        secUid,
        uniqueId,
        avatar,
        isLive,
        title: lines[0] || '',
        statusText: isLive ? '直播中' : '',
        metricsText,
        lines
      });
    }
  });

  // 策略 2: 旧版 .search-result-card 兼容
  if (results.length === 0) {
    document.querySelectorAll('.search-result-card').forEach((card) => {
      const links = Array.from(card.querySelectorAll('a[href]'));
      let roomId = '';
      let secUid = '';

      for (const link of links) {
        const href = link.href || link.getAttribute('href') || '';
        const roomMatch = href.match(/live\\.douyin\\.com\\/(\\d{6,})/);
        if (roomMatch) roomId = roomMatch[1];
        const userMatch = href.match(/\\/user\\/([A-Za-z0-9_-]+)/);
        if (userMatch && userMatch[1] !== 'self') secUid = userMatch[1];
      }

      const lines = (card.innerText || '').split('\\n').map(l => l.trim()).filter(Boolean);
      const isLive = !!roomId || (card.innerText || '').includes('直播中');

      if (lines.length > 0 && (secUid || roomId)) {
        results.push({
          roomId,
          secUid,
          uniqueId: '',
          avatar: (card.querySelector('img') || {}).src || '',
          isLive,
          title: lines[0] || '',
          statusText: '',
          metricsText: '',
          lines
        });
      }
    });
  }

  return results;
})();
`;

module.exports = {
  normalizeCandidates,
  CANDIDATE_SCRAPE_SCRIPT
};
