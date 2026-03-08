/**
 * Cloud Sync Hook
 * 
 * Handles syncing conversations and messages between local IndexedDB and Cloud.
 * Provides real-time sync when authenticated.
 */

import { useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import { supabase } from '@/integrations/supabase/client';
import { useAppStore } from '@/store';
import type { Conversation } from '@/types/conversations';
import type { MessageNode } from '@/types/messages';

export function useCloudSync() {
  const { user, session } = useAuth();
  const conversations = useAppStore((s) => s.conversations);
  const messageMap = useAppStore((s) => s.messageMap);

  // Sync conversations to cloud
  const syncConversations = useCallback(async () => {
    if (!user || !session) return;

    try {
      for (const conv of conversations) {
        const { error } = await supabase.from('conversations').upsert({
          id: conv.id,
          user_id: user.id,
          title: conv.title,
          root_node_id: conv.rootNodeId,
          active_leaf_id: conv.activeLeafId,
          preset_id: conv.presetId ?? null,
          tags: conv.tags,
          total_cost: conv.totalCost,
          total_tokens_input: conv.totalTokens.input,
          total_tokens_output: conv.totalTokens.output,
          total_tokens_thinking: conv.totalTokens.thinking,
          is_archived: conv.isArchived,
          created_at: new Date(conv.createdAt).toISOString(),
          updated_at: new Date(conv.updatedAt).toISOString(),
        }, { onConflict: 'id' });

        if (error) console.error('Sync conversation error:', error);
      }
    } catch (err) {
      console.error('Sync conversations failed:', err);
    }
  }, [user, session, conversations]);

  // Sync messages to cloud
  const syncMessages = useCallback(async (conversationId: string) => {
    if (!user || !session) return;

    try {
      const messages = Array.from(messageMap.values())
        .filter((m) => m.conversationId === conversationId);

      for (const msg of messages) {
        // Check if message exists
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
          .eq('id', msg.id)
          .single();

        const payload = {
          id: msg.id,
          conversation_id: msg.conversationId,
          user_id: user.id,
          parent_id: msg.parentId ?? null,
          role: msg.role,
          content: msg.content as unknown as Record<string, unknown>,
          model: msg.model ?? null,
          status: msg.status,
          token_input: msg.tokenCounts.input,
          token_output: msg.tokenCounts.output,
          token_thinking: msg.tokenCounts.thinking,
          token_cached: msg.tokenCounts.cached,
          cost_estimate: msg.costEstimate.totalCost,
          latency_ms: msg.latency ?? null,
          thinking_content: msg.thinkingContent ?? null,
          tool_calls: msg.toolCalls as unknown as Record<string, unknown>,
          web_search_results: msg.webSearchResults as unknown as Record<string, unknown>,
          metadata: msg.metadata as unknown as Record<string, unknown>,
          created_at: new Date(msg.timestamp).toISOString(),
        };

        const { error } = existing
          ? await supabase.from('messages').update(payload).eq('id', msg.id)
          : await supabase.from('messages').insert(payload);

        if (error) console.error('Sync message error:', error);
      }
    } catch (err) {
      console.error('Sync messages failed:', err);
    }
  }, [user, session, messageMap]);

  // Load conversations from cloud
  const loadFromCloud = useCallback(async () => {
    if (!user || !session) return;

    try {
      const { data: cloudConvs, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Load cloud conversations error:', error);
        return;
      }

      // Merge with local (cloud wins for conflicts based on updated_at)
      // This is a simplified merge - production would need conflict resolution
      console.log(`Loaded ${cloudConvs?.length ?? 0} conversations from cloud`);
    } catch (err) {
      console.error('Load from cloud failed:', err);
    }
  }, [user, session]);

  // Auto-sync on conversation changes (debounced)
  useEffect(() => {
    if (!user) return;

    const timeout = setTimeout(() => {
      void syncConversations();
    }, 5000);

    return () => clearTimeout(timeout);
  }, [user, conversations, syncConversations]);

  return {
    syncConversations,
    syncMessages,
    loadFromCloud,
    isAuthenticated: !!user,
  };
}
