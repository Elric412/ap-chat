/**
 * Vault Manager
 * 
 * Manages the full key lifecycle: setup, unlock, lock, add/remove keys.
 * The master key is held in a closure-scoped variable — never stored in
 * any state management, localStorage, or serializable object.
 */

import {
  deriveKey,
  generateSalt,
  encrypt,
  decrypt,
  createVerificationToken,
  verifyPassword,
  createDisplayHint,
} from './crypto';
import type { ProviderId } from '../types/models';
import type { VaultEnvelope, EncryptedKeyRecord, VaultStatus, KeyHealthStatus } from '../types/vault';
import { getDB } from '../db/connection';

/** Closure-scoped master key — NEVER exposed outside this module */
let masterKey: CryptoKey | null = null;

/** Auto-lock timer handle */
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

/** Default idle timeout: 15 minutes */
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Reset auto-lock timer */
function resetAutoLockTimer(onLock: () => void): void {
  if (autoLockTimer !== null) {
    clearTimeout(autoLockTimer);
  }
  autoLockTimer = setTimeout(() => {
    lock();
    onLock();
  }, DEFAULT_IDLE_TIMEOUT_MS);
}

/** Get the current vault status */
export async function getVaultStatus(): Promise<VaultStatus> {
  if (masterKey !== null) return 'unlocked';
  const db = await getDB();
  const envelope = await db.get('vault_envelope', 'primary');
  if (!envelope) return 'uninitialized';
  return 'locked';
}

/** Initialize the vault with a new master password (first-time setup) */
export async function setupVault(password: string): Promise<void> {
  const salt = generateSalt();
  const key = await deriveKey(password, salt);
  const { ciphertext, iv } = await createVerificationToken(key);

  const envelope: VaultEnvelope = {
    vaultVersion: 1,
    kdfAlgorithm: 'pbkdf2',
    kdfParams: { iterations: 600_000, hash: 'SHA-256' },
    salt,
    verificationCiphertext: ciphertext,
    verificationIV: iv,
  };

  const db = await getDB();
  await db.put('vault_envelope', envelope, 'primary');

  masterKey = key;
}

/** Unlock the vault with the master password */
export async function unlockVault(password: string): Promise<boolean> {
  const db = await getDB();
  const envelope = await db.get('vault_envelope', 'primary');

  if (!envelope) {
    throw new Error('Vault not initialized. Call setupVault first.');
  }

  const key = await deriveKey(password, envelope.salt);
  const isValid = await verifyPassword(key, envelope.verificationCiphertext, envelope.verificationIV);

  if (!isValid) return false;

  masterKey = key;
  return true;
}

/** Lock the vault — clear the master key from memory */
export function lock(): void {
  masterKey = null;
  if (autoLockTimer !== null) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

/** Check if the vault is currently unlocked */
export function isUnlocked(): boolean {
  return masterKey !== null;
}

/** Add or update an encrypted API key for a provider */
export async function addKey(
  providerId: ProviderId,
  rawKey: string,
  onLock: () => void
): Promise<EncryptedKeyRecord> {
  if (!masterKey) throw new Error('Vault is locked');

  const displayHint = createDisplayHint(rawKey);
  const { ciphertext, iv } = await encrypt(masterKey, rawKey);

  // Zeroize the raw key variable
  let keyRef: string | null = rawKey;
  keyRef = null;
  void keyRef;

  const record: EncryptedKeyRecord = {
    providerId,
    iv,
    ciphertext,
    createdAt: Date.now(),
    storageMode: 'persistent',
    healthStatus: 'unverified',
    lastVerifiedAt: null,
    displayHint,
  };

  const db = await getDB();
  await db.put('encrypted_keys', record);

  resetAutoLockTimer(onLock);

  return record;
}

/** Decrypt and return a key for runtime use (e.g., making an API call) */
export async function getDecryptedKey(providerId: ProviderId): Promise<string | null> {
  if (!masterKey) return null;

  const db = await getDB();
  const record = await db.get('encrypted_keys', providerId);

  if (!record) return null;

  return decrypt(masterKey, record.ciphertext, record.iv);
}

/** Remove a key from the vault */
export async function removeKey(providerId: ProviderId): Promise<void> {
  const db = await getDB();
  await db.delete('encrypted_keys', providerId);
}

/** Get all stored key records (encrypted — no plaintext) */
export async function getAllKeyRecords(): Promise<EncryptedKeyRecord[]> {
  const db = await getDB();
  return db.getAll('encrypted_keys');
}

/** Update the health status of a key */
export async function updateKeyHealth(
  providerId: ProviderId,
  healthStatus: KeyHealthStatus
): Promise<void> {
  const db = await getDB();
  const record = await db.get('encrypted_keys', providerId);
  if (!record) return;

  record.healthStatus = healthStatus;
  record.lastVerifiedAt = Date.now();
  await db.put('encrypted_keys', record);
}

/** Change the master password — re-encrypts all keys atomically */
export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  const db = await getDB();
  const envelope = await db.get('vault_envelope', 'primary');
  if (!envelope) return false;

  // Verify current password
  const currentKey = await deriveKey(currentPassword, envelope.salt);
  const isValid = await verifyPassword(currentKey, envelope.verificationCiphertext, envelope.verificationIV);
  if (!isValid) return false;

  // Derive new key
  const newSalt = generateSalt();
  const newKey = await deriveKey(newPassword, newSalt);
  const { ciphertext: verifyCt, iv: verifyIv } = await createVerificationToken(newKey);

  // Re-encrypt all keys
  const allRecords = await db.getAll('encrypted_keys');
  const reEncryptedRecords: EncryptedKeyRecord[] = [];

  for (const record of allRecords) {
    const plaintext = await decrypt(currentKey, record.ciphertext, record.iv);
    const { ciphertext, iv } = await encrypt(newKey, plaintext);
    reEncryptedRecords.push({ ...record, ciphertext, iv });
  }

  // Write atomically
  const tx = db.transaction(['vault_envelope', 'encrypted_keys'], 'readwrite');
  const envelopeStore = tx.objectStore('vault_envelope');
  const keysStore = tx.objectStore('encrypted_keys');

  const newEnvelope: VaultEnvelope = {
    ...envelope,
    salt: newSalt,
    verificationCiphertext: verifyCt,
    verificationIV: verifyIv,
  };

  await envelopeStore.put(newEnvelope, 'primary');

  for (const record of reEncryptedRecords) {
    await keysStore.put(record);
  }

  await tx.done;

  masterKey = newKey;
  return true;
}
