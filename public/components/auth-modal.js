export function render() {
    return `
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="authModalTitle" class="modal-title">Login</h3>
                <button class="modal-close" data-auth-action="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <form id="authForm">
                    <div class="form-group">
                        <label for="email">Email</label>
                        <input type="email" id="email" name="email" required class="input">
                    </div>
                    <div class="form-group">
                        <label for="authPassword">Password</label>
                        <input type="password" id="authPassword" name="password" required class="input">
                    </div>
                    <div id="confirmPasswordGroup" class="form-group hidden">
                        <label for="authConfirmPassword">Confirm Password</label>
                        <input type="password" id="authConfirmPassword" name="confirmPassword" class="input">
                    </div>
                    <div id="authMessage"></div>
                    <button type="submit" id="authSubmitBtn" class="btn btn-primary btn-block">Login</button>
                </form>
                <div class="auth-switch">
                    <span id="authSwitchText">Don't have an account?</span>
                    <button type="button" data-auth-action="switch-auth-mode" class="btn-link">Sign up</button>
                </div>
            </div>
        </div>
    `;
}
