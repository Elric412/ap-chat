import { useCallback, useState, useRef, useEffect, type MouseEvent, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { X, MessageSquare, Check } from 'lucide-react';
import type { Conversation } from '../../types/conversations';
import { useAppStore } from '../../store';
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
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateConversation = useAppStore((s) => s.updateConversation);

  const handleClick = useCallback(() => {
    if (!editing) onClick(conversation.id);
  }, [conversation.id, onClick, editing]);

  const handleDelete = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${conversation.title}"? This cannot be undone.`)) return;
    onDelete(conversation.id);
  }, [conversation.id, conversation.title, onDelete]);

  const handleDoubleClick = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    setEditValue(conversation.title);
    setEditing(true);
  }, [conversation.title]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conversation.title) {
      updateConversation(conversation.id, { title: trimmed });
    }
    setEditing(false);
  }, [editValue, conversation.id, conversation.title, updateConversation]);

  const handleInputKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRename();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  }, [commitRename]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <motion.button
      className={styles.sidebarItem}
      data-active={isActive}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      type="button"
      title={editing ? undefined : conversation.title}
      whileHover={{ x: 2 }}
      whileTap={editing ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15 }}
      layout
    >
      <MessageSquare size={13} className={styles.chatIcon} aria-hidden="true" />

      {editing ? (
        <div className={styles.editWrap} onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            className={styles.editInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={commitRename}
            maxLength={120}
            aria-label="Rename conversation"
          />
          <button
            className={styles.confirmBtn}
            onClick={(e) => { e.stopPropagation(); commitRename(); }}
            type="button"
            aria-label="Confirm rename"
          >
            <Check size={12} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <span className={styles.title}>{conversation.title}</span>
      )}

      {!editing && (
        <button
          className={styles.deleteButton}
          onClick={handleDelete}
          type="button"
          aria-label={`Delete ${conversation.title}`}
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
    </motion.button>
  );
}
