/**
 * Vault Cryptography Module
 * 
 * Implements AES-256-GCM encryption with PBKDF2-derived master key.
 * All cryptographic operations use the Web Crypto API (crypto.subtle).
 * The master key is held in a closure-scoped variable and never exposed.
 */

const PBKDF2_ITERATIONS = 600_000; // OWASP 2024 recommendation
const SALT_LENGTH = 16; // 128-bit
const IV_LENGTH = 12; // 96-bit for AES-GCM
const KEY_LENGTH = 256; // AES-256
const VERIFICATION_PLAINTEXT = 'byok-vault-verification-token-v1';

/** Generate cryptographically random salt */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  return salt;
}

/** Generate cryptographically random IV */
export function generateIV(): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

/** Derive a 256-bit master key from password + salt using PBKDF2-SHA256 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer as ArrayBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false, // non-extractable
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/** Encrypt plaintext with AES-256-GCM */
export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const encoder = new TextEncoder();
  const iv = generateIV();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    key,
    encoder.encode(plaintext) as ArrayBuffer
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
  };
}

/** Decrypt ciphertext with AES-256-GCM */
export async function decrypt(
  key: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    key,
    ciphertext as unknown as ArrayBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/** Create a verification token to validate the master password on unlock */
export async function createVerificationToken(
  key: CryptoKey
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  return encrypt(key, VERIFICATION_PLAINTEXT);
}

/** Verify master password by attempting to decrypt the verification token */
export async function verifyPassword(
  key: CryptoKey,
  verificationCiphertext: Uint8Array,
  verificationIV: Uint8Array
): Promise<boolean> {
  try {
    const decrypted = await decrypt(key, verificationCiphertext, verificationIV);
    return decrypted === VERIFICATION_PLAINTEXT;
  } catch {
    return false;
  }
}

/** Create a display hint from a raw API key (first 4 + last 4 chars) */
export function createDisplayHint(rawKey: string): string {
  if (rawKey.length <= 8) return '****';
  const first = rawKey.slice(0, 4);
  const last = rawKey.slice(-4);
  return `${first}****${last}`;
}
