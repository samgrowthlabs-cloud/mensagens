// Sistema de Realtime para mensagens

class RealtimeManager {
    constructor() {
        this.channel = null;
        this.pollingInterval = null;
        this.lastMessageTimestamp = null;
        this.onMessageCallback = null;
        this.isPolling = false;
    }

    // Iniciar subscription via Supabase Realtime
    subscribeToMessages(userId, callback) {
        this.onMessageCallback = callback;
        
        if (!db) {
            console.warn('Supabase não inicializado, usando polling');
            this.startPolling(userId);
            return;
        }

        // Tentar usar Supabase Realtime
        try {
            this.channel = db
                .channel('realtime-messages-' + userId)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'messages',
                        filter: `receiver_id=eq.${userId}`
                    },
                    (payload) => {
                        console.log('📨 Nova mensagem recebida via realtime');
                        if (this.onMessageCallback) {
                            this.onMessageCallback(payload.new, 'insert');
                        }
                    }
                )
                .subscribe((status) => {
                    console.log('📡 Status da subscription:', status);
                    
                    if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                        console.warn('Realtime falhou, usando polling');
                        this.startPolling(userId);
                    }
                });
        } catch (error) {
            console.warn('Erro ao iniciar realtime, usando polling:', error);
            this.startPolling(userId);
        }
    }

    // Polling como fallback (busca a cada 2 segundos)
    startPolling(userId) {
        if (this.isPolling) return;
        
        console.log('🔄 Iniciando polling para mensagens...');
        this.isPolling = true;
        this.lastMessageTimestamp = new Date().toISOString();
        
        // Parar polling anterior se existir
        this.stopPolling();
        
        // Iniciar polling a cada 2 segundos
        this.pollingInterval = setInterval(async () => {
            try {
                const messages = await this.checkNewMessages(userId);
                
                if (messages && messages.length > 0) {
                    console.log(`📨 ${messages.length} novas mensagens via polling`);
                    
                    messages.forEach(msg => {
                        if (this.onMessageCallback) {
                            this.onMessageCallback(msg, 'insert');
                        }
                    });
                    
                    // Atualizar timestamp
                    const lastMsg = messages[messages.length - 1];
                    if (lastMsg && lastMsg.created_at) {
                        this.lastMessageTimestamp = lastMsg.created_at;
                    }
                }
            } catch (error) {
                console.error('Erro no polling:', error);
            }
        }, 2000);
    }

    async checkNewMessages(userId) {
        if (!db) return [];
        
        try {
            const { data, error } = await db
                .from('messages')
                .select('*')
                .eq('receiver_id', userId)
                .gt('created_at', this.lastMessageTimestamp)
                .order('created_at', { ascending: true });
            
            if (error) {
                console.error('Erro ao buscar novas mensagens:', error);
                return [];
            }
            
            return data || [];
        } catch (error) {
            console.error('Erro no checkNewMessages:', error);
            return [];
        }
    }

    // Atualizar status do usuário
    async updateUserStatus(userId, status) {
        if (!db || !userId) return;
        
        try {
            const { error } = await db
                .from('users')
                .update({ 
                    status: status,
                    last_seen: new Date().toISOString()
                })
                .eq('id', userId);
            
            if (error) {
                console.error('Erro ao atualizar status:', error);
            }
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
        }
    }

    // Limpar recursos
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isPolling = false;
    }

    unsubscribe() {
        this.stopPolling();
        
        if (this.channel) {
            try {
                db.removeChannel(this.channel);
            } catch (e) {
                console.warn('Erro ao remover channel:', e);
            }
            this.channel = null;
        }
    }
}

// Criar instância global
const realtime = new RealtimeManager();