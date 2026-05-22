// Autenticação - verificação e redirecionamento

class AuthGuard {
    constructor() {
        this.publicPages = ['/login/index.html', '/index.html'];
    }

    // Verificar se página atual é pública
    isPublicPage() {
        const path = window.location.pathname;
        return this.publicPages.some(page => path.endsWith(page));
    }

    // Verificar autenticação
    async checkAuth() {
        // Se for página pública, não verificar
        if (this.isPublicPage()) {
            return true;
        }
        
        // Verificar se está autenticado
        if (!sessionManager.isAuthenticated()) {
            this.redirectToLogin();
            return false;
        }
        
        // Validar sessão no banco
        const isValid = await sessionManager.validateSession();
        
        if (!isValid) {
            this.redirectToLogin();
            return false;
        }
        
        // Verificar se usuário está banido
        const user = sessionManager.getCurrentUser();
        if (user && user.is_banned) {
            await sessionManager.logout();
            this.showBannedMessage();
            return false;
        }
        
        return true;
    }

    // Verificar role
    checkRole(requiredRole) {
        const user = sessionManager.getCurrentUser();
        
        if (!user) return false;
        
        const roles = {
            'user': 1,
            'moderator': 2,
            'admin': 3
        };
        
        return roles[user.role] >= roles[requiredRole];
    }

    // Redirecionar para login
    redirectToLogin() {
        window.location.href = '/login/index.html';
    }

    // Redirecionar baseado na role
    redirectByRole() {
        const user = sessionManager.getCurrentUser();
        
        if (!user) {
            this.redirectToLogin();
            return;
        }
        
        if (user.role === 'admin') {
            window.location.href = '/admin/index.html';
        } else {
            window.location.href = '/chat/index.html';
        }
    }

    // Mostrar mensagem de banido
    showBannedMessage() {
        document.body.innerHTML = `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                background: var(--bg-primary);
                color: var(--accent-danger);
                font-size: 24px;
                font-family: var(--font-primary);
                text-align: center;
                padding: 20px;
            ">
                <div>
                    <h1 style="font-size: 48px; margin-bottom: 16px;">🚫</h1>
                    <p style="font-weight: 600;">ACESSO NEGADO</p>
                    <p style="font-size: 16px; color: var(--text-secondary); margin-top: 8px;">
                        Sua conta foi banida.
                    </p>
                </div>
            </div>
        `;
    }
}

const authGuard = new AuthGuard();

// Inicializar verificação de autenticação
document.addEventListener('DOMContentLoaded', async () => {
    await authGuard.checkAuth();
});