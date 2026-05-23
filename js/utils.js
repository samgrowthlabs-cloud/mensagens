// Utilitários
let activeRateLimitToast = null;
let rateLimitTimerInterval = null;

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Agora';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return date.toLocaleDateString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUsername(username) {
    return username && username.length >= 3 && username.length <= 30 && /^[a-zA-Z0-9_]+$/.test(username);
}

function showToast(message, type = 'info') {
    const container = document.querySelector('.toast-container') || createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" style="margin-left: auto; color: var(--text-secondary)">
            ✕
        </button>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function createToastContainer() {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
}

function isMessageEditable(createdAt) {
    const editWindow = 24 * 60 * 60 * 1000; // 24 horas
    const now = new Date();
    const created = new Date(createdAt);
    return (now - created) < editWindow;
}


function showRateLimitNotification(seconds) {
    // Remove toast antigo se existir
    if (activeRateLimitToast) {
        clearInterval(rateLimitTimerInterval);
        activeRateLimitToast.remove();
        activeRateLimitToast = null;
    }

    const toast = document.createElement('div');
    toast.className = 'rate-limit-toast';
    toast.innerHTML = `
        <div class="toast-icon">⏱️</div>
        <div class="toast-content">
            <div class="toast-title">Limite de mensagens excedido</div>
            <div class="toast-message">Aguarde um momento antes de enviar novamente.</div>
        </div>
        <div class="toast-timer" id="rateLimitTimer">${seconds}s</div>
    `;
    document.body.appendChild(toast);
    activeRateLimitToast = toast;

    let remaining = seconds;
    const timerEl = toast.querySelector('#rateLimitTimer');

    rateLimitTimerInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(rateLimitTimerInterval);
            if (activeRateLimitToast) {
                activeRateLimitToast.classList.add('hide');
                setTimeout(() => activeRateLimitToast?.remove(), 300);
                activeRateLimitToast = null;
            }
        } else {
            timerEl.textContent = `${remaining}s`;
        }
    }, 1000);

    // Auto-fechar após o tempo (por segurança)
    setTimeout(() => {
        if (activeRateLimitToast) {
            clearInterval(rateLimitTimerInterval);
            activeRateLimitToast.classList.add('hide');
            setTimeout(() => activeRateLimitToast?.remove(), 300);
            activeRateLimitToast = null;
        }
    }, seconds * 1000);
}