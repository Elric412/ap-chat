import { useCallback, type MouseEvent } from 'react';
import { X } from 'lucide-react';
import type { Conversation } from '../../types/conversations';
import styles from './SidebarItem.module.css';

interface SidebarItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SidebarItem({
  conversation,
  isActive,
  onClick,
  onDelete,
}: SidebarItemProps): JSX.Element {
  const handleClick = useCallback(() => {
    onClick(conversation.id);
  }, [conversation.id, onClick]);

  const handleDelete = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    // Security: Confirm before deleting
    if (!window.confirm(`Delete "${conversation.title}"? This cannot be undone.`)) return;
    onDelete(conversation.id);
  }, [conversation.id, conversation.title, onDelete]);

  return (
    <div
      className={styles.sidebarItem}
      data-active={isActive}
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`${conversation.title}${isActive ? ' (current)' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className={styles.title}>{conversation.title}</span>
      <button
        className={styles.deleteButton}
        onClick={handleDelete}
        type="button"
        aria-label={`Delete conversation: ${conversation.title}`}
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
