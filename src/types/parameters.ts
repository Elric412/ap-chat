export interface InferenceParameters {
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  frequencyPenalty: number | null;
  presencePenalty: number | null;
  repetitionPenalty: number | null;
  minP: number | null;
  maxOutputTokens: number | null;
  stopSequences: string[];
  seed: number | null;
  responseFormat: 'text' | 'json' | 'structured';
  structuredOutputSchema?: Record<string, unknown>;
  thinkingEnabled: boolean;
  thinkingLevel: 'low' | 'medium' | 'high' | 'auto';
  streamEnabled: boolean;
}
