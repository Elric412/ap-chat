/**
 * AttachmentChips
 * 
 * Displays inline attachment indicators in user message bubbles.
 * Shows thumbnail previews for images and type badges for other files.
 */

import { Image, FileText, Music, Film, File } from 'lucide-react';
import type { ContentPart } from '../../types/messages';
import styles from './AttachmentChips.module.css';

interface AttachmentChipsProps {
  attachmentIds: string[];
  content: ContentPart[];
}

const ICON_MAP = {
  image: Image,
  audio: Music,
  video: Film,
  file: File,
  document: FileText,
} as const;

export function AttachmentChips({ attachmentIds, content }: AttachmentChipsProps): JSX.Element | null {
  if (attachmentIds.length === 0) return null;

  // Extract non-text content parts for display
  const mediaParts = content.filter((p) => p.type !== 'text' && p.type !== 'citation');

  if (mediaParts.length === 0) {
    // Fallback: show count badge
    return (
      <div className={styles.strip}>
        <span className={styles.chip}>
          <File size={12} />
          {attachmentIds.length} file{attachmentIds.length > 1 ? 's' : ''} attached
        </span>
      </div>
    );
  }

  return (
    <div className={styles.strip}>
      {mediaParts.map((part, i) => {
        const type = part.type as keyof typeof ICON_MAP;
        const Icon = ICON_MAP[type] ?? File;
        const label =
          part.type === 'image' ? (part as { altText?: string }).altText ?? 'Image' :
          part.type === 'file' ? (part as { fileName: string }).fileName :
          part.type === 'audio' ? 'Audio' :
          part.type === 'video' ? 'Video' : 'File';

        return (
          <span key={`${type}-${i}`} className={styles.chip} data-type={type}>
            <Icon size={12} />
            <span className={styles.chipLabel}>{label}</span>
          </span>
        );
      })}
    </div>
  );
}
