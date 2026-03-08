import type { StateCreator } from 'zustand';
import type { Toast } from '../types/ui';
import { uuidv7 } from '../lib/uuid';

export interface ToastSlice {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const createToastSlice: StateCreator<ToastSlice, [['zustand/immer', never]], [], ToastSlice> = (set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = uuidv7();
    const newToast: Toast = { ...toast, id };
    set((state) => {
      state.toasts.push(newToast);
    });

    // Auto-dismiss
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => {
          state.toasts = state.toasts.filter((t) => t.id !== id);
        });
      }, duration);
    }

    return id;
  },

  removeToast: (id) => {
    set((state) => {
      state.toasts = state.toasts.filter((t) => t.id !== id);
    });
  },

  clearToasts: () => {
    set((state) => { state.toasts = []; });
  },
});
