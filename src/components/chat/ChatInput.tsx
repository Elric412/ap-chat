/**
 * ChatInput
 * 
 * Multi-line text input with file attachment support and slash commands.
 * Features drag-and-drop, file picker, attachment previews,
 * slash command menu, and preset selector.
 */

import { useState, useRef, useCallback, useEffect, forwardRef, type KeyboardEvent, type ChangeEvent, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, Square, Paperclip, Upload, Zap, Search } from 'lucide-react';
import type { ProcessedAttachment } from '../../engine/attachment-processor';
import { SkillIndicator } from '../skills/SkillIndicator';
import { AttachmentPreviewCard } from './AttachmentPreviewCard';
import {
  processFiles,
  formatFileSize,
  classifyMime,
  FILE_INPUT_ACCEPT,
} from '../../engine/attachment-processor';
import { SlashCommandMenu } from '../command/SlashCommandMenu';
import { PresetMenu } from './PresetMenu';
import { getAllPresets } from '../../constants/presets';
import { MODEL_REGISTRY } from '../../constants/model-registry';
import { useAppStore } from '../../store';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  onSend: (text: string, attachments?: ProcessedAttachment[]) => void;
  disabled?: boolean;
  isStreaming?: boolean;
  onAbort?: () => void;
  conversationId?: string;
}


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
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  

  const setInferenceParams = useAppStore((s) => s.setInferenceParams);
  const setSelectedModelId = useAppStore((s) => s.setSelectedModelId);
  const inferenceParams = useAppStore((s) => s.inferenceParams);
  const webSearchEnabled = useAppStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useAppStore((s) => s.setWebSearchEnabled);
  const selectedModelId = useAppStore((s) => s.selectedModelId);

  const selectedModel = MODEL_REGISTRY.find((model) => model.id === selectedModelId);
  const supportsWebSearch = selectedModel?.capabilities.supportsWebSearch ?? false;

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;

    // Slash command detection
    const lines = newValue.split('\n');
    const lastLine = lines[lines.length - 1];
    if (lastLine.startsWith('/') && !lastLine.includes(' ') && lines.length === 1) {
      setShowSlashMenu(true);
      setSlashQuery(lastLine);
    } else {
      setShowSlashMenu(false);
    }
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    // Security: Limit message length to prevent memory abuse
    if ((!trimmed && attachments.length === 0) || disabled) return;
    if (trimmed.length > 100000) {
      useAppStore.getState().addToast({ type: 'warning', title: 'Message too long (max 100K chars)', dismissible: true });
      return;
    }
    onSend(trimmed, attachments.length > 0 ? attachments : undefined);
    setValue('');
    setAttachments([]);
    setShowSlashMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, onSend, attachments]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't intercept when slash menu is open (it handles its own keys)
    if (showSlashMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab' || e.key === 'Enter')) {
      return; // Let SlashCommandMenu handle it
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, showSlashMenu]);

  const handleSlashSelect = useCallback((template: string) => {
    setValue(template);
    setShowSlashMenu(false);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
        el.focus();
        el.setSelectionRange(template.length, template.length);
      }
    });
  }, []);

  const handlePresetApply = useCallback((presetId: string) => {
    const presets = getAllPresets();
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    // Apply parameters
    setInferenceParams({ ...inferenceParams, ...preset.parameters });

    // Apply model if specified
    if (preset.modelId) {
      setSelectedModelId(preset.modelId);
    }

    setShowPresets(false);
    useAppStore.getState().addToast({
      type: 'info',
      title: `Preset "${preset.name}" applied`,
      dismissible: true,
      duration: 3000,
    });
  }, [inferenceParams, setInferenceParams, setSelectedModelId]);

  /** Process and add files */
  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const remaining = 10 - attachments.length;
    const toProcess = files.slice(0, remaining);
    const { processed, errors } = await processFiles(toProcess, conversationId);
    if (errors.length > 0) console.warn('Attachment errors:', errors);
    if (processed.length > 0) setAttachments((prev) => [...prev, ...processed]);
  }, [attachments.length, conversationId]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.attachment.id !== id));
  }, []);

  const handleFileSelect = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    await addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addFiles]);

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
    <motion.div
      className={styles.inputContainer}
      data-focused={focused}
      data-dragover={dragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
    >
      {/* Drop overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            className={styles.dropOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Upload size={20} />
            Drop files here
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slash command menu */}
      <SlashCommandMenu
        query={slashQuery}
        visible={showSlashMenu}
        onSelect={handleSlashSelect}
        onClose={() => setShowSlashMenu(false)}
      />

      {/* Premium preset menu */}
      <PresetMenu
        open={showPresets}
        onClose={() => setShowPresets(false)}
        onApply={handlePresetApply}
      />

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
        placeholder={attachments.length > 0 ? 'Add a message…' : 'Type a message… (/ for commands)'}
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

        {/* Presets button */}
        <button
          className={styles.attachBtn}
          onClick={() => setShowPresets(!showPresets)}
          type="button"
          aria-label="Apply preset"
          title="Presets"
        >
          <Zap size={16} aria-hidden="true" />
        </button>

        {/* Web search toggle */}
        <button
          className={styles.searchBtn}
          data-active={webSearchEnabled && supportsWebSearch}
          onClick={() => setWebSearchEnabled(!webSearchEnabled)}
          type="button"
          aria-label="Toggle web search"
          title={supportsWebSearch ? 'Web search' : 'Web search is not supported by this model'}
          disabled={disabled || !supportsWebSearch}
        >
          <Search size={16} aria-hidden="true" />
        </button>

        {/* Skill indicator */}
        <SkillIndicator />

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

        <AnimatePresence mode="wait">
          {isStreaming ? (
            <motion.button
              key="stop"
              className={styles.stopButton}
              onClick={onAbort}
              type="button"
              aria-label="Stop generation"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
              whileTap={{ scale: 0.85 }}
            >
              <Square size={14} aria-hidden="true" />
            </motion.button>
          ) : (
            <motion.button
              key="send"
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!canSend}
              type="button"
              aria-label="Send message"
              initial={{ scale: 0, rotate: 90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: -90 }}
              transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
              whileTap={{ scale: 0.85 }}
              whileHover={canSend ? { scale: 1.1 } : undefined}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

