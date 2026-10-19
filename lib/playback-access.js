'use strict';

const { PLATFORMS } = require('./live-platform');

// 内存游客会话与账号会话隔离；不复制账号 Cookie，也不清除用户的登录状态。
function guestPartition(platform) {
  return `live-wall-guest:${platform}`;
}

async function resolveGuestFirst({ guest, account, loginStatus }) {
  const result = await guest();
  if (result.ok || ['offline', 'ended'].includes(result.status)) return result;
  let auth;
  try { auth = await loginStatus(); } catch { return result; }
  if (auth !== true && auth?.loggedIn !== true) return result;
  if (['restricted', 'verification_required'].includes(auth?.status)) return result;
  // 已经登录的用户仍可使用平台允许的账号播放能力；游客不需要登录。
  try {
    const fallback = await account();
    return fallback.ok || ['offline', 'ended'].includes(fallback.status) ? fallback : result;
  } catch { return result; }
}

function playbackSession(session, platform, guest = true) {
  return session.fromPartition(guest ? guestPartition(platform) : PLATFORMS[platform].partition);
}

module.exports = { guestPartition, playbackSession, resolveGuestFirst };
