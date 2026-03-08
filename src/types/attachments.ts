export type AttachmentType = 'image' | 'audio' | 'video' | 'document' | 'file';

export interface Attachment {
  id: string;
  conversationId: string;
  type: AttachmentType;
  fileName: string;
  mimeType: string;
  size: number;
  data: ArrayBuffer;
  thumbnailData?: ArrayBuffer;
  metadata: Record<string, unknown>;
  createdAt: number;
}
