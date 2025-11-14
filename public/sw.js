const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const GAME_CACHE_PREFIX = 'game-';

const STATIC_ASSETS = ['/public/index.html', '/public/css/main.css', '/public/js/main.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && !cacheName.startsWith(GAME_CACHE_PREFIX)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/games/')) {
    event.respondWith(handleGameRequest(event.request));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleAPIRequest(event.request));
  } else {
    event.respondWith(handleStaticRequest(event.request));
  }
});

async function handleGameRequest(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const gameSlug = pathParts[2];
  const gameCacheName = `${GAME_CACHE_PREFIX}${gameSlug}`;

  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(gameCacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Game not available offline', {status: 503, statusText: 'Service Unavailable'});
  }
}

async function handleAPIRequest(request) {
  try {
    return await fetch(request);
  } catch (error) {
    if (request.url.includes('/api/progression/sync')) {
      return new Response(JSON.stringify({queued: true}), {status: 202, headers: {'Content-Type': 'application/json'}});
    }
    return new Response(JSON.stringify({error: 'Network unavailable'}), {status: 503, headers: {'Content-Type': 'application/json'}});
  }
}

async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', {status: 503});
  }
}

self.addEventListener('message', (event) => {
  if (event.data.type === 'CACHE_GAME') {
    event.waitUntil(cacheGame(event.data.gameSlug, event.data.manifest));
  } else if (event.data.type === 'DELETE_GAME_CACHE') {
    event.waitUntil(deleteGameCache(event.data.gameSlug));
  } else if (event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(getCacheSize().then((size) => event.ports[0].postMessage({size})));
  }
});

async function cacheGame(gameSlug, manifest) {
  const gameCacheName = `${GAME_CACHE_PREFIX}${gameSlug}`;
  const cache = await caches.open(gameCacheName);

  const baseUrl = `/games/${gameSlug}/`;
  const urlsToCache = [baseUrl + manifest.entryPoint, ...manifest.assets.map(asset => baseUrl + asset)];

  const results = await Promise.allSettled(
    urlsToCache.map(url => fetch(url).then(response => {
      if (response.ok) {
        return cache.put(url, response);
      }
      throw new Error(`Failed to fetch ${url}`);
    }))
  );

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({type: 'CACHE_ERROR', gameSlug, failures: failures.length}));
    });
  } else {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({type: 'CACHE_COMPLETE', gameSlug}));
    });
  }
}

async function deleteGameCache(gameSlug) {
  const gameCacheName = `${GAME_CACHE_PREFIX}${gameSlug}`;
  await caches.delete(gameCacheName);

  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage({type: 'CACHE_DELETED', gameSlug}));
  });
}

async function getCacheSize() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  }
  return 0;
}
