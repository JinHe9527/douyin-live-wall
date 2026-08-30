function createUpdateSnapshot({ currentVersion, isPackaged }) {
  if (!isPackaged) {
    return {
      status: 'disabled',
      currentVersion,
      latestVersion: '',
      progress: 0,
      message: '仅打包版本可用自动更新'
    };
  }

  return {
    status: 'idle',
    currentVersion,
    latestVersion: '',
    progress: 0,
    message: '点击检查更新'
  };
}

function reduceUpdateSnapshot(snapshot, event) {
  switch (event.type) {
    case 'checking-for-update':
      return { ...snapshot, status: 'checking', progress: 0, message: '正在检查更新' };
    case 'update-available':
      return {
        ...snapshot,
        status: 'available',
        latestVersion: event.info?.version || '',
        progress: 0,
        message: `发现新版本 ${event.info?.version || ''}`.trim()
      };
    case 'download-progress':
      return {
        ...snapshot,
        status: 'downloading',
        progress: Math.max(0, Math.min(100, Math.round(event.progress?.percent || 0))),
        message: '正在下载更新'
      };
    case 'update-downloaded':
      return {
        ...snapshot,
        status: 'downloaded',
        latestVersion: event.info?.version || snapshot.latestVersion,
        progress: 100,
        message: '更新已下载完成，重启后安装'
      };
    case 'update-not-available':
      return {
        ...snapshot,
        status: 'not-available',
        latestVersion: event.info?.version || snapshot.currentVersion,
        progress: 100,
        message: '当前已经是最新版本'
      };
    case 'error':
      return {
        ...snapshot,
        status: 'error',
        message: event.error?.message || '检查更新失败'
      };
    default:
      return snapshot;
  }
}

function createUpdateService({ autoUpdater, currentVersion, isPackaged, onChange }) {
  let snapshot = createUpdateSnapshot({ currentVersion, isPackaged });

  const emitChange = () => {
    if (typeof onChange === 'function') {
      onChange(snapshot);
    }
  };

  const updateSnapshot = (event) => {
    snapshot = reduceUpdateSnapshot(snapshot, event);
    emitChange();
  };

  if (autoUpdater && isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => updateSnapshot({ type: 'checking-for-update' }));
    autoUpdater.on('update-available', (info) => updateSnapshot({ type: 'update-available', info }));
    autoUpdater.on('download-progress', (progress) => updateSnapshot({ type: 'download-progress', progress }));
    autoUpdater.on('update-downloaded', (info) => updateSnapshot({ type: 'update-downloaded', info }));
    autoUpdater.on('update-not-available', (info) => updateSnapshot({ type: 'update-not-available', info }));
    autoUpdater.on('error', (error) => updateSnapshot({ type: 'error', error }));
  }

  return {
    getSnapshot() {
      return snapshot;
    },
    async checkForUpdates() {
      if (!isPackaged || !autoUpdater) {
        emitChange();
        return snapshot;
      }

      await autoUpdater.checkForUpdates();
      return snapshot;
    },
    installDownloadedUpdate() {
      if (snapshot.status !== 'downloaded' || !isPackaged || !autoUpdater) {
        return false;
      }

      autoUpdater.quitAndInstall();
      return true;
    }
  };
}

module.exports = {
  createUpdateSnapshot,
  reduceUpdateSnapshot,
  createUpdateService
};
