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
                        <span style="color: ${getRoleColor(user.role)}">${escapeHtml(user.username)}</span>
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
    
    // Moderador só pode banir usuários comuns
    if (currentUserRole === 'moderator' && target.role !== 'user') {
        showToast('Você só pode banir/desbanir usuários comuns', 'error');
        return;
    }
    
    // Admin não pode banir outro admin
    if (currentUserRole === 'admin' && target.role === 'admin') {
        showToast('Não é possível banir um administrador', 'error');
        return;
    }
    
    try {
        if (ban) await databaseManager.banUser(userId);
        else await databaseManager.unbanUser(userId);
        showToast(ban ? 'Usuário banido' : 'Usuário desbanido', 'success');
        await loadUsers();
    } catch (error) {
        showToast('Erro ao alterar status: ' + error.message, 'error');
    }

    await databaseManager.logActivity(userId, ban ? 'USER_BANNED' : 'USER_UNBANNED');
}

async function resetUserPassword(userId) {
    if (currentUserRole !== 'admin') return;
    const newPass = prompt('Digite a nova senha:');
    if (!newPass) return;
    if (newPass.length < 6) {
        showToast('Senha deve ter no mínimo 6 caracteres', 'error');
        return;
    }
    try {
        await databaseManager.updateUser(userId, { password: newPass });
        showToast('Senha resetada com sucesso', 'success');
    } catch (error) {
        showToast('Erro ao resetar senha: ' + error.message, 'error');
    }
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
    
    if (!confirm(`Tem certeza que deseja EXCLUIR permanentemente o usuário "${user.username}"?\n\nEsta ação não pode ser desfeita!`)) {
        return;
    }
    
    // Segunda confirmação para evitar acidentes
    if (!confirm('Confirme novamente: isso apagará todas as mensagens e dados do usuário.')) {
        return;
    }
    
    try {
        await databaseManager.deleteUser(userId);
        showToast(`Usuário ${user.username} excluído com sucesso`, 'success');
        await loadUsers();
    } catch (error) {
        showToast('Erro ao excluir usuário: ' + error.message, 'error');
    }
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