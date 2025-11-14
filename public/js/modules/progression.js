const DB_NAME = 'CelestialArcadeDB';
const DB_VERSION = 1;
const PROGRESSION_STORE = 'progression';
const PENDING_SYNC_STORE = 'pendingSync';

let db = null;

async function initProgressionDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(PROGRESSION_STORE)) {
        database.createObjectStore(PROGRESSION_STORE, {keyPath: 'userId'});
      }

      if (!database.objectStoreNames.contains(PENDING_SYNC_STORE)) {
        const pendingStore = database.createObjectStore(PENDING_SYNC_STORE, {keyPath: 'id', autoIncrement: true});
        pendingStore.createIndex('timestamp', 'timestamp', {unique: false});
      }
    };
  });
}

async function getProgression() {
  if (!db) await initProgressionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROGRESSION_STORE], 'readonly');
    const store = transaction.objectStore(PROGRESSION_STORE);
    const request = store.get('current');

    request.onsuccess = () => resolve(request.result || {userId: 'current', coins: 0, xp: 0, achievements: [], unlockedItems: [], lastSyncedAt: new Date().toISOString()});
    request.onerror = () => reject(request.error);
  });
}

async function saveProgression(progression) {
  if (!db) await initProgressionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROGRESSION_STORE], 'readwrite');
    const store = transaction.objectStore(PROGRESSION_STORE);
    const request = store.put({...progression, userId: 'current'});

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addPendingSync(syncData) {
  if (!db) await initProgressionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PENDING_SYNC_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_SYNC_STORE);
    const request = store.add({...syncData, timestamp: Date.now()});

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getPendingSyncs() {
  if (!db) await initProgressionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PENDING_SYNC_STORE], 'readonly');
    const store = transaction.objectStore(PENDING_SYNC_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function clearPendingSync(id) {
  if (!db) await initProgressionDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PENDING_SYNC_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_SYNC_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function updateProgression(update) {
  const current = await getProgression();

  const updated = {
    userId: 'current',
    coins: current.coins + (update.coinsEarned || 0),
    xp: current.xp + (update.xpEarned || 0),
    achievements: [...new Set([...current.achievements, ...(update.newAchievements || [])])],
    unlockedItems: [...new Set([...current.unlockedItems, ...(update.newUnlockedItems || [])])],
    lastSyncedAt: new Date().toISOString()
  };

  await saveProgression(updated);
  await addPendingSync(update);

  return updated;
}

async function syncWithServer() {
  const pending = await getPendingSyncs();
  if (pending.length === 0) return;

  const aggregated = pending.reduce((acc, item) => ({
    coinsEarned: acc.coinsEarned + (item.coinsEarned || 0),
    xpEarned: acc.xpEarned + (item.xpEarned || 0),
    newAchievements: [...new Set([...acc.newAchievements, ...(item.newAchievements || [])])],
    newUnlockedItems: [...new Set([...acc.newUnlockedItems, ...(item.newUnlockedItems || [])])],
    clientLastSyncedAt: new Date().toISOString()
  }), {coinsEarned: 0, xpEarned: 0, newAchievements: [], newUnlockedItems: []});

  try {
    const response = await fetch('/api/progression/sync', {method: 'POST', headers: {'Content-Type': 'application/json', 'Authorization': localStorage.getItem('token') || ''}, body: JSON.stringify(aggregated)});

    if (response.ok) {
      const serverProgression = await response.json();
      await saveProgression(serverProgression);

      for (const item of pending) {
        await clearPendingSync(item.id);
      }

      return serverProgression;
    }
  } catch (error) {
    console.warn('Sync failed, will retry later:', error);
  }
}

async function loadServerProgression() {
  try {
    const response = await fetch('/api/progression', {headers: {'Authorization': localStorage.getItem('token') || ''}});

    if (response.ok) {
      const serverProgression = await response.json();
      await saveProgression(serverProgression);
      return serverProgression;
    }
  } catch (error) {
    console.warn('Failed to load server progression:', error);
  }

  return await getProgression();
}

function startAutoSync(intervalMs = 60000) {
  setInterval(() => {
    if (navigator.onLine) {
      syncWithServer().catch(err => console.warn('Auto-sync failed:', err));
    }
  }, intervalMs);

  window.addEventListener('online', () => {
    syncWithServer().catch(err => console.warn('Online sync failed:', err));
  });
}

export {initProgressionDB, getProgression, saveProgression, updateProgression, syncWithServer, loadServerProgression, startAutoSync};
