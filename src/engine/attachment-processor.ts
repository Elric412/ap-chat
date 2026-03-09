/**
 * Attachment Processor
 * 
 * Client-side file processing: validates types/sizes, generates
 * thumbnails for images, reads files as base64 data URLs,
 * and converts attachments into provider-compatible content parts.
 */

import type { Attachment, AttachmentType } from '../types/attachments';
import type { ContentPart } from '../types/messages';
import { uuidv7 } from '../lib/uuid';

/** Maximum file sizes per type (bytes) */
const MAX_SIZES: Record<AttachmentType, number> = {
  image: 20 * 1024 * 1024,    // 20MB
  audio: 25 * 1024 * 1024,    // 25MB
  video: 50 * 1024 * 1024,    // 50MB
  document: 20 * 1024 * 1024, // 20MB
  file: 20 * 1024 * 1024,     // 20MB
};

/** Allowed MIME types grouped by attachment type */
const MIME_MAP: Record<string, AttachmentType> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'audio/m4a': 'audio',
  'audio/mp4': 'audio',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/ogg': 'video',
  'application/pdf': 'document',
  'text/plain': 'document',
  'text/markdown': 'document',
  'text/csv': 'document',
  'application/json': 'document',
};

export interface ProcessedAttachment {
  attachment: Attachment;
  dataUrl: string;
  thumbnailUrl?: string;
}

export interface AttachmentError {
  fileName: string;
  reason: string;
}

/** Classify a MIME type into an AttachmentType */
export function classifyMime(mimeType: string): AttachmentType {
  return MIME_MAP[mimeType] ?? 'file';
}

/** Validate a file before processing */
export function validateFile(file: File): AttachmentError | null {
  const type = classifyMime(file.type);
  const maxSize = MAX_SIZES[type];

  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return { fileName: file.name, reason: `File exceeds ${maxMB}MB limit` };
  }

  if (file.size === 0) {
    return { fileName: file.name, reason: 'File is empty' };
  }

  return null;
}

/** Read a file as an ArrayBuffer */
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

/** Read a file as a data URL */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Generate a thumbnail for an image file */
async function generateThumbnail(
  file: File,
  maxDim: number = 128
): Promise<string | undefined> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return undefined;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > height) {
        if (width > maxDim) { height = (height * maxDim) / width; width = maxDim; }
      } else {
        if (height > maxDim) { width = (width * maxDim) / height; height = maxDim; }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };

    img.src = url;
  });
}

/** Get image dimensions */
function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Get audio/video duration */
function getMediaDuration(file: File): Promise<number | undefined> {
  const isMedia = file.type.startsWith('audio/') || file.type.startsWith('video/');
  if (!isMedia) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    const el = file.type.startsWith('audio/')
      ? document.createElement('audio')
      : document.createElement('video');
    const url = URL.createObjectURL(file);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(el.duration) ? el.duration : undefined);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    el.src = url;
  });
}

/** Process a single file into a ProcessedAttachment */
export async function processFile(
  file: File,
  conversationId: string
): Promise<ProcessedAttachment> {
  const type = classifyMime(file.type);
  const id = uuidv7();

  const [data, dataUrl, thumbnailUrl, dimensions, duration] = await Promise.all([
    readFileAsArrayBuffer(file),
    readFileAsDataUrl(file),
    generateThumbnail(file),
    getImageDimensions(file),
    getMediaDuration(file),
  ]);

  const metadata: Record<string, unknown> = {};
  if (dimensions) {
    metadata.width = dimensions.width;
    metadata.height = dimensions.height;
  }
  if (duration !== undefined) {
    metadata.duration = duration;
  }

  const attachment: Attachment = {
    id,
    conversationId,
    type,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    data,
    thumbnailData: undefined,
    metadata,
    createdAt: Date.now(),
  };

  return { attachment, dataUrl, thumbnailUrl };
}

/** Process multiple files, returning successes and errors */
export async function processFiles(
  files: File[],
  conversationId: string
): Promise<{ processed: ProcessedAttachment[]; errors: AttachmentError[] }> {
  const errors: AttachmentError[] = [];
  const validFiles: File[] = [];

  for (const file of files) {
    const error = validateFile(file);
    if (error) {
      errors.push(error);
    } else {
      validFiles.push(file);
    }
  }

  const processed = await Promise.all(
    validFiles.map((f) => processFile(f, conversationId))
  );

  return { processed, errors };
}

/** Convert a processed attachment into a ContentPart for the message */
export function attachmentToContentPart(pa: ProcessedAttachment): ContentPart {
  const { attachment } = pa;

  switch (attachment.type) {
    case 'image':
      return {
        type: 'image',
        attachmentId: attachment.id,
        altText: attachment.fileName,
        mimeType: attachment.mimeType,
      };
    case 'audio':
      return {
        type: 'audio',
        attachmentId: attachment.id,
        mimeType: attachment.mimeType,
        duration: attachment.metadata.duration as number | undefined,
      };
    case 'video':
      return {
        type: 'video',
        attachmentId: attachment.id,
        mimeType: attachment.mimeType,
        duration: attachment.metadata.duration as number | undefined,
      };
    default:
      return {
        type: 'file',
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      };
  }
}

/** Convert attachment data URL into provider-specific format (for OpenAI vision, etc.) */
export function buildMultimodalContent(
  text: string,
  attachments: ProcessedAttachment[]
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];

  for (const pa of attachments) {
    if (pa.attachment.type === 'image') {
      parts.push({
        type: 'image_url',
        image_url: { url: pa.dataUrl, detail: 'auto' },
      });
    } else if (pa.attachment.type === 'audio') {
      // OpenAI audio input format
      const base64 = pa.dataUrl.split(',')[1] ?? '';
      const format = pa.attachment.mimeType.includes('wav') ? 'wav' : 'mp3';
      parts.push({
        type: 'input_audio',
        input_audio: { data: base64, format },
      });
    } else if (pa.attachment.type === 'document' || pa.attachment.type === 'file') {
      // Inject file content as text context
      const base64 = pa.dataUrl.split(',')[1] ?? '';
      const decoded = tryDecodeBase64Text(base64);
      if (decoded) {
        parts.push({
          type: 'text',
          text: `[File: ${pa.attachment.fileName}]\n${decoded}`,
        });
      }
    }
  }

  // Add the user's text last
  if (text.trim()) {
    parts.push({ type: 'text', text });
  }

  return parts;
}

/** Attempt to decode base64 as UTF-8 text */
function tryDecodeBase64Text(base64: string): string | null {
  try {
    const decoded = atob(base64);
    // Check if it looks like text (no control chars except newlines/tabs)
    const isText = /^[\t\n\r -~\u0080-\u00FF]*$/.test(decoded.slice(0, 500));
    return isText ? decoded : null;
  } catch {
    return null;
  }
}

/** Format file size for display */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Get a human-readable label for an attachment type */
export function getTypeLabel(type: AttachmentType): string {
  const labels: Record<AttachmentType, string> = {
    image: 'Image',
    audio: 'Audio',
    video: 'Video',
    document: 'Document',
    file: 'File',
  };
  return labels[type];
}

/** Get the accept string for the file input */
export const FILE_INPUT_ACCEPT = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/mp4',
  'video/mp4', 'video/webm', 'video/ogg',
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json',
].join(',');
