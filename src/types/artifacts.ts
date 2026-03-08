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
}
