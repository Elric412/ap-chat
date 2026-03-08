import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UISlice } from './ui-slice';
import { createUISlice } from './ui-slice';
import type { VaultSlice } from './vault-slice';
import { createVaultSlice } from './vault-slice';
import type { ToastSlice } from './toast-slice';
import { createToastSlice } from './toast-slice';
import type { SessionsSlice } from './sessions-slice';
import { createSessionsSlice } from './sessions-slice';
import type { MessagesSlice } from './messages-slice';
import { createMessagesSlice } from './messages-slice';
import type { ArtifactsSlice } from './artifacts-slice';
import { createArtifactsSlice } from './artifacts-slice';
import type { ComparisonSlice } from './comparison-slice';
import { createComparisonSlice } from './comparison-slice';

export interface AppState extends UISlice, VaultSlice, ToastSlice, SessionsSlice, MessagesSlice, ArtifactsSlice, ComparisonSlice {}

export const useAppStore = create<AppState>()(
  devtools(
    immer((...args) => ({
      ...createUISlice(...args),
      ...createVaultSlice(...args),
      ...createToastSlice(...args),
      ...createSessionsSlice(...args),
      ...createMessagesSlice(...args),
      ...createArtifactsSlice(...args),
      ...createComparisonSlice(...args),
    })),
    { name: 'byok-chat-store', enabled: import.meta.env.DEV }
  )
);
