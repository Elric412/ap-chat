import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { UISlice } from './ui-slice';
import { createUISlice } from './ui-slice';

export interface AppState extends UISlice {}

export const useAppStore = create<AppState>()(
  devtools(
    immer((...args) => ({
      ...createUISlice(...args),
    })),
    { name: 'byok-chat-store', enabled: import.meta.env.DEV }
  )
);
