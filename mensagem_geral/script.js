// BIDJORCHAT - Chat Geral
let currentUser = null;
let messagePollingInterval = null;
let lastMessageCheck = new Date().toISOString();
let allUsers = {};
let replyToMessage = null; // { id, username, content }
const REACTIONS = ['😂', '😡', '👍', '👎', '❤️', '💰'];
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'];
let latestAnnouncementId = null;
let announcementRealtimeChannel = null;
let currentPinnedMessage = null;
let geralChannel = null;
let pinnedChannel = null;
let onlineInterval = null;
let memeCommands = {};      
let buzzCooldown = {};         // Será preenchido do banco
// Container de sugestões de menção
const mentionSuggestions = document.createElement('div');
mentionSuggestions.id = 'mentionSuggestions';
mentionSuggestions.className = 'mention-suggestions';
const inputContainer = document.querySelector('.geral-input-container');
if (inputContainer) inputContainer.appendChild(mentionSuggestions);
let mentionFilter = '';
let mentionSelectedIndex = 0;




function linkifyAndEscape(text) {
    if (!text) return '';
    
    // Primeiro, identifica e marca as URLs com um placeholder único
    const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
    const placeholders = [];
    let processedText = text.replace(urlPattern, (url) => {
        const id = `__URL_${placeholders.length}__`;
        placeholders.push(url);
        return id;
    });
    
    // Agora escapa o HTML do texto restante
    let escapedText = escapeHtml(processedText);
    
    // Restaura as URLs e as transforma em links seguros
    placeholders.forEach((url, index) => {
        const id = `__URL_${index}__`;
        let cleanUrl = url.replace(/&amp;/g, '&'); // corrige &amp; se houver
        let href = cleanUrl;
        if (!href.startsWith('http')) {
            href = 'https://' + href;
        }
        const link = `<a href="${href}" target="_blank" rel="noopener noreferrer" class="linkified">${cleanUrl}</a>`;
        escapedText = escapedText.replace(id, link);
    });
    
    return escapedText;
}

// ========== AUTOCOMPLETE DE COMANDOS ==========
const commandList = [
    { cmd: '/ajuda', desc: 'Mostra esta ajuda' },
    { cmd: '/help', desc: 'Mostra esta ajuda' },
    { cmd: '/avatar', desc: 'Ver perfil (seu ou de @usuario)' },
    { cmd: '/dado', desc: 'Rola um dado (padrão 6 lados)' },
    { cmd: '/caracoroa', desc: 'Cara ou coroa' },
    { cmd: '/simounao', desc: 'Resposta mágica (Sim/Não)' },
    { cmd: '/escolha', desc: 'Escolhe aleatoriamente uma opção' },
    { cmd: '/tweet', desc: 'Publica um tweet estilizado' },
    { cmd: '/give', desc: 'Dá um presente simbólico' },
    { cmd: '/sondagem', desc: 'Cria enquete com várias opções' },
    { cmd: '/vote', desc: 'Cria enquete Sim/Não' },
    { cmd: '/gif', desc: 'Envia GIF cadastrado' },
    { cmd: '/hora', desc: 'Data/hora atual' },
    { cmd: '/ranking', desc: 'Exibe ranking semanal (modal)' },
    { cmd: '/rankingsend', desc: 'Envia ranking no chat (admin/supervisor)' },
    { cmd: '/clear_sys', desc: 'Apaga mensagens do robô (admin/supervisor)' },
    { cmd: '/clear', desc: 'Apaga TODO o chat (admin/supervisor)' },
    { cmd: '/addgif', desc: 'Cadastra novo meme (admin/supervisor/moderador)' },
    // 🆕 NOVOS COMANDOS
    { cmd: '/crypto', desc: 'Cotação de criptomoeda (ex: /crypto btc)' },
    { cmd: '/dolar', desc: 'Cotação do dólar comercial' },
    { cmd: '/quote', desc: 'Frase motivacional aleatória' },
    { cmd: '/rps', desc: 'Jogue pedra, papel ou tesoura (ex: /rps pedra)' },
    { cmd: '/calc', desc: 'Use matemática (ex: /calc 2 semanas para dias, /calc 10% de 200'}
];

let activeSuggestions = false;
let selectedSuggestionIndex = -1;

function showCommandSuggestions(inputElement, filterText) {
    const container = inputElement.parentElement;
    let suggestionsDiv = document.getElementById('cmdSuggestions');
    if (!suggestionsDiv) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = 'cmdSuggestions';
        suggestionsDiv.className = 'cmd-suggestions';
        container.style.position = 'relative';
        container.appendChild(suggestionsDiv);
    }
    const filtered = commandList.filter(c => c.cmd.toLowerCase().startsWith(filterText.toLowerCase()));
    if (filtered.length === 0) {
        suggestionsDiv.style.display = 'none';
        return;
    }
    suggestionsDiv.style.display = 'block';
    suggestionsDiv.innerHTML = '';
    filtered.forEach((cmdObj, idx) => {
        const item = document.createElement('div');
        item.className = 'cmd-suggestion-item';
        if (idx === selectedSuggestionIndex) item.classList.add('selected');
        item.innerHTML = `<span class="cmd-name">${cmdObj.cmd}</span><span class="cmd-desc">${cmdObj.desc}</span>`;
        item.onclick = () => {
            inputElement.value = cmdObj.cmd + ' ';
            suggestionsDiv.style.display = 'none';
            inputElement.focus();
            activeSuggestions = false;
            selectedSuggestionIndex = -1;
        };
        suggestionsDiv.appendChild(item);
    });
}

function hideCommandSuggestions() {
    const div = document.getElementById('cmdSuggestions');
    if (div) div.style.display = 'none';
    activeSuggestions = false;
    selectedSuggestionIndex = -1;
}


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

    setupRealtimeSubscriptions();

    await loadPinnedMessage();

    // Iniciar polling
    startPolling();

    // Iniciar o indicador de último visto
    startLastSeenUpdater();

    // Eventos
    setupEventListeners();

    // ========== PAINEL DE GIFS ==========
    // ========== PAINEL DE GIFS COM PESQUISA ==========
const gifPickerPanel = document.createElement('div');
gifPickerPanel.id = 'gifPickerPanel';
gifPickerPanel.className = 'gif-picker-panel';
gifPickerPanel.innerHTML = `
    <div class="gif-picker-search">
        <input type="text" id="gifSearchInput" placeholder="🔍 Pesquisar GIF... (ex: meme, risada, etc)" autocomplete="off">
    </div>
    <div class="gif-picker-grid" id="gifPickerGrid"></div>
`;
const inputContainerGif = document.querySelector('.geral-input-container');
if (inputContainerGif) inputContainerGif.appendChild(gifPickerPanel);

const gifBtn = document.getElementById('gifPickerBtn');
const gifGrid = document.getElementById('gifPickerGrid');
const searchInput = document.getElementById('gifSearchInput');

function renderGifPicker(filterText = '') {
    const gifGrid = document.getElementById('gifPickerGrid');
    if (!gifGrid) return;
    
    // FORÇA O LAYOUT COM ESTILO INLINE
    gifGrid.style.display = 'grid';
    gifGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    gifGrid.style.gap = '10px';
    gifGrid.style.padding = '12px';
    gifGrid.style.maxHeight = '320px';
    gifGrid.style.overflowY = 'auto';
    gifGrid.style.backgroundColor = '#1e1e2a';
    gifGrid.style.borderRadius = '0 0 20px 20px';
    gifGrid.style.boxSizing = 'border-box';
    
    gifGrid.innerHTML = '';
    const commands = Object.entries(memeCommands);
    let filteredCommands = commands;
    
    if (filterText.trim() !== '') {
        const lowerFilter = filterText.trim().toLowerCase();
        filteredCommands = commands.filter(([cmd]) => 
            cmd.toLowerCase().includes(lowerFilter) || 
            cmd.substring(1).toLowerCase().includes(lowerFilter)
        );
    }
    
    if (filteredCommands.length === 0) {
        gifGrid.innerHTML = '<div class="gif-picker-empty" style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa;">Nenhum GIF encontrado 😢</div>';
        return;
    }
    
    filteredCommands.forEach(([cmd, url]) => {
        const item = document.createElement('div');
        item.className = 'gif-picker-item';
        // ESTILO INLINE NO ITEM
        item.style.aspectRatio = '1 / 1';
        item.style.cursor = 'pointer';
        item.style.borderRadius = '12px';
        item.style.overflow = 'hidden';
        item.style.backgroundColor = '#0a0a0c';
        item.style.border = '1px solid #2a2a3a';
        item.style.transition = 'transform 0.1s';
        item.title = cmd;
        item.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(cmd)}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy" 
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Crect fill=%22%23333%22 width=%2260%22 height=%2260%22/%3E%3Ctext x=%2230%22 y=%2235%22 fill=%22%23ccc%22 text-anchor=%22middle%22 font-size=%2212%22%3E?%3C/text%3E%3C/svg%3E';">`;
        item.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const input = document.getElementById('geralMessageInput');
            const cmdName = cmd.substring(1);
            const gifCommand = `/gif ${cmdName}`;
            const cursorPos = input.selectionStart;
            const textBefore = input.value.substring(0, cursorPos);
            const textAfter = input.value.substring(cursorPos);
            input.value = textBefore + gifCommand + ' ' + textAfter;
            input.selectionStart = input.selectionEnd = cursorPos + gifCommand.length + 1;
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('gifPickerPanel').classList.remove('open');
            document.getElementById('gifSearchInput').value = '';
        });
        // Hover com JS (opcional)
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'scale(1.02)';
            item.style.borderColor = '#8b5cf6';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'scale(1)';
            item.style.borderColor = '#2a2a3a';
        });
        gifGrid.appendChild(item);
    });
}

// Evento de pesquisa em tempo real
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        renderGifPicker(e.target.value);
    });
}

// Abrir/fechar painel
if (gifBtn) {
    gifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (gifPickerPanel.classList.contains('open')) {
            gifPickerPanel.classList.remove('open');
            searchInput.value = ''; // limpa ao fechar
            return;
        }
        renderGifPicker(''); // carrega todos os GIFs
        gifPickerPanel.classList.add('open');
        searchInput.focus(); // foca na pesquisa
    });
}

// Fechar ao clicar fora
document.addEventListener('click', (e) => {
    if (!gifPickerPanel.contains(e.target) && e.target !== gifBtn) {
        gifPickerPanel.classList.remove('open');
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gifPickerPanel.classList.contains('open')) {
        gifPickerPanel.classList.remove('open');
    }
});

    document.addEventListener('click', (e) => {
    if (!gifPickerPanel.contains(e.target) && e.target !== gifBtn) {
        gifPickerPanel.classList.remove('open');
    }
    });
    document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gifPickerPanel.classList.contains('open')) {
        gifPickerPanel.classList.remove('open');
    }
    });


    

    startOnlineCounter();


    startAnnouncementCheck();
    
    window.addEventListener('beforeunload', async () => {
        if (rateLimitTimerInterval) clearInterval(rateLimitTimerInterval);
        stopPolling();
        stopOnlineCounter();
        if (currentUser) {
            await db.from('users').update({ status: 'offline', last_seen: new Date().toISOString() }).eq('id', currentUser.id);
        }
    });


      // Botão de rolagem para baixo
    const messagesContainer = document.getElementById('geralMessages');
    const scrollBtn = document.getElementById('scrollToBottomBtn');
    
    if (messagesContainer && scrollBtn) {
        messagesContainer.addEventListener('scroll', toggleScrollButton);
        scrollBtn.addEventListener('click', scrollToBottom);
        toggleScrollButton(); // estado inicial
    }

    // Pedir permissão de notificação após login
    if (Notification.permission === 'default') {
        // Exibe um botão flutuante suave
        const notifyPrompt = document.createElement('div');
        notifyPrompt.className = 'notify-prompt';
        notifyPrompt.innerHTML = `
            <div class="notify-prompt-content">
                <span>🔔 Ativar notificações de menção?</span>
                <button id="enableNotifyBtn">Sim</button>
                <button id="dismissNotifyBtn">Agora não</button>
            </div>
        `;
        document.body.appendChild(notifyPrompt);
        
        document.getElementById('enableNotifyBtn')?.addEventListener('click', async () => {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                showToast('Notificações ativadas!', 'success');
            } else {
                showToast('Você bloqueou notificações. Altere nas configurações do navegador.', 'error');
            }
            notifyPrompt.remove();
        });
        document.getElementById('dismissNotifyBtn')?.addEventListener('click', () => {
            notifyPrompt.remove();
        });
    }
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
        const { data: messages, error } = await db
            .from('geral_messages')
            .select('*')
            .eq('deleted', false)        // 🔥 FILTRA MENSAGENS NÃO DELETADAS
            .order('created_at', { ascending: true })
            .limit(100);
        
        if (error) throw error;
        
        container.innerHTML = '';
        
        if (!messages || messages.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:#525252;">Nenhuma mensagem ainda. Seja o primeiro!</div>';
            return;
        }
        
        messages.forEach(msg => renderMessage(msg));
        if (isNearBottom(container)) {
            container.scrollTop = container.scrollHeight;
        }
        toggleScrollButton();
        
        if (messages.length > 0) {
            lastMessageCheck = messages[messages.length - 1].created_at;
        }
    } catch (e) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Erro ao carregar</div>';
    }
}


// ==================== 2. createMessageDiv (sem o bloco de mensagem excluída) ====================
function createMessageDiv(msg) {
    const user = allUsers[msg.user_id] || { username: 'Desconhecido', role: 'user', avatar_url: null };
    const isOwn = msg.user_id === currentUser.id;
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

    // Mensagem do sistema
    if (msg.is_system || msg.user_id === SYSTEM_USER_ID || user.id === SYSTEM_USER_ID) {
        const div = document.createElement('div');
        div.className = 'geral-message geral-message-system';
        div.id = `msg-${msg.id}`;
        let formattedContent = msg.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/__(.*?)__/g, '<u>$1</u>')
            .replace(/~~(.*?)~~/g, '<del>$1</del>')
            .replace(/\n/g, '<br>');
        div.innerHTML = `
            <div class="geral-message-avatar">🤖</div>
            <div class="geral-message-content">
                <div class="geral-message-header">
                    <span class="geral-message-username" style="color:#f59e0b;">🤖 Sistema</span>
                    <span class="geral-message-time">${formatTime(msg.created_at)}</span>
                </div>
                <div class="geral-message-text">${formattedContent}</div>
            </div>
        `;
        return div;
    }

    // Permissões
    const isCurrentAdmin = currentUser.role === 'admin';
    const isCurrentModerator = currentUser.role === 'moderator';
    const isCurrentSupervisor = currentUser.role === 'supervisor';
    let canEdit = false, canDelete = false;

    if (isCurrentAdmin) {
        canEdit = !msg.edited || isMessageEditable(msg.created_at);
        canDelete = true;
    } else if (isCurrentSupervisor) {
        if (user.role === 'user' || isOwn) {
            canEdit = !msg.edited || isMessageEditable(msg.created_at);
            canDelete = true;
        }
    } else if (isCurrentModerator) {
        if (user.role === 'user' || isOwn) {
            canEdit = !msg.edited || isMessageEditable(msg.created_at);
            canDelete = true;
        }
    } else {
        if (isOwn) {
            canEdit = !msg.edited || isMessageEditable(msg.created_at);
            canDelete = true;
        }
    }

    const canPin = ['admin', 'supervisor', 'moderator'].includes(currentUser.role);
    const roleColor = getRoleColor(user.role);
    const div = document.createElement('div');
    div.className = 'geral-message' + (isOwn ? ' geral-message-own' : '');
    div.id = `msg-${msg.id}`;
    div.dataset.messageId = msg.id;

    // Resposta (reply)
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

    // Botões de ação
    let actionsHTML = '';
    if (canEdit || canDelete || canPin) {
        actionsHTML = `<div class="geral-message-actions">`;
        if (canPin) actionsHTML += `<button class="msg-action-btn pin-btn" onclick="event.stopPropagation(); togglePinMessage('${msg.id}')">📌 Fixar</button>`;
        if (canEdit) actionsHTML += `<button class="msg-action-btn edit-btn" onclick="event.stopPropagation(); showEditGeralModal('${msg.id}', '${escapeHtml(msg.content).replace(/'/g, "\\'")}')">Editar</button>`;
        if (canDelete) actionsHTML += `<button class="msg-action-btn delete-btn" onclick="event.stopPropagation(); confirmDeleteGeralMessage('${msg.id}')">Excluir</button>`;
        actionsHTML += `</div>`;
    }

    // Conteúdo (GIF ou texto)
    let messageHtml = '';
    const trimmedContent = msg.content.trim();
    const memeUrl = memeCommands[trimmedContent];
    if (memeUrl) {
        messageHtml = `<img src="${memeUrl}" alt="meme" class="meme-gif" loading="lazy" onclick="window.open(this.src)">`;
    } else {
        let processedContent = linkifyAndEscape(msg.content);
        processedContent = processedContent.replace(/@([a-z0-9_]+)/gi, (match, username) => {
            const userExists = Object.values(allUsers).some(u => u.username.toLowerCase() === username.toLowerCase());
            if (!userExists) return match;
            const isMentioningMe = username.toLowerCase() === currentUser.username.toLowerCase();
            const extraClass = isMentioningMe ? ' mention-self' : '';
            return `<span class="mention${extraClass}" data-username="${username}" onclick="showUserProfileByUsername('${username}')">@${username}</span>`;
        });
        messageHtml = formatMessageText(processedContent);
    }
    const editedMark = msg.edited ? ' <span class="edited-mark">(editado)</span>' : '';

    div.innerHTML = `
        <div class="geral-message-avatar" onclick="showUserProfile('${user.id || msg.user_id}')">
            ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}">` : getInitials(user.username || 'U')}
        </div>
        <div class="geral-message-content" style="position: relative;">
            <div class="geral-message-header">
                <span class="geral-message-username" style="color:${roleColor}" onclick="showUserProfile('${user.id || msg.user_id}')">${escapeHtml(user.username || 'Usuário')}</span>
                ${user.role !== 'user' ? `<span class="geral-message-role" style="background:${roleColor}20;color:${roleColor}">${user.role}</span>` : ''}
                <span class="geral-message-time">${formatTime(msg.created_at)}</span>
            </div>
            ${replyRefHTML}
            <div class="geral-message-text">${messageHtml}${editedMark}</div>
            <div class="message-reactions" id="reactions-${msg.id}"></div>
            <div class="geral-message-footer">
                <button class="geral-message-reply-btn" onclick="event.stopPropagation(); replyTo('${msg.id}', '${escapeHtml(user.username).replace(/'/g, "\\'")}', '${escapeHtml(msg.content).replace(/'/g, "\\'")}')">↩ Responder</button>
                ${actionsHTML}
            </div>
        </div>
    `;

    setTimeout(async () => await renderPoll(msg.id, div.querySelector('.geral-message-text')), 100);
    setTimeout(async () => await loadMessageReactions(msg.id), 50);

    const contentDiv = div.querySelector('.geral-message-content');
    if (contentDiv) {
        const reactionsTrigger = document.createElement('div');
        reactionsTrigger.className = 'reactions-trigger';
        reactionsTrigger.innerHTML = '😊';
        reactionsTrigger.onclick = (e) => {
            e.stopPropagation();
            showReactionPicker(reactionsTrigger, msg.id);
        };
        contentDiv.appendChild(reactionsTrigger);
    }
    return div;
}

// ==================== 3. parte do setupRealtimeSubscriptions (substitua o canal geral) ====================
// Dentro da função setupRealtimeSubscriptions, troque o bloco `geralChannel` por este:

if (geralChannel) db.removeChannel(geralChannel);

geralChannel = db
    .channel('geral-messages-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'geral_messages' }, (payload) => {
        const updatedMsg = payload.new;
        if (updatedMsg.deleted) {
            const msgDiv = document.getElementById(`msg-${updatedMsg.id}`);
            if (msgDiv) msgDiv.remove();          // ← remove a mensagem deletada
        } else {
            renderMessage(updatedMsg);             // ← atualiza edição
        }
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'geral_messages' }, (payload) => {
        const deletedId = payload.old.id;
        const msgDiv = document.getElementById(`msg-${deletedId}`);
        if (msgDiv) msgDiv.remove();
    })
    .subscribe();

function renderMessage(msg, prepend = false) {
    const container = document.getElementById('geralMessages');
    const existingDiv = document.getElementById(`msg-${msg.id}`);
    const newDiv = createMessageDiv(msg);

    if (existingDiv) {
        // Atualiza mensagem existente (edição, exclusão)
        existingDiv.replaceWith(newDiv);
    } else {
        // Nova mensagem
        if (prepend) {
            container.insertBefore(newDiv, container.firstChild);
        } else {
            container.appendChild(newDiv);
        }
    }

    // Só rola para o final se for uma mensagem nova (não atualização)
    if (!existingDiv && !prepend) {
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
    
    // Auto-resize e autocomplete
    input.addEventListener('input', (e) => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        
        const text = input.value;
        if (text.startsWith('/')) {
            const parts = text.split(/\s+/);
            const cmdPart = parts[0];
            activeSuggestions = true;
            showCommandSuggestions(input, cmdPart);
        } else {
            hideCommandSuggestions();
        }
    const cursorPos = input.selectionStart;
        const textBefore = input.value.substring(0, cursorPos);
        const atMatch = textBefore.match(/@(\w*)$/);  // @ seguido de caracteres de palavra
        if (atMatch) {
        const filter = atMatch[1];
        showMentionSuggestions(filter);
        } else {
        hideMentionSuggestions();
        }
  });
    
    // Fechar sugestões ao perder foco
    input.addEventListener('blur', () => {
        setTimeout(() => {
        hideMentionSuggestions();
        hideCommandSuggestions();
        }, 200);
    });
    
    // Envio com Enter (sem sugestões ativas)
    input.addEventListener('keydown', (e) => {
        const mentionOpen = mentionSuggestions.classList.contains('open');

        if (mentionOpen) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            updateMentionSelection(1);
            return;
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            updateMentionSelection(-1);
            return;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const username = getSelectedMentionUser();
            if (username) {
            insertMention(username);
            }
            return;
        } else if (e.key === 'Escape') {
            hideMentionSuggestions();
            return;
        }
        }
        const suggestionsDiv = document.getElementById('cmdSuggestions');
        const isSuggestionVisible = suggestionsDiv && suggestionsDiv.style.display === 'block';
        
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                // Shift+Enter: permite quebra de linha (padrão)
                return;
            }
            
            // Se há sugestões visíveis e uma sugestão está selecionada, navegamos (já tratado no outro listener)
            // Para evitar conflito, se uma sugestão está selecionada, deixamos o outro listener lidar.
            if (isSuggestionVisible && selectedSuggestionIndex >= 0) {
                // Não fazer nada aqui, pois o outro listener vai usar Enter para selecionar
                return;
            }
            
            // Caso contrário, envia a mensagem
            e.preventDefault();
            sendGeralMessage();
        }
        
        // Navegação nas sugestões com setas (apenas se sugestões visíveis)
        if (isSuggestionVisible) {
            const items = suggestionsDiv.querySelectorAll('.cmd-suggestion-item');
            if (items.length === 0) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
                updateSelectedSuggestion(items, input);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
                updateSelectedSuggestion(items, input);
            } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
                e.preventDefault();
                const selectedItem = items[selectedSuggestionIndex];
                const cmdText = selectedItem.querySelector('.cmd-name').textContent;
                input.value = cmdText + ' ';
                hideCommandSuggestions();
                input.focus();
            }
        }
    });
}



function updateSelectedSuggestion(items, input) {
    items.forEach((item, idx) => {
        if (idx === selectedSuggestionIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
    const selectedItem = items[selectedSuggestionIndex];
    if (selectedItem) selectedItem.scrollIntoView({ block: 'nearest' });
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

    // 🚫 NÃO ENVIA SE ESTIVER VAZIO
    if (!content) {
        input.focus();   // mantém o cursor no campo
        return;
    }

    // Verificar se usuário está mutado
    const mutedUntil = await isUserMuted(currentUser.id);
    if (mutedUntil) {
        const minutesLeft = Math.ceil((mutedUntil - new Date()) / 60000);
        showToast(`Você está mutado por mais ${minutesLeft} minuto(s). Não pode enviar mensagens.`, 'warning');
        input.disabled = false;
        input.focus();
        return;
    }

    // 🆕 COMANDO /gif
    if (content.toLowerCase().startsWith('/gif ')) {
        const gifName = content.substring(5).trim().toLowerCase().replace(/^\//, ''); // remove barra inicial se vier
        if (!gifName) {
            showToast('Use /gif nome_do_gif', 'warning');
            input.value = '';
            input.disabled = false;
            input.focus();
            return;
        }
        // Verificar se o comando existe no objeto memeCommands (que já tem formato "/nome")
        const fullCommand = '/' + gifName;
        if (memeCommands[fullCommand]) {
            // Envia a mensagem normal com o conteúdo "/nome_do_gif"
            const fakeContent = fullCommand;
            // Reinicia o input e processa como se fosse uma mensagem comum
            input.value = '';
            // Chama o resto do fluxo de envio com o conteúdo modificado
            // Reaproveitar o código de envio de mensagem comum
            input.disabled = true;
            const messageData = {
                user_id: currentUser.id,
                content: fakeContent,
                mentions: []
            };
            // (menções e reply são ignorados para comandos)
            try {
                const { data: msg, error } = await db.from('geral_messages').insert(messageData).select().single();
                if (error) throw error;
                if (msg) renderMessage(msg);
            } catch (e) {
                showToast('Erro ao enviar GIF', 'error');
            } finally {
                input.disabled = false;
                input.focus();
            }
        } else {
            showToast(`GIF "${gifName}" não encontrado. Use /help para ver os disponíveis.`, 'error');
            input.value = '';
            input.disabled = false;
            input.focus();
        }
        return;
    }
    
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

    const isCommand = await processGeneralCommands(content);
    if (isCommand) {
        input.value = '';
        input.style.height = 'auto';
        input.disabled = false;
        input.focus();
        return;
    }

    // Verificar se é comando /poll
    const pollData = parsePollCommand(content);
    if (pollData) {
        // Cria a mensagem normalmente, mas depois associamos a enquete
        const messageData = {
            user_id: currentUser.id,
            content: content, // o comando original será salvo
            mentions: []
        };
        if (replyToMessage) {
            messageData.reply_to = {
                id: replyToMessage.id,
                user_id: replyToMessage.userId,
                username: replyToMessage.username,
                content: replyToMessage.content
            };
            cancelReply();
        }
        const { data: msg, error } = await db
            .from('geral_messages')
            .insert(messageData)
            .select()
            .single();
        if (error) throw error;
        
        // Criar a enquete associada a esta mensagem
        await db.from('geral_polls').insert({
            message_id: msg.id,
            question: pollData.question,
            options: JSON.stringify(pollData.options),
            created_by: currentUser.id
        });

        await updateLastSeen();

        
        renderMessage(msg);
        input.value = '';
        input.style.height = 'auto';
        input.disabled = false;
        input.focus();
        return;
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

            await updateLastSeen();
            
           
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
    
    let safeIcon = icon;
    if (safeIcon && safeIcon.startsWith('/')) {
        safeIcon = window.location.origin + safeIcon;
    }
    if (!safeIcon) {
        safeIcon = '/favicon-192.png';
    }
    
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
        new Notification(title, { body, icon: safeIcon, data });
        return;
    }
    registration.showNotification(title, {
        body: body,
        icon: safeIcon,
        badge: safeIcon,
        tag: 'bidjorchat-private',
        renotify: true,
        data: data || { url: window.location.href },
        vibrate: [200, 100, 200]
    });
}



async function loadPinnedMessage() {
    try {
        // Busca a primeira fixação (se existir) – limitando a 1
        const { data: pinned, error } = await db
            .from('pinned_geral_messages')
            .select('message_id')
            .limit(1);  // importante: limita a 1 resultado
        if (error) throw error;
        
        if (pinned && pinned.length > 0) {
            const messageId = pinned[0].message_id;
            // Busca a mensagem completa separadamente
            const { data: message, error: msgError } = await db
                .from('geral_messages')
                .select('*')
                .eq('id', messageId)
                .single();
            if (msgError) throw msgError;
            currentPinnedMessage = message;
            renderPinnedBanner(message);
        } else {
            currentPinnedMessage = null;
            const banner = document.getElementById('pinnedMessageBanner');
            if (banner) banner.style.display = 'none';
        }
    } catch (e) {
        console.warn('Erro ao carregar mensagem fixada:', e);
    }
}

function renderPinnedBanner(message) {
    let banner = document.getElementById('pinnedMessageBanner');
    if (!banner) {
        const messagesContainer = document.getElementById('geralMessages');
        if (!messagesContainer) return;
        banner = document.createElement('div');
        banner.id = 'pinnedMessageBanner';
        banner.className = 'pinned-message-banner';
        messagesContainer.parentNode.insertBefore(banner, messagesContainer);
    }
    const user = allUsers[message.user_id] || { username: 'Usuário' };
    const roleColor = getRoleColor(user.role);
    banner.innerHTML = `
        <div class="pinned-icon">📌</div>
        <div class="pinned-content">
            <div class="pinned-header">
                <span class="pinned-author" style="color:${roleColor}">${escapeHtml(user.username)}</span>
            </div>
            <div class="pinned-message-text">${escapeHtml(message.content.substring(0, 100))}${message.content.length > 100 ? '...' : ''}</div>
        </div>
        <button class="pinned-close" onclick="event.stopPropagation(); scrollToMessage('${message.id}')">↩️ Ir</button>
    `;
    banner.style.display = 'flex';
    banner.onclick = () => scrollToMessage(message.id);
}

async function togglePinMessage(messageId) {
    // Permissão: admin, supervisor ou moderador (ajuste conforme sua regra)
    if (!['admin', 'supervisor', 'moderator'].includes(currentUser.role)) {
        showToast('Você não tem permissão para fixar mensagens', 'error');
        return;
    }

    try {
        // 1. Verificar se já existe alguma fixação
        const { data: existing, error: fetchError } = await db
            .from('pinned_geral_messages')
            .select('message_id')
            .limit(1);
        if (fetchError) throw fetchError;

        const hasPinned = existing && existing.length > 0;
        const currentPinnedId = hasPinned ? existing[0].message_id : null;

        // Se já está fixada a mesma mensagem, não faz nada
        if (currentPinnedId === messageId) {
            showToast('Esta mensagem já está fixada', 'info');
            return;
        }

        // 2. Se houver fixação, pergunta se quer substituir
        if (hasPinned) {
            const confirmReplace = confirm('Já existe uma mensagem fixada. Deseja substituir?');
            if (!confirmReplace) return;
            // Remove a fixação atual
            const { error: deleteError } = await db
                .from('pinned_geral_messages')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // apaga todas as linhas
            if (deleteError) throw deleteError;
        }

        // 3. Insere a nova fixação
        const { error: insertError } = await db
            .from('pinned_geral_messages')
            .insert({ message_id: messageId, pinned_by: currentUser.id });
        if (insertError) throw insertError;

        showToast('Mensagem fixada com sucesso!', 'success');
        await loadPinnedMessage(); // recarrega o banner
    } catch (e) {
        console.error('Erro ao fixar mensagem:', e);
        showToast('Erro ao fixar mensagem: ' + e.message, 'error');
    }
}

// ========== CONTADOR ONLINE ==========
async function updateOnlineCount() {
    try {
        const { count, error } = await db
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'online');
        if (error) throw error;
        document.getElementById('onlineCount').textContent = count || 0;
    } catch (e) {
        console.warn('Erro ao buscar online count:', e);
    }
}

// Iniciar o contador (atualiza a cada 10s)

function startOnlineCounter() {
    updateOnlineCount();
    onlineInterval = setInterval(updateOnlineCount, 10000);
}
function stopOnlineCounter() {
    if (onlineInterval) clearInterval(onlineInterval);
}





function setupRealtimeSubscriptions() {
    if (geralChannel) db.removeChannel(geralChannel);
    if (pinnedChannel) db.removeChannel(pinnedChannel);

    // Canal para mensagens (UPDATE e DELETE)
    geralChannel = db
        .channel('geral-messages-changes')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'geral_messages' },
            (payload) => {
                const updatedMsg = payload.new;
                // Se a mensagem foi marcada como deletada, remove do DOM
                if (updatedMsg.deleted) {
                    const msgDiv = document.getElementById(`msg-${updatedMsg.id}`);
                    if (msgDiv) msgDiv.remove();
                } else {
                    // Senão, atualiza normalmente
                    renderMessage(updatedMsg);
                }
            }
        )
        .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'geral_messages' },
            (payload) => {
                const deletedId = payload.old.id;
                const msgDiv = document.getElementById(`msg-${deletedId}`);
                if (msgDiv) msgDiv.remove();
            }
        )
        .subscribe();

    // Canal para fixações (INSERT/DELETE)
    pinnedChannel = db
        .channel('pinned-messages-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'pinned_geral_messages' },
            () => {
                loadPinnedMessage(); // recarrega o banner
            }
        )
        .subscribe();


    // Canal para reações
    db
        .channel('geral-reactions-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'geral_message_reactions' },
            (payload) => {
                const messageId = payload.new?.message_id || payload.old?.message_id;
                if (messageId) loadMessageReactions(messageId);
            }
        )
        .subscribe();

    // Canal para usuários (monitorar last_seen)
    db.channel('users-changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
        if (payload.new && payload.new.last_seen) {
            // Se o usuário atualizado não for o próprio, recarrega o indicador
            if (payload.new.id !== currentUser.id) {
                fetchLastActiveUser();
            }
        }
    })
    .subscribe();

    // Canal para vibração
    const buzzChannel = db.channel('geral-vibrate');
    buzzChannel.on('broadcast', { event: 'buzz' }, (payload) => {
        const { from } = payload.payload;
        // Verifica se o próprio remetente não deve vibrar? Pode vibrar também, mas opcional.
        // Só vibra se o navegador suportar e se a página estiver visível (ou não)
        if (window.navigator && window.navigator.vibrate) {
            // Padrão de vibração: 200ms, pausa 100ms, 200ms
            window.navigator.vibrate([200, 100, 200]);
            // Opcional: mostrar um pequeno toast informando quem buzzou
            if (from !== currentUser.username) {
                showToast(`📳 ${from} fez o chat vibrar!`, 'info');
            }
        } else {
            // Fallback: console log
            console.log('Navegador não suporta vibração');
        }
    });
    buzzChannel.subscribe();


    // Canal específico para novas mensagens (INSERT)
    const newMessagesChannel = db
        .channel('geral-new-messages')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'geral_messages' },
            (payload) => {
                const msg = payload.new;
                // Evita processar mensagem do próprio usuário
                if (msg.user_id === currentUser.id) return;
                
                // Verifica menção
                const mentions = msg.mentions || [];
                if (mentions.includes(currentUser.id)) {
                    const sender = allUsers[msg.user_id];
                    const senderName = sender?.username || 'Alguém';
                    let senderAvatar = sender?.avatar_url;
                    
                    // Converte URL relativa para absoluta (se necessário)
                    if (senderAvatar && senderAvatar.startsWith('/')) {
                        senderAvatar = window.location.origin + senderAvatar;
                    }
                    // Se não tiver avatar, usa um ícone padrão (opcional)
                    if (!senderAvatar) {
                        senderAvatar = '/favicon-192.png'; // ou deixe null
                    }
                    
                    if (document.hidden) {
                        showNotification(
                            `🔔 ${senderName} mencionou você`,
                            msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content,
                            senderAvatar,
                            { url: '/mensagem_geral/index.html' }
                        );
                    }
                }
                
                // Renderiza mensagem
                renderMessage(msg);
            }
        )
        .subscribe();
}


// ========== REAÇÕES EM MENSAGENS ==========


async function loadMessageReactions(messageId) {
    try {
        const { data, error } = await db
            .from('geral_message_reactions')
            .select('*')
            .eq('message_id', messageId);
        if (error) throw error;
        renderReactions(messageId, data || []);
    } catch (e) {
        console.warn('Erro ao carregar reações:', e);
    }
}

function renderReactions(messageId, reactions) {
    const container = document.getElementById(`reactions-${messageId}`);
    if (!container) return;
    
    const grouped = {};
    reactions.forEach(r => {
        if (!grouped[r.reaction]) grouped[r.reaction] = { count: 0, users: [] };
        grouped[r.reaction].count++;
        grouped[r.reaction].users.push(r.user_id);
    });
    
    if (Object.keys(grouped).length === 0) {
        container.innerHTML = '';
        return;
    }
    
    const isOwnReaction = (emoji) => grouped[emoji]?.users.includes(currentUser.id) || false;
    
    container.innerHTML = Object.entries(grouped).map(([emoji, data]) => `
        <div class="reaction-badge ${isOwnReaction(emoji) ? 'active' : ''}" data-emoji="${emoji}" onclick="toggleReaction('${messageId}', '${emoji}')">
            <span class="reaction-emoji">${emoji}</span>
            <span class="reaction-count">${data.count}</span>
        </div>
    `).join('');
}

function showReactionPicker(triggerElement, messageId) {
    const existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();
    
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    REACTION_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.onclick = async (e) => {
            e.stopPropagation();
            await toggleReaction(messageId, emoji);
            picker.remove();
        };
        picker.appendChild(btn);
    });
    
    const rect = triggerElement.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.top - 40}px`;
    document.body.appendChild(picker);
    
    const closePicker = (e) => {
        if (!picker.contains(e.target) && e.target !== triggerElement) {
            picker.remove();
            document.removeEventListener('click', closePicker);
        }
    };
    setTimeout(() => document.addEventListener('click', closePicker), 100);
}

async function toggleReaction(messageId, emoji) {
    try {
        const { data: existing, error: fetchError } = await db
            .from('geral_message_reactions')
            .select('id')
            .eq('message_id', messageId)
            .eq('user_id', currentUser.id)
            .eq('reaction', emoji)
            .maybeSingle();
        if (fetchError) throw fetchError;
        
        if (existing) {
            await db.from('geral_message_reactions').delete().eq('id', existing.id);
        } else {
            await db.from('geral_message_reactions').insert({
                message_id: messageId,
                user_id: currentUser.id,
                reaction: emoji
            });
        }
        await loadMessageReactions(messageId);
    } catch (e) {
        showToast('Erro ao reagir: ' + e.message, 'error');
    }
}



// ========== COMANDO /POLL ==========
function parsePollCommand(content) {
    // Formato: /poll "Pergunta" "Opção1" "Opção2" ["Opção3"...]
    const trimmed = content.trim();
    if (!trimmed.startsWith('/sondagem')) return null;
    
    // Expressão regular para capturar textos entre aspas
    const regex = /"([^"]*)"/g;
    const matches = [...trimmed.matchAll(regex)];
    if (matches.length < 3) return null;
    
    const question = matches[0][1];
    const options = matches.slice(1).map(m => m[1]);
    return { question, options };
}




// ========== POLLS NO CHAT ==========
async function loadPollForMessage(messageId) {
    try {
        const { data: poll, error } = await db
            .from('geral_polls')
            .select('*')
            .eq('message_id', messageId)
            .maybeSingle();
        if (error) throw error;
        return poll;
    } catch (e) {
        console.warn('Erro ao carregar enquete:', e);
        return null;
    }
}

async function renderPoll(messageId, containerElement) {
    const poll = await loadPollForMessage(messageId);
    if (!poll) return;
    
    const options = JSON.parse(poll.options);
    const userVote = await getUserPollVote(poll.id);
    
    const pollDiv = document.createElement('div');
    pollDiv.className = 'chat-poll';
    pollDiv.dataset.pollId = poll.id;
    pollDiv.dataset.isActive = poll.is_active;
    
    let votesHTML = '';
    if (userVote || !poll.is_active) {
        // Exibir resultados
        const results = await getPollResults(poll.id, options.length);
        votesHTML = renderPollResults(results, options, userVote);
    } else {
        votesHTML = renderPollOptions(options, poll.id);
    }
    
    pollDiv.innerHTML = `
        <div class="poll-question">📊 ${escapeHtml(poll.question)}</div>
        ${votesHTML}
        <div class="poll-footer">
            <span class="poll-total-votes" id="poll-total-${poll.id}">Carregando...</span>
            <button class="poll-view-results" onclick="togglePollResults('${poll.id}', this)">Ver resultados</button>
            ${!poll.is_active ? '<span class="poll-closed">🔒 Encerrada</span>' : ''}
        </div>
    `;
    
    containerElement.appendChild(pollDiv);
    await updatePollTotal(poll.id);
}

async function getUserPollVote(pollId) {
    const { data, error } = await db
        .from('geral_poll_votes')
        .select('option_index')
        .eq('poll_id', pollId)
        .eq('user_id', currentUser.id)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function getPollResults(pollId, numOptions) {
    const { data: votes, error } = await db
        .from('geral_poll_votes')
        .select('option_index')
        .eq('poll_id', pollId);
    if (error) throw error;
    const counts = new Array(numOptions).fill(0);
    votes.forEach(v => counts[v.option_index]++);
    const total = counts.reduce((a,b) => a+b, 0);
    const percentages = counts.map(c => total > 0 ? Math.round((c / total) * 100) : 0);
    return { counts, percentages, total };
}

function renderPollResults(results, options, userVote) {
    return `
        <div class="poll-results">
            ${options.map((opt, i) => `
                <div class="poll-result-bar">
                    <div class="poll-result-label">${escapeHtml(opt)}</div>
                    <div class="poll-bar"><div class="poll-bar-fill" style="width: ${results.percentages[i]}%;"></div></div>
                    <div class="poll-result-count">${results.counts[i]} (${results.percentages[i]}%)</div>
                    ${userVote?.option_index === i ? '<span class="poll-your-vote">✓ Seu voto</span>' : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function renderPollOptions(options, pollId) {
    return `
        <div class="poll-options">
            ${options.map((opt, idx) => `
                <button class="poll-option-btn" onclick="voteInPoll('${pollId}', ${idx}, this)">${escapeHtml(opt)}</button>
            `).join('')}
        </div>
    `;
}

async function updatePollTotal(pollId) {
    const { data: votes, error } = await db
        .from('geral_poll_votes')
        .select('id', { count: 'exact' })
        .eq('poll_id', pollId);
    if (error) return;
    const totalSpan = document.getElementById(`poll-total-${pollId}`);
    if (totalSpan) totalSpan.textContent = `${votes.length} voto${votes.length !== 1 ? 's' : ''}`;
}

window.voteInPoll = async function(pollId, optionIndex, button) {
    try {
        // Verificar se já votou
        const existing = await getUserPollVote(pollId);
        if (existing) {
            showToast('Você já votou nesta enquete', 'warning');
            return;
        }
        await db.from('geral_poll_votes').insert({
            poll_id: pollId,
            user_id: currentUser.id,
            option_index: optionIndex
        });
        showToast('Voto registrado!', 'success');
        // Atualizar a UI da enquete para mostrar resultados
        const pollContainer = button.closest('.chat-poll');
        if (pollContainer) {
            const pollIdAttr = pollContainer.dataset.pollId;
            const { data: poll } = await db.from('geral_polls').select('*').eq('id', pollIdAttr).single();
            const options = JSON.parse(poll.options);
            const results = await getPollResults(pollIdAttr, options.length);
            const newHTML = renderPollResults(results, options, { option_index: optionIndex });
            pollContainer.querySelector('.poll-options')?.remove();
            pollContainer.querySelector('.poll-results')?.remove();
            pollContainer.insertAdjacentHTML('beforeend', newHTML);
            await updatePollTotal(pollIdAttr);
        }
    } catch (e) {
        showToast('Erro ao votar: ' + e.message, 'error');
    }
};

window.togglePollResults = async function(pollId, button) {
    const pollContainer = button.closest('.chat-poll');
    const resultsDiv = pollContainer.querySelector('.poll-results');
    const optionsDiv = pollContainer.querySelector('.poll-options');
    if (resultsDiv && resultsDiv.style.display !== 'none') {
        // Esconder resultados e mostrar opções (se enquete ativa)
        const poll = await db.from('geral_polls').select('is_active').eq('id', pollId).single();
        if (poll.data?.is_active) {
            resultsDiv.style.display = 'none';
            if (optionsDiv) optionsDiv.style.display = 'flex';
            button.textContent = 'Ver resultados';
        } else {
            showToast('Enquete encerrada, não é possível votar', 'info');
        }
    } else {
        // Mostrar resultados
        if (optionsDiv) optionsDiv.style.display = 'none';
        if (resultsDiv) resultsDiv.style.display = 'block';
        button.textContent = 'Ocultar resultados';
        await updatePollTotal(pollId);
    }
};


//FORMATAR A PORRA DOS TEXTOS
function formatMessageText(text) {
    // text já pode conter tags HTML (ex: <a>)
    let formatted = text;
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/__(.*?)__/g, '<u>$1</u>');
    formatted = formatted.replace(/~~(.*?)~~/g, '<del>$1</del>');
    return formatted;
}




// Atualiza o timestamp de última atividade no banco
async function updateLastSeen() {
    if (!currentUser || !currentUser.id) return;
    try {
        await db.from('users').update({ last_seen: new Date().toISOString() }).eq('id', currentUser.id);
    } catch (e) {
        console.warn('Erro ao atualizar last_seen:', e);
    }
}

function formatTimeAgo(date) {
    if (!date) return 'agora mesmo';
    const now = new Date();
    const diffSeconds = Math.floor((now - new Date(date)) / 1000);
    if (diffSeconds < 60) return 'agora mesmo';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `há ${diffMinutes} minuto${diffMinutes !== 1 ? 's' : ''}`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `há ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'ontem';
    return `há ${diffDays} dias`;
}


async function fetchLastActiveUser() {
    try {
        // Busca o usuário mais recente (excluindo o atual) com last_seen não nulo
        const { data, error } = await db
            .from('users')
            .select('username, role, last_seen')
            .neq('id', currentUser.id)
            .not('last_seen', 'is', null)
            .order('last_seen', { ascending: false })
            .limit(1);
        if (error) throw error;
        if (data && data.length > 0) {
            const user = data[0];
            const timeAgo = formatTimeAgo(user.last_seen);
            document.getElementById('lastSeenText').innerHTML = `Última atividade: <strong style="color:${getRoleColor(user.role)}">${escapeHtml(user.username)}</strong> ${timeAgo}`;
        } else {
            document.getElementById('lastSeenText').innerHTML = 'Nenhuma atividade recente';
        }
    } catch (e) {
        console.warn('Erro ao buscar último ativo:', e);
        document.getElementById('lastSeenText').innerHTML = 'Não foi possível carregar';
    }
}

// Função para atualizar o indicador periodicamente
function startLastSeenUpdater() {
    updateLastSeen(); // atualiza o próprio last_seen
    fetchLastActiveUser(); // mostra o último ativo
    setInterval(() => {
        updateLastSeen();
        fetchLastActiveUser();
    }, 30000); // a cada 30 segundos
}



// ========== COMANDOS GERAIS ==========
async function processGeneralCommands(content) {
    console.log('processGeneralCommands chamado com:', content);
    const trimmed = content.trim().toLowerCase();
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    // /avatar (já existente)
    if (cmd === '/avatar') {
        if (args.length === 0) {
            showUserProfile(currentUser.id);
        } else {
            const username = args[0].replace(/^@/, '');
            const user = Object.values(allUsers).find(u => u.username.toLowerCase() === username);
            if (user) showUserProfile(user.id);
            else showToast(`Usuário "${username}" não encontrado`, 'error');
        }
        return true;
    }

    // /help
    if (cmd === '/ajuda' || cmd === '/help') {
        cmdHelp();
        return true;
    }

    // /time
    if (cmd === '/hora') {
        cmdTime();
        return true;
    }

    // /roll [lados]
    if (cmd === '/dado') {
        cmdRoll(args);
        return true;
    }

    // /coinflip
    if (cmd === '/caracoroa') {
        cmdCoinflip();
        return true;
    }

    if (cmd === '/ranking') {
        await showRanking();
        return true;
    }

    // /8ball pergunta
    if (cmd === '/simounao') {
        // Reconstruir a pergunta (tudo após o comando)
        let question = content.substring(6).trim(); // remove "/8ball "
        if (!question) question = args.join(' ');
        cmd8ball(question);
        return true;
    }

    // /choose opção1, opção2, opção3...
    if (cmd === '/escolha') {
        if (args.length < 2) {
            sendSystemMessage(`❌ Use: /choose opção1, opção2, opção3...`);
            return true;
        }
        // Junta os argumentos e divide por vírgulas
        const raw = content.substring(8).trim(); // remove "/choose "
        let options = raw.split(',').map(opt => opt.trim());
        options = options.filter(opt => opt.length > 0);
        if (options.length < 2) {
            sendSystemMessage(`❌ Forneça pelo menos duas opções separadas por vírgula.`);
            return true;
        }
        const chosen = options[Math.floor(Math.random() * options.length)];
        sendSystemMessage(`🎲 ${currentUser.username} pediu para escolher entre: ${options.join(', ')}\n\n➡️ **${chosen}**`);
        return true;
    }



    // /tweet "texto" - Card moderno com indicador "tweetou"
    if (cmd === '/tweet') {
        let tweetText = content.substring(6).trim();
        if (!tweetText) {
            sendSystemMessage(`❌ Use: /tweet sua mensagem aqui (até 280 caracteres)`);
            return true;
        }
        if (tweetText.length > 280) {
            sendSystemMessage(`❌ O tweet excede 280 caracteres (tem ${tweetText.length}).`);
            return true;
        }
        const safeText = escapeHtml(tweetText).replace(/\n/g, '<br>');
        const user = currentUser;
        const avatarHtml = user.avatar_url 
            ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">`
            : `<div class="avatar-placeholder">${getInitials(user.username)}</div>`;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        const tweetHtml = `
            <div class="tweet-card">
                <div class="tweet-avatar">${avatarHtml}</div>
                <div class="tweet-content">
                    <div class="tweet-header">
                        <span class="tweet-name">${escapeHtml(user.username)}</span>
                        <span class="tweet-username">@${escapeHtml(user.username)}</span>
                        <span class="tweet-time">${timeStr} · ${dateStr}</span>
                    </div>
                    <div class="tweet-text">
                        <strong style="color: #1da1f2;">${escapeHtml(user.username)} tweetou:</strong><br>
                        ${safeText}
                    </div>
                    <div class="tweet-stats">
                        <span>💬 0</span>
                        <span>🔄 0</span>
                        <span>❤️ 0</span>
                        <span>📊 0</span>
                    </div>
                </div>
            </div>
        `;
        sendSystemMessage(tweetHtml);
        return true;
    }



    // /give @usuario [item] - Card com presente clicável
    if (cmd === '/give') {
        if (args.length < 2) {
            sendSystemMessage(`❌ Use: /give @usuario [item]`);
            return true;
        }
        const targetUsername = args[0].replace(/^@/, '');
        const targetUser = Object.values(allUsers).find(u => u.username.toLowerCase() === targetUsername);
        if (!targetUser) {
            sendSystemMessage(`❌ Usuário "${targetUsername}" não encontrado.`);
            return true;
        }
        const item = args.slice(1).join(' ');
        const now = new Date();
        const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        // Adiciona um ID único para o presente (opcional)
        const presentId = 'present-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
        
        const giveHtml = `
            <div class="give-card" data-present-id="${presentId}">
                <div class="give-icon">🎁</div>
                <div class="give-info">
                    <div class="give-de-para">
                        <span>📤 De: <strong class="give-giver">${escapeHtml(currentUser.username)}</strong></span>
                        <span>📥 Para: <strong class="give-receiver">${escapeHtml(targetUser.username)}</strong></span>
                    </div>
                    <div class="give-item clickable-present" data-giver="${escapeHtml(currentUser.username)}" data-receiver="${escapeHtml(targetUser.username)}" data-item="${escapeHtml(item)}">
                        ${escapeHtml(item)}
                    </div>
                    <div class="give-time">${timeStr}</div>
                </div>
            </div>
        `;
        sendSystemMessage(giveHtml);
        
        // Após inserir no DOM (como sendSystemMessage é assíncrona, precisamos anexar o evento depois)
        setTimeout(() => {
            document.querySelectorAll('.clickable-present').forEach(el => {
                if (!el.hasAttribute('data-listener')) {
                    el.setAttribute('data-listener', 'true');
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const giver = el.getAttribute('data-giver');
                        const receiver = el.getAttribute('data-receiver');
                        const item = el.getAttribute('data-item');
                        openPresentModal(item, giver, receiver);
                    });
                }
            });
        }, 200);
        return true;
    }


    // /vote "pergunta" - Enquete Sim/Não
    if (cmd === '/vote') {
        const voteMatch = content.match(/"([^"]*)"/);
        if (!voteMatch || !voteMatch[1]) {
            sendSystemMessage(`❌ Use: /vote "sua pergunta aqui"`);
            return true;
        }
        const question = voteMatch[1];
        
        // Cria a mensagem que vai conter a enquete
        const messageData = {
            user_id: currentUser.id,
            content: `📊 Votação: ${question}`,
            mentions: []
        };
        const { data: msg, error } = await db
            .from('geral_messages')
            .insert(messageData)
            .select()
            .single();
        if (error) {
            showToast('Erro ao criar enquete', 'error');
            return true;
        }
        
        // Cria o poll com opções Sim/Não
        await db.from('geral_polls').insert({
            message_id: msg.id,
            question: question,
            options: JSON.stringify(['👍 Sim', '👎 Não']),
            created_by: currentUser.id,
            is_active: true
        });
        
        renderMessage(msg);
        return true;
    }

    // /clear_sys - Apagar mensagens do robô (apenas admin/supervisor)
    if (cmd === '/clear_sys') {
        // 1. Verificar cargo real no banco
        const { data: userData, error: userError } = await db
            .from('users')
            .select('role')
            .eq('id', currentUser.id)
            .single();
        if (userError || !userData || !['admin', 'supervisor'].includes(userData.role)) {
            sendSystemMessage(`❌ Apenas administradores e supervisores podem usar este comando.`);
            return true;
        }
        const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
        const confirmDelete = confirm('⚠️ ATENÇÃO: Isso apagará TODAS as mensagens do robô (sistema) permanentemente. Deseja continuar?');
        if (!confirmDelete) return true;
        try {
            const { error } = await db
                .from('geral_messages')
                .delete()
                .eq('user_id', SYSTEM_USER_ID);
            if (error) throw error;
            sendSystemMessage(`🧹 Foram apagadas todas as mensagens do robô.`);
            await loadGeralMessages();
        } catch (e) {
            sendSystemMessage(`❌ Erro ao limpar mensagens do robô: ${e.message}`);
        }
        return true;
    }

    // /clear - Apagar todo o chat geral (apenas admin/supervisor)
    if (cmd === '/clear') {
        // 1. Verificar cargo real no banco
        const { data: userData, error: userError } = await db
            .from('users')
            .select('role')
            .eq('id', currentUser.id)
            .single();
        if (userError || !userData || !['admin', 'supervisor'].includes(userData.role)) {
            sendSystemMessage(`❌ Apenas administradores e supervisores podem usar este comando.`);
            return true;
        }
        const confirmDelete = confirm('⚠️ ATENÇÃO: Isso apagará TODAS as mensagens do chat geral (incluindo mensagens de usuários). Deseja continuar?');
        if (!confirmDelete) return true;
        try {
            const { error } = await db
                .from('geral_messages')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // apaga tudo
            if (error) throw error;
            sendSystemMessage(`🧹 O chat geral foi completamente limpo.`);
            await loadGeralMessages();
        } catch (e) {
            sendSystemMessage(`❌ Erro ao limpar o chat geral: ${e.message}`);
        }
        return true;
    }

    // /addgif nome url - Adicionar novo meme (apenas admin/supervisor/moderador)
    if (cmd === '/addgif') {
        if (!['admin', 'supervisor', 'moderator'].includes(currentUser.role)) {
            sendSystemMessage(`❌ Apenas administradores, supervisores e moderadores podem adicionar GIFs.`);
            return true;
        }
        if (args.length < 2) {
            sendSystemMessage(`❌ Use: /addgif nome URL (ex: /addgif meme01 https://exemplo.com/meme.gif)`);
            return true;
        }
        const commandName = args[0].toLowerCase();
        const url = args[1];
        // Validação básica da URL
        if (!url.match(/^https?:\/\/.+/)) {
            sendSystemMessage(`❌ URL inválida. Use uma URL completa (http:// ou https://).`);
            return true;
        }
        try {
            // Verificar se o comando já existe
            const { data: existing } = await db
                .from('meme_commands')
                .select('command')
                .eq('command', commandName)
                .maybeSingle();
            if (existing) {
                sendSystemMessage(`❌ O comando /${commandName} já existe. Use outro nome.`);
                return true;
            }
            // Inserir novo comando
            await db.from('meme_commands').insert({
                command: commandName,
                url: url
            });
            sendSystemMessage(`✅ Comando /${commandName} adicionado com sucesso! Use /gif ${commandName} para enviar.`);
            // Recarregar comandos de meme no frontend
            await loadMemeCommands();
        } catch (e) {
            sendSystemMessage(`❌ Erro ao adicionar GIF: ${e.message}`);
        }
        return true;
    }

    if (cmd === '/rankingsend') {
        if (!['admin', 'supervisor'].includes(currentUser.role)) {
            sendSystemMessage(`❌ Apenas administradores e supervisores podem usar este comando.`);
            return true;
        }
        await sendRankingToChat();
        return true;
    }


    // /crypto btc - Cotação de criptomoeda (com mapeamento de símbolos)
    if (cmd === '/crypto') {
        if (args.length === 0) {
            sendSystemMessage(`❌ Use: /crypto btc (ou eth, sol, ltc, xrp, doge, ada, dot, matic, bnb)`);
            return true;
        }
        let symbol = args[0].toLowerCase();
        // Mapeamento de símbolos comuns para IDs da CoinGecko
        const symbolToId = {
            'btc': 'bitcoin',
            'eth': 'ethereum',
            'sol': 'solana',
            'ltc': 'litecoin',
            'xrp': 'ripple',
            'doge': 'dogecoin',
            'ada': 'cardano',
            'dot': 'polkadot',
            'matic': 'polygon',
            'bnb': 'binancecoin'
        };
        let coinId = symbolToId[symbol];
        if (!coinId) {
            sendSystemMessage(`❌ Moeda "${symbol}" não suportada. Use: btc, eth, sol, ltc, xrp, doge, ada, dot, matic, bnb`);
            return true;
        }
        try {
            const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=brl`);
            const data = await response.json();
            if (!data[coinId] || !data[coinId].brl) {
                sendSystemMessage(`❌ Moeda "${symbol}" não encontrada. Tente novamente mais tarde.`);
                return true;
            }
            const price = data[coinId].brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            sendSystemMessage(`💰 ${symbol.toUpperCase()}: ${price}`);
        } catch (e) {
            console.error(e);
            sendSystemMessage(`❌ Erro ao buscar cotação. Tente novamente.`);
        }
        return true;
    }


    // /dolar - Cotação do dólar
    if (cmd === '/dolar') {
        try {
            // API do Banco Central (gratuita)
            const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
            const data = await response.json();
            const bid = parseFloat(data.USDBRL.bid).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const change = parseFloat(data.USDBRL.pctChange).toFixed(2);
            sendSystemMessage(`💵 Dólar comercial: ${bid} (variação: ${change}%)`);
        } catch (e) {
            sendSystemMessage(`❌ Erro ao buscar cotação. Tente novamente.`);
        }
        return true;
    }

    // /rps pedra - Joga pedra, papel ou tesoura
    if (cmd === '/rps') {
        if (args.length === 0) {
            sendSystemMessage(`❌ Use: /rps pedra, /rps papel ou /rps tesoura`);
            return true;
        }
        const choices = ['pedra', 'papel', 'tesoura'];
        const playerChoice = args[0].toLowerCase();
        if (!choices.includes(playerChoice)) {
            sendSystemMessage(`❌ Opção inválida. Use pedra, papel ou tesoura.`);
            return true;
        }
        const botChoice = choices[Math.floor(Math.random() * 3)];
        let result = '';
        if (playerChoice === botChoice) {
            result = 'Empate! 🤝';
        } else if (
            (playerChoice === 'pedra' && botChoice === 'tesoura') ||
            (playerChoice === 'papel' && botChoice === 'pedra') ||
            (playerChoice === 'tesoura' && botChoice === 'papel')
        ) {
            result = 'Você ganhou! 🎉';
        } else {
            result = 'Eu ganhei! 🤖';
        }
        sendSystemMessage(`🎮 Você escolheu **${playerChoice}**. Eu escolhi **${botChoice}**. ${result}`);
        return true;
    }

    //MUTED ================================================
    if (cmd === '/mute') {
        if (!['admin', 'supervisor', 'moderator'].includes(currentUser.role)) {
            sendSystemMessage(`❌ Apenas administradores, supervisores e moderadores podem mutar usuários.`);
            return true;
        }
        if (args.length < 1) {
            sendSystemMessage(`❌ Use: /mute @usuario [minutos] (padrão: ${await getMuteDurationMinutes()} min)`);
            return true;
        }
        const targetUsername = args[0].replace(/^@/, '');
        const targetUser = Object.values(allUsers).find(u => u.username.toLowerCase() === targetUsername);
        if (!targetUser) {
            sendSystemMessage(`❌ Usuário "${targetUsername}" não encontrado.`);
            return true;
        }
        if (!canModerate(targetUser, 'mute')) {
            sendSystemMessage(`❌ Você não pode mutar ${targetUser.role === 'admin' ? 'um administrador' : targetUser.role === 'supervisor' ? 'um supervisor' : 'este usuário'}.`);
            return true;
        }
        let duration = await getMuteDurationMinutes();
        if (args.length > 1 && !isNaN(parseInt(args[1]))) {
            duration = parseInt(args[1]);
        }
        const mutedUntil = new Date();
        mutedUntil.setMinutes(mutedUntil.getMinutes() + duration);
        try {
            await db.from('muted_users').upsert({
                user_id: targetUser.id,
                muted_until: mutedUntil.toISOString(),
                muted_by: currentUser.id,
                reason: args.slice(2).join(' ') || 'Sem motivo'
            });
            await logAdminAction('USER_MUTED', { target: targetUser.username, duration });
            sendSystemMessage(`🔇 ${currentUser.username} mutou ${targetUser.username} por ${duration} minuto(s).`);
        } catch (e) {
            sendSystemMessage(`❌ Erro: ${e.message}`);
        }
        return true;
    }

    // /unmute @usuario - Remove mute do usuário (admin/supervisor)
    if (cmd === '/unmute') {
        if (!['admin', 'supervisor', 'moderator'].includes(currentUser.role)) {
            sendSystemMessage(`❌ Apenas administradores, supervisores e moderadores podem desmutar usuários.`);
            return true;
        }
        if (args.length === 0) {
            sendSystemMessage(`❌ Use: /unmute @usuario`);
            return true;
        }
        const targetUsername = args[0].replace(/^@/, '');
        const targetUser = Object.values(allUsers).find(u => u.username.toLowerCase() === targetUsername);
        if (!targetUser) {
            sendSystemMessage(`❌ Usuário "${targetUsername}" não encontrado.`);
            return true;
        }
        if (!canModerate(targetUser, 'mute')) { // mesma regra do mute
            sendSystemMessage(`❌ Você não pode desmutar ${targetUser.role === 'admin' ? 'um administrador' : targetUser.role === 'supervisor' ? 'um supervisor' : 'este usuário'}.`);
            return true;
        }
        try {
            const { data, error } = await db
                .from('muted_users')
                .select('user_id')
                .eq('user_id', targetUser.id)
                .maybeSingle();
            if (error || !data) {
                sendSystemMessage(`❌ ${targetUser.username} não está mutado.`);
                return true;
            }
            await db.from('muted_users').delete().eq('user_id', targetUser.id);
            await logAdminAction('USER_UNMUTED', { target: targetUser.username });
            sendSystemMessage(`🔊 ${currentUser.username} removeu o mute de ${targetUser.username}. Agora ele pode enviar mensagens novamente.`);
        } catch (e) {
            sendSystemMessage(`❌ Erro ao desmutar: ${e.message}`);
        }
        return true;
    }

    if (cmd === '/warn') {

        if (!canModerate(targetUser, 'mute')) {
            sendSystemMessage(`❌ Você não pode dar aviso a ${targetUser.role === 'admin' ? 'um administrador' : targetUser.role === 'supervisor' ? 'um supervisor' : 'este usuário'}.`);
            return true;
        }
        if (!['admin', 'supervisor', 'moderator'].includes(currentUser.role)) {
            sendSystemMessage(`❌ Apenas administradores, supervisores e moderadores podem dar avisos.`);
            return true;
        }
        if (args.length < 2) {
            sendSystemMessage(`❌ Use: /warn @usuario motivo`);
            return true;
        }
        const targetUsername = args[0].replace(/^@/, '');
        const targetUser = Object.values(allUsers).find(u => u.username.toLowerCase() === targetUsername);
        if (!targetUser) {
            sendSystemMessage(`❌ Usuário "${targetUsername}" não encontrado.`);
            return true;
        }
        const reason = args.slice(1).join(' ');
        const warnCount = await addWarning(targetUser.id, currentUser.id, reason);
        const warnLimit = await getWarnLimit();
        await logAdminAction('USER_WARNED', { target: targetUser.username, reason, count: warnCount });
        sendSystemMessage(`⚠️ ${currentUser.username} deu um aviso para ${targetUser.username}. Motivo: "${reason}" (${warnCount}/${warnLimit})`);
        if (warnCount >= warnLimit) {
            // Aplica mute automático
            const muteDuration = await getMuteDurationMinutes();
            const mutedUntil = new Date();
            mutedUntil.setMinutes(mutedUntil.getMinutes() + muteDuration);
            await db.from('muted_users').upsert({
                user_id: targetUser.id,
                muted_until: mutedUntil.toISOString(),
                muted_by: currentUser.id,
                reason: `Atingiu ${warnLimit} avisos`
            });
            sendSystemMessage(`🔇 ${targetUser.username} foi mutado automaticamente por ${muteDuration} minuto(s) por atingir ${warnLimit} avisos.`);
        }
        return true;
    }

    // ========== CALCULADORA DO DIA A DIA ==========
    if (cmd === '/calc') {
        let expr = content.substring(5).trim();
        if (!expr) {
            sendSystemMessage(`❌ Use: /calc <expressão>
    Exemplos:
    • Aritmética: 2+2*3, (5+3)/(2-1), 2^10, sqrt(144), raiz(25)
    • Porcentagem: 10% de 200, 5% + 10% de 100, 20% de 30% de 500
    • Conversões: 100km para m, 2.5kg para g, 1h para min, 30c para f, 500g para l
    • Regra de três: 3 10 6 x
    • Juros simples: juros 1000 5% 12
    `);
            return true;
        }

        try {
            let result;
            let lower = expr.toLowerCase();

            // ---------- REGRA DE TRÊS ----------
            let regraMatch = expr.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+x$/);
            if (regraMatch) {
                let a = parseFloat(regraMatch[1]);
                let b = parseFloat(regraMatch[2]);
                let c = parseFloat(regraMatch[3]);
                result = (b * c) / a;
                sendSystemMessage(`📐 Regra de três: ${a} → ${b}, ${c} → x = ${result}`);
                return true;
            }

            // ---------- JUROS SIMPLES ----------
            let jurosMatch = expr.match(/^juros\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)$/i);
            if (jurosMatch) {
                let capital = parseFloat(jurosMatch[1]);
                let taxa = parseFloat(jurosMatch[2]) / 100;
                let tempo = parseFloat(jurosMatch[3]);
                let juros = capital * taxa * tempo;
                let total = capital + juros;
                sendSystemMessage(`💰 Juros simples: capital ${capital}, taxa ${taxa*100}%, tempo ${tempo}\nJuros = ${juros}\nMontante = ${total}`);
                return true;
            }

            // ---------- JUROS COMPOSTOS (COM PERÍODO: aa, am, ad) ----------
            let jurosCompMatch = expr.match(/^(?:juroscomposto|jc)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(aa|am|ad)\s+(\d+(?:\.\d+)?)$/i);
            if (jurosCompMatch) {
                let capital = parseFloat(jurosCompMatch[1]);
                let taxa = parseFloat(jurosCompMatch[2]) / 100;
                let unidade = jurosCompMatch[3].toLowerCase();
                let tempo = parseFloat(jurosCompMatch[4]);
                
                let unidadeTexto = { aa: 'ano(s)', am: 'mês(es)', ad: 'dia(s)' }[unidade];
                let montante = capital * Math.pow(1 + taxa, tempo);
                let juros = montante - capital;
                
                sendSystemMessage(`💰 Juros Compostos (${taxa*100}% ao ${unidadeTexto}):
            Capital: ${capital}
            Taxa: ${taxa*100}% ao ${unidadeTexto}
            Tempo: ${tempo} ${unidadeTexto}
            Montante: ${montante.toFixed(2)}
            Juros: ${juros.toFixed(2)}`);
                return true;
            }

            // ---------- CONVERSÕES DE UNIDADE ----------
            // Regex corrigida: agora aceita "para", "em", "pra" ou nada entre as unidades
            let convertMatch = expr.match(/^([\d\.]+)\s+([a-z]+)\s+(?:para|em|pra)?\s*([a-z]+)$/i);
            if (convertMatch) {
                let value = parseFloat(convertMatch[1]);
                let from = convertMatch[2].toLowerCase();
                let to = convertMatch[3].toLowerCase();
                result = convertUnits(value, from, to);
                if (result === null) {
                    sendSystemMessage(`❌ Conversão de "${from}" para "${to}" não suportada.`);
                } else {
                    sendSystemMessage(`🔄 ${value} ${from} = ${result} ${to}`);
                }
                return true;
            }

            // ---------- PORCENTAGEM EM CADEIA (20% de 30% de 500) ----------
            let chainMatch = expr.match(/^(\d+(?:\.\d+)?)%\s+de\s+(\d+(?:\.\d+)?)%\s+de\s+(\d+(?:\.\d+)?)$/);
            if (chainMatch) {
                let val = parseFloat(chainMatch[3]);
                val = (parseFloat(chainMatch[2]) / 100) * val;
                val = (parseFloat(chainMatch[1]) / 100) * val;
                result = val;
                sendSystemMessage(`📊 ${expr} = ${result}`);
                return true;
            }

            // ---------- PORCENTAGEM SIMPLES: X% de Y ----------
            let simplePercent = expr.match(/^(\d+(?:\.\d+)?)%\s+de\s+(\d+(?:\.\d+)?)$/);
            if (simplePercent) {
                let p = parseFloat(simplePercent[1]);
                let v = parseFloat(simplePercent[2]);
                result = (p / 100) * v;
                sendSystemMessage(`📊 ${p}% de ${v} = ${result}`);
                return true;
            }

            // ---------- OPERAÇÃO COM PORCENTAGEM (5% + 10% de 100) ----------
            let opPercent = expr.match(/^(\d+(?:\.\d+)?)%\s*([+\-*/])\s*(\d+(?:\.\d+)?)%\s+de\s+(\d+(?:\.\d+)?)$/);
            if (opPercent) {
                let p1 = parseFloat(opPercent[1]) / 100;
                let op = opPercent[2];
                let p2 = parseFloat(opPercent[3]) / 100;
                let base = parseFloat(opPercent[4]);
                let v1 = p1 * base;
                let v2 = p2 * base;
                if (op === '+') result = v1 + v2;
                else if (op === '-') result = v1 - v2;
                else if (op === '*') result = v1 * v2;
                else if (op === '/') result = v2 !== 0 ? v1 / v2 : 'Erro';
                sendSystemMessage(`📊 ${p1*100}% ${op} ${p2*100}% de ${base} = ${result}`);
                return true;
            }

            // ---------- ARITMÉTICA BÁSICA COM math.js (sem sin/cos/log) ----------
            let mathExpr = expr
                .replace(/(\d+(?:\.\d+)?)%/g, (_, p) => `(${p}/100)`)
                .replace(/\^/g, '**')
                .replace(/raiz\(/g, 'sqrt(')
                .replace(/√\(/g, 'sqrt(');

            // Permite apenas caracteres seguros
            if (!/^[\d\s+\-*/%^().,eEraiz√sqrtabs]+$/i.test(mathExpr)) {
                sendSystemMessage(`❌ Expressão inválida. Use apenas números, operadores + - * / ^ ( ) e %.`);
                return true;
            }
            result = math.evaluate(mathExpr);

            if (typeof result === 'number') {
                if (Math.abs(result) > 1e12 || (Math.abs(result) < 0.001 && result !== 0)) {
                    result = result.toExponential(6);
                } else {
                    result = parseFloat(result.toFixed(8)).toString();
                }
            }
            sendSystemMessage(`🧮 **${escapeHtml(expr)}** = \`${result}\``);

        } catch (e) {
            sendSystemMessage(`❌ Erro: ${e.message}\n\nUse números e operadores válidos.`);
        }
        return true;
    }

    return false;


    
}


// ========== CONVERSOR DE UNIDADES (VERSÃO CORRIGIDA) ==========
function convertUnits(value, from, to) {
    // Normaliza unidades (plurais, acentos, sinônimos)
    const normalize = (unit) => {
        let u = unit.toLowerCase().trim();
        // Remove acentos simples
        u = u.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        // Plurais e variações
        const map = {
            'metro': 'm', 'metros': 'm', 'm': 'm',
            'centimetro': 'cm', 'centimetros': 'cm', 'cm': 'cm',
            'milimetro': 'mm', 'milimetros': 'mm', 'mm': 'mm',
            'quilometro': 'km', 'quilometros': 'km', 'km': 'km',
            'milha': 'mi', 'milhas': 'mi', 'mi': 'mi',
            'pe': 'ft', 'pes': 'ft', 'ft': 'ft',
            'polegada': 'in', 'polegadas': 'in', 'in': 'in',
            'jarda': 'yd', 'jardas': 'yd', 'yd': 'yd',
            'kilograma': 'kg', 'kilogramas': 'kg', 'quilo': 'kg', 'quilos': 'kg', 'kg': 'kg',
            'grama': 'g', 'gramas': 'g', 'g': 'g',
            'libra': 'lb', 'libras': 'lb', 'lb': 'lb',
            'onca': 'oz', 'oncas': 'oz', 'oz': 'oz',
            'litro': 'l', 'litros': 'l', 'l': 'l',
            'mililitro': 'ml', 'mililitros': 'ml', 'ml': 'ml',
            'galao': 'gal', 'galoes': 'gal', 'gal': 'gal',
            'metroquadrado': 'm2', 'metrosquadrados': 'm2', 'm2': 'm2',
            'hectare': 'ha', 'hectares': 'ha', 'ha': 'ha',
            'alqueire': 'alq', 'alqueires': 'alq', 'alq': 'alq',
            'acre': 'ac', 'acres': 'ac', 'ac': 'ac',
            'horas': 'h', 'hora': 'h', 'h': 'h',
            'minutos': 'min', 'minuto': 'min', 'min': 'min',
            'segundos': 's', 'segundo': 's', 's': 's',
            'dia': 'd', 'dias': 'd', 'd': 'd',
            'semana': 'sem', 'semanas': 'sem', 'sem': 'sem',
            'mes': 'mes', 'meses': 'mes', 'mes': 'mes',
            'celsius': 'c', 'centigrado': 'c', 'c': 'c',
            'fahrenheit': 'f', 'f': 'f',
            'kelvin': 'k', 'k': 'k',
            'kilometrosporhora': 'kmh', 'km/h': 'kmh', 'kmh': 'kmh',
            'metrosporsegundo': 'ms', 'm/s': 'ms', 'ms': 'ms',
            'milhasporhora': 'mph', 'mph': 'mph',
            'noh': 'kt', 'nos': 'kt', 'kt': 'kt',
            'kilowatt hora': 'kwh', 'kwh': 'kwh',
            'btu': 'btu',
            'caloria': 'cal', 'calorias': 'cal', 'cal': 'cal',
            'psi': 'psi',
            'bar': 'bar',
            'atmosfera': 'atm', 'atm': 'atm',
            'byte': 'b', 'bytes': 'b', 'b': 'b',
            'kilobyte': 'kb', 'kb': 'kb',
            'megabyte': 'mb', 'mb': 'mb',
            'gigabyte': 'gb', 'gb': 'gb',
            'terabyte': 'tb', 'tb': 'tb',
            'megabitsporsegundo': 'mbps', 'mbps': 'mbps',
            'gigabitsporsegundo': 'gbps', 'gbps': 'gbps'
        };
        return map[u] || u;
    };
    
    from = normalize(from);
    to = normalize(to);
    
    // Tabela de conversão (igual à anterior, com as unidades normalizadas)
    const conversions = {
        // Distância
        'km': { 'm': 1000, 'cm': 100000, 'mm': 1e6, 'mi': 0.621371, 'ft': 3280.84, 'in': 39370.1, 'yd': 1093.61 },
        'm':  { 'km': 0.001, 'cm': 100, 'mm': 1000, 'mi': 0.000621371, 'ft': 3.28084, 'in': 39.3701, 'yd': 1.09361 },
        'cm': { 'm': 0.01, 'km': 0.00001, 'mm': 10, 'mi': 0.0000062137, 'ft': 0.0328084, 'in': 0.393701 },
        'mm': { 'cm': 0.1, 'm': 0.001, 'km': 0.000001, 'in': 0.0393701, 'ft': 0.00328084 },
        'mi': { 'km': 1.60934, 'm': 1609.34, 'ft': 5280, 'yd': 1760 },
        'ft': { 'm': 0.3048, 'cm': 30.48, 'km': 0.0003048, 'in': 12 },
        'in': { 'cm': 2.54, 'mm': 25.4, 'm': 0.0254, 'ft': 0.0833333 },
        'yd': { 'm': 0.9144, 'ft': 3, 'in': 36 },
        // Massa
        'kg': { 'g': 1000, 'lb': 2.20462, 'oz': 35.274 },
        'g':  { 'kg': 0.001, 'lb': 0.00220462, 'oz': 0.035274 },
        'lb': { 'kg': 0.453592, 'g': 453.592, 'oz': 16 },
        'oz': { 'g': 28.3495, 'kg': 0.0283495, 'lb': 0.0625 },
        // Volume
        'l':  { 'ml': 1000, 'gal': 0.264172, 'm3': 0.001 },
        'ml': { 'l': 0.001, 'm3': 0.000001, 'gal': 0.000264172 },
        'gal':{ 'l': 3.78541, 'ml': 3785.41 },
        'm3': { 'l': 1000, 'ml': 1e6, 'gal': 264.172 },
        // Área
        'm2': { 'km2': 0.000001, 'ha': 0.0001, 'alq': 0.000247105, 'ft2': 10.7639, 'ac': 0.000247105 },
        'km2':{ 'm2': 1e6, 'ha': 100, 'alq': 247.105, 'ac': 247.105 },
        'ha': { 'm2': 10000, 'km2': 0.01, 'alq': 2.47105, 'ac': 2.47105 },
        'alq':{ 'm2': 40468.6, 'km2': 0.00404686, 'ha': 0.404686, 'ac': 1 },
        'ac': { 'm2': 4046.86, 'km2': 0.00404686, 'ha': 0.404686, 'alq': 1 },
        // Velocidade
        'kmh':{ 'ms': 0.277778, 'mph': 0.621371, 'kt': 0.539957 },
        'ms': { 'kmh': 3.6, 'mph': 2.23694, 'kt': 1.94384 },
        'mph':{ 'kmh': 1.60934, 'ms': 0.44704, 'kt': 0.868976 },
        'kt': { 'kmh': 1.852, 'ms': 0.514444 },
        // Temperatura
        'c':{ 'f': (v) => (v * 9/5) + 32, 'k': (v) => v + 273.15 },
        'f':{ 'c': (v) => (v - 32) * 5/9, 'k': (v) => (v - 32) * 5/9 + 273.15 },
        'k':{ 'c': (v) => v - 273.15, 'f': (v) => (v - 273.15) * 9/5 + 32 },
        // Tempo (agora com 'd', 'sem', 'mes')
        'h': { 'min': 60, 's': 3600, 'd': 1/24, 'sem': 1/168, 'mes': 1/720 },
        'min':{ 'h': 1/60, 's': 60, 'd': 1/1440 },
        's': { 'min': 1/60, 'h': 1/3600, 'd': 1/86400 },
        'd': { 'h': 24, 'min': 1440, 's': 86400, 'sem': 1/7, 'mes': 1/30.44 },
        'sem':{ 'd': 7, 'h': 168, 'min': 10080, 's': 604800 },
        'mes':{ 'd': 30.44, 'h': 730.5, 'min': 43830, 's': 2.63e6 },
        // Energia
        'kwh':{ 'btu': 3412.14, 'cal': 860421, 'j': 3.6e6 },
        'btu':{ 'kwh': 0.000293071, 'cal': 251.996, 'j': 1055.06 },
        'cal':{ 'kwh': 1.162e-6, 'btu': 0.00396832, 'j': 4.184 },
        // Pressão
        'psi':{ 'bar': 0.0689476, 'atm': 0.068046, 'kpa': 6.89476 },
        'bar':{ 'psi': 14.5038, 'atm': 0.986923, 'kpa': 100 },
        'atm':{ 'psi': 14.6959, 'bar': 1.01325, 'kpa': 101.325 },
        // Dados
        'b':  { 'kb': 0.001, 'mb': 1e-6, 'gb': 1e-9, 'tb': 1e-12 },
        'kb': { 'b': 1000, 'mb': 0.001, 'gb': 1e-6, 'tb': 1e-9 },
        'mb': { 'b': 1e6, 'kb': 1000, 'gb': 0.001, 'tb': 1e-6 },
        'gb': { 'b': 1e9, 'kb': 1e6, 'mb': 1000, 'tb': 0.001 },
        'tb': { 'b': 1e12, 'kb': 1e9, 'mb': 1e6, 'gb': 1000 },
        'mbps':{ 'gbps': 0.001, 'kbps': 1000, 'bps': 1e6 },
        'gbps':{ 'mbps': 1000, 'kbps': 1e6, 'bps': 1e9 }
    };
    
    // Casos especiais (grama <-> litro para água)
    if (from === 'g' && to === 'l') return value / 1000;
    if (from === 'l' && to === 'g') return value * 1000;
    
    // Conversão direta
    if (conversions[from] && conversions[to] !== undefined) {
        const factor = conversions[from][to];
        if (typeof factor === 'function') return factor(value);
        return value * factor;
    }
    // Conversão inversa (se a tabela tiver de to para from)
    if (conversions[to] && conversions[from] !== undefined) {
        const factor = conversions[to][from];
        if (typeof factor === 'function') return factor(value);
        return value / factor;
    }
    return null;
}


// ========== MENSAGENS DE SISTEMA ==========
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

async function sendSystemMessage(text) {
    const systemMessage = {
        user_id: SYSTEM_USER_ID,
        content: text,
        mentions: [],
        is_system: true   // 🔥 flag de sistema
    };
    const { data: msg, error } = await db
        .from('geral_messages')
        .insert(systemMessage)
        .select()
        .single();
    if (error) {
        console.warn('Erro ao salvar mensagem de sistema:', error);
        return;
    }
    renderMessage(msg);
}


// ========== HIERARQUIA DE MODERAÇÃO ==========
function canModerate(targetUser, action = 'mute') {
    const roles = { 'user': 1, 'moderator': 2, 'supervisor': 3, 'admin': 4 };
    const targetRoleLevel = roles[targetUser.role];
    const currentRoleLevel = roles[currentUser.role];
    
    // Não pode agir sobre si mesmo
    if (currentUser.id === targetUser.id) return false;
    
    // Regras específicas por cargo
    if (currentUser.role === 'moderator' && (targetUser.role === 'supervisor' || targetUser.role === 'admin')) return false;
    if (currentUser.role === 'supervisor' && targetUser.role === 'admin') return false;
    
    // Se o cargo atual for menor que o alvo, não pode (exceto admin, que pode tudo)
    if (currentRoleLevel < targetRoleLevel && currentUser.role !== 'admin') return false;
    
    return true;
}



// ========== COMANDOS LÚDICOS ==========
function cmdHelp() {
    const helpHtml = `
        <div id="helpModal" class="modal-overlay" style="display:flex;">
            <div class="help-modal">
                <div class="help-header">
                    <h2>📖 Comandos Disponíveis</h2>
                    <button class="help-close" onclick="closeHelpModal()">✕</button>
                </div>
                <div class="help-content">
                    <div class="help-category">
                        <div class="help-cat-title">👤 Perfil</div>
                        <div class="help-cmd"><span class="cmd">/avatar [@usuario]</span> – Ver perfil (seu ou de outro)</div>
                    </div>
                    <div class="help-category">
                        <div class="help-cat-title">🎲 Diversão</div>
                        <div class="help-cmd"><span class="cmd">/dado [lados]</span> – Rola um dado (padrão 6)</div>
                        <div class="help-cmd"><span class="cmd">/caracoroa</span> – Cara ou coroa</div>
                        <div class="help-cmd"><span class="cmd">/simounao "pergunta"</span> – Resposta mágica</div>
                        <div class="help-cmd"><span class="cmd">/escolha op1, op2, ...</span> – Escolhe aleatoriamente</div>
                        <div class="help-cmd"><span class="cmd">/tweet "texto"</span> – Publica um tweet estilizado</div>
                        <div class="help-cmd"><span class="cmd">/give @usuario [item]</span> – Dá um presente (clique no item!)</div>
                    </div>
                    <div class="help-category">
                        <div class="help-cat-title">📊 Enquetes</div>
                        <div class="help-cmd"><span class="cmd">/sondagem "Pergunta" "Op1" "Op2" [...]</span> – Enquete com várias opções</div>
                        <div class="help-cmd"><span class="cmd">/vote "Pergunta"</span> – Enquete Sim/Não</div>
                    </div>
                    <div class="help-category">
                        <div class="help-cat-title">🎬 Memes/GIFs</div>
                        <div class="help-cmd"><span class="cmd">/gif nome</span> – Envia GIF cadastrado (ex: /gif meme01)</div>
                    </div>
                    <div class="help-category">
                        <div class="help-cat-title">🏆 Informação</div>
                        <div class="help-cmd"><span class="cmd">/hora</span> – Data/hora atual</div>
                        <div class="help-cmd"><span class="cmd">/ranking</span> – Top 10 mensagens da semana</div>
                        <div class="help-cmd"><span class="cmd">/crypto btc</span> – Cotação de criptomoeda (BTC, ETH, etc)</div>
                        <div class="help-cmd"><span class="cmd">/dolar</span> – Cotação do dólar comercial</div>
                        <div class="help-cmd"><span class="cmd">/quote</span> – Frase motivacional aleatória</div>
                    </div>
                    <div class="help-category">
                        <div class="help-cat-title">🎮 Jogos</div>
                        <div class="help-cmd"><span class="cmd">/rps pedra</span> – Jogue pedra, papel ou tesoura</div>
                    </div>
                    <div class="help-category">
                        <div class="help-cat-title">🧮 Calculadora /calc</div>
                        <div class="help-cmd"><span class="cmd">/calc 2+2*3</span> – Aritmética básica (+, -, *, /, ^, raiz)</div>
                        <div class="help-cmd"><span class="cmd">/calc 10% de 200</span> – Porcentagem simples</div>
                        <div class="help-cmd"><span class="cmd">/calc 5% + 10% de 100</span> – Operações com porcentagem</div>
                        <div class="help-cmd"><span class="cmd">/calc 20% de 30% de 500</span> – Porcentagem em cadeia</div>
                        <div class="help-cmd"><span class="cmd">/calc 100km para m</span> – Conversão de unidades (km,m,kg,g,l,ml,h,min,dias,semanas,°C,°F, etc)</div>
                        <div class="help-cmd"><span class="cmd">/calc 500g para l</span> – Gramas para litros (água)</div>
                        <div class="help-cmd"><span class="cmd">/calc 3 10 6 x</span> – Regra de três simples</div>
                        <div class="help-cmd"><span class="cmd">/calc juros 1000 5% 12</span> – Juros simples (capital, taxa, tempo)</div>
                        <div class="help-cmd"><span class="cmd">/calc jc 1000 5% am 12</span> – Juros compostos (aa=ano, am=mês, ad=dia)</div>
                        <div class="help-cmd"><span class="cmd">/converter 100km para m</span> – Atalho para conversões</div>
                        <div class="help-examples" style="margin-top:6px; color:#9ca3af; font-size:12px;">
                            💡 Exemplo: /calc 2 semanas para dias → 14 dias
                        </div>
                    </div>
                    <div class="help-category">
                        <div class="help-cat-title">🛡️ Moderação (admin/supervisor)</div>
                        <div class="help-cmd"><span class="cmd">/clear_sys</span> – Apaga mensagens do robô</div>
                        <div class="help-cmd"><span class="cmd">/clear</span> – Apaga TODO o chat (cuidado!)</div>
                        <div class="help-cmd"><span class="cmd">/addgif nome URL</span> – Cadastra novo GIF (admin/supervisor/moderador)</div>
                        <div class="help-cmd"><span class="cmd">/rankingsend</span> – Envia ranking no chat</div>
                    </div>
                    <div class="help-category">
                        <div class="help-cat-title">✨ Formatação</div>
                        <div class="help-cmd"><span class="cmd">**negrito**</span> <span class="cmd">*itálico*</span> <span class="cmd">__sublinhado__</span> <span class="cmd">~~riscado~~</span></div>
                        <div class="help-cmd">Links são automaticamente clicáveis 🔗</div>
                        <div class="help-cmd">Use @usuario para mencionar e notificar alguém</div>
                    </div>
                </div>
                <div class="help-footer">
                    <button class="help-close-btn" onclick="closeHelpModal()">Fechar</button>
                </div>
            </div>
        </div>
    `;
    // Remove modal existente
    const existing = document.getElementById('helpModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', helpHtml);
    // Fechar ao clicar fora do modal
    const modal = document.getElementById('helpModal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeHelpModal();
    });
}

function closeHelpModal() {
    const modal = document.getElementById('helpModal');
    if (modal) modal.remove();
}




// ========== RANKING SEMANAL ==========
async function showRanking() {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Buscar todas as mensagens da última semana
        const { data: messages, error } = await db
            .from('geral_messages')
            .select('user_id')
            .gte('created_at', sevenDaysAgo.toISOString());
        if (error) throw error;

        // Contar mensagens por usuário
        const counts = {};
        messages.forEach(msg => {
            counts[msg.user_id] = (counts[msg.user_id] || 0) + 1;
        });

        // Ordenar e pegar top 10
        let ranking = Object.entries(counts).map(([userId, count]) => ({ userId, count }));
        ranking.sort((a, b) => b.count - a.count);
        ranking = ranking.slice(0, 10);

        if (ranking.length === 0) {
            sendSystemMessage('📊 Nenhuma mensagem enviada na última semana.');
            return;
        }

        // Buscar dados dos usuários
        const userIds = ranking.map(r => r.userId);
        const { data: users, error: usersError } = await db
            .from('users')
            .select('id, username, role, avatar_url')
            .in('id', userIds);
        if (usersError) throw usersError;
        const userMap = {};
        users.forEach(u => { userMap[u.id] = u; });

        // Montar HTML do modal
        let rankingHtml = `
            <div id="rankingModal" class="modal-overlay" style="display:flex;">
                <div class="ranking-modal">
                    <div class="ranking-header">
                        <h2>🏆 Ranking Semanal</h2>
                        <button class="ranking-close" onclick="closeRankingModal()">✕</button>
                    </div>
                    <div class="ranking-list">
        `;

        ranking.forEach((item, index) => {
            const user = userMap[item.userId];
            if (!user) return;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index+1}º`;
            const avatarHtml = user.avatar_url 
                ? `<img src="${escapeHtml(user.avatar_url)}">`
                : `<span>${getInitials(user.username)}</span>`;
            rankingHtml += `
                <div class="ranking-item">
                    <div class="ranking-position">${medal}</div>
                    <div class="ranking-avatar">${avatarHtml}</div>
                    <div class="ranking-info">
                        <div class="ranking-username" style="color:${getRoleColor(user.role)}">${escapeHtml(user.username)}</div>
                        <div class="ranking-count">${item.count} mensagem${item.count !== 1 ? 's' : ''}</div>
                    </div>
                </div>
            `;
        });

        rankingHtml += `
                    </div>
                </div>
            </div>
        `;

        // Remover modal existente
        const existing = document.getElementById('rankingModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', rankingHtml);

        // Fechar ao clicar fora
        const modal = document.getElementById('rankingModal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeRankingModal();
        });
    } catch (e) {
        console.error(e);
        sendSystemMessage('❌ Erro ao carregar ranking.');
    }
}

async function sendRankingToChat() {
    try {
        const rankingData = await getRankingData();
        if (!rankingData) {
            sendSystemMessage('📊 Nenhuma mensagem enviada na última semana.');
            return;
        }
        const { ranking, userMap } = rankingData;
        let message = '🏆 **Ranking Semanal de Mensagens** 🏆\n\n';
        ranking.forEach((item, index) => {
            const user = userMap[item.userId];
            if (!user) return;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index+1}º`;
            message += `${medal} **${user.username}** – ${item.count} mensagem${item.count !== 1 ? 's' : ''}\n`;
        });
        sendSystemMessage(message);
    } catch (e) {
        console.error(e);
        sendSystemMessage('❌ Erro ao carregar ranking.');
    }
}

function closeRankingModal() {
    const modal = document.getElementById('rankingModal');
    if (modal) modal.remove();
}

function cmdTime() {
    const now = new Date();
    const formatted = now.toLocaleString('pt-BR', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    sendSystemMessage(`🕒 ${formatted}`);
}

function cmdRoll(args) {
    let sides = 6;
    if (args && args.length > 0) {
        const parsed = parseInt(args[0]);
        if (!isNaN(parsed) && parsed >= 2 && parsed <= 100) sides = parsed;
        else sendSystemMessage(`❌ Número inválido. Use /roll [2-100]. Usando 6 lados.`);
    }
    const result = Math.floor(Math.random() * sides) + 1;
    sendSystemMessage(`🎲 ${currentUser.username} rolou um dado de ${sides} lados e tirou: **${result}**`);
}

function cmdCoinflip() {
    const result = Math.random() < 0.5 ? 'Cara' : 'Coroa';
    sendSystemMessage(`🪙 ${currentUser.username} jogou uma moeda: **${result}**`);
}

function cmd8ball(question) {
    if (!question || question.length === 0) {
        sendSystemMessage(`❌ Faça uma pergunta! Ex: /8ball "Vou ganhar na loteria?"`);
        return;
    }
    const responses = [
        "Sim, definitivamente.", "Absolutamente sim.", "Sem dúvida.", "Pergunte novamente mais tarde.",
        "Melhor não te contar agora.", "Não posso prever agora.", "Concentre-se e pergunte novamente.",
        "Não conte com isso.", "Muito duvidoso.", "Não.", "Os sinais apontam que sim.", "HELL NAH", "DESISTA",
    ];
    const answer = responses[Math.floor(Math.random() * responses.length)];
    sendSystemMessage(`🎱 ${currentUser.username} perguntou: "${question}"\nResposta: **${answer}**`);
}



function openPresentModal(item, giver, receiver) {
    const modal = document.getElementById('presentModal');
    const giftContent = document.getElementById('presentGiftContent');
    const messageEl = document.getElementById('presentMessage');
    
    giftContent.innerHTML = escapeHtml(item);
    messageEl.innerHTML = `${escapeHtml(giver)} deu um presente para ${escapeHtml(receiver)}!<br><span style="font-size:14px; color:#f97316;">Clique fora ou no X para fechar</span>`;
    
    modal.style.display = 'flex';
}

function closePresentModal() {
    document.getElementById('presentModal').style.display = 'none';
}

// Fechar ao clicar fora do modal
document.getElementById('presentModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('presentModal')) {
        closePresentModal();
    }
});



async function getRankingData() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: messages, error } = await db
        .from('geral_messages')
        .select('user_id')
        .gte('created_at', sevenDaysAgo.toISOString());
    if (error) throw error;
    const counts = {};
    messages.forEach(msg => { counts[msg.user_id] = (counts[msg.user_id] || 0) + 1; });
    let ranking = Object.entries(counts).map(([userId, count]) => ({ userId, count }));
    ranking.sort((a, b) => b.count - a.count);
    ranking = ranking.slice(0, 10);
    if (ranking.length === 0) return null;
    const userIds = ranking.map(r => r.userId);
    const { data: users, error: usersError } = await db
        .from('users')
        .select('id, username, role, avatar_url')
        .in('id', userIds);
    if (usersError) throw usersError;
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });
    return { ranking, userMap };
}



//=========================================================MUTED===============================================================
async function isUserMuted(userId) {
    try {
        const { data, error } = await db
            .from('muted_users')
            .select('muted_until')
            .eq('user_id', userId)
            .maybeSingle();
        if (error || !data) return false;
        const mutedUntil = new Date(data.muted_until);
        if (mutedUntil > new Date()) {
            return mutedUntil;
        } else {
            // Limpar mute expirado
            await db.from('muted_users').delete().eq('user_id', userId);
            return false;
        }
    } catch (e) {
        console.warn(e);
        return false;
    }
}


async function addWarning(userId, warnedBy, reason) {
    await db.from('user_warnings').insert({
        user_id: userId,
        warned_by: warnedBy,
        reason: reason
    });
    // Contar avisos
    const { count, error } = await db
        .from('user_warnings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    if (error) return 0;
    return count || 0;
}

async function getWarningCount(userId) {
    const { count, error } = await db
        .from('user_warnings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
    if (error) return 0;
    return count || 0;
}

async function getWarnLimit() {
    const { data } = await db
        .from('system_settings')
        .select('value')
        .eq('key', 'warn_limit')
        .single();
    return data ? parseInt(data.value) : 3;
}

async function getMuteDurationMinutes() {
    const { data } = await db
        .from('system_settings')
        .select('value')
        .eq('key', 'mute_duration_minutes')
        .single();
    return data ? parseInt(data.value) : 30;
}

function isNearBottom(container, threshold = 150) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

function toggleScrollButton() {
  const container = document.getElementById('geralMessages');
  const btn = document.getElementById('scrollToBottomBtn');
  if (!container || !btn) return;
  
  if (isNearBottom(container)) {
    btn.classList.remove('visible');
  } else {
    btn.classList.add('visible');
  }
}

function scrollToBottom() {
  const container = document.getElementById('geralMessages');
  if (container) {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
    // Esconde a seta imediatamente (a rolagem vai disparar o scroll event e reavaliar)
    toggleScrollButton();
  }
}

//====================================================================================================
//Função para mostrar/esconder sugestões

function hideMentionSuggestions() {
  mentionSuggestions.classList.remove('open');
  mentionFilter = '';
  mentionSelectedIndex = 0;
}

function showMentionSuggestions(filterText) {
  const users = Object.values(allUsers);
  const filtered = users.filter(u =>
    u.username.toLowerCase().startsWith(filterText.toLowerCase())
  );

  if (filtered.length === 0) {
    hideMentionSuggestions();
    return;
  }

  mentionFilter = filterText;
  mentionSelectedIndex = 0;

  mentionSuggestions.innerHTML = '';
  filtered.forEach((user, idx) => {
    const div = document.createElement('div');
    div.className = 'mention-suggestion-item';
    if (idx === 0) div.classList.add('selected');

    const avatar = user.avatar_url
      ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">`
      : getInitials(user.username);

    div.innerHTML = `
      <div class="mention-suggestion-avatar">${avatar}</div>
      <span class="mention-suggestion-name">${escapeHtml(user.username)}</span>
      <span class="mention-suggestion-role">${user.role}</span>
    `;

    div.addEventListener('click', () => {
      insertMention(user.username);
    });

    mentionSuggestions.appendChild(div);
  });

  mentionSuggestions.classList.add('open');
}

function updateMentionSelection(delta) {
  const items = mentionSuggestions.querySelectorAll('.mention-suggestion-item');
  if (items.length === 0) return;
  items[mentionSelectedIndex].classList.remove('selected');
  mentionSelectedIndex = (mentionSelectedIndex + delta + items.length) % items.length;
  items[mentionSelectedIndex].classList.add('selected');
  items[mentionSelectedIndex].scrollIntoView({ block: 'nearest' });
}

function getSelectedMentionUser() {
  const items = mentionSuggestions.querySelectorAll('.mention-suggestion-item');
  if (items.length === 0) return null;
  const selected = items[mentionSelectedIndex];
  return selected.querySelector('.mention-suggestion-name').textContent;
}

function insertMention(username) {
  const input = document.getElementById('geralMessageInput');
  const cursorPos = input.selectionStart;
  const textBefore = input.value.substring(0, cursorPos);
  const textAfter = input.value.substring(cursorPos);

  // Encontra o início do @ (último @ antes do cursor)
  const atIndex = textBefore.lastIndexOf('@');
  if (atIndex === -1) {
    hideMentionSuggestions();
    return;
  }

  const newText = textBefore.substring(0, atIndex) + '@' + username + ' ' + textAfter;
  input.value = newText;
  const newCursor = atIndex + username.length + 2; // após "@username "
  input.selectionStart = input.selectionEnd = newCursor;
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  hideMentionSuggestions();
}