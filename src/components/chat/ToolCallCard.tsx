/**
 * ToolCallCard
 * 
 * Renders a tool call with its arguments and an approval UI.
 * Shows approve/deny buttons for pending calls, status badges otherwise.
 */

import { Wrench, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ToolCall } from '../../types/messages';
import styles from './ToolCallCard.module.css';

interface ToolCallCardProps {
  toolCall: ToolCall;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

type Ease4 = [number, number, number, number];
const EASE_OUT: Ease4 = [0.16, 1, 0.3, 1];
const EASE_SNAP: Ease4 = [0.34, 1.56, 0.64, 1];
const EASE_SILK: Ease4 = [0.19, 1, 0.22, 1];

const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: EASE_OUT },
  },
};

const badgeVariants = {
  initial: { opacity: 0, scale: 0.7 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: EASE_SNAP },
  },
  exit: {
    opacity: 0,
    scale: 0.7,
    transition: { duration: 0.15 },
  },
};

export function ToolCallCard({ toolCall, onApprove, onDeny }: ToolCallCardProps): JSX.Element {
  const isPending = toolCall.status === 'pending_approval';
  const isExecuting = toolCall.status === 'executing';
  const isCompleted = toolCall.status === 'completed';
  const isFailed = toolCall.status === 'failed';
  const isDenied = toolCall.status === 'denied';

  return (
    <motion.div
      className={styles.card}
      data-status={toolCall.status}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      layout
    >
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <motion.span
            animate={isExecuting ? { rotate: [0, 360] } : { rotate: 0 }}
            transition={isExecuting ? { duration: 2, repeat: Infinity, ease: 'linear' } : { duration: 0.3 }}
          >
            <Wrench size={14} className={styles.icon} aria-hidden="true" />
          </motion.span>
          <span className={styles.toolName}>{toolCall.toolName}</span>
        </div>
        <div className={styles.statusArea}>
          <AnimatePresence mode="wait">
            {isExecuting && (
              <motion.span key="executing" className={styles.badge} data-variant="executing" variants={badgeVariants} initial="initial" animate="animate" exit="exit">
                <Loader2 size={12} className={styles.spinner} aria-hidden="true" />
                Running
              </motion.span>
            )}
            {isCompleted && (
              <motion.span key="completed" className={styles.badge} data-variant="completed" variants={badgeVariants} initial="initial" animate="animate" exit="exit">
                <Check size={12} aria-hidden="true" />
                Done
              </motion.span>
            )}
            {isFailed && (
              <motion.span key="failed" className={styles.badge} data-variant="failed" variants={badgeVariants} initial="initial" animate="animate" exit="exit">
                <AlertTriangle size={12} aria-hidden="true" />
                Failed
              </motion.span>
            )}
            {isDenied && (
              <motion.span key="denied" className={styles.badge} data-variant="denied" variants={badgeVariants} initial="initial" animate="animate" exit="exit">
                <X size={12} aria-hidden="true" />
                Denied
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Arguments display */}
      {Object.keys(toolCall.arguments).length > 0 && (
        <motion.div
          className={styles.arguments}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
        >
          {Object.entries(toolCall.arguments).map(([key, value], i) => (
            <motion.div
              key={key}
              className={styles.argRow}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className={styles.argKey}>{key}</span>
              <span className={styles.argValue}>
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Approval buttons */}
      <AnimatePresence>
        {isPending && (
          <motion.div
            className={styles.actions}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.button
              className={styles.approveButton}
              onClick={() => onApprove(toolCall.id)}
              type="button"
              aria-label={`Approve ${toolCall.toolName}`}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <Check size={14} aria-hidden="true" />
              Approve
            </motion.button>
            <motion.button
              className={styles.denyButton}
              onClick={() => onDeny(toolCall.id)}
              type="button"
              aria-label={`Deny ${toolCall.toolName}`}
              whileHover={{ scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <X size={14} aria-hidden="true" />
              Deny
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
