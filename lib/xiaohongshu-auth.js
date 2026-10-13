'use strict';

// 读取官方页面明确给出的会话状态，不读取 Cookie、账号资料或登录凭据。
function readXiaohongshuAuth() {
  const url = new URL(location.href);
  if (url.pathname === '/website-login/error') {
    const code = url.searchParams.get('error_code') || '';
    const message = url.searchParams.get('error_msg') || '小红书暂时限制了当前访问，请在官方窗口处理后重试';
    return { status: 'restricted', loggedIn: null, code, message: message.slice(0, 240) };
  }
  const pinia = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia;
  const user = pinia?._s.get('user');
  const login = pinia?._s.get('login');
  if (login?.isDeviceLimitExceeded || login?.inAntiSpamChecking || login?.inAntiSpamCheckLogin) {
    return { status: 'verification_required', loggedIn: user?.loggedIn === true ? true : null,
      message: '请在小红书官方窗口完成验证后重试' };
  }
  if (typeof user?.loggedIn === 'boolean' && document.readyState === 'complete') {
    return { status: user.loggedIn ? 'logged_in' : 'logged_out', loggedIn: user.loggedIn };
  }
  return { status: 'unknown', loggedIn: null, message: '暂时无法确认登录状态，请打开官方窗口检查' };
}

const XHS_AUTH_SCRIPT = `(${readXiaohongshuAuth.toString()})()`;
module.exports = { XHS_AUTH_SCRIPT };
