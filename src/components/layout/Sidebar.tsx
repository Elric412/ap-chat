import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../hooks/use-auth';
import { Sun, Moon, Plus, Settings, Lock, Unlock, MessageSquare, LogIn, User, Search, X, Menu } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import type { Conversation } from '../../types/conversations';
import styles from './Sidebar.module.css';

function groupByDate(conversations: Conversation[]): { label: string; items: Conversation[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;
  const monthAgo = today - 30 * 86400000;

  const groups: Record<string, Conversation[]> = {};
  const order = ['Today', 'Yesterday', 'This week', 'This month', 'Older'];

  for (const conv of conversations) {
    const t = conv.updatedAt;
    let label: string;
    if (t >= today) label = 'Today';
    else if (t >= yesterday) label = 'Yesterday';
    else if (t >= weekAgo) label = 'This week';
    else if (t >= monthAgo) label = 'This month';
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

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const configuredCount = keyRecords.length;

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const grouped = useMemo(() => groupByDate(filteredConversations), [filteredConversations]);

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
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            aria-label="Search conversations"
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={16} aria-hidden="true" />
          </button>
          <button
            className={styles.newChatButton}
            aria-label="New conversation"
            type="button"
            onClick={handleNewChat}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            className={styles.searchBar}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className={styles.searchInputWrap}>
              <Search size={14} className={styles.searchIcon} aria-hidden="true" />
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search chats…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                aria-label="Search conversations"
              />
              {searchQuery && (
                <button
                  className={styles.searchClear}
                  onClick={() => setSearchQuery('')}
                  type="button"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={styles.conversationList}>
        {filteredConversations.length === 0 ? (
          <div className={styles.emptyList}>
            <MessageSquare size={20} className={styles.emptyIcon} aria-hidden="true" />
            <p className={styles.emptyText}>
              {searchQuery ? 'No matching chats' : 'No conversations yet'}
            </p>
            {!searchQuery && <p className={styles.emptyHint}>Start a new chat to begin</p>}
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label} className={styles.dateGroup}>
              <span className={styles.dateLabel}>{group.label}</span>
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

      {/* Conversation count */}
      {conversations.length > 0 && (
        <div className={styles.convCount}>
          <span>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</span>
        </div>
      )}

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
