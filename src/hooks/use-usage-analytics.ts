/**
 * Usage Analytics Hook
 * 
 * Fetches and manages usage statistics from Cloud.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import { supabase } from '@/integrations/supabase/client';

interface UsageStat {
  provider_id: string;
  day: string;
  request_count: number;
  total_input: number;
  total_output: number;
  total_thinking: number;
  total_cost: number;
  avg_latency_ms: number;
}

interface UsageSummary {
  totalRequests: number;
  totalCost: number;
  totalTokens: number;
  avgLatency: number;
  byProvider: Record<string, {
    requests: number;
    cost: number;
    tokens: number;
  }>;
  dailyStats: UsageStat[];
}

export function useUsageAnalytics(days: number = 30) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!user) {
      setSummary(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error: fetchError } = await supabase
        .from('usage_stats')
        .select('*')
        .eq('user_id', user.id)
        .gte('day', startDate.toISOString());

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      // Aggregate stats
      const byProvider: UsageSummary['byProvider'] = {};
      let totalRequests = 0;
      let totalCost = 0;
      let totalTokens = 0;
      let totalLatency = 0;
      let latencyCount = 0;

      for (const stat of data ?? []) {
        const providerId = stat.provider_id ?? 'unknown';
        const requests = Number(stat.request_count) || 0;
        const cost = Number(stat.total_cost) || 0;
        const tokens = (Number(stat.total_input) || 0) + (Number(stat.total_output) || 0);
        const latency = Number(stat.avg_latency_ms) || 0;

        totalRequests += requests;
        totalCost += cost;
        totalTokens += tokens;
        if (latency > 0) {
          totalLatency += latency * requests;
          latencyCount += requests;
        }

        if (!byProvider[providerId]) {
          byProvider[providerId] = { requests: 0, cost: 0, tokens: 0 };
        }
        byProvider[providerId].requests += requests;
        byProvider[providerId].cost += cost;
        byProvider[providerId].tokens += tokens;
      }

      setSummary({
        totalRequests,
        totalCost,
        totalTokens,
        avgLatency: latencyCount > 0 ? totalLatency / latencyCount : 0,
        byProvider,
        dailyStats: (data ?? []) as UsageStat[],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch usage');
    } finally {
      setLoading(false);
    }
  }, [user, days]);

  useEffect(() => {
    void fetchUsage();
  }, [fetchUsage]);

  return { loading, error, summary, refetch: fetchUsage };
}
