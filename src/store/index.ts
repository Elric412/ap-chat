import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UISlice } from './ui-slice';
import { createUISlice } from './ui-slice';
import type { VaultSlice } from './vault-slice';
import { createVaultSlice } from './vault-slice';
import type { ToastSlice } from './toast-slice';
import { createToastSlice } from './toast-slice';

export interface AppState extends UISlice, VaultSlice, ToastSlice {}

export const useAppStore = create<AppState>()(
  devtools(
    immer((...args) => ({
      ...createUISlice(...args),
      ...createVaultSlice(...args),
      ...createToastSlice(...args),
    })),
    { name: 'byok-chat-store', enabled: import.meta.env.DEV }
  )
);
