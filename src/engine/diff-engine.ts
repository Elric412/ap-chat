/**
 * Diff Engine — Computes word-level diffs between two text outputs
 * and generates consensus text from multiple model outputs.
 */

export interface DiffSegment {
  type: 'equal' | 'added' | 'removed';
  text: string;
  source: 'left' | 'right' | 'both';
}

/** Tokenize text into words preserving whitespace */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/);
}

/**
 * Simple LCS-based word diff between two texts.
 * Returns segments tagged as equal, added, or removed.
 */
export function computeDiff(textA: string, textB: string): DiffSegment[] {
  const wordsA = tokenize(textA);
  const wordsB = tokenize(textB);

  // Build LCS table
  const m = wordsA.length;
  const n = wordsB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff segments
  const segments: DiffSegment[] = [];
  let i = m;
  let j = n;

  const rawSegments: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      rawSegments.push({ type: 'equal', text: wordsA[i - 1], source: 'both' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawSegments.push({ type: 'added', text: wordsB[j - 1], source: 'right' });
      j--;
    } else {
      rawSegments.push({ type: 'removed', text: wordsA[i - 1], source: 'left' });
      i--;
    }
  }

  rawSegments.reverse();

  // Merge consecutive same-type segments
  for (const seg of rawSegments) {
    const last = segments[segments.length - 1];
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      segments.push({ ...seg });
    }
  }

  return segments;
}

/**
 * Generate consensus text from multiple model outputs.
 * Strategy: pick the longest output that shares the most common sentences.
 */
export function generateConsensus(outputs: string[]): string {
  if (outputs.length === 0) return '';
  if (outputs.length === 1) return outputs[0];

  // Split each output into sentences
  const sentenceSets = outputs.map((o) =>
    o.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)
  );

  // Count sentence frequency across outputs
  const sentenceCount = new Map<string, number>();
  for (const sentences of sentenceSets) {
    const seen = new Set<string>();
    for (const s of sentences) {
      const normalized = s.trim().toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        sentenceCount.set(normalized, (sentenceCount.get(normalized) ?? 0) + 1);
      }
    }
  }

  // Use the longest output as base structure
  const baseIdx = outputs.reduce((best, curr, idx) =>
    curr.length > outputs[best].length ? idx : best, 0);
  const baseSentences = sentenceSets[baseIdx];

  // Include sentences that appear in majority of outputs
  const threshold = Math.ceil(outputs.length / 2);
  const consensusSentences = baseSentences.filter((s) => {
    const count = sentenceCount.get(s.trim().toLowerCase()) ?? 0;
    return count >= threshold;
  });

  if (consensusSentences.length === 0) return outputs[baseIdx];

  return consensusSentences.join(' ');
}
