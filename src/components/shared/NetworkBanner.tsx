/**
 * NetworkBanner
 * 
 * Non-intrusive banner that appears when connection is degraded or lost.
 * Shows reconnection attempts and quality indicators.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, AlertTriangle, RefreshCw } from 'lucide-react';
import { useNetworkStatus, type ConnectionQuality } from '../../hooks/use-network-status';
import styles from './NetworkBanner.module.css';

const QUALITY_CONFIG: Record<ConnectionQuality, { icon: typeof Wifi; label: string; show: boolean }> = {
  excellent: { icon: Wifi, label: 'Connected', show: false },
  good: { icon: Wifi, label: 'Connected', show: false },
  poor: { icon: AlertTriangle, label: 'Slow connection', show: true },
  offline: { icon: WifiOff, label: 'Offline', show: true },
};

export function NetworkBanner(): JSX.Element {
  const { online, quality, reconnecting } = useNetworkStatus();
  const config = QUALITY_CONFIG[quality];
  const Icon = config.icon;

  return (
    <AnimatePresence>
      {config.show && (
        <motion.div
          className={styles.banner}
          data-quality={quality}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          role="alert"
          aria-live="assertive"
        >
          <div className={styles.inner}>
            <Icon size={14} aria-hidden="true" />
            <span className={styles.label}>{config.label}</span>
            {reconnecting && (
              <motion.span
                className={styles.reconnecting}
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              >
                <RefreshCw size={12} aria-hidden="true" />
              </motion.span>
            )}
            {!online && (
              <span className={styles.hint}>Changes saved locally</span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
