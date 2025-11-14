import { getGameCacheStatus, downloadGame, deleteGameCache, formatBytes } from '../modules/game-cache.js';
import { navigate } from '../modules/router.js';

export function renderGameCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.dataset.gameSlug = game.slug;

  const cacheStatus = getGameCacheStatus(game.slug);
  const isOnline = navigator.onLine;

  const canPlay = cacheStatus.cached || isOnline;
  const statusText = cacheStatus.downloading ? 'Downloading...' : cacheStatus.cached ? '✓ Downloaded' : 'Not Downloaded';
  const statusClass = cacheStatus.downloading ? 'downloading' : cacheStatus.cached ? 'cached' : 'not-cached';

  card.innerHTML = `
    <div class="game-card-content">
      <div class="game-thumbnail"><div class="game-icon">${game.name.charAt(0).toUpperCase()}</div></div>
      <div class="game-info">
        <h3 class="game-title">${game.name}</h3>
        <p class="game-description">${game.description || 'No description available'}</p>
        <div class="game-meta">
          <span class="game-version">v${game.version}</span>
          <span class="game-size">${formatBytes(game.sizeBytes)}</span>
          <span class="game-tier tier-${game.tierRequired}">${game.tierRequired}</span>
        </div>
        <div class="game-status ${statusClass}">${statusText}</div>
      </div>
      <div class="game-actions">
        <button class="btn btn-primary game-play-btn" ${!canPlay ? 'disabled' : ''} data-action="play" data-game-slug="${game.slug}">${canPlay ? 'Play' : 'Offline'}</button>
        ${!cacheStatus.downloading ? `<button class="btn btn-secondary game-download-btn" data-action="${cacheStatus.cached ? 'delete' : 'download'}" data-game-slug="${game.slug}">${cacheStatus.cached ? 'Delete' : 'Download'}</button>` : '<button class="btn btn-secondary" disabled>Downloading...</button>'}
      </div>
    </div>
  `;

  card.querySelector('[data-action="play"]')?.addEventListener('click', () => {
    navigate(`/play/${game.slug}`);
  });

  card.querySelector('[data-action="download"]')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Downloading...';

    try {
      await downloadGame(game.slug);
      btn.textContent = 'Delete';
      btn.dataset.action = 'delete';
      card.querySelector('.game-status').textContent = '✓ Downloaded';
      card.querySelector('.game-status').className = 'game-status cached';
      card.querySelector('.game-play-btn').disabled = false;
    } catch (error) {
      alert(`Failed to download game: ${error.message}`);
      btn.textContent = 'Download';
    } finally {
      btn.disabled = false;
    }
  });

  card.querySelector('[data-action="delete"]')?.addEventListener('click', async (e) => {
    const btn = e.target;
    if (!confirm(`Delete ${game.name} from cache?`)) return;

    btn.disabled = true;
    btn.textContent = 'Deleting...';

    try {
      await deleteGameCache(game.slug);
      btn.textContent = 'Download';
      btn.dataset.action = 'download';
      card.querySelector('.game-status').textContent = 'Not Downloaded';
      card.querySelector('.game-status').className = 'game-status not-cached';

      if (!navigator.onLine) {
        card.querySelector('.game-play-btn').disabled = true;
        card.querySelector('.game-play-btn').textContent = 'Offline';
      }
    } catch (error) {
      alert(`Failed to delete game: ${error.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  return card;
}
