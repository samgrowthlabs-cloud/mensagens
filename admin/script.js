// Admin Script – Permissões: admin total, moderator limitado
let allUsers = [];
let editingUserId = null;
let currentUserRole = null;
let currentUserId = null;
let currentSort = { field: 'username', direction: 'asc' };
let filteredUsers = [];
let statsInterval = null;
let reactionsPollInterval = null; // <-- polling das reações

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticação
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
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
        window.location.href = '/chat/';
        return;
    }

    // Bloquear usuários banidos
    if (user.is_banned) {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#dc2626;font-size:24px;">🚫 ACESSO NEGADO</div>';
        return;
    }

    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (currentSort.field === field) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.field = field;
                currentSort.direction = 'asc';
            }
            updateSortArrows();
            renderUsersTable(sortUsers(filteredUsers.length ? filteredUsers : allUsers));
        });
    });
    
    currentUserRole = user.role;
    currentUserId = user.id;
    
    // Ajustar interface conforme o cargo
    setupUIByRole(user);
    
    // Carregar enquetes e anúncios (se admin)
    if (user.role === 'admin') {
        loadPolls();
        loadAnnouncements();
        startReactionsPolling(); // <-- inicia polling das reações
    }
    
    removeAdminOption();
    
    await loadUsers();
    await loadStats();
    statsInterval = setInterval(loadStats, 5000);
    await loadActivityLogs();

    window.addEventListener('beforeunload', () => {
        if (statsInterval) clearInterval(statsInterval);
        if (reactionsPollInterval) clearInterval(reactionsPollInterval);
    });
    
    document.getElementById('userSearch').addEventListener('input', debounce(filterUsers, 300));
});

// ========== CONFIGURAÇÃO DE INTERFACE POR CARGO ==========
function setupUIByRole(user) {
    const badge = document.querySelector('.admin-badge');
    if (badge) {
        badge.textContent = user.role === 'admin' ? 'ADMIN' : 'MODERADOR';
        badge.style.background = user.role === 'admin' ? 'var(--accent-admin)' : 'var(--accent-moderator)';
    }
    
    const btnAdd = document.getElementById('btnAddUser') || document.querySelector('.btn-add-user');
    if (btnAdd && user.role !== 'admin') btnAdd.style.display = 'none';
    
    if (user.role === 'moderator') {
        document.querySelectorAll('.col-email, .col-role').forEach(el => el.classList.add('hidden'));
    }

    const massActions = document.getElementById('massActions');
    if (massActions && user.role === 'admin') massActions.style.display = 'flex';

    if (user.role === 'admin') {
        document.getElementById('pollsSection').style.display = 'block';
        document.getElementById('announcementsSection').style.display = 'block';
    }
}

function removeAdminOption() {
    document.querySelectorAll('select.form-input option[value="admin"]').forEach(opt => opt.remove());
}

function getRoleColor(role) {
    const colors = { 'admin': '#dc2626', 'moderator': '#7c3aed', 'user': '#a0a0a0' };
    return colors[role] || colors.user;
}

// ========== USUÁRIOS ==========
async function loadUsers() {
    const users = await databaseManager.getAllUsers();
    allUsers = users || [];
    filteredUsers = [...allUsers];
    renderUsersTable(sortUsers(filteredUsers));
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    const isAdmin = currentUserRole === 'admin';
    
    if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 5 : 3}" style="text-align:center;padding:40px;">Nenhum usuário</td></tr>`;
        return;
    }
    
    tbody.innerHTML = users.map(user => {
        const isSelf = user.id === currentUserId;
        const canBan = (currentUserRole === 'admin' && user.role !== 'admin') ||
                       (currentUserRole === 'moderator' && user.role === 'user');
        
        let actions = '';
        if (isAdmin) {
            actions = `
                <button class="btn-action" onclick="showEditUserModal('${user.id}')">Editar</button>
                ${canBan ? (user.is_banned ? `<button class="btn-action success" onclick="toggleBanUser('${user.id}', false)">Desbanir</button>` : `<button class="btn-action danger" onclick="toggleBanUser('${user.id}', true)">Banir</button>`) : ''}
                <button class="btn-action warning" onclick="resetUserPassword('${user.id}')">Resetar</button>
                ${!isSelf && user.role !== 'admin' ? `<button class="btn-action" onclick="deleteUserConfirm('${user.id}')" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:#ef4444;">Excluir</button>` : ''}
            `;
        } else if (currentUserRole === 'moderator' && canBan) {
            actions = user.is_banned ? `<button class="btn-action success" onclick="toggleBanUser('${user.id}', false)">Desbanir</button>` : `<button class="btn-action danger" onclick="toggleBanUser('${user.id}', true)">Banir</button>`;
        }
        
        return `
            <tr>
                <td>
                    <div class="user-cell">
                        <div class="user-avatar-small">
                            ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">` : `<span>${getInitials(user.username)}</span>`}
                        </div>
                        <span style="color: ${getRoleColor(user.role)}; ${(currentUserRole !== 'moderator' || user.role !== 'admin') ? 'cursor: pointer;' : ''}" 
                            ${(currentUserRole !== 'moderator' || user.role !== 'admin') ? `onclick="showUserProfile('${user.id}')"` : ''} 
                            title="${(currentUserRole !== 'moderator' || user.role !== 'admin') ? 'Ver perfil de ' + escapeHtml(user.username) : 'Acesso restrito'}">
                            ${escapeHtml(user.username)}
                        </span>
                    </div>
                </td>
                ${isAdmin ? `<td class="col-email">${escapeHtml(user.email || '-')}</td>` : ''}
                ${isAdmin ? `<td class="col-role"><span class="role-badge-admin role-${user.role.toUpperCase()}">${user.role.toUpperCase()}</span></td>` : ''}
                <td><span class="status-badge ${user.is_banned ? 'banned' : user.status}">${user.is_banned ? 'Banido' : user.status}</span></td>
                <td class="col-edit"><div class="action-buttons">${actions}</div></td>
            </tr>
        `;
    }).join('');
}

function filterUsers(e) {
    const searchTerm = e.target.value.toLowerCase();
    filteredUsers = allUsers.filter(user => user.username.toLowerCase().includes(searchTerm) || (user.email && user.email.toLowerCase().includes(searchTerm)));
    renderUsersTable(sortUsers(filteredUsers));
}

function sortUsers(users) {
    const field = currentSort.field;
    const direction = currentSort.direction;
    return [...users].sort((a, b) => {
        let valA, valB;
        switch (field) {
            case 'username': valA = a.username.toLowerCase(); valB = b.username.toLowerCase(); break;
            case 'email': valA = (a.email || '').toLowerCase(); valB = (b.email || '').toLowerCase(); break;
            case 'role': const roleOrder = { admin: 3, moderator: 2, user: 1 }; valA = roleOrder[a.role] || 0; valB = roleOrder[b.role] || 0; break;
            case 'status': valA = a.is_banned ? 2 : (a.status === 'online' ? 1 : 0); valB = b.is_banned ? 2 : (b.status === 'online' ? 1 : 0); break;
            default: return 0;
        }
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateSortArrows() {
    document.querySelectorAll('.sortable .sort-arrow').forEach(arrow => arrow.classList.remove('asc', 'desc'));
    const activeHeader = document.querySelector(`.sortable[data-sort="${currentSort.field}"] .sort-arrow`);
    if (activeHeader) activeHeader.classList.add(currentSort.direction);
}

// ========== CRUD USUÁRIOS ==========
function showCreateUserModal() {
    if (currentUserRole !== 'admin') return;
    document.getElementById('createUserModal').style.display = 'flex';
}
function closeCreateUserModal() {
    document.getElementById('createUserModal').style.display = 'none';
    document.getElementById('newUsername').value = '';
    document.getElementById('newEmail').value = '';
    document.getElementById('newPassword').value = '';
}
async function createUser() {
    if (currentUserRole !== 'admin') { showToast('Apenas administradores podem criar usuários', 'error'); return; }
    const username = document.getElementById('newUsername').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    if (!username || !email || !password) { showToast('Preencha todos os campos', 'error'); return; }
    if (!validateEmail(email)) { showToast('Email inválido', 'error'); return; }
    if (!email.toLowerCase().endsWith('@bidjory.com')) { showToast('Apenas e-mails @bidjory.com são permitidos', 'error'); return; }
    if (!validateUsername(username)) { showToast('Username inválido (3-30 caracteres, apenas letras, números e _)', 'error'); return; }
    try {
        await databaseManager.createUser({ username, email, password, role });
        showToast('Usuário criado com sucesso', 'success');
        closeCreateUserModal();
        await loadUsers();
        await databaseManager.logActivity(currentUserId, 'USER_CREATED', { username, email });
    } catch (error) { showToast('Erro ao criar usuário: ' + error.message, 'error'); }
}

function showEditUserModal(userId) {
    if (currentUserRole !== 'admin') return;
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    editingUserId = userId;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editRole').value = user.role;
    document.getElementById('editNewPassword').value = '';
    const roleField = document.getElementById('editRole').closest('.form-group');
    if (userId === currentUserId) roleField.style.display = 'none';
    else roleField.style.display = '';
    document.getElementById('editUserModal').style.display = 'flex';
}
function closeEditUserModal() { document.getElementById('editUserModal').style.display = 'none'; editingUserId = null; }
async function saveUserEdit() {
    if (currentUserRole !== 'admin' || !editingUserId) return;
    const username = document.getElementById('editUsername').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const newPassword = document.getElementById('editNewPassword').value;
    try {
        const updates = {};
        if (username) updates.username = username;
        if (email) updates.email = email;
        if (editingUserId !== currentUserId) {
            const role = document.getElementById('editRole').value;
            if (role) updates.role = role;
        }
        await databaseManager.updateUser(editingUserId, updates);
        if (newPassword) { await databaseManager.updateUser(editingUserId, { password: newPassword }); showToast('Senha resetada com sucesso', 'success'); }
        showToast('Usuário atualizado', 'success');
        closeEditUserModal();
        await loadUsers();
    } catch (error) { showToast('Erro ao atualizar usuário: ' + error.message, 'error'); }
}

async function toggleBanUser(userId, ban) {
    const target = allUsers.find(u => u.id === userId);
    if (!target) return;
    if (currentUserRole === 'moderator' && target.role !== 'user') { showToast('Você só pode banir/desbanir usuários comuns', 'error'); return; }
    if (currentUserRole === 'admin' && target.role === 'admin') { showToast('Não é possível banir um administrador', 'error'); return; }
    const action = ban ? 'banir' : 'desbanir';
    showConfirmModal(ban ? '🚫 Confirmar Banimento' : '✅ Confirmar Desbanimento', `Tem certeza que deseja <strong>${action}</strong> o usuário <strong style="color:${getRoleColor(target.role)}">${escapeHtml(target.username)}</strong>?`, async () => {
        try {
            if (ban) await databaseManager.banUser(userId);
            else await databaseManager.unbanUser(userId);
            showToast(ban ? 'Usuário banido' : 'Usuário desbanido', 'success');
            await loadUsers();
        } catch (error) { showToast('Erro ao alterar status', 'error'); }
    });
}

async function resetUserPassword(userId) {
    if (currentUserRole !== 'admin') return;
    const user = allUsers.find(u => u.id === userId);
    const newPass = prompt('Digite a nova senha:');
    if (!newPass || newPass.length < 6) { if (newPass) showToast('Senha deve ter no mínimo 6 caracteres', 'error'); return; }
    showConfirmModal('🔒 Resetar Senha', `Deseja alterar a senha de <strong>${escapeHtml(user.username)}</strong>?`, async () => {
        try { await databaseManager.updateUser(userId, { password: newPass }); showToast('Senha resetada com sucesso', 'success'); } 
        catch (error) { showToast('Erro ao resetar senha', 'error'); }
    });
}

async function deleteUserConfirm(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    showConfirmModal('🗑️ Excluir Usuário', `Tem certeza que deseja <strong>excluir permanentemente</strong> o usuário <strong style="color:${getRoleColor(user.role)}">${escapeHtml(user.username)}</strong>?<br><br><small style="color:var(--text-tertiary);">Esta ação não pode ser desfeita. Todas as mensagens serão apagadas.</small>`, async () => {
        try { await databaseManager.deleteUser(userId); showToast(`Usuário ${user.username} excluído com sucesso`, 'success'); await loadUsers(); } 
        catch (error) { showToast('Erro ao excluir usuário: ' + error.message, 'error'); }
    });
}

// ========== ESTATÍSTICAS ==========
async function loadStats() {
    try {
        const { count: totalUsers } = await db.from('users').select('*', { count: 'exact', head: true });
        const { count: online } = await db.from('users').select('*', { count: 'exact', head: true }).eq('status', 'online');
        const { count: privateMessages } = await db.from('messages').select('*', { count: 'exact', head: true });
        const { count: geralMessages } = await db.from('geral_messages').select('*', { count: 'exact', head: true });
        const totalMessages = (privateMessages || 0) + (geralMessages || 0);
        const { count: banned } = await db.from('users').select('*', { count: 'exact', head: true }).eq('is_banned', true);
        document.getElementById('statTotalUsers').textContent = totalUsers || 0;
        document.getElementById('statOnline').textContent = online || 0;
        document.getElementById('statPrivateMessages').textContent = privateMessages || 0;
        document.getElementById('statGeralMessages').textContent = geralMessages || 0;
        document.getElementById('statTotalMessages').textContent = totalMessages;
        document.getElementById('statBanned').textContent = banned || 0;
    } catch (error) { console.error('Erro ao carregar estatísticas:', error); }
}

// ========== LOGS ==========
async function loadActivityLogs() {
    const tbody = document.getElementById('logsTableBody');
    try {
        const { data: logs, error } = await db.from('activity_logs').select(`id, action, created_at, user:users(username, role)`).order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        if (!logs || logs.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--text-tertiary);">Nenhuma atividade registrada</td></tr>'; return; }
        tbody.innerHTML = logs.map(log => {
            const username = log.user?.username || 'Sistema';
            const role = log.user?.role || '';
            const roleColor = getRoleColor(role);
            const time = formatTime(log.created_at);
            const actionLabels = { 'LOGIN': '🔑 Login', 'LOGOUT': '🚪 Logout', 'PASSWORD_CHANGED': '🔒 Alterou senha', 'USER_CREATED': '✨ Usuário criado', 'USER_BANNED': '🚫 Usuário banido', 'USER_UNBANNED': '✅ Usuário desbanido', 'USER_DELETED': '🗑️ Usuário excluído' };
            const actionLabel = actionLabels[log.action] || log.action;
            return `<tr><td><span style="color: ${roleColor}; font-weight: 500;">${escapeHtml(username)}</span></td><td>${actionLabel}</td><td style="color: var(--text-tertiary); font-size: 13px;">${time}</td></tr>`;
        }).join('');
    } catch (error) { console.error('Erro ao carregar logs:', error); tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--accent-danger);">Erro ao carregar atividades</td></tr>'; }
}

// ========== MODAL DE CONFIRMAÇÃO ==========
function showConfirmModal(title, message, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width: 420px;"><h2 class="modal-title">${title}</h2><div class="modal-body">${message}</div><div class="modal-footer"><button class="btn-cancel" id="confirmCancelBtn">Cancelar</button><button class="btn-save" id="confirmOkBtn" style="background: #ef4444; color: #fff;">Confirmar</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('confirmCancelBtn').onclick = () => modal.remove();
    document.getElementById('confirmOkBtn').onclick = () => { modal.remove(); onConfirm(); };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ========== VISUALIZAR MENSAGENS DO USUÁRIO ==========
async function viewUserMessages(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    const { data: sent } = await db.from('messages').select('*').eq('sender_id', userId).order('created_at', { ascending: false }).limit(10);
    const { data: received } = await db.from('messages').select('*').eq('receiver_id', userId).order('created_at', { ascending: false }).limit(10);
    const allMessages = [...(sent || []), ...(received || [])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,15);
    const userIds = new Set(allMessages.map(m=>m.sender_id).concat(allMessages.map(m=>m.receiver_id)));
    const { data: users } = await db.from('users').select('id, username').in('id', Array.from(userIds));
    const userMap = {}; (users || []).forEach(u=>{ userMap[u.id]=u.username; });
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:650px; max-height:80vh; overflow-y:auto;"><h2 class="modal-title">💬 Mensagens de ${escapeHtml(user.username)}</h2><div class="modal-body">${allMessages.length===0?'<p style="text-align:center;color:var(--text-tertiary);">Nenhuma mensagem encontrada</p>':allMessages.map(m=>{const otherUser=m.sender_id===userId?userMap[m.receiver_id]||'?':userMap[m.sender_id]||'?'; const isSender=m.sender_id===userId; return `<div style="padding:8px 0; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;"><div style="flex:1;"><div style="font-size:12px; color:${isSender?'#22c55e':'#7c3aed'}; margin-bottom:4px;">${isSender?'Enviou para':'Recebeu de'} <strong>${escapeHtml(otherUser)}</strong><span style="float:right; color:var(--text-tertiary);">${formatTime(m.created_at)}</span></div><div style="font-size:13px; color:var(--text-primary);">${escapeHtml(m.content.length>80?m.content.substring(0,80)+'...':m.content)}</div></div>${currentUserRole==='admin'&&!m.deleted?`<button class="btn-action" onclick="event.stopPropagation(); deleteSingleMessage('${m.id}','${userId}')" style="margin-left:12px; background:rgba(239,68,68,0.1); color:#ef4444; border-color:#ef4444; flex-shrink:0;">🗑️</button>`:''}</div>`;}).join('')}</div><div class="modal-footer"><button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Fechar</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal._userId = userId;
}

async function deleteSingleMessage(messageId, userId) {
    if (!confirm('Excluir esta mensagem permanentemente?')) return;
    try { await databaseManager.adminDeleteMessage(messageId); showToast('Mensagem excluída', 'success'); const oldModal = document.querySelector('.modal-overlay'); if (oldModal) oldModal.remove(); viewUserMessages(userId); } 
    catch (error) { showToast('Erro ao excluir mensagem: ' + error.message, 'error'); }
}

// ========== PERFIL DO USUÁRIO (MODAL) ==========
async function showUserProfile(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    const { count: sentCount } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', userId);
    const { count: receivedCount } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', userId);
    const { data: lastMessage } = await db.from('messages').select('created_at').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`).order('created_at', { ascending: false }).limit(1);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:500px;"><h2 class="modal-title" style="color: ${getRoleColor(user.role)}">👤 ${escapeHtml(user.username)}</h2><div class="modal-body"><div style="text-align:center; margin-bottom:20px;"><div style="width:80px;height:80px;border-radius:50%;background:#1c1c1c;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;overflow:hidden;">${user.avatar_url?`<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">`:`<span style="font-size:30px;">${getInitials(user.username)}</span>`}</div><span class="role-badge-admin role-${user.role.toUpperCase()}">${user.role.toUpperCase()}</span></div><div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;"><div><strong>Email:</strong><br>${escapeHtml(user.email||'-')}</div><div><strong>Status:</strong><br>${user.is_banned?'🚫 Banido':user.status==='online'?'🟢 Online':'⚫ Offline'}</div><div><strong>Cadastro:</strong><br>${new Date(user.created_at).toLocaleDateString('pt-BR')}</div><div><strong>Última atividade:</strong><br>${user.last_seen?formatTime(user.last_seen):'-'}</div><div><strong>Msgs enviadas:</strong><br>${sentCount||0}</div><div><strong>Msgs recebidas:</strong><br>${receivedCount||0}</div></div>${lastMessage?.length?`<div style="margin-top:16px;"><strong>Última mensagem:</strong><br>${formatTime(lastMessage[0].created_at)}</div>`:''}</div><div class="modal-footer"><button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Fechar</button><button class="btn-action" onclick="this.closest('.modal-overlay').remove(); viewUserMessages('${userId}')">💬 Ver mensagens</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function exportCSV() {
    const users = filteredUsers.length ? filteredUsers : allUsers;
    const headers = ['Username', 'Email', 'Cargo', 'Status', 'Banido', 'Cadastro'];
    const rows = users.map(u => [u.username, u.email || '', u.role, u.status, u.is_banned ? 'Sim' : 'Não', new Date(u.created_at).toLocaleDateString('pt-BR')]);
    let csv = headers.join(',') + '\n';
    rows.forEach(row => { csv += row.map(cell => `"${cell}"`).join(',') + '\n'; });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usuarios_bidjorchat_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}

// ========== VERIFICAÇÃO DE SENHA E AÇÕES EM MASSA ==========
async function verifyAdminPassword(password) {
    const user = sessionManager.getCurrentUser();
    if (!user) return false;
    const dbUser = await databaseManager.getUserById(user.id);
    if (!dbUser) return false;
    return await cryptoManager.verifyPassword(password, dbUser.password_hash);
}
function showPasswordModal(title, onSuccess) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:420px;"><h2 class="modal-title">${title}</h2><div class="modal-body"><p style="color: var(--text-secondary); margin-bottom:12px;">Digite sua senha para confirmar:</p><input type="password" id="confirmPasswordInput" class="form-input" placeholder="Sua senha" autocomplete="current-password"><p id="passwordError" style="color: var(--accent-danger); font-size:13px; margin-top:8px; display:none;"></p></div><div class="modal-footer"><button class="btn-cancel" id="cancelPasswordBtn">Cancelar</button><button class="btn-save" id="confirmPasswordBtn" style="background:#ef4444; color:#fff;">Confirmar</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('cancelPasswordBtn').onclick = () => modal.remove();
    document.getElementById('confirmPasswordBtn').onclick = async () => {
        const passwordInput = document.getElementById('confirmPasswordInput');
        const errorEl = document.getElementById('passwordError');
        const password = passwordInput.value;
        if (!password) { errorEl.textContent = 'Digite sua senha.'; errorEl.style.display = 'block'; return; }
        const valid = await verifyAdminPassword(password);
        if (!valid) { errorEl.textContent = 'Senha incorreta.'; errorEl.style.display = 'block'; return; }
        modal.remove();
        onSuccess();
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}
async function deleteAllUsers() {
    showPasswordModal('🔐 Confirmar exclusão em massa', async () => {
        try { const { error } = await db.from('users').delete().neq('role', 'admin'); if (error) throw error; showToast('Todos os usuários (exceto admins) foram excluídos.', 'success'); await loadUsers(); await loadStats(); } 
        catch (error) { showToast('Erro ao excluir usuários: ' + error.message, 'error'); }
    });
}
async function deleteAllPrivateMessages() {
    showPasswordModal('Apagar mensagens privadas', async () => {
        try { const { error } = await db.from('messages').delete().gt('created_at', '2000-01-01'); if (error) throw error; showToast('Mensagens privadas apagadas.', 'success'); await loadStats(); await loadActivityLogs(); } 
        catch (e) { showToast('Erro: ' + e.message, 'error'); }
    });
}
async function deleteAllGeralMessages() {
    showPasswordModal('Apagar mensagens gerais', async () => {
        try { const { error } = await db.from('geral_messages').delete().gt('created_at', '2000-01-01'); if (error) throw error; showToast('Mensagens gerais apagadas.', 'success'); await loadStats(); await loadActivityLogs(); } 
        catch (e) { showToast('Erro: ' + e.message, 'error'); }
    });
}
async function deleteAllMessages() {
    showPasswordModal('Apagar TODAS as mensagens', async () => {
        try { await db.from('messages').delete().gt('created_at', '2000-01-01'); await db.from('geral_messages').delete().gt('created_at', '2000-01-01'); showToast('Todas as mensagens foram apagadas.', 'success'); await loadStats(); await loadActivityLogs(); } 
        catch (e) { showToast('Erro: ' + e.message, 'error'); }
    });
}

// ========== ENQUETES ==========
async function loadPolls() {
    const tbody = document.getElementById('pollsTableBody');
    try {
        const { data: polls, error } = await db.from('polls').select('*').order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        if (!polls || polls.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-tertiary);">Nenhuma enquete</td></tr>'; return; }
        tbody.innerHTML = polls.map(poll => `<tr><td><strong>${escapeHtml(poll.question)}</strong></td><td><span class="poll-status ${poll.is_active?'active':'ended'}">${poll.is_active?'Ativa':'Encerrada'}</span></td><td>${formatTime(poll.created_at)}</td><td><div class="action-buttons"><button class="btn-action" onclick="viewPollResults('${poll.id}')">📊 Resultados</button>${poll.is_active?`<button class="btn-action danger" onclick="endPoll('${poll.id}')">🚫 Encerrar</button>`:''}<button class="btn-action" onclick="deletePoll('${poll.id}')" style="color:#ef4444;border-color:#ef4444;">🗑️</button></div></td></tr>`).join('');
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--accent-danger);">Erro ao carregar enquetes</td></tr>'; }
}

function showCreatePollModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:550px;"><h2 class="modal-title">Nova Enquete</h2><div class="modal-body"><div class="form-group"><label>Pergunta</label><input type="text" id="pollQuestion" class="form-input" placeholder="Digite a pergunta..."></div><div class="form-group"><label>Opções</label><div id="pollOptionsContainer"><div class="poll-option-row"><input type="text" class="form-input poll-option-input" placeholder="Opção 1"><button type="button" class="btn-remove-option" onclick="removePollOption(this)" style="display:none;">×</button></div><div class="poll-option-row"><input type="text" class="form-input poll-option-input" placeholder="Opção 2"><button type="button" class="btn-remove-option" onclick="removePollOption(this)" style="display:none;">×</button></div></div><button type="button" class="btn-add-option" onclick="addPollOption()">+ Adicionar opção</button></div></div><div class="modal-footer"><button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Cancelar</button><button class="btn-save" id="createPollBtn">Criar Enquete</button></div></div>`;
    document.body.appendChild(modal);
    updateRemoveButtons();
    document.getElementById('createPollBtn').onclick = async () => {
        const question = document.getElementById('pollQuestion').value.trim();
        const optionInputs = document.querySelectorAll('.poll-option-input');
        const options = Array.from(optionInputs).map(input => input.value.trim()).filter(val => val !== '');
        if (!question) { showToast('Digite a pergunta', 'error'); return; }
        if (options.length < 2) { showToast('Adicione pelo menos 2 opções', 'error'); return; }
        try { await db.from('polls').insert({ question, options: JSON.stringify(options), created_by: currentUserId, is_active: true }); showToast('Enquete criada!', 'success'); modal.remove(); loadPolls(); } 
        catch (e) { showToast('Erro: ' + e.message, 'error'); }
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}
function addPollOption() {
    const container = document.getElementById('pollOptionsContainer');
    const row = document.createElement('div');
    row.className = 'poll-option-row';
    row.innerHTML = `<input type="text" class="form-input poll-option-input" placeholder="Nova opção"><button type="button" class="btn-remove-option" onclick="removePollOption(this)">×</button>`;
    container.appendChild(row);
    updateRemoveButtons();
    row.querySelector('input').focus();
}
function removePollOption(button) {
    const row = button.closest('.poll-option-row');
    const container = document.getElementById('pollOptionsContainer');
    if (container.children.length <= 2) { showToast('Mínimo de 2 opções', 'warning'); return; }
    row.remove();
    updateRemoveButtons();
}
function updateRemoveButtons() {
    const rows = document.querySelectorAll('.poll-option-row');
    rows.forEach(row => { const btn = row.querySelector('.btn-remove-option'); if (btn) btn.style.display = rows.length > 2 ? '' : 'none'; });
}
async function endPoll(pollId) {
    showConfirmModal('Encerrar Enquete', 'Tem certeza que deseja encerrar esta enquete?', async () => { await db.from('polls').update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', pollId); showToast('Enquete encerrada', 'success'); loadPolls(); });
}
async function deletePoll(pollId) {
    showConfirmModal('Excluir Enquete', 'Isso apagará a enquete e todos os votos.', async () => { await db.from('polls').delete().eq('id', pollId); showToast('Enquete excluída', 'success'); loadPolls(); });
}
async function viewPollResults(pollId) {
    const { data: poll } = await db.from('polls').select('*').eq('id', pollId).single();
    if (!poll) return;
    const { data: votes } = await db.from('poll_votes').select('*').eq('poll_id', pollId);
    const options = JSON.parse(poll.options);
    const counts = new Array(options.length).fill(0);
    (votes || []).forEach(v => { if (v.option_index < counts.length) counts[v.option_index]++; });
    const total = counts.reduce((a,b)=>a+b,0);
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:500px;"><h2 class="modal-title">📊 Resultados: ${escapeHtml(poll.question)}</h2><div class="modal-body">${options.map((opt,i)=>{const pct=total>0?Math.round((counts[i]/total)*100):0; return `<div style="margin-bottom:12px;"><div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>${escapeHtml(opt)}</span><span style="color:var(--text-secondary);">${counts[i]} voto(s) (${pct}%)</span></div><div style="background:var(--bg-tertiary);border-radius:8px;height:8px;overflow:hidden;"><div style="background:var(--accent-mod);height:100%;width:${pct}%;transition:width 0.3s;"></div></div></div>`;}).join('')}<p style="text-align:center;color:var(--text-tertiary);margin-top:16px;">Total de votos: ${total}</p></div><div class="modal-footer"><button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Fechar</button></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ========== ANÚNCIOS COM REAÇÕES (ADMIN) ==========
async function loadAnnouncements() {
    const tbody = document.getElementById('announcementsTableBody');
    try {
        const { data: announcements, error } = await db.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        if (!announcements || announcements.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-tertiary);">Nenhum anúncio</td></tr>'; return; }
        tbody.innerHTML = '';
        for (const a of announcements) {
            const row = tbody.insertRow();
            row.innerHTML = `<td><strong>${escapeHtml(a.title)}</strong></td><td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(a.content)}</td><td class="reactions-cell" data-announcement-id="${a.id}">Carregando...</td><td>${formatTime(a.created_at)}</td><td><button class="btn-action" onclick="deleteAnnouncement('${a.id}')" style="color:#ef4444;border-color:#ef4444;">🗑️ Excluir</button></td>`;
            const reactionsCell = row.querySelector('.reactions-cell');
            await renderReactionsForAnnouncement(a.id, reactionsCell);
        }
    } catch (e) { console.error(e); tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--accent-danger);">Erro ao carregar anúncios</td></tr>'; }
}

async function loadAnnouncementReactions(announcementId) {
    try {
        const { data: reactions } = await db.from('announcement_reactions').select('*, users(username)').eq('announcement_id', announcementId);
        if (!reactions) return {};
        const grouped = {};
        reactions.forEach(r => {
            if (!grouped[r.reaction]) grouped[r.reaction] = { count: 0, users: [] };
            grouped[r.reaction].count++;
            grouped[r.reaction].users.push(r.users?.username || 'Desconhecido');
        });
        return grouped;
    } catch (e) { console.warn('Erro ao carregar reações:', e); return {}; }
}

async function renderReactionsForAnnouncement(announcementId, containerElement) {
    const reactions = await loadAnnouncementReactions(announcementId);
    if (!Object.keys(reactions).length) { containerElement.innerHTML = '<span style="color:var(--text-tertiary);">—</span>'; return; }
    let html = '<div class="admin-reactions-compact">';
    for (const [emoji, data] of Object.entries(reactions)) {
        html += `<div class="admin-reaction-badge" title="${data.users.join(', ')}">${emoji} ${data.count}</div>`;
    }
    html += '</div>';
    containerElement.innerHTML = html;
}

function startReactionsPolling() {
    if (reactionsPollInterval) clearInterval(reactionsPollInterval);
    reactionsPollInterval = setInterval(async () => {
        const cells = document.querySelectorAll('.reactions-cell');
        for (const cell of cells) {
            const announcementId = cell.getAttribute('data-announcement-id');
            if (announcementId) await renderReactionsForAnnouncement(announcementId, cell);
        }
    }, 5000);
}

function showCreateAnnouncementModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `<div class="modal" style="max-width:550px;"><h2 class="modal-title">📢 Novo Anúncio</h2><div class="modal-body"><div class="form-group"><label>Título</label><input type="text" id="announcementTitle" class="form-input" placeholder="Título do anúncio..."></div><div class="form-group"><label>Conteúdo</label><textarea id="announcementContent" class="form-input" rows="6" placeholder="Descreva o anúncio..."></textarea></div></div><div class="modal-footer"><button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Cancelar</button><button class="btn-save" id="createAnnouncementBtn">Publicar Anúncio</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('createAnnouncementBtn').onclick = async () => {
        const title = document.getElementById('announcementTitle').value.trim();
        const content = document.getElementById('announcementContent').value.trim();
        if (!title || !content) { showToast('Preencha título e conteúdo', 'error'); return; }
        try { await db.from('announcements').insert({ title, content, created_by: currentUserId }); showToast('Anúncio publicado!', 'success'); modal.remove(); loadAnnouncements(); } 
        catch (e) { showToast('Erro: ' + e.message, 'error'); }
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function deleteAnnouncement(id) {
    if (!confirm('Excluir este anúncio?')) return;
    try { await db.from('announcements').delete().eq('id', id); showToast('Anúncio excluído', 'success'); loadAnnouncements(); } 
    catch (e) { showToast('Erro ao excluir', 'error'); }
}

// ========== UTILITÁRIOS GERAIS ==========
async function handleLogout() {
    await sessionManager.logout();
    if (statsInterval) clearInterval(statsInterval);
    if (reactionsPollInterval) clearInterval(reactionsPollInterval);
    window.location.href = '/login/';
}
function goToChat() { window.location.href = '/chat/'; }