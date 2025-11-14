# Celestial Arcade - Offline Game Platform

## Overview
Web-based game platform with offline support, meta progression tracking, and subscription-based access tiers.

## Platform Features
- **Game Type**: Canvas/WebGL games (5-50MB each)
- **Access Model**: Subscription tiers (free/basic/premium)
- **Progression**: Meta progression only (coins, XP, achievements) - syncs cross-device
- **Offline Support**: True offline play with service worker caching
- **Game Isolation**: Games run in iframes with postMessage communication

## Database Schema

**Tables:**
- `subscriptions` - User subscription tiers (free/basic/premium)
- `games` - Game catalog with metadata
- `user_progression` - Meta progression (coins, XP, achievements)

**API Endpoints:**
- `GET /api/games` - List games filtered by user's subscription tier
- `GET /api/games/:slug/manifest` - Get game manifest for caching
- `GET /api/progression` - Get user's meta progression
- `POST /api/progression/sync` - Sync progression with merge logic

## Next Steps

### 1. Create Games Directory Structure

```bash
mkdir -p games/example-game/assets/js
mkdir -p games/example-game/assets/images
mkdir -p games/example-game/assets/audio
```

### 2. Create Example Game

Create `games/example-game/manifest.json`:
```json
{
  "version": "1.0.0",
  "entryPoint": "index.html",
  "assets": [
    "assets/js/game.js",
    "assets/images/sprite.png"
  ],
  "totalSize": 2048000,
  "lastUpdated": "2025-11-11T00:00:00Z"
}
```

Create `games/example-game/index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Example Game</title>
  <style>
    body {background: #1a1a2e;color: #fff;display: flex;justify-content: center;align-items: center;height: 100vh;margin: 0;font-family: sans-serif;}
    .game-container {text-align: center;}
    button {background: #4CAF50;border: none;border-radius: 8px;color: white;cursor: pointer;font-size: 18px;margin: 10px;padding: 15px 30px;}
    button:hover {background: #45a049;}
  </style>
</head>
<body>
  <div class="game-container">
    <h1>Example Game</h1>
    <p>Current Coins: <span id="coins">0</span></p>
    <button onclick="earnCoins()">Earn 10 Coins</button>
    <button onclick="earnXP()">Earn 5 XP</button>
  </div>
  <script src="assets/js/game.js"></script>
</body>
</html>
```

Create `games/example-game/assets/js/game.js`:
```javascript
let localCoins = 0;

function earnCoins() {
  localCoins += 10;
  document.getElementById('coins').textContent = localCoins;

  window.parent.postMessage({
    type: 'progression.update',
    data: {coinsEarned: 10, xpEarned: 0}
  }, window.location.origin);
}

function earnXP() {
  window.parent.postMessage({
    type: 'progression.update',
    data: {coinsEarned: 0, xpEarned: 5}
  }, window.location.origin);
}

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;

  if (event.data.type === 'progression.confirmed') {
    console.log('Total coins:', event.data.data.totalCoins);
    console.log('Total XP:', event.data.data.totalXp);
  }
});

window.parent.postMessage({
  type: 'progression.request'
}, window.location.origin);

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;

  if (event.data.type === 'progression.response') {
    localCoins = event.data.data.coins;
    document.getElementById('coins').textContent = localCoins;
  }
});
```

### 3. Seed Database with Test Data

Create a SQL script or add this data manually:

```sql
-- Add a test subscription for your user
INSERT INTO subscriptions (id, userId, tier, status, startDate, endDate)
VALUES ('sub-1', 'YOUR_USER_ID', 'premium', 'active', CURRENT_TIMESTAMP, NULL);

-- Add the example game
INSERT INTO games (id, slug, name, description, version, tierRequired, manifestPath, sizeBytes)
VALUES (
  'game-1',
  'example-game',
  'Example Game',
  'A simple test game to demonstrate the platform',
  '1.0.0',
  'free',
  'games/example-game/manifest.json',
  2048000
);
```

### 4. Test the Platform

1. Start the server (user will do this)
2. Register/login to create an account
3. Navigate to `/games` (click "Games" in navbar)
4. You should see the "Example Game" card
5. Click "Download" to cache the game for offline
6. Click "Play" to launch the game
7. Click "Earn 10 Coins" and "Earn 5 XP" buttons
8. Watch progression sync in real-time
9. Test offline mode:
   - Open DevTools → Application → Service Workers → Check "Offline"
   - Refresh the page
   - The game should still load and play
   - Progression updates queue locally
   - Uncheck "Offline" and they sync to server

### 5. Game Integration Pattern

For any game you add, use this postMessage API:

```javascript
// Request current progression (on game load)
window.parent.postMessage({
  type: 'progression.request'
}, window.location.origin);

// Update progression (when player earns rewards)
window.parent.postMessage({
  type: 'progression.update',
  data: {
    coinsEarned: 100,           // Amount earned this session
    xpEarned: 50,               // XP earned this session
    newAchievements: ['win-1'], // New achievements unlocked
    newUnlockedItems: ['skin-1'] // New items unlocked
  }
}, window.location.origin);

// Listen for responses
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;

  if (event.data.type === 'progression.confirmed') {
    // Update UI with new totals
    console.log('Total coins:', event.data.data.totalCoins);
    console.log('Total XP:', event.data.data.totalXp);
  }

  if (event.data.type === 'progression.response') {
    // Initial progression data
    console.log('Current coins:', event.data.data.coins);
    console.log('Current XP:', event.data.data.xp);
  }
});
```

## Future Enhancements

- Admin UI for game uploads and management
- Game analytics tracking (play time, completion rates)
- Leaderboards for competitive games
- Friend system and social features
- Parental controls and content ratings
- Download scheduling (off-peak bandwidth)
- Game categories and search
- Favorites and collections
- Multi-game achievements (cross-game progression)
