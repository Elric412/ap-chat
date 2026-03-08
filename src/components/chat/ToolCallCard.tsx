/**
 * ToolCallCard
 * 
 * Renders a tool call with its arguments and an approval UI.
 * Shows approve/deny buttons for pending calls, status badges otherwise.
 */

import { Wrench, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import type { ToolCall } from '../../types/messages';
import styles from './ToolCallCard.module.css';

interface ToolCallCardProps {
  toolCall: ToolCall;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

export function ToolCallCard({ toolCall, onApprove, onDeny }: ToolCallCardProps): JSX.Element {
  const isPending = toolCall.status === 'pending_approval';
  const isExecuting = toolCall.status === 'executing';
  const isCompleted = toolCall.status === 'completed';
  const isFailed = toolCall.status === 'failed';
  const isDenied = toolCall.status === 'denied';

  return (
    <div className={styles.card} data-status={toolCall.status}>
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <Wrench size={14} className={styles.icon} aria-hidden="true" />
          <span className={styles.toolName}>{toolCall.toolName}</span>
        </div>
        <div className={styles.statusArea}>
          {isExecuting && (
            <span className={styles.badge} data-variant="executing">
              <Loader2 size={12} className={styles.spinner} aria-hidden="true" />
              Running
            </span>
          )}
          {isCompleted && (
            <span className={styles.badge} data-variant="completed">
              <Check size={12} aria-hidden="true" />
              Done
            </span>
          )}
          {isFailed && (
            <span className={styles.badge} data-variant="failed">
              <AlertTriangle size={12} aria-hidden="true" />
              Failed
            </span>
          )}
          {isDenied && (
            <span className={styles.badge} data-variant="denied">
              <X size={12} aria-hidden="true" />
              Denied
            </span>
          )}
        </div>
      </div>

      {/* Arguments display */}
      {Object.keys(toolCall.arguments).length > 0 && (
        <div className={styles.arguments}>
          {Object.entries(toolCall.arguments).map(([key, value]) => (
            <div key={key} className={styles.argRow}>
              <span className={styles.argKey}>{key}</span>
              <span className={styles.argValue}>
                {typeof value === 'string' ? value : JSON.stringify(value)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Approval buttons */}
      {isPending && (
        <div className={styles.actions}>
          <button
            className={styles.approveButton}
            onClick={() => onApprove(toolCall.id)}
            type="button"
            aria-label={`Approve ${toolCall.toolName}`}
          >
            <Check size={14} aria-hidden="true" />
            Approve
          </button>
          <button
            className={styles.denyButton}
            onClick={() => onDeny(toolCall.id)}
            type="button"
            aria-label={`Deny ${toolCall.toolName}`}
          >
            <X size={14} aria-hidden="true" />
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
