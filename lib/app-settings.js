const DEFAULT_RUNTIME = Object.freeze({
  slotsURL: [],
  totalSlots: 4,
  windowWidth: 1440,
  windowHeight: 900,
  cleanMode: false
});

const DEFAULT_PROXY = Object.freeze({
  mode: 'direct',
  server: '',
  bypass: ''
});

const DEFAULT_SETTINGS = Object.freeze({
  appearanceMode: 'dark',
  proxy: DEFAULT_PROXY
});

function createDefaultAppConfig() {
  return {
    runtime: {
      slotsURL: DEFAULT_RUNTIME.slotsURL.slice(),
      totalSlots: DEFAULT_RUNTIME.totalSlots,
      windowWidth: DEFAULT_RUNTIME.windowWidth,
      windowHeight: DEFAULT_RUNTIME.windowHeight,
      cleanMode: DEFAULT_RUNTIME.cleanMode
    },
    settings: {
      appearanceMode: DEFAULT_SETTINGS.appearanceMode,
      proxy: {
        mode: DEFAULT_PROXY.mode,
        server: DEFAULT_PROXY.server,
        bypass: DEFAULT_PROXY.bypass
      }
    }
  };
}

function normalizeAppearanceMode(value) {
  return ['light', 'dark', 'system'].includes(value) ? value : DEFAULT_SETTINGS.appearanceMode;
}

function isValidProxyServer(value) {
  return /^[a-z]+:\/\/\S+$/i.test(value) || /^[^\s:]+:\d+$/.test(value);
}

function normalizeProxySettings(value) {
  const mode = ['direct', 'system', 'custom'].includes(value?.mode) ? value.mode : DEFAULT_PROXY.mode;

  if (mode !== 'custom') {
    return {
      mode,
      server: '',
      bypass: ''
    };
  }

  const server = String(value?.server || '').trim();
  const bypass = String(value?.bypass || '').trim();

  if (!server) {
    throw new Error('代理地址不能为空');
  }

  if (!isValidProxyServer(server)) {
    throw new Error('代理地址格式不正确');
  }

  return {
    mode: 'custom',
    server,
    bypass
  };
}

function normalizeRuntimeConfig(value) {
  const runtime = value?.runtime || value || {};
  let totalSlots = 4;
  if ('totalSlots' in runtime && Number.isInteger(runtime.totalSlots) && runtime.totalSlots > 0 && runtime.totalSlots <= 10) {
    totalSlots = runtime.totalSlots;
  } else if ('layout' in runtime) {
    totalSlots = { '1x4': 4, '2x4': 8, '3x4': 10 }[runtime.layout] || 4;
  }

  const windowWidth = Number.isFinite(runtime.windowWidth) && runtime.windowWidth > 0
    ? runtime.windowWidth
    : DEFAULT_RUNTIME.windowWidth;
  const windowHeight = Number.isFinite(runtime.windowHeight) && runtime.windowHeight > 0
    ? runtime.windowHeight
    : DEFAULT_RUNTIME.windowHeight;

  return {
    slotsURL: Array.isArray(runtime.slotsURL) ? runtime.slotsURL.filter((item) => typeof item === 'string' || item === null) : [],
    totalSlots,
    windowWidth,
    windowHeight,
    cleanMode: Boolean(runtime.cleanMode)
  };
}

function normalizeSettings(value) {
  const settings = value?.settings || {};
  let proxy = DEFAULT_PROXY;

  try {
    proxy = normalizeProxySettings(settings.proxy || DEFAULT_PROXY);
  } catch {
    proxy = DEFAULT_PROXY;
  }

  return {
    appearanceMode: normalizeAppearanceMode(settings.appearanceMode),
    proxy
  };
}

function normalizeAppConfig(value) {
  return {
    runtime: normalizeRuntimeConfig(value),
    settings: normalizeSettings(value)
  };
}

module.exports = {
  createDefaultAppConfig,
  normalizeAppConfig,
  normalizeAppearanceMode,
  normalizeProxySettings
};
