import { isAuthenticated } from '../modules/api-client.js';
import { renderGameCard } from '../components/game-card.js';
import { getProgression } from '../modules/progression.js';
import { getCacheSize, formatBytes } from '../modules/game-cache.js';

export async function render() {
  const content = document.getElementById('content');
  const authenticated = isAuthenticated();

  content.innerHTML = `
    <div class="content games-content">
      <div class="games-header">
        <h1>Games Library</h1>
        <div class="games-info" id="gamesInfo">
          ${authenticated ? `
            <div class="tier-badge" id="tierBadge">Loading...</div>
            <div class="progression-display" id="progressionDisplay">Loading...</div>
            <div class="storage-info" id="storageInfo">Loading...</div>
          ` : `
            <button class="btn btn-primary" data-auth-action="show-auth" data-mode="login">Log In</button>
            <button class="btn btn-secondary" data-auth-action="show-auth" data-mode="register">Sign Up</button>
          `}
        </div>
      </div>
      <div class="games-grid" id="gamesGrid">
        <div class="loading">Loading games...</div>
      </div>
    </div>
  `;

  try {
    const authHeader = localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '';
    const gamesResponse = await fetch('/api/games', {headers: {'Authorization': authHeader}});

    if (!gamesResponse.ok) {
      throw new Error('Failed to load games');
    }

    const gamesData = await gamesResponse.json();
    const {games, userTier, isAuthenticated: serverAuth} = gamesData;

    if (authenticated) {
      const [progression, cacheSize] = await Promise.all([getProgression(), getCacheSize()]);
      document.getElementById('tierBadge').innerHTML = `<span class="tier-badge-${userTier}">${userTier.toUpperCase()}</span>`;
      document.getElementById('progressionDisplay').innerHTML = `<span class="coins-display">💰 ${progression.coins}</span><span class="xp-display">⭐ ${progression.xp} XP</span>`;
      document.getElementById('storageInfo').innerHTML = `<span class="storage-display">💾 ${formatBytes(cacheSize.usage)} / ${formatBytes(cacheSize.quota)} (${cacheSize.usagePercent}%)</span>`;
    }

    const gamesGrid = document.getElementById('gamesGrid');

    if (games.length === 0) {
      gamesGrid.innerHTML = '<div class="empty-state"><p>No games available for your subscription tier.</p></div>';
      return;
    }

    gamesGrid.innerHTML = '';
    games.forEach(game => {
      const gameCard = renderGameCard(game);
      gamesGrid.appendChild(gameCard);
    });
  } catch (error) {
    document.getElementById('gamesGrid').innerHTML = `<div class="error-state"><p>Failed to load games: ${error.message}</p></div>`;
  }
}
