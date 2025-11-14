import { isAuthenticated, getCurrentUser } from '../modules/api-client.js';

export async function render() {
    const content = document.getElementById('content');

    if (isAuthenticated()) {
        const user = await getCurrentUser();

        if (user) {
            const createdDate = new Date(user.createdDate).toLocaleString();

            content.innerHTML = `
                <div class="content home-content">
                    <div class="hero-section">
                        <div class="card user-card mt-8">
                            <h3 class="mb-4">Welcome back, ${user.email}!</h3>
                            <p class="text-muted mb-4">You're successfully authenticated.</p>
                            <div class="user-info">
                                <div class="info-row">
                                    <span class="info-label">User ID:</span>
                                    <code class="info-value">${user.id}</code>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Email:</span>
                                    <span class="info-value">${user.email}</span>
                                </div>
                                <div class="info-row">
                                    <span class="info-label">Created:</span>
                                    <span class="info-value">${createdDate}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            content.innerHTML = `
                <div class="content home-content">
                    <div class="hero-section">
                        <h1>Welcome to Account API</h1>
                        <p class="text-muted">Please log in to continue.</p>
                    </div>
                </div>
            `;
        }
    } else {
        content.innerHTML = `
            <div class="content home-content">
                <div class="hero-section">
                    <h1>Welcome to Account API</h1>
                    <p class="text-muted">A simple authentication API prototype.</p>
                    <div class="cta-buttons">
                        <button class="btn btn-primary btn-lg" data-auth-action="show-auth" data-mode="login">Log In</button>
                        <button class="btn btn-secondary btn-lg" data-auth-action="show-auth" data-mode="register">Sign Up</button>
                    </div>
                </div>
            </div>
        `;
    }
}
