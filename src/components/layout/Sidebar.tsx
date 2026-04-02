import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store';
import { useTheme } from '../../hooks/use-theme';
import { useAuth } from '../../hooks/use-auth';
import { Sun, Moon, Plus, Settings, Lock, Unlock, MessageSquare, LogIn, User, Search, X, BookOpen } from 'lucide-react';
import { SidebarItem } from './SidebarItem';
import type { Conversation } from '../../types/conversations';
import styles from './Sidebar.module.css';

type Ease4 = [number, number, number, number];
const EASE_OUT_EXPO: Ease4 = [0.16, 1, 0.3, 1];
const EASE_SNAP: Ease4 = [0.34, 1.56, 0.64, 1];

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

/** macOS Dock magnification effect */
function useDockMagnification(itemCount: number) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getScale = useCallback((index: number): number => {
    if (hoveredIndex === null) return 1;
    const distance = Math.abs(index - hoveredIndex);
    if (distance === 0) return 1.35;
    if (distance === 1) return 1.15;
    return 1;
  }, [hoveredIndex]);

  return { hoveredIndex, setHoveredIndex, getScale };
}

export function Sidebar(): JSX.Element {
  const skillConfig = useAppStore((s) => s.skillConfig);
  const setSkillPanelOpen = useAppStore((s) => s.setSkillPanelOpen);
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

  // Dock items config
  const dockItems = useMemo(() => {
    const items: { icon: typeof User; label: string; onClick: () => void; active?: boolean }[] = [];

    if (user) {
      items.push({
        icon: User,
        label: user.email?.split('@')[0] ?? 'Account',
        onClick: () => void signOut(),
        active: false,
      });
    } else {
      items.push({
        icon: LogIn,
        label: 'Sign in',
        onClick: () => navigate('/auth'),
      });
    }

    items.push({
      icon: BookOpen,
      label: `Skills${skillConfig.mode !== 'disabled' ? ' ●' : ''}`,
      onClick: () => setSkillPanelOpen(true),
    });

    items.push({
      icon: vaultStatus === 'unlocked' ? Unlock : vaultStatus === 'locked' ? Lock : Settings,
      label: vaultStatus === 'unlocked' ? `Keys (${configuredCount})` : 'Settings',
      onClick: () => navigate('/settings'),
      active: location.pathname === '/settings',
    });

    items.push({
      icon: resolvedTheme === 'dark' ? Sun : Moon,
      label: resolvedTheme === 'dark' ? 'Light mode' : 'Dark mode',
      onClick: toggleTheme,
    });

    return items;
  }, [user, signOut, navigate, vaultStatus, configuredCount, location.pathname, resolvedTheme, toggleTheme, skillConfig.mode, setSkillPanelOpen]);

  const { hoveredIndex, setHoveredIndex, getScale } = useDockMagnification(dockItems.length);
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);

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
            <Search size={15} aria-hidden="true" />
          </button>
          <button
            className={styles.newChatButton}
            aria-label="New conversation"
            type="button"
            onClick={handleNewChat}
          >
            <Plus size={16} aria-hidden="true" />
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

      {/* Conversation count */}
      {conversations.length > 0 && (
        <div className={styles.convCount}>
          <span>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* macOS Dock Footer */}
      <div
        className={styles.sidebarFooter}
        onMouseLeave={() => { setHoveredIndex(null); setTooltipIndex(null); }}
      >
        {dockItems.map((item, i) => (
          <motion.button
            key={item.label}
            className={styles.dockItem}
            onClick={item.onClick}
            type="button"
            data-active={item.active}
            aria-label={item.label}
            onMouseEnter={() => { setHoveredIndex(i); setTooltipIndex(i); }}
            onMouseLeave={() => setTooltipIndex(null)}
            animate={{
              scale: getScale(i),
              y: hoveredIndex === i ? -4 : 0,
            }}
            transition={{ duration: 0.2, ease: EASE_SNAP }}
            whileTap={{ scale: 0.88 }}
          >
            <item.icon size={16} aria-hidden="true" />
            <AnimatePresence>
              {tooltipIndex === i && (
                <motion.span
                  className={styles.dockTooltip}
                  initial={{ opacity: 0, y: 4, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.9 }}
                  transition={{ duration: 0.15, ease: EASE_SNAP }}
                >
                  {item.label}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>
    </nav>
  );
}
