// 弹幕 WS 封装入口 —— 打包成可注入浏览器脚本（在 live.douyin.com 页面里跑，带 byted_acrawler）。
// 一个页面同时连多个房间的弹幕 WS + protobuf 解码，把简化后的消息回吐给宿主。
// 基于 dycast（skmcj/dycast）核心。
import { DyCast } from './dycast';

const conns = new Map(); // id -> DyCast

function nick(u) { return (u && (u.name || u.nickname)) || ''; }

function simplify(items) {
  const out = [];
  for (const m of items || []) {
    const method = m.method;
    if (method === 'WebcastChatMessage' || method === 'WebcastEmojiChatMessage') {
      out.push({ type: 'chat', user: nick(m.user), content: m.content || '' });
    } else if (method === 'WebcastGiftMessage') {
      const g = m.gift || {};
      const cnt = Number(g.count) || 1;
      out.push({ type: 'gift', user: nick(m.user), giftName: g.name || '礼物', giftCount: cnt });
    } else if (method === 'WebcastMemberMessage') {
      out.push({ type: 'join', user: nick(m.user), content: '来了' });
    } else if (method === 'WebcastSocialMessage') {
      out.push({ type: 'social', user: nick(m.user), content: '关注了主播' });
    } else if (method === 'WebcastLikeMessage') {
      out.push({ type: 'like', user: nick(m.user), content: m.content || '点赞了' });
    } else if (method === 'WebcastRoomUserSeqMessage') {
      // 当前在线（audienceCount=total），不是累计来过的 totalUserCount
      const c = (m.room && m.room.audienceCount);
      if (c != null) out.push({ type: 'online', online: String(c) });
    } else if (method === 'WebcastRoomRankMessage') {
      // 真实榜单（带昵称 + 分数）
      if (m.rank && m.rank.length) {
        out.push({ type: 'rank', list: m.rank.slice(0, 20).map((r) => ({ nickname: r.nickname || '', rank: r.rank })) });
      }
    } else if (method === 'WebcastRoomStatsMessage') {
      const c = (m.room && m.room.audienceCount); // displayMiddle = 在线观众
      if (c != null) out.push({ type: 'online', online: String(c) });
    }
  }
  return out;
}

window.__dyConnect = function (id, roomNum) {
  if (conns.has(id)) return;
  let cast;
  try { cast = new DyCast(String(roomNum)); } catch (e) { return; }
  conns.set(id, cast);
  cast.on('message', (items) => {
    try {
      const s = simplify(items);
      if (s.length && window.__dyEmit) window.__dyEmit(id, s);
    } catch (e) {}
  });
  cast.on('open', () => { if (window.__dyStatus) window.__dyStatus(id, 'open'); });
  cast.on('close', (code, reason) => { if (window.__dyStatus) window.__dyStatus(id, 'close', String(reason || '')); });
  cast.on('error', (e) => { if (window.__dyStatus) window.__dyStatus(id, 'error', String((e && e.message) || e)); });
  try { cast.connect(); } catch (e) {}
};

window.__dyDisconnect = function (id) {
  const c = conns.get(id);
  if (c) { try { c.close(); } catch (e) {} conns.delete(id); }
};

window.__dyReady = true;
