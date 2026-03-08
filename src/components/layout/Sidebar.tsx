import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../store';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../hooks/use-auth';
import { Sun, Moon, Plus, Settings, Lock, Unlock, MessageSquare, LogIn, LogOut, User } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import type { Conversation } from '../../types/conversations';
import styles from './Sidebar.module.css';

function groupByDate(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const groups: Record<string, Conversation[]> = {};
  const order = ['Today', 'Yesterday', 'This week', 'Older'];

  for (const conv of conversations) {
    const t = conv.updatedAt;
    let label: string;
    if (t >= today) label = 'Today';
    else if (t >= yesterday) label = 'Yesterday';
    else if (t >= weekAgo) label = 'This week';
    else label = 'Older';
    (groups[label] ??= []).push(conv);
  }

  return order.filter((l) => groups[l]?.length).map((label) => ({ label, items: groups[label] }));
}

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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const configuredCount = keyRecords.length;

  const grouped = useMemo(() => groupByDate(conversations), [conversations]);

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

      <div className={styles.conversationList} role="navigation" aria-label="Conversations">
        {conversations.length === 0 ? (
          <div className={styles.emptyList}>
            <MessageSquare size={20} className={styles.emptyIcon} aria-hidden="true" />
            <p className={styles.emptyText}>No conversations yet</p>
            <p className={styles.emptyHint}>Start a new chat to begin</p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label} className={styles.dateGroup} role="group" aria-label={group.label}>
              <span className={styles.dateLabel} aria-hidden="true">{group.label}</span>
              {group.items.map((conv) => (
                <SidebarItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onClick={handleSelectConversation}
                  onDelete={handleDeleteConversation}
                />
              ))}
            </div>
          ))
        )}
      </div>

      <div className={styles.sidebarFooter}>
        {user ? (
          <button
            className={styles.footerBtn}
            onClick={() => void signOut()}
            type="button"
            aria-label="Sign out"
            title={user.email ?? 'Signed in'}
          >
            <User size={16} aria-hidden="true" />
            <span>{user.email?.split('@')[0] ?? 'Account'}</span>
          </button>
        ) : (
          <button
            className={styles.footerBtn}
            onClick={() => navigate('/auth')}
            type="button"
            aria-label="Sign in"
          >
            <LogIn size={16} aria-hidden="true" />
            <span>Sign In</span>
          </button>
        )}
        <button
          className={styles.footerBtn}
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
          className={styles.footerBtn}
          onClick={toggleTheme}
          type="button"
          aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {resolvedTheme === 'dark'
            ? <Sun size={16} aria-hidden="true" />
            : <Moon size={16} aria-hidden="true" />
          }
          <span>{resolvedTheme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </nav>
  );
}
