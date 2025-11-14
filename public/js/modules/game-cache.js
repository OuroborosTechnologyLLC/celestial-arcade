const CACHE_STATUS_KEY = 'gameCacheStatus';

function getCacheStatus() {
  const status = localStorage.getItem(CACHE_STATUS_KEY);
  return status ? JSON.parse(status) : {};
}

function setCacheStatus(gameSlug, status) {
  const allStatus = getCacheStatus();
  allStatus[gameSlug] = {...allStatus[gameSlug], ...status, lastUpdated: Date.now()};
  localStorage.setItem(CACHE_STATUS_KEY, JSON.stringify(allStatus));
}

function getGameCacheStatus(gameSlug) {
  const allStatus = getCacheStatus();
  return allStatus[gameSlug] || {cached: false, downloading: false};
}

async function downloadGame(gameSlug) {
  setCacheStatus(gameSlug, {downloading: true, cached: false, progress: 0});

  try {
    const response = await fetch(`/api/games/${gameSlug}/manifest`, {headers: {'Authorization': localStorage.getItem('token') || ''}});

    if (!response.ok) {
      throw new Error('Failed to fetch manifest');
    }

    const manifest = await response.json();

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({type: 'CACHE_GAME', gameSlug, manifest});

      return new Promise((resolve, reject) => {
        const messageHandler = (event) => {
          if (event.data.type === 'CACHE_COMPLETE' && event.data.gameSlug === gameSlug) {
            navigator.serviceWorker.removeEventListener('message', messageHandler);
            setCacheStatus(gameSlug, {downloading: false, cached: true, progress: 100});
            resolve();
          } else if (event.data.type === 'CACHE_ERROR' && event.data.gameSlug === gameSlug) {
            navigator.serviceWorker.removeEventListener('message', messageHandler);
            setCacheStatus(gameSlug, {downloading: false, cached: false, error: true});
            reject(new Error('Failed to cache some game assets'));
          }
        };

        navigator.serviceWorker.addEventListener('message', messageHandler);

        setTimeout(() => {
          navigator.serviceWorker.removeEventListener('message', messageHandler);
          reject(new Error('Download timeout'));
        }, 300000);
      });
    } else {
      throw new Error('Service worker not available');
    }
  } catch (error) {
    setCacheStatus(gameSlug, {downloading: false, cached: false, error: true});
    throw error;
  }
}

async function deleteGameCache(gameSlug) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({type: 'DELETE_GAME_CACHE', gameSlug});

    return new Promise((resolve) => {
      const messageHandler = (event) => {
        if (event.data.type === 'CACHE_DELETED' && event.data.gameSlug === gameSlug) {
          navigator.serviceWorker.removeEventListener('message', messageHandler);
          setCacheStatus(gameSlug, {cached: false, downloading: false});
          resolve();
        }
      };

      navigator.serviceWorker.addEventListener('message', messageHandler);

      setTimeout(() => {
        navigator.serviceWorker.removeEventListener('message', messageHandler);
        resolve();
      }, 5000);
    });
  }
}

async function getCacheSize() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {usage: estimate.usage || 0, quota: estimate.quota || 0, usagePercent: estimate.quota ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0};
  }
  return {usage: 0, quota: 0, usagePercent: 0};
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export {getCacheStatus, getGameCacheStatus, setCacheStatus, downloadGame, deleteGameCache, getCacheSize, formatBytes};
