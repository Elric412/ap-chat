/** Provider identifiers — exhaustive set of supported providers */
export const PROVIDER_IDS = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  mistral: 'mistral',
  groq: 'groq',
  cohere: 'cohere',
  together: 'together',
  ollama: 'ollama',
  kimi: 'kimi',
  openrouter: 'openrouter',
} as const;

export type ProviderId = typeof PROVIDER_IDS[keyof typeof PROVIDER_IDS];

export interface ModelPricing {
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  cachedInputPerMillionTokens?: number;
  thinkingPerMillionTokens?: number;
}

export interface ModelModalities {
  input: readonly ('text' | 'image' | 'audio' | 'video' | 'file')[];
  output: readonly ('text' | 'image' | 'audio')[];
}

export interface ModelCapabilities {
  supportsStreaming: boolean;
  supportsThinking: boolean;
  supportsToolUse: boolean;
  supportsVision: boolean;
  supportsFunctionCalling: boolean;
  supportsSystemPrompt: boolean;
  supportsWebSearch: boolean;
  supportsJsonMode: boolean;
  supportsStructuredOutput: boolean;
  supportsSeed: boolean;
  supportsCaching: boolean;
  supportsTopK: boolean;
  supportsMinP: boolean;
  supportsFrequencyPenalty: boolean;
  supportsPresencePenalty: boolean;
  supportsRepetitionPenalty: boolean;
}

export interface ThinkingConfig {
  parameterName: string;
  levels: Record<'low' | 'medium' | 'high', number | string> & Partial<Record<'x-high', number | string>>;
  minBudgetTokens?: number;
  maxBudgetTokens?: number;
}

export interface CachingConfig {
  headerKey: string;
  strategy: 'ephemeral' | 'persistent';
}

export interface ModelEntry {
  id: string;
  providerId: ProviderId;
  displayName: string;
  family: string;
  contextWindow: number;
  maxOutputTokens: number;
  pricing: ModelPricing;
  modalities: ModelModalities;
  capabilities: ModelCapabilities;
  thinkingConfig?: ThinkingConfig;
  cachingConfig?: CachingConfig;
  tokenizerId?: string;
  browserDirectSupported: boolean;
  transportMode: 'sse' | 'chunked' | 'websocket';
  defaultSafeParams: Partial<InferenceParametersBase>;
  deprecated: boolean;
  isLegacy?: boolean;
  releaseDate: string;
  knownIssues?: string[];
}

/** Base inference parameters shape (avoid circular import with parameters.ts) */
interface InferenceParametersBase {
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxOutputTokens: number | null;
}
