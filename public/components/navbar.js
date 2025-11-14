import { isAuthenticated, getCurrentUser } from '../js/modules/api-client.js';

let userEmail = '';

export async function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const userMenu = document.getElementById('userMenu');
    const userEmailEl = document.getElementById('userEmail');

    if (isAuthenticated()) {
        if (!userEmail) {
            const cachedEmail = localStorage.getItem('userEmail');
            if (cachedEmail) {
                userEmail = cachedEmail;
            } else {
                const user = await getCurrentUser();
                if (user && user.email) {
                    userEmail = user.email;
                    localStorage.setItem('userEmail', user.email);
                }
            }
        }

        if (userEmailEl && userEmail) userEmailEl.textContent = userEmail;
        if (loginBtn) loginBtn.classList.add('hidden');
        if (userMenu) userMenu.classList.remove('hidden');
    } else {
        userEmail = '';
        if (userEmailEl) userEmailEl.textContent = '';
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userMenu) userMenu.classList.add('hidden');
    }
}

export function render() {
    return `
        <nav class="navbar">
            <div class="nav-container">
                <a href="#/" class="nav-brand">Celestial Arcade</a>
                <div class="nav-links"><a href="#/games" class="nav-link">Games</a></div>
                <div class="nav-actions">
                    <button class="theme-toggle" data-action="toggle-theme" aria-label="Toggle theme">
                        <svg class="sun-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
                        <svg class="moon-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                    </button>
                    <div id="authSection" class="auth-section">
                        <button id="loginBtn" class="btn btn-primary" data-auth-action="show-auth" data-mode="login">Log In</button>
                        <div id="userMenu" class="user-menu hidden">
                            <button id="userMenuBtn" class="user-menu-btn" data-auth-action="toggle-user-menu">
                                <span id="userEmail"></span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                            <div id="userDropdown" class="user-dropdown hidden">
                                <button data-auth-action="logout" class="dropdown-item">Logout</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    `;
}
