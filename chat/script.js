// BIDJORCHAT - Chat Script (Final - Visual Aprimorado)
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


// Corrigir imagens de avatar quebradas
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

function goToAdmin() {
    window.location.href = '/admin/index.html';
}

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

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Iniciando chat...');
    
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
    
    const user = sessionManager.getCurrentUser();
    if (!user || !user.id) {
        window.location.href = '/login/index.html';
        return;
    }
    
    currentUserId = user.id;
    console.log('👤 Usuário:', user.username);
    
    if (user.is_banned) {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#dc2626;font-size:24px;">🚫 ACESSO NEGADO</div>';
        return;
    }
    
    initializeUI(user);
    await updateMyStatus('online');
    await loadAllData(user.id);
    startMessagePolling(user.id);
    typingInterval = setInterval(checkTypingStatus, 2000);
    setupEventListeners();
    
    window.addEventListener('beforeunload', async () => {
        stopMessagePolling();
        stopTypingPolling();
        if (currentUserId) await updateMyStatus('offline');
        if (typingInterval) clearInterval(typingInterval);
    });
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
    try {
        await db.from('users').update({ status, last_seen: new Date().toISOString() }).eq('id', currentUserId);
    } catch (e) {}
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
    if (usernameEl) usernameEl.textContent = user.username;
    
    const roleEl = document.getElementById('currentUserRole');
    if (roleEl) {
        const roleColor = getRoleColor(user.role);
        roleEl.style.color = roleColor;
        roleEl.textContent = user.role === 'admin' ? 'ADMIN' : user.role === 'moderator' ? 'MODERADOR' : 'USUÁRIO';
    }

    // Mostrar botão admin se for admin ou moderator
    const btnAdmin = document.getElementById('btnAdminPanel');
    if (btnAdmin && (user.role === 'admin' || user.role === 'moderator')) {
        btnAdmin.style.display = 'block';
    }
}

function getRoleColor(role) {
    const colors = { 'admin': '#dc2626', 'moderator': '#7c3aed', 'user': '#a0a0a0' };
    return colors[role] || colors.user;
}

// =============== POLLING ===============
function startMessagePolling(userId) {
    stopMessagePolling();
    pollingActive = true;
    console.log('🔄 Polling adaptativo iniciado');
    scheduleNextPoll(userId);
}
function stopMessagePolling() {
    pollingActive = false;
    if (pollingTimeout) {
        clearTimeout(pollingTimeout);
        pollingTimeout = null;
    }
}

function scheduleNextPoll(userId, delay = 1500) {
    if (!pollingActive) return;
    pollingTimeout = setTimeout(async () => {
        await checkNewMessages(userId);
        // Se a aba está oculta, espera 5s; se visível, 1.5s
        const nextDelay = document.hidden ? 5000 : 1500;
        scheduleNextPoll(userId, nextDelay);
    }, delay);
}

// Reconectar ao voltar para a aba
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pollingActive && currentUserId) {
        console.log('👁️ Aba reativada – verificando novas mensagens...');
        checkNewMessages(currentUserId);
    }
});


async function checkNewMessages(userId) {
    if (!db || !userId) return;
    try {
        const { data: messages, error } = await db
            .from('messages')
            .select('*')
            .eq('receiver_id', userId)
            .eq('is_read', false)
            .gt('created_at', lastMessageCheck)
            .order('created_at', { ascending: true });

        if (error) {
            console.warn('Erro ao verificar mensagens:', error.message);
            return;
        }

        if (messages && messages.length > 0) {
            for (const msg of messages) {
                if (currentConversationUser && msg.sender_id === currentConversationUser.id) {
                    appendMessage(msg);
                }
                await db.from('messages').update({
                    is_read: true,
                    read_at: new Date().toISOString()
                }).eq('id', msg.id);
            }
            await loadConversations(userId);
            lastMessageCheck = new Date().toISOString();

            // Som de notificação se aba estiver oculta
            if (document.hidden) {
                playNotificationSound();
            }
        }
    } catch (e) {
        console.warn('Falha na verificação de mensagens:', e.message);
    }
}

// =============== CARREGAR DADOS ===============
async function loadAllData(userId) {
    if (!userId) return;
    await loadAllUsers(userId);
    await loadConversations(userId);
}

async function loadAllUsers(currentUserId) {
    try {
        const users = await databaseManager.getAllUsers(currentUserId);
        allUsers = users || [];
    } catch (e) {
        allUsers = [];
    }
}

async function loadConversations(userId) {
    if (!userId || !db) return;
    try {
        const { data } = await db
            .from('conversations')
            .select('*')
            .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
            .order('last_message_at', { ascending: false });
        conversations = data || [];
        renderConversationsList(conversations);
    } catch (e) {
        renderConversationsList([]);
    }
}

function renderConversationsList(convs) {
    const container = document.getElementById('usersList');
    if (!container) return;
    
    if (!convs || convs.length === 0) {
        container.innerHTML = `
            <div style="text-align:center;padding:60px 20px;color:#6b6b6b;">
                <div style="font-size:56px;margin-bottom:20px;opacity:0.8;">💬</div>
                <p style="font-size:16px;font-weight:500;color:#a0a0a0;">Nenhuma conversa ainda</p>
                <p style="font-size:13px;color:#525252;margin-top:8px;">Use a busca para encontrar usuários</p>
            </div>`;
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
    card.style.cssText = `
        cursor: pointer;
        border-left: 2px solid transparent;
        margin: 2px 8px;
        border-radius: 12px;
        transition: background 0.15s, border-left 0.15s;
    `;
    card.setAttribute('data-user-id', user.id);
    card.addEventListener('click', function() { selectUser(user, this); });
    card.addEventListener('mouseenter', () => {
        if (card !== selectedCardElement) card.style.background = '#1c1c1c';
    });
    card.addEventListener('mouseleave', () => {
        if (card !== selectedCardElement) card.style.background = '';
    });
    
    const roleColor = getRoleColor(user.role);
    const initials = getInitials(user.username);
    let lastMessage = '', lastTime = '';
    
    if (conversation?.last_message) {
        lastMessage = conversation.last_message.length > 30 
            ? conversation.last_message.substring(0,30) + '...' 
            : conversation.last_message;
        lastTime = formatTime(conversation.last_message_at);
    }
    
    card.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;">
            <div style="position:relative;width:46px;height:46px;flex-shrink:0;">
                <div style="
                    width:46px;height:46px;border-radius:50%;background:#1c1c1c;
                    display:flex;align-items:center;justify-content:center;
                    overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4);
                ">
                    ${user.avatar_url ? 
                        `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">` : 
                        `<span style="font-size:17px;color:#9ca3af;">${initials}</span>`
                    }
                </div>
                <span style="
                    position:absolute;bottom:-2px;right:-2px;
                    width:14px;height:14px;border-radius:50%;
                    background:${user.status==='online'?'#22c55e':'#4b5563'};
                    border:2px solid #111111;box-shadow:0 0 6px rgba(0,0,0,0.5);
                "></span>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:baseline;">
                    <span style="color:${roleColor};font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(user.username)}</span>
                    ${lastTime?`<span style="font-size:11px;color:#5c5c5c;flex-shrink:0;margin-left:8px;">${lastTime}</span>`:''}
                </div>
                ${lastMessage?`<div style="font-size:13px;color:#6b6b6b;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(lastMessage)}</div>`:''}
                ${user.role!=='user'?`<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;text-transform:uppercase;font-weight:600;background:${roleColor}20;color:${roleColor};margin-top:4px;">${user.role}</span>`:''}
            </div>
        </div>`;
    return card;
}

// =============== EVENTOS ===============
function setupEventListeners() {
    document.getElementById('userSearch')?.addEventListener('input', debounce(function(e) {
        const term = e.target.value.trim();
        term ? searchUsers(term) : renderConversationsList(conversations);
    }, 300));
    
    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
        msgInput.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
        msgInput.addEventListener('keydown', function(e) { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
        // Status de digitação
        msgInput.addEventListener('input', function() {
        sendTypingStatus();
        });
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

// =============== SELEÇÃO DE USUÁRIO ===============
async function selectUser(user, cardElement) {
    if (!user?.id || !currentUserId) return;
    console.log('👤 Selecionando:', user.username);
    currentConversationUser = user;
    
    const noChatSelected = document.getElementById('noChatSelected');
    const msgContainer = document.getElementById('messagesContainer');
    const inputContainer = document.getElementById('messageInputContainer');
    
    if (!msgContainer || !inputContainer) { console.error('Elementos essenciais ausentes'); return; }
    
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
    showUserInfo(user);
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
        if (!msgs?.length) {
            container.innerHTML = '<div style="text-align:center;padding:80px 40px;color:#525252;"><div style="font-size:52px;margin-bottom:16px;opacity:0.7;">💭</div><p style="font-size:15px;">Nenhuma mensagem</p></div>';
            return;
        }
        msgs.forEach(m => container.appendChild(createMessageElement(m, m.sender_id === currentUserId)));
        container.scrollTop = container.scrollHeight;
    } catch(e) { container.innerHTML = '<div style="text-align:center;padding:60px;color:#dc2626;">Erro ao carregar</div>'; }
}

function createMessageElement(msg, isOwn) {
    const div = document.createElement('div');
    // Adiciona classe para CSS funcionar
    div.className = 'message ' + (isOwn ? 'own' : 'other');
    div.dataset.messageId = msg.id;
    const time = formatTime(msg.created_at);
    const edited = msg.edited ? ' (editado)' : '';

    // Conteúdo da mensagem
    const bubble = document.createElement('div');
    bubble.innerHTML = `
        <div style="white-space: pre-wrap;">${escapeHtml(msg.content)}${edited}</div>
        <div class="meta">${time}</div>
    `;
    div.appendChild(bubble);

    // Botões de ação
    if (isOwn && isMessageEditable(msg.created_at) && !msg.edited) {
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        actions.innerHTML = `
            <button class="msg-action-btn" style="background:#1f1f1f;border:none;color:#9ca3af;padding:3px 10px;border-radius:12px;font-size:10px;cursor:pointer;">Editar</button>
            <button class="msg-action-btn" style="background:#1f1f1f;border:none;color:#9ca3af;padding:3px 10px;border-radius:12px;font-size:10px;cursor:pointer;">Excluir</button>`;
        actions.children[0].onclick = (e) => { e.stopPropagation(); showEditModal(msg); };
        actions.children[1].onclick = (e) => { e.stopPropagation(); confirmDelete(msg.id); };
        div.appendChild(actions);

        div.addEventListener('mouseenter', () => { actions.style.opacity = '1'; });
        div.addEventListener('mouseleave', () => { actions.style.opacity = '0'; });
    }

    return div;
}

// =============== ENVIO ===============
async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const content = input.value.trim();
    if (!content || !currentConversationUser) return;
    input.disabled = true;
    try {
        const msg = await databaseManager.sendMessage(currentUserId, currentConversationUser.id, content);
        if (msg) appendMessage(msg);
        input.value = ''; input.style.height = 'auto';
        setTimeout(() => loadConversations(currentUserId), 300);
    } catch(e) { showToast('Erro ao enviar', 'error'); }
    finally { input.disabled = false; input.focus(); }
}

function appendMessage(msg) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    const isEmpty = container.querySelector('div[style*="padding:80px"]') || container.querySelector('div[style*="padding:60px"]');
    if (isEmpty) container.innerHTML = '';
    container.appendChild(createMessageElement(msg, msg.sender_id === currentUserId));
    container.scrollTop = container.scrollHeight;
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
function showUserInfo(user) {
    if (!user) return;
    const panel = document.getElementById('infoPanel'), content = document.getElementById('infoPanelContent');
    if (!panel||!content) return;
    const rc = getRoleColor(user.role);
    content.innerHTML = `
        <div style="text-align:center;padding:30px 20px;">
            <div style="width:90px;height:90px;border-radius:50%;margin:0 auto 20px;background:#1c1c1c;display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                ${user.avatar_url?`<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">`:`<span style="font-size:34px;color:${rc};">${getInitials(user.username)}</span>`}
            </div>
            <h3 style="color:#f0f0f0;font-size:18px;font-weight:600;margin-bottom:6px;">${escapeHtml(user.username)}</h3>
            <div style="background:${rc}20;color:${rc};display:inline-block;padding:4px 14px;border-radius:20px;font-size:11px;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">${user.role==='admin'?'Admin':user.role==='moderator'?'Moderador':'Usuário'}</div>
            <div style="margin-top:28px;display:flex;align-items:center;justify-content:center;gap:8px;color:#9ca3af;font-size:13px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${user.status==='online'?'#22c55e':'#4b5563'};box-shadow:0 0 8px rgba(0,0,0,0.4);"></span>
                ${user.status==='online'?'Online agora':'Offline'}
            </div>
        </div>`;
    panel.style.display = 'block';
}

function closeInfoPanel() { document.getElementById('infoPanel').style.display = 'none'; }
function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); document.querySelector('.sidebar-overlay')?.classList.toggle('active'); }

async function handleLogout() {
    stopMessagePolling();
    stopTypingPolling();
    if (currentUserId) await updateMyStatus('offline');
    if (typingInterval) clearInterval(typingInterval);
    await sessionManager.logout();
    window.location.href = '/login/index.html';
}

function showProfileModal() {
    const user = sessionManager.getCurrentUser();
    if (!user) return;
    document.getElementById('profileModal').style.display = 'flex';
    document.getElementById('editUsername').value = user.username || '';
    document.getElementById('editNewPassword').value = '';
    document.getElementById('editCurrentPassword').value = '';
    if (user.avatar_url) document.getElementById('avatarPreview').innerHTML = `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">`;
}
function closeProfileModal() { document.getElementById('profileModal').style.display = 'none'; }

async function saveProfile() {
    const username = document.getElementById('editUsername').value.trim();
    const newPass = document.getElementById('editNewPassword').value;
    const currPass = document.getElementById('editCurrentPassword').value;
    if (!currPass) { showToast('Senha atual obrigatória', 'error'); return; }
    try {
        if (username && username !== sessionManager.getCurrentUser().username) await sessionManager.updateProfile({ username });
        if (newPass) await sessionManager.changePassword(currPass, newPass);
        showToast('Perfil atualizado', 'success');
        closeProfileModal();
        setTimeout(() => location.reload(), 1000);
    } catch(e) { showToast(e.message, 'error'); }
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showToast('Apenas imagens são permitidas', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast('Imagem muito grande (máximo 5MB)', 'error');
        return;
    }
    
    showToast('Enviando foto...', 'info');
    
    try {
        const user = sessionManager.getCurrentUser();
        const fileExt = file.name.split('.').pop().toLowerCase();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        // Tentar upload diretamente (sem verificar se o bucket existe)
        const { error: uploadError } = await db.storage
            .from('avatars')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type
            });
        
        if (uploadError) {
            console.error('Erro no upload:', uploadError);
            
            if (uploadError.message.includes('Bucket not found') || 
                uploadError.message.includes('not found')) {
                showToast(
                    'Bucket "avatars" não encontrado. Crie-o no painel do Supabase: Storage → New bucket → "avatars" (marcar como público).',
                    'error'
                );
            } else if (uploadError.message.includes('row-level security') || 
                       uploadError.message.includes('policy')) {
                showToast(
                    'Erro de permissão. Execute o SQL fornecido para criar as políticas de acesso público ao bucket "avatars".',
                    'error'
                );
            } else {
                showToast('Erro ao enviar: ' + uploadError.message, 'error');
            }
            return;
        }
        
        // Obter URL pública
        const { data: urlData } = db.storage
            .from('avatars')
            .getPublicUrl(fileName);
        
        const publicUrl = urlData?.publicUrl;
        if (!publicUrl) {
            showToast('Erro ao gerar URL da imagem', 'error');
            return;
        }
        
        // Atualizar perfil
        await sessionManager.updateProfile({ avatar_url: publicUrl });
        showToast('Foto atualizada!', 'success');
        setTimeout(() => location.reload(), 800);
        
    } catch (error) {
        console.error('Erro no upload:', error);
        showToast('Falha ao processar imagem', 'error');
    }
}

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
      await db.from('typing_status')
        .delete()
        .eq('user_id', currentUserId)
        .eq('contact_id', currentConversationUser.id);
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