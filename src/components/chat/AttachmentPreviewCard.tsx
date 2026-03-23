/**
 * AttachmentPreviewCard — Renders a single attachment preview chip.
 * Extracted per ECC code-reviewer: small focused components.
 */

import { X, FileText, Music, Film, File } from 'lucide-react';
import type { ProcessedAttachment } from '../../engine/attachment-processor';
import { formatFileSize } from '../../engine/attachment-processor';
import styles from './ChatInput.module.css';

const FILE_ICONS = {
  document: FileText,
  audio: Music,
  video: Film,
  file: File,
} as const;

interface AttachmentPreviewCardProps {
  processed: ProcessedAttachment;
  onRemove: (id: string) => void;
}

export function AttachmentPreviewCard({ processed, onRemove }: AttachmentPreviewCardProps): JSX.Element {
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
