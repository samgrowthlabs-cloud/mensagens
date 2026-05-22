// Componentes UI

class UIManager {
  createModal(title, content, buttons = []) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const titleEl = document.createElement('h2');
    titleEl.className = 'modal-title';
    titleEl.textContent = title;
    
    const body = document.createElement('div');
    body.className = 'modal-body';
    if (typeof content === 'string') {
      body.innerHTML = content;
    } else {
      body.appendChild(content);
    }
    
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    
    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.textContent = btn.text;
      button.className = btn.class || 'btn-primary';
      button.onclick = () => {
        if (btn.onClick) btn.onClick();
        overlay.remove();
      };
      footer.appendChild(button);
    });
    
    modal.appendChild(titleEl);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };
    
    return overlay;
  }

  showLoading(container) {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton';
    skeleton.style.height = '200px';
    container.appendChild(skeleton);
    return skeleton;
  }

  hideLoading(skeleton) {
    if (skeleton) skeleton.remove();
  }

  createUserCard(user, onClick) {
    const card = document.createElement('div');
    card.className = 'user-list-item';
    card.onclick = () => onClick(user);
    
    const roleColor = this.getRoleColor(user.role);
    
    card.innerHTML = `
      <div class="avatar" style="background-color: var(--bg-tertiary)">
        ${user.avatar_url ? 
          `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">` :
          `<span>${getInitials(user.username)}</span>`
        }
        <span class="status-dot ${user.is_online ? 'online' : 'offline'}"></span>
      </div>
      <div class="user-info">
        <div class="username" style="color: ${roleColor}">${escapeHtml(user.username)}</div>
        ${user.role !== 'USER' ? `<div class="role-badge" style="background: ${roleColor}20; color: ${roleColor}">${user.role}</div>` : ''}
      </div>
    `;
    
    return card;
  }

  getRoleColor(role) {
    const colors = {
      'ADMIN': 'var(--accent-admin)',
      'MODERATOR': 'var(--accent-moderator)',
      'USER': 'var(--text-primary)'
    };
    return colors[role] || colors.USER;
  }

  createMessageElement(message, isOwn) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    msgDiv.setAttribute('data-message-id', message.id);
    
    const time = formatTime(message.created_at);
    const edited = message.is_edited ? ' (editado)' : '';
    
    msgDiv.innerHTML = `
      <div class="message-content">
        <div class="message-text">${escapeHtml(message.content)}${edited}</div>
        <div class="message-time">${time}</div>
      </div>
    `;
    
    if (isOwn && isMessageEditable(message.created_at)) {
      const actions = document.createElement('div');
      actions.className = 'message-actions';
      
      const editBtn = document.createElement('button');
      editBtn.className = 'message-action-btn';
      editBtn.textContent = 'Editar';
      editBtn.onclick = () => this.showEditMessageModal(message);
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'message-action-btn';
      deleteBtn.textContent = 'Excluir';
      deleteBtn.onclick = () => this.confirmDeleteMessage(message.id);
      
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      msgDiv.appendChild(actions);
    }
    
    return msgDiv;
  }

  async showEditMessageModal(message) {
    const input = document.createElement('textarea');
    input.value = message.content;
    input.style.cssText = `
      width: 100%;
      min-height: 100px;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius-md);
      padding: var(--spacing-md);
      color: var(--text-primary);
      resize: vertical;
    `;
    
    const modal = this.createModal(
      'Editar Mensagem',
      input,
      [
        { text: 'Cancelar' },
        { 
          text: 'Salvar', 
          onClick: async () => {
            const newContent = input.value.trim();
            if (newContent && newContent !== message.content) {
              const { error } = await supabase
                .from('messages')
                .update({ 
                  content: newContent,
                  is_edited: true,
                  edited_at: new Date().toISOString()
                })
                .eq('id', message.id);
              
              if (error) {
                showToast('Erro ao editar mensagem', 'error');
              } else {
                showToast('Mensagem editada', 'success');
              }
            }
          }
        }
      ]
    );
    
    document.body.appendChild(modal);
  }

  async confirmDeleteMessage(messageId) {
    const modal = this.createModal(
      'Excluir Mensagem',
      '<p>Tem certeza que deseja excluir esta mensagem?</p>',
      [
        { text: 'Cancelar' },
        { 
          text: 'Excluir', 
          onClick: async () => {
            const { error } = await supabase
              .from('messages')
              .update({ is_deleted: true })
              .eq('id', messageId);
            
            if (error) {
              showToast('Erro ao excluir mensagem', 'error');
            } else {
              showToast('Mensagem excluída', 'success');
            }
          }
        }
      ]
    );
    
    document.body.appendChild(modal);
  }
}

const uiManager = new UIManager();