// Login Script - Autenticação Própria

document.addEventListener('DOMContentLoaded', async () => {
    // Aguardar inicialização do Supabase
    await waitForSupabase();
    
    // Verificar se já está autenticado
    if (sessionManager.isAuthenticated()) {
        const isValid = await sessionManager.validateSession();
        if (isValid) {
            redirectAfterLogin();
            return;
        }
    }
    
    // Configurar formulário
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Verificar se há hash inicial para criar
    await checkInitialSetup();
});

async function waitForSupabase() {
    // Aguardar até que db esteja disponível
    let attempts = 0;
    while (!db && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (!db) {
        console.error('❌ Supabase não inicializado após várias tentativas');
    }
}

async function checkInitialSetup() {
    try {
        // Verificar se o admin bidjo existe com hash temporário
        const bidjo = await databaseManager.getUserByUsername('bidjo');
        
        if (bidjo && bidjo.password_hash === 'temp_hash_will_be_updated') {
            // Criar hash inicial
            const newHash = await cryptoManager.createPasswordHash('sam363444');
            await databaseManager.updateUser(bidjo.id, { 
                password_hash: newHash 
            });
            console.log('✅ Hash inicial do admin criado');
        }
    } catch (error) {
        console.warn('Aviso ao verificar setup inicial:', error);
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const usernameOrEmail = document.getElementById('usernameOrEmail').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('errorMessage');
    const submitBtn = document.querySelector('.btn-login');
    
    // Reset
    errorDiv.style.display = 'none';
    
    if (!usernameOrEmail || !password) {
        showError('Preencha todos os campos');
        return;
    }
    
    // Loading state
    submitBtn.classList.add('loading');
    
    try {
        const session = await sessionManager.login(usernameOrEmail, password);
        
        showToast('Login realizado com sucesso!', 'success');
        
        setTimeout(() => {
            redirectAfterLogin();
        }, 500);
        
    } catch (error) {
        showError(error.message);
    } finally {
        submitBtn.classList.remove('loading');
    }
}

function redirectAfterLogin() {
    const user = sessionManager.getCurrentUser();
    
    if (user && user.role === 'admin') {
        window.location.href = '/admin/index.html';
    } else {
        window.location.href = '/chat/index.html';
    }
}

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.style.animation = 'fadeIn 0.3s ease';
}

function togglePassword() {
    const input = document.getElementById('password');
    input.type = input.type === 'password' ? 'text' : 'password';
}