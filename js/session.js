// Gerenciamento de sessão com localStorage

class SessionManager {
    constructor() {
        this.storageKey = 'bidjorchat_session';
    }

    // Salvar sessão
    saveSession(session) {
        const sessionData = {
            token: session.token,
            userId: session.user_id,
            expiresAt: session.expires_at,
            user: session.user
        };
        
        localStorage.setItem(this.storageKey, JSON.stringify(sessionData));
    }

    // Obter sessão atual
    getSession() {
        const sessionData = localStorage.getItem(this.storageKey);
        
        if (!sessionData) return null;
        
        try {
            const session = JSON.parse(sessionData);
            
            // Verificar se expirou
            if (new Date(session.expiresAt) < new Date()) {
                this.clearSession();
                return null;
            }
            
            return session;
        } catch (error) {
            this.clearSession();
            return null;
        }
    }

    // Verificar se está autenticado
    isAuthenticated() {
        return !!this.getSession();
    }

    // Obter usuário atual
    getCurrentUser() {
        const session = this.getSession();
        return session ? session.user : null;
    }

    // Obter token
    getToken() {
        const session = this.getSession();
        return session ? session.token : null;
    }

    // Limpar sessão
    clearSession() {
        localStorage.removeItem(this.storageKey);
    }

    // Validar sessão no banco
    async validateSession() {
        const token = this.getToken();
        
        if (!token) return false;
        
        const session = await databaseManager.getSessionByToken(token);
        
        if (!session) {
            this.clearSession();
            return false;
        }
        
        // Atualizar dados da sessão
        this.saveSession(session);
        return true;
    }

    // Login
    // session.js - Atualização no método login
    async login(usernameOrEmail, password) {
        // Buscar usuário
        const user = await databaseManager.getUserByUsernameOrEmail(usernameOrEmail);
        
        if (!user) {
            throw new Error('Usuário não encontrado');
        }
        
        // Verificar se está banido
        if (user.is_banned) {
            throw new Error('ACESSO NEGADO: Sua conta foi banida.');
        }
        
        // Verificar senha
        const isValid = await cryptoManager.verifyPassword(password, user.password_hash);
        
        if (!isValid) {
            throw new Error('Senha incorreta');
        }
        
        // Criar sessão
        const session = await databaseManager.createSession(user.id);
        
        // Adicionar dados do usuário à sessão
        session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            avatar_url: user.avatar_url,
            is_banned: user.is_banned,
            status: user.status
        };
        
        // Salvar sessão
        this.saveSession(session);
        
        // Registrar atividade
        await databaseManager.logActivity(user.id, 'LOGIN');
        
        return session;
    }

    // Logout
    async logout() {
        const token = this.getToken();
        
        if (token) {
            try {
                await databaseManager.deleteSession(token);
                await databaseManager.logActivity(
                    this.getCurrentUser()?.id,
                    'LOGOUT'
                );
            } catch (error) {
                console.error('Erro ao fazer logout:', error);
            }
        }
        
        this.clearSession();
    }

    // Alterar senha
    async changePassword(currentPassword, newPassword) {
        const user = this.getCurrentUser();
        
        if (!user) throw new Error('Não autenticado');
        
        // Buscar usuário no banco
        const dbUser = await databaseManager.getUserById(user.id);
        
        if (!dbUser) throw new Error('Usuário não encontrado');
        
        // Verificar senha atual
        const isValid = await cryptoManager.verifyPassword(currentPassword, dbUser.password_hash);
        
        if (!isValid) throw new Error('Senha atual incorreta');
        
        // Atualizar senha
        await databaseManager.updateUser(user.id, { password: newPassword });
        
        // Registrar atividade
        await databaseManager.logActivity(user.id, 'PASSWORD_CHANGED');
    }

    // Atualizar perfil
    async updateProfile(updates) {
        const user = this.getCurrentUser();
        
        if (!user) throw new Error('Não autenticado');
        
        const updatedUser = await databaseManager.updateUser(user.id, updates);
        
        // Atualizar sessão
        const session = this.getSession();
        session.user = {
            ...session.user,
            username: updatedUser.username,
            email: updatedUser.email,
            avatar_url: updatedUser.avatar_url
        };
        this.saveSession(session);
        
        return updatedUser;
    }
}

const sessionManager = new SessionManager();