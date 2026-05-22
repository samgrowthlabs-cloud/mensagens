// Supabase Configuration
const SUPABASE_URL = "https://yiuljwcgjjdsdelaivum.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QFJDac86P7a2HbmrhTcquQ_UR3ST8lY";


// Configurações do sistema
const CONFIG = {
    SESSION_DURATION: 24 * 60 * 60 * 1000,
    TOKEN_LENGTH: 64,
    MESSAGE_EDIT_WINDOW: 24 * 60 * 60 * 1000,
    MAX_MESSAGE_LENGTH: 5000,
    MAX_FILE_SIZE: 5 * 1024 * 1024,
    ALLOWED_FILE_TYPES: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
    ]
};

// Inicializar cliente Supabase
const db = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

// Global
window.db = db;

console.log('✅ Supabase inicializado');