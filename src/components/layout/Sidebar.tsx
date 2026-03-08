import { useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';
import { useTheme } from '../../hooks/use-theme';
import { Sun, Moon, Plus, Settings, Lock, Unlock } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import styles from './Sidebar.module.css';

export function Sidebar(): JSX.Element {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const vaultStatus = useAppStore((s) => s.vaultStatus);
  const keyRecords = useAppStore((s) => s.keyRecords);
  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const conversationsLoaded = useAppStore((s) => s.conversationsLoaded);
  const loadConversations = useAppStore((s) => s.loadConversations);
  const createConversation = useAppStore((s) => s.createConversation);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const { resolvedTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const configuredCount = keyRecords.length;

  /* Load conversations on mount */
  useEffect(() => {
    if (!conversationsLoaded) {
      void loadConversations();
    }
  }, [conversationsLoaded, loadConversations]);

  const handleNewChat = useCallback(() => {
    const conv = createConversation();
    navigate(`/chat/${conv.id}`);
  }, [createConversation, navigate]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversation(id);
    navigate(`/chat/${id}`);
  }, [setActiveConversation, navigate]);

  const handleDeleteConversation = useCallback((id: string) => {
    void deleteConversation(id);
    if (activeConversationId === id) {
      navigate('/');
    }
  }, [deleteConversation, activeConversationId, navigate]);

  return (
    <nav className={styles.sidebar} data-collapsed={sidebarCollapsed} aria-label="Sidebar">
      <div className={styles.sidebarHeader}>
        <span className={styles.appName}>BYOK Chat</span>
        <button
          className={styles.newChatButton}
          aria-label="New conversation"
          type="button"
          onClick={handleNewChat}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.conversationList}>
        {conversations.length === 0 ? (
          <p className={styles.emptyList}>No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <SidebarItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeConversationId}
              onClick={handleSelectConversation}
              onDelete={handleDeleteConversation}
            />
          ))
        )}
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
