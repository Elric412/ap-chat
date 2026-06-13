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
import type { SystemPromptsSlice } from './system-prompts-slice';
import { createSystemPromptsSlice } from './system-prompts-slice';
import type { SkillsSlice } from './skills-slice';
import { createSkillsSlice } from './skills-slice';
import type { SandboxSlice } from './sandbox-slice';
import { createSandboxSlice } from './sandbox-slice';
import type { SwarmSlice } from './swarm-slice';
import { createSwarmSlice } from './swarm-slice';

export interface AppState extends UISlice, VaultSlice, ToastSlice, SessionsSlice, MessagesSlice, ArtifactsSlice, ComparisonSlice, SystemPromptsSlice, SkillsSlice, SandboxSlice, SwarmSlice {}

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
      ...createSystemPromptsSlice(...args),
      ...createSkillsSlice(...args),
      ...createSandboxSlice(...args),
      ...createSwarmSlice(...args),
    })),
    { name: 'byok-chat-store', enabled: import.meta.env.DEV }
  )
);
