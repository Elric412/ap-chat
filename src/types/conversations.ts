export interface Conversation {
  id: string;
  title: string;
  rootNodeId: string;
  activeLeafId: string;
  createdAt: number;
  updatedAt: number;
  presetId?: string;
  tags: string[];
  totalCost: number;
  totalTokens: { input: number; output: number; thinking: number };
  isArchived: boolean;
  _clock: number;
  _deleted: boolean;
}
