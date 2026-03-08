import { useAppStore } from '../../store';
import { useTheme } from '../../hooks/use-theme';
import { Sun, Moon, Plus } from 'lucide-react';
import styles from './Sidebar.module.css';

export function Sidebar(): JSX.Element {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <nav className={styles.sidebar} data-collapsed={sidebarCollapsed} aria-label="Sidebar">
      <div className={styles.sidebarHeader}>
        <span className={styles.appName}>BYOK Chat</span>
        <button
          className={styles.newChatButton}
          aria-label="New conversation"
          type="button"
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.conversationList}>
        <p className={styles.emptyList}>No conversations yet</p>
      </div>
      <div className={styles.sidebarFooter}>
        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          type="button"
          aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {resolvedTheme === 'dark'
            ? <Sun size={16} aria-hidden="true" />
            : <Moon size={16} aria-hidden="true" />
          }
          <span>{resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </nav>
  );
}
