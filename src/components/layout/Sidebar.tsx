import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';
import { useTheme } from '../../hooks/use-theme';
import { Sun, Moon, Plus, Settings, Lock, Unlock } from 'lucide-react';
import styles from './Sidebar.module.css';

export function Sidebar(): JSX.Element {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const vaultStatus = useAppStore((s) => s.vaultStatus);
  const keyRecords = useAppStore((s) => s.keyRecords);
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const configuredCount = keyRecords.length;

  return (
    <nav className={styles.sidebar} data-collapsed={sidebarCollapsed} aria-label="Sidebar">
      <div className={styles.sidebarHeader}>
        <span className={styles.appName}>BYOK Chat</span>
        <button
          className={styles.newChatButton}
          aria-label="New conversation"
          type="button"
          onClick={() => navigate('/')}
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
          onClick={() => navigate('/settings')}
          type="button"
          data-active={location.pathname === '/settings'}
          aria-label="Settings"
        >
          {vaultStatus === 'unlocked'
            ? <Unlock size={16} aria-hidden="true" />
            : vaultStatus === 'locked'
            ? <Lock size={16} aria-hidden="true" />
            : <Settings size={16} aria-hidden="true" />
          }
          <span>
            {vaultStatus === 'unlocked'
              ? `Keys (${configuredCount})`
              : 'Settings'
            }
          </span>
        </button>
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
