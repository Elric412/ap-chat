/**
 * StreamCursor
 * 
 * Multi-stage pulsing cursor shown at the end of a streaming assistant message.
 * Features a breathing glow with organic timing.
 */

import { motion, AnimatePresence } from 'framer-motion';
import styles from './StreamCursor.module.css';

interface StreamCursorProps {
  visible: boolean;
}

export function StreamCursor({ visible }: StreamCursorProps): JSX.Element {
  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          className={styles.cursor}
          aria-hidden="true"
          initial={{ opacity: 0, scaleY: 0.3 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0.3, transition: { duration: 0.15 } }}
          transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
        />
      )}
    </AnimatePresence>
  );
}
