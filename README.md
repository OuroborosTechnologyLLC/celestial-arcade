# Celestial Arcade

A web-based game platform with offline support, meta progression tracking, and subscription-based access. Built with Go, Fiber, SQLite, and vanilla JavaScript with service workers for true offline gameplay.

## Features

- **🎮 Game Library**: Browse and play HTML5/Canvas/WebGL games
- **📥 Offline Support**: Download games for offline play (works in airplane mode)
- **⭐ Meta Progression**: Track coins, XP, and achievements across devices
- **🔐 Authentication**: JWT-based auth with refresh tokens
- **🎯 Subscription Tiers**: Free, Basic, and Premium access levels
- **🔄 Auto-Sync**: Progression syncs automatically when online
- **🎨 Dark Mode**: Built-in theme switcher
- **📱 Responsive**: Works on desktop and mobile

## Quick Start

### Prerequisites

- Go 1.24+
- SQLite3 (included with Go)

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd app
```

2. Install dependencies:
```bash
go mod download
```

3. Configure `.env` file:
```bash
cp .env.example .env
```

4. Run the application:
```bash
go run main.go
```

5. Visit http://localhost:8080

### Command Line Flags

```bash
# Default settings
go run main.go

# Custom database path
go run main.go -db="myapp.db"

# Custom port
go run main.go -port="3000"
```

## Adding Games

### 1. Create Game Directory Structure

```bash
mkdir -p games/your-game/assets/js
mkdir -p games/your-game/assets/images
```

### 2. Add Game Files

Each game needs:
- `index.html` - Game entry point
- `manifest.json` - Asset manifest for offline caching
- Game assets (JS, images, audio)

Example `manifest.json`:
```json
{
  "version": "1.0.0",
  "entryPoint": "index.html",
  "assets": ["assets/js/game.js"],
  "totalSize": 2048000,
  "lastUpdated": "2025-11-11T00:00:00Z"
}
```

### 3. Register Game in Database

```sql
INSERT INTO games (id, slug, name, description, version, tierRequired, manifestPath, sizeBytes)
VALUES (
  'unique-id',
  'your-game',
  'Your Game Name',
  'Game description',
  '1.0.0',
  'free',
  'games/your-game/manifest.json',
  2048000
);
```

### 4. Game Integration API

Use postMessage to communicate with the platform:

```javascript
// Update progression when player earns rewards
window.parent.postMessage({
  type: 'progression.update',
  data: {
    coinsEarned: 100,
    xpEarned: 50,
    newAchievements: ['achievement-id'],
    newUnlockedItems: ['item-id']
  }
}, window.location.origin);

// Listen for confirmation
window.addEventListener('message', (event) => {
  if (event.data.type === 'progression.confirmed') {
    console.log('Total:', event.data.data.totalCoins, event.data.data.totalXp);
  }
});
```

## Database Schema

**Tables:**
- `users` - User accounts
- `sessions` - Auth sessions with refresh tokens
- `subscriptions` - User subscription tiers (free/basic/premium)
- `games` - Game catalog
- `user_progression` - Meta progression (coins, XP, achievements)

**API Endpoints:**
- `POST /api/users` - Register
- `POST /api/login` - Login
- `GET /api/games` - List available games (filtered by tier)
- `GET /api/games/:slug/manifest` - Get game manifest
- `GET /api/progression` - Get user progression
- `POST /api/progression/sync` - Sync progression

## Architecture

- **Backend**: Go with Fiber framework + SQLite
- **Frontend**: Vanilla JavaScript (no build tools)
- **Service Worker**: `/public/sw.js` for offline caching
- **Storage**:
  - IndexedDB for local progression
  - Cache API for game files
  - localStorage for preferences

## Testing Offline Mode

1. Open DevTools → Application → Service Workers
2. Check "Offline" checkbox
3. Refresh the page
4. Games should still load and play
5. Progression updates queue locally
6. Uncheck "Offline" - updates sync automatically

## Project Structure

```
celestial-arcade/
├── api/                    # Backend API
│   ├── auth.go            # JWT authentication
│   ├── database.go        # Database setup
│   ├── games.go           # Game endpoints
│   ├── progression.go     # Progression endpoints
│   └── user.go            # User management
├── public/                 # Frontend
│   ├── css/main.css       # Styles
│   ├── js/
│   │   ├── main.js        # App initialization
│   │   ├── modules/       # Core modules
│   │   ├── pages/         # Page views
│   │   └── components/    # UI components
│   ├── sw.js              # Service worker
│   └── index.html         # SPA entry point
├── games/                  # Game files
│   └── {slug}/
│       ├── manifest.json
│       ├── index.html
│       └── assets/
└── main.go                # Server entry point
```

## Next Steps

1. **Add Example Game** - See PLAN.md for complete example
2. **Seed Database** - Add games and subscriptions to test
3. **Create Real Games** - Build Canvas/WebGL games
4. **Add Admin UI** - Game upload and management interface

For detailed implementation guide, see [PLAN.md](PLAN.md).
