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

    async createUser(userData, creatorRole = null) {
        if (!db) throw new Error('Supabase não inicializado');
        
        const requestedRole = userData.role || 'user';
        
        // 🔥 NINGUÉM pode criar um novo ADMIN (só o existente no banco)
        if (requestedRole === 'admin') {
            throw new Error('Não é possível criar outro administrador. Apenas um admin existe no sistema.');
        }
        
        if (creatorRole) {
            // Admin pode criar qualquer cargo, exceto admin (já barrado acima)
            if (creatorRole === 'admin') {
                // permitido (user, moderator, supervisor)
            }
            // Supervisor só pode criar user ou moderator
            else if (creatorRole === 'supervisor') {
                if (requestedRole !== 'user' && requestedRole !== 'moderator') {
                    throw new Error('Supervisores só podem criar usuários comuns ou moderadores');
                }
            }
            // Moderador não pode criar usuários
            else if (creatorRole === 'moderator') {
                throw new Error('Moderadores não podem criar usuários');
            }
            // Qualquer outro caso (user) não pode criar
            else {
                throw new Error('Sem permissão para criar usuários');
            }
        }

        const existing = await db.from('users').select('username').eq('username', userData.username).maybeSingle();
        if (existing.data) {
            throw new Error('Já existe um usuário com este nome');
        }
        
        const passwordHash = await cryptoManager.createPasswordHash(userData.password);
        
        const { data, error } = await db
            .from('users')
            .insert({
                username: userData.username,
                email: userData.email,
                password_hash: passwordHash,
                role: requestedRole,
                avatar_url: userData.avatar_url || null,
                status: 'offline'
            })
            .select()
            .single();
        
        if (error) throw error;
        return data;
    }

    async updateUser(userId, updates, updaterRole = null) {
        if (!db) throw new Error('Supabase não inicializado');
        
        // Se estiver tentando mudar o cargo para 'admin'
        if (updates.role === 'admin') {
            throw new Error('Não é possível promover ninguém a administrador. Apenas um admin existe no sistema.');
        }
        
        // Supervisor não pode promover a supervisor ou admin
        if (updates.role && updaterRole === 'supervisor') {
            if (updates.role === 'supervisor' || updates.role === 'admin') {
                throw new Error('Supervisores não podem promover usuários a supervisor ou administrador');
            }
        }
        
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
    // RATE LIMITING (SPAM CONTROL)
    // ============================================

    async getRateLimitSettings() {
        const { data, error } = await db
            .from('system_settings')
            .select('key, value');
        if (error) throw error;
        const settings = {};
        data.forEach(row => { settings[row.key] = row.value; });
        return {
            maxMessages: parseInt(settings.rate_limit_max_messages) || 10,
            windowSeconds: parseInt(settings.rate_limit_window_seconds) || 60,
            blockSeconds: parseInt(settings.rate_limit_block_seconds) || 30
        };
    }

    async saveRateLimitSettings(maxMessages, windowSeconds, blockSeconds) {
        const { error } = await db
            .from('system_settings')
            .upsert([
                { key: 'rate_limit_max_messages', value: String(maxMessages) },
                { key: 'rate_limit_window_seconds', value: String(windowSeconds) },
                { key: 'rate_limit_block_seconds', value: String(blockSeconds) }
            ], { onConflict: 'key' });
        if (error) throw error;
        return true;
    }

    async checkRateLimit(userId, chatType = 'private') {
        const settings = await this.getRateLimitSettings();
        const now = new Date();

        // Verificar se o usuário está bloqueado ativamente
        const { data: block } = await db
            .from('rate_limit_blocks')
            .select('blocked_until')
            .eq('user_id', userId)
            .maybeSingle();

        if (block && new Date(block.blocked_until) > now) {
            const waitSeconds = Math.ceil((new Date(block.blocked_until) - now) / 1000);
            throw new Error(`🚫 Limite de mensagens excedido. Aguarde ${waitSeconds} segundos.`);
        }

        // Contar mensagens na janela atual
        const windowStart = new Date(now.getTime() - settings.windowSeconds * 1000);
        let countQuery;
        if (chatType === 'private') {
            countQuery = db
                .from('messages')
                .select('created_at', { count: 'exact', head: true })
                .eq('sender_id', userId)
                .gte('created_at', windowStart.toISOString());
        } else {
            countQuery = db
                .from('geral_messages')
                .select('created_at', { count: 'exact', head: true })
                .eq('user_id', userId)
                .gte('created_at', windowStart.toISOString());
        }
        const { count, error } = await countQuery;
        if (error) throw error;

        if (count >= settings.maxMessages) {
            // Bloquear usuário por blockSeconds a partir de agora
            const blockedUntil = new Date(now.getTime() + settings.blockSeconds * 1000);
            await db
                .from('rate_limit_blocks')
                .upsert({ user_id: userId, blocked_until: blockedUntil.toISOString() }, { onConflict: 'user_id' });

            throw new Error(`🚫 Limite de mensagens excedido. Aguarde ${settings.blockSeconds} segundos.`);
        }

        // Se não excedeu o limite e não há bloqueio, remover qualquer bloqueio antigo (caso exista)
        if (block) {
            await db.from('rate_limit_blocks').delete().eq('user_id', userId);
        }

        return true;
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

    async checkUsernameExists(username) {
        if (!db) throw new Error('Supabase não inicializado');
        const { data, error } = await db
            .from('users')
            .select('username')
            .eq('username', username)
            .maybeSingle();
        if (error) throw error;
        return !!data;
    }

    async checkEmailExists(email) {
        if (!db) throw new Error('Supabase não inicializado');
        const { data, error } = await db
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        if (error) throw error;
        return !!data;
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