// Sistema de hash de senha simples usando Web Crypto API

class CryptoManager {
    constructor() {
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
    }

    // Gerar hash SHA-256 da senha
    async hashPassword(password) {
        const data = this.encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    // Gerar salt aleatório
    generateSalt(length = 32) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }

    // Gerar hash com salt (SHA-256 + salt)
    async hashPasswordWithSalt(password, salt) {
        const saltedPassword = password + salt;
        const data = this.encoder.encode(saltedPassword);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return `${salt}:${hashHex}`;
    }

    // Verificar senha
    async verifyPassword(password, storedHash) {
        // Verificar se o hash contém salt
        if (storedHash.includes(':')) {
            const [salt, originalHash] = storedHash.split(':');
            const newHash = await this.hashPasswordWithSalt(password, salt);
            const [, newHashOnly] = newHash.split(':');
            return newHashOnly === originalHash;
        } else {
            // Hash simples (para compatibilidade)
            const newHash = await this.hashPassword(password);
            return newHash === storedHash;
        }
    }

    // Criar hash inicial para nova senha
    async createPasswordHash(password) {
        const salt = this.generateSalt();
        return await this.hashPasswordWithSalt(password, salt);
    }

    // Gerar token aleatório para sessão
    generateToken(length = CONFIG.TOKEN_LENGTH) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }
}

const cryptoManager = new CryptoManager();