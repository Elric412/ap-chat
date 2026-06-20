export type ArtifactType = 'code' | 'markdown' | 'svg' | 'html' | 'table' | 'mermaid' | 'latex';

export interface ArtifactVersion {
  id: string;
  content: string;
  createdAt: number;
  messageNodeId: string;
}

export interface Artifact {
  id: string;
  conversationId: string;
  messageNodeId: string;
  type: ArtifactType;
  title: string;
  language?: string;
  versions: ArtifactVersion[];
  activeVersionIndex: number;
  createdAt: number;
  updatedAt: number;
  /**
   * Source of this artifact. 'message' = detected in assistant text;
   * 'sandbox' = promoted from a sandbox VFS file (so the user can see,
   * preview, and download what the model actually built).
   */
  source?: 'message' | 'sandbox';
  /** For sandbox-sourced artifacts: the VFS path (used to dedupe → versions). */
  sandboxPath?: string;
}
