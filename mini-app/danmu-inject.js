'use strict';

// 隐藏弹幕页 preload：在真实直播页里用 MutationObserver 抓评论/礼物/进场，
// 分类后通过 IPC 上报主进程（再路由到对应格子）。绕开 WS 签名/protobuf。
// 选择器来自 spike 实测：评论 = webcast-chatroom___item / list；礼物含 gift 关键字。
const { ipcRenderer } = require('electron');

// 当前直播页的 web_rid（路径首段数字）
function currentRid() {
  const m = (location.pathname || '').match(/(\d{6,})/);
  return m ? m[1] : '';
}
const RID = currentRid();

const GIFT_KW = ['送出', '送给', '送了', '送来', '打赏', '赠送'];
const JOIN_KW = ['来了', '加入了直播间', '进入直播间', '来啦'];
const NOISE_KW = ['欢迎来到直播间', '抖音严禁', '理性消费', '切勿私下交易', '未成年'];

const seen = new WeakSet();
let sent = 0;

function classify(text) {
  if (!text) return null;
  if (NOISE_KW.some((k) => text.includes(k))) return null; // 系统提示，丢弃
  if (GIFT_KW.some((k) => text.includes(k))) {
    return { type: 'gift', ...splitUserContent(text) };
  }
  if (JOIN_KW.some((k) => text.endsWith(k) || text.includes(k))) {
    return { type: 'join', user: text.replace(/\s*(来了|来啦|加入了直播间|进入直播间)\s*$/,'').trim(), content: '' };
  }
  // 普通评论："昵称：内容"
  const idx = text.search(/[：:]/);
  if (idx > 0 && idx < 30) {
    return { type: 'chat', user: text.slice(0, idx).trim(), content: text.slice(idx + 1).trim() };
  }
  // 兜底当评论
  return { type: 'chat', user: '', content: text };
}

function splitUserContent(text) {
  const idx = text.search(/[：:]/);
  if (idx > 0 && idx < 30) return { user: text.slice(0, idx).trim(), content: text.slice(idx + 1).trim() };
  // "昵称 送出 礼物名 x1"
  for (const k of GIFT_KW) {
    const p = text.indexOf(k);
    if (p > 0) return { user: text.slice(0, p).trim(), content: text.slice(p).trim() };
  }
  return { user: '', content: text };
}

function emit(item) {
  if (!item) return;
  const text = (item.content || '') + (item.user || '');
  if (!text || text.length < 1) return;
  sent += 1;
  ipcRenderer.send('danmu', { rid: RID, ...item, t: sent });
}

function processNode(node) {
  if (!node || node.nodeType !== 1 || seen.has(node)) return;
  seen.add(node);
  const cls = (node.className && node.className.toString && node.className.toString()) || '';
  // 礼物条（gift_item_gift_bar 等）
  const isGiftBar = /gift_item|gift-item|giftMessage|gift_bar/i.test(cls);
  // 聊天条
  const isChatItem = /webcast-chatroom___item|chatroom.*item/i.test(cls);
  if (!isGiftBar && !isChatItem) return;
  const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return;
  if (isGiftBar) { emit({ type: 'gift', ...splitUserContent(text) }); return; }
  emit(classify(text));
}

function scan(root) {
  // 聊天条
  root.querySelectorAll('[class*="webcast-chatroom___item"]').forEach(processNode);
  // 礼物条
  root.querySelectorAll('[class*="gift_item"]').forEach(processNode);
}

function start() {
  if (!document.body) { setTimeout(start, 300); return; }
  // 先扫一遍已有
  try { scan(document); } catch {}
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const cls = (node.className && node.className.toString && node.className.toString()) || '';
        if (/webcast-chatroom___item|gift_item/i.test(cls)) processNode(node);
        else if (node.querySelectorAll) scan(node);
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  ipcRenderer.send('danmu-status', { rid: RID, status: 'observing' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
