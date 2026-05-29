// Admin Script – Permissões: admin total, moderator limitado
let allUsers = [];
let editingUserId = null;
let currentUserRole = null;
let currentUserId = null;
let currentSort = { field: 'username', direction: 'asc' };
let filteredUsers = [];
let statsInterval = null;
let reactionsPollInterval = null; // polling das reações dos anúncios
let messagesChart = null;
let memeFileToUpload = null;
let editFileToUpload = null;


const actionLabels = {
    'LOGIN': '🔑 Login',
    'LOGOUT': '🚪 Logout',
    'PASSWORD_CHANGED': '🔒 Alterou própria senha',
    'USER_CREATED': '✨ Usuário criado',
    'USER_UPDATED': '✏️ Usuário editado',
    'USER_BANNED': '🚫 Usuário banido',
    'USER_UNBANNED': '✅ Usuário desbanido',
    'USER_DELETED': '🗑️ Usuário excluído',
    'PASSWORD_RESET': '🔑 Senha resetada',
    'POLL_CREATED': '📊 Enquete criada',
    'POLL_ENDED': '🔚 Enquete encerrada',
    'POLL_DELETED': '🗑️ Enquete excluída',
    'ANNOUNCEMENT_CREATED': '📢 Anúncio criado',
    'ANNOUNCEMENT_DELETED': '🗑️ Anúncio excluído',
    'MEME_COMMAND_CREATED': '🎬 Comando de meme criado',
    'MEME_COMMAND_UPDATED': '✏️ Comando de meme editado',
    'MEME_COMMAND_DELETED': '🗑️ Comando de meme excluído',
    'CLEAN_OLD_GERAL_MESSAGES': '🧹 Mensagens antigas apagadas',
    'MASS_DELETE_USERS': '⚠️ Exclusão em massa de usuários',
    'MASS_DELETE_PRIVATE_MSGS': '💬 Mensagens privadas em massa',
    'MASS_DELETE_GERAL_MSGS': '🌐 Mensagens gerais em massa',
    'MASS_DELETE_ALL_MSGS': '🔥 Todas as mensagens apagadas',
    'MASS_ROLE_CHANGE': '👥 Cargo em massa alterado',
    'MASS_DELETE_AUDIO': '🎤 Apagou todos os áudios',
    'RATE_LIMIT_SETTINGS_CHANGED': '⏱️ Configurações de spam alteradas'
};


// ========== GERENCIAMENTO DE MEMES ==========
let allMemes = [];

async function loadMemes() {
    const tbody = document.getElementById('memesTableBody');
    if (!tbody) return;
    try {
        const { data, error } = await db
            .from('meme_commands')
            .select('*')
            .order('command', { ascending: true });
        if (error) throw error;
        allMemes = data || [];
        if (allMemes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhum comando cadastrado</td></tr>';
            return;
        }
        tbody.innerHTML = allMemes.map(meme => `
            <tr>
                <td>
                <div style="display:flex; align-items:center; gap:12px;">
                    <img src="${escapeHtml(meme.url)}" class="meme-thumb" onerror="this.src='data:image/svg+xml,...'">
                    <strong>/${escapeHtml(meme.command)}</strong>
                </div>
                </td>
                <td style="max-width:300px; word-break:break-all;">
                <a href="${escapeHtml(meme.url)}" target="_blank" style="color: #a78bfa;">Ver original</a>
                </td>
                <td>
                <button class="btn-action primary" onclick="editMeme('${meme.id}')">✏️</button>
                <button class="btn-action danger" onclick="deleteMeme('${meme.id}')">🗑️</button>
                </td>
            </tr>
            `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" style="color:red;">Erro ao carregar</td></tr>';
    }
}



// =============================================
// LISTENERS DE UPLOAD PARA EDIÇÃO
// =============================================


function setupEditUploadListeners(meme) {
  const area = document.getElementById('editUploadArea');
  const fileInput = document.getElementById('editFileInput');
  const content = document.getElementById('editUploadContent');
  const preview = document.getElementById('editUploadPreview');
  const removeBtn = document.getElementById('editUploadRemove');

  // Clonagem para evitar múltiplos event listeners
  const newArea = area.cloneNode(true);
  area.parentNode.replaceChild(newArea, area);
  
  // Reatribuir referências após clonagem
  const newFileInput = document.getElementById('editFileInput');
  const newContent = document.getElementById('editUploadContent');
  const newPreview = document.getElementById('editUploadPreview');
  const newRemoveBtn = document.getElementById('editUploadRemove');

  newArea.addEventListener('click', (e) => {
    if (e.target !== newRemoveBtn && !newRemoveBtn?.contains(e.target)) {
      newFileInput.click();
    }
  });

  newArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    newArea.classList.add('drag-over');
  });

  newArea.addEventListener('dragleave', () => {
    newArea.classList.remove('drag-over');
  });

  newArea.addEventListener('drop', (e) => {
    e.preventDefault();
    newArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) {
      processEditFile(file, newPreview, newContent, newRemoveBtn);
      editFileToUpload = file;
    }
  });

  newFileInput.addEventListener('change', () => {
    const file = newFileInput.files[0];
    if (file) {
      processEditFile(file, newPreview, newContent, newRemoveBtn);
      editFileToUpload = file;
    }
  });

  if (newRemoveBtn) {
    newRemoveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editFileToUpload = null;
      newFileInput.value = '';
      newPreview.src = meme.url;
      newPreview.style.display = 'block';
      newContent.style.display = 'none';
      newRemoveBtn.style.display = 'flex';
    });
  }
}

function processEditFile(file, preview, content, removeBtn) {
  if (!['image/gif', 'image/webp'].includes(file.type)) {
    showToast('Apenas GIF ou WebP são permitidos', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Arquivo muito grande (máx. 5 MB)', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.style.display = 'block';
    content.style.display = 'none';
    removeBtn.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}


async function cleanOldGeralMessages() {
    // Verifica se o usuário atual é admin ou supervisor
    const user = sessionManager.getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'supervisor')) {
        showToast('Apenas administradores e supervisores podem realizar esta ação', 'error');
        return;
    }

    if (!confirm('Apagar todas as mensagens do chat geral com mais de 7 dias?')) return;
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { error } = await db
            .from('geral_messages')
            .delete()
            .lt('created_at', sevenDaysAgo.toISOString());
        await logAdminAction('CLEAN_OLD_GERAL_MESSAGES', { days: 7 });
        if (error) throw error;
        showToast(`Mensagens antigas removidas com sucesso`, 'success');
        await loadMessagesChart();
        await loadActivityLogs();
    } catch (e) {
        showToast('Erro ao limpar mensagens: ' + e.message, 'error');
    }
}
function showCreateMemeModal() {
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal meme-upload-modal">
      <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      
      <div class="meme-modal-header">
        <div class="meme-modal-icon">🎬</div>
        <h2 class="meme-modal-title">Novo Comando de GIF</h2>
        <p class="meme-modal-subtitle">Faça upload de um GIF/WebP ou cole uma URL</p>
      </div>

      <div class="meme-modal-body">
        <!-- Campo de comando -->
        <div class="form-group meme-command-group">
          <label class="meme-label">Comando</label>
          <div class="meme-command-input-wrapper">
            <span class="meme-command-prefix">/</span>
            <input type="text" id="memeCommand" class="meme-command-input" placeholder="meme01" maxlength="30" autocomplete="off">
          </div>
          <small style="color: var(--text-tertiary); font-size: 11px; margin-top: 4px; display: block;">Apenas letras minúsculas, números e _ (ex: meme01, gif_legal)</small>
        </div>

        <!-- Área de upload -->
        <div class="form-group">
          <label class="meme-label">Upload do GIF</label>
          <div class="meme-upload-area" id="memeUploadArea">
            <input type="file" id="memeFileInput" accept="image/gif,image/webp" hidden>
            <div class="meme-upload-content" id="memeUploadContent">
              <div class="meme-upload-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <p class="meme-upload-text">Arraste um GIF/WebP aqui ou <span class="meme-upload-link">clique para selecionar</span></p>
              <p class="meme-upload-hint">Tamanho máximo: 5 MB</p>
            </div>
            <img id="memeUploadPreview" class="meme-upload-preview" style="display:none;">
            <button id="memeUploadRemove" class="meme-upload-remove" style="display:none;" title="Remover">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Separador -->
        <div class="meme-divider">
          <span class="meme-divider-text">ou cole uma URL</span>
        </div>

        <!-- Campo de URL -->
        <div class="form-group">
          <label class="meme-label">URL do GIF</label>
          <input type="url" id="memeUrl" class="meme-url-input" placeholder="https://exemplo.com/gif.gif">
        </div>
      </div>

      <div class="meme-modal-footer">
        <button class="meme-btn-cancel" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="meme-btn-save" id="saveMemeBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Adicionar Comando
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  setupMemeUploadListeners();
  document.getElementById('saveMemeBtn').addEventListener('click', saveMeme);
}

function setupMemeUploadListeners() {
  const area = document.getElementById('memeUploadArea');
  const fileInput = document.getElementById('memeFileInput');
  const content = document.getElementById('memeUploadContent');
  const preview = document.getElementById('memeUploadPreview');
  const removeBtn = document.getElementById('memeUploadRemove');

  area.addEventListener('click', (e) => {
    if (e.target !== removeBtn && !removeBtn.contains(e.target)) {
      fileInput.click();
    }
  });

  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('drag-over');
  });

  area.addEventListener('dragleave', () => {
    area.classList.remove('drag-over');
  });

  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processMemeFile(file, preview, content, removeBtn);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) processMemeFile(file, preview, content, removeBtn);
  });

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    memeFileToUpload = null;
    fileInput.value = '';
    preview.style.display = 'none';
    preview.src = '';
    content.style.display = '';
    removeBtn.style.display = 'none';
  });
}

function processMemeFile(file, preview, content, removeBtn) {
  if (!['image/gif', 'image/webp'].includes(file.type)) {
    showToast('Apenas GIF ou WebP são permitidos', 'error');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('Arquivo muito grande (máx. 5 MB)', 'error');
    return;
  }

  memeFileToUpload = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.style.display = 'block';
    content.style.display = 'none';
    removeBtn.style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

async function saveMeme() {
  const command = document.getElementById('memeCommand').value.trim().toLowerCase();
  const urlInput = document.getElementById('memeUrl').value.trim();

  if (!command) { showToast('Digite o comando', 'error'); return; }
  if (!/^[a-z0-9_]+$/.test(command)) { showToast('Comando inválido (apenas letras, números e _)', 'error'); return; }

  let finalUrl = urlInput;
  if (memeFileToUpload) {
    try {
      const fileExt = memeFileToUpload.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}.${fileExt}`;
      
      const { data, error } = await db.storage.from('gifs').upload(fileName, memeFileToUpload, {
        cacheControl: '3600',
        upsert: false,
        contentType: memeFileToUpload.type
      });
      if (error) throw error;
      
      // Obtém a URL pública corretamente
      const { data: urlData } = db.storage.from('gifs').getPublicUrl(fileName);
      finalUrl = urlData.publicUrl;
    } catch (e) {
      showToast('Erro no upload: ' + e.message, 'error');
      return;
    }
  }

  if (!finalUrl) { showToast('Forneça uma URL ou faça upload', 'error'); return; }

  // Validação extra: testar se a URL é acessível
  try {
    const testResponse = await fetch(finalUrl, { method: 'HEAD' });
    if (!testResponse.ok) {
      showToast('A URL fornecida não está acessível', 'error');
      return;
    }
  } catch (e) {
    showToast('Erro ao validar URL', 'error');
    return;
  }

  try {
    await db.from('meme_commands').insert({ command, url: finalUrl });
    await logAdminAction('MEME_COMMAND_CREATED', { command });
    showToast('Comando criado!', 'success');
    document.querySelector('.modal-overlay').remove();
    loadMemes();
    await loadActivityLogs();
  } catch (e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

function setupMemeUpload() {
  const zone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('memeFile');
  const preview = document.getElementById('uploadPreview');
  const prompt = zone.querySelector('.upload-prompt');

  zone.addEventListener('click', () => fileInput.click());

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = '#8b5cf6';
  });
  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = '';
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'image/gif' || file.type === 'image/webp')) {
      handleMemeFile(file, preview, prompt);
    } else {
      showToast('Apenas GIF ou WebP são permitidos', 'error');
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleMemeFile(file, preview, prompt);
  });
}

function handleMemeFile(file, preview, prompt) {
  if (file.size > 5 * 1024 * 1024) {
    showToast('Arquivo muito grande (máx 5MB)', 'error');
    return;
  }
  memeFileToUpload = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.style.display = 'block';
    prompt.style.display = 'none';
  };
  reader.readAsDataURL(file);
}



async function editMeme(id) {
  const meme = allMemes.find(m => m.id === id);
  if (!meme) return;

  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal meme-upload-modal">
      <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      
      <div class="meme-modal-header">
        <div class="meme-modal-icon">✏️</div>
        <h2 class="meme-modal-title">Editar Comando</h2>
        <p class="meme-modal-subtitle">/${escapeHtml(meme.command)}</p>
      </div>

      <div class="meme-modal-body">
        <div class="form-group meme-command-group">
          <label class="meme-label">Comando</label>
          <div class="meme-command-input-wrapper">
            <span class="meme-command-prefix">/</span>
            <input type="text" id="editCommand" class="meme-command-input" value="${escapeHtml(meme.command)}" maxlength="30">
          </div>
        </div>

        <div class="form-group">
          <label class="meme-label">Novo Upload (opcional)</label>
          <div class="meme-upload-area" id="editUploadArea">
            <input type="file" id="editFileInput" accept="image/gif,image/webp" hidden>
            <div class="meme-upload-content" id="editUploadContent">
              <div class="meme-upload-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <p class="meme-upload-text">Arraste um novo GIF ou <span class="meme-upload-link">clique aqui</span></p>
            </div>
            <img id="editUploadPreview" class="meme-upload-preview" src="${escapeHtml(meme.url)}" style="display:block;">
            <button id="editUploadRemove" class="meme-upload-remove" title="Remover novo upload">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div class="meme-divider">
          <span class="meme-divider-text">ou altere a URL</span>
        </div>

        <div class="form-group">
          <label class="meme-label">URL do GIF</label>
          <input type="url" id="editUrl" class="meme-url-input" value="${escapeHtml(meme.url)}">
        </div>
      </div>

      <div class="meme-modal-footer">
        <button class="meme-btn-cancel" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="meme-btn-save" id="updateMemeBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"/><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"/></svg>
          Atualizar Comando
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  setupEditUploadListeners(meme);
  document.getElementById('updateMemeBtn').addEventListener('click', () => updateMeme(id));
}


async function updateMeme(id) {
  console.log('updateMeme chamado com id:', id);
  const command = document.getElementById('editCommand').value.trim().toLowerCase();
  const urlInput = document.getElementById('editUrl').value.trim();

  if (!command) { showToast('Digite o comando', 'error'); return; }
  if (!/^[a-z0-9_]+$/.test(command)) { showToast('Comando inválido', 'error'); return; }

  let finalUrl = urlInput;
  if (editFileToUpload) {
    console.log('Fazendo upload de novo arquivo...');
    try {
      const fileExt = editFileToUpload.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}.${fileExt}`;
      const { error: uploadError } = await db.storage.from('gifs').upload(fileName, editFileToUpload, {
        cacheControl: '3600',
        upsert: false,
        contentType: editFileToUpload.type
      });
      if (uploadError) throw uploadError;
      const { data: urlData } = db.storage.from('gifs').getPublicUrl(fileName);
      finalUrl = urlData.publicUrl;
      console.log('Upload concluído, URL:', finalUrl);
    } catch (e) {
      console.error('Erro no upload:', e);
      showToast('Erro no upload: ' + e.message, 'error');
      return;
    }
  }

  if (!finalUrl) { showToast('Forneça uma URL ou faça upload', 'error'); return; }

  try {
    console.log('Atualizando no banco...');
    const { error } = await db
      .from('meme_commands')
      .update({ command, url: finalUrl, updated_at: new Date() })
      .eq('id', id);
    if (error) throw error;
    await logAdminAction('MEME_COMMAND_UPDATED', { command, id });
    showToast('Comando atualizado!', 'success');
    document.querySelector('.modal-overlay')?.remove();
    loadMemes();  // recarrega a tabela
    await loadActivityLogs();
  } catch (e) {
    console.error('Erro ao atualizar:', e);
    showToast('Erro: ' + e.message, 'error');
  }
}

async function deleteMeme(id) {
  const meme = allMemes.find(m => m.id === id);
  const commandName = meme ? meme.command : 'desconhecido';

  if (!confirm(`Excluir permanentemente o comando /${commandName}?`)) return;

  try {
    const { error } = await db.from('meme_commands').delete().eq('id', id);
    if (error) throw error;

    await logAdminAction('MEME_COMMAND_DELETED', { command: commandName, id });
    showToast('Comando excluído com sucesso', 'success');
    await loadActivityLogs();
    loadMemes();
  } catch (e) {
    console.error('Erro ao excluir meme:', e);
    showToast('Erro ao excluir: ' + (e.message || e), 'error');
  }
}

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
    if (!user || (user.role !== 'admin' && user.role !== 'moderator' && user.role !== 'supervisor')) {
        window.location.href = '/chat/';
        return;
    }

    // Bloquear usuários banidos
    if (user.is_banned) {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0a;color:#dc2626;font-size:24px;">🚫 ACESSO NEGADO</div>';
        return;
    }

    // Ordenação da tabela
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

    // Mostrar seção de memes apenas para admin e supervisor
    if (currentUserRole === 'admin' || currentUserRole === 'supervisor' || currentUserRole === 'moderator') {
        const memesSection = document.getElementById('memesSection');
        if (memesSection) memesSection.style.display = 'block';
        loadMemes(); // carregar a tabela
    }

     // GRAFICO DE MENSAGENS
    if (currentUserRole === 'admin' || currentUserRole === 'supervisor' || currentUserRole === 'moderator') {
        const chartSection = document.getElementById('chartSection');
        if (chartSection) chartSection.style.display = 'block';
        loadMessagesChart(); // carrega o gráfico
    }
        
    // Ajustar interface conforme o cargo
    setupUIByRole(user);
    
    // Carregar enquetes e anúncios (apenas admin)
    if (user.role === 'admin') {
        loadPolls();
        loadAnnouncements();
        startReactionsPolling();
    }
    
    // Rate Limit: carregar configurações e salvar (admin E moderador)
    if (user.role === 'admin' || user.role === 'moderator') {
        await loadRateLimitSettings();
        const saveBtn = document.getElementById('saveRateLimitBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveRateLimitSettings);
        }
    }
    
    // Inicializar seleção em massa (apenas admin)
    if (user.role === 'admin') {
        initMassSelect();
        const applyBtn = document.getElementById('applyMassRoleBtn');
        if (applyBtn) applyBtn.addEventListener('click', applyMassRole);
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
        const badges = {
            'admin': 'ADMIN',
            'moderator': 'MODERADOR',
            'supervisor': 'SUPERVISOR'
        };
        const bgColors = {
            'admin': 'var(--accent-admin)',
            'moderator': 'var(--accent-moderator)',
            'supervisor': '#f59e0b'
        };
        badge.textContent = badges[user.role] || user.role.toUpperCase();
        badge.style.background = bgColors[user.role] || 'var(--accent-user)';
    }

    const isAdmin = user.role === 'admin';
    const isSupervisor = user.role === 'supervisor';
    const isModerator = user.role === 'moderator';
    const isElevated = isAdmin || isSupervisor;

    // Botão "Novo Usuário"
    const btnAdd = document.getElementById('btnAddUser') || document.querySelector('.btn-add-user');
    if (btnAdd && !isElevated) btnAdd.style.display = 'none';

    // Supervisor NÃO vê email, mas vê cargo. Moderador não vê email nem cargo
    if (isSupervisor) {
        document.querySelectorAll('.col-email').forEach(el => el.classList.add('hidden'));
    }
    if (isModerator) {
        document.querySelectorAll('.col-email, .col-role').forEach(el => el.classList.add('hidden'));
    }

    // Ações em massa – mostrar seção, mas filtrar botões por cargo
    const massActions = document.getElementById('massActions');
    if (massActions) {
        massActions.style.display = isElevated ? 'flex' : 'none';

        // Supervisor: apenas o botão de apagar mensagens gerais
        if (isSupervisor && !isAdmin) {
            document.querySelectorAll('.btn-mass-users, .btn-mass-private, .btn-mass-all').forEach(btn => btn.style.display = 'none');
            const btnGeral = document.querySelector('.btn-mass-geral');
            if (btnGeral) btnGeral.style.display = '';
        }
        // Admin: todos os botões (já estão visíveis por padrão)
        if (isAdmin) {
            document.querySelectorAll('.btn-mass-users, .btn-mass-private, .btn-mass-geral, .btn-mass-all').forEach(btn => btn.style.display = '');
        }
    }

    // Container de seleção de cargo em massa (apenas admin)
    const massRoleContainer = document.getElementById('massRoleContainer');
    if (massRoleContainer) massRoleContainer.style.display = isAdmin ? 'flex' : 'none';

    // Seções exclusivas de admin e supervisor (enquetes, anúncios)
    const pollsSec = document.getElementById('pollsSection');
    if (pollsSec) pollsSec.style.display = isElevated ? 'block' : 'none';
    const announcementsSec = document.getElementById('announcementsSection');
    if (announcementsSec) announcementsSec.style.display = isElevated ? 'block' : 'none';

    // Rate Limit (admin, supervisor e moderador)
    const rateLimitSection = document.getElementById('rateLimitSection');
    if (rateLimitSection) rateLimitSection.style.display = (isElevated || isModerator) ? 'block' : 'none';

    // Checkbox de seleção em massa (apenas admin)
    const selectAll = document.getElementById('selectAllUsers');
    if (selectAll) {
        const thCheckbox = selectAll.closest('th');
        if (thCheckbox) thCheckbox.style.display = isAdmin ? '' : 'none';
    }
}

// ========== RATE LIMIT (CONTROLE DE SPAM) ==========
async function loadRateLimitSettings() {
    try {
        const settings = await databaseManager.getRateLimitSettings();
        document.getElementById('rateMaxMessages').value = settings.maxMessages;
        document.getElementById('rateWindowSeconds').value = settings.windowSeconds;
        document.getElementById('rateBlockSeconds').value = settings.blockSeconds;
    } catch (e) {
        console.warn('Erro ao carregar configurações de rate limit:', e);
    }
}

async function saveRateLimitSettings() {
    const max = parseInt(document.getElementById('rateMaxMessages').value);
    const windowSec = parseInt(document.getElementById('rateWindowSeconds').value);
    const blockSec = parseInt(document.getElementById('rateBlockSeconds').value);
    if (isNaN(max) || isNaN(windowSec) || isNaN(blockSec)) {
        showToast('Valores inválidos', 'error');
        return;
    }
    try {
        await databaseManager.saveRateLimitSettings(max, windowSec, blockSec);
        showToast('Configurações salvas com sucesso!', 'success');
    } catch (e) {
        showToast('Erro ao salvar: ' + e.message, 'error');
    }
}

// ========== SELEÇÃO EM MASSA (APENAS ADMIN) ==========
function initMassSelect() {
    const selectAll = document.getElementById('selectAllUsers');
    if (!selectAll) return;
    selectAll.addEventListener('change', (e) => {
        document.querySelectorAll('.user-select-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
    });
}

async function applyMassRole() {
    const selected = Array.from(document.querySelectorAll('.user-select-checkbox:checked'))
        .map(cb => cb.dataset.userId);
    if (selected.length === 0) {
        showToast('Nenhum usuário selecionado', 'warning');
        return;
    }
    const newRole = document.getElementById('massRoleSelect').value;
    if (!newRole) return;
    
    showConfirmModal(
        'Alterar cargos em massa',
        `Você está prestes a alterar o cargo de ${selected.length} usuário(s) para <strong>${newRole.toUpperCase()}</strong>. Deseja continuar?`,
        async () => {
            try {
                for (const userId of selected) {
                    await databaseManager.updateUser(userId, { role: newRole });
                }
                showToast(`Cargo alterado para ${selected.length} usuário(s)`, 'success');
                await loadUsers();
            } catch (e) {
                showToast('Erro ao atualizar: ' + e.message, 'error');
            }
        }
    );
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
    const isSupervisor = currentUserRole === 'supervisor';
    const isElevated = isAdmin || isSupervisor;
    const isModerator = currentUserRole === 'moderator';

    let colCount = 3; // Moderador: user + status + actions
    if (isSupervisor) colCount = 4; // + cargo
    if (isAdmin) colCount = 6;      // + checkbox + email + cargo

    if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:40px;">Nenhum usuário</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(user => {
        const isSelf = user.id === currentUserId;

        // Regras de banimento
        const canBan = (isAdmin && user.role !== 'admin') ||
                       (isSupervisor && user.role !== 'admin' && user.role !== 'supervisor') ||
                       (isModerator && user.role === 'user');

        let actions = '';

        if (isAdmin) {
            // Admin: vê tudo, exceto excluir a si mesmo e outros admins
            actions = `
                <button class="btn-action" onclick="showEditUserModal('${user.id}')">Editar</button>
                ${canBan ? (user.is_banned ? 
                    `<button class="btn-action success" onclick="toggleBanUser('${user.id}', false)">Desbanir</button>` : 
                    `<button class="btn-action danger" onclick="toggleBanUser('${user.id}', true)">Banir</button>`) : ''}
                <button class="btn-action warning" onclick="resetUserPassword('${user.id}')">Resetar</button>
                ${!isSelf && user.role !== 'admin' ? 
                    `<button class="btn-action" onclick="deleteUserConfirm('${user.id}')" style="background:rgba(239,68,68,0.1);color:#ef4444;border-color:#ef4444;">Excluir</button>` : ''}
            `;
                } else if (isSupervisor) {
                    // Supervisor: Editar + Banir/Desbanir (apenas para usuários que não sejam admin/supervisor)
                    let editBtn = '';
                    if (canBan) {
                        editBtn = `<button class="btn-action" onclick="showEditUserModal('${user.id}')">Editar</button>`;
                        const banBtn = user.is_banned ? 
                            `<button class="btn-action success" onclick="toggleBanUser('${user.id}', false)">Desbanir</button>` : 
                            `<button class="btn-action danger" onclick="toggleBanUser('${user.id}', true)">Banir</button>`;
                        actions = `${editBtn} ${banBtn}`;
                    } else {
                        actions = '';
                    }
                } else if (isModerator && canBan) {
                    // Moderador: apenas Banir/Desbanir
                    actions = user.is_banned ? 
                        `<button class="btn-action success" onclick="toggleBanUser('${user.id}', false)">Desbanir</button>` : 
                        `<button class="btn-action danger" onclick="toggleBanUser('${user.id}', true)">Banir</button>`;
                }

        return `
            <tr>
                ${isAdmin ? `<td style="text-align: center;"><input type="checkbox" class="user-select-checkbox" data-user-id="${user.id}"></td>` : ''}
                <td>
                    <div class="user-cell">
                        <div class="user-avatar-small">
                            ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">` : `<span>${getInitials(user.username)}</span>`}
                        </div>
                        <span style="color: ${getRoleColor(user.role)}; ${(isModerator && user.role === 'admin') ? '' : 'cursor: pointer;'}" 
                            ${(isModerator && user.role === 'admin') ? '' : `onclick="showUserProfile('${user.id}')"`} 
                            title="${(isModerator && user.role === 'admin') ? 'Acesso restrito' : 'Ver perfil de ' + escapeHtml(user.username)}">
                            ${escapeHtml(user.username)}
                        </span>
                    </div>
                </td>
                ${isAdmin ? `<td class="col-email">${escapeHtml(user.email || '-')}</td>` : ''}
                ${isElevated ? `<td class="col-role"><span class="role-badge-admin role-${user.role.toUpperCase()}">${user.role.toUpperCase()}</span></td>` : ''}
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
    if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') return;
    
    const modal = document.getElementById('createUserModal');
    const roleSelect = document.getElementById('newRole');
    
    roleSelect.innerHTML = '';
    
    if (currentUserRole === 'admin') {
        // Admin pode criar: user, moderator, supervisor (NUNCA admin)
        const roles = [
            { value: 'user', label: 'Usuário' },
            { value: 'moderator', label: 'Moderador' },
            { value: 'supervisor', label: 'Supervisor' }
        ];
        roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.value;
            option.textContent = role.label;
            roleSelect.appendChild(option);
        });
    } else if (currentUserRole === 'supervisor') {
        // Supervisor só pode criar user ou moderator
        const roles = [
            { value: 'user', label: 'Usuário' },
            { value: 'moderator', label: 'Moderador' }
        ];
        roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.value;
            option.textContent = role.label;
            roleSelect.appendChild(option);
        });
    }
    
    modal.style.display = 'flex';
}

function closeCreateUserModal() {
    document.getElementById('createUserModal').style.display = 'none';
    document.getElementById('newUsername').value = '';
    document.getElementById('newEmail').value = '';
    document.getElementById('newPassword').value = '';
}

async function createUser() {
    if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') {
        showToast('Apenas administradores e supervisores podem criar usuários', 'error');
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
    if (!email.toLowerCase().endsWith('@bidjory.com')) {
        showToast('Apenas e-mails @bidjory.com são permitidos', 'error');
        return;
    }
    if (!validateUsername(username)) {
        showToast('Username inválido (3-30 caracteres, apenas letras, números e _)', 'error');
        return;
    }
    
    // 🔥 Verificar se username já existe
    try {
        const usernameExists = await databaseManager.checkUsernameExists(username);
        if (usernameExists) {
            showToast('Este nome de usuário já está em uso', 'error');
            return;
        }
        
        const emailExists = await databaseManager.checkEmailExists(email);
        if (emailExists) {
            showToast('Este email já está cadastrado', 'error');
            return;
        }
    } catch (checkError) {
        showToast('Erro ao verificar disponibilidade', 'error');
        return;
    }
    
    try {
        await databaseManager.createUser(
            { username, email, password, role },
            currentUserRole
        );
        await logAdminAction('USER_CREATED', { username, email, role });
        showToast('Usuário criado com sucesso', 'success');
        await loadActivityLogs();
        closeCreateUserModal();
        await loadUsers();
        await databaseManager.logActivity(currentUserId, 'USER_CREATED', { username, email });
    } catch (error) {
        if (error.message.includes('duplicate key')) {
            showToast('Username ou email já existe', 'error');
        } else {
            showToast('Erro ao criar usuário: ' + error.message, 'error');
        }
    }
}

function showEditUserModal(userId) {
    if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') return;
    
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    
    editingUserId = userId;
    
    const roleSelect = document.getElementById('editRole');
    roleSelect.innerHTML = '';
    
    if (currentUserRole === 'admin') {
        // Admin pode editar qualquer cargo, exceto NUNCA promover a admin
        const roles = [
            { value: 'user', label: 'Usuário' },
            { value: 'moderator', label: 'Moderador' },
            { value: 'supervisor', label: 'Supervisor' }
        ];
        roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.value;
            option.textContent = role.label;
            if (user.role === role.value) option.selected = true;
            roleSelect.appendChild(option);
        });
    } else if (currentUserRole === 'supervisor') {
        // Supervisor só pode editar cargo de outros para user ou moderator
        const roles = [
            { value: 'user', label: 'Usuário' },
            { value: 'moderator', label: 'Moderador' }
        ];
        roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role.value;
            option.textContent = role.label;
            if (user.role === role.value) option.selected = true;
            roleSelect.appendChild(option);
        });
    }
    
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editNewPassword').value = '';
    
    const roleField = document.getElementById('editRole').closest('.form-group');
    if (userId === currentUserId) roleField.style.display = 'none';
    else roleField.style.display = '';
    
    document.getElementById('editUserModal').style.display = 'flex';
}

function closeEditUserModal() { document.getElementById('editUserModal').style.display = 'none'; editingUserId = null; }

async function saveUserEdit() {
    if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') return;
    if (!editingUserId) return;

    const username = document.getElementById('editUsername').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const newPassword = document.getElementById('editNewPassword').value;
    const newRole = document.getElementById('editRole').value;

    const targetUser = allUsers.find(u => u.id === editingUserId);
    if (!targetUser) return;

    // Validação extra no front
    if (currentUserRole === 'supervisor' && (newRole === 'admin' || newRole === 'supervisor')) {
        showToast('Supervisores não podem promover usuários a administrador ou supervisor', 'error');
        return;
    }
    if (newRole === 'admin') {
        showToast('Não é possível promover ninguém a administrador', 'error');
        return;
    }

    try {
        const updates = {};
        if (username) updates.username = username;
        if (email) updates.email = email;
        if (editingUserId !== currentUserId && newRole) updates.role = newRole;

        await databaseManager.updateUser(editingUserId, updates, currentUserRole);
        
        if (newPassword) {
            await databaseManager.updateUser(editingUserId, { password: newPassword });
            showToast('Senha resetada', 'success');
        }
        
        showToast('Usuário atualizado', 'success');
        await loadActivityLogs();
        closeEditUserModal();
        await loadUsers();
    } catch (error) {
        showToast('Erro: ' + error.message, 'error');
    }
}

async function toggleBanUser(userId, ban) {
    const target = allUsers.find(u => u.id === userId);
    if (!target) return;

    // Validações de permissão por cargo
    if (currentUserRole === 'moderator' && target.role !== 'user') {
        showToast('Você só pode banir/desbanir usuários comuns', 'error');
        return;
    }
    if (currentUserRole === 'supervisor' && (target.role === 'admin' || target.role === 'supervisor')) {
        showToast('Você não pode banir administradores ou supervisores', 'error');
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
                if (ban) {
                    await databaseManager.banUser(userId);
                    await logAdminAction('USER_BANNED', { target_user_id: userId, username: target.username });
                } else {
                    await databaseManager.unbanUser(userId);
                    await logAdminAction('USER_UNBANNED', { target_user_id: userId, username: target.username });
                }
                showToast(ban ? 'Usuário banido' : 'Usuário desbanido', 'success');
                await loadUsers();          // Recarrega a lista de usuários
                await loadActivityLogs();   // Atualiza a tabela de logs no frontend
            } catch (error) {
                showToast('Erro ao alterar status: ' + error.message, 'error');
            }
        }
    );
}

async function resetUserPassword(userId) {
    if (currentUserRole !== 'admin' && currentUserRole !== 'supervisor') return;
    const user = allUsers.find(u => u.id === userId);
    const newPass = prompt('Digite a nova senha:');
    if (!newPass || newPass.length < 6) { if (newPass) showToast('Senha deve ter no mínimo 6 caracteres', 'error'); return; }
    showConfirmModal('🔒 Resetar Senha', `Deseja alterar a senha de <strong>${escapeHtml(user.username)}</strong>?`, async () => {
        try { 
            await databaseManager.updateUser(userId, { password: newPass }); 
            await logAdminAction('PASSWORD_RESET', { 
                target_user_id: userId, 
                target_username: user.username 
            });
            showToast('Senha resetada com sucesso', 'success'); 
            // Dentro de createUser, logo após showToast
            await loadActivityLogs();
        } 
        catch (error) { showToast('Erro ao resetar senha', 'error'); }
    });
}

async function deleteUserConfirm(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    showConfirmModal('🗑️ Excluir Usuário', `Tem certeza que deseja <strong>excluir permanentemente</strong> o usuário <strong style="color:${getRoleColor(user.role)}">${escapeHtml(user.username)}</strong>?<br><br><small style="color:var(--text-tertiary);">Esta ação não pode ser desfeita. Todas as mensagens serão apagadas.</small>`, async () => {
        try { 
            await databaseManager.deleteUser(userId);
            await logAdminAction('USER_DELETED', { 
                target_user_id: userId, 
                target_username: user.username 
            });
            showToast(`Usuário ${user.username} excluído com sucesso`, 'success'); await loadUsers();
            await loadActivityLogs();
        } 
        catch (error) { showToast('Erro ao excluir usuário: ' + error.message, 'error'); }
    });
}


// ========== LOG DE ATIVIDADES ADMIN ==========
async function logAdminAction(action, details = {}) {
    const user = sessionManager.getCurrentUser();
    if (!user) return;
    try {
        await db.from('activity_logs').insert({
            user_id: user.id,
            action: action,
            details: details,
            user_agent: navigator.userAgent
        });
    } catch (e) {
        console.warn('Erro ao registrar log:', e);
    }
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
        const { data: logs, error } = await db
            .from('activity_logs')
            .select(`id, action, created_at, details, user:users(username, role)`)
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw error;
        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:40px;">Nenhuma atividade registrada</td></tr>';
            return;
        }
        tbody.innerHTML = logs.map(log => {
            const username = log.user?.username || 'Sistema';
            const role = log.user?.role || '';
            const roleColor = getRoleColor(role);
            const time = formatTime(log.created_at);
            
            // Pega o nome do alvo (quando disponível) dos details
            let targetName = '';
            if (log.details) {
                if (log.details.target_username) targetName = log.details.target_username;
                else if (log.details.username) targetName = log.details.username;
                else if (log.details.command) targetName = `/${log.details.command}`;
            }
            
            // Obtém o rótulo base da ação
            let baseLabel = actionLabels[log.action] || log.action;
            // Se tiver nome do alvo, adiciona ao rótulo
            const finalLabel = targetName ? `${baseLabel}: ${escapeHtml(targetName)}` : baseLabel;
            
            return `
                <tr>
                    <td style="color: ${roleColor}; font-weight: 500;">${escapeHtml(username)}</td>
                    <td>${finalLabel}</td>
                    <td style="color: var(--text-tertiary); font-size: 13px;">${time}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Erro ao carregar logs:', error);
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:red;">Erro ao carregar atividades</td></tr>';
    }
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

// ========== APAGAR TODOS OS ÁUDIOS (ADMIN/SUPERVISOR) ==========
async function deleteAllAudioMessages() {
    const user = sessionManager.getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'supervisor')) {
        showToast('Apenas administradores e supervisores podem realizar esta ação', 'error');
        return;
    }

    showPasswordModal('🎤 Apagar todos os áudios', async () => {
        try {
            // 1. Apagar mensagens de áudio do banco (geral_messages)
            const { error: deleteMsgsError } = await db
                .from('geral_messages')
                .delete()
                .like('content', '[AUDIO]%');
            if (deleteMsgsError) throw deleteMsgsError;

            // 2. Apagar arquivos do bucket geral_audio
            const { data: files, error: listError } = await db.storage
                .from('geral_audio')
                .list('', { limit: 1000 });
            if (listError) throw listError;

            if (files && files.length > 0) {
                const filePaths = files.map(f => f.name);
                const { error: deleteFilesError } = await db.storage
                    .from('geral_audio')
                    .remove(filePaths);
                if (deleteFilesError) throw deleteFilesError;
            }

            await logAdminAction('MASS_DELETE_AUDIO', { 
                deleted_files: files?.length || 0,
                deleted_messages: true 
            });
            showToast('Todos os áudios foram apagados com sucesso!', 'success');
            
            // Recarregar gráfico e logs
            await loadMessagesChart();
            await loadActivityLogs();
        } catch (e) {
            console.error('Erro ao apagar áudios:', e);
            showToast('Erro ao apagar áudios: ' + e.message, 'error');
        }
    });
}


async function deleteAllPrivateMessages() {
    showPasswordModal('Apagar mensagens privadas', async () => {
        try { 
            const { error } = await db.from('messages').delete().gt('created_at', '2000-01-01'); 
            if (error) throw error;
            showToast('Mensagens privadas apagadas.', 'success');
            await loadStats();
            await loadActivityLogs();
            await loadMessagesChart();
        } 
        catch (e) { showToast('Erro: ' + e.message, 'error'); }
    });
}
async function deleteAllGeralMessages() {
    showPasswordModal('Apagar mensagens gerais', async () => {
        try { 
            const { error } = await db.from('geral_messages').delete().gt('created_at', '2000-01-01'); 
            if (error) throw error; 
            showToast('Mensagens gerais apagadas.', 'success'); 
            await loadStats(); 
            await loadActivityLogs();
            await loadMessagesChart();
        } 
        catch (e) { showToast('Erro: ' + e.message, 'error'); }
    });
}
async function deleteAllMessages() {
    showPasswordModal('Apagar TODAS as mensagens', async () => {
        try { 
            await db.from('messages').delete().gt('created_at', '2000-01-01'); 
            await db.from('geral_messages').delete().gt('created_at', '2000-01-01'); 
            showToast('Todas as mensagens foram apagadas.', 'success'); 
            await loadStats(); 
            await loadActivityLogs();
            await loadMessagesChart();
        } 
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
        try { 
            await db.from('polls').insert({ question, options: JSON.stringify(options), created_by: currentUserId, is_active: true });
            await logAdminAction('POLL_CREATED', { question });
            showToast('Enquete criada!', 'success'); modal.remove(); loadPolls(); 
        } 
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
        try { 
            await db.from('announcements').insert({ title, content, created_by: currentUserId });
            await logAdminAction('ANNOUNCEMENT_CREATED', { title });
            showToast('Anúncio publicado!', 'success'); modal.remove(); loadAnnouncements(); 
            await loadActivityLogs();
        } 
        catch (e) { showToast('Erro: ' + e.message, 'error'); }
    };
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function deleteAnnouncement(id) {
    if (!confirm('Excluir este anúncio?')) return;
    try { 
        await db.from('announcements').delete().eq('id', id);
        await logAdminAction('ANNOUNCEMENT_DELETED', { announcement_id: id });
        showToast('Anúncio excluído', 'success'); loadAnnouncements(); 
        await loadActivityLogs();
    }
        
    catch (e) { showToast('Erro ao excluir', 'error'); }
}

// ========== UTILITÁRIOS GERAIS ==========
async function handleLogout() {
    if (statsInterval) clearInterval(statsInterval);
    if (reactionsPollInterval) clearInterval(reactionsPollInterval);
    await sessionManager.logout();
    window.location.href = '/login/';
}
function goToChat() { 
    window.location.href = '/mensagem_geral/'; 
}
function getRoleColor(role) {
    const colors = {
        'admin': '#dc2626',
        'moderator': '#7c3aed',
        'supervisor': '#f59e0b',  // amarelo/dourado
        'user': '#a0a0a0'
    };
    return colors[role] || colors.user;
}
function removeAdminOption() {
    document.querySelectorAll('select.form-input option[value="admin"]').forEach(opt => opt.remove());
}




async function loadMessagesChart() {
    try {
        // Data de 7 dias atrás
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const startDate = sevenDaysAgo.toISOString();

        // Buscar mensagens privadas
        const { data: privateMsgs, error: err1 } = await db
            .from('messages')
            .select('created_at')
            .gte('created_at', startDate);
        if (err1) throw err1;

        // Buscar mensagens gerais
        const { data: geralMsgs, error: err2 } = await db
            .from('geral_messages')
            .select('created_at')
            .gte('created_at', startDate);
        if (err2) throw err2;

        // Combinar todas as mensagens
        const allMessages = [...(privateMsgs || []), ...(geralMsgs || [])];
        
        // Agrupar por dia (YYYY-MM-DD)
        const daysMap = new Map();
        for (let i = 0; i <= 6; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const key = date.toISOString().slice(0,10);
            daysMap.set(key, { date: key, count: 0 });
        }

        allMessages.forEach(msg => {
            const dateKey = msg.created_at.slice(0,10);
            if (daysMap.has(dateKey)) {
                daysMap.get(dateKey).count++;
            }
        });

        // Ordenar os dias do mais antigo para o mais recente
        const sortedDays = Array.from(daysMap.values()).reverse();
        const labels = sortedDays.map(d => {
            const [year, month, day] = d.date.split('-');
            return `${day}/${month}`;
        });
        const data = sortedDays.map(d => d.count);

        // Renderizar ou atualizar gráfico
        const ctx = document.getElementById('messagesChart').getContext('2d');
        if (messagesChart) {
            messagesChart.data.labels = labels;
            messagesChart.data.datasets[0].data = data;
            messagesChart.update();
        } else {
            messagesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Mensagens (privadas + geral)',
                        data: data,
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointBackgroundColor: '#8b5cf6',
                        pointBorderColor: '#fff',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { labels: { color: '#e0e0e0' } },
                        tooltip: { backgroundColor: '#1f1f1f' }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            grid: { color: '#2a2a2a' },
                            ticks: { color: '#a0a0a0' }
                        },
                        x: { 
                            grid: { display: false },
                            ticks: { color: '#a0a0a0' }
                        }
                    }
                }
            });
        }
    } catch (e) {
        console.error('Erro ao carregar gráfico:', e);
    }
}