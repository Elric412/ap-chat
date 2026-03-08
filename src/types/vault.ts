import type { ProviderId } from './models';

export type KeyHealthStatus =
  | 'unverified'
  | 'healthy'
  | 'cooldown'
  | 'invalid'
  | 'expired'
  | 'revoked';

export type KdfAlgorithm = 'argon2id' | 'pbkdf2';
export type StorageMode = 'persistent' | 'session';
export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked';

export interface EncryptedKeyRecord {
  providerId: ProviderId;
  iv: Uint8Array;
  ciphertext: Uint8Array;
  createdAt: number;
  storageMode: StorageMode;
  healthStatus: KeyHealthStatus;
  lastVerifiedAt: number | null;
  displayHint: string;
}

export interface VaultEnvelope {
  vaultVersion: number;
  kdfAlgorithm: KdfAlgorithm;
  kdfParams: Record<string, unknown>;
  salt: Uint8Array;
  verificationCiphertext: Uint8Array;
  verificationIV: Uint8Array;
}
