// Supabase Configuration
const SUPABASE_URL = "https://yiuljwcgjjdsdelaivum.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QFJDac86P7a2HbmrhTcquQ_UR3ST8lY";


// Configurações do sistema
const CONFIG = {
    SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 horas
    TOKEN_LENGTH: 64,
    MESSAGE_EDIT_WINDOW: 24 * 60 * 60 * 1000, // 24 horas
    MAX_MESSAGE_LENGTH: 5000,
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

// Inicializar cliente Supabase
let db;

function initSupabase() {
    if (typeof window.supabase !== 'undefined') {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase inicializado');
        return db;
    } else {
        console.error('❌ Supabase não carregado');
        return null;
    }
}

// Inicializar automaticamente
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
});