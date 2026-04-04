import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../hooks/use-auth';
import {
  Sun, Moon, Plus, Settings, Lock, Unlock, MessageSquare,
  LogIn, User, Search, X, BookOpen, Sparkles, FolderOpen,
  ChevronDown, Palette, Key, SlidersHorizontal, LogOut,
} from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import type { Conversation } from '../../types/conversations';
import styles from './Sidebar.module.css';

type Ease4 = [number, number, number, number];
const EASE_OUT_EXPO: Ease4 = [0.16, 1, 0.3, 1];

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
  const skillConfig = useAppStore((s) => s.skillConfig);
  const setSkillPanelOpen = useAppStore((s) => s.setSkillPanelOpen);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const vaultStatus = useAppStore((s) => s.vaultStatus);
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

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  const grouped = useMemo(() => groupByDate(filteredConversations), [filteredConversations]);

  useEffect(() => {
    if (!conversationsLoaded) void loadConversations();
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
    if (activeConversationId === id) navigate('/');
  }, [deleteConversation, activeConversationId, navigate]);

  const shortcuts = useMemo(() => [
    {
      icon: BookOpen,
      label: `Skills${skillConfig.mode !== 'disabled' ? ' ●' : ''}`,
      onClick: () => setSkillPanelOpen(true),
    },
    {
      icon: Sparkles,
      label: 'Artifacts',
      onClick: () => {},
    },
    {
      icon: FolderOpen,
      label: 'Projects',
      onClick: () => {},
    },
  ], [skillConfig.mode, setSkillPanelOpen]);

  const isOnSettings = location.pathname === '/settings';

  const displayName = user?.email?.split('@')[0] ?? 'Guest';

  return (
    <nav className={styles.sidebar} data-collapsed={sidebarCollapsed} aria-label="Sidebar">
      {/* ── Search header ── */}
      <div className={styles.sidebarHeader}>
        <div className={styles.searchToggle} onClick={() => setSearchOpen(!searchOpen)}>
          <Search size={15} className={styles.searchHeaderIcon} aria-hidden="true" />
          <span className={styles.searchPlaceholder}>Search</span>
        </div>
        <button
          className={styles.newChatButton}
          aria-label="New conversation"
          type="button"
          onClick={handleNewChat}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>

      {/* ── Animated search bar ── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            className={styles.searchBar}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
          >
            <div className={styles.searchInputWrap}>
              <Search size={13} className={styles.searchIcon} aria-hidden="true" />
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
                  <X size={11} />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Shortcuts ── */}
      <div className={styles.shortcuts}>
        {shortcuts.map((item) => (
          <button
            key={item.label}
            className={styles.shortcutItem}
            onClick={item.onClick}
            type="button"
          >
            <item.icon size={16} aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {/* ── Chat history ── */}
      <div className={styles.conversationList}>
        {filteredConversations.length === 0 ? (
          <div className={styles.emptyList}>
            <MessageSquare size={18} className={styles.emptyIcon} aria-hidden="true" />
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

      {/* ── Account section ── */}
      <div className={styles.accountSection}>
        <button
          className={styles.accountTrigger}
          onClick={() => setAccountOpen(!accountOpen)}
          type="button"
        >
          <div className={styles.accountAvatar}>
            {user ? (
              <span>{displayName.charAt(0).toUpperCase()}</span>
            ) : (
              <User size={14} aria-hidden="true" />
            )}
          </div>
          <span className={styles.accountName}>{displayName}</span>
          <motion.div
            animate={{ rotate: accountOpen ? 180 : 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            className={styles.accountChevron}
          >
            <ChevronDown size={14} aria-hidden="true" />
          </motion.div>
        </button>

        <AnimatePresence>
          {accountOpen && (
            <motion.div
              className={styles.accountMenu}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
            >
              <div className={styles.accountMenuInner}>
                {accountActions.map((action) => (
                  <button
                    key={action.label}
                    className={styles.accountMenuItem}
                    onClick={action.onClick}
                    type="button"
                    data-active={action.active}
                  >
                    <action.icon size={15} aria-hidden="true" />
                    <div className={styles.accountMenuText}>
                      <span className={styles.accountMenuLabel}>{action.label}</span>
                      <span className={styles.accountMenuDesc}>{action.description}</span>
                    </div>
                    {action.trailing && (
                      <action.trailing size={13} className={styles.accountMenuTrailing} aria-hidden="true" />
                    )}
                  </button>
                ))}

                {/* Auth action */}
                {user ? (
                  <button
                    className={`${styles.accountMenuItem} ${styles.accountMenuDanger}`}
                    onClick={() => void signOut()}
                    type="button"
                  >
                    <LogOut size={15} aria-hidden="true" />
                    <div className={styles.accountMenuText}>
                      <span className={styles.accountMenuLabel}>Sign out</span>
                    </div>
                  </button>
                ) : (
                  <button
                    className={styles.accountMenuItem}
                    onClick={() => navigate('/auth')}
                    type="button"
                  >
                    <LogIn size={15} aria-hidden="true" />
                    <div className={styles.accountMenuText}>
                      <span className={styles.accountMenuLabel}>Sign in</span>
                      <span className={styles.accountMenuDesc}>Sync across devices</span>
                    </div>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
