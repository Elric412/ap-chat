/**
 * Auto-Save Hook
 * 
 * Debounced auto-save that syncs conversations to cloud
 * whenever messages or conversations change.
 */

import { useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { useCloudSync } from './use-cloud-sync';
import { useAppStore } from '@/store';

const SAVE_DEBOUNCE_MS = 3000;

export function useAutoSave() {
  const { user } = useAuth();
  const { syncConversations, syncMessages } = useCloudSync();
  const setAutoSaveStatus = useAppStore((s) => s.setAutoSaveStatus);
  const conversations = useAppStore((s) => s.conversations);
  const messageMap = useAppStore((s) => s.messageMap);
  const activeConversationId = useAppStore((s) => s.activeConversationId);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevConvRef = useRef(conversations);
  const prevMsgRef = useRef(messageMap);

  useEffect(() => {
    if (!user) return;

    // Detect changes
    const convsChanged = conversations !== prevConvRef.current;
    const msgsChanged = messageMap !== prevMsgRef.current;
    prevConvRef.current = conversations;
    prevMsgRef.current = messageMap;

    if (!convsChanged && !msgsChanged) return;

    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current);

    setAutoSaveStatus('saving');

    timerRef.current = setTimeout(async () => {
      try {
        await syncConversations();
        if (activeConversationId) {
          await syncMessages(activeConversationId);
        }
        setAutoSaveStatus('saved');
        // Reset to idle after 3s
        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 3000);
      } catch {
        setAutoSaveStatus('error');
        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 5000);
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, conversations, messageMap, activeConversationId, syncConversations, syncMessages, setAutoSaveStatus]);
}
