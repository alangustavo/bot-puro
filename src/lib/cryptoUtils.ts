import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
const secret = process.env.ENCRYPTION_SECRET || 'default_secret_key_32_chars_long!';
const key = crypto.createHash('sha256').update(secret).digest();
const ivLength = 16;

export function encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
    if (!encrypted) return '';
    const parts = encrypted.split(':');
    if (parts.length !== 2) return encrypted;
    const [ivHex, encryptedText] = parts;
    if (!ivHex || !encryptedText) return encrypted;
    const iv = Buffer.from(ivHex, 'hex');
    if (iv.length !== 16) return encrypted;
    try {
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch {
        return encrypted;
    }
}
