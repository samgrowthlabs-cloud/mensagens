async function login(usernameOrEmail, password) {
    let email = usernameOrEmail;
    
    if (!usernameOrEmail.includes('@')) {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('email')
            .eq('username', usernameOrEmail)
            .single();
        
        if (profile) {
            email = profile.email;
        }
    }
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });
    
    if (error) throw error;
    
    // Verificar se está banido
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('auth_id', data.user.id)
        .single();
    
    if (profile) {
        const { data: banned } = await supabaseClient
            .from('banned_users')
            .select('user_id')
            .eq('user_id', profile.id)
            .single();
        
        if (banned) {
            await supabaseClient.auth.signOut();
            throw new Error('Usuário banido');
        }
    }
    
    return data;
}

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = '/login/';
}

async function isAdmin() {
    const user = await getCurrentUser();
    return user?.profile?.is_admin === true;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}