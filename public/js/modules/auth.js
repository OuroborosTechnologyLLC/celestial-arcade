import { apiFetch, clearAuth } from './api-client.js';
import { updateAuthUI } from '../../components/navbar.js';
import { navigate } from './router.js';

let mode = 'login';
let escapeHandler = null;

function openModal() {
    const modal = document.getElementById('authModal');
    if (!modal) {
        console.error('Auth modal not found');
        return;
    }
    modal.classList.add('show');

    escapeHandler = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', escapeHandler);
}

function closeModal() {
    const modal = document.getElementById('authModal');
    if (!modal) return;

    modal.classList.remove('show');

    if (escapeHandler) {
        document.removeEventListener('keydown', escapeHandler);
        escapeHandler = null;
    }
}

function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
}

function clearMessage() {
    document.getElementById('authMessage').innerHTML = '';
}

function showMessage(message, isError = false) {
    const messageEl = document.getElementById('authMessage');
    if (messageEl) {
        const className = isError ? 'error-message' : 'success-message';
        messageEl.innerHTML = `<div class="${className}">${message}</div>`;
    }
}

export function showModal(authMode = 'login') {
    mode = authMode;

    const title = mode === 'login' ? 'Login' : 'Sign Up';
    const submitText = mode === 'login' ? 'Login' : 'Sign Up';
    const switchText = mode === 'login' ? "Don't have an account?" : "Already have an account?";
    const switchBtnText = mode === 'login' ? 'Sign up' : 'Login';

    document.getElementById('authModalTitle').textContent = title;
    document.getElementById('authSubmitBtn').textContent = submitText;
    document.getElementById('authSwitchText').textContent = switchText;
    document.querySelector('[data-auth-action="switch-auth-mode"]').textContent = switchBtnText;

    const confirmGroup = document.getElementById('confirmPasswordGroup');
    const confirmInput = document.getElementById('authConfirmPassword');
    if (mode === 'register') {
        confirmGroup.classList.remove('hidden');
        confirmInput.required = true;
    } else {
        confirmGroup.classList.add('hidden');
        confirmInput.required = false;
    }

    clearMessage();
    openModal();
}

function switchMode() {
    showModal(mode === 'login' ? 'register' : 'login');
}

function logout() {
    clearAuth();
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    navigate('/');
    updateAuthUI();
}

async function handleSubmit(e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('authPassword').value;
    const confirmPassword = document.getElementById('authConfirmPassword').value;

    try {
        const endpoint = mode === 'login' ? '/api/login' : '/api/users';
        const body = { email, password };

        if (mode === 'register') body.confirmPassword = confirmPassword;

        const response = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body), includeAuth: false });

        const data = await response.json();

        if (response.ok) {
            if (data.token) localStorage.setItem('token', data.token);
            if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
            if (data.user && data.user.email) localStorage.setItem('userEmail', data.user.email);

            showMessage(`${mode === 'login' ? 'Login' : 'Registration'} successful!`);

            await updateAuthUI();
            closeModal();
            navigate('/games');
        } else {
            showMessage(data.error || 'An error occurred', true);
        }
    } catch (error) {
        showMessage('Network error. Please try again.', true);
    }
}

export function setupAuthHandlers() {
    document.addEventListener('click', function(e) {
        const action = e.target.closest('[data-auth-action]');
        if (!action) return;

        const actionType = action.dataset.authAction;

        switch(actionType) {
            case 'show-auth':
                const mode = action.dataset.mode || 'login';
                showModal(mode);
                break;
            case 'switch-auth-mode':
                switchMode();
                break;
            case 'logout':
                logout();
                break;
            case 'toggle-user-menu':
                toggleUserMenu();
                break;
            case 'close-modal':
                closeModal();
                break;
        }
    });

    document.addEventListener('click', function(e) {
        if (e.target.id === 'authModal' && e.target.classList.contains('modal')) closeModal();
    });

    document.addEventListener('click', function(e) {
        const userMenu = e.target.closest('.user-menu');
        const dropdown = document.getElementById('userDropdown');
        if (!userMenu && dropdown && !dropdown.classList.contains('hidden')) dropdown.classList.add('hidden');
    });

    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', handleSubmit);
    } else {
        console.error('Auth form not found when setting up handlers');
    }
}
