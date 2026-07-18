// 弹幕 WS 封装入口 —— 打包成可注入浏览器脚本（在 live.douyin.com 页面里跑，带 byted_acrawler）。
// 一个页面同时连多个房间的弹幕 WS + protobuf 解码，把简化后的消息回吐给宿主。
// 基于 dycast（skmcj/dycast）核心。
import { DyCast } from './dycast';

const conns = new Map(); // id -> DyCast

function nick(u) { return (u && (u.name || u.nickname)) || ''; }

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// 从房间横幅 JSON 里递归收集所有"进度条"（main_text + current/target_value 组合，
// biz_data 是二次 JSON 字符串也照样往里钻）。覆盖礼物墙/比赛任务等各种活动横幅。
function collectBars(o, out, depth) {
  // 真实结构：giftwall→banner_detail→role2views→user→banners[]→custom_props→biz_data(二次JSON)→main_text，
  // 嵌套可达 9-10 层，上限给足 12
  if (depth > 12 || out.length >= 12 || o == null) return;
  if (typeof o === 'string') {
    if (o.length < 6000 && o.indexOf('main_text') !== -1) collectBars(safeParse(o), out, depth + 1);
    return;
  }
  if (typeof o !== 'object') return;
  if (o.main_text !== undefined && (o.current_value !== undefined || o.target_value !== undefined)) {
    out.push({
      text: String(o.main_text || ''),
      sub: String(o.sub_text || ''),
      cur: Number(o.current_value) || 0,
      target: Number(o.target_value) || 0,
    });
    return;
  }
  for (const k in o) collectBars(o[k], out, depth + 1);
}

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
    } else if (method === 'WebcastInRoomBannerMessage') {
      // 比赛/活动横幅：抽出全部进度条（血条），role2views 里 user/anchor 视角会重复 → 去重
      const bars = [];
      collectBars(safeParse(m.content), bars, 0);
      const seen = new Set(), ded = [];
      for (const b of bars) {
        const k = b.text + '|' + b.sub + '|' + b.cur + '|' + b.target;
        if (!seen.has(k)) { seen.add(k); ded.push(b); }
      }
      if (ded.length) out.push({ type: 'battle', bars: ded.slice(0, 6) });
    } else if (method === 'WebcastGroupLiveMemberChangeMessage') {
      // 团播成员战况：名字/实时分数/状态(表演中等)
      if (m.members && m.members.length) out.push({ type: 'members', list: m.members.slice(0, 10) });
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
