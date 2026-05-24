// BIDJORCHAT - Chat Script (Completo - Todas Funcionalidades)
let currentConversationUser = null;
let allUsers = [];
let conversations = [];
let currentUserId = null;
let messagePollingInterval = null;
let lastMessageCheck = new Date().toISOString();
let selectedCardElement = null;
let typingTimer = null;
let typingInterval = null;
let pollingTimeout = null;
let pollingActive = false;
let activePoll = null;
let userVote = null;
let sendingMessage = false;
let replyToMessage = null;
let latestAnnouncementId = null;
let openReactMenu = null;
let announcementRealtimeChannel = null; // variável global (fora de qualquer função)

const REACTIONS = ['😂', '😡', '👍', '👎', '❤️', '💰'];

// ========== UTILITÁRIOS ==========
function setupImageFallback() {
    document.addEventListener('error', function(e) {
        const img = e.target;
        if (img.tagName === 'IMG' && img.closest('.user-avatar, .avatar-preview, .avatar-preview img')) {
            img.style.display = 'none';
            const parent = img.parentElement;
            if (parent) {
                let fallback = parent.querySelector('.avatar-fallback');
                if (!fallback) {
                    fallback = document.createElement('span');
                    fallback.className = 'avatar-fallback';
                    fallback.style.cssText = 'font-size:16px;color:#9ca3af;font-weight:500;';
                    parent.appendChild(fallback);
                }
                const username = sessionManager.getCurrentUser()?.username || currentConversationUser?.username || '';
                fallback.textContent = getInitials(username) || '?';
                fallback.style.display = '';
            }
        }
    }, true);
}

function goToAdmin() { window.location.href = '/admin/'; }

function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.1;
        osc.frequency.value = 800;
        osc.type = 'sine';
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
}

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Iniciando chat...');
    await waitForSupabase();
    
    if (!sessionManager.isAuthenticated()) {
        window.location.href = '/login/';
        return;
    }
    const isValid = await sessionManager.validateSession();
    if (!isValid) {
        window.location.href = '/login/';
        return;
    }
    const user = sessionManager.getCurrentUser();
    if (!user || !user.id) {
        window.location.href = '/login/';
        return;
    }
    currentUserId = user.id;
    console.log('👤 Usuário:', user.username);
    
    if (user.is_banned) {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#080808;color:#ef4444;font-size:20px;font-weight:600;letter-spacing:1px;">ACESSO NEGADO</div>';
        return;
    }
    
    initializeUI(user);
    // Dentro do DOMContentLoaded, após validar o usuário:
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    // Está rodando como PWA instalado → pede permissão de notificação
    setTimeout(async () => {
        if (Notification.permission === 'default') {
        await Notification.requestPermission();
        }
    }, 2000);
    }
    startPollCheck();
    await updateMyStatus('online');
    await loadAllData(user.id);
    startMessagePolling(user.id);
    startAnnouncementCheck();
    typingInterval = setInterval(checkTypingStatus, 2000);
    setupEventListeners();

    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('user');
    if (targetUserId) {
        setTimeout(async () => {
            const targetUser = allUsers.find(u => u.id === targetUserId);
            if (targetUser) {
                await selectUser(targetUser, null);
                window.history.replaceState({}, document.title, '/chat/index.html');
            }
        }, 500);
    }
    
    window.addEventListener('beforeunload', async () => {
        stopMessagePolling();
        stopTypingPolling();
        if (currentUserId) await updateMyStatus('offline');
        if (typingInterval) clearInterval(typingInterval);
    });

    const headerUser = document.getElementById('chatHeaderUser');
    if (headerUser) {
        headerUser.addEventListener('click', () => {
            if (currentConversationUser) updateUserInfoBar(currentConversationUser);
        });
    }

    setInterval(async () => {
        if (currentUserId) {
            const users = await databaseManager.getAllUsers(currentUserId);
            if (users) users.forEach(u => { allUsers[u.id] = u; });
        }
    }, 30000);
});

async function waitForSupabase() {
    let attempts = 0;
    while (!db && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
}

async function updateMyStatus(status) {
    if (!db || !currentUserId) return;
    try { await db.from('users').update({ status, last_seen: new Date().toISOString() }).eq('id', currentUserId); } catch (e) {}
}

function initializeUI(user) {
    if (!user) return;
    const avatarEl = document.getElementById('currentUserAvatar');
    if (avatarEl) {
        if (user.avatar_url) {
            avatarEl.innerHTML = `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        } else {
            const initialsEl = document.getElementById('currentUserInitials');
            if (initialsEl) initialsEl.textContent = getInitials(user.username);
        }
    }
    const usernameEl = document.getElementById('currentUsername');
    if (usernameEl) {
        usernameEl.textContent = user.username;
        usernameEl.style.color = getRoleColor(user.role);
    }
    const roleEl = document.getElementById('currentUserRole');
    if (roleEl) {
        const roleColor = getRoleColor(user.role);
        roleEl.style.color = roleColor;
        roleEl.textContent = user.role === 'admin' ? 'ADMIN' : user.role === 'moderator' ? 'MODERADOR' : user.role === 'supervisor' ? 'SUPERVISOR' : 'USUÁRIO';
    }
    const statusMsgEl = document.getElementById('currentStatusMessage');
    if (statusMsgEl) {
        statusMsgEl.textContent = user.status_message || '';
        statusMsgEl.style.display = user.status_message ? 'block' : 'none';
    }
    const btnAdmin = document.getElementById('btnAdminPanel');
    if (btnAdmin && (user.role === 'admin' || user.role === 'moderator' || user.role === 'supervisor')) {
        btnAdmin.style.display = 'block';
    }
}

function getRoleColor(role) {
    const colors = { 
        'admin': '#dc2626', 
        'moderator': '#7c3aed', 
        'supervisor': '#f59e0b',  // laranja/dourado
        'user': '#a0a0a0' 
    };
    return colors[role] || colors.user;
}

// ========== POLLING ==========
function startMessagePolling(userId) { stopMessagePolling(); pollingActive = true; scheduleNextPoll(userId); }
function stopMessagePolling() { pollingActive = false; if (pollingTimeout) { clearTimeout(pollingTimeout); pollingTimeout = null; } }
function scheduleNextPoll(userId, delay = 1500) {
    if (!pollingActive) return;
    pollingTimeout = setTimeout(async () => {
        await checkNewMessages(userId);
        scheduleNextPoll(userId, document.hidden ? 5000 : 1500);
    }, delay);
}
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pollingActive && currentUserId) checkNewMessages(currentUserId);
});

async function checkNewMessages(userId) {
    if (!db || !userId) return;
    try {
        const { data: messages, error } = await db.from('messages').select('*').eq('receiver_id', userId).eq('is_read', false).gt('created_at', lastMessageCheck).order('created_at', { ascending: true });
        if (error) return;
        if (messages && messages.length > 0) {
            for (const msg of messages) {
                if (currentConversationUser && msg.sender_id === currentConversationUser.id) {
                    appendMessage(msg);
                    await db.from('messages').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', msg.id);
                }
            }
            await loadConversations(userId);
            lastMessageCheck = new Date().toISOString();
            if (document.hidden && messages.length > 0) {
                playNotificationSound();
                const lastMsg = messages[messages.length - 1];
                const senderInfo = await getUserInfo(lastMsg.sender_id);
                showNotification(`Nova mensagem de ${senderInfo.username}`, lastMsg.content.substring(0, 100), senderInfo.avatar_url, { url: `/chat/index.html?user=${lastMsg.sender_id}` });
            }
        }
    } catch (e) {}
}

// ========== CARREGAR DADOS ==========
async function loadAllData(userId) { if (!userId) return; await loadAllUsers(userId); await loadConversations(userId); }
async function loadAllUsers(currentUserId) { try { const users = await databaseManager.getAllUsers(currentUserId); allUsers = users || []; } catch (e) { allUsers = []; } }
async function loadConversations(userId) {
    if (!userId || !db) return;
    try {
        const { data } = await db.from('conversations').select('*').or(`user1_id.eq.${userId},user2_id.eq.${userId}`).order('last_message_at', { ascending: false });
        conversations = data || [];
        for (let conv of conversations) {
            const otherUserId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
            const { count } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', otherUserId).eq('receiver_id', userId).eq('is_read', false);
            conv._unread = count || 0;
        }
        renderConversationsList(conversations);
    } catch (e) { renderConversationsList([]); }
}

function renderConversationsList(convs) {
    const container = document.getElementById('usersList');
    if (!container) return;
    if (!convs || convs.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#6b6b6b;"><div class="no-chat-icon"></div><p style="font-size:16px;font-weight:500;color:#a0a0a0;">Nenhuma conversa ainda</p><p style="font-size:13px;color:#525252;margin-top:8px;">Use a busca para encontrar usuários</p></div>`;
        return;
    }
    container.innerHTML = '<div style="padding:12px 16px 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#525252;font-weight:600;">Conversas</div>';
    convs.forEach(conv => {
        const otherUserId = conv.user1_id === currentUserId ? conv.user2_id : conv.user1_id;
        const otherUser = allUsers.find(u => u.id === otherUserId);
        if (otherUser) container.appendChild(createConversationCard(otherUser, conv));
    });
}

function createConversationCard(user, conversation) {
    const card = document.createElement('div');
    card.className = 'user-list-item';
    card.style.cssText = 'cursor:pointer;border-left:2px solid transparent;margin:2px 8px;border-radius:12px;transition:background 0.15s,border-left 0.15s;';
    card.setAttribute('data-user-id', user.id);
    card.addEventListener('click', function() { selectUser(user, this); });
    card.addEventListener('mouseenter', () => { if (card !== selectedCardElement) card.style.background = '#1c1c1c'; });
    card.addEventListener('mouseleave', () => { if (card !== selectedCardElement) card.style.background = ''; });
    const roleColor = getRoleColor(user.role);
    const initials = getInitials(user.username);
    let lastMessage = '', lastTime = '';
    if (conversation?.last_message) {
        lastMessage = conversation.last_message.length > 30 ? conversation.last_message.substring(0,30)+'...' : conversation.last_message;
        lastTime = formatTime(conversation.last_message_at);
    }
    const unreadCount = conversation?._unread || 0;
    const unreadBadgeHTML = unreadCount > 0 ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : '';
    card.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;"><div style="position:relative;width:46px;height:46px;flex-shrink:0;"><div style="width:46px;height:46px;border-radius:50%;background:#1c1c1c;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:17px;color:#9ca3af;">${initials}</span>`}</div><span style="position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:${user.status==='online'?'#22c55e':'#4b5563'};border:2px solid #111111;box-shadow:0 0 6px rgba(0,0,0,0.5);"></span></div><div style="flex:1;min-width:0;"><div style="display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;align-items:center;gap:8px;min-width:0;"><span style="color:${roleColor};font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(user.username)}</span>${unreadBadgeHTML}</div>${lastTime?`<span style="font-size:11px;color:#5c5c5c;flex-shrink:0;margin-left:8px;">${lastTime}</span>`:''}</div>${user.status_message ? `<div class="user-status-inline">${escapeHtml(user.status_message)}</div>` : ''}${lastMessage?`<div style="font-size:13px;color:#6b6b6b;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(lastMessage)}</div>`:''}${user.role!=='user'?`<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;text-transform:uppercase;font-weight:600;background:${roleColor}20;color:${roleColor};margin-top:4px;">${user.role}</span>`:''}</div></div>`;
    return card;
}

// ========== EVENTOS ==========
function setupEventListeners() {
    document.getElementById('userSearch')?.addEventListener('input', debounce(function(e) { const term = e.target.value.trim(); term ? searchUsers(term) : renderConversationsList(conversations); }, 300));
    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
        msgInput.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; sendTypingStatus(); });
        msgInput.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    }
}
function searchUsers(term) {
    const container = document.getElementById('usersList');
    if (!container) return;
    const filtered = allUsers.filter(u => u.username.toLowerCase().includes(term.toLowerCase()));
    if (!filtered.length) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#525252;">Nenhum usuário encontrado</div>'; return; }
    container.innerHTML = `<div style="padding:12px 16px 8px;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#525252;font-weight:600;">Resultados (${filtered.length})</div>`;
    filtered.forEach(u => container.appendChild(createConversationCard(u, null)));
}

// ========== SELEÇÃO DE USUÁRIO ==========
async function selectUser(user, cardElement) {
    if (!user?.id || !currentUserId) return;
    currentConversationUser = user;
    const noChatSelected = document.getElementById('noChatSelected');
    const msgContainer = document.getElementById('messagesContainer');
    const inputContainer = document.getElementById('messageInputContainer');
    if (!msgContainer || !inputContainer) return;
    if (noChatSelected) noChatSelected.style.display = 'none';
    msgContainer.style.display = 'block';
    inputContainer.style.display = 'flex';
    const headerUser = document.getElementById('chatHeaderUser');
    if (headerUser) {
        const rc = getRoleColor(user.role);
        headerUser.innerHTML = `<div style="display:flex;align-items:center;gap:10px;"><span style="color:${rc};font-weight:600;font-size:15px;">${escapeHtml(user.username)}</span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${user.status==='online'?'#22c55e':'#525252'};box-shadow:0 0 6px rgba(0,0,0,0.4);"></span></div>`;
    }
    if (selectedCardElement) { selectedCardElement.style.background = ''; selectedCardElement.style.borderLeft = '2px solid transparent'; }
    if (cardElement) { cardElement.style.background = '#1f1f1f'; cardElement.style.borderLeft = '2px solid #ffffff'; selectedCardElement = cardElement; }
    await loadMessages(currentUserId, user.id);
    try { await databaseManager.markMessagesAsRead(user.id, currentUserId); } catch(e){}
    await loadConversations(currentUserId);
    updateUserInfoBar(user);
    if (window.innerWidth <= 768) toggleSidebar();
    setTimeout(() => document.getElementById('messageInput')?.focus(), 100);
}
async function loadMessages(uid1, uid2) {
    if (!uid1 || !uid2) return;
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:60px;color:#525252;">Carregando...</div>';
    try {
        const msgs = await databaseManager.getMessages(uid1, uid2);
        container.innerHTML = '';
        if (!msgs?.length) { container.innerHTML = '<div style="text-align:center;padding:80px 40px;color:#525252;"><div class="no-chat-icon" style="margin:0 auto 16px;"></div><p style="font-size:15px;">Nenhuma mensagem</p></div>'; return; }
        msgs.forEach(m => container.appendChild(createMessageElement(m, m.sender_id === currentUserId)));
        container.scrollTop = container.scrollHeight;
    } catch(e) { container.innerHTML = '<div style="text-align:center;padding:60px;color:#dc2626;">Erro ao carregar</div>'; }
}

function createMessageElement(msg, isOwn) {
    const div = document.createElement('div');
    div.className = 'message ' + (isOwn ? 'own' : 'other');
    div.dataset.messageId = msg.id;
    const time = formatTime(msg.created_at);
    const edited = msg.edited ? ' (editado)' : '';
    let replyRefHTML = '';
    if (msg.reply_to) {
        const repliedUsername = msg.reply_to.username || 'Usuário';
        const repliedContent = msg.reply_to.content || '';
        replyRefHTML = `<div class="geral-message-reply-ref" onclick="scrollToMessage('${msg.reply_to.id}')"><span class="reply-author">${escapeHtml(repliedUsername)}</span><span class="reply-content">${escapeHtml(repliedContent.substring(0, 50))}</span></div>`;
    }
    const bubble = document.createElement('div');
    bubble.innerHTML = `${replyRefHTML}<div style="white-space:pre-wrap;">${escapeHtml(msg.content)}${edited}</div><div class="meta">${time}</div>`;
    div.appendChild(bubble);
    const reactionsContainer = document.createElement('div');
    reactionsContainer.className = 'reactions-container';
    div.appendChild(reactionsContainer);
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    let buttonsHTML = '<button class="react-btn">😊</button><button class="msg-action-btn reply-btn">Responder</button>';
    if (isOwn) {
        if (isMessageEditable(msg.created_at) && !msg.edited) buttonsHTML += '<button class="msg-action-btn edit-btn">Editar</button>';
        buttonsHTML += '<button class="msg-action-btn delete-btn">Excluir</button>';
    }
    actions.innerHTML = buttonsHTML;
    div.appendChild(actions);
    const reactBtn = actions.querySelector('.react-btn');
    if (reactBtn) {
        reactBtn.addEventListener('click', (e) => { e.stopPropagation(); const rect = reactBtn.getBoundingClientRect(); showReactMenu(msg.id, rect.left, rect.top); });
    }
    const replyBtn = actions.querySelector('.reply-btn');
    if (replyBtn) {
        replyBtn.onclick = async (e) => { e.stopPropagation(); const sender = await getUserInfo(msg.sender_id); replyToMessage = { id: msg.id, username: sender.username, content: msg.content, userId: msg.sender_id }; renderReplyPreview(); document.getElementById('messageInput')?.focus(); };
    }
    const editBtn = actions.querySelector('.edit-btn');
    if (editBtn) { editBtn.onclick = (e) => { e.stopPropagation(); showEditModal(msg); }; }
    const deleteBtn = actions.querySelector('.delete-btn');
    if (deleteBtn) { deleteBtn.onclick = (e) => { e.stopPropagation(); confirmDelete(msg.id); }; }
    div.addEventListener('mouseenter', () => { actions.style.opacity = '1'; if (reactBtn) reactBtn.style.opacity = '1'; });
    div.addEventListener('mouseleave', () => { actions.style.opacity = '0'; if (reactBtn) reactBtn.style.opacity = '0'; });
    setTimeout(async () => { const reactions = await loadReactions(msg.id); renderReactions(div, msg.id, reactions); }, 50);
    return div;
}

// ========== ENVIO ==========
async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input || sendingMessage) return;
    const content = input.value.trim();
    if (!content || !currentConversationUser) return;
    sendingMessage = true; input.disabled = true;
    try {
        const msg = await databaseManager.sendMessage(currentUserId, currentConversationUser.id, content, replyToMessage ? { id: replyToMessage.id, user_id: replyToMessage.userId, username: replyToMessage.username, content: replyToMessage.content } : null);
        if (replyToMessage) cancelReply();
        if (msg) appendMessage(msg);
        input.value = ''; input.style.height = 'auto';
        setTimeout(() => loadConversations(currentUserId), 300);
    } catch (e) { showToast('Erro ao enviar', 'error'); }
    finally { input.disabled = false; input.focus(); sendingMessage = false; }
}
function appendMessage(msg) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    const isEmpty = container.querySelector('div[style*="padding:80px"]') || container.querySelector('div[style*="padding:60px"]');
    if (isEmpty) container.innerHTML = '';
    container.appendChild(createMessageElement(msg, msg.sender_id === currentUserId));
    container.scrollTop = container.scrollHeight;
}

// ========== REAÇÕES DE MENSAGENS ==========
async function loadReactions(messageId) { try { const { data } = await db.from('message_reactions').select('*').eq('message_id', messageId); return data || []; } catch (e) { return []; } }
function renderReactions(messageEl, messageId, reactions) {
    const oldContainer = messageEl.querySelector('.reactions-container');
    if (oldContainer) oldContainer.remove();
    if (!reactions || reactions.length === 0) return;
    const grouped = {};
    reactions.forEach(r => { if (!grouped[r.reaction]) grouped[r.reaction] = { count: 0, users: [] }; grouped[r.reaction].count++; grouped[r.reaction].users.push(r.user_id); });
    const container = document.createElement('div');
    container.className = 'reactions-container';
    Object.entries(grouped).forEach(([emoji, data]) => {
        const item = document.createElement('span');
        item.className = 'reaction-item' + (data.users.includes(currentUserId) ? ' active' : '');
        item.innerHTML = `<span class="reaction-emoji">${emoji}</span><span class="reaction-count">${data.count}</span>`;
        item.title = data.users.includes(currentUserId) ? 'Clique para remover' : 'Clique para reagir';
        item.onclick = async (e) => { e.stopPropagation(); await toggleReaction(messageId, emoji); };
        container.appendChild(item);
    });
    messageEl.appendChild(container);
}
async function toggleReaction(messageId, emoji) {
    try {
        const { data: existing } = await db.from('message_reactions').select('*').eq('message_id', messageId).eq('user_id', currentUserId).eq('reaction', emoji).maybeSingle();
        if (existing) { await db.from('message_reactions').delete().eq('id', existing.id); }
        else { await db.from('message_reactions').insert({ message_id: messageId, user_id: currentUserId, reaction: emoji }); }
        const reactions = await loadReactions(messageId);
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) renderReactions(messageEl, messageId, reactions);
    } catch (e) {}
}
function showReactMenu(messageId, x, y) {
    closeReactMenu();
    const menu = document.createElement('div');
    menu.className = 'react-menu'; menu.id = 'reactMenu';
    menu.style.left = x + 'px'; menu.style.top = (y - 50) + 'px';
    REACTIONS.forEach(emoji => { const btn = document.createElement('button'); btn.textContent = emoji; btn.onclick = async (e) => { e.stopPropagation(); await toggleReaction(messageId, emoji); closeReactMenu(); }; menu.appendChild(btn); });
    document.body.appendChild(menu);
    setTimeout(() => { document.addEventListener('click', closeReactMenu, { once: true }); }, 100);
}
function closeReactMenu() { const menu = document.getElementById('reactMenu'); if (menu) menu.remove(); openReactMenu = null; }

// ========== ANÚNCIOS COM REAÇÕES ==========
async function checkAnnouncements() {
    try {
        const { data: announcements } = await db.from('announcements').select('*').order('created_at', { ascending: false }).limit(1);
        if (!announcements || announcements.length === 0) { document.getElementById('announcementBanner').style.display = 'none'; return; }
        const announcement = announcements[0];
        const { data: views } = await db.from('announcement_views').select('*').eq('user_id', currentUserId).eq('announcement_id', announcement.id).maybeSingle();
        if (views) { document.getElementById('announcementBanner').style.display = 'none'; return; }
        if (latestAnnouncementId !== announcement.id) {
            latestAnnouncementId = announcement.id;
            renderAnnouncementBanner(announcement);
            if (document.hidden) { playNotificationSound(); showNotification(`📢 ${announcement.title}`, announcement.content.substring(0, 100), null, { url: window.location.href }); }
        }
    } catch (e) {}
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
        const { data: reactions } = await db.from('announcement_reactions').select('*').eq('announcement_id', announcementId);
        const grouped = {};
        if (reactions) reactions.forEach(r => { if (!grouped[r.reaction]) grouped[r.reaction] = { count: 0, users: [] }; grouped[r.reaction].count++; grouped[r.reaction].users.push(r.user_id); });
        container.innerHTML = `<div class="reactions-row">${REACTIONS.map(emoji => { const data = grouped[emoji] || { count: 0, users: [] }; const active = data.users.includes(currentUserId); return `<button class="reaction-btn ${active ? 'active' : ''}" onclick="event.stopPropagation(); toggleAnnouncementReaction('${announcementId}', '${emoji}')" title="${emoji}">${emoji} <span class="reaction-count">${data.count}</span></button>`; }).join('')}</div>`;
    } catch (e) {}
}
async function toggleAnnouncementReaction(announcementId, emoji) {
    try {
        const { data: existing } = await db.from('announcement_reactions').select('*').eq('announcement_id', announcementId).eq('user_id', currentUserId).maybeSingle();
        if (existing) { if (existing.reaction === emoji) { await db.from('announcement_reactions').delete().eq('id', existing.id); } else { await db.from('announcement_reactions').update({ reaction: emoji }).eq('id', existing.id); } }
        else { await db.from('announcement_reactions').insert({ announcement_id: announcementId, user_id: currentUserId, reaction: emoji }); }
        loadAndRenderAnnouncementReactions(announcementId);
    } catch (e) {}
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
function startAnnouncementCheck() { checkAnnouncements(); setInterval(checkAnnouncements, 30000); }

// ========== UI ==========
function updateUserInfoBar(user) {
    const bar = document.getElementById('userInfoBar');
    if (!bar) return;
    if (!user) { bar.style.display = 'none'; return; }
    const rc = getRoleColor(user.role);
    bar.innerHTML = `<div class="info-avatar">${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">` : `<span style="font-size:18px;color:${rc};">${getInitials(user.username)}</span>`}</div><div class="info-text"><div class="info-name">${escapeHtml(user.username)}</div><div class="info-details"><span class="${user.status === 'online' ? 'online-dot' : 'online-dot offline-dot'}"></span>${user.status === 'online' ? 'Online' : 'Offline'}${user.role !== 'user' ? `<span class="role-tag" style="background:${rc}20;color:${rc};">${user.role}</span>` : ''}</div>${user.status_message ? `<div class="info-status">${escapeHtml(user.status_message)}</div>` : ''}</div>`;
    bar.style.display = 'flex';
}
function showUserInfo(user) { updateUserInfoBar(user); }
function closeInfoPanel() { const bar = document.getElementById('userInfoBar'); if (bar) bar.style.display = 'none'; const panel = document.getElementById('infoPanel'); if (panel) panel.style.display = 'none'; }
function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); document.querySelector('.sidebar-overlay')?.classList.toggle('active'); }
async function handleLogout() {
    stopMessagePolling(); if (typingInterval) { clearInterval(typingInterval); typingInterval = null; } if (pollCheckInterval) { clearInterval(pollCheckInterval); pollCheckInterval = null; }
    if (currentUserId) { try { await db.from('users').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', currentUserId); } catch (e) {} }
    await sessionManager.logout(); window.location.href = '/login/';
}

// =============== MODAIS ===============
function showEditModal(msg) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;z-index:5000;';
    modal.innerHTML = `
        <div style="background:rgba(22,22,22,0.9);backdrop-filter:blur(20px);border-radius:20px;padding:28px;max-width:480px;width:90%;box-shadow:0 20px 50px rgba(0,0,0,0.6);border:1px solid #1f1f1f;">
            <h2 style="font-size:19px;font-weight:600;margin-bottom:18px;color:#f0f0f0;">Editar mensagem</h2>
            <textarea id="editMsgInput" style="width:100%;min-height:120px;background:#0a0a0a;border:1px solid #1f1f1f;border-radius:12px;padding:14px;color:#eaeaea;resize:vertical;font-size:14px;line-height:1.5;">${escapeHtml(msg.content)}</textarea>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
                <button id="cancelEditBtn" style="padding:10px 20px;border:1px solid #2a2a2a;border-radius:24px;background:transparent;color:#9ca3af;font-size:14px;cursor:pointer;">Cancelar</button>
                <button id="saveEditBtn" style="padding:10px 24px;background:#fff;color:#0a0a0a;border:none;border-radius:24px;font-weight:600;font-size:14px;cursor:pointer;">Salvar</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('cancelEditBtn').onclick = () => modal.remove();
    document.getElementById('saveEditBtn').onclick = async () => {
        const newContent = modal.querySelector('#editMsgInput').value.trim();
        if (newContent && newContent !== msg.content) {
            try { await databaseManager.editMessage(msg.id, newContent, currentUserId); showToast('Editado!', 'success'); modal.remove(); if(currentConversationUser) loadMessages(currentUserId, currentConversationUser.id); }
            catch(e) { showToast(e.message, 'error'); }
        } else modal.remove();
    };
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
    setTimeout(() => modal.querySelector('#editMsgInput')?.focus(), 100);
}

async function confirmDelete(msgId) {
    if (!confirm('Excluir esta mensagem?')) return;
    try {
        await databaseManager.deleteMessage(msgId, currentUserId);
        const el = document.querySelector(`[data-message-id="${msgId}"]`);
        if (el) { el.style.opacity='0'; el.style.transition='opacity 0.25s'; setTimeout(()=>el.remove(), 250); }
        showToast('Mensagem excluída', 'success');
    } catch(e) { showToast('Erro ao excluir', 'error'); }
}

// =============== UI ===============
// Nova função para a barra fixa no topo (sem botão de fechar)
function updateUserInfoBar(user) {
    const bar = document.getElementById('userInfoBar');
    if (!bar) return;

    if (!user) {
        bar.style.display = 'none';
        return;
    }

    const rc = getRoleColor(user.role);

    bar.innerHTML = `
    <div class="info-avatar">
        ${user.avatar_url ? 
            `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">` : 
            `<span style="font-size:18px;color:${rc};">${getInitials(user.username)}</span>`
        }
    </div>
    <div class="info-text">
        <div class="info-name" style="color:${rc}">${escapeHtml(user.username)}</div>
        <div class="info-details">
            <span class="${user.status === 'online' ? 'online-dot' : 'online-dot offline-dot'}"></span>
            ${user.status === 'online' ? 'Online' : 'Offline'}
            ${user.role !== 'user' ? 
                `<span class="role-tag" style="background:${rc}20;color:${rc};">${user.role}</span>` : ''
            }
        </div>
        ${user.status_message ? `<div class="info-status">${escapeHtml(user.status_message)}</div>` : ''}
    </div>
`;

    bar.style.display = 'flex';
}

// Mantive compatibilidade com chamadas antigas (showUserInfo/closeInfoPanel)
function showUserInfo(user) { updateUserInfoBar(user); }
function closeInfoPanel() {
    const bar = document.getElementById('userInfoBar');
    if (bar) bar.style.display = 'none';
    const panel = document.getElementById('infoPanel');
    if (panel) panel.style.display = 'none';
}

function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); document.querySelector('.sidebar-overlay')?.classList.toggle('active'); }

async function handleLogout() {
    stopMessagePolling();
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
    if (pollCheckInterval) { clearInterval(pollCheckInterval); pollCheckInterval = null; }
    if (currentUserId) {
        try { await db.from('users').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', currentUserId); } catch (e) {}
    }
    await sessionManager.logout();
    window.location.href = '/login/';
}

function showProfileModal() {
    const user = sessionManager.getCurrentUser();
    if (!user) return;
    document.getElementById('profileModal').style.display = 'flex';
    document.getElementById('editUsername').value = user.username || '';
    document.getElementById('editNewPassword').value = '';
    document.getElementById('editCurrentPassword').value = '';
    document.getElementById('editStatusMessage').value = user.status_message || '';
    if (user.avatar_url) document.getElementById('avatarPreview').innerHTML = `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">`;
}

function closeProfileModal() { document.getElementById('profileModal').style.display = 'none'; }

async function saveProfile() {
    const username = document.getElementById('editUsername').value.trim();
    const newPass = document.getElementById('editNewPassword').value;
    const currPass = document.getElementById('editCurrentPassword').value;
    const statusMessage = document.getElementById('editStatusMessage').value.trim();
    
    if (!currPass) { showToast('Senha atual obrigatória', 'error'); return; }
    try {
        if (username && username !== sessionManager.getCurrentUser().username) await sessionManager.updateProfile({ username });
        if (newPass) await sessionManager.changePassword(currPass, newPass);
        await sessionManager.updateProfile({ status_message: statusMessage });
        showToast('Perfil atualizado', 'success');
        closeProfileModal();
        setTimeout(() => location.reload(), 1000);
    } catch(e) { showToast(e.message, 'error'); }
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Apenas imagens são permitidas', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Imagem muito grande (máximo 5MB)', 'error'); return; }
    showToast('Enviando foto...', 'info');
    try {
        const user = sessionManager.getCurrentUser();
        const fileExt = file.name.split('.').pop().toLowerCase();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await db.storage.from('avatars').upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });
        if (uploadError) {
            if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
                showToast('Bucket "avatars" não encontrado. Crie-o no painel do Supabase: Storage → New bucket → "avatars" (marcar como público).', 'error');
            } else if (uploadError.message.includes('row-level security') || uploadError.message.includes('policy')) {
                showToast('Erro de permissão. Execute o SQL fornecido para criar as políticas de acesso público ao bucket "avatars".', 'error');
            } else {
                showToast('Erro ao enviar: ' + uploadError.message, 'error');
            }
            return;
        }
        const { data: urlData } = db.storage.from('avatars').getPublicUrl(fileName);
        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) { showToast('Erro ao gerar URL da imagem', 'error'); return; }
        await sessionManager.updateProfile({ avatar_url: publicUrl });
        showToast('Foto atualizada!', 'success');
        setTimeout(() => location.reload(), 800);
    } catch (error) {
        showToast('Falha ao processar imagem', 'error');
    }
}

// =============== TYPING STATUS ===============
async function sendTypingStatus() {
    if (!currentConversationUser || !currentUserId) return;
    clearTimeout(typingTimer);
    try {
        await db.from('typing_status').upsert({
            user_id: currentUserId,
            contact_id: currentConversationUser.id,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,contact_id' });
    } catch(e) {}
    typingTimer = setTimeout(async () => {
        try {
            await db.from('typing_status').delete().eq('user_id', currentUserId).eq('contact_id', currentConversationUser.id);
        } catch(e) {}
    }, 3000);
}

async function checkTypingStatus() {
    if (!currentConversationUser || !currentUserId) {
        document.getElementById('typingIndicator').style.display = 'none';
        return;
    }
    try {
        const { data } = await db.from('typing_status')
            .select('*')
            .eq('user_id', currentConversationUser.id)
            .eq('contact_id', currentUserId)
            .gt('updated_at', new Date(Date.now() - 4000).toISOString())
            .maybeSingle();
        const indicator = document.getElementById('typingIndicator');
        if (data) {
            indicator.textContent = `${currentConversationUser.username} está digitando...`;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    } catch(e) {
        document.getElementById('typingIndicator').style.display = 'none';
    }
}

// =============== ENQUETES ===============
async function loadActivePoll() {
    try {
        const { data: polls } = await db.from('polls').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1);
        if (polls && polls.length > 0) {
            activePoll = polls[0];
            const { data: votes } = await db.from('poll_votes').select('*').eq('poll_id', activePoll.id).eq('user_id', currentUserId).maybeSingle();
            userVote = votes;
            renderPollBanner();
        } else {
            activePoll = null;
            userVote = null;
            document.getElementById('pollBanner').style.display = 'none';
        }
    } catch (e) {}
}

function renderPollBanner() {
    const banner = document.getElementById('pollBanner');
    if (!activePoll) { banner.style.display = 'none'; return; }
    banner.style.display = 'block';
    const options = JSON.parse(activePoll.options);
    if (userVote) {
        loadPollResults(activePoll.id).then(html => {
            banner.innerHTML = `<div class="poll-question">${escapeHtml(activePoll.question)}</div><div class="poll-results">${html}</div><p style="font-size:11px;color:var(--text-tertiary);margin-top:8px;">Seu voto foi registrado</p>`;
        });
    } else {
        banner.innerHTML = `
            <div class="poll-question">${escapeHtml(activePoll.question)}</div>
            ${options.map((opt, i) => `<button class="poll-option" onclick="votePoll(${i})">${escapeHtml(opt)}</button>`).join('')}
        `;
    }
}

async function votePoll(optionIndex) {
    if (!activePoll || userVote) return;
    try {
        await db.from('poll_votes').insert({ poll_id: activePoll.id, user_id: currentUserId, option_index: optionIndex });
        userVote = { option_index: optionIndex };
        renderPollBanner();
        showToast('Voto registrado!', 'success');
    } catch (e) {
        if (e.message.includes('duplicate')) { showToast('Você já votou nesta enquete', 'error'); }
        else { showToast('Erro ao votar', 'error'); }
    }
}

async function loadPollResults(pollId) {
    const { data: poll } = await db.from('polls').select('*').eq('id', pollId).single();
    if (!poll) return '';
    const { data: votes } = await db.from('poll_votes').select('*').eq('poll_id', pollId);
    const options = JSON.parse(poll.options);
    const counts = new Array(options.length).fill(0);
    (votes || []).forEach(v => { if (v.option_index < counts.length) counts[v.option_index]++; });
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    return options.map((opt, i) => {
        const pct = Math.round((counts[i] / total) * 100);
        const isMyVote = userVote && userVote.option_index === i;
        return `
            <div class="poll-bar">
                <span style="width:80px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(opt)}</span>
                <div class="poll-bar-fill"><div class="poll-bar-inner" style="width:${pct}%;"></div></div>
                <span style="width:40px;text-align:right;">${pct}%</span>
                ${isMyVote ? '<span style="color:#a78bfa;font-weight:600;">(Você)</span>' : ''}
            </div>
        `;
    }).join('');
}

let pollCheckInterval = null;
function startPollCheck() { loadActivePoll(); pollCheckInterval = setInterval(loadActivePoll, 30000); }
function stopPollCheck() { if (pollCheckInterval) clearInterval(pollCheckInterval); }

async function getUnreadCounts() {
    if (!currentUserId) return {};
    const { data } = await db.from('messages').select('sender_id, receiver_id').eq('receiver_id', currentUserId).eq('is_read', false);
    if (!data) return {};
    const counts = {};
    data.forEach(msg => { counts[msg.sender_id] = (counts[msg.sender_id] || 0) + 1; });
    return counts;
}

// ========== NOTIFICAÇÕES PWA ==========
async function showNotification(title, body, icon, data) {
  if (!('Notification' in window)) return;
  
  // Solicitar permissão se ainda não foi
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
  }
  
  if (Notification.permission !== 'granted') return;
  
  // Verifica se o Service Worker está registrado e ativo
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    console.warn('Service Worker não registrado');
    // Fallback: notificação normal
    new Notification(title, { body, icon, data });
    return;
  }
  
  // Mostrar notificação via Service Worker (mais confiável em PWA)
  registration.showNotification(title, {
    body: body,
    icon: icon || '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    tag: 'bidjorchat',
    renotify: true,
    data: data || { url: window.location.href },
    vibrate: [200, 100, 200]
  });
}

// ========== RESPOSTA (REPLY) ==========
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
    const inputContainer = document.querySelector('.message-input-container');
    if (inputContainer) {
        inputContainer.parentNode.insertBefore(preview, inputContainer);
    }
}

function cancelReply() {
    replyToMessage = null;
    const existing = document.querySelector('.reply-preview');
    if (existing) existing.remove();
}

function scrollToMessage(messageId) {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.background = 'rgba(139, 92, 246, 0.2)';
        setTimeout(() => el.style.background = '', 1500);
    }
}

async function getUserInfo(userId) {
    // Se já está no cache, retorna imediatamente
    if (allUsers[userId]) return allUsers[userId];

    // Busca no banco e armazena no cache
    try {
        const { data: user } = await db
            .from('users')
            .select('id, username, avatar_url, role, status')
            .eq('id', userId)
            .single();
        if (user) {
            allUsers[userId] = user;
            return user;
        }
    } catch (e) {
        console.warn('Erro ao buscar usuário:', e);
    }
    // Fallback genérico
    return { username: 'Usuário', avatar_url: null, role: 'user', status: 'offline' };
}