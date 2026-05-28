// =============================================
// BIDJORCHAT – Chat Privado (vFinal)
// =============================================
let currentUser = null;
let allUsers = {};
let conversations = [];
let currentConversationUser = null;
let messagePollingInterval = null;
let lastMessageCheck = new Date().toISOString();
let typingTimer = null;
let typingInterval = null;
let replyToMessage = null;

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Iniciando chat privado...');
  await waitForSupabase();

  if (!sessionManager.isAuthenticated() || !(await sessionManager.validateSession())) {
    window.location.href = '/login/';
    return;
  }

  currentUser = sessionManager.getCurrentUser();
  if (!currentUser?.id || currentUser.is_banned) {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#080808;color:#ef4444;font-size:20px;">🚫 ACESSO NEGADO</div>';
    return;
  }

  initializeUI(currentUser);
  await updateMyStatus('online');
  await loadAllUsers();
  setupPrivateRealtime(); // 🔥 adicionado
  await loadConversations();

  // Abrir conversa via link (?user=ID)
  const urlParams = new URLSearchParams(window.location.search);
  const targetUserId = urlParams.get('user');
  if (targetUserId) {
    setTimeout(() => {
      const targetUser = allUsers[targetUserId];
      if (targetUser) {
        selectUser(targetUser, null);
        window.history.replaceState({}, document.title, '/chat/index.html');
      }
    }, 500);
  }

  startMessagePolling();
  typingInterval = setInterval(checkTypingStatus, 2000);
  setupEventListeners();

  document.getElementById('btnBackToContacts').style.display = 'none';

  const msgContainer = document.getElementById('messagesContainer');
  const scrollBtn = document.getElementById('scrollToBottomBtn');
  if (msgContainer && scrollBtn) {
    msgContainer.addEventListener('scroll', toggleScrollButton);
    scrollBtn.addEventListener('click', scrollToBottom);
  }

  window.addEventListener('beforeunload', async () => {
    stopMessagePolling();
    if (typingInterval) clearInterval(typingInterval);
    if (currentUser) {
      await db.from('users').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    }
  });
});

async function waitForSupabase() {
  let i = 0;
  while (!db && i < 50) { await new Promise(r => setTimeout(r, 100)); i++; }
}

async function updateMyStatus(status) {
  try { await db.from('users').update({ status, last_seen: new Date().toISOString() }).eq('id', currentUser.id); } catch(e) {}
}

function initializeUI(user) {
  const avatarEl = document.getElementById('currentUserAvatar');
  if (avatarEl) {
    if (user.avatar_url) {
      avatarEl.innerHTML = `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      document.getElementById('currentUserInitials').textContent = getInitials(user.username);
    }
  }
  document.getElementById('currentUsername').textContent = user.username;
  const roleEl = document.getElementById('currentUserRole');
  if (roleEl) {
    roleEl.textContent = user.role.toUpperCase();
    roleEl.style.color = getRoleColor(user.role);
  }
  if (['admin','moderator','supervisor'].includes(user.role)) {
    const btn = document.getElementById('btnAdminPanel');
    if (btn) btn.style.display = 'block';
  }
}

function getRoleColor(role) {
  const colors = { admin: '#ef4444', moderator: '#8b5cf6', supervisor: '#f59e0b', user: '#9ca3af' };
  return colors[role] || colors.user;
}

// ========== CARREGAR DADOS ==========
async function loadAllUsers() {
  try {
    const users = await databaseManager.getAllUsers(currentUser.id);
    allUsers = {};
    (users || []).forEach(u => { allUsers[u.id] = u; });
  } catch(e) { allUsers = {}; }
}

async function loadConversations() {
  try {
    const { data } = await db
      .from('conversations')
      .select('*')
      .or(`user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`)
      .order('last_message_at', { ascending: false });
    conversations = data || [];

    for (let conv of conversations) {
      const otherId = conv.user1_id === currentUser.id ? conv.user2_id : conv.user1_id;
      const { count } = await db
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', otherId)
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false);
      conv._unread = count || 0;
    }
    renderConversationsList(conversations);
  } catch(e) { renderConversationsList([]); }
}

function renderConversationsList(convs) {
  const container = document.getElementById('usersList');
  if (!container) return;

  if (!convs || convs.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#525252;">Nenhuma conversa ainda</div>';
    return;
  }

  container.innerHTML = '';
  convs.forEach(conv => {
    const otherId = conv.user1_id === currentUser.id ? conv.user2_id : conv.user1_id;
    const user = allUsers[otherId];
    if (!user) return;

    const roleColor = getRoleColor(user.role);
    const div = document.createElement('div');
    div.className = 'user-list-item';
    div.innerHTML = `
      <div style="position:relative;width:46px;height:46px;flex-shrink:0;">
        <div style="width:46px;height:46px;border-radius:50%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">` : `<span>${getInitials(user.username)}</span>`}
        </div>
        <span style="position:absolute;bottom:-2px;right:-2px;width:14px;height:14px;border-radius:50%;background:${user.status==='online'?'#22c55e':'#525252'};border:2px solid #0f0f0f;"></span>
      </div>
      <div class="user-details">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="user-name">${escapeHtml(user.username)}</span>
          <span class="user-role-tag" style="background:${roleColor}20;color:${roleColor};">${user.role}</span>
        </div>
        <div class="last-message">${escapeHtml(conv.last_message || '')}</div>
      </div>
      ${conv._unread ? `<span style="background:#7c3aed;color:#fff;border-radius:12px;padding:2px 8px;font-size:11px;">${conv._unread}</span>` : ''}
    `;
    div.addEventListener('click', () => selectUser(user, div));
    container.appendChild(div);
  });
}

// ========== SELEÇÃO DE USUÁRIO ==========
async function selectUser(user, cardElement) {
  if (!user?.id) return;
  currentConversationUser = user;

  document.getElementById('noChatSelected').style.display = 'none';
  document.getElementById('messagesContainer').style.display = 'flex';
  document.getElementById('messageInputContainer').style.display = 'flex';

  const roleColor = getRoleColor(user.role);
  const infoBar = document.getElementById('userInfoBar');
  infoBar.innerHTML = `
    <div class="info-avatar">
      ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">` : `<span>${getInitials(user.username)}</span>`}
    </div>
    <div class="info-text">
      <div class="info-name" style="color:${roleColor};">${escapeHtml(user.username)}</div>
      <div class="info-details">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${user.status==='online'?'#22c55e':'#525252'};"></span>
        ${user.status === 'online' ? 'Online' : 'Offline'}
        <span class="info-role-tag" style="background:${roleColor}20;color:${roleColor};">${user.role}</span>
      </div>
      ${user.status_message ? `<div style="font-size:12px;color:#8b5cf6;margin-top:2px;font-style:italic;">${escapeHtml(user.status_message)}</div>` : ''}
    </div>
  `;
  infoBar.style.display = 'flex';

  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('chat-active');
    document.getElementById('btnBackToContacts').style.display = 'block';
  }

  await loadMessages(user.id);

  try {
    await db.from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('sender_id', user.id)
      .eq('receiver_id', currentUser.id)
      .eq('is_read', false);
  } catch(e) {}

  await loadConversations();
}

async function loadMessages(otherUserId) {
  const container = document.getElementById('messagesContainer');
  container.innerHTML = '<div style="text-align:center;padding:60px;color:#525252;">Carregando...</div>';

  try {
    const msgs = await databaseManager.getMessages(currentUser.id, otherUserId);
    container.innerHTML = '';

    if (!msgs || msgs.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:80px;color:#525252;">Nenhuma mensagem</div>';
      return;
    }

    msgs.forEach(msg => appendMessage(msg, false));
    if (isNearBottom(container)) container.scrollTop = container.scrollHeight;
    toggleScrollButton();
  } catch(e) {
    container.innerHTML = '<div style="text-align:center;padding:60px;color:#dc2626;">Erro ao carregar mensagens</div>';
  }
}

// ========== MENSAGENS ==========
function appendMessage(msg, scroll = true) {
  const container = document.getElementById('messagesContainer');
  const isOwn = msg.sender_id === currentUser.id;

  const div = document.createElement('div');
  div.className = 'message ' + (isOwn ? 'own' : 'other');
  div.setAttribute('data-message-id', msg.id);

  let replyRefHTML = '';
  if (msg.reply_to) {
    const repliedUsername = msg.reply_to.username || 'Usuário';
    const repliedContent = msg.reply_to.content || '';
    replyRefHTML = `
      <div class="geral-message-reply-ref" onclick="scrollToMessage('${msg.reply_to.id}')">
        <span class="reply-author">${escapeHtml(repliedUsername)}</span>
        <span class="reply-content">${escapeHtml(repliedContent.substring(0, 50))}</span>
      </div>
    `;
  }

  div.innerHTML = `
    ${replyRefHTML}
    <div style="white-space:pre-wrap;word-wrap:break-word;">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>
    <div class="meta">${formatTime(msg.created_at)}</div>
  `;

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'message-actions';
  actionsDiv.innerHTML = '<button class="msg-action-btn reply-btn">↩ Responder</button>';
  actionsDiv.querySelector('.reply-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    replyToMessage = {
      id: msg.id,
      username: isOwn ? currentUser.username : (currentConversationUser?.username || 'Usuário'),
      content: msg.content,
      userId: msg.sender_id
    };
    renderReplyPreview();
    document.getElementById('messageInput')?.focus();
  });
  div.appendChild(actionsDiv);

  container.appendChild(div);

  if (scroll && isNearBottom(container)) container.scrollTop = container.scrollHeight;
  toggleScrollButton();
}


let privateChannel = null;

function setupPrivateRealtime() {
    if (privateChannel) {
        db.removeChannel(privateChannel);
    }
    
    privateChannel = db
        .channel('private-messages')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
                const newMsg = payload.new;
                // Ignora mensagem enviada por mim mesmo
                if (newMsg.sender_id === currentUser.id) return;
                
                // Só notifica se a mensagem é para o usuário atual
                if (newMsg.receiver_id !== currentUser.id) return;
                
                // Obtém dados do remetente
                const sender = allUsers[newMsg.sender_id];
                if (!sender) return;
                
                // Só notifica se a página estiver em segundo plano
                if (document.hidden) {
                    const senderName = sender.username || 'Alguém';
                    let senderAvatar = sender.avatar_url;
                    // Garante URL absoluta
                    if (senderAvatar && senderAvatar.startsWith('/')) {
                        senderAvatar = window.location.origin + senderAvatar;
                    }
                    
                    showNotification(
                        `💬 Nova mensagem de ${senderName}`,
                        newMsg.content.length > 100 ? newMsg.content.substring(0, 100) + '...' : newMsg.content,
                        senderAvatar,
                        { url: `/chat/index.html?user=${newMsg.sender_id}` }
                    );
                }
            }
        )
        .subscribe();
}


async function sendMessage() {
  const input = document.getElementById('messageInput');
  if (!input) return;
  const content = input.value.trim();
  if (!content || !currentConversationUser) { input.focus(); return; }

  input.disabled = true;
  try {
    const replyData = replyToMessage ? {
      id: replyToMessage.id,
      user_id: replyToMessage.userId,
      username: replyToMessage.username,
      content: replyToMessage.content
    } : null;

    const msg = await databaseManager.sendMessage(currentUser.id, currentConversationUser.id, content, replyData);
    if (replyToMessage) cancelReply();
    if (msg) appendMessage(msg);

    input.value = '';
    input.style.height = 'auto';
    await loadConversations();
  } catch(e) {
    showToast('Erro ao enviar mensagem', 'error');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

// ========== ROLAGEM ==========
function isNearBottom(container, threshold = 150) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

function toggleScrollButton() {
  const container = document.getElementById('messagesContainer');
  const btn = document.getElementById('scrollToBottomBtn');
  if (!container || !btn) return;
  if (isNearBottom(container)) {
    btn.classList.remove('visible');
  } else {
    btn.classList.add('visible');
  }
}

function scrollToBottom() {
  const container = document.getElementById('messagesContainer');
  if (container) {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }
}

// ========== NAVEGAÇÃO MOBILE ==========
function backToContacts() {
  if (window.innerWidth > 768) return;
  document.getElementById('sidebar').classList.remove('chat-active');
  document.getElementById('messagesContainer').style.display = 'none';
  document.getElementById('messageInputContainer').style.display = 'none';
  document.getElementById('userInfoBar').style.display = 'none';
  document.getElementById('noChatSelected').style.display = 'flex';
  document.getElementById('btnBackToContacts').style.display = 'none';
  currentConversationUser = null;
}

// ========== EVENTOS ==========
function setupEventListeners() {
  document.getElementById('userSearch').addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    if (!term) {
      renderConversationsList(conversations);
      return;
    }
    const filtered = Object.values(allUsers).filter(u => u.username.toLowerCase().includes(term));
    const container = document.getElementById('usersList');
    container.innerHTML = '';
    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:#525252;">Nenhum usuário encontrado</div>';
      return;
    }
    filtered.forEach(user => {
      const roleColor = getRoleColor(user.role);
      const div = document.createElement('div');
      div.className = 'user-list-item';
      div.innerHTML = `
        <div style="width:46px;height:46px;border-radius:50%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
          ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">` : `<span>${getInitials(user.username)}</span>`}
        </div>
        <div style="flex:1;display:flex;align-items:center;gap:6px;">
          <span style="font-weight:600;text-transform:uppercase;">${escapeHtml(user.username)}</span>
          <span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;text-transform:uppercase;font-weight:600;background:${roleColor}20;color:${roleColor};">${user.role}</span>
        </div>
      `;
      div.addEventListener('click', () => selectUser(user, div));
      container.appendChild(div);
    });
  });

  const msgInput = document.getElementById('messageInput');
  if (msgInput) {
    msgInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      sendTypingStatus();
    });

    msgInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
}

// ========== TYPING STATUS ==========
async function sendTypingStatus() {
  if (!currentConversationUser || !currentUser) return;
  clearTimeout(typingTimer);
  try {
    await db.from('typing_status').upsert({
      user_id: currentUser.id,
      contact_id: currentConversationUser.id,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,contact_id' });
  } catch(e) {}

  typingTimer = setTimeout(async () => {
    try {
      await db.from('typing_status').delete().eq('user_id', currentUser.id).eq('contact_id', currentConversationUser.id);
    } catch(e) {}
  }, 3000);
}

async function checkTypingStatus() {
  if (!currentConversationUser || !currentUser) {
    document.getElementById('typingIndicator').style.display = 'none';
    return;
  }

  try {
    const { data } = await db.from('typing_status')
      .select('*')
      .eq('user_id', currentConversationUser.id)
      .eq('contact_id', currentUser.id)
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

// ========== PERFIL ==========
function showProfileModal() {
  const user = currentUser;
  if (!user) return;
  document.getElementById('profileModal').style.display = 'flex';
  document.getElementById('editUsername').value = user.username || '';
  document.getElementById('editStatusMessage').value = user.status_message || '';
  document.getElementById('editNewPassword').value = '';
  document.getElementById('editCurrentPassword').value = '';
  if (user.avatar_url) {
    document.getElementById('avatarPreview').innerHTML = `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">`;
  }
}

function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
}

async function saveProfile() {
  const newUsername = document.getElementById('editUsername').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const statusMessage = document.getElementById('editStatusMessage').value.trim();
  const newPass = document.getElementById('editNewPassword').value;
  const currPass = document.getElementById('editCurrentPassword').value;

  if (!newUsername || newUsername.length < 3) {
    showToast('Username deve ter pelo menos 3 caracteres (apenas letras, números e _)', 'error');
    return;
  }
  if (!currPass) {
    showToast('Senha atual é obrigatória', 'error');
    return;
  }

  try {
    if (newUsername !== currentUser.username) {
      await sessionManager.updateProfile({ username: newUsername });
    }
    if (newPass) {
      await sessionManager.changePassword(currPass, newPass);
    }
    await sessionManager.updateProfile({ status_message: statusMessage });
    showToast('Perfil atualizado!', 'success');
    closeProfileModal();
    setTimeout(() => location.reload(), 1000);
  } catch(e) {
    showToast(e.message, 'error');
  }
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Apenas imagens são permitidas', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Imagem muito grande (máx. 5MB)', 'error');
    return;
  }

  showToast('Enviando foto...', 'info');
  try {
    const fileExt = file.name.split('.').pop().toLowerCase();
    const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await db.storage.from('avatars').upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type
    });

    if (uploadError) throw uploadError;

    const { data: urlData } = db.storage.from('avatars').getPublicUrl(fileName);
    const publicUrl = urlData?.publicUrl;
    if (!publicUrl) throw new Error('URL não gerada');

    await sessionManager.updateProfile({ avatar_url: publicUrl });
    showToast('Foto atualizada!', 'success');
    setTimeout(() => location.reload(), 800);
  } catch(error) {
    showToast('Falha ao processar imagem: ' + error.message, 'error');
  }
}

// ========== LOGOUT ==========
async function handleLogout() {
  stopMessagePolling();
  if (typingInterval) clearInterval(typingInterval);
  if (currentUser) {
    await db.from('users').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', currentUser.id);
  }
  await sessionManager.logout();
  window.location.href = '/login/';
}

// ========== POLLING ==========
function startMessagePolling() {
  messagePollingInterval = setInterval(checkNewMessages, 1500);
}

function stopMessagePolling() {
  if (messagePollingInterval) {
    clearInterval(messagePollingInterval);
    messagePollingInterval = null;
  }
}

async function checkNewMessages() {
  if (!currentConversationUser || !currentUser) return;

  try {
    const { data } = await db.from('messages')
      .select('*')
      .eq('sender_id', currentConversationUser.id)
      .eq('receiver_id', currentUser.id)
      .gt('created_at', lastMessageCheck)
      .order('created_at', { ascending: true });

    if (data && data.length > 0) {
      data.forEach(msg => appendMessage(msg));
      lastMessageCheck = data[data.length - 1].created_at;
      await db.from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', data.map(m => m.id));
      await loadConversations();
    }
  } catch(e) {}
}

// ========== REPLY ==========
function cancelReply() {
  replyToMessage = null;
  const existing = document.querySelector('.reply-preview');
  if (existing) existing.remove();
}

function renderReplyPreview() {
  // Remove qualquer barra anterior
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

  // Insere antes do container de input
  const inputContainer = document.querySelector('.message-input-container');
  if (inputContainer && inputContainer.parentNode) {
    inputContainer.parentNode.insertBefore(preview, inputContainer);
  }
}

function scrollToMessage(messageId) {
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.background = 'rgba(139, 92, 246, 0.2)';
    setTimeout(() => el.style.background = '', 1500);
  }
}