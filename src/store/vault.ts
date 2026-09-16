import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface UserVaultData {
  profile: Record<string, any>;
  documents: Record<string, { filename: string; mimeType: string; dataBase64: string }>;
}

export class EncryptedUserVault {
  private key: Buffer;

  constructor(masterSecret: string = 'automaio-default-vault-key-32ch') {
    // Derive 32-byte key
    this.key = scryptSync(masterSecret, 'automaio-salt', 32);
  }

  encrypt(data: UserVaultData): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const plaintext = JSON.stringify(data);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(ciphertext: string): UserVaultData {
    const [ivHex, authTagHex, encryptedData] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }
}
