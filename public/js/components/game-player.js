import { updateProgression, getProgression, syncWithServer } from '../modules/progression.js';
import { navigate } from '../modules/router.js';
import { isAuthenticated } from '../modules/api-client.js';

export async function renderGamePlayer(gameSlug) {
  const content = document.getElementById('content');
  const authenticated = isAuthenticated();

  content.innerHTML = `
    <div class="game-player-container">
      <div class="game-player-header">
        <button class="btn btn-secondary" id="backBtn">← Back to Games</button>
        <div class="game-player-info">
          <span id="gameTitle">Loading...</span>
          ${authenticated ? '<div class="progression-display" id="playerProgression"></div>' : ''}
        </div>
        <button class="btn btn-secondary" id="fullscreenBtn">⛶ Fullscreen</button>
      </div>
      <div class="game-player-frame-container" id="frameContainer">
        <iframe id="gameFrame" src="/games/${gameSlug}/index.html" allowfullscreen></iframe>
      </div>
    </div>
  `;

  if (authenticated) {
    const progression = await getProgression();
    updateProgressionDisplay(progression);
  }

  document.getElementById('backBtn').addEventListener('click', () => navigate('/games'));

  document.getElementById('fullscreenBtn').addEventListener('click', () => {
    const container = document.getElementById('frameContainer');
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen();
    } else if (container.msRequestFullscreen) {
      container.msRequestFullscreen();
    }
  });

  window.addEventListener('message', async (event) => {
    if (event.origin !== window.location.origin) return;
    if (!authenticated) return;

    const {type, data} = event.data;

    if (type === 'progression.update') {
      try {
        const updated = await updateProgression({
          coinsEarned: data.coinsEarned || 0,
          xpEarned: data.xpEarned || 0,
          newAchievements: data.newAchievements || [],
          newUnlockedItems: data.newUnlockedItems || []
        });

        updateProgressionDisplay(updated);

        const iframe = document.getElementById('gameFrame');
        iframe?.contentWindow?.postMessage({type: 'progression.confirmed', data: {totalCoins: updated.coins, totalXp: updated.xp}}, window.location.origin);

        if (navigator.onLine) {
          syncWithServer().catch(err => console.warn('Failed to sync:', err));
        }
      } catch (error) {
        console.error('Failed to update progression:', error);
      }
    } else if (type === 'progression.request') {
      const current = await getProgression();
      const iframe = document.getElementById('gameFrame');
      iframe?.contentWindow?.postMessage({type: 'progression.response', data: {coins: current.coins, xp: current.xp, achievements: current.achievements, unlockedItems: current.unlockedItems}}, window.location.origin);
    }
  });

  try {
    const response = await fetch('/api/games', {headers: {'Authorization': localStorage.getItem('token') || ''}});
    if (response.ok) {
      const {games} = await response.json();
      const game = games.find(g => g.slug === gameSlug);
      if (game) {
        document.getElementById('gameTitle').textContent = game.name;
      }
    }
  } catch (error) {
    console.warn('Failed to load game info:', error);
  }
}

function updateProgressionDisplay(progression) {
  const display = document.getElementById('playerProgression');
  if (display) {
    display.innerHTML = `<span class="coins-display">💰 ${progression.coins}</span><span class="xp-display">⭐ ${progression.xp} XP</span>`;
  }
}
