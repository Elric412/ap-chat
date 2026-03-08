import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onAbort?: () => void;
}

export function ChatInput({ onSend, disabled = false, isStreaming = false, onAbort }: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className={styles.inputContainer} data-focused={focused}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Type a message…"
        rows={1}
        disabled={disabled}
        aria-label="Message input"
      />
      <div className={styles.actionBar}>
        <span className={styles.charHint}>
          {value.length > 0 ? `${value.length}` : ''}
        </span>
        {isStreaming ? (
          <button
            className={styles.stopButton}
            onClick={onAbort}
            type="button"
            aria-label="Stop generation"
          >
            <Square size={14} aria-hidden="true" />
          </button>
        ) : (
          <button
            className={styles.sendButton}
            onClick={handleSend}
            disabled={!canSend}
            type="button"
            aria-label="Send message"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
