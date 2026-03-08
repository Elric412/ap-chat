import { useAppStore } from '../../store';
import { Toast } from './Toast';
import styles from './ToastStack.module.css';

export function ToastStack(): JSX.Element {
  const toasts = useAppStore((s) => s.toasts);
  const removeToast = useAppStore((s) => s.removeToast);

  if (toasts.length === 0) return <></>;

  return (
    <div className={styles.stack} aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}
