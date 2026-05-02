import type { StateCreator } from 'zustand';
import type { VaultStatus, EncryptedKeyRecord } from '../types/vault';
import type { ProviderId } from '../types/models';
import * as vaultManager from '../vault/vault-manager';
import { getAdapter } from '../adapters/registry';

export interface VaultSlice {
  vaultStatus: VaultStatus;
  keyRecords: EncryptedKeyRecord[];
  vaultLoading: boolean;
  vaultError: string | null;
  verifyingKey: ProviderId | null;
  /** When true, force-show the vault setup/unlock modal even if auto-prompt is disabled. */
  forceVaultPrompt: boolean;

  initVault: () => Promise<void>;
  setupVault: (password: string) => Promise<void>;
  unlockVault: (password: string) => Promise<boolean>;
  lockVault: () => void;
  addKey: (providerId: ProviderId, rawKey: string) => Promise<EncryptedKeyRecord>;
  removeKey: (providerId: ProviderId) => Promise<void>;
  refreshKeyRecords: () => Promise<void>;
  verifyKey: (providerId: ProviderId) => Promise<'healthy' | 'invalid'>;
  requestVaultPrompt: () => void;
  dismissVaultPrompt: () => void;
}

export const createVaultSlice: StateCreator<VaultSlice, [['zustand/immer', never]], [], VaultSlice> = (set, get) => ({
  vaultStatus: 'uninitialized',
  keyRecords: [],
  vaultLoading: false,
  vaultError: null,
  verifyingKey: null,
  forceVaultPrompt: false,

  requestVaultPrompt: () => {
    set((state) => { state.forceVaultPrompt = true; });
  },
  dismissVaultPrompt: () => {
    set((state) => { state.forceVaultPrompt = false; });
  },

  initVault: async () => {
    set((state) => { state.vaultLoading = true; });
    try {
      const status = await vaultManager.getVaultStatus();
      const records = status === 'unlocked' ? await vaultManager.getAllKeyRecords() : [];
      set((state) => {
        state.vaultStatus = status;
        state.keyRecords = records;
        state.vaultLoading = false;
      });
    } catch {
      set((state) => { state.vaultLoading = false; });
    }
  },

  setupVault: async (password) => {
    set((state) => { state.vaultLoading = true; state.vaultError = null; });
    try {
      await vaultManager.setupVault(password);
      set((state) => {
        state.vaultStatus = 'unlocked';
        state.vaultLoading = false;
        state.forceVaultPrompt = false;
      });
    } catch (err) {
      set((state) => {
        state.vaultError = err instanceof Error ? err.message : 'Setup failed';
        state.vaultLoading = false;
      });
    }
  },

  unlockVault: async (password) => {
    set((state) => { state.vaultLoading = true; state.vaultError = null; });
    try {
      const success = await vaultManager.unlockVault(password);
      if (success) {
        const records = await vaultManager.getAllKeyRecords();
        set((state) => {
          state.vaultStatus = 'unlocked';
          state.keyRecords = records;
          state.vaultLoading = false;
          state.forceVaultPrompt = false;
        });
      } else {
        set((state) => {
          state.vaultError = 'Incorrect password';
          state.vaultLoading = false;
        });
      }
      return success;
    } catch {
      set((state) => {
        state.vaultError = 'Unlock failed';
        state.vaultLoading = false;
      });
      return false;
    }
  },

  lockVault: () => {
    vaultManager.lock();
    set((state) => {
      state.vaultStatus = 'locked';
      state.keyRecords = [];
    });
  },

  addKey: async (providerId, rawKey) => {
    const record = await vaultManager.addKey(providerId, rawKey, () => {
      get().lockVault();
    });
    set((state) => {
      const idx = state.keyRecords.findIndex((r) => r.providerId === providerId);
      if (idx >= 0) {
        state.keyRecords[idx] = record;
      } else {
        state.keyRecords.push(record);
      }
    });
    return record;
  },

  removeKey: async (providerId) => {
    await vaultManager.removeKey(providerId);
    set((state) => {
      state.keyRecords = state.keyRecords.filter((r) => r.providerId !== providerId);
    });
  },

  refreshKeyRecords: async () => {
    const records = await vaultManager.getAllKeyRecords();
    set((state) => { state.keyRecords = records; });
  },

  verifyKey: async (providerId) => {
    set((state) => { state.verifyingKey = providerId; });
    try {
      const decryptedKey = await vaultManager.getDecryptedKey(providerId);
      if (!decryptedKey) {
        await vaultManager.updateKeyHealth(providerId, 'invalid');
        await get().refreshKeyRecords();
        return 'invalid';
      }

      const adapter = getAdapter(providerId);
      const isValid = await adapter.validateKey(decryptedKey);
      const status = isValid ? 'healthy' : 'invalid';

      await vaultManager.updateKeyHealth(providerId, status);
      await get().refreshKeyRecords();
      return status;
    } catch {
      await vaultManager.updateKeyHealth(providerId, 'invalid');
      await get().refreshKeyRecords();
      return 'invalid';
    } finally {
      set((state) => { state.verifyingKey = null; });
    }
  },
});
