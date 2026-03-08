/**
 * Parameter Resolver
 * 
 * Merges user parameters with model defaults and capability constraints.
 * Strips unsupported parameters per model capabilities.
 * Max tokens is fully dynamic — null means no limit (model decides).
 */

import type { InferenceParameters } from '../types/parameters';
import type { ModelEntry } from '../types/models';
import { DEFAULT_PARAMETERS } from '../constants/default-parameters';

export function resolveParameters(
  userParams: Partial<InferenceParameters>,
  model: ModelEntry
): InferenceParameters {
  const base: InferenceParameters = { ...DEFAULT_PARAMETERS, ...model.defaultSafeParams };
  const merged: InferenceParameters = { ...base, ...stripNulls(userParams) };

  // Enforce capability constraints
  if (!model.capabilities.supportsTopK) merged.topK = null;
  if (!model.capabilities.supportsMinP) merged.minP = null;
  if (!model.capabilities.supportsFrequencyPenalty) merged.frequencyPenalty = null;
  if (!model.capabilities.supportsPresencePenalty) merged.presencePenalty = null;
  if (!model.capabilities.supportsRepetitionPenalty) merged.repetitionPenalty = null;
  if (!model.capabilities.supportsSeed) merged.seed = null;
  if (!model.capabilities.supportsJsonMode && merged.responseFormat === 'json') merged.responseFormat = 'text';
  if (!model.capabilities.supportsThinking) {
    merged.thinkingEnabled = false;
  }
  if (!model.capabilities.supportsStreaming) merged.streamEnabled = false;

  // maxOutputTokens: null means dynamic (no limit) — don't clamp
  // Only preserve explicit user value; no artificial ceiling

  // Temperature clamping
  if (merged.temperature !== null) {
    merged.temperature = Math.max(0, Math.min(2, merged.temperature));
  }

  return merged;
}

function stripNulls(params: Partial<InferenceParameters>): Partial<InferenceParameters> {
  const result: Partial<InferenceParameters> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
