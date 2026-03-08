/**
 * Network Status Hook
 * 
 * Detects online/offline state, connection quality,
 * and provides auto-reconnect with exponential backoff.
 * Announces status changes via store toasts.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store';

export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'offline';

interface NetworkStatus {
  online: boolean;
  quality: ConnectionQuality;
  /** ms since last disconnect, or null if connected */
  offlineSince: number | null;
  /** Round-trip time estimate in ms */
  latencyMs: number | null;
  /** Whether we're actively trying to reconnect */
  reconnecting: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [online, setOnline] = useState(navigator.onLine);
  const [quality, setQuality] = useState<ConnectionQuality>(navigator.onLine ? 'good' : 'offline');
  const [offlineSince, setOfflineSince] = useState<number | null>(navigator.onLine ? null : Date.now());
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const addToast = useAppStore((s) => s.addToast);

  const checkLatency = useCallback(async (): Promise<number | null> => {
    try {
      const start = performance.now();
      // Use a lightweight HEAD request to test connectivity
      await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' });
      return Math.round(performance.now() - start);
    } catch {
      return null;
    }
  }, []);

  const updateQuality = useCallback((isOnline: boolean, rtt: number | null) => {
    if (!isOnline) { setQuality('offline'); return; }
    if (rtt === null) { setQuality('good'); return; }
    if (rtt < 100) setQuality('excellent');
    else if (rtt < 500) setQuality('good');
    else setQuality('poor');
  }, []);

  const handleOnline = useCallback(() => {
    setOnline(true);
    setOfflineSince(null);
    setReconnecting(false);
    reconnectAttempt.current = 0;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);

    addToast({ type: 'success', title: 'Connection restored', dismissible: true, duration: 3000 });

    // Check quality after reconnect
    void checkLatency().then((rtt) => {
      setLatencyMs(rtt);
      updateQuality(true, rtt);
    });
  }, [addToast, checkLatency, updateQuality]);

  const handleOffline = useCallback(() => {
    setOnline(false);
    setOfflineSince(Date.now());
    setQuality('offline');
    setLatencyMs(null);

    addToast({ type: 'warning', title: 'You\'re offline — changes are saved locally', dismissible: true, duration: 5000 });

    // Start reconnect loop
    setReconnecting(true);
    const tryReconnect = () => {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30_000);
      reconnectTimer.current = setTimeout(async () => {
        const rtt = await checkLatency();
        if (rtt !== null) {
          handleOnline();
        } else {
          reconnectAttempt.current++;
          tryReconnect();
        }
      }, delay);
    };
    tryReconnect();
  }, [addToast, checkLatency, handleOnline]);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic health check every 60s when online
    const interval = setInterval(async () => {
      if (!navigator.onLine) return;
      const rtt = await checkLatency();
      setLatencyMs(rtt);
      updateQuality(true, rtt);
      if (rtt === null && online) {
        // Actually offline despite navigator.onLine being true
        handleOffline();
      }
    }, 60_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [handleOnline, handleOffline, checkLatency, updateQuality, online]);

  return { online, quality, offlineSince, latencyMs, reconnecting };
}
