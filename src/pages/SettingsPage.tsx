import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Palette, Download, Info, Shield, Sparkles } from 'lucide-react';
import { KeyManagement } from '../components/vault/KeyManagement';
import { SystemPromptEditor } from '../components/system-prompt/SystemPromptEditor';
import { useTheme } from '../hooks/use-theme';
import { useAppStore } from '../store';
import { MODEL_REGISTRY } from '../constants/model-registry';
import styles from './SettingsPage.module.css';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 0.68, 0, 1] as [number, number, number, number] }
  }
};

export function SettingsPage(): JSX.Element {
  const navigate = useNavigate();
  const { resolvedTheme, toggleTheme } = useTheme();
  const conversations = useAppStore((s) => s.conversations);
  const keyRecords = useAppStore((s) => s.keyRecords);
  const activeConversationId = useAppStore((s) => s.activeConversationId);

  const totalConversations = conversations.length;
  const configuredProviders = keyRecords.length;
  const totalModels = MODEL_REGISTRY.filter((m) => !m.deprecated).length;
  const providerCount = new Set(MODEL_REGISTRY.map((m) => m.providerId)).size;

  return (
    <div className={styles.settingsPage}>
      <motion.div 
        className={styles.settingsHeader}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 0.68, 0, 1] }}
      >
        <motion.button
          className={styles.backBtn}
          onClick={() => navigate('/')}
          type="button"
          aria-label="Back to chat"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </motion.button>
        <h1 className={styles.pageTitle}>Settings</h1>
      </motion.div>

      <motion.div 
        className={styles.settingsContent}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* API Keys Section */}
        <motion.div variants={itemVariants}>
          <KeyManagement />
        </motion.div>

        {/* System Prompt Section */}
        <motion.section className={styles.section} variants={itemVariants}>
          <SystemPromptEditor conversationId={activeConversationId} />
        </motion.section>

        {/* Appearance Section */}
        <motion.section className={styles.section} variants={itemVariants}>
          <div className={styles.sectionHeader}>
            <Palette size={18} aria-hidden="true" />
            <h2 className={styles.sectionTitle}>Appearance</h2>
          </div>
          <motion.div 
            className={styles.optionRow}
            whileHover={{ scale: 1.005 }}
            transition={{ duration: 0.2 }}
          >
            <div>
              <span className={styles.optionLabel}>Theme</span>
              <span className={styles.optionDescription}>
                Currently using <strong>{resolvedTheme}</strong> mode
              </span>
            </div>
            <motion.button
              className={styles.optionButton}
              onClick={toggleTheme}
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <span>Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'}</span>
            </motion.button>
          </motion.div>
        </motion.section>

        {/* Data & Export Section */}
        <motion.section className={styles.section} variants={itemVariants}>
          <div className={styles.sectionHeader}>
            <Download size={18} aria-hidden="true" />
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
        </motion.section>

        {/* About Section */}
        <motion.section className={styles.section} variants={itemVariants}>
          <div className={styles.sectionHeader}>
            <Sparkles size={18} aria-hidden="true" />
            <h2 className={styles.sectionTitle}>About</h2>
          </div>
          <div className={styles.aboutGrid}>
            <motion.div 
              className={styles.aboutCard}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.25, ease: [0.22, 0.68, 0, 1] }}
            >
              <span className={styles.aboutValue}>{providerCount}</span>
              <span className={styles.aboutLabel}>Providers</span>
            </motion.div>
            <motion.div 
              className={styles.aboutCard}
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.25, ease: [0.22, 0.68, 0, 1] }}
            >
              <span className={styles.aboutValue}>{totalModels}</span>
              <span className={styles.aboutLabel}>Models</span>
            </motion.div>
          </div>
          <p className={styles.aboutText}>
            BYOK Chat — Multi-model AI chat with your own API keys.
            All data is stored locally in IndexedDB. API keys are encrypted with AES-256-GCM.
          </p>
          <motion.div 
            className={styles.securityNote}
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.2 }}
          >
            <Shield size={16} aria-hidden="true" />
            <span>Keys never leave your browser. No server, no tracking.</span>
          </motion.div>
        </motion.section>
      </motion.div>
    </div>
  );
}
