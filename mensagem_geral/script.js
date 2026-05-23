// BIDJORCHAT - Chat Geral
let currentUser = null;
let messagePollingInterval = null;
let lastMessageCheck = new Date().toISOString();
let allUsers = {};
let replyToMessage = null; // { id, username, content }
const REACTIONS = ['😂', '😡', '👍', '👎', '❤️', '💰'];
let latestAnnouncementId = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🌐 Iniciando chat geral...');
    
    await waitForSupabase();
    
    if (!sessionManager.isAuthenticated()) {
        window.location.href = '/login/index.html';
        return;
    }
    
    const isValid = await sessionManager.validateSession();
    if (!isValid) {
        window.location.href = '/login/index.html';
        return;
    }
    
    currentUser = sessionManager.getCurrentUser();
    if (!currentUser || !currentUser.id) {
        window.location.href = '/login/index.html';
        return;
    }
    
    if (currentUser.is_banned) {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#ef4444;font-size:24px;">🚫 ACESSO NEGADO</div>';
        return;
    }
    
    // Mostrar botão admin
    if (currentUser.role === 'admin' || currentUser.role === 'moderator') {
        document.getElementById('btnAdminPanel').style.display = '';
    }
    
    // Atualizar status
    await db.from('users').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    
    // Carregar usuários para cache
    await loadAllUsers();
    
    // Carregar mensagens
    await loadGeralMessages();
    
    // Iniciar polling
    startPolling();
    
    // Eventos
    setupEventListeners();

    startAnnouncementCheck();
    
    window.addEventListener('beforeunload', async () => {
        stopPolling();
        if (currentUser) {
            await db.from('users').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', currentUser.id);
        }
    });
});

async function waitForSupabase() {
    let attempts = 0;
    while (!db && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
}

async function loadAllUsers() {
    try {
        const { data } = await db.from('users').select('id, username, role, avatar_url, status, created_at');
        if (data) {
            data.forEach(u => { allUsers[u.id] = u; });
        }
    } catch (e) {}
}

async function loadGeralMessages() {
    const container = document.getElementById('geralMessages');
    container.innerHTML = '<div class="geral-loading">Carregando...</div>';
    
    try {
        const { data: messages } = await db
            .from('geral_messages')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(100);
        
        container.innerHTML = '';
        
        if (!messages || messages.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#525252;">Nenhuma mensagem ainda. Seja o primeiro!</div>';
            return;
        }
        
        messages.forEach(msg => renderMessage(msg));
        container.scrollTop = container.scrollHeight;
        
        if (messages.length > 0) {
            lastMessageCheck = messages[messages.length - 1].created_at;
        }
    } catch (e) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Erro ao carregar</div>';
    }
}

function renderMessage(msg, prepend = false) {
    const container = document.getElementById('geralMessages');
    const user = allUsers[msg.user_id] || { username: 'Desconhecido', role: 'user', avatar_url: null };
    const isOwn = msg.user_id === currentUser.id;
    const roleColor = getRoleColor(user.role);
    
    const div = document.createElement('div');
    div.className = 'geral-message' + (isOwn ? ' geral-message-own' : '');
    div.id = `msg-${msg.id}`;
    
    // Referência da mensagem respondida – busca o nome correto
    let replyRefHTML = '';
    if (msg.reply_to) {
        // Tenta achar o usuário respondido no cache; se não existir, usa fallback
        const repliedUser = allUsers[msg.reply_to.user_id];
        const repliedUsername = repliedUser?.username || msg.reply_to?.username || 'Usuário';
        replyRefHTML = `
            <div class="geral-message-reply-ref" onclick="scrollToMessage('${msg.reply_to.id}')">
                <span class="reply-author">${escapeHtml(repliedUsername)}</span>
                <span class="reply-content">${escapeHtml(msg.reply_to.content.substring(0, 50))}</span>
            </div>
        `;
    }
    
    div.innerHTML = `
        <div class="geral-message-avatar" onclick="showUserProfile('${user.id || msg.user_id}')">
            ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}">` : getInitials(user.username || 'U')}
        </div>
        <div class="geral-message-content">
            <div class="geral-message-header">
                <span class="geral-message-username" style="color:${roleColor}" onclick="showUserProfile('${user.id || msg.user_id}')">${escapeHtml(user.username || 'Usuário')}</span>
                ${user.role !== 'user' ? `<span class="geral-message-role" style="background:${roleColor}20;color:${roleColor}">${user.role}</span>` : ''}
                <span class="geral-message-time">${formatTime(msg.created_at)}</span>
            </div>
            ${replyRefHTML}
            <div class="geral-message-text">${escapeHtml(msg.content)}</div>
            <button class="geral-message-reply-btn" onclick="event.stopPropagation(); replyTo('${msg.id}', '${escapeHtml(user.username).replace(/'/g, "\\'")}', '${escapeHtml(msg.content).replace(/'/g, "\\'")}')">↩ Responder</button>
        </div>
    `;
    
    if (prepend) {
        container.insertBefore(div, container.firstChild);
    } else {
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
}

function getRoleColor(role) {
    const colors = { admin: '#ef4444', moderator: '#8b5cf6', user: '#9ca3af' };
    return colors[role] || '#9ca3af';
}

// ========== POLLING ==========
function startPolling() {
    messagePollingInterval = setInterval(checkNewMessages, 1500);
}

function stopPolling() {
    if (messagePollingInterval) {
        clearInterval(messagePollingInterval);
        messagePollingInterval = null;
    }
}

async function checkNewMessages() {
    try {
        const { data: messages } = await db
            .from('geral_messages')
            .select('*')
            .gt('created_at', lastMessageCheck)
            .order('created_at', { ascending: true });
        
        if (messages && messages.length > 0) {
            messages.forEach(msg => {
                if (msg.user_id !== currentUser.id) {
                    renderMessage(msg);
                }
            });
            lastMessageCheck = messages[messages.length - 1].created_at;

            if (document.hidden && messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            const sender = allUsers[lastMsg.user_id]?.username || 'Usuário';
            showNotification(
                `Nova mensagem no chat geral`,
                `${sender}: ${lastMsg.content.substring(0, 100)}`,
                allUsers[lastMsg.user_id]?.avatar_url || null,
                { url: '/mensagem_geral/index.html' }
            );
        }
        }
        
    } catch (e) {}
}

// ========== ENVIO ==========
function setupEventListeners() {
    const input = document.getElementById('geralMessageInput');
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendGeralMessage();
        }
    });
}


function replyTo(messageId, username, content) {
    replyToMessage = { id: messageId, username, content };
    renderReplyPreview();
    document.getElementById('geralMessageInput').focus();
}

function cancelReply() {
    replyToMessage = null;
    const existing = document.querySelector('.reply-preview');
    if (existing) existing.remove();
}

function renderReplyPreview() {
    const existing = document.querySelector('.reply-preview');
    if (existing) existing.remove();
    
    if (!replyToMessage) return;
    
    const preview = document.createElement('div');
    preview.className = 'reply-preview';
    preview.innerHTML = `
        <span class="reply-label">Respondendo a</span>
        <span class="reply-username">${escapeHtml(replyToMessage.username)}</span>
        <span class="reply-preview-text">${escapeHtml(replyToMessage.content.substring(0, 60))}</span>
        <button class="reply-preview-cancel" onclick="cancelReply()">✕</button>
    `;
    
    // CORREÇÃO: usa a classe correta do container do input no chat geral
    const inputContainer = document.querySelector('.geral-input-container');
    if (inputContainer) {
        inputContainer.parentNode.insertBefore(preview, inputContainer);
    }
}

async function sendGeralMessage() {
    const input = document.getElementById('geralMessageInput');
    const content = input.value.trim();
    if (!content) return;
    
    input.disabled = true;
    
    const messageData = {
        user_id: currentUser.id,
        content: content
    };
    
    // Adiciona referência se estiver respondendo
    if (replyToMessage) {
        messageData.reply_to = {
            id: replyToMessage.id,
            user_id: allUsers[replyToMessage.user_id] ? replyToMessage.user_id : null,
            username: replyToMessage.username,
            content: replyToMessage.content
        };
        cancelReply(); // limpa a resposta após enviar
    }
    
    try {
        const { data: msg } = await db
            .from('geral_messages')
            .insert(messageData)
            .select()
            .single();
        
        if (msg) {
            renderMessage(msg);
            input.value = '';
            input.style.height = 'auto';
        }
    } catch (e) {
        showToast('Erro ao enviar', 'error');
    } finally {
        input.disabled = false;
        input.focus();
    }
}

// a função para rolar até uma mensagem específica 
function scrollToMessage(messageId) {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.background = 'rgba(139, 92, 246, 0.2)';
        setTimeout(() => el.style.background = '', 1500);
    }
}

// ========== PERFIL ==========
function showUserProfile(userId) {
    const user = allUsers[userId];
    if (!user) return;

    // Regras de bloqueio de clique
    if (currentUser.role === 'moderator' && user.role === 'admin') return;
    if (currentUser.role === 'moderator' && user.role === 'moderator' && userId !== currentUser.id) return;

    const modal = document.getElementById('userProfileModal');
    const roleColor = getRoleColor(user.role);

    // Monta os botões de ação com SVGs
    let actionsHTML = '';

    // Botão "Enviar mensagem" (ícone de chat)
    if (userId !== currentUser.id) {
        actionsHTML += `
            <button class="btn-profile btn-primary" onclick="window.location.href='/chat/index.html?user=${userId}'">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Enviar mensagem
            </button>`;
    }

    // Banir/Desbanir (apenas para usuários comuns)
    if ((currentUser.role === 'moderator' || currentUser.role === 'admin') && user.role === 'user') {
        if (user.is_banned) {
            actionsHTML += `
                <button class="btn-profile btn-success" id="profileBanBtn" data-user-id="${userId}" data-ban="false">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                        <line x1="9" y1="9" x2="15" y2="9"/>
                    </svg>
                    Desbanir
                </button>`;
        } else {
            actionsHTML += `
                <button class="btn-profile btn-danger" id="profileBanBtn" data-user-id="${userId}" data-ban="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                    Banir
                </button>`;
        }
    }

    // Excluir (apenas admin)
    if (currentUser.role === 'admin' && userId !== currentUser.id && user.role !== 'admin') {
        actionsHTML += `
            <button class="btn-profile btn-ghost" onclick="deleteUserConfirm('${userId}')" style="color:#ef4444;border-color:rgba(239,68,68,0.3);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Excluir
            </button>`;
    }

    // Fechar (ícone de X)
    const closeButton = `
        <button class="btn-profile btn-ghost" onclick="closeProfileModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Fechar
        </button>`;

    modal.innerHTML = `
        <div class="modal">
            <button class="modal-close" onclick="closeProfileModal()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
            <div class="profile-avatar-large">
                ${user.avatar_url ? 
                    `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">` : 
                    `<span style="color:${roleColor}">${getInitials(user.username)}</span>`
                }
            </div>
            <div class="profile-name" style="color:${roleColor}">${escapeHtml(user.username)}</div>
            <div class="profile-role-badge" style="background:${roleColor}20;color:${roleColor};text-align:center;">${user.role.toUpperCase()}</div>
            
            <div class="profile-info-grid">
                <div class="profile-info-item">
                    <div class="profile-info-label">Registrado em</div>
                    <div class="profile-info-value">${new Date(user.created_at).toLocaleDateString('pt-BR')}</div>
                </div>
                <div class="profile-info-item">
                    <div class="profile-info-label">Status</div>
                    <div class="profile-info-value">${user.status === 'online' ? 'Online' : 'Offline'}</div>
                </div>
            </div>
            
            <div class="profile-actions">
                ${actionsHTML}
                ${closeButton}
            </div>
        </div>
    `;
    modal.style.display = 'flex';

    // Evento do botão banir/desbanir
    const banBtn = document.getElementById('profileBanBtn');
    if (banBtn) {
        banBtn.addEventListener('click', async function() {
            const uid = this.dataset.userId;
            const ban = this.dataset.ban === 'true';
            await toggleBan(uid, ban);
        });
    }

    modal.onclick = (e) => {
        if (e.target === modal) closeProfileModal();
    };
}

function closeProfileModal() {
    document.getElementById('userProfileModal').style.display = 'none';
}

// ========== AÇÕES DE MODERAÇÃO ==========
async function toggleBan(userId, ban) {
    try {
        if (ban) await databaseManager.banUser(userId);
        else await databaseManager.unbanUser(userId);
        
        // Atualiza o cache local imediatamente
        if (allUsers[userId]) {
            allUsers[userId].is_banned = ban;
        }
        
        showToast(ban ? 'Usuário banido' : 'Usuário desbanido', 'success');
        closeProfileModal();
    } catch (e) {
        showToast('Erro ao alterar status', 'error');
    }
}

async function deleteUserConfirm(userId) {
    if (!confirm('Excluir este usuário permanentemente?')) return;
    try {
        await databaseManager.deleteUser(userId);
        showToast('Usuário excluído', 'success');
        closeProfileModal();
    } catch (e) {
        showToast('Erro', 'error');
    }
}

// ========== LOGOUT ==========
async function handleLogout() {
    stopPolling();
    if (currentUser) {
        await db.from('users').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    }
    await sessionManager.logout();
    window.location.href = '/login/index.html';
}




// ANNOUNCEMENT ===============

// ========== ANÚNCIOS COM REAÇÕES ==========


async function checkAnnouncements() {
    try {
        const { data: announcements } = await db
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);

        if (!announcements || announcements.length === 0) {
            const banner = document.getElementById('announcementBanner');
            if (banner) banner.style.display = 'none';
            return;
        }

        const announcement = announcements[0];

        const { data: views } = await db
            .from('announcement_views')
            .select('*')
            .eq('user_id', currentUser.id)
            .eq('announcement_id', announcement.id)
            .maybeSingle();

        if (views) {
            const banner = document.getElementById('announcementBanner');
            if (banner) banner.style.display = 'none';
            return;
        }

        if (latestAnnouncementId !== announcement.id) {
            latestAnnouncementId = announcement.id;
            renderAnnouncementBanner(announcement);

            if (document.hidden) {
                showNotification(
                    `📢 ${announcement.title}`,
                    announcement.content.substring(0, 100),
                    null,
                    { url: '/mensagem_geral/index.html' }
                );
            }
        }
    } catch (e) {
        console.warn('Erro ao verificar anúncios:', e);
    }
}

async function renderAnnouncementBanner(announcement) {
    const banner = document.getElementById('announcementBanner');
    banner.innerHTML = `
        <div class="announcement-title">${escapeHtml(announcement.title)}</div>
        <div class="announcement-content">${escapeHtml(announcement.content)}</div>
        <div class="announcement-reactions" id="announcementReactions-${announcement.id}"></div>
        <button class="announcement-close" onclick="dismissAnnouncement('${announcement.id}')">✕</button>
    `;
    banner.style.display = 'block';

    // Carrega as reações iniciais
    await loadAndRenderAnnouncementReactions(announcement.id);

    // Se já existir um canal, remove
    if (announcementRealtimeChannel) {
        await db.removeChannel(announcementRealtimeChannel);
    }

    // Cria canal Realtime para esta tabela e anúncio específico
    announcementRealtimeChannel = db
        .channel(`announcement-reactions-${announcement.id}`)
        .on(
            'postgres_changes',
            {
                event: '*', // INSERT, UPDATE, DELETE
                schema: 'public',
                table: 'announcement_reactions',
                filter: `announcement_id=eq.${announcement.id}`
            },
            () => {
                // Qualquer mudança nas reações deste anúncio recarrega
                loadAndRenderAnnouncementReactions(announcement.id);
            }
        )
        .subscribe();
}

async function loadAndRenderAnnouncementReactions(announcementId) {
    const container = document.getElementById(`announcementReactions-${announcementId}`);
    if (!container) return;

    try {
        const { data: reactions } = await db
            .from('announcement_reactions')
            .select('*')
            .eq('announcement_id', announcementId);

        const grouped = {};
        if (reactions) {
            reactions.forEach(r => {
                if (!grouped[r.reaction]) grouped[r.reaction] = { count: 0, users: [] };
                grouped[r.reaction].count++;
                grouped[r.reaction].users.push(r.user_id);
            });
        }

        container.innerHTML = `
            <div class="reactions-row">
                ${REACTIONS.map(emoji => {
                    const data = grouped[emoji] || { count: 0, users: [] };
                    const active = data.users.includes(currentUser.id);
                    return `
                        <button class="reaction-btn ${active ? 'active' : ''}" 
                                onclick="event.stopPropagation(); toggleAnnouncementReaction('${announcementId}', '${emoji}')"
                                title="${emoji}">
                            ${emoji} <span class="reaction-count">${data.count}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        `;
    } catch (e) {
        console.warn('Erro ao carregar reações do anúncio:', e);
    }
}

async function toggleAnnouncementReaction(announcementId, emoji) {
    try {
        const { data: existing } = await db
            .from('announcement_reactions')
            .select('*')
            .eq('announcement_id', announcementId)
            .eq('user_id', currentUser.id)
            .maybeSingle();

        if (existing) {
            if (existing.reaction === emoji) {
                await db.from('announcement_reactions').delete().eq('id', existing.id);
            } else {
                await db.from('announcement_reactions')
                    .update({ reaction: emoji })
                    .eq('id', existing.id);
            }
        } else {
            await db.from('announcement_reactions').insert({
                announcement_id: announcementId,
                user_id: currentUser.id,
                reaction: emoji
            });
        }

        loadAndRenderAnnouncementReactions(announcementId);
    } catch (e) {
        console.warn('Erro ao reagir ao anúncio:', e);
    }
}

async function dismissAnnouncement(announcementId) {
    try {
        await db.from('announcement_views').insert({
            user_id: currentUserId,
            announcement_id: announcementId,
            viewed_at: new Date().toISOString()
        });
        document.getElementById('announcementBanner').style.display = 'none';

        // Remove o canal Realtime para não ficar ouvindo sem necessidade
        if (announcementRealtimeChannel) {
            await db.removeChannel(announcementRealtimeChannel);
            announcementRealtimeChannel = null;
        }
    } catch (e) {
        console.error('Erro ao marcar anúncio como visto:', e);
    }
}

function startAnnouncementCheck() {
    checkAnnouncements();
    setInterval(checkAnnouncements, 30000);
}