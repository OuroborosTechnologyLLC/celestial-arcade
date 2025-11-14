async function refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
        const response = await fetch('/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });

        if (response.ok) {
            const data = await response.json();
            if (data.token) {
                localStorage.setItem('token', data.token);
                if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
                return true;
            }
        }
    } catch (err) {
        console.error('Token refresh failed:', err);
    }

    return false;
}

export async function apiFetch(url, options = {}) {
    const headers = { ...options.headers };

    if (options.includeAuth !== false) {
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = 'Bearer ' + token;
    }

    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        const refreshed = await refreshToken();
        if (refreshed) {
            const newToken = localStorage.getItem('token');
            if (newToken) headers['Authorization'] = 'Bearer ' + newToken;
            return fetch(url, { ...options, headers });
        } else {
            clearAuth();
        }
    }

    return response;
}

export function clearAuth() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userEmail');
}

export function isAuthenticated() {
    return !!localStorage.getItem('token');
}

export async function getCurrentUser() {
    if (!isAuthenticated()) return null;

    try {
        const response = await apiFetch('/api/users/me');
        if (response.ok) return response.json();
    } catch (err) {
        console.error('Failed to get current user:', err);
    }
    return null;
}
