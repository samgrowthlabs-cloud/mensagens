// Admin Script - Autenticação Própria

let allUsers = [];
let editingUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Verificar autenticação e role
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
    if (user.role !== 'admin') {
        window.location.href = '/chat/index.html';
        return;
    }
    
    // Carregar usuários
    await loadUsers();
    
    // Event listeners
    document.getElementById('userSearch').addEventListener('input', 
        debounce(filterUsers, 300)
    );
});

async function loadUsers() {
    const users = await databaseManager.getAllUsers();
    allUsers = users;
    renderUsersTable(users);
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary);padding:40px;">Nenhum usuário encontrado</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
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
            <td>${escapeHtml(user.email || '-')}</td>
            <td>
                <span class="role-badge-admin role-${user.role.toUpperCase()}">${user.role.toUpperCase()}</span>
            </td>
            <td>
                <span class="status-badge ${user.is_banned ? 'banned' : user.status}">
                    ${user.is_banned ? 'Banido' : user.status}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action" onclick="showEditUserModal('${user.id}')">Editar</button>
                    ${user.is_banned ? 
                        `<button class="btn-action success" onclick="toggleBanUser('${user.id}', false)">Desbanir</button>` :
                        `<button class="btn-action danger" onclick="toggleBanUser('${user.id}', true)">Banir</button>`
                    }
                    <button class="btn-action warning" onclick="resetUserPassword('${user.id}')">Resetar Senha</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getRoleColor(role) {
    const colors = {
        'admin': 'var(--accent-admin)',
        'moderator': 'var(--accent-moderator)',
        'user': 'var(--text-primary)'
    };
    return colors[role] || colors.user;
}

function filterUsers(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = allUsers.filter(user => 
        user.username.toLowerCase().includes(searchTerm) ||
        (user.email && user.email.toLowerCase().includes(searchTerm))
    );
    renderUsersTable(filtered);
}

function showCreateUserModal() {
    document.getElementById('createUserModal').style.display = 'flex';
}

function closeCreateUserModal() {
    document.getElementById('createUserModal').style.display = 'none';
    // Limpar campos
    document.getElementById('newUsername').value = '';
    document.getElementById('newEmail').value = '';
    document.getElementById('newPassword').value = '';
}

async function createUser() {
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
        await databaseManager.createUser({
            username,
            email,
            password,
            role
        });
        
        showToast('Usuário criado com sucesso', 'success');
        closeCreateUserModal();
        await loadUsers();
        
    } catch (error) {
        showToast('Erro ao criar usuário: ' + error.message, 'error');
    }
}

function showEditUserModal(userId) {
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
    try {
        if (ban) {
            await databaseManager.banUser(userId);
            showToast('Usuário banido', 'success');
        } else {
            await databaseManager.unbanUser(userId);
            showToast('Usuário desbanido', 'success');
        }
        await loadUsers();
    } catch (error) {
        showToast('Erro ao alterar status: ' + error.message, 'error');
    }
}

async function resetUserPassword(userId) {
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