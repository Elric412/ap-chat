/**
 * StreamingSkeleton — Premium loading skeleton shown while waiting for AI response.
 */

import { motion } from 'framer-motion';
import styles from './StreamingSkeleton.module.css';

type Ease4 = [number, number, number, number];
const EASE_OUT: Ease4 = [0.16, 1, 0.3, 1];

export function StreamingSkeleton(): JSX.Element {
  return (
    <motion.div
      className={styles.skeleton}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
      aria-label="Loading response"
      role="status"
    >
      <div className={styles.header}>
        <div className={styles.avatar} />
        <div className={styles.roleTag} />
      </div>
      <div className={styles.lines}>
        <div className={styles.line} />
        <div className={styles.line} />
        <div className={styles.line} />
        <div className={styles.line} />
      </div>
      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </motion.div>
  );
}
