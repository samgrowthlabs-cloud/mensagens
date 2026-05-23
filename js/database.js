// Operações de banco de dados

class DatabaseManager {
    // ============================================
    // OPERAÇÕES DE USUÁRIO
    // ============================================
    
    async getUserByUsername(username) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { data, error } = await db
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error) return null;
        return data;
    }

    async getUserByEmail(email) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { data, error } = await db
            .from('users')
            .select('*')
            .eq('email', email)
            .single();
        
        if (error) return null;
        return data;
    }

    async getUserByUsernameOrEmail(login) {
        // Tenta primeiro por username
        let user = await this.getUserByUsername(login);
        
        // Se não encontrou, tenta por email
        if (!user) {
            user = await this.getUserByEmail(login);
        }
        
        return user;
    }

    async getUserById(userId) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { data, error } = await db
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();
        
        if (error) return null;
        return data;
    }

    async getAllUsers(excludeUserId = null) {
        if (!db) throw new Error('Supabase não inicializado');
        
        let query = db
            .from('users')
            .select('*')
            .order('username');
        
        if (excludeUserId) {
            query = query.neq('id', excludeUserId);
        }
        
        const { data, error } = await query;
        
        if (error) {
            console.error('Erro ao carregar usuários:', error);
            return [];
        }
        
        return data || [];
    }

    async createUser(userData) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const passwordHash = await cryptoManager.createPasswordHash(userData.password);
        
        const { data, error } = await db
            .from('users')
            .insert({
                username: userData.username,
                email: userData.email,
                password_hash: passwordHash,
                role: userData.role || 'user',
                avatar_url: userData.avatar_url || null,
                status: 'offline'
            })
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async updateUser(userId, updates) {
        if (!db) throw new Error('Supabase não inicializado');
        
        // Se houver senha, fazer hash
        if (updates.password) {
            updates.password_hash = await cryptoManager.createPasswordHash(updates.password);
            delete updates.password;
        }
        
        const { data, error } = await db
            .from('users')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async updateUserStatus(userId, status) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { error } = await db
            .from('users')
            .update({ 
                status: status,
                last_seen: new Date().toISOString()
            })
            .eq('id', userId);
        
        if (error) throw error;
    }

    async banUser(userId) {
        return await this.updateUser(userId, { is_banned: true });
    }

    async unbanUser(userId) {
        return await this.updateUser(userId, { is_banned: false });
    }

    // ============================================
    // OPERAÇÕES DE MENSAGEM
    // ============================================
    
    async sendMessage(senderId, receiverId, content, replyTo = null) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const messageData = {
            sender_id: senderId,
            receiver_id: receiverId,
            content: content,
            is_read: false
        };
        
        if (replyTo) {
            messageData.reply_to = replyTo;
        }
        
        const { data, error } = await db
            .from('messages')
            .insert(messageData)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async getMessages(userId1, userId2, limit = 50) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { data, error } = await db
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
            .eq('deleted', false)
            .order('created_at', { ascending: true })
            .limit(limit);
        
        if (error) throw error;
        return data || [];
    }

    async editMessage(messageId, newContent, userId) {
        if (!db) throw new Error('Supabase não inicializado');
        
        // Verificar se a mensagem pertence ao usuário e está dentro da janela de edição
        const { data: message, error: fetchError } = await db
            .from('messages')
            .select('*')
            .eq('id', messageId)
            .eq('sender_id', userId)
            .eq('edited', false)
            .single();
        
        if (fetchError || !message) {
            throw new Error('Mensagem não encontrada ou não pode ser editada');
        }
        
        // Verificar janela de 24 horas
        const createdAt = new Date(message.created_at);
        const now = new Date();
        const diff = now - createdAt;
        
        if (diff > CONFIG.MESSAGE_EDIT_WINDOW) {
            throw new Error('Prazo de edição expirado (24 horas)');
        }
        
        const { data, error } = await db
            .from('messages')
            .update({
                content: newContent,
                edited: true,
                edited_at: new Date().toISOString()
            })
            .eq('id', messageId)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async deleteMessage(messageId, userId) {
        if (!db) throw new Error('Supabase não inicializado');
        
        // Soft delete
        const { data, error } = await db
            .from('messages')
            .update({
                deleted: true,
                deleted_at: new Date().toISOString()
            })
            .eq('id', messageId)
            .eq('sender_id', userId)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    // Admin pode deletar qualquer mensagem (sem verificar remetente)
    async adminDeleteMessage(messageId) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { error } = await db
            .from('messages')
            .update({
                deleted: true,
                deleted_at: new Date().toISOString()
            })
            .eq('id', messageId);
        
        if (error) throw error;
        return true;
    }

    async markMessagesAsRead(senderId, receiverId) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { error } = await db
            .from('messages')
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('sender_id', senderId)
            .eq('receiver_id', receiverId)
            .eq('is_read', false);
        
        if (error) throw error;
    }

    // ============================================
    // OPERAÇÕES DE SESSÃO
    // ============================================
    
    async createSession(userId) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const token = cryptoManager.generateToken();
        const expiresAt = new Date(Date.now() + CONFIG.SESSION_DURATION).toISOString();
        
        const { data, error } = await db
            .from('sessions')
            .insert({
                user_id: userId,
                token: token,
                expires_at: expiresAt
            })
            .select()
            .single();
        
        if (error) throw error;
        
        // Atualizar status do usuário para online
        await this.updateUserStatus(userId, 'online');
        
        return data;
    }

    async getSessionByToken(token) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { data, error } = await db
            .from('sessions')
            .select('*, user:users(*)')
            .eq('token', token)
            .gt('expires_at', new Date().toISOString())
            .single();
        
        if (error) return null;
        return data;
    }

    async deleteSession(token) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const session = await this.getSessionByToken(token);
        
        if (session) {
            // Atualizar status do usuário para offline
            await this.updateUserStatus(session.user_id, 'offline');
            
            const { error } = await db
                .from('sessions')
                .delete()
                .eq('token', token);
            
            if (error) throw error;
        }
    }

    async deleteAllUserSessions(userId) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { error } = await db
            .from('sessions')
            .delete()
            .eq('user_id', userId);
        
        if (error) throw error;
        
        await this.updateUserStatus(userId, 'offline');
    }

    async deleteUser(userId) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const { error } = await db
            .from('users')
            .delete()
            .eq('id', userId);
        
        if (error) throw error;
        return true;
    }

    // ============================================
    // OPERAÇÕES DE LOG
    // ============================================
    
    async logActivity(userId, action, details = {}) {
        if (!db) {
            console.warn('Supabase não inicializado - log ignorado');
            return;
        }
        
        const { error } = await db
            .from('activity_logs')
            .insert({
                user_id: userId,
                action: action,
                details: details,
                user_agent: navigator.userAgent
            });
        
        if (error) console.error('Erro ao registrar atividade:', error);
    }
}

const databaseManager = new DatabaseManager();