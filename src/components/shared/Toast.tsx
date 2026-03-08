import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import type { Toast as ToastType } from '../../types/ui';
import styles from './Toast.module.css';

interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

const ICONS = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
} as const;

export function Toast({ toast, onDismiss }: ToastProps): JSX.Element {
  const Icon = ICONS[toast.type];

  return (
    <div className={styles.toast} data-type={toast.type} role="alert">
      <span className={styles.iconWrapper} data-type={toast.type}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className={styles.content}>
        <div className={styles.title}>{toast.title}</div>
        {toast.description && (
          <div className={styles.description}>{toast.description}</div>
        )}
      </div>
      {toast.dismissible && (
        <button
          className={styles.closeButton}
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          type="button"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
