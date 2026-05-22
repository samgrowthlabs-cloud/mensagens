// Admin Script – Permissões: admin total, moderator limitado
let allUsers = [];
let editingUserId = null;
let currentUserRole = null;
let currentUserId = null;
let currentSort = { field: 'username', direction: 'asc' };
let filteredUsers = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticação
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
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
        window.location.href = '/chat/index.html';
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
    
    // Remover opção "admin" dos selects (nunca pode ser atribuído)
    removeAdminOption();
    
    await loadUsers();
    await loadStats();
    await loadActivityLogs();
    
    document.getElementById('userSearch').addEventListener('input', debounce(filterUsers, 300));
});

function setupUIByRole(user) {
    const badge = document.querySelector('.admin-badge');
    if (badge) {
        badge.textContent = user.role === 'admin' ? 'ADMIN' : 'MODERADOR';
        badge.style.background = user.role === 'admin' ? 'var(--accent-admin)' : 'var(--accent-moderator)';
    }
    
    // Moderador não vê botão "Novo Usuário"
    const btnAdd = document.getElementById('btnAddUser') || document.querySelector('.btn-add-user');
    if (btnAdd && user.role !== 'admin') {
        btnAdd.style.display = 'none';
    }
    
    // Moderador não vê colunas Email, Cargo e ações de Editar/Resetar
    if (user.role === 'moderator') {
    document.querySelectorAll('.col-email, .col-role').forEach(el => el.classList.add('hidden'));
    }
}

function removeAdminOption() {
    // Remove a opção "admin" de todos os selects de role
    document.querySelectorAll('select.form-input option[value="admin"]').forEach(opt => opt.remove());
}

function getRoleColor(role) {
    const colors = {
        'admin': '#dc2626',
        'moderator': '#7c3aed',
        'user': '#a0a0a0'
    };
    return colors[role] || colors.user;
}

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
                ${canBan ? 
                    (user.is_banned ? 
                        `<button class="btn-action success" onclick="toggleBanUser('${user.id}', false)">Desbanir</button>` :
                        `<button class="btn-action danger" onclick="toggleBanUser('${user.id}', true)">Banir</button>`) : ''
                }
                <button class="btn-action warning" onclick="resetUserPassword('${user.id}')">Resetar</button>
                ${!isSelf && user.role !== 'admin' ? 
                    `<button class="btn-action" onclick="deleteUserConfirm('${user.id}')" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:#ef4444;">Excluir</button>` : ''
                }
            `;
        } else if (currentUserRole === 'moderator') {
            if (canBan) {
                actions = user.is_banned ? 
                    `<button class="btn-action success" onclick="toggleBanUser('${user.id}', false)">Desbanir</button>` :
                    `<button class="btn-action danger" onclick="toggleBanUser('${user.id}', true)">Banir</button>`;
            }
        }
        
        return `
            <tr>
                <td>
                    <div class="user-cell">
                        <div class="user-avatar-small">
                            ${user.avatar_url ? 
                                `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">` :
                                `<span>${getInitials(user.username)}</span>`
                            }
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
                <td>
                    <span class="status-badge ${user.is_banned ? 'banned' : user.status}">
                        ${user.is_banned ? 'Banido' : user.status}
                    </span>
                </td>
                <td class="col-edit">
                    <div class="action-buttons">${actions}</div>
                </td>
            </tr>`;
    }).join('');
}

function filterUsers(e) {
    const searchTerm = e.target.value.toLowerCase();
    filteredUsers = allUsers.filter(user => 
        user.username.toLowerCase().includes(searchTerm) ||
        (user.email && user.email.toLowerCase().includes(searchTerm))
    );
    renderUsersTable(sortUsers(filteredUsers));
}

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
    if (currentUserRole !== 'admin') {
        showToast('Apenas administradores podem criar usuários', 'error');
        return;
    }
    
    const username = document.getElementById('newUsername').value.trim();
    const email = document.getElementById('newEmail').value.trim();
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    
    if (!username || !email || !password) {
        showToast('Preencha todos os campos', 'error');
        return;
    }
    
    if (!validateEmail(email)) {
        showToast('Email inválido', 'error');
        return;
    }
    
    if (!validateUsername(username)) {
        showToast('Username inválido (3-30 caracteres, apenas letras, números e _)', 'error');
        return;
    }
    
    try {
        await databaseManager.createUser({ username, email, password, role });
        showToast('Usuário criado com sucesso', 'success');
        closeCreateUserModal();
        await loadUsers();
    } catch (error) {
        showToast('Erro ao criar usuário: ' + error.message, 'error');
    }

    await databaseManager.logActivity(newUser.id, 'USER_CREATED');
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
    document.getElementById('editUserModal').style.display = 'flex';
}

function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
    editingUserId = null;
}

async function saveUserEdit() {
    if (currentUserRole !== 'admin') return;
    if (!editingUserId) return;
    
    const username = document.getElementById('editUsername').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const role = document.getElementById('editRole').value;
    const newPassword = document.getElementById('editNewPassword').value;
    
    try {
        const updates = {};
        if (username) updates.username = username;
        if (email) updates.email = email;
        if (role) updates.role = role;
        
        await databaseManager.updateUser(editingUserId, updates);
        
        if (newPassword) {
            await databaseManager.updateUser(editingUserId, { password: newPassword });
            showToast('Senha resetada com sucesso', 'success');
        }
        
        showToast('Usuário atualizado', 'success');
        closeEditUserModal();
        await loadUsers();
    } catch (error) {
        showToast('Erro ao atualizar usuário: ' + error.message, 'error');
    }
}

async function toggleBanUser(userId, ban) {
    const target = allUsers.find(u => u.id === userId);
    if (!target) return;
    if (currentUserRole === 'moderator' && target.role !== 'user') {
        showToast('Você só pode banir/desbanir usuários comuns', 'error');
        return;
    }
    if (currentUserRole === 'admin' && target.role === 'admin') {
        showToast('Não é possível banir um administrador', 'error');
        return;
    }
    const action = ban ? 'banir' : 'desbanir';
    showConfirmModal(
        ban ? '🚫 Confirmar Banimento' : '✅ Confirmar Desbanimento',
        `Tem certeza que deseja <strong>${action}</strong> o usuário <strong style="color:${getRoleColor(target.role)}">${escapeHtml(target.username)}</strong>?`,
        async () => {
            try {
                if (ban) await databaseManager.banUser(userId);
                else await databaseManager.unbanUser(userId);
                showToast(ban ? 'Usuário banido' : 'Usuário desbanido', 'success');
                await loadUsers();
            } catch (error) {
                showToast('Erro ao alterar status', 'error');
            }
        }
    );
}

async function resetUserPassword(userId) {
    if (currentUserRole !== 'admin') return;
    const user = allUsers.find(u => u.id === userId);
    const newPass = prompt('Digite a nova senha:');
    if (!newPass) return;
    if (newPass.length < 6) {
        showToast('Senha deve ter no mínimo 6 caracteres', 'error');
        return;
    }
    showConfirmModal(
        '🔒 Resetar Senha',
        `Deseja alterar a senha de <strong>${escapeHtml(user.username)}</strong>?`,
        async () => {
            try {
                await databaseManager.updateUser(userId, { password: newPass });
                showToast('Senha resetada com sucesso', 'success');
            } catch (error) {
                showToast('Erro ao resetar senha', 'error');
            }
        }
    );
}

async function handleLogout() {
    await sessionManager.logout();
    window.location.href = '/login/index.html';
}

function goToChat() {
    window.location.href = '/chat/index.html';
}

async function deleteUserConfirm(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    showConfirmModal(
        '🗑️ Excluir Usuário',
        `Tem certeza que deseja <strong>excluir permanentemente</strong> o usuário <strong style="color:${getRoleColor(user.role)}">${escapeHtml(user.username)}</strong>?<br><br><small style="color:var(--text-tertiary);">Esta ação não pode ser desfeita. Todas as mensagens serão apagadas.</small>`,
        async () => {
            try {
                await databaseManager.deleteUser(userId);
                showToast(`Usuário ${user.username} excluído com sucesso`, 'success');
                await loadUsers();
            } catch (error) {
                showToast('Erro ao excluir usuário: ' + error.message, 'error');
            }
        }
    );
}

// ============ ESTATÍSTICAS ============
async function loadStats() {
    try {
        // Total de usuários
        const { count: totalUsers } = await db
            .from('users')
            .select('*', { count: 'exact', head: true });
        
        // Online agora
        const { count: online } = await db
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'online');
        
        // Total de mensagens
        const { count: totalMessages } = await db
            .from('messages')
            .select('*', { count: 'exact', head: true });
        
        // Banidos
        const { count: banned } = await db
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('is_banned', true);
        
        document.getElementById('statTotalUsers').textContent = totalUsers || 0;
        document.getElementById('statOnline').textContent = online || 0;
        document.getElementById('statMessages').textContent = totalMessages || 0;
        document.getElementById('statBanned').textContent = banned || 0;
        
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

// ============ LOGS DE ATIVIDADE ============
async function loadActivityLogs() {
    const tbody = document.getElementById('logsTableBody');
    
    try {
        const { data: logs, error } = await db
            .from('activity_logs')
            .select(`
                id,
                action,
                created_at,
                user:users(username, role)
            `)
            .order('created_at', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--text-tertiary);">Nenhuma atividade registrada</td></tr>';
            return;
        }
        
        tbody.innerHTML = logs.map(log => {
            const username = log.user?.username || 'Sistema';
            const role = log.user?.role || '';
            const roleColor = getRoleColor(role);
            const time = formatTime(log.created_at);
            
            // Traduzir ações comuns
            const actionLabels = {
                'LOGIN': '🔑 Login',
                'LOGOUT': '🚪 Logout',
                'PASSWORD_CHANGED': '🔒 Alterou senha',
                'USER_CREATED': '✨ Usuário criado',
                'USER_BANNED': '🚫 Usuário banido',
                'USER_UNBANNED': '✅ Usuário desbanido',
                'USER_DELETED': '🗑️ Usuário excluído'
            };
            
            const actionLabel = actionLabels[log.action] || log.action;
            
            return `
                <tr>
                    <td>
                        <span style="color: ${roleColor}; font-weight: 500;">${escapeHtml(username)}</span>
                    </td>
                    <td>${actionLabel}</td>
                    <td style="color: var(--text-tertiary); font-size: 13px;">${time}</td>
                </tr>`;
        }).join('');
        
    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--accent-danger);">Erro ao carregar atividades</td></tr>';
    }
}


function sortUsers(users) {
    const field = currentSort.field;
    const direction = currentSort.direction;
    
    return [...users].sort((a, b) => {
        let valA, valB;
        
        switch (field) {
            case 'username':
                valA = a.username.toLowerCase();
                valB = b.username.toLowerCase();
                break;
            case 'email':
                valA = (a.email || '').toLowerCase();
                valB = (b.email || '').toLowerCase();
                break;
            case 'role':
                const roleOrder = { admin: 3, moderator: 2, user: 1 };
                valA = roleOrder[a.role] || 0;
                valB = roleOrder[b.role] || 0;
                break;
            case 'status':
                valA = a.is_banned ? 2 : (a.status === 'online' ? 1 : 0);
                valB = b.is_banned ? 2 : (b.status === 'online' ? 1 : 0);
                break;
            default:
                return 0;
        }
        
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateSortArrows() {
    document.querySelectorAll('.sortable .sort-arrow').forEach(arrow => {
        arrow.classList.remove('asc', 'desc');
    });
    const activeHeader = document.querySelector(`.sortable[data-sort="${currentSort.field}"] .sort-arrow`);
    if (activeHeader) {
        activeHeader.classList.add(currentSort.direction);
    }
}


function showConfirmModal(title, message, onConfirm) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 420px;">
            <h2 class="modal-title">${title}</h2>
            <div class="modal-body">${message}</div>
            <div class="modal-footer">
                <button class="btn-cancel" id="confirmCancelBtn">Cancelar</button>
                <button class="btn-save" id="confirmOkBtn" style="background: #ef4444; color: #fff;">Confirmar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('confirmCancelBtn').onclick = () => modal.remove();
    document.getElementById('confirmOkBtn').onclick = () => { modal.remove(); onConfirm(); };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}


async function viewUserMessages(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    const { data: sent } = await db.from('messages').select('*').eq('sender_id', userId).order('created_at', { ascending: false }).limit(10);
    const { data: received } = await db.from('messages').select('*').eq('receiver_id', userId).order('created_at', { ascending: false }).limit(10);
    
    const allMessages = [...(sent || []), ...(received || [])]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 15);
    
    const userIds = new Set(allMessages.map(m => m.sender_id).concat(allMessages.map(m => m.receiver_id)));
    const { data: users } = await db.from('users').select('id, username').in('id', Array.from(userIds));
    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u.username; });
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h2 class="modal-title">💬 Mensagens de ${escapeHtml(user.username)}</h2>
            <div class="modal-body">
                ${allMessages.length === 0 ? '<p style="text-align:center;color:var(--text-tertiary);">Nenhuma mensagem encontrada</p>' :
                    allMessages.map(m => {
                        const otherUser = m.sender_id === userId ? userMap[m.receiver_id] || '?' : userMap[m.sender_id] || '?';
                        const isSender = m.sender_id === userId;
                        return `
                            <div style="padding:8px 0; border-bottom:1px solid var(--border-subtle);">
                                <div style="font-size:12px; color:${isSender ? '#22c55e' : '#7c3aed'}; margin-bottom:4px;">
                                    ${isSender ? 'Enviou para' : 'Recebeu de'} <strong>${escapeHtml(otherUser)}</strong>
                                    <span style="float:right; color:var(--text-tertiary);">${formatTime(m.created_at)}</span>
                                </div>
                                <div style="font-size:13px; color:var(--text-primary);">${escapeHtml(m.content.length > 80 ? m.content.substring(0,80) + '...' : m.content)}</div>
                            </div>`;
                    }).join('')
                }
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}


function exportCSV() {
    const users = filteredUsers.length ? filteredUsers : allUsers;
    const headers = ['Username', 'Email', 'Cargo', 'Status', 'Banido', 'Cadastro'];
    const rows = users.map(u => [
        u.username,
        u.email || '',
        u.role,
        u.status,
        u.is_banned ? 'Sim' : 'Não',
        new Date(u.created_at).toLocaleDateString('pt-BR')
    ]);
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => { csv += row.map(cell => `"${cell}"`).join(',') + '\n'; });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usuarios_bidjorchat_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}


async function showUserProfile(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    const { count: sentCount } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', userId);
    const { count: receivedCount } = await db.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', userId);
    const { data: lastMessage } = await db.from('messages').select('created_at').or(`sender_id.eq.${userId},receiver_id.eq.${userId}`).order('created_at', { ascending: false }).limit(1);
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal" style="max-width: 500px;">
            <h2 class="modal-title" style="color: ${getRoleColor(user.role)}">👤 ${escapeHtml(user.username)}</h2>
            <div class="modal-body">
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="width:80px;height:80px;border-radius:50%;background:#1c1c1c;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;overflow:hidden;">
                        ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" style="width:100%;height:100%;object-fit:cover;">` : `<span style="font-size:30px;">${getInitials(user.username)}</span>`}
                    </div>
                    <span class="role-badge-admin role-${user.role.toUpperCase()}">${user.role.toUpperCase()}</span>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                    <div><strong>Email:</strong><br>${escapeHtml(user.email || '-')}</div>
                    <div><strong>Status:</strong><br>${user.is_banned ? '🚫 Banido' : user.status === 'online' ? '🟢 Online' : '⚫ Offline'}</div>
                    <div><strong>Cadastro:</strong><br>${new Date(user.created_at).toLocaleDateString('pt-BR')}</div>
                    <div><strong>Última atividade:</strong><br>${user.last_seen ? formatTime(user.last_seen) : '-'}</div>
                    <div><strong>Msgs enviadas:</strong><br>${sentCount || 0}</div>
                    <div><strong>Msgs recebidas:</strong><br>${receivedCount || 0}</div>
                </div>
                ${lastMessage?.length ? `<div style="margin-top:16px;"><strong>Última mensagem:</strong><br>${formatTime(lastMessage[0].created_at)}</div>` : ''}
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Fechar</button>
                <button class="btn-action" onclick="this.closest('.modal-overlay').remove(); viewUserMessages('${userId}')">💬 Ver mensagens</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}