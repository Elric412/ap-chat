/**
 * DynamicIsland — A macOS-inspired morphing pill that
 * reflects the app's current status (saving, saved, streaming, idle).
 * Expands/contracts smoothly with spring physics.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import styles from './Header.module.css';

type Ease4 = [number, number, number, number];
const EASE_SILK: Ease4 = [0.19, 1, 0.22, 1];
const EASE_SNAP: Ease4 = [0.34, 1.56, 0.64, 1];

export function DynamicIsland(): JSX.Element {
  const autoSaveStatus = useAppStore((s) => s.autoSaveStatus);

  const isExpanded = autoSaveStatus !== 'idle';
  const statusLabel = autoSaveStatus === 'saving' ? 'Syncing…'
    : autoSaveStatus === 'saved' ? 'Saved'
    : autoSaveStatus === 'error' ? 'Sync error'
    : '';

  return (
    <motion.div
      className={styles.dynamicIsland}
      data-expanded={isExpanded}
      layout
      transition={{
        layout: { duration: 0.4, ease: EASE_SILK },
      }}
    >
      <motion.span
        className={styles.islandDot}
        data-status={autoSaveStatus}
        layout="position"
        transition={{ duration: 0.3, ease: EASE_SNAP }}
      />
      <AnimatePresence mode="wait">
        {isExpanded && (
          <motion.span
            key={autoSaveStatus}
            className={styles.islandLabel}
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            transition={{ duration: 0.3, ease: EASE_SILK }}
          >
            {statusLabel}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
