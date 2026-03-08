import type { InferenceParameters } from '../types/parameters';

export const DEFAULT_PARAMETERS: InferenceParameters = {
  temperature: 1,
  topP: 1,
  topK: null,
  frequencyPenalty: null,
  presencePenalty: null,
  repetitionPenalty: null,
  minP: null,
  maxOutputTokens: null,
  stopSequences: [],
  seed: null,
  responseFormat: 'text',
  thinkingEnabled: false,
  thinkingLevel: 'medium',
  streamEnabled: true,
};
