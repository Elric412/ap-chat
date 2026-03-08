/**
 * Search Orchestrator
 * 
 * Coordinates web search results from provider grounding features.
 * Normalizes results from Google Grounding, Anthropic web search,
 * and OpenAI web search into a unified WebSearchResult format.
 */

import type { WebSearchResult } from '../types/messages';
import type { NormalizedStreamEvent } from '../types/adapters';

/**
 * Accumulate search citations from stream events into a WebSearchResult array.
 */
export function accumulateCitations(
  existing: WebSearchResult[],
  event: NormalizedStreamEvent
): WebSearchResult[] {
  if (event.type !== 'citation' || !event.citation) return existing;

  const { url, title, snippet, source, fetchedAt } = event.citation;

  // Deduplicate by URL
  const isDuplicate = existing.some((r) => r.url === url);
  if (isDuplicate) return existing;

  return [
    ...existing,
    {
      title,
      url,
      snippet,
      source,
      fetchedAt,
    },
  ];
}

/**
 * Extract grounding metadata from a Google Gemini response chunk.
 * Gemini includes grounding info in `groundingMetadata` on candidates.
 */
export function extractGeminiGrounding(
  candidate: Record<string, unknown>
): WebSearchResult[] {
  const metadata = candidate.groundingMetadata as Record<string, unknown> | undefined;
  if (!metadata) return [];

  const chunks = metadata.groundingChunks as Array<Record<string, unknown>> | undefined;
  if (!chunks) return [];

  return chunks.map((chunk) => {
    const web = chunk.web as Record<string, unknown> | undefined;
    return {
      title: (web?.title as string) ?? '',
      url: (web?.uri as string) ?? '',
      snippet: '',
      source: (web?.uri as string) ?? '',
      fetchedAt: Date.now(),
    };
  }).filter((r) => r.url !== '');
}

/**
 * Extract search results from an Anthropic tool_use block
 * that returned search results.
 */
export function extractAnthropicSearchResults(
  toolOutput: string | Record<string, unknown>
): WebSearchResult[] {
  if (typeof toolOutput === 'string') {
    try {
      const parsed = JSON.parse(toolOutput);
      if (Array.isArray(parsed.results)) {
        return parsed.results.map((r: Record<string, unknown>) => ({
          title: (r.title as string) ?? '',
          url: (r.url as string) ?? '',
          snippet: (r.snippet as string) ?? (r.content as string) ?? '',
          source: (r.source as string) ?? '',
          fetchedAt: Date.now(),
        }));
      }
    } catch {
      return [];
    }
  }

  if (typeof toolOutput === 'object' && Array.isArray((toolOutput as Record<string, unknown>).results)) {
    const results = (toolOutput as Record<string, unknown>).results as Array<Record<string, unknown>>;
    return results.map((r) => ({
      title: (r.title as string) ?? '',
      url: (r.url as string) ?? '',
      snippet: (r.snippet as string) ?? '',
      source: (r.source as string) ?? '',
      fetchedAt: Date.now(),
    }));
  }

  return [];
}
