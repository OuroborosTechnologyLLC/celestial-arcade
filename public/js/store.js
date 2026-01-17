import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.3/dist/module.esm.js';
import { apiFetch, clearAuth, isAuthenticated, getCurrentUser } from './modules/api-client.js';
import { initProgressionDB, getProgression, updateProgression, syncWithServer, startAutoSync } from './modules/progression.js';
import { getGameCacheStatus, downloadGame, deleteGameCache, getCacheSize, formatBytes } from './modules/game-cache.js';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

window.Alpine = Alpine;
    Alpine.store('app', {
        isAuthenticated: false,
        userEmail: '',
        isAdmin: false,
        authModalOpen: false,
        authMode: 'login',
        theme: localStorage.getItem('theme') || 'light',
        currentRoute: '/',

        async init() {
            this.isAuthenticated = isAuthenticated();
            this.userEmail = localStorage.getItem('userEmail') || '';
            this.isAdmin = localStorage.getItem('isAdmin') === '1';
            this.theme = localStorage.getItem('theme') || 'light';

            if (this.isAuthenticated && !this.userEmail) {
                const user = await getCurrentUser();
                if (user) {
                    this.userEmail = user.email;
                    this.isAdmin = user.isAdmin === 1;
                    localStorage.setItem('userEmail', user.email);
                    localStorage.setItem('isAdmin', user.isAdmin ? '1' : '0');
                }
            }

            await initProgressionDB();
            startAutoSync();
            this.handleRoute();
            window.addEventListener('hashchange', () => this.handleRoute());
        },

        handleRoute() {
            const hash = window.location.hash.slice(1) || '/';
            if (hash === '/' && this.isAuthenticated) {
                window.location.hash = '/games';
                return;
            }
            this.currentRoute = hash;
        },

        toggleTheme() {
            this.theme = this.theme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', this.theme);
            localStorage.setItem('theme', this.theme);
        },

        openAuthModal(mode = 'login') {
            this.authMode = mode;
            this.authModalOpen = true;
        },

        closeAuthModal() {
            this.authModalOpen = false;
        },

        async login(token, refreshToken, user) {
            localStorage.setItem('token', token);
            if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
            if (user?.email) {
                localStorage.setItem('userEmail', user.email);
                this.userEmail = user.email;
            }
            if (user?.isAdmin !== undefined) {
                localStorage.setItem('isAdmin', user.isAdmin ? '1' : '0');
                this.isAdmin = user.isAdmin === 1;
            }
            this.isAuthenticated = true;
        },

        logout() {
            clearAuth();
            this.isAuthenticated = false;
            this.userEmail = '';
            this.isAdmin = false;
            window.location.hash = '/';
        }
    });

    Alpine.data('authForm', () => ({
        email: '',
        password: '',
        confirmPassword: '',
        message: '',
        isError: false,
        submitting: false,

        async submit() {
            this.submitting = true;
            this.message = '';

            try {
                const mode = Alpine.store('app').authMode;
                const endpoint = mode === 'login' ? '/api/login' : '/api/users';
                const body = { email: this.email, password: this.password };
                if (mode === 'register') body.confirmPassword = this.confirmPassword;

                const response = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body), includeAuth: false });
                const data = await response.json();

                if (response.ok) {
                    await Alpine.store('app').login(data.token, data.refreshToken, data.user);
                    this.message = `${mode === 'login' ? 'Login' : 'Registration'} successful!`;
                    this.isError = false;
                    Alpine.store('app').closeAuthModal();
                    window.location.hash = '/games';
                } else {
                    this.message = data.error || 'An error occurred';
                    this.isError = true;
                }
            } catch (error) {
                this.message = 'Network error. Please try again.';
                this.isError = true;
            } finally {
                this.submitting = false;
            }
        }
    }));

    Alpine.data('gamesPage', () => ({
        games: [],
        userTier: 'free',
        loading: true,
        error: null,
        progression: { coins: 0, xp: 0 },
        storageDisplay: '0 B / 0 B (0%)',
        cacheStatuses: {},

        async loadGames() {
            this.loading = true;
            this.error = null;
            try {
                const authHeader = localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '';
                const response = await fetch('/api/games', { headers: { 'Authorization': authHeader } });
                if (!response.ok) throw new Error('Failed to load games');

                const data = await response.json();
                this.games = data.games || [];
                this.userTier = data.userTier || 'free';

                const statuses = {};
                this.games.forEach(g => { statuses[g.slug] = getGameCacheStatus(g.slug); });
                this.cacheStatuses = statuses;

                if (Alpine.store('app').isAuthenticated) {
                    const [prog, cache] = await Promise.all([getProgression(), getCacheSize()]);
                    this.progression = prog;
                    this.storageDisplay = `${formatBytes(cache.usage)} / ${formatBytes(cache.quota)} (${cache.usagePercent}%)`;
                }
            } catch (error) {
                this.error = 'Failed to load games: ' + error.message;
            } finally {
                this.loading = false;
            }
        },

        getCacheStatus(slug) {
            return this.cacheStatuses[slug] || { cached: false, downloading: false };
        },

        canPlay(slug) {
            return this.getCacheStatus(slug).cached || navigator.onLine;
        },

        playGame(slug) {
            window.location.hash = `/play/${slug}`;
        },

        async toggleCache(slug) {
            const status = this.getCacheStatus(slug);
            if (status.downloading) return;

            if (status.cached) {
                if (!confirm('Delete this game from cache?')) return;
                this.cacheStatuses = { ...this.cacheStatuses, [slug]: { ...status, downloading: true } };
                try {
                    await deleteGameCache(slug);
                    this.cacheStatuses = { ...this.cacheStatuses, [slug]: { cached: false, downloading: false } };
                } catch (e) {
                    alert('Failed to delete: ' + e.message);
                    this.cacheStatuses = { ...this.cacheStatuses, [slug]: status };
                }
            } else {
                this.cacheStatuses = { ...this.cacheStatuses, [slug]: { cached: false, downloading: true } };
                try {
                    await downloadGame(slug);
                    this.cacheStatuses = { ...this.cacheStatuses, [slug]: { cached: true, downloading: false } };
                } catch (e) {
                    alert('Failed to download: ' + e.message);
                    this.cacheStatuses = { ...this.cacheStatuses, [slug]: { cached: false, downloading: false } };
                }
            }
            const cache = await getCacheSize();
            this.storageDisplay = `${formatBytes(cache.usage)} / ${formatBytes(cache.quota)} (${cache.usagePercent}%)`;
        },

        formatBytes(bytes) {
            return formatBytes(bytes);
        }
    }));

    Alpine.data('gamePlayer', () => ({
        gameSlug: '',
        gameName: 'Loading...',
        progression: { coins: 0, xp: 0 },
        messageHandler: null,

        async init() {
            this.gameSlug = Alpine.store('app').currentRoute.replace('/play/', '');
            if (Alpine.store('app').isAuthenticated) {
                this.progression = await getProgression();
            }

            this.messageHandler = async (event) => {
                if (event.origin !== window.location.origin) return;
                if (!Alpine.store('app').isAuthenticated) return;

                const { type, data } = event.data;
                if (type === 'progression.update') {
                    try {
                        const updated = await updateProgression({
                            coinsEarned: data.coinsEarned || 0,
                            xpEarned: data.xpEarned || 0,
                            newAchievements: data.newAchievements || [],
                            newUnlockedItems: data.newUnlockedItems || []
                        });
                        this.progression = updated;
                        const iframe = document.querySelector('iframe');
                        iframe?.contentWindow?.postMessage({ type: 'progression.confirmed', data: { totalCoins: updated.coins, totalXp: updated.xp } }, window.location.origin);
                        if (navigator.onLine) syncWithServer().catch(err => console.warn('Sync failed:', err));
                    } catch (error) {
                        console.error('Failed to update progression:', error);
                    }
                } else if (type === 'progression.request') {
                    const current = await getProgression();
                    const iframe = document.querySelector('iframe');
                    iframe?.contentWindow?.postMessage({ type: 'progression.response', data: { coins: current.coins, xp: current.xp, achievements: current.achievements, unlockedItems: current.unlockedItems } }, window.location.origin);
                }
            };
            window.addEventListener('message', this.messageHandler);

            try {
                const response = await fetch('/api/games', { headers: { 'Authorization': localStorage.getItem('token') || '' } });
                if (response.ok) {
                    const { games } = await response.json();
                    const game = games.find(g => g.slug === this.gameSlug);
                    if (game) this.gameName = game.name;
                }
            } catch (e) {
                console.warn('Failed to load game info:', e);
            }
        },

        toggleFullscreen() {
            const container = document.getElementById('frameContainer');
            if (container.requestFullscreen) container.requestFullscreen();
            else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
            else if (container.msRequestFullscreen) container.msRequestFullscreen();
        },

        destroy() {
            if (this.messageHandler) window.removeEventListener('message', this.messageHandler);
        }
    }));

    Alpine.data('adminPage', () => ({
        tab: 'games',
        games: [],
        subscriptions: [],
        loading: true,
        authorized: false,
        modalOpen: false,
        modalTitle: '',
        modalBody: '',
        editingItem: null,

        async init() {
            if (!Alpine.store('app').isAuthenticated) {
                window.location.hash = '/';
                return;
            }
            const isAdmin = localStorage.getItem('isAdmin') === '1';
            if (!isAdmin) {
                const user = await getCurrentUser();
                if (!user || user.isAdmin !== 1) {
                    window.location.hash = '/';
                    return;
                }
            }
            this.authorized = true;
            await this.loadGames();
        },

        async loadGames() {
            this.loading = true;
            try {
                const response = await apiFetch('/api/admin/games');
                if (!response.ok) throw new Error('Failed to load games');
                const data = await response.json();
                this.games = data.games || [];
            } catch (e) {
                console.error('Failed to load games:', e);
            } finally {
                this.loading = false;
            }
        },

        async loadSubscriptions() {
            this.loading = true;
            try {
                const response = await apiFetch('/api/admin/subscriptions');
                if (!response.ok) throw new Error('Failed to load subscriptions');
                const data = await response.json();
                this.subscriptions = data.subscriptions || [];
            } catch (e) {
                console.error('Failed to load subscriptions:', e);
            } finally {
                this.loading = false;
            }
        },

        closeModal() {
            this.modalOpen = false;
        },

        showGameModal(game = null) {
            this.editingItem = game;
            this.modalTitle = game ? 'Edit Game' : 'Add Game';
            this.modalBody = `
                <form id="adminGameForm" class="space-y-4">
                    <div><label class="mb-2 block text-sm font-medium">Name</label><input type="text" name="name" value="${game ? escapeHtml(game.name) : ''}" required class="w-full rounded border border-input bg-background px-3 py-2 text-sm"></div>
                    <div><label class="mb-2 block text-sm font-medium">Slug</label><input type="text" name="slug" value="${game ? escapeHtml(game.slug) : ''}" ${game ? 'readonly' : 'required'} class="w-full rounded border border-input bg-background px-3 py-2 text-sm ${game ? 'opacity-50' : ''}"></div>
                    <div><label class="mb-2 block text-sm font-medium">Description</label><textarea name="description" rows="3" class="w-full rounded border border-input bg-background px-3 py-2 text-sm">${game ? escapeHtml(game.description || '') : ''}</textarea></div>
                    <div><label class="mb-2 block text-sm font-medium">Version</label><input type="text" name="version" value="${game ? escapeHtml(game.version) : '1.0.0'}" required class="w-full rounded border border-input bg-background px-3 py-2 text-sm"></div>
                    <div><label class="mb-2 block text-sm font-medium">Tier Required</label><select name="tierRequired" class="w-full rounded border border-input bg-background px-3 py-2 text-sm"><option value="free" ${game?.tierRequired === 'free' ? 'selected' : ''}>Free</option><option value="basic" ${game?.tierRequired === 'basic' ? 'selected' : ''}>Basic</option><option value="premium" ${game?.tierRequired === 'premium' ? 'selected' : ''}>Premium</option></select></div>
                    <div><label class="mb-2 block text-sm font-medium">Manifest Path</label><input type="text" name="manifestPath" value="${game ? escapeHtml(game.manifestPath || '') : ''}" placeholder="/games/slug/manifest.json" class="w-full rounded border border-input bg-background px-3 py-2 text-sm"></div>
                    <div><label class="mb-2 block text-sm font-medium">Size (bytes)</label><input type="number" name="sizeBytes" value="${game ? game.sizeBytes : 0}" min="0" class="w-full rounded border border-input bg-background px-3 py-2 text-sm"></div>
                    <div id="adminFormError" class="hidden text-sm text-destructive"></div>
                    <div class="flex justify-end gap-3 pt-2"><button type="button" id="adminCancelBtn" class="inline-flex h-9 items-center justify-center rounded border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground">Cancel</button><button type="submit" class="inline-flex h-9 items-center justify-center rounded bg-primary px-4 text-sm font-medium text-primary-foreground">${game ? 'Update' : 'Create'}</button></div>
                </form>
            `;
            this.modalOpen = true;
            setTimeout(() => this.setupGameFormHandler(), 10);
        },

        setupGameFormHandler() {
            const form = document.getElementById('adminGameForm');
            const cancelBtn = document.getElementById('adminCancelBtn');
            if (!form) return;
            if (cancelBtn) cancelBtn.onclick = () => this.closeModal();
            form.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                const gameData = { name: formData.get('name'), slug: formData.get('slug'), description: formData.get('description'), version: formData.get('version'), tierRequired: formData.get('tierRequired'), manifestPath: formData.get('manifestPath'), sizeBytes: parseInt(formData.get('sizeBytes')) || 0 };
                try {
                    const response = this.editingItem ? await apiFetch(`/api/admin/games/${this.editingItem.slug}`, { method: 'PUT', body: JSON.stringify(gameData) }) : await apiFetch('/api/admin/games', { method: 'POST', body: JSON.stringify(gameData) });
                    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Operation failed'); }
                    this.modalOpen = false;
                    await this.loadGames();
                } catch (error) {
                    const errEl = document.getElementById('adminFormError');
                    if (errEl) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
                }
            };
        },

        async deleteGame(slug) {
            if (!confirm(`Delete game "${slug}"?`)) return;
            try {
                const response = await apiFetch(`/api/admin/games/${slug}`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Failed to delete game');
                await this.loadGames();
            } catch (e) {
                alert('Failed to delete: ' + e.message);
            }
        },

        showSubscriptionModal(sub = null) {
            this.editingItem = sub;
            this.modalTitle = sub ? 'Edit Subscription' : 'Add Subscription';
            this.modalBody = `
                <form id="adminSubForm" class="space-y-4">
                    <div><label class="mb-2 block text-sm font-medium">User ID</label><input type="text" name="userId" value="${sub ? escapeHtml(sub.userId) : ''}" ${sub ? 'readonly' : 'required'} class="w-full rounded border border-input bg-background px-3 py-2 text-sm ${sub ? 'opacity-50' : ''}"></div>
                    <div><label class="mb-2 block text-sm font-medium">Tier</label><select name="tier" class="w-full rounded border border-input bg-background px-3 py-2 text-sm"><option value="free" ${sub?.tier === 'free' ? 'selected' : ''}>Free</option><option value="basic" ${sub?.tier === 'basic' ? 'selected' : ''}>Basic</option><option value="premium" ${sub?.tier === 'premium' ? 'selected' : ''}>Premium</option></select></div>
                    <div><label class="mb-2 block text-sm font-medium">Status</label><select name="status" class="w-full rounded border border-input bg-background px-3 py-2 text-sm"><option value="active" ${sub?.status === 'active' ? 'selected' : ''}>Active</option><option value="cancelled" ${sub?.status === 'cancelled' ? 'selected' : ''}>Cancelled</option><option value="expired" ${sub?.status === 'expired' ? 'selected' : ''}>Expired</option></select></div>
                    <div id="adminFormError" class="hidden text-sm text-destructive"></div>
                    <div class="flex justify-end gap-3 pt-2"><button type="button" id="adminCancelBtn" class="inline-flex h-9 items-center justify-center rounded border border-border bg-secondary px-4 text-sm font-medium text-secondary-foreground">Cancel</button><button type="submit" class="inline-flex h-9 items-center justify-center rounded bg-primary px-4 text-sm font-medium text-primary-foreground">${sub ? 'Update' : 'Create'}</button></div>
                </form>
            `;
            this.modalOpen = true;
            setTimeout(() => this.setupSubFormHandler(), 10);
        },

        setupSubFormHandler() {
            const form = document.getElementById('adminSubForm');
            const cancelBtn = document.getElementById('adminCancelBtn');
            if (!form) return;
            if (cancelBtn) cancelBtn.onclick = () => this.closeModal();
            form.onsubmit = async (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                const subData = { userId: formData.get('userId'), tier: formData.get('tier'), status: formData.get('status') };
                try {
                    const response = this.editingItem ? await apiFetch(`/api/admin/subscriptions/${this.editingItem.id}`, { method: 'PUT', body: JSON.stringify(subData) }) : await apiFetch('/api/admin/subscriptions', { method: 'POST', body: JSON.stringify(subData) });
                    if (!response.ok) { const err = await response.json(); throw new Error(err.error || 'Operation failed'); }
                    this.modalOpen = false;
                    await this.loadSubscriptions();
                } catch (error) {
                    const errEl = document.getElementById('adminFormError');
                    if (errEl) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
                }
            };
        },

        formatBytes(bytes) {
            return formatBytes(bytes);
        },

        formatDate(dateStr) {
            if (!dateStr) return '-';
            return new Date(dateStr).toLocaleDateString();
        }
    }));

Alpine.start();
