/**
 * ChatInput
 * 
 * Multi-line text input with file attachment support.
 * Features drag-and-drop, file picker, attachment previews
 * with thumbnails, type badges, and remove buttons.
 */

import { useState, useRef, useCallback, type KeyboardEvent, type ChangeEvent, type DragEvent } from 'react';
import { ArrowUp, Square, Paperclip, X, FileText, Music, Film, File, Upload } from 'lucide-react';
import type { ProcessedAttachment } from '../../engine/attachment-processor';
import {
  processFiles,
  formatFileSize,
  classifyMime,
  FILE_INPUT_ACCEPT,
} from '../../engine/attachment-processor';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  onSend: (text: string, attachments?: ProcessedAttachment[]) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onAbort?: () => void;
  conversationId?: string;
}

const FILE_ICONS = {
  document: FileText,
  audio: Music,
  video: Film,
  file: File,
} as const;

export function ChatInput({
  onSend,
  disabled = false,
  isStreaming = false,
  onAbort,
  conversationId = 'draft',
}: ChatInputProps): JSX.Element {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachments, setAttachments] = useState<ProcessedAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled) return;
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setValue('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend, attachments]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  /** Process and add files */
  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    // Cap at 10 total
    const remaining = 10 - attachments.length;
    const toProcess = files.slice(0, remaining);

    const { processed, errors } = await processFiles(toProcess, conversationId);

    if (errors.length > 0) {
      // Could show toast, but keep it simple for now
      console.warn('Attachment errors:', errors);
    }

    if (processed.length > 0) {
      setAttachments((prev) => [...prev, ...processed]);
    }
  }, [attachments.length, conversationId]);

  /** Remove an attachment by id */
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.attachment.id !== id));
  }, []);

  /** File input handler */
  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await addFiles(files);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFiles]);

  /** Drag-and-drop handlers */
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    await addFiles(files);
  }, [addFiles]);

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !disabled;

  return (
    <div
      className={styles.inputContainer}
      data-focused={focused}
      data-dragover={dragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {dragOver && (
        <div className={styles.dropOverlay}>
          <Upload size={20} />
          Drop files here
        </div>
      )}

      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className={styles.attachmentStrip}>
          {attachments.map((pa) => (
            <AttachmentPreviewCard
              key={pa.attachment.id}
              processed={pa}
              onRemove={removeAttachment}
            />
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={attachments.length > 0 ? 'Add a message…' : 'Type a message…'}
        rows={1}
        disabled={disabled}
        aria-label="Message input"
      />

      <div className={styles.actionBar}>
        {/* Attach button */}
        <button
          className={styles.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          type="button"
          aria-label="Attach files"
          disabled={disabled || attachments.length >= 10}
        >
          <Paperclip size={16} aria-hidden="true" />
        </button>
        {attachments.length > 0 && (
          <span className={styles.attachCount}>{attachments.length}</span>
        )}

        <input
          ref={fileInputRef}
          type="file"
          className={styles.fileInput}
          accept={FILE_INPUT_ACCEPT}
          multiple
          onChange={handleFileSelect}
          aria-hidden="true"
          tabIndex={-1}
        />

        <span className={styles.spacer} />

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

/** Individual attachment preview card */
function AttachmentPreviewCard({
  processed,
  onRemove,
}: {
  processed: ProcessedAttachment;
  onRemove: (id: string) => void;
}) {
  const { attachment, thumbnailUrl, dataUrl } = processed;
  const isImage = attachment.type === 'image';
  const IconComponent = FILE_ICONS[attachment.type as keyof typeof FILE_ICONS] ?? File;

  return (
    <div className={styles.attachmentPreview}>
      {isImage ? (
        <img
          className={styles.attachmentThumb}
          src={thumbnailUrl ?? dataUrl}
          alt={attachment.fileName}
          loading="lazy"
        />
      ) : (
        <div className={styles.attachmentFile}>
          <IconComponent size={18} className={styles.attachmentFileIcon} />
          <span className={styles.attachmentFileName}>{attachment.fileName}</span>
          <span className={styles.attachmentSize}>{formatFileSize(attachment.size)}</span>
        </div>
      )}

      <span className={styles.attachmentTypeBadge} data-type={attachment.type}>
        {attachment.type === 'image' ? 'IMG' :
         attachment.type === 'audio' ? 'AUD' :
         attachment.type === 'video' ? 'VID' :
         attachment.type === 'document' ? 'DOC' : 'FILE'}
      </span>

      <button
        className={styles.attachmentRemove}
        onClick={() => onRemove(attachment.id)}
        type="button"
        aria-label={`Remove ${attachment.fileName}`}
      >
        <X size={10} />
      </button>
    </div>
  );
}
