import { apiFetch, isAuthenticated, getCurrentUser } from '../modules/api-client.js';
import { navigate } from '../modules/router.js';

let currentTab = 'games';
let games = [];
let subscriptions = [];

export async function render() {
    const content = document.getElementById('content');

    if (!isAuthenticated()) { navigate('/'); return; }

    const isAdmin = localStorage.getItem('isAdmin') === '1';
    if (!isAdmin) {
        const user = await getCurrentUser();
        if (!user || user.isAdmin !== 1) { navigate('/'); return; }
    }

    content.innerHTML = `
        <div class="admin-container">
            <div class="admin-header"><h1>Admin Dashboard</h1></div>
            <div class="admin-tabs">
                <button class="admin-tab active" data-tab="games">Games</button>
                <button class="admin-tab" data-tab="subscriptions">Subscriptions</button>
            </div>
            <div class="admin-content" id="adminContent"><div class="loading">Loading...</div></div>
        </div>
        <div class="modal" id="adminModal">
            <div class="modal-content admin-modal-content">
                <div class="modal-header"><h3 class="modal-title" id="modalTitle">Form</h3><button class="modal-close" data-action="close-modal">&times;</button></div>
                <div class="modal-body" id="modalBody"></div>
            </div>
        </div>
    `;

    setupTabListeners();
    setupModalListeners();
    await loadGamesTab();
}

function setupTabListeners() {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', async (e) => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.tab;
            if (currentTab === 'games') await loadGamesTab();
            else await loadSubscriptionsTab();
        });
    });
}

function setupModalListeners() {
    const modal = document.getElementById('adminModal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.dataset.action === 'close-modal') closeModal();
    });
}

function openModal(title, bodyHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('adminModal').classList.add('show');
}

function closeModal() {
    document.getElementById('adminModal').classList.remove('show');
}

async function loadGamesTab() {
    const adminContent = document.getElementById('adminContent');
    adminContent.innerHTML = '<div class="loading">Loading games...</div>';

    try {
        const response = await apiFetch('/api/admin/games');
        if (!response.ok) throw new Error('Failed to load games');
        const data = await response.json();
        games = data.games || [];

        adminContent.innerHTML = `
            <div class="admin-toolbar"><button class="btn btn-primary" id="addGameBtn">Add Game</button></div>
            <table class="admin-table">
                <thead><tr><th>Name</th><th>Slug</th><th>Version</th><th>Tier</th><th>Size</th><th>Actions</th></tr></thead>
                <tbody id="gamesTableBody">${games.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">No games found</td></tr>' : games.map(g => `
                    <tr>
                        <td>${escapeHtml(g.name)}</td>
                        <td><code>${escapeHtml(g.slug)}</code></td>
                        <td>${escapeHtml(g.version)}</td>
                        <td><span class="tier-badge tier-badge-${g.tierRequired}">${g.tierRequired}</span></td>
                        <td>${formatBytes(g.sizeBytes)}</td>
                        <td class="admin-actions"><button class="btn btn-sm btn-secondary" data-action="edit-game" data-slug="${escapeHtml(g.slug)}">Edit</button><button class="btn btn-sm btn-destructive" data-action="delete-game" data-slug="${escapeHtml(g.slug)}">Delete</button></td>
                    </tr>
                `).join('')}</tbody>
            </table>
        `;

        document.getElementById('addGameBtn').addEventListener('click', () => showGameForm());
        adminContent.querySelectorAll('[data-action="edit-game"]').forEach(btn => btn.addEventListener('click', () => showGameForm(btn.dataset.slug)));
        adminContent.querySelectorAll('[data-action="delete-game"]').forEach(btn => btn.addEventListener('click', () => deleteGame(btn.dataset.slug)));
    } catch (error) {
        adminContent.innerHTML = `<div class="error-state"><p>Failed to load games: ${error.message}</p></div>`;
    }
}

function showGameForm(slug = null) {
    const game = slug ? games.find(g => g.slug === slug) : null;
    const isEdit = !!game;

    openModal(isEdit ? 'Edit Game' : 'Add Game', `
        <form id="gameForm">
            <div class="form-group"><label>Name</label><input type="text" name="name" value="${isEdit ? escapeHtml(game.name) : ''}" required></div>
            <div class="form-group"><label>Slug</label><input type="text" name="slug" value="${isEdit ? escapeHtml(game.slug) : ''}" ${isEdit ? 'readonly' : 'required'}></div>
            <div class="form-group"><label>Description</label><textarea name="description" rows="3">${isEdit ? escapeHtml(game.description || '') : ''}</textarea></div>
            <div class="form-group"><label>Version</label><input type="text" name="version" value="${isEdit ? escapeHtml(game.version) : '1.0.0'}" required></div>
            <div class="form-group"><label>Tier Required</label><select name="tierRequired"><option value="free" ${game?.tierRequired === 'free' ? 'selected' : ''}>Free</option><option value="basic" ${game?.tierRequired === 'basic' ? 'selected' : ''}>Basic</option><option value="premium" ${game?.tierRequired === 'premium' ? 'selected' : ''}>Premium</option></select></div>
            <div class="form-group"><label>Manifest Path</label><input type="text" name="manifestPath" value="${isEdit ? escapeHtml(game.manifestPath || '') : ''}" placeholder="/games/slug/manifest.json"></div>
            <div class="form-group"><label>Size (bytes)</label><input type="number" name="sizeBytes" value="${isEdit ? game.sizeBytes : 0}" min="0"></div>
            <div id="gameFormError" class="error-message hidden"></div>
            <div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button></div>
        </form>
    `);

    document.getElementById('gameForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const gameData = {
            name: formData.get('name'),
            slug: formData.get('slug'),
            description: formData.get('description'),
            version: formData.get('version'),
            tierRequired: formData.get('tierRequired'),
            manifestPath: formData.get('manifestPath'),
            sizeBytes: parseInt(formData.get('sizeBytes')) || 0
        };

        try {
            const response = isEdit
                ? await apiFetch(`/api/admin/games/${slug}`, { method: 'PUT', body: JSON.stringify(gameData) })
                : await apiFetch('/api/admin/games', { method: 'POST', body: JSON.stringify(gameData) });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Operation failed');
            }
            closeModal();
            await loadGamesTab();
        } catch (error) {
            const errorEl = document.getElementById('gameFormError');
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        }
    });
}

async function deleteGame(slug) {
    if (!confirm(`Are you sure you want to delete the game "${slug}"?`)) return;

    try {
        const response = await apiFetch(`/api/admin/games/${slug}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete game');
        await loadGamesTab();
    } catch (error) {
        alert('Failed to delete game: ' + error.message);
    }
}

async function loadSubscriptionsTab() {
    const adminContent = document.getElementById('adminContent');
    adminContent.innerHTML = '<div class="loading">Loading subscriptions...</div>';

    try {
        const response = await apiFetch('/api/admin/subscriptions');
        if (!response.ok) throw new Error('Failed to load subscriptions');
        const data = await response.json();
        subscriptions = data.subscriptions || [];

        adminContent.innerHTML = `
            <div class="admin-toolbar"><button class="btn btn-primary" id="addSubscriptionBtn">Add Subscription</button></div>
            <table class="admin-table">
                <thead><tr><th>User ID</th><th>Tier</th><th>Status</th><th>Start Date</th><th>End Date</th><th>Actions</th></tr></thead>
                <tbody id="subscriptionsTableBody">${subscriptions.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">No subscriptions found</td></tr>' : subscriptions.map(s => `
                    <tr>
                        <td><code>${escapeHtml(s.userId.substring(0, 8))}...</code></td>
                        <td><span class="tier-badge tier-badge-${s.tier}">${s.tier}</span></td>
                        <td><span class="status-badge status-${s.status}">${s.status}</span></td>
                        <td>${formatDate(s.startDate)}</td>
                        <td>${s.endDate ? formatDate(s.endDate) : '-'}</td>
                        <td class="admin-actions"><button class="btn btn-sm btn-secondary" data-action="edit-subscription" data-id="${escapeHtml(s.id)}">Edit</button></td>
                    </tr>
                `).join('')}</tbody>
            </table>
        `;

        document.getElementById('addSubscriptionBtn').addEventListener('click', () => showSubscriptionForm());
        adminContent.querySelectorAll('[data-action="edit-subscription"]').forEach(btn => btn.addEventListener('click', () => showSubscriptionForm(btn.dataset.id)));
    } catch (error) {
        adminContent.innerHTML = `<div class="error-state"><p>Failed to load subscriptions: ${error.message}</p></div>`;
    }
}

function showSubscriptionForm(id = null) {
    const subscription = id ? subscriptions.find(s => s.id === id) : null;
    const isEdit = !!subscription;

    openModal(isEdit ? 'Edit Subscription' : 'Add Subscription', `
        <form id="subscriptionForm">
            <div class="form-group"><label>User ID</label><input type="text" name="userId" value="${isEdit ? escapeHtml(subscription.userId) : ''}" ${isEdit ? 'readonly' : 'required'}></div>
            <div class="form-group"><label>Tier</label><select name="tier"><option value="free" ${subscription?.tier === 'free' ? 'selected' : ''}>Free</option><option value="basic" ${subscription?.tier === 'basic' ? 'selected' : ''}>Basic</option><option value="premium" ${subscription?.tier === 'premium' ? 'selected' : ''}>Premium</option></select></div>
            <div class="form-group"><label>Status</label><select name="status"><option value="active" ${subscription?.status === 'active' ? 'selected' : ''}>Active</option><option value="cancelled" ${subscription?.status === 'cancelled' ? 'selected' : ''}>Cancelled</option><option value="expired" ${subscription?.status === 'expired' ? 'selected' : ''}>Expired</option></select></div>
            <div id="subscriptionFormError" class="error-message hidden"></div>
            <div class="form-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">Cancel</button><button type="submit" class="btn btn-primary">${isEdit ? 'Update' : 'Create'}</button></div>
        </form>
    `);

    document.getElementById('subscriptionForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const subscriptionData = { userId: formData.get('userId'), tier: formData.get('tier'), status: formData.get('status') };

        try {
            const response = isEdit
                ? await apiFetch(`/api/admin/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(subscriptionData) })
                : await apiFetch('/api/admin/subscriptions', { method: 'POST', body: JSON.stringify(subscriptionData) });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Operation failed');
            }
            closeModal();
            await loadSubscriptionsTab();
        } catch (error) {
            const errorEl = document.getElementById('subscriptionFormError');
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        }
    });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
}
