import { initTheme, setupThemeToggle } from './modules/theme.js';
import { registerRoute, initRouter, navigate } from './modules/router.js';
import { setupAuthHandlers } from './modules/auth.js';
import { render as renderNavbar, updateAuthUI } from '../components/navbar.js';
import { render as renderAuthModal } from '../components/auth-modal.js';
import { render as renderHome } from './pages/home.js';
import { render as renderGames } from './pages/games.js';
import { renderGamePlayer } from './components/game-player.js';
import { initProgressionDB, startAutoSync } from './modules/progression.js';
import { isAuthenticated } from './modules/api-client.js';

async function init() {
    initTheme();

    document.getElementById('navbar').innerHTML = renderNavbar();
    document.getElementById('authModal').innerHTML = renderAuthModal();

    setupThemeToggle();
    setupAuthHandlers();

    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/public/sw.js');
            console.log('Service Worker registered:', registration);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    await initProgressionDB();
    startAutoSync();

    registerRoute('/', async () => {
        if (isAuthenticated()) {
            navigate('/games');
            return;
        }
        await renderHome();
        await updateAuthUI();
    });

    registerRoute('/games', async () => {
        await renderGames();
        await updateAuthUI();
    });

    registerRoute('/play/:slug', async (params) => {
        await renderGamePlayer(params.slug);
        await updateAuthUI();
    });

    await updateAuthUI();
    initRouter();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
