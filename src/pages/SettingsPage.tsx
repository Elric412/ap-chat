import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { KeyManagement } from '../components/vault/KeyManagement';
import styles from './SettingsPage.module.css';

export function SettingsPage(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className={styles.settingsPage}>
      <div className={styles.settingsHeader}>
        <button
          className={styles.backBtn}
          onClick={() => navigate('/')}
          type="button"
          aria-label="Back to chat"
        >
          <ArrowLeft size={18} />
          <span>Back to chat</span>
        </button>
        <h1 className={styles.pageTitle}>Settings</h1>
      </div>
      <div className={styles.settingsContent}>
        <KeyManagement />
      </div>
    </div>
  );
}
