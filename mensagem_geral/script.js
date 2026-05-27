// BIDJORCHAT - Chat Geral
let currentUser = null;
let messagePollingInterval = null;
let lastMessageCheck = new Date().toISOString();
let allUsers = {};
let replyToMessage = null; // { id, username, content }
const REACTIONS = ['😂', '😡', '👍', '👎', '❤️', '💰'];
let latestAnnouncementId = null;
let announcementRealtimeChannel = null;
let memeCommands = {};               // Será preenchido do banco





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
    if (currentUser.role === 'admin' || currentUser.role === 'moderator' || currentUser.role == "supervisor") {
        document.getElementById('btnAdminPanel').style.display = '';
    }
    
    // Atualizar status
    await db.from('users').update({ status: 'online', last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    
    // Carregar usuários para cache
    await loadAllUsers();

    // Carregar comandos de meme ANTES das mensagens
    await loadMemeCommands();

    // Carregar mensagens
    await loadGeralMessages();

    // Iniciar polling
    startPolling();

        // Eventos
    setupEventListeners();

    startAnnouncementCheck();
    
    window.addEventListener('beforeunload', async () => {
        if (rateLimitTimerInterval) clearInterval(rateLimitTimerInterval);
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
    const isCurrentAdmin = currentUser.role === 'admin';
    const isCurrentModerator = currentUser.role === 'moderator';
    const isCurrentSupervisor = currentUser.role === 'supervisor';
    const isAuthorAdmin = user.role === 'admin';
    const isAuthorModerator = user.role === 'moderator';

    // Determinar permissões de edição/exclusão
    let canEdit = false;
    let canDelete = false;

    if (isCurrentAdmin) {
        canEdit = !msg.deleted && (!msg.edited || isMessageEditable(msg.created_at));
        canDelete = !msg.deleted;
    } else if (isCurrentSupervisor) {
        if (user.role === 'user' || isOwn) {
            canEdit = !msg.deleted && (!msg.edited || isMessageEditable(msg.created_at));
            canDelete = !msg.deleted;
        }
    } else if (isCurrentModerator) {
        if (user.role === 'user' || isOwn) {
            canEdit = !msg.deleted && (!msg.edited || isMessageEditable(msg.created_at));
            canDelete = !msg.deleted;
        }
    } else {
        if (isOwn) {
            canEdit = !msg.deleted && (!msg.edited || isMessageEditable(msg.created_at));
            canDelete = !msg.deleted;
        }
    }
    
    const roleColor = getRoleColor(user.role);
    
    const div = document.createElement('div');
    div.className = 'geral-message' + (isOwn ? ' geral-message-own' : '');
    div.id = `msg-${msg.id}`;
    div.dataset.messageId = msg.id;
    
    // Se a mensagem foi deletada (soft delete)
    if (msg.deleted) {
        div.innerHTML = `
            <div class="geral-message-avatar"><span>🗑️</span></div>
            <div class="geral-message-content">
                <div class="geral-message-header">
                    <span class="geral-message-username" style="color:${roleColor}">${escapeHtml(user.username)}</span>
                    <span class="geral-message-time">${formatTime(msg.created_at)}</span>
                </div>
                <div class="geral-message-text" style="font-style:italic; color:#6b6b6b;">[Mensagem excluída]</div>
            </div>
        `;
        container.appendChild(div);
        return;
    }
    
    // Referência da mensagem respondida
    let replyRefHTML = '';
    if (msg.reply_to) {
        const repliedUser = allUsers[msg.reply_to.user_id];
        const repliedUsername = repliedUser?.username || msg.reply_to?.username || 'Usuário';
        replyRefHTML = `
            <div class="geral-message-reply-ref" onclick="scrollToMessage('${msg.reply_to.id}')">
                <span class="reply-author">${escapeHtml(repliedUsername)}</span>
                <span class="reply-content">${escapeHtml(msg.reply_to.content.substring(0, 50))}</span>
            </div>
        `;
    }
    
    // Botões de ação (editar/excluir)
    let actionsHTML = '';
    if (canEdit || canDelete) {
        actionsHTML = `<div class="geral-message-actions">`;
        if (canEdit) {
            actionsHTML += `<button class="msg-action-btn edit-btn" onclick="event.stopPropagation(); showEditGeralModal('${msg.id}', '${escapeHtml(msg.content).replace(/'/g, "\\'")}')">Editar</button>`;
        }
        if (canDelete) {
            actionsHTML += `<button class="msg-action-btn delete-btn" onclick="event.stopPropagation(); confirmDeleteGeralMessage('${msg.id}')">Excluir</button>`;
        }
        actionsHTML += `</div>`;
    }
    
    // 🔥 CONVERSÃO DE COMANDO DE MEME E MENÇÕES DESTACADAS 🔥
    let messageHtml = '';
    const trimmedContent = msg.content.trim();
    const memeUrl = memeCommands[trimmedContent];
    
    if (memeUrl) {
        messageHtml = `<img src="${memeUrl}" alt="meme" class="meme-gif" loading="lazy" onclick="window.open(this.src)">`;
    } else {
        // Substituir @menções por spans clicáveis COM DESTAQUE PARA O DESTINATÁRIO
        let processedContent = escapeHtml(msg.content);
        // Regex para capturar @username (letras, números, underscore)
        processedContent = processedContent.replace(/@([a-z0-9_]+)/gi, (match, username) => {
            const userExists = Object.values(allUsers).some(u => u.username.toLowerCase() === username.toLowerCase());
            if (!userExists) return match;
            // Verifica se o username mencionado é o usuário atual (destinatário)
            const isMentioningMe = username.toLowerCase() === currentUser.username.toLowerCase();
            const extraClass = isMentioningMe ? ' mention-self' : '';
            return `<span class="mention${extraClass}" data-username="${username}" onclick="showUserProfileByUsername('${username}')">@${username}</span>`;
        });
        messageHtml = processedContent;
    }
    
    const editedMark = msg.edited ? ' <span class="edited-mark">(editado)</span>' : '';
    
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
            <div class="geral-message-text">${messageHtml}${editedMark}</div>
            <div class="geral-message-footer">
                <button class="geral-message-reply-btn" onclick="event.stopPropagation(); replyTo('${msg.id}', '${escapeHtml(user.username).replace(/'/g, "\\'")}', '${escapeHtml(msg.content).replace(/'/g, "\\'")}')">↩ Responder</button>
                ${actionsHTML}
            </div>
        </div>
    `;
    
    if (prepend) {
        container.insertBefore(div, container.firstChild);
    } else {
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }
}


function showUserProfileByUsername(username) {
    const user = Object.values(allUsers).find(u => u.username.toLowerCase() === username.toLowerCase());
    if (user) showUserProfile(user.id);
}

function showEditGeralModal(messageId, currentContent) {
    db.from('geral_messages')
        .select('user_id')
        .eq('id', messageId)
        .single()
        .then(({ data: msg, error }) => {
            if (error || !msg) {
                showToast('Mensagem não encontrada', 'error');
                return;
            }
            
            const author = allUsers[msg.user_id];
            if (!author) {
                showToast('Autor da mensagem não encontrado', 'error');
                return;
            }
            
            const isAuthorAdmin = author.role === 'admin';
            const isAuthorModerator = author.role === 'moderator';
            const isCurrentSupervisor = currentUser.role === 'supervisor';
            const isCurrentModerator = currentUser.role === 'moderator';
            
            // Supervisor não pode editar mensagens de admin ou moderador
            if (isCurrentSupervisor && (isAuthorAdmin || isAuthorModerator)) {
                showToast('Supervisores não podem editar mensagens de administradores ou moderadores', 'warning');
                return;
            }

            // Moderador não pode editar mensagem de admin
            if (isCurrentModerator && isAuthorAdmin) {
                showToast('Moderadores não podem editar mensagens de administradores', 'warning');
                return;
            }
            
            openEditModal(messageId, currentContent);
        })
        .catch(e => {
            showToast('Erro ao verificar permissão', 'error');
        });
}

function openEditModal(messageId, currentContent) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 480px;">
            <h2 class="modal-title">Editar mensagem</h2>
            <div class="modal-body">
                <textarea id="editMsgInput" class="form-input" rows="4" style="width:100%;">${escapeHtml(currentContent)}</textarea>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn-save" id="saveEditBtn">Salvar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const textarea = modal.querySelector('#editMsgInput');
    textarea.focus();
    
    document.getElementById('saveEditBtn').onclick = async () => {
        const newContent = textarea.value.trim();
        if (!newContent || newContent === currentContent) {
            modal.remove();
            return;
        }
        try {
            await db.from('geral_messages')
                .update({ content: newContent, edited: true, edited_at: new Date().toISOString() })
                .eq('id', messageId);
            showToast('Mensagem editada!', 'success');
            modal.remove();
            await loadGeralMessages();
        } catch (e) {
            showToast('Erro ao editar: ' + e.message, 'error');
        }
    };
}

function getRoleColor(role) {
    const colors = {
        'admin': '#ef4444',
        'moderator': '#8b5cf6',
        'supervisor': '#f59e0b',   // laranja
        'user': '#9ca3af'
    };
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
                    
                    // 🆕 VERIFICA SE O USUÁRIO ATUAL FOI MENCIONADO
                    const mentions = msg.mentions || [];
                    if (mentions.includes(currentUser.id)) {
                        const sender = allUsers[msg.user_id]?.username || 'Usuário';
                        // Notifica mesmo se o documento estiver visível? 
                        // Para não incomodar, notifico apenas se a página estiver oculta (background)
                        // Se quiser notificar sempre, remova o if(document.hidden)
                        if (document.hidden) {
                            showNotification(
                                `🔔 ${sender} mencionou você`,
                                msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content,
                                allUsers[msg.user_id]?.avatar_url,
                                { url: '/mensagem_geral/index.html' }
                            );
                        }
                    }
                }
            });
            lastMessageCheck = messages[messages.length - 1].created_at;

            // Notificação geral de nova mensagem (só quando a página está oculta)
            if (document.hidden && messages.length > 0) {
                const lastMsg = messages[messages.length - 1];
                const sender = allUsers[lastMsg.user_id]?.username || 'Usuário';
                showNotification(
                    `Nova mensagem no chat geral`,
                    `${sender}: ${lastMsg.content.substring(0, 100)}`,
                    allUsers[lastMsg.user_id]?.avatar_url,
                    { url: '/mensagem_geral/index.html' }
                );
            }
        }
        
    } catch (e) {
        console.warn('Erro ao verificar novas mensagens:', e);
    }
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
    
    // ⬇️ VERIFICAÇÃO DE RATE LIMIT
    try {
        await databaseManager.checkRateLimit(currentUser.id, 'geral');
    } catch (rateError) {
        showToast(rateError.message, 'warning');
        return;
    }
    
    input.disabled = true;
    
    // 🆕 Extrair menções do conteúdo
    const mentionPattern = /@([a-z0-9_]+)/gi;
    const mentionedUsernames = [];
    let match;
    while ((match = mentionPattern.exec(content)) !== null) {
        mentionedUsernames.push(match[1].toLowerCase());
    }
    
    // Buscar IDs dos usuários mencionados
    const mentionIds = [];
    if (mentionedUsernames.length > 0) {
        for (const username of mentionedUsernames) {
            const user = Object.values(allUsers).find(u => u.username.toLowerCase() === username);
            if (user && user.id !== currentUser.id) { // não mencionar a si mesmo
                mentionIds.push(user.id);
            }
        }
    }
    
    const messageData = {
        user_id: currentUser.id,
        content: content,
        mentions: mentionIds  // array de UUIDs
    };
    
    // Adiciona referência se estiver respondendo
    if (replyToMessage) {
        messageData.reply_to = {
            id: replyToMessage.id,
            user_id: allUsers[replyToMessage.user_id] ? replyToMessage.user_id : null,
            username: replyToMessage.username,
            content: replyToMessage.content
        };
        cancelReply();
    }
    
    try {
        const { data: msg, error } = await db
            .from('geral_messages')
            .insert(messageData)
            .select()
            .single();
        
        if (error) throw error;
        
        if (msg) {
            renderMessage(msg);
            input.value = '';
            input.style.height = 'auto';
            
            // Notificar usuários mencionados (já serão notificados no polling, mas opcional aqui)
            for (const mentionedId of mentionIds) {
                if (mentionedId !== currentUser.id) {
                    const mentionedUser = allUsers[mentionedId];
                    if (mentionedUser) {
                        await showNotification(
                            `🔔 Você foi mencionado por ${currentUser.username}`,
                            content.length > 100 ? content.substring(0, 100) + '...' : content,
                            currentUser.avatar_url,
                            { url: '/mensagem_geral/index.html' }
                        );
                    }
                }
            }
        }
    } catch (e) {
        showToast('Erro ao enviar: ' + e.message, 'error');
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
    if (currentUser.role === 'supervisor' && user.role === 'admin') return;
    if (currentUser.role === 'supervisor' && user.role === 'supervisor' && userId !== currentUser.id) return;

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

    // Banir/Desbanir
    // Admin: pode banir users e moderators (nunca admins)
    // Supervisor: pode banir users e moderators (nunca admins ou supervisores)
    // Moderador: pode banir apenas users
    const podeBanir = 
        (currentUser.role === 'admin' && user.role !== 'admin') ||
        (currentUser.role === 'supervisor' && user.role !== 'admin' && user.role !== 'supervisor') ||
        (currentUser.role === 'moderator' && user.role === 'user');

    if (podeBanir) {
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

async function confirmDeleteGeralMessage(messageId) {
    const { data: msg, error } = await db
        .from('geral_messages')
        .select('user_id')
        .eq('id', messageId)
        .single();
    
    if (error || !msg) {
        showToast('Mensagem não encontrada', 'error');
        return;
    }
    
    const author = allUsers[msg.user_id];
    if (!author) {
        showToast('Autor da mensagem não encontrado', 'error');
        return;
    }
    
    const isAuthorAdmin = author.role === 'admin';
    const isAuthorModerator = author.role === 'moderator';
    const isCurrentSupervisor = currentUser.role === 'supervisor';
    const isCurrentModerator = currentUser.role === 'moderator';

    // Supervisor não pode excluir mensagens de admin ou moderador
    if (isCurrentSupervisor && (isAuthorAdmin || isAuthorModerator)) {
        showToast('Supervisores não podem excluir mensagens de administradores ou moderadores', 'warning');
        return;
    }
    
    // Moderador não pode excluir mensagem de admin
    if (isCurrentModerator && isAuthorAdmin) {
        showToast('Moderadores não podem excluir mensagens de administradores', 'warning');
        return;
    }
    
    if (!confirm('Excluir esta mensagem permanentemente?')) return;
    
    try {
        await db.from('geral_messages')
            .update({ deleted: true, deleted_at: new Date().toISOString() })
            .eq('id', messageId);
        showToast('Mensagem excluída', 'success');
        await loadGeralMessages();
    } catch (e) {
        showToast('Erro ao excluir: ' + e.message, 'error');
    }
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
            user_id: currentUser.id,        // <-- CORREÇÃO: use currentUser.id
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


async function loadMemeCommands() {
    try {
        const { data, error } = await db
            .from('meme_commands')
            .select('command, url');
        if (error) throw error;
        memeCommands = {};
        (data || []).forEach(cmd => {
            memeCommands['/' + cmd.command] = cmd.url;   // "/meme01" -> url
        });
        console.log(`📦 ${Object.keys(memeCommands).length} comandos de meme carregados`);
    } catch (e) {
        console.warn('Erro ao carregar comandos de meme:', e);
    }
}


// ========== NOTIFICAÇÕES PWA ==========
async function showNotification(title, body, icon, data) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
    }
    if (Notification.permission !== 'granted') return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
        new Notification(title, { body, icon, data });
        return;
    }
    registration.showNotification(title, {
        body: body,
        icon: icon || '',
        badge: icon || '',
        tag: 'bidjorchat',
        renotify: true,
        data: data || { url: window.location.href },
        vibrate: [200, 100, 200]
    });
}