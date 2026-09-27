import crypto from 'crypto';

/**
 * Password hashing (scrypt, per-user random salt).
 * Format: scrypt$<saltHex>$<hashHex>. Legacy demo hashes (bare hex, salt
 * derived from password length) are still verifiable and transparently
 * upgraded to the salted format on successful login.
 */

const KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith('scrypt$');
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    if (isLegacyHash(stored)) {
      // legacy: salt = sha256(packwise::<len>).slice(0,16)
      const salt = crypto.createHash('sha256').update(`packwise::${password.length}`).digest('hex').slice(0, 16);
      const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(stored, 'hex'));
    }
    const [, salt, hash] = stored.split('$');
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(password, salt, KEYLEN);
    return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}
