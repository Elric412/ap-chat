import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Palette, Download, Info, Shield, ExternalLink } from 'lucide-react';
import { KeyManagement } from '../components/vault/KeyManagement';
import { useTheme } from '../hooks/use-theme';
import { useAppStore } from '../store';
import { MODEL_REGISTRY } from '../constants/model-registry';
import { PROVIDER_META } from '../constants/provider-meta';
import styles from './SettingsPage.module.css';

export function SettingsPage(): JSX.Element {
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();
  const conversations = useAppStore((s) => s.conversations);
  const keyRecords = useAppStore((s) => s.keyRecords);

  const totalConversations = conversations.length;
  const configuredProviders = keyRecords.length;
  const totalModels = MODEL_REGISTRY.filter((m) => !m.deprecated).length;
  const providerCount = new Set(MODEL_REGISTRY.map((m) => m.providerId)).size;

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
        {/* API Keys Section */}
        <KeyManagement />

        {/* Appearance Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Palette size={16} aria-hidden="true" />
            <h2 className={styles.sectionTitle}>Appearance</h2>
          </div>
          <div className={styles.optionRow}>
            <div>
              <span className={styles.optionLabel}>Theme</span>
              <span className={styles.optionDescription}>
                Currently using {resolvedTheme} mode
              </span>
            </div>
            <button
              className={styles.optionButton}
              onClick={toggleTheme}
              type="button"
            >
              Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'}
            </button>
          </div>
        </section>

        {/* Data & Export Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Download size={16} aria-hidden="true" />
            <h2 className={styles.sectionTitle}>Data & Export</h2>
          </div>
          <div className={styles.optionRow}>
            <div>
              <span className={styles.optionLabel}>Export Conversation</span>
              <span className={styles.optionDescription}>
                Use <kbd>⌘K</kbd> → "Export as Markdown" or "Export as JSON"
              </span>
            </div>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Conversations</span>
            <span className={styles.statValue}>{totalConversations}</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Configured providers</span>
            <span className={styles.statValue}>{configuredProviders} / {providerCount}</span>
          </div>
        </section>

        {/* About Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Info size={16} aria-hidden="true" />
            <h2 className={styles.sectionTitle}>About</h2>
          </div>
          <div className={styles.aboutGrid}>
            <div className={styles.aboutCard}>
              <span className={styles.aboutValue}>{providerCount}</span>
              <span className={styles.aboutLabel}>Providers</span>
            </div>
            <div className={styles.aboutCard}>
              <span className={styles.aboutValue}>{totalModels}</span>
              <span className={styles.aboutLabel}>Models</span>
            </div>
          </div>
          <p className={styles.aboutText}>
            BYOK Chat — Multi-model AI chat with your own API keys.
            All data is stored locally in IndexedDB. API keys are encrypted with AES-256-GCM.
          </p>
          <div className={styles.securityNote}>
            <Shield size={14} aria-hidden="true" />
            <span>Keys never leave your browser. No server, no tracking.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
